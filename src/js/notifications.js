import { state } from './state.js';
import { R } from './registry.js';
import { FIREBASE_CONFIG } from './firebase-config.js';

// Client-side FCM registration + outgoing trigger helper.
//
// Registers for web push and stores the resulting token as a leaf in a
// per-user map at users/{uid}/fcmTokens/{tokenHash} — one entry per device
// so a user can receive notifications on phone + laptop simultaneously.
// The tokenHash is a 16-hex-char SHA-256 prefix, used as a stable short key.
//
// Exposes R.notifyPartner(trigger) which POSTs to /api/notify.
//
// iOS caveat: Web Push is only available on iOS 16.4+ AND only when the PWA
// is installed to the home screen. We detect + bail silently in that case.

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

let _messaging = null;
let _registerInFlight = false;
// Tracked so sign-out can remove just this device's entry from the map.
// Persisted to localStorage so a reload → immediate sign-out still knows
// which leaf to delete, even if registerFcmToken hasn't run yet this load.
const HASH_STORAGE_KEY = 'snug_fcm_token_hash';
let _currentTokenHash = (() => {
  try{ return localStorage.getItem(HASH_STORAGE_KEY) || null; }catch(e){ return null; }
})();
let _currentToken = null;

async function hashToken(token){
  const buf = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .slice(0, 8)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function pushSupported(){
  if(!('serviceWorker' in navigator)) return false;
  if(!('Notification' in window)) return false;
  if(!('PushManager' in window)) return false;
  // iOS: only installed PWAs can receive push
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if(isIOS){
    const standalone = window.navigator.standalone === true
      || window.matchMedia('(display-mode: standalone)').matches;
    if(!standalone) return false;
  }
  return true;
}

async function registerFcmToken(){
  if(_registerInFlight) return;
  _registerInFlight = true;
  try{
    if(!pushSupported()) return;
    if(!VAPID_KEY){ console.warn('[notify] VITE_FIREBASE_VAPID_KEY missing'); return; }
    if(!state.myUid || !state.db) return;

    // Only prompt once we have explicit permission — don't auto-prompt from
    // a non-user gesture. Fire the prompt here (safe on login click chain).
    let perm = Notification.permission;
    if(perm === 'default'){
      try{ perm = await Notification.requestPermission(); }catch(e){ return; }
    }
    if(perm !== 'granted') return;

    // Register the FCM background SW with config as query params so the static
    // file can call firebase.initializeApp without env-var substitution.
    const cfg = new URLSearchParams({
      apiKey:            FIREBASE_CONFIG.apiKey || '',
      authDomain:        FIREBASE_CONFIG.authDomain || '',
      databaseURL:       FIREBASE_CONFIG.databaseURL || '',
      projectId:         FIREBASE_CONFIG.projectId || '',
      storageBucket:     FIREBASE_CONFIG.storageBucket || '',
      messagingSenderId: FIREBASE_CONFIG.messagingSenderId || '',
      appId:             FIREBASE_CONFIG.appId || '',
    }).toString();
    const swReg = await navigator.serviceWorker.register(
      `/firebase-messaging-sw.js?${cfg}`,
      { scope: '/firebase-cloud-messaging-push-scope' }
    );

    const { initializeApp, getApps } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
    const { getMessaging, getToken, onMessage } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js');

    const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
    _messaging = getMessaging(app);

    const token = await getToken(_messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });
    if(!token) return;

    _currentToken = token;
    _currentTokenHash = await hashToken(token);
    try{ localStorage.setItem(HASH_STORAGE_KEY, _currentTokenHash); }catch(e){}
    await state.dbSet(
      state.dbRef(state.db, `users/${state.myUid}/fcmTokens/${_currentTokenHash}`),
      token
    );
    // Clear the legacy single-string path. Migrated users had both their
    // old fcmToken string and the new fcmTokens/{hash} entry, causing the
    // server to fan out twice to the same device. Best-effort — any error
    // is harmless (the node may already be null for new installs).
    try{
      await state.dbSet(
        state.dbRef(state.db, `users/${state.myUid}/fcmToken`),
        null
      );
    }catch(e){}

    // Foreground messages — show a system notification manually since the
    // page is visible and FCM suppresses them by default.
    onMessage(_messaging, payload => {
      const n = payload.notification || {};
      if(!n.title) return;
      try{
        new Notification(n.title, {
          body: n.body || '',
          icon: '/icons/icon-192.png',
          tag: `snug-${payload.data?.trigger || 'msg'}`,
        });
      }catch(e){}
    });
  }catch(e){
    console.warn('[notify] register failed:', e);
  }finally{
    _registerInFlight = false;
  }
}

// Apply a { page, tab } route via the same window.showPage / window.switchHomeTab
// the app already uses. Shared between the live-window SW message handler and
// the cold-start query-param consumer below.
function _applyDeepLinkRoute(route){
  if(!route || !route.page) return;
  try{
    if(route.page === 'home'){
      window.showPage && window.showPage('home');
      if(route.tab && window.switchHomeTab) window.switchHomeTab(route.tab);
    } else if(window.showPage){
      window.showPage(route.page);
    }
  }catch(e){ console.warn('[notify] deep-link route failed:', e); }
}

// Consume a deep-link stashed by main.js when the PWA was cold-started via a
// notification click (?page=…&tab=…). Called from loadCoupleAndStart after
// the app has fully initialised so showPage / switchHomeTab are live.
function consumePendingDeepLink(){
  try{
    const raw = sessionStorage.getItem('pendingDeepLink');
    if(!raw) return;
    sessionStorage.removeItem('pendingDeepLink');
    const route = JSON.parse(raw);
    _applyDeepLinkRoute(route);
  }catch(e){ console.warn('[notify] consumePendingDeepLink failed:', e); }
}

// Listen for deep-link messages from the FCM SW (notificationclick handler).
// Routes via the same window.showPage / window.switchHomeTab the app already uses.
if('serviceWorker' in navigator){
  navigator.serviceWorker.addEventListener('message', ev => {
    if(ev.data?.type !== 'snug-notification-click') return;
    _applyDeepLinkRoute(ev.data.route);
  });
}

async function unregisterFcmToken(uid){
  // Called from onAuthStateChanged(null). Runs BEFORE state is reset, so
  // `uid` is passed in explicitly — don't read from state here.
  // Only removes THIS device's entry from users/{uid}/fcmTokens/{hash} —
  // never wipes the whole map (other devices keep their subscriptions).
  try{
    if(uid && _currentTokenHash && state.db && state.dbSet && state.dbRef){
      try{
        await state.dbSet(
          state.dbRef(state.db, `users/${uid}/fcmTokens/${_currentTokenHash}`),
          null
        );
      }catch(e){ console.warn('[notify] clear fcmToken failed:', e); }
    }
    if(_messaging){
      try{
        const { deleteToken } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js');
        await deleteToken(_messaging);
      }catch(e){ console.warn('[notify] deleteToken failed:', e); }
      _messaging = null;
    }
    _currentToken = null;
    _currentTokenHash = null;
    try{ localStorage.removeItem(HASH_STORAGE_KEY); }catch(e){}
  }catch(e){
    console.warn('[notify] unregister failed:', e);
  }
}

async function notifyPartner(trigger){
  try{
    if(!state.coupleId || !state.partnerUid) return;
    await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        coupleId: state.coupleId,
        recipientUid: state.partnerUid,
        trigger,
        senderName: state.ME || 'Your partner',
      }),
    });
  }catch(e){
    // Never let a notification failure break the UI
    console.warn('[notify] send failed:', trigger, e);
  }
}

const TRIGGER_KEYS = ['pulse','note','memoryJar','milestone','bucket','status','meetup','dateNight','dnHint','dnGuess','dnCorrect','dnReveal'];

async function initNotificationPrefs(){
  const unsupportedMsg = document.getElementById('notif-unsupported-msg');
  const blockedMsg     = document.getElementById('notif-blocked-msg');
  const enableWrap     = document.getElementById('notif-enable-wrap');
  const togglesGroup   = document.getElementById('notif-toggles-group');
  if(!togglesGroup) return;

  // Reset messaging
  if(unsupportedMsg) unsupportedMsg.style.display = 'none';
  if(blockedMsg)     blockedMsg.style.display     = 'none';
  if(enableWrap)     enableWrap.style.display     = 'none';

  const supported = pushSupported();
  const perm = ('Notification' in window) ? Notification.permission : 'denied';

  if(!supported){
    if(unsupportedMsg) unsupportedMsg.style.display = 'block';
  } else if(perm === 'denied'){
    if(blockedMsg) blockedMsg.style.display = 'block';
  } else if(perm === 'default'){
    if(enableWrap) enableWrap.style.display = 'block';
  }

  // Load existing prefs (default: all enabled)
  if(!state.db || !state.myUid) return;
  let prefs = {};
  try{
    await new Promise(res => state.fbOnValue(
      state.dbRef(state.db, `users/${state.myUid}/notificationPrefs`),
      snap => { prefs = snap.val() || {}; res(); },
      { onlyOnce: true }
    ));
  }catch(e){}

  const canReceive = supported && perm === 'granted';
  togglesGroup.style.opacity = canReceive ? '' : '.55';
  const inputs = togglesGroup.querySelectorAll('input[data-notif]');
  inputs.forEach(inp => {
    const k = inp.dataset.notif;
    inp.checked = prefs[k] !== false; // default on
    inp.disabled = !canReceive;
    inp.onchange = async () => {
      try{
        await state.dbSet(
          state.dbRef(state.db, `users/${state.myUid}/notificationPrefs/${k}`),
          inp.checked
        );
        const saved = document.getElementById('notif-saved-msg');
        if(saved){
          saved.style.display = 'block';
          clearTimeout(window._notifSavedTimer);
          window._notifSavedTimer = setTimeout(()=>saved.style.display='none', 1500);
        }
      }catch(e){
        console.error('save pref failed:', e);
      }
    };
  });
}

window.enableNotifications = async function(){
  const btn = document.getElementById('notif-enable-btn');
  if(btn){ btn.disabled = true; btn.textContent = 'Enabling…'; }
  try{
    await registerFcmToken();
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = 'Enable notifications'; }
    // Refresh the prefs panel to reflect new permission state
    initNotificationPrefs();
  }
};

// ── Register for cross-module access ─────────────────────
R.registerFcmToken = registerFcmToken;
R.unregisterFcmToken = unregisterFcmToken;
R.notifyPartner = notifyPartner;
R.pushSupported = pushSupported;
R.initNotificationPrefs = initNotificationPrefs;
R.consumePendingDeepLink = consumePendingDeepLink;
R.TRIGGER_KEYS = TRIGGER_KEYS;

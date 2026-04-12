import { state } from './state.js';
import { R } from './registry.js';
import { FIREBASE_CONFIG } from './firebase-config.js';

// Client-side FCM registration + outgoing trigger helper.
//
// Registers for web push, stores the resulting token at users/{uid}/fcmToken,
// and exposes R.notifyPartner(trigger) which POSTs to /api/notify.
//
// iOS caveat: Web Push is only available on iOS 16.4+ AND only when the PWA
// is installed to the home screen. We detect + bail silently in that case.

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

let _messaging = null;
let _registerInFlight = false;

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

    await state.dbSet(state.dbRef(state.db, `users/${state.myUid}/fcmToken`), token);

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

const TRIGGER_KEYS = ['pulse','note','memoryJar','milestone','bucket','status','meetup','dateNight'];

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

  const inputs = togglesGroup.querySelectorAll('input[data-notif]');
  inputs.forEach(inp => {
    const k = inp.dataset.notif;
    inp.checked = prefs[k] !== false; // default on
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
R.notifyPartner = notifyPartner;
R.pushSupported = pushSupported;
R.initNotificationPrefs = initNotificationPrefs;
R.TRIGGER_KEYS = TRIGGER_KEYS;

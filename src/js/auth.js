import { state } from './state.js';
import { R } from './registry.js';

import { FIREBASE_CONFIG } from './firebase-config.js';

// ── Global state ────────────────────────────────────────
// Couple data (loaded after auth)
// Couple info

// ── Auth UI helpers ──────────────────────────────────────
function showAuthScreen(id){
  ['screen-login','screen-signup','screen-onboarding','screen-linking','screen-invite','screen-forgot']
    .forEach(s=>{ const el=document.getElementById(s); if(el) el.style.display='none'; });
  // Reset linking screen sections to visible when navigating to it
  if(id==='screen-linking'){
    const dm=document.getElementById('linking-deleted-msg'); if(dm) dm.style.display='none';
    const ldc=document.getElementById('linking-delete-confirm'); if(ldc) ldc.style.display='none';
    // Hide delete-account option by default — shown only for existing accounts, not onboarding
    const ldw=document.getElementById('linking-delete-wrap'); if(ldw) ldw.style.display='none';
    const cs=document.getElementById('linking-create-section');
    const od=document.getElementById('linking-or-divider');
    if(cs)cs.style.display='';
    if(od)od.style.display='';
    // Prevent future dates in the "Together since" picker
    const sdInput=document.getElementById('couple-startdate');
    if(sdInput) sdInput.max=new Date().toLocaleDateString('en-CA');
    // Reset create button in case it was mid-execution when redirect happened
    const createBtn=document.getElementById('create-couple-btn');
    if(createBtn){ createBtn.textContent='Create our Snug'; createBtn.disabled=false; }
    const linkingErr=document.getElementById('linking-error');
    if(linkingErr) linkingErr.textContent='';
  }
  const target = document.getElementById(id);
  if(target) target.style.display='block';
}
window.showAuthScreen = showAuthScreen;

function showAuthWrap(){ document.getElementById('auth-wrap').style.display='flex'; }
function hideAuthWrap(){ document.getElementById('auth-wrap').style.display='none'; }

// When invite code is pre-filled or typed, dim the Create section to avoid confusion
window.onInviteCodeInput = function(){
  const code = document.getElementById('invite-code-input')?.value||'';
  const pendingCode = sessionStorage.getItem('pendingJoinCode')||localStorage.getItem('pendingJoinCode')||'';
  const hasPending = !!pendingCode;
  const shouldHide = code.length > 0 || hasPending;
  const createSection = document.getElementById('linking-create-section');
  const divider = document.getElementById('linking-or-divider');
  if(createSection) createSection.style.display = shouldHide ? 'none' : '';
  if(divider) divider.style.display = shouldHide ? 'none' : '';
  // If code not yet in input but exists in storage, show it as hint
  const hint = document.getElementById('linking-code-hint');
  if(hint){
    if(pendingCode && !code){
      hint.textContent = `Your code: ${pendingCode} — tap above to confirm`;
      hint.style.display = 'block';
    } else {
      hint.style.display = 'none';
    }
  }
};

// Safe DB key from a name — lowercase, spaces to underscores, strip invalid chars
function nameKey(name){ return (name||'').toLowerCase().replace(/\s+/g,'_').replace(/[.#$\[\]/]/g,''); }

// ── SIGN UP ──────────────────────────────────────────────
window.doSignup = async function(){
  const email = document.getElementById('signup-email').value.trim();
  const pw    = document.getElementById('signup-password').value;
  const pw2   = document.getElementById('signup-password2').value;
  const err   = document.getElementById('signup-error');
  err.textContent = '';
  if(!state.fbAuth){ err.textContent = 'Connection error. Please refresh and try again.'; return; }
  if(!email || !pw){ err.textContent = 'Please fill in all fields.'; return; }
  if(pw !== pw2){ err.textContent = "Passwords don't match."; return; }
  if(pw.length < 6){ err.textContent = 'Password must be at least 6 characters.'; return; }
  const signupBtn = document.querySelector('#screen-signup .auth-submit-btn');
  if(signupBtn){ signupBtn.textContent='Creating account…'; signupBtn.disabled=true; }
  try{
    await state.fbAuth.createUserWithEmailAndPassword(email, pw);
    // onAuthStateChanged will fire → show onboarding
  } catch(e){
    err.textContent = R.friendlyAuthError(e.code);
    if(signupBtn){ signupBtn.textContent='Create account'; signupBtn.disabled=false; }
  }
};

// ── SIGN IN ──────────────────────────────────────────────
window.doLogin = async function(){
  const email = document.getElementById('login-email').value.trim();
  const pw    = document.getElementById('login-password').value;
  const err   = document.getElementById('login-error');
  err.textContent = '';
  if(!state.fbAuth){ err.textContent = 'Connection error. Please refresh and try again.'; return; }
  if(!email || !pw){ err.textContent = 'Please fill in all fields.'; return; }
  const loginBtn = document.querySelector('#screen-login .auth-submit-btn');
  if(loginBtn){ loginBtn.textContent='Signing in…'; loginBtn.disabled=true; }
  try{
    await state.fbAuth.signInWithEmailAndPassword(email, pw);
    // onAuthStateChanged will take over — re-enable button in case of DB errors
    if(loginBtn){ loginBtn.textContent='Sign in'; loginBtn.disabled=false; }
  } catch(e){
    err.textContent = R.friendlyAuthError(e.code);
    if(loginBtn){ loginBtn.textContent='Sign in'; loginBtn.disabled=false; }
  }
};

function friendlyAuthError(code){
  const map = {
    'auth/email-already-in-use': 'This email is already registered.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/weak-password': 'Password is too weak.',
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}

// ── ONBOARDING ───────────────────────────────────────────
window.doOnboarding = async function(){
  const name      = document.getElementById('onboard-name').value.trim();
  const err       = document.getElementById('onboard-error');
  err.textContent = '';
  if(!name){ err.textContent = 'Please enter your name.'; return; }
  try{
    const uid = state.fbAuth.currentUser.uid;
    await state.dbSet(state.dbRef(state.db, `users/${uid}`), {
      name, city: '', email: state.fbAuth.currentUser.email,
      createdAt: Date.now()
    });
    // Upload avatar if user selected one (non-blocking)
    if(state._onboardAvatarBlob) R._uploadOnboardAvatar(uid);
    // Go to couple linking
    showAuthScreen('screen-linking');
        const _pending=(sessionStorage.getItem('pendingJoinCode')||localStorage.getItem('pendingJoinCode'));
        if(_pending){
          const _ci=document.getElementById('invite-code-input');
          if(_ci)_ci.value=_pending;
        }
        // Apply correct hide state based on storage
        if(window.onInviteCodeInput) window.onInviteCodeInput();
  } catch(e){
    err.textContent = 'Something went wrong. Please try again.';
    console.error(e);
  }
};

// ── CREATE COUPLE ────────────────────────────────────────
window.doCreateCouple = async function(){
  const btn = document.getElementById('create-couple-btn');
  if(btn.disabled) return;
  btn.textContent = 'Creating…';
  btn.disabled = true;
  try{
    const uid = state.fbAuth.currentUser.uid;
    // Guard: prevent creating duplicate Snug
    let existingData=null;
    await new Promise(res=>state.fbOnValue(state.dbRef(state.db,`users/${uid}`),snap=>{existingData=snap.val();res();},{onlyOnce:true}));
    if(existingData?.coupleId){
      btn.textContent='Create our Snug';btn.disabled=false;
      document.getElementById('linking-error').textContent='You already have a Snug — refreshing…';
      setTimeout(()=>window.location.reload(),1500);
      return;
    }
    // Read start date
    const startDate = document.getElementById('couple-startdate')?.value||'';
    if(!startDate){ document.getElementById('linking-error').textContent='Please enter your start date.'; btn.textContent='Create our Snug'; btn.disabled=false; return; }
    if(new Date(startDate+'T12:00:00') > new Date()){ document.getElementById('linking-error').textContent='Start date can\'t be in the future.'; btn.textContent='Create our Snug'; btn.disabled=false; return; }
    // Unique code generation with collision check
    let code = '';
    for(let i=0;i<10;i++){
      const c = Math.random().toString(36).substring(2,8).toUpperCase();
      let exists=false;
      await new Promise(res=>state.fbOnValue(state.dbRef(state.db,`invites/${c}`),snap=>{exists=!!snap.val();res();},{onlyOnce:true}));
      if(!exists){code=c;break;}
    }
    if(!code){document.getElementById('linking-error').textContent='Could not generate code, please retry.';btn.textContent='Create our Snug';btn.disabled=false;return;}
    // Read selected mode
    const selectedType = document.getElementById('couple-type-input')?.value || 'ldr';
    // Create couple
    const coupleRef = await state.dbPush(state.dbRef(state.db,'couples'), {
      createdAt: Date.now(),
      startDate: startDate,
      meetupDate: '',
      owner: uid,
      coupleType: selectedType
    });
    const newCoupleId = coupleRef.key;
    // Save member (use existingData which was already read for the duplicate guard)
    await state.dbSet(state.dbRef(state.db,`couples/${newCoupleId}/members/${uid}`), {
      name: existingData?.name||'', city: existingData?.city||'', role:'owner'
    });
    // Save invite
    const expiresAt = Date.now()+(48*60*60*1000);
    await state.dbSet(state.dbRef(state.db,`invites/${code}`), {
      coupleId: newCoupleId, createdBy: uid, createdAt: Date.now(), expiresAt, used: false
    });
    // Link user to couple + store code on couple doc so either partner can clean it up
    await state.dbSet(state.dbRef(state.db,`users/${uid}/coupleId`), newCoupleId);
    await state.dbSet(state.dbRef(state.db,`users/${uid}/inviteCode`), code);
    await state.dbSet(state.dbRef(state.db,`couples/${newCoupleId}/inviteCode`), code);
    // Show invite screen
    const inviteUrl=`${location.origin}/?join=${code}`;
    document.getElementById('invite-link-display').textContent=inviteUrl;
    showAuthScreen('screen-invite');
    // Watch for partner joining
    R.watchForPartner(newCoupleId, uid);
  } catch(e){
    console.error(e);
    btn.textContent = 'Create our Snug';
    btn.disabled = false;
    document.getElementById('linking-error').textContent = 'Something went wrong. Try again.';
  }
};

function watchForPartner(cId, myUid){
  // Cancel any existing watcher before registering a new one
  if(state._watchPartnerUnsub){ try{state._watchPartnerUnsub();}catch(e){} state._watchPartnerUnsub=null; }
  let fired = false;
  state._watchPartnerUnsub = state.fbOnValue(state.dbRef(state.db,`couples/${cId}/members`), snap=>{
    if(fired) return;
    const members = snap.val();
    if(!members) return;
    const uids = Object.keys(members);
    if(uids.length >= 2){
      fired = true;
      if(state._watchPartnerUnsub){ try{state._watchPartnerUnsub();}catch(e){} state._watchPartnerUnsub=null; }
      const partnerUidFound = uids.find(u=>u!==myUid);
      if(partnerUidFound) R.loadCoupleAndStart(cId, myUid, partnerUidFound, members);
    }
  });
}

// ── JOIN COUPLE ──────────────────────────────────────────
window.doJoinCouple = async function(){
  const code = document.getElementById('invite-code-input').value.trim().toUpperCase();
  const err  = document.getElementById('linking-error');
  err.textContent = '';
  if(code.length !== 6){ err.textContent = 'Please enter a 6-character code.'; return; }
  const joinBtn = document.getElementById('join-couple-btn');
  if(joinBtn && joinBtn.disabled) return;
  if(joinBtn){ joinBtn.textContent='Joining…'; joinBtn.disabled=true; }
  try{
    const uid = state.fbAuth.currentUser.uid;
    // Check invite
    let invite = null;
    await new Promise(res => state.fbOnValue(state.dbRef(state.db,`invites/${code}`), snap=>{ invite=snap.val(); res(); },{onlyOnce:true}));
    if(!invite){ err.textContent = 'Code not found. Please check and try again.'; if(joinBtn){joinBtn.textContent='Join Snug';joinBtn.disabled=false;} return; }
    if(invite.createdBy === uid){ err.textContent = "You can't join your own Snug with your own code!"; if(joinBtn){joinBtn.textContent='Join Snug';joinBtn.disabled=false;} return; }
    if(invite.used && invite.createdBy !== uid){ err.textContent = 'This invite has already been used.'; if(joinBtn){joinBtn.textContent='Join Snug';joinBtn.disabled=false;} return; }
    if(invite.expiresAt && Date.now() > invite.expiresAt){ err.textContent = 'This invite has expired. Ask your partner for a new one.'; if(joinBtn){joinBtn.textContent='Join Snug';joinBtn.disabled=false;} return; }
    const cId = invite.coupleId;
    const ownerUid = invite.createdBy;
    // Read user data
    let userData = null;
    await new Promise(res => state.fbOnValue(state.dbRef(state.db,`users/${uid}`), snap=>{ userData=snap.val(); res(); },{onlyOnce:true}));
    // Add as member
    await state.dbSet(state.dbRef(state.db,`couples/${cId}/members/${uid}`), {
      name: userData?.name||'', city: userData?.city||'', role:'partner'
    });
    // Mark invite used
    await state.dbSet(state.dbRef(state.db,`invites/${code}/used`), true);
    // Link user to couple (partnerId is derived from members, never stored)
    await state.dbSet(state.dbRef(state.db,`users/${uid}/coupleId`), cId);
    // Read all members and derive partner uid
    let members = null;
    await new Promise(res => state.fbOnValue(state.dbRef(state.db,`couples/${cId}/members`), snap=>{ members=snap.val(); res(); },{onlyOnce:true}));
    const derivedPartnerUid = (members ? Object.keys(members).find(u => u !== uid) : null) || ownerUid;
    try{sessionStorage.removeItem('pendingJoinCode');localStorage.removeItem('pendingJoinCode');}catch(e){}
    R.loadCoupleAndStart(cId, uid, derivedPartnerUid, members);
  } catch(e){
    console.error(e);
    err.textContent = 'Something went wrong. Please try again.';
    if(joinBtn){ joinBtn.textContent='Join Snug'; joinBtn.disabled=false; }
  }
};

window.copyInviteCode = function(){
  const link = document.getElementById('invite-link-display').textContent;
  navigator.clipboard.writeText(link).then(()=>{
    const btn = document.querySelector('#screen-invite .auth-switch-btn');
    if(btn){ btn.textContent='Copied!'; setTimeout(()=>btn.textContent='or copy link',2000); }
  });
};
window.regenerateInvite = async function(){
  if(!state.fbAuth.currentUser || !state.db) return;
  const regBtn=document.querySelector('#screen-invite button:last-child');
  try{
    const uid = state.fbAuth.currentUser.uid;
    let userData = null;
    await new Promise(res=>state.fbOnValue(state.dbRef(state.db,`users/${uid}`),snap=>{userData=snap.val();res();},{onlyOnce:true}));
    if(!userData?.coupleId) return;
    const cId = userData.coupleId;
    const oldCode = userData.inviteCode;
    if(oldCode) await state.dbSet(state.dbRef(state.db,`invites/${oldCode}/used`), true);
    let code='';
    for(let i=0;i<10;i++){
      const c=Math.random().toString(36).substring(2,8).toUpperCase();
      let exists=false;
      await new Promise(res=>state.fbOnValue(state.dbRef(state.db,`invites/${c}`),snap=>{exists=!!snap.val();res();},{onlyOnce:true}));
      if(!exists){code=c;break;}
    }
    if(!code){ if(regBtn)regBtn.textContent='Link expired? Generate a new one'; return; }
    const expiresAt=Date.now()+(48*60*60*1000);
    await state.dbSet(state.dbRef(state.db,`invites/${code}`),{coupleId:cId,createdBy:uid,createdAt:Date.now(),expiresAt,used:false});
    await state.dbSet(state.dbRef(state.db,`users/${uid}/inviteCode`),code);
    const inviteUrl=`${location.origin}/?join=${code}`;
    document.getElementById('invite-link-display').textContent=inviteUrl;
    if(regBtn){regBtn.textContent='✓ New link generated!';setTimeout(()=>regBtn.textContent='Link expired? Generate a new one',2500);}
  }catch(e){
    console.error('regenerateInvite failed:',e);
    if(regBtn){regBtn.textContent='Failed — try again';setTimeout(()=>regBtn.textContent='Link expired? Generate a new one',3000);}
  }
};

window.shareInviteLink = function(){
  const link = document.getElementById('invite-link-display').textContent;
  if(navigator.share){
    navigator.share({title:'Join my Snug',text:'Join our private little corner together.',url:link});
  } else {
    navigator.clipboard.writeText(link).then(()=>{
      const btn = document.querySelector('#screen-invite .auth-submit-btn');
      if(btn){btn.textContent='✓ Copied!';setTimeout(()=>btn.textContent='Share invite link',2000);}
    });
  }
};

// ── LOAD COUPLE DATA AND START ───────────────────────────
async function loadCoupleAndStart(cId, myUidVal, partnerUidVal, members){
  try{
    state.coupleId    = cId;
    state.myUid       = myUidVal;
    state.partnerUid  = partnerUidVal;
    // Names
    state.myName    = members[state.myUid]?.name || state.fbAuth.currentUser.email.split('@')[0];
    state.otherName = members[state.partnerUid]?.name || 'Partner';
    state.ME    = state.myName;
    state.OTHER = state.otherName;
    state.myRole = members[state.myUid]?.role || 'owner';
    // Cities
    state.myCity    = members[state.myUid]?.city || '';
    state.otherCity = members[state.partnerUid]?.city || '';
    // Load my current status
  try{
    await new Promise(res=>state.fbOnValue(state.dbRef(state.db,`couples/${cId}/presence/${myUidVal}/status`),snap=>{
      state.myStatus=snap.val()||null; res();
    },{onlyOnce:true}));
  }catch(e){}
  // Load couple info (startDate, meetupDate, coupleType)
    await new Promise(res => state.fbOnValue(state.dbRef(state.db,`couples/${cId}`), snap=>{
      const d = snap.val();
      state.coupleStartDate  = d?.startDate||'';
      state.coupleMeetupDate = d?.meetupDate||'';
      if(d?.meetupDate){
        const stored = d.meetupDate;
        state.meetupDate = new Date(stored);
        // Restore _dnTimeVal from stored meetup string (Together mode reads this).
        if(stored.includes('T') && !stored.endsWith('T00:00:00')){
          const timePart = stored.split('T')[1]?.substring(0,5)||'19:00';
          state._dnTimeVal = timePart;
        }
      }
      state.coupleType = d?.coupleType||'ldr';
      res();
    },{onlyOnce:true}));
    // Hide auth, show locating
    R.hideAuthWrap();
    document.getElementById('locating').style.display='flex';
    // Init location then start UI
    await R.detectAndStart();
    R.startCoupleTypeListener();
    R.startMeetupDateListener && R.startMeetupDateListener();
    // Register for push notifications (no-op on unsupported platforms)
    R.registerFcmToken && R.registerFcmToken();
    // If the PWA was cold-started by a notification click, jump to the
    // right page/tab now that showPage / switchHomeTab are live.
    R.consumePendingDeepLink && R.consumePendingDeepLink();
  }catch(e){
    console.error('loadCoupleAndStart failed:',e);
    // Reset nav to home so next login starts fresh
    document.querySelectorAll('.page').forEach(p=>{
      if(!p.closest('.page-tab-panel')) p.classList.remove('active');
    });
    const homeP = document.getElementById('page-home');
    if(homeP) homeP.classList.add('active');
    document.querySelectorAll('.bn-item').forEach(n=>n.classList.remove('active'));
    const homeN = document.getElementById('nav-home');
    if(homeN) homeN.classList.add('active');
    // Reset home tabs to Now — every known panel must have .active removed,
    // otherwise two panels can end up visible simultaneously on re-login.
    ['now','us','summary'].forEach(t=>{
      const tp=document.getElementById(`panel-${t}`);
      const tb=document.getElementById(`tab-${t}`);
      if(tp) tp.classList.toggle('active',t==='now');
      if(tb) tb.classList.toggle('active',t==='now');
    });
    R.showAuthWrap();
    showAuthScreen('screen-login');
  }
}

async function tryInitFirebase(){
  try{
    const{initializeApp}=await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
    const{getDatabase,ref,set,push,onValue,remove,serverTimestamp,update,runTransaction}=await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js");
    const{getStorage,ref:storageRef,uploadBytes,getDownloadURL,deleteObject}=await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js");
    const{getAuth,createUserWithEmailAndPassword,signInWithEmailAndPassword,onAuthStateChanged,signOut,sendPasswordResetEmail,updatePassword,updateEmail,reauthenticateWithCredential,EmailAuthProvider,deleteUser}=await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
    const app=initializeApp(FIREBASE_CONFIG);
    state.db=getDatabase(app);state.dbRef=ref;state.dbSet=set;state.dbPush=push;state.dbRemove=remove;state.fbOnValue=onValue;state.dbUpdate=update;state.fbRunTransaction=runTransaction;
    // Auth setup
    const auth=getAuth(app);
    state.fbAuth={
      currentUser: null,
      createUserWithEmailAndPassword:(email,pw)=>createUserWithEmailAndPassword(auth,email,pw),
      signInWithEmailAndPassword:(email,pw)=>signInWithEmailAndPassword(auth,email,pw),
      signOut:()=>signOut(auth),
      sendPasswordResetEmail:(email)=>sendPasswordResetEmail(auth,email),
      updatePassword:(user,pw)=>updatePassword(user,pw),
      updateEmail:(user,email)=>updateEmail(user,email),
      reauthenticateWithCredential:(user,cred)=>reauthenticateWithCredential(user,cred),
      EmailAuthProvider: EmailAuthProvider,
      deleteUser:(user)=>deleteUser(user)
    };
    // Watch auth state
    onAuthStateChanged(auth, async user=>{
      state.fbAuth.currentUser = user;
      if(!user){
        // Not logged in — clear all state and show login screen.
        // Capture uid BEFORE reset so we can clear the stored FCM token.
        // We await unregisterFcmToken so the RTDB write completes before we
        // hand control back to the UI reset. The Firebase handles on `state`
        // (state.db / state.dbSet / state.dbRef) are intentionally NOT nulled
        // in the sign-out block below — unregisterFcmToken depends on them
        // surviving past the reset. If you ever start nulling those handles
        // on sign-out, you must move this call or re-capture the handles.
        const _prevUid = state.myUid;
        if(R.unregisterFcmToken){
          try{ await R.unregisterFcmToken(_prevUid); }catch(e){}
        }
        state.ME=null;state.OTHER=null;state.myUid=null;state.partnerUid=null;state.coupleId=null;state.myRole=null;
        state.myStatus=null;state.otherStatus=null;
        if(state.statusRefreshInterval){clearInterval(state.statusRefreshInterval);state.statusRefreshInterval=null;}
        if(state._mjUnsub){try{state._mjUnsub();}catch(e){}state._mjUnsub=null;}
        if(state._coupleTypeUnsub){try{state._coupleTypeUnsub();}catch(e){}state._coupleTypeUnsub=null;}
        if(state._myAvatarUnsub){try{state._myAvatarUnsub();}catch(e){}state._myAvatarUnsub=null;}
        if(state._otherAvatarUnsub){try{state._otherAvatarUnsub();}catch(e){}state._otherAvatarUnsub=null;}
        state.myAvatarUrl=null;state.otherAvatarUrl=null;
        if(state._onboardAvatarBlob){ state._onboardAvatarBlob=null; }
        // Revoke any preview object URLs
        const onboardPreview = document.getElementById('onboard-avatar-preview');
        if(onboardPreview && onboardPreview.src && onboardPreview.src.startsWith('blob:')){ URL.revokeObjectURL(onboardPreview.src); onboardPreview.src=''; onboardPreview.style.display='none'; }
        const onboardIcon = document.getElementById('onboard-avatar-icon');
        if(onboardIcon) onboardIcon.style.display='';
        if(state._dnUnsub){try{state._dnUnsub();}catch(e){}state._dnUnsub=null;}
        if(R.teardownTonightsMood){try{R.teardownTonightsMood();}catch(e){}}
        if(R.resetSummary){try{R.resetSummary();}catch(e){}}
        if(R._mjResetExpandedMonths){try{R._mjResetExpandedMonths();}catch(e){}}
        state._tmInFlight=false;
        state._mjMyEntry=null;state._mjOtherEntry=null;state._mjStreakCount=0;
        state.coupleType='ldr';
        state.myTz=null;state.otherTz=null;state.myCity=null;state.otherCity=null;state.myCoords=null;state.otherCoords=null;
        R._stopLetterCountdown && R._stopLetterCountdown();
        state.meetupDate=null;state.localMilestones=[];state.localBucket=[];state.letterRounds=[];
        if(state.clockInterval){clearInterval(state.clockInterval);state.clockInterval=null;}
        if(state.distanceInterval){clearInterval(state.distanceInterval);state.distanceInterval=null;}
        if(state.countdownInterval){clearInterval(state.countdownInterval);state.countdownInterval=null;}
        if(window._metricInterval){clearInterval(window._metricInterval);window._metricInterval=null;}
        if(state.pulseTimeInterval){clearInterval(state.pulseTimeInterval);state.pulseTimeInterval=null;}
        if(state.unsubMilestones){try{state.unsubMilestones();}catch(e){}state.unsubMilestones=null;}
        if(state.unsubBucket){try{state.unsubBucket();}catch(e){}state.unsubBucket=null;}
        if(state.unsubPulse){try{state.unsubPulse();}catch(e){}state.unsubPulse=null;}
        if(state._watchPartnerUnsub){try{state._watchPartnerUnsub();}catch(e){}state._watchPartnerUnsub=null;}
        if(state._membersUnsub){try{state._membersUnsub();}catch(e){}state._membersUnsub=null;}
        if(state._unsubWatchOther){try{state._unsubWatchOther();}catch(e){}state._unsubWatchOther=null;}
        if(state.mapInstance){try{state.mapInstance.remove();}catch(e){}state.mapInstance=null;}
        if(state.placesMapInstance){try{state.placesMapInstance.remove();}catch(e){}state.placesMapInstance=null;}
        state._msRegistry.clear();
        state._lastPulseSent=0;
        state._dnCurrentPlan={};
        state._dnTimeVal='19:00';
        state._selectedActivity=null;state._selectedMood=null;
        state.repositionKey=null;state.repositionDragging=false;state.pendingPhotoForKey=null;
        R.showAuthWrap();
        showAuthScreen('screen-login');
        return;
      }
      // Logged in — check if they have a couple
      state.fbOnValue(state.dbRef(state.db,`users/${user.uid}`), async snap=>{
        const userData = snap.val();
        if(!userData){
          // New user — show onboarding
          R.showAuthWrap();
          showAuthScreen('screen-onboarding');
          return;
        }
        if(!userData.coupleId){
          // Has profile but no couple — show linking
          state.myUid = user.uid; // needed for doLinkingDeleteAccount
          R.showAuthWrap();
          showAuthScreen('screen-linking');
          // Show delete option — existing account without a couple
          const _ldw=document.getElementById('linking-delete-wrap'); if(_ldw) _ldw.style.display='block';
          // Pre-fill pending join code
          const _p=(sessionStorage.getItem('pendingJoinCode')||localStorage.getItem('pendingJoinCode'));
          if(_p){
            const _ci=document.getElementById('invite-code-input');
            if(_ci)_ci.value=_p;
          }
          // Apply correct hide state based on storage
          if(window.onInviteCodeInput) window.onInviteCodeInput();
          return;
        }
        // Has couple — derive partner uid from members (no partnerId stored on user)
        const cId = userData.coupleId;
        let _coupleInitFired = false;
        if(state._membersUnsub){ try{state._membersUnsub();}catch(e){} state._membersUnsub=null; }
        state._membersUnsub = state.fbOnValue(state.dbRef(state.db,`couples/${cId}/members`), snap2=>{
          const members = snap2.val();
          if(_coupleInitFired && !members){
            if(state._selfDeleting) return; // we triggered it — onAuthStateChanged handles redirect
            if(!state.fbAuth.currentUser) return; // user signed out — not a partner deletion
            // Partner deleted the couple — clean up all listeners first
            if(state._coupleTypeUnsub){try{state._coupleTypeUnsub();}catch(e){}state._coupleTypeUnsub=null;}
            if(state._dnUnsub){try{state._dnUnsub();}catch(e){}state._dnUnsub=null;}
            if(state._mjUnsub){try{state._mjUnsub();}catch(e){}state._mjUnsub=null;}
            if(R.teardownTonightsMood){try{R.teardownTonightsMood();}catch(e){}}
            if(state.unsubMilestones){try{state.unsubMilestones();}catch(e){}state.unsubMilestones=null;}
            if(state.unsubBucket){try{state.unsubBucket();}catch(e){}state.unsubBucket=null;}
            if(state.unsubPulse){try{state.unsubPulse();}catch(e){}state.unsubPulse=null;}
            // Clean up User 2's stale coupleId from their own user record (fire-and-forget)
            state.dbSet(state.dbRef(state.db,`users/${user.uid}/coupleId`), null).catch(e=>console.warn('Could not clear stale coupleId:', e));
            // Clear any stale pending join code so linking screen doesn't pre-fill a dead code
            try{ sessionStorage.removeItem('pendingJoinCode'); localStorage.removeItem('pendingJoinCode'); }catch(e){}
            // Show message
            state.coupleId=null;
            document.getElementById('main').style.display='none';
            document.getElementById('bottom-nav').style.display='none';
            R.showAuthWrap();
            showAuthScreen('screen-linking');
            const msg = document.getElementById('linking-deleted-msg');
            if(msg) msg.style.display = 'block';
            // Show delete option — partner deleted, existing user may want to leave
            const _ldw2=document.getElementById('linking-delete-wrap'); if(_ldw2) _ldw2.style.display='block';
            return;
          }

          if(_coupleInitFired) return; // already loaded, ignore member updates
          _coupleInitFired = true;

          // Couple doc deleted (partner deleted while we were offline/logging in)
          if(!members){
            state.myUid = user.uid; // needed for doLinkingDeleteAccount
            // Clean up User 2's stale coupleId from their own user record (fire-and-forget)
            state.dbSet(state.dbRef(state.db,`users/${user.uid}/coupleId`), null).catch(e=>console.warn('Could not clear stale coupleId:', e));
            // Clear any stale pending join code so linking screen doesn't pre-fill a dead code
            try{ sessionStorage.removeItem('pendingJoinCode'); localStorage.removeItem('pendingJoinCode'); }catch(e){}
            R.showAuthWrap();
            showAuthScreen('screen-linking');
            const msg = document.getElementById('linking-deleted-msg');
            if(msg) msg.style.display = 'block';
            // Show delete option — existing user whose couple was deleted
            const _ldw3=document.getElementById('linking-delete-wrap'); if(_ldw3) _ldw3.style.display='block';
            return;
          }

          const uids = Object.keys(members);
          const pId = uids.find(u => u !== user.uid);
          if(!pId){
            // Only one member — still waiting for partner
            R.showAuthWrap();
            const code = userData.inviteCode||'';
            const inviteUrl2=`${location.origin}/?join=${code}`;
            document.getElementById('invite-link-display').textContent=inviteUrl2;
            showAuthScreen('screen-invite');
            R.watchForPartner(cId, user.uid);
            return;
          }
          R.loadCoupleAndStart(cId, user.uid, pId, members);
        }, (error) => {
          // Permission denied — couple was deleted, this user is no longer a member
          console.warn('Could not read couple members — couple likely deleted:', error.code);
          if(state._selfDeleting) return; // we triggered it ourselves
          if(!state.fbAuth.currentUser) return; // user signed out — not a partner deletion
          // Works for both login-time and live-in-app cases
          state.myUid = state.myUid || user.uid; // may already be set if live in app
          state.coupleId = null;
          state.dbSet(state.dbRef(state.db,`users/${user.uid}/coupleId`), null).catch(e=>console.warn('Could not clear stale coupleId:', e));
          try{ sessionStorage.removeItem('pendingJoinCode'); localStorage.removeItem('pendingJoinCode'); }catch(e){}
          // Tear down any active listeners if we were live in the app
          if(_coupleInitFired){
            if(state._coupleTypeUnsub){try{state._coupleTypeUnsub();}catch(e){}state._coupleTypeUnsub=null;}
            if(state._dnUnsub){try{state._dnUnsub();}catch(e){}state._dnUnsub=null;}
            if(state._mjUnsub){try{state._mjUnsub();}catch(e){}state._mjUnsub=null;}
            if(R.teardownTonightsMood){try{R.teardownTonightsMood();}catch(e){}}
            if(state.unsubMilestones){try{state.unsubMilestones();}catch(e){}state.unsubMilestones=null;}
            if(state.unsubBucket){try{state.unsubBucket();}catch(e){}state.unsubBucket=null;}
            if(state.unsubPulse){try{state.unsubPulse();}catch(e){}state.unsubPulse=null;}
            document.getElementById('main').style.display='none';
          }
          R.showAuthWrap();
          showAuthScreen('screen-linking');
          const msg = document.getElementById('linking-deleted-msg');
          if(msg) msg.style.display = 'block';
          const _ldw4=document.getElementById('linking-delete-wrap'); if(_ldw4) _ldw4.style.display='block';
        });
      },{onlyOnce:true});
    });
    state.storage=getStorage(app);state.fbStorageRef=storageRef;state.fbUploadBytes=uploadBytes;state.fbGetDownloadURL=getDownloadURL;state.fbDeleteObject=deleteObject;
    window._watchOther=()=>{
      if(state._unsubWatchOther){try{state._unsubWatchOther();}catch(e){}state._unsubWatchOther=null;}
      state._unsubWatchOther=onValue(ref(state.db,`couples/${state.coupleId}/presence/${state.partnerUid}`),snap=>{
        const d=snap.val();
        state.otherTz=d?.timezone||null;state.otherCity=d?.city||"—";
        // Only update coords if we have real values — don't overwrite with [0,0]
        const nc=(d?.lat&&d?.lng)?[d.lat,d.lng]:null;
        const changed=nc&&(!state.otherCoords||Math.abs(nc[0]-(state.otherCoords[0]||0))>0.01||Math.abs(nc[1]-(state.otherCoords[1]||0))>0.01);
        if(nc)state.otherCoords=nc;
        const label=`${state.OTHER} · ${state.otherCity}`;
        document.getElementById("other-city").textContent=state.otherCity||"—";
        // other-weather-city removed — city shown in ldr-clock-city
        // Update distance strip city name immediately
        const dcb=document.getElementById("home-dist-city-b");
        if(dcb){dcb.textContent=state.otherCity||"—";dcb.classList.remove("home-dist-loading");}
        const distEl2=document.getElementById("distance-apart");
        if(distEl2)distEl2.parentElement.classList.remove("home-dist-loading");
        if(state.mapInstance&&state.otherCoords)R.updateOtherMarker(state.otherCoords,label);
        if(changed&&state.otherCoords)R.fetchWeather(state.otherCoords[0],state.otherCoords[1],"other");
        // Update distance and sleep status whenever partner data changes
        R.updateDistanceAndSleep();
        // Read partner status
        if(d?.status) state.otherStatus = d.status;
        else state.otherStatus = null;
        R.renderStatusCard&&R.renderStatusCard();
      });
    };
    window._pushPresence=(tz,city,lat,lng)=>state.dbUpdate(state.dbRef(state.db,`couples/${state.coupleId}/presence/${state.myUid}`),{timezone:tz,city,lat,lng,updatedAt:serverTimestamp()});
    return true;
  }catch(e){
    console.warn("Firebase failed:",e);
    R.showAuthWrap();
    if(!navigator.onLine){
      showAuthScreen('screen-offline');
    } else {
      showAuthScreen('screen-login');
    }
    return false;
  }
}


// ── Register for cross-module access ─────────────────────
R.showAuthWrap = showAuthWrap;
R.hideAuthWrap = hideAuthWrap;
R.nameKey = nameKey;
R.friendlyAuthError = friendlyAuthError;
R.watchForPartner = watchForPartner;
R.loadCoupleAndStart = loadCoupleAndStart;
R.tryInitFirebase = tryInitFirebase;

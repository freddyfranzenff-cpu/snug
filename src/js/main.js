import { FIREBASE_CONFIG } from './firebase-config.js';

  // ── Global state ────────────────────────────────────────
  let db=null,dbRef=null,dbSet=null,dbPush=null,dbRemove=null,fbOnValue=null,dbUpdate=null;
  let storage=null,fbStorageRef=null,fbUploadBytes=null,fbGetDownloadURL=null,fbDeleteObject=null;
  let fbAuth=null;
  // Couple data (loaded after auth)
  let ME=null,OTHER=null,myUid=null,partnerUid=null,coupleId=null;
  let myTz=null,otherTz=null,myCity=null,otherCity=null,myCoords=null,otherCoords=null;
  let myName=null,otherName=null,myRole=null;
  let coupleType='ldr'; // 'ldr' | 'together'
  let myAvatarUrl=null,otherAvatarUrl=null;
  let _onboardAvatarBlob=null;
  let _myAvatarUnsub=null,_otherAvatarUnsub=null;
  let _letterCountdownInterval=null;
  let _selfDeleting=false; // true when this user initiated couple deletion
  let myStatus=null,otherStatus=null;
  let statusRefreshInterval=null;
  // Couple info
  let coupleStartDate=null,coupleMeetupDate=null;

  // ── Auth UI helpers ──────────────────────────────────────
  window.showAuthScreen = function(id){
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
  };

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
    if(!fbAuth){ err.textContent = 'Connection error. Please refresh and try again.'; return; }
    if(!email || !pw){ err.textContent = 'Please fill in all fields.'; return; }
    if(pw !== pw2){ err.textContent = "Passwords don't match."; return; }
    if(pw.length < 6){ err.textContent = 'Password must be at least 6 characters.'; return; }
    const signupBtn = document.querySelector('#screen-signup .auth-submit-btn');
    if(signupBtn){ signupBtn.textContent='Creating account…'; signupBtn.disabled=true; }
    try{
      await fbAuth.createUserWithEmailAndPassword(email, pw);
      // onAuthStateChanged will fire → show onboarding
    } catch(e){
      err.textContent = friendlyAuthError(e.code);
      if(signupBtn){ signupBtn.textContent='Create account'; signupBtn.disabled=false; }
    }
  };

  // ── SIGN IN ──────────────────────────────────────────────
  window.doLogin = async function(){
    const email = document.getElementById('login-email').value.trim();
    const pw    = document.getElementById('login-password').value;
    const err   = document.getElementById('login-error');
    err.textContent = '';
    if(!fbAuth){ err.textContent = 'Connection error. Please refresh and try again.'; return; }
    if(!email || !pw){ err.textContent = 'Please fill in all fields.'; return; }
    const loginBtn = document.querySelector('#screen-login .auth-submit-btn');
    if(loginBtn){ loginBtn.textContent='Signing in…'; loginBtn.disabled=true; }
    try{
      await fbAuth.signInWithEmailAndPassword(email, pw);
      // onAuthStateChanged will take over — re-enable button in case of DB errors
      if(loginBtn){ loginBtn.textContent='Sign in'; loginBtn.disabled=false; }
    } catch(e){
      err.textContent = friendlyAuthError(e.code);
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
      const uid = fbAuth.currentUser.uid;
      await dbSet(dbRef(db, `users/${uid}`), {
        name, city: '', email: fbAuth.currentUser.email,
        createdAt: Date.now()
      });
      // Upload avatar if user selected one (non-blocking)
      if(_onboardAvatarBlob) _uploadOnboardAvatar(uid);
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
      const uid = fbAuth.currentUser.uid;
      // Guard: prevent creating duplicate Snug
      let existingData=null;
      await new Promise(res=>fbOnValue(dbRef(db,`users/${uid}`),snap=>{existingData=snap.val();res();},{onlyOnce:true}));
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
        await new Promise(res=>fbOnValue(dbRef(db,`invites/${c}`),snap=>{exists=!!snap.val();res();},{onlyOnce:true}));
        if(!exists){code=c;break;}
      }
      if(!code){document.getElementById('linking-error').textContent='Could not generate code, please retry.';btn.textContent='Create our Snug';btn.disabled=false;return;}
      // Read selected mode
      const selectedType = document.getElementById('couple-type-input')?.value || 'ldr';
      // Create couple
      const coupleRef = await dbPush(dbRef(db,'couples'), {
        createdAt: Date.now(),
        startDate: startDate,
        meetupDate: '',
        owner: uid,
        coupleType: selectedType
      });
      const newCoupleId = coupleRef.key;
      // Save member (use existingData which was already read for the duplicate guard)
      await dbSet(dbRef(db,`couples/${newCoupleId}/members/${uid}`), {
        name: existingData?.name||'', city: existingData?.city||'', role:'owner'
      });
      // Save invite
      const expiresAt = Date.now()+(48*60*60*1000);
      await dbSet(dbRef(db,`invites/${code}`), {
        coupleId: newCoupleId, createdBy: uid, createdAt: Date.now(), expiresAt, used: false
      });
      // Link user to couple + store code on couple doc so either partner can clean it up
      await dbSet(dbRef(db,`users/${uid}/coupleId`), newCoupleId);
      await dbSet(dbRef(db,`users/${uid}/inviteCode`), code);
      await dbSet(dbRef(db,`couples/${newCoupleId}/inviteCode`), code);
      // Show invite screen
      const inviteUrl=`${location.origin}/?join=${code}`;
      document.getElementById('invite-link-display').textContent=inviteUrl;
      showAuthScreen('screen-invite');
      // Watch for partner joining
      watchForPartner(newCoupleId, uid);
    } catch(e){
      console.error(e);
      btn.textContent = 'Create our Snug';
      btn.disabled = false;
      document.getElementById('linking-error').textContent = 'Something went wrong. Try again.';
    }
  };

  let _watchPartnerUnsub = null; // prevent duplicate watchForPartner listeners
  let _membersUnsub = null;      // unsub for the persistent couple members listener
  function watchForPartner(cId, myUid){
    // Cancel any existing watcher before registering a new one
    if(_watchPartnerUnsub){ try{_watchPartnerUnsub();}catch(e){} _watchPartnerUnsub=null; }
    let fired = false;
    _watchPartnerUnsub = fbOnValue(dbRef(db,`couples/${cId}/members`), snap=>{
      if(fired) return;
      const members = snap.val();
      if(!members) return;
      const uids = Object.keys(members);
      if(uids.length >= 2){
        fired = true;
        if(_watchPartnerUnsub){ try{_watchPartnerUnsub();}catch(e){} _watchPartnerUnsub=null; }
        const partnerUidFound = uids.find(u=>u!==myUid);
        if(partnerUidFound) loadCoupleAndStart(cId, myUid, partnerUidFound, members);
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
      const uid = fbAuth.currentUser.uid;
      // Check invite
      let invite = null;
      await new Promise(res => fbOnValue(dbRef(db,`invites/${code}`), snap=>{ invite=snap.val(); res(); },{onlyOnce:true}));
      if(!invite){ err.textContent = 'Code not found. Please check and try again.'; if(joinBtn){joinBtn.textContent='Join Snug';joinBtn.disabled=false;} return; }
      if(invite.createdBy === uid){ err.textContent = "You can't join your own Snug with your own code!"; if(joinBtn){joinBtn.textContent='Join Snug';joinBtn.disabled=false;} return; }
      if(invite.used && invite.createdBy !== uid){ err.textContent = 'This invite has already been used.'; if(joinBtn){joinBtn.textContent='Join Snug';joinBtn.disabled=false;} return; }
      if(invite.expiresAt && Date.now() > invite.expiresAt){ err.textContent = 'This invite has expired. Ask your partner for a new one.'; if(joinBtn){joinBtn.textContent='Join Snug';joinBtn.disabled=false;} return; }
      const cId = invite.coupleId;
      const ownerUid = invite.createdBy;
      // Read user data
      let userData = null;
      await new Promise(res => fbOnValue(dbRef(db,`users/${uid}`), snap=>{ userData=snap.val(); res(); },{onlyOnce:true}));
      // Add as member
      await dbSet(dbRef(db,`couples/${cId}/members/${uid}`), {
        name: userData?.name||'', city: userData?.city||'', role:'partner'
      });
      // Mark invite used
      await dbSet(dbRef(db,`invites/${code}/used`), true);
      // Link user to couple (partnerId is derived from members, never stored)
      await dbSet(dbRef(db,`users/${uid}/coupleId`), cId);
      // Read all members and derive partner uid
      let members = null;
      await new Promise(res => fbOnValue(dbRef(db,`couples/${cId}/members`), snap=>{ members=snap.val(); res(); },{onlyOnce:true}));
      const derivedPartnerUid = (members ? Object.keys(members).find(u => u !== uid) : null) || ownerUid;
      try{sessionStorage.removeItem('pendingJoinCode');localStorage.removeItem('pendingJoinCode');}catch(e){}
      loadCoupleAndStart(cId, uid, derivedPartnerUid, members);
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
    if(!fbAuth.currentUser || !db) return;
    const regBtn=document.querySelector('#screen-invite button:last-child');
    try{
      const uid = fbAuth.currentUser.uid;
      let userData = null;
      await new Promise(res=>fbOnValue(dbRef(db,`users/${uid}`),snap=>{userData=snap.val();res();},{onlyOnce:true}));
      if(!userData?.coupleId) return;
      const cId = userData.coupleId;
      const oldCode = userData.inviteCode;
      if(oldCode) await dbSet(dbRef(db,`invites/${oldCode}/used`), true);
      let code='';
      for(let i=0;i<10;i++){
        const c=Math.random().toString(36).substring(2,8).toUpperCase();
        let exists=false;
        await new Promise(res=>fbOnValue(dbRef(db,`invites/${c}`),snap=>{exists=!!snap.val();res();},{onlyOnce:true}));
        if(!exists){code=c;break;}
      }
      if(!code){ if(regBtn)regBtn.textContent='Link expired? Generate a new one'; return; }
      const expiresAt=Date.now()+(48*60*60*1000);
      await dbSet(dbRef(db,`invites/${code}`),{coupleId:cId,createdBy:uid,createdAt:Date.now(),expiresAt,used:false});
      await dbSet(dbRef(db,`users/${uid}/inviteCode`),code);
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
      coupleId    = cId;
      myUid       = myUidVal;
      partnerUid  = partnerUidVal;
      // Names
      myName    = members[myUid]?.name || fbAuth.currentUser.email.split('@')[0];
      otherName = members[partnerUid]?.name || 'Partner';
      ME    = myName;
      OTHER = otherName;
      myRole = members[myUid]?.role || 'owner';
      // Cities
      myCity    = members[myUid]?.city || '';
      otherCity = members[partnerUid]?.city || '';
      // Load my current status
    try{
      await new Promise(res=>fbOnValue(dbRef(db,`couples/${cId}/presence/${myUidVal}/status`),snap=>{
        myStatus=snap.val()||null; res();
      },{onlyOnce:true}));
    }catch(e){}
    // Load couple info (startDate, meetupDate, coupleType)
      await new Promise(res => fbOnValue(dbRef(db,`couples/${cId}`), snap=>{
        const d = snap.val();
        coupleStartDate  = d?.startDate||'';
        coupleMeetupDate = d?.meetupDate||'';
        if(d?.meetupDate){
          const stored = d.meetupDate;
          meetupDate = new Date(stored);
          // Restore time input if Together mode and time was stored
          if(stored.includes('T') && !stored.endsWith('T00:00:00')){
            const timePart = stored.split('T')[1]?.substring(0,5)||'19:00';
            _dnTimeVal = timePart;
            const ti = document.getElementById('meetup-time-input');
            if(ti) ti.value = timePart;
          }
        }
        coupleType = d?.coupleType||'ldr';
        res();
      },{onlyOnce:true}));
      // Hide auth, show locating
      hideAuthWrap();
      document.getElementById('locating').style.display='flex';
      // Init location then start UI
      await detectAndStart();
      startCoupleTypeListener();
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
      // Reset home tabs to Now
      ['now','us','moments'].forEach(t=>{
        const tp=document.getElementById(`panel-${t}`);
        const tb=document.getElementById(`tab-${t}`);
        if(tp) tp.classList.toggle('active',t==='now');
        if(tb) tb.classList.toggle('active',t==='now');
      });
      showAuthWrap();
      showAuthScreen('screen-login');
    }
  }

  async function tryInitFirebase(){
    try{
      const{initializeApp}=await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
      const{getDatabase,ref,set,push,onValue,remove,serverTimestamp,update}=await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js");
      const{getStorage,ref:storageRef,uploadBytes,getDownloadURL,deleteObject}=await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js");
      const{getAuth,createUserWithEmailAndPassword,signInWithEmailAndPassword,onAuthStateChanged,signOut,sendPasswordResetEmail,updatePassword,updateEmail,reauthenticateWithCredential,EmailAuthProvider,deleteUser}=await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
      const app=initializeApp(FIREBASE_CONFIG);
      db=getDatabase(app);dbRef=ref;dbSet=set;dbPush=push;dbRemove=remove;fbOnValue=onValue;dbUpdate=update;
      // Auth setup
      const auth=getAuth(app);
      fbAuth={
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
        fbAuth.currentUser = user;
        if(!user){
          // Not logged in — clear all state and show login screen
          ME=null;OTHER=null;myUid=null;partnerUid=null;coupleId=null;myRole=null;
          myStatus=null;otherStatus=null;
          if(statusRefreshInterval){clearInterval(statusRefreshInterval);statusRefreshInterval=null;}
          if(_mjUnsub){try{_mjUnsub();}catch(e){}_mjUnsub=null;}
          if(_coupleTypeUnsub){try{_coupleTypeUnsub();}catch(e){}_coupleTypeUnsub=null;}
          if(_myAvatarUnsub){try{_myAvatarUnsub();}catch(e){}_myAvatarUnsub=null;}
          if(_otherAvatarUnsub){try{_otherAvatarUnsub();}catch(e){}_otherAvatarUnsub=null;}
          myAvatarUrl=null;otherAvatarUrl=null;
          if(_onboardAvatarBlob){ _onboardAvatarBlob=null; }
          // Revoke any preview object URLs
          const onboardPreview = document.getElementById('onboard-avatar-preview');
          if(onboardPreview && onboardPreview.src && onboardPreview.src.startsWith('blob:')){ URL.revokeObjectURL(onboardPreview.src); onboardPreview.src=''; onboardPreview.style.display='none'; }
          const onboardIcon = document.getElementById('onboard-avatar-icon');
          if(onboardIcon) onboardIcon.style.display='';
          if(_dnUnsub){try{_dnUnsub();}catch(e){}_dnUnsub=null;}
          if(_tpUnsub){try{_tpUnsub();}catch(e){}_tpUnsub=null;}
          _mjMyEntry=null;_mjOtherEntry=null;_mjStreakCount=0;
          coupleType='ldr';
          myTz=null;otherTz=null;myCity=null;otherCity=null;myCoords=null;otherCoords=null;
          _stopLetterCountdown && _stopLetterCountdown();
          meetupDate=null;localNotes=[];localMilestones=[];localBucket=[];letterRounds=[];
          if(clockInterval){clearInterval(clockInterval);clockInterval=null;}
          if(distanceInterval){clearInterval(distanceInterval);distanceInterval=null;}
          if(countdownInterval){clearInterval(countdownInterval);countdownInterval=null;}
          if(window._metricInterval){clearInterval(window._metricInterval);window._metricInterval=null;}
          if(pulseTimeInterval){clearInterval(pulseTimeInterval);pulseTimeInterval=null;}
          if(unsubNotes){try{unsubNotes();}catch(e){}unsubNotes=null;}
          if(unsubMilestones){try{unsubMilestones();}catch(e){}unsubMilestones=null;}
          if(unsubBucket){try{unsubBucket();}catch(e){}unsubBucket=null;}
          if(unsubPulse){try{unsubPulse();}catch(e){}unsubPulse=null;}
          if(_watchPartnerUnsub){try{_watchPartnerUnsub();}catch(e){}_watchPartnerUnsub=null;}
          if(_membersUnsub){try{_membersUnsub();}catch(e){}_membersUnsub=null;}
          if(_unsubWatchOther){try{_unsubWatchOther();}catch(e){}_unsubWatchOther=null;}
          if(mapInstance){try{mapInstance.remove();}catch(e){}mapInstance=null;}
          if(placesMapInstance){try{placesMapInstance.remove();}catch(e){}placesMapInstance=null;}
          _msRegistry.clear();
          _lastPulseSent=0;
          _dnCurrentPlan={};_tpMyCurrentVal='';
          _dnTimeVal='19:00';
          _selectedActivity=null;_selectedMood=null;
          repositionKey=null;repositionDragging=false;pendingPhotoForKey=null;
          showAuthWrap();
          showAuthScreen('screen-login');
          return;
        }
        // Logged in — check if they have a couple
        fbOnValue(dbRef(db,`users/${user.uid}`), async snap=>{
          const userData = snap.val();
          if(!userData){
            // New user — show onboarding
            showAuthWrap();
            showAuthScreen('screen-onboarding');
            return;
          }
          if(!userData.coupleId){
            // Has profile but no couple — show linking
            myUid = user.uid; // needed for doLinkingDeleteAccount
            showAuthWrap();
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
          if(_membersUnsub){ try{_membersUnsub();}catch(e){} _membersUnsub=null; }
          _membersUnsub = fbOnValue(dbRef(db,`couples/${cId}/members`), snap2=>{
            const members = snap2.val();
            if(_coupleInitFired && !members){
              if(_selfDeleting) return; // we triggered it — onAuthStateChanged handles redirect
              if(!fbAuth.currentUser) return; // user signed out — not a partner deletion
              // Partner deleted the couple — clean up all listeners first
              if(_coupleTypeUnsub){try{_coupleTypeUnsub();}catch(e){}_coupleTypeUnsub=null;}
              if(_dnUnsub){try{_dnUnsub();}catch(e){}_dnUnsub=null;}
              if(_tpUnsub){try{_tpUnsub();}catch(e){}_tpUnsub=null;}
              if(_mjUnsub){try{_mjUnsub();}catch(e){}_mjUnsub=null;}
              if(unsubNotes){try{unsubNotes();}catch(e){}unsubNotes=null;}
              if(unsubMilestones){try{unsubMilestones();}catch(e){}unsubMilestones=null;}
              if(unsubBucket){try{unsubBucket();}catch(e){}unsubBucket=null;}
              if(unsubPulse){try{unsubPulse();}catch(e){}unsubPulse=null;}
              // Clean up User 2's stale coupleId from their own user record (fire-and-forget)
              dbSet(dbRef(db,`users/${user.uid}/coupleId`), null).catch(e=>console.warn('Could not clear stale coupleId:', e));
              // Clear any stale pending join code so linking screen doesn't pre-fill a dead code
              try{ sessionStorage.removeItem('pendingJoinCode'); localStorage.removeItem('pendingJoinCode'); }catch(e){}
              // Show message
              coupleId=null;
              document.getElementById('main').style.display='none';
              document.getElementById('bottom-nav').style.display='none';
              showAuthWrap();
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
              myUid = user.uid; // needed for doLinkingDeleteAccount
              // Clean up User 2's stale coupleId from their own user record (fire-and-forget)
              dbSet(dbRef(db,`users/${user.uid}/coupleId`), null).catch(e=>console.warn('Could not clear stale coupleId:', e));
              // Clear any stale pending join code so linking screen doesn't pre-fill a dead code
              try{ sessionStorage.removeItem('pendingJoinCode'); localStorage.removeItem('pendingJoinCode'); }catch(e){}
              showAuthWrap();
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
              showAuthWrap();
              const code = userData.inviteCode||'';
              const inviteUrl2=`${location.origin}/?join=${code}`;
              document.getElementById('invite-link-display').textContent=inviteUrl2;
              showAuthScreen('screen-invite');
              watchForPartner(cId, user.uid);
              return;
            }
            loadCoupleAndStart(cId, user.uid, pId, members);
          }, (error) => {
            // Permission denied — couple was deleted, this user is no longer a member
            console.warn('Could not read couple members — couple likely deleted:', error.code);
            if(_selfDeleting) return; // we triggered it ourselves
            if(!fbAuth.currentUser) return; // user signed out — not a partner deletion
            // Works for both login-time and live-in-app cases
            myUid = myUid || user.uid; // may already be set if live in app
            coupleId = null;
            dbSet(dbRef(db,`users/${user.uid}/coupleId`), null).catch(e=>console.warn('Could not clear stale coupleId:', e));
            try{ sessionStorage.removeItem('pendingJoinCode'); localStorage.removeItem('pendingJoinCode'); }catch(e){}
            // Tear down any active listeners if we were live in the app
            if(_coupleInitFired){
              if(_coupleTypeUnsub){try{_coupleTypeUnsub();}catch(e){}_coupleTypeUnsub=null;}
              if(_dnUnsub){try{_dnUnsub();}catch(e){}_dnUnsub=null;}
              if(_tpUnsub){try{_tpUnsub();}catch(e){}_tpUnsub=null;}
              if(_mjUnsub){try{_mjUnsub();}catch(e){}_mjUnsub=null;}
              if(unsubNotes){try{unsubNotes();}catch(e){}unsubNotes=null;}
              if(unsubMilestones){try{unsubMilestones();}catch(e){}unsubMilestones=null;}
              if(unsubBucket){try{unsubBucket();}catch(e){}unsubBucket=null;}
              if(unsubPulse){try{unsubPulse();}catch(e){}unsubPulse=null;}
              document.getElementById('main').style.display='none';
            }
            showAuthWrap();
            showAuthScreen('screen-linking');
            const msg = document.getElementById('linking-deleted-msg');
            if(msg) msg.style.display = 'block';
            const _ldw4=document.getElementById('linking-delete-wrap'); if(_ldw4) _ldw4.style.display='block';
          });
        },{onlyOnce:true});
      });
      storage=getStorage(app);fbStorageRef=storageRef;fbUploadBytes=uploadBytes;fbGetDownloadURL=getDownloadURL;fbDeleteObject=deleteObject;
      let _unsubWatchOther=null;
      window._watchOther=()=>{
        if(_unsubWatchOther){try{_unsubWatchOther();}catch(e){}_unsubWatchOther=null;}
        _unsubWatchOther=onValue(ref(db,`couples/${coupleId}/presence/${partnerUid}`),snap=>{
          const d=snap.val();
          otherTz=d?.timezone||null;otherCity=d?.city||"—";
          // Only update coords if we have real values — don't overwrite with [0,0]
          const nc=(d?.lat&&d?.lng)?[d.lat,d.lng]:null;
          const changed=nc&&(!otherCoords||Math.abs(nc[0]-(otherCoords[0]||0))>0.01||Math.abs(nc[1]-(otherCoords[1]||0))>0.01);
          if(nc)otherCoords=nc;
          const label=`${OTHER} · ${otherCity}`;
          document.getElementById("other-city").textContent=otherCity||"—";
          // other-weather-city removed — city shown in ldr-clock-city
          // Update distance strip city name immediately
          const dcb=document.getElementById("home-dist-city-b");
          if(dcb){dcb.textContent=otherCity||"—";dcb.classList.remove("home-dist-loading");}
          const distEl2=document.getElementById("distance-apart");
          if(distEl2)distEl2.parentElement.classList.remove("home-dist-loading");
          if(mapInstance&&otherCoords)updateOtherMarker(otherCoords,label);
          if(changed&&otherCoords)fetchWeather(otherCoords[0],otherCoords[1],"other");
          // Update distance and sleep status whenever partner data changes
          updateDistanceAndSleep();
          // Read partner status
          if(d?.status) otherStatus = d.status;
          else otherStatus = null;
          renderStatusCard&&renderStatusCard();
        });
      };
      window._pushPresence=(tz,city,lat,lng)=>dbUpdate(dbRef(db,`couples/${coupleId}/presence/${myUid}`),{timezone:tz,city,lat,lng,updatedAt:serverTimestamp()});
      return true;
    }catch(e){
      console.warn("Firebase failed:",e);
      showAuthWrap();
      if(!navigator.onLine){
        showAuthScreen('screen-offline');
      } else {
        showAuthScreen('screen-login');
      }
      return false;
    }
  }

  // Location
  async function tzFromCoords(lat,lng){try{const ac=new AbortController();const t=setTimeout(()=>ac.abort(),5000);const r=await fetch(`https://timeapi.io/api/timezone/coordinate?latitude=${lat}&longitude=${lng}`,{signal:ac.signal});clearTimeout(t);return(await r.json()).timeZone||null;}catch{return null;}}
  async function cityFromCoords(lat,lng){try{const ac=new AbortController();const t=setTimeout(()=>ac.abort(),5000);const r=await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,{signal:ac.signal});clearTimeout(t);const j=await r.json();return j.address?.city||j.address?.town||j.address?.village||j.address?.county||null;}catch{return null;}}
  async function detectMyLocation(){return new Promise(res=>{if(!navigator.geolocation){res({tz:null,city:null,lat:null,lng:null});return;}navigator.geolocation.getCurrentPosition(async({coords:{latitude:lat,longitude:lng}})=>{const[tz,city]=await Promise.all([tzFromCoords(lat,lng),cityFromCoords(lat,lng)]);res({tz,city,lat,lng});},()=>res({tz:null,city:null,lat:null,lng:null}),{timeout:8000});});}
  async function detectAndStart(){
    try{
      const{tz,city,lat,lng}=await detectMyLocation();
      myTz=tz||Intl.DateTimeFormat().resolvedOptions().timeZone||"UTC";
      myCity=city||"—";
      myCoords=(lat&&lng)?[lat,lng]:null;
      // Only push presence if we have real coordinates — don't push [0,0]
      if(myCoords&&window._pushPresence)window._pushPresence(myTz,myCity,myCoords[0],myCoords[1]);
      // Leave partner data null — _watchOther populates from Firebase
      startUI();
    }catch(e){
      console.error('detectAndStart failed:',e);
      myTz=myTz||"UTC";myCity=myCity||"—";
      startUI();
    }
  }

  // Weather
  function wIcon(c){
    // WMO codes (0–99) from open-meteo used on localhost
    if(c===0)return"☀️";if(c===1||c===2)return"⛅";if(c===3)return"☁️";
    if(c===45||c===48)return"🌫️";
    if(c===51||c===53||c===55||c===56||c===57)return"🌦️";
    if(c===61||c===63||c===65||c===66||c===67||c===80||c===81||c===82)return"🌧️";
    if(c===71||c===73||c===75||c===77||c===85||c===86)return"❄️";
    if(c===95)return"⛈️";if(c===96||c===99)return"⛈️";
    // wttr.in codes
    if(c===113)return"☀️";if(c===116)return"⛅";if(c===119||c===122)return"☁️";
    if(c===143||c===248||c===260)return"🌫️";
    if(c===176||c===263||c===266||c===293||c===296)return"🌦️";
    if(c===299||c===302||c===305||c===308||c===353||c===356||c===359)return"🌧️";
    if(c===179||c===227||c===230||c===320||c===323||c===326||c===329||c===332||c===335||c===338||c===368||c===371)return"❄️";
    if(c===182||c===185||c===281||c===284||c===311||c===314||c===317||c===362||c===365)return"🌨️";
    if(c===200||c===386||c===389||c===392||c===395)return"⛈️";
    if(c===350||c===374||c===377)return"🌨️";
    return"⛅";
  }
  function wDesc(c){
    // WMO codes (open-meteo / localhost)
    if(c===0)return"Clear sky";if(c===1)return"Mainly clear";if(c===2)return"Partly cloudy";if(c===3)return"Overcast";
    if(c===45||c===48)return"Foggy";
    if(c===51||c===53||c===55)return"Drizzle";if(c===56||c===57)return"Freezing drizzle";
    if(c===61||c===63)return"Light rain";if(c===65)return"Heavy rain";
    if(c===66||c===67)return"Freezing rain";
    if(c===71||c===73)return"Light snow";if(c===75)return"Heavy snow";if(c===77)return"Snow grains";
    if(c===80||c===81)return"Rain showers";if(c===82)return"Heavy showers";
    if(c===85||c===86)return"Snow showers";
    if(c===95)return"Thunderstorm";if(c===96||c===99)return"Thunderstorm with hail";
    // wttr.in codes
    if(c===113)return"Clear sky";if(c===116)return"Partly cloudy";if(c===119)return"Cloudy";if(c===122)return"Overcast";
    if(c===143||c===248||c===260)return"Foggy";
    if(c===176||c===263||c===266||c===293||c===296)return"Light rain";
    if(c===299||c===302||c===305||c===308)return"Rain";
    if(c===353||c===356||c===359)return"Rain showers";
    if(c===179||c===323||c===326)return"Light snow";
    if(c===227||c===230||c===329||c===332||c===335||c===338)return"Snow";
    if(c===368||c===371)return"Snow showers";
    if(c===182||c===185||c===281||c===284||c===311||c===314||c===317)return"Sleet";
    if(c===200||c===386||c===389)return"Thunderstorm";
    if(c===392||c===395)return"Thundery snow";
    if(c===350||c===374||c===377)return"Ice pellets";
    return"—";
  }
  async function fetchWeather(lat,lng,prefix){try{// Use Vercel proxy in production to avoid CORS; direct on localhost
    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const weatherUrl = isLocal
      ? `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weathercode,windspeed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`
      : `/api/weather?lat=${lat}&lng=${lng}`;
    const r=await fetch(weatherUrl,{cache:'no-store'});const j=await r.json();const temp=Math.round(j.current.temperature_2m),code=j.current.weathercode,wind=Math.round(j.current.windspeed_10m),high=Math.round(j.daily.temperature_2m_max[0]),low=Math.round(j.daily.temperature_2m_min[0]);const _wi=document.getElementById(`${prefix}-weather-icon`);const _wt=document.getElementById(`${prefix}-weather-temp`);const _wd=document.getElementById(`${prefix}-weather-desc`);const _wdt=document.getElementById(`${prefix}-weather-details`);if(_wi)_wi.textContent=wIcon(code);if(_wt)_wt.textContent=`${temp}°`;if(_wd)_wd.textContent=wDesc(code);if(_wdt)_wdt.textContent=`H ${high}°  L ${low}°  Wind ${wind} km/h`;}catch(e){const _wt2=document.getElementById(`${prefix}-weather-temp`);if(_wt2)_wt2.textContent='—';}}

  // Map
  function initMap(myCo,oCo,myL,oL){
    // Guard against null/zero coords — use sensible fallback
    if(!myCo||(!myCo[0]&&!myCo[1]))myCo=oCo||[20,0];
    if(!oCo||(!oCo[0]&&!oCo[1]))oCo=myCo||[20,0];
    if(mapInstance){mapInstance.remove();mapInstance=null;}
    const isMobile=window.innerWidth<680;mapInstance=L.map("map",{zoomControl:false,attributionControl:true,minZoom:1,worldCopyJump:false}).setView([(myCo[0]+oCo[0])/2,(myCo[1]+oCo[1])/2],isMobile?1:2);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",{attribution:"© OpenStreetMap",subdomains:"abcd",maxZoom:18}).addTo(mapInstance);
    const mkI=color=>L.divIcon({className:"",html:`<div style="background:${color};width:12px;height:12px;border-radius:50%;border:2.5px solid white;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>`,iconSize:[12,12],iconAnchor:[6,6]});
    myMarker=L.marker(myCo,{icon:mkI("#e8622a")}).addTo(mapInstance).bindTooltip(myL,{permanent:true,direction:"top",offset:[0,-10],className:"map-tooltip"});
    otherMarker=L.marker(oCo,{icon:mkI("#d4607a")}).addTo(mapInstance).bindTooltip(oL,{permanent:true,direction:"top",offset:[0,-10],className:"map-tooltip"});
    connectLine=L.polyline([myCo,oCo],{color:"#e8622a",weight:1.5,dashArray:"6,5",opacity:.65}).addTo(mapInstance);
    
  }
  function updateOtherMarker(coords,label){if(!mapInstance||!otherMarker||!coords)return;otherMarker.setLatLng(coords);otherMarker.setTooltipContent(label);if(connectLine&&myCoords)connectLine.setLatLngs([myCoords,coords]);}

  // Notes
  function fmtTs(ts){if(!ts)return"";const d=new Date(ts),p=n=>String(n).padStart(2,"0");return`${p(d.getDate())}.${p(d.getMonth()+1)}.${String(d.getFullYear()).slice(2)} · ${p(d.getHours())}:${p(d.getMinutes())}`;}
  function noteCardHTML(note){
    const canDelete=note.author===ME;
    const reactions=note.reactions||{};
    const myReaction=myUid&&reactions[myUid];
    const heartCount=Object.keys(reactions).length;
    const reactLabel=heartCount>0?`${heartCount}`:"";
    const k=_esc(note._key||"");
    return`<div class="note-card">
      <p class="note-text">${_esc(note.text)}</p>
      <div class="note-footer">
        <span class="note-author">${_esc(note.author)}</span>
        ${note.time?`<span class="note-time">${fmtTs(note.time)}</span>`:""}
      </div>
      <div class="note-actions">
        <button class="note-react-btn${myReaction?" reacted":""}" onclick="reactToNote('${k}')" title="React with heart">
          <svg width="12" height="11" viewBox="0 0 32 30" fill="${myReaction?"#e8622a":"none"}" stroke="#e8622a" stroke-width="1.5" stroke-linejoin="round"><path d="M16 28C14 26 2 19 2 10.5A7.5 7.5 0 0116 15a7.5 7.5 0 0114-4.5C30 19 18 26 16 28z"/></svg>
          ${reactLabel}
        </button>
        ${canDelete&&note._key?`<button class="note-delete-btn" onclick="deleteNote('${k}')" title="Delete">✕</button>`:""}
      </div>
    </div>`;
  }
  function renderNotes(notes){const w=document.getElementById("notes-wall");if(!notes.length){w.innerHTML=`<p class="empty">No notes yet.</p>`;return;}w.innerHTML=notes.map(noteCardHTML).join("");}
  function renderNotesPreview(notes){const p=document.getElementById("home-notes-preview");const r=notes.slice(0,2);if(!r.length){p.innerHTML=`<p class="empty">No notes yet.</p>`;return;}p.innerHTML=r.map(noteCardHTML).join("");}
  window.deleteNote=function(key){
    if(!key)return;
    if(db&&dbRemove)dbRemove(dbRef(db,`couples/${coupleId}/notes/${key}`));
    else{localNotes=localNotes.filter(n=>n._key!==key);renderNotes(localNotes);renderNotesPreview(localNotes);}
  };

  window.reactToNote=function(key){
    if(!key||!ME)return;
    const reactionKey=`couples/${coupleId}/notes/${key}/reactions/${myUid}`;
    if(db&&fbOnValue){
      fbOnValue(dbRef(db,reactionKey),snap=>{
        if(snap.val()){dbRemove(dbRef(db,reactionKey));}
        else{dbSet(dbRef(db,reactionKey),true);}
      },{onlyOnce:true});
    }
  };

  window.submitNote=function(){const text=document.getElementById("note-input").value.trim();if(!text||!ME)return;const note={text,author:ME,time:Date.now()};if(db&&dbPush){dbPush(dbRef(db,`couples/${coupleId}/notes`),note);}else{localNotes.unshift(note);renderNotes(localNotes);renderNotesPreview(localNotes);}document.getElementById("note-input").value="";};

  // Milestones
  const DOT_COLORS=["gold","b","a","b","a","gold"];
  const TAG_CLS={moment:"a",memory:"b",first:"gold",milestone:"b",future:""};
  const TAG_ICONS={first:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e8622a" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4" fill="rgba(232,98,42,0.15)"/><path d="M9 12l-2 9 5-3 5 3-2-9"/></svg>`,moment:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e8622a" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/><circle cx="12" cy="12" r="4"/></svg>`,memory:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e8622a" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3"/><path d="M7 6V5a1 1 0 011-1h2M14 5a1 1 0 011 1v1"/><circle cx="17" cy="9" r="1" fill="#e8622a"/></svg>`,milestone:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e8622a" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>`,future:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e8622a" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16l-7-13-7 13"/><path d="M3 12h18"/><path d="M7 16l1 5h8l1-5"/></svg>`};
  let editingKey=null;
  let editingOriginalAuthor=null;
  function fmtMDate(s){if(!s)return"";const d=new Date(s+"T12:00:00"),p=n=>String(n).padStart(2,"0");return`${p(d.getDate())}.${p(d.getMonth()+1)}.${String(d.getFullYear()).slice(2)}`;}
  function fmtMDateRange(s,e){if(!e||e===s)return fmtMDate(s);return`${fmtMDate(s)} – ${fmtMDate(e)}`;}
  function _esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}

  // Milestone data registry — keyed by Firebase _key
  // Lets onclick handlers look up URL/position/title without embedding them in HTML attributes
  const _msRegistry = new Map();

  function renderMilestones(items){
    const tl=document.getElementById("milestone-timeline");
    const counter=document.getElementById("milestone-counter");
    const tlEnd=document.getElementById("timeline-end");
    if(!items.length){tl.innerHTML=`<p class="empty">No milestones yet. Add your first one!</p>`;if(counter)counter.innerHTML=`You have <span>0</span> milestones together`;if(tlEnd)tlEnd.style.display="none";return;}
    items.sort((a,b)=>new Date(a.date)-new Date(b.date));
    if(counter)counter.innerHTML=`You have <span>${items.length}</span> milestone${items.length!==1?"s":""} together`;
    let ci=0;
    if(tlEnd)tlEnd.style.display="flex";
    // Store items in registry so onclick handlers can retrieve URL/position safely
    _msRegistry.clear();
    items.forEach(item=>{ if(item._key) _msRegistry.set(item._key, item); });
    tl.innerHTML=items.map(item=>{
      const isFuture=new Date(item.date)>new Date();
      const dc=isFuture?"future":DOT_COLORS[ci++%DOT_COLORS.length];
      const tc=TAG_CLS[item.tag]||"";
      const icon=TAG_ICONS[item.tag]||"";
      const dateStr=fmtMDateRange(item.date,item.endDate);
      const k=_esc(item._key||"");
      const locationHTML=item.location?`<p class="m-location"><svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M8 1a5 5 0 015 5c0 3.5-5 9-5 9S3 9.5 3 6a5 5 0 015-5z"/><circle cx="8" cy="6" r="1.8"/></svg>${_esc(item.locationDisplay||item.location)}</p>`:"";
      // Photo actions use registry keys — no URLs in onclick attributes
      const photoHTML=item.photoURL
        ?`<div class="m-photo-wrap" onclick="_msViewPhoto('${k}')"><img src="${_esc(item.photoURL)}" alt="" style="object-position:${_esc(item.photoPosition||'center center')}"/><div class="m-photo-actions"><button class="m-photo-action-btn" onclick="event.stopPropagation();_msReposition('${k}')">Reposition</button><button class="m-photo-action-btn" onclick="event.stopPropagation();removeMilestonePhoto('${k}')">Remove</button></div></div>`
        :(item._key?`<button class="m-add-photo-btn" onclick="triggerPhotoUploadFor('${k}')"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3"/><path d="M7 6V5a1 1 0 011-1h2M14 5a1 1 0 011 1v1"/></svg>Add photo</button>`:"");
      return`<div class="milestone"><div class="m-dot ${dc}"></div><div class="m-card${isFuture?" future-card":""}">${photoHTML}<div class="m-top"><p class="m-title"><span class="m-icon">${icon}</span>${_esc(item.title)}</p><span class="m-date-range">${dateStr}</span></div>${item.note?`<p class="m-note">${_esc(item.note)}</p>`:""}${locationHTML}<div class="m-footer">${item.tag?`<span class="m-tag ${tc}">${_esc(item.tag)}</span>`:"<span></span>"}<div style="display:flex;align-items:center;gap:.4rem;"><span class="m-author">${_esc(item.addedBy||"")}</span>${item._key?`<button class="m-edit" onclick="editMilestone('${k}')" title="Edit">✎</button><button class="m-delete" onclick="deleteMilestone('${k}')" title="Delete">✕</button>`:""}</div></div></div></div>`;
    }).join("");
  }

  // Registry-based photo helpers — safe, no URL-in-attr corruption
  window._msViewPhoto = function(key){
    const item = _msRegistry.get(key);
    if(item?.photoURL) viewMilestonePhoto(item.photoURL);
  };
  window._msReposition = function(key){
    const item = _msRegistry.get(key);
    if(item) openRepositionModal(key, item.photoURL, item.title||'', item.photoPosition||'center center');
  };
  window.cancelMilestoneEdit=function(){
    editingKey=null;
    editingOriginalAuthor=null;
    pendingPhotoFile=null;
    pendingPhotoPosition="50% 50%";
    const pbtn=document.getElementById("m-photo-btn");
    const plbl=document.getElementById("m-photo-btn-label");
    if(pbtn)pbtn.classList.remove("has-photo");
    if(plbl)plbl.textContent="Add photo";
    document.getElementById("m-title-input").value="";
    document.getElementById("m-note-input").value="";
    document.getElementById("m-date-input").value="";
    document.getElementById("m-enddate-input").value="";
    document.getElementById("m-location-input").value="";
    document.getElementById("m-tag-input").value="moment";
    document.getElementById("m-save-btn").textContent="Save";
    // Reset label to Discard for next new milestone
    const cancelBtnReset=document.getElementById("m-cancel-btn");if(cancelBtnReset)cancelBtnReset.textContent="Discard";
    document.getElementById("add-milestone-form").classList.remove("open");
  };

  window.selectMilestoneTag=function(val){
    document.getElementById("m-tag-input").value=val;
    document.querySelectorAll(".m-tag-pill").forEach(p=>{
      p.classList.toggle("active", p.dataset.val===val);
    });
  };
  window.toggleAddForm=function(){
    editingKey=null;
    editingOriginalAuthor=null;
    const f=document.getElementById("add-milestone-form");
    f.classList.toggle("open");
    if(f.classList.contains("open")){
      const cb=document.getElementById("m-cancel-btn");
      if(cb)cb.textContent="Discard";
      document.getElementById("m-title-input").value="";
      document.getElementById("m-note-input").value="";
      document.getElementById("m-date-input").value=_localDateStr(new Date());
      document.getElementById("m-enddate-input").value="";
      document.getElementById("m-tag-input").value="moment";
      document.getElementById("m-location-input").value="";
      document.getElementById("m-save-btn").textContent="Save";
      document.getElementById("m-title-input").focus();
    }
  };
  window.editMilestone=function(key){
    function loadIntoForm(item){
      editingKey=key;
      editingOriginalAuthor=item.addedBy||null;
      const cancelBtn=document.getElementById("m-cancel-btn");
      if(cancelBtn){cancelBtn.textContent="Cancel";cancelBtn.style.display="inline-block";}
      const f=document.getElementById("add-milestone-form");
      f.classList.add("open");
      document.getElementById("m-title-input").value=item.title||"";
      document.getElementById("m-note-input").value=item.note||"";
      document.getElementById("m-date-input").value=item.date||"";
      document.getElementById("m-enddate-input").value=item.endDate||"";
      document.getElementById("m-tag-input").value=item.tag||"moment";
      if(window.selectMilestoneTag)window.selectMilestoneTag(item.tag||"moment");
      document.getElementById("m-location-input").value=item.location||"";
      document.getElementById("m-save-btn").textContent="Update";
      // Reflect existing photo state in the photo button
      const pbtn=document.getElementById("m-photo-btn");
      const plbl=document.getElementById("m-photo-btn-label");
      if(item.photoURL){
        if(pbtn)pbtn.classList.add("has-photo");
        if(plbl)plbl.textContent="Photo ✓";
      } else {
        if(pbtn)pbtn.classList.remove("has-photo");
        if(plbl)plbl.textContent="Add photo";
      }
      pendingPhotoFile=null;
      pendingPhotoPosition=item.photoPosition||"50% 50%";
      document.getElementById("m-title-input").focus();
      f.scrollIntoView({behavior:"smooth",block:"nearest"});
    }
    if(db&&fbOnValue){
      fbOnValue(dbRef(db,`couples/${coupleId}/milestones/${key}`),snap=>{
        const item=snap.val();
        if(item)loadIntoForm(item);
      },{onlyOnce:true});
    } else {
      const item=localMilestones.find(m=>m._key===key);
      if(item)loadIntoForm(item);
    }
  };
  async function geocodeLocation(locationStr){
    if(!locationStr)return{lat:null,lng:null};
    try{
      const ac=new AbortController();
      const t=setTimeout(()=>ac.abort(),6000);
      const r=await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locationStr)}&format=json&limit=1&addressdetails=1`,{signal:ac.signal,headers:{'User-Agent':'Snug-App/1.0'}});
      clearTimeout(t);
      const j=await r.json();
      if(j&&j.length>0){
        const item=j[0];
        const addr=item.address||{};
        const countryCode=(addr.country_code||"").toUpperCase();
        const country=addr.country||countryCode||"";
        // Use city/town + country for clean display name
        const city=addr.city||addr.town||addr.village||addr.county||addr.state||item.display_name.split(",")[0];
        const displayName=country?`${city.trim()}, ${country}`:`${city.trim()}`;
        return{lat:parseFloat(item.lat),lng:parseFloat(item.lon),displayName,countryCode,country};
      }
    }catch(e){console.warn("Geocode failed",e);}
    return{lat:null,lng:null,displayName:locationStr,countryCode:"",country:""};
  }

  window.saveMilestone=async function(){
    const title=document.getElementById("m-title-input").value.trim();
    const note=document.getElementById("m-note-input").value.trim();
    const date=document.getElementById("m-date-input").value;
    const endDate=document.getElementById("m-enddate-input").value;
    const tag=document.getElementById("m-tag-input").value;
    const locationStr=document.getElementById("m-location-input").value.trim();
    if(!title||!date)return;
    const btn=document.getElementById("m-save-btn");
    if(btn.disabled) return; // prevent double-tap
    btn.textContent="Saving…";
    btn.disabled=true;
    try{
    const m={title,note,date,tag,addedBy:editingKey?(editingOriginalAuthor||ME):ME,time:Date.now()};
    if(endDate&&endDate!==date)m.endDate=endDate;
    if(locationStr){
      const geo=await geocodeLocation(locationStr);
      m.location=locationStr;
      if(geo.lat)m.lat=geo.lat;
      if(geo.lng)m.lng=geo.lng;
      if(geo.displayName)m.locationDisplay=geo.displayName;
      if(geo.countryCode)m.countryCode=geo.countryCode;
      if(geo.country)m.country=geo.country;
    }
    if(editingKey){
      // If new photo selected, delete old photo from Storage using local cache — avoids race with RTDB write
      if(pendingPhotoFile){
        const cachedMs = localMilestones.find(x=>x._key===editingKey);
        const oldPath = cachedMs?.photoPath||null;
        if(oldPath && storage && fbStorageRef && fbDeleteObject){
          try{ await fbDeleteObject(fbStorageRef(storage, oldPath)); }
          catch(e){ console.warn("Old photo delete failed:", e); }
        }
      }
      const currentEditKey = editingKey;
      // Preserve existing photo fields — only overwrite if a new photo is being uploaded
      const existingMilestone = localMilestones.find(x=>x._key===currentEditKey)||{};
      const mToSave = {...m};
      if(!pendingPhotoFile){
        if(existingMilestone.photoURL) mToSave.photoURL = existingMilestone.photoURL;
        if(existingMilestone.photoPath) mToSave.photoPath = existingMilestone.photoPath;
        if(existingMilestone.photoPosition) mToSave.photoPosition = existingMilestone.photoPosition;
      }
      // If a new photo is selected, upload it first so the milestone write includes photoURL
      if(pendingPhotoFile && currentEditKey && storage){
        try{
          const file = pendingPhotoFile;
          const pos = pendingPhotoPosition;
          const baseName = (file.name||file._name||"photo").replace(/\.[^.]+$/, "").replace(/[^a-z0-9]/gi,"_").substring(0,40) || "photo";
          const path = `milestones/${currentEditKey}/${Date.now()}_${baseName}.jpg`;
          btn.textContent = "Uploading…";
          const compressed = await compressImage(file, 1200);
          const uploadData = (compressed instanceof Blob) ? compressed : new Blob([compressed], {type:"image/jpeg"});
          const editStorageRef = fbStorageRef(storage, path);
          await Promise.race([
            fbUploadBytes(editStorageRef, uploadData, {contentType:"image/jpeg"}),
            new Promise((_,rej)=>setTimeout(()=>rej(new Error("Upload timeout")),30000))
          ]);
          const editUrl = await fbGetDownloadURL(editStorageRef);
          mToSave.photoURL = editUrl;
          mToSave.photoPath = path;
          if(pos && pos !== "50% 50%") mToSave.photoPosition = pos;
          // Update registry immediately
          const regItem = _msRegistry.get(currentEditKey)||{};
          _msRegistry.set(currentEditKey, {...regItem, _key:currentEditKey, photoURL:editUrl, photoPath:path, photoPosition:pos||'center center'});
        }catch(editUploadErr){
          console.error("Photo upload failed during edit:", editUploadErr);
          // Keep existing photo fields — don't overwrite with nothing
          if(existingMilestone.photoURL) mToSave.photoURL = existingMilestone.photoURL;
          if(existingMilestone.photoPath) mToSave.photoPath = existingMilestone.photoPath;
          if(existingMilestone.photoPosition) mToSave.photoPosition = existingMilestone.photoPosition;
        }
        btn.textContent = "Saving…";
        pendingPhotoFile=null;
        pendingPhotoPosition="50% 50%";
        const pbtn=document.getElementById("m-photo-btn");
        const plbl=document.getElementById("m-photo-btn-label");
        if(pbtn)pbtn.classList.remove("has-photo");
        if(plbl)plbl.textContent="Add photo";
      }
      // Single awaited write — milestone saved with photo already included
      if(db&&dbSet) await dbSet(dbRef(db,`couples/${coupleId}/milestones/${currentEditKey}`),mToSave);
      else{const idx=localMilestones.findIndex(x=>x._key===currentEditKey);if(idx>-1)localMilestones[idx]={...mToSave,_key:currentEditKey};renderMilestones([...localMilestones]);}
      editingKey=null;
    } else {
      // Push the milestone FIRST — it appears immediately for both users.
      // Then upload the photo and patch it in with a single dbUpdate.
      // This avoids any hang blocking the milestone from appearing.
      let finalKey = null;
      if(db&&dbPush){const newRef=await dbPush(dbRef(db,`couples/${coupleId}/milestones`),m);finalKey=newRef.key;}
      else{finalKey=Date.now().toString();localMilestones.push({...m,_key:finalKey});renderMilestones([...localMilestones]);}

      if(pendingPhotoFile && finalKey && storage){
        const file = pendingPhotoFile;
        const pos = pendingPhotoPosition;
        pendingPhotoFile = null;
        pendingPhotoPosition = "50% 50%";
        const pbtn=document.getElementById("m-photo-btn");
        const plbl=document.getElementById("m-photo-btn-label");
        if(pbtn)pbtn.classList.remove("has-photo");
        if(plbl)plbl.textContent="Add photo";

        // Compress image NOW, in the active foreground context of saveMilestone.
        // Android Chrome throttles FileReader/canvas in background tasks after
        // a layout change (form collapse). Doing compression here guarantees
        // the FileReader fires while the execution context is still active.
        let compressedData = null;
        try{
          const raw = await compressImage(file, 1200);
          compressedData = (raw instanceof Blob) ? raw : new Blob([raw], {type:"image/jpeg"});
        }catch(compErr){
          compressedData = (file instanceof Blob) ? file : new Blob([file], {type:"image/jpeg"});
        }

        // Now launch the background IIFE — only network I/O remains, never throttled
        const capturedKey = finalKey;
        const capturedPos = pos;
        const capturedBlob = compressedData;
        ;(async()=>{
          try{
            const baseName = (file.name||file._name||"photo").replace(/\.[^.]+$/, "").replace(/[^a-z0-9]/gi,"_").substring(0,40) || "photo";
            const path = `milestones/${capturedKey}/${Date.now()}_${baseName}.jpg`;
            const photoRef = fbStorageRef(storage, path);
            await Promise.race([
              fbUploadBytes(photoRef, capturedBlob, {contentType:"image/jpeg"}),
              new Promise((_,rej)=>setTimeout(()=>rej(new Error("Upload timeout")),60000))
            ]);
            const url = await fbGetDownloadURL(photoRef);
            // Single dbUpdate — one listener fire, photo appears atomically
            const photoUpdate = {};
            photoUpdate[`couples/${coupleId}/milestones/${capturedKey}/photoURL`] = url;
            photoUpdate[`couples/${coupleId}/milestones/${capturedKey}/photoPath`] = path;
            if(capturedPos && capturedPos !== "50% 50%") photoUpdate[`couples/${coupleId}/milestones/${capturedKey}/photoPosition`] = capturedPos;
            await dbUpdate(dbRef(db), photoUpdate);
            // Update registry so view/reposition works immediately
            const regItem = _msRegistry.get(capturedKey)||{};
            _msRegistry.set(capturedKey, {...regItem, _key:capturedKey, photoURL:url, photoPath:path, photoPosition:capturedPos||'center center'});
          }catch(photoErr){
            console.error("Background photo upload failed:", photoErr);
            // Milestone already saved — user can add photo later via the card
          }
        })();
      } else {
        pendingPhotoFile=null;
        pendingPhotoPosition="50% 50%";
        const pbtn=document.getElementById("m-photo-btn");
        const plbl=document.getElementById("m-photo-btn-label");
        if(pbtn)pbtn.classList.remove("has-photo");
        if(plbl)plbl.textContent="Add photo";
      }
    }
    document.getElementById("m-title-input").value="";
    document.getElementById("m-note-input").value="";
    document.getElementById("m-enddate-input").value="";
    document.getElementById("m-location-input").value="";
    document.getElementById("add-milestone-form").classList.remove("open");
    }catch(saveErr){
      console.error("saveMilestone failed:", saveErr);
    }finally{
      btn.textContent="Save";
      btn.disabled=false;
    }
  };
  window.deleteMilestone=async function(key){
    // Read photoPath from local cache — avoids race between async Firebase read and immediate RTDB delete
    const cached = localMilestones.find(m=>m._key===key);
    const photoPath = cached?.photoPath||null;
    // Delete photo from Storage if exists
    if(photoPath && storage && fbStorageRef && fbDeleteObject){
      try{ await fbDeleteObject(fbStorageRef(storage, photoPath)); }
      catch(e){ console.warn("Storage delete failed:", e); }
    }
    // Delete milestone from database
    if(db&&dbRemove)dbRemove(dbRef(db,`couples/${coupleId}/milestones/${key}`));
    else{localMilestones=localMilestones.filter(m=>m._key!==key);renderMilestones([...localMilestones]);}
  };

  // Meetup
  function updateCdCaption(date){if(!date)return;const s=date.toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"});const cdCap=document.getElementById("cd-caption");if(cdCap)cdCap.textContent=s;}
  window.updateMeetupDate=function(val){
    if(!val){meetupDate=null;startCountdown();return;}
    const newDate=new Date(val+"T00:00:00");
    const now=new Date();
    const maxDate=new Date(now.getFullYear()+2,now.getMonth(),now.getDate());

    // Fix 2: reject past dates
    if(newDate<=now){
      const input=document.getElementById("meetup-date-input");
      if(input){
        // Reset to previous valid date or clear
        input.value=meetupDate&&meetupDate>now?_localDateStr(meetupDate):"";
        input.style.borderColor="#e8622a";
        setTimeout(()=>input.style.borderColor="",2000);
      }
      return;
    }

    // Fix 6: reject dates more than 2 years away
    if(newDate>maxDate){
      const input=document.getElementById("meetup-date-input");
      if(input){
        input.value=meetupDate&&meetupDate>now?_localDateStr(meetupDate):"";
        input.style.borderColor="#e8622a";
        setTimeout(()=>input.style.borderColor="",2000);
      }
      return;
    }

    // Set meetupDate with correct time immediately (not midnight)
    const timeEl2 = document.getElementById('meetup-time-input');
    const timeVal2 = (coupleType==='together' && timeEl2?.value) ? timeEl2.value : '00:00';
    meetupDate = new Date(`${val}T${timeVal2}:00`);
    startCountdown();
    if(db&&dbSet){
      dbSet(dbRef(db,`couples/${coupleId}/meetupDate`),`${val}T${timeVal2}:00`);
    }
    // Update date night planner visibility
    const dnPlanner = document.getElementById('dn-planner');
    if(dnPlanner && coupleType==='together'){
      dnPlanner.classList.add('visible');
      loadDnPlanner && loadDnPlanner();
    }

    // Fix 5: update unlockDate on unread letters to match new meetup date
    if(db&&fbOnValue&&dbSet){
      fbOnValue(dbRef(db,`couples/${coupleId}/letters`),snap=>{
        const data=snap.val();
        if(!data)return;
        Object.entries(data).forEach(([key,round])=>{
          // Only update if neither letter has been read yet
          const meKey=myUid;
          const otherKey=partnerUid;
          const meData=round[meKey]||{};
          const otherData=round[otherKey]||{};
          const neitherRead=!meData.readAt&&!otherData.readAt;
          if(neitherRead&&round.unlockDate){
            const unlockTime2 = (coupleType==='together' && _dnTimeVal) ? _dnTimeVal : '00:00';
            dbSet(dbRef(db,`couples/${coupleId}/letters/${key}/unlockDate`),val+`T${unlockTime2}:00`);
          }
        });
      },{onlyOnce:true});
    }
  };

  function checkMeetupDateInput(){
    const input=document.getElementById("meetup-date-input");
    if(!input)return;
    // Set min to tomorrow, max to 2 years from now
    const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);
    const maxD=new Date();maxD.setFullYear(maxD.getFullYear()+2);
    input.min=_localDateStr(tomorrow);
    input.max=_localDateStr(maxD);
    if(!meetupDate||meetupDate<=new Date()){
      input.value="";
      input.setAttribute("placeholder","Set next meetup");
      input.style.color="var(--muted)";
    } else {
      // Populate input with stored meetup date
      // Use local date to avoid UTC offset shifting the displayed date
      const _y=meetupDate.getFullYear(),_m=String(meetupDate.getMonth()+1).padStart(2,"0"),_d=String(meetupDate.getDate()).padStart(2,"0");
      input.value=`${_y}-${_m}-${_d}`;
      input.style.color="";
    }
  }

  // Countdown
  function startCountdown(){
    if(countdownInterval)clearInterval(countdownInterval);
    function tick(){
      if(!meetupDate){
        ["cd-d","cd-h","cd-m","cd-s"].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent="—";});
        const cc=document.getElementById("cd-caption");if(cc)cc.textContent=coupleType==='together'?'Set your next date night 🗓️':'Set your next meetup date 🗓️';
        // scd-caption removed (was sidebar)
        return;
      }
      const diff=meetupDate-Date.now();
      const isPast=diff<=0;
      // Main countdown on home page
      const cdCaption=document.getElementById("cd-caption");
      if(isPast){
        ["cd-d","cd-h","cd-m","cd-s"].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent="—";});
        if(cdCaption)cdCaption.textContent=coupleType==='together'?'Set your next date night 🗓️':'Set your next meetup date 🗓️';
        // Sidebar countdown
        // scd-* removed (was sidebar)
      } else {
        const d=Math.floor(diff/86400000),h=Math.floor((diff%86400000)/3600000),m=Math.floor((diff%3600000)/60000),s=Math.floor((diff%60000)/1000);
        ["cd-d","cd-h","cd-m","cd-s"].forEach((id,i)=>{
          const el=document.getElementById(id);
          if(el)el.textContent=[d,h,m,s][i];
        });
        if(cdCaption)cdCaption.textContent=meetupDate?meetupDate.toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"}):(coupleType==='together'?'Set your next date night 🗓️':'Set your next meetup date 🗓️');
      }
    }
    tick();
    countdownInterval=setInterval(tick,1000);
    // Update metric chip every 60s so day count stays in sync
    if(window._metricInterval) clearInterval(window._metricInterval);
    window._metricInterval = setInterval(()=>updateMetricChips&&updateMetricChips(), 5000);
  }

  // Greeting
  function greeting(name,tz){try{const h=parseInt(new Date().toLocaleTimeString("en-GB",{timeZone:tz,hour:"2-digit"}));const g=h<12?"Good morning":h<18?"Good afternoon":"Good evening";return`${g}, <em>${_esc(name)}</em>`;}catch(e){return`Good day, <em>${_esc(name)}</em>`;}}
  function fmtTime(tz){try{return new Date().toLocaleTimeString("en-GB",{timeZone:tz,hour:"2-digit",minute:"2-digit",second:"2-digit"});}catch(e){return new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",second:"2-digit"});}}
  function fmtDate(tz){try{return new Date().toLocaleDateString("en-GB",{timeZone:tz,weekday:"long",day:"numeric",month:"long"});}catch(e){return new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"});}}

  // Distance between two coords (Haversine)
  function calcDistance(lat1,lon1,lat2,lon2){
    const R=6371,dLat=(lat2-lat1)*Math.PI/180,dLon=(lon2-lon1)*Math.PI/180;
    const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return Math.round(R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)));
  }

  function updateDistanceAndSleep(){
    // Distance
    if(myCoords&&otherCoords&&(myCoords[0]||myCoords[1])&&(otherCoords[0]||otherCoords[1])){
      const km=calcDistance(myCoords[0],myCoords[1],otherCoords[0],otherCoords[1]);
      const el=document.getElementById("distance-apart");
      if(el)el.textContent=km.toLocaleString("en-GB");
      // Update city names in flight strip
      const ca=document.getElementById("home-dist-city-a");
      const cb=document.getElementById("home-dist-city-b");
      if(ca&&myCoords)ca.textContent=myCity||"Here";
      if(cb&&otherCoords)cb.textContent=otherCity||"There";
    }
    // Sleep indicators
    function sleepStatus(name,tz){
      const h=parseInt(new Date().toLocaleTimeString("en-GB",{timeZone:tz,hour:"2-digit"}));
      const isAsleep=h>=23||h<7;
      const isMorning=h>=7&&h<9;
      const icon=isAsleep?"🌙":isMorning?"🌅":"☀️";
      const status=isAsleep?"probably asleep":isMorning?"just waking up":"awake";
      return`${icon} ${name} is ${status}`;
    }
    const myEl=document.getElementById("sleep-my");
    const otherEl=document.getElementById("sleep-other");
    if(myEl)myEl.textContent=sleepStatus(ME,myTz);
    // Only show partner sleep status if we have their actual timezone
    if(otherEl)otherEl.textContent=otherTz?sleepStatus(OTHER,otherTz):"";
  }

  // Bucket list
  const BL_ICONS={travel:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="13" rx="2"/><path d="M8 8V6a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>`,food:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12c0 4 3.58 7 8 7s8-3 8-7H4z"/><path d="M4 12h16"/><path d="M7 5l3 7M14 3l3 9"/></svg>`,adventure:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20l6-10 4 6 3-4 5 8H3z"/><path d="M17 8a2 2 0 100-4 2 2 0 000 4z"/></svg>`,together:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21C12 21 3 15 3 9a5 5 0 0110 0 5 5 0 0110 0c0 6-9 12-9 12z"/></svg>`,others:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 3"/></svg>`};
  let localNotes=[];
  let localMilestones=[];
  let localBucket=[];
  let unsubNotes=null,unsubMilestones=null,unsubBucket=null,unsubPulse=null;
  // Map and interval vars — must be declared at module level for strict mode
  let mapInstance=null,myMarker=null,otherMarker=null,connectLine=null;
  let countdownInterval=null,distanceInterval=null,clockInterval=null,pulseTimeInterval=null;
  let placesMapInstance=null,meetupDate=null;
  let blFilter="all";
  let blEditKey=null;

  function renderBucket(items){
    const done=items.filter(i=>i.done);
    const todo=items.filter(i=>!i.done);
    const total=items.length;
    const doneCount=done.length;
    const pct=total?Math.round(doneCount/total*100):0;

    document.getElementById("bl-done-count").textContent=doneCount;
    document.getElementById("bl-total-count").textContent=total;
    document.getElementById("bl-percent").textContent=pct+"%";
    document.getElementById("bl-progress-fill").style.width=pct+"%";

    const filtered=cat=>blFilter==="all"?cat:cat.filter(i=>i.category===blFilter);
    const todoFiltered=filtered(todo);
    const doneFiltered=filtered(done);

    const todoEl=document.getElementById("bl-todo-list");
    const doneEl=document.getElementById("bl-done-list");
    const doneSep=document.getElementById("bl-done-sep");

    todoEl.innerHTML=todoFiltered.length?todoFiltered.map(blItemHTML).join(""):`<p class="empty">No dreams here yet!</p>`;
    doneEl.innerHTML=doneFiltered.map(blItemHTML).join("");
    doneSep.style.display=doneFiltered.length?"flex":"none";
  }

  function blItemHTML(item){
    const icon=BL_ICONS[item.category]||BL_ICONS.others;
    const k=_esc(item._key||"");
    return`<div class="bl-item${item.done?" done":""}" id="bli-${k}">
      <div class="bl-check${item.done?" checked":""}" onclick="toggleBucketDone('${k}')">${item.done?'<div class="bl-check-mark"></div>':""}</div>
      <div class="bl-item-icon">${icon}</div>
      <div class="bl-item-body">
        <p class="bl-item-title">${_esc(item.title)}</p>
        <div class="bl-item-meta">
          <span class="bl-item-cat">${_esc(item.category||"")}</span>
          <span class="bl-item-who">Added by ${_esc(item.addedBy||"")}</span>
          ${item.done&&item.completedAt?`<span class="bl-item-who">· ${fmtTs(item.completedAt)}</span>`:""}
        </div>
      </div>
      <div class="bl-item-actions">
        ${!item.done?`<button class="bl-item-btn" onclick="editBucketItem('${k}')" title="Edit">✎</button>`:""}
        <button class="bl-item-btn" onclick="deleteBucketItem('${k}')" title="Delete" style="color:var(--muted)">✕</button>
      </div>
    </div>`;
  }

  window.filterBucket=function(cat){
    blFilter=cat;
    document.querySelectorAll(".bl-cat-pill").forEach(p=>p.classList.remove("active"));
    const el=document.getElementById(`bl-filter-${cat}`);
    if(el)el.classList.add("active");
    if(db&&fbOnValue){
      fbOnValue(dbRef(db,`couples/${coupleId}/bucket`),snap=>{
        const d=snap.val();
        renderBucket(d?Object.entries(d).map(([k,v])=>({...v,_key:k})):[]); updateHomeBucketProgress(); updateMomentsSubtitles();
      },{onlyOnce:true});
    } else renderBucket([...localBucket]);
  };

  window.toggleBucketForm=function(){
    blEditKey=null;
    const f=document.getElementById("bl-add-form");
    f.classList.toggle("open");
    if(f.classList.contains("open")){
      document.getElementById("bl-title-input").value="";
      document.getElementById("bl-cat-input").value="travel";
      document.getElementById("bl-save-btn").textContent="Add";
      document.getElementById("bl-title-input").focus();
    }
  };

  window.saveBucketItem=function(){
    const title=document.getElementById("bl-title-input").value.trim();
    const category=document.getElementById("bl-cat-input").value;
    if(!title)return;
    if(blEditKey){
      const existingItem=localBucket.find(x=>x._key===blEditKey);
      const preserveDone=existingItem?.done||false;
      const preserveCompletedAt=existingItem?.completedAt||null;
      if(db&&dbSet)dbSet(dbRef(db,`couples/${coupleId}/bucket/${blEditKey}`),{title,category,addedBy:existingItem?.addedBy||ME,done:preserveDone,completedAt:preserveCompletedAt,time:existingItem?.time||Date.now()});
      else{const idx=localBucket.findIndex(x=>x._key===blEditKey);if(idx>-1){localBucket[idx].title=title;localBucket[idx].category=category;}renderBucket([...localBucket]);}
      blEditKey=null;
    } else {
      const item={title,category,addedBy:ME,done:false,time:Date.now()};
      if(db&&dbPush)dbPush(dbRef(db,`couples/${coupleId}/bucket`),item);
      else{localBucket.push({...item,_key:Date.now().toString()});renderBucket([...localBucket]);}
    }
    document.getElementById("bl-title-input").value="";
    document.getElementById("bl-add-form").classList.remove("open");
    document.getElementById("bl-save-btn").textContent="Add";
  };

  window.toggleBucketDone=function(key){
    if(db&&fbOnValue){
      fbOnValue(dbRef(db,`couples/${coupleId}/bucket/${key}`),snap=>{
        const item=snap.val();if(!item)return;
        const newDone=!item.done;
        dbSet(dbRef(db,`couples/${coupleId}/bucket/${key}`),{...item,done:newDone,completedAt:newDone?Date.now():null});
      },{onlyOnce:true});
    } else {
      const item=localBucket.find(x=>x._key===key);
      if(item){item.done=!item.done;item.completedAt=item.done?Date.now():null;}
      renderBucket([...localBucket]);
    }
  };

  window.editBucketItem=function(key){
    if(db&&fbOnValue){
      fbOnValue(dbRef(db,`couples/${coupleId}/bucket/${key}`),snap=>{
        const item=snap.val();if(!item)return;
        blEditKey=key;
        const f=document.getElementById("bl-add-form");
        f.classList.add("open");
        document.getElementById("bl-title-input").value=item.title||"";
        document.getElementById("bl-cat-input").value=item.category||"travel";
        document.getElementById("bl-save-btn").textContent="Update";
        document.getElementById("bl-title-input").focus();
        f.scrollIntoView({behavior:"smooth",block:"nearest"});
      },{onlyOnce:true});
    } else {
      const item=localBucket.find(x=>x._key===key);if(!item)return;
      blEditKey=key;
      const f=document.getElementById("bl-add-form");f.classList.add("open");
      document.getElementById("bl-title-input").value=item.title||"";
      document.getElementById("bl-cat-input").value=item.category||"travel";
      document.getElementById("bl-save-btn").textContent="Update";
    }
  };

  window.deleteBucketItem=function(key){
    if(db&&dbRemove)dbRemove(dbRef(db,`couples/${coupleId}/bucket/${key}`));
    else{localBucket=localBucket.filter(x=>x._key!==key);renderBucket([...localBucket]);}
  };

  // Places we've been
  const TAG_ICONS_PLACES = {first:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e8622a" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4" fill="rgba(232,98,42,0.15)"/><path d="M9 12l-2 9 5-3 5 3-2-9"/></svg>`,moment:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e8622a" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/><circle cx="12" cy="12" r="4"/></svg>`,memory:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e8622a" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3"/><path d="M7 6V5a1 1 0 011-1h2M14 5a1 1 0 011 1v1"/><circle cx="17" cy="9" r="1" fill="#e8622a"/></svg>`,milestone:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e8622a" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>`,future:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e8622a" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16l-7-13-7 13"/><path d="M3 12h18"/><path d="M7 16l1 5h8l1-5"/></svg>`};

  function buildPlaces(milestones){
    // Filter only milestones with lat/lng
    const located = milestones.filter(m => m.lat && m.lng);

    // Update stats
    const placesCountEl = document.getElementById("places-count");
    const countriesCountEl = document.getElementById("countries-count");
    const memoriesCountEl = document.getElementById("places-memories-count");
    const emptyEl = document.getElementById("places-empty");
    const chipsLabel = document.getElementById("places-chips-label");

    if(!located.length){
      if(placesCountEl) placesCountEl.textContent = "0";
      if(countriesCountEl) countriesCountEl.textContent = "0";
      if(memoriesCountEl) memoriesCountEl.textContent = "0";
      if(emptyEl) emptyEl.style.display = "block";
      if(chipsLabel) chipsLabel.style.display = "none";
      return;
    }

    if(emptyEl) emptyEl.style.display = "none";
    if(chipsLabel) chipsLabel.style.display = "block";
    if(memoriesCountEl) memoriesCountEl.textContent = located.length;

    // Group by location (round to 2 decimal places ~1km)
    const groups = {};
    located.forEach(m => {
      const key = `${Math.round(m.lat*100)/100},${Math.round(m.lng*100)/100}`;
      if(!groups[key]) groups[key] = {lat:m.lat, lng:m.lng, name:m.locationDisplay||m.location, items:[]};
      groups[key].items.push(m);
    });

    const groupArr = Object.values(groups);
    if(placesCountEl) placesCountEl.textContent = groupArr.length;

    // Count unique countries using ISO country code (reliable)
    const countries = new Set(
      groupArr.flatMap(g => g.items.map(i => i.countryCode||i.country||(i.locationDisplay||i.location||"").split(",").pop().trim()))
               .filter(Boolean)
    );
    if(countriesCountEl) countriesCountEl.textContent = countries.size||groupArr.length;

    // Build map
    buildPlacesMap(groupArr);

    // Build chips
    const chipsEl = document.getElementById("places-chips");
    if(chipsEl){
      chipsEl.innerHTML = groupArr.map(g =>
        `<div class="places-chip${g.items.length>1?' multi':''}" onclick="showPlacesPopup(${JSON.stringify(g.lat)},${JSON.stringify(g.lng)})">
          <div class="places-chip-dot${g.items.length>1?' multi':''}"></div>
          <span class="places-chip-name">${g.name||"Unknown"}</span>
          <span class="places-chip-count">${g.items.length}</span>
        </div>`
      ).join("");
    }
  }

  function buildPlacesMap(groups){
    if(placesMapInstance){ placesMapInstance.remove(); placesMapInstance = null; }

    const el = document.getElementById("places-map");
    if(!el) return;

    // Center map on midpoint of all pins
    const lats = groups.map(g=>g.lat), lngs = groups.map(g=>g.lng);
    const centerLat = (Math.min(...lats)+Math.max(...lats))/2;
    const centerLng = (Math.min(...lngs)+Math.max(...lngs))/2;

    placesMapInstance = L.map("places-map", {zoomControl:true, attributionControl:true, minZoom:2, worldCopyJump:false})
      .setView([centerLat, centerLng], 2);

    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution:"© OpenStreetMap", subdomains:"abcd", maxZoom:18
    }).addTo(placesMapInstance);

    // Draw pins
    groups.forEach(g => {
      const isMulti = g.items.length > 1;
      const color = "#e8622a";
      const size = isMulti ? 24 : 20;

      const badgeHTML = isMulti
        ? `<div style="position:absolute;top:-5px;right:-5px;background:white;border:1.5px solid ${color};border-radius:50%;width:16px;height:16px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;color:${color};font-family:'Plus Jakarta Sans',sans-serif;">${g.items.length}</div>`
        : "";

      // Heart SVG path scaled to size
      const heartPath = `M${size/2} ${size*0.88} S${size*0.07} ${size*0.58} ${size*0.07} ${size*0.33} a${size*0.22} ${size*0.22} 0 0 1 ${size*0.43} ${size*0.12} a${size*0.22} ${size*0.22} 0 0 1 ${size*0.43} -${size*0.12} c0 ${size*0.25} -${size*0.43} ${size*0.55} -${size*0.43} ${size*0.55}z`;

      const icon = L.divIcon({
        className: "",
        html: `<div style="position:relative;width:${size}px;height:${size}px;">
          <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M${size/2} ${size*0.9} C${size/2} ${size*0.9} ${size*0.06} ${size*0.58} ${size*0.06} ${size*0.33} a${size*0.22} ${size*0.22} 0 0 1 ${size*0.44} -${size*0.05} a${size*0.22} ${size*0.22} 0 0 1 ${size*0.44} ${size*0.05} C${size*0.94} ${size*0.58} ${size/2} ${size*0.9} ${size/2} ${size*0.9}z" fill="${color}"/>
          </svg>
          ${badgeHTML}
        </div>`,
        iconSize: [size+10, size+10],
        iconAnchor: [size/2+5, size*0.9+5]
      });

      const marker = L.marker([g.lat, g.lng], {icon})
        .addTo(placesMapInstance)
        .bindTooltip(g.name||"", {
          permanent: false,
          direction: "top",
          offset: [0, -10],
          className: "map-tooltip"
        });

      marker.on("click", () => showPlacesPopupData(g));
    });

    // Fit bounds
    if(groups.length > 1){
      placesMapInstance.fitBounds(
        L.latLngBounds(groups.map(g=>[g.lat,g.lng])).pad(0.3),
        {maxZoom:5}
      );
    } else if(groups.length===1){
      placesMapInstance.setView([groups[0].lat,groups[0].lng], 5);
    }
  }

  function showPlacesPopupData(group){
    const popup = document.getElementById("places-popup");
    const locName = document.getElementById("places-popup-loc-name");
    const countEl = document.getElementById("places-popup-count");
    const itemsEl = document.getElementById("places-popup-items");

    if(!popup) return;
    popup.style.display = "block";
    locName.textContent = group.name || "Unknown";
    countEl.textContent = `${group.items.length} milestone${group.items.length!==1?"s":""}`;

    const sorted = [...group.items].sort((a,b)=>new Date(a.date)-new Date(b.date));
    itemsEl.innerHTML = sorted.map(item => {
      const icon = TAG_ICONS_PLACES[item.tag]||TAG_ICONS_PLACES.moment;
      const tag = item.tag ? `<span class="m-tag" style="margin-left:auto;flex-shrink:0;">${_esc(item.tag)}</span>` : "";
      return `<div class="places-popup-item">
        <div class="places-popup-icon" style="display:flex;align-items:center;justify-content:center;">${icon}</div>
        <div class="places-popup-body" style="flex:1;min-width:0;">
          <p class="places-popup-title">${_esc(item.title)}</p>
          <p class="places-popup-date">${fmtMDate(item.date)}${item.endDate?` – ${fmtMDate(item.endDate)}`:""}</p>
        </div>
        ${tag}
      </div>`;
    }).join("");

    popup.scrollIntoView({behavior:"smooth", block:"nearest"});

    // Highlight selected chip
    document.querySelectorAll(".places-chip").forEach(c => c.classList.remove("active"));
  }

  window.showPlacesPopup = function(lat, lng){
    // Find group by lat/lng
    if(!window._placesGroups) return;
    const group = window._placesGroups.find(g =>
      Math.abs(g.lat-lat) < 0.02 && Math.abs(g.lng-lng) < 0.02
    );
    if(group) showPlacesPopupData(group);
  };

  // Called when Places page is shown — init/refresh map
  window._initPlacesPage = function(milestones){
    window._placesGroups = null;
    // Build groups first then store
    const located = milestones.filter(m=>m.lat&&m.lng);
    const groups = {};
    located.forEach(m=>{
      const key=`${Math.round(m.lat*100)/100},${Math.round(m.lng*100)/100}`;
      if(!groups[key]) groups[key]={lat:m.lat,lng:m.lng,name:m.locationDisplay||m.location,items:[]};
      groups[key].items.push(m);
    });
    window._placesGroups = Object.values(groups);
    buildPlaces(milestones);
  };

  // Pulse
  function fmtPulseTime(ts){
    if(!ts)return"";
    const diff=Date.now()-ts;
    const mins=Math.floor(diff/60000);
    const hrs=Math.floor(diff/3600000);
    const days=Math.floor(diff/86400000);
    if(mins<1)return"Just now";
    if(mins<60)return`${mins} minute${mins!==1?"s":""} ago`;
    if(hrs<24)return`${hrs} hour${hrs!==1?"s":""} ago`;
    return`${days} day${days!==1?"s":""} ago`;
  }

  function fmtPulseTs(ts){
    if(!ts)return"";
    const d=new Date(ts);
    const p=n=>String(n).padStart(2,"0");
    const today=new Date();
    const yesterday=new Date(today-86400000);
    const isToday=d.toDateString()===today.toDateString();
    const isYesterday=d.toDateString()===yesterday.toDateString();
    const timeStr=`${p(d.getHours())}:${p(d.getMinutes())}`;
    if(isToday)return`Today ${timeStr}`;
    if(isYesterday)return`Yesterday ${timeStr}`;
    return`${p(d.getDate())}.${p(d.getMonth()+1)} · ${timeStr}`;
  }

  function renderPulseHistory(pulses){
    const list=document.getElementById("pulse-history-list");
    const toggle=document.getElementById("pulse-history-toggle");
    if(!pulses||!pulses.length){
      if(toggle)toggle.style.display="none";
      return;
    }
    if(toggle)toggle.style.display="block";
    const recent=pulses.slice(0,6);
    list.innerHTML=recent.map(p=>{
      const isMe=p.from===myUid||p.from===ME;
      const dotClass=isMe?"":"other";
      const senderName=_esc(p.fromName||(isMe?ME:OTHER));
      const otherEsc=_esc(OTHER);
      const text=isMe
        ?`You were thinking of <strong>${otherEsc}</strong>`
        :`<strong>${senderName}</strong> was thinking of you`;
      return`<div class="pulse-history-item">
        <div class="pulse-history-dot ${dotClass}"></div>
        <span class="pulse-history-text">${text}</span>
        <span class="pulse-history-time">${fmtPulseTs(p.time)}</span>
      </div>`;
    }).join("");
  }

  function updateReceivedBanner(pulses){
    if(!pulses||!pulses.length)return;
    // Find latest pulse FROM the other person
    const latest=pulses.find(p=>p.from===partnerUid||p.from===OTHER);
    if(!latest)return;
    const banner=document.getElementById("pulse-received-now");
    const titleEl=document.getElementById("pulse-received-title");
    const timeEl=document.getElementById("pulse-received-time");
    if(banner){
      if(titleEl) titleEl.textContent=`${OTHER} was thinking of you`;
      if(timeEl) timeEl.textContent=fmtPulseTime(latest.time);
      banner.style.display="flex";
    }
  }

  function updateLastSent(pulses){
    if(!pulses||!pulses.length)return;
    const latest=pulses.find(p=>p.from===myUid||p.from===ME);
    if(!latest)return;
    const el=document.getElementById("pulse-last-sent");
    if(el){
      el.style.display="block";
      el.textContent=`Last · ${fmtPulseTs(latest.time)}`;
    }
  }

  let _lastPulseSent = 0;
  window.sendPulse=async function(){
    const now = Date.now();
    if(now - _lastPulseSent < 60000){
      const secs = Math.ceil((60000-(now-_lastPulseSent))/1000);
      return;
    }
    _lastPulseSent = now;
    if(!ME)return;
    const btn=document.getElementById("pulse-heart-btn-now");
    if(btn){btn.classList.add("sent");setTimeout(()=>btn.classList.remove("sent"),300);}
    const pulse={from:myUid,to:partnerUid,fromName:ME,time:Date.now()};
    if(db&&dbPush){
      try{
        await dbPush(dbRef(db,`couples/${coupleId}/pulses`),pulse);
      }catch(e){
        console.error('sendPulse failed:',e);
      }
    } else {
      const el=document.getElementById("pulse-last-sent");
      if(el){el.style.display="block";el.textContent="Last · Just now";}
    }
  };

  window.togglePulseHistory=function(){
    const list=document.getElementById("pulse-history-list");
    const toggle=document.getElementById("pulse-history-toggle");
    if(!list||!toggle)return;
    list.classList.toggle("open");
    toggle.textContent=list.classList.contains("open")?"Hide recent pulses ↑":"Show recent pulses ↓";
  };

  function initPulse(){
    // Set other name in send sub
    const sub=document.getElementById("pulse-other-name");
    if(sub)sub.textContent=OTHER;

    if(!db||!fbOnValue)return;
    if(unsubPulse)unsubPulse();
    unsubPulse=fbOnValue(dbRef(db,`couples/${coupleId}/pulses`),snap=>{
      const data=snap.val();
      if(!data)return;
      const pulses=Object.values(data).sort((a,b)=>b.time-a.time);
      updateReceivedBanner(pulses);
      updateLastSent(pulses);
      renderPulseHistory(pulses);
      // Update received time every minute
      if(pulseTimeInterval)clearInterval(pulseTimeInterval);
      pulseTimeInterval=setInterval(()=>{
        const latest=pulses.find(p=>p.from===partnerUid||p.from===OTHER);
        if(latest){
          const timeEl2=document.getElementById("pulse-received-time");
          if(timeEl2) timeEl2.textContent=fmtPulseTime(latest.time);
        }
      },60000);
    });
  }

  // Letter
  let currentLetterRoundId = null;
  let letterRounds = [];

  function isUnlocked(unlockDate){
    if(!unlockDate) return false;
    return new Date() >= new Date(unlockDate);
  }

  function renderLetterTimeline(rounds){
    const tl = document.getElementById("letter-timeline");
    const emptyEl = document.getElementById("letter-empty");
    if(!tl) return;

    if(!rounds||!rounds.length){
      tl.innerHTML = "";
      if(emptyEl) emptyEl.style.display = "none";
      renderCurrentRound(null);
      return;
    }
    if(emptyEl) emptyEl.style.display = "none";

    // Sort rounds by unlockDate descending (newest first)
    rounds.sort((a,b) => new Date(b.unlockDate) - new Date(a.unlockDate));
    letterRounds = rounds;

    // Check if today is unlock day for any round
    const unlockedToday = rounds.some(r => {
      const d = new Date(r.unlockDate);
      const today = new Date();
      return d.toDateString() === today.toDateString();
    });
    const banner = document.getElementById("letter-unlocked-banner");
    if(banner) banner.style.display = unlockedToday ? "block" : "none";

    tl.innerHTML = "";
    rounds.forEach((round, i) => {
      const unlocked = isUnlocked(round.unlockDate);
      const isActive = i === 0 && !unlocked;

      // Separator
      const sep = document.createElement("div");
      sep.className = "letter-meetup-sep";
      const d = new Date(round.unlockDate);
      const modeWord = coupleType==='together'?'Date night':'Meetup';
        const label = isActive ? `${modeWord} · ${d.toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}` : `${modeWord} · ${d.toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}`;
      sep.innerHTML = `<span class="letter-meetup-sep-label">${label}</span>`;
      tl.appendChild(sep);

      // Round card
      const card = document.createElement("div");
      card.className = `letter-round${isActive?" active-round":""}${unlocked?" ":""}`;
      if(!isActive) card.style.opacity = ".85";

      const badge = isActive
        ? `<span class="letter-round-badge active">Active · Writing phase</span>`
        : `<span class="letter-round-badge read">Read · ${new Date(round.unlockDate).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}</span>`;

      const myLetter = round[myUid] || {};
      const otherLetter = round[partnerUid] || {};

      card.innerHTML = `
        <div class="letter-round-header">
          <p class="letter-round-date">${d.toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}</p>
          ${badge}
        </div>
        <div class="letter-tiles">
          ${renderLetterTile(myLetter, true, round._key, unlocked, isActive)}
          ${renderLetterTile(otherLetter, false, round._key, unlocked, isActive)}
        </div>
        ${isActive ? renderRoundCountdown(round.unlockDate) : ""}
      `;
      tl.appendChild(card);
    });
  }

  function renderLetterTile(letter, isMe, roundKey, unlocked, isActive){
    const name = isMe ? ME : OTHER;
    const hasContent = !!(letter && letter.content);
    const otherEsc = _esc(OTHER);
    const rk = _esc(roundKey);

    if(isMe){
      if(hasContent){
        const preview = _esc(letter.content.substring(0,80) + (letter.content.length>80?"…":""));
        const statusClass = unlocked && letter.readAt ? "read" : "written";
        const statusText = _esc(unlocked && letter.readAt ? "Read by "+OTHER : "Written & sealed");
        return `<div class="letter-tile${isActive?" clickable":""}" onclick="${isActive?`openLetterModal('${rk}',true)`:""}">
          <p class="letter-tile-eyebrow"><svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="3" width="12" height="10" rx="1"/><path d="M2 6l6 4 6-4"/></svg>Your letter to ${otherEsc}</p>
          <div class="letter-tile-status ${statusClass}">${statusClass==="read"?"✓ "+statusText:"✎ "+statusText}</div>
          <p class="letter-tile-preview">${preview}</p>
          ${isActive?`<button class="letter-tile-btn" onclick="event.stopPropagation();openLetterModal('${rk}',true)">Edit ✎</button>`:`<div class="letter-tile-meta"><span>Written ${letter.writtenAt?new Date(letter.writtenAt).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"2-digit"}):""}</span></div>`}
        </div>`;
      } else {
        return `<div class="letter-tile clickable" onclick="openLetterModal('${rk}',true)">
          <p class="letter-tile-eyebrow"><svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="3" width="12" height="10" rx="1"/><path d="M2 6l6 4 6-4"/></svg>Your letter to ${otherEsc}</p>
          <div class="letter-tile-status empty">Not written yet</div>
          <p class="letter-tile-preview" style="opacity:.5;">Tap to write your letter to ${otherEsc}…</p>
          <button class="letter-tile-btn primary" onclick="event.stopPropagation();openLetterModal('${rk}',true)">Write letter</button>
        </div>`;
      }
    } else {
      // Other person's letter
      if(unlocked && hasContent){
        const preview = _esc(letter.content.substring(0,80) + (letter.content.length>80?"…":""));
        return `<div class="letter-tile clickable" onclick="openLetterRead('${rk}')">
          <p class="letter-tile-eyebrow"><svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="3" width="12" height="10" rx="1"/><path d="M2 6l6 4 6-4"/></svg>${otherEsc}'s letter to you</p>
          <div class="letter-tile-status read">✓ Read</div>
          <p class="letter-tile-preview">${preview}</p>
          <div class="letter-tile-meta"><span>Written ${letter.writtenAt?new Date(letter.writtenAt).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"2-digit"}):""}</span><span>Read ${letter.readAt?new Date(letter.readAt).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"2-digit"}):""}</span></div>
        </div>`;
      } else {
        return `<div class="letter-tile sealed">
          <p class="letter-tile-eyebrow"><svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="3" width="12" height="10" rx="1"/><path d="M2 6l6 4 6-4"/></svg>${otherEsc}'s letter to you</p>
          <div class="letter-tile-status sealed"><svg width="8" height="8" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="8" width="10" height="7" rx="1"/><path d="M5 8V6a3 3 0 016 0v2"/></svg> ${hasContent ? "Written &amp; sealed" : "Not written yet"}</div>
          <p class="letter-tile-preview" style="opacity:.45;">${hasContent ? (coupleType==='together'?'You can read it on your date night.':`You can read it on the day you meet.`) : otherEsc+" hasn't written their letter yet."}</p>
          ${hasContent ? `<button class="letter-tile-btn" style="opacity:.45;pointer-events:none;">Locked until meetup 🔒</button>` : ""}
        </div>`;
      }
    }
  }

  function renderRoundCountdown(unlockDate){
    const diff = new Date(unlockDate) - Date.now();
    if(diff <= 0) return "";
    const d = Math.floor(diff/86400000);
    const h = Math.floor((diff%86400000)/3600000);
    const m = Math.floor((diff%3600000)/60000);
    const s = Math.floor((diff%60000)/1000);
    return `<div class="letter-round-cd" data-unlock="${unlockDate}">
      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="var(--muted)" stroke-width="1.3"><rect x="3" y="8" width="10" height="7" rx="1"/><path d="M5 8V6a3 3 0 016 0v2"/><circle cx="8" cy="11" r="1" fill="var(--muted)" stroke="none"/></svg>
      <span class="letter-round-cd-label">Unlocks on ${new Date(unlockDate).toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}</span>
      <div class="letter-round-cd-nums">
        <div><span class="letter-round-cd-num">${d}</span><span class="letter-round-cd-unit">d</span></div>
        <div><span class="letter-round-cd-num">${h}</span><span class="letter-round-cd-unit">h</span></div>
        <div><span class="letter-round-cd-num">${m}</span><span class="letter-round-cd-unit">m</span></div>
        <div><span class="letter-round-cd-num">${s}</span><span class="letter-round-cd-unit">s</span></div>
      </div>
    </div>`;
  }

  function renderCurrentRound(rounds){
    const tl = document.getElementById("letter-timeline");
    if(!tl) return;
    // If no meetup date set or date is in the past with no new date
    if(!meetupDate || meetupDate <= new Date()){
      // Only show prompt if there's no active round already
      const hasActiveRound = rounds && rounds.some(r => r.unlockDate && new Date(r.unlockDate) > new Date());
      if(!hasActiveRound){
        const prompt = document.createElement("div");
        prompt.style.cssText = "text-align:center;padding:2rem 1rem;color:var(--muted);font-size:.78rem;line-height:1.7;";
        prompt.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--border)" stroke-width="1" stroke-linecap="round" style="display:block;margin:0 auto .75rem;"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>${coupleType==='together'?'Set your next date night on the home page':'Set your next meetup date on the home page'}<br>to start writing new letters 💌`;
        tl.appendChild(prompt);
      }
      return;
    }
    const unlockDateStr = _localDateStr(meetupDate);
    // Check if a round already exists for this date
    const existing = rounds && rounds.find(r => r.unlockDate && r.unlockDate.startsWith(unlockDateStr));
    if(existing) return; // already rendered
    // Create empty round UI
    const sep = document.createElement("div");
    sep.className = "letter-meetup-sep";
    sep.innerHTML = `<span class="letter-meetup-sep-label">${coupleType==='together'?'Date night':'Next meetup'} · ${meetupDate.toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}</span>`;
    tl.appendChild(sep);
    const card = document.createElement("div");
    card.className = "letter-round active-round";
    const otherEsc = _esc(OTHER);
    card.innerHTML = `
      <div class="letter-round-header">
        <p class="letter-round-date">${meetupDate.toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}</p>
        <span class="letter-round-badge active">Active · Writing phase</span>
      </div>
      <div class="letter-tiles">
        <div class="letter-tile clickable" onclick="openLetterModal('new',true)">
          <p class="letter-tile-eyebrow"><svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="3" width="12" height="10" rx="1"/><path d="M2 6l6 4 6-4"/></svg>Your letter to ${otherEsc}</p>
          <div class="letter-tile-status empty">Not written yet</div>
          <p class="letter-tile-preview" style="opacity:.5;">Tap to write your letter to ${otherEsc}…</p>
          <button class="letter-tile-btn primary" onclick="event.stopPropagation();openLetterModal('new',true)">Write letter</button>
        </div>
        <div class="letter-tile sealed">
          <p class="letter-tile-eyebrow"><svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="3" width="12" height="10" rx="1"/><path d="M2 6l6 4 6-4"/></svg>${otherEsc}'s letter to you</p>
          <div class="letter-tile-status empty">Not written yet</div>
          <p class="letter-tile-preview" style="opacity:.45;">${otherEsc} hasn't written their letter yet.</p>
        </div>
      </div>
    `;
    tl.appendChild(card);
  }

  window.openLetterModal = function(roundKey, isMe){
    currentLetterRoundId = roundKey;
    const modal = document.getElementById("letter-modal-overlay");
    const titleEl = document.getElementById("letter-modal-title");
    const subEl = document.getElementById("letter-modal-sub");
    const hintEl = document.getElementById("letter-modal-hint-name");
    const ta = document.getElementById("letter-modal-textarea");
    if(!modal) return;

    titleEl.textContent = `Your letter to ${OTHER}`;
    subEl.textContent = `Only you can see this. ${OTHER} will read it ${coupleType==='together'?'on your date night':'on the day you meet'}.`;
    if(hintEl) hintEl.textContent = OTHER;
    // Set salutation placeholder dynamically
    const taEl = document.getElementById('letter-modal-textarea');
    if(taEl) taEl.placeholder = `Dear ${OTHER},\n\nI've been thinking about what to write…`;

    // Pre-fill if existing content
    ta.value = "";
    if(roundKey !== "new" && db && fbOnValue){
      fbOnValue(dbRef(db,`couples/${coupleId}/letters/${roundKey}/${myUid}/content`), snap=>{
        if(snap.val()) ta.value = snap.val();
      },{onlyOnce:true});
    }
    modal.classList.add("open");
    setTimeout(()=>{
      ta.focus();
      const counter = document.getElementById("letter-char-count");
      if(counter) counter.textContent = ta.value.length;
    },100);
  };

  window.closeLetterModal = function(){
    const modal = document.getElementById("letter-modal-overlay");
    if(modal) modal.classList.remove("open");
    currentLetterRoundId = null;
  };

  window.saveLetterContent = async function(){
    const ta = document.getElementById("letter-modal-textarea");
    const content_text = ta.value.trim();
    if(!content_text) return;

    // Fix 8: block saving if no meetup date or meetup date is in the past
    if(!meetupDate || meetupDate <= new Date()){
      const sub = document.getElementById("letter-modal-sub");
      if(sub){
        const orig = sub.textContent;
        sub.textContent = "Please set a valid future meetup date on the home page first.";
        sub.style.color = "#e8622a";
        setTimeout(()=>{sub.textContent=orig;sub.style.color="";},3000);
      }
      return;
    }

    // Use actual date night time in Together mode, midnight for LDR
      const unlockDateStr = _localDateStr(meetupDate);
      const unlockTime = (coupleType==='together' && _dnTimeVal) ? _dnTimeVal : '00:00';
      const unlockDate = `${unlockDateStr}T${unlockTime}:00`;

    let roundKey = currentLetterRoundId;

    if(db && dbSet && dbPush){
      try{
        if(roundKey === "new"){
          // Create new round
          const newRound = {unlockDate, createdAt: Date.now()};
          const ref_new = await dbPush(dbRef(db,`couples/${coupleId}/letters`), newRound);
          roundKey = ref_new.key;
        }
        // Save letter content
        await dbSet(dbRef(db,`couples/${coupleId}/letters/${roundKey}/${myUid}`),{
          content: content_text,
          writtenAt: Date.now(),
          unlockDate
        });
      }catch(e){
        console.error('saveLetterContent failed:',e);
        const sub=document.getElementById('letter-modal-sub');
        if(sub){const orig=sub.textContent;sub.textContent='Failed to save — check your connection.';sub.style.color='#e8622a';setTimeout(()=>{sub.textContent=orig;sub.style.color='';},3000);}
        return;
      }
    }
    closeLetterModal();
    initLetterPage();
  };

  window.openLetterRead = function(roundKey){
    if(!roundKey || !db || !fbOnValue) return;
    fbOnValue(dbRef(db,`couples/${coupleId}/letters/${roundKey}`), snap=>{
      const round = snap.val();
      if(!round) return;
      const otherLetter = round[partnerUid];
      if(!otherLetter || !isUnlocked(otherLetter.unlockDate)) return;

      // Mark as read
      if(!otherLetter.readAt){
        dbSet(dbRef(db,`couples/${coupleId}/letters/${roundKey}/${partnerUid}/readAt`), Date.now());
      }

      // Show read view in place of timeline
      const tl = document.getElementById("letter-timeline");
      const backBtn = `<button onclick="initLetterPage()" style="background:none;border:none;cursor:pointer;font-size:.65rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-family:'Plus Jakarta Sans',sans-serif;text-decoration:underline;text-underline-offset:3px;margin-bottom:1rem;display:block;padding:0;">← Back to letters</button>`;
      tl.innerHTML = backBtn + `<div class="letter-read-card">
        <p class="letter-read-eyebrow">Written by ${_esc(OTHER)} · ${otherLetter.writtenAt?new Date(otherLetter.writtenAt).toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"}):""}</p>
        <p class="letter-read-from">To ${_esc(ME)}, with love</p>
        <p class="letter-read-body" id="letter-read-body-text"></p>
        <p class="letter-read-sig">— ${_esc(OTHER)} 🤍</p>
      </div>`;
      // Set content via textContent — safe, white-space:pre-wrap handles newlines in CSS
      const bodyEl = document.getElementById('letter-read-body-text');
      if(bodyEl) bodyEl.textContent = otherLetter.content||"";
    },{onlyOnce:true});
  };

  window.initLetterPage=function(onReady){
    const tl = document.getElementById("letter-timeline");
    if(tl) tl.innerHTML = "";
    if(!db || !fbOnValue){
      renderCurrentRound([]);
      if(onReady) onReady();
      return;
    }
    fbOnValue(dbRef(db,`couples/${coupleId}/letters`), snap=>{
      const data = snap.val();
      const rounds = data ? Object.entries(data).map(([k,v])=>({...v,_key:k})) : [];
      renderLetterTimeline(rounds);
      if(onReady) setTimeout(onReady, 150);
    },{onlyOnce:true});
  }

  function _startLetterCountdown(){
    if(_letterCountdownInterval) clearInterval(_letterCountdownInterval);
    _letterCountdownInterval = setInterval(()=>{
      const cards = document.querySelectorAll('.active-round');
      cards.forEach(card => {
        const unlockEl = card.querySelector('.letter-round-cd');
        if(!unlockEl) return;
        const unlockDate = unlockEl.dataset.unlock;
        if(!unlockDate) return;
        const diff = new Date(unlockDate) - Date.now();
        if(diff <= 0){ _stopLetterCountdown(); return; }
        const d = Math.floor(diff/86400000);
        const h = Math.floor((diff%86400000)/3600000);
        const m = Math.floor((diff%3600000)/60000);
        const s = Math.floor((diff%60000)/1000);
        const nums = unlockEl.querySelectorAll('.letter-round-cd-num');
        if(nums[0]) nums[0].textContent = d;
        if(nums[1]) nums[1].textContent = h;
        if(nums[2]) nums[2].textContent = m;
        if(nums[3]) nums[3].textContent = s;
      });
    }, 1000);
  }

  function _stopLetterCountdown(){
    if(_letterCountdownInterval){ clearInterval(_letterCountdownInterval); _letterCountdownInterval=null; }
  }

  // Milestone photos
  let pendingPhotoFile = null;
  let pendingPhotoForKey = null;
  let pendingPhotoPosition = "50% 50%"; // set during reposition before upload
  let repositionMode = "new"; // "new" = from form, "card" = from existing card

  window.handleMilestonePhotoSelect = function(input){
    const file = input.files[0];
    if(!file) return;
    // Validate file type
    const validTypes = ["image/jpeg","image/jpg","image/png","image/gif","image/webp","image/heic","image/heif"];
    if(!validTypes.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|gif|webp|heic|heif)$/i)){
      const label = document.getElementById("m-photo-btn-label");
      if(label){ label.textContent = "Invalid file type ✕"; setTimeout(()=>label.textContent="Add photo",3000); }
      input.value = "";
      return;
    }
    // Validate file size (max 10MB)
    if(file.size > 10 * 1024 * 1024){
      const label = document.getElementById("m-photo-btn-label");
      if(label){ label.textContent = "File too large (max 10MB) ✕"; setTimeout(()=>label.textContent="Add photo",3000); }
      input.value = "";
      return;
    }
    // On iOS PWA, File objects from input[type=file] can become stale if the user
    // spends time filling in the form before saving. Convert to a Blob immediately
    // by reading the file into memory — Blobs are not subject to iOS garbage collection.
    const reader = new FileReader();
    reader.onload = e => {
      const arrayBuffer = e.target.result;
      const mimeType = file.type || "image/jpeg";
      const stableBlob = new Blob([arrayBuffer], {type: mimeType});
      // Attach original name for path generation
      stableBlob._name = file.name;
      pendingPhotoFile = stableBlob;
      pendingPhotoPosition = "50% 50%";
      repositionMode = "new";
      // Show reposition modal immediately with local blob URL
      const blobUrl = URL.createObjectURL(stableBlob);
      openRepositionModalForNew(blobUrl);
    };
    reader.onerror = () => {
      // Fallback: use original File if read fails
      pendingPhotoFile = file;
      pendingPhotoPosition = "50% 50%";
      repositionMode = "new";
      const blobUrl = URL.createObjectURL(file);
      openRepositionModalForNew(blobUrl);
    };
    reader.readAsArrayBuffer(file);
  };

  window.triggerPhotoUploadFor = function(key){
    pendingPhotoForKey = key;
    // Create temp input and trigger
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async function(){
      const file = input.files[0];
      if(!file || !storage) return;
      // Validate type
      const validTypes = ["image/jpeg","image/jpg","image/png","image/gif","image/webp","image/heic","image/heif"];
      if(!validTypes.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|gif|webp|heic|heif)$/i)) return;
      // Validate size (max 10MB)
      if(file.size > 10 * 1024 * 1024) return;
      // Show reposition modal first, upload happens on "Done"
      repositionMode = "card";
      pendingPhotoFile = file;
      pendingPhotoPosition = "50% 50%";
      const blobUrl = URL.createObjectURL(file);
      openRepositionModalForCard(key, blobUrl);
    };
    input.click();
  };

  async function uploadPhotoForKey(key, file, position, isNewMilestone=false){
    if(!storage || !fbStorageRef || !fbUploadBytes || !fbGetDownloadURL){
      console.error("Storage not ready");
      const label = document.getElementById("m-photo-btn-label");
      const saveBtn = document.getElementById("m-save-btn");
      if(label){ label.textContent = "Storage not ready ✕"; setTimeout(()=>label.textContent="Add photo",3000); }
      if(saveBtn) saveBtn.textContent = "Save";
      // Also reset any placeholder spinner
      const ph = document.querySelector(`.m-photo-placeholder`);
      if(ph) ph.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"><rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3"/><path d="M7 6V5a1 1 0 011-1h2M14 5a1 1 0 011 1v1"/></svg><span>Add photo</span>`;
      return;
    }
    // Show uploading feedback
    const saveBtn = document.getElementById("m-save-btn");
    // Find placeholder for this card — query all and find the one in this card's DOM area
    let placeholder = null;
    document.querySelectorAll(".m-card").forEach(card=>{
      // Check if this card contains our key in any of its action buttons
      if(card.innerHTML.includes(key)) placeholder = card.querySelector(".m-photo-placeholder");
    });
    if(saveBtn && saveBtn.textContent !== "Saving…") saveBtn.textContent = "Uploading…";
    if(placeholder) placeholder.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="1.2" stroke-linecap="round" style="animation:spin 1s linear infinite;opacity:.4;"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg><span style="font-size:.62rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);">Uploading…</span>`;
    // Compress — always outputs JPEG blob
    const compressed = await compressImage(file, 1200);
    // Force safe .jpg filename regardless of input (handles HEIC, no-extension, etc.)
    const baseName = (file.name||file._name||"photo").replace(/\.[^.]+$/, "").replace(/[^a-z0-9]/gi,"_").substring(0,40) || "photo";
    const safeName = `${baseName}.jpg`;
    const path = `milestones/${key}/${Date.now()}_${safeName}`;
    const ref = fbStorageRef(storage, path);
    // uploadBytes needs a Blob — if compressImage fell back to File, wrap it
    const uploadData = (compressed instanceof Blob) ? compressed : new Blob([compressed], {type:"image/jpeg"});
    // Add upload timeout — Firebase can hang on poor connections
    await Promise.race([
      fbUploadBytes(ref, uploadData, {contentType:"image/jpeg"}),
      new Promise((_,rej)=>setTimeout(()=>rej(new Error("Upload timeout after 30s")),30000))
    ]);
    const url = await fbGetDownloadURL(ref);
    // Save URL AND path to Firebase (path needed for proper deletion)
    if(db && dbSet){
      await dbSet(dbRef(db,`couples/${coupleId}/milestones/${key}/photoURL`), url);
      await dbSet(dbRef(db,`couples/${coupleId}/milestones/${key}/photoPath`), path);
      if(position) await dbSet(dbRef(db,`couples/${coupleId}/milestones/${key}/photoPosition`), position);
    }
    // Immediately update card in DOM without waiting for Firebase listener
    // Only for EDITS — for new milestones, the Firebase listener re-renders with photoURL automatically
    // Update registry so _msViewPhoto/_msReposition work on the new card
    const regItem = _msRegistry.get(key)||{};
    _msRegistry.set(key, {...regItem, _key:key, photoURL:url, photoPath:path, photoPosition:position||'center center'});
    if(!isNewMilestone){
      const existingPlaceholder = document.querySelector(`.m-photo-placeholder[onclick*="${key}"]`);
      if(existingPlaceholder){
        const wrap = document.createElement("div");
        wrap.className = "m-photo-wrap";
        wrap.setAttribute("onclick", `_msViewPhoto('${key}')`);
        wrap.innerHTML = `<img src="${url}" alt="" style="object-position:${position||'center center'}"/><div class="m-photo-actions"><button class="m-photo-action-btn" onclick="event.stopPropagation();_msReposition('${key}')">Reposition</button><button class="m-photo-action-btn" onclick="event.stopPropagation();removeMilestonePhoto('${key}')">Remove</button></div>`;
        existingPlaceholder.replaceWith(wrap);
      }
    }
    // Reset save btn
    const saveBtn2 = document.getElementById("m-save-btn");
    if(saveBtn2 && saveBtn2.textContent === "Uploading…") saveBtn2.textContent = "Save";
  }

  async function safeUploadPhotoForKey(key, file, position, isNewMilestone=false){
    try{
      await uploadPhotoForKey(key, file, position, isNewMilestone);
    } catch(e){
      console.error("Photo upload failed:", e);
      const saveBtn = document.getElementById("m-save-btn");
      if(saveBtn) saveBtn.textContent = "Save";
      const label = document.getElementById("m-photo-btn-label");
      if(label){ label.textContent = "Upload failed ✕"; setTimeout(()=>label.textContent="Add photo",3000); }
      // Reset any stuck placeholder spinner back to "Add photo"
      // Reset placeholder — query all placeholders and reset the spinning one
      document.querySelectorAll(".m-photo-placeholder").forEach(ph=>{
        if(ph.querySelector("span") && ph.querySelector("span").textContent.includes("Uploading"))
          ph.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"><rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3"/><path d="M7 6V5a1 1 0 011-1h2M14 5a1 1 0 011 1v1"/></svg><span>Upload failed ✕</span>`;
      });
      setTimeout(()=>{ document.querySelectorAll(".m-photo-placeholder span").forEach(sp=>{ if(sp.textContent.includes("failed")) sp.textContent="Add photo"; }); }, 3000);
    }
  }

  async function compressImage(file, maxWidth){
    return new Promise(resolve=>{
      // Safety timeout — if compression hangs for any reason, use original file
      const timeout = setTimeout(()=>{ console.warn("compressImage timeout — using original"); resolve(file); }, 15000);
      const done = (result)=>{ clearTimeout(timeout); resolve(result||file); };

      const img = new Image();
      const reader = new FileReader();

      reader.onerror = ()=>done(file);
      reader.onload = e=>{
        img.onerror = ()=>done(file);
        img.onload = ()=>{
          try{
            const canvas = document.createElement("canvas");
            let w = img.width, h = img.height;
            if(w > maxWidth){ h = Math.round(h*maxWidth/w); w = maxWidth; }
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext("2d");
            if(!ctx){ done(file); return; }
            ctx.drawImage(img,0,0,w,h);
            canvas.toBlob(blob=>done(blob||file),"image/jpeg",0.82);
          } catch(err){ console.error("Canvas error:", err); done(file); }
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  window.removeMilestonePhoto = async function(key){
    if(!key || !db) return;
    // Get path first, then delete from Storage and Firebase
    if(fbOnValue){
      fbOnValue(dbRef(db,`couples/${coupleId}/milestones/${key}/photoPath`), async snap=>{
        const path = snap.val();
        if(path && storage && fbStorageRef && fbDeleteObject){
          try{ await fbDeleteObject(fbStorageRef(storage, path)); }
          catch(e){ console.warn("Storage delete failed:", e); }
        }
        if(dbSet){
          await dbSet(dbRef(db,`couples/${coupleId}/milestones/${key}/photoURL`), null);
          await dbSet(dbRef(db,`couples/${coupleId}/milestones/${key}/photoPath`), null);
        }
      },{onlyOnce:true});
    }
  };

  window.viewMilestonePhoto = function(url){
    // Open photo in a lightbox overlay
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(42,18,8,.92);z-index:1000;display:flex;align-items:center;justify-content:center;cursor:zoom-out;";
    overlay.onclick = (e)=>{ if(e.target===overlay||e.target===closeBtn) overlay.remove(); };
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕";
    closeBtn.style.cssText = "position:absolute;top:1.25rem;right:1.25rem;background:rgba(255,255,255,.15);border:none;color:white;width:36px;height:36px;border-radius:50%;font-size:1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);";
    closeBtn.onclick = ()=>overlay.remove();
    const img = document.createElement("img");
    img.src = url;
    img.style.cssText = "max-width:90vw;max-height:88vh;border-radius:12px;object-fit:contain;";
    overlay.appendChild(closeBtn);
    overlay.appendChild(img);
    document.body.appendChild(overlay);
  };

  // Photo reposition
  let repositionKey = null;
  let repositionPos = {x: 50, y: 50}; // percentage
  let repositionDragging = false;
  let repositionStart = {x: 0, y: 0};
  let repositionStartPos = {x: 50, y: 50};

  function openRepositionBase(url, title, position){
    const parts = (position || "center center").split(" ");
    const px = parts[0] === "center" ? 50 : parseFloat(parts[0]);
    const py = parts[1] === "center" ? 50 : parseFloat(parts[1]);
    repositionPos = {x: isNaN(px)?50:px, y: isNaN(py)?50:py};
    repositionStartPos = {...repositionPos};
    const overlay = document.getElementById("m-reposition-overlay");
    const img = document.getElementById("m-reposition-img");
    const titleEl = document.getElementById("m-reposition-title");
    const frame = document.getElementById("m-reposition-frame");
    if(!overlay || !img) return;
    img.src = url;
    if(titleEl) titleEl.textContent = title || "";
    // Wait for image to load so naturalWidth/Height are available for overflow calc
    img.onload = ()=>{ applyRepositionPos(); };
    if(img.complete && img.naturalWidth) applyRepositionPos();
    frame.onmousedown = startRepositionDrag;
    frame.ontouchstart = startRepositionDrag;
    overlay.classList.add("open");
  }

  function openRepositionModalForNew(blobUrl){
    repositionKey = null;
    repositionMode = "new";
    openRepositionBase(blobUrl, "New photo", "50% 50%");
  }

  function openRepositionModalForCard(key, blobUrl){
    repositionKey = key;
    repositionMode = "card";
    openRepositionBase(blobUrl, "", "50% 50%");
  }

  window.openRepositionModal = function(key, url, title, currentPosition){
    repositionKey = key;
    repositionMode = "existing";
    openRepositionBase(url, title, currentPosition);
  };

  window.closeRepositionModal = function(){
    const overlay = document.getElementById("m-reposition-overlay");
    if(overlay) overlay.classList.remove("open");
    repositionKey = null;
    // Remove drag events
    const frame = document.getElementById("m-reposition-frame");
    if(frame){ frame.onmousedown = null; frame.ontouchstart = null; }
  };

  window.resetReposition = function(){
    repositionPos = {x: 50, y: 50};
    applyRepositionPos();
  };

  window.saveReposition = async function(){
    const posStr = `${repositionPos.x}% ${repositionPos.y}%`;
    pendingPhotoPosition = posStr;

    if(repositionMode === "new"){
      // From form — just store position, actual upload happens on Save milestone
      const btn = document.getElementById("m-photo-btn");
      const label = document.getElementById("m-photo-btn-label");
      if(btn) btn.classList.add("has-photo");
      if(label) label.textContent = "Photo added ✓";
      // Revoke blob URL to free memory
      const img = document.getElementById("m-reposition-img");
      if(img && img.src.startsWith("blob:")) URL.revokeObjectURL(img.src);
      closeRepositionModal();
      return;
    }

    if(repositionMode === "card"){
      // From card placeholder — upload now with chosen position
      if(!repositionKey || !pendingPhotoFile) { closeRepositionModal(); return; }
      const key = repositionKey;
      const fileToUpload = pendingPhotoFile;
      pendingPhotoFile = null; // clear before async so it can't be double-used
      closeRepositionModal();
      // Show uploading state on the save button
      const sb = document.getElementById("m-save-btn");
      if(sb) sb.textContent = "Uploading…";
      await safeUploadPhotoForKey(key, fileToUpload, posStr);
      if(sb && sb.textContent === "Uploading…") sb.textContent = "Save";
      return;
    }

    // "existing" mode — just update position in Firebase
    if(!repositionKey) return;
    if(db && dbSet) await dbSet(dbRef(db,`couples/${coupleId}/milestones/${repositionKey}/photoPosition`), posStr);
    // Update registry so next reposition call has fresh position
    const regItem = _msRegistry.get(repositionKey);
    if(regItem) _msRegistry.set(repositionKey, {...regItem, photoPosition: posStr});
    const cardImg = document.querySelector(`.m-photo-wrap[onclick*="${repositionKey}"] img`);
    if(cardImg) cardImg.style.objectPosition = posStr;
    closeRepositionModal();
  };

  function applyRepositionPos(){
    const img = document.getElementById("m-reposition-img");
    const frame = document.getElementById("m-reposition-frame");
    if(!img || !frame) return;
    const fw = frame.offsetWidth;
    const fh = frame.offsetHeight;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    if(!iw || !ih){ img.onload = applyRepositionPos; return; }
    // Scale to COVER, then apply 1.4x zoom so both axes always overflow
    // This guarantees horizontal AND vertical panning for any photo ratio
    const ZOOM = 1.4;
    const scale = Math.max(fw / iw, fh / ih) * ZOOM;
    const scaledW = iw * scale;
    const scaledH = ih * scale;
    // Overflow is now always positive in both directions
    const overflowX = scaledW - fw;
    const overflowY = scaledH - fh;
    // repositionPos 0=top-left, 50=centre, 100=bottom-right
    const tx = -(repositionPos.x / 100) * overflowX;
    const ty = -(repositionPos.y / 100) * overflowY;
    img.style.setProperty("--tx", tx.toFixed(2)+"px");
    img.style.setProperty("--ty", ty.toFixed(2)+"px");
    img.style.setProperty("--sc", scale.toFixed(6));
  }

  function startRepositionDrag(e){
    repositionDragging = true;
    repositionStartPos = {...repositionPos};
    const pt = e.touches ? e.touches[0] : e;
    repositionStart = {x: pt.clientX, y: pt.clientY};
    document.onmousemove = onRepositionMove;
    document.ontouchmove = onRepositionMove;
    document.onmouseup = stopRepositionDrag;
    document.ontouchend = stopRepositionDrag;
    e.preventDefault();
  }

  function onRepositionMove(e){
    if(!repositionDragging) return;
    const pt = e.touches ? e.touches[0] : e;
    const frame = document.getElementById("m-reposition-frame");
    if(!frame) return;
    const rect = frame.getBoundingClientRect();
    // Use same reference for both axes so horizontal = vertical sensitivity
    // Smaller dimension (height=150px) gives better feel on mobile
    // object-position: 0%=far left, 100%=far right
    // Drag 120px = pan from 0% to 100%
    const sensitivity = 120;
    const dx = (pt.clientX - repositionStart.x) / sensitivity * 100;
    const dy = (pt.clientY - repositionStart.y) / sensitivity * 100;
    // Dragging right moves view left (natural feel)
    repositionPos.x = Math.max(0, Math.min(100, repositionStartPos.x - dx));
    repositionPos.y = Math.max(0, Math.min(100, repositionStartPos.y - dy));
    applyRepositionPos();
    e.preventDefault();
  }

  function stopRepositionDrag(){
    repositionDragging = false;
    document.onmousemove = null;
    document.ontouchmove = null;
    document.onmouseup = null;
    document.ontouchend = null;
  }

  // Nav
  // ── FORGOT PASSWORD ─────────────────────────────────────
  window.doForgotPassword = async function(){
    const email = document.getElementById('forgot-email').value.trim();
    const err = document.getElementById('forgot-error');
    const success = document.getElementById('forgot-success');
    const btn = document.getElementById('forgot-btn');
    err.textContent = '';
    success.style.display = 'none';
    if(!fbAuth){ err.textContent = 'Connection error. Please refresh.'; return; }
    if(!email){ err.textContent = 'Please enter your email address.'; return; }
    btn.textContent = 'Sending…'; btn.disabled = true;
    try{
      await fbAuth.sendPasswordResetEmail(email);
      success.textContent = 'Reset link sent! Check your inbox (and spam folder).';
      success.style.display = 'block';
      btn.textContent = 'Send reset link'; btn.disabled = false;
      document.getElementById('forgot-email').value = '';
    }catch(e){
      console.error('doForgotPassword failed:', e);
      if(e.code === 'auth/user-not-found'){
        err.textContent = 'No account found with this email.';
      } else {
        err.textContent = 'Something went wrong. Please try again.';
      }
      btn.textContent = 'Send reset link'; btn.disabled = false;
    }
  };

  // ── SETTINGS — populate fields when page opens ──────────
  window.openSettingsPage = function(){
    // Hide delete confirm if open
    window.hideDeleteConfirm && window.hideDeleteConfirm();
    // Profile fields
    const nameEl = document.getElementById('settings-name');
    if(nameEl) nameEl.value = ME || '';
    const emailEl = document.getElementById('settings-email-display');
    if(emailEl) emailEl.textContent = fbAuth?.currentUser?.email || '—';
    const cityEl = document.getElementById('settings-city-display');
    if(cityEl){
      if(!myCity || myCity === '—'){
        cityEl.textContent = 'Location access denied';
        cityEl.style.color = 'var(--muted)';
        // Show hint below if not already there
        let hint = document.getElementById('settings-city-hint');
        if(!hint){
          hint = document.createElement('div');
          hint.id = 'settings-city-hint';
          hint.style.cssText = 'font-size:.6rem;color:var(--muted);margin-top:.2rem;line-height:1.5;';
          hint.textContent = 'Enable location in your browser or device settings to detect your city.';
          cityEl.parentNode.appendChild(hint);
        }
        hint.style.display = '';
      } else {
        cityEl.textContent = myCity;
        cityEl.style.color = '';
        const hint = document.getElementById('settings-city-hint');
        if(hint) hint.style.display = 'none';
      }
    }
    // Start date
    const sdEl = document.getElementById('settings-start-date');
    if(sdEl){
      // Set max to today so future dates are greyed out natively
      const todayStr = new Date().toISOString().split('T')[0];
      sdEl.max = todayStr;
      if(coupleStartDate) sdEl.value = coupleStartDate;
    }
    // Avatar
    applyAllAvatars && applyAllAvatars();
    // Clear messages
    ['settings-profile-error','settings-pw-error','settings-email-error'].forEach(id=>{
      const el = document.getElementById(id); if(el) el.textContent = '';
    });
    ['settings-profile-success','settings-pw-success','settings-email-success'].forEach(id=>{
      const el = document.getElementById(id); if(el) el.style.display = 'none';
    });
    // Clear password/email fields
    ['settings-current-pw','settings-new-pw','settings-confirm-pw',
     'settings-new-email','settings-email-pw'].forEach(id=>{
      const el = document.getElementById(id); if(el) el.value = '';
    });
    // Close any open expandables
    document.querySelectorAll('.settings-expandable').forEach(e => e.classList.remove('open'));
    // Sync mode toggle
    const ldrBtn = document.getElementById('settings-mode-ldr');
    const togBtn = document.getElementById('settings-mode-together');
    if(ldrBtn) ldrBtn.classList.toggle('active', coupleType==='ldr');
    if(togBtn) togBtn.classList.toggle('active', coupleType==='together');
    // Hide invite partner row when partner already joined
    const inviteRow = document.getElementById('settings-invite-row');
    if(inviteRow) inviteRow.style.display = partnerUid ? 'none' : '';
  };

  // ── SETTINGS — change password ───────────────────────────
  window.savePasswordSettings = async function(){
    const currentPw = document.getElementById('settings-current-pw').value;
    const newPw = document.getElementById('settings-new-pw').value;
    const confirmPw = document.getElementById('settings-confirm-pw').value;
    const err = document.getElementById('settings-pw-error');
    const success = document.getElementById('settings-pw-success');
    const btn = document.getElementById('btn-save-password');
    err.textContent = ''; success.style.display = 'none';
    if(!currentPw || !newPw || !confirmPw){ err.textContent = 'Please fill in all fields.'; return; }
    if(newPw.length < 6){ err.textContent = 'New password must be at least 6 characters.'; return; }
    if(newPw !== confirmPw){ err.textContent = 'New passwords do not match.'; return; }
    btn.textContent = 'Changing…'; btn.disabled = true;
    try{
      // Re-authenticate first
      const credential = fbAuth.EmailAuthProvider.credential(fbAuth.currentUser.email, currentPw);
      await fbAuth.reauthenticateWithCredential(fbAuth.currentUser, credential);
      // Update password
      await fbAuth.updatePassword(fbAuth.currentUser, newPw);
      success.textContent = 'Password changed successfully ✓';
      success.style.display = 'block';
      // Clear fields
      ['settings-current-pw','settings-new-pw','settings-confirm-pw'].forEach(id=>{
        const el = document.getElementById(id); if(el) el.value = '';
      });
      btn.textContent = 'Change password'; btn.disabled = false;
    }catch(e){
      console.error('savePasswordSettings failed:', e);
      if(e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential'){
        err.textContent = 'Current password is incorrect.';
      } else if(e.code === 'auth/weak-password'){
        err.textContent = 'New password is too weak.';
      } else {
        err.textContent = 'Failed to change password. Please try again.';
      }
      btn.textContent = 'Change password'; btn.disabled = false;
    }
  };

  // ── SETTINGS — change email ──────────────────────────────
  window.saveEmailSettings = async function(){
    const newEmail = document.getElementById('settings-new-email').value.trim();
    const pw = document.getElementById('settings-email-pw').value;
    const err = document.getElementById('settings-email-error');
    const success = document.getElementById('settings-email-success');
    const btn = document.getElementById('btn-save-email');
    err.textContent = ''; success.style.display = 'none';
    if(!newEmail || !pw){ err.textContent = 'Please fill in all fields.'; return; }
    if(newEmail === fbAuth.currentUser.email){ err.textContent = 'This is already your email address.'; return; }
    btn.textContent = 'Changing…'; btn.disabled = true;
    try{
      // Re-authenticate first
      const credential = fbAuth.EmailAuthProvider.credential(fbAuth.currentUser.email, pw);
      await fbAuth.reauthenticateWithCredential(fbAuth.currentUser, credential);
      // Update email in Firebase Auth
      await fbAuth.updateEmail(fbAuth.currentUser, newEmail);
      // Update email in DB
      await dbSet(dbRef(db, `users/${myUid}/email`), newEmail);
      success.textContent = "Done! Check your new inbox for a verification link — your email won't update until you verify it. ✓";
      success.style.display = 'block';
      ['settings-new-email','settings-email-pw'].forEach(id=>{
        const el = document.getElementById(id); if(el) el.value = '';
      });
      btn.textContent = 'Change email'; btn.disabled = false;
    }catch(e){
      console.error('saveEmailSettings failed:', e);
      if(e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential'){
        err.textContent = 'Password is incorrect.';
      } else if(e.code === 'auth/email-already-in-use'){
        err.textContent = 'This email is already in use by another account.';
      } else if(e.code === 'auth/invalid-email'){
        err.textContent = 'Please enter a valid email address.';
      } else {
        err.textContent = 'Failed to change email. Please try again.';
      }
      btn.textContent = 'Change email'; btn.disabled = false;
    }
  };

  // ── MEMORY JAR ────────────────────────────────────────────
  let _mjUnsub = null;
  let _mjMyEntry = null;   // today's entry by me
  let _mjOtherEntry = null; // today's entry by partner
  let _mjStreakCount = 0;

  function _mjTodayKey(){
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }

  function _mjFmtTime(ts){
    if(!ts) return '';
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }

  function _mjFmtDate(dateKey){
    // dateKey = 'YYYY-MM-DD'
    const d = new Date(dateKey+'T12:00:00');
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
  }

  function _mjSetInputDisabled(disabled, context){
    const inputId = context==='today' ? 'mj-today-input' : 'mj-preview-input';
    const sendId = context==='today' ? 'mj-today-send' : 'mj-preview-send';
    const rowId = context==='today' ? 'mj-today-input-row' : 'mj-preview-input-row';
    const input = document.getElementById(inputId);
    const send = document.getElementById(sendId);
    const row = document.getElementById(rowId);
    if(input) input.disabled = disabled;
    if(send) send.disabled = disabled;
    if(row && disabled){
      row.innerHTML = `<div style="display:flex;align-items:center;gap:.5rem;padding:.45rem .7rem;">
        <div style="width:18px;height:18px;border-radius:50%;background:rgba(42,157,92,0.12);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="#2a9d5c" stroke-width="1.8"><path d="M2 5l2.5 2.5L8 3"/></svg>
        </div>
        <span class="mj-written-note" style="font-style:italic;font-size:.68rem;color:#2a9d5c;">You've written today — this can't be changed</span>
      </div>`;
    }
  }

  function renderMemoryJarPreview(){
    if(!ME || !OTHER) return;
    // Avatars — use _applyAvatar so photos show if available
    const myAvEl = document.getElementById('mj-preview-my-avatar');
    const otherAvEl = document.getElementById('mj-preview-other-avatar');
    _applyAvatar(myAvEl, myAvatarUrl, (ME||'?')[0].toUpperCase(), true);
    _applyAvatar(otherAvEl, otherAvatarUrl, (OTHER||'?')[0].toUpperCase(), false);

    // My entry
    const myTextEl = document.getElementById('mj-preview-my-text');
    if(myTextEl){
      if(_mjMyEntry?.text){
        myTextEl.textContent = _mjMyEntry.text;
        myTextEl.className = 'mj-entry-text';
      } else {
        myTextEl.textContent = 'Nothing yet today';
        myTextEl.className = 'mj-entry-text mj-empty-entry';
      }
    }

    // Other entry
    const otherTextEl = document.getElementById('mj-preview-other-text');
    if(otherTextEl){
      if(_mjOtherEntry?.text){
        otherTextEl.textContent = _mjOtherEntry.text;
        otherTextEl.className = 'mj-entry-text';
      } else {
        otherTextEl.textContent = 'Nothing yet today';
        otherTextEl.className = 'mj-entry-text mj-empty-entry';
      }
    }

    // Disable input if already written
    if(_mjMyEntry?.text){
      const row = document.getElementById('mj-preview-input-row');
      if(row) row.innerHTML = `<div style="display:flex;align-items:center;gap:.5rem;padding:.45rem .7rem;"><div style="width:18px;height:18px;border-radius:50%;background:rgba(42,157,92,0.12);display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="#2a9d5c" stroke-width="1.8"><path d="M2 5l2.5 2.5L8 3"/></svg></div><span style="font-style:italic;font-size:.68rem;color:#2a9d5c;">You\'ve written today — this can\'t be changed</span></div>`;
    }

    // Streak
    const streakEl = document.getElementById('mj-preview-streak');
    if(streakEl){
      if(_mjStreakCount > 0){
        streakEl.textContent = `${_mjStreakCount} day streak 🔥`;
      } else {
        streakEl.textContent = 'Start your streak!';
        streakEl.style.color = 'var(--muted)';
        streakEl.style.fontWeight = '400';
      }
    }
  }

  function renderMemoryJarPage(){
    if(!ME || !OTHER) return;

    // Avatars
    applyAllAvatars && applyAllAvatars();

    // Today date
    const dateEl = document.getElementById('mj-today-date');
    if(dateEl) dateEl.textContent = _mjFmtDate(_mjTodayKey());

    // My entry
    const myTextEl = document.getElementById('mj-today-my-text');
    const myTimeEl = document.getElementById('mj-today-my-time');
    if(myTextEl){
      if(_mjMyEntry?.text){
        myTextEl.textContent = _mjMyEntry.text;
        myTextEl.className = 'mj-entry-text';
        if(myTimeEl) myTimeEl.textContent = `You · ${_mjFmtTime(_mjMyEntry.createdAt)}`;
      } else {
        myTextEl.textContent = "You haven't written yet today";
        myTextEl.className = 'mj-entry-text mj-empty-entry';
        if(myTimeEl) myTimeEl.textContent = '';
      }
    }

    // Other entry
    const otherTextEl = document.getElementById('mj-today-other-text');
    const otherTimeEl = document.getElementById('mj-today-other-time');
    if(otherTextEl){
      if(_mjOtherEntry?.text){
        otherTextEl.textContent = _mjOtherEntry.text;
        otherTextEl.className = 'mj-entry-text';
        if(otherTimeEl) otherTimeEl.textContent = `${OTHER} · ${_mjFmtTime(_mjOtherEntry.createdAt)}`;
      } else {
        otherTextEl.textContent = 'Waiting for their moment…';
        otherTextEl.className = 'mj-entry-text mj-empty-entry';
        if(otherTimeEl) otherTimeEl.textContent = '';
      }
    }

    // Badge
    const badgeEl = document.getElementById('mj-today-badge');
    if(badgeEl){
      const count = (_mjMyEntry?.text?1:0) + (_mjOtherEntry?.text?1:0);
      badgeEl.textContent = count===2 ? 'both wrote ✓' : count===1 ? '1 of 2' : '';
      badgeEl.className = 'mj-day-badge' + (count===2?' both':'');
    }

    // Disable input if written
    if(_mjMyEntry?.text) _mjSetInputDisabled(true, 'today');

    // Streak
    const swEl = document.getElementById('mj-page-streak-wrap');
    const snEl = document.getElementById('mj-page-streak-num');
    if(swEl && snEl){
      swEl.style.display = _mjStreakCount>0 ? 'inline-flex' : 'none';
      snEl.textContent = _mjStreakCount;
      updateMetricChips&&updateMetricChips();
    }
  }

  async function _mjLoadAndRender(){
    if(!db || !coupleId || !myUid || !partnerUid) return;
    const today = _mjTodayKey();

    // Listen to today's entries in real time
    if(_mjUnsub){ try{_mjUnsub();}catch(e){} _mjUnsub=null; }
    _mjUnsub = fbOnValue(dbRef(db,`couples/${coupleId}/memoryJar/${today}`), snap=>{
      const d = snap.val()||{};
      _mjMyEntry = d[myUid]||null;
      _mjOtherEntry = d[partnerUid]||null;
      renderMemoryJarPreview();
      renderMemoryJarPage();
    });

    // Calculate streak — lenient: today is skipped if incomplete (still in progress)
    try{
      await new Promise(res=>fbOnValue(dbRef(db,`couples/${coupleId}/memoryJar`), snap=>{
        const all = snap.val()||{};
        let streak = 0;
        const todayKey = _mjTodayKey();
        for(let i=0; i<365; i++){
          const d = new Date();
          d.setDate(d.getDate()-i);
          const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          const dayData = all[key]||{};
          const bothWrote = dayData[myUid]?.text && dayData[partnerUid]?.text;
          if(key === todayKey){
            // Today: if both wrote count it; if only one wrote, skip today (still in progress) and check yesterday
            if(bothWrote) streak++;
            // either way continue to yesterday — today being incomplete doesn't break streak
            continue;
          }
          // Past days: both must have written, otherwise streak is broken
          if(bothWrote) streak++;
          else break;
        }
        _mjStreakCount = streak;
        res();
      },{onlyOnce:true}));
    }catch(e){}

    renderMemoryJarPreview();
    renderMemoryJarPage();
    _mjRenderHistory();
  }

  function _mjRenderHistory(){
    if(!db || !coupleId) return;
    const histEl = document.getElementById('mj-history-list');
    if(!histEl) return;
    const today = _mjTodayKey();
    const MONTHS = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];

    fbOnValue(dbRef(db,`couples/${coupleId}/memoryJar`), snap=>{
      const all = snap.val()||{};
      const pastKeys = Object.keys(all)
        .filter(k=>k!==today)
        .sort().reverse();

      if(!pastKeys.length){
        histEl.innerHTML = '<p class="empty">No earlier memories yet — start writing!</p>';
        return;
      }

      // Group by YYYY-MM
      const byMonth = {};
      pastKeys.forEach(dateKey=>{
        const monthKey = dateKey.substring(0,7); // YYYY-MM
        if(!byMonth[monthKey]) byMonth[monthKey]=[];
        byMonth[monthKey].push(dateKey);
      });

      const monthKeys = Object.keys(byMonth).sort().reverse();
      const isCurrentMonth = (mk) => {
        const t = new Date();
        return mk === `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}`;
      };

      histEl.innerHTML = monthKeys.map((monthKey, mIdx)=>{
        const [yr, mo] = monthKey.split('-');
        const monthName = `${MONTHS[parseInt(mo)-1]} ${yr}`;
        const days = byMonth[monthKey];
        const totalDays = days.length;
        const bothCount = days.filter(dk=>{
          const dd = all[dk]||{};
          return dd[myUid]?.text && dd[partnerUid]?.text;
        }).length;
        const isOpen = mIdx === 0; // most recent month open by default
        const groupId = `mj-month-${monthKey.replace('-','_')}`;

        const dayCards = days.map(dateKey=>{
          const dayData = all[dateKey]||{};
          const myEntry = dayData[myUid];
          const otherEntry = dayData[partnerUid];
          const count = (myEntry?.text?1:0)+(otherEntry?.text?1:0);
          const badge = count===2?'both wrote ✓':count===1?'1 of 2':'';
          const badgeClass = count===2?'mj-day-badge both':'mj-day-badge';
          const _myAvHtml = myAvatarUrl
            ? `<img src="${_esc(myAvatarUrl)}" class="avatar-img-circle" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;"/>`
            : _esc((ME||'?')[0].toUpperCase());
          const _otherAvHtml = otherAvatarUrl
            ? `<img src="${_esc(otherAvatarUrl)}" class="avatar-img-circle" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;"/>`
            : _esc((OTHER||'?')[0].toUpperCase());
          const meRow = myEntry?.text
            ? `<div class="mj-entry-row"><div class="mj-avatar mj-avatar-me">${_myAvHtml}</div><div style="flex:1;"><div class="mj-entry-text">${_mjEscape(myEntry.text)}</div><div class="mj-entry-meta">${_esc(ME)} · ${_mjFmtTime(myEntry.createdAt)}</div></div></div>`
            : '';
          const otherRow = otherEntry?.text
            ? `<div class="mj-entry-row"><div class="mj-avatar mj-avatar-other">${_otherAvHtml}</div><div style="flex:1;"><div class="mj-entry-text">${_mjEscape(otherEntry.text)}</div><div class="mj-entry-meta">${_esc(OTHER)} · ${_mjFmtTime(otherEntry.createdAt)}</div></div></div>`
            : '';
          return `<div class="mj-day-card"><div class="mj-day-header"><span class="mj-day-date">${_mjFmtDate(dateKey)}</span><span class="${badgeClass}">${badge}</span></div>${meRow}${otherRow}</div>`;
        }).join('');

        const metaText = `${totalDays} day${totalDays!==1?'s':''} · both wrote ${bothCount} time${bothCount!==1?'s':''}`;

        return `<div class="mj-month-group">
          <div class="mj-month-header" onclick="window._mjToggleMonth('${groupId}')">
            <div>
              <div class="mj-month-name">${monthName}</div>
              <div class="mj-month-meta">${metaText}</div>
            </div>
            <span class="mj-month-arrow${isOpen?' open':''}" id="${groupId}-arrow">›</span>
          </div>
          <div class="mj-month-days${isOpen?' open':''}" id="${groupId}">
            ${dayCards}
          </div>
        </div>`;
      }).join('');
    },{onlyOnce:true});
  }

  window._mjToggleMonth = function(groupId){
    const days = document.getElementById(groupId);
    const arrow = document.getElementById(groupId+'-arrow');
    if(!days||!arrow) return;
    const isOpen = days.classList.contains('open');
    days.classList.toggle('open', !isOpen);
    arrow.classList.toggle('open', !isOpen);
  };

  function _mjEscape(str){
    return (str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  window.submitMemoryJar = async function(context){
    const inputId = context==='today' ? 'mj-today-input' : 'mj-preview-input';
    const input = document.getElementById(inputId);
    if(!input) return;
    const text = input.value.trim();
    if(!text || !db || !coupleId || !myUid) return;
    if(_mjMyEntry?.text) return; // already written today
    const today = _mjTodayKey();
    const entry = { text, createdAt: Date.now() };
    // Disable immediately so double-tap can't fire
    const sendBtn = document.getElementById(context==='today'?'mj-today-send':'mj-preview-send');
    if(sendBtn) sendBtn.disabled = true;
    try{
      await dbSet(dbRef(db,`couples/${coupleId}/memoryJar/${today}/${myUid}`), entry);
      input.value = '';
      // Brief confirmation flash
      const rowId = context==='today'?'mj-today-input-row':'mj-preview-input-row';
      const row = document.getElementById(rowId);
      // listener fires and updates display
    }catch(e){
      console.error('submitMemoryJar failed:', e);
      if(sendBtn) sendBtn.disabled = false;
    }
  };

  // ── TOGETHER MODE FEATURES ────────────────────────────────────

  // ── Time picker ────────────────────────────────────────────
  let _dnTimeVal = '19:00'; // default date night time

  // Helper: get local date string YYYY-MM-DD from a Date object (no UTC shift)
  function _localDateStr(d){
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }

  window.updateMeetupTime = function(val){
    if(!val || !meetupDate) return;
    _dnTimeVal = val;
    try{
      // Use LOCAL date parts — never toISOString() which shifts to UTC
      const dateStr = _localDateStr(meetupDate);
      const newDate = new Date(`${dateStr}T${val}:00`);
      meetupDate = newDate;
      if(db && coupleId){
        dbSet(dbRef(db,`couples/${coupleId}/meetupDate`), `${dateStr}T${val}:00`);
        // Also update unlock date on unread letter rounds in Together mode
        if(coupleType==='together' && letterRounds.length){
          letterRounds.forEach(round=>{
            if(!round._key || !round.unlockDate) return;
            const meData = round[myUid]||{};
            const otherData = round[partnerUid]||{};
            if(!meData.readAt && !otherData.readAt){
              dbSet(dbRef(db,`couples/${coupleId}/letters/${round._key}/unlockDate`), `${dateStr}T${val}:00`);
            }
          });
        }
      }
      startCountdown();
      // Refresh letter timeline if letter page is visible
      const letterPage = document.getElementById('page-letter');
      if(letterPage && letterPage.classList.contains('active')){
        initLetterPage && initLetterPage();
      }
    }catch(e){ console.error('updateMeetupTime failed:',e); }
  };

  function _showTimeInput(show){
    const ti = document.getElementById('meetup-time-input');
    if(ti) ti.style.display = show ? '' : 'none';
  }

  // ── Date night planner ────────────────────────────────────────
  let _dnUnsub = null;

  function _dnDateKey(){
    if(!meetupDate) return null;
    const d = meetupDate;
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function loadDnPlanner(){
    if(_dnUnsub){ try{_dnUnsub();}catch(e){} _dnUnsub=null; }
    const dateKey = _dnDateKey();
    if(!db||!coupleId||!dateKey) return;

    // Set date label
    const dateLabel = document.getElementById('dn-planner-date');
    if(dateLabel && meetupDate){
      const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      dateLabel.textContent = `${meetupDate.getDate()} ${months[meetupDate.getMonth()]}`;
    }

    _dnUnsub = fbOnValue(dbRef(db,`couples/${coupleId}/datePlan/${dateKey}`), snap=>{
      const d = snap.val()||{};
      _dnCurrentPlan = d;
      // Update display divs
      const whereEl = document.getElementById('dn-where-display');
      const whatEl = document.getElementById('dn-what-display');
      const whoEl = document.getElementById('dn-who-display');
      if(whereEl){ whereEl.textContent = d.where||'Not set yet'; whereEl.className = d.where ? 'dn-display-value' : 'dn-display-empty'; }
      if(whatEl){ whatEl.textContent = d.what||'Not set yet'; whatEl.className = d.what ? 'dn-display-value' : 'dn-display-empty'; }
      if(whoEl){ whoEl.textContent = d.who||'Not set yet'; whoEl.className = d.who ? 'dn-display-value' : 'dn-display-empty'; }
    });
  }

  // ── Today's plan ─────────────────────────────────────────────
  let _tpUnsub = null;

  function _tpTodayKey(){
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function loadTodaysPlan(){
    if(_tpUnsub){ try{_tpUnsub();}catch(e){} _tpUnsub=null; }
    if(!db||!coupleId||!myUid||!partnerUid) return;
    const today = _tpTodayKey();

    // Apply avatars (photos if available, initials as fallback)
    applyAllAvatars && applyAllAvatars();

    _tpUnsub = fbOnValue(dbRef(db,`couples/${coupleId}/todaysPlan/${today}`), snap=>{
      const d = snap.val()||{};
      _tpMyCurrentVal = d[myUid]||'';
      // My display
      const myDisplay = document.getElementById('tp-my-display');
      if(myDisplay){
        myDisplay.textContent = d[myUid]||'Nothing yet today';
        myDisplay.className = d[myUid] ? 'tp-display-value' : 'tp-display-empty';
      }
      // Other display
      const otherEl = document.getElementById('tp-other-text');
      if(otherEl){
        otherEl.textContent = d[partnerUid]||'Waiting for their plan…';
        otherEl.className = d[partnerUid] ? 'tp-display-value' : 'tp-display-empty';
      }
    });
  }

  // ── BOTTOM SHEET SWIPE DISMISS ────────────────────────────────
  function _initSheetSwipe(sheetId, overlayId, closeFn){
    const sheet = document.getElementById(sheetId);
    const handle = sheet?.querySelector('.together-sheet-handle');
    if(!sheet || !handle) return;
    // Remove previous listeners to prevent accumulation on repeat opens
    if(handle._swipeCleanup) handle._swipeCleanup();
    let startY = 0, currentY = 0, dragging = false;
    const onStart = (e) => {
      startY = (e.touches ? e.touches[0].clientY : e.clientY);
      dragging = true;
      sheet.style.transition = 'none';
    };
    const onMove = (e) => {
      if(!dragging) return;
      currentY = (e.touches ? e.touches[0].clientY : e.clientY);
      const dy = Math.max(0, currentY - startY);
      sheet.style.transform = `translateY(${dy}px)`;
      if(e.cancelable) e.preventDefault();
    };
    const onEnd = () => {
      if(!dragging) return;
      dragging = false;
      sheet.style.transition = 'transform .25s ease';
      const dy = Math.max(0, currentY - startY);
      if(dy > 80){
        sheet.style.transform = 'translateY(100%)';
        setTimeout(()=>{ closeFn(); sheet.style.transform=''; sheet.style.transition=''; },250);
      } else {
        sheet.style.transform = '';
        setTimeout(()=>{ sheet.style.transition=''; },250);
      }
    };
    handle.addEventListener('touchstart', onStart, {passive:true});
    handle.addEventListener('touchmove', onMove, {passive:false});
    handle.addEventListener('touchend', onEnd);
    handle.addEventListener('mousedown', onStart);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    // Store cleanup fn on handle element for next open
    handle._swipeCleanup = () => {
      handle.removeEventListener('touchstart', onStart);
      handle.removeEventListener('touchmove', onMove);
      handle.removeEventListener('touchend', onEnd);
      handle.removeEventListener('mousedown', onStart);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
    };
  }

  // ── Date Night Sheet ────────────────────────────────────────
  window.openDnSheet = function(){
    document.getElementById('bottom-nav').style.display='none';
    // Pre-fill with current values
    const d = _dnCurrentPlan||{};
    const w = document.getElementById('dn-sheet-where');
    const wh = document.getElementById('dn-sheet-what');
    const who = document.getElementById('dn-sheet-who');
    if(w) w.value = d.where||'';
    if(wh) wh.value = d.what||'';
    if(who) who.value = d.who||'';
    document.getElementById('dn-sheet-overlay').classList.add('open');
    setTimeout(()=>w?.focus(),100);
    _initSheetSwipe('dn-sheet','dn-sheet-overlay', closeDnSheet);
  };

  window.closeDnSheet = function(){
    document.getElementById('bottom-nav').style.display='flex';
    document.getElementById('dn-sheet-overlay').classList.remove('open');
  };

  window.saveDnSheet = async function(){
    const dateKey = _dnDateKey();
    if(!db||!coupleId||!dateKey) return;
    const plan = {
      where: document.getElementById('dn-sheet-where')?.value.trim()||'',
      what: document.getElementById('dn-sheet-what')?.value.trim()||'',
      who: document.getElementById('dn-sheet-who')?.value.trim()||'',
      updatedAt: Date.now()
    };
    try{
      await dbSet(dbRef(db,`couples/${coupleId}/datePlan/${dateKey}`), plan);
      closeDnSheet();
    }catch(e){ console.error('saveDnSheet failed:',e); }
  };

  let _dnCurrentPlan = {};

  // ── Today's Plan Sheet ──────────────────────────────────────
  window.openTpSheet = function(){
    document.getElementById('bottom-nav').style.display='none';
    const inp = document.getElementById('tp-sheet-input');
    const ctr = document.getElementById('tp-sheet-counter');
    if(inp){ inp.value = _tpMyCurrentVal||''; }
    if(ctr && inp) ctr.textContent = (inp.value.length)+'/150';
    document.getElementById('tp-sheet-overlay').classList.add('open');
    setTimeout(()=>inp?.focus(),100);
    _initSheetSwipe('tp-sheet','tp-sheet-overlay', closeTpSheet);
  };

  window.closeTpSheet = function(){
    document.getElementById('bottom-nav').style.display='flex';
    document.getElementById('tp-sheet-overlay').classList.remove('open');
  };

  window.saveTpSheet = async function(){
    if(!db||!coupleId||!myUid) return;
    const today = _tpTodayKey();
    const val = document.getElementById('tp-sheet-input')?.value.trim()||'';
    try{
      await dbSet(dbRef(db,`couples/${coupleId}/todaysPlan/${today}/${myUid}`), val);
      closeTpSheet();
    }catch(e){ console.error('saveTpSheet failed:',e); }
  };

  let _tpMyCurrentVal = '';

  // ── Memory Jar Sheet ────────────────────────────────────────
  window.openMjSheet = function(){
    document.getElementById('bottom-nav').style.display='none';
    if(_mjMyEntry?.text) return; // already written today
    const inp = document.getElementById('mj-sheet-input');
    const ctr = document.getElementById('mj-sheet-counter');
    if(inp){ inp.value = ''; }
    if(ctr) ctr.textContent = '0/200';
    document.getElementById('mj-sheet-overlay').classList.add('open');
    setTimeout(()=>inp?.focus(),100);
    _initSheetSwipe('mj-sheet','mj-sheet-overlay', closeMjSheet);
  };

  window.closeMjSheet = function(){
    document.getElementById('bottom-nav').style.display='flex';
    document.getElementById('mj-sheet-overlay').classList.remove('open');
  };

  window.saveMjSheet = async function(){
    const inp = document.getElementById('mj-sheet-input');
    const text = inp?.value.trim()||'';
    if(!text||!db||!coupleId||!myUid) return;
    if(_mjMyEntry?.text) return;
    const saveBtn = document.getElementById('mj-sheet-save');
    if(saveBtn) saveBtn.disabled = true;
    const today = _mjTodayKey();
    const entry = { text, createdAt: Date.now() };
    try{
      await dbSet(dbRef(db,`couples/${coupleId}/memoryJar/${today}/${myUid}`), entry);
      closeMjSheet();
    }catch(e){
      console.error('saveMjSheet failed:',e);
      if(saveBtn) saveBtn.disabled = false;
    }
  };

  // ── HOME TABS ──────────────────────────────────────────
  window.switchHomeTab = function(tab){
    ['now','us','moments'].forEach(t=>{
      document.getElementById(`tab-${t}`).classList.toggle('active', t===tab);
      const panel = document.getElementById(`panel-${t}`);
      panel.classList.toggle('active', t===tab);
      if(t===tab) panel.scrollTop = 0;
    });
    // Re-invalidate map size when Now tab shown — Leaflet needs visible container
    if(tab==='now' && mapInstance){
      setTimeout(()=>{ try{ mapInstance.invalidateSize(); }catch(e){} }, 50);
    }
  };

  // Update dynamic subtitles on Moments tab
  function updateMomentsSubtitles(){
    const msCount = localMilestones ? localMilestones.length : 0;
    const msEl = document.getElementById('moments-milestone-sub');
    if(msEl) msEl.textContent = msCount > 0 ? `${msCount} moment${msCount!==1?'s':''} together` : 'Your shared moments';

    const blTotal = localBucket ? localBucket.length : 0;
    const blDone = localBucket ? localBucket.filter(i=>i.done).length : 0;
    const blEl = document.getElementById('moments-bucket-sub');
    if(blEl) blEl.textContent = blTotal > 0 ? `${blDone} of ${blTotal} done` : 'Dreams to share';

    // Letter sub — show next unlock date if exists
    const ltEl = document.getElementById('moments-letter-sub');
    if(ltEl && meetupDate){
      const _y=meetupDate.getFullYear(),_m=String(meetupDate.getMonth()+1).padStart(2,'0'),_d=String(meetupDate.getDate()).padStart(2,'0');
      ltEl.textContent = `Opens ${_d}.${_m}.${_y}`;
    }
  }

  // Update bucket progress on Us tab
  function updateHomeBucketProgress(){
    if(!localBucket) return;
    const total = localBucket.length;
    const done = localBucket.filter(i=>i.done).length;
    const pct = total > 0 ? Math.round((done/total)*100) : 0;
    const doneEl = document.getElementById('home-bl-done');
    const totalEl = document.getElementById('home-bl-total');
    const barEl = document.getElementById('home-bl-bar');
    if(doneEl) doneEl.textContent = done;
    if(totalEl) totalEl.textContent = total;
    if(barEl) barEl.style.width = `${pct}%`;
  }

  // ── STATUS + MOOD ────────────────────────────────────────
  let _selectedActivity = null;
  let _selectedMood = null;
  const STATUS_EXPIRY_MS = 8 * 60 * 60 * 1000; // 8 hours

  function fmtStatusTime(ts){
    if(!ts) return '';
    const diff = Date.now() - ts;
    const mins = Math.floor(diff/60000);
    const hrs = Math.floor(diff/3600000);
    if(mins < 1) return 'Just now';
    if(mins < 60) return `${mins}m ago`;
    return `${hrs}h ago`;
  }

  const ACTIVITY_EMOJI = {
    'Working':'💼','Reading':'📖','Music':'🎵','Eating':'🍽️',
    'Gaming':'🎮','Sports':'⚽','Resting':'😴','Traveling':'✈️','Cooking':'🍳',
    'Outside':'☀️','Shopping':'🛍️','Studying':'📚'
  };

  function renderStatusCard(){
    const now = Date.now();
    // Set names
    const myNameEl = document.getElementById('status-my-name');
    const otherNameEl = document.getElementById('status-other-name');
    if(myNameEl) myNameEl.textContent = ME||'—';
    if(otherNameEl) otherNameEl.textContent = OTHER||'—';

    // My status
    const myEmoji = document.getElementById('status-my-emoji');
    const myActivity = document.getElementById('status-my-activity');
    const myMood = document.getElementById('status-my-mood');
    const myTime = document.getElementById('status-my-time');
    const myExpired = !myStatus || !myStatus.updatedAt || (now - myStatus.updatedAt > STATUS_EXPIRY_MS);
    if(myExpired){
      if(myEmoji){ myEmoji.textContent = '💤'; myEmoji.style.opacity='.35'; }
      if(myActivity) myActivity.innerHTML = '<span class="status-empty">No status set</span>';
      if(myMood) myMood.textContent = '';
      if(myTime) myTime.textContent = '';
    } else {
      if(myEmoji){ myEmoji.textContent = ACTIVITY_EMOJI[myStatus.activity]||'—'; myEmoji.style.opacity='1'; }
      if(myActivity) myActivity.textContent = myStatus.activity||'';
      if(myMood) myMood.textContent = myStatus.mood ? `feeling ${myStatus.mood}` : '';
      if(myTime) myTime.textContent = fmtStatusTime(myStatus.updatedAt);
    }

    // Partner status
    const otherEmoji = document.getElementById('status-other-emoji');
    const otherActivity = document.getElementById('status-other-activity');
    const otherMood = document.getElementById('status-other-mood');
    const otherTime = document.getElementById('status-other-time');
    const otherExpired = !otherStatus || !otherStatus.updatedAt || (now - otherStatus.updatedAt > STATUS_EXPIRY_MS);
    if(otherExpired){
      if(otherEmoji){ otherEmoji.textContent = '💤'; otherEmoji.style.opacity='.35'; }
      if(otherActivity) otherActivity.innerHTML = '<span class="status-empty">No status set</span>';
      if(otherMood) otherMood.textContent = '';
      if(otherTime) otherTime.textContent = '';
    } else {
      if(otherEmoji){ otherEmoji.textContent = ACTIVITY_EMOJI[otherStatus.activity]||'—'; otherEmoji.style.opacity='1'; }
      if(otherActivity) otherActivity.textContent = otherStatus.activity||'';
      if(otherMood) otherMood.textContent = otherStatus.mood ? `feeling ${otherStatus.mood}` : '';
      if(otherTime) otherTime.textContent = fmtStatusTime(otherStatus.updatedAt);
    }
  }

  window.openStatusSheet = function(){
    document.getElementById('bottom-nav').style.display='none';
    // Pre-select current values
    document.querySelectorAll('.status-act-opt').forEach(el=>{
      el.classList.toggle('selected', el.dataset.activity === (myStatus?.activity||null));
    });
    document.querySelectorAll('.status-mood-pill').forEach(el=>{
      el.classList.toggle('selected', el.dataset.mood === (myStatus?.mood||null));
    });
    _selectedActivity = myStatus?.activity||null;
    _selectedMood = myStatus?.mood||null;
    document.getElementById('status-sheet-overlay').classList.add('open');
    // Wire swipe-to-dismiss on the status sheet handle
    const sheet = document.getElementById('status-sheet-overlay')?.querySelector('.status-sheet');
    const handle = sheet?.querySelector('.status-sheet-handle');
    if(sheet && handle){
      // Clean up previous listeners before adding new ones
      if(handle._swipeCleanup) handle._swipeCleanup();
      let startY=0, currentY=0, dragging=false;
      const onStart=(e)=>{ startY=(e.touches?e.touches[0].clientY:e.clientY); dragging=true; sheet.style.transition='none'; };
      const onMove=(e)=>{ if(!dragging)return; currentY=(e.touches?e.touches[0].clientY:e.clientY); const dy=Math.max(0,currentY-startY); sheet.style.transform=`translateY(${dy}px)`; if(e.cancelable)e.preventDefault(); };
      const onEnd=()=>{ if(!dragging)return; dragging=false; sheet.style.transition='transform .25s ease'; const dy=Math.max(0,currentY-startY); if(dy>80){ sheet.style.transform='translateY(100%)'; setTimeout(()=>{ window.closeStatusSheet(); sheet.style.transform=''; sheet.style.transition=''; },250); } else { sheet.style.transform=''; setTimeout(()=>{ sheet.style.transition=''; },250); } };
      handle.addEventListener('touchstart', onStart, {passive:true});
      handle.addEventListener('touchmove', onMove, {passive:false});
      handle.addEventListener('touchend', onEnd);
      handle.addEventListener('mousedown', onStart);
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onEnd);
      // Remove previous listeners on next open
      if(handle._swipeCleanup) handle._swipeCleanup();
      handle._swipeCleanup = () => {
        handle.removeEventListener('touchstart', onStart);
        handle.removeEventListener('touchmove', onMove);
        handle.removeEventListener('touchend', onEnd);
        handle.removeEventListener('mousedown', onStart);
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onEnd);
      };
    }
  };

  window.closeStatusSheet = function(){
    document.getElementById('bottom-nav').style.display='flex';
    document.getElementById('status-sheet-overlay').classList.remove('open');
  };

  window.selectActivity = function(el){
    document.querySelectorAll('.status-act-opt').forEach(o=>o.classList.remove('selected'));
    el.classList.add('selected');
    _selectedActivity = el.dataset.activity;
  };

  window.selectMood = function(el){
    document.querySelectorAll('.status-mood-pill').forEach(o=>o.classList.remove('selected'));
    el.classList.add('selected');
    _selectedMood = el.dataset.mood;
  };

  window.saveStatus = async function(){
    if(!_selectedActivity && !_selectedMood) return;
    if(!db||!coupleId||!myUid) return;
    const status = {
      activity: _selectedActivity||null,
      mood: _selectedMood||null,
      updatedAt: Date.now()
    };
    try{
      await dbSet(dbRef(db,`couples/${coupleId}/presence/${myUid}/status`), status);
      myStatus = status;
      renderStatusCard();
      closeStatusSheet();
    }catch(e){
      console.error('saveStatus failed:', e);
    }
  };

  // Start a 1-minute interval to refresh status time labels and check expiry
  function startStatusRefresh(){
    if(statusRefreshInterval) clearInterval(statusRefreshInterval);
    statusRefreshInterval = setInterval(()=>{ renderStatusCard(); }, 60000);
  }

  // ── AVATAR ─────────────────────────────────────────────────────
  // All element IDs that show MY avatar
  const MY_AVATAR_IDS = [
    'tp-my-avatar','mj-preview-my-avatar','mj-today-my-avatar',
    'settings-avatar-wrap','home-avatar-me'
  ];
  // All element IDs that show PARTNER avatar
  const OTHER_AVATAR_IDS = [
    'tp-other-avatar','mj-preview-other-avatar','mj-today-other-avatar',
    'home-avatar-other'
  ];

  function _applyAvatar(el, url, initial, isMe){
    if(!el) return;
    // Settings wrap (special structure)
    if(el.id === 'settings-avatar-wrap'){
      const img = document.getElementById('settings-avatar-img');
      const ini = document.getElementById('settings-avatar-initial');
      const hint = document.getElementById('settings-avatar-hint');
      if(url){
        if(img){ img.src = url; img.style.display = 'block'; }
        if(ini) ini.style.display = 'none';
        if(hint) hint.textContent = 'Tap to change photo';
      } else {
        if(img) img.style.display = 'none';
        if(ini){ ini.style.display = ''; ini.textContent = initial; }
        if(hint) hint.textContent = 'Tap to upload a photo';
      }
      return;
    }
    // Home avatar circles (have initial span + img slot)
    if(el.id === 'home-avatar-me' || el.id === 'home-avatar-other'){
      const ini = el.querySelector('.home-avatar-initial');
      let img = el.querySelector('img');
      if(url){
        if(!img){ img = document.createElement('img'); img.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%;'; el.appendChild(img); }
        img.src = url; img.style.display = 'block';
        if(ini) ini.style.display = 'none';
      } else {
        if(img) img.style.display = 'none';
        if(ini){ ini.style.display = ''; ini.textContent = initial; }
      }
      return;
    }
    // Standard avatar circle
    if(url){
      el.innerHTML = `<img src="${url}" class="avatar-img-circle" alt=""/>`;
    } else {
      el.textContent = initial;
    }
  }

  function applyAllAvatars(){
    const myInitial = (ME||'?')[0].toUpperCase();
    const otherInitial = (OTHER||'?')[0].toUpperCase();
    MY_AVATAR_IDS.forEach(id => _applyAvatar(document.getElementById(id), myAvatarUrl, myInitial, true));
    OTHER_AVATAR_IDS.forEach(id => _applyAvatar(document.getElementById(id), otherAvatarUrl, otherInitial, false));
    // Re-render MJ history so old entries also show updated avatar
    if(document.getElementById('mj-history-list')?.children.length > 0){
      _mjRenderHistory && _mjRenderHistory();
    }
  }

  async function loadAvatars(){
    if(!myUid || !partnerUid || !db) return;
    // Cancel any existing avatar listeners
    if(_myAvatarUnsub){ try{_myAvatarUnsub();}catch(e){} _myAvatarUnsub=null; }
    if(_otherAvatarUnsub){ try{_otherAvatarUnsub();}catch(e){} _otherAvatarUnsub=null; }
    try{
      // Persistent listeners — avatars update in real-time if partner uploads
      _myAvatarUnsub = fbOnValue(dbRef(db,`users/${myUid}/avatarUrl`), snap=>{
        myAvatarUrl = snap.val()||null;
        applyAllAvatars();
      });
      _otherAvatarUnsub = fbOnValue(dbRef(db,`users/${partnerUid}/avatarUrl`), snap=>{
        otherAvatarUrl = snap.val()||null;
        applyAllAvatars();
      });
    }catch(e){ console.error('loadAvatars failed:',e); }
  }

  // ── Onboarding avatar (before couple exists) ─────────────────────────
  window.triggerOnboardAvatarUpload = function(){
    document.getElementById('onboard-avatar-input')?.click();
  };

  window.handleOnboardAvatarUpload = async function(input){
    const file = input.files?.[0];
    if(!file) return;
    if(file.size > 5*1024*1024){ alert('Photo must be under 5MB.'); return; }
    const hint = document.getElementById('onboard-avatar-hint');
    const preview = document.getElementById('onboard-avatar-preview');
    const icon = document.getElementById('onboard-avatar-icon');
    if(hint) hint.textContent = 'Resizing…';
    try{
      const blob = await _resizeImage(file, 400);
      _onboardAvatarBlob = blob;
      // Show preview immediately — no upload yet (uid might not be set)
      const previewUrl = URL.createObjectURL(blob);
      if(preview){ preview.src = previewUrl; preview.style.display = 'block'; }
      if(icon) icon.style.display = 'none';
      if(hint){ hint.innerHTML = 'Looking good! <span style="opacity:.6;">(tap to change)</span>'; }
    }catch(e){
      console.error('handleOnboardAvatarUpload failed:',e);
      if(hint) hint.textContent = 'Could not process photo — try again';
    }
    input.value = '';
  };

  // Called from doOnboarding after uid is confirmed — uploads stored blob
  async function _uploadOnboardAvatar(uid){
    if(!_onboardAvatarBlob || !uid) return;
    try{
      const {getStorage, ref: sRef, uploadBytes, getDownloadURL} =
        await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js');
      const storage = getStorage();
      const storageReference = sRef(storage, `avatars/${uid}.jpg`);
      await uploadBytes(storageReference, _onboardAvatarBlob, {contentType:'image/jpeg'});
      const url = await getDownloadURL(storageReference);
      await dbSet(dbRef(db,`users/${uid}/avatarUrl`), url);
      myAvatarUrl = url;
      _onboardAvatarBlob = null;
      // Apply avatar everywhere now that upload succeeded
      applyAllAvatars();
    }catch(e){
      console.error('_uploadOnboardAvatar failed:',e);
      // Show subtle hint on linking screen that photo upload failed
      const hint = document.getElementById('onboard-avatar-hint');
      if(hint) hint.textContent = 'Photo upload failed — add it later in settings';
    }
  }

  window.triggerAvatarUpload = function(){
    document.getElementById('avatar-file-input')?.click();
  };

  window.handleAvatarUpload = async function(input){
    const file = input.files?.[0];
    if(!file || !myUid || !db) return;
    if(file.size > 5*1024*1024){
      alert('Photo must be under 5MB.'); return;
    }
    const hint = document.getElementById('settings-avatar-hint');
    if(hint) hint.textContent = 'Uploading…';
    // 15s timeout guard
    const _uploadTimeout = setTimeout(()=>{
      if(hint && hint.textContent === 'Uploading…') hint.textContent = 'Taking too long — check connection and try again';
    }, 15000);
    try{
      // Resize to 400x400 via canvas before upload
      const resized = await _resizeImage(file, 400);
      // Upload to Firebase Storage
      const {getStorage, ref: sRef, uploadBytes, getDownloadURL} = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js');
      const storage = getStorage();
      const path = `avatars/${myUid}.jpg`;
      const storageReference = sRef(storage, path);
      await uploadBytes(storageReference, resized, {contentType:'image/jpeg'});
      const url = await getDownloadURL(storageReference);
      clearTimeout(_uploadTimeout);
      // Save URL to Firebase
      await dbSet(dbRef(db,`users/${myUid}/avatarUrl`), url);
      myAvatarUrl = url;
      applyAllAvatars();
      if(hint) hint.textContent = 'Tap to change photo';
    }catch(e){
      clearTimeout(_uploadTimeout);
      console.error('handleAvatarUpload failed:',e);
      if(hint) hint.textContent = 'Upload failed — try again';
    }
    input.value = '';
  };

  async function _resizeImage(file, maxSize){
    return new Promise((resolve, reject)=>{
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = ()=>{
        // Centre-crop to square first, then resize — prevents distortion in circles
        const size = Math.min(img.width, img.height);
        const sx = Math.round((img.width - size) / 2);
        const sy = Math.round((img.height - size) / 2);
        const canvas = document.createElement('canvas');
        canvas.width = maxSize;
        canvas.height = maxSize;
        // Draw centre-cropped square at target size
        canvas.getContext('2d').drawImage(img, sx, sy, size, size, 0, 0, maxSize, maxSize);
        URL.revokeObjectURL(url);
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Canvas toBlob failed')), 'image/jpeg', 0.85);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  window.autoSaveName = async function(val){
    const name = (val||'').trim();
    const err = document.getElementById('settings-profile-error');
    const success = document.getElementById('settings-profile-success');
    if(err) err.textContent = '';
    if(!name){
      if(err) err.textContent = 'Name cannot be empty.';
      // Restore previous value
      const el = document.getElementById('settings-name');
      if(el) el.value = ME||'';
      return;
    }
    if(name === ME) return; // no change
    try{
      await dbSet(dbRef(db, `users/${myUid}/name`), name);
      if(myCity) await dbSet(dbRef(db, `users/${myUid}/city`), myCity);
      await dbSet(dbRef(db, `couples/${coupleId}/members/${myUid}`), {
        name, city: myCity||'', role: myRole||'owner'
      });
      ME = name;
      myName = name;
      // Update greeting + couple name
      const greet = document.getElementById('home-greeting');
      if(greet) greet.textContent = name;
      const sbEl = null; // removed sidebar
      if(sbEl) sbEl.innerHTML = `${_esc(ME)} <em>&</em> ${_esc(OTHER)}`;
      const mhEl = document.getElementById('mobile-header-couple-name');
      if(mhEl) mhEl.innerHTML = `${_esc(ME)} <em>&</em> ${_esc(OTHER)}`;
      if(success){ success.style.display='block'; success.textContent='Name saved.';
        setTimeout(()=>{ success.style.display='none'; },2000); }
    }catch(e){
      console.error('autoSaveName failed:',e);
      if(err) err.textContent = 'Could not save — try again.';
      // Restore
      const el = document.getElementById('settings-name');
      if(el) el.value = ME||'';
    }
  };

  window.autoSaveStartDate = async function(val){
    if(!val || !db || !coupleId) return;
    const parsed = new Date(val+'T12:00:00');
    if(parsed > new Date()){
      // Future date — flash the input red
      const el = document.getElementById('settings-start-date');
      if(el){ el.style.color='var(--danger,#c0392b)'; setTimeout(()=>el.style.color='',2000); }
      return;
    }
    if(val === coupleStartDate) return; // no change
    try{
      await dbSet(dbRef(db,`couples/${coupleId}/startDate`), val);
      coupleStartDate = val;
      // Brief success indicator
      const el = document.getElementById('settings-start-date');
      if(el){ el.style.color='var(--green,#2a9d5c)'; setTimeout(()=>el.style.color='',1500); }
    }catch(e){ console.error('autoSaveStartDate failed:',e); }
  };

  window.toggleLinkingDeleteConfirm = function(){
    const box = document.getElementById('linking-delete-confirm');
    const inp = document.getElementById('linking-delete-input');
    const err = document.getElementById('linking-delete-error');
    if(!box) return;
    const isVisible = box.style.display !== 'none';
    box.style.display = isVisible ? 'none' : 'block';
    if(!isVisible){
      if(inp){ inp.value = ''; inp.focus(); }
      const pw = document.getElementById('linking-delete-pw');
      if(pw) pw.value = '';
      if(err) err.textContent = '';
    }
  };

  window.doLinkingDeleteAccount = async function(){
    const inp = document.getElementById('linking-delete-input');
    const err = document.getElementById('linking-delete-error');
    const btn = document.getElementById('linking-delete-btn');
    if(!inp || !err || !btn) return;
    err.textContent = '';

    if(inp.value.trim() !== 'DELETE'){
      err.textContent = 'Please type DELETE exactly to confirm.';
      return;
    }
    if(!fbAuth?.currentUser || !db || !myUid){
      err.textContent = 'Something went wrong. Please try again.';
      return;
    }

    // Validate password field
    const pw = document.getElementById('linking-delete-pw')?.value;
    if(!pw){ err.textContent = 'Please enter your password to confirm.'; return; }

    // Reauthenticate BEFORE any state changes
    btn.textContent = 'Verifying…'; btn.disabled = true;
    try{
      const credential = fbAuth.EmailAuthProvider.credential(fbAuth.currentUser.email, pw);
      await fbAuth.reauthenticateWithCredential(fbAuth.currentUser, credential);
    }catch(reAuthErr){
      btn.textContent = 'Delete my account'; btn.disabled = false;
      if(reAuthErr.code === 'auth/wrong-password' || reAuthErr.code === 'auth/invalid-credential'){
        err.textContent = 'Incorrect password. Please try again.';
      } else {
        err.textContent = 'Could not verify your identity. Please try again.';
      }
      return;
    }

    btn.textContent = 'Deleting…';
    _selfDeleting = true;

    // Helper: silently delete a Storage file
    const _del = async (path) => {
      if(!path || !storage || !fbStorageRef || !fbDeleteObject) return;
      try{ await fbDeleteObject(fbStorageRef(storage, path)); }
      catch(e){ console.warn('Storage delete skipped:', path, e.code); }
    };

    // Capture auth user reference before any async ops that might invalidate it
    const _authUser = fbAuth.currentUser;

    try{
      if(coupleId){
        // ── 1. Read all milestone photoPath values before deleting RTDB ──
        let milestonePaths = [];
        try{
          await new Promise((res) => fbOnValue(dbRef(db,`couples/${coupleId}/milestones`), snap=>{
            const data = snap.val();
            if(data){ Object.values(data).forEach(m=>{ if(m.photoPath) milestonePaths.push(m.photoPath); }); }
            res();
          }, ()=>res(), {onlyOnce:true}));
        }catch(e){ console.warn('Could not read milestones for cleanup:', e); }

        // ── 2. Read invite code from couple doc ──
        let storedCode = null;
        try{
          await new Promise((res) => fbOnValue(dbRef(db,`couples/${coupleId}/inviteCode`), snap=>{
            storedCode = snap.val()||null; res();
          }, ()=>res(), {onlyOnce:true}));
          if(!storedCode){
            await new Promise((res) => fbOnValue(dbRef(db,`users/${myUid}/inviteCode`), snap=>{
              storedCode = snap.val()||null; res();
            }, ()=>res(), {onlyOnce:true}));
          }
        }catch(e){}

        // ── 3. Delete Storage files ──
        await _del(`avatars/${myUid}.jpg`);
        await Promise.all(milestonePaths.map(p => _del(p)));

        // ── 4. Delete invite document BEFORE wiping couple node ──
        if(storedCode){
          try{ await dbRemove(dbRef(db, `invites/${storedCode}`)); }
          catch(e){ console.warn('Could not delete invite — may already be gone:', e.code); }
        }

        // ── 5. Wipe couple node via multi-path update ──
        // Equivalent to dbRemove("couples/X"). Parent .write rule (member check)
        // grants access — shallower rules override deeper ones in RTDB.
        const coupleWipe = {};
        coupleWipe[`couples/${coupleId}`] = null;
        await dbUpdate(dbRef(db), coupleWipe);

        // ── 6. Clear own user record ──
        await dbSet(dbRef(db, `users/${myUid}/coupleId`), null);
        await dbSet(dbRef(db, `users/${myUid}/inviteCode`), null);
      } else {
        // Solo account — just delete avatar
        await _del(`avatars/${myUid}.jpg`);
      }

      // ── 7. Delete own user RTDB record ──
      await dbRemove(dbRef(db, `users/${myUid}`));

      // ── 8. Delete Firebase Auth account ──
      const currentUser = fbAuth.currentUser || _authUser;
      if(currentUser) await fbAuth.deleteUser(currentUser);

    }catch(e){
      console.error('doLinkingDeleteAccount failed:', e);
      // Try auth deletion even if RTDB failed
      try{
        const currentUser = fbAuth.currentUser || _authUser;
        if(currentUser) await fbAuth.deleteUser(currentUser);
        return;
      }catch(authErr){
        console.error('Auth deletion failed:', authErr);
        _selfDeleting = false;
        btn.textContent = 'Delete my account'; btn.disabled = false;
        err.textContent = 'Something went wrong — please try again.';
      }
    }
  };

  window.showDeleteConfirm = function(){
    const box = document.getElementById('settings-delete-confirm');
    const inp = document.getElementById('settings-delete-input');
    const err = document.getElementById('settings-delete-error');
    if(!box) return;
    box.style.display = 'block';
    if(inp){ inp.value = ''; inp.focus(); }
    if(err) err.textContent = '';
    // Scroll to it
    setTimeout(()=>box.scrollIntoView({behavior:'smooth',block:'center'}), 100);
  };

  window.hideDeleteConfirm = function(){
    const box = document.getElementById('settings-delete-confirm');
    const inp = document.getElementById('settings-delete-input');
    const pw  = document.getElementById('settings-delete-pw');
    const err = document.getElementById('settings-delete-error');
    if(box) box.style.display = 'none';
    if(inp) inp.value = '';
    if(pw)  pw.value = '';
    if(err) err.textContent = '';
  };

  window.doDeleteAccount = async function(){
    const inp = document.getElementById('settings-delete-input');
    const err = document.getElementById('settings-delete-error');
    const btn = document.getElementById('btn-delete-account');
    if(!inp || !err || !btn) return;
    err.textContent = '';

    if(inp.value.trim() !== 'DELETE'){
      err.textContent = 'Please type DELETE exactly to confirm.';
      return;
    }
    if(!fbAuth?.currentUser || !db || !myUid){
      err.textContent = 'Something went wrong. Please try again.';
      return;
    }

    // Validate password field
    const pw = document.getElementById('settings-delete-pw')?.value;
    if(!pw){ err.textContent = 'Please enter your password to confirm.'; return; }

    // Reauthenticate BEFORE any state changes — clean failure if wrong password
    btn.textContent = 'Verifying…'; btn.disabled = true;
    try{
      const credential = fbAuth.EmailAuthProvider.credential(fbAuth.currentUser.email, pw);
      await fbAuth.reauthenticateWithCredential(fbAuth.currentUser, credential);
    }catch(reAuthErr){
      btn.textContent = 'Delete everything'; btn.disabled = false;
      if(reAuthErr.code === 'auth/wrong-password' || reAuthErr.code === 'auth/invalid-credential'){
        err.textContent = 'Incorrect password. Please try again.';
      } else {
        err.textContent = 'Could not verify your identity. Please try again.';
      }
      return;
    }

    btn.textContent = 'Deleting…';
    _selfDeleting = true; // prevent partner-deleted message from showing for self

    // Helper: silently delete a Storage file — never throws
    const _delStorage = async (path) => {
      if(!path || !storage || !fbStorageRef || !fbDeleteObject) return;
      try{ await fbDeleteObject(fbStorageRef(storage, path)); }
      catch(e){ console.warn('Storage delete skipped:', path, e.code); }
    };

    // Capture auth user reference before any async ops that might invalidate it
    const _authUser = fbAuth.currentUser;

    try{
      const user = _authUser;

      if(coupleId){
        // ── 1. Read all milestone photoPath values before deleting RTDB ──
        let milestonePaths = [];
        try{
          await new Promise((res) => fbOnValue(dbRef(db,`couples/${coupleId}/milestones`), snap=>{
            const data = snap.val();
            if(data){
              Object.values(data).forEach(m=>{
                if(m.photoPath) milestonePaths.push(m.photoPath);
              });
            }
            res();
          }, ()=>res(), {onlyOnce:true}));
        }catch(e){ console.warn('Could not read milestones for cleanup:', e); }

        // ── 2. Read invite code — from couple doc (accessible to both owner and joiner) ──
        let storedCode = null;
        try{
          await new Promise((res) => fbOnValue(dbRef(db,`couples/${coupleId}/inviteCode`), snap=>{
            storedCode = snap.val()||null; res();
          }, ()=>res(), {onlyOnce:true}));
          // Fallback to own user record (backward compat with older couples)
          if(!storedCode){
            await new Promise((res) => fbOnValue(dbRef(db,`users/${myUid}/inviteCode`), snap=>{
              storedCode = snap.val()||null; res();
            }, ()=>res(), {onlyOnce:true}));
          }
        }catch(e){}

        // ── 3. Delete all Storage files ───────────────────────────────
        // My avatar
        await _delStorage(`avatars/${myUid}.jpg`);
        // All milestone photos
        await Promise.all(milestonePaths.map(p => _delStorage(p)));

        // ── 4. Delete invite document BEFORE wiping couple node ───────
        // Must happen while user is still a couple member.
        if(storedCode){
          try{ await dbRemove(dbRef(db, `invites/${storedCode}`)); }
          catch(e){ console.warn('Could not delete invite — may already be gone:', e.code); }
        }

        // ── 5. Wipe couple node via multi-path update ─────────────────
        // dbUpdate(root, {"couples/X": null}) is equivalent to dbRemove("couples/X")
        // Firebase evaluates the write rule at couples/$coupleId (member check).
        // Since shallower .write rules override deeper ones in RTDB, the parent
        // member check grants write access to all children including presence/*.
        const coupleWipe = {};
        coupleWipe[`couples/${coupleId}`] = null;
        await dbUpdate(dbRef(db), coupleWipe);

        // ── 6. Clear coupleId + inviteCode from own user record ────────
        await dbSet(dbRef(db, `users/${myUid}/coupleId`), null);
        await dbSet(dbRef(db, `users/${myUid}/inviteCode`), null);
      } else {
        // Solo account (no couple) — just delete own avatar
        await _delStorage(`avatars/${myUid}.jpg`);
      }

      // ── 7. Delete own user RTDB record ────────────────────────────
      await dbRemove(dbRef(db, `users/${myUid}`));

      // ── 8. Delete Firebase Auth account ──────────────────────────
      // Use a separate try/catch so RTDB errors above never block auth deletion
      // onAuthStateChanged fires → clears all state → shows login screen
      const currentUser = fbAuth.currentUser || user;
      if(currentUser){
        await fbAuth.deleteUser(currentUser);
      }

    }catch(e){
      console.error('doDeleteAccount failed:',e);
      // Still attempt auth deletion even if RTDB steps failed
      try{
        const currentUser = fbAuth.currentUser || _authUser;
        if(currentUser) await fbAuth.deleteUser(currentUser);
        return; // Auth deleted — onAuthStateChanged handles redirect
      }catch(authErr){
        console.error('Auth deletion failed:',authErr);
        _selfDeleting = false;
        btn.textContent = 'Delete everything'; btn.disabled = false;
        err.textContent = 'Something went wrong — please try again.';
      }
    }
  };

  let _inviteInFlight = false;
  window.showInviteFromSettings = async function(){
    if(!db || !myUid || !coupleId) return; // guard: must have a couple
    if(_inviteInFlight) return; // prevent spam
    _inviteInFlight = true;
    const sub = document.getElementById('settings-invite-sub');
    if(sub) sub.textContent = 'Loading…';
    try{
      // Get the stored invite code and check expiry
      let code = '';
      let expiresAt = 0;
      await new Promise(res => fbOnValue(dbRef(db,`users/${myUid}/inviteCode`), snap=>{
        code = snap.val()||''; res();
      },{onlyOnce:true}));
      // Check if stored code is expired
      if(code){
        await new Promise(res => fbOnValue(dbRef(db,`invites/${code}/expiresAt`), snap=>{
          expiresAt = snap.val()||0; res();
        },{onlyOnce:true}));
        if(expiresAt < Date.now()) code = ''; // expired — regenerate
      }

      if(!code){
        // Delete old expired code from DB before generating new one
        const oldCode = await new Promise(res => fbOnValue(dbRef(db,`users/${myUid}/inviteCode`), snap=>{ res(snap.val()||null); },{onlyOnce:true}));
        if(oldCode && oldCode !== code) await dbRemove(dbRef(db,`invites/${oldCode}`)).catch(()=>{});

        // Generate a new unique code
        for(let i=0;i<10;i++){
          const c = Math.random().toString(36).substring(2,8).toUpperCase();
          let exists=false;
          await new Promise(res=>fbOnValue(dbRef(db,`invites/${c}`),snap=>{exists=!!snap.val();res();},{onlyOnce:true}));
          if(!exists){code=c;break;}
        }
        const newExpiresAt = Date.now()+(48*60*60*1000);
        await dbSet(dbRef(db,`invites/${code}`),{coupleId,createdBy:myUid,createdAt:Date.now(),expiresAt:newExpiresAt,used:false});
        await dbSet(dbRef(db,`users/${myUid}/inviteCode`),code);
        await dbSet(dbRef(db,`couples/${coupleId}/inviteCode`),code);
      }

      const inviteUrl = `${location.origin}/?join=${code}`;
      _inviteInFlight = false;
      if(sub) sub.textContent = 'Share a new invite link';

      // Share or copy
      if(navigator.share){
        navigator.share({title:'Join my Snug',text:'Join our Snug →',url:inviteUrl}).catch(()=>{});
      } else {
        navigator.clipboard.writeText(inviteUrl).then(()=>{
          if(sub){ sub.textContent = '✓ Link copied!';
            setTimeout(()=>{ if(sub) sub.textContent='Share a new invite link'; },2500);
          }
        }).catch(()=>{
          if(sub) sub.textContent = inviteUrl;
        });
      }
    }catch(e){
      _inviteInFlight = false;
      console.error('showInviteFromSettings failed:',e);
      if(sub) sub.textContent = 'Something went wrong';
    }
  };

  window.toggleSettingsExpand = function(id){
    const el = document.getElementById(id);
    if(!el) return;
    // Close others
    document.querySelectorAll('.settings-expandable').forEach(e => {
      if(e.id !== id) e.classList.remove('open');
    });
    el.classList.toggle('open');
  };

  // ── LDR / TOGETHER MODE ────────────────────────────────────
  let _coupleTypeUnsub = null;

  // Mode constants (cleaned up)

  function applyMode(type){
    coupleType = type;
    const isLDR = type === 'ldr';
    const isTogether = type === 'together';

    // Map removed from UI — no toggle needed

    // LDR card (clocks + distance + weather) — hide in Together
    const ldrCard = document.getElementById('ldr-now-card');
    if(ldrCard) ldrCard.style.display = isLDR ? '' : 'none';
    const ldrWrap = document.getElementById('ldr-section-wrap');
    if(ldrWrap) ldrWrap.style.display = isLDR ? '' : 'none';

    // Right now heading removed

    // Distance strip — now inside ldr-now-card, handled above

    // Sleep indicators — inside ldr-now-card, handled above

    // Countdown label — "Next meetup" vs "Next date night"
    const cdLabel = document.querySelector('#panel-us .card-label');
    if(cdLabel) cdLabel.innerHTML = `<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M8 2l1.5 4h4l-3.5 2.5 1.5 4L8 10l-3.5 2.5 1.5-4L2.5 6h4z"/></svg>${isLDR ? 'Next meetup' : 'Next date night'}`;
    const usCountdownLabel = document.getElementById('us-countdown-label');
    if(usCountdownLabel) usCountdownLabel.textContent = isLDR ? 'Next meetup' : 'Next date night';

    // sidebar countdown label removed
    updateMetricChips&&updateMetricChips();

    // Moments tab letter subtitle
    const letterSub = document.getElementById('moments-letter-sub');
    if(letterSub) letterSub.textContent = isLDR ? 'Sealed until you meet' : 'Sealed until your date night';

    // Update settings toggle if visible
    const settingsLdr = document.getElementById('settings-mode-ldr');
    const settingsTog = document.getElementById('settings-mode-together');
    if(settingsLdr) settingsLdr.classList.toggle('active', isLDR);
    if(settingsTog) settingsTog.classList.toggle('active', isTogether);

    // Letter page eyebrow
    const eyebrow = document.getElementById('letter-page-eyebrow');
    if(eyebrow) eyebrow.textContent = isLDR ? 'For the day we meet' : 'For our date night';

    // sidebar-mode-pill removed

    // Time picker — Together mode only
    _showTimeInput && _showTimeInput(isTogether);

    // Date night planner — Together mode only, only if meetupDate is set
    const dnPlanner = document.getElementById('dn-planner');
    if(dnPlanner){
      const show = isTogether && !!meetupDate && meetupDate > new Date();
      dnPlanner.classList.toggle('visible', show);
      if(show) loadDnPlanner && loadDnPlanner();
    }

    // Today's plan — Together mode only
    const todaysPlan = document.getElementById('todays-plan');
    if(todaysPlan){
      todaysPlan.classList.toggle('visible', isTogether);
      if(isTogether) loadTodaysPlan && loadTodaysPlan();
    }
  }

  function startCoupleTypeListener(){
    if(_coupleTypeUnsub){ try{_coupleTypeUnsub();}catch(e){} _coupleTypeUnsub=null; }
    if(!db||!coupleId) return;
    _coupleTypeUnsub = fbOnValue(dbRef(db,`couples/${coupleId}/coupleType`), snap=>{
      const type = snap.val()||'ldr';
      applyMode(type);
    });
  }

  window.selectCreateMode = function(mode){
    document.getElementById('couple-type-input').value = mode;
    document.getElementById('create-mode-ldr').classList.toggle('active', mode==='ldr');
    document.getElementById('create-mode-together').classList.toggle('active', mode==='together');
  };

  window.selectSettingsMode = async function(mode){
    if(!db||!coupleId) return;
    if(mode === coupleType) return; // already in this mode

    // Check if there's an active letter round or a date set
    const hasDate = !!meetupDate && meetupDate > new Date();
    const hasActiveRound = letterRounds && letterRounds.some(r => {
      const ud = new Date(r.unlockDate);
      return ud > new Date();
    });
    const needsPrompt = hasDate || hasActiveRound;

    if(needsPrompt){
      const modeLabel = mode === 'together' ? 'Living together' : 'Long distance';
      const confirmed = window.confirm(
        `Switch to ${modeLabel} mode?

Your letters will be kept but your current date will be cleared. You can set a new one after switching.`
      );
      if(!confirmed){
        // Re-sync toggle back to current mode
        const ldrBtn = document.getElementById('settings-mode-ldr');
        const togBtn = document.getElementById('settings-mode-together');
        if(ldrBtn) ldrBtn.classList.toggle('active', coupleType==='ldr');
        if(togBtn) togBtn.classList.toggle('active', coupleType==='together');
        return;
      }
      // Clear the date
      try{
        await dbSet(dbRef(db,`couples/${coupleId}/meetupDate`), '');
        meetupDate = null;
        // Update countdown UI
        if(window.startCountdown) startCountdown();
        const input = document.getElementById('meetup-date-input');
        if(input) input.value = '';
      }catch(e){ console.error('clearMeetupDate failed:',e); }
    }

    try{
      await dbSet(dbRef(db,`couples/${coupleId}/coupleType`), mode);
      // Listener fires on both devices automatically
    }catch(e){ console.error('selectSettingsMode failed:',e); }
  };

  window.doSignOut = async function(){
    if(fbAuth && fbAuth.signOut){
      // Unsubscribe the members listener BEFORE signing out
      // to prevent it from firing PERMISSION_DENIED and showing the wrong screen
      if(_membersUnsub){ try{_membersUnsub();}catch(e){} _membersUnsub=null; }
      await fbAuth.signOut();
      // Reset all couple/session state so a re-login starts clean
      ME=null;OTHER=null;coupleId=null;myUid=null;partnerUid=null;myRole=null;
      myName=null;otherName=null;
      myStatus=null;otherStatus=null;
      if(statusRefreshInterval){clearInterval(statusRefreshInterval);statusRefreshInterval=null;}
      if(_mjUnsub){try{_mjUnsub();}catch(e){}_mjUnsub=null;}
      if(_coupleTypeUnsub){try{_coupleTypeUnsub();}catch(e){}_coupleTypeUnsub=null;}
      myAvatarUrl=null;otherAvatarUrl=null;
      if(_myAvatarUnsub){try{_myAvatarUnsub();}catch(e){}_myAvatarUnsub=null;}
      if(_otherAvatarUnsub){try{_otherAvatarUnsub();}catch(e){}_otherAvatarUnsub=null;}
      if(_onboardAvatarBlob){ _onboardAvatarBlob=null; } _inviteInFlight=false;_selfDeleting=false;
      const _obp = document.getElementById('onboard-avatar-preview');
      if(_obp && _obp.src && _obp.src.startsWith('blob:')){ URL.revokeObjectURL(_obp.src); _obp.src=''; _obp.style.display='none'; }
      const _obi = document.getElementById('onboard-avatar-icon');
      if(_obi) _obi.style.display='';
      if(_dnUnsub){try{_dnUnsub();}catch(e){}_dnUnsub=null;}
      if(_tpUnsub){try{_tpUnsub();}catch(e){}_tpUnsub=null;}
      _mjMyEntry=null;_mjOtherEntry=null;_mjStreakCount=0;
      coupleType='ldr';
      myCity=null;otherCity=null;myCoords=null;otherCoords=null;
      myTz=null;otherTz=null;
      coupleStartDate=null;coupleMeetupDate=null;meetupDate=null;_stopLetterCountdown&&_stopLetterCountdown();
      localNotes=[];localMilestones=[];localBucket=[];
      blFilter="all";blEditKey=null;
      currentLetterRoundId=null;letterRounds=[];
      editingKey=null;editingOriginalAuthor=null;
      pendingPhotoFile=null;pendingPhotoPosition="50% 50%";
      if(countdownInterval){clearInterval(countdownInterval);countdownInterval=null;}
      if(distanceInterval){clearInterval(distanceInterval);distanceInterval=null;}
      if(clockInterval){clearInterval(clockInterval);clockInterval=null;}
      if(pulseTimeInterval){clearInterval(pulseTimeInterval);pulseTimeInterval=null;}
      if(mapInstance){try{mapInstance.remove();}catch(e){}mapInstance=null;myMarker=null;otherMarker=null;connectLine=null;}
      if(placesMapInstance){try{placesMapInstance.remove();}catch(e){}placesMapInstance=null;}
      _msRegistry.clear();
      if(unsubNotes){try{unsubNotes();}catch(e){}unsubNotes=null;}
      if(unsubMilestones){try{unsubMilestones();}catch(e){}unsubMilestones=null;}
      if(unsubBucket){try{unsubBucket();}catch(e){}unsubBucket=null;}
      if(unsubPulse){try{unsubPulse();}catch(e){}unsubPulse=null;}
      if(_watchPartnerUnsub){try{_watchPartnerUnsub();}catch(e){}_watchPartnerUnsub=null;}
      if(typeof _unsubWatchOther!=="undefined"&&_unsubWatchOther){try{_unsubWatchOther();}catch(e){}_unsubWatchOther=null;}
      _lastPulseSent=0;
      _dnCurrentPlan={};_tpMyCurrentVal='';
      _dnTimeVal='19:00';
      _selectedActivity=null;_selectedMood=null;
      repositionKey=null;repositionDragging=false;pendingPhotoForKey=null;
      // Hide main, show auth
      document.getElementById('main').style.display='none';
      document.getElementById('bottom-nav').style.display='none';
      if(window._metricInterval){clearInterval(window._metricInterval);window._metricInterval=null;}
      // Reset home to Now tab on next login
      if(typeof switchHomeTab==='function') switchHomeTab('now');
      showAuthWrap();
      showAuthScreen('screen-login');
    }
  };

  // ── Page routing ──────────────────────────────────────────────
  // Maps bottom-nav tab names to the sub-tab that should be activated
  const _pageSubContent = {
    memories: { default:'milestones', init: _initMemoriesPage },
    together: { default:'bucket',     init: _initTogetherPage },
    account:  { default:'profile',    init: _initAccountPage  },
  };

  // Legacy pages now live inside their panels — just call special inits
  function _hideLegacyPages(){} // no-op: panels handle visibility via .active class

  function _initMemoriesPage(tab){
    if(tab==='places'){
      setTimeout(()=>{
        if(db&&fbOnValue){
          fbOnValue(dbRef(db,`couples/${coupleId}/milestones`),snap=>{
            const d=snap.val();
            const items=d?Object.entries(d).map(([k,v])=>({...v,_key:k})):[];
            window._initPlacesPage(items);
          },{onlyOnce:true});
        } else { window._initPlacesPage([...localMilestones]); }
        if(placesMapInstance)placesMapInstance.invalidateSize();
      },100);
    } else if(tab==='jar'){
      renderMemoryJarPage&&renderMemoryJarPage();
      _mjRenderHistory&&_mjRenderHistory();
    }
  }

  function _initTogetherPage(tab){
    if(tab==='letter') initLetterPage(_startLetterCountdown);
  }

  function _initAccountPage(tab){
    window.openSettingsPage&&window.openSettingsPage();
  }

  window.switchPageTab = function(page, tab){
    // Hide any currently visible legacy pages before switching
    _hideLegacyPages&&_hideLegacyPages();
    // Update tab pills
    const allTabs = document.querySelectorAll(`[id^="${page}-tab-"]`);
    allTabs.forEach(t=>t.classList.toggle('active', t.id===`${page}-tab-${tab}`));
    // Update panels
    const allPanels = document.querySelectorAll(`[id^="${page}-panel-"]`);
    allPanels.forEach(p=>{
      const isActive = p.id===`${page}-panel-${tab}`;
      p.classList.toggle('active', isActive);
      if(isActive) p.scrollTop = 0;
    });
    // Init content
    if(_pageSubContent[page]) _pageSubContent[page].init(tab);
  };

  window.showPage=function(name){
    // Map legacy page names to new nav structure
    const legacyMap = {
      milestones:'memories', places:'memories', memory:'memories',
      notes:'together', bucket:'together', letter:'together',
      settings:'account'
    };
    const legacyTab = {
      milestones:'milestones', places:'places', memory:'jar',
      notes:'notes', bucket:'bucket', letter:'letter',
      settings:'profile'
    };

    const navName = legacyMap[name] || name;

    // Activate page — only remove active from top-level pages, not legacy pages inside panels
    document.querySelectorAll(".page").forEach(p=>{
      // Don't touch pages inside page-tab-panels — those are legacy content pages
      if(!p.closest('.page-tab-panel')) p.classList.remove("active");
    });
    const pageEl = document.getElementById(`page-${navName}`);
    if(pageEl) pageEl.classList.add("active");

    // Scroll active panel to top
    const activePanel = pageEl && pageEl.querySelector('.page-tab-panel.active, .home-tab-panel.active');
    if(activePanel) activePanel.scrollTop = 0;

    // Activate bottom nav item
    document.querySelectorAll(".bn-item").forEach(n=>n.classList.remove("active"));
    const navEl = document.getElementById(`nav-${navName}`);
    if(navEl) navEl.classList.add("active");

    // If legacy name, switch to right sub-tab
    if(legacyMap[name]){
      switchPageTab(navName, legacyTab[name]);
    } else if(_pageSubContent[name]){
      // First visit to a new nav tab — init default sub-tab
      const def = _pageSubContent[name].default;
      switchPageTab(name, def);
    }

    _stopLetterCountdown();

    // Hide legacy pages when switching to any top-level page
    _hideLegacyPages&&_hideLegacyPages();
  };

  window.toggleSidebar=function(){};
  window.closeSidebar=function(){};
  window.registerThisDevice=async function(){const btn=document.getElementById("register-bio-btn");if(btn){btn.textContent="⬡ Registering…";const ok=await registerBiometric(ME);btn.textContent=ok?"✓ Registered!":"⬡ Registration failed";setTimeout(()=>{if(ok)btn.style.display="none";else btn.textContent="⬡ Try again";},2000);}};


  // ── Metric chips ─────────────────────────────────────────────
  function updateMetricChips(){
    // Next meetup
    const meetupLabel = document.getElementById('metric-meetup-label');
    const meetupVal   = document.getElementById('metric-meetup-val');
    if(meetupLabel) meetupLabel.textContent = coupleType==='together' ? 'Date night' : 'Next meetup';
    if(meetupVal){
      if(meetupDate && meetupDate > new Date()){
        const diff = meetupDate - new Date();
        const days = Math.floor(diff / 86400000);
        meetupVal.textContent = days === 0 ? 'Tomorrow' : `${days}d`;
      } else {
        meetupVal.textContent = '—';
      }
    }
    // Moments (milestone count)
    const momentsVal = document.getElementById('metric-moments-val');
    if(momentsVal) momentsVal.textContent = localMilestones.length > 0 ? localMilestones.length : '—';
    // Streak
    const streakVal = document.getElementById('metric-streak-val');
    if(streakVal){
      const streakNum = parseInt(document.getElementById('mj-page-streak-num')?.textContent||'0');
      streakVal.textContent = streakNum > 0 ? `${streakNum}d` : '—';
    }
  }

  // Start UI
  function startUI(){
    document.getElementById("locating").style.display="none";
    document.getElementById("main").style.display="flex";
    document.getElementById("bottom-nav").style.display="flex";
    const myL=`${ME} · ${myCity}`,oL=`${OTHER} · ${otherCity}`;
    const mhEl=null; // removed: mobile-header-couple-name
    const sbEl=null; // removed: sidebar-couple-name
    if(sbEl) sbEl.innerHTML=`${_esc(ME)} <em>&</em> ${_esc(OTHER)}`;
    const ftEl=document.querySelector('.app-footer-inner');
    if(ftEl) ftEl.textContent=`${ME} & ${OTHER}`;
    document.querySelectorAll('.app-footer-inner').forEach(el=>el.textContent=`${ME} & ${OTHER}`);
    // sidebar-user replaced by mode pill
    document.getElementById("my-city").textContent=myCity||"—";
    document.getElementById("other-city").textContent=otherCity||"—";
    // weather city labels use my-city / other-city
    document.getElementById("note-author-name").textContent=ME;
    const dna=document.getElementById("home-dist-name-a");if(dna)dna.textContent=ME;
    const dnb=document.getElementById("home-dist-name-b");if(dnb)dnb.textContent=OTHER;
    const dnaL=document.getElementById("home-dist-name-a-label");if(dnaL)dnaL.textContent=ME;
    const dnbL=document.getElementById("home-dist-name-b-label");if(dnbL)dnbL.textContent=OTHER;
    // Populate city names immediately — they update again when coords arrive
    const dca=document.getElementById("home-dist-city-a");if(dca)dca.textContent=myCity||"—";
    const dcb=document.getElementById("home-dist-city-b");
    const distEl=document.getElementById("distance-apart");
    if(!otherCoords){
      // Partner location not yet loaded — show loading state
      if(dcb){dcb.textContent="Locating…";dcb.classList.add("home-dist-loading");}
      if(distEl){distEl.textContent="—";distEl.parentElement.classList.add("home-dist-loading");}
    } else {
      if(dcb){dcb.textContent=otherCity||"—";dcb.classList.remove("home-dist-loading");}
    }
    document.getElementById("home-greeting").innerHTML=greeting(ME,myTz);
    document.getElementById("home-date").textContent=new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
    // Home avatar names
    const avMeName = document.getElementById('home-avatar-me-name');
    const avOtherName = document.getElementById('home-avatar-other-name');
    if(avMeName) avMeName.textContent = ME||'—';
    if(avOtherName) avOtherName.textContent = OTHER||'—';

    if(myCoords&&(myCoords[0]||myCoords[1]))fetchWeather(myCoords[0],myCoords[1],"my");
    if(otherCoords&&(otherCoords[0]||otherCoords[1]))fetchWeather(otherCoords[0],otherCoords[1],"other");
    if(window._watchOther)window._watchOther();
    updateDistanceAndSleep();
    distanceInterval=setInterval(updateDistanceAndSleep, 60000);
    initPulse();
    checkMeetupDateInput();
    // ── Persistent real-time listeners ─────────────────────
    if(db&&fbOnValue){
      // Notes — store unsubscribe so we can clean up on sign-out
      if(unsubNotes)unsubNotes();
      unsubNotes=fbOnValue(dbRef(db,`couples/${coupleId}/notes`),snap=>{
        const d=snap.val();
        const notes=d?Object.entries(d).map(([k,v])=>({...v,_key:k})).reverse():[];
        localNotes=[...notes];
        renderNotes(notes);
        renderNotesPreview(notes);
        updateMomentsSubtitles();
        renderStatusCard&&renderStatusCard();
        startStatusRefresh&&startStatusRefresh();
      });
      // One-time startup calls — not repeated on every note change
      _mjLoadAndRender&&_mjLoadAndRender();
      applyMode&&applyMode(coupleType);
      loadAvatars&&loadAvatars();
      // Milestones
      if(unsubMilestones)unsubMilestones();
      unsubMilestones=fbOnValue(dbRef(db,`couples/${coupleId}/milestones`),snap=>{
        const d=snap.val();
        const items=d?Object.entries(d).map(([k,v])=>({...v,_key:k})):[];
        localMilestones=[...items];
        renderMilestones(items);
        updateMomentsSubtitles();
        updateMetricChips&&updateMetricChips();
      });
      // Bucket
      if(unsubBucket)unsubBucket();
      unsubBucket=fbOnValue(dbRef(db,`couples/${coupleId}/bucket`),snap=>{
        const d=snap.val();
        const items=d?Object.entries(d).map(([k,v])=>({...v,_key:k})):[];
        localBucket=[...items];
        renderBucket(items);
        updateHomeBucketProgress();
        updateMomentsSubtitles();
      });
    }
    function tickClocks(){document.getElementById("my-time").textContent=fmtTime(myTz);document.getElementById("my-date").textContent=fmtDate(myTz);document.getElementById("other-time").textContent=fmtTime(otherTz||"UTC");document.getElementById("other-date").textContent=fmtDate(otherTz||"UTC");}
    tickClocks();clockInterval=setInterval(tickClocks,1000);
    if(coupleStartDate){
      // Use T12:00:00 to avoid UTC midnight timezone-off-by-one-day issue
      // Use local midnight for day counter so it flips at midnight not noon
      const _sd = coupleStartDate.substring(0,10);
      const startMidnight = new Date(_sd+'T00:00:00');
      const todayMidnight = new Date(new Date().toLocaleDateString('en-CA')+'T00:00:00');
      const daysTogether = Math.max(1, Math.floor((todayMidnight-startMidnight)/86400000)+1);
      document.getElementById("days-together").textContent=daysTogether;
      const sinceEl=document.getElementById("couple-since-date");
      // Use T12:00:00 for display only to avoid timezone date shift
      if(sinceEl){ const d=new Date(_sd+'T12:00:00'); sinceEl.textContent=`${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`; }
    }
    if(meetupDate)updateCdCaption(meetupDate);startCountdown();
    updateMetricChips&&updateMetricChips();
    updateMetricChips();
  }

  // Read ?join=CODE from invite link URL on page load
  (()=>{
    try{
      const _j = new URLSearchParams(window.location.search).get('join');
      if(_j){
        const _code = _j.toUpperCase();
        sessionStorage.setItem('pendingJoinCode', _code);
        localStorage.setItem('pendingJoinCode', _code);
        window.history.replaceState({}, '', window.location.pathname);
      }
    }catch(e){}
  })();

  // Bootstrap the app
  tryInitFirebase();

  // Auto-retry when connection restored
  window.addEventListener('online', ()=>{
    const el = document.getElementById('screen-offline');
    if(el && el.style.display !== 'none') window.location.reload();
  });

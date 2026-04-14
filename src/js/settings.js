import { state } from './state.js';
import { R } from './registry.js';

// Nav
// ── FORGOT PASSWORD ─────────────────────────────────────
window.doForgotPassword = async function(){
  const email = document.getElementById('forgot-email').value.trim();
  const err = document.getElementById('forgot-error');
  const success = document.getElementById('forgot-success');
  const btn = document.getElementById('forgot-btn');
  err.textContent = '';
  success.style.display = 'none';
  if(!state.fbAuth){ err.textContent = 'Connection error. Please refresh.'; return; }
  if(!email){ err.textContent = 'Please enter your email address.'; return; }
  btn.textContent = 'Sending…'; btn.disabled = true;
  try{
    await state.fbAuth.sendPasswordResetEmail(email);
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
  if(nameEl) nameEl.value = state.ME || '';
  const emailEl = document.getElementById('settings-email-display');
  if(emailEl) emailEl.textContent = state.fbAuth?.currentUser?.email || '—';
  const cityEl = document.getElementById('settings-city-display');
  if(cityEl){
    if(!state.myCity || state.myCity === '—'){
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
      cityEl.textContent = state.myCity;
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
    if(state.coupleStartDate) sdEl.value = state.coupleStartDate;
  }
  // Avatar
  R.applyAllAvatars && R.applyAllAvatars();
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
  if(ldrBtn) ldrBtn.classList.toggle('active', state.coupleType==='ldr');
  if(togBtn) togBtn.classList.toggle('active', state.coupleType==='together');
  // Hide invite partner row when partner already joined
  const inviteRow = document.getElementById('settings-invite-row');
  if(inviteRow) inviteRow.style.display = state.partnerUid ? 'none' : '';
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
    const credential = state.fbAuth.EmailAuthProvider.credential(state.fbAuth.currentUser.email, currentPw);
    await state.fbAuth.reauthenticateWithCredential(state.fbAuth.currentUser, credential);
    // Update password
    await state.fbAuth.updatePassword(state.fbAuth.currentUser, newPw);
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
  if(newEmail === state.fbAuth.currentUser.email){ err.textContent = 'This is already your email address.'; return; }
  btn.textContent = 'Changing…'; btn.disabled = true;
  try{
    // Re-authenticate first
    const credential = state.fbAuth.EmailAuthProvider.credential(state.fbAuth.currentUser.email, pw);
    await state.fbAuth.reauthenticateWithCredential(state.fbAuth.currentUser, credential);
    // Update email in Firebase Auth
    await state.fbAuth.updateEmail(state.fbAuth.currentUser, newEmail);
    // Update email in DB
    await state.dbSet(state.dbRef(state.db, `users/${state.myUid}/email`), newEmail);
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

window.saveNameFromInput = function(){
  const el = document.getElementById('settings-name');
  if(!el) return;
  return window.autoSaveName(el.value);
};

window.autoSaveName = async function(val){
  const name = (val||'').trim();
  const err = document.getElementById('settings-profile-error');
  const success = document.getElementById('settings-profile-success');
  if(err) err.textContent = '';
  if(!name){
    if(err) err.textContent = 'Name cannot be empty.';
    // Restore previous value
    const el = document.getElementById('settings-name');
    if(el) el.value = state.ME||'';
    return;
  }
  if(name === state.ME){
    // Same value — give visible feedback instead of silently no-op'ing.
    if(success){
      success.style.display='block';
      success.textContent='Name unchanged.';
      setTimeout(()=>{ success.style.display='none'; },1500);
    }
    return;
  }
  try{
    await state.dbSet(state.dbRef(state.db, `users/${state.myUid}/name`), name);
    if(state.myCity) await state.dbSet(state.dbRef(state.db, `users/${state.myUid}/city`), state.myCity);
    await state.dbSet(state.dbRef(state.db, `couples/${state.coupleId}/members/${state.myUid}`), {
      name, city: state.myCity||'', role: state.myRole||'owner'
    });
    state.ME = name;
    state.myName = name;
    // Rebuild the whole greeting via R.greeting so the "Good morning, " prefix
    // and <em> italic wrapper stay intact. Replacing just the em's textContent
    // would work too, but calling R.greeting keeps the time-of-day part fresh.
    const greet = document.getElementById('home-greeting');
    if(greet && R.greeting) greet.innerHTML = R.greeting(name, state.myTz);
    const sbEl = null; // removed sidebar
    if(sbEl) sbEl.innerHTML = `${R._esc(state.ME)} <em>&</em> ${R._esc(state.OTHER)}`;
    const mhEl = document.getElementById('mobile-header-couple-name');
    if(mhEl) mhEl.innerHTML = `${R._esc(state.ME)} <em>&</em> ${R._esc(state.OTHER)}`;
    if(success){ success.style.display='block'; success.textContent='Name saved.';
      setTimeout(()=>{ success.style.display='none'; },2000); }
  }catch(e){
    console.error('autoSaveName failed:',e);
    if(err) err.textContent = 'Could not save — try again.';
    // Restore
    const el = document.getElementById('settings-name');
    if(el) el.value = state.ME||'';
  }
};

window.autoSaveStartDate = async function(val){
  if(!val || !state.db || !state.coupleId) return;
  const parsed = new Date(val+'T12:00:00');
  if(parsed > new Date()){
    // Future date — flash the input red
    const el = document.getElementById('settings-start-date');
    if(el){ el.style.color='var(--danger,#c0392b)'; setTimeout(()=>el.style.color='',2000); }
    return;
  }
  if(val === state.coupleStartDate) return; // no change
  try{
    await state.dbSet(state.dbRef(state.db,`couples/${state.coupleId}/startDate`), val);
    state.coupleStartDate = val;
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
  if(!state.fbAuth?.currentUser || !state.db || !state.myUid){
    err.textContent = 'Something went wrong. Please try again.';
    return;
  }

  // Validate password field
  const pw = document.getElementById('linking-delete-pw')?.value;
  if(!pw){ err.textContent = 'Please enter your password to confirm.'; return; }

  // Reauthenticate BEFORE any state changes
  btn.textContent = 'Verifying…'; btn.disabled = true;
  try{
    const credential = state.fbAuth.EmailAuthProvider.credential(state.fbAuth.currentUser.email, pw);
    await state.fbAuth.reauthenticateWithCredential(state.fbAuth.currentUser, credential);
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
  state._selfDeleting = true;

  // Helper: silently delete a Storage file
  const _del = async (path) => {
    if(!path || !state.storage || !state.fbStorageRef || !state.fbDeleteObject) return;
    try{ await state.fbDeleteObject(state.fbStorageRef(state.storage, path)); }
    catch(e){ console.warn('Storage delete skipped:', path, e.code); }
  };

  // Capture auth user reference before any async ops that might invalidate it
  const _authUser = state.fbAuth.currentUser;

  try{
    if(state.coupleId){
      // ── 1. Read all milestone photoPath values before deleting RTDB ──
      let milestonePaths = [];
      try{
        await new Promise((res) => state.fbOnValue(state.dbRef(state.db,`couples/${state.coupleId}/milestones`), snap=>{
          const data = snap.val();
          if(data){ Object.values(data).forEach(m=>{ if(m.photoPath) milestonePaths.push(m.photoPath); }); }
          res();
        }, ()=>res(), {onlyOnce:true}));
      }catch(e){ console.warn('Could not read milestones for cleanup:', e); }

      // ── 2. Read invite code from couple doc ──
      let storedCode = null;
      try{
        await new Promise((res) => state.fbOnValue(state.dbRef(state.db,`couples/${state.coupleId}/inviteCode`), snap=>{
          storedCode = snap.val()||null; res();
        }, ()=>res(), {onlyOnce:true}));
        if(!storedCode){
          await new Promise((res) => state.fbOnValue(state.dbRef(state.db,`users/${state.myUid}/inviteCode`), snap=>{
            storedCode = snap.val()||null; res();
          }, ()=>res(), {onlyOnce:true}));
        }
      }catch(e){}

      // ── 3. Delete Storage files ──
      await _del(`avatars/${state.myUid}.jpg`);
      await Promise.all(milestonePaths.map(p => _del(p)));

      // ── 4. Delete invite document BEFORE wiping couple node ──
      if(storedCode){
        try{ await state.dbRemove(state.dbRef(state.db, `invites/${storedCode}`)); }
        catch(e){ console.warn('Could not delete invite — may already be gone:', e.code); }
      }

      // ── 5. Wipe couple node via multi-path update ──
      // Equivalent to dbRemove("couples/X"). Parent .write rule (member check)
      // grants access — shallower rules override deeper ones in RTDB.
      const coupleWipe = {};
      coupleWipe[`couples/${state.coupleId}`] = null;
      await state.dbUpdate(state.dbRef(state.db), coupleWipe);

      // ── 6. Clear own user record ──
      await state.dbSet(state.dbRef(state.db, `users/${state.myUid}/coupleId`), null);
      await state.dbSet(state.dbRef(state.db, `users/${state.myUid}/inviteCode`), null);
    } else {
      // Solo account — just delete avatar
      await _del(`avatars/${state.myUid}.jpg`);
    }

    // ── 7. Delete own user RTDB record ──
    await state.dbRemove(state.dbRef(state.db, `users/${state.myUid}`));

    // ── 8. Delete Firebase Auth account ──
    const currentUser = state.fbAuth.currentUser || _authUser;
    if(currentUser) await state.fbAuth.deleteUser(currentUser);

  }catch(e){
    console.error('doLinkingDeleteAccount failed:', e);
    // Try auth deletion even if RTDB failed
    try{
      const currentUser = state.fbAuth.currentUser || _authUser;
      if(currentUser) await state.fbAuth.deleteUser(currentUser);
      return;
    }catch(authErr){
      console.error('Auth deletion failed:', authErr);
      state._selfDeleting = false;
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
  if(!state.fbAuth?.currentUser || !state.db || !state.myUid){
    err.textContent = 'Something went wrong. Please try again.';
    return;
  }

  // Validate password field
  const pw = document.getElementById('settings-delete-pw')?.value;
  if(!pw){ err.textContent = 'Please enter your password to confirm.'; return; }

  // Reauthenticate BEFORE any state changes — clean failure if wrong password
  btn.textContent = 'Verifying…'; btn.disabled = true;
  try{
    const credential = state.fbAuth.EmailAuthProvider.credential(state.fbAuth.currentUser.email, pw);
    await state.fbAuth.reauthenticateWithCredential(state.fbAuth.currentUser, credential);
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
  state._selfDeleting = true; // prevent partner-deleted message from showing for self

  // Helper: silently delete a Storage file — never throws
  const _delStorage = async (path) => {
    if(!path || !state.storage || !state.fbStorageRef || !state.fbDeleteObject) return;
    try{ await state.fbDeleteObject(state.fbStorageRef(state.storage, path)); }
    catch(e){ console.warn('Storage delete skipped:', path, e.code); }
  };

  // Capture auth user reference before any async ops that might invalidate it
  const _authUser = state.fbAuth.currentUser;

  try{
    const user = _authUser;

    if(state.coupleId){
      // ── 1. Read all milestone photoPath values before deleting RTDB ──
      let milestonePaths = [];
      try{
        await new Promise((res) => state.fbOnValue(state.dbRef(state.db,`couples/${state.coupleId}/milestones`), snap=>{
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
        await new Promise((res) => state.fbOnValue(state.dbRef(state.db,`couples/${state.coupleId}/inviteCode`), snap=>{
          storedCode = snap.val()||null; res();
        }, ()=>res(), {onlyOnce:true}));
        // Fallback to own user record (backward compat with older couples)
        if(!storedCode){
          await new Promise((res) => state.fbOnValue(state.dbRef(state.db,`users/${state.myUid}/inviteCode`), snap=>{
            storedCode = snap.val()||null; res();
          }, ()=>res(), {onlyOnce:true}));
        }
      }catch(e){}

      // ── 3. Delete all Storage files ───────────────────────────────
      // My avatar
      await _delStorage(`avatars/${state.myUid}.jpg`);
      // All milestone photos
      await Promise.all(milestonePaths.map(p => _delStorage(p)));

      // ── 4. Delete invite document BEFORE wiping couple node ───────
      // Must happen while user is still a couple member.
      if(storedCode){
        try{ await state.dbRemove(state.dbRef(state.db, `invites/${storedCode}`)); }
        catch(e){ console.warn('Could not delete invite — may already be gone:', e.code); }
      }

      // ── 5. Wipe couple node via multi-path update ─────────────────
      // dbUpdate(root, {"couples/X": null}) is equivalent to dbRemove("couples/X")
      // Firebase evaluates the write rule at couples/$coupleId (member check).
      // Since shallower .write rules override deeper ones in RTDB, the parent
      // member check grants write access to all children including presence/*.
      const coupleWipe = {};
      coupleWipe[`couples/${state.coupleId}`] = null;
      await state.dbUpdate(state.dbRef(state.db), coupleWipe);

      // ── 6. Clear coupleId + inviteCode from own user record ────────
      await state.dbSet(state.dbRef(state.db, `users/${state.myUid}/coupleId`), null);
      await state.dbSet(state.dbRef(state.db, `users/${state.myUid}/inviteCode`), null);
    } else {
      // Solo account (no couple) — just delete own avatar
      await _delStorage(`avatars/${state.myUid}.jpg`);
    }

    // ── 7. Delete own user RTDB record ────────────────────────────
    await state.dbRemove(state.dbRef(state.db, `users/${state.myUid}`));

    // ── 8. Delete Firebase Auth account ──────────────────────────
    // Use a separate try/catch so RTDB errors above never block auth deletion
    // onAuthStateChanged fires → clears all state → shows login screen
    const currentUser = state.fbAuth.currentUser || user;
    if(currentUser){
      await state.fbAuth.deleteUser(currentUser);
    }

  }catch(e){
    console.error('doDeleteAccount failed:',e);
    // Still attempt auth deletion even if RTDB steps failed
    try{
      const currentUser = state.fbAuth.currentUser || _authUser;
      if(currentUser) await state.fbAuth.deleteUser(currentUser);
      return; // Auth deleted — onAuthStateChanged handles redirect
    }catch(authErr){
      console.error('Auth deletion failed:',authErr);
      state._selfDeleting = false;
      btn.textContent = 'Delete everything'; btn.disabled = false;
      err.textContent = 'Something went wrong — please try again.';
    }
  }
};

window.showInviteFromSettings = async function(){
  if(!state.db || !state.myUid || !state.coupleId) return; // guard: must have a couple
  if(state._inviteInFlight) return; // prevent spam
  state._inviteInFlight = true;
  const sub = document.getElementById('settings-invite-sub');
  if(sub) sub.textContent = 'Loading…';
  try{
    // Get the stored invite code and check expiry
    let code = '';
    let expiresAt = 0;
    await new Promise(res => state.fbOnValue(state.dbRef(state.db,`users/${state.myUid}/inviteCode`), snap=>{
      code = snap.val()||''; res();
    },{onlyOnce:true}));
    // Check if stored code is expired
    if(code){
      await new Promise(res => state.fbOnValue(state.dbRef(state.db,`invites/${code}/expiresAt`), snap=>{
        expiresAt = snap.val()||0; res();
      },{onlyOnce:true}));
      if(expiresAt < Date.now()) code = ''; // expired — regenerate
    }

    if(!code){
      // Delete old expired code from DB before generating new one
      const oldCode = await new Promise(res => state.fbOnValue(state.dbRef(state.db,`users/${state.myUid}/inviteCode`), snap=>{ res(snap.val()||null); },{onlyOnce:true}));
      if(oldCode && oldCode !== code) await state.dbRemove(state.dbRef(state.db,`invites/${oldCode}`)).catch(()=>{});

      // Generate a new unique code
      for(let i=0;i<10;i++){
        const c = Math.random().toString(36).substring(2,8).toUpperCase();
        let exists=false;
        await new Promise(res=>state.fbOnValue(state.dbRef(state.db,`invites/${c}`),snap=>{exists=!!snap.val();res();},{onlyOnce:true}));
        if(!exists){code=c;break;}
      }
      const newExpiresAt = Date.now()+(48*60*60*1000);
      await state.dbSet(state.dbRef(state.db,`invites/${code}`),{coupleId: state.coupleId,createdBy:state.myUid,createdAt:Date.now(),expiresAt:newExpiresAt,used:false});
      await state.dbSet(state.dbRef(state.db,`users/${state.myUid}/inviteCode`),code);
      await state.dbSet(state.dbRef(state.db,`couples/${state.coupleId}/inviteCode`),code);
    }

    const inviteUrl = `${location.origin}/?join=${code}`;
    state._inviteInFlight = false;
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
    state._inviteInFlight = false;
    console.error('showInviteFromSettings failed:',e);
    if(sub) sub.textContent = 'Something went wrong';
  }
};

window.doSignOut = async function(){
  if(state.fbAuth && state.fbAuth.signOut){
    // Unsubscribe the members listener BEFORE signing out
    // to prevent it from firing PERMISSION_DENIED and showing the wrong screen
    if(state._membersUnsub){ try{state._membersUnsub();}catch(e){} state._membersUnsub=null; }
    await state.fbAuth.signOut();
    // Reset all couple/session state so a re-login starts clean
    state.ME=null;state.OTHER=null;state.coupleId=null;state.myUid=null;state.partnerUid=null;state.myRole=null;
    state.myName=null;state.otherName=null;
    state.myStatus=null;state.otherStatus=null;
    if(state.statusRefreshInterval){clearInterval(state.statusRefreshInterval);state.statusRefreshInterval=null;}
    if(state._mjUnsub){try{state._mjUnsub();}catch(e){}state._mjUnsub=null;}
    if(state._coupleTypeUnsub){try{state._coupleTypeUnsub();}catch(e){}state._coupleTypeUnsub=null;}
    state.myAvatarUrl=null;state.otherAvatarUrl=null;
    if(state._myAvatarUnsub){try{state._myAvatarUnsub();}catch(e){}state._myAvatarUnsub=null;}
    if(state._otherAvatarUnsub){try{state._otherAvatarUnsub();}catch(e){}state._otherAvatarUnsub=null;}
    if(state._onboardAvatarBlob){ state._onboardAvatarBlob=null; } state._inviteInFlight=false;state._selfDeleting=false;
    const _obp = document.getElementById('onboard-avatar-preview');
    if(_obp && _obp.src && _obp.src.startsWith('blob:')){ URL.revokeObjectURL(_obp.src); _obp.src=''; _obp.style.display='none'; }
    const _obi = document.getElementById('onboard-avatar-icon');
    if(_obi) _obi.style.display='';
    if(state._dnUnsub){try{state._dnUnsub();}catch(e){}state._dnUnsub=null;}
    if(state._meetupDateUnsub){try{state._meetupDateUnsub();}catch(e){}state._meetupDateUnsub=null;}
    if(R.resetSummary){try{R.resetSummary();}catch(e){}}
    if(R._mjResetExpandedMonths){try{R._mjResetExpandedMonths();}catch(e){}}
    state._mjMyEntry=null;state._mjOtherEntry=null;state._mjStreakCount=0;
    state.coupleType='ldr';
    state.myCity=null;state.otherCity=null;state.myCoords=null;state.otherCoords=null;
    state.myTz=null;state.otherTz=null;
    state.coupleStartDate=null;state.coupleMeetupDate=null;state.meetupDate=null;R._stopLetterCountdown&&R._stopLetterCountdown();
    state.localMilestones=[];state.localBucket=[];
    state.blFilter="all";state.blEditKey=null;
    state.currentLetterRoundId=null;state.letterRounds=[];
    state.editingKey=null;state.editingOriginalAuthor=null;
    state.pendingPhotoFile=null;state.pendingPhotoPosition="50% 50%";
    if(state.countdownInterval){clearInterval(state.countdownInterval);state.countdownInterval=null;}
    if(state.distanceInterval){clearInterval(state.distanceInterval);state.distanceInterval=null;}
    if(state.clockInterval){clearInterval(state.clockInterval);state.clockInterval=null;}
    if(state.pulseTimeInterval){clearInterval(state.pulseTimeInterval);state.pulseTimeInterval=null;}
    if(state.mapInstance){try{state.mapInstance.remove();}catch(e){}state.mapInstance=null;state.myMarker=null;state.otherMarker=null;state.connectLine=null;}
    if(state.placesMapInstance){try{state.placesMapInstance.remove();}catch(e){}state.placesMapInstance=null;}
    state._msRegistry.clear();
    if(state.unsubMilestones){try{state.unsubMilestones();}catch(e){}state.unsubMilestones=null;}
    if(state.unsubBucket){try{state.unsubBucket();}catch(e){}state.unsubBucket=null;}
    if(state.unsubPulse){try{state.unsubPulse();}catch(e){}state.unsubPulse=null;}
    if(state._watchPartnerUnsub){try{state._watchPartnerUnsub();}catch(e){}state._watchPartnerUnsub=null;}
    if(typeof state._unsubWatchOther!=="undefined"&&state._unsubWatchOther){try{state._unsubWatchOther();}catch(e){}state._unsubWatchOther=null;}
    state._lastPulseSent=0;
    state._dnCurrentPlan={};
    state._dnTimeVal='19:00';
    state._selectedActivity=null;state._selectedMood=null;
    state.repositionKey=null;state.repositionDragging=false;state.pendingPhotoForKey=null;
    // Hide main, show auth
    document.getElementById('main').style.display='none';
    document.getElementById('bottom-nav').style.display='none';
    if(window._metricInterval){clearInterval(window._metricInterval);window._metricInterval=null;}
    // Reset home to Now tab on next login
    if(typeof window.switchHomeTab==='function') window.switchHomeTab('now');
    R.showAuthWrap();
    window.showAuthScreen('screen-login');
  }
};


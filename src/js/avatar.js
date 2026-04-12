import { state } from './state.js';
import { R } from './registry.js';

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
  const myInitial = (state.ME||'?')[0].toUpperCase();
  const otherInitial = (state.OTHER||'?')[0].toUpperCase();
  R.MY_AVATAR_IDS.forEach(id => R._applyAvatar(document.getElementById(id), state.myAvatarUrl, myInitial, true));
  R.OTHER_AVATAR_IDS.forEach(id => R._applyAvatar(document.getElementById(id), state.otherAvatarUrl, otherInitial, false));
  // Re-render MJ history so old entries also show updated avatar
  if(document.getElementById('mj-history-list')?.children.length > 0){
    R._mjRenderHistory && R._mjRenderHistory();
  }
}

async function loadAvatars(){
  if(!state.myUid || !state.partnerUid || !state.db) return;
  // Cancel any existing avatar listeners
  if(state._myAvatarUnsub){ try{state._myAvatarUnsub();}catch(e){} state._myAvatarUnsub=null; }
  if(state._otherAvatarUnsub){ try{state._otherAvatarUnsub();}catch(e){} state._otherAvatarUnsub=null; }
  try{
    // Persistent listeners — avatars update in real-time if partner uploads
    state._myAvatarUnsub = state.fbOnValue(state.dbRef(state.db,`users/${state.myUid}/avatarUrl`), snap=>{
      state.myAvatarUrl = snap.val()||null;
      R.applyAllAvatars();
    });
    state._otherAvatarUnsub = state.fbOnValue(state.dbRef(state.db,`users/${state.partnerUid}/avatarUrl`), snap=>{
      state.otherAvatarUrl = snap.val()||null;
      R.applyAllAvatars();
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
    const blob = await R._resizeImage(file, 400);
    state._onboardAvatarBlob = blob;
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
  if(!state._onboardAvatarBlob || !uid) return;
  try{
    const {getStorage, ref: sRef, uploadBytes, getDownloadURL} =
      await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js');
    const storage = getStorage();
    const storageReference = sRef(storage, `avatars/${uid}.jpg`);
    await uploadBytes(storageReference, state._onboardAvatarBlob, {contentType:'image/jpeg'});
    const url = await getDownloadURL(storageReference);
    await state.dbSet(state.dbRef(state.db,`users/${uid}/avatarUrl`), url);
    state.myAvatarUrl = url;
    state._onboardAvatarBlob = null;
    // Apply avatar everywhere now that upload succeeded
    R.applyAllAvatars();
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
  if(!file || !state.myUid || !state.db) return;
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
    const resized = await R._resizeImage(file, 400);
    // Upload to Firebase Storage
    const {getStorage, ref: sRef, uploadBytes, getDownloadURL} = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js');
    const storage = getStorage();
    const path = `avatars/${state.myUid}.jpg`;
    const storageReference = sRef(storage, path);
    await uploadBytes(storageReference, resized, {contentType:'image/jpeg'});
    const url = await getDownloadURL(storageReference);
    clearTimeout(_uploadTimeout);
    // Save URL to Firebase
    await state.dbSet(state.dbRef(state.db,`users/${state.myUid}/avatarUrl`), url);
    state.myAvatarUrl = url;
    R.applyAllAvatars();
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

// ── Register for cross-module access ─────────────────────
R.MY_AVATAR_IDS = MY_AVATAR_IDS;
R.OTHER_AVATAR_IDS = OTHER_AVATAR_IDS;
R._applyAvatar = _applyAvatar;
R.applyAllAvatars = applyAllAvatars;
R.loadAvatars = loadAvatars;
R._uploadOnboardAvatar = _uploadOnboardAvatar;
R._resizeImage = _resizeImage;

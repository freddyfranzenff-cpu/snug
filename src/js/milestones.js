import { state } from './state.js';
import { R } from './registry.js';

const DOT_COLORS=["gold","b","a","b","a","gold"];
const TAG_CLS={moment:"a",memory:"b",first:"gold",milestone:"b",future:""};
const TAG_ICONS={first:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e8622a" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4" fill="rgba(232,98,42,0.15)"/><path d="M9 12l-2 9 5-3 5 3-2-9"/></svg>`,moment:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e8622a" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/><circle cx="12" cy="12" r="4"/></svg>`,memory:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e8622a" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3"/><path d="M7 6V5a1 1 0 011-1h2M14 5a1 1 0 011 1v1"/><circle cx="17" cy="9" r="1" fill="#e8622a"/></svg>`,milestone:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e8622a" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>`,future:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e8622a" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16l-7-13-7 13"/><path d="M3 12h18"/><path d="M7 16l1 5h8l1-5"/></svg>`};
function fmtMDate(s){if(!s)return"";const d=new Date(s+"T12:00:00"),p=n=>String(n).padStart(2,"0");return`${p(d.getDate())}.${p(d.getMonth()+1)}.${String(d.getFullYear()).slice(2)}`;}
function fmtMDateRange(s,e){if(!e||e===s)return R.fmtMDate(s);return`${R.fmtMDate(s)} – ${R.fmtMDate(e)}`;}
function _esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}

// Milestone data registry — keyed by Firebase _key
// Lets onclick handlers look up URL/position/title without embedding them in HTML attributes

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
  state._msRegistry.clear();
  items.forEach(item=>{ if(item._key) state._msRegistry.set(item._key, item); });
  tl.innerHTML=items.map(item=>{
    const isFuture=new Date(item.date)>new Date();
    const dc=isFuture?"future":R.DOT_COLORS[ci++%R.DOT_COLORS.length];
    const tc=R.TAG_CLS[item.tag]||"";
    const icon=R.TAG_ICONS[item.tag]||"";
    const dateStr=R.fmtMDateRange(item.date,item.endDate);
    const k=R._esc(item._key||"");
    const locationHTML=item.location?`<p class="m-location"><svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M8 1a5 5 0 015 5c0 3.5-5 9-5 9S3 9.5 3 6a5 5 0 015-5z"/><circle cx="8" cy="6" r="1.8"/></svg>${R._esc(item.locationDisplay||item.location)}</p>`:"";
    // Photo actions use registry keys — no URLs in onclick attributes
    const photoHTML=item.photoURL
      ?`<div class="m-photo-wrap" onclick="_msViewPhoto('${k}')"><img src="${R._esc(item.photoURL)}" alt="" style="object-position:${R._esc(item.photoPosition||'center center')}"/><div class="m-photo-actions"><button class="m-photo-action-btn" onclick="event.stopPropagation();_msReposition('${k}')">Reposition</button><button class="m-photo-action-btn" onclick="event.stopPropagation();removeMilestonePhoto('${k}')">Remove</button></div></div>`
      :(item._key?`<button class="m-add-photo-btn" onclick="triggerPhotoUploadFor('${k}')"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3"/><path d="M7 6V5a1 1 0 011-1h2M14 5a1 1 0 011 1v1"/></svg>Add photo</button>`:"");
    return`<div class="milestone"><div class="m-dot ${dc}"></div><div class="m-card${isFuture?" future-card":""}">${photoHTML}<div class="m-top"><p class="m-title"><span class="m-icon">${icon}</span>${R._esc(item.title)}</p><span class="m-date-range">${dateStr}</span></div>${item.note?`<p class="m-note">${R._esc(item.note)}</p>`:""}${locationHTML}<div class="m-footer">${item.tag?`<span class="m-tag ${tc}">${R._esc(item.tag)}</span>`:"<span></span>"}<div style="display:flex;align-items:center;gap:.4rem;"><span class="m-author">${R._esc(item.addedBy||"")}</span>${item._key?`<button class="m-edit" onclick="editMilestone('${k}')" title="Edit">✎</button><button class="m-delete" onclick="deleteMilestone('${k}')" title="Delete">✕</button>`:""}</div></div></div></div>`;
  }).join("");
}

// Registry-based photo helpers — safe, no URL-in-attr corruption
window._msViewPhoto = function(key){
  const item = state._msRegistry.get(key);
  if(item?.photoURL) viewMilestonePhoto(item.photoURL);
};
window._msReposition = function(key){
  const item = state._msRegistry.get(key);
  if(item) openRepositionModal(key, item.photoURL, item.title||'', item.photoPosition||'center center');
};
window.cancelMilestoneEdit=function(){
  state.editingKey=null;
  state.editingOriginalAuthor=null;
  state.pendingPhotoFile=null;
  state.pendingPhotoPosition="50% 50%";
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
  state.editingKey=null;
  state.editingOriginalAuthor=null;
  const f=document.getElementById("add-milestone-form");
  f.classList.toggle("open");
  if(f.classList.contains("open")){
    const cb=document.getElementById("m-cancel-btn");
    if(cb)cb.textContent="Discard";
    document.getElementById("m-title-input").value="";
    document.getElementById("m-note-input").value="";
    document.getElementById("m-date-input").value=R._localDateStr(new Date());
    document.getElementById("m-enddate-input").value="";
    document.getElementById("m-tag-input").value="moment";
    document.getElementById("m-location-input").value="";
    document.getElementById("m-save-btn").textContent="Save";
    document.getElementById("m-title-input").focus();
  }
};
window.editMilestone=function(key){
  function loadIntoForm(item){
    state.editingKey=key;
    state.editingOriginalAuthor=item.addedBy||null;
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
    state.pendingPhotoFile=null;
    state.pendingPhotoPosition=item.photoPosition||"50% 50%";
    document.getElementById("m-title-input").focus();
    f.scrollIntoView({behavior:"smooth",block:"nearest"});
  }
  if(state.db&&state.fbOnValue){
    state.fbOnValue(state.dbRef(state.db,`couples/${state.coupleId}/milestones/${key}`),snap=>{
      const item=snap.val();
      if(item)loadIntoForm(item);
    },{onlyOnce:true});
  } else {
    const item=state.localMilestones.find(m=>m._key===key);
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
  const m={title,note,date,tag,addedBy:state.editingKey?(state.editingOriginalAuthor||state.ME):state.ME,time:Date.now()};
  if(endDate&&endDate!==date)m.endDate=endDate;
  if(locationStr){
    const geo=await R.geocodeLocation(locationStr);
    m.location=locationStr;
    if(geo.lat)m.lat=geo.lat;
    if(geo.lng)m.lng=geo.lng;
    if(geo.displayName)m.locationDisplay=geo.displayName;
    if(geo.countryCode)m.countryCode=geo.countryCode;
    if(geo.country)m.country=geo.country;
  }
  if(state.editingKey){
    // If new photo selected, delete old photo from Storage using local cache — avoids race with RTDB write
    if(state.pendingPhotoFile){
      const cachedMs = state.localMilestones.find(x=>x._key===state.editingKey);
      const oldPath = cachedMs?.photoPath||null;
      if(oldPath && state.storage && state.fbStorageRef && state.fbDeleteObject){
        try{ await state.fbDeleteObject(state.fbStorageRef(state.storage, oldPath)); }
        catch(e){ console.warn("Old photo delete failed:", e); }
      }
    }
    const currentEditKey = state.editingKey;
    // Preserve existing photo fields — only overwrite if a new photo is being uploaded
    const existingMilestone = state.localMilestones.find(x=>x._key===currentEditKey)||{};
    const mToSave = {...m};
    if(!state.pendingPhotoFile){
      if(existingMilestone.photoURL) mToSave.photoURL = existingMilestone.photoURL;
      if(existingMilestone.photoPath) mToSave.photoPath = existingMilestone.photoPath;
      if(existingMilestone.photoPosition) mToSave.photoPosition = existingMilestone.photoPosition;
    }
    // If a new photo is selected, upload it first so the milestone write includes photoURL
    if(state.pendingPhotoFile && currentEditKey && state.storage){
      try{
        const file = state.pendingPhotoFile;
        const pos = state.pendingPhotoPosition;
        const baseName = (file.name||file._name||"photo").replace(/\.[^.]+$/, "").replace(/[^a-z0-9]/gi,"_").substring(0,40) || "photo";
        const path = `milestones/${currentEditKey}/${Date.now()}_${baseName}.jpg`;
        btn.textContent = "Uploading…";
        const compressed = await R.compressImage(file, 1200);
        const uploadData = (compressed instanceof Blob) ? compressed : new Blob([compressed], {type:"image/jpeg"});
        const editStorageRef = state.fbStorageRef(state.storage, path);
        await Promise.race([
          state.fbUploadBytes(editStorageRef, uploadData, {contentType:"image/jpeg"}),
          new Promise((_,rej)=>setTimeout(()=>rej(new Error("Upload timeout")),30000))
        ]);
        const editUrl = await state.fbGetDownloadURL(editStorageRef);
        mToSave.photoURL = editUrl;
        mToSave.photoPath = path;
        if(pos && pos !== "50% 50%") mToSave.photoPosition = pos;
        // Update registry immediately
        const regItem = state._msRegistry.get(currentEditKey)||{};
        state._msRegistry.set(currentEditKey, {...regItem, _key:currentEditKey, photoURL:editUrl, photoPath:path, photoPosition:pos||'center center'});
      }catch(editUploadErr){
        console.error("Photo upload failed during edit:", editUploadErr);
        // Keep existing photo fields — don't overwrite with nothing
        if(existingMilestone.photoURL) mToSave.photoURL = existingMilestone.photoURL;
        if(existingMilestone.photoPath) mToSave.photoPath = existingMilestone.photoPath;
        if(existingMilestone.photoPosition) mToSave.photoPosition = existingMilestone.photoPosition;
      }
      btn.textContent = "Saving…";
      state.pendingPhotoFile=null;
      state.pendingPhotoPosition="50% 50%";
      const pbtn=document.getElementById("m-photo-btn");
      const plbl=document.getElementById("m-photo-btn-label");
      if(pbtn)pbtn.classList.remove("has-photo");
      if(plbl)plbl.textContent="Add photo";
    }
    // Single awaited write — milestone saved with photo already included
    if(state.db&&state.dbSet) await state.dbSet(state.dbRef(state.db,`couples/${state.coupleId}/milestones/${currentEditKey}`),mToSave);
    else{const idx=state.localMilestones.findIndex(x=>x._key===currentEditKey);if(idx>-1)state.localMilestones[idx]={...mToSave,_key:currentEditKey};R.renderMilestones([...state.localMilestones]);}
    state.editingKey=null;
  } else {
    // Push the milestone FIRST — it appears immediately for both users.
    // Then upload the photo and patch it in with a single dbUpdate.
    // This avoids any hang blocking the milestone from appearing.
    let finalKey = null;
    if(state.db&&state.dbPush){const newRef=await state.dbPush(state.dbRef(state.db,`couples/${state.coupleId}/milestones`),m);finalKey=newRef.key;}
    else{finalKey=Date.now().toString();state.localMilestones.push({...m,_key:finalKey});R.renderMilestones([...state.localMilestones]);}

    if(state.pendingPhotoFile && finalKey && state.storage){
      const file = state.pendingPhotoFile;
      const pos = state.pendingPhotoPosition;
      state.pendingPhotoFile = null;
      state.pendingPhotoPosition = "50% 50%";
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
        const raw = await R.compressImage(file, 1200);
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
          const photoRef = state.fbStorageRef(state.storage, path);
          await Promise.race([
            state.fbUploadBytes(photoRef, capturedBlob, {contentType:"image/jpeg"}),
            new Promise((_,rej)=>setTimeout(()=>rej(new Error("Upload timeout")),60000))
          ]);
          const url = await state.fbGetDownloadURL(photoRef);
          // Single dbUpdate — one listener fire, photo appears atomically
          const photoUpdate = {};
          photoUpdate[`couples/${state.coupleId}/milestones/${capturedKey}/photoURL`] = url;
          photoUpdate[`couples/${state.coupleId}/milestones/${capturedKey}/photoPath`] = path;
          if(capturedPos && capturedPos !== "50% 50%") photoUpdate[`couples/${state.coupleId}/milestones/${capturedKey}/photoPosition`] = capturedPos;
          await state.dbUpdate(state.dbRef(state.db), photoUpdate);
          // Update registry so view/reposition works immediately
          const regItem = state._msRegistry.get(capturedKey)||{};
          state._msRegistry.set(capturedKey, {...regItem, _key:capturedKey, photoURL:url, photoPath:path, photoPosition:capturedPos||'center center'});
        }catch(photoErr){
          console.error("Background photo upload failed:", photoErr);
          // Milestone already saved — user can add photo later via the card
        }
      })();
    } else {
      state.pendingPhotoFile=null;
      state.pendingPhotoPosition="50% 50%";
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
  const cached = state.localMilestones.find(m=>m._key===key);
  const photoPath = cached?.photoPath||null;
  // Delete photo from Storage if exists
  if(photoPath && state.storage && state.fbStorageRef && state.fbDeleteObject){
    try{ await state.fbDeleteObject(state.fbStorageRef(state.storage, photoPath)); }
    catch(e){ console.warn("Storage delete failed:", e); }
  }
  // Delete milestone from database
  if(state.db&&state.dbRemove)state.dbRemove(state.dbRef(state.db,`couples/${state.coupleId}/milestones/${key}`));
  else{state.localMilestones=state.localMilestones.filter(m=>m._key!==key);R.renderMilestones([...state.localMilestones]);}
};

// Meetup
// Milestone photos

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
    state.pendingPhotoFile = stableBlob;
    state.pendingPhotoPosition = "50% 50%";
    state.repositionMode = "new";
    // Show reposition modal immediately with local blob URL
    const blobUrl = URL.createObjectURL(stableBlob);
    R.openRepositionModalForNew(blobUrl);
  };
  reader.onerror = () => {
    // Fallback: use original File if read fails
    state.pendingPhotoFile = file;
    state.pendingPhotoPosition = "50% 50%";
    state.repositionMode = "new";
    const blobUrl = URL.createObjectURL(file);
    R.openRepositionModalForNew(blobUrl);
  };
  reader.readAsArrayBuffer(file);
};

window.triggerPhotoUploadFor = function(key){
  state.pendingPhotoForKey = key;
  // Create temp input and trigger
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = async function(){
    const file = input.files[0];
    if(!file || !state.storage) return;
    // Validate type
    const validTypes = ["image/jpeg","image/jpg","image/png","image/gif","image/webp","image/heic","image/heif"];
    if(!validTypes.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|gif|webp|heic|heif)$/i)) return;
    // Validate size (max 10MB)
    if(file.size > 10 * 1024 * 1024) return;
    // Show reposition modal first, upload happens on "Done"
    state.repositionMode = "card";
    state.pendingPhotoFile = file;
    state.pendingPhotoPosition = "50% 50%";
    const blobUrl = URL.createObjectURL(file);
    R.openRepositionModalForCard(key, blobUrl);
  };
  input.click();
};

async function uploadPhotoForKey(key, file, position, isNewMilestone=false){
  if(!state.storage || !state.fbStorageRef || !state.fbUploadBytes || !state.fbGetDownloadURL){
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
  const compressed = await R.compressImage(file, 1200);
  // Force safe .jpg filename regardless of input (handles HEIC, no-extension, etc.)
  const baseName = (file.name||file._name||"photo").replace(/\.[^.]+$/, "").replace(/[^a-z0-9]/gi,"_").substring(0,40) || "photo";
  const safeName = `${baseName}.jpg`;
  const path = `milestones/${key}/${Date.now()}_${safeName}`;
  const ref = state.fbStorageRef(state.storage, path);
  // uploadBytes needs a Blob — if compressImage fell back to File, wrap it
  const uploadData = (compressed instanceof Blob) ? compressed : new Blob([compressed], {type:"image/jpeg"});
  // Add upload timeout — Firebase can hang on poor connections
  await Promise.race([
    state.fbUploadBytes(ref, uploadData, {contentType:"image/jpeg"}),
    new Promise((_,rej)=>setTimeout(()=>rej(new Error("Upload timeout after 30s")),30000))
  ]);
  const url = await state.fbGetDownloadURL(ref);
  // Save URL AND path to Firebase (path needed for proper deletion)
  if(state.db && state.dbSet){
    await state.dbSet(state.dbRef(state.db,`couples/${state.coupleId}/milestones/${key}/photoURL`), url);
    await state.dbSet(state.dbRef(state.db,`couples/${state.coupleId}/milestones/${key}/photoPath`), path);
    if(position) await state.dbSet(state.dbRef(state.db,`couples/${state.coupleId}/milestones/${key}/photoPosition`), position);
  }
  // Immediately update card in DOM without waiting for Firebase listener
  // Only for EDITS — for new milestones, the Firebase listener re-renders with photoURL automatically
  // Update registry so _msViewPhoto/_msReposition work on the new card
  const regItem = state._msRegistry.get(key)||{};
  state._msRegistry.set(key, {...regItem, _key:key, photoURL:url, photoPath:path, photoPosition:position||'center center'});
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
    await R.uploadPhotoForKey(key, file, position, isNewMilestone);
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
  if(!key || !state.db) return;
  // Get path first, then delete from Storage and Firebase
  if(state.fbOnValue){
    state.fbOnValue(state.dbRef(state.db,`couples/${state.coupleId}/milestones/${key}/photoPath`), async snap=>{
      const path = snap.val();
      if(path && state.storage && state.fbStorageRef && state.fbDeleteObject){
        try{ await state.fbDeleteObject(state.fbStorageRef(state.storage, path)); }
        catch(e){ console.warn("Storage delete failed:", e); }
      }
      if(state.dbSet){
        await state.dbSet(state.dbRef(state.db,`couples/${state.coupleId}/milestones/${key}/photoURL`), null);
        await state.dbSet(state.dbRef(state.db,`couples/${state.coupleId}/milestones/${key}/photoPath`), null);
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

function openRepositionBase(url, title, position){
  const parts = (position || "center center").split(" ");
  const px = parts[0] === "center" ? 50 : parseFloat(parts[0]);
  const py = parts[1] === "center" ? 50 : parseFloat(parts[1]);
  state.repositionPos = {x: isNaN(px)?50:px, y: isNaN(py)?50:py};
  state.repositionStartPos = {...state.repositionPos};
  const overlay = document.getElementById("m-reposition-overlay");
  const img = document.getElementById("m-reposition-img");
  const titleEl = document.getElementById("m-reposition-title");
  const frame = document.getElementById("m-reposition-frame");
  if(!overlay || !img) return;
  img.src = url;
  if(titleEl) titleEl.textContent = title || "";
  // Wait for image to load so naturalWidth/Height are available for overflow calc
  img.onload = ()=>{ R.applyRepositionPos(); };
  if(img.complete && img.naturalWidth) R.applyRepositionPos();
  frame.onmousedown = R.startRepositionDrag;
  frame.ontouchstart = R.startRepositionDrag;
  overlay.classList.add("open");
}

function openRepositionModalForNew(blobUrl){
  state.repositionKey = null;
  state.repositionMode = "new";
  R.openRepositionBase(blobUrl, "New photo", "50% 50%");
}

function openRepositionModalForCard(key, blobUrl){
  state.repositionKey = key;
  state.repositionMode = "card";
  R.openRepositionBase(blobUrl, "", "50% 50%");
}

window.openRepositionModal = function(key, url, title, currentPosition){
  state.repositionKey = key;
  state.repositionMode = "existing";
  R.openRepositionBase(url, title, currentPosition);
};

window.closeRepositionModal = function(){
  const overlay = document.getElementById("m-reposition-overlay");
  if(overlay) overlay.classList.remove("open");
  state.repositionKey = null;
  // Remove drag events
  const frame = document.getElementById("m-reposition-frame");
  if(frame){ frame.onmousedown = null; frame.ontouchstart = null; }
};

window.resetReposition = function(){
  state.repositionPos = {x: 50, y: 50};
  R.applyRepositionPos();
};

window.saveReposition = async function(){
  const posStr = `${state.repositionPos.x}% ${state.repositionPos.y}%`;
  state.pendingPhotoPosition = posStr;

  if(state.repositionMode === "new"){
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

  if(state.repositionMode === "card"){
    // From card placeholder — upload now with chosen position
    if(!state.repositionKey || !state.pendingPhotoFile) { closeRepositionModal(); return; }
    const key = state.repositionKey;
    const fileToUpload = state.pendingPhotoFile;
    state.pendingPhotoFile = null; // clear before async so it can't be double-used
    closeRepositionModal();
    // Show uploading state on the save button
    const sb = document.getElementById("m-save-btn");
    if(sb) sb.textContent = "Uploading…";
    await R.safeUploadPhotoForKey(key, fileToUpload, posStr);
    if(sb && sb.textContent === "Uploading…") sb.textContent = "Save";
    return;
  }

  // "existing" mode — just update position in Firebase
  if(!state.repositionKey) return;
  if(state.db && state.dbSet) await state.dbSet(state.dbRef(state.db,`couples/${state.coupleId}/milestones/${state.repositionKey}/photoPosition`), posStr);
  // Update registry so next reposition call has fresh position
  const regItem = state._msRegistry.get(state.repositionKey);
  if(regItem) state._msRegistry.set(state.repositionKey, {...regItem, photoPosition: posStr});
  const cardImg = document.querySelector(`.m-photo-wrap[onclick*="${state.repositionKey}"] img`);
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
  const tx = -(state.repositionPos.x / 100) * overflowX;
  const ty = -(state.repositionPos.y / 100) * overflowY;
  img.style.setProperty("--tx", tx.toFixed(2)+"px");
  img.style.setProperty("--ty", ty.toFixed(2)+"px");
  img.style.setProperty("--sc", scale.toFixed(6));
}

function startRepositionDrag(e){
  state.repositionDragging = true;
  state.repositionStartPos = {...state.repositionPos};
  const pt = e.touches ? e.touches[0] : e;
  state.repositionStart = {x: pt.clientX, y: pt.clientY};
  document.onmousemove = R.onRepositionMove;
  document.ontouchmove = R.onRepositionMove;
  document.onmouseup = R.stopRepositionDrag;
  document.ontouchend = R.stopRepositionDrag;
  e.preventDefault();
}

function onRepositionMove(e){
  if(!state.repositionDragging) return;
  const pt = e.touches ? e.touches[0] : e;
  const frame = document.getElementById("m-reposition-frame");
  if(!frame) return;
  const rect = frame.getBoundingClientRect();
  // Use same reference for both axes so horizontal = vertical sensitivity
  // Smaller dimension (height=150px) gives better feel on mobile
  // object-position: 0%=far left, 100%=far right
  // Drag 120px = pan from 0% to 100%
  const sensitivity = 120;
  const dx = (pt.clientX - state.repositionStart.x) / sensitivity * 100;
  const dy = (pt.clientY - state.repositionStart.y) / sensitivity * 100;
  // Dragging right moves view left (natural feel)
  state.repositionPos.x = Math.max(0, Math.min(100, state.repositionStartPos.x - dx));
  state.repositionPos.y = Math.max(0, Math.min(100, state.repositionStartPos.y - dy));
  R.applyRepositionPos();
  e.preventDefault();
}

function stopRepositionDrag(){
  state.repositionDragging = false;
  document.onmousemove = null;
  document.ontouchmove = null;
  document.onmouseup = null;
  document.ontouchend = null;
}


// ── Register for cross-module access ─────────────────────
R.DOT_COLORS = DOT_COLORS;
R.TAG_CLS = TAG_CLS;
R.TAG_ICONS = TAG_ICONS;
R.fmtMDate = fmtMDate;
R.fmtMDateRange = fmtMDateRange;
R._esc = _esc;
R.renderMilestones = renderMilestones;
R.geocodeLocation = geocodeLocation;
R.uploadPhotoForKey = uploadPhotoForKey;
R.safeUploadPhotoForKey = safeUploadPhotoForKey;
R.compressImage = compressImage;
R.openRepositionBase = openRepositionBase;
R.openRepositionModalForNew = openRepositionModalForNew;
R.openRepositionModalForCard = openRepositionModalForCard;
R.applyRepositionPos = applyRepositionPos;
R.startRepositionDrag = startRepositionDrag;
R.onRepositionMove = onRepositionMove;
R.stopRepositionDrag = stopRepositionDrag;

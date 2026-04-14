import { state } from './state.js';
import { R } from './registry.js';

// Bucket list
const BL_ICONS={travel:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="13" rx="2"/><path d="M8 8V6a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>`,food:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12c0 4 3.58 7 8 7s8-3 8-7H4z"/><path d="M4 12h16"/><path d="M7 5l3 7M14 3l3 9"/></svg>`,adventure:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20l6-10 4 6 3-4 5 8H3z"/><path d="M17 8a2 2 0 100-4 2 2 0 000 4z"/></svg>`,together:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21C12 21 3 15 3 9a5 5 0 0110 0 5 5 0 0110 0c0 6-9 12-9 12z"/></svg>`,others:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 3"/></svg>`};
// Map and interval vars — must be declared at module level for strict mode

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

  const filtered=cat=>state.blFilter==="all"?cat:cat.filter(i=>i.category===state.blFilter);
  const todoFiltered=filtered(todo);
  const doneFiltered=filtered(done);

  const todoEl=document.getElementById("bl-todo-list");
  const doneEl=document.getElementById("bl-done-list");
  const doneSep=document.getElementById("bl-done-sep");

  todoEl.innerHTML=todoFiltered.length?todoFiltered.map(R.blItemHTML).join(""):`<p class="empty">No dreams here yet!</p>`;
  doneEl.innerHTML=doneFiltered.map(R.blItemHTML).join("");
  doneSep.style.display=doneFiltered.length?"flex":"none";
}

function blItemHTML(item){
  const icon=R.BL_ICONS[item.category]||R.BL_ICONS.others;
  const k=R._esc(item._key||"");
  return`<div class="bl-item${item.done?" done":""}" id="bli-${k}">
    <div class="bl-check${item.done?" checked":""}" onclick="toggleBucketDone('${k}')">${item.done?'<div class="bl-check-mark"></div>':""}</div>
    <div class="bl-item-icon">${icon}</div>
    <div class="bl-item-body">
      <p class="bl-item-title">${R._esc(item.title)}</p>
      <div class="bl-item-meta">
        <span class="bl-item-cat">${R._esc(item.category||"")}</span>
        <span class="bl-item-who">Added by ${R._esc(item.addedBy||"")}</span>
        ${item.done&&item.completedAt?`<span class="bl-item-who">· ${R.fmtTs(item.completedAt)}</span>`:""}
      </div>
    </div>
    <div class="bl-item-actions">
      ${!item.done?`<button class="bl-item-btn" onclick="editBucketItem('${k}')" title="Edit">✎</button>`:""}
      <button class="bl-item-btn" onclick="deleteBucketItem('${k}')" title="Delete" style="color:var(--muted)">✕</button>
    </div>
  </div>`;
}

window.filterBucket=function(cat){
  state.blFilter=cat;
  document.querySelectorAll(".bl-cat-pill").forEach(p=>p.classList.remove("active"));
  const el=document.getElementById(`bl-filter-${cat}`);
  if(el)el.classList.add("active");
  if(state.db&&state.fbOnValue){
    state.fbOnValue(state.dbRef(state.db,`couples/${state.coupleId}/bucket`),snap=>{
      const d=snap.val();
      R.renderBucket(d?Object.entries(d).map(([k,v])=>({...v,_key:k})):[]); R.updateHomeBucketProgress();
    },{onlyOnce:true});
  } else R.renderBucket([...state.localBucket]);
};

window.toggleBucketForm=function(){
  state.blEditKey=null;
  const f=document.getElementById("bl-add-form");
  f.classList.toggle("open");
  if(f.classList.contains("open")){
    document.getElementById("bl-title-input").value="";
    document.getElementById("bl-cat-input").value="travel";
    document.getElementById("bl-save-btn").textContent="Add";
    document.getElementById("bl-title-input").focus();
  }
};

window.saveBucketItem=async function(){
  const title=document.getElementById("bl-title-input").value.trim();
  const category=document.getElementById("bl-cat-input").value;
  if(!title)return;
  if(state.blEditKey){
    const existingItem=state.localBucket.find(x=>x._key===state.blEditKey);
    const preserveDone=existingItem?.done||false;
    const preserveCompletedAt=existingItem?.completedAt||null;
    if(state.db&&state.dbSet)state.dbSet(state.dbRef(state.db,`couples/${state.coupleId}/bucket/${state.blEditKey}`),{title,category,addedBy:existingItem?.addedBy||state.ME,done:preserveDone,completedAt:preserveCompletedAt,time:existingItem?.time||Date.now()});
    else{const idx=state.localBucket.findIndex(x=>x._key===state.blEditKey);if(idx>-1){state.localBucket[idx].title=title;state.localBucket[idx].category=category;}R.renderBucket([...state.localBucket]);}
    state.blEditKey=null;
  } else {
    const item={title,category,addedBy:state.ME,done:false,time:Date.now()};
    if(state.db&&state.dbPush){
      try{
        await state.dbPush(state.dbRef(state.db,`couples/${state.coupleId}/bucket`),item);
        R.notifyPartner&&R.notifyPartner('bucket');
      }catch(e){ console.error('saveBucketItem failed:',e); return; }
    } else {
      state.localBucket.push({...item,_key:Date.now().toString()});
      R.renderBucket([...state.localBucket]);
    }
  }
  document.getElementById("bl-title-input").value="";
  document.getElementById("bl-add-form").classList.remove("open");
  document.getElementById("bl-save-btn").textContent="Add";
};

window.toggleBucketDone=function(key){
  if(state.db&&state.fbOnValue){
    state.fbOnValue(state.dbRef(state.db,`couples/${state.coupleId}/bucket/${key}`),snap=>{
      const item=snap.val();if(!item)return;
      const newDone=!item.done;
      state.dbSet(state.dbRef(state.db,`couples/${state.coupleId}/bucket/${key}`),{...item,done:newDone,completedAt:newDone?Date.now():null});
    },{onlyOnce:true});
  } else {
    const item=state.localBucket.find(x=>x._key===key);
    if(item){item.done=!item.done;item.completedAt=item.done?Date.now():null;}
    R.renderBucket([...state.localBucket]);
  }
};

window.editBucketItem=function(key){
  if(state.db&&state.fbOnValue){
    state.fbOnValue(state.dbRef(state.db,`couples/${state.coupleId}/bucket/${key}`),snap=>{
      const item=snap.val();if(!item)return;
      state.blEditKey=key;
      const f=document.getElementById("bl-add-form");
      f.classList.add("open");
      document.getElementById("bl-title-input").value=item.title||"";
      document.getElementById("bl-cat-input").value=item.category||"travel";
      document.getElementById("bl-save-btn").textContent="Update";
      document.getElementById("bl-title-input").focus();
      f.scrollIntoView({behavior:"smooth",block:"nearest"});
    },{onlyOnce:true});
  } else {
    const item=state.localBucket.find(x=>x._key===key);if(!item)return;
    state.blEditKey=key;
    const f=document.getElementById("bl-add-form");f.classList.add("open");
    document.getElementById("bl-title-input").value=item.title||"";
    document.getElementById("bl-cat-input").value=item.category||"travel";
    document.getElementById("bl-save-btn").textContent="Update";
  }
};

window.deleteBucketItem=function(key){
  if(state.db&&state.dbRemove)state.dbRemove(state.dbRef(state.db,`couples/${state.coupleId}/bucket/${key}`));
  else{state.localBucket=state.localBucket.filter(x=>x._key!==key);R.renderBucket([...state.localBucket]);}
};


// ── Register for cross-module access ─────────────────────
R.BL_ICONS = BL_ICONS;
R.renderBucket = renderBucket;
R.blItemHTML = blItemHTML;

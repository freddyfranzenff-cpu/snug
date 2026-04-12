import { state } from './state.js';
import { R } from './registry.js';


// Helper: get local date string YYYY-MM-DD from a Date object (no UTC shift)
function _localDateStr(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

window.updateMeetupTime = function(val){
  if(!val || !state.meetupDate) return;
  state._dnTimeVal = val;
  try{
    // Use LOCAL date parts — never toISOString() which shifts to UTC
    const dateStr = R._localDateStr(state.meetupDate);
    const newDate = new Date(`${dateStr}T${val}:00`);
    state.meetupDate = newDate;
    if(state.db && state.coupleId){
      state.dbSet(state.dbRef(state.db,`couples/${state.coupleId}/meetupDate`), `${dateStr}T${val}:00`);
      R.notifyPartner && R.notifyPartner('dateNight');
      // Also update unlock date on unread letter rounds in Together mode
      if(state.coupleType==='together' && state.letterRounds.length){
        state.letterRounds.forEach(round=>{
          if(!round._key || !round.unlockDate) return;
          const meData = round[state.myUid]||{};
          const otherData = round[state.partnerUid]||{};
          if(!meData.readAt && !otherData.readAt){
            state.dbSet(state.dbRef(state.db,`couples/${state.coupleId}/letters/${round._key}/unlockDate`), `${dateStr}T${val}:00`);
          }
        });
      }
    }
    R.startCountdown();
    // Refresh letter timeline if letter page is visible
    const letterPage = document.getElementById('page-letter');
    if(letterPage && letterPage.classList.contains('active')){
      window.initLetterPage && window.initLetterPage();
    }
  }catch(e){ console.error('updateMeetupTime failed:',e); }
};

function _showTimeInput(show){
  const ti = document.getElementById('meetup-time-input');
  if(ti) ti.style.display = show ? '' : 'none';
}

// ── Date night planner ────────────────────────────────────────

function _dnDateKey(){
  if(!state.meetupDate) return null;
  const d = state.meetupDate;
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function loadDnPlanner(){
  if(state._dnUnsub){ try{state._dnUnsub();}catch(e){} state._dnUnsub=null; }
  const dateKey = R._dnDateKey();
  if(!state.db||!state.coupleId||!dateKey) return;

  // Set date label
  const dateLabel = document.getElementById('dn-planner-date');
  if(dateLabel && state.meetupDate){
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    dateLabel.textContent = `${state.meetupDate.getDate()} ${months[state.meetupDate.getMonth()]}`;
  }

  state._dnUnsub = state.fbOnValue(state.dbRef(state.db,`couples/${state.coupleId}/datePlan/${dateKey}`), snap=>{
    const d = snap.val()||{};
    state._dnCurrentPlan = d;
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

function _tpTodayKey(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function loadTodaysPlan(){
  if(state._tpUnsub){ try{state._tpUnsub();}catch(e){} state._tpUnsub=null; }
  if(!state.db||!state.coupleId||!state.myUid||!state.partnerUid) return;
  const today = R._tpTodayKey();

  // Apply avatars (photos if available, initials as fallback)
  R.applyAllAvatars && R.applyAllAvatars();

  state._tpUnsub = state.fbOnValue(state.dbRef(state.db,`couples/${state.coupleId}/todaysPlan/${today}`), snap=>{
    const d = snap.val()||{};
    state._tpMyCurrentVal = d[state.myUid]||'';
    // My display
    const myDisplay = document.getElementById('tp-my-display');
    if(myDisplay){
      myDisplay.textContent = d[state.myUid]||'Nothing yet today';
      myDisplay.className = d[state.myUid] ? 'tp-display-value' : 'tp-display-empty';
    }
    // Other display
    const otherEl = document.getElementById('tp-other-text');
    if(otherEl){
      otherEl.textContent = d[state.partnerUid]||'Waiting for their plan…';
      otherEl.className = d[state.partnerUid] ? 'tp-display-value' : 'tp-display-empty';
    }
  });
}

// ── BOTTOM SHEET SWIPE DISMISS ────────────────────────────────
function _initSheetSwipe(sheetId, overlayId, closeFn, handleSelector){
  const sheet = document.getElementById(sheetId);
  const handle = sheet?.querySelector(handleSelector || '.together-sheet-handle');
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
  const d = state._dnCurrentPlan||{};
  const w = document.getElementById('dn-sheet-where');
  const wh = document.getElementById('dn-sheet-what');
  const who = document.getElementById('dn-sheet-who');
  if(w) w.value = d.where||'';
  if(wh) wh.value = d.what||'';
  if(who) who.value = d.who||'';
  document.getElementById('dn-sheet-overlay').classList.add('open');
  setTimeout(()=>w?.focus(),100);
  R._initSheetSwipe('dn-sheet','dn-sheet-overlay', window.closeDnSheet);
};

window.closeDnSheet = function(){
  document.getElementById('bottom-nav').style.display='flex';
  document.getElementById('dn-sheet-overlay').classList.remove('open');
};

window.saveDnSheet = async function(){
  const dateKey = R._dnDateKey();
  if(!state.db||!state.coupleId||!dateKey) return;
  const plan = {
    where: document.getElementById('dn-sheet-where')?.value.trim()||'',
    what: document.getElementById('dn-sheet-what')?.value.trim()||'',
    who: document.getElementById('dn-sheet-who')?.value.trim()||'',
    updatedAt: Date.now()
  };
  try{
    await state.dbSet(state.dbRef(state.db,`couples/${state.coupleId}/datePlan/${dateKey}`), plan);
    window.closeDnSheet();
  }catch(e){ console.error('saveDnSheet failed:',e); }
};


// ── Today's Plan Sheet ──────────────────────────────────────
window.openTpSheet = function(){
  document.getElementById('bottom-nav').style.display='none';
  const inp = document.getElementById('tp-sheet-input');
  const ctr = document.getElementById('tp-sheet-counter');
  if(inp){ inp.value = state._tpMyCurrentVal||''; }
  if(ctr && inp) ctr.textContent = (inp.value.length)+'/150';
  document.getElementById('tp-sheet-overlay').classList.add('open');
  setTimeout(()=>inp?.focus(),100);
  R._initSheetSwipe('tp-sheet','tp-sheet-overlay', window.closeTpSheet);
};

window.closeTpSheet = function(){
  document.getElementById('bottom-nav').style.display='flex';
  document.getElementById('tp-sheet-overlay').classList.remove('open');
};

window.saveTpSheet = async function(){
  if(!state.db||!state.coupleId||!state.myUid) return;
  const today = R._tpTodayKey();
  const val = document.getElementById('tp-sheet-input')?.value.trim()||'';
  try{
    await state.dbSet(state.dbRef(state.db,`couples/${state.coupleId}/todaysPlan/${today}/${state.myUid}`), val);
    window.closeTpSheet();
  }catch(e){ console.error('saveTpSheet failed:',e); }
};


// ── Memory Jar Sheet ────────────────────────────────────────
window.openMjSheet = function(){
  document.getElementById('bottom-nav').style.display='none';
  if(state._mjMyEntry?.text) return; // already written today
  const inp = document.getElementById('mj-sheet-input');
  const ctr = document.getElementById('mj-sheet-counter');
  if(inp){ inp.value = ''; }
  if(ctr) ctr.textContent = '0/200';
  document.getElementById('mj-sheet-overlay').classList.add('open');
  setTimeout(()=>inp?.focus(),100);
  R._initSheetSwipe('mj-sheet','mj-sheet-overlay', window.closeMjSheet);
};

window.closeMjSheet = function(){
  document.getElementById('bottom-nav').style.display='flex';
  document.getElementById('mj-sheet-overlay').classList.remove('open');
};

window.saveMjSheet = async function(){
  const inp = document.getElementById('mj-sheet-input');
  const text = inp?.value.trim()||'';
  if(!text||!state.db||!state.coupleId||!state.myUid) return;
  if(state._mjMyEntry?.text) return;
  const saveBtn = document.getElementById('mj-sheet-save');
  if(saveBtn) saveBtn.disabled = true;
  const today = R._mjTodayKey();
  const entry = { text, createdAt: Date.now() };
  try{
    await state.dbSet(state.dbRef(state.db,`couples/${state.coupleId}/memoryJar/${today}/${state.myUid}`), entry);
    R.notifyPartner && R.notifyPartner('memoryJar');
    window.closeMjSheet();
  }catch(e){
    console.error('saveMjSheet failed:',e);
    if(saveBtn) saveBtn.disabled = false;
  }
};


// ── Register for cross-module access ─────────────────────
R._localDateStr = _localDateStr;
R._showTimeInput = _showTimeInput;
R._dnDateKey = _dnDateKey;
R.loadDnPlanner = loadDnPlanner;
R._tpTodayKey = _tpTodayKey;
R.loadTodaysPlan = loadTodaysPlan;
R._initSheetSwipe = _initSheetSwipe;

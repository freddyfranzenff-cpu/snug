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

function _esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}

function _fmtDnDate(d){
  if(!d) return '';
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

function _sortedHints(hintsObj){
  if(!hintsObj || typeof hintsObj !== 'object') return [];
  return Object.entries(hintsObj)
    .map(([k,v])=>({_key:k, ...v}))
    .sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
}

function _renderOpenCard(d){
  const doneBtn = d.revealed || !d.mode || d.mode==='open'
    ? `<button class="dn-done-btn" onclick="openDnDoneSheet()">Date done · save as milestone</button>`
    : '';
  return `
    <div class="dn-planner-card">
      <div class="dn-display-row">
        <div class="dn-field-icon">📍</div>
        <div style="flex:1;">
          <div class="dn-field-label">Where</div>
          <div class="${d.where?'dn-display-value':'dn-display-empty'}">${d.where?_esc(d.where):'Not set yet'}</div>
        </div>
      </div>
      <div class="dn-display-row">
        <div class="dn-field-icon">✨</div>
        <div style="flex:1;">
          <div class="dn-field-label">What</div>
          <div class="${d.what?'dn-display-value':'dn-display-empty'}">${d.what?_esc(d.what):'Not set yet'}</div>
        </div>
      </div>
      <div class="dn-display-row">
        <div class="dn-field-icon">🎫</div>
        <div style="flex:1;">
          <div class="dn-field-label">Who's booking</div>
          <div class="${d.who?'dn-display-value':'dn-display-empty'}">${d.who?_esc(d.who):'Not set yet'}</div>
        </div>
      </div>
      <div class="mj-input-row">
        <button class="mj-add-btn" onclick="openDnSheet()">+ Update plan</button>
      </div>
      ${doneBtn}
    </div>`;
}

function _renderMysteryPlannerCard(d){
  const hints = _sortedHints(d.hints);
  const maxHints = 3;
  const lastHint = hints[hints.length-1];
  const awaitingGuess = !!(lastHint && !lastHint.guess);
  const canAddHint = hints.length < maxHints && !awaitingGuess;
  const hintsHtml = hints.map((h,i)=>{
    const guess = h.guess;
    return `
      <div class="dn-hint-item">
        <div class="dn-hint-num">Hint ${i+1}</div>
        <div class="dn-hint-text">${_esc(h.text)}</div>
        ${guess
          ? `<div class="dn-guess-box"><div class="dn-guess-label">Their guess</div><div class="dn-guess-text">${_esc(guess.text)}</div></div>`
          : `<div class="dn-guess-waiting">Waiting for their guess…</div>`}
      </div>`;
  }).join('');
  const addHintBtn = canAddHint
    ? `<button class="mj-add-btn" onclick="openDnAddHintSheet()">+ Drop a hint (${hints.length}/${maxHints})</button>`
    : (awaitingGuess
        ? `<p class="dn-picker-hint" style="margin:.4rem 0 0;">Next hint unlocks after they guess.</p>`
        : `<p class="dn-picker-hint" style="margin:.4rem 0 0;">You've used all ${maxHints} hints.</p>`);
  const where = d.where ? _esc(d.where) : '—';
  const what  = d.what  ? _esc(d.what)  : '—';
  const who   = d.who   ? _esc(d.who)   : '—';
  return `
    <div class="dn-planner-card dn-mystery-planner">
      <div class="dn-mystery-badge">✨ Mystery date · you're planning</div>
      <div class="dn-display-row"><div class="dn-field-icon">📍</div><div style="flex:1;"><div class="dn-field-label">Where</div><div class="${d.where?'dn-display-value':'dn-display-empty'}">${d.where?where:'Not set yet'}</div></div></div>
      <div class="dn-display-row"><div class="dn-field-icon">✨</div><div style="flex:1;"><div class="dn-field-label">What</div><div class="${d.what?'dn-display-value':'dn-display-empty'}">${d.what?what:'Not set yet'}</div></div></div>
      <div class="dn-display-row"><div class="dn-field-icon">🎫</div><div style="flex:1;"><div class="dn-field-label">Who's booking</div><div class="${d.who?'dn-display-value':'dn-display-empty'}">${d.who?who:'Not set yet'}</div></div></div>
      <div class="mj-input-row">
        <button class="mj-add-btn" onclick="openDnSheet()">+ Update plan</button>
      </div>
      <div class="dn-hints-section">
        <div class="dn-hints-heading">Hints</div>
        ${hints.length ? `<div class="dn-hints-list">${hintsHtml}</div>` : `<p class="dn-picker-hint" style="margin:.2rem 0 .5rem;">Drop clues to tease them.</p>`}
        ${addHintBtn}
      </div>
      <button class="dn-reveal-btn" onclick="openDnRevealSheet()">Reveal the surprise</button>
    </div>`;
}

function _renderMysteryPartnerCard(d){
  const hints = _sortedHints(d.hints);
  const activeHint = hints[hints.length-1] || null;
  const alreadyGuessed = !!(activeHint && activeHint.guess);
  const timeLabel = d.time ? d.time : '';
  const dateStr = state.meetupDate ? _fmtDnDate(state.meetupDate) : '';

  const hintBox = activeHint
    ? `<div class="dn-hint-item">
         <div class="dn-hint-num">Hint ${hints.length}</div>
         <div class="dn-hint-text">${_esc(activeHint.text)}</div>
         ${alreadyGuessed
           ? `<div class="dn-guess-box"><div class="dn-guess-label">Your guess</div><div class="dn-guess-text">${_esc(activeHint.guess.text)}</div></div>`
           : `<button class="mj-add-btn" style="margin-top:.5rem;" onclick="openDnGuessSheet()">Guess this hint</button>`}
       </div>`
    : `<p class="dn-picker-hint" style="margin:.2rem 0 0;">No hints yet — stay curious.</p>`;

  return `
    <div class="dn-planner-card dn-mystery-partner">
      <div class="dn-mystery-badge">✨ A mystery date awaits</div>
      <div class="dn-mystery-big">${dateStr}${timeLabel?` · ${_esc(timeLabel)}`:''}</div>
      <p class="dn-mystery-sub">They're planning something special. All you get are hints.</p>
      <div class="dn-hints-section">
        <div class="dn-hints-heading">Current hint</div>
        ${hintBox}
      </div>
    </div>`;
}

function loadDnPlanner(){
  if(state._dnUnsub){ try{state._dnUnsub();}catch(e){} state._dnUnsub=null; }
  const dateKey = R._dnDateKey();
  if(!state.db||!state.coupleId||!dateKey) return;

  // Set date label
  const dateLabel = document.getElementById('dn-planner-date');
  if(dateLabel && state.meetupDate){
    dateLabel.textContent = _fmtDnDate(state.meetupDate);
  }

  _syncDnPickerBtn();
  state._dnUnsub = state.fbOnValue(state.dbRef(state.db,`couples/${state.coupleId}/datePlan/${dateKey}`), snap=>{
    const d = snap.val()||{};
    state._dnCurrentPlan = d;
    const root = document.getElementById('dn-planner-content');
    const heading = document.getElementById('dn-planner-heading');
    if(!root) return;

    const mode = d.mode || 'open';
    const isPlanner = d.plannerId === state.myUid;
    const revealed = !!d.revealed;

    if(mode === 'mystery' && !revealed){
      if(heading) heading.textContent = isPlanner ? 'Your mystery date' : 'A mystery awaits';
      root.innerHTML = isPlanner ? _renderMysteryPlannerCard(d) : _renderMysteryPartnerCard(d);
    } else {
      if(heading) heading.textContent = 'Date night plan';
      root.innerHTML = _renderOpenCard(d);
    }
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


// ── Date Night Picker Sheet (Date/Time/Mode) ────────────
let _dnPickerSelectedMode = 'open';

window.selectDnMode = function(mode){
  _dnPickerSelectedMode = mode;
  document.querySelectorAll('#dn-picker-sheet .dn-mode-opt').forEach(b=>{
    b.classList.toggle('active', b.dataset.mode===mode);
  });
  const hint = document.getElementById('dn-picker-hint');
  if(hint){
    hint.textContent = mode==='mystery'
      ? 'Only you see the plan. Drop up to 3 hints before you reveal.'
      : 'Pick a date and we\'ll both plan it.';
  }
};

function _syncDnPickerBtn(){
  const btn = document.getElementById('dn-picker-btn');
  if(!btn) return;
  if(state.meetupDate && state.meetupDate > new Date()){
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const d = state.meetupDate;
    const timePart = (state._dnTimeVal && state._dnTimeVal !== '23:59') ? ` · ${state._dnTimeVal}` : '';
    btn.textContent = `${d.getDate()} ${months[d.getMonth()]}${timePart}`;
  } else {
    btn.textContent = 'Set date night';
  }
}

window.openDnPickerSheet = function(){
  document.getElementById('bottom-nav').style.display='none';
  const dateInput = document.getElementById('dn-picker-date');
  const timeInput = document.getElementById('dn-picker-time');
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1);
  const maxD = new Date(); maxD.setFullYear(maxD.getFullYear()+2);
  if(dateInput){
    dateInput.min = _localDateStr(tomorrow);
    dateInput.max = _localDateStr(maxD);
    if(state.meetupDate && state.meetupDate > new Date()){
      dateInput.value = _localDateStr(state.meetupDate);
    } else {
      dateInput.value = '';
    }
  }
  if(timeInput){
    // Show the stored time only if it was actually set (not the 23:59 fallback)
    timeInput.value = (state._dnTimeVal && state._dnTimeVal !== '23:59') ? state._dnTimeVal : '';
  }
  // Existing mode for this date
  const d = state._dnCurrentPlan||{};
  const existingMode = d.mode || 'open';
  window.selectDnMode(existingMode);
  document.getElementById('dn-picker-sheet-overlay').classList.add('open');
  R._initSheetSwipe('dn-picker-sheet','dn-picker-sheet-overlay', window.closeDnPickerSheet);
};

window.closeDnPickerSheet = function(){
  document.getElementById('bottom-nav').style.display='flex';
  document.getElementById('dn-picker-sheet-overlay').classList.remove('open');
};

window.saveDnPickerSheet = async function(){
  const dateVal = document.getElementById('dn-picker-date')?.value;
  const timeVal = (document.getElementById('dn-picker-time')?.value||'').trim();
  if(!dateVal){
    const inp = document.getElementById('dn-picker-date');
    if(inp){ inp.style.borderColor = '#e8622a'; setTimeout(()=>inp.style.borderColor='',2000); }
    return;
  }
  const now = new Date();
  const newDate = new Date(`${dateVal}T00:00:00`);
  if(newDate <= now){
    const inp = document.getElementById('dn-picker-date');
    if(inp){ inp.style.borderColor='#e8622a'; setTimeout(()=>inp.style.borderColor='',2000); }
    return;
  }

  const mode = _dnPickerSelectedMode;
  const effectiveTime = timeVal || '23:59';
  state._dnTimeVal = effectiveTime;
  state.meetupDate = new Date(`${dateVal}T${effectiveTime}:00`);

  if(state.db && state.dbSet && state.coupleId){
    try{
      await state.dbSet(state.dbRef(state.db,`couples/${state.coupleId}/meetupDate`), `${dateVal}T${effectiveTime}:00`);
      const dateKey = dateVal;
      // Write datePlan mode + plannerId + time. If existing plan for this date exists and same mode, preserve fields.
      const planRef = state.dbRef(state.db,`couples/${state.coupleId}/datePlan/${dateKey}`);
      let existing = {};
      try{
        await new Promise(res=>state.fbOnValue(planRef, snap=>{ existing = snap.val()||{}; res(); }, {onlyOnce:true}));
      }catch(e){}
      const planObj = {
        ...existing,
        mode,
        time: timeVal || '',
        updatedAt: Date.now(),
      };
      if(mode === 'mystery' && !existing.plannerId){
        planObj.plannerId = state.myUid;
        planObj.revealed = false;
      }
      if(mode === 'open'){
        // Clear any mystery-only fields if switching back
        planObj.plannerId = null;
        planObj.revealed = null;
        planObj.hints = existing.hints || null;
      }
      await state.dbSet(planRef, planObj);

      // Update unlock date on unread letters
      if(state.letterRounds && state.letterRounds.length){
        state.letterRounds.forEach(round=>{
          if(!round._key || !round.unlockDate) return;
          const meData = round[state.myUid]||{};
          const otherData = round[state.partnerUid]||{};
          if(!meData.readAt && !otherData.readAt){
            state.dbSet(state.dbRef(state.db,`couples/${state.coupleId}/letters/${round._key}/unlockDate`), `${dateVal}T${effectiveTime}:00`);
          }
        });
      }

      R.notifyPartner && R.notifyPartner('dateNight');
    }catch(e){ console.error('saveDnPickerSheet failed:',e); }
  }

  R.startCountdown && R.startCountdown();
  const dnPlanner = document.getElementById('dn-planner');
  if(dnPlanner){ dnPlanner.classList.add('visible'); }
  R.loadDnPlanner && R.loadDnPlanner();
  _syncDnPickerBtn();
  window.closeDnPickerSheet();
};

// ── Hint sheet (planner) ────────────────────────────────
window.openDnAddHintSheet = function(){
  const d = state._dnCurrentPlan||{};
  const hints = _sortedHints(d.hints);
  const last = hints[hints.length-1];
  if(hints.length >= 3) return;
  if(last && !last.guess) return; // must wait for guess
  document.getElementById('bottom-nav').style.display='none';
  const inp = document.getElementById('dn-hint-input');
  if(inp) inp.value = '';
  const ctr = document.getElementById('dn-hint-counter');
  if(ctr) ctr.textContent = '0/200';
  const hintCount = document.getElementById('dn-hint-count');
  if(hintCount) hintCount.textContent = `(${hints.length+1} of 3)`;
  document.getElementById('dn-hint-sheet-overlay').classList.add('open');
  setTimeout(()=>inp?.focus(),100);
  R._initSheetSwipe('dn-hint-sheet','dn-hint-sheet-overlay', window.closeDnHintSheet);
};

window.closeDnHintSheet = function(){
  document.getElementById('bottom-nav').style.display='flex';
  document.getElementById('dn-hint-sheet-overlay').classList.remove('open');
};

window.submitDnHint = async function(){
  const text = (document.getElementById('dn-hint-input')?.value||'').trim();
  if(!text) return;
  const dateKey = R._dnDateKey();
  if(!state.db||!state.coupleId||!dateKey||!state.myUid) return;
  const d = state._dnCurrentPlan||{};
  const hints = _sortedHints(d.hints);
  if(hints.length >= 3) return;
  const last = hints[hints.length-1];
  if(last && !last.guess) return;
  try{
    await state.dbPush(state.dbRef(state.db,`couples/${state.coupleId}/datePlan/${dateKey}/hints`), {
      text, authorUid: state.myUid, createdAt: Date.now()
    });
    R.notifyPartner && R.notifyPartner('dateNight');
    window.closeDnHintSheet();
  }catch(e){ console.error('submitDnHint failed:',e); }
};

// ── Guess sheet (partner) ───────────────────────────────
window.openDnGuessSheet = function(){
  const d = state._dnCurrentPlan||{};
  const hints = _sortedHints(d.hints);
  const active = hints[hints.length-1];
  if(!active || active.guess) return;
  document.getElementById('bottom-nav').style.display='none';
  const q = document.getElementById('dn-guess-hint-quote');
  if(q) q.textContent = active.text;
  const inp = document.getElementById('dn-guess-input');
  if(inp) inp.value = '';
  const ctr = document.getElementById('dn-guess-counter');
  if(ctr) ctr.textContent = '0/200';
  document.getElementById('dn-guess-sheet-overlay').classList.add('open');
  setTimeout(()=>inp?.focus(),100);
  R._initSheetSwipe('dn-guess-sheet','dn-guess-sheet-overlay', window.closeDnGuessSheet);
};

window.closeDnGuessSheet = function(){
  document.getElementById('bottom-nav').style.display='flex';
  document.getElementById('dn-guess-sheet-overlay').classList.remove('open');
};

window.submitDnGuess = async function(){
  const text = (document.getElementById('dn-guess-input')?.value||'').trim();
  if(!text) return;
  const dateKey = R._dnDateKey();
  if(!state.db||!state.coupleId||!dateKey||!state.myUid) return;
  const d = state._dnCurrentPlan||{};
  const hints = _sortedHints(d.hints);
  const active = hints[hints.length-1];
  if(!active || active.guess) return;
  try{
    await state.dbSet(state.dbRef(state.db,`couples/${state.coupleId}/datePlan/${dateKey}/hints/${active._key}/guess`), {
      text, authorUid: state.myUid, createdAt: Date.now()
    });
    R.notifyPartner && R.notifyPartner('dateNight');
    window.closeDnGuessSheet();
  }catch(e){ console.error('submitDnGuess failed:',e); }
};

// ── Reveal flow ─────────────────────────────────────────
window.openDnRevealSheet = function(){
  document.getElementById('bottom-nav').style.display='none';
  document.getElementById('dn-reveal-sheet-overlay').classList.add('open');
  R._initSheetSwipe('dn-reveal-sheet','dn-reveal-sheet-overlay', window.closeDnRevealSheet);
};
window.closeDnRevealSheet = function(){
  document.getElementById('bottom-nav').style.display='flex';
  document.getElementById('dn-reveal-sheet-overlay').classList.remove('open');
};
window.confirmDnReveal = async function(){
  const dateKey = R._dnDateKey();
  if(!state.db||!state.coupleId||!dateKey) return;
  try{
    await state.dbSet(state.dbRef(state.db,`couples/${state.coupleId}/datePlan/${dateKey}/revealed`), true);
    R.notifyPartner && R.notifyPartner('dateNight');
    window.closeDnRevealSheet();
  }catch(e){ console.error('confirmDnReveal failed:',e); }
};

// ── Date Done → milestone conversion ────────────────────
let _dnDonePhotoFile = null;

window.handleDnDonePhoto = function(input){
  const f = input.files && input.files[0];
  _dnDonePhotoFile = f || null;
  const btn = document.getElementById('dn-done-photo-btn');
  if(btn) btn.textContent = f ? `📎 ${f.name.length>28?f.name.substring(0,28)+'…':f.name}` : '+ Add photo';
};

window.openDnDoneSheet = function(){
  const d = state._dnCurrentPlan||{};
  document.getElementById('bottom-nav').style.display='none';
  _dnDonePhotoFile = null;
  const photoBtn = document.getElementById('dn-done-photo-btn');
  if(photoBtn) photoBtn.textContent = '+ Add photo';
  const photoInput = document.getElementById('dn-done-photo-input');
  if(photoInput) photoInput.value = '';

  const title = document.getElementById('dn-done-title');
  if(title){
    const baseTitle = d.what ? `Date night · ${d.what}` : 'Date night';
    title.value = baseTitle;
  }
  const notes = document.getElementById('dn-done-notes');
  if(notes){
    const lines = [];
    if(d.where) lines.push(`📍 ${d.where}`);
    if(d.who)   lines.push(`🎫 ${d.who}`);
    const hints = _sortedHints(d.hints);
    if(hints.length){
      lines.push('');
      lines.push('✨ Hints & guesses');
      hints.forEach((h,i)=>{
        lines.push(`${i+1}. ${h.text}`);
        if(h.guess) lines.push(`   → ${h.guess.text}`);
      });
    }
    notes.value = lines.join('\n');
  }
  document.getElementById('dn-done-sheet-overlay').classList.add('open');
  R._initSheetSwipe('dn-done-sheet','dn-done-sheet-overlay', window.closeDnDoneSheet);
};

window.closeDnDoneSheet = function(){
  document.getElementById('bottom-nav').style.display='flex';
  document.getElementById('dn-done-sheet-overlay').classList.remove('open');
};

window.saveDnDoneSheet = async function(){
  const btn = document.getElementById('dn-done-save-btn');
  if(btn) btn.disabled = true;
  try{
    const title = (document.getElementById('dn-done-title')?.value||'').trim() || 'Date night';
    const note  = (document.getElementById('dn-done-notes')?.value||'').trim();
    if(!state.db || !state.dbPush || !state.coupleId){
      window.closeDnDoneSheet(); return;
    }
    const dateKey = R._dnDateKey();
    if(!dateKey){ window.closeDnDoneSheet(); return; }
    const milestone = {
      title,
      date: dateKey,
      note,
      tag: 'memory',
      addedBy: state.ME || '',
      createdAt: Date.now(),
    };
    const newRef = await state.dbPush(state.dbRef(state.db,`couples/${state.coupleId}/milestones`), milestone);
    const msKey = newRef.key;
    R.notifyPartner && R.notifyPartner('milestone');

    // Optional photo upload
    if(_dnDonePhotoFile && state.storage && msKey){
      try{
        const file = _dnDonePhotoFile;
        const path = `milestones/${msKey}/${Date.now()}_datenight.jpg`;
        const compressed = R.compressImage ? await R.compressImage(file, 1200) : file;
        const blob = (compressed instanceof Blob) ? compressed : new Blob([compressed], {type:'image/jpeg'});
        const ref2 = state.fbStorageRef(state.storage, path);
        await state.fbUploadBytes(ref2, blob, {contentType:'image/jpeg'});
        const url = await state.fbGetDownloadURL(ref2);
        await state.dbUpdate(state.dbRef(state.db,`couples/${state.coupleId}/milestones/${msKey}`), {
          photoURL: url, photoPath: path, photoPosition: '50% 50%'
        });
      }catch(e){ console.error('dnDone photo upload failed:',e); }
    }

    _dnDonePhotoFile = null;
    window.closeDnDoneSheet();
  }catch(e){
    console.error('saveDnDoneSheet failed:',e);
  }finally{
    if(btn) btn.disabled = false;
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
R._syncDnPickerBtn = _syncDnPickerBtn;

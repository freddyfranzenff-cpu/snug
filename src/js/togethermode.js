import { state } from './state.js';
import { R } from './registry.js';


// Helper: get local date string YYYY-MM-DD from a Date object (no UTC shift)
function _localDateStr(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

// Legacy helpers removed — time is now picked via openDnPickerSheet.
function _showTimeInput(){ /* no-op: native time input removed */ }

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
  // Firebase push IDs are lexicographically sortable by server timestamp,
  // so key order is authoritative and immune to client clock skew.
  return Object.entries(hintsObj)
    .map(([k,v])=>({_key:k, ...v}))
    .sort((a,b)=> a._key < b._key ? -1 : a._key > b._key ? 1 : 0);
}

function _renderOpenCard(d){
  // Always offer Date Done — open mode (any time) and revealed mystery.
  const doneBtn = `<button class="dn-done-btn" onclick="openDnDoneSheet()">Date done · save as milestone</button>`;
  // In open mode editing the plan is safe. Warn if there are stale mystery hints
  // from a previous mystery run on this dateKey.
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
  const otherName = _esc(state.OTHER || 'your partner');
  const hintsHtml = hints.map((h,i)=>{
    const guess = h.guess;
    const correct = !!h.correct;
    const correctBtn = (guess && !correct)
      ? `<button class="dn-correct-btn" onclick="markHintCorrect('${h._key}')">🎯 You got it!</button>`
      : '';
    const correctBadge = correct ? `<span class="dn-correct-badge">✓ Correct</span>` : '';
    return `
      <div class="dn-hint-item${correct?' correct':''}">
        <div class="dn-hint-num">Hint ${i+1}${correctBadge}</div>
        <div class="dn-hint-text">${_esc(h.text)}</div>
        ${guess
          ? `<div class="dn-guess-box"><div class="dn-guess-label">${otherName}'s guess</div><div class="dn-guess-text">${_esc(guess.text)}</div>${correctBtn}</div>`
          : `<div class="dn-guess-waiting">Waiting for a guess from ${otherName}…</div>`}
      </div>`;
  }).join('');
  const usedAll = hints.length >= maxHints;
  const addHintBtn = canAddHint
    ? `<button class="mj-add-btn" onclick="openDnAddHintSheet()">+ Drop a hint (${hints.length}/${maxHints})</button>`
    : (usedAll
        ? `<p class="dn-picker-hint" style="margin:.4rem 0 0;">You've used all ${maxHints} hints.</p>`
        : `<p class="dn-picker-hint" style="margin:.4rem 0 0;">Next hint unlocks after ${otherName} guesses.</p>`);
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
        ${hints.length ? `<div class="dn-hints-list">${hintsHtml}</div>` : `<p class="dn-picker-hint" style="margin:.2rem 0 .5rem;">Drop clues to tease ${otherName}.</p>`}
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
      <p class="dn-mystery-sub">${_esc(state.OTHER || 'Your partner')} is planning something special. All you get are hints.</p>
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
    _syncDnPickerBtn();
    const root = document.getElementById('dn-planner-content');
    const heading = document.getElementById('dn-planner-heading');
    if(!root) return;

    const mode = d.mode || 'open';
    const hasPlannerId = !!d.plannerId;
    const isPlanner = hasPlannerId && d.plannerId === state.myUid;
    const revealed = !!d.revealed;

    // M2 safety: if the current plan is NOT an active mystery (open, or a
    // revealed mystery) but the activeMystery lock still exists in DB, the
    // lock is stale — clear it. Only the planner (or legacy own-uid lock)
    // can clear under the rules, so we try and swallow permission errors.
    if(!(mode === 'mystery' && !revealed) && state.dbRemove && state.db && state.coupleId){
      state.dbRemove(state.dbRef(state.db,`couples/${state.coupleId}/activeMystery`))
        .catch(()=>{ /* permission denied or not-present — ignore */ });
    }

    if(mode === 'mystery' && !revealed){
      if(!hasPlannerId){
        // Data integrity issue — mystery flagged but no plannerId. Offer recovery.
        if(heading) heading.textContent = 'Mystery date';
        root.innerHTML = `
          <div class="dn-planner-card">
            <div class="dn-display-row" style="display:block;padding:.85rem .9rem;">
              <div class="dn-field-label">Something went wrong</div>
              <div class="dn-display-value" style="margin-top:.25rem;">This date is missing planner info. Tap to re-save it.</div>
            </div>
            <div class="mj-input-row">
              <button class="mj-add-btn" onclick="openDnPickerSheet()">Resave date</button>
            </div>
          </div>`;
      } else {
        if(heading) heading.textContent = isPlanner ? 'Your mystery date' : 'A mystery awaits';
        root.innerHTML = isPlanner ? _renderMysteryPlannerCard(d) : _renderMysteryPartnerCard(d);
      }
    } else {
      if(heading) heading.textContent = 'Date night plan';
      root.innerHTML = _renderOpenCard(d);
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
  // Patch only plan fields — never touch mode/plannerId/revealed/hints/time.
  const patch = {
    where: document.getElementById('dn-sheet-where')?.value.trim()||'',
    what: document.getElementById('dn-sheet-what')?.value.trim()||'',
    who: document.getElementById('dn-sheet-who')?.value.trim()||'',
    updatedAt: Date.now()
  };
  try{
    await state.dbUpdate(state.dbRef(state.db,`couples/${state.coupleId}/datePlan/${dateKey}`), patch);
    window.closeDnSheet();
  }catch(e){ console.error('saveDnSheet failed:',e); }
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
  const isLDR = state.coupleType === 'ldr';
  // Mystery lock: if this date is a non-revealed mystery and I'm not the planner,
  // hide the picker button entirely — only the planner can change the date.
  const plan = state._dnCurrentPlan || {};
  const mysteryLocked = !isLDR
    && plan.mode === 'mystery'
    && !plan.revealed
    && plan.plannerId
    && plan.plannerId !== state.myUid;
  if(mysteryLocked){
    btn.style.display = 'none';
    return;
  }
  // Restore display in case it was previously hidden
  btn.style.display = '';
  if(state.meetupDate && state.meetupDate > new Date()){
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const d = state.meetupDate;
    const timePart = (!isLDR && state._dnTimeVal && state._dnTimeVal !== '23:59') ? ` · ${state._dnTimeVal}` : '';
    btn.textContent = `${d.getDate()} ${months[d.getMonth()]}${timePart}`;
  } else {
    btn.textContent = isLDR ? 'Set meetup date' : 'Set date night';
  }
}

window.openDnPickerSheet = function(){
  document.getElementById('bottom-nav').style.display='none';
  const isLDR = state.coupleType === 'ldr';
  // Mystery lock: non-planner cannot change a mystery date before reveal.
  const plan = state._dnCurrentPlan || {};
  if(!isLDR && plan.mode==='mystery' && !plan.revealed
     && plan.plannerId && plan.plannerId !== state.myUid){
    document.getElementById('bottom-nav').style.display='flex';
    return;
  }
  const titleEl = document.getElementById('dn-picker-title');
  if(titleEl) titleEl.textContent = isLDR ? 'Next meetup' : 'Next date night';
  const togetherOnly = document.getElementById('dn-picker-together-only');
  if(togetherOnly) togetherOnly.style.display = isLDR ? 'none' : '';
  const pickerHint = document.getElementById('dn-picker-hint');
  if(pickerHint && isLDR) pickerHint.textContent = 'Pick the day you\'ll see each other.';
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
    timeInput.value = (!isLDR && state._dnTimeVal && state._dnTimeVal !== '23:59') ? state._dnTimeVal : '';
  }
  // Existing mode for this date (Together only)
  if(!isLDR){
    const d = state._dnCurrentPlan||{};
    const existingMode = d.mode || 'open';
    window.selectDnMode(existingMode);
  } else {
    _dnPickerSelectedMode = 'open';
  }
  document.getElementById('dn-picker-sheet-overlay').classList.add('open');
  R._initSheetSwipe('dn-picker-sheet','dn-picker-sheet-overlay', window.closeDnPickerSheet);
};

window.closeDnPickerSheet = function(){
  document.getElementById('bottom-nav').style.display='flex';
  document.getElementById('dn-picker-sheet-overlay').classList.remove('open');
};

// Update unlock dates on unread letter rounds. If state.letterRounds is not yet
// populated (listener hasn't fired), defer via a one-shot read on /letters.
function _updateUnreadLetterUnlockDates(newUnlockStr){
  if(!state.db || !state.coupleId) return;
  const applyToRound = (round, key) => {
    if(!key || !round || !round.unlockDate) return;
    const meData = round[state.myUid]||{};
    const otherData = round[state.partnerUid]||{};
    if(!meData.readAt && !otherData.readAt){
      state.dbSet(state.dbRef(state.db,`couples/${state.coupleId}/letters/${key}/unlockDate`), newUnlockStr);
    }
  };
  if(state.letterRounds && state.letterRounds.length){
    state.letterRounds.forEach(r => applyToRound(r, r._key));
    return;
  }
  // Deferred path — read once, patch whatever's there.
  try{
    state.fbOnValue(
      state.dbRef(state.db,`couples/${state.coupleId}/letters`),
      snap=>{
        const data = snap.val();
        if(!data) return;
        Object.entries(data).forEach(([key,round])=>applyToRound(round,key));
      },
      { onlyOnce:true }
    );
  }catch(e){ console.warn('deferred letter unlock update failed:',e); }
}

window.saveDnPickerSheet = async function(){
  const isLDR = state.coupleType === 'ldr';
  const dateVal = document.getElementById('dn-picker-date')?.value;
  const timeVal = isLDR ? '' : (document.getElementById('dn-picker-time')?.value||'').trim();
  if(!dateVal){
    const inp = document.getElementById('dn-picker-date');
    if(inp){ inp.style.borderColor = '#e8622a'; setTimeout(()=>inp.style.borderColor='',2000); }
    return;
  }
  // C3: compare against the effective datetime including chosen time.
  // If no time is picked, compare against end of day (23:59).
  const compareTime = timeVal || '23:59';
  const effectiveDateTime = new Date(`${dateVal}T${compareTime}:00`);
  if(effectiveDateTime <= new Date()){
    const inp = document.getElementById('dn-picker-date');
    if(inp){ inp.style.borderColor='#e8622a'; setTimeout(()=>inp.style.borderColor='',2000); }
    return;
  }

  const mode = isLDR ? 'open' : _dnPickerSelectedMode;
  const effectiveTime = timeVal || (isLDR ? '00:00' : '23:59');

  // Capture old dateKey for cleanup if it changes (H1).
  const oldDateKey = state.meetupDate
    ? _localDateStr(state.meetupDate)
    : null;
  const newDateKey = dateVal;
  const dateKeyChanged = oldDateKey && oldDateKey !== newDateKey;

  // Carry over the existing open-mode plan content (where/what/who) when only
  // the date changes — users expect the plan to follow the new date, not reset.
  const carryPlan = (!isLDR && dateKeyChanged && state._dnCurrentPlan && state._dnCurrentPlan.mode !== 'mystery')
    ? {
        where: state._dnCurrentPlan.where || '',
        what:  state._dnCurrentPlan.what  || '',
        who:   state._dnCurrentPlan.who   || '',
      }
    : null;

  // O1: warn if changing the date would destroy existing hints on old dateKey.
  if(dateKeyChanged && state._dnCurrentPlan && state._dnCurrentPlan.mode === 'mystery'){
    const hints = _sortedHints(state._dnCurrentPlan.hints);
    if(hints.length > 0){
      const ok = window.confirm(`Changing the date will delete ${hints.length} hint${hints.length===1?'':'s'} and any guesses from the current mystery. Continue?`);
      if(!ok) return;
    }
  }

  // O2: warn if switching from mystery to open on the SAME dateKey — it will
  // reveal the plan to the partner immediately.
  if(!dateKeyChanged && mode === 'open'
     && state._dnCurrentPlan && state._dnCurrentPlan.mode === 'mystery'
     && state._dnCurrentPlan.plannerId === state.myUid
     && !state._dnCurrentPlan.revealed){
    const ok = window.confirm('Switching to open mode will reveal your plan to your partner immediately. Are you sure?');
    if(!ok) return;
  }

  state._dnTimeVal = effectiveTime;
  state.meetupDate = new Date(`${dateVal}T${effectiveTime}:00`);

  if(state.db && state.dbSet && state.coupleId){
    const storedMeetup = `${dateVal}T${effectiveTime}:00`;
    const amRef = state.dbRef(state.db,`couples/${state.coupleId}/activeMystery`);
    let activeMysteryWritten = false; // tracks whether we set activeMystery=myUid for rollback
    try{
      // STEP 1 (Together only): write activeMystery FIRST so the meetupDate
      // .validate rule sees the lock before any partner device can observe
      // the new meetupDate. LDR never touches this field.
      if(!isLDR){
        if(mode === 'mystery'){
          await state.dbSet(amRef, state.myUid);
          activeMysteryWritten = true;
        } else {
          // Switching to / staying in open: clear any stale lock before the
          // meetupDate write so partner validate passes on subsequent edits.
          await state.dbRemove(amRef);
        }
      }

      // STEP 2: write meetupDate.
      await state.dbSet(state.dbRef(state.db,`couples/${state.coupleId}/meetupDate`), storedMeetup);

      // LDR mode: no datePlan node, just meetup date.
      if(isLDR){
        _updateUnreadLetterUnlockDates(storedMeetup);
        R.notifyPartner && R.notifyPartner('meetup');
        R.startCountdown && R.startCountdown();
        _syncDnPickerBtn();
        window.closeDnPickerSheet();
        return;
      }

      // H1: clean up old datePlan node if the dateKey changed.
      if(dateKeyChanged){
        try{
          await state.dbRemove(state.dbRef(state.db,`couples/${state.coupleId}/datePlan/${oldDateKey}`));
        }catch(e){ console.warn('old datePlan cleanup failed:',e); }
      }

      // H2 / M1: dbUpdate with ONLY the fields actually changing.
      // Never touch hints here. Never overwrite the full node.
      const planRef = state.dbRef(state.db,`couples/${state.coupleId}/datePlan/${newDateKey}`);
      const patch = {
        mode,
        time: timeVal || '',
        updatedAt: Date.now(),
      };
      if(carryPlan){
        patch.where = carryPlan.where;
        patch.what  = carryPlan.what;
        patch.who   = carryPlan.who;
      }
      if(mode === 'mystery'){
        // Only stamp plannerId if not already set (idempotent re-save keeps planner).
        // Read once to avoid clobbering.
        let existingPlanner = null;
        try{
          await new Promise(res=>state.fbOnValue(
            state.dbRef(state.db,`couples/${state.coupleId}/datePlan/${newDateKey}/plannerId`),
            snap=>{ existingPlanner = snap.val(); res(); },
            { onlyOnce:true }
          ));
        }catch(e){}
        if(!existingPlanner){
          patch.plannerId = state.myUid;
          patch.revealed  = false;
        }
      } else {
        // M1: explicit null on mystery-only fields when switching to open.
        patch.plannerId = null;
        patch.revealed  = null;
        patch.hints     = null;
      }
      await state.dbUpdate(planRef, patch);

      // M5: update unread letter unlock dates (with deferred path).
      _updateUnreadLetterUnlockDates(storedMeetup);

      R.notifyPartner && R.notifyPartner('dateNight');
    }catch(e){
      console.error('saveDnPickerSheet failed:',e);
      // Atomic rollback: if we set activeMystery but a later write failed,
      // clear it so the mystery lock doesn't linger without a real mystery.
      if(activeMysteryWritten){
        try{
          await state.dbRemove(amRef);
        }catch(e2){ console.warn('activeMystery rollback failed:',e2); }
      }
      window.alert('Could not save your date. Please check your connection and try again.');
      return;
    }
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
    R.notifyPartner && R.notifyPartner('dnHint');
    window.closeDnHintSheet();
  }catch(e){ console.error('submitDnHint failed:',e); }
};

// ── Mark guess correct (planner) ─────────────────────────
window.markHintCorrect = async function(hintKey){
  const dateKey = R._dnDateKey();
  if(!state.db||!state.coupleId||!dateKey||!hintKey) return;
  const d = state._dnCurrentPlan||{};
  if(!d.plannerId || d.plannerId !== state.myUid) return;
  try{
    await state.dbSet(
      state.dbRef(state.db,`couples/${state.coupleId}/datePlan/${dateKey}/hints/${hintKey}/correct`),
      true
    );
    R.notifyPartner && R.notifyPartner('dnCorrect');
  }catch(e){ console.error('markHintCorrect failed:',e); }
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
  // M4: transaction so simultaneous guesses from two devices can't both succeed.
  // If someone else already wrote a guess at this path, abort and keep theirs.
  try{
    const guessRef = state.dbRef(state.db,`couples/${state.coupleId}/datePlan/${dateKey}/hints/${active._key}/guess`);
    const result = await state.fbRunTransaction(guessRef, current => {
      if(current !== null && current !== undefined) return; // abort — already guessed
      return { text, authorUid: state.myUid, createdAt: Date.now() };
    });
    if(!result || !result.committed){
      // Lost the race — close sheet; listener will surface the winning guess.
      window.closeDnGuessSheet();
      return;
    }
    R.notifyPartner && R.notifyPartner('dnGuess');
    window.closeDnGuessSheet();
  }catch(e){ console.error('submitDnGuess failed:',e); }
};

// ── Reveal flow ─────────────────────────────────────────
window.openDnRevealSheet = function(){
  document.getElementById('bottom-nav').style.display='none';
  const btn = document.querySelector('#dn-reveal-sheet .together-sheet-save');
  if(btn) btn.disabled = false;
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
  // M3: disable the sheet's save button immediately so double-tap can't fire twice.
  const btn = document.querySelector('#dn-reveal-sheet .together-sheet-save');
  if(btn){
    if(btn.disabled) return;
    btn.disabled = true;
  }
  try{
    await state.dbSet(state.dbRef(state.db,`couples/${state.coupleId}/datePlan/${dateKey}/revealed`), true);
    try{
      await state.dbRemove(state.dbRef(state.db,`couples/${state.coupleId}/activeMystery`));
    }catch(e){ console.warn('activeMystery clear on reveal failed:',e); }
    R.notifyPartner && R.notifyPartner('dnReveal');
    window.closeDnRevealSheet();
  }catch(e){
    console.error('confirmDnReveal failed:',e);
    if(btn) btn.disabled = false;
  }
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
        if(i>0) lines.push('');
        lines.push(`${i+1}. Hint: ${h.text}`);
        if(h.guess) lines.push(`Guess: ${h.guess.text}`);
        if(h.correct) lines.push('✓ Correct guess');
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

    // H1: clear the datePlan/{dateKey} node so the same date can't be converted
    // twice and doesn't accumulate stale hints/guesses. Also clear meetupDate so
    // the countdown + planner card reset to "set next date night" state.
    try{
      await state.dbRemove(state.dbRef(state.db,`couples/${state.coupleId}/datePlan/${dateKey}`));
      await state.dbSet(state.dbRef(state.db,`couples/${state.coupleId}/meetupDate`), '');
      await state.dbRemove(state.dbRef(state.db,`couples/${state.coupleId}/activeMystery`));
    }catch(e){ console.warn('datePlan/meetupDate cleanup after Date Done failed:',e); }

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
R._initSheetSwipe = _initSheetSwipe;
R._syncDnPickerBtn = _syncDnPickerBtn;

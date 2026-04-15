import { state } from './state.js';
import { R } from './registry.js';


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

// Mode constants (cleaned up)

function applyMode(type){
  state.coupleType = type;
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
  R.updateMetricChips&&R.updateMetricChips();

  // Update settings toggle if visible
  const settingsLdr = document.getElementById('settings-mode-ldr');
  const settingsTog = document.getElementById('settings-mode-together');
  if(settingsLdr) settingsLdr.classList.toggle('active', isLDR);
  if(settingsTog) settingsTog.classList.toggle('active', isTogether);

  // Letter page eyebrow
  const eyebrow = document.getElementById('letter-page-eyebrow');
  if(eyebrow) eyebrow.textContent = isLDR ? 'For the day we meet' : 'For our date night';

  // sidebar-mode-pill removed

  // Picker button is used in both modes — label and sheet contents adapt via coupleType.
  R._syncDnPickerBtn && R._syncDnPickerBtn();

  // Date night planner — Together mode, any time meetupDate is set (past or future).
  // Past dates stay visible so users can tap "Date done → save as milestone".
  const dnPlanner = document.getElementById('dn-planner');
  if(dnPlanner){
    const show = isTogether && !!state.meetupDate;
    dnPlanner.classList.toggle('visible', show);
    if(show) R.loadDnPlanner && R.loadDnPlanner();
  }

  // Tonight's Mood — Together mode only
  const moodCard = document.getElementById('tonights-mood-card');
  if(moodCard){
    moodCard.style.display = isTogether ? '' : 'none';
    if(isTogether){
      R.initTonightsMood && R.initTonightsMood();
    } else {
      R.teardownTonightsMood && R.teardownTonightsMood();
    }
  }
}

function startCoupleTypeListener(){
  if(state._coupleTypeUnsub){ try{state._coupleTypeUnsub();}catch(e){} state._coupleTypeUnsub=null; }
  if(!state.db||!state.coupleId) return;
  state._coupleTypeUnsub = state.fbOnValue(state.dbRef(state.db,`couples/${state.coupleId}/coupleType`), snap=>{
    const type = snap.val()||'ldr';
    R.applyMode(type);
  });
}

// Live listener on meetupDate. Keeps both partners in sync when either side
// picks/replaces a date — critical for the mystery flow, where dateKey drives
// which datePlan node loadDnPlanner subscribes to.
function startMeetupDateListener(){
  if(state._meetupDateUnsub){ try{state._meetupDateUnsub();}catch(e){} state._meetupDateUnsub=null; }
  if(!state.db||!state.coupleId) return;
  state._meetupDateUnsub = state.fbOnValue(state.dbRef(state.db,`couples/${state.coupleId}/meetupDate`), snap=>{
    const stored = snap.val();
    const prevKey = state.meetupDate
      ? `${state.meetupDate.getFullYear()}-${String(state.meetupDate.getMonth()+1).padStart(2,'0')}-${String(state.meetupDate.getDate()).padStart(2,'0')}`
      : null;
    if(!stored){
      state.meetupDate = null;
      state.coupleMeetupDate = '';
    } else {
      state.coupleMeetupDate = stored;
      state.meetupDate = new Date(stored);
      if(stored.includes('T')){
        const timePart = stored.split('T')[1]?.substring(0,5) || '';
        // T00:00:00 is the "no time set" sentinel → empty _dnTimeVal.
        state._dnTimeVal = (timePart === '00:00') ? '' : timePart;
      }
    }
    const newKey = state.meetupDate
      ? `${state.meetupDate.getFullYear()}-${String(state.meetupDate.getMonth()+1).padStart(2,'0')}-${String(state.meetupDate.getDate()).padStart(2,'0')}`
      : null;
    // Refresh UI
    R.startCountdown && R.startCountdown();
    R._syncDnPickerBtn && R._syncDnPickerBtn();
    R.renderUsLetterShortcut && R.renderUsLetterShortcut();
    // Toggle dn-planner visibility + rebind loadDnPlanner to new dateKey
    const dnPlanner = document.getElementById('dn-planner');
    if(dnPlanner){
      const show = state.coupleType==='together' && !!state.meetupDate;
      dnPlanner.classList.toggle('visible', show);
    }
    if(state.coupleType==='together' && newKey !== prevKey){
      R.loadDnPlanner && R.loadDnPlanner();
    }
  });
}

window.selectCreateMode = function(mode){
  document.getElementById('couple-type-input').value = mode;
  document.getElementById('create-mode-ldr').classList.toggle('active', mode==='ldr');
  document.getElementById('create-mode-together').classList.toggle('active', mode==='together');
};

window.selectSettingsMode = async function(mode){
  if(!state.db||!state.coupleId) return;
  if(mode === state.coupleType) return; // already in this mode

  const resetToggle = () => {
    const ldrBtn = document.getElementById('settings-mode-ldr');
    const togBtn = document.getElementById('settings-mode-together');
    if(ldrBtn) ldrBtn.classList.toggle('active', state.coupleType==='ldr');
    if(togBtn) togBtn.classList.toggle('active', state.coupleType==='together');
  };

  // Mystery-date lock: if a non-revealed mystery is active and the current
  // user is not the planner, abort. Mode switches clear meetupDate, which
  // would destroy the planner's surprise.
  const plan = state._dnCurrentPlan || {};
  const mysteryActive = state.coupleType === 'together'
    && plan.mode === 'mystery'
    && !plan.revealed
    && plan.plannerId
    && plan.plannerId !== state.myUid;
  if(mysteryActive){
    window.alert("Your partner's mystery date is still active. Only your partner can change or cancel it before the reveal.");
    resetToggle();
    return;
  }

  // Check if there's an active letter round or a date set
  const hasDate = !!state.meetupDate && state.meetupDate > new Date();
  const hasActiveRound = state.letterRounds && state.letterRounds.some(r => {
    const ud = new Date(r.unlockDate);
    return ud > new Date();
  });
  const needsPrompt = hasDate || hasActiveRound;

  if(needsPrompt){
    const modeLabel = mode === 'together' ? 'Together' : 'Long distance';
    const confirmed = window.confirm(
      `Switch to ${modeLabel} mode?

Your letters will be kept but your current date will be cleared. You can set a new one after switching.`
    );
    if(!confirmed){
      resetToggle();
      return;
    }
    // Capture the old dateKey before wiping meetupDate so we can clean up the
    // orphaned datePlan/{dateKey} node that would otherwise linger.
    const oldDateKey = state.meetupDate
      ? `${state.meetupDate.getFullYear()}-${String(state.meetupDate.getMonth()+1).padStart(2,'0')}-${String(state.meetupDate.getDate()).padStart(2,'0')}`
      : null;
    try{
      await state.dbSet(state.dbRef(state.db,`couples/${state.coupleId}/meetupDate`), '');
      state.meetupDate = null;
      // Clean up the orphan datePlan node (hints/guesses/plan content).
      if(oldDateKey){
        try{
          await state.dbRemove(state.dbRef(state.db,`couples/${state.coupleId}/datePlan/${oldDateKey}`));
        }catch(e){ console.warn('datePlan cleanup on mode switch failed:',e); }
      }
      // Update countdown UI
      if(window.startCountdown) R.startCountdown();
      R._syncDnPickerBtn && R._syncDnPickerBtn();
    }catch(e){ console.error('clearMeetupDate failed:',e); }
  }

  // M2: always clear activeMystery on ANY mode switch — not just when a date
  // was present. This also safety-cleans any orphaned lock left behind by an
  // earlier partial failure, regardless of whether the user hit the prompt
  // branch above.
  try{
    await state.dbRemove(state.dbRef(state.db,`couples/${state.coupleId}/activeMystery`));
  }catch(e){ console.warn('activeMystery clear on mode switch failed:',e); }

  // Leaving Together mode — drop stale plan state so the LDR save path
  // doesn't trigger mystery-hint confirmation prompts against dead data.
  if(state.coupleType === 'together' && mode === 'ldr'){
    state._dnCurrentPlan = null;
    if(state._dnUnsub){ try{state._dnUnsub();}catch(e){} state._dnUnsub = null; }
  }

  try{
    await state.dbSet(state.dbRef(state.db,`couples/${state.coupleId}/coupleType`), mode);
    // Listener fires on both devices automatically
  }catch(e){ console.error('selectSettingsMode failed:',e); }
};

// ── Register for cross-module access ─────────────────────
R.applyMode = applyMode;
R.startCoupleTypeListener = startCoupleTypeListener;
R.startMeetupDateListener = startMeetupDateListener;

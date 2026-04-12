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
  R._showTimeInput && R._showTimeInput(isTogether);

  // Date night planner — Together mode only, only if meetupDate is set
  const dnPlanner = document.getElementById('dn-planner');
  if(dnPlanner){
    const show = isTogether && !!state.meetupDate && state.meetupDate > new Date();
    dnPlanner.classList.toggle('visible', show);
    if(show) R.loadDnPlanner && R.loadDnPlanner();
  }

  // Today's plan — Together mode only
  const todaysPlan = document.getElementById('todays-plan');
  if(todaysPlan){
    todaysPlan.classList.toggle('visible', isTogether);
    if(isTogether) R.loadTodaysPlan && R.loadTodaysPlan();
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

window.selectCreateMode = function(mode){
  document.getElementById('couple-type-input').value = mode;
  document.getElementById('create-mode-ldr').classList.toggle('active', mode==='ldr');
  document.getElementById('create-mode-together').classList.toggle('active', mode==='together');
};

window.selectSettingsMode = async function(mode){
  if(!state.db||!state.coupleId) return;
  if(mode === state.coupleType) return; // already in this mode

  // Check if there's an active letter round or a date set
  const hasDate = !!state.meetupDate && state.meetupDate > new Date();
  const hasActiveRound = state.letterRounds && state.letterRounds.some(r => {
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
      if(ldrBtn) ldrBtn.classList.toggle('active', state.coupleType==='ldr');
      if(togBtn) togBtn.classList.toggle('active', state.coupleType==='together');
      return;
    }
    // Clear the date
    try{
      await state.dbSet(state.dbRef(state.db,`couples/${state.coupleId}/meetupDate`), '');
      state.meetupDate = null;
      // Update countdown UI
      if(window.startCountdown) R.startCountdown();
      const input = document.getElementById('meetup-date-input');
      if(input) input.value = '';
    }catch(e){ console.error('clearMeetupDate failed:',e); }
  }

  try{
    await state.dbSet(state.dbRef(state.db,`couples/${state.coupleId}/coupleType`), mode);
    // Listener fires on both devices automatically
  }catch(e){ console.error('selectSettingsMode failed:',e); }
};

// ── Register for cross-module access ─────────────────────
R.applyMode = applyMode;
R.startCoupleTypeListener = startCoupleTypeListener;

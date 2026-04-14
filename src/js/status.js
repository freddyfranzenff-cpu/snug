import { state } from './state.js';
import { R } from './registry.js';

// ── HOME TABS ──────────────────────────────────────────
window.switchHomeTab = function(tab){
  ['now','us','summary'].forEach(t=>{
    const btn = document.getElementById(`tab-${t}`);
    if(btn) btn.classList.toggle('active', t===tab);
    const panel = document.getElementById(`panel-${t}`);
    if(panel){
      panel.classList.toggle('active', t===tab);
      if(t===tab) panel.scrollTop = 0;
    }
  });
  if(tab==='summary' && R.renderSummary){
    R.renderSummary();
  }
  // Re-invalidate map size when Now tab shown — Leaflet needs visible container
  if(tab==='now' && state.mapInstance){
    setTimeout(()=>{ try{ state.mapInstance.invalidateSize(); }catch(e){} }, 50);
  }
};

// Moments tab removed — Story/Moments section replaced by Summary tab.
// Kept as a no-op so legacy callers still work until they're cleaned up.
function updateMomentsSubtitles(){}

// Update bucket progress on Us tab
function updateHomeBucketProgress(){
  if(!state.localBucket) return;
  const total = state.localBucket.length;
  const done = state.localBucket.filter(i=>i.done).length;
  const pct = total > 0 ? Math.round((done/total)*100) : 0;
  const doneEl = document.getElementById('home-bl-done');
  const totalEl = document.getElementById('home-bl-total');
  const barEl = document.getElementById('home-bl-bar');
  if(doneEl) doneEl.textContent = done;
  if(totalEl) totalEl.textContent = total;
  if(barEl) barEl.style.width = `${pct}%`;
}

// ── STATUS + MOOD ────────────────────────────────────────
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
  'Outside':'☀️','Shopping':'🛍️','Studying':'📚',
  'Gym':'🏋️','Driving':'🚗','Socialising':'🥂'
};

function renderStatusCard(){
  const now = Date.now();
  // Set names
  const myNameEl = document.getElementById('status-my-name');
  const otherNameEl = document.getElementById('status-other-name');
  if(myNameEl) myNameEl.textContent = state.ME||'—';
  if(otherNameEl) otherNameEl.textContent = state.OTHER||'—';

  // My status
  const myEmoji = document.getElementById('status-my-emoji');
  const myActivity = document.getElementById('status-my-activity');
  const myMood = document.getElementById('status-my-mood');
  const myTime = document.getElementById('status-my-time');
  const myExpired = !state.myStatus || !state.myStatus.updatedAt || (now - state.myStatus.updatedAt > R.STATUS_EXPIRY_MS);
  if(myExpired){
    if(myEmoji){ myEmoji.textContent = '💤'; myEmoji.style.opacity='.35'; }
    if(myActivity) myActivity.innerHTML = '<span class="status-empty">No status set</span>';
    if(myMood) myMood.textContent = '';
    if(myTime) myTime.textContent = '';
  } else {
    if(myEmoji){ myEmoji.textContent = R.ACTIVITY_EMOJI[state.myStatus.activity]||'—'; myEmoji.style.opacity='1'; }
    if(myActivity) myActivity.textContent = state.myStatus.activity||'';
    if(myMood) myMood.textContent = state.myStatus.mood ? `feeling ${state.myStatus.mood}` : '';
    if(myTime) myTime.textContent = R.fmtStatusTime(state.myStatus.updatedAt);
  }

  // Partner status
  const otherEmoji = document.getElementById('status-other-emoji');
  const otherActivity = document.getElementById('status-other-activity');
  const otherMood = document.getElementById('status-other-mood');
  const otherTime = document.getElementById('status-other-time');
  const otherExpired = !state.otherStatus || !state.otherStatus.updatedAt || (now - state.otherStatus.updatedAt > R.STATUS_EXPIRY_MS);
  if(otherExpired){
    if(otherEmoji){ otherEmoji.textContent = '💤'; otherEmoji.style.opacity='.35'; }
    if(otherActivity) otherActivity.innerHTML = '<span class="status-empty">No status set</span>';
    if(otherMood) otherMood.textContent = '';
    if(otherTime) otherTime.textContent = '';
  } else {
    if(otherEmoji){ otherEmoji.textContent = R.ACTIVITY_EMOJI[state.otherStatus.activity]||'—'; otherEmoji.style.opacity='1'; }
    if(otherActivity) otherActivity.textContent = state.otherStatus.activity||'';
    if(otherMood) otherMood.textContent = state.otherStatus.mood ? `feeling ${state.otherStatus.mood}` : '';
    if(otherTime) otherTime.textContent = R.fmtStatusTime(state.otherStatus.updatedAt);
  }
}

window.openStatusSheet = function(){
  document.getElementById('bottom-nav').style.display='none';
  // Pre-select current values
  document.querySelectorAll('.status-act-opt').forEach(el=>{
    el.classList.toggle('selected', el.dataset.activity === (state.myStatus?.activity||null));
  });
  document.querySelectorAll('.status-mood-pill').forEach(el=>{
    el.classList.toggle('selected', el.dataset.mood === (state.myStatus?.mood||null));
  });
  state._selectedActivity = state.myStatus?.activity||null;
  state._selectedMood = state.myStatus?.mood||null;
  document.getElementById('status-sheet-overlay').classList.add('open');
  R._initSheetSwipe('status-sheet','status-sheet-overlay', window.closeStatusSheet, '.status-sheet-handle');
};

window.closeStatusSheet = function(){
  document.getElementById('bottom-nav').style.display='flex';
  document.getElementById('status-sheet-overlay').classList.remove('open');
};

window.selectActivity = function(el){
  document.querySelectorAll('.status-act-opt').forEach(o=>o.classList.remove('selected'));
  el.classList.add('selected');
  state._selectedActivity = el.dataset.activity;
};

window.selectMood = function(el){
  document.querySelectorAll('.status-mood-pill').forEach(o=>o.classList.remove('selected'));
  el.classList.add('selected');
  state._selectedMood = el.dataset.mood;
};

window.saveStatus = async function(){
  if(!state._selectedActivity && !state._selectedMood) return;
  if(!state.db||!state.coupleId||!state.myUid) return;
  const status = {
    activity: state._selectedActivity||null,
    mood: state._selectedMood||null,
    updatedAt: Date.now()
  };
  const prev = state.myStatus || {};
  const changed = (prev.activity||null) !== status.activity
               || (prev.mood||null)     !== status.mood;
  try{
    await state.dbSet(state.dbRef(state.db,`couples/${state.coupleId}/presence/${state.myUid}/status`), status);
    if(changed) R.notifyPartner && R.notifyPartner('status');
    state.myStatus = status;
    R.renderStatusCard();
    window.closeStatusSheet();
  }catch(e){
    console.error('saveStatus failed:', e);
  }
};

// Start a 1-minute interval to refresh status time labels and check expiry
function startStatusRefresh(){
  if(state.statusRefreshInterval) clearInterval(state.statusRefreshInterval);
  state.statusRefreshInterval = setInterval(()=>{ R.renderStatusCard(); }, 60000);
}


// ── Register for cross-module access ─────────────────────
R.updateMomentsSubtitles = updateMomentsSubtitles;
R.updateHomeBucketProgress = updateHomeBucketProgress;
R.STATUS_EXPIRY_MS = STATUS_EXPIRY_MS;
R.fmtStatusTime = fmtStatusTime;
R.ACTIVITY_EMOJI = ACTIVITY_EMOJI;
R.renderStatusCard = renderStatusCard;
R.startStatusRefresh = startStatusRefresh;

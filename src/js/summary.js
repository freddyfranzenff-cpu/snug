import { state } from './state.js';
import { R } from './registry.js';

// Home → Summary tab.
// All reads are one-shot snapshots (no live listeners) against couple nodes.
// Week = last 7 days incl. today. Month = last 30 days incl. today.

let _currentRange = 'week';

function _rangeStartMs(range){
  const days = range === 'month' ? 30 : 7;
  return Date.now() - (days * 86400000);
}

function _dateKeysInRange(range){
  const days = range === 'month' ? 30 : 7;
  const out = [];
  const now = new Date();
  for(let i = 0; i < days; i++){
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    out.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
  }
  return out;
}

async function _oneShot(path){
  if(!state.db || !state.coupleId) return null;
  return new Promise(res => {
    try{
      state.fbOnValue(
        state.dbRef(state.db, `couples/${state.coupleId}/${path}`),
        snap => res(snap.val()),
        { onlyOnce: true }
      );
    }catch(e){ res(null); }
  });
}

window.setSummaryRange = function(range){
  _currentRange = range;
  document.querySelectorAll('#summary-range-toggle .summary-range-btn').forEach(b=>{
    b.classList.toggle('active', b.dataset.range === range);
  });
  renderSummary();
};

async function renderSummary(){
  const grid = document.getElementById('summary-grid');
  if(!grid) return;
  if(!state.db || !state.coupleId){
    grid.innerHTML = '<p class="empty">Nothing here yet — your story is just getting started.</p>';
    return;
  }
  grid.innerHTML = '<p class="empty" style="padding:1rem;">Loading…</p>';
  const range = _currentRange;
  const startMs = _rangeStartMs(range);
  const keys = _dateKeysInRange(range);

  const [memoryJar, pulses, milestones, tonightsMood] = await Promise.all([
    _oneShot('memoryJar'),
    _oneShot('pulses'),
    _oneShot('milestones'),
    _oneShot('tonightsMood'),
  ]);

  // ── Memory jar counts per user
  let mjMine = 0, mjTheirs = 0;
  if(memoryJar){
    for(const k of keys){
      const day = memoryJar[k];
      if(!day) continue;
      if(day[state.myUid]?.text) mjMine++;
      if(day[state.partnerUid]?.text) mjTheirs++;
    }
  }

  // ── Pulses sent, per user
  let pulsesMine = 0, pulsesTheirs = 0;
  if(pulses){
    for(const p of Object.values(pulses)){
      if(!p || typeof p !== 'object') continue;
      if(!p.time || p.time < startMs) continue;
      if(p.from === state.myUid) pulsesMine++;
      else if(p.from === state.partnerUid) pulsesTheirs++;
    }
  }

  // ── Milestones added in range (by date)
  let milestonesAdded = 0;
  if(milestones){
    for(const m of Object.values(milestones)){
      if(!m || !m.date) continue;
      const md = new Date(m.date + 'T12:00:00').getTime();
      if(md >= startMs && md <= Date.now()) milestonesAdded++;
    }
  }

  // ── Streak (current value — same as elsewhere)
  const streak = state._mjStreakCount || 0;

  // ── Tonight's Mood match rate (Together mode only)
  let moodMatchCard = '';
  if(state.coupleType === 'together'){
    let bothCount = 0, matchCount = 0;
    if(tonightsMood){
      for(const k of keys){
        const day = tonightsMood[k];
        if(!day) continue;
        const mine = day[state.myUid]?.mood;
        const theirs = day[state.partnerUid]?.mood;
        if(mine && theirs){
          bothCount++;
          if(mine === theirs) matchCount++;
        }
      }
    }
    const pct = bothCount > 0 ? Math.round((matchCount / bothCount) * 100) : null;
    moodMatchCard = _statCard(
      'Tonight\'s Mood match',
      pct == null ? '—' : `${pct}%`,
      bothCount > 0 ? `${matchCount} of ${bothCount} nights` : 'No picks yet'
    );
  }

  const hasAny = (mjMine+mjTheirs+pulsesMine+pulsesTheirs+milestonesAdded+streak) > 0;
  if(!hasAny && !moodMatchCard){
    grid.innerHTML = '<p class="empty">Nothing here yet — your story is just getting started.</p>';
    return;
  }

  const meName = R._esc(state.ME || 'You');
  const otherName = R._esc(state.OTHER || 'Partner');
  grid.innerHTML = [
    _statCard('Memory jar — ' + meName, String(mjMine), 'entries written'),
    _statCard('Memory jar — ' + otherName, String(mjTheirs), 'entries written'),
    _statCard('Current streak', streak ? `${streak}d` : '—', 'days in a row'),
    _statCard('Pulses — ' + meName, String(pulsesMine), 'sent'),
    _statCard('Pulses — ' + otherName, String(pulsesTheirs), 'sent'),
    _statCard('Milestones added', String(milestonesAdded), range === 'week' ? 'this week' : 'this month'),
    moodMatchCard,
  ].filter(Boolean).join('');
}

function _statCard(label, value, sub){
  return `<div class="summary-card">
    <div class="summary-card-label">${label}</div>
    <div class="summary-card-value">${value}</div>
    <div class="summary-card-sub">${sub}</div>
  </div>`;
}

R.renderSummary = renderSummary;

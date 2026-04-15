import { state } from './state.js';
import { R } from './registry.js';

// Home → Snugshot tab (internal ID still `summary` — display label only).
// All reads are one-shot snapshots (no live listeners) against couple nodes.
// Week = last 7 days incl. today. Month = last 30 days incl. today.

let _currentRange = 'week';
let _requestSeq = 0;

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

function _todayKey(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function _rangeLabel(range){
  return range === 'month' ? 'this month' : 'this week';
}

function _rangeTitleLabel(range){
  return range === 'month' ? "This month's insight" : "This week's insight";
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

// Longest streak across memoryJar history — the longest contiguous run of
// days where both partners wrote. Today only counts if both have written.
function _computeLongestStreak(memoryJar){
  if(!memoryJar) return 0;
  const todayKey = _todayKey();
  const keys = Object.keys(memoryJar).sort();
  let longest = 0, run = 0, prev = null;
  for(const key of keys){
    const day = memoryJar[key];
    const both = day && day[state.myUid]?.text && day[state.partnerUid]?.text;
    if(!both){
      if(key !== todayKey) run = 0;
      continue;
    }
    if(prev){
      const prevD = new Date(prev+'T12:00:00');
      const curD = new Date(key+'T12:00:00');
      const gap = Math.round((curD - prevD) / 86400000);
      run = gap === 1 ? run + 1 : 1;
    } else {
      run = 1;
    }
    if(run > longest) longest = run;
    prev = key;
  }
  return longest;
}

// Real status update count from the append-only statusHistory log.
// Filters by uid and savedAt within the selected range.
function _countStatusUpdates(statusHistory, startMs){
  let mine = 0, theirs = 0;
  if(!statusHistory) return { mine, theirs };
  for(const rec of Object.values(statusHistory)){
    if(!rec || typeof rec !== 'object') continue;
    if(!rec.savedAt || rec.savedAt < startMs) continue;
    if(rec.uid === state.myUid) mine++;
    else if(rec.uid === state.partnerUid) theirs++;
  }
  return { mine, theirs };
}

function _pluralUpdates(n){
  return n === 1 ? '1 update' : `${n} updates`;
}

// First-person singular "You" needs plural verb agreement.
function _subjectVerb(name, verb){
  // verb is the third-person singular form, e.g. "has" or "sends".
  // Returns the correct form for the subject name.
  const isYou = !name || name === 'You';
  if(isYou){
    if(verb === 'has') return 'You have';
    if(verb === 'has been') return 'You have been';
    // Generic -s stripping for other verbs (not currently used).
    return `You ${verb.replace(/s$/, '')}`;
  }
  return `${name} ${verb}`;
}

function _buildInsight(stats, range){
  const { mjMine, mjTheirs, pulsesMine, pulsesTheirs,
          longestStreak, currentStreak, moodPct, moodBoth,
          statusMine, statusTheirs } = stats;
  const me = state.ME || 'You';
  const other = state.OTHER || 'Your partner';
  const rangeLabel = _rangeLabel(range);

  // Rule 1 — Broken streak
  if(currentStreak === 0 && longestStreak >= 3){
    return {
      rule: 'broken-streak',
      text: `Your memory jar streak paused — your best run together was ${longestStreak} days. One note from each of you and you're back on the board.`
    };
  }
  // Rule 2 — Strong current streak
  if(currentStreak >= 3){
    return {
      rule: 'strong-streak',
      text: `${currentStreak} days in a row in the memory jar. Keep the little moments flowing — future-you will thank you.`
    };
  }
  // Rule 3 — Pulse imbalance
  const pulseGap = Math.abs(pulsesMine - pulsesTheirs);
  const totalPulses = pulsesMine + pulsesTheirs;
  if(totalPulses >= 4 && pulseGap >= 3){
    const more = pulsesMine > pulsesTheirs ? me : other;
    return {
      rule: 'pulse-imbalance',
      text: `${_subjectVerb(more, 'has been')} sending most of the pulses ${rangeLabel}. A tiny heartbeat back goes a long way.`
    };
  }
  // Rule 4 — Mood match rate (Together mode)
  if(state.coupleType === 'together' && moodBoth >= 3){
    if(moodPct >= 70){
      return {
        rule: 'mood-match-high',
        text: `You matched moods on ${moodPct}% of evenings — you two are reading each other ${rangeLabel}.`
      };
    }
    if(moodPct <= 30){
      return {
        rule: 'mood-match-low',
        text: `Your moods landed differently most nights ${rangeLabel}. Could be a fun stretch to surprise each other.`
      };
    }
  }
  // Rule 5 — Memory jar imbalance
  const mjGap = Math.abs(mjMine - mjTheirs);
  const totalMj = mjMine + mjTheirs;
  if(totalMj >= 4 && mjGap >= 3){
    const more = mjMine > mjTheirs ? me : other;
    return {
      rule: 'mj-imbalance',
      text: `${_subjectVerb(more, 'has been')} doing most of the writing in the memory jar. Even one line from the other side makes it feel shared.`
    };
  }
  // Rule 5a — Status imbalance (new).
  // Only fires when both names are known — the "less, even a quick one counts"
  // clause addresses the second partner directly and reads awkwardly with a
  // fallback like "Your partner, even a quick one counts."
  const statusGap = Math.abs(statusMine - statusTheirs);
  const namesKnown = state.ME && state.OTHER
    && state.ME !== 'You' && state.OTHER !== 'Your partner';
  if(namesKnown && statusGap >= 3){
    const more = statusMine > statusTheirs ? me : other;
    const less = statusMine > statusTheirs ? other : me;
    return {
      rule: 'status-imbalance',
      text: `${more} has been more active with status updates ${rangeLabel}. ${less}, even a quick one counts.`
    };
  }
  // Rule 5b — Both active status (new)
  if(statusMine >= 3 && statusTheirs >= 3){
    return {
      rule: 'status-both-active',
      text: `You're both keeping each other in the loop — that quiet awareness adds up.`
    };
  }
  // Rule 6 — Warm baseline
  if(totalPulses >= 2 || totalMj >= 2){
    return {
      rule: 'warm-baseline',
      text: `A warm, steady ${range === 'month' ? 'month' : 'week'} — small notes, pulses, little check-ins. The quiet kind of closeness.`
    };
  }
  // Rule 7 — Quiet fallback
  return {
    rule: 'quiet',
    text: `A quiet ${range === 'month' ? 'month' : 'week'} in Snug. Drop a pulse or a memory moment to set the tone for the next one.`
  };
}

// Daily insight cache: generated once per day per range, shared by both
// partners. Whoever opens Snugshot first for a given range writes that
// bucket; the second partner reads what's already there. Keyed by
// `dailyInsight/{todayKey}/{range}` so week and month cache independently
// and each carries its own rangeLabel in the body copy.
async function _readDailyInsight(todayKey, range){
  return _oneShot(`dailyInsight/${todayKey}/${range}`);
}

function _writeDailyInsight(todayKey, range, insight){
  if(!state.db || !state.coupleId) return;
  try{
    const p = state.dbSet(state.dbRef(state.db, `couples/${state.coupleId}/dailyInsight/${todayKey}/${range}`), {
      text: insight.text,
      rule: insight.rule,
      generatedAt: Date.now()
    });
    // Catch async rejections so they don't surface as unhandled promise
    // rejections. Fire-and-forget: the in-memory insight is already painted.
    if(p && typeof p.catch === 'function'){
      p.catch(err => console.warn('dailyInsight write failed:', err));
    }
  }catch(e){ console.warn('dailyInsight write failed:', e); }
}

function _setInsightSubLine(range){
  const sub = document.querySelector('.snugshot-insight-sub');
  if(sub) sub.textContent = `Based on your activity ${_rangeLabel(range)}.`;
}

function _setInsightLabel(range){
  const label = document.querySelector('.snugshot-insight-label');
  if(label) label.textContent = _rangeTitleLabel(range);
}

async function renderSummary(){
  const grid = document.getElementById('summary-grid');
  const insightBody = document.getElementById('snugshot-insight-body');
  if(!grid) return;
  // Always resync label + sub-line from _currentRange on every render.
  _setInsightLabel(_currentRange);
  _setInsightSubLine(_currentRange);
  if(!state.db || !state.coupleId){
    grid.innerHTML = '<p class="empty">Nothing here yet — your story is just getting started.</p>';
    if(insightBody) insightBody.textContent = '—';
    return;
  }
  const myRequest = ++_requestSeq;
  grid.innerHTML = '<p class="empty" style="padding:1rem;">Loading…</p>';
  if(insightBody) insightBody.textContent = 'Loading…';
  const range = _currentRange;
  const startMs = _rangeStartMs(range);
  const keys = _dateKeysInRange(range);
  const todayKey = _todayKey();

  const [memoryJar, pulses, tonightsMood, statusHistory, cachedInsight] = await Promise.all([
    _oneShot('memoryJar'),
    _oneShot('pulses'),
    _oneShot('tonightsMood'),
    _oneShot('statusHistory'),
    _readDailyInsight(todayKey, range),
  ]);
  if(myRequest !== _requestSeq) return;

  // Memory jar counts per user
  let mjMine = 0, mjTheirs = 0;
  if(memoryJar){
    for(const k of keys){
      const day = memoryJar[k];
      if(!day) continue;
      if(day[state.myUid]?.text) mjMine++;
      if(day[state.partnerUid]?.text) mjTheirs++;
    }
  }

  // Pulses sent, per user
  let pulsesMine = 0, pulsesTheirs = 0;
  if(pulses){
    for(const p of Object.values(pulses)){
      if(!p || typeof p !== 'object') continue;
      if(!p.time || p.time < startMs) continue;
      if(p.from === state.myUid) pulsesMine++;
      else if(p.from === state.partnerUid) pulsesTheirs++;
    }
  }

  // Real status updates from the append-only log
  const { mine: statusMine, theirs: statusTheirs } = _countStatusUpdates(statusHistory, startMs);

  // Tonight's Mood match rate (Together mode only)
  let moodBoth = 0, moodMatch = 0;
  if(state.coupleType === 'together' && tonightsMood){
    for(const k of keys){
      const day = tonightsMood[k];
      if(!day) continue;
      const mine = day[state.myUid]?.mood;
      const theirs = day[state.partnerUid]?.mood;
      if(mine && theirs){
        moodBoth++;
        if(mine === theirs) moodMatch++;
      }
    }
  }
  const moodPct = moodBoth > 0 ? Math.round((moodMatch / moodBoth) * 100) : 0;

  // Streaks
  const currentStreak = state._mjStreakCount || 0;
  const longestStreak = Math.max(currentStreak, _computeLongestStreak(memoryJar));

  // Insight — use cached daily value if present, otherwise generate + write.
  // Cache is always for today's key, independent of selected range, so both
  // partners see the same insight regardless of which toggle they're on.
  if(insightBody){
    if(cachedInsight && cachedInsight.text){
      insightBody.textContent = cachedInsight.text;
    } else {
      const generated = _buildInsight({
        mjMine, mjTheirs, pulsesMine, pulsesTheirs,
        longestStreak, currentStreak, moodPct, moodBoth,
        statusMine, statusTheirs
      }, range);
      insightBody.textContent = generated.text;
      _writeDailyInsight(todayKey, range, generated);
    }
  }

  const meName = R._esc(state.ME || 'You');
  const otherName = R._esc(state.OTHER || 'Partner');

  const sections = [];

  sections.push(_section('Memory jar', [
    _statCardDot(meName, String(mjMine), 'entries written', 'me'),
    _statCardDot(otherName, String(mjTheirs), 'entries written', 'other'),
  ]));

  sections.push(`<div class="snugshot-section">
    <div class="snugshot-section-label">Streak</div>
    <div class="snugshot-streak-card">
      <div class="snugshot-streak-icon">🔥</div>
      <div class="snugshot-streak-body">
        <div class="snugshot-streak-title">Longest streak together</div>
        <div class="snugshot-streak-value">${longestStreak}d</div>
        <div class="snugshot-streak-sub">Current: ${currentStreak}d</div>
      </div>
    </div>
  </div>`);

  sections.push(_section('Pulses sent', [
    _statCardDot(meName, String(pulsesMine), 'sent', 'me'),
    _statCardDot(otherName, String(pulsesTheirs), 'sent', 'other'),
  ]));

  const statusSub = _rangeLabel(range);
  sections.push(_section('Status updates', [
    _statCardDot(meName, _pluralUpdates(statusMine), statusSub, 'me'),
    _statCardDot(otherName, _pluralUpdates(statusTheirs), statusSub, 'other'),
  ]));

  if(state.coupleType === 'together'){
    const sub = moodBoth > 0
      ? `${moodMatch} of ${moodBoth} evenings matched.`
      : 'No picks yet.';
    sections.push(`<div class="snugshot-section">
      <div class="snugshot-section-label">Tonight's mood</div>
      <div class="snugshot-mood-card">
        <div class="snugshot-mood-row">
          <div class="snugshot-mood-title">Match rate</div>
          <div class="snugshot-mood-pct">${moodPct}%</div>
        </div>
        <div class="snugshot-mood-bar-bg"><div class="snugshot-mood-bar" style="width:${moodPct}%"></div></div>
        <div class="snugshot-mood-sub">${sub}</div>
      </div>
    </div>`);
  }

  grid.innerHTML = sections.join('');
}

function _section(label, cards){
  return `<div class="snugshot-section">
    <div class="snugshot-section-label">${label}</div>
    <div class="snugshot-row-2">${cards.join('')}</div>
  </div>`;
}

function _statCardDot(label, value, sub, who){
  return `<div class="snugshot-stat">
    <div class="snugshot-stat-top"><span class="snugshot-dot snugshot-dot-${who}"></span>${label}</div>
    <div class="snugshot-stat-value">${value}</div>
    <div class="snugshot-stat-sub">${sub}</div>
  </div>`;
}

function resetSummary(){
  _currentRange = 'week';
  _requestSeq++;
  const grid = document.getElementById('summary-grid');
  if(grid) grid.innerHTML = '<p class="empty" id="summary-empty">Nothing here yet — your story is just getting started.</p>';
  const insightBody = document.getElementById('snugshot-insight-body');
  if(insightBody) insightBody.textContent = '—';
  _setInsightLabel('week');
  _setInsightSubLine('week');
  document.querySelectorAll('#summary-range-toggle .summary-range-btn').forEach(b=>{
    b.classList.toggle('active', b.dataset.range === 'week');
  });
}

R.renderSummary = renderSummary;
R.resetSummary = resetSummary;

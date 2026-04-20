import { state } from './state.js';
import { R } from './registry.js';

// ── Tonight's Mood (Together mode daily ritual) ──────────────
// Data path: couples/{coupleId}/tonightsMood/{dateKey}/{uid} → { mood, chosenAt }
// dateKey is today's local date as YYYY-MM-DD. Together mode is designed for
// couples in the same place, so both clients agree on "today" in practice.
//
// Three UI states managed live from a single onValue listener:
//   1. Pick    — I haven't chosen yet
//   2. Waiting — I chose, partner hasn't
//   3. Reveal  — both chose (match or compromise, final)
//
// Partner's mood is NEVER read into the DOM until my own mood is present —
// enforced in the listener, not the UI.

const MOODS = [
  { key: 'cosy',         emoji: '🛋️', label: 'cosy' },
  { key: 'romantic',     emoji: '🌹', label: 'romantic' },
  { key: 'adventurous',  emoji: '🗺️', label: 'adventurous' },
  { key: 'netflix',      emoji: '📺', label: 'just Netflix' },
  { key: 'productive',   emoji: '✅', label: 'productive' },
  { key: 'chaotic',      emoji: '🌀', label: 'chaotic' },
  { key: 'talky',        emoji: '💬', label: 'talky' },
  { key: 'celebratory',  emoji: '🥂', label: 'celebratory' },
  { key: 'hungry',       emoji: '🍕', label: 'hungry' },
];

const MOOD_BY_KEY = Object.fromEntries(MOODS.map(m => [m.key, m]));

const MATCH_MESSAGES = {
  cosy:        "Perfect night in. Blankets mandatory.",
  romantic:    "You're both feeling it. Don't waste it.",
  adventurous: "Go do something. Right now.",
  netflix:     "Finally. No negotiating.",
  productive:  "Respect. Now help each other.",
  chaotic:     "Nobody is safe. Have fun.",
  talky:       "Clear your schedules. This could take a while.",
  celebratory: "Pop something. You deserve it.",
  hungry:      "The only question is where.",
};

// Keys are `[a, b].sort().join('|')` — must be alphabetical pair.
const MISMATCH = {
  'cosy|romantic':        "Candles, blankets, slow evening — meet in the middle.",
  'adventurous|cosy':     "Order in and pick a destination for your next adventure.",
  'cosy|netflix':         "Sofa, snacks, your favourite show — close enough.",
  'cosy|productive':      "One hour of focus, then full cosy mode. Deal?",
  'chaotic|cosy':         "Channel the chaos into a spontaneous cosy night.",
  'cosy|talky':           "Tea, blankets, and talk until you fall asleep.",
  'celebratory|cosy':     "Celebratory snacks on the sofa counts.",
  'cosy|hungry':          "Cosy takeaway night — best of both.",
  'adventurous|romantic': "Surprise them with a spontaneous dinner out.",
  'netflix|romantic':     "Candles on, favourite show on — close enough.",
  'productive|romantic':  "Romance them with a home-cooked meal together.",
  'chaotic|romantic':     "Romantic chaos. Light candles, then see what happens.",
  'romantic|talky':       "Pour some wine and have the good conversation.",
  'celebratory|romantic': "You're already celebrating — lean into it.",
  'hungry|romantic':      "Cook something together. Nothing more romantic.",
  'adventurous|netflix':  "Pick a film neither of you has seen. That's an adventure.",
  'adventurous|productive':"Productive adventure — plan your next trip tonight.",
  'adventurous|chaotic':  "Perfect combo. Go find some trouble.",
  'adventurous|talky':    "Walk somewhere new and talk the whole way.",
  'adventurous|celebratory':"Go out and actually celebrate something.",
  'adventurous|hungry':   "Find a restaurant neither of you has tried.",
  'netflix|productive':   "One episode, then you help them with something.",
  'chaotic|netflix':      "Put something chaotic on and commentate together.",
  'netflix|talky':        "Watch something then debrief for two hours.",
  'celebratory|netflix':  "Find something celebratory to watch and order in.",
  'hungry|netflix':       "Pick a food show and order exactly that.",
  'chaotic|productive':   "Productive chaos is still productive. Probably.",
  'productive|talky':     "Talk through what you're both working on.",
  'celebratory|productive':"Celebrate what you've already achieved this week.",
  'hungry|productive':    "Fuel up first, then back to it.",
  'chaotic|talky':        "Chaotic talky energy. Good luck to you both.",
  'celebratory|chaotic':  "Chaotic celebration is the best kind. Go.",
  'chaotic|hungry':       "Chaotic hungry is just a Tuesday. Pick somewhere weird.",
  'celebratory|talky':    "Tell each other exactly what you're celebrating.",
  'hungry|talky':         "Order in and don't stop talking while you eat.",
  'celebratory|hungry':   "Celebrate with food. Obviously.",
};

function _mismatchKey(a, b){
  return [a, b].sort().join('|');
}

function _todayKey(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

let _tmUnsub = null;
let _tmDayKey = null;
let _tmRollInterval = null;

function _renderPick(partnerHasPicked){
  const card = document.getElementById('tonights-mood-card');
  if(!card) return;
  const pick = document.getElementById('mood-pick-state');
  const wait = document.getElementById('mood-waiting-state');
  const rev  = document.getElementById('mood-reveal-state');
  if(!pick || !wait || !rev) return;
  pick.style.display = 'block';
  wait.style.display = 'none';
  rev.style.display  = 'none';

  const hint = document.getElementById('mood-pick-hint');
  if(hint){
    if(partnerHasPicked){
      // Never reveal WHAT they picked, only that they picked
      hint.textContent = `${state.OTHER || 'Your partner'} has already picked — your turn!`;
      hint.style.display = 'block';
    } else {
      hint.style.display = 'none';
    }
  }
}

function _renderWaiting(myMood){
  const pick = document.getElementById('mood-pick-state');
  const wait = document.getElementById('mood-waiting-state');
  const rev  = document.getElementById('mood-reveal-state');
  if(!pick || !wait || !rev) return;
  pick.style.display = 'none';
  wait.style.display = 'block';
  rev.style.display  = 'none';

  const m = MOOD_BY_KEY[myMood];
  const pill = document.getElementById('mood-waiting-pill');
  if(pill && m){
    pill.innerHTML = `<span class="mood-pill-emoji">${m.emoji}</span><span class="mood-pill-label">${R._esc(m.label)}</span>`;
  }
  const sub = document.getElementById('mood-waiting-sub');
  if(sub) sub.textContent = `Waiting for ${state.OTHER || 'your partner'}…`;
}

function _renderReveal(myKey, partnerKey){
  const pick = document.getElementById('mood-pick-state');
  const wait = document.getElementById('mood-waiting-state');
  const rev  = document.getElementById('mood-reveal-state');
  if(!pick || !wait || !rev) return;
  pick.style.display = 'none';
  wait.style.display = 'none';
  rev.style.display  = 'block';

  const mine    = MOOD_BY_KEY[myKey];
  const theirs  = MOOD_BY_KEY[partnerKey];
  if(!mine || !theirs) return;
  const match = myKey === partnerKey;

  const myChip = document.getElementById('mood-reveal-mine');
  const thChip = document.getElementById('mood-reveal-theirs');
  if(myChip){
    myChip.innerHTML = `
      <div class="mood-chip-name">${R._esc(state.ME || 'You')}</div>
      <div class="mood-chip-emoji">${mine.emoji}</div>
      <div class="mood-chip-label">${R._esc(mine.label)}</div>`;
  }
  if(thChip){
    thChip.innerHTML = `
      <div class="mood-chip-name">${R._esc(state.OTHER || 'Partner')}</div>
      <div class="mood-chip-emoji">${theirs.emoji}</div>
      <div class="mood-chip-label">${R._esc(theirs.label)}</div>`;
  }

  const banner = document.getElementById('mood-reveal-banner');
  const msg    = document.getElementById('mood-reveal-msg');
  if(match){
    if(banner){
      banner.style.display = 'block';
      banner.textContent = "It's a match!";
    }
    if(msg){
      msg.className = 'mood-reveal-msg mood-reveal-msg-match';
      msg.textContent = MATCH_MESSAGES[myKey] || '';
    }
  } else {
    if(banner) banner.style.display = 'none';
    if(msg){
      msg.className = 'mood-reveal-msg mood-reveal-msg-compromise';
      const key = _mismatchKey(myKey, partnerKey);
      msg.textContent = MISMATCH[key] || 'Different vibes tonight — meet in the middle.';
    }
  }
}

function _renderFromSnap(val){
  const d = val || {};
  const mine = d[state.myUid];
  const theirs = state.partnerUid ? d[state.partnerUid] : null;

  // Critical: never reveal partner's mood until mine is present.
  if(!mine){
    _renderPick(!!theirs);
    return;
  }
  if(!theirs){
    _renderWaiting(mine.mood);
    return;
  }
  _renderReveal(mine.mood, theirs.mood);
}

function _subscribe(){
  if(_tmUnsub){ try{ _tmUnsub(); }catch(e){} _tmUnsub = null; }
  if(!state.db || !state.fbOnValue || !state.coupleId || !state.myUid) return;
  _tmDayKey = _todayKey();
  _tmUnsub = state.fbOnValue(
    state.dbRef(state.db, `couples/${state.coupleId}/tonightsMood/${_tmDayKey}`),
    snap => _renderFromSnap(snap.val())
  );
}

// Poll every 60s for local day rollover. Simpler and more robust than a
// single midnight timer across DST / clock adjustments.
function _startDayRollWatcher(){
  if(_tmRollInterval){ clearInterval(_tmRollInterval); _tmRollInterval = null; }
  _tmRollInterval = setInterval(() => {
    if(!state.coupleId || !state.myUid) return;
    const newKey = _todayKey();
    if(newKey !== _tmDayKey) _subscribe();
  }, 60 * 1000);
}

function initTonightsMood(){
  if(state.coupleType !== 'together') return;
  _buildSheetList();
  _subscribe();
  _startDayRollWatcher();
}

// Called from sign-out, partner-deletion cleanup, and applyMode() when
// switching Together → LDR. Must fully stop the listener and interval.
function teardownTonightsMood(){
  if(_tmUnsub){ try{ _tmUnsub(); }catch(e){} _tmUnsub = null; }
  if(_tmRollInterval){ clearInterval(_tmRollInterval); _tmRollInterval = null; }
  _tmDayKey = null;
}

function _buildSheetList(){
  const list = document.getElementById('mood-sheet-list');
  if(!list || list._built) return;
  list.innerHTML = MOODS.map(m =>
    `<div class="mood-sheet-row" data-mood="${m.key}">
       <span class="mood-sheet-emoji">${m.emoji}</span>
       <span class="mood-sheet-label">${R._esc(m.label)}</span>
     </div>`
  ).join('');
  list.querySelectorAll('.mood-sheet-row').forEach(row => {
    row.addEventListener('click', () => {
      if(row.classList.contains('disabled')) return;
      const key = row.dataset.mood;
      window.submitTonightsMood(key);
    });
  });
  list._built = true;
}

function _setSheetRowsDisabled(disabled){
  const list = document.getElementById('mood-sheet-list');
  if(!list) return;
  list.querySelectorAll('.mood-sheet-row').forEach(row => {
    row.classList.toggle('disabled', !!disabled);
  });
}

function _showSheetError(text){
  const err = document.getElementById('mood-sheet-error');
  if(!err) return;
  err.textContent = text;
  err.style.display = 'block';
}

function _clearSheetError(){
  const err = document.getElementById('mood-sheet-error');
  if(!err) return;
  err.textContent = '';
  err.style.display = 'none';
}

window.openMoodSheet = function(){
  document.getElementById('bottom-nav').style.display = 'none';
  _clearSheetError();
  _setSheetRowsDisabled(false);
  const ov = document.getElementById('mood-sheet-overlay');
  if(ov) ov.classList.add('open');
  R._initSheetSwipe && R._initSheetSwipe('mood-sheet', 'mood-sheet-overlay', window.closeMoodSheet);
};

window.closeMoodSheet = function(){
  document.getElementById('bottom-nav').style.display = 'flex';
  const ov = document.getElementById('mood-sheet-overlay');
  if(ov) ov.classList.remove('open');
};

window.submitTonightsMood = async function(moodKey){
  if(!MOOD_BY_KEY[moodKey]) return;
  if(!state.db || !state.coupleId || !state.myUid) return;
  if(state._tmInFlight) return; // guard double-tap
  state._tmInFlight = true;
  _clearSheetError();
  _setSheetRowsDisabled(true);

  const dayKey = _todayKey();
  const parentRef = state.dbRef(
    state.db,
    `couples/${state.coupleId}/tonightsMood/${dayKey}`
  );

  // Run a transaction on the parent node so we can atomically observe whether
  // the partner's entry was already present at commit time. The update fn may
  // be invoked multiple times on retry — the last successful invocation is
  // the one that was committed, so `partnerAlreadyPicked` reflects that state.
  let partnerAlreadyPicked = false;
  let partnerMoodAtCommit = null;
  try{
    const result = await state.fbRunTransaction(parentRef, current => {
      const c = current || {};
      partnerAlreadyPicked = !!(state.partnerUid && c[state.partnerUid]);
      partnerMoodAtCommit = (state.partnerUid && c[state.partnerUid]) ? c[state.partnerUid].mood : null;
      // Preserve partner's existing entry (if any) unchanged; add/overwrite
      // mine. Writing a whole object — the $uid .validate rule has an
      // "unchanged write-through" branch for the partner side.
      const next = {};
      if(state.partnerUid && c[state.partnerUid]){
        next[state.partnerUid] = c[state.partnerUid];
      }
      next[state.myUid] = { mood: moodKey, chosenAt: Date.now() };
      return next;
    });
    if(!result || !result.committed){
      // Transaction aborted without error — surface generic failure.
      _setSheetRowsDisabled(false);
      _showSheetError("Couldn't save. Tap a mood to try again.");
      return;
    }
    window.closeMoodSheet();
    let trigger = 'moodPick';
    if(partnerAlreadyPicked){
      trigger = (partnerMoodAtCommit === moodKey) ? 'moodMatch' : 'moodReveal';
    }
    R.notifyPartner && R.notifyPartner(trigger);
  }catch(e){
    console.error('submitTonightsMood failed:', e);
    _setSheetRowsDisabled(false);
    _showSheetError("Couldn't save your mood. Check your connection and try again.");
  }finally{
    state._tmInFlight = false;
  }
};

// ── Register ──────────────────────────────────────────────
R.initTonightsMood = initTonightsMood;
R.teardownTonightsMood = teardownTonightsMood;

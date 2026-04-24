import { state } from './state.js';
import { R } from './registry.js';

// ── Tonight's Dinner (Together mode daily ritual) ─────────
// Data path: couples/{coupleId}/tonightsDinner/{dateKey}
//   { proposal, proposedBy (uid), proposedAt (ms),
//     status ('proposed'|'agreed'|'countered'),
//     counteredBy (uid, only when status==='countered'),
//     agreedAt (ms, only when status==='agreed') }
//
// State machine (from current-user perspective):
//   (no doc)                             → "Propose" card
//   proposed,   mine                     → "Waiting for {partner}"
//   proposed,   theirs                   → "{partner} says: X" + Accept/Counter
//   countered,  I am counterer           → "Waiting…" + previous proposal line
//   countered,  they are counterer       → two-row card + Accept/Counter again
//   agreed                               → final dish + Ingredients/Change
//
// dateKey = local YYYY-MM-DD. Day rollover poll every 60s (same pattern as
// Tonight's Mood).
//
// Mixpanel events (Phase 3 — NOT wired yet):
//   dinner_proposed              · props: role
//   dinner_countered             · props: role
//   dinner_agreed                · props: seconds_to_agree, had_counter
//   dinner_ingredients_added     · props: item_count

const MAX_TEXT = 200;

function _todayKey(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Keep the first-proposed timestamp across counters for the agreed event
// (seconds_to_agree spec). Stored in the DB under firstProposedAt, fallback
// to proposedAt if absent.
function _firstProposedAt(d){
  if(!d) return null;
  return d.firstProposedAt || d.proposedAt || null;
}

function _nameFor(uid){
  if(!uid) return '';
  if(uid === state.myUid)      return state.ME || 'You';
  if(uid === state.partnerUid) return state.OTHER || 'Partner';
  return '';
}

// Mirror of tonightsmood.js _showSheetError / _clearSheetError. The counter
// sheet uses the same .mood-sheet-error visual treatment.
function _showCounterError(text){
  const err = document.getElementById('td-counter-error');
  if(!err) return;
  err.textContent = text;
  err.style.display = 'block';
}
function _clearCounterError(){
  const err = document.getElementById('td-counter-error');
  if(!err) return;
  err.textContent = '';
  err.style.display = 'none';
}
function _counterSheetOpen(){
  const ov = document.getElementById('td-counter-overlay');
  return !!(ov && ov.classList.contains('open'));
}

// ── Render ────────────────────────────────────────────────
function _render(){
  const host = document.getElementById('tonights-dinner-body');
  if(!host) return;
  const d = state._tdCurrent;
  const myUid = state.myUid;
  const partner = state.OTHER || 'Your partner';

  if(!d || !d.status){
    host.innerHTML = _proposeHTML();
    _wireProposeInput();
    return;
  }

  const mine = d.proposedBy === myUid;
  const isCounter = d.status === 'countered';
  const isAgreed  = d.status === 'agreed';

  if(isAgreed){
    host.innerHTML = _agreedHTML(d);
    return;
  }

  if(isCounter){
    // Counterer is the LATEST proposer (d.proposedBy).
    if(mine){
      host.innerHTML = _waitingHTML(d);
    } else {
      host.innerHTML = _counterIncomingHTML(d);
    }
    return;
  }

  // proposed
  if(mine){
    host.innerHTML = _waitingHTML(d);
  } else {
    host.innerHTML = _proposalIncomingHTML(d, partner);
  }
}

function _proposeHTML(){
  return `
    <div class="td-card-inner">
      <p class="td-prompt">What's for dinner tonight?</p>
      <div class="td-input-row">
        <input type="text" id="td-propose-input" class="td-input"
               placeholder="e.g. pasta with pesto" maxlength="${MAX_TEXT}" />
        <button class="td-btn-primary" id="td-propose-btn">Suggest</button>
      </div>
    </div>`;
}

function _waitingHTML(d){
  const dish = R._esc(d.proposal || '');
  const sub = `Waiting for ${R._esc(state.OTHER || 'your partner')}…`;
  return `
    <div class="td-card-inner">
      <div class="td-dish-pill">${dish}</div>
      <div class="td-waiting-sub">${sub}</div>
      <div class="td-action-row">
        <button class="td-btn-link" onclick="openDinnerProposeSheet()">Change suggestion</button>
      </div>
    </div>`;
}

function _proposalIncomingHTML(d, partner){
  return `
    <div class="td-card-inner">
      <div class="td-attrib">${R._esc(partner)} says:</div>
      <div class="td-dish-pill">${R._esc(d.proposal || '')}</div>
      <div class="td-action-row">
        <button class="td-btn-primary" onclick="acceptDinnerProposal()">Accept</button>
        <button class="td-btn-secondary" onclick="openDinnerCounterSheet()">Counter</button>
      </div>
    </div>`;
}

function _counterIncomingHTML(d){
  // Partner just countered. Show both — their new proposal, and the previous
  // one (if we still have it). previousProposal is persisted on the node as
  // context. Fall back to an empty string if not present on legacy docs.
  const prev = d.previousProposal ? R._esc(d.previousProposal) : '';
  const now  = R._esc(d.proposal || '');
  return `
    <div class="td-card-inner">
      ${prev ? `<div class="td-prev-row"><span class="td-prev-label">You said</span><span class="td-prev-text">${prev}</span></div>` : ''}
      <div class="td-attrib">${R._esc(_nameFor(d.counteredBy || d.proposedBy))} countered:</div>
      <div class="td-dish-pill">${now}</div>
      <div class="td-action-row">
        <button class="td-btn-primary" onclick="acceptDinnerProposal()">Accept</button>
        <button class="td-btn-secondary" onclick="openDinnerCounterSheet()">Counter again</button>
      </div>
    </div>`;
}

function _agreedHTML(d){
  return `
    <div class="td-card-inner">
      <div class="td-agreed-row">
        <span class="td-dish-pill td-dish-pill-agreed">${R._esc(d.proposal || '')}</span>
        <span class="td-agreed-pill">Agreed ✓</span>
      </div>
      <div class="td-action-row">
        <button class="td-btn-secondary" onclick="openDinnerIngredientsSheet()">+ Ingredients to list</button>
        <button class="td-btn-link" onclick="openDinnerProposeSheet('change')">Change</button>
      </div>
    </div>`;
}

function _wireProposeInput(){
  const input = document.getElementById('td-propose-input');
  const btn   = document.getElementById('td-propose-btn');
  if(!input || !btn || btn._wired) return;
  btn._wired = true;
  const submit = () => _propose(input.value);
  btn.addEventListener('click', submit);
  input.addEventListener('keydown', ev => {
    if(ev.key === 'Enter'){ ev.preventDefault(); submit(); }
  });
}

// ── Firebase writes ───────────────────────────────────────
async function _propose(text){
  const t = (text || '').trim();
  if(!t) return;
  if(!state.db || !state.coupleId || !state.myUid) return;
  if(state._tdInFlight) return;
  state._tdInFlight = true;
  try{
    const now = Date.now();
    const dayKey = _todayKey();
    await state.dbSet(
      state.dbRef(state.db, `couples/${state.coupleId}/tonightsDinner/${dayKey}`),
      {
        proposal: t.slice(0, MAX_TEXT),
        proposedBy: state.myUid,
        proposedAt: now,
        firstProposedAt: now,
        status: 'proposed',
      }
    );
    if(R.notifyPartner) R.notifyPartner('dinnerProposed', { extra: t.slice(0, MAX_TEXT) });
    // Mixpanel: dinner_proposed (Phase 3 — not wired yet)
  }catch(e){
    console.error('dinner propose failed:', e);
  }finally{
    state._tdInFlight = false;
  }
}

async function _counter(text){
  const t = (text || '').trim();
  if(!t) return;
  if(!state.db || !state.coupleId || !state.myUid) return;
  const d = state._tdCurrent || {};
  // Guard: partner may have hit Accept while this sheet was open. Don't
  // silently clobber an agreed state back to 'countered'.
  if(d.status === 'agreed'){
    _showCounterError('Dinner was agreed in the meantime.');
    setTimeout(() => window.closeDinnerCounterSheet(), 1400);
    return;
  }
  if(state._tdInFlight) return;
  state._tdInFlight = true;
  try{
    const now = Date.now();
    const dayKey = _todayKey();
    await state.dbSet(
      state.dbRef(state.db, `couples/${state.coupleId}/tonightsDinner/${dayKey}`),
      {
        proposal: t.slice(0, MAX_TEXT),
        proposedBy: state.myUid,
        proposedAt: now,
        firstProposedAt: _firstProposedAt(d) || now,
        previousProposal: d.proposal || null,
        status: 'countered',
        counteredBy: state.myUid,
      }
    );
    if(R.notifyPartner) R.notifyPartner('dinnerCountered', { extra: t.slice(0, MAX_TEXT) });
    // Mixpanel: dinner_countered (Phase 3 — not wired yet)
  }catch(e){
    console.error('dinner counter failed:', e);
  }finally{
    state._tdInFlight = false;
  }
}

async function _accept(){
  if(!state.db || !state.coupleId || !state.myUid) return;
  const d = state._tdCurrent;
  if(!d || !d.proposal) return;
  if(state._tdInFlight) return;
  state._tdInFlight = true;
  try{
    const now = Date.now();
    const dayKey = _todayKey();
    await state.dbUpdate(
      state.dbRef(state.db, `couples/${state.coupleId}/tonightsDinner/${dayKey}`),
      { status: 'agreed', agreedAt: now }
    );
    if(R.notifyPartner) R.notifyPartner('dinnerAgreed', { extra: d.proposal });
    // Mixpanel: dinner_agreed (Phase 3 — not wired yet)
    //   seconds_to_agree = (now - firstProposedAt)/1000
    //   had_counter = d.status === 'countered'
  }catch(e){
    console.error('dinner accept failed:', e);
  }finally{
    state._tdInFlight = false;
  }
}

// ── Listener ──────────────────────────────────────────────
function _subscribe(){
  if(state._tdUnsub){ try{ state._tdUnsub(); }catch(e){} state._tdUnsub = null; }
  if(!state.db || !state.fbOnValue || !state.coupleId) return;
  state._tdDayKey = _todayKey();
  state._tdUnsub = state.fbOnValue(
    state.dbRef(state.db, `couples/${state.coupleId}/tonightsDinner/${state._tdDayKey}`),
    snap => {
      const prev = state._tdCurrent;
      const next = snap.val() || null;
      const counterWasOpen = _counterSheetOpen();
      state._tdCurrent = next;
      _render();
      // If the remote just flipped to 'agreed' while the counter sheet is
      // open, close the sheet — the user was about to overwrite an agreed
      // state. Brief inline message then auto-close.
      if(counterWasOpen && next && next.status === 'agreed' && (!prev || prev.status !== 'agreed')){
        _showCounterError('Agreed in the meantime.');
        setTimeout(() => window.closeDinnerCounterSheet(), 1400);
      }
    }
  );
}

function _startDayRollWatcher(){
  if(state._tdRollInterval){ clearInterval(state._tdRollInterval); state._tdRollInterval = null; }
  state._tdRollInterval = setInterval(() => {
    if(!state.coupleId || !state.myUid) return;
    const newKey = _todayKey();
    if(newKey !== state._tdDayKey) _subscribe();
  }, 60 * 1000);
}

function initTonightsDinner(){
  if(state.coupleType !== 'together') return;
  _subscribe();
  _startDayRollWatcher();
}

function teardownTonightsDinner(){
  if(state._tdUnsub){ try{ state._tdUnsub(); }catch(e){} state._tdUnsub = null; }
  if(state._tdRollInterval){ clearInterval(state._tdRollInterval); state._tdRollInterval = null; }
  state._tdDayKey = null;
  state._tdCurrent = null;
  state._tdInFlight = false;
}

// ── Sheets (propose / counter / ingredients) ──────────────
window.openDinnerProposeSheet = function(/* mode */){
  const ov = document.getElementById('td-propose-overlay');
  if(!ov) return;
  const input = document.getElementById('td-sheet-input');
  if(input){
    input.value = '';
    setTimeout(() => input.focus(), 60);
  }
  const nav = document.getElementById('bottom-nav');
  if(nav) nav.style.display = 'none';
  ov.classList.add('open');
  if(R._initSheetSwipe){
    R._initSheetSwipe('td-propose-sheet', 'td-propose-overlay', window.closeDinnerProposeSheet);
  }
};

window.closeDinnerProposeSheet = function(){
  const nav = document.getElementById('bottom-nav');
  if(nav) nav.style.display = 'flex';
  const ov = document.getElementById('td-propose-overlay');
  if(ov) ov.classList.remove('open');
};

window.submitDinnerProposeSheet = async function(){
  const input = document.getElementById('td-sheet-input');
  if(!input) return;
  const val = input.value;
  window.closeDinnerProposeSheet();
  // If there's already a proposal, rewriting from the "change" path starts
  // a fresh propose cycle (status=proposed by whoever hits Change).
  await _propose(val);
};

window.openDinnerCounterSheet = function(){
  const ov = document.getElementById('td-counter-overlay');
  if(!ov) return;
  _clearCounterError();
  const input = document.getElementById('td-counter-input');
  if(input){
    input.value = '';
    setTimeout(() => input.focus(), 60);
  }
  const nav = document.getElementById('bottom-nav');
  if(nav) nav.style.display = 'none';
  ov.classList.add('open');
  if(R._initSheetSwipe){
    R._initSheetSwipe('td-counter-sheet', 'td-counter-overlay', window.closeDinnerCounterSheet);
  }
};

window.closeDinnerCounterSheet = function(){
  const nav = document.getElementById('bottom-nav');
  if(nav) nav.style.display = 'flex';
  const ov = document.getElementById('td-counter-overlay');
  if(ov) ov.classList.remove('open');
  _clearCounterError();
};

window.submitDinnerCounterSheet = async function(){
  const input = document.getElementById('td-counter-input');
  if(!input) return;
  const val = input.value;
  window.closeDinnerCounterSheet();
  await _counter(val);
};

window.acceptDinnerProposal = _accept;

// ── Ingredients → Our List handoff ────────────────────────
window.openDinnerIngredientsSheet = function(){
  const ov = document.getElementById('td-ing-overlay');
  if(!ov) return;
  const input = document.getElementById('td-ing-input');
  if(input){
    input.value = '';
    setTimeout(() => input.focus(), 60);
  }
  const nav = document.getElementById('bottom-nav');
  if(nav) nav.style.display = 'none';
  ov.classList.add('open');
  if(R._initSheetSwipe){
    R._initSheetSwipe('td-ing-sheet', 'td-ing-overlay', window.closeDinnerIngredientsSheet);
  }
};

window.closeDinnerIngredientsSheet = function(){
  const nav = document.getElementById('bottom-nav');
  if(nav) nav.style.display = 'flex';
  const ov = document.getElementById('td-ing-overlay');
  if(ov) ov.classList.remove('open');
};

window.submitDinnerIngredientsSheet = async function(){
  const input = document.getElementById('td-ing-input');
  if(!input) return;
  const raw = input.value || '';
  window.closeDinnerIngredientsSheet();
  const items = raw.split(',').map(s => s.trim()).filter(Boolean);
  if(!items.length) return;
  if(R.addOurListMany){
    const n = await R.addOurListMany(items, 'groceries');
    // Mixpanel: dinner_ingredients_added · item_count=n (Phase 3 — not wired)
    void n;
  }
};

// ── Register ──────────────────────────────────────────────
R.initTonightsDinner = initTonightsDinner;
R.teardownTonightsDinner = teardownTonightsDinner;

import { state } from './state.js';
import { R } from './registry.js';

// ── Our List (Together mode shared list) ──────────────────
// Data path: couples/{coupleId}/ourList/{pushId}
//   { text, tag ('groceries'|'home'|'todo'), addedBy (uid),
//     addedAt (ms), done (bool), doneAt (ms), doneBy (uid) }
//
// Rendered on Home/Now as a compact card showing up to 3 most-recent
// not-done items matching the current filter, plus a "See all" sheet
// that lists everything.
//
// Mixpanel events (Phase 3 — NOT wired yet):
//   list_item_added        · props: tag, added_by_role
//   list_item_checked      · props: tag, checked_by_role, seconds_since_added
//   list_opened            · fired when card first renders on Now per session
//   list_see_all_tapped    · fired when "See all →" opens the sheet

const MAX_TEXT = 200;
const TAGS = ['groceries', 'home', 'todo'];
const TAG_LABELS = { groceries: 'Groceries', home: 'Home', todo: 'To-do' };
const FILTERS = [
  { key: 'all',        label: 'All' },
  { key: 'groceries',  label: 'Groceries' },
  { key: 'home',       label: 'Home' },
  { key: 'todo',       label: 'To-do' },
];

// Track session-level open once for Mixpanel spec — fires the first time
// the list renders with items on Now.
let _sessionOpenedFired = false;
// Per-tab mixpanel spec: one fire per session.
let _seeAllFiredThisSession = false;

function _todayStr(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function _fmtAge(ts){
  if(!ts) return '';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff/60000);
  const hrs  = Math.floor(diff/3600000);
  const days = Math.floor(diff/86400000);
  if(mins < 1)  return 'just now';
  if(mins < 60) return `${mins}m ago`;
  if(hrs  < 24) return `${hrs}h ago`;
  return `${days}d ago`;
}

function _nameFor(uid){
  if(!uid) return '';
  if(uid === state.myUid) return state.ME || 'You';
  if(uid === state.partnerUid) return state.OTHER || 'Partner';
  return '';
}

function _sameLocalDay(ts, dateStr){
  if(!ts) return false;
  const d = new Date(ts);
  const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return k === dateStr;
}

function _visibleItems(items){
  // Keep checked items visible until end of their local "done" day so the
  // toggle feels satisfying. After that, filter them out.
  const today = _todayStr();
  return items.filter(it => {
    if(!it.done) return true;
    return _sameLocalDay(it.doneAt, today);
  });
}

function _applyFilter(items, f){
  if(f === 'all') return items;
  return items.filter(it => it.tag === f);
}

// ── Render: card on Now ───────────────────────────────────
function _renderCard(){
  const card = document.getElementById('our-list-card');
  if(!card) return;
  const items = Array.isArray(state._olItems) ? state._olItems : [];
  const visible = _visibleItems(items);

  // Filter chip counts include done-but-still-visible items.
  FILTERS.forEach(f => {
    const countEl = document.getElementById(`ol-filter-${f.key}-count`);
    if(!countEl) return;
    const n = f.key === 'all' ? visible.length : visible.filter(it => it.tag === f.key).length;
    countEl.textContent = n;
  });

  // Active filter styling
  document.querySelectorAll('#our-list-card .ol-filter-chip').forEach(el => {
    el.classList.toggle('active', el.dataset.filter === state._olFilter);
  });

  // Overall count on header (total not-done matching current filter is the
  // intent; show the active-filter count as the header chip).
  const headerCount = document.getElementById('ol-header-count');
  if(headerCount){
    const openCount = visible.filter(it => !it.done);
    const filtered = _applyFilter(openCount, state._olFilter);
    headerCount.textContent = filtered.length;
  }

  // Top-3 not-done items matching filter, newest first.
  const filtered = _applyFilter(visible, state._olFilter)
    .slice()
    .sort((a,b) => {
      if(!!a.done !== !!b.done) return a.done ? 1 : -1;
      return (b.addedAt||0) - (a.addedAt||0);
    });

  const topThree = filtered.slice(0, 3);
  const listEl = document.getElementById('ol-list');
  const emptyEl = document.getElementById('ol-empty');
  const seeAllBtn = document.getElementById('ol-see-all');

  if(listEl){
    if(topThree.length === 0){
      listEl.innerHTML = '';
    } else {
      listEl.innerHTML = topThree.map(_rowHTML).join('');
    }
  }
  if(emptyEl){
    emptyEl.style.display = topThree.length === 0 ? 'block' : 'none';
  }
  if(seeAllBtn){
    const n = filtered.length;
    if(n > 3){
      seeAllBtn.style.display = 'flex';
      seeAllBtn.textContent = `See all ${n} →`;
    } else {
      seeAllBtn.style.display = 'none';
    }
  }

  // Fire list_opened once per session (Phase 3 spec).
  if(!_sessionOpenedFired && items.length > 0){
    _sessionOpenedFired = true;
    // Mixpanel: list_opened (Phase 3 — not wired yet)
  }
}

function _rowHTML(item){
  const key = R._esc(item._key || '');
  const text = R._esc(item.text || '');
  const who = R._esc(_nameFor(item.addedBy));
  const age = _fmtAge(item.addedAt);
  const tagKey = TAGS.includes(item.tag) ? item.tag : 'todo';
  const tagLabel = R._esc(TAG_LABELS[tagKey]);
  return `
    <div class="ol-row${item.done ? ' ol-row-done' : ''}" data-key="${key}">
      <button class="ol-check${item.done ? ' checked' : ''}"
              onclick="toggleOurListDone('${key}')"
              aria-label="${item.done ? 'Uncheck' : 'Check'}">
        ${item.done ? '<div class="ol-check-mark"></div>' : ''}
      </button>
      <div class="ol-row-body">
        <div class="ol-row-text">${text}</div>
        <div class="ol-row-meta">${who}${age ? ` · ${R._esc(age)}` : ''}</div>
      </div>
      <span class="ol-tag ol-tag-${tagKey}">${tagLabel}</span>
    </div>`;
}

// ── Render: see-all sheet ─────────────────────────────────
function _renderSheet(){
  const ov = document.getElementById('ol-sheet-overlay');
  if(!ov) return;
  const items = Array.isArray(state._olItems) ? state._olItems : [];
  const visible = _visibleItems(items);

  // Chip counts in sheet
  FILTERS.forEach(f => {
    const countEl = document.getElementById(`ol-sheet-filter-${f.key}-count`);
    if(!countEl) return;
    const n = f.key === 'all' ? visible.length : visible.filter(it => it.tag === f.key).length;
    countEl.textContent = n;
  });

  document.querySelectorAll('#ol-sheet-overlay .ol-filter-chip').forEach(el => {
    el.classList.toggle('active', el.dataset.filter === state._olFilter);
  });

  const filtered = _applyFilter(visible, state._olFilter)
    .slice()
    .sort((a,b) => {
      if(!!a.done !== !!b.done) return a.done ? 1 : -1;
      return (b.addedAt||0) - (a.addedAt||0);
    });

  const listEl = document.getElementById('ol-sheet-list');
  const emptyEl = document.getElementById('ol-sheet-empty');
  if(listEl){
    listEl.innerHTML = filtered.length
      ? filtered.map(_rowHTML).join('')
      : '';
  }
  if(emptyEl){
    emptyEl.style.display = filtered.length === 0 ? 'block' : 'none';
  }
}

// ── Listener ──────────────────────────────────────────────
function _subscribe(){
  if(state._olUnsub){ try{ state._olUnsub(); }catch(e){} state._olUnsub = null; }
  if(!state.db || !state.fbOnValue || !state.coupleId) return;
  state._olUnsub = state.fbOnValue(
    state.dbRef(state.db, `couples/${state.coupleId}/ourList`),
    snap => {
      const val = snap.val() || {};
      state._olItems = Object.entries(val).map(([k, v]) => ({ ...v, _key: k }));
      _renderCard();
      // Keep the sheet live if open.
      const ov = document.getElementById('ol-sheet-overlay');
      if(ov && ov.classList.contains('open')) _renderSheet();
    }
  );
}

function initOurList(){
  if(state.coupleType !== 'together') return;
  state._olFilter = state._olFilter || 'all';
  _subscribe();
  _renderCard();
}

function teardownOurList(){
  if(state._olUnsub){ try{ state._olUnsub(); }catch(e){} state._olUnsub = null; }
  state._olItems = [];
  state._olFilter = 'all';
  _sessionOpenedFired = false;
  _seeAllFiredThisSession = false;
}

// ── Filter switching (exposed on window for inline onclicks) ──
window.setOurListFilter = function(f){
  if(!FILTERS.some(x => x.key === f)) f = 'all';
  state._olFilter = f;
  _renderCard();
  const ov = document.getElementById('ol-sheet-overlay');
  if(ov && ov.classList.contains('open')) _renderSheet();
};

// ── Add ───────────────────────────────────────────────────
async function _addItem(text, tag, opts){
  const t = (text || '').trim();
  if(!t) return;
  if(t.length > MAX_TEXT) return;
  if(!TAGS.includes(tag)) tag = 'groceries';
  if(!state.db || !state.coupleId || !state.myUid) return;
  if(state._olInFlight) return;
  state._olInFlight = true;
  try{
    const item = {
      text: t.slice(0, MAX_TEXT),
      tag,
      addedBy: state.myUid,
      addedAt: Date.now(),
      done: false,
    };
    await state.dbPush(
      state.dbRef(state.db, `couples/${state.coupleId}/ourList`),
      item
    );
    // Pass the item text as extra so /api/notify can render a richer body.
    if(R.notifyPartner){
      if(opts && opts.skipNotify) {
        // skip — used by bulk ingredients flow to send a single notification
      } else {
        R.notifyPartner('listItemAdded', { extra: item.text });
      }
    }
    // Mixpanel: list_item_added (Phase 3 — not wired yet)
  }catch(e){
    console.error('Our list add failed:', e);
  }finally{
    state._olInFlight = false;
  }
}

async function _addMany(texts, tag){
  // Adds many items in sequence and sends a single partner notification at
  // the end. Used by the Tonight's Dinner ingredients handoff.
  const clean = (texts || [])
    .map(x => (x || '').trim())
    .filter(Boolean)
    .slice(0, 30);
  if(!clean.length) return 0;
  for(const t of clean){
    await _addItem(t, tag, { skipNotify: true });
  }
  // Single summary notification so the partner isn't pelted.
  if(R.notifyPartner){
    const preview = clean.slice(0, 3).join(', ');
    const extra = clean.length > 3
      ? `${preview}, +${clean.length - 3} more`
      : preview;
    R.notifyPartner('listItemAdded', { extra });
  }
  return clean.length;
}

function _wireCardInput(){
  const input = document.getElementById('ol-input');
  const tagSel = document.getElementById('ol-tag-input');
  const addBtn = document.getElementById('ol-add-btn');
  if(!input || !addBtn || input._wired) return;
  input._wired = true;
  const submit = async () => {
    await _addItem(input.value, tagSel ? tagSel.value : 'groceries');
    input.value = '';
  };
  addBtn.addEventListener('click', submit);
  input.addEventListener('keydown', ev => {
    if(ev.key === 'Enter'){ ev.preventDefault(); submit(); }
  });
}

function _wireSheetInput(){
  const input = document.getElementById('ol-sheet-input');
  const tagSel = document.getElementById('ol-sheet-tag-input');
  const addBtn = document.getElementById('ol-sheet-add-btn');
  if(!input || !addBtn || input._wired) return;
  input._wired = true;
  const submit = async () => {
    await _addItem(input.value, tagSel ? tagSel.value : 'groceries');
    input.value = '';
    _renderSheet();
  };
  addBtn.addEventListener('click', submit);
  input.addEventListener('keydown', ev => {
    if(ev.key === 'Enter'){ ev.preventDefault(); submit(); }
  });
}

// ── Toggle done ───────────────────────────────────────────
window.toggleOurListDone = async function(key){
  if(!key) return;
  if(!state.db || !state.coupleId || !state.myUid) return;
  const item = state._olItems.find(x => x._key === key);
  if(!item) return;
  const newDone = !item.done;
  try{
    // Write only the fields we own — preserve text/tag/addedBy/addedAt.
    await state.dbUpdate(
      state.dbRef(state.db, `couples/${state.coupleId}/ourList/${key}`),
      {
        done: newDone,
        doneAt: newDone ? Date.now() : null,
        doneBy: newDone ? state.myUid : null,
      }
    );
    // Mixpanel: list_item_checked (Phase 3 — not wired yet)
  }catch(e){
    console.error('Our list toggle failed:', e);
  }
};

// ── See-all sheet open/close ──────────────────────────────
window.openOurListSheet = function(){
  _renderSheet();
  _wireSheetInput();
  const nav = document.getElementById('bottom-nav');
  if(nav) nav.style.display = 'none';
  const ov = document.getElementById('ol-sheet-overlay');
  if(ov) ov.classList.add('open');
  if(!_seeAllFiredThisSession){
    _seeAllFiredThisSession = true;
    // Mixpanel: list_see_all_tapped (Phase 3 — not wired yet)
  }
  if(R._initSheetSwipe){
    R._initSheetSwipe('ol-sheet', 'ol-sheet-overlay', window.closeOurListSheet);
  }
};

window.closeOurListSheet = function(){
  const nav = document.getElementById('bottom-nav');
  if(nav) nav.style.display = 'flex';
  const ov = document.getElementById('ol-sheet-overlay');
  if(ov) ov.classList.remove('open');
};

// Wire card input once DOM is ready so the inline handlers work even if the
// card is initially hidden (Together mode toggles display).
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', _wireCardInput);
} else {
  _wireCardInput();
}

// ── Register ──────────────────────────────────────────────
R.initOurList = initOurList;
R.teardownOurList = teardownOurList;
R.renderOurList = _renderCard;
R.addOurListMany = _addMany;

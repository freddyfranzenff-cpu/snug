import { state } from './state.js';
import { R } from './registry.js';


function _mjTodayKey(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function _mjFmtTime(ts){
  if(!ts) return '';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function _mjFmtDate(dateKey){
  // dateKey = 'YYYY-MM-DD'
  const d = new Date(dateKey+'T12:00:00');
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
}

function _mjSetInputDisabled(disabled, context){
  const inputId = context==='today' ? 'mj-today-input' : 'mj-preview-input';
  const sendId = context==='today' ? 'mj-today-send' : 'mj-preview-send';
  const rowId = context==='today' ? 'mj-today-input-row' : 'mj-preview-input-row';
  const input = document.getElementById(inputId);
  const send = document.getElementById(sendId);
  const row = document.getElementById(rowId);
  if(input) input.disabled = disabled;
  if(send) send.disabled = disabled;
  if(row && disabled){
    row.innerHTML = `<div style="display:flex;align-items:center;gap:.5rem;padding:.45rem .7rem;">
      <div style="width:18px;height:18px;border-radius:50%;background:rgba(42,157,92,0.12);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="#2a9d5c" stroke-width="1.8"><path d="M2 5l2.5 2.5L8 3"/></svg>
      </div>
      <span class="mj-written-note" style="font-style:italic;font-size:.68rem;color:#2a9d5c;">You've written today — this can't be changed</span>
    </div>`;
  }
}

function renderMemoryJarPreview(){
  if(!state.ME || !state.OTHER) return;
  // Avatars — use _applyAvatar so photos show if available
  const myAvEl = document.getElementById('mj-preview-my-avatar');
  const otherAvEl = document.getElementById('mj-preview-other-avatar');
  R._applyAvatar(myAvEl, state.myAvatarUrl, (state.ME||'?')[0].toUpperCase(), true);
  R._applyAvatar(otherAvEl, state.otherAvatarUrl, (state.OTHER||'?')[0].toUpperCase(), false);

  // My entry
  const myTextEl = document.getElementById('mj-preview-my-text');
  if(myTextEl){
    if(state._mjMyEntry?.text){
      myTextEl.textContent = state._mjMyEntry.text;
      myTextEl.className = 'mj-entry-text';
    } else {
      myTextEl.textContent = 'Nothing yet today';
      myTextEl.className = 'mj-entry-text mj-empty-entry';
    }
  }

  // Other entry
  const otherTextEl = document.getElementById('mj-preview-other-text');
  if(otherTextEl){
    if(state._mjOtherEntry?.text){
      otherTextEl.textContent = state._mjOtherEntry.text;
      otherTextEl.className = 'mj-entry-text';
    } else {
      otherTextEl.textContent = 'Nothing yet today';
      otherTextEl.className = 'mj-entry-text mj-empty-entry';
    }
  }

  // Disable input if already written
  if(state._mjMyEntry?.text){
    const row = document.getElementById('mj-preview-input-row');
    if(row) row.innerHTML = `<div style="display:flex;align-items:center;gap:.5rem;padding:.45rem .7rem;"><div style="width:18px;height:18px;border-radius:50%;background:rgba(42,157,92,0.12);display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="#2a9d5c" stroke-width="1.8"><path d="M2 5l2.5 2.5L8 3"/></svg></div><span style="font-style:italic;font-size:.68rem;color:#2a9d5c;">You\'ve written today — this can\'t be changed</span></div>`;
  }

  // Streak
  const streakEl = document.getElementById('mj-preview-streak');
  if(streakEl){
    if(state._mjStreakCount > 0){
      streakEl.textContent = `${state._mjStreakCount} day streak 🔥`;
    } else {
      streakEl.textContent = 'Start your streak!';
      streakEl.style.color = 'var(--muted)';
      streakEl.style.fontWeight = '400';
    }
  }
}

function renderMemoryJarPage(){
  if(!state.ME || !state.OTHER) return;

  // Avatars
  R.applyAllAvatars && R.applyAllAvatars();

  // Today date
  const dateEl = document.getElementById('mj-today-date');
  if(dateEl) dateEl.textContent = R._mjFmtDate(R._mjTodayKey());

  // My entry
  const myTextEl = document.getElementById('mj-today-my-text');
  const myTimeEl = document.getElementById('mj-today-my-time');
  if(myTextEl){
    if(state._mjMyEntry?.text){
      myTextEl.textContent = state._mjMyEntry.text;
      myTextEl.className = 'mj-entry-text';
      if(myTimeEl) myTimeEl.textContent = `You · ${R._mjFmtTime(state._mjMyEntry.createdAt)}`;
    } else {
      myTextEl.textContent = "You haven't written yet today";
      myTextEl.className = 'mj-entry-text mj-empty-entry';
      if(myTimeEl) myTimeEl.textContent = '';
    }
  }

  // Other entry
  const otherTextEl = document.getElementById('mj-today-other-text');
  const otherTimeEl = document.getElementById('mj-today-other-time');
  if(otherTextEl){
    if(state._mjOtherEntry?.text){
      otherTextEl.textContent = state._mjOtherEntry.text;
      otherTextEl.className = 'mj-entry-text';
      if(otherTimeEl) otherTimeEl.textContent = `${state.OTHER} · ${R._mjFmtTime(state._mjOtherEntry.createdAt)}`;
    } else {
      otherTextEl.textContent = 'Waiting for their moment…';
      otherTextEl.className = 'mj-entry-text mj-empty-entry';
      if(otherTimeEl) otherTimeEl.textContent = '';
    }
  }

  // Badge
  const badgeEl = document.getElementById('mj-today-badge');
  if(badgeEl){
    const count = (state._mjMyEntry?.text?1:0) + (state._mjOtherEntry?.text?1:0);
    badgeEl.textContent = count===2 ? 'both wrote ✓' : count===1 ? '1 of 2' : '';
    badgeEl.className = 'mj-day-badge' + (count===2?' both':'');
  }

  // Disable input if written
  if(state._mjMyEntry?.text) R._mjSetInputDisabled(true, 'today');

  // Streak
  const swEl = document.getElementById('mj-page-streak-wrap');
  const snEl = document.getElementById('mj-page-streak-num');
  if(swEl && snEl){
    swEl.style.display = state._mjStreakCount>0 ? 'inline-flex' : 'none';
    snEl.textContent = state._mjStreakCount;
    R.updateMetricChips&&R.updateMetricChips();
  }
}

async function _mjLoadAndRender(){
  if(!state.db || !state.coupleId || !state.myUid || !state.partnerUid) return;
  const today = R._mjTodayKey();

  // Listen to today's entries in real time
  if(state._mjUnsub){ try{state._mjUnsub();}catch(e){} state._mjUnsub=null; }
  state._mjUnsub = state.fbOnValue(state.dbRef(state.db,`couples/${state.coupleId}/memoryJar/${today}`), snap=>{
    const d = snap.val()||{};
    state._mjMyEntry = d[state.myUid]||null;
    state._mjOtherEntry = d[state.partnerUid]||null;
    R.renderMemoryJarPreview();
    R.renderMemoryJarPage();
  });

  // Calculate streak — lenient: today is skipped if incomplete (still in progress)
  try{
    await new Promise(res=>state.fbOnValue(state.dbRef(state.db,`couples/${state.coupleId}/memoryJar`), snap=>{
      const all = snap.val()||{};
      let streak = 0;
      const todayKey = R._mjTodayKey();
      for(let i=0; i<365; i++){
        const d = new Date();
        d.setDate(d.getDate()-i);
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const dayData = all[key]||{};
        const bothWrote = dayData[state.myUid]?.text && dayData[state.partnerUid]?.text;
        if(key === todayKey){
          // Today: if both wrote count it; if only one wrote, skip today (still in progress) and check yesterday
          if(bothWrote) streak++;
          // either way continue to yesterday — today being incomplete doesn't break streak
          continue;
        }
        // Past days: both must have written, otherwise streak is broken
        if(bothWrote) streak++;
        else break;
      }
      state._mjStreakCount = streak;
      res();
    },{onlyOnce:true}));
  }catch(e){}

  R.renderMemoryJarPreview();
  R.renderMemoryJarPage();
  R._mjRenderHistory();
}

function _mjRenderHistory(){
  if(!state.db || !state.coupleId) return;
  const histEl = document.getElementById('mj-history-list');
  if(!histEl) return;
  const today = R._mjTodayKey();
  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];

  state.fbOnValue(state.dbRef(state.db,`couples/${state.coupleId}/memoryJar`), snap=>{
    const all = snap.val()||{};
    const pastKeys = Object.keys(all)
      .filter(k=>k!==today)
      .sort().reverse();

    if(!pastKeys.length){
      histEl.innerHTML = '<p class="empty">No earlier memories yet — start writing!</p>';
      return;
    }

    // Group by YYYY-MM
    const byMonth = {};
    pastKeys.forEach(dateKey=>{
      const monthKey = dateKey.substring(0,7); // YYYY-MM
      if(!byMonth[monthKey]) byMonth[monthKey]=[];
      byMonth[monthKey].push(dateKey);
    });

    const monthKeys = Object.keys(byMonth).sort().reverse();
    const isCurrentMonth = (mk) => {
      const t = new Date();
      return mk === `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}`;
    };

    histEl.innerHTML = monthKeys.map((monthKey, mIdx)=>{
      const [yr, mo] = monthKey.split('-');
      const monthName = `${MONTHS[parseInt(mo)-1]} ${yr}`;
      const days = byMonth[monthKey];
      const totalDays = days.length;
      const bothCount = days.filter(dk=>{
        const dd = all[dk]||{};
        return dd[state.myUid]?.text && dd[state.partnerUid]?.text;
      }).length;
      const isOpen = mIdx === 0; // most recent month open by default
      const groupId = `mj-month-${monthKey.replace('-','_')}`;

      const dayCards = days.map(dateKey=>{
        const dayData = all[dateKey]||{};
        const myEntry = dayData[state.myUid];
        const otherEntry = dayData[state.partnerUid];
        const count = (myEntry?.text?1:0)+(otherEntry?.text?1:0);
        const badge = count===2?'both wrote ✓':count===1?'1 of 2':'';
        const badgeClass = count===2?'mj-day-badge both':'mj-day-badge';
        const _myAvHtml = state.myAvatarUrl
          ? `<img src="${R._esc(state.myAvatarUrl)}" class="avatar-img-circle" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;"/>`
          : R._esc((state.ME||'?')[0].toUpperCase());
        const _otherAvHtml = state.otherAvatarUrl
          ? `<img src="${R._esc(state.otherAvatarUrl)}" class="avatar-img-circle" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;"/>`
          : R._esc((state.OTHER||'?')[0].toUpperCase());
        const meRow = myEntry?.text
          ? `<div class="mj-entry-row"><div class="mj-avatar mj-avatar-me">${_myAvHtml}</div><div style="flex:1;"><div class="mj-entry-text">${R._mjEscape(myEntry.text)}</div><div class="mj-entry-meta">${R._esc(state.ME)} · ${R._mjFmtTime(myEntry.createdAt)}</div></div></div>`
          : '';
        const otherRow = otherEntry?.text
          ? `<div class="mj-entry-row"><div class="mj-avatar mj-avatar-other">${_otherAvHtml}</div><div style="flex:1;"><div class="mj-entry-text">${R._mjEscape(otherEntry.text)}</div><div class="mj-entry-meta">${R._esc(state.OTHER)} · ${R._mjFmtTime(otherEntry.createdAt)}</div></div></div>`
          : '';
        return `<div class="mj-day-card"><div class="mj-day-header"><span class="mj-day-date">${R._mjFmtDate(dateKey)}</span><span class="${badgeClass}">${badge}</span></div>${meRow}${otherRow}</div>`;
      }).join('');

      const metaText = `${totalDays} day${totalDays!==1?'s':''} · both wrote ${bothCount} time${bothCount!==1?'s':''}`;

      return `<div class="mj-month-group">
        <div class="mj-month-header" onclick="window._mjToggleMonth('${groupId}')">
          <div>
            <div class="mj-month-name">${monthName}</div>
            <div class="mj-month-meta">${metaText}</div>
          </div>
          <span class="mj-month-arrow${isOpen?' open':''}" id="${groupId}-arrow">›</span>
        </div>
        <div class="mj-month-days${isOpen?' open':''}" id="${groupId}">
          ${dayCards}
        </div>
      </div>`;
    }).join('');
  },{onlyOnce:true});
}

window._mjToggleMonth = function(groupId){
  const days = document.getElementById(groupId);
  const arrow = document.getElementById(groupId+'-arrow');
  if(!days||!arrow) return;
  const isOpen = days.classList.contains('open');
  days.classList.toggle('open', !isOpen);
  arrow.classList.toggle('open', !isOpen);
};

function _mjEscape(str){
  return (str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

window.submitMemoryJar = async function(context){
  const inputId = context==='today' ? 'mj-today-input' : 'mj-preview-input';
  const input = document.getElementById(inputId);
  if(!input) return;
  const text = input.value.trim();
  if(!text || !state.db || !state.coupleId || !state.myUid) return;
  if(state._mjMyEntry?.text) return; // already written today
  const today = R._mjTodayKey();
  const entry = { text, createdAt: Date.now() };
  // Disable immediately so double-tap can't fire
  const sendBtn = document.getElementById(context==='today'?'mj-today-send':'mj-preview-send');
  if(sendBtn) sendBtn.disabled = true;
  try{
    await state.dbSet(state.dbRef(state.db,`couples/${state.coupleId}/memoryJar/${today}/${state.myUid}`), entry);
    R.notifyPartner && R.notifyPartner('memoryJar');
    input.value = '';
    // Brief confirmation flash
    const rowId = context==='today'?'mj-today-input-row':'mj-preview-input-row';
    const row = document.getElementById(rowId);
    // listener fires and updates display
  }catch(e){
    console.error('submitMemoryJar failed:', e);
    if(sendBtn) sendBtn.disabled = false;
  }
};

// ── TOGETHER MODE FEATURES ────────────────────────────────────

// ── Time picker ────────────────────────────────────────────

// ── Register for cross-module access ─────────────────────
R._mjTodayKey = _mjTodayKey;
R._mjFmtTime = _mjFmtTime;
R._mjFmtDate = _mjFmtDate;
R._mjSetInputDisabled = _mjSetInputDisabled;
R.renderMemoryJarPreview = renderMemoryJarPreview;
R.renderMemoryJarPage = renderMemoryJarPage;
R._mjLoadAndRender = _mjLoadAndRender;
R._mjRenderHistory = _mjRenderHistory;
R._mjEscape = _mjEscape;

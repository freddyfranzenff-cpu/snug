import { state } from './state.js';
import { R } from './registry.js';

// Letter

function isUnlocked(unlockDate){
  if(!unlockDate) return false;
  return new Date() >= new Date(unlockDate);
}

function renderLetterTimeline(rounds){
  const tl = document.getElementById("letter-timeline");
  const emptyEl = document.getElementById("letter-empty");
  if(!tl) return;

  if(!rounds||!rounds.length){
    tl.innerHTML = "";
    if(emptyEl) emptyEl.style.display = "none";
    R.renderCurrentRound(null);
    return;
  }
  if(emptyEl) emptyEl.style.display = "none";

  // Sort rounds by unlockDate descending (newest first)
  rounds.sort((a,b) => new Date(b.unlockDate) - new Date(a.unlockDate));
  state.letterRounds = rounds;

  // Check if today is unlock day for any round
  const unlockedToday = rounds.some(r => {
    const d = new Date(r.unlockDate);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  });
  const banner = document.getElementById("letter-unlocked-banner");
  if(banner) banner.style.display = unlockedToday ? "block" : "none";

  tl.innerHTML = "";
  rounds.forEach((round, i) => {
    const unlocked = R.isUnlocked(round.unlockDate);
    const isActive = i === 0 && !unlocked;

    // Separator
    const sep = document.createElement("div");
    sep.className = "letter-meetup-sep";
    const d = new Date(round.unlockDate);
    const modeWord = state.coupleType==='together'?'Date night':'Meetup';
      const label = isActive ? `${modeWord} · ${d.toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}` : `${modeWord} · ${d.toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}`;
    sep.innerHTML = `<span class="letter-meetup-sep-label">${label}</span>`;
    tl.appendChild(sep);

    // Round card
    const card = document.createElement("div");
    card.className = `letter-round${isActive?" active-round":""}${unlocked?" ":""}`;
    if(!isActive) card.style.opacity = ".85";

    const badge = isActive
      ? `<span class="letter-round-badge active">Active · Writing phase</span>`
      : `<span class="letter-round-badge read">Read · ${new Date(round.unlockDate).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}</span>`;

    const myLetter = round[state.myUid] || {};
    const otherLetter = round[state.partnerUid] || {};

    card.innerHTML = `
      <div class="letter-round-header">
        <p class="letter-round-date">${d.toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}</p>
        ${badge}
      </div>
      <div class="letter-tiles">
        ${R.renderLetterTile(myLetter, true, round._key, unlocked, isActive)}
        ${R.renderLetterTile(otherLetter, false, round._key, unlocked, isActive)}
      </div>
      ${isActive ? R.renderRoundCountdown(round.unlockDate) : ""}
    `;
    tl.appendChild(card);
  });
  // After rendering previous rounds, also render the empty "Write letter" tile
  // for the current upcoming meetup (if any and not already rendered). Without
  // this call, couples who completed a previous letter round and set a new
  // meetup date have no way to start writing for the new round.
  R.renderCurrentRound(rounds);
}

function renderLetterTile(letter, isMe, roundKey, unlocked, isActive){
  const name = isMe ? state.ME : state.OTHER;
  const hasContent = !!(letter && letter.content);
  const otherEsc = R._esc(state.OTHER);
  const rk = R._esc(roundKey);

  if(isMe){
    if(hasContent){
      const preview = R._esc(letter.content.substring(0,80) + (letter.content.length>80?"…":""));
      const statusClass = unlocked && letter.readAt ? "read" : "written";
      const statusText = R._esc(unlocked && letter.readAt ? "Read by "+state.OTHER : "Written & sealed");
      return `<div class="letter-tile${isActive?" clickable":""}" onclick="${isActive?`openLetterModal('${rk}',true)`:""}">
        <p class="letter-tile-eyebrow"><svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="3" width="12" height="10" rx="1"/><path d="M2 6l6 4 6-4"/></svg>Your letter to ${otherEsc}</p>
        <div class="letter-tile-status ${statusClass}">${statusClass==="read"?"✓ "+statusText:"✎ "+statusText}</div>
        <p class="letter-tile-preview">${preview}</p>
        ${isActive?`<button class="letter-tile-btn" onclick="event.stopPropagation();openLetterModal('${rk}',true)">Edit ✎</button>`:`<div class="letter-tile-meta"><span>Written ${letter.writtenAt?new Date(letter.writtenAt).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"2-digit"}):""}</span></div>`}
      </div>`;
    } else {
      return `<div class="letter-tile clickable" onclick="openLetterModal('${rk}',true)">
        <p class="letter-tile-eyebrow"><svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="3" width="12" height="10" rx="1"/><path d="M2 6l6 4 6-4"/></svg>Your letter to ${otherEsc}</p>
        <div class="letter-tile-status empty">Not written yet</div>
        <p class="letter-tile-preview" style="opacity:.5;">Tap to write your letter to ${otherEsc}…</p>
        <button class="letter-tile-btn primary" onclick="event.stopPropagation();openLetterModal('${rk}',true)">Write letter</button>
      </div>`;
    }
  } else {
    // Other person's letter
    if(unlocked && hasContent){
      const preview = R._esc(letter.content.substring(0,80) + (letter.content.length>80?"…":""));
      return `<div class="letter-tile clickable" onclick="openLetterRead('${rk}')">
        <p class="letter-tile-eyebrow"><svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="3" width="12" height="10" rx="1"/><path d="M2 6l6 4 6-4"/></svg>${otherEsc}'s letter to you</p>
        <div class="letter-tile-status read">✓ Read</div>
        <p class="letter-tile-preview">${preview}</p>
        <div class="letter-tile-meta"><span>Written ${letter.writtenAt?new Date(letter.writtenAt).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"2-digit"}):""}</span><span>Read ${letter.readAt?new Date(letter.readAt).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"2-digit"}):""}</span></div>
      </div>`;
    } else {
      return `<div class="letter-tile sealed">
        <p class="letter-tile-eyebrow"><svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="3" width="12" height="10" rx="1"/><path d="M2 6l6 4 6-4"/></svg>${otherEsc}'s letter to you</p>
        <div class="letter-tile-status sealed"><svg width="8" height="8" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="8" width="10" height="7" rx="1"/><path d="M5 8V6a3 3 0 016 0v2"/></svg> ${hasContent ? "Written &amp; sealed" : "Not written yet"}</div>
        <p class="letter-tile-preview" style="opacity:.45;">${hasContent ? (state.coupleType==='together'?'You can read it on your date night.':`You can read it on the day you meet.`) : otherEsc+" hasn't written a letter yet."}</p>
        ${hasContent ? `<button class="letter-tile-btn" style="opacity:.45;pointer-events:none;">Locked until meetup 🔒</button>` : ""}
      </div>`;
    }
  }
}

function renderRoundCountdown(unlockDate){
  const diff = new Date(unlockDate) - Date.now();
  if(diff <= 0) return "";
  const d = Math.floor(diff/86400000);
  const h = Math.floor((diff%86400000)/3600000);
  const m = Math.floor((diff%3600000)/60000);
  const s = Math.floor((diff%60000)/1000);
  return `<div class="letter-round-cd" data-unlock="${unlockDate}">
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="var(--muted)" stroke-width="1.3"><rect x="3" y="8" width="10" height="7" rx="1"/><path d="M5 8V6a3 3 0 016 0v2"/><circle cx="8" cy="11" r="1" fill="var(--muted)" stroke="none"/></svg>
    <span class="letter-round-cd-label">Unlocks on ${new Date(unlockDate).toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}</span>
    <div class="letter-round-cd-nums">
      <div><span class="letter-round-cd-num">${d}</span><span class="letter-round-cd-unit">d</span></div>
      <div><span class="letter-round-cd-num">${h}</span><span class="letter-round-cd-unit">h</span></div>
      <div><span class="letter-round-cd-num">${m}</span><span class="letter-round-cd-unit">m</span></div>
      <div><span class="letter-round-cd-num">${s}</span><span class="letter-round-cd-unit">s</span></div>
    </div>
  </div>`;
}

function renderCurrentRound(rounds){
  const tl = document.getElementById("letter-timeline");
  if(!tl) return;
  // If no meetup date set or date is in the past with no new date
  if(!state.meetupDate || state.meetupDate <= new Date()){
    // Only show prompt if there's no active round already
    const hasActiveRound = rounds && rounds.some(r => r.unlockDate && new Date(r.unlockDate) > new Date());
    if(!hasActiveRound){
      const prompt = document.createElement("div");
      prompt.style.cssText = "text-align:center;padding:2rem 1rem;color:var(--muted);font-size:.78rem;line-height:1.7;";
      prompt.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--border)" stroke-width="1" stroke-linecap="round" style="display:block;margin:0 auto .75rem;"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>${state.coupleType==='together'?'Set your next date night on the home page':'Set your next meetup date on the home page'}<br>to start writing new letters 💌`;
      tl.appendChild(prompt);
    }
    return;
  }
  const unlockDateStr = R._localDateStr(state.meetupDate);
  // Check if a round already exists for this date
  const existing = rounds && rounds.find(r => r.unlockDate && r.unlockDate.startsWith(unlockDateStr));
  if(existing) return; // already rendered
  // Create empty round UI
  const sep = document.createElement("div");
  sep.className = "letter-meetup-sep";
  sep.innerHTML = `<span class="letter-meetup-sep-label">${state.coupleType==='together'?'Date night':'Next meetup'} · ${state.meetupDate.toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}</span>`;
  tl.appendChild(sep);
  const card = document.createElement("div");
  card.className = "letter-round active-round";
  const otherEsc = R._esc(state.OTHER);
  card.innerHTML = `
    <div class="letter-round-header">
      <p class="letter-round-date">${state.meetupDate.toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}</p>
      <span class="letter-round-badge active">Active · Writing phase</span>
    </div>
    <div class="letter-tiles">
      <div class="letter-tile clickable" onclick="openLetterModal('new',true)">
        <p class="letter-tile-eyebrow"><svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="3" width="12" height="10" rx="1"/><path d="M2 6l6 4 6-4"/></svg>Your letter to ${otherEsc}</p>
        <div class="letter-tile-status empty">Not written yet</div>
        <p class="letter-tile-preview" style="opacity:.5;">Tap to write your letter to ${otherEsc}…</p>
        <button class="letter-tile-btn primary" onclick="event.stopPropagation();openLetterModal('new',true)">Write letter</button>
      </div>
      <div class="letter-tile sealed">
        <p class="letter-tile-eyebrow"><svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="3" width="12" height="10" rx="1"/><path d="M2 6l6 4 6-4"/></svg>${otherEsc}'s letter to you</p>
        <div class="letter-tile-status empty">Not written yet</div>
        <p class="letter-tile-preview" style="opacity:.45;">${otherEsc} hasn't written a letter yet.</p>
      </div>
    </div>
  `;
  tl.appendChild(card);
}

window.openLetterModal = function(roundKey, isMe){
  state.currentLetterRoundId = roundKey;
  const modal = document.getElementById("letter-modal-overlay");
  const titleEl = document.getElementById("letter-modal-title");
  const subEl = document.getElementById("letter-modal-sub");
  const hintEl = document.getElementById("letter-modal-hint-name");
  const ta = document.getElementById("letter-modal-textarea");
  if(!modal) return;

  titleEl.textContent = `Your letter to ${state.OTHER}`;
  subEl.textContent = `Only you can see this. ${state.OTHER} will read it ${state.coupleType==='together'?'on your date night':'on the day you meet'}.`;
  if(hintEl) hintEl.textContent = state.OTHER;
  // Set salutation placeholder dynamically
  const taEl = document.getElementById('letter-modal-textarea');
  if(taEl) taEl.placeholder = `Dear ${state.OTHER},\n\nI've been thinking about what to write…`;

  // Pre-fill if existing content
  ta.value = "";
  if(roundKey !== "new" && state.db && state.fbOnValue){
    state.fbOnValue(state.dbRef(state.db,`couples/${state.coupleId}/letters/${roundKey}/${state.myUid}/content`), snap=>{
      if(snap.val()) ta.value = snap.val();
    },{onlyOnce:true});
  }
  modal.classList.add("open");
  setTimeout(()=>{
    ta.focus();
    const counter = document.getElementById("letter-char-count");
    if(counter) counter.textContent = ta.value.length;
  },100);
};

window.closeLetterModal = function(){
  const modal = document.getElementById("letter-modal-overlay");
  if(modal) modal.classList.remove("open");
  state.currentLetterRoundId = null;
};

window.saveLetterContent = async function(){
  const ta = document.getElementById("letter-modal-textarea");
  const content_text = ta.value.trim();
  if(!content_text) return;

  // Fix 8: block saving if no meetup date or meetup date is in the past
  if(!state.meetupDate || state.meetupDate <= new Date()){
    const sub = document.getElementById("letter-modal-sub");
    if(sub){
      const orig = sub.textContent;
      sub.textContent = "Please set a valid future meetup date on the home page first.";
      sub.style.color = "#e8622a";
      setTimeout(()=>{sub.textContent=orig;sub.style.color="";},3000);
    }
    return;
  }

  // Use actual date night time in Together mode, midnight for LDR
    const unlockDateStr = R._localDateStr(state.meetupDate);
    const unlockTime = (state.coupleType==='together' && state._dnTimeVal) ? state._dnTimeVal : '00:00';
    const unlockDate = `${unlockDateStr}T${unlockTime}:00`;

  let roundKey = state.currentLetterRoundId;

  if(state.db && state.dbSet && state.dbPush){
    try{
      if(roundKey === "new"){
        // Create new round
        const newRound = {unlockDate, createdAt: Date.now()};
        const ref_new = await state.dbPush(state.dbRef(state.db,`couples/${state.coupleId}/letters`), newRound);
        roundKey = ref_new.key;
      }
      // Save letter content
      await state.dbSet(state.dbRef(state.db,`couples/${state.coupleId}/letters/${roundKey}/${state.myUid}`),{
        content: content_text,
        writtenAt: Date.now(),
        unlockDate
      });
    }catch(e){
      console.error('saveLetterContent failed:',e);
      const sub=document.getElementById('letter-modal-sub');
      if(sub){const orig=sub.textContent;sub.textContent='Failed to save — check your connection.';sub.style.color='#e8622a';setTimeout(()=>{sub.textContent=orig;sub.style.color='';},3000);}
      return;
    }
  }
  window.closeLetterModal();
  window.initLetterPage();
};

window.openLetterRead = function(roundKey){
  if(!roundKey || !state.db || !state.fbOnValue) return;
  state.fbOnValue(state.dbRef(state.db,`couples/${state.coupleId}/letters/${roundKey}`), snap=>{
    const round = snap.val();
    if(!round) return;
    const otherLetter = round[state.partnerUid];
    if(!otherLetter || !R.isUnlocked(otherLetter.unlockDate)) return;

    // Mark as read
    if(!otherLetter.readAt){
      state.dbSet(state.dbRef(state.db,`couples/${state.coupleId}/letters/${roundKey}/${state.partnerUid}/readAt`), Date.now());
    }

    // Show read view in place of timeline
    const tl = document.getElementById("letter-timeline");
    const backBtn = `<button onclick="initLetterPage()" style="background:none;border:none;cursor:pointer;font-size:.65rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-family:'Plus Jakarta Sans',sans-serif;text-decoration:underline;text-underline-offset:3px;margin-bottom:1rem;display:block;padding:0;">← Back to letters</button>`;
    tl.innerHTML = backBtn + `<div class="letter-read-card">
      <p class="letter-read-eyebrow">Written by ${R._esc(state.OTHER)} · ${otherLetter.writtenAt?new Date(otherLetter.writtenAt).toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"}):""}</p>
      <p class="letter-read-from">To ${R._esc(state.ME)}, with love</p>
      <p class="letter-read-body" id="letter-read-body-text"></p>
      <p class="letter-read-sig">— ${R._esc(state.OTHER)} 🤍</p>
    </div>`;
    // Set content via textContent — safe, white-space:pre-wrap handles newlines in CSS
    const bodyEl = document.getElementById('letter-read-body-text');
    if(bodyEl) bodyEl.textContent = otherLetter.content||"";
  },{onlyOnce:true});
};

window.initLetterPage=function(onReady){
  const tl = document.getElementById("letter-timeline");
  if(tl) tl.innerHTML = "";
  if(!state.db || !state.fbOnValue){
    R.renderCurrentRound([]);
    if(onReady) onReady();
    return;
  }
  state.fbOnValue(state.dbRef(state.db,`couples/${state.coupleId}/letters`), snap=>{
    const data = snap.val();
    const rounds = data ? Object.entries(data).map(([k,v])=>({...v,_key:k})) : [];
    R.renderLetterTimeline(rounds);
    if(onReady) setTimeout(onReady, 150);
  },{onlyOnce:true});
}

function _startLetterCountdown(){
  if(state._letterCountdownInterval) clearInterval(state._letterCountdownInterval);
  state._letterCountdownInterval = setInterval(()=>{
    const cards = document.querySelectorAll('.active-round');
    cards.forEach(card => {
      const unlockEl = card.querySelector('.letter-round-cd');
      if(!unlockEl) return;
      const unlockDate = unlockEl.dataset.unlock;
      if(!unlockDate) return;
      const diff = new Date(unlockDate) - Date.now();
      if(diff <= 0){ R._stopLetterCountdown(); return; }
      const d = Math.floor(diff/86400000);
      const h = Math.floor((diff%86400000)/3600000);
      const m = Math.floor((diff%3600000)/60000);
      const s = Math.floor((diff%60000)/1000);
      const nums = unlockEl.querySelectorAll('.letter-round-cd-num');
      if(nums[0]) nums[0].textContent = d;
      if(nums[1]) nums[1].textContent = h;
      if(nums[2]) nums[2].textContent = m;
      if(nums[3]) nums[3].textContent = s;
    });
  }, 1000);
}

function _stopLetterCountdown(){
  if(state._letterCountdownInterval){ clearInterval(state._letterCountdownInterval); state._letterCountdownInterval=null; }
}

// Home → Us tab: one-letter shortcut for the current upcoming meetup only.
// Previous letters live exclusively on the Ours → Letters page.
// Module-level seq lets resetUsLetterShortcut invalidate any in-flight read so
// a stale onlyOnce result from a previous user can't paint into a new user's DOM.
let _letterShortcutSeq = 0;

function renderUsLetterShortcut(){
  const wrap = document.getElementById('us-letters-wrap');
  const rowsEl = document.getElementById('us-letter-rows');
  if(!wrap || !rowsEl) return;

  // Hide unless a valid upcoming meetup exists
  if(!state.meetupDate || state.meetupDate <= new Date()){
    wrap.style.display = 'none';
    rowsEl.innerHTML = '';
    return;
  }
  if(!state.db || !state.fbOnValue){
    wrap.style.display = 'none';
    return;
  }

  const mySeq = ++_letterShortcutSeq;

  state.fbOnValue(state.dbRef(state.db, `couples/${state.coupleId}/letters`), snap => {
    // Bail if another render (or a sign-out reset) has superseded us.
    if(mySeq !== _letterShortcutSeq) return;
    const data = snap.val() || {};
    const unlockDateStr = R._localDateStr(state.meetupDate);
    let match = null;
    for(const v of Object.values(data)){
      if(v && v.unlockDate && v.unlockDate.startsWith(unlockDateStr)){
        match = v; break;
      }
    }

    const myLetter = match ? (match[state.myUid] || null) : null;
    const otherLetter = match ? (match[state.partnerUid] || null) : null;
    const unlocked = match && R.isUnlocked(match.unlockDate);

    const fmtDate = state.meetupDate.toLocaleDateString('en-GB', {day:'numeric', month:'long'});
    // Share letters.js countdown math: floor-based diff matches renderRoundCountdown.
    const diffMs = (match ? new Date(match.unlockDate) : state.meetupDate) - Date.now();
    const daysLeft = Math.max(0, Math.floor(diffMs / 86400000));

    const otherEsc = R._esc(state.OTHER || 'Partner');
    const partnerHasWritten = !!(otherLetter && otherLetter.content);
    const writtenPill = myLetter && myLetter.content
      ? '<span class="us-letter-pill us-letter-pill-written">Written</span>'
      : '<span class="us-letter-pill us-letter-pill-muted">Not written</span>';
    let partnerPill;
    if(!partnerHasWritten){
      partnerPill = '<span class="us-letter-pill us-letter-pill-muted">Not written</span>';
    } else if(unlocked){
      partnerPill = '<span class="us-letter-pill us-letter-pill-written">Unlocked</span>';
    } else if(daysLeft === 0){
      partnerPill = '<span class="us-letter-pill us-letter-pill-muted">Unlocks today</span>';
    } else {
      partnerPill = `<span class="us-letter-pill us-letter-pill-muted">Unlocks in ${daysLeft}d</span>`;
    }

    const partnerDim = unlocked && partnerHasWritten ? '' : ' us-letter-row-dim';
    const dateEsc = R._esc(fmtDate);

    rowsEl.innerHTML = `
      <div class="us-letter-row" onclick="showPage('letter')">
        <div class="us-letter-icon">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M2 6l6 4 6-4"/></svg>
        </div>
        <div class="us-letter-body">
          <div class="us-letter-title">Your letter</div>
          <div class="us-letter-sub">Delivers ${dateEsc} · ${writtenPill}</div>
        </div>
        <span class="us-letter-chev">›</span>
      </div>
      <div class="us-letter-row${partnerDim}" onclick="showPage('letter')">
        <div class="us-letter-icon">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M2 6l6 4 6-4"/></svg>
        </div>
        <div class="us-letter-body">
          <div class="us-letter-title">${otherEsc}'s letter</div>
          <div class="us-letter-sub">Unlocks ${dateEsc} · ${partnerPill}</div>
        </div>
        <span class="us-letter-chev">›</span>
      </div>
    `;
    wrap.style.display = 'block';
  }, { onlyOnce: true });
}

function resetUsLetterShortcut(){
  // Invalidate any in-flight read so a late-resolving onlyOnce from the
  // previous user can't paint stale rows into the next user's DOM.
  _letterShortcutSeq++;
  const wrap = document.getElementById('us-letters-wrap');
  const rowsEl = document.getElementById('us-letter-rows');
  if(wrap) wrap.style.display = 'none';
  if(rowsEl) rowsEl.innerHTML = '';
}


// ── Register for cross-module access ─────────────────────
R.isUnlocked = isUnlocked;
R.renderLetterTimeline = renderLetterTimeline;
R.renderLetterTile = renderLetterTile;
R.renderRoundCountdown = renderRoundCountdown;
R.renderCurrentRound = renderCurrentRound;
R._startLetterCountdown = _startLetterCountdown;
R._stopLetterCountdown = _stopLetterCountdown;
R.renderUsLetterShortcut = renderUsLetterShortcut;
R.resetUsLetterShortcut = resetUsLetterShortcut;

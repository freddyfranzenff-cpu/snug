// ── Contextual tooltips ─────────────────────────────────
// Self-contained: exposes window.showTooltip / window.closeTooltip globals.
// Single shared bottom sheet (#tooltip-overlay / #tooltip-sheet).
import { state } from './state.js';
import { R } from './registry.js';

const TOOLTIPS = {
  'pulse': {
    title: 'Pulse',
    icon: `<svg viewBox="0 0 32 30" fill="#c8553a"><path d="M16 28C14 26 2 19 2 10.5A7.5 7.5 0 0116 15a7.5 7.5 0 0114-4.5C30 19 18 26 16 28z"/></svg>`,
    text: `Tap the heart to send your partner a quiet nudge — they'll get a notification saying you were thinking of them. No message needed, just a little heartbeat across the distance.`
  },
  'right-now': {
    title: 'Right now',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="#c8553a" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>`,
    text: `Shows both your local times, weather, and how far apart you are right now. It updates automatically when either of you opens the app.`
  },
  'status': {
    title: 'Status',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="#c8553a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`,
    text: `Share what you're up to right now — pick an activity and how you're feeling. Your partner sees it instantly, and you can update it whenever something changes. Old statuses fade automatically after 8 hours.`
  },
  'tonights-mood': {
    title: "Tonight's Mood",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="#c8553a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`,
    text: `Each of you secretly picks your vibe for the evening — cosy, adventurous, hungry, and more. Once both of you have picked, the result is revealed together with a suggestion for what to do.`
  },
  'countdown-ldr': {
    title: 'Next meetup',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="#c8553a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    text: `Counts down to your next meetup. Tap 'Set date' to pick a date. Letters you write to each other unlock automatically on that day.`
  },
  'countdown-together': {
    title: 'Next date night',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="#c8553a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    text: `Counts down to your next date night. In Open mode you both plan it together. In Mystery mode one of you plans a surprise and drops hints for the other to guess — the full plan is only revealed when you choose.`
  },
  'memory-jar': {
    title: 'Memory jar',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="#c8553a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3h8l1 4H7L8 3z"/><path d="M7 7v13a1 1 0 001 1h8a1 1 0 001-1V7"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`,
    text: `A place for one small moment each, every day. Both of your entries stay hidden until you've each written — no peeking early. Come back daily to keep your streak alive.`
  },
  'letters': {
    title: 'Letters',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="#c8553a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 7 9-7"/></svg>`,
    text: `Write a private letter to each other that stays sealed until your meetup or date night. Neither of you can read the other's letter until the countdown hits zero — it's a little time capsule for the moment you're together.`
  },
  'bucket': {
    title: 'Bucket list',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="#c8553a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21C12 21 3 15 3 9a5 5 0 0110 0 5 5 0 0110 0c0 6-9 12-9 12z"/></svg>`,
    text: `Your shared dream list — trips you want to take, things you want to try, anything you want to do together. Add dreams anytime, mark them done as you go.`
  },
  'milestones': {
    title: 'Milestones',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="#c8553a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>`,
    text: `Your shared timeline of everything that's mattered. Add a date, a note, and optionally a photo or location — it all gets pinned to your story in the order it happened.`
  },
  'places': {
    title: 'Places',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="#c8553a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a7 7 0 017 7c0 5-7 13-7 13S5 14 5 9a7 7 0 017-7z"/><circle cx="12" cy="9" r="2.5"/></svg>`,
    text: `A map that builds itself from your milestones. Any milestone with a location attached gets pinned here, grouped by place. You can see every spot you've shared together.`
  },
  'snugshot': {
    title: 'Snugshot',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="#c8553a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16l-7-13-7 13"/><path d="M3 12h18"/></svg>`,
    text: `A weekly or monthly digest of your activity together — how many pulses sent, memory jar entries written, status updates, and in Together mode how often your evening moods matched. Switch between this week and this month at the top.`
  },
  'relationship-type': {
    title: 'Relationship type',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="#c8553a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>`,
    text: `Choose Long distance if you and your partner live apart — you'll see each other's clocks, weather, and how far away you are. Choose Together if you live in the same place — you'll get the date night planner and Tonight's Mood ritual instead. You can switch anytime without losing any data.`
  },
};

window.showTooltip = function(id){
  const t = TOOLTIPS[id];
  if(!t) return;
  const title = document.getElementById('tooltip-title');
  const body = document.getElementById('tooltip-body');
  const overlay = document.getElementById('tooltip-overlay');
  if(!title || !body || !overlay) return;
  title.textContent = t.title;
  body.textContent = t.text;
  const nav = document.getElementById('bottom-nav');
  if(nav) nav.style.display = 'none';
  overlay.classList.add('open');
  if(R._initSheetSwipe && window.closeTooltip){
    R._initSheetSwipe('tooltip-sheet', 'tooltip-overlay', window.closeTooltip);
  }
};

window.closeTooltip = function(){
  const overlay = document.getElementById('tooltip-overlay');
  if(overlay) overlay.classList.remove('open');
  const nav = document.getElementById('bottom-nav');
  if(nav) nav.style.display = 'flex';
};

// ── Countdown info button ──────────────────────────────
// The label text in #us-countdown-label is rewritten by applyMode() via
// .textContent, so we re-inject the button after every mode switch.
function _injectCountdownInfoBtn(){
  const label = document.getElementById('us-countdown-label');
  if(!label) return;
  // Read text from current label (applyMode writes via textContent and wipes children)
  let txt = (label.textContent || '').trim();
  if(!txt) txt = state.coupleType === 'together' ? 'Next date night' : 'Next meetup';
  const id = state.coupleType === 'together' ? 'countdown-together' : 'countdown-ldr';
  label.innerHTML = `<span>${txt}</span><button class="info-btn" aria-label="About this feature" onclick="showTooltip('${id}')">i</button>`;
  label.style.justifyContent = 'flex-start';
}

// Wrap R.applyMode so the countdown button is re-injected after each switch.
function _wrapApplyMode(){
  const orig = R.applyMode;
  if(!orig || orig._tooltipWrapped) return;
  const wrapped = function(type){
    const r = orig.apply(this, arguments);
    try { _injectCountdownInfoBtn(); } catch(e){}
    return r;
  };
  wrapped._tooltipWrapped = true;
  R.applyMode = wrapped;
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', ()=>{ _injectCountdownInfoBtn(); _wrapApplyMode(); });
} else {
  _injectCountdownInfoBtn();
  _wrapApplyMode();
}

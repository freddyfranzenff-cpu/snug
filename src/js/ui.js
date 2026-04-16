import { state } from './state.js';
import { R } from './registry.js';

// Legacy pages now live inside their panels — just call special inits
function _hideLegacyPages(){} // no-op: panels handle visibility via .active class

function _initMemoriesPage(tab){
  if(tab==='places'){
    setTimeout(()=>{
      if(state.db&&state.fbOnValue){
        state.fbOnValue(state.dbRef(state.db,`couples/${state.coupleId}/milestones`),snap=>{
          const d=snap.val();
          const items=d?Object.entries(d).map(([k,v])=>({...v,_key:k})):[];
          window._initPlacesPage(items);
        },{onlyOnce:true});
      } else { window._initPlacesPage([...state.localMilestones]); }
      if(state.placesMapInstance)state.placesMapInstance.invalidateSize();
    },100);
  } else if(tab==='jar'){
    R.renderMemoryJarPage&&R.renderMemoryJarPage();
    R._mjRenderHistory&&R._mjRenderHistory();
  }
}

function _initTogetherPage(tab){
  if(tab==='letter') window.initLetterPage(R._startLetterCountdown);
}

function _initAccountPage(tab){
  if(tab === 'notifications'){
    R.initNotificationPrefs && R.initNotificationPrefs();
    return;
  }
  window.openSettingsPage&&window.openSettingsPage();
}

// Tooltip id per page+sub-tab — keeps the page-header info button in sync
const _pageTabTooltipId = {
  memories: { milestones: 'milestones', places: 'places', jar: 'memory-jar' },
  together: { bucket: 'bucket', letter: 'letters' }
};

window.switchPageTab = function(page, tab){
  // Hide any currently visible legacy pages before switching
  R._hideLegacyPages&&R._hideLegacyPages();
  // Update tab pills
  const allTabs = document.querySelectorAll(`[id^="${page}-tab-"]`);
  allTabs.forEach(t=>t.classList.toggle('active', t.id===`${page}-tab-${tab}`));
  // Update panels
  const allPanels = document.querySelectorAll(`[id^="${page}-panel-"]`);
  allPanels.forEach(p=>{
    const isActive = p.id===`${page}-panel-${tab}`;
    p.classList.toggle('active', isActive);
    if(isActive) p.scrollTop = 0;
  });
  // Update page-header info button to match active sub-tab
  const infoBtn = document.getElementById(`${page}-info-btn`);
  const tipId = _pageTabTooltipId[page] && _pageTabTooltipId[page][tab];
  if(infoBtn && tipId) infoBtn.dataset.tip = tipId;
  // Init content
  if(R._pageSubContent[page]) R._pageSubContent[page].init(tab);
};

window.showPage=function(name){
  // Map legacy page names to new nav structure
  const legacyMap = {
    milestones:'memories', places:'memories', memory:'memories',
    bucket:'together', letter:'together',
    settings:'account'
  };
  const legacyTab = {
    milestones:'milestones', places:'places', memory:'jar',
    bucket:'bucket', letter:'letter',
    settings:'profile'
  };

  const navName = legacyMap[name] || name;

  // Activate page — only remove active from top-level pages, not legacy pages inside panels
  document.querySelectorAll(".page").forEach(p=>{
    // Don't touch pages inside page-tab-panels — those are legacy content pages
    if(!p.closest('.page-tab-panel')) p.classList.remove("active");
  });
  const pageEl = document.getElementById(`page-${navName}`);
  if(pageEl) pageEl.classList.add("active");

  // Scroll active panel to top
  const activePanel = pageEl && pageEl.querySelector('.page-tab-panel.active, .home-tab-panel.active');
  if(activePanel) activePanel.scrollTop = 0;

  // Activate bottom nav item
  document.querySelectorAll(".bn-item").forEach(n=>n.classList.remove("active"));
  const navEl = document.getElementById(`nav-${navName}`);
  if(navEl) navEl.classList.add("active");

  // If legacy name, switch to right sub-tab
  if(legacyMap[name]){
    window.switchPageTab(navName, legacyTab[name]);
  } else if(R._pageSubContent[name]){
    // First visit to a new nav tab — init default sub-tab
    const def = R._pageSubContent[name].default;
    window.switchPageTab(name, def);
  }

  R._stopLetterCountdown();

  // Hide legacy pages when switching to any top-level page
  R._hideLegacyPages&&R._hideLegacyPages();
};

window.toggleSidebar=function(){};
window.closeSidebar=function(){};


// ── Metric chips ─────────────────────────────────────────────
function updateMetricChips(){
  // Next meetup
  const meetupLabel = document.getElementById('metric-meetup-label');
  const meetupVal   = document.getElementById('metric-meetup-val');
  if(meetupLabel) meetupLabel.textContent = state.coupleType==='together' ? 'Date night' : 'Next meetup';
  if(meetupVal){
    // Date-portion comparison: when the meetup day matches today, show
    // "Today" regardless of the time component (e.g. 00:00 already past).
    if(state.meetupDate){
      const m = state.meetupDate;
      const now = new Date();
      const mMid = new Date(m.getFullYear(), m.getMonth(), m.getDate());
      const tMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dayDiff = Math.round((mMid - tMid) / 86400000);
      if(dayDiff === 0)       meetupVal.textContent = 'Today';
      else if(dayDiff === 1)  meetupVal.textContent = 'Tomorrow';
      else if(dayDiff > 1)    meetupVal.textContent = `${dayDiff}d`;
      else                    meetupVal.textContent = '—';
    } else {
      meetupVal.textContent = '—';
    }
  }
  // Moments (milestone count)
  const momentsVal = document.getElementById('metric-moments-val');
  if(momentsVal) momentsVal.textContent = state.localMilestones.length > 0 ? state.localMilestones.length : '—';
  // Streak
  const streakVal = document.getElementById('metric-streak-val');
  if(streakVal){
    const streakNum = parseInt(document.getElementById('mj-page-streak-num')?.textContent||'0');
    streakVal.textContent = streakNum > 0 ? `${streakNum}d` : '—';
  }
}

// Start UI
function startUI(){
  document.getElementById("locating").style.display="none";
  document.getElementById("main").style.display="flex";
  document.getElementById("bottom-nav").style.display="flex";
  const myL=`${state.ME} · ${state.myCity}`,oL=`${state.OTHER} · ${state.otherCity}`;
  const mhEl=null; // removed: mobile-header-couple-name
  const sbEl=null; // removed: sidebar-couple-name
  if(sbEl) sbEl.innerHTML=`${R._esc(state.ME)} <em>&</em> ${R._esc(state.OTHER)}`;
  const ftEl=document.querySelector('.app-footer-inner');
  if(ftEl) ftEl.textContent=`${state.ME} & ${state.OTHER}`;
  document.querySelectorAll('.app-footer-inner').forEach(el=>el.textContent=`${state.ME} & ${state.OTHER}`);
  // sidebar-user replaced by mode pill
  document.getElementById("my-city").textContent=state.myCity||"—";
  document.getElementById("other-city").textContent=state.otherCity||"—";
  // weather city labels use my-city / other-city
  const dna=document.getElementById("home-dist-name-a");if(dna)dna.textContent=state.ME;
  const dnb=document.getElementById("home-dist-name-b");if(dnb)dnb.textContent=state.OTHER;
  const dnaL=document.getElementById("home-dist-name-a-label");if(dnaL)dnaL.textContent=state.ME;
  const dnbL=document.getElementById("home-dist-name-b-label");if(dnbL)dnbL.textContent=state.OTHER;
  // Populate city names immediately — they update again when coords arrive
  const dca=document.getElementById("home-dist-city-a");if(dca)dca.textContent=state.myCity||"—";
  const dcb=document.getElementById("home-dist-city-b");
  const distEl=document.getElementById("distance-apart");
  if(!state.otherCoords){
    // Partner location not yet loaded — show loading state
    if(dcb){dcb.textContent="Locating…";dcb.classList.add("home-dist-loading");}
    if(distEl){distEl.textContent="—";distEl.parentElement.classList.add("home-dist-loading");}
  } else {
    if(dcb){dcb.textContent=state.otherCity||"—";dcb.classList.remove("home-dist-loading");}
  }
  document.getElementById("home-greeting").innerHTML=R.greeting(state.ME,state.myTz);
  document.getElementById("home-date").textContent=new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
  // Home avatar names
  const avMeName = document.getElementById('home-avatar-me-name');
  const avOtherName = document.getElementById('home-avatar-other-name');
  if(avMeName) avMeName.textContent = state.ME||'—';
  if(avOtherName) avOtherName.textContent = state.OTHER||'—';

  if(state.myCoords&&(state.myCoords[0]||state.myCoords[1]))R.fetchWeather(state.myCoords[0],state.myCoords[1],"my");
  if(state.otherCoords&&(state.otherCoords[0]||state.otherCoords[1]))R.fetchWeather(state.otherCoords[0],state.otherCoords[1],"other");
  if(window._watchOther)window._watchOther();
  R.updateDistanceAndSleep();
  state.distanceInterval=setInterval(R.updateDistanceAndSleep, 60000);
  R.initPulse();
  R.checkMeetupDateInput();
  // ── Persistent real-time listeners ─────────────────────
  if(state.db&&state.fbOnValue){
    R.renderStatusCard&&R.renderStatusCard();
    R.startStatusRefresh&&R.startStatusRefresh();
    // One-time startup calls
    R._mjLoadAndRender&&R._mjLoadAndRender();
    R.applyMode&&R.applyMode(state.coupleType);
    R.loadAvatars&&R.loadAvatars();
    // Milestones
    if(state.unsubMilestones)state.unsubMilestones();
    state.unsubMilestones=state.fbOnValue(state.dbRef(state.db,`couples/${state.coupleId}/milestones`),snap=>{
      const d=snap.val();
      const items=d?Object.entries(d).map(([k,v])=>({...v,_key:k})):[];
      state.localMilestones=[...items];
      R.renderMilestones(items);
      R.updateMetricChips&&R.updateMetricChips();
    });
    // Bucket
    if(state.unsubBucket)state.unsubBucket();
    state.unsubBucket=state.fbOnValue(state.dbRef(state.db,`couples/${state.coupleId}/bucket`),snap=>{
      const d=snap.val();
      const items=d?Object.entries(d).map(([k,v])=>({...v,_key:k})):[];
      state.localBucket=[...items];
      R.renderBucket(items);
      R.updateHomeBucketProgress();
    });
  }
  function tickClocks(){document.getElementById("my-time").textContent=R.fmtTime(state.myTz);document.getElementById("my-date").textContent=R.fmtDate(state.myTz);document.getElementById("other-time").textContent=R.fmtTime(state.otherTz||"UTC");document.getElementById("other-date").textContent=R.fmtDate(state.otherTz||"UTC");}
  tickClocks();state.clockInterval=setInterval(tickClocks,1000);
  if(state.coupleStartDate){
    // Use T12:00:00 to avoid UTC midnight timezone-off-by-one-day issue
    // Use local midnight for day counter so it flips at midnight not noon
    const _sd = state.coupleStartDate.substring(0,10);
    const startMidnight = new Date(_sd+'T00:00:00');
    const todayMidnight = new Date(new Date().toLocaleDateString('en-CA')+'T00:00:00');
    const daysTogether = Math.max(1, Math.floor((todayMidnight-startMidnight)/86400000)+1);
    document.getElementById("days-together").textContent=daysTogether;
    const sinceEl=document.getElementById("couple-since-date");
    // Use T12:00:00 for display only to avoid timezone date shift
    if(sinceEl){ const d=new Date(_sd+'T12:00:00'); sinceEl.textContent=`${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`; }
  }
  if(state.meetupDate)R.updateCdCaption(state.meetupDate);R.startCountdown();
  R.updateMetricChips&&R.updateMetricChips();
  R.updateMetricChips();
}


// ── Page routing ──────────────────────────────────────────
// Maps bottom-nav tab names to the sub-tab that should be activated
const _pageSubContent = {
  memories: { default:'milestones', init: _initMemoriesPage },
  together: { default:'bucket',     init: _initTogetherPage },
  account:  { default:'profile',    init: _initAccountPage  },
};

// ── Register for cross-module access ─────────────────────
R._pageSubContent = _pageSubContent;
R._hideLegacyPages = _hideLegacyPages;
R._initMemoriesPage = _initMemoriesPage;
R._initTogetherPage = _initTogetherPage;
R._initAccountPage = _initAccountPage;
R.updateMetricChips = updateMetricChips;
R.startUI = startUI;

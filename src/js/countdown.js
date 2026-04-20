import { state } from './state.js';
import { R } from './registry.js';

function updateCdCaption(date){if(!date)return;const s=date.toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"});const cdCap=document.getElementById("cd-caption");if(cdCap)cdCap.textContent=s;}

// Date input is now handled by openDnPickerSheet (bottom sheet picker) in both
// LDR and Together modes. No native input to sync.
function checkMeetupDateInput(){ R._syncDnPickerBtn && R._syncDnPickerBtn(); }

// Countdown
function startCountdown(){
  if(state.countdownInterval)clearInterval(state.countdownInterval);
  function tick(){
    if(!state.meetupDate){
      ["cd-d","cd-h","cd-m","cd-s"].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent="—";});
      const cc=document.getElementById("cd-caption");if(cc)cc.textContent=state.coupleType==='together'?'Set your next date night 🗓️':'Set your next meetup date 🗓️';
      // scd-caption removed (was sidebar)
      return;
    }
    const diff=state.meetupDate-Date.now();
    const isPast=diff<=0;
    // Main countdown on home page
    const cdCaption=document.getElementById("cd-caption");
    if(isPast){
      ["cd-d","cd-h","cd-m","cd-s"].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent="—";});
      if(cdCaption)cdCaption.textContent=state.coupleType==='together'?'Set your next date night 🗓️':'Set your next meetup date 🗓️';
      // Sidebar countdown
      // scd-* removed (was sidebar)
    } else {
      const d=Math.floor(diff/86400000),h=Math.floor((diff%86400000)/3600000),m=Math.floor((diff%3600000)/60000),s=Math.floor((diff%60000)/1000);
      ["cd-d","cd-h","cd-m","cd-s"].forEach((id,i)=>{
        const el=document.getElementById(id);
        if(el)el.textContent=[d,h,m,s][i];
      });
      if(cdCaption)cdCaption.textContent=state.meetupDate?state.meetupDate.toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"}):(state.coupleType==='together'?'Set your next date night 🗓️':'Set your next meetup date 🗓️');
    }
  }
  tick();
  state.countdownInterval=setInterval(tick,1000);
  // Update metric chip every 60s so day count stays in sync
  if(state._metricInterval) clearInterval(state._metricInterval);
  state._metricInterval = setInterval(()=>R.updateMetricChips&&R.updateMetricChips(), 5000);
}

// Greeting
function greeting(name,tz){try{const h=parseInt(new Date().toLocaleTimeString("en-GB",{timeZone:tz,hour:"2-digit"}));const g=h<12?"Good morning":h<18?"Good afternoon":"Good evening";return`${g}, <em>${R._esc(name)}</em>`;}catch(e){return`Good day, <em>${R._esc(name)}</em>`;}}
function fmtTime(tz){try{return new Date().toLocaleTimeString("en-GB",{timeZone:tz,hour:"2-digit",minute:"2-digit",second:"2-digit"});}catch(e){return new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",second:"2-digit"});}}
function fmtDate(tz){try{return new Date().toLocaleDateString("en-GB",{timeZone:tz,weekday:"long",day:"numeric",month:"long"});}catch(e){return new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"});}}

// Distance between two coords (Haversine)
function calcDistance(lat1,lon1,lat2,lon2){
  const R=6371,dLat=(lat2-lat1)*Math.PI/180,dLon=(lon2-lon1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return Math.round(R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)));
}

function updateDistanceAndSleep(){
  // Distance
  if(state.myCoords&&state.otherCoords&&(state.myCoords[0]||state.myCoords[1])&&(state.otherCoords[0]||state.otherCoords[1])){
    const km=R.calcDistance(state.myCoords[0],state.myCoords[1],state.otherCoords[0],state.otherCoords[1]);
    const el=document.getElementById("distance-apart");
    if(el)el.textContent=km.toLocaleString("en-GB");
    // Update city names in flight strip
    const ca=document.getElementById("home-dist-city-a");
    const cb=document.getElementById("home-dist-city-b");
    if(ca&&state.myCoords)ca.textContent=state.myCity||"Here";
    if(cb&&state.otherCoords)cb.textContent=state.otherCity||"There";
  }
  // Sleep indicators
  function sleepStatus(name,tz){
    const h=parseInt(new Date().toLocaleTimeString("en-GB",{timeZone:tz,hour:"2-digit"}));
    const isAsleep=h>=23||h<7;
    const isMorning=h>=7&&h<9;
    const icon=isAsleep?"🌙":isMorning?"🌅":"☀️";
    const status=isAsleep?"probably asleep":isMorning?"just waking up":"awake";
    return`${icon} ${name} is ${status}`;
  }
  const myEl=document.getElementById("sleep-my");
  const otherEl=document.getElementById("sleep-other");
  if(myEl)myEl.textContent=sleepStatus(state.ME,state.myTz);
  // Only show partner sleep status if we have their actual timezone
  if(otherEl)otherEl.textContent=state.otherTz?sleepStatus(state.OTHER,state.otherTz):"";
}


// ── Register for cross-module access ─────────────────────
R.updateCdCaption = updateCdCaption;
R.checkMeetupDateInput = checkMeetupDateInput;
R.startCountdown = startCountdown;
R.greeting = greeting;
R.fmtTime = fmtTime;
R.fmtDate = fmtDate;
R.calcDistance = calcDistance;
R.updateDistanceAndSleep = updateDistanceAndSleep;

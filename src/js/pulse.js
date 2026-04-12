import { state } from './state.js';
import { R } from './registry.js';


// Pulse
function fmtPulseTime(ts){
  if(!ts)return"";
  const diff=Date.now()-ts;
  const mins=Math.floor(diff/60000);
  const hrs=Math.floor(diff/3600000);
  const days=Math.floor(diff/86400000);
  if(mins<1)return"Just now";
  if(mins<60)return`${mins} minute${mins!==1?"s":""} ago`;
  if(hrs<24)return`${hrs} hour${hrs!==1?"s":""} ago`;
  return`${days} day${days!==1?"s":""} ago`;
}

function fmtPulseTs(ts){
  if(!ts)return"";
  const d=new Date(ts);
  const p=n=>String(n).padStart(2,"0");
  const today=new Date();
  const yesterday=new Date(today-86400000);
  const isToday=d.toDateString()===today.toDateString();
  const isYesterday=d.toDateString()===yesterday.toDateString();
  const timeStr=`${p(d.getHours())}:${p(d.getMinutes())}`;
  if(isToday)return`Today ${timeStr}`;
  if(isYesterday)return`Yesterday ${timeStr}`;
  return`${p(d.getDate())}.${p(d.getMonth()+1)} · ${timeStr}`;
}

function renderPulseHistory(pulses){
  const list=document.getElementById("pulse-history-list");
  const toggle=document.getElementById("pulse-history-toggle");
  if(!pulses||!pulses.length){
    if(toggle)toggle.style.display="none";
    return;
  }
  if(toggle)toggle.style.display="block";
  const recent=pulses.slice(0,6);
  list.innerHTML=recent.map(p=>{
    const isMe=p.from===state.myUid||p.from===state.ME;
    const dotClass=isMe?"":"other";
    const senderName=R._esc(p.fromName||(isMe?state.ME:state.OTHER));
    const otherEsc=R._esc(state.OTHER);
    const text=isMe
      ?`You were thinking of <strong>${otherEsc}</strong>`
      :`<strong>${senderName}</strong> was thinking of you`;
    return`<div class="pulse-history-item">
      <div class="pulse-history-dot ${dotClass}"></div>
      <span class="pulse-history-text">${text}</span>
      <span class="pulse-history-time">${R.fmtPulseTs(p.time)}</span>
    </div>`;
  }).join("");
}

function updateReceivedBanner(pulses){
  if(!pulses||!pulses.length)return;
  // Find latest pulse FROM the other person
  const latest=pulses.find(p=>p.from===state.partnerUid||p.from===state.OTHER);
  if(!latest)return;
  const banner=document.getElementById("pulse-received-now");
  const titleEl=document.getElementById("pulse-received-title");
  const timeEl=document.getElementById("pulse-received-time");
  if(banner){
    if(titleEl) titleEl.textContent=`${state.OTHER} was thinking of you`;
    if(timeEl) timeEl.textContent=R.fmtPulseTime(latest.time);
    banner.style.display="flex";
  }
}

function updateLastSent(pulses){
  if(!pulses||!pulses.length)return;
  const latest=pulses.find(p=>p.from===state.myUid||p.from===state.ME);
  if(!latest)return;
  const el=document.getElementById("pulse-last-sent");
  if(el){
    el.style.display="block";
    el.textContent=`Last · ${R.fmtPulseTs(latest.time)}`;
  }
}

window.sendPulse=async function(){
  const now = Date.now();
  if(now - state._lastPulseSent < 60000){
    const secs = Math.ceil((60000-(now-state._lastPulseSent))/1000);
    return;
  }
  state._lastPulseSent = now;
  if(!state.ME)return;
  const btn=document.getElementById("pulse-heart-btn-now");
  if(btn){btn.classList.add("sent");setTimeout(()=>btn.classList.remove("sent"),300);}
  const pulse={from:state.myUid,to:state.partnerUid,fromName:state.ME,time:Date.now()};
  if(state.db&&state.dbPush){
    try{
      await state.dbPush(state.dbRef(state.db,`couples/${state.coupleId}/pulses`),pulse);
      R.notifyPartner && R.notifyPartner('pulse');
    }catch(e){
      console.error('sendPulse failed:',e);
    }
  } else {
    const el=document.getElementById("pulse-last-sent");
    if(el){el.style.display="block";el.textContent="Last · Just now";}
  }
};

window.togglePulseHistory=function(){
  const list=document.getElementById("pulse-history-list");
  const toggle=document.getElementById("pulse-history-toggle");
  if(!list||!toggle)return;
  list.classList.toggle("open");
  toggle.textContent=list.classList.contains("open")?"Hide recent pulses ↑":"Show recent pulses ↓";
};

function initPulse(){
  // Set other name in send sub
  const sub=document.getElementById("pulse-other-name");
  if(sub)sub.textContent=state.OTHER;
  const subName=document.getElementById("pulse-row-sub-name");
  if(subName)subName.textContent=state.OTHER||'Your partner';
  // Fill every `.partner-name-slot` / `.mj-other-name-slot` with the partner's display name.
  document.querySelectorAll('.partner-name-slot, .mj-other-name-slot').forEach(el=>{
    el.textContent = state.OTHER || 'your partner';
  });

  if(!state.db||!state.fbOnValue)return;
  if(state.unsubPulse)state.unsubPulse();
  state.unsubPulse=state.fbOnValue(state.dbRef(state.db,`couples/${state.coupleId}/pulses`),snap=>{
    const data=snap.val();
    if(!data)return;
    const pulses=Object.values(data).sort((a,b)=>b.time-a.time);
    R.updateReceivedBanner(pulses);
    R.updateLastSent(pulses);
    R.renderPulseHistory(pulses);
    // Update received time every minute
    if(state.pulseTimeInterval)clearInterval(state.pulseTimeInterval);
    state.pulseTimeInterval=setInterval(()=>{
      const latest=pulses.find(p=>p.from===state.partnerUid||p.from===state.OTHER);
      if(latest){
        const timeEl2=document.getElementById("pulse-received-time");
        if(timeEl2) timeEl2.textContent=R.fmtPulseTime(latest.time);
      }
    },60000);
  });
}


// ── Register for cross-module access ─────────────────────
R.fmtPulseTime = fmtPulseTime;
R.fmtPulseTs = fmtPulseTs;
R.renderPulseHistory = renderPulseHistory;
R.updateReceivedBanner = updateReceivedBanner;
R.updateLastSent = updateLastSent;
R.initPulse = initPulse;

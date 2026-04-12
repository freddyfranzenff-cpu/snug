import { state } from './state.js';
import { R } from './registry.js';

// Location
async function tzFromCoords(lat,lng){try{const ac=new AbortController();const t=setTimeout(()=>ac.abort(),5000);const r=await fetch(`https://timeapi.io/api/timezone/coordinate?latitude=${lat}&longitude=${lng}`,{signal:ac.signal});clearTimeout(t);return(await r.json()).timeZone||null;}catch{return null;}}
async function cityFromCoords(lat,lng){try{const ac=new AbortController();const t=setTimeout(()=>ac.abort(),5000);const r=await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,{signal:ac.signal});clearTimeout(t);const j=await r.json();return j.address?.city||j.address?.town||j.address?.village||j.address?.county||null;}catch{return null;}}
async function detectMyLocation(){return new Promise(res=>{if(!navigator.geolocation){res({tz:null,city:null,lat:null,lng:null});return;}navigator.geolocation.getCurrentPosition(async({coords:{latitude:lat,longitude:lng}})=>{const[tz,city]=await Promise.all([R.tzFromCoords(lat,lng),R.cityFromCoords(lat,lng)]);res({tz,city,lat,lng});},()=>res({tz:null,city:null,lat:null,lng:null}),{timeout:8000});});}
async function detectAndStart(){
  try{
    const{tz,city,lat,lng}=await R.detectMyLocation();
    state.myTz=tz||Intl.DateTimeFormat().resolvedOptions().timeZone||"UTC";
    state.myCity=city||"—";
    state.myCoords=(lat&&lng)?[lat,lng]:null;
    // Only push presence if we have real coordinates — don't push [0,0]
    if(state.myCoords&&window._pushPresence)window._pushPresence(state.myTz,state.myCity,state.myCoords[0],state.myCoords[1]);
    // Leave partner data null — _watchOther populates from Firebase
    R.startUI();
  }catch(e){
    console.error('detectAndStart failed:',e);
    state.myTz=state.myTz||"UTC";state.myCity=state.myCity||"—";
    R.startUI();
  }
}


// ── Register for cross-module access ─────────────────────
R.tzFromCoords = tzFromCoords;
R.cityFromCoords = cityFromCoords;
R.detectMyLocation = detectMyLocation;
R.detectAndStart = detectAndStart;

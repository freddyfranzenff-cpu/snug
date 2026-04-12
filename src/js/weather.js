import { state } from './state.js';
import { R } from './registry.js';

// Weather
function wIcon(c){
  // WMO codes (0–99) from open-meteo used on localhost
  if(c===0)return"☀️";if(c===1||c===2)return"⛅";if(c===3)return"☁️";
  if(c===45||c===48)return"🌫️";
  if(c===51||c===53||c===55||c===56||c===57)return"🌦️";
  if(c===61||c===63||c===65||c===66||c===67||c===80||c===81||c===82)return"🌧️";
  if(c===71||c===73||c===75||c===77||c===85||c===86)return"❄️";
  if(c===95)return"⛈️";if(c===96||c===99)return"⛈️";
  // wttr.in codes
  if(c===113)return"☀️";if(c===116)return"⛅";if(c===119||c===122)return"☁️";
  if(c===143||c===248||c===260)return"🌫️";
  if(c===176||c===263||c===266||c===293||c===296)return"🌦️";
  if(c===299||c===302||c===305||c===308||c===353||c===356||c===359)return"🌧️";
  if(c===179||c===227||c===230||c===320||c===323||c===326||c===329||c===332||c===335||c===338||c===368||c===371)return"❄️";
  if(c===182||c===185||c===281||c===284||c===311||c===314||c===317||c===362||c===365)return"🌨️";
  if(c===200||c===386||c===389||c===392||c===395)return"⛈️";
  if(c===350||c===374||c===377)return"🌨️";
  return"⛅";
}
function wDesc(c){
  // WMO codes (open-meteo / localhost)
  if(c===0)return"Clear sky";if(c===1)return"Mainly clear";if(c===2)return"Partly cloudy";if(c===3)return"Overcast";
  if(c===45||c===48)return"Foggy";
  if(c===51||c===53||c===55)return"Drizzle";if(c===56||c===57)return"Freezing drizzle";
  if(c===61||c===63)return"Light rain";if(c===65)return"Heavy rain";
  if(c===66||c===67)return"Freezing rain";
  if(c===71||c===73)return"Light snow";if(c===75)return"Heavy snow";if(c===77)return"Snow grains";
  if(c===80||c===81)return"Rain showers";if(c===82)return"Heavy showers";
  if(c===85||c===86)return"Snow showers";
  if(c===95)return"Thunderstorm";if(c===96||c===99)return"Thunderstorm with hail";
  // wttr.in codes
  if(c===113)return"Clear sky";if(c===116)return"Partly cloudy";if(c===119)return"Cloudy";if(c===122)return"Overcast";
  if(c===143||c===248||c===260)return"Foggy";
  if(c===176||c===263||c===266||c===293||c===296)return"Light rain";
  if(c===299||c===302||c===305||c===308)return"Rain";
  if(c===353||c===356||c===359)return"Rain showers";
  if(c===179||c===323||c===326)return"Light snow";
  if(c===227||c===230||c===329||c===332||c===335||c===338)return"Snow";
  if(c===368||c===371)return"Snow showers";
  if(c===182||c===185||c===281||c===284||c===311||c===314||c===317)return"Sleet";
  if(c===200||c===386||c===389)return"Thunderstorm";
  if(c===392||c===395)return"Thundery snow";
  if(c===350||c===374||c===377)return"Ice pellets";
  return"—";
}
async function fetchWeather(lat,lng,prefix){try{// Use Vercel proxy in production to avoid CORS; direct on localhost
  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const weatherUrl = isLocal
    ? `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weathercode,windspeed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`
    : `/api/weather?lat=${lat}&lng=${lng}`;
  const r=await fetch(weatherUrl,{cache:'no-store'});const j=await r.json();const temp=Math.round(j.current.temperature_2m),code=j.current.weathercode,wind=Math.round(j.current.windspeed_10m),high=Math.round(j.daily.temperature_2m_max[0]),low=Math.round(j.daily.temperature_2m_min[0]);const _wi=document.getElementById(`${prefix}-weather-icon`);const _wt=document.getElementById(`${prefix}-weather-temp`);const _wd=document.getElementById(`${prefix}-weather-desc`);const _wdt=document.getElementById(`${prefix}-weather-details`);if(_wi)_wi.textContent=R.wIcon(code);if(_wt)_wt.textContent=`${temp}°`;if(_wd)_wd.textContent=R.wDesc(code);if(_wdt)_wdt.textContent=`H ${high}°  L ${low}°  Wind ${wind} km/h`;}catch(e){const _wt2=document.getElementById(`${prefix}-weather-temp`);if(_wt2)_wt2.textContent='—';}}

// Map

// ── Register for cross-module access ─────────────────────
R.wIcon = wIcon;
R.wDesc = wDesc;
R.fetchWeather = fetchWeather;
R.initMap = initMap;
R.updateOtherMarker = updateOtherMarker;

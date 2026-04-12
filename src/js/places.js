import { state } from './state.js';
import { R } from './registry.js';

// Places we've been
const TAG_ICONS_PLACES = {first:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e8622a" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4" fill="rgba(232,98,42,0.15)"/><path d="M9 12l-2 9 5-3 5 3-2-9"/></svg>`,moment:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e8622a" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/><circle cx="12" cy="12" r="4"/></svg>`,memory:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e8622a" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3"/><path d="M7 6V5a1 1 0 011-1h2M14 5a1 1 0 011 1v1"/><circle cx="17" cy="9" r="1" fill="#e8622a"/></svg>`,milestone:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e8622a" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>`,future:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e8622a" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16l-7-13-7 13"/><path d="M3 12h18"/><path d="M7 16l1 5h8l1-5"/></svg>`};

function buildPlaces(milestones){
  // Filter only milestones with lat/lng
  const located = milestones.filter(m => m.lat && m.lng);

  // Update stats
  const placesCountEl = document.getElementById("places-count");
  const countriesCountEl = document.getElementById("countries-count");
  const memoriesCountEl = document.getElementById("places-memories-count");
  const emptyEl = document.getElementById("places-empty");
  const chipsLabel = document.getElementById("places-chips-label");

  if(!located.length){
    if(placesCountEl) placesCountEl.textContent = "0";
    if(countriesCountEl) countriesCountEl.textContent = "0";
    if(memoriesCountEl) memoriesCountEl.textContent = "0";
    if(emptyEl) emptyEl.style.display = "block";
    if(chipsLabel) chipsLabel.style.display = "none";
    return;
  }

  if(emptyEl) emptyEl.style.display = "none";
  if(chipsLabel) chipsLabel.style.display = "block";
  if(memoriesCountEl) memoriesCountEl.textContent = located.length;

  // Group by location (round to 2 decimal places ~1km)
  const groups = {};
  located.forEach(m => {
    const key = `${Math.round(m.lat*100)/100},${Math.round(m.lng*100)/100}`;
    if(!groups[key]) groups[key] = {lat:m.lat, lng:m.lng, name:m.locationDisplay||m.location, items:[]};
    groups[key].items.push(m);
  });

  const groupArr = Object.values(groups);
  if(placesCountEl) placesCountEl.textContent = groupArr.length;

  // Count unique countries using ISO country code (reliable)
  const countries = new Set(
    groupArr.flatMap(g => g.items.map(i => i.countryCode||i.country||(i.locationDisplay||i.location||"").split(",").pop().trim()))
             .filter(Boolean)
  );
  if(countriesCountEl) countriesCountEl.textContent = countries.size||groupArr.length;

  // Build map
  R.buildPlacesMap(groupArr);

  // Build chips
  const chipsEl = document.getElementById("places-chips");
  if(chipsEl){
    chipsEl.innerHTML = groupArr.map(g =>
      `<div class="places-chip${g.items.length>1?' multi':''}" onclick="showPlacesPopup(${JSON.stringify(g.lat)},${JSON.stringify(g.lng)})">
        <div class="places-chip-dot${g.items.length>1?' multi':''}"></div>
        <span class="places-chip-name">${g.name||"Unknown"}</span>
        <span class="places-chip-count">${g.items.length}</span>
      </div>`
    ).join("");
  }
}

function buildPlacesMap(groups){
  if(state.placesMapInstance){ state.placesMapInstance.remove(); state.placesMapInstance = null; }

  const el = document.getElementById("places-map");
  if(!el) return;

  // Center map on midpoint of all pins
  const lats = groups.map(g=>g.lat), lngs = groups.map(g=>g.lng);
  const centerLat = (Math.min(...lats)+Math.max(...lats))/2;
  const centerLng = (Math.min(...lngs)+Math.max(...lngs))/2;

  state.placesMapInstance = L.map("places-map", {zoomControl:true, attributionControl:true, minZoom:2, worldCopyJump:false})
    .setView([centerLat, centerLng], 2);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution:"© OpenStreetMap", subdomains:"abcd", maxZoom:18
  }).addTo(state.placesMapInstance);

  // Draw pins
  groups.forEach(g => {
    const isMulti = g.items.length > 1;
    const color = "#e8622a";
    const size = isMulti ? 24 : 20;

    const badgeHTML = isMulti
      ? `<div style="position:absolute;top:-5px;right:-5px;background:white;border:1.5px solid ${color};border-radius:50%;width:16px;height:16px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;color:${color};font-family:'Plus Jakarta Sans',sans-serif;">${g.items.length}</div>`
      : "";

    // Heart SVG path scaled to size
    const heartPath = `M${size/2} ${size*0.88} S${size*0.07} ${size*0.58} ${size*0.07} ${size*0.33} a${size*0.22} ${size*0.22} 0 0 1 ${size*0.43} ${size*0.12} a${size*0.22} ${size*0.22} 0 0 1 ${size*0.43} -${size*0.12} c0 ${size*0.25} -${size*0.43} ${size*0.55} -${size*0.43} ${size*0.55}z`;

    const icon = L.divIcon({
      className: "",
      html: `<div style="position:relative;width:${size}px;height:${size}px;">
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M${size/2} ${size*0.9} C${size/2} ${size*0.9} ${size*0.06} ${size*0.58} ${size*0.06} ${size*0.33} a${size*0.22} ${size*0.22} 0 0 1 ${size*0.44} -${size*0.05} a${size*0.22} ${size*0.22} 0 0 1 ${size*0.44} ${size*0.05} C${size*0.94} ${size*0.58} ${size/2} ${size*0.9} ${size/2} ${size*0.9}z" fill="${color}"/>
        </svg>
        ${badgeHTML}
      </div>`,
      iconSize: [size+10, size+10],
      iconAnchor: [size/2+5, size*0.9+5]
    });

    const marker = L.marker([g.lat, g.lng], {icon})
      .addTo(state.placesMapInstance)
      .bindTooltip(g.name||"", {
        permanent: false,
        direction: "top",
        offset: [0, -10],
        className: "map-tooltip"
      });

    marker.on("click", () => R.showPlacesPopupData(g));
  });

  // Fit bounds
  if(groups.length > 1){
    state.placesMapInstance.fitBounds(
      L.latLngBounds(groups.map(g=>[g.lat,g.lng])).pad(0.3),
      {maxZoom:5}
    );
  } else if(groups.length===1){
    state.placesMapInstance.setView([groups[0].lat,groups[0].lng], 5);
  }
}

function showPlacesPopupData(group){
  const popup = document.getElementById("places-popup");
  const locName = document.getElementById("places-popup-loc-name");
  const countEl = document.getElementById("places-popup-count");
  const itemsEl = document.getElementById("places-popup-items");

  if(!popup) return;
  popup.style.display = "block";
  locName.textContent = group.name || "Unknown";
  countEl.textContent = `${group.items.length} milestone${group.items.length!==1?"s":""}`;

  const sorted = [...group.items].sort((a,b)=>new Date(a.date)-new Date(b.date));
  itemsEl.innerHTML = sorted.map(item => {
    const icon = R.TAG_ICONS_PLACES[item.tag]||R.TAG_ICONS_PLACES.moment;
    const tag = item.tag ? `<span class="m-tag" style="margin-left:auto;flex-shrink:0;">${R._esc(item.tag)}</span>` : "";
    return `<div class="places-popup-item">
      <div class="places-popup-icon" style="display:flex;align-items:center;justify-content:center;">${icon}</div>
      <div class="places-popup-body" style="flex:1;min-width:0;">
        <p class="places-popup-title">${R._esc(item.title)}</p>
        <p class="places-popup-date">${R.fmtMDate(item.date)}${item.endDate?` – ${R.fmtMDate(item.endDate)}`:""}</p>
      </div>
      ${tag}
    </div>`;
  }).join("");

  popup.scrollIntoView({behavior:"smooth", block:"nearest"});

  // Highlight selected chip
  document.querySelectorAll(".places-chip").forEach(c => c.classList.remove("active"));
}

window.showPlacesPopup = function(lat, lng){
  // Find group by lat/lng
  if(!window._placesGroups) return;
  const group = window._placesGroups.find(g =>
    Math.abs(g.lat-lat) < 0.02 && Math.abs(g.lng-lng) < 0.02
  );
  if(group) R.showPlacesPopupData(group);
};

// Called when Places page is shown — init/refresh map
window._initPlacesPage = function(milestones){
  window._placesGroups = null;
  // Build groups first then store
  const located = milestones.filter(m=>m.lat&&m.lng);
  const groups = {};
  located.forEach(m=>{
    const key=`${Math.round(m.lat*100)/100},${Math.round(m.lng*100)/100}`;
    if(!groups[key]) groups[key]={lat:m.lat,lng:m.lng,name:m.locationDisplay||m.location,items:[]};
    groups[key].items.push(m);
  });
  window._placesGroups = Object.values(groups);
  R.buildPlaces(milestones);
};

// ── Register for cross-module access ─────────────────────
R.TAG_ICONS_PLACES = TAG_ICONS_PLACES;
R.buildPlaces = buildPlaces;
R.buildPlacesMap = buildPlacesMap;
R.showPlacesPopupData = showPlacesPopupData;

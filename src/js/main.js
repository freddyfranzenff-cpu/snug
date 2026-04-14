// ── Entry point ──────────────────────────────────────────
// Pulls in every feature module for its side effects (function registrations),
// then bootstraps the app.

import './app-height.js';
import './sw-register.js';
import './state.js';
import { R } from './registry.js';

// Feature modules — order matters only for side-effect visibility (logging).
// Cross-module calls go through R.*, so import order does NOT affect runtime
// correctness.
import './weather.js';
import './presence.js';
import './milestones.js';
import './countdown.js';
import './bucket.js';
import './places.js';
import './pulse.js';
import './letters.js';
import './memoryjar.js';
import './togethermode.js';
import './tonightsmood.js';
import './summary.js';
import './status.js';
import './avatar.js';
import './settings.js';
import './couple.js';
import './ui.js';
import './notifications.js';
import './auth.js';

// Read ?join=CODE from invite link URL on page load
// and ?page=/?tab= from a cold-start notification click.
(()=>{
  try{
    const params = new URLSearchParams(window.location.search);
    const _j = params.get('join');
    if(_j){
      const _code = _j.toUpperCase();
      sessionStorage.setItem('pendingJoinCode', _code);
      localStorage.setItem('pendingJoinCode', _code);
    }
    const _page = params.get('page');
    const _tab = params.get('tab');
    if(_page){
      sessionStorage.setItem('pendingDeepLink', JSON.stringify({ page: _page, tab: _tab || null }));
    }
    if(_j || _page){
      window.history.replaceState({}, '', window.location.pathname);
    }
  }catch(e){}
})();

// Bootstrap the app
R.tryInitFirebase();

// Auto-retry when connection restored
window.addEventListener('online', ()=>{
  const el = document.getElementById('screen-offline');
  if(el && el.style.display !== 'none') window.location.reload();
});

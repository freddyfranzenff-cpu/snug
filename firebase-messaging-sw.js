// FCM background-message service worker for Snug.
// Must live at origin root so firebase.messaging() picks it up automatically.
//
// Bump CACHE_VERSION-style string if you need to force clients to refresh.
/* eslint-disable no-undef */

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Config is embedded as query params to avoid shipping a separate config file
// that needs env-var substitution inside a static service worker.
const params = new URL(self.location).searchParams;
firebase.initializeApp({
  apiKey:            params.get('apiKey'),
  authDomain:        params.get('authDomain'),
  databaseURL:       params.get('databaseURL'),
  projectId:         params.get('projectId'),
  storageBucket:     params.get('storageBucket'),
  messagingSenderId: params.get('messagingSenderId'),
  appId:             params.get('appId'),
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const n = payload.notification || {};
  const title = n.title || 'Snug';
  const opts = {
    body: n.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: `snug-${payload.data?.trigger || 'msg'}`,
    data: payload.data || {},
  };
  self.registration.showNotification(title, opts);
});

// Map a trigger to a deep link the app can route on.
// The app's URL handler reads ?page=… on load to jump to the right section.
const TRIGGER_ROUTES = {
  pulse:     { page: 'home',      tab: 'now'     },
  status:    { page: 'home',      tab: 'now'     },
  milestone: { page: 'milestones'                },
  bucket:    { page: 'bucket'                    },
  // 'memory' routes via legacyMap → memories page, jar sub-tab
  memoryJar: { page: 'memory'                    },
  meetup:    { page: 'home',      tab: 'summary' },
  dateNight: { page: 'home',      tab: 'summary' },
  dnHint:    { page: 'home',      tab: 'now'     },
  dnGuess:   { page: 'home',      tab: 'now'     },
  dnCorrect: { page: 'home',      tab: 'now'     },
  dnReveal:  { page: 'home',      tab: 'now'     },
  moodPick:  { page: 'home',      tab: 'now'     },
  moodMatch: { page: 'home',      tab: 'now'     },
};

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const trigger = event.notification.data?.trigger;
  const route = TRIGGER_ROUTES[trigger];
  const qs = route
    ? '?' + new URLSearchParams({ page: route.page, ...(route.tab ? { tab: route.tab } : {}) }).toString()
    : '';
  const target = `/${qs}`;
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for(const c of list){
      if('focus' in c){
        // Tell the live page where to jump without a full reload
        try{ c.postMessage({ type: 'snug-notification-click', trigger, route }); }catch(e){}
        return c.focus();
      }
    }
    if(self.clients.openWindow) return self.clients.openWindow(target);
  })());
});

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

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for(const c of list){
        if('focus' in c) return c.focus();
      }
      if(self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});

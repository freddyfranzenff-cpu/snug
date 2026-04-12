    // Register Service Worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js', { scope: '/' })
          .then(reg => {
            console.log('[App] SW registered, scope:', reg.scope);
            // When a new SW is waiting, activate it immediately
            reg.addEventListener('updatefound', () => {
              const newSW = reg.installing;
              newSW.addEventListener('statechange', () => {
                if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('[App] New version available — activating');
                  newSW.postMessage('SKIP_WAITING');
                }
              });
            });
          })
          .catch(err => console.warn('[App] SW registration failed:', err));
      });
    }

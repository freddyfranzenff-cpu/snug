    // ── App height fix for iOS Safari / PWA ─────────────────
    // 100svh is unreliable on iOS (dynamic toolbar, home indicator).
    // We set --app-height from window.innerHeight which is always accurate.
    // Falls back to 100svh if JS hasn't run yet (CSS variable undefined).
    function _setAppHeight() {
      document.documentElement.style.setProperty('--app-height', window.innerHeight + 'px');
    }
    _setAppHeight();
    window.addEventListener('resize', _setAppHeight);
    // Re-run after orientationchange settles (iOS fires resize before layout is final)
    window.addEventListener('orientationchange', function() {
      setTimeout(_setAppHeight, 100);
    });

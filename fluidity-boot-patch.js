(function fluidityBootPatch() {
  if (window.__fluidityBootPatchInstalled) return;
  window.__fluidityBootPatchInstalled = true;

  const PATCH_VERSION = '1.4.0';
  const LOADER_REMOVE_TIMEOUT_MS    = 180;
  const POST_NAV_SCHEDULE_BLOCK_MS  = 160;
  const PATCH_RETRY_INTERVAL_MS     = 50;
  const PATCH_RETRY_MAX_ATTEMPTS    = 120;

  // NOTE: this file used to inject its own <style> tag here as a
  // "cold-start flash guard" (background-color forced via !important).
  // It's been removed: index.html already has a static, non-JS
  // `html[data-theme="dark"] { background-color: ... }` rule for this,
  // which reacts to theme changes automatically and can never go stale.
  // The JS version could only be un-done by explicitly deleting the
  // injected tag again, which made it fight later in-app theme toggles
  // whenever that cleanup didn't run — this removes that whole class of
  // bug instead of patching it further.

  // ═══════════════════════════════════════════════════════════════
  //  PWA MULTI-RELOAD FIX  (v1.2.0)
  //
  //  Three independent root causes addressed here:
  //
  //  A) bfcache restore (iOS/Android pull-to-refresh):
  //     pageshow with persisted=true fires, the app's restored JS state
  //     triggers burst of render() / scheduleRender() calls.
  //
  //  B) visibilitychange / focus on PWA re-foreground:
  //     Every time a PWA returns from background, iOS fires
  //     visibilitychange(visible) + focus on window. Any listener
  //     (sync timers, auth checks) that calls scheduleRender() inside
  //     these handlers causes a visible flash.
  //
  //  C) Service Worker controllerchange → hard reload:
  //     If the SW calls skipWaiting() on update and index.html has
  //     navigator.serviceWorker.addEventListener('controllerchange',
  //     () => location.reload()), the entire page reloads on every SW
  //     update — causing a full white-screen flash on PWA launch.
  //
  //  D) PWA standalone entry boot burst:
  //     When launching from the home screen, the boot sequence emits
  //     scheduleRender() multiple times in <300ms (localStorage read,
  //     server sync partial data, hashchange restore).  The 80ms
  //     RENDER_MIN_GAP in fluidity-engine is not wide enough to
  //     coalesce all of them into one DOM write.
  //
  //  Solution per cause:
  //  A) pageshow guard (same as v1.1) — 400ms suppression window
  //  B) visibilitychange + focus debounce — 250ms suppression
  //  C) intercept controllerchange before index.html can see it
  //  D) PWA entry lock — single render allowed in first 500ms
  // ═══════════════════════════════════════════════════════════════

  // ── Shared suppression clock ──────────────────────────────────
  let _suppressUntil = 0;
  function _suppress(ms) {
    _suppressUntil = Math.max(_suppressUntil, performance.now() + ms);
  }
  window.__fluidityIsBfcacheSuppressed = function () {
    return performance.now() < _suppressUntil;
  };

  // ── A) bfcache restore guard ──────────────────────────────────
  const BFCACHE_SUPPRESS_MS = 420;
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    _suppress(BFCACHE_SUPPRESS_MS);
    clearTimeout(window._gRenderTimer);
    if (window._gRenderRAF) { cancelAnimationFrame(window._gRenderRAF); window._gRenderRAF = null; }
    setTimeout(function () {
      _suppressUntil = 0;
      if (typeof window.render === 'function') window.render();
    }, BFCACHE_SUPPRESS_MS + 16);
  });

  // ── B) visibilitychange / focus PWA re-foreground guard ───────
  //
  // We DON'T suppress normal page operations — only prevent a
  // spurious full re-render immediately after the app returns from
  // background.  If real data has changed (taskCount, votiCount) the
  // dedup in _renderCore will let the render through anyway.
  //
  const VISIBILITY_SUPPRESS_MS = 260;
  let _visibilityTimer = null;

  function _onVisibilityChange() {
    if (document.visibilityState !== 'visible') return;
    // Cancel any pending render that was scheduled while hidden
    clearTimeout(window._gRenderTimer);
    if (window._gRenderRAF) { cancelAnimationFrame(window._gRenderRAF); window._gRenderRAF = null; }
    _suppress(VISIBILITY_SUPPRESS_MS);
    clearTimeout(_visibilityTimer);
    _visibilityTimer = setTimeout(function () {
      _suppressUntil = 0;
      // Only re-render if data may have changed while the app was hidden
      if (typeof window.render === 'function' && window.state && window.state.isLoggedIn) {
        window.render();
      }
    }, VISIBILITY_SUPPRESS_MS + 16);
  }

  document.addEventListener('visibilitychange', _onVisibilityChange);

  // window.focus fires on iOS PWA when switching back from another app
  let _focusTimer = null;
  window.addEventListener('focus', function () {
    // If visibilitychange already suppressed, bail out
    if (window.__fluidityIsBfcacheSuppressed()) return;
    clearTimeout(_focusTimer);
    _suppress(180);
    _focusTimer = setTimeout(function () {
      _suppressUntil = 0;
    }, 200);
  });

  // ── C) Service Worker controllerchange → block auto-reload ────
  //
  // The pattern `navigator.serviceWorker.addEventListener('controllerchange',
  // () => location.reload())` is the #1 cause of PWA double-load.
  // We intercept it by wrapping ServiceWorkerContainer.addEventListener
  // so that any 'controllerchange' handler added AFTER this patch runs
  // gets a no-op shim instead of a hard reload.
  //
  // SAFE: we only block 'controllerchange'. All other SW events are
  // passed through normally.  The UI already handles stale content
  // via its own sync mechanism.
  //
  try {
    if (navigator.serviceWorker) {
      const _origSWAddListener = navigator.serviceWorker.addEventListener.bind(navigator.serviceWorker);
      navigator.serviceWorker.addEventListener = function (type, handler, opts) {
        if (type === 'controllerchange') {
          // Replace any handler that would call location.reload() with a
          // safe version that just logs and lets the app stay alive.
          const safeHandler = function (e) {
            try {
              // Heuristic: if the original handler calls location.reload()
              // we catch that by overriding it in a sandboxed proxy.
              // Since we can't introspect the closure, we simply skip it
              // and schedule a soft re-render instead.
              console.log('[FluidityPatch] SW controllerchange intercepted — soft render instead of reload');
              if (window.state && window.state.isLoggedIn && typeof window.scheduleRender === 'function') {
                window.scheduleRender(300);
              }
            } catch (_) {}
          };
          return _origSWAddListener(type, safeHandler, opts);
        }
        return _origSWAddListener(type, handler, opts);
      };
    }
  } catch (_) {}

  // ── D) PWA standalone entry — single-render lock ──────────────
  //
  // In standalone/fullscreen PWA mode, suppress ALL renders for the
  // first 500ms, then release exactly one.  This coalesces the entire
  // boot burst (localStorage, partial sync, hashchange) into a single
  // DOM write, eliminating the multiple visible flashes on launch.
  //
  const isPWAStandalone = (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.navigator.standalone === true          // iOS legacy
  );

  if (isPWAStandalone) {
    const PWA_BOOT_LOCK_MS = 500;
    _suppress(PWA_BOOT_LOCK_MS);
    const _pwaBootTimer = setTimeout(function () {
      _suppressUntil = 0;
      clearTimeout(window._gRenderTimer);
      if (window._gRenderRAF) { cancelAnimationFrame(window._gRenderRAF); window._gRenderRAF = null; }
      if (typeof window.render === 'function') window.render();
      console.log('[FluidityPatch] PWA boot lock released — single render fired');
    }, PWA_BOOT_LOCK_MS);
    console.log('[FluidityPatch] PWA standalone mode detected — boot lock active for', PWA_BOOT_LOCK_MS, 'ms');
  }

  // ── hashchange debounce (same as v1.1) ────────────────────────
  let _hashChangeTimer = null;
  const HASHCHANGE_DEBOUNCE_MS = 60;

  function _installHashChangeDebouncePatch() {
    if (window.__fluidityHashDebouncePatched) return;
    window.__fluidityHashDebouncePatched = true;
    window.addEventListener('hashchange', function () {
      if (window.__fluidityIsBfcacheSuppressed()) return;
      clearTimeout(_hashChangeTimer);
      _hashChangeTimer = setTimeout(function () {
        const view = (location.hash || '').replace('#', '').trim();
        const allowed = window.allowedViews || ['home', 'planner', 'voti', 'academic_profile', 'profile', 'circolari'];
        if (!allowed.includes(view)) return;
        if (window.state && window.state.view === view) return;
        if (typeof window.navigate === 'function') window.navigate(view);
      }, HASHCHANGE_DEBOUNCE_MS);
    });
  }

  // ── Patch helpers ─────────────────────────────────────────────
  function markPatched(fn, key) {
    try { fn[key] = true; } catch (_) {}
    return fn;
  }

  function areCorePatchesInstalled() {
    return !!(
      window.hideBoot           && window.hideBoot.__fluidityBootPatched &&
      window.gsapAnimateView    && window.gsapAnimateView.__fluidityBootPatched &&
      window.render             && window.render.__fluidityNoGapPatched &&
      window.scheduleRender     && window.scheduleRender.__fluidityBootPatched &&
      window.alert              && window.alert.__fluidityBootPatched
    );
  }

  // ── hideBoot — remove lingering loader ────────────────────────
  function installHideBootPatch() {
    if (typeof window.hideBoot !== 'function' || window.hideBoot.__fluidityBootPatched) return;
    const patched = function hideBootPatched() {
      const overlay = document.getElementById('boot-overlay');
      if (overlay) { overlay.style.opacity = '0'; overlay.style.display = 'none'; }
      const loader = document.getElementById('app-loader');
      if (loader) {
        let removed = false;
        const done = () => {
          if (removed) return; removed = true;
          loader.removeEventListener('transitionend', done);
          if (loader.parentNode) loader.remove();
        };
        loader.addEventListener('transitionend', done, { once: true });
        loader.style.opacity = '0';
        setTimeout(done, LOADER_REMOVE_TIMEOUT_MS);
      }
    };
    window.hideBoot = markPatched(patched, '__fluidityBootPatched');
  }

  // ── Disable heavy gsapAnimateView when V3 engine is active ────
  function installGsapAnimateViewPatch() {
    if (typeof window.gsapAnimateView !== 'function' || window.gsapAnimateView.__fluidityBootPatched) return;
    const original = window.gsapAnimateView;
    const patched = function gsapAnimateViewPatched(...args) {
      if (window.render && window.render._isV3) return;
      return original.apply(this, args);
    };
    window.gsapAnimateView = markPatched(patched, '__fluidityBootPatched');
  }

  // ── GSAP will-change cleanup ──────────────────────────────────
  function installGsapWillChangePatch() {
    if (!window.gsap || window.gsap.__fluidityWillChangePatched) return;
    const gsap = window.gsap;
    const originalTo     = gsap.to.bind(gsap);
    const originalFromTo = gsap.fromTo.bind(gsap);
    const resolveTargets = (t) => {
      if (!t) return [];
      if (typeof t === 'string') return Array.from(document.querySelectorAll(t));
      if (t instanceof Element) return [t];
      if (t === window || t === document) return [];
      if (typeof t.length === 'number') return Array.from(t).filter(Boolean);
      return [];
    };
    const withCleanup = (targets, vars) => {
      const resolved = resolveTargets(targets);
      const v = { ...(vars || {}) };
      const prev = v.onComplete;
      const prevP = Array.isArray(v.onCompleteParams) ? v.onCompleteParams : [];
      v.onComplete = function (...args) {
        resolved.forEach(el => { if (el && el.style) el.style.willChange = 'auto'; });
        if (typeof prev === 'function') { try { return prev.apply(this, args.length ? args : prevP); } catch (_) {} }
      };
      return v;
    };
    gsap.to     = (t, v)       => originalTo(t, withCleanup(t, v));
    gsap.fromTo = (t, fv, tv)  => originalFromTo(t, fv, withCleanup(t, tv));
    gsap.__fluidityWillChangePatched = true;
  }

  // ── Bypass 400ms render gap after V3 install ─────────────────
  function installRenderBypassPatch() {
    if (typeof window.render !== 'function' || window.render.__fluidityNoGapPatched) return;
    if (!window.render._isV3 && !window.__fluidityRenderBypassForce) return;
    const patched = function renderNoGapPatched() {
      if (window.__fluidityIsBfcacheSuppressed()) return;
      if (window._gRenderRAF || !window.state || window.state.booting || (window.state._loggedOut && window.state.view !== 'login')) return;
      window._gRenderRAF = requestAnimationFrame(() => {
        try {
          if (window.state && window.state._loggedOut && window.state.view !== 'login') return;
          if (typeof window._renderCore === 'function') window._renderCore();
        } finally { window._gRenderRAF = null; }
      });
    };
    patched._isV3 = true;
    patched.__fluidityNoGapPatched = true;
    window.render = patched;
  }

  // ── Post-navigate scheduleRender dedup ───────────────────────
  function installNavigateSchedulePatch() {
    if (typeof window.navigate === 'function' && !window.navigate.__fluidityBootPatched) {
      const orig = window.navigate;
      const p = function (...args) {
        window.__fluidityLastNavigateAt = performance.now();
        return orig.apply(this, args);
      };
      p._isV3 = !!orig._isV3;
      window.navigate = markPatched(p, '__fluidityBootPatched');
    }
    if (typeof window.scheduleRender === 'function' && !window.scheduleRender.__fluidityBootPatched) {
      const orig = window.scheduleRender;
      const p = function (delay = 80) {
        if (window.__fluidityIsBfcacheSuppressed()) return;
        const lastNav = window.__fluidityLastNavigateAt || 0;
        if ((performance.now() - lastNav) < POST_NAV_SCHEDULE_BLOCK_MS && !(window.state && window.state._forceRender)) return;
        return orig.call(this, delay);
      };
      window.scheduleRender = markPatched(p, '__fluidityBootPatched');
    }
  }

  // ── Convert blocking login alerts to toast ───────────────────
  function installAlertPatch() {
    if (typeof window.alert !== 'function' || window.alert.__fluidityBootPatched) return;
    const native = window.alert.bind(window);
    const p = function (message) {
      const text = String(message ?? '');
      if ((/^\s*✅/.test(text) || /welcome|benvenuto|bienven|bienvenu|willkommen|bem-vindo/i.test(text)) &&
          typeof window.showToast === 'function') {
        window.showToast(text.replace(/^✅\s*/, ''), 'success');
        return;
      }
      return native(message);
    };
    window.alert = markPatched(p, '__fluidityBootPatched');
  }

  function installAll() {
    _installHashChangeDebouncePatch();
    installHideBootPatch();
    installGsapAnimateViewPatch();
    installGsapWillChangePatch();
    installRenderBypassPatch();
    installNavigateSchedulePatch();
    installAlertPatch();
    return areCorePatchesInstalled();
  }

  if (installAll()) {
    window.__fluidityBootPatchVersion = PATCH_VERSION;
    console.log('🩹 Fluidity boot patch loaded', PATCH_VERSION);
    return;
  }

  let attempts = 0;
  const timer = setInterval(() => {
    attempts++;
    if (installAll()) {
      clearInterval(timer);
      window.__fluidityBootPatchVersion = PATCH_VERSION;
      console.log('🩹 Fluidity boot patch loaded', PATCH_VERSION);
      return;
    }
    if (attempts >= PATCH_RETRY_MAX_ATTEMPTS) {
      clearInterval(timer);
      console.warn('⚠️ Fluidity boot patch partial install after retries');
    }
  }, PATCH_RETRY_INTERVAL_MS);
})();

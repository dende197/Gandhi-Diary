(function fluidityBootPatch() {
  if (window.__fluidityBootPatchInstalled) return;
  window.__fluidityBootPatchInstalled = true;

  const PATCH_VERSION = '1.1.0';
  const LOADER_REMOVE_TIMEOUT_MS = 180;
  const POST_NAV_SCHEDULE_BLOCK_MS = 160;
  const PATCH_RETRY_INTERVAL_MS = 50;
  const PATCH_RETRY_MAX_ATTEMPTS = 120;

  // 1) Cold-start white flash guard (run as early as possible).
  try {
    const id = 'fluidity-boot-bg-patch';
    if (!document.getElementById(id)) {
      const s = document.createElement('style');
      s.id = id;
      s.textContent = 'html,body{background-color:#F6F5F3!important;}';
      document.head.appendChild(s);
    }
  } catch (_) {}

  // ─────────────────────────────────────────────────────────────────
  // FIX: Mobile multi-reload on manual refresh
  //
  // Root causes:
  //   A) iOS/Android bfcache: when the user pulls-to-refresh, the page
  //      is restored from the back-forward cache and fires a "pageshow"
  //      event with persisted=true.  If the app immediately calls
  //      scheduleRender/render multiple times from the restored state it
  //      triggers the full boot sequence again → the screen flashes and
  //      the loader appears/disappears several times in rapid succession.
  //
  //   B) hashchange fires synchronously during the same bfcache restore
  //      and can kick off a second navigate() → render() chain on top
  //      of the one triggered by DOMContentLoaded / init code.
  //
  // Solution:
  //   1. On "pageshow" with persisted=true we set a short suppression
  //      window (BFCACHE_SUPPRESS_MS) during which all render() and
  //      scheduleRender() calls are silently dropped, then we issue
  //      exactly ONE controlled render after the paint settles.
  //   2. We debounce hashchange so that rapid back-to-back fires
  //      (common on Android Chrome) coalesce into a single navigate().
  // ─────────────────────────────────────────────────────────────────
  const BFCACHE_SUPPRESS_MS = 400; // guard window after bfcache restore
  let _bfcacheSuppressUntil = 0;

  window.__fluidityIsBfcacheSuppressed = function () {
    return performance.now() < _bfcacheSuppressUntil;
  };

  // pageshow fires both on normal load (persisted=false) and bfcache
  // restore (persisted=true).  We only need to act on bfcache restores.
  window.addEventListener('pageshow', function onPageShow(e) {
    if (!e.persisted) return; // normal load — nothing to do

    // Suppress renders triggered by the bfcache restore burst
    _bfcacheSuppressUntil = performance.now() + BFCACHE_SUPPRESS_MS;

    // Cancel any already-queued render timers/RAFs from the restored state
    clearTimeout(window._gRenderTimer);
    if (window._gRenderRAF) {
      cancelAnimationFrame(window._gRenderRAF);
      window._gRenderRAF = null;
    }

    // After the suppression window, issue exactly one controlled render
    setTimeout(function () {
      _bfcacheSuppressUntil = 0;
      if (typeof window.render === 'function') window.render();
    }, BFCACHE_SUPPRESS_MS + 16); // +16ms = one extra frame for paint
  });

  // hashchange debounce — prevents rapid duplicate navigate() calls on
  // Android when the hash is written then immediately re-read by the
  // restored page history state.
  let _hashChangeTimer = null;
  const HASHCHANGE_DEBOUNCE_MS = 60;
  const _origAddEventListener = EventTarget.prototype.addEventListener;

  // We wrap window.navigate directly once it exists (see installAll loop)
  // so we don't need to intercept addEventListener at a low level.

  function _installHashChangeDebouncePatch() {
    if (window.__fluidityHashDebouncePatched) return;
    window.__fluidityHashDebouncePatched = true;

    window.addEventListener('hashchange', function () {
      if (window.__fluidityIsBfcacheSuppressed()) return;
      clearTimeout(_hashChangeTimer);
      _hashChangeTimer = setTimeout(function () {
        const view = (location.hash || '').replace('#', '').trim();
        const allowed = window.allowedViews || ['home', 'planner', 'voti', 'ai_assistant', 'academic_profile', 'profile', 'circolari'];
        if (!allowed.includes(view)) return;
        // Only navigate if the view actually differs from current state
        if (window.state && window.state.view === view) return;
        if (typeof window.navigate === 'function') window.navigate(view);
      }, HASHCHANGE_DEBOUNCE_MS);
    });
  }

  function markPatched(fn, key) {
    try { fn[key] = true; } catch (_) {}
    return fn;
  }

  function areCorePatchesInstalled() {
    return !!(
      window.hideBoot && window.hideBoot.__fluidityBootPatched &&
      window.gsapAnimateView && window.gsapAnimateView.__fluidityBootPatched &&
      window.render && window.render.__fluidityNoGapPatched &&
      window.scheduleRender && window.scheduleRender.__fluidityBootPatched &&
      window.alert && window.alert.__fluidityBootPatched
    );
  }

  // 2) hideBoot() without lingering loader layer.
  function installHideBootPatch() {
    if (typeof window.hideBoot !== 'function' || window.hideBoot.__fluidityBootPatched) return;
    const patched = function hideBootPatched() {
      const overlay = document.getElementById('boot-overlay');
      if (overlay) {
        overlay.style.opacity = '0';
        overlay.style.display = 'none';
      }

      const loader = document.getElementById('app-loader');
      if (loader) {
        let removed = false;
        const done = () => {
          if (removed) return;
          removed = true;
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

  // 3) Disable heavy ui.js entrance animation when V3 engine is active.
  function installGsapAnimateViewPatch() {
    if (typeof window.gsapAnimateView !== 'function' || window.gsapAnimateView.__fluidityBootPatched) return;
    const original = window.gsapAnimateView;
    const patched = function gsapAnimateViewPatched(...args) {
      if (window.render && window.render._isV3) return;
      return original.apply(this, args);
    };
    window.gsapAnimateView = markPatched(patched, '__fluidityBootPatched');
  }

  // 4) Wrap GSAP to release will-change after tween completion.
  function installGsapWillChangePatch() {
    if (!window.gsap || window.gsap.__fluidityWillChangePatched) return;

    const gsap = window.gsap;
    const originalTo = gsap.to.bind(gsap);
    const originalFromTo = gsap.fromTo.bind(gsap);

    const resolveTargets = (targets) => {
      if (!targets) return [];
      if (typeof targets === 'string') return Array.from(document.querySelectorAll(targets));
      if (targets instanceof Element) return [targets];
      if (targets === window || targets === document) return [];
      if (typeof targets.length === 'number') return Array.from(targets).filter(Boolean);
      return [];
    };

    const withWillChangeCleanup = (targets, vars) => {
      const resolved = resolveTargets(targets);
      const nextVars = { ...(vars || {}) };
      const prevOnComplete = nextVars.onComplete;
      const prevParams = Array.isArray(nextVars.onCompleteParams) ? nextVars.onCompleteParams : [];
      nextVars.onComplete = function onCompletePatched(...args) {
        resolved.forEach((el) => {
          if (el && el.style) el.style.willChange = 'auto';
        });
        if (typeof prevOnComplete === 'function') {
          try {
            return prevOnComplete.apply(this, args.length ? args : prevParams);
          } catch (_) {}
        }
      };
      return nextVars;
    };

    gsap.to = function toPatched(targets, vars) {
      return originalTo(targets, withWillChangeCleanup(targets, vars));
    };

    gsap.fromTo = function fromToPatched(targets, fromVars, toVars) {
      return originalFromTo(targets, fromVars, withWillChangeCleanup(targets, toVars));
    };

    gsap.__fluidityWillChangePatched = true;
  }

  // 5) Bypass engine 400ms render gap after V3 install.
  //    Also wraps render/scheduleRender to respect the bfcache suppression window.
  function installRenderBypassPatch() {
    if (typeof window.render !== 'function') return;
    if (window.render.__fluidityNoGapPatched) return;
    if (!window.render._isV3 && !window.__fluidityRenderBypassForce) return;

    const _innerRender = window.render; // capture current V3 render

    const patched = function renderNoGapPatched() {
      // Bail during bfcache suppression window
      if (window.__fluidityIsBfcacheSuppressed()) return;
      // Allow render if view is login to prevent locking the screen on logout
      if (window._gRenderRAF || !window.state || window.state.booting || (window.state._loggedOut && window.state.view !== 'login')) return;
      window._gRenderRAF = requestAnimationFrame(() => {
        try {
          if (window.state && window.state._loggedOut && window.state.view !== 'login') return;
          if (typeof window._renderCore === 'function') window._renderCore();
        } finally {
          window._gRenderRAF = null;
        }
      });
    };
    patched._isV3 = true;
    patched.__fluidityNoGapPatched = true;
    window.render = patched;
  }

  // 6) Avoid duplicate post-login scheduleRender right after navigate.
  function installNavigateSchedulePatch() {
    if (typeof window.navigate === 'function' && !window.navigate.__fluidityBootPatched) {
      const originalNavigate = window.navigate;
      const navigatePatched = function (...args) {
        window.__fluidityLastNavigateAt = performance.now();
        return originalNavigate.apply(this, args);
      };
      navigatePatched._isV3 = !!originalNavigate._isV3;
      window.navigate = markPatched(navigatePatched, '__fluidityBootPatched');
    }

    if (typeof window.scheduleRender === 'function' && !window.scheduleRender.__fluidityBootPatched) {
      const originalScheduleRender = window.scheduleRender;
      const schedulePatched = function (delay = 80) {
        // Bail during bfcache suppression window
        if (window.__fluidityIsBfcacheSuppressed()) return;
        const lastNav = window.__fluidityLastNavigateAt || 0;
        const inPostNavWindow = (performance.now() - lastNav) < POST_NAV_SCHEDULE_BLOCK_MS;
        const forceRender = !!(window.state && window.state._forceRender);
        if (inPostNavWindow && !forceRender) return;
        return originalScheduleRender.call(this, delay);
      };
      window.scheduleRender = markPatched(schedulePatched, '__fluidityBootPatched');
    }
  }

  // 7) Convert blocking login welcome alert to toast.
  function installAlertPatch() {
    if (typeof window.alert !== 'function' || window.alert.__fluidityBootPatched) return;
    const nativeAlert = window.alert.bind(window);
    const alertPatched = function (message) {
      const text = String(message ?? '');
      const isLoginWelcome = /^\s*✅/.test(text) || /welcome|benvenuto|bienven|bienvenu|willkommen|bem-vindo/i.test(text);
      if (isLoginWelcome && typeof window.showToast === 'function') {
        window.showToast(text.replace(/^✅\s*/, ''), 'success');
        return;
      }
      return nativeAlert(message);
    };
    window.alert = markPatched(alertPatched, '__fluidityBootPatched');
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
    attempts += 1;
    const ready = installAll();
    if (ready) {
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

/* ================================================================
   G-CONNECT — FLUIDITY ENGINE v3.3
   
   Changes vs v3.2:
   ─ RENDER_MIN_GAP raised 80→150ms (coalesces full boot burst)
   ─ _bootRenderLock: first 550ms after load → only ONE render fires
   ─ visibilitychange: soft re-render only when data actually changed
   ─ All v3.2 animation features preserved (greeting card, widgets)
   ================================================================ */

(function fluidityEngineV3() {
  console.log('🚀 G-Connect Fluidity Engine v3.3 - Initializing...');

  const escapeHtml = (str) =>
    (typeof window.escapeHtml === 'function' ? window.escapeHtml(str) : String(str ?? ''));
  const escapeJsSingleQuote = (str) =>
    (typeof window.escapeJsSingleQuote === 'function' ? window.escapeJsSingleQuote(str) : String(str ?? ''));

  let _lastAnimatedViewRender = null;

  // ─── Helpers ──────────────────────────────────────────────────
  function _setWillChange(el, on) {
    if (el) el.style.willChange = on ? 'transform, opacity' : 'auto';
  }
  function _directionVector(dir, d = 10) {
    if (dir === 'left')  return { x: -d, y: 0 };
    if (dir === 'right') return { x:  d, y: 0 };
    if (dir === 'down')  return { x: 0, y:  d };
    return { x: 0, y: -d }; // 'up' default
  }

  function _exitCurrent(dir = 'up', opts = {}) {
    const { duration = 0.14, distance = 10, scale = 0.995 } = opts;
    const root = document.getElementById('app');
    const cv = root ? root.querySelector('.view') : null;
    if (!cv || typeof gsap === 'undefined') return Promise.resolve();
    const to = _directionVector(dir, distance);
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return; done = true;
        gsap.killTweensOf(cv); _setWillChange(cv, false); resolve();
      };
      _setWillChange(cv, true); gsap.killTweensOf(cv);
      gsap.to(cv, { opacity: 0, x: to.x, y: to.y, scale, duration, ease: 'power2.in', overwrite: 'auto', onComplete: finish });
      setTimeout(finish, Math.ceil(duration * 1000) + 80);
    });
  }

  function _enterView(dir = 'down', opts = {}) {
    const { duration = 0.22, distance = 8, scale = 0.995 } = opts;
    const viewEl = document.querySelector('.view');
    if (!viewEl || typeof gsap === 'undefined') return;
    const from = _directionVector(dir, distance);
    _setWillChange(viewEl, true); gsap.killTweensOf(viewEl);
    gsap.fromTo(viewEl,
      { opacity: 0, x: from.x, y: from.y, scale },
      { opacity: 1, x: 0, y: 0, scale: 1, duration, ease: 'power3.out', overwrite: 'auto',
        onComplete: () => _setWillChange(viewEl, false) }
    );
  }

  // ═══════════════════════════════════════════════════════════════
  //  CORE RENDER  —  dedup + coalescing + PWA boot lock
  // ═══════════════════════════════════════════════════════════════

  // Raised from 80ms → 150ms.  This window is wide enough to absorb
  // the entire PWA boot burst (localStorage + partial server data +
  // hashchange) while still being imperceptible to the user (~3 frames).
  const RENDER_MIN_GAP = 150;
  let _lastRenderTime = 0;

  // Boot render lock: in the first BOOT_LOCK_MS after the engine
  // initialises, only ONE render is allowed to commit to the DOM.
  // All subsequent calls are coalesced into one deferred render that
  // fires at BOOT_LOCK_MS.  This prevents the 2-3 rapid screen
  // flashes visible during PWA cold start.
  const BOOT_LOCK_MS = 550;
  let _bootLockActive = true;
  let _bootLockTimer = null;
  let _bootRenderPending = false;

  const _installCoreRender = () => {
    if (typeof window.render !== 'function' || window.render._isV3) return;
    clearTimeout(window._gRenderTimer);
    if (window._gRenderRAF) { cancelAnimationFrame(window._gRenderRAF); window._gRenderRAF = null; }

    const _origRenderCore = window._renderCore;

    // Release the boot lock and fire the single deferred render
    _bootLockTimer = setTimeout(() => {
      _bootLockActive = false;
      if (_bootRenderPending) {
        _bootRenderPending = false;
        window.render();
      }
    }, BOOT_LOCK_MS);

    window.render = function render() {
      // Respect external suppression (bfcache / visibilitychange / PWA lock)
      if (typeof window.__fluidityIsBfcacheSuppressed === 'function' &&
          window.__fluidityIsBfcacheSuppressed()) return;

      // During boot lock, queue at most one pending render
      if (_bootLockActive) {
        _bootRenderPending = true;
        return;
      }

      if (window._gRenderRAF || state.booting || (state._loggedOut && state.view !== 'login')) return;

      const now = performance.now();
      if (now - _lastRenderTime < RENDER_MIN_GAP) {
        clearTimeout(window._gRenderTimer);
        window._gRenderTimer = setTimeout(window.render, RENDER_MIN_GAP - (now - _lastRenderTime));
        return;
      }

      _lastRenderTime = now;
      window._gRenderRAF = requestAnimationFrame(() => {
        if (state._loggedOut && state.view !== 'login') { window._gRenderRAF = null; return; }
        const shouldAnimate = !!state._animateOnNextRender || (_lastAnimatedViewRender !== state.view);
        if (typeof _origRenderCore === 'function') _origRenderCore();
        window._gRenderRAF = null;
        if (shouldAnimate && state.isLoggedIn && state.view !== 'login') {
          state._animateOnNextRender = false;
          _lastAnimatedViewRender = state.view;
          requestAnimationFrame(() => requestAnimationFrame(() => _animateViewEntrance(state.view, 'down')));
        }
      });
    };
    window.render._isV3 = true;

    window.scheduleRender = function scheduleRender(delay = 80) {
      if (typeof window.__fluidityIsBfcacheSuppressed === 'function' &&
          window.__fluidityIsBfcacheSuppressed()) return;
      clearTimeout(window._gRenderTimer);
      // During boot lock, just mark pending — don't queue timer
      if (_bootLockActive) { _bootRenderPending = true; return; }
      window._gRenderTimer = setTimeout(window.render, delay <= 0 ? 16 : delay);
    };

    console.log('✅ Fluidity Engine v3.3: Render Lock + Boot Coalescer installed.');
  };

  // ─── Visibilitychange — soft re-render only on real data change ─
  //
  // We track data fingerprint at hide-time and only re-render if
  // something actually changed while the app was in the background.
  // This prevents the flash on iOS PWA tab-switching.
  //
  let _hiddenFingerprint = null;
  function _dataFingerprint() {
    if (!window.state) return null;
    return [
      (state.tasks  || []).length,
      (state.voti   || []).length,
      (state.aiChatHistory || []).length,
      !!state.aiChatPending,
      state.view,
      state.isLoggedIn
    ].join('|');
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      _hiddenFingerprint = _dataFingerprint();
      return;
    }
    // Visible again — only re-render if data changed
    if (_hiddenFingerprint !== null && _dataFingerprint() === _hiddenFingerprint) return;
    _hiddenFingerprint = null;
    if (typeof window.scheduleRender === 'function' && window.state && window.state.isLoggedIn) {
      window.scheduleRender(80);
    }
  });

  // ─── Navigation ───────────────────────────────────────────────
  const _installNavigation = () => {
    if (typeof window.navigate !== 'function' || window.navigate._isV3) return;

    window.navigate = function navigate(v) {
      const allowed = ['login', 'home', 'planner', 'voti', 'ai_assistant', 'academic_profile', 'profile', 'circolari'];
      if (!allowed.includes(v) || (!state.isLoggedIn && v !== 'login')) v = state.isLoggedIn ? 'home' : 'login';
      if (v !== 'login' && state.isLoggedIn && state._loggedOut) state._loggedOut = false;

      if (v === state.view) {
        try {
          if (typeof _renderViewDirect === 'function') _renderViewDirect(v);
          else if (typeof window.scheduleRender === 'function') window.scheduleRender(0);
        } catch (e) { if (typeof window.scheduleRender === 'function') window.scheduleRender(0); }
        return;
      }

      const hash = '#' + v;
      if (window.location.hash !== hash) window.history.pushState(null, '', hash);

      const go = () => {
        state.view = v;
        if (typeof saveNavigationState === 'function') saveNavigationState();
        window.scrollTo({ top: 0, behavior: 'instant' });
        if (typeof _renderViewDirect === 'function') _renderViewDirect(v);
        const nc = document.getElementById('nav-container');
        if (nc && typeof renderNav === 'function') nc.innerHTML = renderNav();
        _animateViewEntrance(v);
      };

      if (!state.isLoggedIn || v === 'login') { go(); return; }
      _exitCurrent('up', { duration: 0.13, distance: 7, scale: 0.996 }).then(go);
    };
    window.navigate._isV3 = true;
    console.log('✅ Fluidity Engine: Navigation installed.');
  };

  // ─── Direct view render ───────────────────────────────────────
  function _renderViewDirect(view) {
    if (state._loggedOut && view !== 'login') return;
    const root = document.getElementById('app');
    if (!root) return;
    const nav = document.getElementById('nav-container');

    if (!state.isLoggedIn || view === 'login') {
      document.body.classList.add('logged-out');
      document.body.classList.remove('is-ai-mode');
      document.body.style.overflow = ''; document.body.style.height = '';
      root.style.overflow = 'visible'; root.style.height = '';
      root.innerHTML = (typeof renderLogin === 'function') ? renderLogin() : '';
      if (nav) nav.innerHTML = '';
      return;
    }
    document.body.classList.remove('logged-out');
    const isAI = view === 'ai_assistant';
    if (isAI) {
      document.body.classList.add('is-ai-mode');
      document.body.style.overflow = 'hidden'; document.body.style.height = '100svh';
      root.style.overflow = 'hidden'; root.style.height = '100%';
    } else {
      document.body.classList.remove('is-ai-mode');
      document.body.style.overflow = ''; document.body.style.height = '';
      root.style.overflow = 'visible'; root.style.height = '';
    }

    let html = '';
    switch (view) {
      case 'home':             html = (typeof renderHome === 'function') ? renderHome() : ''; break;
      case 'planner':          html = (typeof renderPlanner === 'function') ? renderPlanner() : ''; break;
      case 'voti':             html = (typeof renderGradesView === 'function') ? renderGradesView() : ''; break;
      case 'ai_assistant':     html = (typeof renderAIAssistantView === 'function') ? renderAIAssistantView() : ''; break;
      case 'academic_profile': html = (typeof renderAcademicProfile === 'function') ? renderAcademicProfile() : ''; break;
      case 'profile':          html = (typeof renderProfile === 'function') ? renderProfile() : ''; break;
      case 'circolari':        html = (typeof renderCircolariView === 'function') ? renderCircolariView() : ''; break;
      default:                 html = (typeof renderHome === 'function') ? renderHome() : ''; break;
    }

    // Silent cross-fade swap — no white flash
    if (typeof gsap !== 'undefined') gsap.set(root, { opacity: 0 });
    root.innerHTML = html;
    if (typeof gsap !== 'undefined') gsap.to(root, { opacity: 1, duration: 0.10, ease: 'none', overwrite: 'auto' });

    requestAnimationFrame(() => {
      if (view === 'home') {
        const mv = parseFloat((typeof calcolaMedia === 'function') ? calcolaMedia(state.voti) : 0) || 0;
        if (typeof renderMediaGauge === 'function') renderMediaGauge(mv);
      }
      if (view === 'planner' && typeof renderCustomCalendar === 'function') renderCustomCalendar();
      if (view === 'voti'    && typeof initGradesCharts     === 'function') initGradesCharts();
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  ANIMATION SYSTEM  (identical to v3.2 — preserved in full)
  // ═══════════════════════════════════════════════════════════════

  function _animateViewEntrance(view, direction = 'down') {
    if (!state.isLoggedIn || view === 'login') return;
    if (typeof gsap === 'undefined') return;
    const viewEl = document.querySelector('.view');
    if (!viewEl) return;

    _lastAnimatedViewRender = view;
    gsap.killTweensOf(viewEl);
    gsap.killTweensOf(viewEl.querySelectorAll('*'));

    _enterView(direction, { duration: 0.24, distance: 9, scale: 0.992 });

    if (view === 'home') _animateHome(viewEl);
    else _animateGeneric(viewEl);

    _installButtonFeedback(viewEl);
    _installCardHover(viewEl);
  }

  // ── Home: per-element orchestrated timeline ───────────────────
  function _animateHome(viewEl) {
    const ease  = 'power3.out';
    const easeB = 'back.out(1.7)';

    // Greeting card shell
    const gc = viewEl.querySelector('.greeting-card');
    if (gc) {
      gsap.killTweensOf(gc);
      gsap.fromTo(gc,
        { opacity: 0, y: 22, scale: 0.97 },
        { opacity: 1, y: 0, scale: 1, duration: 0.46, ease: easeB, delay: 0.06, clearProps: 'transform,opacity' }
      );

      // .greeting-period  (LUNEDÌ · MATTINA)
      const period = gc.querySelector('.greeting-period');
      if (period) {
        gsap.killTweensOf(period);
        gsap.fromTo(period,
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, duration: 0.30, ease, delay: 0.19, clearProps: 'transform,opacity' }
        );
      }

      // .greeting-text  (Ciao, Mario.)
      const text = gc.querySelector('.greeting-text');
      if (text) {
        gsap.killTweensOf(text);
        gsap.fromTo(text,
          { opacity: 0, y: 12, filter: 'blur(4px)' },
          { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.40, ease, delay: 0.26, clearProps: 'transform,opacity,filter' }
        );
      }

      // .greeting-quote  ("Lorem ipsum…")
      const quote = gc.querySelector('.greeting-quote');
      if (quote) {
        gsap.killTweensOf(quote);
        gsap.fromTo(quote,
          { opacity: 0, y: 9 },
          { opacity: 1, y: 0, duration: 0.34, ease, delay: 0.35, clearProps: 'transform,opacity' }
        );
      }

      // Refresh button (top-right)
      const refreshBtn = gc.querySelector('button');
      if (refreshBtn) {
        gsap.killTweensOf(refreshBtn);
        gsap.fromTo(refreshBtn,
          { opacity: 0, scale: 0.6, rotate: -40 },
          { opacity: 1, scale: 1, rotate: 0, duration: 0.40, ease: easeB, delay: 0.44, clearProps: 'transform,opacity' }
        );
      }
    }

    // Verifica card — enters from right
    const vc = viewEl.querySelector('.verifica-card, #widget-verifiche');
    if (vc) {
      gsap.killTweensOf(vc);
      gsap.fromTo(vc,
        { opacity: 0, x: 20, scale: 0.97 },
        { opacity: 1, x: 0, scale: 1, duration: 0.44, ease: easeB, delay: 0.10, clearProps: 'transform,opacity' }
      );
      const vInner = vc.querySelectorAll('#vw-abbr, #vw-tipo, #vw-counter, #vw-desc, #vw-days');
      if (vInner.length) {
        gsap.killTweensOf(vInner);
        gsap.fromTo(vInner,
          { opacity: 0, y: 6 },
          { opacity: 1, y: 0, duration: 0.28, stagger: 0.05, ease, delay: 0.30, clearProps: 'transform,opacity' }
        );
      }
      const barFill = vc.querySelector('#vw-bar-fill');
      if (barFill) {
        const tw = barFill.style.width || '0%';
        gsap.fromTo(barFill, { width: '0%' }, { width: tw, duration: 0.65, ease: 'power2.out', delay: 0.52 });
      }
    }

    // ROW 2: Media · Assenze · Ultima circolare
    const row2 = viewEl.querySelectorAll('.home-grid-row + .home-grid-row .card, .home-grid-row:nth-child(2) .card');
    if (row2.length) {
      gsap.killTweensOf(row2);
      gsap.fromTo(row2,
        { opacity: 0, y: 20, scale: 0.95 },
        { opacity: 1, y: 0, scale: 1, duration: 0.44, stagger: 0.08, ease: easeB, delay: 0.18, clearProps: 'transform,opacity' }
      );
      row2.forEach((card, ci) => {
        const bigNum = card.querySelector('[style*="font-size:42px"], [style*="font-size:32px"], [style*="font-size: 42px"], [style*="font-size: 32px"]');
        if (bigNum) {
          const raw = bigNum.textContent.trim().replace('%', '').replace('—', '');
          const num = parseFloat(raw);
          if (!isNaN(num) && num > 0) {
            const isPercent = bigNum.textContent.includes('%');
            const dec = bigNum.textContent.includes('.') ? 2 : 0;
            const obj = { val: 0 };
            gsap.to(obj, {
              val: num, duration: 0.85, delay: 0.55 + ci * 0.06, ease: 'power2.out',
              onUpdate: () => {
                bigNum.textContent = isPercent
                  ? obj.val.toFixed(2) + '%'
                  : dec ? obj.val.toFixed(dec) : Math.round(obj.val).toString();
              }
            });
          }
        }
        const pBar = card.querySelector('[style*="background:#3B9DD4"], [style*="background:#EF4444"], [style*="background: #3B9DD4"], [style*="background: #EF4444"]');
        if (pBar) {
          const tw = pBar.style.width || '0%';
          gsap.fromTo(pBar, { width: '0%' }, { width: tw, duration: 0.70, ease: 'power2.out', delay: 0.56 + ci * 0.06 });
        }
      });
    }

    // Widget headers
    const wh = viewEl.querySelectorAll('.widget-header');
    if (wh.length) {
      gsap.killTweensOf(wh);
      gsap.fromTo(wh,
        { opacity: 0, y: 7 },
        { opacity: 1, y: 0, duration: 0.26, stagger: 0.07, ease, delay: 0.27, clearProps: 'transform,opacity' }
      );
    }

    // ROW 3 cards: Voti recenti + Focus task list
    const r3 = viewEl.querySelectorAll('.home-grid-row:last-child .card, #home-focus-task-list');
    if (r3.length) {
      gsap.killTweensOf(r3);
      gsap.fromTo(r3,
        { opacity: 0, y: 16, scale: 0.97 },
        { opacity: 1, y: 0, scale: 1, duration: 0.42, stagger: 0.09, ease: easeB, delay: 0.30, clearProps: 'transform,opacity' }
      );
    }

    // Grade rows
    const gr = viewEl.querySelectorAll('[style*="border-bottom:1px solid #F4F2EE"], [style*="border-bottom: 1px solid #F4F2EE"]');
    if (gr.length) {
      gsap.killTweensOf(gr);
      gsap.fromTo(gr,
        { opacity: 0, x: -10 },
        { opacity: 1, x: 0, duration: 0.26, stagger: 0.035, ease, delay: 0.44, clearProps: 'transform,opacity' }
      );
      gr.forEach((row, i) => {
        const bar = row.querySelector('div > div[style]');
        if (!bar || !bar.style.width) return;
        const tw = bar.style.width;
        gsap.fromTo(bar, { width: '0%' }, { width: tw, duration: 0.48, ease: 'power2.out', delay: 0.52 + i * 0.04 });
      });
    }

    // Task rows
    const tr = viewEl.querySelectorAll('#home-focus-task-list > div, .task-row');
    if (tr.length) {
      gsap.killTweensOf(tr);
      gsap.fromTo(tr,
        { opacity: 0, y: 7 },
        { opacity: 1, y: 0, duration: 0.26, stagger: 0.04, ease, delay: 0.46, clearProps: 'transform,opacity' }
      );
    }
  }

  // ── Generic view animations ───────────────────────────────────
  function _animateGeneric(viewEl) {
    const ease  = 'power2.out';
    const easeB = 'back.out(1.5)';

    _stagger(viewEl, 'h1, h2, h3, .section-title, .widget-title',
      { opacity: 0, y: 10, filter: 'blur(2px)' },
      { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.30, stagger: 0.05, ease }, 0.05);

    _stagger(viewEl, '.card, .subject-summary-card, .glass-panel, .registro-card, .circolare-card',
      { opacity: 0, y: 16, scale: 0.96 },
      { opacity: 1, y: 0, scale: 1, duration: 0.40, stagger: 0.05, ease: easeB }, 0.08);

    _stagger(viewEl, '.task-row, .grade-row, #weekly-agenda-list > div, .studio-entry, .focus-item',
      { opacity: 0, y: 7 },
      { opacity: 1, y: 0, duration: 0.28, stagger: 0.025, ease }, 0.14);

    _stagger(viewEl, '.badge, .pill, .subject-badge, .agenda-subject-badge, .filter-chip',
      { opacity: 0, scale: 0.78 },
      { opacity: 1, scale: 1, duration: 0.26, stagger: 0.012, ease: easeB }, 0.18);

    viewEl.querySelectorAll('.progress-bar, .streak-bar, [class*="progress"]').forEach((bar, i) => {
      const tw = bar.style.width || '100%';
      gsap.fromTo(bar, { width: '0%' }, { width: tw, duration: 0.55, ease: 'power2.out', delay: 0.22 + i * 0.04 });
    });

    viewEl.querySelectorAll('.media-value, [data-animate-number]').forEach(el => {
      const num = parseFloat(el.textContent.trim());
      if (isNaN(num) || num <= 0) return;
      const obj = { val: 0 };
      gsap.to(obj, { val: num, duration: 0.9, delay: 0.5, ease: 'power2.out',
        onUpdate: () => { el.textContent = num % 1 !== 0 ? obj.val.toFixed(2) : Math.round(obj.val).toString(); } });
    });

    _stagger(viewEl, '.fab, .btn-primary',
      { opacity: 0, scale: 0.84, y: 7 },
      { opacity: 1, scale: 1, y: 0, duration: 0.36, stagger: 0.05, ease: easeB }, 0.30);
  }

  function _stagger(viewEl, sel, from, to, delay = 0) {
    const els = viewEl.querySelectorAll(sel);
    if (!els.length) return null;
    gsap.killTweensOf(els);
    return gsap.fromTo(els, from, { ...to, delay, clearProps: 'transform,opacity,filter' });
  }

  // ── Card hover (desktop only) ─────────────────────────────────
  function _installCardHover(scope = document) {
    if (typeof gsap === 'undefined' || !scope) return;
    if (window.matchMedia('(hover: none)').matches) return;
    scope.querySelectorAll('.card, .metric-card, .circolare-card, .home-glass-card, .subject-summary-card').forEach(card => {
      if (card.dataset.gHoverReady === '1') return;
      card.dataset.gHoverReady = '1';
      card.addEventListener('mouseenter', () =>
        gsap.to(card, { scale: 1.015, boxShadow: '0 10px 36px rgba(0,0,0,0.10)', duration: 0.26, ease: 'power2.out' }));
      card.addEventListener('mouseleave', () =>
        gsap.to(card, { scale: 1, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', duration: 0.36, ease: 'elastic.out(1,0.5)' }));
    });
  }

  // ── Subject drill-down transitions ───────────────────────────
  const _installSubjectTransitions = () => {
    if (window.navigateSubject && window.navigateSubject._isV3) return;
    window.navigateSubject = function (subjName) {
      if (!subjName) return;
      state._gradeSubjectsScrollY = window.pageYOffset || 0;
      _exitCurrent('left', { duration: 0.13, distance: 12, scale: 0.995 }).then(() => {
        const tv = state.view || 'voti';
        state.activeSubject = subjName;
        _renderViewDirect(tv); _animateViewEntrance(tv, 'right');
        window.scrollTo({ top: 0, behavior: 'instant' });
      });
    };
    window.navigateSubject._isV3 = true;

    window.closeSubject = function () {
      const ry = Number.isFinite(state._gradeSubjectsScrollY) ? state._gradeSubjectsScrollY : null;
      _exitCurrent('right', { duration: 0.13, distance: 12, scale: 0.995 }).then(() => {
        const tv = state.view || 'voti';
        state.activeSubject = null;
        _renderViewDirect(tv); _animateViewEntrance(tv, 'left');
        if (ry !== null) { window.scrollTo({ top: ry, behavior: 'instant' }); state._gradeSubjectsScrollY = null; }
      });
    };
    window.closeSubject._isV3 = true;
  };

  // ── Button press feedback ─────────────────────────────────────
  function _installButtonFeedback(scope = document) {
    if (typeof gsap === 'undefined' || !scope) return;
    scope.querySelectorAll('.nav-item, button, .pill, .profile-trigger, [role="button"], [onclick]').forEach(el => {
      if (el.dataset.gFluidPressReady === '1') return;
      el.dataset.gFluidPressReady = '1';
      const press   = () => { gsap.killTweensOf(el); gsap.to(el, { scale: 0.93, duration: 0.07, ease: 'power2.out',  overwrite: 'auto' }); };
      const release = () => { gsap.killTweensOf(el); gsap.to(el, { scale: 1,    duration: 0.24, ease: 'back.out(2)', overwrite: 'auto' }); };
      el.addEventListener('pointerdown',   press,   { passive: true });
      el.addEventListener('pointerup',     release, { passive: true });
      el.addEventListener('pointercancel', release, { passive: true });
      el.addEventListener('pointerleave',  release, { passive: true });
    });
  }

  // ── Circolari surgical update ─────────────────────────────────
  const _patchCircolari = () => {
    if (typeof window.loadCircolari !== 'function' || window.loadCircolari._isV3) return;
    const _orig = window.loadCircolari;
    window.loadCircolari = async function loadCircolari() {
      try {
        const base = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : (window.API_BASE_URL || '');
        const res  = await fetch(`${base}/api/circolari`);
        if (!res.ok) return _orig();
        const data = await res.json();
        if (!data.success || !data.circolari) return;
        state.circolari = data.circolari;
        if (state.view !== 'home') return;
        const scroll = document.querySelector('.circolari-scroll');
        if (!scroll) return;
        gsap.to(scroll, { opacity: 0, duration: 0.12, onComplete: () => {
          scroll.innerHTML = (state.circolari || []).map(c => `
            <div onclick="mostraCircolare('${escapeJsSingleQuote(c.id)}')" style="cursor:pointer; padding:18px; border-radius:20px;
                background:var(--bg-card); border:1px solid rgba(0,0,0,0.06);
                display:flex; flex-direction:column; gap:8px; min-width:220px; max-width:240px; flex-shrink:0; scroll-snap-align:start;
                box-shadow:0 2px 8px rgba(0,0,0,0.04),0 4px 16px rgba(99,102,241,0.04);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                    <div style="font-size:11px;color:var(--accent-warm);font-weight:800;text-transform:uppercase;letter-spacing:0.5px;">N. ${escapeHtml(c.numero)}</div>
                    ${c.sintesi ? '<i class="ph-fill ph-check-circle" style="color:var(--green);font-size:14px;"></i>' : ''}
                </div>
                <div style="font-size:15px;font-weight:700;color:var(--text-primary);line-height:1.4;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">${escapeHtml(c.titolo)}</div>
                <div style="font-size:11px;color:var(--text-dim);margin-top:auto;font-weight:600;">
                    <i class="ph ph-calendar-blank" style="vertical-align:middle;margin-right:4px;"></i>${escapeHtml(c.data)}
                </div>
            </div>`).join('');
          gsap.to(scroll, { opacity: 1, duration: 0.14 });
          gsap.fromTo(scroll.children,
            { x: 12, opacity: 0 },
            { x: 0, opacity: 1, stagger: 0.055, duration: 0.36, ease: 'power2.out' }
          );
        }});
      } catch(e) { _orig(); }
    };
    window.loadCircolari._isV3 = true;
  };

  // ── INIT ─────────────────────────────────────────────────────
  const init = () => {
    _installCoreRender();
    _installNavigation();
    _installSubjectTransitions();
    _patchCircolari();
    _installButtonFeedback(document);
    _installCardHover(document);
    document.addEventListener('animationend', (e) => {
      setTimeout(() => e.target.classList.add('anim-done'), 100);
    }, true);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

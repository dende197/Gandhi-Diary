/* ================================================================
   G-CONNECT — FLUIDITY ENGINE v3.1 (ULTIMATE CONSOLIDATION)
   
   Questo script unifica e sostituisce:
   - perf-patch.js
   - patch-finale.js
   - nav-transition.js
   - coherence-patch.js
   
   OBIETTIVO: Fluidità estrema (60fps), zero flash, zero lag, zero duplicati.
   ================================================================ */

(function fluidityEngineV3() {
  console.log('🚀 G-Connect Fluidity Engine v3.1 - Initializing...');

  const escapeHtml = (str) =>
    (typeof window.escapeHtml === 'function' ? window.escapeHtml(str) : String(str ?? ''));
  const escapeJsSingleQuote = (str) =>
    (typeof window.escapeJsSingleQuote === 'function' ? window.escapeJsSingleQuote(str) : String(str ?? ''));

  function _setWillChange(el, enabled) {
    if (!el) return;
    el.style.willChange = enabled ? 'transform, opacity' : 'auto';
  }

  function _directionVector(direction, distance = 10) {
    switch (direction) {
      case 'left': return { x: -distance, y: 0 };
      case 'right': return { x: distance, y: 0 };
      case 'down': return { x: 0, y: distance };
      case 'up':
      default:
        return { x: 0, y: -distance };
    }
  }

  function _exitCurrent(direction = 'up', opts = {}) {
    const { duration = 0.14, distance = 10, scale = 0.995 } = opts;
    const root = document.getElementById('app');
    const currentView = root ? root.querySelector('.view') : null;
    if (!currentView || typeof gsap === 'undefined') return Promise.resolve();

    const to = _directionVector(direction, distance);
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        gsap.killTweensOf(currentView);
        _setWillChange(currentView, false);
        resolve();
      };
      _setWillChange(currentView, true);
      gsap.killTweensOf(currentView);
      gsap.to(currentView, {
        opacity: 0,
        x: to.x,
        y: to.y,
        scale,
        duration,
        ease: 'power2.in',
        overwrite: 'auto',
        onComplete: finish
      });
      setTimeout(finish, Math.ceil(duration * 1000) + 80);
    });
  }

  function _enterView(direction = 'down', opts = {}) {
    const { duration = 0.24, distance = 10, scale = 1 } = opts;
    const viewEl = document.querySelector('.view');
    if (!viewEl || typeof gsap === 'undefined') return;
    const from = _directionVector(direction, distance);
    _setWillChange(viewEl, true);
    gsap.killTweensOf(viewEl);
    gsap.fromTo(viewEl,
      { opacity: 0, x: from.x, y: from.y, scale },
      {
        opacity: 1,
        x: 0,
        y: 0,
        scale: 1,
        duration,
        ease: 'power3.out',
        overwrite: 'auto',
        onComplete: () => _setWillChange(viewEl, false)
      }
    );
  }

  // ── 1. CORE RENDER SYSTEM (Deduplication & Lock) ──────────────
  let _lastRenderTime = 0;
  const RENDER_MIN_GAP = 400; // ms: impedisce doppi render da burst asincroni

  // Sostituiamo il motore di rendering globale
  const _installCoreRender = () => {
    if (typeof window.render !== 'function' || window.render._isV3) return;
    
    // Cancel any pending timers from ui.js before we take over
    clearTimeout(window._gRenderTimer);
    if (window._gRenderRAF) { cancelAnimationFrame(window._gRenderRAF); window._gRenderRAF = null; }
    
    // Salviamo l'originale _renderCore (quello che scrive l'HTML)
    const _origRenderCore = window._renderCore;
    
    // Ridefiniamo render() con lock e rAF — usa shared globals
    window.render = function render() {
      if (window._gRenderRAF || state.booting || state._loggedOut) return;
      
      const now = performance.now();
      if (now - _lastRenderTime < RENDER_MIN_GAP) {
        // Coalizza: se arriva un altro render troppo presto, lo slittiamo
        clearTimeout(window._gRenderTimer);
        window._gRenderTimer = setTimeout(window.render, RENDER_MIN_GAP);
        return;
      }
      
      _lastRenderTime = now;
      window._gRenderRAF = requestAnimationFrame(() => {
        // ── DEFINITIVE FIX: Re-check logout flag INSIDE the RAF callback ──
        if (state._loggedOut) {
            window._gRenderRAF = null;
            return;
        }
        if (typeof _origRenderCore === 'function') _origRenderCore();
        window._gRenderRAF = null;
      });
    };
    window.render._isV3 = true;

    // Ridefiniamo scheduleRender() — usa shared globals
    window.scheduleRender = function scheduleRender(delay = 80) {
      clearTimeout(window._gRenderTimer);
      // delay=0 -> aspetta comunque un frame per permettere il raggruppamento (deduplication)
      const d = delay <= 0 ? 16 : delay;
      window._gRenderTimer = setTimeout(window.render, d);
    };

    console.log('✅ Fluidity Engine: Core Render Lock installed.');
  };

  // ── 2. ZERO-LATENCY NAVIGATION ────────────────────────────────
  const _installNavigation = () => {
    if (typeof window.navigate !== 'function' || window.navigate._isV3) return;

    window.navigate = function navigate(v) {
      const allowedViews = ['login', 'home', 'planner', 'voti', 'ai_assistant', 'academic_profile', 'profile', 'circolari'];
      const canAccessRequested = allowedViews.includes(v) && (state.isLoggedIn || v === 'login');
      if (!canAccessRequested) v = state.isLoggedIn ? 'home' : 'login';

      // Clear _loggedOut flag when navigating to a real view (e.g. after login)
      if (v !== 'login' && state.isLoggedIn && state._loggedOut) {
          state._loggedOut = false;
      }

      if (v === state.view) {
        // If auth/session state changed while staying on the same view, refresh DOM immediately.
        const fallbackRefresh = () => {
          if (typeof window.scheduleRender === 'function') window.scheduleRender(0);
        };
        try {
          if (typeof _renderViewDirect === 'function') _renderViewDirect(v);
          else fallbackRefresh();
        } catch (e) {
          console.warn('Direct same-view refresh failed, fallback to scheduleRender:', e);
          fallbackRefresh();
        }
        return;
      }

      const targetHash = '#' + v;
      if (window.location.hash !== targetHash) {
        window.history.pushState(null, '', targetHash);
      }

      const performTransition = () => {
        state.view = v;
        if (typeof saveNavigationState === 'function') saveNavigationState();
        
        // Scroll immediato a top
        window.scrollTo({ top: 0, behavior: 'instant' });

        // Scrittura diretta DOM per eliminare i 80ms di scheduleRender
        if (typeof _renderViewDirect === 'function') _renderViewDirect(v);
        
        // Update nav
        const navContainer = document.getElementById('nav-container');
        if (navContainer && typeof renderNav === 'function') {
          navContainer.innerHTML = renderNav();
        }
        
        // Enter animation
        _animateViewEntrance(v);
      };

      if (!state.isLoggedIn || v === 'login') {
        performTransition();
        return;
      }
      _exitCurrent('up', { duration: 0.14, distance: 8, scale: 0.995 }).then(performTransition);
    };
    window.navigate._isV3 = true;
    console.log('✅ Fluidity Engine: Zero-Latency Navigation installed.');
  };

  // Helper per rendering diretto
  function _renderViewDirect(view) {
    if (state._loggedOut && view !== 'login') return; // Post-logout guard
    const root = document.getElementById('app');
    if (!root) return;
    const nav = document.getElementById('nav-container');

    if (!state.isLoggedIn || view === 'login') {
      document.body.classList.add('logged-out');
      document.body.classList.remove('is-ai-mode');
      document.body.style.overflow = '';
      document.body.style.height = '';
      root.style.overflow = 'visible';
      root.style.height = '';
      root.innerHTML = (typeof renderLogin === 'function') ? renderLogin() : '';
      if (nav) nav.innerHTML = '';
      return;
    }
    document.body.classList.remove('logged-out');
    
    // Fix: Set AI mode class BEFORE innerHTML so CSS rules are active during first layout
    const isAI = view === 'ai_assistant';
    if (isAI) {
      document.body.classList.add('is-ai-mode');
      document.body.style.overflow = 'hidden';
      document.body.style.height = '100svh';
      root.style.overflow = 'hidden';
      root.style.height = '100%';
    } else {
      document.body.classList.remove('is-ai-mode');
      document.body.style.overflow = '';
      document.body.style.height = '';
      root.style.overflow = 'visible';
      root.style.height = '';
    }

    let html = '';
    switch (view) {
      case 'home':            html = (typeof renderHome === 'function') ? renderHome() : ''; break;
      case 'planner':         html = (typeof renderPlanner === 'function') ? renderPlanner() : ''; break;
      case 'voti':            html = (typeof renderGradesView === 'function') ? renderGradesView() : ''; break;
      case 'ai_assistant':    html = (typeof renderAIAssistantView === 'function') ? renderAIAssistantView() : ''; break;
      case 'academic_profile':html = (typeof renderAcademicProfile === 'function') ? renderAcademicProfile() : ''; break;
      case 'profile':         html = (typeof renderProfile === 'function') ? renderProfile() : ''; break;
      case 'circolari':       html = (typeof renderCircolariView === 'function') ? renderCircolariView() : ''; break;
      default:                html = (typeof renderHome === 'function') ? renderHome() : ''; break;
    }
    root.innerHTML = html;
    
    // Async hooks per canvas/charts
    requestAnimationFrame(() => {
      if (view === 'home') {
        const mediaVal = parseFloat((typeof calcolaMedia === 'function') ? calcolaMedia(state.voti) : 0) || 0;
        if (typeof renderMediaGauge === 'function') renderMediaGauge(mediaVal);
      }
      if (view === 'planner' && typeof renderCustomCalendar === 'function') renderCustomCalendar();
      if (view === 'voti' && typeof initGradesCharts === 'function') initGradesCharts();
    });
  }

  // ── 3. UNIFIED ANIMATION SYSTEM (V6 STANDARD) ───────────────
  function _animateViewEntrance(view, direction = 'down') {
    if (!state.isLoggedIn || view === 'login') return;
    if (typeof gsap === 'undefined') return;
    const viewEl = document.querySelector('.view');
    if (!viewEl) return;
    _enterView(direction, { duration: 0.26, distance: 10, scale: 0.99 });

    // 2. Card & Widget Header Stagger (Inner Elements)
    const cards = viewEl.querySelectorAll('.card, .subject-summary-card, .greeting-card, .streak-card, .verifica-card, .widget-header');
    if (cards.length > 0) {
      gsap.killTweensOf(cards);
      gsap.fromTo(cards,
        { opacity: 0, y: 10 },
        {
          opacity: 1,
          y: 0,
          duration: 0.36,
          stagger: 0.03,
          ease: "power2.out",
          delay: 0.07,
          clearProps: "transform,opacity"
        }
      );
    }

    // 3. Row Stagger (List Content)
    const items = viewEl.querySelectorAll('.task-row, .grade-row, .circolari-scroll > div, #weekly-agenda-list > div, .studio-entry');
    if (items.length > 0) {
      gsap.killTweensOf(items);
      gsap.fromTo(items,
        { opacity: 0, y: 6 },
        {
          opacity: 1,
          y: 0,
          duration: 0.32,
          stagger: 0.02,
          ease: "power1.out",
          delay: 0.14,
          clearProps: "transform,opacity"
        }
      );
    }

    _installButtonFeedback(viewEl);
  }

  const _installSubjectTransitions = () => {
    if (window.navigateSubject && window.navigateSubject._isV3) return;
    window.navigateSubject = function navigateSubject(subjName) {
      if (!subjName) return;
      state._gradeSubjectsScrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
      _exitCurrent('left', { duration: 0.14, distance: 12, scale: 0.995 }).then(() => {
        const targetView = state.view || 'voti';
        state.activeSubject = subjName;
        _renderViewDirect(targetView);
        _animateViewEntrance(targetView, 'right');
        window.scrollTo({ top: 0, behavior: 'instant' });
      });
    };
    window.navigateSubject._isV3 = true;

    window.closeSubject = function closeSubject() {
      const restoreY = Number.isFinite(state._gradeSubjectsScrollY) ? state._gradeSubjectsScrollY : null;
      _exitCurrent('right', { duration: 0.14, distance: 12, scale: 0.995 }).then(() => {
        const targetView = state.view || 'voti';
        state.activeSubject = null;
        _renderViewDirect(targetView);
        _animateViewEntrance(targetView, 'left');
        if (restoreY !== null) {
          window.scrollTo({ top: restoreY, behavior: 'instant' });
          state._gradeSubjectsScrollY = null;
        }
      });
    };
    window.closeSubject._isV3 = true;
  };

  function _installButtonFeedback(scope = document) {
    if (typeof gsap === 'undefined' || !scope) return;
    const nodes = scope.querySelectorAll('.nav-item, button, .pill, .profile-trigger, [role="button"], [onclick]');
    nodes.forEach((el) => {
      if (el.dataset.gFluidPressReady === '1') return;
      el.dataset.gFluidPressReady = '1';

      const press = () => {
        gsap.killTweensOf(el);
        gsap.to(el, { scale: 0.94, duration: 0.08, ease: 'power2.out', overwrite: 'auto' });
      };
      const release = () => {
        gsap.killTweensOf(el);
        gsap.to(el, { scale: 1, duration: 0.26, ease: 'back.out(2)', overwrite: 'auto' });
      };

      el.addEventListener('pointerdown', press, { passive: true });
      el.addEventListener('pointerup', release, { passive: true });
      el.addEventListener('pointercancel', release, { passive: true });
      el.addEventListener('pointerleave', release, { passive: true });
    });
  }

  // ── 4. SURGICAL CIRCOLARI UPDATE ─────────────────────────────
  const _patchCircolari = () => {
    if (typeof window.loadCircolari !== 'function' || window.loadCircolari._isV3) return;
    
    const _orig = window.loadCircolari;
    window.loadCircolari = async function loadCircolari() {
      try {
        const baseUrl = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : (window.API_BASE_URL || '');
        const res = await fetch(`${baseUrl}/api/circolari`);
        if (!res.ok) return _orig();
        
        const data = await res.json();
        if (!data.success || !data.circolari) return;
        
        state.circolari = data.circolari;
        if (state.view !== 'home') return;
        
        const scroll = document.querySelector('.circolari-scroll');
        if (!scroll) return;
        
        // Update chirurgico cross-fade
        gsap.to(scroll, { opacity: 0, duration: 0.15, onComplete: () => {
          scroll.innerHTML = (state.circolari || []).map(c => `
            <div onclick="mostraCircolare('${escapeJsSingleQuote(c.id)}')" style="cursor:pointer; padding:18px; border-radius:20px;
                background:var(--bg-card); border:1px solid rgba(0,0,0,0.06);
                display:flex; flex-direction:column; gap:8px; min-width: 220px; max-width: 240px; flex-shrink: 0; scroll-snap-align: start;
                box-shadow: 0 2px 8px rgba(0,0,0,0.04), 0 4px 16px rgba(99,102,241,0.04);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <div style="font-size:11px; color:var(--accent-warm); font-weight:800; text-transform:uppercase; letter-spacing:0.5px;">N. ${escapeHtml(c.numero)}</div>
                    ${c.sintesi ? '<i class="ph-fill ph-check-circle" style="color:var(--green); font-size:14px;"></i>' : ''}
                </div>
                <div style="font-size:15px; font-weight:700; color:var(--text-primary); line-height:1.4; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;">
                    ${escapeHtml(c.titolo)}
                </div>
                <div style="font-size:11px; color:var(--text-dim); margin-top:auto; font-weight:600;">
                    <i class="ph ph-calendar-blank" style="vertical-align: middle; margin-right:4px;"></i> ${escapeHtml(c.data)}
                </div>
            </div>
          `).join('');
          gsap.to(scroll, { opacity: 1, duration: 0.15 });
          gsap.fromTo(scroll.children, { x: 14, opacity: 0 }, { x: 0, opacity: 1, stagger: 0.06, duration: 0.4, ease: 'power2.out' });
        }});
      } catch(e) { _orig(); }
    };
    window.loadCircolari._isV3 = true;
  };

  // ── 5. INITIALIZATION BOOTSTRAP ──────────────────────────────
  const init = () => {
    _installCoreRender();
    _installNavigation();
    _installSubjectTransitions();
    _patchCircolari();
    _installButtonFeedback(document);
    
    // Cleanup will-change
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

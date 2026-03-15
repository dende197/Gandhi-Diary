/* ================================================================
   G-CONNECT — FLUIDITY ENGINE v3.0 (ULTIMATE CONSOLIDATION)
   
   Questo script unifica e sostituisce:
   - perf-patch.js
   - patch-finale.js
   - nav-transition.js
   - coherence-patch.js
   
   OBIETTIVO: Fluidità estrema (60fps), zero flash, zero lag, zero duplicati.
   ================================================================ */

(function fluidityEngineV3() {
  console.log('🚀 G-Connect Fluidity Engine v3.0 - Initializing...');

  // ── 1. CORE RENDER SYSTEM (Deduplication & Lock) ──────────────
  let _lastRenderTime = 0;
  const RENDER_MIN_GAP = 50; // ms: impedisce doppi render da burst asincroni
  let _renderRequest = null;
  let _scheduleTimer = null;

  // Sostituiamo il motore di rendering globale
  const _installCoreRender = () => {
    if (typeof window.render !== 'function' || window.render._isV3) return;
    
    // Salviamo l'originale _renderCore (quello che scrive l'HTML)
    const _origRenderCore = window._renderCore;
    
    // Ridefiniamo render() con lock e rAF
    window.render = function render() {
      if (_renderRequest || state.booting) return;
      
      const now = performance.now();
      if (now - _lastRenderTime < RENDER_MIN_GAP) {
        // Coalizza: se arriva un altro render troppo presto, lo slittiamo
        clearTimeout(_scheduleTimer);
        _scheduleTimer = setTimeout(window.render, RENDER_MIN_GAP);
        return;
      }
      
      _lastRenderTime = now;
      _renderRequest = requestAnimationFrame(() => {
        if (typeof _origRenderCore === 'function') _origRenderCore();
        _renderRequest = null;
      });
    };
    window.render._isV3 = true;

    // Ridefiniamo scheduleRender()
    window.scheduleRender = function scheduleRender(delay = 80) {
      clearTimeout(_scheduleTimer);
      // delay=0 -> aspetta comunque un frame per permettere il raggruppamento (deduplication)
      const d = delay <= 0 ? 16 : delay;
      _scheduleTimer = setTimeout(window.render, d);
    };

    console.log('✅ Fluidity Engine: Core Render Lock installed.');
  };

  // ── 2. ZERO-LATENCY NAVIGATION ────────────────────────────────
  const _installNavigation = () => {
    if (typeof window.navigate !== 'function' || window.navigate._isV3) return;

    window.navigate = function navigate(v) {
      const allowedViews = ['home', 'planner', 'voti', 'ai_assistant', 'academic_profile', 'profile', 'mental_health'];
      if (!allowedViews.includes(v)) v = 'home';
      if (v === state.view) return;

      const targetHash = '#' + v;
      if (window.location.hash !== targetHash) {
        window.history.pushState(null, '', targetHash);
      }

      const root = document.getElementById('app');
      const currentView = root ? root.querySelector('.view') : null;

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

      if (currentView && typeof gsap !== 'undefined') {
        gsap.to(currentView, {
          opacity: 0, y: -8, scale: 0.99,
          duration: 0.15, ease: 'power2.in',
          onComplete: performTransition
        });
      } else {
        performTransition();
      }
    };
    window.navigate._isV3 = true;
    console.log('✅ Fluidity Engine: Zero-Latency Navigation installed.');
  };

  // Helper per rendering diretto
  function _renderViewDirect(view) {
    const root = document.getElementById('app');
    if (!root) return;
    
    let html = '';
    switch (view) {
      case 'home':            html = (typeof renderHome === 'function') ? renderHome() : ''; break;
      case 'planner':         html = (typeof renderPlanner === 'function') ? renderPlanner() : ''; break;
      case 'voti':            html = (typeof renderGradesView === 'function') ? renderGradesView() : ''; break;
      case 'ai_assistant':    html = (typeof renderAIAssistantView === 'function') ? renderAIAssistantView() : ''; break;
      case 'academic_profile':html = (typeof renderAcademicProfile === 'function') ? renderAcademicProfile() : ''; break;
      case 'profile':         html = (typeof renderProfile === 'function') ? renderProfile() : ''; break;
      case 'mental_health':   html = (typeof renderMentalHealthView === 'function') ? renderMentalHealthView() : ''; break;
      default:                html = (typeof renderHome === 'function') ? renderHome() : ''; break;
    }
    root.innerHTML = html;
    
    // Async hooks per canvas/charts
    requestAnimationFrame(() => {
      if (view === 'home') {
        if (typeof initStressWaveFromState === 'function') initStressWaveFromState();
        const mediaVal = parseFloat((typeof calcolaMedia === 'function') ? calcolaMedia(state.voti) : 0) || 0;
        if (typeof renderMediaGauge === 'function') renderMediaGauge(mediaVal);
      }
      if (view === 'planner' && typeof renderCustomCalendar === 'function') renderCustomCalendar();
      if (view === 'voti' && typeof initGradesCharts === 'function') initGradesCharts();
    });
  }

  // ── 3. UNIFIED ANIMATION SYSTEM (GSAP Orchestration) ─────────
  const T = {
    hero:     { duration: 0.55, delay: 0,    ease: 'power3.out' },
    mainCard: { duration: 0.60, delay: 0.14, ease: 'back.out(1.2)' },
    tabBar:   { duration: 0.45, delay: 0.18, ease: 'power2.out' },
    calendar: { duration: 0.48, delay: 0.24, ease: 'power2.out' },
    header:   { duration: 0.40, delay: 0.28, ease: 'power2.out' },
    items:    { duration: 0.45, delay: 0.32, stagger: 0.065, ease: 'power2.out' },
    generic:  { duration: 0.45, delay: 0,    ease: 'power2.out' },
  };

  function _animateViewEntrance(view) {
    if (typeof gsap === 'undefined') return;
    
    // Piccolo delay per permettere al browser di fare il paint del nuovo DOM
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (view === 'home') _animHome();
        else if (view === 'planner') _animPlanner();
        else if (view === 'voti') _animVoti();
        else _animGeneric();
      });
    });
  }

  function _animHome() {
    // Hero
    const hero = document.querySelector('.hero-container');
    if (hero) gsap.fromTo(hero, { y: 14, opacity: 0, scale: 0.98 }, { y: 0, opacity: 1, scale: 1, duration: 0.45, ease: 'power3.out', clearProps: 'transform' });

    // Metric Cards
    const cards = document.querySelectorAll('.metric-card');
    if (cards.length) gsap.fromTo(cards, { y: 20, opacity: 0, scale: 0.96 }, { y: 0, opacity: 1, scale: 1, duration: 0.5, stagger: 0.08, ease: 'back.out(1.4)', delay: 0.18, clearProps: 'transform' });

    // Circolari & Agenda
    const items = document.querySelectorAll('.circolari-scroll > div, #weekly-agenda-list > div');
    if (items.length) gsap.fromTo(items, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.38, stagger: 0.05, ease: 'power2.out', delay: 0.4, clearProps: 'all' });
  }

  function _animPlanner() {
    const hero = document.querySelector('.view > div:first-child');
    if (hero) gsap.fromTo(hero, { y: 16, opacity: 0, scale: 0.98 }, { y: 0, opacity: 1, scale: 1, duration: T.hero.duration, ease: T.hero.ease });
    
    const items = document.querySelectorAll('#weekly-agenda-list > div, .registro-card, .studio-entry');
    if (items.length) gsap.fromTo(items, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: T.items.duration, stagger: T.items.stagger, delay: T.items.delay, ease: T.items.ease });
  }

  function _animVoti() {
    const hero = document.querySelector('.view > div:first-child');
    if (hero) gsap.fromTo(hero, { y: 16, opacity: 0, scale: 0.98 }, { y: 0, opacity: 1, scale: 1, duration: T.hero.duration, ease: T.hero.ease });
    
    const subjects = document.querySelectorAll('.subject-summary-card');
    if (subjects.length) gsap.fromTo(subjects, { x: -10, opacity: 0 }, { x: 0, opacity: 1, duration: T.items.duration, stagger: T.items.stagger, delay: T.items.delay, ease: T.items.ease });
  }

  function _animGeneric() {
    const view = document.querySelector('.view');
    if (view) gsap.fromTo(view, { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: T.generic.duration, ease: T.generic.ease });
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
            <div onclick="mostraCircolare('${c.id}')" style="cursor:pointer; padding:18px; border-radius:20px;
                background:var(--bg-card); border:1px solid rgba(0,0,0,0.06);
                display:flex; flex-direction:column; gap:8px; min-width: 220px; max-width: 240px; flex-shrink: 0; scroll-snap-align: start;
                box-shadow: 0 2px 8px rgba(0,0,0,0.04), 0 4px 16px rgba(99,102,241,0.04);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <div style="font-size:11px; color:var(--accent-warm); font-weight:800; text-transform:uppercase; letter-spacing:0.5px;">N. ${c.numero}</div>
                    ${c.sintesi ? '<i class="ph-fill ph-check-circle" style="color:var(--green); font-size:14px;"></i>' : ''}
                </div>
                <div style="font-size:15px; font-weight:700; color:var(--text-primary); line-height:1.4; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;">
                    ${c.titolo}
                </div>
                <div style="font-size:11px; color:var(--text-dim); margin-top:auto; font-weight:600;">
                    <i class="ph ph-calendar-blank" style="vertical-align: middle; margin-right:4px;"></i> ${c.data}
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
    _patchCircolari();
    
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

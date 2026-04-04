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

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeJsSingleQuote(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
  }

  // ── 1. CORE RENDER SYSTEM (Deduplication & Lock) ──────────────
  let _lastRenderTime = 0;
  const RENDER_MIN_GAP = 50; // ms: impedisce doppi render da burst asincroni

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
      if (window._gRenderRAF || state.booting) return;
      
      const now = performance.now();
      if (now - _lastRenderTime < RENDER_MIN_GAP) {
        // Coalizza: se arriva un altro render troppo presto, lo slittiamo
        clearTimeout(window._gRenderTimer);
        window._gRenderTimer = setTimeout(window.render, RENDER_MIN_GAP);
        return;
      }
      
      _lastRenderTime = now;
      window._gRenderRAF = requestAnimationFrame(() => {
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
      const allowedViews = ['home', 'planner', 'voti', 'ai_assistant', 'academic_profile', 'profile', 'circolari'];
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
  function _animateViewEntrance(view) {
    if (typeof gsap === 'undefined') return;
    
    requestAnimationFrame(() => {
      const viewEl = document.querySelector('.view');
      if (!viewEl) return;

      // 1. View Entrance (Fade + Slide + Scale)
      gsap.fromTo(viewEl, 
        { opacity: 0, y: 15, scale: 0.985 },
        { 
          opacity: 1, 
          y: 0, 
          scale: 1, 
          duration: 0.5, 
          ease: "power3.out",
          clearProps: "transform"
        }
      );

      // 2. Card & Widget Header Stagger (Inner Elements)
      const cards = viewEl.querySelectorAll('.card, .subject-summary-card, .greeting-card, .streak-card, .verifica-card, .widget-header');
      if (cards.length > 0) {
        gsap.fromTo(cards,
          { opacity: 0, y: 12 },
          {
            opacity: 1,
            y: 0,
            duration: 0.45,
            stagger: 0.05,
            ease: "power2.out",
            delay: 0.1,
            clearProps: "transform"
          }
        );
      }

      // 3. Row Stagger (List Content)
      const items = viewEl.querySelectorAll('.task-row, .grade-row, .circolari-scroll > div, #weekly-agenda-list > div, .studio-entry');
      if (items.length > 0) {
        gsap.fromTo(items,
          { opacity: 0, y: 8 },
          {
            opacity: 1,
            y: 0,
            duration: 0.4,
            stagger: 0.03,
            ease: "power1.out",
            delay: 0.25,
            clearProps: "all"
          }
        );
      }
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

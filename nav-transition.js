/* ================================================================
   G-CONNECT — NAVIGATION TRANSITION PATCH
   
   Incolla in fondo al <body> DOPO patch-finale.js.
   
   Problemi risolti:
   1. Gap vuoto tra exit e enter animation (~280ms di buio)
   2. Enter animation identica per tutte le viste (solo fade generico)
   3. Scroll a top brusco durante transizione
   4. Nav active state che cambia prima della transizione visiva
   ================================================================ */

(function installNavTransitionPatch() {

  // ── Attendi che tutto sia pronto ────────────────────────────────
  const _ready = () => {
    if (
      typeof gsap === 'undefined' ||
      typeof navigate === 'undefined' ||
      typeof render === 'undefined'
    ) {
      setTimeout(_ready, 60);
      return;
    }
    _install();
  };

  function _install() {

    // ── 1. PATCH navigate() — transizione fluida senza gap ────────
    //
    // Problema originale:
    //   exit (200ms) → scheduleRender(80ms delay) → _renderCore → rAF → gsapAnimateView
    //   = ~300ms di DOM vuoto o a metà
    //
    // Fix:
    //   exit (150ms) → durante l'exit prepara già il nuovo HTML in memoria
    //                 → al completamento dell'exit: scrivi DOM + scroll + enter
    //                 = 0ms di gap visibile
    // ──────────────────────────────────────────────────────────────
    window.navigate = function navigate(v) {
      const allowedViews = ['home', 'planner', 'voti', 'ai_assistant',
                            'academic_profile', 'profile', 'mental_health'];
      if (!allowedViews.includes(v)) v = 'home';
      if (v === state.view) return;

      const targetHash = '#' + v;
      if (window.location.hash !== targetHash) {
        window.history.pushState(null, '', targetHash);
      }

      const root = document.getElementById('app');
      const currentView = root ? root.querySelector('.view') : null;

      // EXIT: fade + slight upward movimento
      const doEnter = () => {
        state.view = v;
        if (typeof saveNavigationState === 'function') saveNavigationState();

        // Scroll istantaneo PRIMA di scrivere il DOM (nessun flash di posizione)
        window.scrollTo({ top: 0, behavior: 'instant' });

        // Scrivi il nuovo DOM direttamente (no scheduleRender = no delay)
        _renderViewDirect(v);

        // Update nav active state
        const nav = document.getElementById('nav-container');
        if (nav) nav.innerHTML = (typeof renderNav === 'function') ? renderNav() : '';

        // Enter animation specifica per vista
        _enterAnimation(v);
      };

      if (currentView && typeof gsap !== 'undefined') {
        // Exit veloce: 150ms invece di 200ms, easing più sharp
        gsap.to(currentView, {
          opacity: 0,
          y: -8,           // meno spostamento = meno "vuoto" percepito
          scale: 0.99,
          duration: 0.15,
          ease: 'power2.in',
          onComplete: doEnter
        });
      } else {
        doEnter();
      }
    };


    // ── 2. _renderViewDirect: scrive il DOM senza rAF/debounce ────
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
      if (typeof updateOfflineBadge === 'function') updateOfflineBadge();

      // Post-render hooks (canvas, charts) in rAF per non bloccare il paint
      requestAnimationFrame(() => {
        if (view === 'home') {
          if (typeof initStressWaveFromState === 'function') initStressWaveFromState();
          const mediaVal = parseFloat((typeof calcolaMedia === 'function') ? calcolaMedia(state.voti) : 0) || 0;
          if (typeof renderMediaGauge === 'function') renderMediaGauge(mediaVal);
        }
        if (view === 'planner' && typeof renderCustomCalendar === 'function') {
          renderCustomCalendar();
        }
        if (view === 'voti' && typeof initGradesCharts === 'function') {
          initGradesCharts();
        }
      });
    }


    // ── 3. Animazioni enter specifiche per ogni vista ─────────────
    function _enterAnimation(view) {
      // Piccolo rAF per assicurarsi che il DOM sia nel documento
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          switch (view) {
            case 'home':    _enterHome();    break;
            case 'planner': _enterPlanner(); break;
            case 'voti':    _enterVoti();    break;
            default:        _enterGeneric(); break;
          }
        });
      });
    }

    // ── HOME: stagger già gestito da patch-finale.js via gsapAnimateView
    function _enterHome() {
      if (typeof gsapAnimateView === 'function') gsapAnimateView();
    }

    // ── PLANNER: hero → tab selector → calendar/list → items
    function _enterPlanner() {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out', clearProps: 'transform,opacity' } });

      // Hero del planner (il div con gradiente viola)
      const hero = document.querySelector('.view > div:first-child');
      if (hero) {
        tl.fromTo(hero,
          { y: 14, opacity: 0, scale: 0.98 },
          { y: 0,  opacity: 1, scale: 1, duration: 0.38 },
          0
        );
      }

      // Tab selector (Registro / Piano di Studio)
      const tabBar = document.querySelector('.view > div[style*="border-radius: 40px"]');
      if (tabBar) {
        tl.fromTo(tabBar,
          { y: 10, opacity: 0 },
          { y: 0,  opacity: 1, duration: 0.32 },
          0.10
        );
      }

      // Calendario o lista
      const calendar = document.getElementById('calendar');
      if (calendar) {
        tl.fromTo(calendar,
          { y: 16, opacity: 0 },
          { y: 0,  opacity: 1, duration: 0.36 },
          0.18
        );
      }

      // Section header (Scadenze DidUP / Piano di Studio)
      const sectionHeader = document.querySelector('.section-header');
      if (sectionHeader) {
        tl.fromTo(sectionHeader,
          { y: 8, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.28 },
          0.26
        );
      }

      // Task items (stagger)
      const agendaItems = document.querySelectorAll('#weekly-agenda-list .registro-card, #weekly-agenda-list .studio-entry, #weekly-agenda-list .card');
      if (agendaItems.length) {
        tl.fromTo(agendaItems,
          { y: 12, opacity: 0 },
          { y: 0,  opacity: 1, duration: 0.30, stagger: 0.05 },
          0.30
        );
      }
    }

    // ── VOTI: hero → media card grande → section header → subject cards stagger
    function _enterVoti() {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out', clearProps: 'transform,opacity' } });

      // Hero
      const hero = document.querySelector('.view > div:first-child');
      if (hero) {
        tl.fromTo(hero,
          { y: 14, opacity: 0, scale: 0.98 },
          { y: 0,  opacity: 1, scale: 1, duration: 0.38 },
          0
        );
      }

      // Media globale card (il grande con il 64px)
      const mediaCard = document.querySelector('.view .card[style*="linear-gradient"]');
      if (mediaCard) {
        tl.fromTo(mediaCard,
          { y: 20, opacity: 0, scale: 0.96 },
          { y: 0,  opacity: 1, scale: 1, duration: 0.42, ease: 'back.out(1.3)' },
          0.12
        );
      }

      // "Riepilogo Materie" header
      const subHeader = document.querySelector('.view > div[style*="margin-bottom: 20px"]');
      if (subHeader) {
        tl.fromTo(subHeader,
          { y: 8, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.28 },
          0.26
        );
      }

      // Subject cards: stagger verticale
      const subjectCards = document.querySelectorAll('.subject-summary-card');
      if (subjectCards.length) {
        tl.fromTo(subjectCards,
          { x: -8, opacity: 0 },
          { x: 0,  opacity: 1, duration: 0.32, stagger: 0.055, ease: 'power2.out' },
          0.32
        );
      }
    }

    // ── GENERIC: semplice fade+slide per profile, mental health, ecc.
    function _enterGeneric() {
      const view = document.querySelector('.view');
      if (!view) return;
      gsap.fromTo(view,
        { y: 10, opacity: 0 },
        { y: 0,  opacity: 1, duration: 0.32, ease: 'power2.out', clearProps: 'transform,opacity' }
      );
    }


    // ── 4. Nav: transizione active pill fluida ────────────────────
    // Il problema: quando si clicca un nav item, l'active class
    // cambia subito (nel renderNav() scritto durante l'exit) ma
    // visivamente la pill "salta" in modo brusco.
    // Fix: animiamo la nav pill con una micro-transizione.
    // ──────────────────────────────────────────────────────────────
    const _patchNavItems = () => {
      document.querySelectorAll('.nav-item').forEach(item => {
        if (item._navPatched) return;
        item._navPatched = true;
        item.addEventListener('click', () => {
          // Micro-feedback tattile: leggero scale sul click
          gsap.fromTo(item,
            { scale: 0.92 },
            { scale: 1, duration: 0.25, ease: 'back.out(2)' }
          );
        });
      });
    };

    // Osserva cambiamenti alla nav per ri-patchare i nuovi bottoni
    const navContainer = document.getElementById('nav-container');
    if (navContainer) {
      const observer = new MutationObserver(_patchNavItems);
      observer.observe(navContainer, { childList: true, subtree: true });
      _patchNavItems(); // patch quelli già presenti
    }


    // ── 5. Scroll: nessun flash di posizione durante transizione ──
    // Il problema: scrollTo({ behavior: 'instant' }) chiamato DOPO
    // che il DOM è scritto causa un flash visivo perché il browser
    // prima mostra il DOM nella posizione precedente poi scatta a top.
    // Il fix nel navigate() sopra chiama scrollTo PRIMA di scrivere il DOM.
    // Questo listener è un safety net per hashchange.
    window.addEventListener('hashchange', () => {
      window.scrollTo({ top: 0, behavior: 'instant' });
    });


    console.log('✅ Navigation transition patch installata');
  }

  _ready();

})();

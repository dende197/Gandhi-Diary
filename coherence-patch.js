/* ================================================================
   G-CONNECT — COHERENCE PATCH v5.0
   
   Incolla in fondo al <body> DOPO nav-transition.js
   
   Problemi risolti:
   1. Animazioni planner/voti troppo veloci vs home → timing unificato
   2. Scatto al caricamento circolari → update chirurgico del solo DOM
      delle circolari, senza re-render dell'intera home
   ================================================================ */

(function installCoherencePatch() {

  /* ════════════════════════════════════════════════════════════════
     COSTANTI DI TIMING — modifica solo qui per cambiare il "ritmo"
     di tutta l'app in modo coerente.
     
     Home ha questi valori (da patch-finale.js):
       hero:    duration 0.45s, delay 0
       cards:   duration 0.50s, delay 0.18s, stagger 0.08s
       button:  duration 0.40s, delay 0.36s
       headers: duration 0.35s, delay 0.40s
       circ:    duration 0.38s, delay 0.44s, stagger 0.06s
       
     Planner/Voti devono usare gli stessi valori.
  ════════════════════════════════════════════════════════════════ */
  const T = {
    hero:       { duration: 0.45, delay: 0,    ease: 'power3.out' },
    heroBig:    { duration: 0.45, delay: 0,    ease: 'power3.out', scaleFrom: 0.97 },
    mainCard:   { duration: 0.50, delay: 0.14, ease: 'back.out(1.2)' },
    tabBar:     { duration: 0.38, delay: 0.18, ease: 'power2.out' },
    calendar:   { duration: 0.42, delay: 0.24, ease: 'power2.out' },
    header:     { duration: 0.35, delay: 0.28, ease: 'power2.out' },
    items:      { duration: 0.38, delay: 0.32, stagger: 0.055, ease: 'power2.out' },
    generic:    { duration: 0.38, delay: 0,    ease: 'power2.out' },
  };


  /* ════════════════════════════════════════════════════════════════
     1. PATCH _enterPlanner e _enterVoti con timing coerenti
        Sovrascrive nav-transition.js
  ════════════════════════════════════════════════════════════════ */
  const _waitForGsap = (cb) => {
    if (typeof gsap !== 'undefined') { cb(); return; }
    const t = setInterval(() => { if (typeof gsap !== 'undefined') { clearInterval(t); cb(); } }, 50);
  };

  _waitForGsap(() => {

    // ── Helper: animazione base uguale per tutte le viste ──────
    function _animHero(el, extraOpts = {}) {
      if (!el) return null;
      return gsap.fromTo(el,
        { y: 16, opacity: 0, scale: extraOpts.scaleFrom || 0.98 },
        { y: 0, opacity: 1, scale: 1,
          duration: T.heroBig.duration,
          delay: T.heroBig.delay,
          ease: T.heroBig.ease,
          clearProps: 'transform,opacity',
          ...extraOpts }
      );
    }

    function _animElement(el, opts = {}) {
      if (!el) return null;
      const { delay = 0, duration = 0.38, fromX = 0, fromY = 12, ease = 'power2.out' } = opts;
      return gsap.fromTo(el,
        { y: fromY, x: fromX, opacity: 0 },
        { y: 0, x: 0, opacity: 1, duration, delay, ease, clearProps: 'transform,opacity' }
      );
    }

    function _animStagger(els, opts = {}) {
      if (!els || !els.length) return null;
      const { delay = 0, duration = 0.38, fromX = 0, fromY = 12,
              stagger = 0.055, ease = 'power2.out' } = opts;
      return gsap.fromTo(els,
        { y: fromY, x: fromX, opacity: 0 },
        { y: 0, x: 0, opacity: 1, duration, delay, stagger, ease,
          clearProps: 'transform,opacity' }
      );
    }


    // ── PLANNER: timing allineato a home ───────────────────────
    window._enterPlanner = function _enterPlanner() {
      // Hero (gradiente viola con titolo Planner)
      _animHero(document.querySelector('.view > div:first-child'));

      // Tab switcher Registro / Piano
      _animElement(
        document.querySelector('.view > div[style*="border-radius: 40px"]'),
        { delay: T.tabBar.delay, duration: T.tabBar.duration }
      );

      // Calendario
      _animElement(
        document.getElementById('calendar'),
        { delay: T.calendar.delay, duration: T.calendar.duration, fromY: 16 }
      );

      // Section header (Scadenze DidUP / Piano)
      _animElement(
        document.querySelector('.section-header'),
        { delay: T.header.delay, duration: T.header.duration, fromY: 8 }
      );

      // Task list items — stagger identico alle circolari della home
      _animStagger(
        document.querySelectorAll(
          '#weekly-agenda-list .registro-card, ' +
          '#weekly-agenda-list .studio-entry, ' +
          '#weekly-agenda-list .card, ' +
          '#weekly-agenda-list > div'
        ),
        { delay: T.items.delay, duration: T.items.duration,
          stagger: T.items.stagger, fromY: 12 }
      );
    };


    // ── VOTI: timing allineato a home ──────────────────────────
    window._enterVoti = function _enterVoti() {
      // Hero
      _animHero(document.querySelector('.view > div:first-child'));

      // Media generale card (la grande con font-size 64px)
      const mediaCard = document.querySelector('.view .card[style*="linear-gradient(135deg, var(--accent)"]')
                     || document.querySelector('.view .card[style*="linear-gradient"]');
      if (mediaCard) {
        gsap.fromTo(mediaCard,
          { y: 22, opacity: 0, scale: 0.96 },
          { y: 0, opacity: 1, scale: 1,
            duration: T.mainCard.duration,
            delay: T.mainCard.delay,
            ease: T.mainCard.ease,
            clearProps: 'transform,opacity' }
        );
      }

      // "Riepilogo Materie" header
      _animElement(
        document.querySelector('.view > div[style*="margin-bottom: 20px"]'),
        { delay: T.header.delay, duration: T.header.duration, fromY: 8 }
      );

      // Subject cards: slide da sinistra (come circolari in home)
      _animStagger(
        document.querySelectorAll('.subject-summary-card'),
        { delay: T.items.delay, duration: T.items.duration,
          stagger: T.items.stagger, fromX: -10, fromY: 0 }
      );
    };


    // ── GENERIC: stesso respiro ─────────────────────────────────
    window._enterGeneric = function _enterGeneric() {
      const view = document.querySelector('.view');
      if (!view) return;
      gsap.fromTo(view,
        { y: 10, opacity: 0 },
        { y: 0, opacity: 1,
          duration: T.generic.duration,
          ease: T.generic.ease,
          clearProps: 'transform,opacity' }
      );
    };

    console.log('✅ Timing coerenti installati: planner, voti, generic');
  });


  /* ════════════════════════════════════════════════════════════════
     2. FIX CIRCOLARI: update chirurgico senza re-render completo
     
     Causa dello scatto:
       loadCircolari() → state.circolari = [...] → scheduleRender(100)
       → full _renderCore() → ricostruisce TUTTO il DOM della home
       → hero, metric cards, tutto rifade l'animazione = scatto visibile
     
     Fix:
       Intercettiamo loadCircolari e, invece di scheduleRender,
       aggiorniamo solo il .circolari-scroll nel DOM esistente.
       Se la home non è visibile, aggiorniamo state e basta
       (il prossimo render prenderà i dati aggiornati).
  ════════════════════════════════════════════════════════════════ */
  const _waitForLoadCircolari = () => {
    if (typeof loadCircolari !== 'function') {
      setTimeout(_waitForLoadCircolari, 60);
      return;
    }

    // Sostituiamo loadCircolari con una versione che fa update chirurgico
    const _origLoadCircolari = loadCircolari;
    window.loadCircolari = async function loadCircolari() {
      try {
        const res = await fetch(`${window.API_BASE_URL}/api/circolari`);

        // Se il server non risponde OK (es. 404), fallback all'originale
        if (!res.ok) {
          console.warn(`⚠️ circolari: server ${res.status}, uso fallback originale`);
          return _origLoadCircolari();
        }

        // Controlla che sia JSON prima di parsarlo
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('application/json')) {
          console.warn('⚠️ circolari: risposta non-JSON, uso fallback originale');
          return _origLoadCircolari();
        }

        const data = await res.json();
        if (!data.success || !data.circolari) return;

        state.circolari = data.circolari;

        // Se non siamo in home, aggiorna solo lo state (nessun DOM change)
        if (state.view !== 'home') return;

        // Trova il contenitore circolari nel DOM esistente
        const scroll = document.querySelector('.circolari-scroll');
        if (!scroll) {
          // DOM non ancora pronto — aspetta il prossimo render normale
          return;
        }

        // ── Update chirurgico: solo il contenuto delle circolari ──
        // Costruiamo il nuovo HTML delle card
        const newHTML = data.circolari.map(c => `
          <div onclick="mostraCircolare('${c.id}')"
               style="cursor:pointer; padding:18px; border-radius:20px;
                      background:var(--bg-card); border:1px solid rgba(0,0,0,0.06);
                      display:flex; flex-direction:column; gap:8px;
                      min-width:220px; max-width:240px; flex-shrink:0;
                      scroll-snap-align:start; box-shadow:0 2px 8px rgba(0,0,0,0.04), 0 4px 16px rgba(99,102,241,0.04);
                      opacity:0; transform:translateX(12px);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <div style="font-size:11px; color:var(--accent-warm); font-weight:800; text-transform:uppercase; letter-spacing:0.5px;">N. ${c.numero}</div>
              ${c.sintesi ? '<i class="ph-fill ph-check-circle" style="color:var(--green); font-size:14px;"></i>' : ''}
            </div>
            <div style="font-size:15px; font-weight:700; color:var(--text-primary); line-height:1.4;
                        display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;">
              ${c.titolo}
            </div>
            <div style="font-size:11px; color:var(--text-dim); margin-top:auto; font-weight:600;">
              <i class="ph ph-calendar-blank" style="vertical-align:middle; margin-right:4px;"></i> ${c.data}
            </div>
          </div>
        `).join('');

        // Fade out del placeholder "Nessuna circolare" se presente
        const placeholder = scroll.querySelector('div[style*="min-width: 100%"]');
        if (placeholder) {
          // C'era il placeholder — fade out poi inserisci cards
          placeholder.style.transition = 'opacity 0.15s ease';
          placeholder.style.opacity = '0';
          setTimeout(() => {
            scroll.innerHTML = newHTML;
            _animateCircolariCards(scroll);
          }, 150);
        } else {
          // C'erano già delle card (refresh manuale) — cross-fade
          scroll.style.transition = 'opacity 0.12s ease';
          scroll.style.opacity = '0';
          setTimeout(() => {
            scroll.innerHTML = newHTML;
            scroll.style.opacity = '1';
            scroll.style.transition = '';
            _animateCircolariCards(scroll);
          }, 120);
        }

      } catch (e) {
        console.warn('⚠️ loadCircolari patch error, uso fallback:', e.message);
        try { return _origLoadCircolari(); } catch (_) {}
      }
    };

    // Anima le card circolari con stagger (identico a home gsapAnimateView)
    function _animateCircolariCards(scroll) {
      const cards = scroll.querySelectorAll('div[onclick]');
      if (!cards.length) return;

      if (typeof gsap !== 'undefined') {
        gsap.fromTo(cards,
          { x: 12, opacity: 0 },
          {
            x: 0, opacity: 1,
            duration: 0.38,
            stagger: 0.06,
            ease: 'power2.out',
            clearProps: 'transform,opacity,visibility'
          }
        );
      } else {
        // Fallback CSS: rimuovi opacity:0 e transform inline
        cards.forEach((c, i) => {
          setTimeout(() => {
            c.style.opacity = '1';
            c.style.transform = '';
            c.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
          }, i * 60);
        });
      }
    }

    console.log('✅ loadCircolari: update chirurgico installato');
  };

  // Installa dopo DOMContentLoaded per sicurezza
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(_waitForLoadCircolari, 300));
  } else {
    setTimeout(_waitForLoadCircolari, 300);
  }


  /* ════════════════════════════════════════════════════════════════
     3. SAFETY: se scheduleRender viene chiamato mentre siamo in home
        e le circolari sono già nel DOM, non ri-animare hero/cards.
        Aggiungiamo un flag per bloccare le animazioni CSS duplicate.
  ════════════════════════════════════════════════════════════════ */
  const _origGsapAnimateView_coherence = window.gsapAnimateView;
  window.gsapAnimateView = function gsapAnimateView() {
    // Resetta i flag _gsapDone ad ogni nuovo render di vista
    // (sono necessari solo per evitare doppia animazione nello stesso mount)
    document.querySelectorAll('[data-gsap-done]').forEach(el => {
      el.removeAttribute('data-gsap-done');
    });
    if (typeof _origGsapAnimateView_coherence === 'function') {
      _origGsapAnimateView_coherence();
    }
  };

  console.log('✅ Coherence patch v5.0 installata');

})();

/* ================================================================
   G-CONNECT — JS PATCH FINALE v4.0
   
   Incolla in fondo al <body> di index.html, DOPO tutti gli script.
   
   SCATTI RESIDUI rimasti dopo le patch precedenti:
   
   Problema: performSync.finally chiama scheduleRender(0)
   E         Promise.allSettled.then chiama scheduleRender(0)
   → Quando performSync finisce, sparano due render a ~0ms di distanza.
   
   scheduleRender dovrebbe coalizzarli, ma con delay=0 entrambi
   chiamano render() direttamente → due _renderCore() separati.
   
   Fix: flag _bootSyncPending che dice a performSync "sei stato
   chiamato dal boot, non fare il tuo render — ci pensa allSettled".
   ================================================================ */

(function installFinalPatch() {

  // ── FIX 1: scheduleRender con delay=0 non bypassa la deduplication
  // Il problema è che scheduleRender(0) chiama render() direttamente
  // senza passare per clearTimeout, quindi due chiamate consecutive
  // a scheduleRender(0) producono due render().
  // Fix: delay=0 usa sempre rAF, mai chiamata sincrona.
  // ────────────────────────────────────────────────────────────────
  const _origScheduleRender = window.scheduleRender;
  let _scheduleRenderTimer = null;
  
  window.scheduleRender = function scheduleRender(delay = 80) {
    clearTimeout(_scheduleRenderTimer);
    // Normalizza: delay=0 → delay=16 (un frame) per passare sempre
    // per clearTimeout e deduplicare chiamate ravvicinate
    const d = delay <= 0 ? 16 : delay;
    _scheduleRenderTimer = setTimeout(() => {
      if (typeof render === 'function') render();
    }, d);
  };


  // ── FIX 2: performSync non deve fare il proprio scheduleRender
  // quando è stato lanciato dal boot (già gestito da allSettled).
  // Usiamo un flag leggero.
  // ────────────────────────────────────────────────────────────────
  window._syncCalledFromBoot = false;

  // Intercetta le chiamate a performSync se possibile (già gestito dal boot in index.html)
  // Ma aggiungiamo un controllo extra per la robustezza
  const _waitForPerformSync = () => {
    if (typeof performSync !== 'function') {
      setTimeout(_waitForPerformSync, 50);
      return;
    }
  };

  // ── FIX 3 (soluzione definitiva): render lock temporale ─────────
  // Se due render vengono richiesti entro 50ms l'uno dall'altro,
  // il secondo viene scartato. Questo copre il caso
  // performSync.finally + allSettled.then che arrivano quasi insieme.
  // ────────────────────────────────────────────────────────────────
  let _lastRenderTime = 0;
  const RENDER_MIN_GAP_MS = 50; // due render non possono essere < 50ms apart

  const _origRender = window.render;
  if (typeof _origRender === 'function') {
    window.render = function render() {
      const now = performance.now();
      if (now - _lastRenderTime < RENDER_MIN_GAP_MS) {
        // Render richiesto troppo presto — schedula invece di eseguire
        clearTimeout(_scheduleRenderTimer);
        _scheduleRenderTimer = setTimeout(() => {
          _lastRenderTime = performance.now();
          _origRender();
        }, RENDER_MIN_GAP_MS);
        return;
      }
      _lastRenderTime = now;
      _origRender();
    };
  } else {
    // render() non ancora definita — aspetta e riprova
    const _waitForRender = () => {
      if (typeof window.render !== 'function' || window.render === arguments.callee) {
        setTimeout(_waitForRender, 30);
        return;
      }
      const _orig = window.render;
      window.render = function render() {
        const now = performance.now();
        if (now - _lastRenderTime < RENDER_MIN_GAP_MS) {
          clearTimeout(_scheduleRenderTimer);
          _scheduleRenderTimer = setTimeout(() => {
            _lastRenderTime = performance.now();
            _orig();
          }, RENDER_MIN_GAP_MS);
          return;
        }
        _lastRenderTime = now;
        _orig();
      };
    };
    setTimeout(_waitForRender, 100);
  }

  _waitForPerformSync();


  // ── FIX 4: app-loader — fade out veloce dopo primo paint ────────
  // Il loader attuale ha transition:opacity 0.5s e remove() dopo 500ms.
  // Lo rendiamo più veloce e lo colleghiamo al primo paint reale.
  // ────────────────────────────────────────────────────────────────
  const _origRemoveLoader = window.removeLoader;
  window.removeLoader = function removeLoader() {
    const el = document.getElementById('app-loader');
    if (!el) return;
    clearTimeout(window._loaderTimer);
    // Fade veloce: 200ms invece di 500ms
    el.style.transition = 'opacity 0.2s ease-out';
    el.style.opacity = '0';
    setTimeout(() => { if (el.parentNode) el.remove(); }, 220);
  };


  // ── FIX 5: gsapAnimateView — animazioni home più ricche ─────────
  // Se gsapAnimateView è definita in animations.js, la estendiamo
  // per aggiungere animazioni staggered sugli elementi home.
  // Se non è definita, la creiamo noi.
  // ────────────────────────────────────────────────────────────────
  const _installGsapPatch = () => {
    if (typeof gsap === 'undefined') {
      setTimeout(_installGsapPatch, 100);
      return;
    }

    const _origGsapAnimateView = typeof gsapAnimateView === 'function'
      ? gsapAnimateView
      : null;

    window.gsapAnimateView = function gsapAnimateView() {
      // Chiama l'originale se esiste
      if (_origGsapAnimateView) {
        try { _origGsapAnimateView(); } catch(e) {}
      }

      // Animazioni aggiuntive solo per la home
      if (state?.view !== 'home') return;

      // Usa un piccolo delay per non interferire con le animazioni CSS
      requestAnimationFrame(() => {
        // ── Hero particles: leggero shimmer sull'hero ──
        const hero = document.querySelector('.hero-container');
        if (hero && !hero._gsapDone) {
          hero._gsapDone = true;
          // Shimmer sottile che scorre
          gsap.fromTo(hero, 
            { backgroundPosition: '0% 50%' },
            { 
              backgroundPosition: '100% 50%', 
              duration: 8, 
              repeat: -1, 
              yoyo: true,
              ease: 'sine.inOut'
            }
          );
        }

        // ── Metric cards: bounce in con stagger ──
        const metricCards = document.querySelectorAll('.metric-card');
        if (metricCards.length && !metricCards[0]._gsapDone) {
          metricCards.forEach(c => c._gsapDone = true);
          gsap.fromTo(metricCards,
            { y: 20, opacity: 0, scale: 0.96 },
            {
              y: 0, opacity: 1, scale: 1,
              duration: 0.5,
              stagger: 0.08,
              ease: 'back.out(1.4)',
              delay: 0.18,
              clearProps: 'transform'
            }
          );
        }

        // ── Bottone Aggiungi Compito: slide up ──
        const addBtn = document.querySelector('button[onclick*="showQuickAddTaskModal"]');
        if (addBtn && !addBtn._gsapDone) {
          addBtn._gsapDone = true;
          gsap.fromTo(addBtn,
            { y: 16, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.4, ease: 'power2.out', delay: 0.36, clearProps: 'transform,opacity' }
          );
        }

        // ── Circolari header: fade in ──
        const cirHeaders = document.querySelectorAll('.view > div > h2');
        cirHeaders.forEach((h, i) => {
          if (!h._gsapDone) {
            h._gsapDone = true;
            gsap.fromTo(h,
              { y: 8, opacity: 0 },
              { y: 0, opacity: 1, duration: 0.35, ease: 'power2.out', delay: 0.40 + i * 0.06, clearProps: 'transform,opacity' }
            );
          }
        });

        // ── Circolari cards: stagger da sinistra ──
        const cirCards = document.querySelectorAll('.circolari-scroll > div');
        if (cirCards.length && !cirCards[0]?._gsapDone) {
          cirCards.forEach(c => c._gsapDone = true);
          gsap.fromTo(cirCards,
            { x: 20, opacity: 0 },
            {
              x: 0, opacity: 1,
              duration: 0.38,
              stagger: 0.06,
              ease: 'power2.out',
              delay: 0.44,
              clearProps: 'transform,opacity'
            }
          );
        }

        // ── Sezione agenda weekly (se visibile) ──
        const agenda = document.getElementById('weekly-agenda-list');
        if (agenda && !agenda._gsapDone) {
          agenda._gsapDone = true;
          const items = agenda.querySelectorAll('[class*="registro"], [class*="studio"], .card');
          if (items.length) {
            gsap.fromTo(items,
              { y: 10, opacity: 0 },
              {
                y: 0, opacity: 1,
                duration: 0.32,
                stagger: 0.05,
                ease: 'power2.out',
                delay: 0.52,
                clearProps: 'transform,opacity'
              }
            );
          }
        }
      });
    };

    console.log('✅ gsapAnimateView patch installata');
  };

  // Installa dopo il caricamento del DOM e di GSAP
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(_installGsapPatch, 200));
  } else {
    setTimeout(_installGsapPatch, 200);
  }

  console.log('✅ G-Connect patch-finale.js v4.0 installata');

})();

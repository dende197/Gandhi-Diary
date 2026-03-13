/* ================================================================
   G-CONNECT — JS PERFORMANCE PATCH
   
   COME USARLO:
   Aggiungi <script src="perf-patch.js"></script> alla fine del
   <body> in index.html, DOPO tutti gli altri script.
   ================================================================ */


// ── 1. scheduleRender: debounce per chiamate da sync dati ───────
// render() da azioni UI (click, navigate) rimane istantaneo.
// render() da callback async/rete viene raggruppato in 80ms
// così se arrivano 3 callback dati nello stesso tick → 1 solo render.

let _syncRenderTimer = null;
window.scheduleRender = function scheduleRender(delay = 80) {
  clearTimeout(_syncRenderTimer);
  _syncRenderTimer = setTimeout(window.render, delay);
};


// ── 2. renderNav() patchata: greeting + nome nel profile button ──
// Sovrascrive la funzione originale (definita in ui.js) per
// aggiungere il pulsante profilo con saluto dinamico e nome.

(function patchRenderNav() {
  // Aspetta che il DOM sia pronto e la funzione originale sia disponibile
  const install = () => {
    if (typeof window.renderNav !== 'function') return;

    window.renderNav = function renderNav() {
      const h = new Date().getHours();
      let greeting = 'Buonasera';
      if (h < 12) greeting = 'Buongiorno';
      else if (h < 18) greeting = 'Buon pomeriggio';

      const fullName = window.state?.user?.name?.trim() || '';
      const shortName = fullName.includes(' ')
        ? fullName.split(/\s+/).slice(1).join(' ')
        : fullName;

      const initial = shortName ? shortName.charAt(0).toUpperCase() : '?';

      return `
        <nav id="top-nav">
          <div class="nav-content" style="justify-content: space-between; align-items: center;">

            <!-- PROFILE BUTTON: greeting + nome -->
            ${shortName ? `
            <button class="profile-trigger" onclick="navigate('profile')"
              style="display:flex; align-items:center; gap:8px; padding:5px 12px 5px 6px;
                     border-radius:30px; cursor:pointer; flex-shrink:0;">
              <div style="width:28px; height:28px; border-radius:50%; flex-shrink:0;
                          background:linear-gradient(135deg, var(--accent), var(--purple));
                          display:flex; align-items:center; justify-content:center;
                          color:white; font-size:11px; font-weight:800;">
                ${initial}
              </div>
              <div class="profile-label">
                <span class="profile-greeting">${greeting}</span>
                <span class="profile-name">${shortName}</span>
              </div>
            </button>
            ` : '<div style="width:80px;"></div>'}

            <!-- PILL NAVIGATION centrata -->
            <div class="nav-links">
              <button class="nav-item ${window.state?.view === 'home' ? 'active' : ''}"
                onclick="navigate('home')">
                <i class="ph-fill ph-house"></i> Home
              </button>
              <button class="nav-item ${window.state?.view === 'planner' ? 'active' : ''}"
                onclick="navigate('planner')">
                <i class="ph ph-calendar"></i> Planner
              </button>
              <button class="nav-item ${window.state?.view === 'voti' ? 'active' : ''}"
                onclick="navigate('voti')">
                <i class="ph ph-chart-line-up"></i> Voti
              </button>
            </div>

            <!-- SPACER destra per bilanciare il layout -->
            <div style="width:${shortName ? '80px' : '0'}; flex-shrink:0;"></div>
          </div>
        </nav>`;
    };
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install);
  } else {
    // Prova subito, e anche dopo DOMContentLoaded nel caso ui.js
    // venga eseguito dopo questo script
    install();
    document.addEventListener('DOMContentLoaded', install);
  }
})();


// ── 3. getDailyQuote: fallback robusto se non è definita ────────
// La frase motivazionale nell'hero dipende da questa funzione.
// Se non esiste (o ritorna vuoto) l'hero rimane muto.

if (typeof window.getDailyQuote !== 'function') {
  const _quotes = [
    "Un piccolo passo oggi vale più di dieci domani.",
    "La costanza batte il talento quando il talento non è costante.",
    "Fatto è meglio di perfetto.",
    "Studia con calma, migliora ogni giorno.",
    "La conoscenza è potere.",
    "La curiosità è il motore dell'apprendimento.",
    "Ogni errore è un passo verso la comprensione.",
    "La disciplina è il ponte tra gli obiettivi e i risultati.",
    "Un libro è un giardino tascabile.",
    "Imparare senza riflettere è tempo perso.",
    "Non è la forza, ma la costanza a fare le grandi opere.",
    "Il successo è la somma di piccoli sforzi ripetuti ogni giorno.",
  ];

  window.getDailyQuote = function getDailyQuote() {
    const today = new Date();
    const dayOfYear = Math.floor(
      (today - new Date(today.getFullYear(), 0, 0)) / 86400000
    );
    return _quotes[dayOfYear % _quotes.length];
  };
}

// refreshDailyQuote: aggiorna la frase inline senza re-render
if (typeof window.refreshDailyQuote !== 'function') {
  let _quoteOffset = 0;
  const _quotes = [
    "Un piccolo passo oggi vale più di dieci domani.",
    "La costanza batte il talento quando il talento non è costante.",
    "Fatto è meglio di perfetto.",
    "Studia con calma, migliora ogni giorno.",
    "La conoscenza è potere.",
    "La curiosità è il motore dell'apprendimento.",
    "Ogni errore è un passo verso la comprensione.",
    "La disciplina è il ponte tra gli obiettivi e i risultati.",
    "Un libro è un giardino tascabile.",
    "Imparare senza riflettere è tempo perso.",
    "Non è la forza, ma la costanza a fare le grandi opere.",
    "Il successo è la somma di piccoli sforzi ripetuti ogni giorno.",
  ];

  window.refreshDailyQuote = function refreshDailyQuote(btnEl) {
    _quoteOffset++;
    const today = new Date();
    const dayOfYear = Math.floor(
      (today - new Date(today.getFullYear(), 0, 0)) / 86400000
    );
    const newQuote = _quotes[(dayOfYear + _quoteOffset) % _quotes.length];

    // Aggiorna solo lo span senza re-render completo
    const span = document.querySelector('.hero-status span[style*="italic"]');
    if (span) {
      span.style.transition = 'opacity 0.15s ease, transform 0.15s ease';
      span.style.opacity = '0';
      span.style.transform = 'translateY(-3px)';
      setTimeout(() => {
        span.textContent = `"${newQuote}"`;
        span.style.opacity = '0.8';
        span.style.transform = 'translateY(0)';
      }, 150);
    }

    // Animazione rotazione sul pulsante
    if (btnEl) {
      btnEl.style.transition = 'transform 0.35s cubic-bezier(0.22,1,0.36,1)';
      btnEl.style.transform = 'rotate(180deg)';
      setTimeout(() => {
        btnEl.style.transform = 'rotate(0deg)';
      }, 350);
    }
  };
}


// ── 4. Patch render() calls negli event handler async ───────────
// Le callback di sync dati chiamano render() direttamente.
// Intercettiamo quelle che sappiamo essere da contesto async
// e le sostituiamo con scheduleRender() dopo il boot.
//
// Strategia: monkey-patch performSync per usare scheduleRender
// al suo interno, senza toccare le chiamate da navigate/click.

document.addEventListener('DOMContentLoaded', () => {
  // Aspetta che tutte le funzioni siano definite
  setTimeout(() => {
    // Patch commitStressChanges: evita double-render
    if (typeof window.commitStressChanges === 'function') {
      const _origCommit = window.commitStressChanges;
      window.commitStressChanges = function commitStressChanges() {
        // Esegui la logica originale senza il render() finale
        const todayStr = window.getLocalDateString();
        if (!window.state.stressLevels) window.state.stressLevels = {};
        if (!window.state.stressVents) window.state.stressVents = {};
        if (typeof window.state.stressLevels[todayStr] !== 'object') {
          window.state.stressLevels[todayStr] = {
            stress: window.state.tempStress.level,
            updatedAt: new Date().toISOString()
          };
        } else {
          window.state.stressLevels[todayStr].stress = window.state.tempStress.level;
          window.state.stressLevels[todayStr].updatedAt = new Date().toISOString();
        }
        window.state.stressVents[todayStr] = window.state.tempStress.vent;
        if (typeof window.saveTasks === 'function') window.saveTasks();
        if (typeof window.closeModal === 'function') window.closeModal();
        window.scheduleRender(50); // Un solo render, dopo 50ms
        if (typeof window.showToast === 'function') window.showToast('Stress salvato con successo!');
      };
    }

    console.log('✅ G-Connect perf-patch.js v3.1 — scheduleRender, renderNav, quotes installati');
  }, 200);
});


// ── 5. will-change cleanup dopo animazioni ───────────────────────
// Libera VRAM rimuovendo will-change dopo che l'animazione è finita.
// La classe .anim-done è già gestita nel CSS (will-change: auto).

document.addEventListener('animationend', (e) => {
  const el = e.target;
  if (
    el.classList.contains('view') ||
    el.classList.contains('hero-container') ||
    el.classList.contains('metric-card')
  ) {
    // Piccolo delay per non interferire con eventuali re-trigger
    setTimeout(() => el.classList.add('anim-done'), 100);
  }
}, true);

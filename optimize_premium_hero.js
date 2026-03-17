const fs = require('fs');
const path = require('path');

const patchPath = path.join(__dirname, 'patch-finale.css');
let css = fs.readFileSync(patchPath, 'utf8');

// 1. HERO GRADIENT REPLACEMENT (Apple Titanium / Dark Mesh style)
const newHeroStyle = `
/* ── 5. HERO — PREMIUM MESH GRADIENT (Apple Style) ───────────────────
   Sostituisce il viola piatto con una mesh profonda, elegante e scura.
   Perfetto contrasto con il testo bianco per la massima leggibilità.
   ─────────────────────────────────────────────────────────────── */
.hero-container {
  background: #111116 !important; /* Base scura "Midnight" profonda */
  border: 1px solid rgba(255, 255, 255, 0.08) !important; /* Bordo luce millimetrico */
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.15),
              inset 0 1px 0 rgba(255,255,255,0.12) !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  overflow: hidden;
  position: relative;
}

/* Effetto luce ambientale sulla hero (Mesh) */
.hero-container::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -20%;
  width: 80%;
  height: 180%;
  background: radial-gradient(ellipse at center, rgba(99,102,241,0.18) 0%, transparent 65%);
  pointer-events: none;
  mix-blend-mode: screen;
}
.hero-container::after {
  content: '';
  position: absolute;
  bottom: -40%;
  right: -10%;
  width: 70%;
  height: 140%;
  background: radial-gradient(ellipse at center, rgba(168,85,247,0.15) 0%, transparent 65%);
  pointer-events: none;
  mix-blend-mode: screen;
}

/* Luce Zenitale (Top Highlight) */
.hero-container::part(ambient-light) {
  content: '';
  position: absolute;
  top: 0; left: 10%; right: 10%; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent);
}

/* Testo: SOLO bianco puro altissimo contrasto */
.hero-title  { color: #ffffff !important; text-shadow: 0 2px 12px rgba(0,0,0,0.4); font-weight: 600 !important; letter-spacing: -0.5px !important; }
.hero-subtitle { color: rgba(255,255,255,0.85) !important; font-weight: 500 !important; font-size: 15px !important; }
.hero-status   { color: rgba(255,255,255,0.7) !important; font-weight: 500 !important; }
.hero-status button { color: rgba(255,255,255,0.9) !important; font-weight: 600 !important; border-bottom: 1px solid rgba(255,255,255,0.2) !important; }
.hero-status button:hover { color: #ffffff !important; border-bottom: 1px solid rgba(255,255,255,0.8) !important; text-shadow: 0 0 12px rgba(255,255,255,0.5); }
`;

// Sostituisci il blocco hero esistente da "/* ── 5. HERO" a "/* ── 6. ANIMAZIONI"
css = css.replace(/\/\*\s*──\s*5\. HERO[\s\S]*?\/\*\s*──\s*6\. ANIMAZIONI/, newHeroStyle + '\n\n/* ── 6. ANIMAZIONI');

// FIX CARD SHADOWS & BORDERS
const shadowStyle = `
/* ── 3B. OMBRE PREMIUM MULTILAYER E BORDI (Apple HIG) ───────────── */
.card, .glass-panel, .circolare-card, .registro-card, .pd-item {
  box-shadow: 0 2px 4px rgba(0,0,0,0.02),
              0 6px 12px rgba(0,0,0,0.03),
              0 14px 24px rgba(0,0,0,0.04) !important;
  border: 1px solid rgba(0,0,0,0.04) !important;
}

.modal-content {
  box-shadow: 0 10px 30px rgba(0,0,0,0.08),
              0 30px 60px rgba(0,0,0,0.12),
              inset 0 1px 0 rgba(255,255,255,0.6) !important;
  border: 1px solid rgba(0,0,0,0.05) !important;
}
`;
// Inseriamo le ombre premium dopo il blocco dei blur
css = css.replace(/(\/\*\s*──\s*4\. WIDGET METRICHE)/, shadowStyle + '\n$1');

fs.writeFileSync(patchPath, css);
console.log('✅ patch-finale.css aggiornato con mesh gradient hero e ombre multi-livello');

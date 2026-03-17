const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, 'style.css');
let css = fs.readFileSync(cssPath, 'utf8');

// 1. Sostituisci tutti i `transition: all ...;`
css = css.replace(/transition:\s*all\s+[^;!]+(!important)?;?/ig, 'transition: transform 200ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease, background-color 180ms ease, border-color 180ms ease, box-shadow 220ms ease;');

// 2. Riduci blur pesanti
// blur(60px) -> blur(32px)
css = css.replace(/blur\(60px\)/g, 'blur(32px)');
// blur(40px) -> remove (just replace with blur(0) or remove property)
// wait, the prompt says "blur(40px) su .metric-card -> rimuovi".
// Let's replace blur(40px) with blur(0px) for simplicity, or just remove the line if complex.
css = css.replace(/blur\(40px\)(.*?);/g, 'none;'); 
// blur(30px) -> blur(20px)
css = css.replace(/blur\(30px\)/g, 'blur(20px)');

// 3. Aggiungi regole di rendering e contain
const fontRules = `
body {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  font-feature-settings: "kern" 1;
}

.hero-title, .hero-subtitle, .hero-status,
.metric-card [style*="font-size:34px"] {
  -webkit-font-smoothing: subpixel-antialiased;
  transform: translateZ(0);
}

.circolari-scroll,
#weekly-agenda-list,
.ai-chat-scroll-container,
.chat-history {
  contain: content;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}

#app {
  isolation: isolate;
  transform: translateZ(0);
}

.circolari-scroll {
  scroll-snap-type: x mandatory;
}
`;

css += '\n' + fontRules + '\n';

fs.writeFileSync(cssPath, css);
console.log('✅ style.css ottimizzato');

// 4. Update ui.js inline onclick per switchPlannerMode e eliminiamo i call a render() nel nav-item?
// "Per i tab switcher del planner (Registro/Studio, Calendar/List): invece di re-render completo"
// We'll write a switchPlannerMode function in ui.js or index.html later.

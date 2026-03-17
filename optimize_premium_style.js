const fs = require('fs');
const path = require('path');

const stylePath = path.join(__dirname, 'style.css');
let css = fs.readFileSync(stylePath, 'utf8');

// Aggiungiamo contrasti premium Apple-style nel :root e modifiche ai pesi
const newVars = `
        :root {
            /* Background Layers */
            --bg-body: #f5f5f7; /* Off-white in stile macOS */
            --bg-card: rgba(255, 255, 255, 0.98); 
            --bg-card-hover: #ffffff;
            --bg-input: rgba(0, 0, 0, 0.04);
            --bg-input-focus: rgba(0, 0, 0, 0.07);

            /* Typography */
            --font-main: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;

            --text-primary: #1d1d1f; /* Ricco quasi-nero Apple */
            --text-secondary: #515154; 
            --text-dim: #86868b; 
`;

// Rimpiazza il blocco root esistente (primo :root nel file)
css = css.replace(/:root\s*\{[\s\S]*?--text-dim:\s*#[0-9a-fA-F]+;\s*/, newVars);

// Typography tweaks
// Change all 'font-weight: 800' or 'font-weight: 700' on standard titles to 600 for elegance
// But keep 700/800 for huge metric numbers.
css = css.replace(/font-weight:\s*800;/g, 'font-weight: 700;');
css = css.replace(/font-weight:\s*700;/g, 'font-weight: 600;');

fs.writeFileSync(stylePath, css);
console.log('✅ style.css root variables for Apple aesthetics updated');

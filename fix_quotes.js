const fs = require('fs');
const path = require('path');

const uiJsPath = path.join(__dirname, 'ui.js');
let content = fs.readFileSync(uiJsPath, 'utf8');

// The Node script earlier replaced with `\\\'`, which inside HTML becomes `\'`.
// This breaks JS evaluation in onclick. Let's fix it back to `'`.
content = content.replace(/window\.switchPlannerMode\(\\'([^']+)\\'\)/g, "window.switchPlannerMode('$1')");
content = content.replace(/window\.switchPlannerView\(\\'([^']+)\\'\)/g, "window.switchPlannerView('$1')");
content = content.replace(/window\.navigateSubject\(\\'([^']+)\\'\)/g, "window.navigateSubject('$1')");

fs.writeFileSync(uiJsPath, content);
console.log('✅ ui.js quote esaping corretto');

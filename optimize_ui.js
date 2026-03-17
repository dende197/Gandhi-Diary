const fs = require('fs');
const path = require('path');

const uiJsPath = path.join(__dirname, 'ui.js');
let content = fs.readFileSync(uiJsPath, 'utf8');

// The helper functions we need to inject
const helpers = `
// --- UI TRANSITION HELPERS (Added by Phase 25 Mega Patch) ---
window.switchPlannerMode = function(mode) {
  state.plannerMode = mode;
  document.querySelectorAll('[data-planner-mode]').forEach(btn => {
    const isActive = btn.dataset.plannerMode === mode;
    btn.style.background = isActive ? 'rgba(139,92,246,0.25)' : 'transparent';
    btn.style.color = isActive ? 'white' : 'rgba(255,255,255,0.6)';
    btn.style.border = isActive ? '1px solid rgba(139,92,246,0.4)' : '1px solid transparent';
  });
  const list = document.getElementById('weekly-agenda-list');
  if (list && typeof gsap !== 'undefined') {
    gsap.to(list, { opacity: 0, y: 4, duration: 0.12, ease: 'power2.in',
      onComplete: () => {
        list.innerHTML = renderWeeklyAgenda();
        gsap.fromTo(list, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.28, ease: 'power2.out', clearProps: 'transform,opacity' });
      }
    });
  } else {
    scheduleRender(0);
  }
};

window.switchPlannerView = function(view) {
  state.plannerView = view;
  localStorage.setItem('g_diary_planner_view', view);
  document.querySelectorAll('[data-planner-view]').forEach(btn => {
    const isActive = btn.dataset.plannerView === view;
    btn.style.background = isActive ? 'rgba(255,255,255,0.15)' : 'transparent';
    btn.style.color = isActive ? 'white' : 'rgba(255,255,255,0.5)';
  });
  const calContent = document.getElementById('calendar'); // Assuming planner body usually handles this
  // We'll just do a fast fade out and re-render the whole planner body minus the top bar
  const plannerScroll = document.querySelector('.planner-scroll');
  if (plannerScroll && typeof gsap !== 'undefined') {
      gsap.to(plannerScroll, { opacity:0, duration: 0.15, onComplete: () => {
          scheduleRender(0);
      }});
  } else {
      scheduleRender(0);
  }
};

window.navigateSubject = function(subjName) {
    const root = document.getElementById('app');
    const currentView = root ? root.querySelector('.view') : null;
    if (currentView && typeof gsap !== 'undefined') {
        gsap.to(currentView, { opacity: 0, y: -8, scale: 0.99, duration: 0.15, ease: 'power2.in', onComplete: () => {
            state.activeSubject = subjName;
            scheduleRender(0);
        }});
    } else {
        state.activeSubject = subjName;
        scheduleRender(0);
    }
};

window.closeSubject = function() {
    window.navigateSubject(null);
};
// ------------------------------------------------------------
`;

if (!content.includes('UI TRANSITION HELPERS')) {
    content = helpers + '\n' + content;
}

// Replace the inline handlers by finding specific patterns
content = content.replace(/onclick="state\.plannerView='calendar'; render\(\);"/g, 'onclick="window.switchPlannerView(\\\'calendar\\\')" data-planner-view="calendar"');
content = content.replace(/onclick="state\.plannerView='list'; render\(\);"/g, 'onclick="window.switchPlannerView(\\\'list\\\')" data-planner-view="list"');

content = content.replace(/onclick="state\.plannerMode='registro'; render\(\);"/g, 'onclick="window.switchPlannerMode(\\\'registro\\\')" data-planner-mode="registro"');
content = content.replace(/onclick="state\.plannerMode='studio'; render\(\);"/g, 'onclick="window.switchPlannerMode(\\\'studio\\\')" data-planner-mode="studio"');

content = content.replace(/onclick="state\.activeSubject='([^']+)'; render\(\);"/g, 'onclick="window.navigateSubject(\\\'$1\\\')"');
content = content.replace(/onclick="state\.activeSubject = null; render\(\);"/g, 'onclick="window.closeSubject()"');

fs.writeFileSync(uiJsPath, content);
console.log('✅ ui.js inline onclick rimpiazzati con transizioni fluide');

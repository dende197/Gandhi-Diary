
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

        function calcolaMedia(voti) {
            if (!voti || voti.length === 0) return null;
            const validi = voti.map(v => {
                let s = (v.valore || v.value || "").toString().replace(',', '.');
                return parseFloat(s);
            }).filter(n => !isNaN(n));

            if (validi.length === 0) return null;
            const somma = validi.reduce((a, b) => a + b, 0);
            return (somma / validi.length).toFixed(2);
        }
        function getMotivationalFallback() {
            const quotes = [
                "Un piccolo passo oggi vale più di dieci domani.",
                "La costanza batte il talento quando il talento non è costante.",
                "Fatto è meglio di perfetto.",
                "Studia con calma, migliora ogni giorno.",
                "La conoscenza è potere.",
                "La curiosità è il motore dell'apprendimento.",
                "Ogni errore è un passo verso la comprensione.",
                "La disciplina è il ponte tra gli obiettivi e i risultati.",
                "Un libro è un giardino tascabile.",
                "Imparare senza riflettere è tempo perso."
            ];
            const day = new Date().getDate();
            return quotes[day % quotes.length];
        }
        function getSafeUserName() {
            const full = state?.user?.name?.trim();
            if (!full) return "Studente";
            const parts = full.split(/\s+/);
            // Return only the last part (usually surname) or the first if it's single
            return parts.length > 1 ? parts.slice(1).join(" ") : parts[0];
        }
        function gaugeClassForMedia(m) {
            if (m >= 6.5) return 'gauge-good';
            if (m >= 6.0) return 'gauge-warn';
            return 'gauge-bad';
        }
        function getSpecializationFullName(spec, rawClass = '') {
            // 🔥 HEURISTIC & PRIORITY: Estrai codici dalla classe
            const classMatch = String(rawClass).toUpperCase().match(/\b(SA|SU|LS|LC|LL|EC|CAT|AFM|ITI)\b/);
            const classCode = classMatch ? classMatch[1] : null;

            // Se abbiamo un codice nella classe, ha la precedenza su quello del DB
            // (perché spesso il DB è rimasto a un vecchio fallback 'SA')
            const code = classCode || spec;

            const maps = {
                'SA': 'Scienze Applicate',
                'LC': 'Liceo Classico',
                'SU': 'Scienze Umane',
                'LL': 'Liceo Linguistico',
                'LS': 'Liceo Scientifico',
                'EC': 'Economico Sociale',
                'CAT': 'Costruzioni Ambiente Territorio',
                'AFM': 'Amministrazione Finanza Marketing',
                'ITI': 'Istituto Tecnico Industriale'
            };
            return maps[code] || code || 'Indirizzo N/D';
        }
        function getLocalDateString(date = new Date()) {
            const d = new Date(date);
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }
        function getSchoolDate() {
            // Return a Date object normalized to Italy (UTC+1 or UTC+2)
            const now = new Date();
            const italyStr = now.toLocaleString("en-US", { timeZone: "Europe/Rome" });
            return new Date(italyStr);
        }
        function updateOfflineBadge() {
            if (!offlineBadge) return;
            if (state.isOffline) {
                console.log("⚠️ Mostro offline badge");
                offlineBadge.classList.add('show');
            } else {
                offlineBadge.classList.remove('show');
            }
        }
        function getModalContainer() {
            let el = document.getElementById('modal-container');
            if (!el) {
                el = document.createElement('div');
                el.id = 'modal-container';
                document.body.appendChild(el);
            }
            return el;
        }
        function showModal(html, className = '') {
            const container = getModalContainer();
            if (!container) return;
            container.innerHTML = `
            <div class="modal-overlay active" onclick="closeModal(event)">
                <div class="modal-content ${className}" onclick="event.stopPropagation()">
                    ${html}
                </div>
            </div>
        `;
        }
        function closeModal(event) {
            if (event) event.stopPropagation();
            const container = document.getElementById('modal-container');
            if (container) {
                // Animazione uscita
                const overlay = container.querySelector('.modal-overlay');
                if (overlay) {
                    overlay.style.opacity = '0';
                    setTimeout(() => { container.innerHTML = ''; }, 200);
                } else {
                    container.innerHTML = '';
                }
            }
        }
        function showToast(message) {
            const existing = document.getElementById('g-toast');
            if (existing) existing.remove();

            const toast = document.createElement('div');
            toast.id = 'g-toast';
            toast.style = `
                position: fixed;
                bottom: 160px;
                left: 50%;
                transform: translateX(-50%);
                background: var(--blue);
                color: white;
                padding: 12px 24px;
                border-radius: 50px;
                font-weight: 700;
                font-size: 14px;
                z-index: 9999;
                box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                animation: toastPop 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
            `;
            toast.innerHTML = '<i class="ph-bold ph-check-circle" style="margin-right:8px;"></i>' + message;
            document.body.appendChild(toast);

            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(-50%) translateY(20px)';
                toast.style.transition = 'all 0.4s ease-in';
                setTimeout(() => toast.remove(), 400);
            }, 1800);
        }
        function showBoot(text) {
            const el = document.getElementById('boot-overlay');
            if (!el) return;
            if (text) {
                const t = el.querySelector('.boot-title');
                if (t) t.textContent = text;
            }
            el.style.display = 'flex';
            el.classList.remove('hidden');
        }
        function hideBoot() {
            const el = document.getElementById('boot-overlay');
            if (el) {
                el.classList.add('hidden');
                setTimeout(() => { el.style.display = 'none'; }, 300);
            }
            // Also dismiss app-loader if still visible
            const loader = document.getElementById('app-loader');
            if (loader) {
                loader.style.opacity = '0';
                setTimeout(() => loader.remove(), 500);
            }
        }
        function normalizeClassUi(cls) {
            if (!cls) return null;
            const txt = String(cls).toUpperCase().trim();

            // Estrai numero + sezione base (es. "5E")
            const baseMatch = txt.match(/\b([1-5])\s*([A-Z]{1,2})\b/);
            if (!baseMatch) return null;

            const base = baseMatch[1] + baseMatch[2]; // "5E"

            // Estrai indirizzo se presente (es. "SA", "SU", "LS")
            const indirizzoMatch = txt.match(/\(([A-Z]{2,4})\)|\b(SA|SU|LS|LC|LL|LA|LM|AFM|ITI|CAT)\b/i);
            const indirizzo = indirizzoMatch ? (indirizzoMatch[1] || indirizzoMatch[2]).toUpperCase() : null;

            return indirizzo ? `${base} ${indirizzo}` : base; // "5E SA" o "5E"
        }
        function isValidClass(cls) {
            if (!cls) return false;
            const s = String(cls).trim().toUpperCase();
            return s.length >= 1 && s.length <= 20;
        }
        function isValidName(name) {
            if (!name || typeof name !== 'string') return false;
            const trimmed = name.trim();
            if (trimmed.length < 2) return false;
            return /^[a-zA-ZÀ-ÿ0-9\s'.\-]+$/.test(trimmed);
        }
        function renderNav() {
            const h = new Date().getHours();
            let greeting = "Buonasera";
            if (h < 12) greeting = "Buongiorno";
            else if (h < 18) greeting = "Buon pomeriggio";

            const fullName = state?.user?.name || '';
            const shortName = getSafeUserName();

            return `
            <nav id="top-nav">
                <div class="nav-content" style="justify-content: space-between;">
                    ${state.isLoggedIn ? `
                    <button class="profile-trigger" onclick="navigate('profile')" style="flex-shrink:0; background:none; border:none; cursor:pointer;">
                        <div class="avatar" style="width:28px;height:28px;border-radius:50%;
                            background:linear-gradient(135deg, var(--accent), var(--purple));
                            display:flex;align-items:center;justify-content:center;
                            color:white;font-size:11px;font-weight:800;flex-shrink:0;">
                            ${shortName.charAt(0).toUpperCase()}
                        </div>
                        <div class="profile-label">
                            <span class="profile-greeting">${greeting}</span>
                            <span class="profile-name">${shortName}</span>
                        </div>
                    </button>
                    ` : '<div style="width:40px;"></div>'}

                    <div class="nav-links">
                        <button class="nav-item ${state.view === 'home' ? 'active' : ''}" onclick="navigate('home')">
                            <i class="ph-fill ph-house"></i> Home
                        </button>
                        <button class="nav-item ${state.view === 'planner' ? 'active' : ''}" onclick="navigate('planner')">
                            <i class="ph ph-calendar"></i> Planner
                        </button>
                        <button class="nav-item ${state.view === 'voti' ? 'active' : ''}" onclick="navigate('voti')">
                            <i class="ph ph-chart-line-up"></i> Voti
                        </button>
                    </div>
                    
                    <div style="width:${state.isLoggedIn ? '80px' : '40px'}; flex-shrink:0;"></div>
                </div>
            </nav>`;
        }
        function updatePlanTaskUI(taskId, isPlanned) {
            const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
            if (!taskElement) return;

            const checkbox = taskElement.querySelector('.plan-checkbox, [data-plan-checkbox]');
            const container = taskElement;

            if (checkbox) {
                if (isPlanned) {
                    checkbox.style.background = 'var(--green, #30D158)';
                    checkbox.style.borderColor = 'var(--green, #30D158)';
                    checkbox.innerHTML = '<i class="ph-bold ph-check" style="font-size: 16px; color: black;"></i>';
                } else {
                    checkbox.style.background = 'transparent';
                    checkbox.style.borderColor = 'rgba(255,255,255,0.2)';
                    checkbox.innerHTML = '';
                }

                checkbox.style.transform = 'scale(0.85) translateZ(0)';
                requestAnimationFrame(() => {
                    setTimeout(() => {
                        checkbox.style.transform = 'scale(1) translateZ(0)';
                    }, 50);
                });
            }

            if (container) {
                container.style.transition = 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
                container.style.borderLeftColor = isPlanned ? 'var(--green, #30D158)' : 'rgba(255,255,255,0.05)';
                container.style.background = isPlanned ? 'rgba(48, 209, 88, 0.08)' : 'rgba(255,255,255,0.03)';
            }
        }
        function updatePlannerCounter() {
            // Function retired: replaced numeric badge with static green '+'
        }
        function updateHomeView() {
            if (state.view !== 'home') return;

            const plannerWidget = document.getElementById('today-planner-widget');
            if (plannerWidget) {
                const todayStr = getLocalDateString();
                const todayPlanned = state.plannedTasks[todayStr] || [];
                const plannedTasks = state.tasks.filter(t => todayPlanned.includes(t.id));

                const tasksHTML = plannedTasks.length > 0 ?
                    plannedTasks.map(t => {
                        const subjectColor = getSubjectColor(t.subject);
                        return `
                            <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: rgba(255,255,255,0.03); border-radius: 12px; border-left: 3px solid ${subjectColor};">
                                <div style="flex: 1; min-width: 0;">
                                    <div style="font-weight: 600; font-size: 14px; color: white; margin-bottom: 2px;">${t.text}</div>
                                    <div style="font-size: 11px; color: ${subjectColor}; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">${t.subject}</div>
                               </div>
                           </div>
                        `;
                    }).join('') :
                    '<div style="text-align: center; opacity: 0.5; font-size: 13px; padding: 10px;">Nessun compito pianificato.</div>';

                plannerWidget.style.transition = 'opacity 0.2s ease-out';
                plannerWidget.style.opacity = '0';
                setTimeout(() => {
                    plannerWidget.innerHTML = tasksHTML;
                    plannerWidget.style.opacity = '1';
                }, 200);
            }

            updatePlannerCounter();
        }
        function buildCalendarEventsFromState() {
            return (state.tasks || [])
                .filter(t => t.due_date && t.hasValidDate)
                .map(t => {
                    const color = getSubjectColor(t.subject || 'Generico');
                    // 🚀 SENIOR FIX: Truncate subject to 4 chars for extreme legibility
                    const sub = (t.subject || 'GEN').substring(0, 4).toUpperCase();
                    return {
                        title: `${sub}: ${t.text}`,
                        start: t.due_date,
                        color: t.done ? '#30D158' : color,
                        textColor: '#fff',
                        extendedProps: { fullText: t.text, subject: t.subject }
                    };
                });
        }
        function getSubjectAbbrev(subject) {
            if (!subject) return 'GEN';
            let cleanSubj = subject.replace(/[*_\[\]]/g, '').trim();
            if (!cleanSubj) return 'GEN';

            const abbrevs = {
                'ITALIANO': 'ITA', 'MATEMATICA': 'MAT', 'INGLESSE': 'ING', 'INGLESE': 'ING',
                'STORIA': 'STO', 'GEOGRAFIA': 'GEO', 'FILOSOFIA': 'FIL',
                'FISICA': 'FIS', 'SCIENZE': 'SCI', 'BIOLOGIA': 'BIO',
                'CHIMICA': 'CHI', 'ARTE': 'ART', 'DISEGNO': 'DIS',
                'RELIGIONE': 'REL', 'EDUCAZIONE FISICA': 'EDF', 'INFORMATICA': 'INF'
            };
            const key = cleanSubj.toUpperCase().trim();
            if (abbrevs[key]) return abbrevs[key];
            for (let [full, short] of Object.entries(abbrevs)) {
                if (key.includes(full)) return short;
            }
            return key.substring(0, 3).toUpperCase();
        }
        function initPlannerCalendar() {
            renderCustomCalendar();
        }
        function syncCalendarEvents() {
            renderCustomCalendar();
        }
        function renderCustomCalendar() {
            const calendarEl = document.getElementById('calendar');
            if (!calendarEl) return;

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Calcola il lunedì della settimana corrente
            const d = today.getDay();
            const diffToMonday = today.getDate() - (d === 0 ? 6 : d - 1);
            const startOfCurrentWeek = new Date(new Date(today).setDate(diffToMonday));
            startOfCurrentWeek.setHours(0, 0, 0, 0);

            // Data di inizio basata sull'offset (settimane)
            const startDate = new Date(startOfCurrentWeek);
            startDate.setDate(startOfCurrentWeek.getDate() + (calendarState.weekOffset * 7));

            const endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + 13);

            const monthNames = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
            const weekLabel = `Settimana ${startDate.getDate()} ${monthNames[startDate.getMonth()]} - ${endDate.getDate()} ${monthNames[endDate.getMonth()]}`;

            let html = `
                <div class="custom-calendar">
                    <div class="calendar-header">
                        <div class="calendar-title">${weekLabel}</div>
                        <div class="calendar-nav">
                            <button onclick="navigateCalendar(-1)" title="Settimana precedente"><i class="ph ph-caret-left"></i></button>
                            <button onclick="navigateCalendar(1)" title="Settimana successiva"><i class="ph ph-caret-right"></i></button>
                       </div>
                   </div>
                    <div class="weekday-headers">
                        <div class="weekday-header">Lun</div>
                        <div class="weekday-header">Mar</div>
                        <div class="weekday-header">Mer</div>
                        <div class="weekday-header">Gio</div>
                        <div class="weekday-header">Ven</div>
                        <div class="weekday-header">Sab</div>
                        <div class="weekday-header">Dom</div>
                   </div>
                    <div class="calendar-days">
            `;

            const todayISO = getLocalDateString(today);

            const tempDate = new Date(startDate);
            for (let i = 0; i < 14; i++) {
                const dateStr = getLocalDateString(tempDate);
                const isToday = dateStr === todayISO;
                const isPast = tempDate < today && !isToday;

                let dayTasks = [];
                if (state.plannerMode === 'registro') {
                    // Badge based on DUE DATE - Show all except AI and manual quests
                    dayTasks = (state.tasks || []).filter(t => !t.id.startsWith('ai_') && t.subject !== 'QUEST' && t.due_date === dateStr);
                } else {
                    // Badge based on PLANNED DATE
                    const plannedIds = state.plannedTasks[dateStr] || [];
                    dayTasks = (state.tasks || []).filter(t => plannedIds.includes(t.id));
                }

                html += `
                    <div class="calendar-day ${isToday ? 'today' : ''} ${isPast ? 'past' : ''}" 
                         onclick="${isPast ? '' : `handleDayClick('${dateStr}')`}">
                        <div class="day-number">${tempDate.getDate()}</div>
                        <div class="day-events">
                            ${dayTasks.slice(0, 3).map(t => {
                    const color = getSubjectColor(t.subject);
                    const abbrev = getSubjectAbbrev(t.subject);
                    return `<div class="event-badge ${t.done ? 'done' : ''}" style="background: ${color}">${abbrev}</div>`;
                }).join('')}
                            ${dayTasks.length > 3 ? `<div class="more-events">+${dayTasks.length - 3}</div>` : ''}
                       </div>
                   </div>
                `;
                tempDate.setDate(tempDate.getDate() + 1);
            }

            html += `</div></div>`;
            calendarEl.innerHTML = html;
        }
        function navigateCalendar(dir) {
            calendarState.weekOffset += dir;
            renderCustomCalendar();
        }
        function handleDayClick(dateStr) {
            if (typeof renderDayDetailModal === 'function') {
                renderDayDetailModal(dateStr);
            }
        }
        function renderLogin() {
            const savedSession = sessionManager.load();
            const hasSession = savedSession && sessionManager.isLoggedIn();

            return `
        <div class="view" style="height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 24px; text-align: center;">
            <div style="width: 80px; height: 80px; background: linear-gradient(135deg, var(--accent), var(--blue)); border-radius: 22px; display: flex; align-items: center; justify-content: center; margin-bottom: 32px; box-shadow: 0 8px 16px var(--accent-glow);">
                <i class="ph-fill ph-student" style="font-size: 40px; color: white;"></i>
            </div>
            
            <h1 style="font-size: 32px; font-weight: 800; margin: 0;">G-Connect</h1>
            <p style="color: var(--text-secondary); font-size: 16px; margin: 8px 0 40px 0; max-width: 280px;">Il compagno di studio definitivo per gli studenti del Gandhi.</p>
            
            <div style="width: 100%; max-width: 320px; display: flex; flex-direction: column; gap: 16px;">
                <button class="btn-primary" onclick="openArgoLogin()" style="width: 100%; height: 52px; font-size: 16px;">
                    <i class="ph-bold ph-sign-in"></i> Accedi con DidUP
                </button>
                
                ${hasSession ? `
                <div style="padding: 20px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: 16px; margin-top: 12px;">
                    <div style="font-size: 11px; font-weight: 800; color: var(--text-dim); text-transform: uppercase;">Sessione salvata</div>
                    <div style="font-size: 15px; font-weight: 700; margin: 4px 0 16px 0;">${state.user?.name || 'Utente'}</div>
                    <button onclick="logout()" style="width: 100%; height: 40px; border-radius: 10px; background: rgba(239, 68, 68, 0.05); border: 1px solid rgba(239, 68, 68, 0.1); color: var(--red); font-size: 13px; font-weight: 700; cursor: pointer;">
                        Usa altro account
                    </button>
                </div>
                ` : ''}
            </div>
        </div>`;
        }
        function renderHome() {
            const todayStr = getLocalDateString();
            const plannedIds = state.plannedTasks[todayStr] || [];
            const plannedTasks = state.tasks.filter(t => plannedIds.includes(t.id));
            const media = calcolaMedia(state.voti);
            
            const h = new Date().getHours();
            let greeting = "Buonasera";
            if (h < 12) greeting = "Buongiorno";
            else if (h < 18) greeting = "Buon pomeriggio";

            const stressVal = state.stressLevels?.[todayStr] || '-';
            const stressNum = (typeof stressVal === 'object' ? stressVal.stress : Number(stressVal)) || 0;
            const stressColor = stressVal === '-' ? 'var(--text-dim)' : (stressNum <= 3 ? 'var(--green)' : stressNum <= 4 ? 'var(--orange)' : 'var(--red)');

            const quote = (typeof getDailyQuote === 'function' ? getDailyQuote() : '') || getMotivationalFallback();

            return `
        <div class="view">
            <div class="hero-container">
                <div style="position: relative; z-index: 1;">
                    <p class="hero-subtitle">
                        ${new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                    <h1 class="hero-title" onclick="navigate('profile')" style="cursor: pointer;">
                        ${greeting},<br>${getSafeUserName()}
                    </h1>
                    <p class="hero-status" style="display:flex; align-items:flex-start; justify-content:space-between; width:100%; gap:8px;">
                        <span style="font-style:italic; opacity:0.8; flex:1;">"${quote}"</span>
                        <button onclick="refreshDailyQuote(this); event.stopPropagation();" style="background:none; border:none; cursor:pointer; padding:4px;" title="Nuova frase">
                            <i class="ph-bold ph-arrows-clockwise"></i>
                        </button>
                    </p>
                </div>
            </div>

            <!-- METRICS -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px;">
                <div class="metric-card" onclick="navigate('mental_health')">
                    <div style="position: relative; z-index: 2;">
                        <div class="title">MENTAL HEALTH</div>
                        <div style="color:${stressColor};">
                            ${typeof stressVal === 'object' ? (stressVal.stress || '-') : stressVal}<span style="font-size:13px; color:var(--text-dim); padding-left:2px;">/5</span>
                        </div>
                    </div>
                    <canvas id="stressWaveCanvas" style="width:100%; height:40px; position:absolute; bottom:0; left:0; pointer-events:none; opacity: 0.6; z-index: 1;"></canvas>
                </div>
                <div class="metric-card" onclick="navigate('voti')">
                    <div>
                        <div class="title">MEDIA</div>
                        <div style="color:${media >= 6 ? 'var(--green)' : media >= 5 ? 'var(--orange)' : 'var(--red)'};">
                            ${media || '-'}
                        </div>
                    </div>
                    <div style="position:absolute; bottom:16px; left:20px; right:20px; height:5px; background:rgba(0,0,0,0.04); border-radius:3px; overflow:hidden;">
                        <div style="width:${(media / 10) * 100}%; height:100%; border-radius:3px; background:linear-gradient(90deg, var(--blue), var(--purple));"></div>
                    </div>
                </div>
            </div>

            <!-- AGGIUNGI COMPITO RAPIDO -->
            <div style="margin-bottom: 24px;">
                <button onclick="showQuickAddTaskModal()" style="width:100%; padding:18px; border-radius:18px;
                    background: var(--bg-card); border: 1px solid rgba(99,102,241,0.15); color: var(--accent); cursor: pointer;
                    display:flex; align-items:center; justify-content:center; gap:10px;
                    font-size:15px; font-weight:700; box-shadow: 0 2px 8px rgba(99,102,241,0.06);">
                    <i class="ph-bold ph-plus-circle" style="font-size:20px; color:var(--accent);"></i>
                    Aggiungi Compito
                </button>
            </div>

            <!-- BACHECA (CIRCOLARI) -->
            <div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
                    <h2 style="font-size:17px; font-weight:700; display:flex; align-items:center; gap:8px;">
                        <i class="ph-fill ph-megaphone" style="color:var(--accent-warm);"></i> Circolari
                    </h2>
                    <button onclick="refreshCircolari()" style="cursor:pointer; color:var(--accent-warm); font-size:11px; font-weight:800;
                        padding:6px 14px; border-radius:20px; background:rgba(245,158,11,0.06); border:1px solid rgba(245,158,11,0.15);
                        display:flex; align-items:center; gap:6px;">
                        <i class="ph-bold ph-arrow-clockwise"></i> AGGIORNA
                    </button>
                </div>
                <div class="circolari-scroll" style="display: flex; overflow-x: auto; gap: 10px; scroll-snap-type: x mandatory; padding-bottom: 8px; -webkit-overflow-scrolling: touch; scrollbar-width: none;">
                    ${state.circolari.length === 0 ? `
                        <div style="min-width: 100%; padding: 30px; text-align: center; background: rgba(0,0,0,0.02); border-radius: 20px; border: 1px dashed rgba(0,0,0,0.1); flex-shrink: 0;">
                            <div style="color: var(--text-dim); font-size: 13px; margin-bottom: 8px;">Nessuna circolare disponibile al momento</div>
                            <button onclick="refreshCircolari()" style="background:transparent; border:none; color:var(--accent-warm); font-weight:700; cursor:pointer;">Prova ad aggiornare</button>
                        </div>
                    ` : state.circolari.map((c, i) => `
                        <div onclick="mostraCircolare('${c.id}')" style="cursor:pointer; padding:18px; border-radius:20px;
                            background:var(--bg-card); border:1px solid rgba(0,0,0,0.06);
                            display:flex; flex-direction:column; gap:8px; min-width: 220px; max-width: 240px; flex-shrink: 0; scroll-snap-align: start;
                            box-shadow: 0 2px 8px rgba(0,0,0,0.04), 0 4px 16px rgba(99,102,241,0.04);">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                                <div style="font-size:11px; color:var(--accent-warm); font-weight:800; text-transform:uppercase; letter-spacing:0.5px;">N. ${c.numero}</div>
                                ${c.sintesi ? '<i class="ph-fill ph-check-circle" style="color:var(--green); font-size:14px;"></i>' : ''}
                            </div>
                            <div style="font-size:15px; font-weight:700; color:var(--text-primary); line-height:1.4; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;">
                                ${c.titolo}
                            </div>
                            <div style="font-size:11px; color:var(--text-dim); margin-top:auto; font-weight:600;">
                                <i class="ph ph-calendar-blank" style="vertical-align: middle; margin-right:4px;"></i> ${c.data}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>`;
        }
        function renderPlanner() {
            const uiMode = state.plannerView || 'calendar';

            return `
        <div class="view">

            <!-- HERO GRADIENT -->
            <div class="premium-hero">
                <div style="position: relative; z-index: 1;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: nowrap;">
                        <div>
                            <h1 class="hero-title">Planner</h1>
                            <p class="hero-subtitle">Organizza lo studio e le scadenze</p>
                        </div>
                        <div style="display: flex; gap: 6px; align-items: center; margin-left: auto;">
                            <!-- AI TUTOR -->
                            <button class="btn-icon-glass" onclick="navigate('ai_assistant')" title="AI Tutor" style="width: 40px; height: 40px; border-radius: 20px;">
                                <i class="ph-fill ph-sparkle" style="color: rgba(139,92,246,0.9); font-size: 18px;"></i>
                            </button>

                            <!-- VIEW SWITCHER (Pill style) -->
                            <div style="background: rgba(99,102,241,0.06); border-radius: 30px; padding: 3px; display: flex; border: 1px solid rgba(99,102,241,0.12); flex-shrink: 0; height: 40px; align-items: center; box-shadow: 0 4px 12px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.5);">
                                <button onclick="window.switchPlannerView('calendar')" data-planner-view="calendar" 
                                    style="width: 34px; height: 34px; border-radius: 17px; border: none; cursor: pointer; transition: all 0.3s cubic-bezier(0.4,0,0.2,1); display: flex; align-items: center; justify-content: center;
                                    background: ${uiMode === 'calendar' ? 'white' : 'transparent'};
                                    color: ${uiMode === 'calendar' ? 'var(--accent)' : 'var(--text-secondary)'};
                                    ${uiMode === 'calendar' ? 'box-shadow: 0 2px 8px rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.2);' : ''}">
                                    <i class="ph-bold ph-calendar" style="font-size: 16px;"></i>
                                </button>
                                <button onclick="window.switchPlannerView('list')" data-planner-view="list" 
                                    style="width: 34px; height: 34px; border-radius: 17px; border: none; cursor: pointer; transition: all 0.3s cubic-bezier(0.4,0,0.2,1); display: flex; align-items: center; justify-content: center;
                                    background: ${uiMode === 'list' ? 'white' : 'transparent'};
                                    color: ${uiMode === 'list' ? 'var(--accent)' : 'var(--text-secondary)'};
                                    ${uiMode === 'list' ? 'box-shadow: 0 2px 8px rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.2);' : ''}">
                                    <i class="ph-bold ph-list-bullets" style="font-size: 16px;"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- SMART ADVICE BANNER (v1.1.68 Enhanced) -->
            ${(() => {
                    const todayStr = getLocalDateString();
                    const mh = state.stressLevels[todayStr];
                    if (mh && typeof mh === 'object' && (mh.stress >= 4 || mh.fatigue >= 4 || mh.sleep < 5)) {
                        const ai = _mhAICache && _mhAICache._date === todayStr ? _mhAICache : null;
                        const reason = mh.sleep < 5 ? `Hai dormito solo ${mh.sleep}h` :
                            mh.stress >= 4 ? 'Il tuo stress è alto' : 'La tua stanchezza mentale è elevata';
                        return `
                    <div class="mh-advice-card" style="margin: 0 0 24px 0; animation: fadeInDown 0.4s ease;">
                        <h4 style="margin:0 0 10px 0; font-size:14px; display:flex; align-items:center; gap:8px;">
                            <i class="ph-fill ph-warning-octagon" style="color:#FF453A;"></i> Rischio Burnout Rilevato
                        </h4>
                        <p style="font-size:13px; opacity:0.9; margin:0 0 ${ai ? '12px' : '0'} 0; line-height:1.5;">
                            ${reason}. Ti consigliamo di alleggerire il carico di oggi.
                        </p>
                        ${ai && ai.studyPlan ? `
                        <div style="padding:12px; background:rgba(255,255,255,0.03); border-radius:12px; border-left:3px solid var(--accent);">
                            <p style="margin:0; font-size:12px; line-height:1.5; color:rgba(255,255,255,0.75);">
                                <strong style="color:var(--accent);">Piano suggerito:</strong> ${ai.studyPlan}
                            </p>
                        </div>` : ''}
                    </div>`;
                    }
                    return '';
                })()}


            <div style="display: flex; gap: 4px; margin-bottom: 24px; background: rgba(99,102,241,0.06); padding: 4px; border-radius: 40px; border: 1px solid rgba(99,102,241,0.12); box-shadow: 0 4px 12px rgba(0,0,0,0.03), inset 0 1px 0 rgba(255,255,255,0.6);">
                <button onclick="window.switchPlannerMode('registro')" data-planner-mode="registro" 
                    style="flex:1; height:40px; border-radius:30px; border:none; font-weight:700; font-size:13px; cursor:pointer; transition:all 0.3s cubic-bezier(0.4,0,0.2,1);
                    background: ${state.plannerMode === 'registro' ? 'white' : 'transparent'};
                    color: ${state.plannerMode === 'registro' ? 'var(--accent)' : 'var(--text-secondary)'};
                    ${state.plannerMode === 'registro' ? 'box-shadow: 0 2px 8px rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.2);' : ''}">
                    <i class="ph-bold ph-notebook" style="margin-right: 6px;"></i> Registro Scadenze
                </button>
                <button onclick="window.switchPlannerMode('studio')" data-planner-mode="studio" 
                    style="flex:1; height:40px; border-radius:30px; border:none; font-weight:700; font-size:13px; cursor:pointer; transition:all 0.3s cubic-bezier(0.4,0,0.2,1);
                    background: ${state.plannerMode === 'studio' ? 'white' : 'transparent'};
                    color: ${state.plannerMode === 'studio' ? 'var(--accent)' : 'var(--text-secondary)'};
                    ${state.plannerMode === 'studio' ? 'box-shadow: 0 2px 8px rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.2);' : ''}">
                    <i class="ph-bold ph-graduation-cap" style="margin-right: 6px;"></i> Piano di Studio
                </button>
            </div>

            ${uiMode === 'calendar' ? '<div id="calendar" class="card" style="padding: 10px;"></div>' : ''}

            <div class="section-header" style="margin: 32px 0 16px 0; display: flex; justify-content: space-between; align-items: center; position: relative; z-index: 200;">
                <h2 style="font-size: 18px; display: flex; align-items: center; gap: 8px;">
                    <i class="${state.plannerMode === 'registro' ? 'ph-fill ph-clock' : 'ph-fill ph-calendar-star'}" style="color: var(--accent);"></i>
                    ${state.plannerMode === 'registro' ? 'Scadenze DidUP' : 'Piano Di Studio'}
                </h2>
                
                <div style="display: flex; align-items: center; gap: 12px;">
                    <!-- CLOUD SYNC DROPDOWN (Solo in Piano di Studio v1.1.32.18) -->
                    ${state.plannerMode === 'studio' ? `
                    <div class="planner-dropdown">
                        <button id="planner-cloud-btn" class="btn-icon-glass" onclick="togglePlannerMenu(event)" title="Opzioni Cloud" style="width: 36px; height: 36px; border-radius: 12px; border-color: rgba(255,255,255,0.05);">
                            <i class="ph-bold ph-dots-three-circle" style="font-size: 20px; color: var(--text-secondary);"></i>
                        </button>
                    </div>
                    ` : ''}

                    ${state.plannerMode === 'registro' ? `<span class="section-action" onclick="showAddRegistroTaskModal()" style="font-weight: 700; display:flex; align-items:center; gap:4px;"><i class="ph-bold ph-plus" style="font-size:12px;"></i> Aggiungi</span>` : ''}
                    ${state.plannerMode === 'studio' ? `<span class="section-action" onclick="showPlanWeekModal()" style="font-weight: 700; display:flex; align-items:center; gap:4px;"><i class="ph-bold ph-plus" style="font-size:12px;"></i> Aggiungi Blocco</span>` : ''}
                </div>
            </div>

            <div id="weekly-agenda-list" class="section-animate">
                ${renderWeeklyAgenda()}
            </div>
        </div> `;
        }
        function renderMentalHealthView() {
            migrateStressData();
            const todayStr = getLocalDateString();
            const data = state.stressLevels[todayStr] || { stress: 3, fatigue: 3, sleep: 7, load: 'medium', note: '' };

            // AI Advice (cached or loading)
            const aiData = _mhAICache && _mhAICache._date === todayStr ? _mhAICache : null;
            const adviceHTML = aiData
                ? `<div class="ai-prose" style="margin-bottom:12px;"><strong style="color:white; font-size:15px; display:block; margin-bottom:6px;">Consiglio AI:</strong> ${typeof marked !== 'undefined' ? marked.parse(aiData.advice || '') : (aiData.advice || '')}</div>
                   <div class="ai-prose"><strong style="color:white; font-size:15px; display:block; margin-bottom:6px;">Piano Studio Suggerito:</strong> ${typeof marked !== 'undefined' ? marked.parse(aiData.studyPlan || '') : (aiData.studyPlan || '')}</div>`
                : `<div style="display:flex; align-items:center; gap:10px;">
                     <div class="mh-loading-dot"></div>
                     <span style="opacity:0.7;">Analisi AI in corso...</span>
                   </div>`;

            const severityBadge = aiData
                ? `<span class="mh-badge ${aiData.severity === 'high' ? 'mh-badge-high' : aiData.severity === 'medium' ? 'mh-badge-mid' : 'mh-badge-low'}">${aiData.severity === 'high' ? 'Attenzione' : aiData.severity === 'medium' ? 'Moderato' : 'Ottimo'}</span>`
                : '';

            // Trend 7 days (stress + sleep dual line)
            const trendStress = [], trendSleep = [], labels = [];
            for (let i = 6; i >= 0; i--) {
                const d = new Date(); d.setDate(d.getDate() - i);
                const ds = getLocalDateString(d);
                const val = state.stressLevels[ds];
                trendStress.push(typeof val === 'object' ? val.stress : (Number(val) || 0));
                trendSleep.push(typeof val === 'object' ? val.sleep : 0);
                labels.push(d.toLocaleDateString('it-IT', { weekday: 'short' }).substring(0, 3));
            }
            const stressPath = trendStress.map((v, i) => `${20 + (i / 6) * 260},${110 - (v / 5) * 80}`).join(' L ');
            const sleepPath = trendSleep.map((v, i) => `${20 + (i / 6) * 260},${110 - (v / 12) * 80}`).join(' L ');

            // Trigger AI fetch if not cached
            if (!aiData) {
                fetchMHAIAdvice().then(result => {
                    if (result && state.view === 'mental_health') render();
                });
            }

            return `
            <div class="view animate-fade-in" style="padding: 100px 24px 120px 24px;">
                <div style="display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:28px;">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <button type="button" onclick="navigate('home')" style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.1); width:44px; height:44px; border-radius:14px; color:white; display:flex; align-items:center; justify-content:center; cursor:pointer; transition: all 0.2s;">
                            <i class="ph-bold ph-arrow-left" style="font-size:18px;"></i>
                        </button>
                        <div>
                            <h1 style="margin:0; font-size:22px; font-weight:800; letter-spacing:-0.5px;">Benessere</h1>
                            <p style="margin:2px 0 0; font-size:12px; color:var(--text-dim);">${new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                        </div>
                    </div>
                </div>

                <!-- DAILY CHECK-IN -->
                <div class="glass-panel" style="padding:28px 24px; margin-bottom:24px; border-radius:24px; border-bottom: 2px solid rgba(255,255,255,0.03);">
                    <h3 style="margin:0 0 24px 0; font-size:14px; opacity:0.6; text-transform:uppercase; letter-spacing:1.5px; display:flex; align-items:center; gap:8px;">
                        <i class="ph-fill ph-heart-half" style="color:#FF6B8A;"></i> Check-in Giornaliero
                    </h3>

                    <div class="mh-metric-box">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-weight:700; font-size:15px;">Livello di Stress</span>
                            <span id="mh-badge-stress" class="mh-badge ${data.stress > 3 ? 'mh-badge-high' : data.stress > 1 ? 'mh-badge-mid' : 'mh-badge-low'}">${data.stress}/5</span>
                        </div>
                        <div class="mh-slider-container">
                            <input type="range" min="1" max="5" value="${data.stress}" class="mh-slider" style="--slider-color: ${data.stress > 3 ? '#FF453A' : data.stress > 1 ? '#FF9F0A' : '#30D158'};" oninput="updateMHMetric('stress', parseInt(this.value)); this.style.setProperty('--slider-color', this.value > 3 ? '#FF453A' : this.value > 1 ? '#FF9F0A' : '#30D158'); document.getElementById('mh-badge-stress').className = 'mh-badge ' + (this.value > 3 ? 'mh-badge-high' : this.value > 1 ? 'mh-badge-mid' : 'mh-badge-low');">
                            <div style="display:flex; justify-content:space-between; margin-top:6px;">
                                <span style="font-size:10px; opacity:0.4;">Calmo</span>
                                <span style="font-size:10px; opacity:0.4;">Molto stressato</span>
                            </div>
                        </div>
                    </div>

                    <div class="mh-metric-box">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-weight:700; font-size:15px;">Stanchezza Mentale</span>
                            <span id="mh-badge-fatigue" class="mh-badge ${data.fatigue > 3 ? 'mh-badge-high' : data.fatigue > 1 ? 'mh-badge-mid' : 'mh-badge-low'}">${data.fatigue}/5</span>
                        </div>
                        <div class="mh-slider-container">
                            <input type="range" min="1" max="5" value="${data.fatigue}" class="mh-slider" oninput="updateMHMetric('fatigue', parseInt(this.value)); document.getElementById('mh-badge-fatigue').className = 'mh-badge ' + (this.value > 3 ? 'mh-badge-high' : this.value > 1 ? 'mh-badge-mid' : 'mh-badge-low');">
                            <div style="display:flex; justify-content:space-between; margin-top:6px;">
                                <span style="font-size:10px; opacity:0.4;">Fresco</span>
                                <span style="font-size:10px; opacity:0.4;">Esausto</span>
                            </div>
                        </div>
                    </div>

                    <div class="mh-metric-box">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-weight:700; font-size:15px;">Ore di Sonno</span>
                            <span id="mh-badge-sleep" style="font-weight:800; font-size:18px; color:${data.sleep < 6 ? '#FF453A' : data.sleep < 7 ? '#FF9F0A' : 'var(--accent)'}">${data.sleep}h</span>
                        </div>
                        <div class="mh-slider-container">
                            <input type="range" min="0" max="12" step="0.5" value="${data.sleep}" class="mh-slider" oninput="updateMHMetric('sleep', parseFloat(this.value)); document.getElementById('mh-badge-sleep').style.color = (this.value < 6 ? '#FF453A' : this.value < 7 ? '#FF9F0A' : 'var(--accent)');">
                            <div style="display:flex; justify-content:space-between; margin-top:6px;">
                                <span style="font-size:10px; opacity:0.4;">0h</span>
                                <span style="font-size:10px; color:${data.sleep < 6 ? '#FF453A' : 'rgba(255,255,255,0.3)'}">${data.sleep < 6 ? '⚠️ Debito' : ''}</span>
                                <span style="font-size:10px; opacity:0.4;">12h</span>
                            </div>
                        </div>
                    </div>


                </div>

                <!-- AI INSIGHT (Real Gemini) -->
                <div class="mh-advice-card" style="margin-bottom:20px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
                        <h3 style="margin:0; font-size:14px; text-transform:uppercase; letter-spacing:0.5px; display:flex; align-items:center; gap:8px;">
                            <i class="ph-fill ph-brain" style="color:#A78BFA;"></i> AI Insight
                        </h3>
                        ${severityBadge}
                    </div>
                    <div style="font-size:14px; line-height:1.7; color:rgba(255,255,255,0.85);">
                        ${adviceHTML}
                    </div>
                    ${aiData && aiData.quote ? `
                    <div style="margin-top:16px; padding:14px; background:rgba(255,255,255,0.03); border-radius:14px; border-left:3px solid var(--accent);">
                        <p style="margin:0; font-size:13px; font-style:italic; color:rgba(255,255,255,0.7); line-height:1.5;">"${aiData.quote}"</p>
                    </div>` : ''}
                </div>

                <!-- TREND CHART (Dual: Stress + Sleep) -->
                <div class="glass-panel" style="padding:20px; border-radius:24px; margin-bottom:20px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                        <h3 style="margin:0; font-size:13px; opacity:0.5; text-transform:uppercase; letter-spacing:1px;">Andamento 7 Giorni</h3>
                        <div style="display:flex; gap:12px; font-size:10px;">
                            <span style="display:flex; align-items:center; gap:4px;"><span style="width:8px;height:3px;background:var(--accent);border-radius:2px;"></span> Stress</span>
                            <span style="display:flex; align-items:center; gap:4px;"><span style="width:8px;height:3px;background:#30D158;border-radius:2px;"></span> Sonno</span>
                        </div>
                    </div>
                    <div style="height:140px; width:100%; position:relative; overflow:visible;">
                        <svg viewBox="0 0 300 140" preserveAspectRatio="xMidYMid meet" style="width:100%; height:100%; overflow:visible;">
                            <!-- Grid lines -->
                            <line x1="20" y1="30" x2="280" y2="30" stroke="rgba(255,255,255,0.05)" />
                            <line x1="20" y1="70" x2="280" y2="70" stroke="rgba(255,255,255,0.05)" />
                            <line x1="20" y1="110" x2="280" y2="110" stroke="rgba(255,255,255,0.05)" />
                            <!-- Stress line -->
                            <path d="M ${stressPath}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
                            <!-- Sleep line -->
                            <path d="M ${sleepPath}" fill="none" stroke="#30D158" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.7" />
                            <!-- Dots -->
                            ${trendStress.map((v, i) => {
                                const cx = (20 + (i / 6) * 260).toFixed(1);
                                const cy = (110 - (v / 5) * 80).toFixed(1);
                                return `<circle cx="${cx}" cy="${cy}" r="3.5" fill="var(--accent)" />`;
                            }).join('')}
                        </svg>
                    </div>
                    <div style="display:flex; justify-content:space-between; padding:0 8px; margin-top:4px;">
                        ${labels.map(l => `<span style="font-size:10px; opacity:0.35; text-transform:capitalize;">${l}</span>`).join('')}
                    </div>
                </div>

                <!-- NOTES -->
                <div class="glass-panel" style="padding:20px; border-radius:24px;">
                    <h3 style="margin:0 0 12px 0; font-size:14px; opacity:0.6; display:flex; align-items:center; gap:8px;">
                        <i class="ph ph-note-pencil" style="color:var(--accent);"></i> Diario Breve
                    </h3>
                    <textarea 
                        id="mh-note-textarea"
                        style="width:100%; height:80px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:16px; padding:16px; color:white; font-family:inherit; font-size:14px; outline:none; resize:none; transition: border-color 0.2s;"
                        placeholder="Cosa ti ha pesato oggi? Questo è privato e aiuta a riconoscere pattern..."
                        onfocus="this.style.borderColor='rgba(99,102,241,0.4)'"
                        onblur="this.style.borderColor='rgba(255,255,255,0.08)'; updateMHMetric('note', this.value)">${data.note || ''}</textarea>
                </div>
            </div>`;
        }
        function formatFullDate(dateInput) {
            if (!dateInput) return '';
            const date = new Date(dateInput);
            if (isNaN(date.getTime())) return '';
            const months = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
            const day = date.getDate();
            const month = months[date.getMonth()];
            const year = date.getFullYear();
            const time = date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
            return `${day} ${month} ${year} • ${time} `;
        }
        function showStressDetailsModal() {
            const days = 14;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const points = [];
            const modalContainer = getModalContainer();
            if (!modalContainer) return;

            for (let i = days - 1; i >= 0; i--) {
                const d = new Date(today);
                d.setDate(today.getDate() - i);
                const iso = getLocalDateString(d);
                const raw = state.stressLevels[iso];
                const lv = typeof raw === 'object' ? (raw.stress || 0) : (Number(raw) || 0);
                points.push({ date: iso, lv, x: ((days - 1 - i) / (days - 1)) * 280, y: 100 - (lv / 5) * 80 });
            }
            const path = points.map((p, idx) => (idx === 0 ? `M ${p.x.toFixed(1)} ${p.y.toFixed(1)} ` : `L ${p.x.toFixed(1)} ${p.y.toFixed(1)} `)).join(' ');

            modalContainer.innerHTML = `
        <div class="modal-overlay active" onclick="closeModal(event)">
            <div class="modal-content glass-panel" style="max-width: 520px; padding: 20px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <h2 style="margin:0;">Stress • Ultimi ${days} giorni</h2>
                    <button onclick="closeModal()" style="background:none; border:none; color:#60a5fa; font-weight:700;">Chiudi</button>
                </div>
                <div style="width:100%; height:160px; background: rgba(76,29,149,0.18); border:1px solid rgba(255,255,255,0.18); border-radius:12px; display:flex; align-items:center; justify-content:center; overflow:hidden;">
                    <svg viewBox="0 0 300 120" width="100%" height="100%" preserveAspectRatio="none">
                        <defs>
                            <linearGradient id="stressGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stop-color="#a78bfa" stop-opacity="0.65" /><stop offset="100%" stop-color="#7c3aed" stop-opacity="0.0" />
                            </linearGradient>
                        </defs>
                        <path d="${path}" stroke="#a78bfa" stroke-width="3" fill="none" stroke-linecap="round" />
                        <path d="${path} L 280 120 L 0 120 Z" fill="url(#stressGrad)" />
                    </svg>
                </div>
                <div style="display:flex; gap:8px; margin-top:12px;">
                    ${[1, 2, 3, 4, 5].map(lv => `<button onclick="setStressLevel(${lv}, true)" class="btn-primary" style="flex:1; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.22); color:white; font-weight:800;">${lv}</button>`).join('')}
                </div>
            </div>
        </div> `;
        }
        function renderProfile() {
            return `
        <div class="view">
            <div style="margin-bottom: 24px;">
                <h1 style="font-size: 28px; font-weight: 800;">Il Mio Account</h1>
                <p style="color: var(--text-secondary); font-size: 14px;">Gestisci le tue impostazioni e preferenze</p>
            </div>

            <div class="card" style="padding: 32px; display: flex; flex-direction: column; align-items: center; text-align: center; margin-bottom: 24px;">
                ${renderAvatar(state.user.name, 96)}
                <div style="margin-top: 16px;">
                    <div style="font-size: 24px; font-weight: 800; color: var(--text-primary);">${state.user.name || 'Utente'}</div>
                    <div style="font-size: 14px; font-weight: 650; color: var(--accent); background: rgba(99, 102, 241, 0.1); padding: 4px 16px; border-radius: 20px; display: inline-block; margin-top: 8px;">
                        CLASSE ${(normalizeClassUi(state.user.class) || '-') + (state.user.specialization ? ' ' + state.user.specialization : '')}
                    </div>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 32px;">
                <!-- Connection Card -->
                <div class="card" style="padding: 24px;">
                    <div style="display: flex; gap: 16px;">
                        <div style="width: 48px; height: 48px; border-radius: 14px; background: rgba(16, 185, 129, 0.1); display: flex; align-items: center; justify-content: center; color: var(--green);">
                            <i class="ph-fill ph-plugs-connected" style="font-size: 24px;"></i>
                        </div>
                        <div style="flex: 1;">
                            <div style="font-size: 11px; font-weight: 800; color: var(--text-dim); text-transform: uppercase;">Connessione DidUP</div>
                            <div style="font-size: 16px; font-weight: 800; color: ${state.didup.connected ? 'var(--green)' : 'var(--red)'}; margin-top: 2px;">
                                ${state.didup.connected ? 'COLLEGATO' : 'NON COLLEGATO'}
                            </div>
                        </div>
                    </div>
                    ${state.lastSync ? `<div style="font-size: 12px; color: var(--text-dim); margin-top: 16px;">Sincronizzato: ${state.lastSync}</div>` : ''}
                </div>

                <!-- App Stats Card -->
                <div class="card" style="padding: 24px;">
                    <div style="display: flex; gap: 16px;">
                        <div style="width: 48px; height: 48px; border-radius: 14px; background: rgba(99, 102, 241, 0.1); display: flex; align-items: center; justify-content: center; color: var(--accent);">
                            <i class="ph-fill ph-chart-line" style="font-size: 24px;"></i>
                        </div>
                        <div>
                            <div style="font-size: 11px; font-weight: 800; color: var(--text-dim); text-transform: uppercase;">Performance</div>
                            <div style="font-size: 16px; font-weight: 800; color: var(--text-primary); margin-top: 2px;">Ottimizzata</div>
                        </div>
                    </div>
                </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 12px;">
                <button class="btn-primary" onclick="logout()" style="height: 52px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); color: var(--red); box-shadow: none;">
                    <i class="ph-bold ph-sign-out" style="font-size: 20px;"></i> Esci dall'Account
                </button>
            </div>
        </div> `;
        }
        function renderGradesView() {
            if (state.activeSubject) return renderSubjectDetailView(state.activeSubject);

            const votiData = getVotiData();
            const media = parseFloat(calcolaMedia(votiData)) || 0;
            const goal = state.goals?.overall || 8.0;

            const subjectsMap = {};
            votiData.forEach(v => {
                const sub = v.materia || v.subject || 'Altro';
                if (!subjectsMap[sub]) subjectsMap[sub] = [];
                subjectsMap[sub].push(v);
            });

            const subjects = Object.entries(subjectsMap).map(([name, list]) => {
                const subMedia = parseFloat(calcolaMedia(list)) || 0;
                const trend = list.slice(-5).map(v => parseFloat((v.valore || v.value || '0').toString().replace(',', '.')));
                return { name, media: subMedia, count: list.length, trend };
            }).sort((a, b) => b.media - a.media);

            return `
        <div class="view">

            <!-- HERO GRADIENT -->
            <div class="premium-hero">
                <div style="position: relative; z-index: 1;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div>
                            <h1 class="hero-title">Media & Analisi</h1>
                            <p class="hero-subtitle">Monitoraggio del rendimento</p>
                        </div>
                        <button onclick="performSync()" style="width: 40px; height: 40px; border-radius: 20px; background: rgba(99,102,241,0.08); border: 1px solid rgba(99,102,241,0.15); color: var(--accent); cursor: pointer; display:flex; align-items:center; justify-content:center;">
                            <i class="ph-bold ph-arrow-clockwise"></i>
                        </button>
                    </div>
                </div>
            </div>

            <!--Global Media Card-->
            <div class="card" style="background: linear-gradient(135deg, var(--accent) 0%, #4338ca 100%); padding: 32px; border: none; margin-bottom: 32px; box-shadow: 0 20px 40px var(--accent-glow);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div>
                        <div style="color: rgba(255,255,255,0.6); font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">Media Generale</div>
                        <div style="font-size: 64px; font-weight: 900; color: white; line-height: 1; margin-top: 8px;">${media.toFixed(2)}</div>
                    </div>
                    <div style="text-align: right; cursor: pointer;" onclick="promptSetGoal('overall')">
                        <div style="color: rgba(255,255,255,0.6); font-size: 11px; font-weight: 800; text-transform: uppercase;">Obiettivo</div>
                        <div style="font-size: 24px; font-weight: 800; color: white; display: flex; align-items: center; gap: 8px; justify-content: flex-end;">
                            ${goal.toFixed(1)} <i class="ph ph-pencil-simple" style="font-size: 14px; opacity: 0.7;"></i>
                        </div>
                    </div>
                </div>
                <div style="margin-top: 24px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.8);">
                        <span>Progresso Obiettivo</span>
                        <span>${Math.round((media / goal) * 100)}%</span>
                    </div>
                    <div style="height: 10px; background: rgba(0,0,0,0.2); border-radius: 5px; overflow: hidden;">
                        <div style="width: ${Math.min(100, (media / goal) * 100)}%; height: 100%; background: white; box-shadow: 0 0 15px white;"></div>
                    </div>
                </div>
            </div>

            <div style="margin-bottom: 20px;">
                <h2 style="font-size: 18px; display: flex; align-items: center; gap: 8px;">
                    <i class="ph-fill ph-book-open" style="color: var(--accent);"></i> Riepilogo Materie
                </h2>
            </div>

            <div style="display: flex; flex-direction: column; gap: 12px;">
                ${subjects.map(s => {
                const subjColor = getSubjectColor(s.name);
                return `
                    <div class="subject-summary-card" style="border-left-color: ${subjColor};" onclick="state.activeSubject='${s.name.replace(/'/g, "\\'")}'; render();" >
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-size: 15px; font-weight: 700; color: var(--text-primary);">${s.name}</div>
                            <div style="font-size: 12px; color: var(--text-dim);">${s.count} voti totali</div>
                            <div class="mini-trend">
                                ${s.trend.map(v => `<div class="trend-dot" style="background: ${v >= 6 ? 'var(--green)' : 'var(--red)'};"></div>`).join('')}
                            </div>
                        </div>
                        <div class="grade-badge" style="color: ${s.media >= 6 ? 'var(--green)' : 'var(--red)'}">${s.media.toFixed(1)}</div>
                        <i class="ph ph-caret-right" style="color: var(--text-dim);"></i>
                    </div > `;
            }).join('')}
            </div>
        </div> `;
        }
        function renderAIAssistantView() {
            const chat = state.aiChatHistory || [];

            return `
        <div class="view ai-view" style="display:flex; flex-direction:column; height:100svh; padding: 0 !important;">
            
            <!-- HEADER FISSO -->
            <div style="flex-shrink: 0; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; background: rgba(18,18,20,0.95); backdrop-filter: blur(10px); z-index: 10; border-bottom: 1px solid rgba(255,255,255,0.05);">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <button onclick="navigate('planner')" style="background: none; border: none; color: var(--text-primary); cursor: pointer; padding: 4px; display: flex; align-items: center;" title="Torna indietro">
                        <i class="ph-bold ph-arrow-left" style="font-size: 20px;"></i>
                    </button>
                    <div style="width: 8px; height: 8px; border-radius: 50%; background: var(--green); box-shadow: 0 0 10px var(--green);"></div>
                    <span style="font-size: 14px; font-weight: 600; letter-spacing: 0.5px;">Tutor AI</span>
                </div>
                <button onclick="if(confirm('Cancellare tutta la chat?')) clearAIChat()" style="background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px;">
                    <i class="ph-bold ph-trash" style="font-size: 18px;"></i>
                </button>
            </div>

            <!-- CHAT SCROLLABLE: scroll isolato qui dentro -->
            <div id="aiChatMessages" class="ai-chat-scroll-container">
                ${chat.length === 0 ? `
                <div style="text-align: center; padding: 60px 20px; animation: fadeIn 0.5s ease-out;">
                    <h2 style="font-size: 18px; font-weight: 600; margin-bottom: 24px; opacity: 0.9;">Come posso aiutarti oggi?</h2>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; max-width: 360px; margin: 0 auto;">
                        <button onclick="sendAIChatQuick('Organizza la mia settimana 📅')" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; color: var(--text-primary); padding: 16px; font-size: 13px; font-weight: 500; text-align: left; transition: all 0.2s;">
                            <span style="display: block; font-size: 20px; margin-bottom: 8px;">📅</span>
                            Pianifica Settimana
                        </button>
                        <button onclick="sendAIChatQuick('Aiutami a ripassare per la verifica 📝')" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; color: var(--text-primary); padding: 16px; font-size: 13px; font-weight: 500; text-align: left; transition: all 0.2s;">
                            <span style="display: block; font-size: 20px; margin-bottom: 8px;">📝</span>
                            Prepariamoci
                        </button>
                        <button onclick="showCompetencyInputModal()" style="background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.2); border-radius: 16px; color: var(--text-primary); padding: 16px; font-size: 13px; font-weight: 500; text-align: left; transition: all 0.2s;">
                            <span style="display: block; font-size: 20px; margin-bottom: 8px;">🎯</span>
                            Competenze & Priorità
                        </button>
                        <button onclick="sendAIChatQuick('Dammi un consiglio sulla produttività 🚀')" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; color: var(--text-primary); padding: 16px; font-size: 13px; font-weight: 500; text-align: left; transition: all 0.2s;">
                            <span style="display: block; font-size: 20px; margin-bottom: 8px;">🚀</span>
                            Produttività
                        </button>
                    </div>
                </div>
                ` : chat.map((msg, idx) => `
                <div class="msg-appear" style="display:flex; flex-direction:column; ${msg.role === 'user' ? 'align-items:flex-end;' : 'align-items:flex-start;'} margin-bottom:2px;">

                    ${msg.role === 'user' ? `
                    <div style="max-width:82%; background:rgba(255,255,255,0.07); border:1px solid rgba(255,255,255,0.1); border-radius:18px 18px 4px 18px; padding:11px 15px; color:white; font-size:14.5px; line-height:1.55; word-break:break-word;">
                        ${msg.text}
                    </div>
                    ` : `
                    <div style="width:100%; display:flex; flex-direction:column;">
                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                            <div style="width:24px; height:24px; border-radius:50%; background:linear-gradient(135deg,#6366f1,#a855f7); display:flex; align-items:center; justify-content:center; flex-shrink:0; box-shadow:0 2px 8px rgba(99,102,241,0.3);">
                                <i class='ph-fill ph-sparkle' style='font-size:12px; color:white;'></i>
                            </div>
                            <span style="font-size:11px; font-weight:700; color:rgba(255,255,255,0.35); text-transform:uppercase; letter-spacing:0.6px;">Tutor AI</span>
                            <span style="font-size:10px; color:rgba(255,255,255,0.2);">${msg.ts || ''}</span>
                        </div>
                        <div class="ai-prose" style="padding-left:32px;">
                            ${typeof marked !== 'undefined' ? marked.parse(msg.text) : msg.text}
                        </div>
                        ${msg.hasPlan ? `
                        <div style="padding-left:32px; margin-top:14px;">
                            <button onclick="applyAIPlanFromChat(${idx})" style="display:inline-flex; align-items:center; gap:8px; background:linear-gradient(135deg,#6366f1,#a855f7); color:white; border:none; border-radius:12px; padding:10px 18px; font-size:13px; font-weight:700; cursor:pointer; transition:opacity 0.15s; box-shadow:0 4px 14px rgba(99,102,241,0.35);">
                                <i class='ph-bold ph-calendar-plus' style='font-size:15px;'></i> Applica al Planner
                            </button>
                        </div>
                        ` : ''}
                        <div style="margin-top:12px; padding-left:32px; height:1px; background:rgba(255,255,255,0.05);"></div>
                    </div>
                    `}

                </div>
                `).join('')}
            </div>

            <div class="chat-input-bar" style="
                flex-shrink: 0;
                width: 100%;
                padding: 8px 0 16px 0; 
                background: transparent;
                display: flex;
                justify-content: center;
                z-index: 50;
            ">
                <div style="
                        width: 92%;
                        max-width: 540px;
                        margin-left: auto;
                        margin-right: auto;
                        display: flex; 
                        align-items: center; 
                        background: rgba(30,30,30,0.85); 
                        backdrop-filter: blur(12px);
                        -webkit-backdrop-filter: blur(12px);
                        border: 1px solid rgba(255,255,255,0.1); 
                        border-radius: 20px; 
                        padding: 4px 6px 4px 14px; 
                        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                        transition: border-color 0.2s, box-shadow 0.2s;
                    "
                    onfocuswithin="this.style.borderColor='rgba(255,255,255,0.3)'; this.style.boxShadow='0 4px 25px rgba(0,0,0,0.4)';"
                    onblur="this.style.borderColor='rgba(255,255,255,0.1)'; this.style.boxShadow='0 4px 20px rgba(0,0,0,0.3)';">

                    <textarea id="aiChatInput" placeholder="Messaggio..."
                        style="
                                flex: 1;
                                background: transparent; 
                                border: none; 
                                padding: 8px 0; 
                                min-height: 20px; 
                                max-height: 80px;
                                font-size: 15px; 
                                line-height: 1.4;
                                resize: none;
                                outline: none;
                                color: white;
                            "
                        rows="1"
                        onkeydown="if(event.key==='Enter' && !event.shiftKey){event.preventDefault(); sendAIChat()}"
                        oninput="state.aiChatInputValue=this.value; this.style.height='auto'; const max=window.innerWidth<600?60:100; this.style.height=Math.min(this.scrollHeight,max)+'px';">${state.aiChatInputValue || ''}</textarea>

                    <button id="aiMicBtn" onclick="toggleVoiceInput()" style="
                            width: 32px; height: 32px; 
                            background: rgba(255,255,255,0.05); 
                            color: white; 
                            border: none;
                            border-radius: 50%;
                            display: flex; 
                            align-items: center; 
                            justify-content: center;
                            cursor: pointer;
                            transition: all 0.2s;
                        " title="Dettatura vocale">
                        <i class="ph ph-microphone" style="font-size: 18px;"></i>
                    </button>

                    <button onclick="sendAIChat()" style="
                            width: 32px; height: 32px; 
                            padding: 0; 
                            border: none; 
                            background: white; 
                            color: black; 
                            border-radius: 50%; 
                            display: flex; 
                            align-items: center; 
                            justify-content: center; 
                            flex-shrink: 0; 
                            margin-left: 8px;
                            cursor: pointer;
                            transition: transform 0.1s;
                        "
                        onmousedown="this.style.transform='scale(0.9)'"
                        onmouseup="this.style.transform='scale(1)'">
                        <i class="ph-bold ph-arrow-up" style="font-size: 16px;"></i>
                    </button>
                </div>
            </div> `;
        }
        function renderAcademicProfile() {
            const subjects = [...new Set(getVotiData().map(v => v.materia || v.subject))];

            return `
            <div class="view" style="padding-top: 60px;">
                <div style="margin-bottom: 24px;">
                    <h1 style="font-size: 28px; color: var(--text-primary);">Profilo Accademico</h1>
                    <p style="font-size: 15px; color: var(--text-secondary);">Analisi e impostazioni studio</p>
               </div>

                <!-- Study Availability -->
                <div class="glass-panel" style="padding: 24px; margin-bottom: 24px;">
                    <div style="font-size: 16px; font-weight: 600; color: var(--text-primary); margin-bottom: 16px;">Disponibilità Studio</div>
                    <div style="display:flex; gap:16px; align-items:center;">
                        <div style="flex:1;">
                            <label style="display:block; font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px;">INIZIO</label>
                            <input type="time" id="studyStart" value="${state.availability.start}" onchange="saveAvailability()" 
                                style="width:100%; height:48px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; color:white; padding:0 12px; outline:none; font-family: inherit;">
                       </div>
                        <div style="flex:1;">
                            <label style="display:block; font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px;">FINE</label>
                            <input type="time" id="studyEnd" value="${state.availability.end}" onchange="saveAvailability()" 
                                style="width:100%; height:48px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; color:white; padding:0 12px; outline:none; font-family: inherit;">
                       </div>
                   </div>
               </div>

                <!-- Difficult Subjects -->
                <div class="glass-panel" style="padding: 24px; margin-bottom: 24px;">
                    <div style="font-size: 16px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px;">Materie Critiche</div>
                    <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 16px;">Seleziona le materie in cui hai più difficoltà.</p>
                    <div style="display:flex; flex-wrap:wrap; gap:10px;">
                        ${subjects.length > 0 ? subjects.map(s => {
                const active = state.difficulty.includes(s);
                const safeS = s.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                return `<button onclick="toggleDifficulty('${safeS}')" style="padding:10px 16px; border-radius:12px; border:1px solid ${active ? 'var(--orange)' : 'rgba(255,255,255,0.1)'}; background:${active ? 'rgba(255,159,10,0.15)' : 'rgba(255,255,255,0.03)'}; color:${active ? 'var(--orange)' : 'var(--text-primary)'}; font-size:13px; font-weight:600; cursor:pointer; transition:all 0.2s;">${s}</button>`;
            }).join('') : '<div style="font-size:13px; color: var(--text-secondary); padding:10px;">Nessuna materia trovata.</div>'}
                   </div>
               </div>
           </div>`;
        }
        function initStressWaveFromState() {
            const todayStr = getLocalDateString();
            const mh = state.stressLevels[todayStr];
            let level = 3; // Default
            if (mh) {
                level = typeof mh === 'object' ? (mh.stress || 3) : Number(mh);
            }
            renderStressWave(level);
        }
        function renderMediaGauge(target = 0) {
            const canvas = document.getElementById('mediaGaugeCanvas');
            const valueEl = document.getElementById('mediaValue');
            if (!canvas || !valueEl) return;

            const { ctx, rect } = setupCanvas(canvas);
            const W = rect.width, H = rect.height;
            const cx = W / 2, cy = H * 0.95;
            const radius = Math.min(W, H * 2) / 2.3;
            const start = Math.PI;
            const endMax = 2 * Math.PI;
            const lineW = 12;

            if (!state.__mediaGauge) state.__mediaGauge = { current: 0, target: -1 };

            function arcGradient(val) {
                const g = ctx.createLinearGradient(cx - radius, cy, cx + radius, cy);
                if (val >= 6) { g.addColorStop(0, '#30D158'); g.addColorStop(1, '#61e26c'); }
                else if (val >= 5) { g.addColorStop(0, '#FF9F0A'); g.addColorStop(1, '#ffb340'); }
                else { g.addColorStop(0, '#FF453A'); g.addColorStop(1, '#ff6b63'); }
                return g;
            }

            function drawFrame(currentVal) {
                ctx.clearRect(0, 0, W, H);
                ctx.lineWidth = lineW;
                ctx.lineCap = 'round';
                ctx.strokeStyle = 'rgba(255,255,255,0.06)';
                ctx.beginPath(); ctx.arc(cx, cy, radius, start, endMax, false); ctx.stroke();

                const progress = (currentVal / 10);
                const end = start + progress * Math.PI;
                ctx.strokeStyle = arcGradient(currentVal);
                ctx.shadowColor = 'rgba(0,0,0,0.15)';
                ctx.shadowBlur = 4;
                ctx.beginPath(); ctx.arc(cx, cy, radius, start, end, false); ctx.stroke();

                const knobX = cx + radius * Math.cos(end);
                const knobY = cy + radius * Math.sin(end);
                ctx.fillStyle = '#ffffff';
                ctx.shadowBlur = 6;
                ctx.beginPath(); ctx.arc(knobX, knobY, 7, 0, Math.PI * 2); ctx.fill();

                valueEl.textContent = (Math.round(currentVal * 100) / 100).toFixed(2);
                valueEl.style.color = currentVal >= 6 ? 'var(--green)' : (currentVal >= 5 ? 'var(--orange)' : 'var(--red)');
            }

            // Se siamo già a target, disegna frame fisso e stop
            if (state.__mediaGauge.target === target && Math.abs(state.__mediaGauge.current - target) < 0.005) {
                state.__mediaGauge.current = target;
                drawFrame(target);
                if (__mediaGaugeRAF) cancelAnimationFrame(__mediaGaugeRAF);
                __mediaGaugeRAF = null;
                return;
            }

            state.__mediaGauge.target = target;
            if (__mediaGaugeRAF) cancelAnimationFrame(__mediaGaugeRAF);

            function animate() {
                if (!document.getElementById('mediaGaugeCanvas')) {
                    __mediaGaugeRAF = null;
                    return;
                }
                const diff = target - state.__mediaGauge.current;
                if (Math.abs(diff) < 0.005) {
                    state.__mediaGauge.current = target;
                    drawFrame(target);
                    __mediaGaugeRAF = null;
                    saveTasks(); // Persisti lo stato finale
                    return;
                }
                state.__mediaGauge.current += diff * 0.08;
                drawFrame(state.__mediaGauge.current);
                __mediaGaugeRAF = requestAnimationFrame(animate);
            }

            // Disegna subito il primo frame per evitare flicker (blank canvas)
            drawFrame(state.__mediaGauge.current);
            __mediaGaugeRAF = requestAnimationFrame(animate);
        }


/* Remaining UI Functions */
        function isFutureOrToday(dateStr) {
            if (!dateStr) return false;
            const todayStr = getLocalDateString(getSchoolDate());
            return dateStr >= todayStr;
        }
        window.isFutureOrToday = isFutureOrToday;
        function updateWeeklyAgendaView() {
            if (state.view !== 'planner') return;
            const el = document.getElementById('weekly-agenda-list');
            if (!el) return;

            const plannedWithDates = [];
            Object.entries(state.plannedTasks || {}).forEach(([dateStr, taskIds]) => {
                taskIds.forEach(id => {
                    const task = state.tasks.find(t => t.id === id);
                    if (task) plannedWithDates.push({ ...task, plannedDate: dateStr });
                });
            });

            plannedWithDates.sort((a, b) => new Date(a.plannedDate) - new Date(b.plannedDate));

            // Filtra solo date da oggi in poi (non mostrare compiti passati)
            const filtered = plannedWithDates.filter(t => isFutureOrToday(t.plannedDate));

            const dayNamesShort = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
            const html = filtered.length > 0
                ? filtered.map(t => {
                    const d = parseArgoDate(t.plannedDate);
                    const dayLabel = `${dayNamesShort[d.getDay()]} ${d.getDate()}`;
                    const subjectColor = getSubjectColor(t.subject);
                    return `
                                <div class="glass-list-item" style="display:flex; align-items:center; gap:12px; margin-bottom:10px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:8px;">
                                    <div style="min-width:50px; font-size:11px; font-weight:800; color: var(--orange); text-transform: uppercase;">${dayLabel}</div>
                                    <div 
                                        class="task-checkbox ${t.done ? 'checked' : ''}"
                                        data-task-toggle="${t.id}"
                                        onclick="toggleTask('${t.id}')" 
                                        style="width:20px; height:20px; border:2px solid ${t.done ? 'var(--green)' : subjectColor}; background:${t.done ? 'var(--green)' : 'transparent'}; border-radius:6px; display:flex; align-items:center; justify-content:center; flex-shrink:0; cursor:pointer;">
                                        ${t.done ? '<i class="ph-bold ph-check" style="font-size:12px; color:black;"></i>' : ''}
                                   </div>
                                    <div style="flex:1; min-width:0;">
                                        <div data-task-text="${t.id}" style="font-size:14px; color:white; font-weight:500; ${t.done ? 'text-decoration: line-through; opacity: 0.5;' : ''}">
                                            ${t.text}
                                       </div>
                                        <div style="font-size:10px; color:${subjectColor}; font-weight:700; text-transform:uppercase;">${t.subject}</div>
                                   </div>
                               </div>
                            `;
                }).join('')
                : `<div style="text-align:center; opacity:0.5; font-size:13px; padding:10px;">Nessun compito pianificato.</div>`;

            el.style.opacity = '0';
            el.style.transition = 'opacity 0.15s ease-out';
            setTimeout(() => {
                el.innerHTML = html;
                el.style.opacity = '1';
            }, 100);
        }
        function setupCanvas(canvas) {
            const rect = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            canvas.width = Math.floor(rect.width * dpr);
            canvas.height = Math.floor(rect.height * dpr);
            const ctx = canvas.getContext('2d');
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            return { ctx, rect, dpr };
        }
        function renderStressWave(level = 5) {
            if (__stressWaveRAF) cancelAnimationFrame(__stressWaveRAF);
            const canvas = document.getElementById('stressWaveCanvas');
            if (!canvas) return;
            const { ctx, rect } = setupCanvas(canvas);
            const W = rect.width, H = rect.height;

            // Parametri onda in base al livello (Dynamic Speed)
            const ampBase = 12;
            const amp = ampBase * (0.5 + (level / 10) * 0.5);
            const freq = 0.02;
            const speed = 0.02 + (level / 10) * 0.08; // Più stress -> più veloce

            let t = 0;

            function strokeGradient() {
                const g = ctx.createLinearGradient(0, 0, W, 0);
                g.addColorStop(0.00, 'rgba(255,255,255,0.4)');
                g.addColorStop(0.50, 'rgba(255,255,255,0.8)');
                g.addColorStop(1.00, 'rgba(255,255,255,0.4)');
                return g;
            }

            function draw() {
                if (!document.getElementById('stressWaveCanvas')) {
                    cancelAnimationFrame(__stressWaveRAF);
                    __stressWaveRAF = null;
                    return;
                }
                ctx.clearRect(0, 0, W, H);

                ctx.lineWidth = 2.5;
                ctx.strokeStyle = strokeGradient();
                ctx.shadowColor = 'rgba(255,255,255,0.2)';
                ctx.shadowBlur = 4;

                ctx.beginPath();
                const midY = H / 2;
                for (let x = 0; x <= W; x += 4) {
                    const y = midY + Math.sin(x * freq + t) * amp;
                    if (x === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();

                t += speed;
                __stressWaveRAF = requestAnimationFrame(draw);
            }
            __stressWaveRAF = requestAnimationFrame(draw);
        }
        function initCustomScrollbar() {
            const scroller = document.getElementById('custom-scrollbar');
            const thumb = document.getElementById('scroll-thumb');
            if (!scroller || !thumb) return;

            let fadeTimeout;
            let isScrolling = false;

            function updateScroll() {
                const viewportHeight = window.innerHeight;
                const totalHeight = document.documentElement.scrollHeight;
                const scrollY = window.pageYOffset || document.documentElement.scrollTop;

                // Don't show if content fits in one screen
                if (totalHeight <= viewportHeight + 20) {
                    scroller.classList.remove('show-scrollbar');
                    return;
                }

                scroller.classList.add('show-scrollbar');

                // Calculate thumb height proportionally
                const thumbHeight = Math.max(60, (viewportHeight / totalHeight) * viewportHeight);
                const scrollPercent = scrollY / (totalHeight - viewportHeight);
                const thumbTop = scrollPercent * (viewportHeight - thumbHeight - 20); // 20px padding

                thumb.style.height = thumbHeight + 'px';
                thumb.style.transform = `translateY(${thumbTop + 10}px)`; // Offset for floating look

                clearTimeout(fadeTimeout);
                fadeTimeout = setTimeout(() => {
                    scroller.classList.remove('show-scrollbar');
                }, 1800);
            }

            // Listen to root scroll
            window.addEventListener('scroll', updateScroll, { passive: true });
            window.addEventListener('resize', updateScroll);

            // Watch for internal height changes
            const observer = new MutationObserver(updateScroll);
            observer.observe(document.body, { childList: true, subtree: true });

            updateScroll();
        }


/* Chart Functions */
        function initGradesCharts() {
            const canvas = document.getElementById('gradesTrendCanvas');
            if (!canvas) return;

            const { ctx, rect } = setupCanvas(canvas);
            const W = rect.width, H = rect.height;

            let votiData = [...getVotiData()];
            if (state.activeSubject) {
                votiData = votiData.filter(v => (v.materia || v.subject) === state.activeSubject);
            }
            // Sort by absolute time
            votiData.sort((a, b) => parseArgoDate(a.data || a.date) - parseArgoDate(b.data || b.date));

            if (votiData.length < 2) {
                ctx.fillStyle = 'rgba(255,255,255,0.3)';
                ctx.font = '700 13px Rubik';
                ctx.textAlign = 'center';
                ctx.fillText("Trend disponibile dopo 2 voti", W / 2, H / 2);
                return;
            }

            // High Precision: Calculate progressive moving average
            let sum = 0;
            const points = votiData.map((v, i) => {
                const val = parseFloat((v.valore || v.value || '0').toString().replace(',', '.'));
                sum += val;
                return {
                    val: sum / (i + 1),
                    raw: val,
                    date: v.data || v.date
                };
            });

            const padding = 30;
            const scrollX = 0; // Future: horizontal scrolling for many points
            const stepX = (W - padding * 2) / (points.length - 1);

            const values = points.map(p => p.val);
            const minV = Math.max(0, Math.min(...values) - 0.5);
            const maxV = Math.min(10, Math.max(...values, 8) + 0.5);

            function getY(val) {
                return (H - padding * 1.5) - (val / 10) * (H - padding * 2.5);
            }

            // Area Gradient
            const grad = ctx.createLinearGradient(0, 0, 0, H);
            grad.addColorStop(0, 'rgba(37, 99, 235, 0.4)');
            grad.addColorStop(1, 'rgba(37, 99, 235, 0)');

            // Draw Area
            ctx.beginPath();
            ctx.moveTo(padding, getY(series[0]));
            for (let i = 1; i < series.length; i++) {
                ctx.lineTo(padding + i * stepX, getY(series[i]));
            }
            ctx.lineTo(W - padding, H - padding * 1.5);
            ctx.lineTo(padding, H - padding * 1.5);
            ctx.closePath();
            ctx.fillStyle = grad;
            ctx.fill();

            // Draw Line
            ctx.beginPath();
            ctx.moveTo(padding, getY(series[0]));
            for (let i = 1; i < series.length; i++) {
                ctx.lineTo(padding + i * stepX, getY(series[i]));
            }
            ctx.strokeStyle = 'var(--primary)';
            ctx.lineWidth = 4;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();

            // Dots & Labels
            series.forEach((val, i) => {
                const x = padding + i * stepX;
                const y = getY(val);

                ctx.fillStyle = 'white';
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, Math.PI * 2);
                ctx.fill();

                // Draw Day Label
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.font = '800 10px inherit';
                ctx.textAlign = 'center';
                ctx.fillText(labels[i], x, H - 5);
            });
        }
        function renderSubjectDetailView(subjectName) {
            const votiData = getVotiData().filter(v => (v.materia || v.subject) === subjectName).sort((a, b) => parseArgoDate(b.data || b.date) - parseArgoDate(a.data || a.date));
            const media = parseFloat(calcolaMedia(votiData)) || 0;
            const goal = state.goals?.[subjectName] || 8.0;
            const subjColor = getSubjectColor(subjectName);

            return `
        <div class="view">
            <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 24px;">
                <button class="btn-icon-only" onclick="window.closeSubject()" style="width: 44px; height: 44px; border-radius: 12px; background: var(--bg-card); border: var(--card-border); color: white;">
                    <i class="ph-bold ph-arrow-left"></i>
                </button>
                <h1 style="margin: 0; font-size: 24px; font-weight: 800;">Dettaglio Materia</h1>
            </div>

            <div class="card" style="border-left: 6px solid ${subjColor}; padding: 24px; margin-bottom: 32px;">
                <div style="font-size: 11px; font-weight: 800; color: var(--text-dim); text-transform: uppercase; letter-spacing: 1px;">Materia</div>
                <div style="font-size: 28px; font-weight: 800; color: var(--text-primary); margin-top: 4px;">${subjectName}</div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 24px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.05);">
                    <div>
                        <div style="font-size: 10px; color: var(--text-dim); font-weight: 800; text-transform: uppercase;">Media</div>
                        <div style="font-size: 24px; font-weight: 800; color: ${media >= 6 ? 'var(--green)' : 'var(--red)'};">${media.toFixed(2)}</div>
                    </div>
                    <div onclick="promptSetGoal('${subjectName}')" style="cursor: pointer;">
                        <div style="font-size: 10px; color: var(--text-dim); font-weight: 800; text-transform: uppercase;">Obiettivo</div>
                        <div style="font-size: 24px; font-weight: 800; color: var(--accent); display: flex; align-items: center; gap: 6px;">
                            ${goal.toFixed(1)} <i class="ph-bold ph-pencil-simple" style="font-size: 14px;"></i>
                        </div>
                    </div>
                </div>
            </div>

            <div style="margin-bottom: 16px;">
                <h2 style="font-size: 16px; font-weight: 800; color: var(--text-dim); text-transform: uppercase; letter-spacing: 1px;">Registro Voti</h2>
            </div>

            <div style="display: flex; flex-direction: column; gap: 10px;">
                ${votiData.map(v => {
                const val = parseFloat((v.valore || v.value || '0').toString().replace(',', '.'));
                const isSuff = val >= 6;
                return `
                    <div class="card" style="padding: 16px; display: flex; align-items: center; gap: 16px;">
                        <div style="width: 48px; height: 48px; border-radius: 12px; background: ${isSuff ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'}; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 800; color: ${isSuff ? 'var(--green)' : 'var(--red)'};">
                            ${v.valore || v.value}
                        </div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-size: 14px; font-weight: 700; color: var(--text-primary);">${v.tipo || 'Voto'}</div>
                            <div style="font-size: 12px; color: var(--text-dim);">${new Date(v.data || v.date).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                        </div>
                        ${v.commento ? `<i class="ph ph-chat-text" style="color: var(--accent); font-size: 18px;" title="${v.commento}"></i>` : ''}
                    </div>`;
            }).join('')}
            </div>
        </div> `;
        }


/* Remaining UI/Modal/Logic Functions */
        function mostraCircolare(id) {
            const c = state.circolari.find(x => x.id === id);
            if (!c) return;

            showModal(`
            <div style="padding:28px; text-align: left;">
                <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:20px;">
                    <div>
                        <p style="font-size:11px; color:var(--accent-warm); font-weight:800; text-transform:uppercase; margin-bottom:4px;">
                            Circolare N. ${c.numero}
                        </p>
                        <div style="flex:1;">
                            <div class="line-clamp-2" style="font-size:16px; font-weight:700; color:var(--text-primary); line-height:1.4; margin-bottom:8px;">
                                ${c.titolo}
                            </div>
                        </div>
                    </div>
                </div>

                <div id="sintesi-box-${c.id}" style="background:rgba(255,159,10,0.06); border:1px solid rgba(255,159,10,0.15); 
                    padding:22px; border-radius:22px; margin-bottom:24px;">
                    <h3 style="font-size:14px; color:var(--accent-warm); font-weight:800; margin-bottom:16px; display:flex; align-items:center; gap:10px; text-transform:uppercase; letter-spacing:0.5px;">
                        <i class="ph-bold ph-sparkle"></i> Sintesi Premium
                    </h3>
                    <div class="sintesi-content">
                        ${c.sintesi ? marked.parse(c.sintesi) : `
                            <div id="sintesi-placeholder-${c.id}">
                                <p style="color:var(--text-secondary); font-size:14px; margin-bottom:15px;">La sintesi non è stata ancora generata per questa circolare.</p>
                                <button onclick="requestCircularSynthesis('${c.id}', '${c.link}')" 
                                    id="btn-sintesi-${c.id}"
                                    style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:var(--text-primary); 
                                    padding:10px 16px; border-radius:12px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:8px; font-size:13px;">
                                    <i class="ph-bold ph-magic-wand"></i> Sintetizza Circolare ✨
                                </button>
                            </div>
                        `}
                    </div>
                </div>

                <div style="display:grid; grid-template-columns:1fr; gap:12px;">
                    <button onclick="window.open('${c.link}', '_blank')" 
                        style="width:100%; padding:16px; border-radius:16px; background:var(--accent-warm); 
                        color:black; font-weight:800; border:none; cursor:pointer; 
                        display:flex; align-items:center; justify-content:center; gap:10px; font-size:15px; transition: all 0.2s;">
                        <i class="ph-bold ph-arrow-square-out" style="font-size:20px;"></i>
                        Leggi Documento Originale
                    </button>
                    <button onclick="closeModal()" 
                        style="width:100%; padding:14px; border-radius:16px; background:rgba(255,255,255,0.05); 
                        color:var(--text-secondary); font-weight:700; border:none; cursor:pointer;">
                        Chiudi
                    </button>
                </div>
            </div>
        `);

        }
        function renderDayDetailModal(dateStr) {
            const container = getModalContainer();
            if (!container) return;

            const date = parseArgoDate(dateStr);
            const formattedDate = date.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });

            // Strict Semantic Filtering for Modal
            let tasksForDay = [];
            if (state.plannerMode === 'registro') {
                // Show school tasks due this day
                tasksForDay = (state.tasks || []).filter(t => !t.id.startsWith('ai_') && t.subject !== 'QUEST' && t.due_date === dateStr);
            } else {
                // Show ONLY tasks planned for this day
                const plannedIds = state.plannedTasks[dateStr] || [];
                tasksForDay = (state.tasks || []).filter(t => plannedIds.includes(t.id));
            }
            const isRegistro = state.plannerMode === 'registro';
            container.innerHTML = `
                <div class="modal-overlay active" onclick="closeModal(event)">
                    <div class="modal-content glass-panel" onclick="event.stopPropagation()" style="max-width:440px; padding:20px 20px 24px 20px; width:calc(100vw - 40px);">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:24px;">
                            <div>
                                <div style="font-size:11px; font-weight:800; color:${isRegistro ? '#007AFF' : '#FF2D55'}; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;">
                                    ${isRegistro ? 'Scadenze Registro' : 'Organizzazione Studio'}
                               </div>
                                <h2 style="margin:0; font-size:22px; text-transform:capitalize;">${formattedDate}</h2>
                           </div>
                            <button onclick="closeModal()" style="background:rgba(255,255,255,0.05); border:none; width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; cursor:pointer;">
                                <i class="ph ph-x" style="font-size:20px;"></i>
                           </button>
                       </div>

                        <div id="modal-task-list" style="display:flex; flex-direction:column; gap:14px; max-height:65vh; overflow-y:auto; padding-right:4px; -webkit-overflow-scrolling:touch;">
                            ${tasksForDay.length === 0 ? `
                                <div style="text-align:center; padding:48px 20px; color:var(--text-dim);">
                                    <i class="ph ph-calendar-blank" style="font-size:48px; display:block; margin:0 auto 12px; opacity:0.15;"></i>
                                    <div style="font-size:15px; font-weight:600; opacity:0.5;">Nessun compito per questa data</div>
                                </div>
                            ` : tasksForDay.filter(t => !/check-?list|check\s*liste|checklist\s*&\s*review/i.test(t.text)).map(t => {
                const color = getSubjectColor(t.subject);
                const cleanSubject = (t.subject || '').replace(/\*/g, '').trim();
                const timeMatch = (t.text || '').match(/(\d{1,2}:\d{2})/);
                const timeStr = timeMatch ? timeMatch[1] : '';
                // Clear [AI], time patterns, all asterisks (*), and trailing separators (|)
                const displayText = (t.text || '')
                    .replace(/^\[AI\]\s*/i, '')
                    .replace(/^\d{2}:\d{2}\s*[—\-]\s*/, '')
                    .replace(/\*/g, '')
                    .replace(/[\s|]+$/, '')
                    .trim();
                return `
                                    <div style="flex-shrink:0; border-radius:18px; display:flex; align-items:stretch; background:${t.done ? 'rgba(52,199,89,0.06)' : 'rgba(255,255,255,0.04)'}; border:1px solid ${t.done ? 'rgba(52,199,89,0.25)' : 'rgba(255,255,255,0.1)'}; min-height:110px;">
                                        <div style="width:5px; background:${color}; flex-shrink:0;"></div>
                                        <div style="flex:1; padding:22px 18px 24px 18px; min-width:0;">
                                            <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:12px;">
                                                <span style="font-size:11px; font-weight:800; color:${color}; text-transform:uppercase; letter-spacing:0.8px; background:rgba(255,255,255,0.03); padding:2px 8px; border-radius:6px;">${cleanSubject}</span>
                                                ${timeStr ? `<span style="font-size:11px; font-weight:700; color:rgba(255,255,255,0.5); background:rgba(255,255,255,0.08); padding:2px 8px; border-radius:20px;">${timeStr}</span>` : ''}
                                            </div>
                                            <div style="font-size:16.5px; font-weight:600; color:${t.done ? 'rgba(255,255,255,0.35)' : 'white'}; line-height:1.65; word-break:break-word; ${t.done ? 'text-decoration:line-through line-through-color:rgba(255,255,255,0.2);' : ''}">${displayText}</div>
                                        </div>
                                        <div style="padding:16px 18px; display:flex; align-items:center; flex-shrink:0; background:rgba(255,255,255,0.01);">
                                            <button onclick="toggleTask('${t.id}'); renderDayDetailModal('${dateStr}');" style="width:44px; height:44px; border-radius:50%; background:${t.done ? 'var(--green)' : 'rgba(255,255,255,0.08)'}; border:2px solid ${t.done ? 'var(--green)' : 'rgba(255,255,255,0.2)'}; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all 0.2s; flex-shrink:0;">
                                                <i class="ph-bold ph-check" style="font-size:20px; color:${t.done ? 'black' : 'rgba(255,255,255,0.6)'};"></i>
                                            </button>
                                        </div>
                                    </div>
                                `;
            }).join('')}
                       </div>

                        ${tasksForDay.length > 0 ? `
                        <div style="margin-top:24px; padding-top:20px; border-top:1px solid rgba(255,255,255,0.05); text-align:center;">
                            <button onclick="closeModal()" class="btn-primary" style="width:100%; height:50px; border-radius:16px; font-weight:800; letter-spacing:0.5px;">OK, CHIUDI</button>
                       </div>
                        ` : ''}
                   </div>
               </div>
            `;
        }
        function togglePlanInModal(dateStr, taskId) {
            // Utilizziamo la logica esistente ma aggiorniamo il modale
            if (!state.plannedTasks[dateStr]) state.plannedTasks[dateStr] = [];
            const index = state.plannedTasks[dateStr].indexOf(taskId);

            if (index > -1) {
                state.plannedTasks[dateStr].splice(index, 1);
            } else {
                state.plannedTasks[dateStr].push(taskId);
            }

            // Persistenza locale e remota automatica
            saveTasks();
            debouncedSavePlannerRemote(500); // ✨ Ripristinato auto-sync 🚀

            // Aggiorna UI Calendario
            const calendarEl = document.getElementById('calendar');
            if (calendarEl && calendarEl._fullCalendar) {
                syncCalendarEvents(calendarEl._fullCalendar);
            }

            // Riaffresca il contenuto del modale per mostrare il check
            renderDayDetailModal(dateStr);

            // Feedback Home
            notifyPlannerChanged();
        }
        function notifyPlannerChanged() {
            // badge sul bottone Organizza Oggi e Dashboard
            if (typeof updatePlannerCounter === 'function') updatePlannerCounter();
            if (typeof updateHomeView === 'function') updateHomeView();

            // lista "Agenda della settimana" in Planner
            if (typeof updateWeeklyAgendaView === 'function') updateWeeklyAgendaView();

            // ✅ Aggiorna il calendario custom
            if (typeof renderCustomCalendar === 'function') renderCustomCalendar();

            // colori/stato eventi calendario
            const calendarEl = document.getElementById('calendar');
            if (calendarEl && calendarEl._fullCalendar) {
                syncCalendarEvents(calendarEl._fullCalendar);
                calendarEl._fullCalendar.updateSize();
            }
        }
        function getSubjectColor(subject) {
            let s = (subject || '').trim();
            s = s.replace(/[*_\[\]]/g, '').trim();
            if (!s) return '#0A84FF';

            const lower = s.toLowerCase();
            if (lower.includes('ita')) return '#FF2D55';
            if (lower.includes('mat')) return '#0A84FF';
            if (lower.includes('ing')) return '#BF5AF2';
            if (lower.includes('storia') || lower.includes('geo')) return '#FF9F0A';
            if (lower.includes('scienza') || lower.includes('biol')) return '#30D158';
            if (lower.includes('fisica')) return '#64D2FF';
            if (lower.includes('arte')) return '#FF375F';
            if (lower.includes('ed')) return '#FFD60A';
            if (lower.includes('rel')) return '#64D2FF';

            // 🚀 SENIOR FIX: Hash-based color for UNIQUE identification
            let hash = 0;
            for (let i = 0; i < s.length; i++) {
                hash = s.charCodeAt(i) + ((hash << 5) - hash);
            }
            const h = Math.abs(hash % 360);
            return `hsl(${h}, 85%, 65%)`; // Vibrant, distinct Colors
        }
        function renderAvatar(displayName, size = 44) {
            const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

            // Generate stable pastel color from name
            const hash = Array.from(displayName).reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0);
            const hue = Math.abs(hash % 360);
            const bg = `hsl(${hue}, 60%, 45%)`;

            return `
            <div style="width:${size}px; height:${size}px; background:${bg}; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; font-weight:700; font-size:${size * 0.4}px; border:2px solid rgba(255,255,255,0.15); flex-shrink:0; pointer-events:none;">
                ${initials}
            </div>`;
        }
        function showEditProfileModal() {
            const modalContainer = getModalContainer();
            if (!modalContainer) return;
            modalContainer.innerHTML = `
        <div class="modal-overlay active" onclick="closeModal(event)">
            <div class="modal-content" onclick="event.stopPropagation()" style="width: 100%; max-width: 440px; animation: slideUp 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                    <h2 style="margin: 0; font-size: 22px; font-weight: 800;">Modifica Profilo</h2>
                    <button onclick="closeModal()" style="background: none; border: none; color: var(--text-dim); cursor: pointer; font-size: 20px;"><i class="ph-bold ph-x"></i></button>
                </div>
                
                <div style="display: flex; flex-direction: column; gap: 20px;">
                    <div>
                        <label style="display: block; font-size: 11px; font-weight: 800; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Nome Completo</label>
                        <input type="text" id="edit-user-name" value="${state.user.name || ''}" placeholder="Esempio: Andrea Rossi">
                    </div>
                    
                    <div style="padding: 16px; background: rgba(99, 102, 241, 0.03); border-radius: var(--radius-m); border: 1px solid rgba(99, 102, 241, 0.1);">
                        <p style="font-size: 12px; color: var(--text-secondary); margin: 0; line-height: 1.5;">
                            <i class="ph-fill ph-info" style="color: var(--accent); margin-right: 4px;"></i>
                            I dati scolastici come <b>classe</b> e <b>specializzazione</b> vengono aggiornati automaticamente sincronizzando DidUP.
                        </p>
                    </div>

                    <button onclick="saveProfileChanges()" class="btn-primary" style="width: 100%; margin-top: 12px;">
                        Salva Profilo
                    </button>
                </div>
            </div>
        </div>`;
        }
        function showProfileActions() {
            const modalContainer = getModalContainer();
            if (!modalContainer) return;
            modalContainer.innerHTML = `
        <div class="modal-overlay active" onclick="closeModal(event)">
            <div class="modal-content" onclick="event.stopPropagation()" style="width: 100%; max-width: 380px; padding: 8px; animation: slideUp 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);">
                <!-- User Profile Summary -->
                <div style="padding: 24px; display: flex; align-items: center; gap: 16px;">
                    ${renderAvatar(state.user.name, 56)}
                    <div style="min-width: 0;">
                        <div style="font-size: 18px; font-weight: 800; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${state.user.name}</div>
                        <div style="font-size: 13px; color: var(--text-dim); font-weight: 600;">${normalizeClassUi(state.user.class) || 'Studente'}</div>
                    </div>
                </div>

                <div style="padding: 0 8px 12px 8px; display: flex; flex-direction: column; gap: 4px;">
                    <button class="nav-item" onclick="closeModal(); navigate('profile');" style="width: 100%; border-radius: 12px; height: 52px; display: flex; align-items: center; gap: 12px; padding: 0 16px; background: transparent; border: none; cursor: pointer;">
                        <i class="ph-bold ph-gear" style="font-size: 20px; color: var(--text-dim);"></i>
                        <span style="font-size: 14px; font-weight: 700; color: var(--text-primary);">Configurazione</span>
                    </button>

                    <div style="height: 1px; background: rgba(255,255,255,0.05); margin: 8px 4px;"></div>

                    <button onclick="logout()" style="width: 100%; border-radius: 12px; height: 52px; display: flex; align-items: center; gap: 12px; padding: 0 16px; background: rgba(239, 68, 68, 0.05); border: none; cursor: pointer; color: var(--red);">
                        <i class="ph-bold ph-sign-out" style="font-size: 20px;"></i>
                        <span style="font-size: 14px; font-weight: 800;">Esci dall'Account</span>
                    </button>
                </div>
            </div>
        </div>`;
        }
        window.showProfileActions = showProfileActions;
        function renderSettings() {
            return `
            <div class="view">
                <div style="margin-bottom: 24px;">
                    <h1 style="font-size: 28px; color: var(--text-primary);">Impostazioni</h1>
                    <p style="font-size: 15px; color: var(--text-secondary);">Configura la tua esperienza</p>
               </div>

                <div class="glass-panel" style="padding: 0; overflow: hidden;">
                    <!-- Profile Section -->
                    <div style="padding: 20px; display: flex; align-items: center; gap: 16px; border-bottom: 1px solid rgba(255,255,255,0.05);">
                         ${renderAvatar(state.user.name, 56)}
                        <div>
                            <div style="font-size: 17px; font-weight: 600; color: var(--text-primary);">${state.user.name}</div>
                            <div style="font-size: 14px; color: var(--text-secondary);">${state.user.class || 'Studente'}</div>
                       </div>
                   </div>
                    
                    <!-- Options List -->
                    <div style="display: flex; flex-direction: column;">
                        <div onclick="logout()" style="padding: 16px 20px; display: flex; align-items: center; gap: 14px; cursor: pointer; transition: background 0.2s;">
                             <div style="width: 32px; height: 32px; background: var(--red); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white;">
                                <i class="ph-bold ph-sign-out" style="font-size: 18px;"></i>
                           </div>
                            <div style="flex: 1; font-size: 16px; font-weight: 500; color: var(--red);">Esci</div>
                       </div>

                   </div>
               </div>
                
                <div style="margin-top: 30px; text-align: center;">
                    <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 8px;">G-Connect v5.0 (Liquid Glass)</p>
                    <p style="font-size: 11px; color: var(--text-dim);">Made for Students</p>
               </div>
           </div>
            `;
        }
        function renderWeeklyAgenda() {
            const list = [];
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            if (state.plannerMode === 'registro') {
                state.tasks.forEach(t => {
                    // Fix: Include tasks that have a valid due_date, even if slightly in the past but relevant to current view
                    // OR better: use exactly the same logic as the calendar but at an aggregate level
                    if (!t.id.startsWith('ai_') && t.subject !== 'QUEST' && t.due_date && isFutureOrToday(t.due_date)) {
                        list.push({ ...t, displayDate: t.due_date });
                    }
                });
            } else {
                Object.entries(state.plannedTasks).forEach(([dateStr, ids]) => {
                    // Ensure planned tasks for today/future are shown
                    if (isFutureOrToday(dateStr)) {
                        ids.forEach(id => {
                            const t = state.tasks.find(tk => tk.id === id);
                            if (t) list.push({ ...t, displayDate: dateStr });
                        });
                    }
                });
            }

            list.sort((a, b) => parseArgoDate(a.displayDate) - parseArgoDate(b.displayDate));

            if (!list.length) {
                return `
        <div class="card" style="text-align: center; color: var(--text-dim); padding: 50px 20px;">
                <i class="ph ph-sparkle" style="font-size: 40px; opacity: 0.2; margin-bottom: 12px;"></i>
                <div style="font-size: 14px; font-weight: 500;">Tutto in ordine! Nessuna attività prevista.</div>
            </div> `;
            }

            if (state.plannerMode === 'registro') {
                // Group tasks by date
                const grouped = {};
                list.forEach(t => {
                    if (!grouped[t.displayDate]) grouped[t.displayDate] = [];
                    grouped[t.displayDate].push(t);
                });
                const sortedDates = Object.keys(grouped).sort();

                return `
        <div style="display: flex; flex-direction: column; gap: 20px;">
            ${sortedDates.map(dateStr => {
                    const d = parseArgoDate(dateStr);
                    const dayNum = d.toLocaleDateString('it-IT', { day: 'numeric' });
                    const dayName = d.toLocaleDateString('it-IT', { weekday: 'long' });
                    const monthName = d.toLocaleDateString('it-IT', { month: 'long' });
                    const isToday = dateStr === getLocalDateString();
                    const isTomorrow = (() => { const tm = new Date(); tm.setDate(tm.getDate() + 1); return dateStr === getLocalDateString(tm); })();
                    const labelTag = isToday
                        ? '<span style="font-size:10px;font-weight:800;color:#34C759;background:rgba(52,199,89,0.12);padding:2px 8px;border-radius:20px;text-transform:uppercase;letter-spacing:0.5px;">Oggi</span>'
                        : isTomorrow
                            ? '<span style="font-size:10px;font-weight:800;color:#FF9F0A;background:rgba(255,159,10,0.12);padding:2px 8px;border-radius:20px;text-transform:uppercase;letter-spacing:0.5px;">Domani</span>'
                            : '';

                    return `
                <div>
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px; padding:0 2px;">
                        <div style="text-align:center; min-width:40px;">
                            <div style="font-size:24px; font-weight:900; color:${isToday ? 'var(--accent)' : 'var(--text-primary)'}; line-height:1;">${dayNum}</div>
                            <div style="font-size:10px; font-weight:700; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.5px;">${monthName.slice(0, 3)}</div>
                        </div>
                        <div style="flex:1; height:1px; background:rgba(255,255,255,0.06);"></div>
                        <div style="font-size:12px; font-weight:700; color:var(--text-dim); text-transform:capitalize;">${dayName}</div>
                        ${labelTag}
                    </div>
                    <div style="display:flex; flex-direction:column; gap:12px; padding-left:4px;">
                        ${grouped[dateStr].filter(t => !/check-?list|check\s*liste|checklist\s*&\s*review/i.test(t.text)).map(t => {
                        const subjColor = getSubjectColor(t.subject);
                        const cleanSubject = (t.subject || '').replace(/\*/g, '').trim();
                        return `
                        <div style="flex-shrink:0; display:flex; align-items:stretch; background:${t.done ? 'rgba(52,199,89,0.05)' : 'rgba(255,255,255,0.04)'}; border:1px solid ${t.done ? 'rgba(52,199,89,0.25)' : 'rgba(255,255,255,0.1)'}; border-radius:18px; min-height:90px;">
                            <div style="width:5px; background:${subjColor}; flex-shrink:0;"></div>
                            <div style="flex:1; padding:18px 18px 20px 18px; min-width:0;">
                                <div style="font-size:11px; font-weight:800; color:${subjColor}; text-transform:uppercase; letter-spacing:0.8px; margin-bottom:8px; opacity:0.9;">${cleanSubject}</div>
                                <div data-task-text="${t.id}" style="font-size:16px; font-weight:600; color:${t.done ? 'rgba(255,255,255,0.35)' : 'var(--text-primary)'}; line-height:1.6; word-break:break-word; ${t.done ? 'text-decoration:line-through;' : ''}">${(t.text || '').replace(/^\[AI\]\s*/i, '').replace(/\*/g, '').replace(/[\s|]+$/, '').trim()}</div>
                            </div>
                            <div style="padding:14px 16px; display:flex; align-items:center; flex-shrink:0;">
                                <div data-task-toggle="${t.id}" data-subject-color="${subjColor}" onclick="toggleTask('${t.id}')" style="width:28px; height:28px; border-radius:50%; border:2px solid ${t.done ? 'var(--green)' : 'rgba(255,255,255,0.25)'}; background:${t.done ? 'var(--green)' : 'transparent'}; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all 0.2s; flex-shrink:0;">
                                    ${t.done ? '<i class="ph-bold ph-check" style="font-size:13px; color:black;"></i>' : ''}
                                </div>
                            </div>
                        </div>`;
                    }).join('')}
                    </div>
                </div>`;
                }).join('')}
        </div>`;
            } else {
                // Group studio tasks by date
                const grouped = {};
                list.forEach(t => {
                    if (!grouped[t.displayDate]) grouped[t.displayDate] = [];
                    grouped[t.displayDate].push(t);
                });
                const sortedDates = Object.keys(grouped).sort();

                if (!sortedDates.length) return `<div class="card" style="text-align:center;color:var(--text-dim);padding:50px 20px;"><i class="ph ph-graduation-cap" style="font-size:40px;opacity:0.2;margin-bottom:12px;display:block;"></i><div style="font-size:14px;font-weight:500;">Nessuna sessione pianificata.<br>Chiedi all'AI di organizzare la settimana!</div></div>`;

                return `
        <div style="display:flex; flex-direction:column; gap:24px;">
            ${sortedDates.map(dateStr => {
                    const d = parseArgoDate(dateStr);
                    const dayNum = d.toLocaleDateString('it-IT', { day: 'numeric' });
                    const dayName = d.toLocaleDateString('it-IT', { weekday: 'long' });
                    const monthName = d.toLocaleDateString('it-IT', { month: 'long' });
                    const isToday = dateStr === getLocalDateString();
                    const isTomorrow = (() => { const tm = new Date(); tm.setDate(tm.getDate() + 1); return dateStr === getLocalDateString(tm); })();
                    const labelTag = isToday
                        ? '<span style="font-size:10px;font-weight:800;color:#34C759;background:rgba(52,199,89,0.12);padding:2px 8px;border-radius:20px;">Oggi</span>'
                        : isTomorrow
                            ? '<span style="font-size:10px;font-weight:800;color:#FF9F0A;background:rgba(255,159,10,0.12);padding:2px 8px;border-radius:20px;">Domani</span>'
                            : '';

                    return `
            <div>
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px; padding:0 2px;">
                    <div style="text-align:center; min-width:40px;">
                        <div style="font-size:24px; font-weight:900; color:${isToday ? '#a855f7' : 'var(--text-primary)'}; line-height:1;">${dayNum}</div>
                        <div style="font-size:10px; font-weight:700; color:var(--text-dim); text-transform:uppercase;">${monthName.slice(0, 3)}</div>
                    </div>
                    <div style="flex:1; height:1px; background:rgba(255,255,255,0.06);"></div>
                    <div style="font-size:12px; font-weight:700; color:var(--text-dim); text-transform:capitalize;">${dayName}</div>
                    ${labelTag}
                </div>
                <div style="display:flex; flex-direction:column; gap:14px; padding-left:4px;">
                    ${grouped[dateStr].filter(t => !/check-?list|check\s*liste|checklist\s*&\s*review/i.test(t.text || t.description || '')).map(t => {
                        const subjColor = getSubjectColor(t.subject);
                        const cleanSubject = (t.subject || '').replace(/\*/g, '').trim();
                        const timeMatch = (t.text || '').match(/(\d{1,2}:\d{2})/);
                        const timeStr = timeMatch ? timeMatch[1] : '';
                        const displayText = (t.text || t.description || 'Sessione di studio')
                            .replace(/^\[AI\]\s*/i, '')
                            .replace(/^\d{2}:\d{2}\s*[—\-]\s*/, '')
                            .replace(/\*/g, '')
                            .replace(/[\s|]+$/, '')
                            .trim();

                        return `
                    <div style="flex-shrink:0; display:flex; align-items:stretch; background:${t.done ? 'rgba(168,85,247,0.06)' : 'rgba(255,255,255,0.04)'}; border:1px solid ${t.done ? 'rgba(168,85,247,0.25)' : 'rgba(255,255,255,0.1)'}; border-radius:18px; min-height:100px;">
                        <div style="width:5px; background:${subjColor}; flex-shrink:0;"></div>
                        <div style="flex:1; padding:20px 18px 22px 18px; min-width:0;">
                            <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px; flex-wrap:wrap;">
                                <span style="font-size:11px; font-weight:800; color:${subjColor}; text-transform:uppercase; letter-spacing:0.8px; background:rgba(255,255,255,0.03); padding:2px 8px; border-radius:6px;">${cleanSubject}</span>
                                ${timeStr ? `<span style="font-size:11px; font-weight:700; color:rgba(255,255,255,0.4); background:rgba(255,255,255,0.08); padding:2px 8px; border-radius:20px;">${timeStr}</span>` : ''}
                            </div>
                            <div data-task-text="${t.id}" style="font-size:16px; font-weight:600; color:${t.done ? 'rgba(255,255,255,0.3)' : 'var(--text-primary)'}; line-height:1.6; word-break:break-word; ${t.done ? 'text-decoration:line-through;' : ''}">${displayText}</div>
                            ${t.due_date && t.due_date !== dateStr ? `<div style="font-size:11px; color:var(--text-dim); margin-top:4px;">📋 Scade: ${parseArgoDate(t.due_date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}</div>` : ''}
                        </div>
                        <div style="padding:14px 16px; display:flex; align-items:center; flex-shrink:0;">
                            <div data-task-toggle="${t.id}" data-subject-color="${subjColor}" onclick="toggleTask('${t.id}')" style="width:28px; height:28px; border-radius:50%; border:2px solid ${t.done ? 'var(--green)' : 'rgba(255,255,255,0.25)'}; background:${t.done ? 'var(--green)' : 'transparent'}; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all 0.2s; flex-shrink:0;">
                                ${t.done ? '<i class="ph-bold ph-check" style="font-size:13px; color:black;"></i>' : ''}
                            </div>
                        </div>
                    </div>`;
                    }).join('')}
                </div>
            </div>`;
                }).join('')}
        </div>`;
            }
        }
        function showStressModal() {
            const todayStr = getLocalDateString();
            const currentLevel = state.stressLevels[todayStr] || 0;
            const modalContainer = getModalContainer();
            if (!modalContainer) return;

            modalContainer.innerHTML = `
        <div class="modal-overlay active" onclick="closeModal(event)">
            <div class="modal-content glass-panel" onclick="event.stopPropagation()" style="max-width: 420px; padding: 24px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px;">
                    <h2 style="margin:0;">Stress Giornaliero</h2>
                    <i class="ph ph-x" onclick="closeModal()" style="cursor:pointer; font-size: 22px;"></i>
                </div>
                <div class="stress-level-grid">
                    ${[1, 2, 3, 4, 5].map(lv => `
                        <div class="stress-pill ${currentLevel === lv ? 'active' : ''}" 
                            data-stress="${lv}" 
                            onclick="setStressLevel(${lv}, true)">
                            ${lv}
                        </div>`).join('')}
                </div>
                <div style="display:flex; justify-content:center; margin-top: 16px;">
                    <button onclick="closeModal()" class="btn-primary" style="max-width: 220px;">Conferma</button>
                </div>
            </div>
        </div> `;
        }
        function showPlanWeekModal() {
            const modalContainer = getModalContainer();
            if (!modalContainer) return;

            modalContainer.innerHTML = `
        <div class="modal-overlay active" onclick="closeModal(event)">
            <div id="plan-week-modal-content" class="modal-content glass-panel" onclick="event.stopPropagation()" style="width: 100%; max-width: 450px; padding: 24px;">
            </div>
        </div> `;
            refreshPlanWeekModalContent();
        }
        function togglePlanDay(taskId, dateStr) {
            if (event) event.stopPropagation();
            // ✅ FIX: Usa confronto stringa timezone-safe
            const todayStr = getLocalDateString();
            if (dateStr < todayStr) return; // Solo i giorni passati sono bloccati, oggi è OK

            if (!state.plannedTasks[dateStr]) state.plannedTasks[dateStr] = [];
            const index = state.plannedTasks[dateStr].indexOf(taskId);
            if (index > -1) {
                state.plannedTasks[dateStr].splice(index, 1);
            } else {
                state.plannedTasks[dateStr].push(taskId);
            }

            saveTasks();
            debouncedSavePlannerRemote(500); // ✨ Ripristinato auto-sync 🚀
            updateWeekDayButton(taskId, dateStr);
            notifyPlannerChanged(); // ✅ aggiorna Planner e Home SUBITO
        }
        function showVotiView() {
            modalContainer.innerHTML = `
        <div class="modal-overlay active" onclick="closeModal(event)">
            <div class="modal-content" onclick="event.stopPropagation()" style="max-height:85vh; overflow-y:auto; padding: 0;">
                <div style="position: sticky; top: 0; background:#1c1c1e; padding: 20px; border-bottom:1px solid rgba(255,255,255,0.1); display:flex; justify-content:space-between; align-items:center; z-index: 10;">
                    <h2 style="margin:0;">Voti DidUP</h2>
                    <button onclick="closeModal()" style="background:none; border:none; color:var(--blue); font-weight:700; font-size:16px; cursor:pointer;">Chiudi</button>
                </div>
                <div style="padding: 20px;">
                    ${renderVoti()}
                </div>
            </div>
           </div> `;
        }
        function renderVoti() {
            const votiData = (state.voti && state.voti.length > 0) ? state.voti :
                ((state.grades && state.grades.length > 0) ? state.grades : []);

            if (votiData.length === 0) {
                return `
        <div style="text-align:center; padding: 48px 24px; color: var(--text-muted);">
                    <i class="ph ph-graduation-cap" style="font-size: 56px; opacity: 0.2; margin-bottom: 16px; display: block;"></i>
                    <p style="margin-bottom:20px; font-size:16px;">Nessun voto registrato.</p>
                    <button onclick="performArgoSync()" class="btn-primary" style="padding: 10px 20px; font-size: 14px; width: auto;">Sincronizza DidUP</button>
               </div> `;
            }

            const media = calcolaMedia(votiData);
            return `
        <div class="view">
                <div class="card" style="background: linear-gradient(135deg, rgba(37, 99, 235, 0.4), rgba(79, 70, 229, 0.4)); border: 1px solid var(--blue); padding: 24px; text-align: center; margin-bottom: 20px;">
                    <div style="font-size: 12px; color: rgba(255,255,255,0.8); font-weight: 700; text-transform: uppercase; margin-bottom: 8px;">Media Generale</div>
                    <div style="font-size: 56px; font-weight: 800; color: white;">${media || '--'}</div>
                    <div style="font-size: 12px; opacity:0.7;">Su ${votiData.length} voti</div>
               </div>
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    ${votiData.map(v => {
                const val = (v.valore || v.value || '').toString();
                const mat = v.materia || v.subject || 'Materia';
                const color = parseFloat(val.replace(',', '.')) >= 6 ? 'var(--green)' : 'var(--red)';
                return `
                        <div class="card" style="padding:16px; display:flex; align-items:center; gap:16px; margin-bottom:0;">
                            <div style="width:54px; height:54px; border-radius:12px; background:${color}15; border:1px solid ${color}30; display:flex; align-items:center; justify-content:center; font-size:24px; font-weight:800; color:${color};">${val}</div>
                            <div style="flex:1; text-align:left;">
                                <div style="font-weight:700; font-size:16px; color:white;">${mat}</div>
                                <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase;">${v.data || v.date || ''} • ${v.tipo || v.type || ''}</div>
                           </div>
                       </div>`;
            }).join('')}
               </div>
           </div> `;
        }
        function showBachecaModal() {
            // ⭐ Prova prima promemoria, poi announcements
            const dataBacheca = state.promemoria && state.promemoria.length > 0 ? state.promemoria :
                (state.announcements && state.announcements.length > 0 ? state.announcements : []);

            console.log("📢 Rendering bacheca - state.promemoria:", state.promemoria?.length || 0, "state.announcements:", state.announcements?.length || 0);

            modalContainer.innerHTML = `
        <div class="modal-overlay active" onclick="closeModal(event)">
            <div class="modal-content" style="max-height:85vh; overflow-y:auto; padding: 0;">
                <div style="position: sticky; top: 0; background:#1c1c1e; padding: 20px; border-bottom:1px solid rgba(255,255,255,0.1); display:flex; justify-content:space-between; align-items:center; z-index: 10;">
                    <h2 style="margin:0;">Bacheca & Avvisi</h2>
                    <button onclick="closeModal()" style="background:none; border:none; color:var(--orange); font-weight:700; font-size:16px; cursor:pointer;">Chiudi</button>
                </div>
                <div style="padding: 20px; display:flex; flex-direction:column; gap:12px;">
                    ${dataBacheca.length === 0 ?
                    `<div style="text-align:center; padding: 40px; color: var(--text-secondary);">
                        <i class="ph ph-megaphone" style="font-size: 48px; opacity: 0.3; margin-bottom: 12px; display: block;"></i>
                        Nessun avviso in bacheca<br>
                        <span style="font-size: 12px; margin-top: 8px; display: block;">Gli avvisi verranno caricati dopo la sincronizzazione con DidUP</span>
                        <button onclick="performSync(); closeModal();" style="background:var(--orange); color:black; padding:10px 20px; border-radius:10px; border:none; margin-top:16px; cursor:pointer; font-weight:600;">
                            <i class="ph ph-arrow-clockwise"></i> Sincronizza Ora
                       </button>
                   </div>` :
                    dataBacheca.map(item => {
                        const data = item.data || item.date || item.datGiorno || 'Data non disponibile';
                        const autore = item.autore || item.docente || 'Docente';
                        const oggetto = item.oggetto || item.titolo || item.title || 'Avviso';
                        const testo = item.testo || item.text || item.descrizione || item.description || '';
                        const url = item.url || item.allegato || null;

                        return `
                                <div class="glass-list-item" style="border-left: 4px solid var(--orange); background: rgba(255, 159, 10, 0.08);">
                                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                        <div style="padding:4px 8px; background: rgba(255, 159, 10, 0.2); border-radius:6px; display:flex; gap:6px; align-items:center;">
                                            <i class="ph-fill ph-bell" style="color: var(--orange); font-size: 14px;"></i>
                                            <span style="font-size:11px; color: #fb923c; font-weight:700; text-transform:uppercase;">AVVISO</span>
                                       </div>
                                        <div style="font-size:12px; color:var(--text-secondary); font-weight:600;">
                                            ${data} • ${autore}
                                       </div>
                                   </div>
                                    <div style="font-weight:700; font-size:17px; margin-bottom:8px; color: white; line-height:1.3;">${oggetto}</div>
                                    ${testo ? `<div style="font-size:14px; opacity:0.9; line-height:1.6; color: #cbd5e1; margin-bottom: ${url ? '8px' : '0'}; white-space: pre-wrap;">${testo}</div>` : ''}
                                    ${url ? `<a href="${url}" target="_blank" style="margin-top:12px; background:rgba(37, 99, 235, 0.2); padding:8px 12px; border-radius:8px; border:1px solid rgba(37, 99, 235, 0.3); color:#60a5fa; font-size:13px; display:inline-flex; align-items:center; gap:6px; font-weight:600; text-decoration:none;">
                                        <i class="ph ph-paperclip"></i> Apri Allegato <i class="ph-bold ph-arrow-up-right" style="font-size:10px;"></i>
                                   </a>` : ''}
                               </div>
                            `;
                    }).join('')
                }
                </div>
            </div>
           </div> `;
        }
        function promptSetGoal(type) {
            const currentGoal = state.goals?.[type] || 8.0;
            const res = prompt("A quale media vuoi puntare? (es. 8.5)", currentGoal);
            if (res !== null) {
                const val = parseFloat(res.replace(',', '.'));
                if (!isNaN(val) && val > 0 && val <= 10) {
                    if (!state.goals) state.goals = {};
                    state.goals[type] = val;
                    saveTasks(); // Persist standard
                    render();
                } else {
                    alert("Inserisci un valore valido tra 1 e 10");
                }
            }
        }
        function renderFocusTimer() {
            const mins = Math.floor(pomodoroState.timeLeft / 60);
            const secs = pomodoroState.timeLeft % 60;
            const display = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')} `;
            const isFocus = pomodoroState.mode === 'focus';
            const modeLabel = isFocus ? 'Focus' : 'Pausa';
            const modeColor = isFocus ? '#7c3aed' : 'var(--green)';

            return `
        <div class="card glass-panel" style="padding: 24px; border-radius: 28px; margin-bottom: 24px; text-align:center;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                    <div style="font-size: 15px; font-weight: 800; color:white;">🍅 Timer ${modeLabel}</div>
                    <div style="font-size:11px; font-weight:700; padding:4px 10px; border-radius:8px; background:${modeColor}; color:white;">${modeLabel}</div>
                </div>
                <div style="font-size:48px; font-weight:800; color:white; font-family:monospace; margin:16px 0; letter-spacing:4px;">${display}</div>
                <div style="display:flex; gap:12px; justify-content:center;">
                    <button onclick="togglePomodoro()" style="padding:12px 28px; border-radius:14px; border:none; background:${pomodoroState.running ? 'var(--red)' : modeColor}; color:white; font-weight:800; font-size:15px; cursor:pointer; min-width:120px;">
                        ${pomodoroState.running ? '⏸ Pausa' : '▶ Avvia'}
                    </button>
                    <button onclick="resetPomodoro()" style="padding:12px 20px; border-radius:14px; border:1px solid rgba(255,255,255,0.15); background:rgba(255,255,255,0.06); color:white; font-weight:700; font-size:14px; cursor:pointer;">
                        ↺ Reset
                    </button>
                </div>
            </div> `;
        }
        function togglePomodoro() {
            if (pomodoroState.running) {
                clearInterval(pomodoroState.interval);
                pomodoroState.running = false;
            } else {
                pomodoroState.running = true;
                pomodoroState.interval = setInterval(() => {
                    pomodoroState.timeLeft--;
                    if (pomodoroState.timeLeft <= 0) {
                        clearInterval(pomodoroState.interval);
                        pomodoroState.running = false;
                        if (pomodoroState.mode === 'focus') {
                            pomodoroState.mode = 'break';
                            pomodoroState.timeLeft = 5 * 60;
                            showToast('🎉 Sessione completata! Pausa di 5 min.', 'var(--green)');
                        } else {
                            pomodoroState.mode = 'focus';
                            pomodoroState.timeLeft = 25 * 60;
                            showToast('💪 Pausa finita! Torna a studiare.', '#7c3aed');
                        }
                    }
                    const container = document.getElementById('pomodoroContainer');
                    if (container) container.innerHTML = renderFocusTimer();
                }, 1000);
            }
            const container = document.getElementById('pomodoroContainer');
            if (container) container.innerHTML = renderFocusTimer();
        }
        function toggleVoiceInput() {
            const btn = document.getElementById('aiMicBtn');
            const input = document.getElementById('aiChatInput');

            if (!recognition) {
                const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                if (!SpeechRecognition) {
                    alert("Il tuo browser non supporta il riconoscimento vocale.");
                    return;
                }
                recognition = new SpeechRecognition();
                recognition.lang = 'it-IT';
                recognition.interimResults = false;
                recognition.maxAlternatives = 1;

                recognition.onstart = () => {
                    if (btn) btn.classList.add('mic-active');
                    if (btn) btn.innerHTML = '<i class="ph-fill ph-microphone"></i>';
                };

                recognition.onresult = (event) => {
                    const transcript = event.results[0][0].transcript;
                    if (input) {
                        input.value = (input.value ? input.value + ' ' : '') + transcript;
                        state.aiChatInputValue = input.value;
                        // Trigger resize
                        input.style.height = 'auto';
                        input.style.height = Math.min(input.scrollHeight, 100) + 'px';
                    }
                };

                recognition.onerror = (event) => {
                    console.error('Speech recognition error:', event.error);
                    stopVoiceInput();
                };

                recognition.onend = () => {
                    stopVoiceInput();
                };

                recognition.start();
            } else {
                stopVoiceInput();
            }
        }
        function promptAddBacklog() { showAddBacklogModal(); }
        function showAddBacklogModal() {
            const container = getModalContainer();
            if (!container) return;
            const subjects = getAllSubjects();

            container.innerHTML = `
            <div class="modal-overlay active" onclick="closeModal(event)">
                <div class="modal-content glass-panel" onclick="event.stopPropagation()" style="max-width:420px; padding:24px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                        <h2 style="margin:0; font-size:18px; font-weight:800;">📚 Argomento Arretrato</h2>
                        <button onclick="closeModal()" style="background:none; border:none; color:#60a5fa; font-weight:700; cursor:pointer;">Chiudi</button>
                   </div>

                    <div style="display:flex; flex-direction:column; gap:16px;">
                        <div>
                            <label style="display:block; font-size:11px; font-weight:700; color:rgba(255,255,255,0.5); text-transform:uppercase; margin-bottom:6px;">Materia</label>
                            <select id="backlogSubject" style="width:100%; height:46px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.15); border-radius:12px; color:white; padding:0 12px; font-size:14px; outline:none; appearance:none; -webkit-appearance:none;">
                                ${subjects.map(s => `<option value="${s}" style="background:#1a1a2e;">${s}</option>`).join('')}
                           </select>
                       </div>

                        <div>
                            <label style="display:block; font-size:11px; font-weight:700; color:rgba(255,255,255,0.5); text-transform:uppercase; margin-bottom:6px;">Cosa devi recuperare?</label>
                            <input type="text" id="backlogTopic" placeholder="Es: Equazioni di 2° grado, Canto V Inferno..." style="width:100%; height:46px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.15); border-radius:12px; color:white; padding:0 12px; font-size:14px; outline:none;">
                       </div>

                        <button onclick="submitBacklogForm()" style="width:100%; height:50px; background:var(--blue); color:white; border:none; border-radius:14px; font-size:16px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
                            <i class="ph-bold ph-check-circle"></i> Aggiungi Arretrato
                       </button>
                   </div>
               </div>
           </div>`;
        }
        function renderVerifiche() {
            const exams = state.exams || [];
            // Sort by date
            exams.sort((a, b) => new Date(a.date) - new Date(b.date));

            if (exams.length === 0) {
                return `
                    <div class="view" style="padding-top: 60px;">
                        <h1 style="font-size: 28px; color: var(--text-primary); margin-bottom: 24px;">Verifiche</h1>
                        <div class="glass-panel" style="padding: 40px; text-align: center; display: flex; flex-direction: column; align-items: center;">
                            <div style="width: 64px; height: 64px; background: rgba(255,255,255,0.05); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
                                <i class="ph-bold ph-exam" style="font-size: 32px; color: var(--text-secondary);"></i>
                           </div>
                            <h3 style="font-size: 18px; color: var(--text-primary); margin-bottom: 8px;">Nessuna verifica</h3>
                            <p style="font-size: 15px; color: var(--text-secondary); margin-bottom: 24px;">Non hai verifiche in programma.</p>
                            <button onclick="promptAddExam()" class="btn-primary" style="padding: 12px 24px;">
                                <i class="ph-bold ph-plus"></i> Aggiungi Verifica
                           </button>
                       </div>
                   </div>`;
            }

            return `
                <div class="view" style="padding-top: 60px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                        <div>
                            <h1 style="font-size: 28px; color: var(--text-primary);">Verifiche</h1>
                            <p style="font-size: 15px; color: var(--text-secondary);">Prossimi esami e interrogazioni</p>
                       </div>
                        <button onclick="promptAddExam()" style="width: 40px; height: 40px; border-radius: 12px; background: var(--blue); color: white; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                            <i class="ph-bold ph-plus" style="font-size: 20px;"></i>
                       </button>
                   </div>

                    <div style="display: flex; flex-direction: column; gap: 16px;">
                        ${exams.map((e, index) => {
                const dateObj = new Date(e.date);
                const dayName = dateObj.toLocaleDateString('it-IT', { weekday: 'short' });
                const dayNum = dateObj.getDate();
                const monthName = dateObj.toLocaleDateString('it-IT', { month: 'short' });
                const color = getSubjectColor(e.subject);

                return `
                            <div class="glass-panel" style="padding: 20px; display: flex; align-items: flex-start; gap: 16px;">
                                <div style="min-width: 50px; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(255,255,255,0.05); border-radius: 12px; padding: 10px 0; border: 1px solid rgba(255,255,255,0.05);">
                                    <span style="font-size: 11px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase;">${monthName}</span>
                                    <span style="font-size: 20px; font-weight: 700; color: var(--text-primary); line-height: 1.1;">${dayNum}</span>
                               </div>
                                
                                <div style="flex: 1; min-width: 0;">
                                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                        <div>
                                            <span style="display: inline-block; padding: 4px 8px; border-radius: 6px; background: ${color}20; color: ${color}; font-size: 11px; font-weight: 700; text-transform: uppercase; margin-bottom: 6px; border: 1px solid ${color}40;">
                                                ${e.type}
                                           </span>
                                            <h3 style="font-size: 17px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">${e.subject}</h3>
                                       </div>
                                        <button onclick="removeExam(${index})" style="background: none; border: none; color: var(--text-secondary); padding: 4px; cursor: pointer; opacity: 0.6;">
                                            <i class="ph-bold ph-trash"></i>
                                       </button>
                                   </div>
                                    <p style="font-size: 14px; color: var(--text-secondary); line-height: 1.4;">${e.topic || 'Nessun argomento specificato'}</p>
                               </div>
                           </div>
                            `;
            }).join('')}
                   </div>
               </div>`;
        }
        function renderRecoveries() {
            const backlog = state.backlog || [];

            if (backlog.length === 0) {
                return `
                    <div class="view" style="padding-top: 60px;">
                        <h1 style="font-size: 28px; color: var(--text-primary); margin-bottom: 24px;">Arretrati</h1>
                        <div class="glass-panel" style="padding: 40px; text-align: center; display: flex; flex-direction: column; align-items: center;">
                            <div style="width: 64px; height: 64px; background: rgba(255,255,255,0.05); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
                                <i class="ph-bold ph-check-fat" style="font-size: 32px; color: var(--green);"></i>
                           </div>
                            <h3 style="font-size: 18px; color: var(--text-primary); margin-bottom: 8px;">Tutto in ordine!</h3>
                            <p style="font-size: 15px; color: var(--text-secondary); margin-bottom: 24px;">Non hai argomenti da recuperare.</p>
                            <button onclick="promptAddBacklog()" class="btn-primary" style="padding: 12px 24px;">
                                <i class="ph-bold ph-plus"></i> Aggiungi Arretrato
                           </button>
                       </div>
                   </div>`;
            }

            return `
                <div class="view" style="padding-top: 60px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                        <div>
                            <h1 style="font-size: 28px; color: var(--text-primary);">Arretrati</h1>
                            <p style="font-size: 15px; color: var(--text-secondary);">Argomenti da recuperare</p>
                       </div>
                        <button onclick="promptAddBacklog()" style="width: 40px; height: 40px; border-radius: 12px; background: var(--blue); color: white; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                             <i class="ph-bold ph-plus" style="font-size: 20px;"></i>
                       </button>
                   </div>

                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        ${backlog.map((b, index) => `
                            <div class="glass-panel" style="padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; gap: 16px;">
                                <div style="flex: 1; min-width: 0;">
                                    <div style="font-size: 11px; font-weight: 700; color: ${getSubjectColor(b.subject)}; text-transform: uppercase; margin-bottom: 4px;">${b.subject}</div>
                                    <div style="font-size: 15px; font-weight: 500; color: var(--text-primary); line-height: 1.3;">${b.topic}</div>
                               </div>
                                <button onclick="removeBacklog(${index})" style="width: 32px; height: 32px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: var(--text-secondary); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s;">
                                    <i class="ph-bold ph-check"></i>
                               </button>
                           </div>
                        `).join('')}
                   </div>
               </div>`;
        }
        function openArgoLogin() {
            const modalContainer = getModalContainer();
            if (!modalContainer) return;
            modalContainer.innerHTML = `
        <div class="modal-overlay active" onclick="closeModal(event)">
            <div class="modal-content" onclick="event.stopPropagation()" style="max-width:380px;">
                <div style="text-align:center; margin-bottom:20px;">
                    <div style="width:60px; height:60px; background:#106690; border-radius:16px; display:flex; align-items:center; justify-content:center; margin:0 auto 16px auto;">
                       <i class="ph-fill ph-book-bookmark" style="font-size:30px; color:white;"></i>
                    </div>
                    <h2 style="margin:0; color:white;">Collega DidUP</h2>
                </div>

                <div id="server-status" style="margin-bottom: 20px; font-size: 12px; color: var(--orange); display: flex; align-items: center; justify-content: center; gap: 6px;">
                    <span style="width: 8px; height: 8px; background: var(--orange); border-radius: 50%;"></span>
                    In attesa del server...
                </div>

                <input id="argo-school" placeholder="Codice Scuola" value="${localStorage.getItem('argo_school') || ''}">
                <input id="argo-user" placeholder="Nome Utente">
                <input type="password" id="argo-pass" placeholder="Password">
                <button id="login-btn" onclick="performArgoSync()" class="btn-primary" style="width:100%; margin-top:10px;">Accedi e Sincronizza</button>
                <button onclick="closeModal()" style="width:100%; background:none; border:none; color:var(--text-muted); margin-top:12px; cursor:pointer;">Annulla</button>
            </div>
        </div>`;
            checkServerHealth();
        }
        function showProfileSelectionModal(profiles, credentials) {
            console.log("👥 Mostro modale selezione profili:", profiles);
            const container = getModalContainer();
            if (!container) return;

            container.innerHTML = `
        <div class="modal-overlay active" style="z-index: 9999; animation: fadeIn 0.3s ease-out;">
            <div class="modal-content glass-panel" onclick="event.stopPropagation()" style="max-width: 440px; padding: 0; box-shadow: 0 10px 40px rgba(0,0,0,0.5);">
                <div style="padding: 24px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <div style="width: 64px; height: 64px; background: rgba(10, 132, 255, 0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
                        <i class="ph-fill ph-users" style="font-size: 32px; color: var(--blue);"></i>
                    </div>
                    <h2 style="font-size: 20px; margin-bottom: 8px;">Seleziona Profilo</h2>
                    <p style="font-size: 14px; color: var(--text-secondary); margin: 0;">Scegli quale studente visualizzare</p>
                </div>
                
                <div class="profiles-list" style="padding: 24px; display: flex; flex-direction: column; gap: 12px; max-height: 50vh; overflow-y: auto;">
                    ${profiles.map(p => `
                        <button class="btn-profile" 
                                data-index="${p.index}"
                                style="background: var(--surface-highlight); border: 1px solid rgba(255,255,255,0.05); padding: 16px; border-radius: 16px; display: flex; align-items: center; gap: 16px; cursor: pointer; transition: all 0.2s; width: 100%; text-align: left; -webkit-tap-highlight-color: transparent;">
                            <div class="profile-avatar" style="width: 44px; height: 44px; background: linear-gradient(135deg, var(--blue), var(--indigo)); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 18px; color: white; flex-shrink: 0;">
                                ${(p.name || 'S')[0].toUpperCase()}
                            </div>
                            <div style="flex-grow: 1;">
                                <div class="profile-name" style="font-weight: 700; font-size: 16px; color: white; margin-bottom: 4px;">${p.name || ('Studente ' + (p.index + 1))}</div>
                                <div class="profile-class" style="font-size: 13px; color: var(--text-secondary);">${p.class || p.school || 'Caricamento...'}</div>
                            </div>
                            <i class="ph-bold ph-caret-right" style="color: var(--text-secondary);"></i>
                        </button>
                    `).join('')}
                </div>
            </div>
        </div>`;

            // Event Delegation
            const list = container.querySelector('.profiles-list');
            list.addEventListener('click', async (ev) => {
                const btn = ev.target.closest('.btn-profile');
                if (!btn) return;

                // Disabilita UI
                const allBtns = list.querySelectorAll('.btn-profile');
                allBtns.forEach(b => {
                    b.disabled = true;
                    b.style.opacity = '0.5';
                    b.style.pointerEvents = 'none';
                });

                btn.style.opacity = '1';
                btn.innerHTML += '<i class="ph-bold ph-spinner ph-spin" style="margin-left:auto"></i>';

                await selectProfile(parseInt(btn.dataset.index, 10), credentials);
            }, { once: true });

            // Risolvi i nomi veri in background
            resolveProfileNamesAsync(profiles, credentials, container);
        }
        function setLoginBtnText(txt) {
            const btn = document.getElementById('login-btn') ||
                document.querySelector('.login-btn') ||
                document.querySelector('#loginBtn') ||
                document.querySelector('button[onclick*="performArgoSync"]') ||
                document.querySelector('button[type="submit"]');

            if (!btn) return;

            btn.innerText = txt;
            btn.disabled = /\.\.\.|Connessione|Sincronizzazione/.test(txt);
        }
        function toggleTask(id) {
            if (event) event.stopPropagation();

            let t = state.tasks.find(x => x.id === id);
            if (!t) t = state.reminders.find(x => x.id === id);

            if (t) {
                t.done = !t.done;
                saveTasks();
                if (state.reminders && state.reminders.find(x => x.id === id)) {
                    localStorage.setItem(lsKey('reminders'), JSON.stringify(state.reminders));
                }


                // === SURGICAL DOM UPDATE ===
                // Update all checkboxes for this task ID without rebuilding
                document.querySelectorAll(`[data-task-toggle="${id}"]`).forEach(cb => {
                    cb.style.borderColor = t.done ? 'var(--green)' : cb.dataset.subjectColor || 'rgba(255,255,255,0.2)';
                    cb.style.background = t.done ? 'var(--green)' : 'transparent';
                    cb.innerHTML = t.done ? '<i class="ph-bold ph-check" style="font-size:12px; color:black;"></i>' : '';
                    cb.style.transform = 'scale(0.85)';
                    setTimeout(() => { cb.style.transform = 'scale(1)'; }, 120);
                });
                // Update text strikethrough
                document.querySelectorAll(`[data-task-text="${id}"]`).forEach(el => {
                    el.style.textDecoration = t.done ? 'line-through' : 'none';
                    el.style.opacity = t.done ? '0.5' : '1';
                });

                // Update Home's Focus di Oggi toggle checkboxes (inline onclick) 
                updatePlanTaskUI(id, t.done);

                // Sync calendar events (lightweight, no full re-render)
                const calendarEl = document.getElementById('calendar');
                if (calendarEl && calendarEl._fullCalendar) {
                    syncCalendarEvents(calendarEl._fullCalendar);
                }
                if (typeof renderCustomCalendar === 'function') renderCustomCalendar();

                // Update completed badge
                const badge = document.querySelector('[data-completed-badge]');
                if (badge) {
                    const todayTasks = state.tasks.filter(t => {
                        if (!t.dateObj) return false;
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const d = new Date(t.dateObj);
                        d.setHours(0, 0, 0, 0);
                        return d.getTime() === today.getTime();
                    });
                    const completedToday = todayTasks.filter(t => t.done).length;
                    badge.textContent = `${completedToday}/${todayTasks.length}`;
                }
            }
        }
        function showQuickAddTaskModal() {
            const subjects = [...new Set(state.tasks.map(t => t.subject).filter(Boolean))];
            const subjectOptions = subjects.length > 0
                ? subjects.map(s => `<option value="${s}">${s}</option>`).join('')
                : '<option value="Generale">Generale</option>';

            showModal(`
                <div style="padding: 24px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <h2 style="margin: 0; font-size: 20px; font-weight: 800;">Aggiungi Compito</h2>
                        <i class="ph ph-x" onclick="closeModal()" style="cursor:pointer; font-size: 22px; opacity: 0.6;"></i>
                    </div>
                    <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 18px;">Verrà aggiunto al calendario del Piano di Studio.</p>
                    <div style="display: flex; flex-direction: column; gap: 14px;">
                        <div>
                            <label style="font-size: 11px; font-weight: 700; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; display: block;">Descrizione</label>
                            <input id="quickTaskText" type="text" placeholder="Es. Studiare cap. 5 Storia" 
                                style="width: 100%; padding: 12px 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: white; font-size: 14px; outline: none; box-sizing: border-box;" />
                        </div>
                        <div>
                            <label style="font-size: 11px; font-weight: 700; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; display: block;">Materia</label>
                            <select id="quickTaskSubject" style="width: 100%; padding: 12px 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); background: rgba(30,30,30,0.9); color: white; font-size: 14px; outline: none; box-sizing: border-box;">
                                ${subjectOptions}
                            </select>
                        </div>
                        <div>
                            <label style="font-size: 11px; font-weight: 700; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; display: block;">Data</label>
                            <input id="quickTaskDate" type="date" value="${getLocalDateString()}"
                                style="width: 100%; padding: 12px 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); background: rgba(30,30,30,0.9); color: white; font-size: 14px; outline: none; box-sizing: border-box;" />
                        </div>
                    </div>
                    <button onclick="submitQuickTask()" style="width: 100%; margin-top: 20px; padding: 14px; border-radius: 14px; border: none; background: var(--accent); color: white; font-size: 15px; font-weight: 700; cursor: pointer;">
                        <i class="ph-bold ph-plus" style="margin-right: 6px;"></i> Aggiungi al Planner
                    </button>
                </div>
        `);
        }
        function showAddRegistroTaskModal() {
            const subjects = [...new Set(state.tasks.map(t => t.subject).filter(Boolean))];
            const subjectOptions = subjects.length > 0
                ? subjects.map(s => `<option value="${s}">${s}</option>`).join('')
                : '<option value="Generale">Generale</option>';

            showModal(`
                <div style="padding: 24px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <h2 style="margin: 0; font-size: 20px; font-weight: 800;">Nuova Scadenza</h2>
                        <i class="ph ph-x" onclick="closeModal()" style="cursor:pointer; font-size: 22px; opacity: 0.6;"></i>
                    </div>
                    <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 18px;">Aggiungi una verifica, interrogazione o compito in classe.</p>
                    <div style="display: flex; flex-direction: column; gap: 14px;">
                        <div>
                            <label style="font-size: 11px; font-weight: 700; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; display: block;">Tipo</label>
                            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
                                <button id="tipo-verifica" onclick="selectRegistroTipo('Verifica')" style="padding: 10px; border-radius: 10px; border: 1px solid var(--accent); background: rgba(99,102,241,0.15); color: var(--accent); font-size: 12px; font-weight: 700; cursor: pointer;">Verifica</button>
                                <button id="tipo-orale" onclick="selectRegistroTipo('Interrogazione')" style="padding: 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); background: transparent; color: var(--text-dim); font-size: 12px; font-weight: 700; cursor: pointer;">Orale</button>
                                <button id="tipo-compito" onclick="selectRegistroTipo('Compito in classe')" style="padding: 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); background: transparent; color: var(--text-dim); font-size: 12px; font-weight: 700; cursor: pointer;">Compito</button>
                            </div>
                        </div>
                        <div>
                            <label style="font-size: 11px; font-weight: 700; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; display: block;">Materia</label>
                            <select id="registroTaskSubject" style="width: 100%; padding: 12px 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); background: rgba(30,30,30,0.9); color: white; font-size: 14px; outline: none; box-sizing: border-box;">
                                ${subjectOptions}
                            </select>
                        </div>
                        <div>
                            <label style="font-size: 11px; font-weight: 700; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; display: block;">Argomenti</label>
                            <textarea id="registroTaskArgs" placeholder="Es. Capitoli 3-5, Equazioni 2° grado" rows="2"
                                style="width: 100%; padding: 12px 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: white; font-size: 14px; outline: none; resize: vertical; box-sizing: border-box;"></textarea>
                        </div>
                        <div>
                            <label style="font-size: 11px; font-weight: 700; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; display: block;">Data</label>
                            <input id="registroTaskDate" type="date" value="${getLocalDateString()}"
                                style="width: 100%; padding: 12px 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); background: rgba(30,30,30,0.9); color: white; font-size: 14px; outline: none; box-sizing: border-box;" />
                        </div>
                    </div>
                    <button onclick="submitRegistroTask()" style="width: 100%; margin-top: 20px; padding: 14px; border-radius: 14px; border: none; background: var(--accent); color: white; font-size: 15px; font-weight: 700; cursor: pointer;">
                        <i class="ph-bold ph-plus" style="margin-right: 6px;"></i> Aggiungi al Registro
                    </button>
                </div>
        `);
            window._registroTipo = 'Verifica';
        }
        function showCompetencyInputModal() {
            const votiData = getVotiData();
            const subjectsMap = {};
            votiData.forEach(v => {
                const sub = v.materia || v.subject || 'Altro';
                if (!subjectsMap[sub]) subjectsMap[sub] = [];
                subjectsMap[sub].push(v);
            });

            // Also gather all known subjects from tasks (in case there are subjects with no grades yet)
            const allSubjects = new Set(Object.keys(subjectsMap));
            state.tasks.forEach(t => { if (t.subject) allSubjects.add(t.subject); });

            const subjectsList = [...allSubjects].map(name => {
                const list = subjectsMap[name] || [];
                const media = list.length > 0 ? (parseFloat(calcolaMedia(list)) || 0) : 0;
                const color = getSubjectColor(name);
                const savedLevel = (state.prepLevels || {})[name] || 3;
                const priority = media < 6 ? '🔴 Recupero' : media < 7 ? '🟡 Migliorabile' : '🟢 Buona';
                return { name, media, color, priority, count: list.length, savedLevel };
            }).sort((a, b) => a.media - b.media);

            const levelLabels = { 1: 'Per niente pronto', 2: 'Poco pronto', 3: 'Sufficiente', 4: 'Abbastanza pronto', 5: 'Molto pronto' };

            showModal(`
                <div style="padding: 24px; max-height: 80vh; overflow-y: auto;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <h2 style="margin: 0; font-size: 20px; font-weight: 800;">🎯 Competenze & Priorità</h2>
                        <i class="ph ph-x" onclick="closeModal()" style="cursor:pointer; font-size: 22px; opacity: 0.6;"></i>
                    </div>
                    <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 16px;">Indica la tua preparazione (1-5) per ogni materia. L'AI userà sia i voti sia il tuo livello dichiarato.</p>

                    <div style="display: flex; flex-direction: column; gap: 14px; margin-bottom: 24px;">
                        ${subjectsList.map(s => `
                            <div style="padding: 18px; border-radius: 16px; background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.08);">
                                <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 12px; cursor: pointer;" onclick="const chk=this.querySelector('input'); chk.checked=!chk.checked">
                                    <input type="checkbox" value="${s.name}" class="competency-check" id="comp-${s.name.replace(/[^a-zA-Z0-9]/g, '_')}" ${s.media < 6.5 || s.savedLevel < 3 ? 'checked' : ''} style="accent-color: var(--accent); width: 22px; height: 22px; cursor: pointer;" onclick="event.stopPropagation()" />
                                    <span style="background: ${s.color}; width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;"></span>
                                    <div style="flex: 1; min-width: 0;">
                                        <div style="font-size: 15px; font-weight: 700; color: white;">${s.name}</div>
                                        <div style="font-size: 11px; color: var(--text-dim); margin-top: 2px;">${s.count > 0 ? `Media: ${s.media.toFixed(1)} · ${s.priority}` : 'Nessun voto'}</div>
                                    </div>
                                </div>
                                <div style="display: flex; flex-direction: column; gap: 8px; padding-left: 2px;">
                                    <div style="display: flex; justify-content: space-between; align-items: center;">
                                        <span style="font-size: 11px; color: var(--text-dim); text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Preparazione:</span>
                                        <span id="prep-label-${s.name.replace(/[^a-zA-Z0-9]/g, '_')}" style="font-size: 12px; color: var(--accent); font-weight: 800;">${levelLabels[s.savedLevel]}</span>
                                    </div>
                                    <div style="height: 48px; display: flex; align-items: center;">
                                        <input type="range" min="1" max="5" value="${s.savedLevel}" class="prep-slider" data-subject="${s.name}"
                                            oninput="document.getElementById('prep-label-${s.name.replace(/[^a-zA-Z0-9]/g, '_')}').textContent = ['','Per niente','Poco','Sufficiente','Abbastanza','Molto'][this.value]"
                                            style="flex: 1; accent-color: var(--accent); height: 8px; cursor: pointer;" />
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                        ${subjectsList.length === 0 ? '<div style="text-align:center; padding:40px; color:var(--text-dim); font-size:14px;">Nessun voto disponibile. Sincronizza prima i voti.</div>' : ''}
                    </div>

                    <button class="btn-primary" onclick="submitCompetencyRequest()" style="width: 100%; border:none; color:white; font-size: 16px; font-weight: 800; padding: 18px; border-radius: 16px;">
                        <i class="ph-bold ph-sparkle" style="margin-right: 8px;"></i> Chiedi un Piano all'AI
                    </button>
                </div>
        `);
        }
        function showOrganizeStudyModal() {
            const todayStr = getLocalDateString(getSchoolDate());
            const plannedIds = state.plannedTasks[todayStr] || [];
            const allPendingTasks = state.tasks.filter(t => !t.done);

            modalContainer.innerHTML = `
            <div class="modal-overlay active" onclick="closeModal(event)">
                <div class="modal-content glass-panel" onclick="event.stopPropagation()" style="max-width: 450px; padding: 30px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                        <h2 style="margin:0; font-size: 24px;">Cosa fai oggi?</h2>
                        <i class="ph ph-x" onclick="closeModal()" style="cursor:pointer; font-size: 28px; opacity: 0.6;"></i>
                    </div>
                    <p style="font-size: 15px; opacity: 0.8; margin-bottom: 24px; line-height: 1.5;">Seleziona i compiti che vuoi affrontare oggi.</p>
                    
                    <div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 30px; max-height: 450px; overflow-y: auto;">
                        ${allPendingTasks.length > 0 ? allPendingTasks.map(t => {
                const isPlanned = plannedIds.includes(t.id);
                const subjectColor = getSubjectColor(t.subject);
                return `
                                <div class="glass-list-item" style="padding: 18px; display: flex; align-items: center; gap: 16px; cursor: pointer; border-left: 4px solid ${isPlanned ? 'var(--green)' : 'rgba(255,255,255,0.05)'}; background: ${isPlanned ? 'rgba(48, 209, 88, 0.08)' : 'rgba(255,255,255,0.03)'};" onclick="togglePlanTask('${t.id}')">
                                    <div class="plan-checkbox ${isPlanned ? 'checked' : ''}" style="width: 28px; height: 28px; border-radius: 8px; background: ${isPlanned ? 'var(--green)' : 'transparent'}; border: 2px solid ${isPlanned ? 'var(--green)' : 'rgba(255,255,255,0.2)'}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                        ${isPlanned ? '<i class="ph-bold ph-check" style="font-size: 16px; color: black;"></i>' : ''}
                                    </div>
                                    <div style="flex: 1; min-width: 0;">
                                        <div style="font-weight: 700; font-size: 16px; color: white;">${t.text}</div>
                                        <div style="font-size: 12px; color: ${subjectColor}; font-weight: 800; text-transform: uppercase;">${t.subject}</div>
                                    </div>
                                </div>
                            `;
            }).join('') : '<div style="text-align: center; opacity: 0.5; padding: 40px;">Nessun compito in sospeso.</div>'}
                    </div>
                    <button onclick="closeModal()" class="btn-primary" style="width: 100%; padding: 16px; font-size: 16px; font-weight: 700;">Salva Agenda</button>
                </div>
            </div>
        `;
        }
        function togglePlannerMenu(event) {
            if (event) event.stopPropagation();
            const menu = document.getElementById('planner-cloud-menu');
            const btn = document.getElementById('planner-cloud-btn') || event?.currentTarget || event?.target?.closest('button');
            if (!menu || !btn) return;

            const isVisible = menu.classList.contains('active');

            // Chiudi tutti gli altri eventuali dropdown prima
            document.querySelectorAll('.planner-dropdown-content').forEach(el => {
                if (el !== menu) {
                    el.classList.remove('active');
                    el.style.display = 'none';
                }
            });

            if (!isVisible) {
                // 🚀 TELETRASPORTO: Esci dai contenitori padri (v1.1.56)
                if (menu.parentElement !== document.body) {
                    document.body.appendChild(menu);
                }

                // Calcola posizione esatta sullo schermo 
                const isMobile = window.innerWidth <= 768;
                const menuWidth = isMobile ? 240 : 300;

                const updatePosition = () => {
                    const rect = btn.getBoundingClientRect();
                    const isMobile = window.innerWidth <= 768;
                    const menuWidth = isMobile ? 240 : 300;

                    // Calculate left position anchored to button's right edge (v1.1.58)
                    let leftPos = rect.right - menuWidth;
                    // Prevent overflow on left edge
                    if (leftPos < 8) leftPos = 8;
                    // Prevent overflow on right edge
                    if (leftPos + menuWidth > window.innerWidth - 8) {
                        leftPos = window.innerWidth - menuWidth - 8;
                    }

                    // Perfect Positioning (v1.1.64): Absolute relative to document to scroll NATURALLY
                    const scrollY = window.pageYOffset || document.documentElement.scrollTop;
                    const scrollX = window.pageXOffset || document.documentElement.scrollLeft;

                    menu.style.setProperty('position', 'absolute', 'important');
                    menu.style.setProperty('top', (scrollY + rect.bottom + 8) + 'px', 'important');
                    menu.style.setProperty('left', (scrollX + leftPos) + 'px', 'important');
                    menu.style.setProperty('right', 'auto', 'important');
                    menu.style.setProperty('z-index', '2147483647', 'important');
                    menu.style.setProperty('width', menuWidth + 'px', 'important');
                    menu.style.setProperty('min-width', menuWidth + 'px', 'important');
                    menu.style.setProperty('display', 'flex', 'important');
                    menu.style.setProperty('flex-direction', 'column', 'important');
                };

                updatePosition();
                menu.classList.add('active');

                // Gestore chiusura universale
                const closeHandler = (e) => {
                    if (!menu.contains(e.target) && !btn.contains(e.target)) {
                        menu.classList.remove('active');
                        menu.style.display = 'none';
                        document.removeEventListener('click', closeHandler);
                    }
                };

                setTimeout(() => {
                    document.addEventListener('click', closeHandler);
                }, 10);
            } else {
                menu.classList.remove('active');
                menu.style.display = 'none';
            }
        }
        function showTasksBySubjectModal() {
            const subjects = [...new Set(state.tasks.map(t => t.subject))].sort();
            modalContainer.innerHTML = `
            <div class="modal-overlay active" onclick="closeModal(event)">
                <div class="modal-content glass-panel" onclick="event.stopPropagation()" style="max-width: 500px; padding: 24px; max-height: 85vh; overflow-y: auto;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                        <h2 style="margin:0;">Compiti per Materia</h2>
                        <i class="ph ph-x" onclick="closeModal()" style="cursor:pointer; font-size: 24px;"></i>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 24px;">
                        ${subjects.map(s => {
                const subjectTasks = state.tasks.filter(t => t.subject === s);
                const color = getSubjectColor(s);
                return `
                                <div style="border-left: 4px solid ${color}; padding-left: 16px;">
                                    <h3 style="color: ${color}; text-transform: uppercase; font-size: 14px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
                                        <i class="ph-fill ph-book-open"></i> ${s}
                                        <span style="font-size: 10px; padding: 2px 8px; border-radius: 20px; font-weight: 800; border: 1px solid ${color}40;">${subjectTasks.length}</span>
                                    </h3>
                                    <div style="display: flex; flex-direction: column; gap: 10px;">
                                        ${subjectTasks.map(t => `
                                            <div class="glass-list-item" style="padding: 12px; display: flex; align-items: center; gap: 12px; background: rgba(255,255,255,0.03);">
                                                <div class="task-checkbox ${t.done ? 'checked' : ''}" style="width: 18px; height: 18px; border: 2px solid ${t.done ? 'var(--green)' : 'rgba(255,255,255,0.2)'}; border-radius: 5px; background: ${t.done ? 'var(--green)' : 'transparent'}; display: flex; align-items: center; justify-content: center;">
                                                    ${t.done ? '<i class="ph-bold ph-check" style="font-size: 10px; color: black;"></i>' : ''}
                                                </div>
                                                <div style="flex: 1;">
                                                    <div style="font-size: 14px; font-weight: 600; color: white; ${t.done ? 'opacity: 0.5; text-decoration: line-through;' : ''}">${t.text}</div>
                                                    <div style="font-size: 10px; opacity: 0.5;">${t.display_date}</div>
                                                </div>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            `;
            }).join('')}
                    </div>
                    <button onclick="closeModal()" class="btn-primary" style="margin-top: 30px; width: 100%;">Chiudi</button>
                </div>
            </div>
        `;
        }
        function togglePlanTask(id) {
            if (event) event.stopPropagation();

            const todayStr = getLocalDateString(getSchoolDate());
            if (!state.plannedTasks[todayStr]) state.plannedTasks[todayStr] = [];

            const index = state.plannedTasks[todayStr].indexOf(id);
            if (index > -1) {
                state.plannedTasks[todayStr].splice(index, 1);
            } else {
                state.plannedTasks[todayStr].push(id);
            }

            saveTasks();

            updatePlanTaskUI(id, state.plannedTasks[todayStr].includes(id));
            updatePlannerCounter();
            notifyPlannerChanged(); // ✅ aggiorna Planner e Home SUBITO
        }
        function updateTaskUI(taskId, isDone) {
            const checkbox = document.querySelector(`[data-task-toggle="${taskId}"]`);
            const taskText = document.querySelector(`[data-task-text="${taskId}"]`);

            if (checkbox) {
                checkbox.style.transition = 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)';

                if (isDone) {
                    checkbox.style.background = 'var(--green, #30D158)';
                    checkbox.style.borderColor = 'var(--green, #30D158)';
                    checkbox.innerHTML = '<i class="ph-bold ph-check" style="font-size: 10px; color: black;"></i>';
                } else {
                    checkbox.style.background = 'transparent';
                    checkbox.style.borderColor = 'rgba(255,255,255,0.2)';
                    checkbox.innerHTML = '';
                }

                checkbox.style.transform = 'scale(0.85) translateZ(0)';
                requestAnimationFrame(() => {
                    setTimeout(() => {
                        checkbox.style.transform = 'scale(1) translateZ(0)';
                    }, 50);
                });
            }

            if (taskText) {
                taskText.style.transition = 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
                if (isDone) {
                    taskText.style.opacity = '0.5';
                    taskText.style.textDecoration = 'line-through';
                } else {
                    taskText.style.opacity = '1';
                    taskText.style.textDecoration = 'none';
                }
            }
        }
        function updateStressWidget(level) { renderStressWave(level); }
        function updateMediaWidget(value) { renderMediaGauge(value); }
        function initHomeWidgets({ mediaValue = 7.64, stressLevel = 5 } = {}) {
            renderStressWave(stressLevel);
            renderMediaGauge(mediaValue);
        }
        function togglePollCreatorUI() {
            const ui = document.getElementById('poll-creator-ui');
            if (ui) {
                ui.style.display = (ui.style.display === 'none' || ui.style.display === '') ? 'block' : 'none';
            }
        }
        function showDetailedStressModal(event) {
            if (event) event.stopPropagation();
            const modalContainer = getModalContainer();
            if (!modalContainer) return;

            const todayStr = getLocalDateString();

            // Draft State Initialization
            state.tempStress = {
                level: state.stressLevels?.[todayStr] ?? 5,
                vent: state.stressVents?.[todayStr] ?? ''
            };

            const historyDays = [];
            const today = new Date();
            for (let i = 0; i < 30; i++) {
                const d = new Date(today);
                d.setDate(today.getDate() - i);
                const iso = getLocalDateString(d);
                if (state.stressLevels?.[iso] || state.stressVents?.[iso]) {
                    historyDays.push({
                        date: iso,
                        level: state.stressLevels?.[iso] || 5,
                        vent: state.stressVents?.[iso] || '',
                        displayDate: d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
                    });
                }
            }

            modalContainer.innerHTML = `
    <div class="modal-overlay active" onclick="closeModal(event)">
      <div class="modal-content" onclick="event.stopPropagation()" style="max-width: 550px; padding: 24px; background:#121212; border:1px solid rgba(255,255,255,0.1); border-radius:28px; max-height:90vh; overflow-y:auto;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 24px;">
          <h2 style="margin:0; font-size:22px; font-weight:800; color:white;">Analisi Stress</h2>
          <button onclick="closeModal()" style="width:36px; height:36px; border-radius:50%; background:rgba(255,255,255,0.06); border:none; color:white; display:flex; align-items:center; justify-content:center; cursor:pointer;">
            <i class="ph-bold ph-x" style="font-size:18px;"></i>
         </button>
       </div>

        <div style="margin-bottom:24px;">
            <div style="font-size:13px; font-weight:700; color:rgba(255,255,255,0.4); margin-bottom:12px; text-transform:uppercase; letter-spacing:0.5px;">Come ti senti oggi?</div>
            <div style="display:flex; justify-content:space-between; gap:6px;">
                ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(lv => `
                    <button class="stress-pill-btn" data-lv="${lv}" onclick="updateStressDraft(${lv})" 
                        style="flex:1; height:40px; border-radius:10px; border:none; font-weight:800; font-size:14px; cursor:pointer; transition:all 0.2s;
                        background: ${state.tempStress.level === lv ? 'var(--primary)' : 'rgba(255,255,255,0.06)'};
                        color: ${state.tempStress.level === lv ? 'white' : 'rgba(255,255,255,0.4)'};">
                        ${lv}
                   </button>
                `).join('')}
           </div>
       </div>

        <div style="margin-bottom:24px;">
            <div style="font-size:13px; font-weight:700; color:rgba(255,255,255,0.4); margin-bottom:12px; text-transform:uppercase; letter-spacing:0.5px;">Sfogo del giorno</div>
            <textarea id="dailyVentInput" placeholder="Scrivi qui i tuoi pensieri..." 
                oninput="state.tempStress.vent = this.value"
                style="width:100%; height:80px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:16px; padding:12px; color:white; font-size:14px; outline:none; font-family:inherit; resize:none;">${state.tempStress.vent}</textarea>
       </div>

        <div style="margin-bottom:24px;">
            <div style="font-size:13px; font-weight:700; color:rgba(255,255,255,0.4); margin-bottom:12px; text-transform:uppercase; letter-spacing:0.5px;">Trend</div>
            <div style="background:rgba(255,255,255,0.03); border-radius:20px; padding:16px; border:1px solid rgba(255,255,255,0.04);">
                <canvas id="weeklyDetailedChart" style="width:100%; height:120px;"></canvas>
           </div>
       </div>

        <div style="margin-bottom:24px;">
            <div style="font-size:13px; font-weight:700; color:rgba(255,255,255,0.4); margin-bottom:12px; text-transform:uppercase; letter-spacing:0.5px;">Storico Recente</div>
            <div style="display:flex; gap:12px; overflow-x:auto; padding-bottom:8px; scrollbar-width:none;">
                ${historyDays.length > 0 ? historyDays.map(h => `
                    <div style="min-width:140px; background:rgba(255,255,255,0.04); border-radius:16px; padding:12px; border:1px solid rgba(255,255,255,0.06);">
                        <div style="font-size:11px; font-weight:800; color:rgba(255,255,255,0.3); margin-bottom:4px;">${h.displayDate}</div>
                        <div style="font-size:13px; font-weight:700; color:var(--primary); margin-bottom:4px;">Livello ${h.level}</div>
                        <div style="font-size:12px; color:rgba(255,255,255,0.6); display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${h.vent || 'Nessun pensiero'}</div>
                   </div>
                `).join('') : '<div style="opacity:0.3; font-size:13px;">Nessun dato precedente</div>'}
           </div>
       </div>

        <div style="display:flex; gap:12px;">
            <button onclick="closeModal()" style="flex:1; height:50px; border-radius:16px; font-weight:700; background:rgba(255,255,255,0.06); border:none; color:white; cursor:pointer;">Annulla</button>
            <button onclick="commitStressChanges()" class="btn-primary" style="flex:2; height:50px; border-radius:16px; font-weight:800; border:none; cursor:pointer;">SALVA</button>
       </div>
     </div>
   </div>
  `;
            drawDetailedStressChart('weeklyDetailedChart');
        }
        function drawDetailedStressChart(canvasId) {
            const canvas = document.getElementById(canvasId);
            if (!canvas) return;
            const { ctx, rect } = setupCanvas(canvas);
            const W = rect.width, H = rect.height;

            const days = 7;
            const today = new Date();
            const series = [];
            const labels = [];

            const dayNames = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];

            for (let i = days - 1; i >= 0; i--) {
                const d = new Date(today);
                d.setDate(today.getDate() - i);
                const iso = getLocalDateString(d);
                const lv = Number(state.stressLevels?.[iso] ?? 5);
                series.push(lv);
                labels.push(dayNames[d.getDay()]);
            }

            ctx.clearRect(0, 0, W, H);

            const padding = 25;
            const stepX = (W - padding * 2) / (series.length - 1);
            // Gradient area
            const grad = ctx.createLinearGradient(0, 0, 0, H);
            grad.addColorStop(0, 'rgba(99, 102, 241, 0.2)');
            grad.addColorStop(1, 'rgba(99, 102, 241, 0)');
            
            ctx.beginPath();
            series.forEach((v, i) => {
                const x = padding + i * stepX;
                const y = H - padding - (v / 10) * (H - padding * 2);
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.lineTo(padding + (series.length - 1) * stepX, H);
            ctx.lineTo(padding, H);
            ctx.closePath();
            ctx.fillStyle = grad;
            ctx.fill();

            // Main line
            ctx.beginPath();
            ctx.strokeStyle = '#6366f1';
            ctx.lineWidth = 3;
            series.forEach((v, i) => {
                const x = padding + i * stepX;
                const y = H - padding - (v / 10) * (H - padding * 2);
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.stroke();

            // Points (Bug 3 Fix)
            series.forEach((v, i) => {
                const x = padding + i * stepX;
                const y = H - padding - (v / 10) * (H - padding * 2);
                ctx.fillStyle = '#6366f1';
                ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 2;
                ctx.stroke();
            });

            // Labels
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.font = '800 10px Inter';
            ctx.textAlign = 'center';
            labels.forEach((l, i) => {
                ctx.fillText(l, padding + i * stepX, H - 5);
            });
        }
        function drawWeeklyStressChart(canvasId) {
            const canvas = document.getElementById(canvasId);
            if (!canvas) return;

            // DPR-safe
            const rect = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            canvas.width = Math.floor(rect.width * dpr);
            canvas.height = Math.floor(rect.height * dpr);
            const ctx = canvas.getContext('2d');
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            const W = rect.width, H = rect.height;

            // Calcola ultimi 7 giorni
            const days = 7;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const series = [];
            for (let i = days - 1; i >= 0; i--) {
                const d = new Date(today);
                d.setDate(today.getDate() - i);
                const iso = getLocalDateString(d);
                const lv = Number(state.stressLevels?.[iso] ?? 0);
                series.push({ date: iso, level: lv });
            }

            // Sfondo
            ctx.clearRect(0, 0, W, H);
            ctx.fillStyle = 'rgba(255,255,255,0.05)';
            ctx.fillRect(0, 0, W, H);

            // Assi
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(40, 16);
            ctx.lineTo(40, H - 28);
            ctx.lineTo(W - 12, H - 28);
            ctx.stroke();

            // Linea valori (0-10)
            const minX = 52, maxX = W - 24;
            const minY = 20, maxY = H - 40;
            const stepX = (maxX - minX) / Math.max(1, series.length - 1);

            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2;
            
            // Line
            ctx.beginPath();
            series.forEach((pt, i) => {
                const x = minX + i * stepX;
                const y = maxY - (pt.level / 10) * (maxY - minY);
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.stroke();

            // Dots (Bug 3 Fix)
            series.forEach((pt, i) => {
                const x = minX + i * stepX;
                const y = maxY - (pt.level / 10) * (maxY - minY);
                ctx.fillStyle = '#ef4444';
                ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
            });

            // Etichette giorno
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.font = '11px system-ui';
            series.forEach((pt, i) => {
                const x = minX + i * stepX;
                const label = pt.date.slice(5); // MM-DD
                ctx.fillText(label, x - 12, H - 10);
            });
        }


        // ── 3. PATCH: refreshDailyQuote ──
        window.refreshDailyQuote = function (btnEl) {
            window._quoteOffset = (window._quoteOffset || 0) + 1;
            const quotes = [
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
            ];
            const day = new Date().getDate();
            const idx = (day + window._quoteOffset) % quotes.length;
            
            const heroStatus = document.querySelector('.hero-status span[style*="italic"]');
            if (heroStatus) {
                heroStatus.style.opacity = '0';
                heroStatus.style.transform = 'translateY(-4px)';
                heroStatus.style.transition = 'all 0.2s ease';
                setTimeout(() => {
                    heroStatus.textContent = `"${quotes[idx]}"`;
                    heroStatus.style.opacity = '0.8';
                    heroStatus.style.transform = 'translateY(0)';
                }, 200);
            }

            if (btnEl) {
                btnEl.style.transform = 'rotate(360deg)';
                btnEl.style.transition = 'transform 0.4s cubic-bezier(0.16,1,0.3,1)';
                setTimeout(() => {
                    btnEl.style.transform = '';
                    btnEl.style.transition = '';
                }, 400);
            }
        };

        // ── 4. PATCH: animationend listener ──
        document.addEventListener('animationend', (e) => {
            if (e.target.classList.contains('view') || 
                e.target.classList.contains('hero-container')) {
                e.target.classList.add('anim-done');
            }
        }, true);

        /* ===== GLOBAL SAFETY EXPORTS (hotfix) ===== */
        (function attachGlobals() {
          const safeBind = (name, fn) => {
            if (typeof window[name] !== 'function') window[name] = fn;
          };

          // 1) showProfileActions fallback
          safeBind('showProfileActions', function showProfileActionsFallback() {
            try {
              if (typeof closeModal !== 'function' || typeof getModalContainer !== 'function') return;
              const container = getModalContainer();
              if (!container) return;
              container.innerHTML = `
                <div class="modal-overlay active" onclick="closeModal(event)">
                  <div class="modal-content" onclick="event.stopPropagation()" style="width: 100%; max-width: 360px; padding: 16px; border-radius: 20px; background: white; box-shadow: 0 20px 40px rgba(0,0,0,0.2);">
                    <div style="font-size: 18px; font-weight: 800; color: var(--text-primary); margin-bottom: 12px;">Profilo</div>
                    <p style="font-size: 14px; color: var(--text-secondary); margin-bottom: 20px;">Sessione caricata parzialmente. Riprova a navigare nel profilo.</p>
                    <button onclick="closeModal(); if(window.navigate) navigate('profile')" class="btn-primary" style="width:100%; margin-bottom:8px; border-radius: 12px; height: 48px; font-weight: 700;">Apri profilo</button>
                    <button onclick="if(window.logout) logout()" style="width: 100%; height: 48px; border-radius: 12px; border: none; background: rgba(239, 68, 68, 0.05); color: var(--red); font-weight: 800; cursor: pointer;">Esci</button>
                  </div>
                </div>`;
            } catch (e) {
              console.error('showProfileActions fallback error', e);
            }
          });

          // 2) isFutureOrToday fallback (timezone-safe)
          safeBind('isFutureOrToday', function isFutureOrTodayFallback(dateStr) {
            if (!dateStr) return false;
            const today = (typeof getLocalDateString === 'function')
              ? getLocalDateString(new Date())
              : new Date().toISOString().slice(0, 10);
            return String(dateStr) >= today;
          });
        })();


// --- XSS PROTECTION ---
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// --- AGENDA SEARCH & FILTER HELPERS ---
setInterval(() => {
    const clock = document.getElementById('topbar-clock');
    if (clock) {
        clock.innerText = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
}, 500);

window.scrollToSearch = function () {
    // If we're not in the agenda view, go there first
    if (state.view !== 'planner' && state.view !== 'home_diary') {
        navigate('planner');
    }

    // Switch to list mode if we are in calendar mode
    if (state.uiMode !== 'list') {
        switchPlannerView('list');
    }

    setTimeout(() => {
        const searchInput = document.querySelector('.agenda-search-input');
        if (searchInput) {
            searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            searchInput.focus();
        }
    }, 300);
};

window.handleAgendaSearch = function (event) {
    state.agendaSearchQuery = event.target.value;
    refreshAgenda();
};

window.setAgendaFilter = function (subject) {
    state.agendaSearchSubject = subject;
    refreshAgenda();
};
const PASSING_GRADE_THRESHOLD = 6;

function getAgendaCacheKey() {
    try {
        return `${lsKey('weekly_agenda_cache')}:${state.plannerMode || 'registro'}:${state.agendaSortOrder || 'due_desc'}:${state.agendaSearchSubject || 'all'}:${state.agendaSearchQuery || ''}`;
    } catch (e) {
        console.warn('Agenda cache key fallback:', e?.message || e);
        return `weekly_agenda_cache:${state.plannerMode || 'registro'}:${state.agendaSortOrder || 'due_desc'}:${state.agendaSearchSubject || 'all'}:${state.agendaSearchQuery || ''}`;
    }
}

function getCachedWeeklyAgendaHtml() {
    if (state._weeklyAgendaCacheHtml) return state._weeklyAgendaCacheHtml;
    try {
        const cached = localStorage.getItem(getAgendaCacheKey());
        if (!cached) return '';
        state._weeklyAgendaCacheHtml = cached;
        return cached;
    } catch (_) {
        return '';
    }
}

function saveWeeklyAgendaCache(html) {
    state._weeklyAgendaCacheHtml = html || '';
    try {
        localStorage.setItem(getAgendaCacheKey(), state._weeklyAgendaCacheHtml);
    } catch (_) {}
}

/**
 * Pre-computa e salva la lista agenda in cache.
 * @param {boolean} force - Se true, esegue il warmup anche fuori dalla vista calendar (es. login/sync).
 */
window.warmWeeklyAgendaCache = function (force = false) {
    if (!force && state.uiMode !== 'calendar') return;
    const snapshot = {
        agendaSortOrder: state.agendaSortOrder,
        agendaSearchSubject: state.agendaSearchSubject,
        agendaSearchQuery: state.agendaSearchQuery
    };
    try {
        state.agendaSearchQuery = '';
        state.agendaSearchSubject = 'all';
        state.agendaSortOrder = 'due_desc';
        const baseHtml = renderWeeklyAgenda();
        if (baseHtml) saveWeeklyAgendaCache(baseHtml);
    } finally {
        state.agendaSortOrder = snapshot.agendaSortOrder;
        state.agendaSearchSubject = snapshot.agendaSearchSubject;
        state.agendaSearchQuery = snapshot.agendaSearchQuery;
    }
};

window.refreshAgenda = function () {
    const list = document.getElementById('weekly-agenda-list');
    if (list) {
        const temp = document.createElement('div');
        const html = renderWeeklyAgenda();
        saveWeeklyAgendaCache(html);
        temp.innerHTML = html;
        const newList = temp.firstElementChild;
        if (newList) {
            list.parentNode.replaceChild(newList, list);
            if (typeof animatePlannerSurface === 'function') animatePlannerSurface('list');
        } else {
            list.innerHTML = '';
        }
        // Focus back on search input if it existed to maintain typing flow
        const searchInput = document.getElementById('weekly-agenda-list')?.querySelector('.agenda-search-input');
        if (searchInput) {
            searchInput.focus();
            const val = searchInput.value;
            searchInput.value = '';
            searchInput.value = val; // Move cursor to end
        }
    } else {
        scheduleRender(0);
    }
};

function refreshPlannerSwitchButtons() {
    const buttons = Array.from(document.querySelectorAll('.view-switch .switch-btn'));
    buttons.forEach((btn) => {
        const targetView = btn.dataset.plannerView;
        const isActive = targetView === state.uiMode;
        btn.classList.toggle('active', isActive);
        btn.style.background = isActive ? '#141414' : 'transparent';
        btn.style.color = isActive ? 'white' : 'var(--text-secondary)';
    });
}

function animatePlannerSurface(view) {
    if (typeof gsap === 'undefined') return;
    if (view === 'calendar') {
        const days = document.querySelectorAll('.calendar-day');
        const badges = document.querySelectorAll('.event-badge');
        gsap.fromTo(days, { opacity: 0, y: 12, scale: 0.985 }, {
            opacity: 1,
            y: 0,
            scale: 1,
            duration: 0.28,
            ease: 'power2.out',
            stagger: { each: 0.015, from: 'start' },
            clearProps: 'transform,opacity'
        });
        gsap.fromTo(badges, { opacity: 0, x: -4 }, {
            opacity: 1,
            x: 0,
            duration: 0.22,
            ease: 'power1.out',
            stagger: 0.01,
            clearProps: 'transform,opacity'
        });
        return;
    }
    const listCards = document.querySelectorAll('#weekly-agenda-list .card');
    gsap.fromTo(listCards, { opacity: 0, y: 10 }, {
        opacity: 1,
        y: 0,
        duration: 0.26,
        ease: 'power2.out',
        stagger: 0.02,
        clearProps: 'transform,opacity'
    });
}

// --- UI TRANSITION HELPERS (Added by Phase 25 Mega Patch) ---
window.switchPlannerMode = function (mode) {
    state.plannerMode = mode;
    document.querySelectorAll('[data-planner-mode]').forEach(btn => {
        const isActive = btn.dataset.plannerMode === mode;
        btn.style.background = isActive ? 'rgba(139,92,246,0.25)' : 'transparent';
        btn.style.color = isActive ? 'white' : 'rgba(255,255,255,0.6)';
        btn.style.border = isActive ? '1px solid rgba(139,92,246,0.4)' : '1px solid transparent';
    });
    const list = document.getElementById('weekly-agenda-list');
    if (list && typeof gsap !== 'undefined') {
        gsap.to(list, {
            opacity: 0, y: 4, duration: 0.12, ease: 'power2.in',
            onComplete: () => {
                const temp = document.createElement('div');
                temp.innerHTML = renderWeeklyAgenda();
                const newList = temp.firstElementChild;
                if (newList) {
                    list.parentNode.replaceChild(newList, list);
                    gsap.fromTo(newList, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.28, ease: 'power2.out', clearProps: 'transform,opacity' });
                } else {
                    gsap.fromTo(list, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.28, ease: 'power2.out', clearProps: 'transform,opacity' });
                }
            }
        });
    } else {
        scheduleRender(0);
    }
};

window.switchPlannerView = function (view) {
    if (view !== 'calendar' && view !== 'list') return;
    if (state.uiMode === view) return;
    state.uiMode = view;
    localStorage.setItem('g_diary_planner_view', view);
    const content = document.getElementById('planner-main-content');
    const canPatchInPlace = state.view === 'planner' && content;
    const runSwap = () => {
        if (!canPatchInPlace) {
            scheduleRender(0);
            return;
        }
        if (view === 'calendar') {
            if (typeof window.warmWeeklyAgendaCache === 'function') window.warmWeeklyAgendaCache(true);
            content.innerHTML = '<div id="calendar"></div>';
            renderCustomCalendar();
            animatePlannerSurface('calendar');
        } else {
            const cachedAgenda = getCachedWeeklyAgendaHtml();
            const listHtml = cachedAgenda || renderWeeklyAgenda();
            if (!cachedAgenda && listHtml) saveWeeklyAgendaCache(listHtml);
            content.innerHTML = listHtml;
            animatePlannerSurface('list');
        }
        refreshPlannerSwitchButtons();
    };

    if (content && typeof gsap !== 'undefined') {
        gsap.to(content, {
            opacity: 0,
            y: 4,
            scale: 0.995,
            duration: 0.1,
            ease: 'power2.in',
            onComplete: () => {
                runSwap();
                const newContent = document.getElementById('planner-main-content');
                if (newContent) {
                    gsap.fromTo(newContent, { opacity: 0, y: 6, scale: 0.995 }, {
                        opacity: 1,
                        y: 0,
                        scale: 1,
                        duration: 0.16,
                        ease: 'power2.out',
                        clearProps: 'transform,opacity'
                    });
                }
            }
        });
        return;
    }
    runSwap();
};

window.navigateSubject = function (subjName) {
    const root = document.getElementById('app');
    const currentView = root ? root.querySelector('.view') : null;
    if (currentView && typeof gsap !== 'undefined') {
        gsap.to(currentView, {
            opacity: 0, y: -8, scale: 0.99, duration: 0.15, ease: 'power2.in', onComplete: () => {
                state.activeSubject = subjName;
                scheduleRender(0);
            }
        });
    } else {
        state.activeSubject = subjName;
        scheduleRender(0);
    }
};

window.handleGradeSubjectClick = function (subjectName) {
    state.view = 'voti';
    window.navigateSubject(subjectName);
    if (typeof closeModal === 'function') closeModal();
};

window.handleGradeSubjectClickFromEncoded = function (encodedSubjectName) {
    let subjectName = '';
    try {
        subjectName = decodeURIComponent(encodedSubjectName || '');
    } catch (_) {
        subjectName = encodedSubjectName || '';
    }
    window.handleGradeSubjectClick(subjectName);
};

window.closeSubject = function () {
    state.activeSubject = null;
    scheduleRender();
};
// --- Google Calendar OAuth2 (Universal) ---
window.refreshSessionToken = async function () {
    const s = JSON.parse(localStorage.getItem('argo_session') || '{}');
    if (!s || !s.schoolCode || !(s.userName || s.username) || !s.storedPass) return false;

    let password = '';
    try {
        password = decodeURIComponent(escape(atob(s.storedPass)));
    } catch (e) {
        console.warn('Decode storedPass failed in refreshSessionToken');
        return false;
    }

    const payload = {
        schoolCode: s.schoolCode,
        username: s.userName || s.username,
        password,
        profileIndex: s.profileIndex
    };

    const res = await fetch(`${window.API_BASE_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success || !data?.sessionToken) return false;

    const updated = {
        ...s,
        ...data.session,
        studentId: data.student?.id || s.studentId,
        sessionToken: data.sessionToken
    };
    localStorage.setItem('argo_session', JSON.stringify(updated));
    return true;
};

window.googleFetchWithAuthRetry = async function (url, options = {}) {
    let res = await fetch(url, options);
    if (res.status !== 403) return res;

    const refreshed = await window.refreshSessionToken().catch(() => false);
    if (!refreshed) return res;

    const retryOpts = { ...options, headers: getSessionHeaders() };
    return fetch(url, retryOpts);
};

window.connectGoogle = async function () {
    const userId = window.getUserId();
    if (!userId || userId === 'guest') { showToast('Devi essere loggato per collegare Google.', 'var(--red)'); return; }

    try {
        const response = await window.googleFetchWithAuthRetry(`${window.API_BASE_URL}/api/google?action=auth-url`, {
            method: 'POST',
            headers: getSessionHeaders(),
            body: JSON.stringify({ userId })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.success || !data?.url) throw new Error(data?.error || 'Autorizzazione Google fallita');
        window.location.href = data.url;
    } catch (err) {
        console.error('Google auth-url error:', err);
        showToast(err.message || 'Errore collegamento Google', 'var(--red)');
    }
};

window.syncGoogleCalendar = async function () {
    const btn = event?.currentTarget;
    const originalHtml = btn?.innerHTML || '';
    try {
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ph-bold ph-circle-notch ph-spin"></i> Aggiornamento...'; }
        const userId = window.getUserId();
        const session = JSON.parse(localStorage.getItem('argo_session') || '{}');
        // La password è salvata come base64 in storedPass
        let password = '';
        try {
            if (session.storedPass) password = decodeURIComponent(escape(atob(session.storedPass)));
        } catch (e) { console.warn('Decode storedPass failed'); }
        const fullSession = { ...session, password };
        // NON inviamo state.tasks: forziamo il server a scaricare i compiti aggiornati da Argo
        const res = await fetch(`${window.API_BASE_URL}/api/google?action=sync`, {
            method: 'POST',
            headers: getSessionHeaders(),
            body: JSON.stringify({ userId, session: fullSession })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`✅ Sincronizzati ${data.added || 0} nuovi compiti su Google Calendar!`, 'var(--green)');
        } else {
            throw new Error(data.error || 'Sync fallito');
        }
    } catch (err) {
        console.error('Google Sync Error:', err);
        showToast(err.message || 'Errore durante il sync', 'var(--red)');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }
    }
};

window.disconnectGoogle = async function () {
    try {
        const userId = window.getUserId();
        const res = await fetch(`${window.API_BASE_URL}/api/google?action=disconnect&userId=${encodeURIComponent(userId)}`, {
            method: 'GET',
            headers: getSessionHeaders()
        });
        const data = await res.json();
        if (data.success) {
            state.googleConnected = false;
            showToast('Google Calendar disconnesso.', 'var(--orange)');
            window.scheduleRender();
        }
    } catch (e) { showToast('Errore disconnessione Google', 'var(--red)'); }
};

window.checkGoogleStatus = async function () {
    try {
        const userId = window.getUserId();
        if (!userId || userId === 'guest') return;
        const res = await window.googleFetchWithAuthRetry(`${window.API_BASE_URL}/api/google?action=status&userId=${encodeURIComponent(userId)}`, {
            method: 'GET',
            headers: getSessionHeaders()
        });
        const data = await res.json();
        state.googleConnected = data.connected || false;
        // State updated silently — profile view reads state.googleConnected on navigation
        // No full re-render needed (eliminates double render on boot)
    } catch (e) { state.googleConnected = false; }
};

window.saveArgoToSupabase = async function () {
    try {
        const session = JSON.parse(localStorage.getItem('argo_session') || '{}');
        const userId = window.getUserId();
        if (!userId || userId === 'guest' || !session.userName) return;

        // Decodifica password obbligatoria
        let password = '';
        try {
            if (session.storedPass) password = decodeURIComponent(escape(atob(session.storedPass)));
        } catch (e) {
            console.warn('Decode storedPass failed in saveArgoToSupabase');
            return;
        }

        await fetch(`${window.API_BASE_URL}/api/google?action=save-argo`, {
            method: 'POST',
            headers: getSessionHeaders(),
            body: JSON.stringify({
                userId,
                schoolCode: session.schoolCode,
                username: session.userName || session.username,
                password: password
            })
        });
        console.log('✅ Credenziali Argo salvate per sync background');
    } catch (e) {
        console.error('Errore salvataggio Argo su Supabase:', e);
    }
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
function isGiustifica(val) {
    if (!val && val !== 0) return true;
    const s = val.toString().replace(',', '.').trim();
    return s === '' || s === '-' || s === '—' || isNaN(parseFloat(s));
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
function parseLocalDate(dateStr) {
    const parts = (dateStr || '').split('-');
    if (parts.length !== 3) return new Date(NaN);
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
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
            <div class="modal-overlay active" onclick="closeModal(event)" style="position:fixed;top:0;left:0;right:0;bottom:0;z-index:99990;background:rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);">
                <div class="modal-content ${className}" onclick="event.stopPropagation()" style="position:relative;z-index:99991;max-height:90vh;overflow-y:auto;width:calc(100% - 32px);">
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
function showToast(message, type) {
    const existing = document.getElementById('g-toast');
    if (existing) existing.remove();

    const bgColor = type === 'warning' ? '#FF9500' : type === 'error' ? '#FF3B30' : 'var(--blue)';
    const icon = type === 'warning' ? 'ph-warning' : type === 'error' ? 'ph-x-circle' : 'ph-check-circle';

    const toast = document.createElement('div');
    toast.id = 'g-toast';
    toast.style = `
                position: fixed;
                bottom: 160px;
                left: 50%;
                transform: translateX(-50%);
                background: ${bgColor};
                color: white;
                padding: 12px 24px;
                border-radius: 50px;
                font-weight: 700;
                font-size: 14px;
                z-index: 9999;
                box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                animation: toastPop 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
            `;
    toast.innerHTML = `<i class="ph-bold ${icon}" style="margin-right:8px;"></i>` + message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(20px)';
        toast.style.transition = 'all 0.4s ease-in';
        setTimeout(() => toast.remove(), 400);
    }, type === 'warning' ? 4000 : 1800);
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
    const shortName = getSafeUserName();

    return `
        <!-- ── TOPBAR V6 ──────────────────────────────────────────── -->
        <div class="topbar" style="background: var(--bg-body); border-bottom: 1px solid var(--border-light); height: 56px; display: flex; align-items: center; justify-content: space-between; padding: 0 28px; position: sticky; top: 0; z-index: 1000; backdrop-filter: blur(20px);">
          
          <div class="logo" style="font-size: 18px; font-weight: 800; color: var(--text-primary); letter-spacing: -0.03em;"></div>

          <div class="nav-pills" style="display: flex; gap: 4px; background: rgba(0,0,0,0.04); padding: 4px; border-radius: 12px;">
            <button class="nav-pill ${state.view === 'home' ? 'active' : ''}" onclick="navigate('home')" style="border:none; border-radius: 8px; padding: 6px 16px; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.2s; background: ${state.view === 'home' ? 'white' : 'transparent'}; color: ${state.view === 'home' ? 'black' : 'var(--text-dim)'}; box-shadow: ${state.view === 'home' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none'};">Panoramica</button>
            <button class="nav-pill ${state.view === 'planner' ? 'active' : ''}" onclick="navigate('planner')" style="border:none; border-radius: 8px; padding: 6px 16px; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.2s; background: ${state.view === 'planner' ? 'white' : 'transparent'}; color: ${state.view === 'planner' ? 'black' : 'var(--text-dim)'}; box-shadow: ${state.view === 'planner' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none'};">Agenda</button>
            <button class="nav-pill ${state.view === 'voti' ? 'active' : ''}" onclick="navigate('voti')" style="border:none; border-radius: 8px; padding: 6px 16px; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.2s; background: ${state.view === 'voti' ? 'white' : 'transparent'}; color: ${state.view === 'voti' ? 'black' : 'var(--text-dim)'}; box-shadow: ${state.view === 'voti' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none'};">Voti</button>
            <button class="nav-pill ${state.view === 'circolari' ? 'active' : ''}" onclick="navigate('circolari')" style="border:none; border-radius: 8px; padding: 6px 16px; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.2s; background: ${state.view === 'circolari' ? 'white' : 'transparent'}; color: ${state.view === 'circolari' ? 'black' : 'var(--text-dim)'}; box-shadow: ${state.view === 'circolari' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none'};">Circolari</button>
          </div>

          <nav class="mobile-dock" aria-label="Navigazione principale">
              <button class="dock-item ${state.view === 'home' ? 'dock-active' : ''}" onclick="navigate('home')" aria-label="Panoramica">
                  <i class="${state.view === 'home' ? 'ph-fill ph-house' : 'ph ph-house'}"></i>
                  <span>Home</span>
              </button>
              <button class="dock-item ${state.view === 'planner' ? 'dock-active' : ''}" onclick="navigate('planner')" aria-label="Agenda">
                  <i class="${state.view === 'planner' ? 'ph-fill ph-calendar-dots' : 'ph ph-calendar-dots'}"></i>
                  <span>Agenda</span>
              </button>
              <button class="dock-item ${state.view === 'voti' ? 'dock-active' : ''}" onclick="navigate('voti')" aria-label="Voti">
                  <i class="${state.view === 'voti' ? 'ph-fill ph-chart-line-up' : 'ph ph-chart-line-up'}"></i>
                  <span>Voti</span>
              </button>
              <button class="dock-item ${state.view === 'circolari' ? 'dock-active' : ''}" onclick="navigate('circolari')" aria-label="Circolari">
                  <i class="${state.view === 'circolari' ? 'ph-fill ph-megaphone' : 'ph ph-megaphone'}"></i>
                  <span>Circolari</span>
              </button>
          </nav>

          <div class="topbar-right" style="display: flex; align-items: center; gap: 24px;">
            <span id="topbar-clock" class="time-chip" style="font-size: 13px; font-weight: 700; color: var(--text-dim); font-variant-numeric: tabular-nums;">
                ${new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        </div>`;
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

    const domaniCard = document.getElementById('domani-task-list');
    if (domaniCard) {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = getLocalDateString(tomorrow);
        const tomorrowTasks = (state.tasks || []).filter(t => {
            if (t.id && t.id.startsWith('ai_')) return false;
            if (t.subject === 'QUEST') return false;
            // `isExam` items are verifiche: calendar-only, never in "Domani"/task lists.
            if (t.isExam) return false;
            const plannedTmrw = (state.plannedTasks && state.plannedTasks[tomorrowStr]) || [];
            return t.due_date === tomorrowStr || plannedTmrw.includes(t.id);
        });

        tomorrowTasks.forEach(t => {
            const cb = domaniCard.querySelector(`[data-task-toggle="${t.id}"]`);
            const txt = domaniCard.querySelector(`[data-task-text="${t.id}"]`);
            if (cb) {
                cb.style.background = t.done ? '#141414' : '#fff';
                cb.style.borderColor = t.done ? '#141414' : '#DEDAD4';
                cb.innerHTML = t.done ? '<svg width="8" height="5" viewBox="0 0 8 5"><path d="M1 2.5L3 4.5L7 1" stroke="white" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>' : '';
            }
            if (txt) {
                txt.style.textDecoration = t.done ? 'line-through' : 'none';
                txt.style.color = t.done ? '#C8C4BE' : '#141414';
            }
        });
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
        'RELIGIONE': 'REL', 'EDUCAZIONE FISICA': 'SCM', 'SCIENZE MOTORIE': 'SCM', 'INFORMATICA': 'INF',
        'DIRITTO': 'DIR', 'ECONOMIA': 'ECO', 'FRANCESE': 'FRA', 'TEDESCO': 'TED', 'SPAGNOLO': 'SPA',
        'FILOSOFIA E STORIA': 'STO', 'MATEMATICA E FISICA': 'MAT', 'SCIENZE NATURALI': 'SCI',
        'LINGUA E LETTERATURA ITALIANA': 'ITA', 'LINGUA E CULTURA LATINA': 'LAT',
        // DidUp long-form names
        'LINGUA E LETT. ITALIANA': 'ITA', 'LINGUA E LETTER. ITALIANA': 'ITA',
        'LINGUA E CULTURA STRANIERA': 'ING', 'LINGUA STRANIERA': 'ING',
        'MATEM. CON INFORMATICA': 'MAT', 'MATEMATICA CON INFORMATICA': 'MAT',
        'SCIENZE NAT. CHIM. BIO.': 'SCI', 'SC. NATURALI': 'SCI',
        'DISEGNO E STORIA DELL\'ARTE': 'ART', 'STORIA DELL\'ARTE': 'ART',
        'SCIENZE MOTORIE E SPORTIVE': 'SCM', 'SC. MOTORIE E SPORTIVE': 'SCM',
        'GRECO': 'GRC', 'LATINO': 'LAT', 'LINGUA E CULTURA GRECA': 'GRC',
        'GEOSTORIA': 'STO', 'STORIA E GEOGRAFIA': 'STO',
        'IRC': 'REL', 'ED.CIVICA': 'CIV', 'EDUCAZIONE CIVICA': 'CIV'
    };
    const key = cleanSubj.toUpperCase().trim();
    console.log(`[Debug] Matching subject: "${key}"`);

    if (abbrevs[key]) return abbrevs[key];
    for (let [full, short] of Object.entries(abbrevs)) {
        if (key.includes(full)) {
            console.log(`[Debug] Partial match: "${full}" -> ${short}`);
            return short;
        }
    }
    // Fallback smart
    if (key.includes('MATEM')) return 'MAT';
    if (key.includes('FISIC')) return 'FIS';
    if (key.includes('ITALIA')) return 'ITA';
    if (key.includes('INGLE')) return 'ING';
    if (key.includes('LATIN')) return 'LAT';
    if (key.includes('GREC')) return 'GRC';
    if (key.includes('FILOS')) return 'FIL';
    if (key.includes('STORI')) return 'STO';
    if (key.includes('SCIEN')) return 'SCI';
    if (key.includes('DISEG')) return 'DIS';
    if (key.includes('RELIG')) return 'REL';
    if (key.includes('FRANC')) return 'FRA';
    if (key.includes('TEDES')) return 'TED';
    if (key.includes('SPAGN')) return 'SPA';
    if (key.includes('INFOR')) return 'INF';
    if (key.includes('CHIMI')) return 'CHI';

    console.warn(`[Debug] No match for: "${key}", using fallback.`);
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

    // Prepare verifiche by date for quick lookup
    const todayISO = getLocalDateString(today);
    const verificheByDate = {};
    (state.verifiche || []).forEach(v => {
        const dateKey = v.data || '';
        if (!dateKey) return;
        if (!verificheByDate[dateKey]) verificheByDate[dateKey] = [];
        verificheByDate[dateKey].push({ subject: v.materia || v.subject || '', text: v.text || '', tipo: v.tipo || '' });
    });
    (state.manualVerifiche || []).forEach(v => {
        const dateKey = v.date || '';
        if (!dateKey) return;
        if (!verificheByDate[dateKey]) verificheByDate[dateKey] = [];
        verificheByDate[dateKey].push({ subject: v.subject || '', text: v.args || '', tipo: v.type || '' });
    });

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

    const tempDate = new Date(startDate);
    for (let i = 0; i < 14; i++) {
        const dateStr = getLocalDateString(tempDate);
        const isToday = dateStr === todayISO;
        const isPast = tempDate < today && !isToday;

        let dayTasks = [];
        if (state.plannerMode === 'registro') {
            // Badge based on DUE DATE - Show all except AI, manual quests and exams
            dayTasks = (state.tasks || []).filter(t => !t.id.startsWith('ai_') && t.subject !== 'QUEST' && !t.isExam && t.due_date === dateStr);
        } else {
            // Badge based on PLANNED DATE
            const plannedIds = state.plannedTasks[dateStr] || [];
            dayTasks = (state.tasks || []).filter(t => plannedIds.includes(t.id) && !t.isExam);
        }

        const dayVerifiche = verificheByDate[dateStr] || [];

        html += `
                    <div class="calendar-day ${isToday ? 'today' : ''} ${isPast ? 'past' : ''}" 
                         onclick="${isPast ? '' : `handleDayClick('${dateStr}')`}">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px;">
                            <div class="day-number">${tempDate.getDate()}</div>
                            ${isToday ? `<div style="width:5px; height:5px; border-radius:50%; background:#007AFF; margin-top:4px;"></div>` : ''}
                        </div>
                        <div class="day-events">
                            ${dayVerifiche.slice(0, 2).map(v => {
            const color = getSubjectColor(v.subject);
            const abbrev = getSubjectAbbrev(v.subject);
            return `<div class="event-badge" aria-label="Verifica ${escapeHtml(v.subject || '')}" style="background:${color}; outline:2px solid rgba(255,159,10,0.6); outline-offset:-1px;" title="${escapeHtml(v.tipo + (v.text ? ': ' + v.text : ''))}">${abbrev}✏</div>`;
        }).join('')}
                            ${dayTasks.slice(0, Math.max(0, 3 - dayVerifiche.length)).map(t => {
            const color = getSubjectColor(t.subject);
            const abbrev = getSubjectAbbrev(t.subject);
            return `<div class="event-badge ${t.done ? 'done' : ''}" style="background: ${color}">${abbrev}</div>`;
        }).join('')}
                            ${(dayVerifiche.length + dayTasks.length) > 3 ? `<div class="more-events">+${dayVerifiche.length + dayTasks.length - 3}</div>` : ''}
                       </div>
                   </div>
                `;
        tempDate.setDate(tempDate.getDate() + 1);
    }

    html += `</div></div>`;

    // Build 7-day task list below calendar (Mon-Sun of displayed first week)
    const listHtml = renderCalendarWeekList(startDate);
    calendarEl.innerHTML = html + listHtml;
    if (typeof animatePlannerSurface === 'function') animatePlannerSurface('calendar');
}

function renderCalendarWeekList(weekStart) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = getLocalDateString(today);

    const dayNames = ['LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB', 'DOM'];
    const monthNames = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SET", "OTT", "NOV", "DIC"];

    // Prepare verifiche by date
    const verificheByDate = {};
    (state.verifiche || []).forEach(v => {
        const dateKey = v.data || '';
        if (!dateKey) return;
        if (!verificheByDate[dateKey]) verificheByDate[dateKey] = [];
        verificheByDate[dateKey].push({ subject: v.materia || v.subject || '', text: v.text || v.descrizione || '', tipo: v.tipo || '', isVerifica: true });
    });
    (state.manualVerifiche || []).forEach(v => {
        const dateKey = v.date || '';
        if (!dateKey) return;
        if (!verificheByDate[dateKey]) verificheByDate[dateKey] = [];
        verificheByDate[dateKey].push({ subject: v.subject || '', text: v.args || '', tipo: v.type || '', isVerifica: true });
    });

    let hasAny = false;
    let rows = '';

    for (let i = 0; i < 7; i++) {
        const dayDate = new Date(weekStart);
        dayDate.setDate(weekStart.getDate() + i);
        const dateStr = getLocalDateString(dayDate);
        const isToday = dateStr === todayISO;
        const isPast = dayDate < today && !isToday;

        // Get tasks for this day
        let dayTasks = [];
        if (state.plannerMode === 'registro') {
            dayTasks = (state.tasks || []).filter(t => !t.id.startsWith('ai_') && t.subject !== 'QUEST' && !t.isExam && t.due_date === dateStr);
        } else {
            const plannedIds = state.plannedTasks[dateStr] || [];
            dayTasks = (state.tasks || []).filter(t => plannedIds.includes(t.id) && !t.isExam);
        }
        const dayVerifiche = verificheByDate[dateStr] || [];

        if (dayTasks.length === 0 && dayVerifiche.length === 0) continue;
        hasAny = true;

        rows += `
            <div style="display:grid; grid-template-columns:52px 1fr; gap:0; border-top:1px solid #ECEAE6; padding:14px 0;">
                <div style="display:flex; flex-direction:column; align-items:center; padding-top:2px;">
                    <span style="font-family:'JetBrains Mono',monospace; font-size:9px; font-weight:800; color:${isToday ? '#7C3AED' : isPast ? '#C0BBB4' : '#908C86'}; text-transform:uppercase; letter-spacing:0.1em;">${dayNames[i]}</span>
                    <span style="font-family:'JetBrains Mono',monospace; font-size:22px; font-weight:800; color:${isToday ? '#7C3AED' : isPast ? '#C0BBB4' : '#141414'}; line-height:1.1; letter-spacing:-0.04em;">${dayDate.getDate()}</span>
                    <span style="font-family:'JetBrains Mono',monospace; font-size:9px; color:${isPast ? '#C0BBB4' : '#908C86'}; font-weight:600;">${monthNames[dayDate.getMonth()]}</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:6px; padding-left:12px;">
                    ${dayVerifiche.map(v => {
            const abbr = getSubjectAbbrev(v.subject);
            const key = abbr.toLowerCase();
            return `
                        <div style="display:flex; align-items:center; gap:8px; padding:8px 12px; background:rgba(255,159,10,0.06); border-radius:10px; border:1px solid rgba(255,159,10,0.18);">
                            <span style="font-family:'JetBrains Mono',monospace; font-size:9px; font-weight:800; background:var(--${key},#FFF3E0); color:var(--${key}-t,#B45309); padding:2px 7px; border-radius:5px; flex-shrink:0; text-transform:uppercase;">${abbr}</span>
                            <span style="font-family:'JetBrains Mono',monospace; font-size:8px; font-weight:700; color:#D97706; text-transform:uppercase; letter-spacing:0.08em; flex-shrink:0;">✏ ${escapeHtml(v.tipo || 'VERIFICA')}</span>
                            <span style="font-size:12px; font-weight:600; color:#141414; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(v.text || v.subject)}</span>
                        </div>`;
        }).join('')}
                    ${dayTasks.map(t => {
            const abbr = getSubjectAbbrev(t.subject);
            const key = abbr.toLowerCase();
            const displayText = (t.text || '').replace(/^\[AI\]\s*/i, '').replace(/\*/g, '').trim();
            return `
                        <div style="display:flex; align-items:center; gap:8px; padding:8px 12px; background:${t.done ? 'rgba(0,0,0,0.02)' : '#FFFFFF'}; border-radius:10px; border:1px solid ${t.done ? '#EDEBE7' : 'rgba(0,0,0,0.06)'}; opacity:${isPast && !t.done ? 0.6 : 1}; cursor:pointer;" onclick="toggleTask('${t.id}')">
                            <div data-task-toggle="${t.id}" style="width:15px; height:15px; border:1.5px solid ${t.done ? '#6366F1' : '#D1CEC8'}; border-radius:4px; flex-shrink:0; display:flex; align-items:center; justify-content:center; background:${t.done ? '#6366F1' : '#fff'}; transition:all 0.15s; cursor:pointer;">
                                ${t.done ? '<svg width="8" height="5" viewBox="0 0 8 5"><path d="M1 2.5L3 4.5L7 1" stroke="white" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>' : ''}
                            </div>
                            <span style="font-family:'JetBrains Mono',monospace; font-size:9px; font-weight:800; background:var(--${key},#F0F0F3); color:var(--${key}-t,#555); padding:2px 7px; border-radius:5px; flex-shrink:0;">${abbr}</span>
                            <span data-task-text="${escapeHtml(t.id)}" style="font-size:12px; font-weight:600; color:${t.done ? '#C8C4BE' : '#141414'}; flex:1; ${t.done ? 'text-decoration:line-through;' : ''} white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(displayText)}</span>
                        </div>`;
        }).join('')}
                </div>
            </div>`;
    }

    if (!hasAny) return '';

    return `<div style="margin-top:20px; background:#FFFFFF; border-radius:18px; border:1px solid #ECEAE6; overflow:hidden;">
        <div style="padding:14px 18px 8px; font-family:'JetBrains Mono',monospace; font-size:9px; font-weight:800; color:#908C86; text-transform:uppercase; letter-spacing:0.14em;">// AGENDA SETTIMANALE</div>
        <div style="padding:0 18px 6px;">${rows}</div>
    </div>`;
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
            
            <h1 style="font-size: 32px; font-weight: 800; margin: 0;"></h1>
            <p style="color: var(--text-secondary); font-size: 16px; margin: 8px 0 40px 0; max-width: 280px;">Il compagno di studio definitivo per gli studenti del Gandhi.</p>
            
            <div style="width: 100%; max-width: 320px; display: flex; flex-direction: column; gap: 16px;">
                <button class="btn-primary" onclick="openArgoLogin()" style="width: 100%; height: 52px; font-size: 16px;">
                    <i class="ph-bold ph-sign-in"></i> Accedi con DidUP
                </button>
                
                ${hasSession ? `
                <div style="padding: 20px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: 16px; margin-top: 12px;">
                    <div style="font-size: 11px; font-weight: 800; color: var(--text-dim); text-transform: uppercase;">Sessione salvata</div>
                    <div style="font-size: 15px; font-weight: 700; margin: 4px 0 16px 0;">${escapeHtml(state.user?.name || 'Utente')}</div>
                    <button onclick="logout()" style="width: 100%; height: 40px; border-radius: 10px; background: rgba(239, 68, 68, 0.05); border: 1px solid rgba(239, 68, 68, 0.1); color: var(--red); font-size: 13px; font-weight: 700; cursor: pointer;">
                        Usa altro account
                    </button>
                </div>
                ` : ''}
            </div>
        </div>`;
}

// ================================================================
// G-CONNECT — renderHome() PATCH v6
// ================================================================

function renderHome() {
    const todayStr = getLocalDateString();
    const today = new Date(); today.setHours(0, 0, 0, 0);

    // Media
    const mediaStr = calcolaMedia(state.voti) || '0';
    const media = parseFloat(mediaStr);

    // Greeting
    const h = new Date().getHours();
    const days = ['Domenica', 'Lun\xecdì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
    const period = h < 5 ? 'NOTTE' : h < 12 ? 'MATTINA' : h < 17 ? 'POMERIGGIO' : 'SERA';
    const greeting = h < 5 ? 'Buonanotte' : h < 12 ? 'Buongiorno' : h < 17 ? 'Buon pomeriggio' : 'Buona sera';
    const quote = (typeof getDailyQuote === 'function' ? getDailyQuote() : '') || getMotivationalFallback();
    const shortName = getSafeUserName();
    const dayOfWeek = days[new Date().getDay()].toUpperCase();

    // Streak dots
    const streak = state.streak || 0;
    const streakDots = [...Array(7)].map((_, i) => {
        const isLast = i === 6;
        const filled = i < streak;
        const bg = isLast && filled ? 'background:#2DB86A' : filled ? 'background:#141414' : 'background:#F0EDE8';
        return `<div class="sdot ${filled ? 'on' : ''} ${isLast ? 'today' : ''}" style="width:8px;height:8px;border-radius:50%;${bg}"></div>`;
    }).join('');

    // Prossima verifica (scraped from DidUp) — carousel
    const todayISO = getLocalDateString(today);
    const allVerifiche = (state.verifiche || [])
        .filter(v => v.data && v.data >= todayISO)
        .sort((a, b) => a.data.localeCompare(b.data));
    // Manual Verifiche from dedicated database table
    const manualExams = (state.manualVerifiche || [])
        .filter(v => !v.done && v.date && v.date >= todayISO)
        .map(v => ({ materia: v.subject, data: v.date, text: v.args, tipo: v.type, source: 'manual', id: v.id }));

    const combined = [...allVerifiche, ...manualExams];
    const seen = new Set();
    const allUpcoming = combined.filter(v => {
        const key = `${v.data}||${(v.materia || '').toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).sort((a, b) => a.data.localeCompare(b.data));

    // Carousel index
    if (typeof window._verificheIdx === 'undefined') window._verificheIdx = 0;
    if (window._verificheIdx >= allUpcoming.length) window._verificheIdx = 0;
    const vIdx = window._verificheIdx;
    const currentVerifica = allUpcoming[vIdx] || null;
    const daysToExam = currentVerifica ? Math.ceil((parseLocalDate(currentVerifica.data) - today) / 86400000) : null;
    const examAbbr = currentVerifica ? getSubjectAbbrev(currentVerifica.materia) : 'N/D';
    const examKey = examAbbr.toLowerCase();
    const examTipo = currentVerifica?.tipo || 'unknown';
    const examTipoLabel = examTipo === 'scritta' ? 'SCRITTA' : examTipo === 'orale' ? 'ORALE' : '';
    const verificheCount = allUpcoming.length;

    // Ultima circolare
    const lastCirc = (state.circolari && state.circolari.length > 0)
        ? state.circolari[0]
        : { data: '--/--/----', titolo: 'Nessuna circolare', id: null };

    // Presenze (from real assenzeData)
    const ad = state.assenzeData || {};
    const totAssenze = ad.totaleAssenze || 0;
    const totRitardi = ad.totaleRitardi || 0;
    const totUscite = ad.totaleUscite || 0;
    const oreAssenza = ad.oreAssenzaTotali || 0;
    const presenze = totAssenze > 0
        ? Math.max(0, Math.round((1 - totAssenze / (state.giorniScuola || 200)) * 100))
        : (state.assenze != null ? Math.round((1 - state.assenze / (state.giorniScuola || 200)) * 100) : 94);

    // Voti recenti (ultimi 6, ordinati per data decrescente)
    const recentGrades = (state.voti || [])
        .filter(v => v.data || v.date)
        .sort((a, b) => (b.data || b.date || '').localeCompare(a.data || a.date || ''))
        .slice(0, 6);

    // Task di domani
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = getLocalDateString(tomorrow);
    const tomorrowTasks = (state.tasks || []).filter(t => {
        if (t.id && t.id.startsWith('ai_')) return false;
        if (t.subject === 'QUEST') return false;
        if (t.isExam) return false;
        const plannedTmrw = (state.plannedTasks && state.plannedTasks[tomorrowStr]) || [];
        return t.due_date === tomorrowStr || plannedTmrw.includes(t.id);
    });

    // Media delta vs mese scorso
    const prevMedia = state.lastMedia || media;
    const delta = (media - prevMedia).toFixed(2);
    const deltaStr = delta > 0 ? `\u2191 +${delta}` : delta < 0 ? `\u2193 ${delta}` : '';
    const deltaColor = delta >= 0 ? 'var(--ing-t, #1A6B3A)' : 'var(--lat-t, #8A1A1A)';

    return `
    <div class="dashboard view" style="width: 100%;">

      <!-- ROW 1: Greeting · Prossima Verifica (Expanded) -->
      <div class="home-grid-row" style="display:grid; grid-template-columns:1fr 320px; gap:14px; margin-bottom:16px;">
        <div class="card greeting-card" onclick="navigate('profile')" style="cursor:pointer; background:linear-gradient(135deg, #0D1F2D 0%, #1A6B8A 45%, #C6F2DF 100%); border:none; border-radius:18px; padding:18px 22px; display:flex; flex-direction:column; justify-content:center; box-shadow:0 2px 12px rgba(0,0,0,0.15); position:relative;">
          <button onclick="event.stopPropagation(); if(confirm('Aggiornare la pagina ora?')) window.location.reload();" title="Aggiorna pagina" aria-label="Aggiorna pagina" style="position:absolute; top:10px; right:10px; width:28px; height:28px; border-radius:9px; border:1px solid rgba(255,255,255,0.2); background:rgba(255,255,255,0.15); color:rgba(255,255,255,0.8); display:flex; align-items:center; justify-content:center; cursor:pointer;">
            <i class="ph-bold ph-arrow-clockwise" style="font-size:14px;"></i>
          </button>
          <div class="greeting-period" style="font-family:'JetBrains Mono',monospace; font-size:10px; color:rgba(255,255,255,0.7); font-weight:700; letter-spacing:0.05em; text-transform:uppercase; margin-bottom:6px;">${dayOfWeek} &middot; ${period}</div>
          <div class="greeting-text" style="font-size:19px; font-weight:700; color:#ffffff; letter-spacing:-0.03em; line-height:1.2;">${greeting}, ${shortName}.</div>
          <div class="greeting-quote" style="font-size:14px; color:rgba(255,255,255,0.7); font-style:italic; line-height:1.6; margin-top:8px;">&ldquo;${quote}&rdquo;</div>
        </div>
 
        <div id="widget-verifiche" class="card verifica-card" onclick="mostraVerificheModal()" style="cursor:pointer; border-radius:18px; padding:16px 18px; display:flex; flex-direction:column; position:relative; height: 154px; overflow: hidden;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <div style="font-size:8px; color:#BCB8B2; letter-spacing:0.12em; text-transform:uppercase; font-family:'JetBrains Mono',monospace;">VERIFICHE</div>
            <div style="display:flex; gap:4px;">
              ${verificheCount > 1 ? `
              <button onclick="event.stopPropagation(); window._navVerifica(-1)" style="width:20px; height:20px; border-radius:50%; border:1px solid #E0DDD8; background:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:10px; color:#908C86; padding:0;">‹</button>
              <button onclick="event.stopPropagation(); window._navVerifica(1)" style="width:20px; height:20px; border-radius:50%; border:1px solid #E0DDD8; background:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:10px; color:#908C86; padding:0;">›</button>
              ` : ''}
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom:5px;">
            <span id="vw-abbr" style="display:inline-flex; background:var(--${examKey},var(--mat)); color:var(--${examKey}-t,var(--mat-t)); border-radius:7px; padding:3px 9px; font-family:'JetBrains Mono',monospace; font-size:10px; font-weight:500;">${examAbbr}</span>
            <span id="vw-tipo" style="font-family:'JetBrains Mono',monospace; font-size:8px; color:#BCB8B2; text-transform:uppercase;">${examTipoLabel}</span>
            <span id="vw-counter" style="font-family:'JetBrains Mono',monospace; font-size:8px; color:#BCB8B2; margin-left:auto;">${verificheCount > 1 ? `${vIdx + 1}/${verificheCount}` : ''}</span>
          </div>
          <div id="vw-desc" style="font-size:12px; font-weight:600; color:#141414; line-height:1.3; margin-bottom:6px; height:32px; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${currentVerifica ? escapeHtml((currentVerifica.text || '').substring(0, 45)) : 'Nessuna verifica'}</div>
          <div style="display:flex; align-items:baseline; gap:4px; margin-top:auto;"><span id="vw-days" style="font-size:30px; font-weight:700; color:#141414; letter-spacing:-0.04em; line-height:1;">${daysToExam !== null ? daysToExam : '--'}</span><span style="font-size:11px; color:#908C86;">giorni</span></div>
          <div id="vw-bar" style="height:3px; background:#F0EDE8; border-radius:100px; margin-top:8px; overflow:hidden;">${currentVerifica ? `<div id="vw-bar-fill" style="height:100%; width:${Math.max(5, 100 - daysToExam * 8)}%; background:var(--${examKey}-dot,var(--mat-dot)); border-radius:100px;"></div>` : ''}</div>
        </div>
 
      </div>

      <!-- ROW 2: Media Voti · Presenze · Ultima Circolare -->
      <div class="home-grid-row" style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px; margin-bottom:16px;">

        <div class="card" onclick="navigate('voti')" style="cursor:pointer; border-radius:18px; padding:18px 22px; display:flex; flex-direction:column; justify-content:space-between;">
          <div>
            <div style="font-size:9px; color:#BCB8B2; letter-spacing:0.15em; text-transform:uppercase; font-family:'JetBrains Mono',monospace; margin-bottom:10px;">Media voti</div>
            <div style="font-size:42px; font-weight:700; color:#1A5F8A; letter-spacing:-0.05em; line-height:1;">${media ? media.toFixed(2) : '—'}</div>
            <div style="font-size:11px; color:#5A9EC0; margin-top:5px;">${deltaStr ? `${deltaStr} rispetto al mese scorso` : 'voti registrati: ' + (state.voti || []).length}</div>
          </div>
          <div style="height:3px; background:#F0EDE8; border-radius:100px; margin-top:14px; overflow:hidden;"><div style="height:100%; width:${Math.min(100, (media / 10) * 100)}%; background:#3B9DD4; border-radius:100px;"></div></div>
        </div>

        <div class="card" onclick="mostraAssenzeModal()" style="cursor:pointer; border-radius:18px; padding:18px 22px; display:flex; flex-direction:column; justify-content:space-between;">
          <div>
            <div style="font-size:8px; color:#BCB8B2; letter-spacing:0.12em; text-transform:uppercase; font-family:'JetBrains Mono',monospace; margin-bottom:8px;">ASSENZE</div>
            <div style="font-size:32px; font-weight:700; color:#8A1A1A; letter-spacing:-0.05em; line-height:1;">${((oreAssenza / ((state.giorniScuola || 200) * 5)) * 100).toFixed(2)}%</div>
            <div style="font-size:10px; color:#A64A4A; margin-top:4px;">${totAssenze} assenz${totAssenze === 1 ? 'a' : 'e'} (${oreAssenza.toFixed(2)}h)${totRitardi > 0 ? ` · ${totRitardi} ritard${totRitardi === 1 ? 'o' : 'i'}` : ''}${totUscite > 0 ? ` · ${totUscite} uscit${totUscite === 1 ? 'a' : 'e'}` : ''}</div>
          </div>
          <div style="height:3px; background:#F0EDE8; border-radius:100px; margin-top:12px; overflow:hidden;"><div style="height:100%; width:${Math.min(100, (oreAssenza / ((state.giorniScuola || 200) * 5)) * 100)}%; background:#EF4444; border-radius:100px;"></div></div>
        </div>

        <div class="card circ-widget" ${lastCirc.id ? `onclick="mostraCircolare('${lastCirc.id}')" style="cursor:pointer;"` : ''} style="border-radius:18px; padding:18px 22px; display:flex; flex-direction:column; justify-content:space-between;">
          <div>
            <div style="font-size:8px; color:#BCB8B2; letter-spacing:0.12em; text-transform:uppercase; font-family:'JetBrains Mono',monospace; margin-bottom:8px;">ULTIMA CIRCOLARE</div>
            <div style="font-family:'JetBrains Mono',monospace; font-size:10px; color:#C0BBB4; margin-bottom:4px;">${lastCirc.data}</div>
            <div style="font-size:14px; font-weight:600; color:#141414; line-height:1.35; letter-spacing:-0.01em;">${lastCirc.titolo}</div>
          </div>
          <span style="display:inline-flex; margin-top:14px; background:linear-gradient(135deg, #A78BFA 0%, #818CF8 100%); color:#fff; font-family:'JetBrains Mono',monospace; font-size:9px; border-radius:100px; padding:3px 9px; letter-spacing:0.05em; align-self:flex-start;">● nuova</span>
        </div>

      </div>

      <!-- ROW 3: Voti recenti · Task di oggi -->
      <div class="home-grid-row" style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">

        <div style="display:flex; flex-direction:column; min-height:0;">
          <div class="widget-header" style="display:flex; align-items:center; height:26px; margin-bottom:8px;">
            <div style="font-size:9px; color:#BCB8B2; letter-spacing:0.15em; text-transform:uppercase; font-family:'JetBrains Mono',monospace;">Voti Recenti</div>
          </div>
          <div class="card" ${recentGrades.length ? `onclick="navigate('voti')" style="cursor:pointer;"` : ''} style="border-radius:18px; padding:16px 18px; flex:1; display:flex; flex-direction:column; justify-content:space-between;">
            <div style="display:flex; flex-direction:column;">
            ${recentGrades.length ? recentGrades.slice(0, 6).map(v => {
        const subContent = v.materia || v.subject || 'N/A';
        const abbr = getSubjectAbbrev(subContent);
        const key = abbr.toLowerCase();
        const rawVal = v.valore || v.value || '';
        const giu = isGiustifica(rawVal);
        const val = giu ? 0 : parseFloat(rawVal);
        const valStr = giu ? 'GIU' : rawVal.toString();
        const pct = giu ? 0 : Math.min(100, (val / 10) * 100);
        return `
              <div style="display:flex; align-items:center; gap:9px; padding:6px 0; border-bottom:1px solid #F4F2EE;">
                <span style="font-family:'JetBrains Mono',monospace; font-size:9.5px; font-weight:500; border-radius:6px; padding:3px 6px; flex-shrink:0; width:34px; text-align:center; background:var(--${key},#EEE); color:var(--${key}-t,#333);">${abbr}</span>
                <div style="flex:1; height:3px; background:#F0EDE8; border-radius:100px; overflow:hidden;">
                  <div style="height:100%; width:${pct}%; background:var(--${key}-dot,#3B9DD4); border-radius:100px;"></div>
                </div>
                <span style="font-family:'JetBrains Mono',monospace; font-size:${giu ? '9' : '12.5'}px; font-weight:500; width:${giu ? '30' : '26'}px; text-align:right; color:${giu ? '#BCB8B2' : `var(--${key}-t,#333)`};">${valStr}</span>
              </div>`;
    }).join('') : '<div style="font-size:11px; color:#C0BBB4; padding:12px 0; text-align:center;">Nessun voto</div>'}
            </div>
          </div>
        </div>

        <div style="display:flex; flex-direction:column; min-height:0;">
          <div class="widget-header" style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; height:26px;">
            <div style="font-size:9px; color:#BCB8B2; letter-spacing:0.15em; text-transform:uppercase; font-family:'JetBrains Mono',monospace;">Domani</div>
            <button class="add-btn" onclick="showQuickAddTaskModal()" aria-label="Aggiungi nuova attività"><i class="ph-bold ph-plus" style="font-size:9px; margin-right:4px;"></i>ATTIVITÀ</button>
          </div>
          <div class="card" style="border-radius:18px; padding:16px 18px; overflow-y:auto;">
            ${tomorrowTasks.length ? tomorrowTasks.map(t => {
        const abbr = getSubjectAbbrev(t.subject);
        const key = abbr.toLowerCase();
        return `
              <div style="display:flex; align-items:center; gap:9px; padding:6px 0; border-bottom:1px solid #F4F2EE; cursor:pointer;" onclick="toggleTask('${t.id}')">
                <div data-task-toggle="${t.id}" style="width:17px; height:17px; border:1.5px solid ${t.done ? '#141414' : '#DEDAD4'}; border-radius:5px; flex-shrink:0; display:flex; align-items:center; justify-content:center; background:${t.done ? '#141414' : '#fff'}; transition:all 0.15s;">
                  ${t.done ? '<svg width="8" height="5" viewBox="0 0 8 5"><path d="M1 2.5L3 4.5L7 1" stroke="white" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>' : ''}
                </div>
                <span style="font-family:'JetBrains Mono',monospace; font-size:9px; font-weight:500; border-radius:5px; padding:2px 6px; flex-shrink:0; background:var(--${key},#EEE); color:var(--${key}-t,#444);">${abbr}</span>
                <span data-task-text="${escapeHtml(t.id)}" style="font-size:12.5px; font-weight:500; color:${t.done ? '#C8C4BE' : '#141414'}; flex:1; line-height:1.3; ${t.done ? 'text-decoration:line-through;' : ''} white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(t.text)}</span>
              </div>`;
    }).join('') : '<div style="font-size:11px; color:#C0BBB4; padding:10px 0; text-align:center;">Nessun compito per domani.</div>'}
          </div>
        </div>

      </div>
    </div>`;
}

function renderPlanner() {
    const cachedAgenda = getCachedWeeklyAgendaHtml();
    const listHtml = cachedAgenda || renderWeeklyAgenda();
    if (!cachedAgenda && listHtml) saveWeeklyAgendaCache(listHtml);
    return `
    <div class="dashboard view" style="width: 100%;">
        <div class="planner-content" style="padding: 16px 32px 40px; width: 100%; max-width: 1180px; margin: 0 auto; box-sizing: border-box;">
            <div class="planner-view-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px; border-bottom: 2px solid #E5E5EA; padding-bottom: 16px;">
                <h1 style="font-family: 'JetBrains Mono', monospace; font-size: 32px; font-weight: 800; letter-spacing: -0.05em; text-transform: uppercase; color: var(--text-primary);">Agenda & Compiti</h1>
                
                <div style="display: flex; gap: 16px; align-items: center;">
                    <!-- AI & Planning Buttons -->
                    <div style="display: flex; gap: 8px;">
                        <button onclick="navigate('ai_assistant')" style="height: 36px; padding: 0 12px; font-size: 11px; font-family: 'JetBrains Mono', monospace; font-weight: 800; text-transform: uppercase; background: #E8EEF7; color: #2A3F6A; border: none; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.2s;">
                            <i class="ph-bold ph-sparkle"></i> AI Chat
                        </button>
                        <button onclick="showPlanWeekModal()" style="height: 36px; padding: 0 12px; font-size: 11px; font-family: 'JetBrains Mono', monospace; font-weight: 800; text-transform: uppercase; background: #F0F0F3; color: var(--text-secondary); border: 1px solid #E5E5EA; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.2s;">
                            <i class="ph-bold ph-calendar-plus"></i> Pianifica
                        </button>
                    </div>

                    <div class="view-switch" style="background: rgba(0,0,0,0.06); padding: 4px; border-radius: 8px; display: flex; gap: 4px;">
                        <button class="switch-btn ${state.uiMode === 'calendar' ? 'active' : ''}" data-planner-view="calendar" onclick="switchPlannerView('calendar')" style="font-family: 'JetBrains Mono', monospace; padding: 6px 14px; border-radius: 6px; font-size: 11px; font-weight: 800; text-transform: uppercase; border: none; cursor: pointer; transition: all 0.2s; ${state.uiMode === 'calendar' ? 'background: #141414; color: white;' : 'background: transparent; color: var(--text-secondary);'}">Calendar</button>
                        <button class="switch-btn ${state.uiMode === 'list' ? 'active' : ''}" data-planner-view="list" onclick="switchPlannerView('list')" style="font-family: 'JetBrains Mono', monospace; padding: 6px 14px; border-radius: 6px; font-size: 11px; font-weight: 800; text-transform: uppercase; border: none; cursor: pointer; transition: all 0.2s; ${state.uiMode === 'list' ? 'background: #141414; color: white;' : 'background: transparent; color: var(--text-secondary);'}">List</button>
                    </div>
                    <button onclick="showAddRegistroTaskModal()" style="height: 36px; padding: 0 16px; font-size: 11px; font-family: 'JetBrains Mono', monospace; font-weight: 800; text-transform: uppercase; background: #FF9F0A; color: #141414; border: none; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: transform 0.2s; box-shadow: 0 2px 8px rgba(255,159,10,0.3);">
                        <i class="ph-bold ph-plus" style="font-size: 14px;"></i> Verifica
                    </button>
                </div>
            </div>

            <div id="planner-main-content" class="section-animate">
                ${state.uiMode === 'calendar' ? '<div id="calendar"></div>' : listHtml}
            </div>
        </div> 
    </div>
    ${state.uiMode === 'calendar' ? `<script>setTimeout(() => { if(typeof renderCustomCalendar === 'function') renderCustomCalendar(); if(typeof warmWeeklyAgendaCache === 'function') warmWeeklyAgendaCache(); }, 100);</script>` : ''}`;
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
function renderProfile() {
    const oauthHost = (() => {
        try { return new URL(API_BASE_URL).host; } catch (_) { return 'g-connect-backend-r5j1.vercel.app'; }
    })();
    return `
        <div class="view" style="width: 100%; max-width: 1180px; margin: 0 auto;">
            <div class="card" style="padding: 32px; display: flex; flex-direction: column; align-items: center; text-align: center; margin-bottom: 24px; border: 1px solid rgba(0,0,0,0.05); box-shadow: 0 10px 30px rgba(0,0,0,0.03);">
                <div>
                    <div style="font-size: 24px; font-weight: 800; color: var(--text-primary); letter-spacing: -0.02em;">${escapeHtml(state.user.name || 'Utente')}</div>
                    <div style="font-size: 13px; font-weight: 800; color: var(--accent); background: rgba(99, 102, 241, 0.08); padding: 6px 16px; border-radius: 20px; display: inline-block; margin-top: 10px; text-transform: uppercase; letter-spacing: 0.05em;">
                        CLASSE ${escapeHtml((normalizeClassUi(state.user.class) || '-') + (state.user.specialization ? ' ' + state.user.specialization : ''))}
                    </div>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 32px;">
                <!-- Connection Card -->
                <div class="card" style="padding: 24px; display: flex; flex-direction: column; align-items: center; text-align: center; justify-content: center; gap: 12px;">
                    <div style="width: 48px; height: 48px; border-radius: 14px; background: rgba(16, 185, 129, 0.1); display: flex; align-items: center; justify-content: center; color: var(--green);">
                        <i class="ph-fill ph-plugs-connected" style="font-size: 24px;"></i>
                    </div>
                    <div>
                        <div style="font-size: 11px; font-weight: 800; color: var(--text-dim); text-transform: uppercase;">Connessione DidUP</div>
                        <div style="font-size: 16px; font-weight: 800; color: ${state.didup.connected ? 'var(--green)' : 'var(--red)'}; margin-top: 2px;">
                            ${state.didup.connected ? 'COLLEGATO' : 'NON COLLEGATO'}
                        </div>
                    </div>
                    ${state.lastSync ? `<div style="font-size: 12px; color: var(--text-dim); font-weight: 500;">Ultimo Sync: ${state.lastSync}</div>` : ''}
                </div>

                <!-- Google Calendar Card (Universal OAuth2) -->
                <div class="card" style="padding: 24px; display: flex; flex-direction: column; align-items: center; text-align: center; justify-content: center; gap: 16px;">
                    <div style="width: 48px; height: 48px; border-radius: 14px; background: rgba(234, 67, 53, 0.1); display: flex; align-items: center; justify-content: center; color: #EA4335;">
                        <i class="ph-fill ph-calendar-check" style="font-size: 24px;"></i>
                    </div>
                    <div>
                        <div style="font-size: 11px; font-weight: 800; color: var(--text-dim); text-transform: uppercase;">Google Calendar</div>
                        <div style="font-size: 16px; font-weight: 800; color: var(--text-primary); margin-top: 2px;">
                            ${state.googleConnected ? 'Collegato ✓' : 'Non collegato'}
                        </div>
                    </div>
                    <div style="display: flex; flex-direction: column; width: 100%; gap: 8px;">
                    ${state.googleConnected ? `
                        <button class="btn-primary" onclick="window.syncGoogleCalendar()" style="height: 40px; font-size: 13px; gap: 8px; background: #EA4335; border: none; width: 100%; justify-content: center;">
                            <i class="ph-bold ph-arrows-clockwise"></i> Sincronizza Compiti
                        </button>
                        <button onclick="window.disconnectGoogle()" style="height: 36px; font-size: 12px; background: transparent; border: 1px solid rgba(234,67,53,0.3); color: #EA4335; border-radius: 10px; cursor: pointer; font-weight: 700; width: 100%; justify-content: center;">
                            <i class="ph-bold ph-sign-out"></i> Disconnetti Google
                        </button>
                    ` : `
                        <button class="btn-primary" onclick="window.connectGoogle()" style="height: 44px; font-size: 13px; gap: 8px; background: #EA4335; border: none; font-weight: 700; width: 100%; justify-content: center;">
                            <i class="ph-bold ph-google-logo"></i> Accedi con Google
                        </button>
                        <div style="width: 100%; text-align: left; margin-top: 4px; padding: 10px 12px; border-radius: 10px; background: rgba(234,67,53,0.06); border: 1px solid rgba(234,67,53,0.2);">
                            <div style="font-family: 'JetBrains Mono', monospace; font-size: 9px; font-weight: 800; color: #B42318; text-transform: uppercase; margin-bottom: 6px;">Info accesso Google</div>
                            <div style="font-size: 12px; line-height: 1.45; color: var(--text-secondary);">
                                1) Clicca <b>Accedi con Google</b>.<br>
                                2) Scegli il profilo Google e clicca <b>Continua</b>.<br>
                                3) Se compare “Google non ha verificato questa app”, clicca <b>Avanzate</b> (in basso a sinistra).<br>
                                4) Clicca <b>Apri ${escapeHtml(oauthHost)} (non sicura)</b> e completa l'accesso.
                            </div>
                            <div style="margin-top: 6px; font-size: 11px; color: var(--text-dim);">
                                Screenshot guida: <a href="https://github.com/user-attachments/assets/c2d6362b-c5bd-4f24-a949-ea78aa391032" target="_blank" rel="noopener noreferrer">1</a> · <a href="https://github.com/user-attachments/assets/043874a9-966e-43c6-99b3-aa8dccf4b32f" target="_blank" rel="noopener noreferrer">2</a> · <a href="https://github.com/user-attachments/assets/3c4a6068-32e6-4146-8356-efbb3fc16081" target="_blank" rel="noopener noreferrer">3</a>
                            </div>
                        </div>
                    `}
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
        const goal = state.goals?.[name] || 8.0;
        const projection = getGoalProjection(subMedia, goal, list.length);
        return { name, media: subMedia, count: list.length, trend, goal, projection };
    }).sort((a, b) => b.media - a.media);

    return `
    <div class="dashboard view" style="width: 100%;">
        <div class="planner-content" style="padding: 16px 32px 40px; width: 100%; max-width: 1180px; margin: 0 auto; box-sizing: border-box;">
            
            <!-- V6 HEADER -->
            <div style="margin-bottom: 32px; border-bottom: 2px solid #E5E5EA; padding-bottom: 16px;">
                <h1 style="font-family: 'JetBrains Mono', monospace; font-size: 32px; font-weight: 800; letter-spacing: -0.05em; text-transform: uppercase; color: var(--text-primary);">Voti & Rendimento</h1>
            </div>

            ${(() => {
            const count = votiData.length;
            const projection = getGoalProjection(media, goal, count);
            const alreadyDone = projection.done;
            const scenarios = projection.scenarios || [];
            const gap = projection.gap;

            let statusLine = '';
            let scenariosHtml = '';

            if (alreadyDone) {
                statusLine = `<span style="color:#2DB86A; font-weight:700; font-family:'JetBrains Mono',monospace; font-size:11px; text-transform:uppercase; letter-spacing:0.08em;">&#10003; Obiettivo raggiunto</span>`;
            } else {
                statusLine = `<span style="font-family:'JetBrains Mono',monospace; font-size:11px; color:rgba(255,255,255,0.45); text-transform:uppercase; letter-spacing:0.08em;">Gap: <strong style="color:white;">-${gap.toFixed(2)}</strong></span>`;
                if (scenarios.length > 0) {
                    scenariosHtml = scenarios.map(s => `
                            <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 10px; background:rgba(255,255,255,0.06); border-radius:10px; margin-top:6px;">
                                <div style="display:flex; flex-direction:column; gap:2px;">
                                    <span style="font-family:'JetBrains Mono',monospace; font-size:11px; color:rgba(255,255,255,0.5);">
                                        ${s.exact ? 'prossimo voto esatto' : s.n === 1 ? 'prossimo voto' : `prossimi ${s.n} voti`}
                                    </span>
                                    ${s.n > 10 ? `<span style="font-family:'JetBrains Mono',monospace; font-size:9px; color:#BCB8B2; text-transform:uppercase; letter-spacing:0.04em;">(Lungo termine)</span>` : ''}
                                </div>
                                <span style="font-family:'JetBrains Mono',monospace; font-size:13px; font-weight:800; color:white;">
                                     ${s.exact ? '' : '≥ '}${s.grade.toFixed(2)}
                                 </span>
                             </div>`).join('');
                } else {
                    // Se goal è > 10 o irraggiungibile anche con cento 10
                    const isImpossible = goal > 10;
                    scenariosHtml = `<div style="font-family:'JetBrains Mono',monospace; font-size:11px; color:rgba(255,255,255,0.4); margin-top:8px;">${isImpossible ? 'Obiettivo non raggiungibile' : 'Continua a registrare voti per vedere le proiezioni.'}</div>`;
                }
            }

            return `
                <div class="card" onclick="promptSetGoal('overall')" style="cursor:pointer; margin-bottom:40px; border-radius:18px; padding:24px; display:flex; align-items:flex-start; gap:24px; background:#121214; box-shadow:0 10px 30px rgba(0,0,0,0.15); transition:transform 0.2s;">
                    <div style="display:flex; gap:14px; align-items:flex-start; flex-shrink:0;">
                        <div style="width:44px; height:44px; border-radius:12px; background:rgba(255,255,255,0.07); display:flex; align-items:center; justify-content:center; font-size:22px; color:white; flex-shrink:0;">
                            <i class="ph-fill ph-target"></i>
                        </div>
                        <div>
                            <div style="font-family:'JetBrains Mono',monospace; font-size:9px; font-weight:800; color:rgba(255,255,255,0.35); text-transform:uppercase; letter-spacing:0.12em; margin-bottom:4px;">Obiettivo</div>
                            <div style="font-family:'JetBrains Mono',monospace; font-size:28px; font-weight:800; color:white; letter-spacing:-0.04em; line-height:1; display:flex; align-items:center; gap:6px;">
                                ${goal.toFixed(2)}<i class="ph ph-pencil-simple" style="font-size:14px; opacity:0.3;"></i>
                            </div>
                            <div style="margin-top:8px;">${statusLine}</div>
                        </div>
                    </div>
                    ${!alreadyDone ? `
                    <div style="flex:1; min-width:0;">
                        <div style="font-family:'JetBrains Mono',monospace; font-size:9px; font-weight:800; color:rgba(255,255,255,0.35); text-transform:uppercase; letter-spacing:0.12em; margin-bottom:2px;">Come arrivarci</div>
                        ${scenariosHtml}
                    </div>` : ''}
                </div>
                `;
        })()}

            <div style="margin-bottom: 24px;">
                <h2 style="font-family: 'JetBrains Mono', monospace; font-size: 14px; font-weight: 800; text-transform: uppercase; color: var(--text-dim); letter-spacing: 0.05em; display: flex; align-items: center; gap: 10px;">
                    <span style="flex:1; height:1px; background:#E5E5EA;"></span>
                    Riepilogo Materie
                    <span style="flex:1; height:1px; background:#E5E5EA;"></span>
                </h2>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px;">
                ${subjects.map(s => {
            const subMediaAbbr = getSubjectAbbrev(s.name).toLowerCase();
            const subjColor = `var(--${subMediaAbbr}-dot, var(--accent))`;
            const subjBg = `var(--${subMediaAbbr}, #F2F2F7)`;
            const subjText = `var(--${subMediaAbbr}-t, var(--text-primary))`;

            const encodedSubjectArg = encodeURIComponent(s.name || '');
            return `
                    <div class="card grade-subject-widget" style="padding: 18px; border-radius: 16px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 14px; border-left: 4px solid ${subjColor};" onclick="handleGradeSubjectClickFromEncoded('${encodedSubjectArg}')" >
                        <div style="width: 44px; height: 44px; border-radius: 12px; background: ${subjBg}; display: flex; align-items: center; justify-content: center; font-family: 'JetBrains Mono', monospace; font-weight: 800; color: ${subjText}; font-size: 12px; flex-shrink: 0;">
                            ${escapeHtml(getSubjectAbbrev(s.name))}
                        </div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-size: 15px; font-weight: 700; color: var(--text-primary); margin-bottom: 2px;">${escapeHtml(s.name)}</div>
                            <div style="font-family: 'JetBrains Mono', monospace; font-size: 9px; font-weight: 700; color: var(--text-dim); text-transform: uppercase;">Media generale materia</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 26px; font-weight: 800; color: ${s.media >= 6 ? 'var(--green)' : 'var(--red)'}; letter-spacing: -0.03em;">${s.media.toFixed(2)}</div>
                        </div>
                    </div > `;
        }).join('')}
            </div>
        </div> 
    </div>`;
}
function renderAIAssistantView() {
    const chat = state.aiChatHistory || [];

    return `
        <div class="view ai-view" style="display:flex; flex-direction:column; height:100%; max-height:100%; padding: 0 !important; background: var(--bg-body);">
            
            <!-- HEADER TE -->
            <div style="flex-shrink: 0; padding: 18px 24px; display: flex; align-items: center; justify-content: space-between; background: #FFF; border-bottom: 1px solid #E0DDD8; z-index: 10;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <button onclick="navigate('planner')" style="background: #141414; border: none; color: #FFF; cursor: pointer; width: 36px; height: 36px; border-radius: 12px; display: flex; align-items: center; justify-content: center; transition: transform 0.2s;" title="Back">
                        <i class="ph-bold ph-arrow-left" style="font-size: 16px;"></i>
                    </button>
                    <div style="display: flex; flex-direction: column;">
                        <span style="font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 800; text-transform: uppercase; color: #141414;">OP-Z Tutor AI</span>
                        <span style="font-family: 'JetBrains Mono', monospace; font-size: 9px; color: #908C86; text-transform: uppercase; letter-spacing: 0.1em;">Connected / Signal 100%</span>
                    </div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button onclick="if(confirm('Reset memory?')) clearAIChat()" style="background: #F6F5F3; border: 1px solid #E0DDD8; color: #141414; cursor: pointer; padding: 6px 14px; font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 800; text-transform: uppercase; border-radius: 10px; transition: all 0.2s;">
                        Reset
                    </button>
                </div>
            </div>

            <!-- CHAT SCROLLABLE -->
            <div id="aiChatMessages" style="flex: 1; overflow-y: auto; padding: 24px 32px; display: flex; flex-direction: column; gap: 20px;">
                ${chat.length === 0 ? `
                <div style="max-width: 500px; margin: 40px auto; text-align: left; font-family: 'JetBrains Mono', monospace; border: 1px solid #141414; border-radius: 20px; padding: 28px; background: #FFF; box-shadow: 0 8px 30px rgba(0,0,0,0.04);">
                    <div style="font-size: 10px; color: #908C86; margin-bottom: 12px; font-weight: 800;">// SYSTEM_INITIALIZATION_COMPLETE</div>
                    <div style="font-size: 18px; font-weight: 800; line-height: 1.2; text-transform: uppercase; margin-bottom: 24px; color: #141414;">Pronto per l'organizzazione pomeridiana.</div>
                    
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <button onclick="sendAIChatQuick('Organizza la mia settimana 📅')" style="background: #F6F5F3; border: 1px solid #E0DDD8; border-radius: 12px; color: #141414; padding: 14px; font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; text-align: left; text-transform: uppercase; cursor: pointer; transition: all 0.2s;">
                            > Pianifica Settimana
                        </button>
                        <button onclick="sendAIChatQuick('Aiutami a ripassare per la verifica 📝')" style="background: #F6F5F3; border: 1px solid #E0DDD8; border-radius: 12px; color: #141414; padding: 14px; font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; text-align: left; text-transform: uppercase; cursor: pointer; transition: all 0.2s;">
                            > Supporto Studio
                        </button>
                        <button onclick="sendAIChatQuick('Consiglio produttività 🚀')" style="background: #F6F5F3; border: 1px solid #E0DDD8; border-radius: 12px; color: #141414; padding: 14px; font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; text-align: left; text-transform: uppercase; cursor: pointer; transition: all 0.2s;">
                            > Tip Produttività
                        </button>
                    </div>
                </div>
                ` : chat.map((msg, idx) => `
                <div style="display: flex; flex-direction: column; ${msg.role === 'user' ? 'align-items: flex-end;' : 'align-items: flex-start;'}">
                    <div style="max-width: 85%; padding: 18px 22px; font-family: 'Inter', sans-serif; border: 1px solid ${msg.role === 'user' ? '#141414' : '#E0DDD8'}; border-radius: 20px; background: ${msg.role === 'user' ? '#141414' : '#FFF'}; color: ${msg.role === 'user' ? '#FFF' : '#141414'}; font-size: 14px; line-height: 1.6; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
                        <div style="font-family: 'JetBrains Mono', monospace; font-size: 9px; opacity: 0.5; margin-bottom: 10px; text-transform: uppercase; font-weight: 800;">${msg.role === 'user' ? 'User' : 'Tutor'} [${msg.ts || ''}]</div>
                        <div class="ai-prose" style="color: inherit !important;">
                            ${typeof marked !== 'undefined' ? marked.parse(msg.text) : msg.text}
                        </div>
                        ${msg.hasPlan ? `
                        <button onclick="applyAIPlanFromChat(${idx})" style="margin-top:18px; border:none; background:#007AFF; color:#FFF; padding:10px 20px; border-radius:12px; font-family:'JetBrains Mono',monospace; font-size:11px; font-weight:800; text-transform:uppercase; cursor:pointer; box-shadow: 0 4px 12px rgba(0,122,255,0.3); transition: transform 0.2s;">
                            Applica Piano [ENTER]
                        </button>` : ''}
                    </div>
                </div>
                `).join('')}
            </div>

            <!-- INPUT BOX (Centered) -->
            <div style="flex-shrink: 0; padding: 12px 24px 16px; background: #FFFFFF; border-top: 1px solid #E0DDD8;">
                <div class="ai-input-shell">
                  <div class="ai-input-dock">
                    <input id="aiChatInput" type="text" placeholder="Scrivi un comando..." onkeypress="if(event.key==='Enter') sendAIChat()" style="flex: 1; background: none; border: none; outline: none; font-family: 'Inter', sans-serif; font-size: 14px; color: #141414; padding: 4px 14px;">
                    <button onclick="sendAIChat()" style="width: 34px; height: 34px; background: #141414; border: none; color: #FFF; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <i class="ph-bold ph-paper-plane-right" style="font-size: 16px;"></i>
                    </button>
                  </div>
                </div>
            </div>
        </div>`;
}
function renderAcademicProfile() {
    const subjects = [...new Set(getVotiData().map(v => v.materia || v.subject))];

    return `
            <div class="view">
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

    // Re-render using the same function for consistent HTML
    const newContent = renderWeeklyAgenda();
    const temp = document.createElement('div');
    temp.innerHTML = newContent;
    const newList = temp.querySelector('#weekly-agenda-list');

    el.style.opacity = '0';
    el.style.transition = 'opacity 0.15s ease-out';
    setTimeout(() => {
        if (newList) {
            el.innerHTML = newList.innerHTML;
        } else {
            el.innerHTML = newContent;
        }
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
    const abbr = getSubjectAbbrev(subjectName);
    const key = abbr.toLowerCase();
    const projection = getGoalProjection(media, goal, votiData.length);
    const progressPct = Math.min(100, (media / Math.max(1, goal)) * 100);
    const MAX_GRADE_VALUE = 10;

    const trendItems = [...votiData]
        .sort((a, b) => parseArgoDate(a.data || a.date) - parseArgoDate(b.data || b.date))
        .map(v => {
            const rawVal = (v.valore || v.value || '').toString();
            if (isGiustifica(rawVal)) return null;
            const parsed = parseFloat(rawVal.replace(',', '.'));
            if (!Number.isFinite(parsed)) return null;
            const dateObj = parseArgoDate(v.data || v.date);
            if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return null;
            return { value: parsed, date: dateObj };
        })
        .filter(v => v && Number.isFinite(v.value));

    return `
        <div class="view" style="width: 100%; max-width: 1180px; margin: 0 auto; padding: 4px 0 24px;">
            <div style="display: flex; align-items: center; gap: 20px; margin-bottom: 32px;">
                <button onclick="window.closeSubject()" style="width: 48px; height: 48px; border-radius: 16px; background: #FFFFFF; border: 1px solid #141414; color: #141414; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.05); transition: transform 0.2s;">
                    <i class="ph-bold ph-arrow-left" style="font-size: 20px;"></i>
                </button>
                <div>
                    <h1 style="margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.02em; color: #141414;">${subjectName}</h1>
                    <div style="font-family:'JetBrains Mono', monospace; font-size: 10px; font-weight: 800; color: #908C86; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 2px;">// DETTAGLIO_MATERIA</div>
                </div>
            </div>

            <div class="card" style="background:#FFFFFF; border: 1px solid #141414; border-radius: 24px; padding: 24px; margin-bottom: 20px; box-shadow: 0 8px 30px rgba(0,0,0,0.04); position: relative; overflow: hidden;">
                <div style="position: absolute; left: 0; top: 0; bottom: 0; width: 8px; background: ${subjColor};"></div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 32px;">
                    <div>
                        <div style="font-family:'JetBrains Mono', monospace; font-size: 10px; color: #908C86; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px;">MEDIA ATTUALE</div>
                        <div style="font-size: 36px; font-weight: 800; color: ${media >= 6 ? '#28CD41' : '#FF3B30'}; letter-spacing: -0.05em;">${media.toFixed(2)}</div>
                    </div>
                    <div onclick="promptSetGoal('${subjectName}')" style="cursor: pointer;">
                        <div style="font-family:'JetBrains Mono', monospace; font-size: 10px; color: #908C86; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px;">OBIETTIVO</div>
                        <div style="font-size: 36px; font-weight: 800; color: #141414; display: flex; align-items: center; gap: 10px; letter-spacing: -0.05em;">
                            ${goal.toFixed(2)} <i class="ph-bold ph-pencil-simple" style="font-size: 18px; color: #007AFF;"></i>
                        </div>
                    </div>
                </div>
                <div style="margin-top:18px;">
                    <div style="height:6px; background:#F0EDE8; border-radius:100px; overflow:hidden;">
                        <div style="height:100%; width:${progressPct}%; background:${projection.done ? '#2DB86A' : subjColor}; border-radius:100px;"></div>
                    </div>
                    <div style="display:flex; align-items:center; justify-content:space-between; margin-top:8px; gap:10px; flex-wrap:wrap;">
                        <span style="font-family:'JetBrains Mono', monospace; font-size:10px; color:#908C86; font-weight:700; text-transform:uppercase;">Progresso obiettivo</span>
                        <span style="font-family:'JetBrains Mono', monospace; font-size:10px; color:${projection.done ? '#2DB86A' : '#908C86'}; font-weight:800; text-transform:uppercase;">
                            ${projection.done ? '✓ Raggiunto' : `Gap ${projection.gap.toFixed(2)}`}
                        </span>
                    </div>
                    ${projection.done ? '' : `
                    <div style="margin-top:10px; display:flex; flex-direction:column; gap:6px;">
                        ${(projection.scenarios || []).map(s => `
                        <div style="display:flex; justify-content:space-between; align-items:center; background:#F9F8F6; border:1px solid #ECEAE6; border-radius:10px; padding:8px 10px;">
                            <span style="font-family:'JetBrains Mono', monospace; font-size:10px; color:#908C86; font-weight:700; text-transform:uppercase;">${s.n === 1 ? 'Prossimo voto' : `Prossimi ${s.n} voti`}</span>
                            <span style="font-family:'JetBrains Mono', monospace; font-size:11px; color:#141414; font-weight:800;">≥ ${s.grade.toFixed(2)}</span>
                        </div>`).join('')}
                    </div>`}
                </div>
            </div>

            <div class="card" style="padding:18px; border-radius:18px; margin-bottom:18px; border:1px solid var(--border-light);">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
                    <h2 style="font-family:'JetBrains Mono', monospace; font-size: 12px; font-weight: 800; color: #141414; text-transform: uppercase; letter-spacing: 0.08em;">Trend andamento</h2>
                    <span style="font-family:'JetBrains Mono', monospace; font-size:10px; color:#908C86;">${trendItems.length} punti</span>
                </div>
                <div style="background:#F8F7F5; border:1px solid #ECEAE6; border-radius:12px; padding:10px;">
                    ${trendItems.length ? (() => {
            const W = 100;
            const H = 86;
            const padLeft = 30;
            const padRight = 8;
            const padTop = 8;
            const padBottom = 22;
            const innerW = Math.max(1, W - padLeft - padRight);
            const innerH = Math.max(1, H - padTop - padBottom);
            const dateMin = trendItems[0].date.getTime();
            const dateMax = trendItems[trendItems.length - 1].date.getTime();
            const dateSpan = Math.max(1, dateMax - dateMin);
            const yMin = 0;
            const yMax = MAX_GRADE_VALUE;
            const ySpan = yMax - yMin;
            const points = trendItems.map((item) => {
                const x = padLeft + ((item.date.getTime() - dateMin) / dateSpan) * innerW;
                const y = padTop + (1 - ((item.value - yMin) / ySpan)) * innerH;
                return { x, y, value: item.value, date: item.date };
            });
            const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
            const firstLabel = trendItems[0].date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
            const lastLabel = trendItems[trendItems.length - 1].date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
            const yTicks = [0, 6, 8, 10];
            return `
                        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%; height:140px; display:block;">
                            <line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${H - padBottom}" stroke="#D7D2CB" stroke-width="0.6" />
                            <line x1="${padLeft}" y1="${H - padBottom}" x2="${W - padRight}" y2="${H - padBottom}" stroke="#D7D2CB" stroke-width="0.6" />
                            ${yTicks.map(t => {
                const y = padTop + (1 - ((t - yMin) / ySpan)) * innerH;
                return `
                                <line x1="${padLeft}" y1="${y}" x2="${W - padRight}" y2="${y}" stroke="#ECEAE6" stroke-width="0.5" />
                                <text x="${padLeft - 3}" y="${y + 1.4}" text-anchor="end" font-size="3" fill="#908C86" style="font-family:'JetBrains Mono', monospace;">${t}</text>
                                `;
            }).join('')}
                            <path d="${linePath}" fill="none" stroke="${subjColor}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
                            ${points.map(p => `
                                <circle cx="${p.x}" cy="${p.y}" r="1.2" fill="${p.value >= PASSING_GRADE_THRESHOLD ? 'var(--green)' : 'var(--red)'}" />
                            `).join('')}
                            <text x="${padLeft}" y="${H - 4}" text-anchor="start" font-size="3" fill="#908C86" style="font-family:'JetBrains Mono', monospace;">${firstLabel}</text>
                            <text x="${W - padRight}" y="${H - 4}" text-anchor="end" font-size="3" fill="#908C86" style="font-family:'JetBrains Mono', monospace;">${lastLabel}</text>
                        </svg>
                    `;
        })() : '<div style="font-size:12px; color:#908C86;">Trend disponibile dopo almeno un voto numerico.</div>'}
                </div>
            </div>

            <div style="margin-bottom: 16px;">
                <h2 style="font-family:'JetBrains Mono', monospace; font-size: 12px; font-weight: 800; color: #141414; text-transform: uppercase; letter-spacing: 0.08em; display: flex; align-items: center; gap: 10px;">
                    Voti ricevuti
                    <span style="flex:1; height:1px; background:#E0DDD8;"></span>
                </h2>
            </div>

            <div style="display: flex; flex-direction: column; gap: 12px; padding-bottom: 60px;">
                ${votiData.map(v => {
        const rawVal = v.valore || v.value || '0';
        const giu = isGiustifica(rawVal);
        const val = giu ? 0 : parseFloat(rawVal.toString().replace(',', '.'));
        const isSuff = !giu && val >= 6;
        const displayVal = giu ? 'GIU' : (v.valore || v.value);
        return `
                    <div class="card" style="background:#FFFFFF; border: 1px solid #E0DDD8; border-radius: 20px; padding: 20px; display: flex; align-items: center; gap: 20px; transition: transform 0.2s; box-shadow: 0 4px 12px rgba(0,0,0,0.02);">
                        <div style="width: 56px; height: 56px; border-radius: 16px; background: ${giu ? 'rgba(188,184,178,0.1)' : (isSuff ? 'rgba(40, 205, 65, 0.1)' : 'rgba(255, 59, 48, 0.1)')}; display: flex; align-items: center; justify-content: center; font-size: ${giu ? '14' : '22'}px; font-weight: 800; color: ${giu ? '#BCB8B2' : (isSuff ? '#28CD41' : '#FF3B30')}; border: 1px solid ${giu ? 'rgba(188,184,178,0.2)' : (isSuff ? 'rgba(40, 205, 65, 0.2)' : 'rgba(255, 59, 48, 0.2)')};">
                            ${displayVal}
                        </div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-size: 16px; font-weight: 700; color: #141414; margin-bottom: 2px;">${v.tipo || 'Valutazione'}</div>
                            <div style="font-family:'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; color: #908C86; text-transform: uppercase;">${new Date(v.data || v.date).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                        </div>
                        ${v.commento ? `<i class="ph-bold ph-chat-circle-dots" style="color: #007AFF; font-size: 22px; cursor: help;" title="${v.commento}"></i>` : ''}
                    </div>`;
    }).join('')}
            </div>
        </div> `;
}
function mostraAssenzeModal() {
    const ad = state.assenzeData || { assenze: [], ritardi: [], uscite: [], totaleAssenze: 0, totaleRitardi: 0, totaleUscite: 0, oreAssenzaTotali: 0 };
    const all = [...ad.assenze.map(x => ({ ...x, icon: 'ph-calendar-x', color: '#EF4444' })),
    ...ad.ritardi.map(x => ({ ...x, icon: 'ph-clock-clockwise', color: '#F59E0B' })),
    ...ad.uscite.map(x => ({ ...x, icon: 'ph-clock-counter-clockwise', color: '#3B82F6' }))];

    all.sort((a, b) => new Date(b.data) - new Date(a.data));

    const percAssenza = ((ad.oreAssenzaTotali / ((state.giorniScuola || 200) * 5)) * 100).toFixed(2);

    showModal(`
            <div style="padding:24px; text-align: left;">
                <header style="margin-bottom:24px;">
                    <div style="font-family:'JetBrains Mono',monospace; font-size:10px; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.1em; margin-bottom:4px;">Riepilogo Assenze</div>
                    <div style="display:flex; align-items:baseline; gap:12px;">
                        <h2 style="margin:0; font-size:36px; font-weight:800; color:#EF4444;">${percAssenza}%</h2>
                        <span style="font-size:14px; font-weight:600; color:var(--text-secondary);">${ad.oreAssenzaTotali.toFixed(2)} ore totali</span>
                    </div>
                </header>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:24px;">
                    <div style="background:rgba(239, 68, 68, 0.05); padding:16px; border-radius:16px; border:1px solid rgba(239, 68, 68, 0.1);">
                        <div style="font-size:10px; color:#EF4444; font-weight:700; text-transform:uppercase; margin-bottom:4px;">Assenze</div>
                        <div style="font-size:20px; font-weight:800;">${ad.totaleAssenze}</div>
                    </div>
                    <div style="background:rgba(245, 158, 11, 0.05); padding:16px; border-radius:16px; border:1px solid rgba(245, 158, 11, 0.1);">
                        <div style="font-size:10px; color:#F59E0B; font-weight:700; text-transform:uppercase; margin-bottom:4px;">Ritardi/Uscite</div>
                        <div style="font-size:20px; font-weight:800;">${ad.totaleRitardi + ad.totaleUscite}</div>
                    </div>
                </div>
                <div style="margin:-10px 0 16px 0; padding:10px 12px; border-radius:12px; border:1px solid ${ad.daGiustificare > 0 ? 'rgba(239,68,68,0.25)' : 'rgba(40,205,65,0.25)'}; background:${ad.daGiustificare > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(40,205,65,0.08)'}; font-size:12px; font-weight:700; color:${ad.daGiustificare > 0 ? '#B91C1C' : '#166534'};">
                    ${ad.daGiustificare > 0 ? `Da giustificare: ${ad.daGiustificare}` : 'Tutti gli eventi risultano giustificati'}
                </div>

                <div style="font-family:'JetBrains Mono',monospace; font-size:10px; color:var(--text-dim); text-transform:uppercase; margin-bottom:12px; border-bottom:1px solid rgba(0,0,0,0.05); padding-bottom:8px;">Cronologia Eventi</div>
                
                <div style="max-height:400px; overflow-y:auto; display:flex; flex-direction:column; gap:10px; padding-right:4px;">
                    ${all.length === 0 ? `<div style="text-align:center; padding:30px; color:var(--text-dim); font-size:13px;">Nessun evento registrato</div>` :
            all.map(a => `
                        <div style="display:flex; align-items:center; gap:14px; padding:12px; background:rgba(255,255,255,0.03); border-radius:14px; border:1px solid rgba(0,0,0,0.03);">
                            <div style="width:36px; height:36px; border-radius:10px; background:${a.color}15; color:${a.color}; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                                <i class="ph-bold ${a.icon}" style="font-size:18px;"></i>
                            </div>
                            <div style="flex:1; min-width:0;">
                                <div style="display:flex; justify-content:space-between; align-items:baseline;">
                                    <span style="font-size:13px; font-weight:700; color:var(--text-primary);">${new Date(a.data).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}</span>
                                    <span style="font-family:'JetBrains Mono',monospace; font-size:10px; font-weight:700; color:var(--text-dim);">${a.oreEffettive ? a.oreEffettive.toFixed(2) : '?.??'}h</span>
                                </div>
                                <div style="font-size:11px; color:var(--text-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:2px;">
                                    ${(() => {
            const tipo = (a.tipo || '').toString();
            const nota = (a.nota || '').toString().trim();
            const tipoLabel = tipo ? (tipo.charAt(0).toUpperCase() + tipo.slice(1)) : 'Evento';
            const showNota = nota && nota.toLowerCase() !== tipo.trim().toLowerCase();
            return `${tipoLabel}${showNota ? ` • ${nota}` : ''}`;
        })()}
                                </div>
                                <div style="margin-top:5px;">
                                    <span style="display:inline-flex; align-items:center; padding:3px 8px; border-radius:999px; font-family:'JetBrains Mono',monospace; font-size:9px; font-weight:800; letter-spacing:.03em; text-transform:uppercase; background:${a.giustificata ? 'rgba(40,205,65,0.14)' : 'rgba(239,68,68,0.14)'}; color:${a.giustificata ? '#15803D' : '#B91C1C'}; border:1px solid ${a.giustificata ? 'rgba(40,205,65,0.35)' : 'rgba(239,68,68,0.35)'};">
                                        ${a.giustificata ? 'Giustificata' : 'Da giustificare'}
                                    </span>
                                </div>
                            </div>
                        </div>
                      `).join('')}
                </div>

                <button onclick="closeModal()" style="width:100%; margin-top:24px; height:48px; border-radius:14px; border:none; background:#141414; color:white; font-weight:700; cursor:pointer;">Chiudi</button>
            </div>
            `);
}
window.mostraAssenzeModal = mostraAssenzeModal;

function mostraVerificheModal() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = getLocalDateString(today);
    const allVerifiche = (state.verifiche || [])
        .filter(v => v.data && v.data >= todayISO)
        .sort((a, b) => a.data.localeCompare(b.data));
    // Manual Verifiche from dedicated database table
    const manualExams = (state.manualVerifiche || [])
        .filter(v => !v.done && v.date && v.date >= todayISO)
        .map(v => ({ materia: v.subject, data: v.date, text: v.args, tipo: v.type, source: 'manual', id: v.id }));

    const combined = [...allVerifiche, ...manualExams];
    const seen = new Set();
    const all = combined.filter(v => {
        const key = `${v.data}||${(v.materia || '').toLowerCase() || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).sort((a, b) => (a.data || '').localeCompare(b.data || ''));

    showModal(`
            <div style="padding:24px; text-align: left;">
                <header style="margin-bottom:24px;">
                    <div style="font-family:'JetBrains Mono',monospace; font-size:10px; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.1em; margin-bottom:4px;">Prossime Verifiche</div>
                    <h2 style="margin:0; font-size:24px; font-weight:800;">Calendario Verifiche</h2>
                </header>

                <div style="max-height:450px; overflow-y:auto; display:flex; flex-direction:column; gap:12px; padding-right:4px;">
                    ${all.length === 0 ? `<div style="text-align:center; padding:40px; color:var(--text-dim);">Nessuna verifica in programma</div>` :
            all.map(v => {
                const d = parseLocalDate(v.data);
                const days = Math.ceil((d - today) / 86400000);
                const abbr = getSubjectAbbrev(v.materia);
                const key = abbr.toLowerCase();
                return `
                          <div style="padding:16px; background:rgba(255,255,255,0.03); border-radius:16px; border:1px solid rgba(0,0,0,0.03); display:flex; align-items:center; gap:16px;">
                            <div style="width:48px; height:48px; border-radius:12px; background:var(--${key},var(--mat)); color:var(--${key}-t,var(--mat-t)); display:flex; align-items:center; justify-content:center; font-family:'JetBrains Mono',monospace; font-weight:700; font-size:14px; flex-shrink:0;">
                                ${abbr}
                            </div>
                            <div style="flex:1; min-width:0;">
                                <div style="font-size:13px; font-weight:700; color:var(--text-primary); margin-bottom:2px;">${escapeHtml(v.text || (v.tipo === 'scritta' ? 'Verifica Scritta' : 'Interrogazione Orale'))}</div>
                                <div style="font-size:11px; color:var(--text-dim);">${escapeHtml(v.materia)} · ${d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}</div>
                            </div>
                            <div style="text-align:right; flex-shrink:0; display:flex; align-items:center; gap:12px;">
                                ${v.source === 'manual' ? `
                                    <button onclick="deleteManualVerifica('${v.id}')" style="background:none; border:none; color:var(--red, #FF3B30); cursor:pointer; padding:4px; opacity:0.6; transition:opacity 0.2s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.6'">
                                        <i class="ph-bold ph-trash" style="font-size:16px;"></i>
                                    </button>
                                ` : ''}
                                <div style="min-width:40px;">
                                    <div style="font-size:16px; font-weight:800; color:var(--text-primary); line-height:1;">${days}</div>
                                    <div style="font-size:9px; color:var(--text-dim); font-weight:600; text-transform:uppercase;">giorni</div>
                                </div>
                            </div>
                          </div>
                        `;
            }).join('')}
                </div>

                <button onclick="closeModal()" style="width:100%; margin-top:24px; height:48px; border-radius:14px; border:none; background:#141414; color:white; font-weight:700; cursor:pointer;">Chiudi</button>
            </div>
            `);
}
window.mostraVerificheModal = mostraVerificheModal;

window._navVerifica = function (dir) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayISO = getLocalDateString(today);
    const argoV = (state.verifiche || []).filter(v => v.data && v.data >= todayISO).sort((a, b) => a.data.localeCompare(b.data));
    const manualV = (state.manualVerifiche || []).filter(v => !v.done && v.date && v.date >= todayISO).map(v => ({ materia: v.subject, data: v.date, text: v.args, tipo: v.type }));
    const seen = new Set();
    const all = [...argoV, ...manualV].filter(v => { const k = `${v.data}||${(v.materia || '').toLowerCase()}`; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => a.data.localeCompare(b.data));
    if (all.length <= 1) return;
    window._verificheIdx = Math.max(0, Math.min(all.length - 1, (window._verificheIdx || 0) + dir));
    const v = all[window._verificheIdx];
    if (!v) return;

    const abbr = typeof getSubjectAbbrev === 'function' ? getSubjectAbbrev(v.materia) : (v.materia || '').substring(0, 3).toUpperCase();
    const key = abbr.toLowerCase();
    const tipoLabel = v.tipo === 'scritta' ? 'SCRITTA' : v.tipo === 'orale' ? 'ORALE' : (v.tipo || '').toUpperCase();
    const examDate = parseLocalDate(v.data);
    const daysLeft = Math.ceil((examDate - today) / 86400000);
    const desc = (v.text || v.materia || '').substring(0, 45);

    const el = (id) => document.getElementById(id);
    const abbrEl = el('vw-abbr');
    if (abbrEl) { abbrEl.textContent = abbr; abbrEl.style.background = `var(--${key},var(--mat))`; abbrEl.style.color = `var(--${key}-t,var(--mat-t))`; }
    const tipoEl = el('vw-tipo'); if (tipoEl) tipoEl.textContent = tipoLabel;
    const counterEl = el('vw-counter'); if (counterEl) counterEl.textContent = `${window._verificheIdx + 1}/${all.length}`;
    const descEl = el('vw-desc'); if (descEl) descEl.textContent = desc;
    const daysEl = el('vw-days'); if (daysEl) daysEl.textContent = daysLeft;
    const barFill = el('vw-bar-fill'); if (barFill) { barFill.style.width = Math.max(5, 100 - daysLeft * 8) + '%'; barFill.style.background = `var(--${key}-dot,var(--mat-dot))`; }
};


/* Remaining UI/Modal/Logic Functions */
function mostraCircolare(id) {
    const c = state.circolari.find(x => x.id === id);
    if (!c) return;

    showModal(`
            <div class="circolare-layout">
                <aside class="circolare-side">
                    <div style="display:flex; flex-direction:column; gap:8px;">
                        <p style="font-family:'JetBrains Mono',monospace; font-size:10px; color:#908C86; text-transform:uppercase; letter-spacing:0.1em; margin:0;">
                            // CIRCOLARE_DOC N. ${c.numero}
                        </p>
                        <h2 style="font-size:20px; font-weight:800; color:#141414; line-height:1.2; margin:0; letter-spacing:-0.02em;">
                            ${c.titolo}
                        </h2>
                        <p style="font-family:'JetBrains Mono',monospace; font-size:11px; font-weight:700; color:#BCB8B2; margin-top:4px; display:flex; align-items:center; gap:6px;">
                            <i class="ph-bold ph-calendar"></i> ${c.data}
                        </p>
                    </div>
                    
                    <div style="display:flex; flex-direction:column; gap:12px; margin-top:auto;">
                        <button onclick="window.open('${c.link}', '_blank')" 
                            style="width:100%; height:48px; border-radius:12px; background:#141414; 
                            color:#FFF; font-weight:800; border:none; cursor:pointer; 
                            display:flex; align-items:center; justify-content:center; gap:8px; font-family:'JetBrains Mono',monospace; font-size:11px; text-transform:uppercase; transition: all 0.2s;">
                            <i class="ph-bold ph-file-pdf" style="font-size:18px;"></i>
                            Apri Documento
                        </button>
                        <button onclick="closeModal()" 
                            style="width:100%; height:44px; border-radius:12px; background:rgba(0,0,0,0.04); 
                            color:#908C86; font-weight:700; border:none; cursor:pointer; font-family:'JetBrains Mono',monospace; font-size:10px; text-transform:uppercase;">
                            Chiudi
                        </button>
                    </div>
                </aside>

                <section class="circolare-main">
                    <div id="sintesi-box-${c.id}" style="height: 100%;">
                        ${c.sintesi ? `<div class="ai-prose">${marked.parse(c.sintesi)}</div>` : `
                            <div id="sintesi-placeholder-${c.id}" style="height: 100%; display:flex; flex-direction:column; gap:20px; align-items:center; justify-content:center; text-align:center;">
                                <div style="width:56px; height:56px; border-radius:18px; background:#F6F5F3; display:flex; align-items:center; justify-content:center; color:#DEDAD4;">
                                    <i class="ph-bold ph-sparkle" style="font-size:28px;"></i>
                                </div>
                                <div>
                                    <p style="color:#141414; font-size:15px; font-weight:700; margin:0 0 4px 0;">Analisi AI Disponibile</p>
                                    <p style="color:#908C86; font-size:13px; margin:0; max-width: 260px;">Genera una sintesi dei punti chiave tramite il nostro motore neurale.</p>
                                </div>
                                <button onclick="requestCircularSynthesis('${c.id}', '${c.link}')" 
                                    id="btn-sintesi-${c.id}"
                                    class="btn-engineering"
                                    style="padding:12px 28px;">
                                    <i class="ph-bold ph-cpu"></i> Elabora Sintesi
                                </button>
                            </div>
                        `}
                    </div>
                </section>
            </div>
            `, 'circolare-modal');

}
function renderDayDetailModal(dateStr) {
    const container = getModalContainer();
    if (!container) return;

    const date = parseArgoDate(dateStr);
    const formattedDate = date.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });

    let tasksForDay = [];
    if (state.plannerMode === 'registro') {
        tasksForDay = (state.tasks || []).filter(t => !t.id.startsWith('ai_') && t.subject !== 'QUEST' && !t.isExam && t.due_date === dateStr);
    } else {
        const plannedIds = state.plannedTasks[dateStr] || [];
        tasksForDay = (state.tasks || []).filter(t => plannedIds.includes(t.id) && !t.isExam);
    }
    const isRegistro = state.plannerMode === 'registro';

    // Gather verifiche for this day
    const verificheForDay = [];
    (state.verifiche || []).filter(v => v.data === dateStr).forEach(v => {
        verificheForDay.push({ subject: v.materia || v.subject || '', text: v.text || v.descrizione || '', tipo: v.tipo || '' });
    });
    (state.manualVerifiche || []).filter(v => v.date === dateStr).forEach(v => {
        verificheForDay.push({ subject: v.subject || '', text: v.args || '', tipo: v.type || '', id: v.id });
    });

    const hasContent = tasksForDay.length > 0 || verificheForDay.length > 0;

    container.innerHTML = `
                <div class="modal-overlay active" onclick="closeModal(event)" style="position:fixed;top:0;left:0;right:0;bottom:0;z-index:99990;background:rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);">
                    <div class="modal-content" onclick="event.stopPropagation()" style="font-family:'Inter',system-ui,-apple-system,sans-serif; max-width:440px; padding:28px; border-radius:22px; background:#FFFFFF; color:#141414; border:1px solid rgba(0,0,0,0.06); box-shadow: 0 20px 60px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.04); width: calc(100% - 32px); max-height: 90vh; display:flex; flex-direction:column;">

                        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:24px; flex-shrink:0;">
                            <div>
                                <div style="font-family:'JetBrains Mono',monospace; font-size:9px; font-weight:700; color:${isRegistro ? '#007AFF' : '#FF2D55'}; text-transform:uppercase; letter-spacing:0.15em; margin-bottom:8px; background: ${isRegistro ? 'rgba(0,122,255,0.06)' : 'rgba(255,45,85,0.06)'}; padding: 4px 10px; border-radius: 8px; display:inline-block;">
                                    ${isRegistro ? 'Scadenze Registro' : 'Organizzazione Studio'}
                                </div>
                                <h2 style="font-family:'Inter',system-ui,-apple-system,sans-serif; margin:0; font-size:24px; font-weight:800; text-transform:capitalize; letter-spacing:-0.03em; color:#141414;">${formattedDate}</h2>
                            </div>
                            <button onclick="closeModal()" style="background:#F6F5F3; border:none; width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#908C86; cursor:pointer; transition: all 0.2s; flex-shrink:0;" onmouseover="this.style.background='#EDEBE7';this.style.color='#141414'" onmouseout="this.style.background='#F6F5F3';this.style.color='#908C86'">
                                <i class="ph ph-x" style="font-size:18px;"></i>
                            </button>
                        </div>

                        <div id="modal-task-list" style="display:flex; flex-direction:column; gap:12px; overflow-y:auto; flex:1; min-height:0; padding-right:4px;">
                            ${!hasContent ? `
                                <div style="text-align:center; padding:56px 20px; color:#908C86;">
                                    <i class="ph ph-calendar-blank" style="font-size:48px; display:block; margin:0 auto 14px; opacity:0.12;"></i>
                                    <div style="font-family:'Inter',system-ui,sans-serif; font-size:15px; font-weight:600; opacity:0.5;">Nessun compito pianificato</div>
                                </div>
                            ` : ''}
                            ${verificheForDay.map(v => {
        const color = getSubjectColor(v.subject);
        const abbr = getSubjectAbbrev(v.subject);
        const key = abbr.toLowerCase();
        return `
                                    <div style="flex-shrink:0; border-radius:16px; display:flex; align-items:stretch; overflow:hidden; background:#FFFBF0; border:1px solid rgba(255,159,10,0.2); box-shadow: 0 1px 4px rgba(0,0,0,0.04);">
                                        <div style="width:4px; background:#FF9F0A; flex-shrink:0;"></div>
                                        <div style="flex:1; padding:16px 16px; min-width:0;">
                                            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
                                                <span style="font-family:'JetBrains Mono',monospace; font-size:9px; font-weight:700; color:var(--${key}-t, ${color}); text-transform:uppercase; letter-spacing:0.08em; background:var(--${key}, rgba(0,0,0,0.04)); padding:3px 8px; border-radius:6px;">${escapeHtml(v.subject || abbr)}</span>
                                                <span style="font-family:'JetBrains Mono',monospace; font-size:9px; font-weight:700; color:#FF9F0A; text-transform:uppercase;">${escapeHtml(v.tipo || 'VERIFICA')}</span>
                                            </div>
                                            <div style="font-family:'Inter',system-ui,-apple-system,sans-serif; font-size:14px; font-weight:600; color:#141414; line-height:1.55; word-break:break-word;">${escapeHtml(v.text || v.subject)}</div>
                                        </div>
                                    </div>
                                `;
    }).join('')}
                            ${tasksForDay.filter(t => !/check-?list|check\s*liste|checklist\s*&\s*review/i.test(t.text)).map(t => {
        const subContent = t.subject || 'N/A';
        const abbr = getSubjectAbbrev(subContent);
        const key = abbr.toLowerCase();
        const color = getSubjectColor(subContent);
        const timeMatch = (t.text || '').match(/(\d{1,2}:\d{2})/);
        const timeStr = timeMatch ? timeMatch[1] : '';
        const displayText = (t.text || '')
            .replace(/^\[AI\]\s*/i, '')
            .replace(/^\d{2}:\d{2}\s*[—\-]\s*/, '')
            .replace(/\*/g, '')
            .replace(/[\s|]+$/, '')
            .trim();
        return `
                                    <div style="flex-shrink:0; border-radius:16px; display:flex; align-items:stretch; overflow:hidden; background:${t.done ? '#FAFAF9' : '#FFFFFF'}; border:1px solid ${t.done ? '#EDEBE7' : 'rgba(0,0,0,0.08)'}; box-shadow: 0 1px 4px rgba(0,0,0,0.04); opacity: ${t.done ? 0.65 : 1}; transition: all 0.2s;">
                                        <div style="width:4px; background:${color}; flex-shrink:0;"></div>
                                        <div style="flex:1; padding:16px 16px; min-width:0;">
                                            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
                                                <span style="font-family:'JetBrains Mono',monospace; font-size:9px; font-weight:700; color:var(--${key}-t, ${color}); text-transform:uppercase; letter-spacing:0.08em; background:var(--${key}, rgba(0,0,0,0.04)); padding:3px 8px; border-radius:6px;">${escapeHtml(subContent)}</span>
                                                ${timeStr ? `<span style="font-family:'JetBrains Mono',monospace; font-size:9px; font-weight:600; color:#908C86; background:#F6F5F3; padding:3px 8px; border-radius:20px;">${escapeHtml(timeStr)}</span>` : ''}
                                            </div>
                                            <div style="font-family:'Inter',system-ui,-apple-system,sans-serif; font-size:14px; font-weight:600; color:#141414; line-height:1.55; word-break:break-word; ${t.done ? 'text-decoration:line-through; opacity:0.5;' : ''}">${escapeHtml(displayText)}</div>
                                        </div>
                                        <div style="padding:12px 10px; display:flex; flex-direction:column; align-items:center; gap:6px; flex-shrink:0;">
                                            <button onclick="toggleTask('${t.id}'); renderDayDetailModal('${dateStr}');" style="width:34px; height:34px; border-radius:10px; background:${t.done ? '#141414' : '#F6F5F3'}; border:1px solid ${t.done ? '#141414' : 'rgba(0,0,0,0.06)'}; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all 0.2s;">
                                                <i class="ph-bold ph-check" style="font-size:16px; color:${t.done ? 'white' : '#C8C5C0'};"></i>
                                            </button>
                                            ${t.id && t.id.startsWith('manual_') ? `<button onclick="deleteCalendarTask('${t.id}', '${dateStr}');" style="width:34px; height:34px; border-radius:10px; background:#FFF0EE; border:1px solid rgba(255,59,48,0.12); display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all 0.2s;" aria-label="Elimina attività" title="Elimina attività" onmouseover="this.style.background='#FFE0DC'" onmouseout="this.style.background='#FFF0EE'">
                                                <i class="ph-bold ph-trash" style="font-size:14px; color:#FF3B30;"></i>
                                            </button>` : ''}
                                        </div>
                                    </div>
                                `;
    }).join('')}
                       </div>

                        ${hasContent ? `
                        <div style="margin-top:20px; padding-top:16px; border-top:1px solid #F0EDE8; flex-shrink:0;">
                            <button onclick="closeModal()" style="font-family:'Inter',system-ui,-apple-system,sans-serif; width:100%; height:48px; background:#141414; color:white; border:none; border-radius:14px; font-size:14px; font-weight:700; cursor:pointer; letter-spacing:0.3px; transition: all 0.2s;" onmouseover="this.style.background='#2A2A2A'" onmouseout="this.style.background='#141414'">Chiudi</button>
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
    if (typeof debouncedSavePlannerRemote === 'function') debouncedSavePlannerRemote(500);

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
function deleteCalendarTask(taskId, dateStr) {
    if (!taskId || !taskId.startsWith('manual_')) return;
    state.tasks = state.tasks.filter(t => t.id !== taskId);
    // Remove from plannedTasks as well
    Object.keys(state.plannedTasks || {}).forEach(d => {
        if (Array.isArray(state.plannedTasks[d])) {
            state.plannedTasks[d] = state.plannedTasks[d].filter(id => id !== taskId);
        }
    });
    saveTasks();
    if (typeof debouncedSavePlannerRemote === 'function') debouncedSavePlannerRemote(500);
    if (typeof showToast === 'function') showToast('Attività eliminata');
    renderDayDetailModal(dateStr);
    notifyPlannerChanged();
    if (typeof renderCustomCalendar === 'function') renderCustomCalendar();
}
function notifyPlannerChanged() {
    // badge sul bottone Organizza Oggi e Dashboard
    if (typeof updatePlannerCounter === 'function') updatePlannerCounter();
    if (typeof updateHomeView === 'function') updateHomeView();

    // ✅ FIX: Aggiorna la weekly agenda list in-place (nessun full re-render)
    if (state.view === 'planner') {
        const agendaEl = document.getElementById('weekly-agenda-list');
        if (agendaEl) {
            const newContent = renderWeeklyAgenda();
            const temp = document.createElement('div');
            temp.innerHTML = newContent;
            const newList = temp.querySelector('#weekly-agenda-list');
            if (newList) agendaEl.innerHTML = newList.innerHTML;
        }
    }

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
                        <input type="text" id="edit-user-name" value="${escapeHtml(state.user.name || '')}" placeholder="Esempio: Andrea Rossi">
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
                        <div style="font-size: 18px; font-weight: 800; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(state.user.name)}</div>
                        <div style="font-size: 13px; color: var(--text-dim); font-weight: 600;">${escapeHtml(normalizeClassUi(state.user.class) || 'Studente')}</div>
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
                            <div style="font-size: 17px; font-weight: 600; color: var(--text-primary);">${escapeHtml(state.user.name)}</div>
                            <div style="font-size: 14px; color: var(--text-secondary);">${escapeHtml(state.user.class || 'Studente')}</div>
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
                    <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 8px;">v5.0 (Liquid Glass)</p>
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
            if (!t.id.startsWith('ai_') && t.subject !== 'QUEST' && !t.isExam && t.due_date) {
                list.push({ ...t, displayDate: t.due_date });
            }
        });
    } else {
        Object.entries(state.plannedTasks).forEach(([dateStr, ids]) => {
            ids.forEach(id => {
                const t = state.tasks.find(tk => tk.id === id);
                if (t && !t.isExam) list.push({ ...t, displayDate: dateStr });
            });
        });
    }

    list.sort((a, b) => parseArgoDate(b.displayDate) - parseArgoDate(a.displayDate));

    // --- LIVE FILTERING LOGIC ---
    const query = (state.agendaSearchQuery || "").toLowerCase().trim();
    const filterSubject = state.agendaSearchSubject || "all";
    const sortOrder = state.agendaSortOrder || "due_desc";

    const preparedList = list.map(t => ({
        ...t,
        _assignedTs: parseArgoDate(t.assigned_date || t.displayDate).getTime(),
        _dueTs: parseArgoDate(t.displayDate).getTime()
    }));

    const filteredList = preparedList.filter(t => {
        const matchesQuery = !query ||
            (t.text || "").toLowerCase().includes(query) ||
            (t.subject || "").toLowerCase().includes(query);

        const matchesSubject = filterSubject === "all" ||
            (t.subject || "").toLowerCase().trim() === filterSubject.toLowerCase().trim();

        return matchesQuery && matchesSubject;
    }).sort((a, b) => {
        if (sortOrder === "assignment_asc") {
            if (a._assignedTs !== b._assignedTs) return a._assignedTs - b._assignedTs;
            return a._dueTs - b._dueTs;
        }
        return b._dueTs - a._dueTs;
    });

    // Extract unique subjects for chips
    const allSubjects = [...new Set(list.map(t => t.subject?.trim()).filter(Boolean))].sort();

    const searchHeader = `
                <div class="agenda-search-container">
                    <div class="search-input-wrapper">
                        <i class="ph-bold ph-magnifying-glass"></i>
                        <input type="text" 
                               class="agenda-search-input" 
                               placeholder="Cerca tra i tuoi compiti..." 
                               value="${state.agendaSearchQuery || ''}"
                               oninput="handleAgendaSearch(event)">
                    </div>
                    <div class="agenda-filters-scroll">
                        <div class="filter-chip ${filterSubject === 'all' && sortOrder !== 'assignment_asc' ? 'active' : ''}" onclick="setAgendaFilter('all'); state.agendaSortOrder='due_desc'; refreshAgenda();">
                            <i class="ph ph-rows"></i> Tutti
                        </div>
                        <div class="filter-chip ${sortOrder === 'assignment_asc' ? 'active' : ''}" onclick="state.agendaSortOrder='assignment_asc'; state.agendaSearchSubject='all'; refreshAgenda();">
                            <i class="ph ph-sort-ascending"></i> Per assegnazione
                        </div>
                        ${allSubjects.map(s => `
                            <div class="filter-chip ${filterSubject === s && sortOrder !== 'assignment_asc' ? 'active' : ''}" onclick="setAgendaFilter('${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'); state.agendaSortOrder='due_desc';">
                                ${s}
                            </div>
                        `).join('')}                    </div>
                </div>
            `;

    if (!filteredList.length) {
        return `
                ${searchHeader}
                <div class="card" style="text-align: center; color: var(--text-dim); padding: 50px 20px; font-family: 'Inter', sans-serif; background: rgba(0,0,0,0.02); border: 1px dashed rgba(0,0,0,0.05);">
                    <i class="ph ph-magnifying-glass" style="font-size: 40px; opacity: 0.2; margin-bottom: 12px; display: block;"></i>
                    <div style="font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">// NESSUN RISULTATO</div>
                    <p style="font-size: 12px; margin-top: 4px; opacity: 0.6;">Prova a cambiare i filtri o la ricerca</p>
                </div> `;
    }

    const grouped = {};
    filteredList.forEach(t => {
        if (!grouped[t.displayDate]) grouped[t.displayDate] = [];
        grouped[t.displayDate].push(t);
    });
    const groupedAssignmentMin = {};
    if (sortOrder === 'assignment_asc') {
        Object.entries(grouped).forEach(([dateKey, tasks]) => {
            groupedAssignmentMin[dateKey] = Math.min(...tasks.map(t => t._assignedTs || parseArgoDate(t.assigned_date || t.displayDate).getTime()));
        });
    }
    const sortedDates = Object.keys(grouped).sort((a, b) => {
        if (sortOrder === 'assignment_asc') {
            const minAssignedA = groupedAssignmentMin[a] ?? parseArgoDate(a).getTime();
            const minAssignedB = groupedAssignmentMin[b] ?? parseArgoDate(b).getTime();
            if (minAssignedA !== minAssignedB) return minAssignedA - minAssignedB;
            return parseArgoDate(a).getTime() - parseArgoDate(b).getTime();
        }
        return parseArgoDate(b).getTime() - parseArgoDate(a).getTime();
    });

    return `
        <div id="weekly-agenda-list" style="display: flex; flex-direction: column; gap: 32px;">
            ${searchHeader}
            ${sortedDates.map(dateStr => {
        const d = parseArgoDate(dateStr);
        const dayNum = d.toLocaleDateString('it-IT', { day: 'numeric' });
        const dayName = d.toLocaleDateString('it-IT', { weekday: 'long' });
        const monthName = d.toLocaleDateString('it-IT', { month: 'short' });
        const isToday = dateStr === getLocalDateString();
        const isTomorrow = (() => { const tm = new Date(); tm.setDate(tm.getDate() + 1); return dateStr === getLocalDateString(tm); })();

        const labelColor = isToday ? '#34C759' : isTomorrow ? '#FF9F0A' : 'transparent';
        const labelText = isToday ? 'TODAY' : isTomorrow ? 'BEYOND' : '';
        const labelTag = isToday || isTomorrow
            ? `<span style="font-family: 'JetBrains Mono', monospace; font-size:10px; font-weight:800; color:${labelColor}; border: 1px solid ${labelColor}; padding:2px 8px; border-radius:4px; text-transform:uppercase; letter-spacing:0.05em;">${labelText}</span>`
            : '';

        return `
            <div>
                <!-- TE Date Header -->
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                    <div style="display:flex; flex-direction:column; align-items:center; min-width:44px;">
                        <span style="font-family: 'Inter', sans-serif; font-size:24px; font-weight:800; color:${isToday ? 'var(--accent)' : 'var(--text-primary)'}; line-height:1; letter-spacing:-0.04em;">${dayNum}</span>
                        <span style="font-family: 'JetBrains Mono', monospace; font-size:10px; font-weight:700; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.1em; margin-top:2px;">${monthName}</span>
                    </div>
                    <div style="flex:1; height:1px; background:rgba(0,0,0,0.05);"></div>
                    <div style="font-family: 'Inter', sans-serif; font-size:12px; font-weight:700; color:var(--text-dim); text-transform:capitalize; letter-spacing:-0.01em;">${dayName}</div>
                    ${labelTag}
                </div>
                
                <!-- Tasks List -->
                <div style="display:flex; flex-direction:column; gap:12px;">
                    ${grouped[dateStr].filter(t => !/check-?list|check\s*liste|checklist\s*&\s*review/i.test(t.text || t.description || '')).map(t => {
            const subjColor = getSubjectColor(t.subject);
            const cleanSubject = (t.subject || '').replace(/\*/g, '').trim();
            const timeMatch = (t.text || '').match(/(\d{1,2}:\d{2})/);
            const timeStr = timeMatch ? timeMatch[1] : '';
            const displayText = (t.text || t.description || 'Task')
                .replace(/^\[AI\]\s*/i, '')
                .replace(/^\d{2}:\d{2}\s*[—\-]\s*/, '')
                .replace(/\*/g, '')
                .replace(/[\s|]+$/, '')
                .trim();

            return `
                    <div class="card" style="display:flex; align-items:stretch; background:${t.done ? '#FAFAF9' : '#FFFFFF'}; border: 1px solid ${t.done ? '#EDEBE7' : 'rgba(0,0,0,0.06)'}; border-radius:14px; min-height:80px; box-shadow: 0 1px 3px rgba(0,0,0,0.02); transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1); overflow: hidden;">
                        <div style="width:4px; background:${t.done ? '#C8C5C0' : subjColor}; flex-shrink:0;"></div>
                        
                        <div style="flex:1; padding:16px 20px; min-width:0; display:flex; flex-direction:column; justify-content:center;">
                            <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px; flex-wrap:wrap;">
                                <span style="font-family:'JetBrains Mono', monospace; font-size:9px; font-weight:700; color:${t.done ? '#908C86' : subjColor}; text-transform:uppercase; letter-spacing:0.08em; background:rgba(0,0,0,0.04); padding:2px 6px; border-radius:4px;">${escapeHtml(cleanSubject)}</span>
                                ${timeStr ? `<span style="font-family:'JetBrains Mono', monospace; font-size:9px; font-weight:600; color:#908C86; background:#F6F5F3; padding:2px 6px; border-radius:4px;">${escapeHtml(timeStr)}</span>` : ''}
                            </div>
                            <div data-task-text="${escapeHtml(t.id)}" style="font-family:'Inter', sans-serif; font-size:14px; font-weight:600; color:${t.done ? '#908C86' : '#141414'}; line-height:1.5; word-break:break-word; ${t.done ? 'text-decoration:line-through; opacity: 0.5;' : ''}">${escapeHtml(displayText)}</div>
                        </div>
                        
                        <div style="padding:0 16px; display:flex; align-items:center; justify-content:center; flex-shrink:0; border-left: 1px dashed rgba(0,0,0,0.04);">
                            <div data-task-toggle="${t.id}" onclick="toggleTask('${t.id}')" style="width:30px; height:30px; border-radius:8px; border:1.5px solid ${t.done ? '#141414' : '#C8C5C0'}; background:${t.done ? '#141414' : 'transparent'}; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all 0.2s; flex-shrink:0;">
                                ${t.done ? '<i class="ph-bold ph-check" style="font-size:14px; color:#fff;"></i>' : ''}
                            </div>
                        </div>
                    </div>`;
        }).join('')}
                </div>
            </div>`;
    }).join('')}
        </div>`;
}
function showPlanWeekModal() {
    const modalContainer = getModalContainer();
    if (!modalContainer) return;

    modalContainer.innerHTML = `
        <div class="modal-overlay active" onclick="closeModal(event)" style="position:fixed;top:0;left:0;right:0;bottom:0;z-index:99990;background:rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);">
            <div id="plan-week-modal-content" class="modal-content glass-panel" onclick="event.stopPropagation()" style="position:relative;z-index:99991;width: 100%; max-width: 450px; padding: 24px; max-height: 90vh; overflow-y: auto;">
            </div>
        </div> `;
    refreshPlanWeekModalContent();
}
function togglePlanDay(taskId, dateStr) {
    if (typeof event !== 'undefined' && event && event.stopPropagation) event.stopPropagation();

    const todayStr = getLocalDateString();
    if (dateStr < todayStr) return;

    if (!state.plannedTasks[dateStr]) state.plannedTasks[dateStr] = [];
    const index = state.plannedTasks[dateStr].indexOf(taskId);
    if (index > -1) {
        state.plannedTasks[dateStr].splice(index, 1);
    } else {
        state.plannedTasks[dateStr].push(taskId);
    }

    saveTasks();
    if (typeof debouncedSavePlannerRemote === 'function') debouncedSavePlannerRemote(500);

    // ✅ FIX: Immediate surgical DOM update — border shorthand, background, color
    const isNowPlanned = state.plannedTasks[dateStr] && state.plannedTasks[dateStr].includes(taskId);
    document.querySelectorAll(`[data-task-id="${taskId}"][data-date="${dateStr}"]`).forEach(btn => {
        btn.style.background = isNowPlanned ? '#141414' : '#F6F5F3';
        btn.style.color = isNowPlanned ? 'white' : '#908C86';
        btn.style.border = isNowPlanned
            ? '2px solid #141414'
            : (dateStr === todayStr ? '2px solid #007AFF' : '1px solid #E0DDD8');
        // Spring feedback
        btn.style.transform = 'scale(0.9)';
        setTimeout(() => { btn.style.transform = 'scale(1)'; btn.style.transition = 'all 0.25s cubic-bezier(0.2,0.8,0.2,1)'; }, 80);
    });

    notifyPlannerChanged();
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
function getGoalProjection(media, goal, count) {
    const safeMedia = Number.isFinite(media) ? media : 0;
    const safeGoal = Number.isFinite(goal) ? goal : 8.0;
    const safeCount = Number.isFinite(count) ? count : 0;
    const currentSum = safeCount * safeMedia;
    const gap = Math.max(0, safeGoal - safeMedia);
    const done = safeMedia >= safeGoal;
    const grades = [10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6];
    const scenarios = [];

    if (!done && safeCount === 0) {
        const firstScenarios = grades
            .filter(g => g >= safeGoal)
            .slice(0, 3)
            .map(g => ({ grade: g, n: 1 }));
        if (firstScenarios.length > 0) scenarios.push(...firstScenarios);
        if (scenarios.length === 0 && safeGoal > 0 && safeGoal <= 10) {
            scenarios.push({ grade: Math.round(safeGoal * 100) / 100, n: 1, exact: true });
        }
    } else if (!done) {
        for (const g of grades) {
            if (g <= safeGoal) continue;
            const denom = (g - safeGoal);
            // Guard against floating-point near-zero denominator (goal almost equal to grade bucket).
            // 1e-9 acts as epsilon to avoid unstable huge projections when denom is numerically ~0.
            if (Math.abs(denom) < 1e-9) continue;
            const n = Math.ceil((safeGoal * safeCount - currentSum) / denom);
            if (n >= 1 && n <= 9999) scenarios.push({ grade: g, n });
            if (scenarios.length === 3) break;
        }

        if (scenarios.length === 0 && safeGoal > 0 && safeGoal <= 10) {
            const minNeeded = (safeGoal * (safeCount + 1)) - currentSum;
            if (minNeeded > safeGoal && minNeeded <= 10) {
                scenarios.push({ grade: Math.ceil(minNeeded * 100) / 100, n: 1, exact: true });
            }
        }
    }

    return { done, gap, scenarios, first: scenarios[0] || null };
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

    return `
        <div class="view">
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    ${votiData.map(v => {
        const rawVal = (v.valore || v.value || '').toString();
        const giu = isGiustifica(rawVal);
        const displayVal = giu ? 'GIU' : rawVal;
        const mat = v.materia || v.subject || 'Materia';
        const abbr = getSubjectAbbrev(mat);
        const key = abbr.toLowerCase();
        const numVal = parseFloat(rawVal.replace(',', '.'));
        const subjBg = `var(--${key}, ${giu ? '#BCB8B2' : (numVal >= 6 ? 'rgba(40,205,65,0.12)' : 'rgba(255,59,48,0.12)')})`;
        const subjText = `var(--${key}-t, ${giu ? '#908C86' : (numVal >= 6 ? 'var(--green)' : 'var(--red)')})`;
        const subjDot = `var(--${key}-dot, ${giu ? '#BCB8B2' : (numVal >= 6 ? 'var(--green)' : 'var(--red)')})`;
        const encodedMat = encodeURIComponent(mat || '');
        return `
                        <div class="card" onclick="handleGradeSubjectClickFromEncoded('${encodedMat}')" style="padding:16px; display:flex; align-items:center; gap:16px; margin-bottom:0; cursor:pointer;">
                            <div style="width:54px; height:54px; border-radius:12px; background:${subjBg}; border:1px solid ${subjDot}30; display:flex; align-items:center; justify-content:center; font-size:${giu ? '14' : '24'}px; font-weight:800; color:${subjText};">${displayVal}</div>
                            <div style="flex:1; text-align:left;">
                                <div style="font-weight:700; font-size:16px; color:var(--text-primary);">${mat}</div>
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
            localStorage.setItem(lsKey('goals'), JSON.stringify(state.goals));
            saveTasks(); // Persist tasks
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
                    <div class="view">
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
                <div class="view">
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
                                            <h3 style="font-size: 17px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">${escapeHtml(e.subject)}</h3>
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
                    <div class="view">
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
                <div class="view">
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
                                    <div style="font-size: 11px; font-weight: 700; color: ${getSubjectColor(b.subject)}; text-transform: uppercase; margin-bottom: 4px;">${escapeHtml(b.subject)}</div>
                                    <div style="font-size: 15px; font-weight: 500; color: var(--text-primary); line-height: 1.3;">${escapeHtml(b.topic)}</div>
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
                                ${escapeHtml((p.name || 'S')[0].toUpperCase())}
                            </div>
                            <div style="flex-grow: 1;">
                                <div class="profile-name" style="font-weight: 700; font-size: 16px; color: white; margin-bottom: 4px;">${escapeHtml(p.name || ('Studente ' + (p.index + 1)))}</div>
                                <div class="profile-class" style="font-size: 13px; color: var(--text-secondary);">${escapeHtml(p.class || p.school || 'Caricamento...')}</div>
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
            const isPlanner = cb.closest('.planner-content') || cb.closest('#weekly-agenda-list');
            if (isPlanner) {
                cb.style.borderColor = t.done ? '#141414' : '#E5E5EA';
                cb.style.background = t.done ? '#141414' : 'transparent';
                cb.innerHTML = t.done ? '<i class="ph-bold ph-check" style="font-size:14px; color:#fff;"></i>' : '';
            } else {
                cb.style.borderColor = t.done ? '#141414' : '#DEDAD4';
                cb.style.background = t.done ? '#141414' : '#fff';
                cb.innerHTML = t.done ? '<svg width="8" height="5" viewBox="0 0 8 5"><path d="M1 2.5L3 4.5L7 1" stroke="white" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>' : '';
            }
            cb.style.transform = 'scale(0.85)';
            setTimeout(() => { cb.style.transform = 'scale(1)'; }, 120);
        });
        // Update text strikethrough
        document.querySelectorAll(`[data-task-text="${id}"]`).forEach(el => {
            el.style.textDecoration = t.done ? 'line-through' : 'none';
            el.style.opacity = t.done ? '0.5' : '1';
            el.style.color = t.done ? '#C8C4BE' : '';
        });

        // Update Home's Focus di Oggi toggle checkboxes (inline onclick) 
        updatePlanTaskUI(id, t.done);

        // Sync calendar events (lightweight, no full re-render)
        const calendarEl = document.getElementById('calendar');
        if (calendarEl && calendarEl._fullCalendar) {
            syncCalendarEvents(calendarEl._fullCalendar);
        }
        if (state.view === 'planner' && typeof renderCustomCalendar === 'function') renderCustomCalendar();

        // Refresh weekly agenda in-place if on planner
        if (state.view === 'planner') {
            const agendaEl = document.getElementById('weekly-agenda-list');
            if (agendaEl) {
                const newContent = renderWeeklyAgenda();
                const temp = document.createElement('div');
                temp.innerHTML = newContent;
                const newList = temp.querySelector('#weekly-agenda-list');
                if (newList) agendaEl.innerHTML = newList.innerHTML;
            }
        }

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

        // ✅ FIX: Update home view surgically, no full scheduleRender
        if (state.view === 'home' && typeof updateHomeView === 'function') updateHomeView();
    }
}
function showQuickAddTaskModal() {
    const subjects = [...new Set(state.tasks.map(t => t.subject).filter(Boolean))];
    const subjectOptions = subjects.length > 0
        ? subjects.map(s => `<option value="${s}">${escapeHtml(s)}</option>`).join('')
        : '<option value="Generale">Generale</option>';

    showModal(`
                <div style="padding: 28px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <h2 style="margin: 0; font-size: 22px; font-weight: 800; color: #141414;">Aggiungi Attività</h2>
                        <button onclick="closeModal()" style="width: 32px; height: 32px; border-radius: 10px; border: 1px solid #E0DDD8; background: #F6F5F3; color: #141414; cursor: pointer; display: flex; align-items: center; justify-content: center;"><i class="ph-bold ph-x" style="font-size: 14px;"></i></button>
                    </div>
                    <p style="font-family:'JetBrains Mono', monospace; font-size: 10px; color: #908C86; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 24px;">// AGGIUNGI_ATTIVITÀ_STUDIO</p>
                    <div style="display: flex; flex-direction: column; gap: 18px;">
                        <div>
                            <label style="font-family:'JetBrains Mono', monospace; font-size: 10px; font-weight: 800; color: #908C86; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; display: block;">Descrizione</label>
                            <input id="quickTaskText" type="text" placeholder="Es. Studiare cap. 5 Storia"
                                style="width: 100%; padding: 14px 16px; border-radius: 14px; border: 1px solid #E0DDD8; background: #F6F5F3; color: #141414; font-size: 14px; outline: none; box-sizing: border-box;" />
                        </div>
                        <div>
                            <label style="font-family:'JetBrains Mono', monospace; font-size: 10px; font-weight: 800; color: #908C86; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; display: block;">Materia</label>
                            <select id="quickTaskSubject" style="width: 100%; padding: 14px 16px; border-radius: 14px; border: 1px solid #E0DDD8; background: #F6F5F3; color: #141414; font-size: 15px; font-weight: 600; outline: none; box-sizing: border-box; -webkit-appearance: none;">
                                ${subjectOptions}
                            </select>
                        </div>
                        <div>
                            <label style="font-family:'JetBrains Mono', monospace; font-size: 10px; font-weight: 800; color: #908C86; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; display: block;">Data</label>
                            <input id="quickTaskDate" type="date" value="${getLocalDateString()}"
                                style="width: 100%; padding: 14px 16px; border-radius: 14px; border: 1px solid #E0DDD8; background: #F6F5F3; color: #141414; font-size: 15px; font-weight: 600; outline: none; box-sizing: border-box;" />
                        </div>
                    </div>
                    <button id="submit-quick-task-btn" onclick="submitQuickTask()" style="width: 100%; margin-top: 24px; padding: 16px; border-radius: 16px; border: none; background: #141414; color: #FFF; font-family:'JetBrains Mono', monospace; font-size: 13px; font-weight: 800; text-transform: uppercase; cursor: pointer; box-shadow: 0 4px 16px rgba(0,0,0,0.1); transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);">
                        <i class="ph-bold ph-plus" style="margin-right: 8px;"></i> Aggiungi al Planner
                    </button>
                    <style>#submit-quick-task-btn:active { transform: scale(0.96); opacity: 0.8; }</style>
                </div>
        `);
}
function showAddRegistroTaskModal() {
    const subjects = [...new Set(state.tasks.map(t => t.subject).filter(Boolean))];
    const subjectOptions = subjects.length > 0
        ? subjects.map(s => `<option value="${s}">${s}</option>`).join('')
        : '<option value="Generale">Generale</option>';

    showModal(`
                <div style="padding: 28px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <h2 style="margin: 0; font-size: 22px; font-weight: 800; color: #141414;">Nuova Verifica</h2>
                        <button onclick="closeModal()" style="width: 32px; height: 32px; border-radius: 10px; border: 1px solid #E0DDD8; background: #F6F5F3; color: #141414; cursor: pointer; display: flex; align-items: center; justify-content: center;"><i class="ph-bold ph-x" style="font-size: 14px;"></i></button>
                    </div>
                    <p style="font-family:'JetBrains Mono', monospace; font-size: 10px; color: #908C86; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 24px;">// AGGIUNGI_VERIFICA_O_ORALE</p>
                    <div style="display: flex; flex-direction: column; gap: 18px;">
                        <div>
                            <label style="font-family:'JetBrains Mono', monospace; font-size: 10px; font-weight: 800; color: #908C86; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; display: block;">Tipo</label>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                                <button id="tipo-scritta" onclick="selectRegistroTipo('scritta')" style="padding: 14px; border-radius: 14px; border: 2px solid #141414; background: #141414; color: #FFF; font-family:'JetBrains Mono', monospace; font-size: 12px; font-weight: 800; text-transform: uppercase; cursor: pointer; transition: all 0.2s;">✏️ Scritta</button>
                                <button id="tipo-orale" onclick="selectRegistroTipo('orale')" style="padding: 14px; border-radius: 14px; border: 1px solid #E0DDD8; background: #F6F5F3; color: #141414; font-family:'JetBrains Mono', monospace; font-size: 12px; font-weight: 800; text-transform: uppercase; cursor: pointer; transition: all 0.2s;">🎤 Orale</button>
                            </div>
                        </div>
                        <div>
                            <label style="font-family:'JetBrains Mono', monospace; font-size: 10px; font-weight: 800; color: #908C86; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; display: block;">Materia</label>
                            <select id="registroTaskSubject" style="width: 100%; padding: 14px 16px; border-radius: 14px; border: 1px solid #E0DDD8; background: #F6F5F3; color: #141414; font-size: 15px; font-weight: 600; outline: none; box-sizing: border-box; -webkit-appearance: none;">
                                ${subjectOptions}
                            </select>
                        </div>
                        <div>
                            <label style="font-family:'JetBrains Mono', monospace; font-size: 10px; font-weight: 800; color: #908C86; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; display: block;">Argomenti</label>
                            <textarea id="registroTaskArgs" placeholder="Es. Capitoli 3-5, Equazioni 2° grado" rows="2"
                                style="width: 100%; padding: 14px 16px; border-radius: 14px; border: 1px solid #E0DDD8; background: #F6F5F3; color: #141414; font-size: 14px; outline: none; resize: vertical; box-sizing: border-box;"></textarea>
                        </div>
                        <div>
                            <label style="font-family:'JetBrains Mono', monospace; font-size: 10px; font-weight: 800; color: #908C86; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; display: block;">Data</label>
                            <input id="registroTaskDate" type="date" value="${getLocalDateString()}"
                                style="width: 100%; padding: 14px 16px; border-radius: 14px; border: 1px solid #E0DDD8; background: #F6F5F3; color: #141414; font-size: 15px; font-weight: 600; outline: none; box-sizing: border-box;" />
                        </div>
                    </div>
                    <button id="submit-registro-btn" onclick="submitRegistroTask()" style="width: 100%; margin-top: 24px; padding: 16px; border-radius: 16px; border: none; background: #141414; color: #FFF; font-family:'JetBrains Mono', monospace; font-size: 13px; font-weight: 800; text-transform: uppercase; cursor: pointer; box-shadow: 0 4px 16px rgba(0,0,0,0.1); transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);">
                        <i class="ph-bold ph-plus" style="margin-right: 8px;"></i> Aggiungi Verifica
                    </button>
                    <style>
                        #submit-registro-btn:active { transform: scale(0.96); opacity: 0.8; }
                    </style>
                </div>
        `);
    window._registroTipo = 'scritta';
}
// --- Registro Tipo Selection ---
window.selectRegistroTipo = function (tipo) {
    window._registroTipo = tipo;
    const btnSc = document.getElementById('tipo-scritta');
    const btnOr = document.getElementById('tipo-orale');
    if (btnSc && btnOr) {
        if (tipo === 'scritta') {
            btnSc.style.cssText = 'padding:14px; border-radius:14px; border:2px solid #141414; background:#141414; color:#FFF; font-family:JetBrains Mono,monospace; font-size:12px; font-weight:800; text-transform:uppercase; cursor:pointer; transition:all 0.2s;';
            btnOr.style.cssText = 'padding:14px; border-radius:14px; border:1px solid #E0DDD8; background:#F6F5F3; color:#141414; font-family:JetBrains Mono,monospace; font-size:12px; font-weight:800; text-transform:uppercase; cursor:pointer; transition:all 0.2s;';
        } else {
            btnOr.style.cssText = 'padding:14px; border-radius:14px; border:2px solid #141414; background:#141414; color:#FFF; font-family:JetBrains Mono,monospace; font-size:12px; font-weight:800; text-transform:uppercase; cursor:pointer; transition:all 0.2s;';
            btnSc.style.cssText = 'padding:14px; border-radius:14px; border:1px solid #E0DDD8; background:#F6F5F3; color:#141414; font-family:JetBrains Mono,monospace; font-size:12px; font-weight:800; text-transform:uppercase; cursor:pointer; transition:all 0.2s;';
        }
    }
};
// --- Submit Registro Task (Handled in index.html) ---
// (Moved to correct global scope with Supabase integration in index.html)
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
                                    <input type="checkbox" value="${escapeHtml(s.name)}" class="competency-check" id="comp-${s.name.replace(/[^a-zA-Z0-9]/g, '_')}" ${s.media < 6.5 || s.savedLevel < 3 ? 'checked' : ''} style="accent-color: var(--accent); width: 22px; height: 22px; cursor: pointer;" onclick="event.stopPropagation()" />
                                    <span style="background: ${s.color}; width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;"></span>
                                    <div style="flex: 1; min-width: 0;">
                                        <div style="font-size: 15px; font-weight: 700; color: white;">${escapeHtml(s.name)}</div>
                                        <div style="font-size: 11px; color: var(--text-dim); margin-top: 2px;">${s.count > 0 ? `Media: ${s.media.toFixed(2)} · ${s.priority}` : 'Nessun voto'}</div>
                                    </div>
                                </div>
                                <div style="display: flex; flex-direction: column; gap: 8px; padding-left: 2px;">
                                    <div style="display: flex; justify-content: space-between; align-items: center;">
                                        <span style="font-size: 11px; color: var(--text-dim); text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Preparazione:</span>
                                        <span id="prep-label-${s.name.replace(/[^a-zA-Z0-9]/g, '_')}" style="font-size: 12px; color: var(--accent); font-weight: 800;">${escapeHtml(levelLabels[s.savedLevel])}</span>
                                    </div>
                                    <div style="height: 48px; display: flex; align-items: center;">
                                        <input type="range" min="1" max="5" value="${s.savedLevel}" class="prep-slider" data-subject="${escapeHtml(s.name)}"
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
                                        <div style="font-weight: 700; font-size: 16px; color: white;">${escapeHtml(t.text)}</div>
                                        <div style="font-size: 12px; color: ${subjectColor}; font-weight: 800; text-transform: uppercase;">${escapeHtml(t.subject)}</div>
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
                                                    <div style="font-size: 14px; font-weight: 600; color: white; ${t.done ? 'opacity: 0.5; text-decoration: line-through;' : ''}">${escapeHtml(t.text)}</div>
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
function updateMediaWidget(value) { renderMediaGauge(value); }
function initHomeWidgets({ mediaValue = 7.64 } = {}) {
    renderMediaGauge(mediaValue);
}
function togglePollCreatorUI() {
    const ui = document.getElementById('poll-creator-ui');
    if (ui) {
        ui.style.display = (ui.style.display === 'none' || ui.style.display === '') ? 'block' : 'none';
    }
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
        e.target.classList.contains('hero-container') ||
        e.target.classList.contains('greeting-card')) {
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


// ── RENDERING HEART & NAVIGATION SETTINGS ──
window.allowedViews = ['home', 'planner', 'voti', 'ai_assistant', 'academic_profile', 'profile', 'circolari'];

window.currentViewFromHash = function () {
    const v = (location.hash || '').replace('#', '').trim();
    return window.allowedViews.includes(v) ? v : null;
};

// ── Rendering Deduplication Lock ──
let _lastRenderTime = 0;
const RENDER_MIN_GAP = 50; // ms
// Shared globals so fluidity-engine-v3.js can cancel/take over timers
window._gRenderRAF = null;
window._gRenderTimer = null;

window.render = function () {
    if (window._gRenderRAF || state.booting) return;
    const now = performance.now();
    if (now - _lastRenderTime < RENDER_MIN_GAP) {
        clearTimeout(window._gRenderTimer);
        window._gRenderTimer = setTimeout(window.render, RENDER_MIN_GAP);
        return;
    }
    _lastRenderTime = now;
    window._gRenderRAF = requestAnimationFrame(() => {
        window._renderCore();
        window._gRenderRAF = null;
    });
};

window.scheduleRender = function (delay = 80) {
    clearTimeout(window._gRenderTimer);
    if (delay === 0) {
        window._gRenderTimer = setTimeout(window.render, 16);
    } else {
        window._gRenderTimer = setTimeout(window.render, delay);
    }
};

window._renderCore = function () {
    const root = document.getElementById('app');
    const nav = document.getElementById('nav-container');
    if (!root || !nav) return;

    if (!state.isLoggedIn) {
        root.innerHTML = renderLogin();
        nav.innerHTML = '';
        return;
    }

    nav.innerHTML = renderNav();

    // Fix: Set AI mode class BEFORE innerHTML so CSS rules are active during first layout
    const isAI = state.view === 'ai_assistant';
    if (isAI) {
        document.body.classList.add('is-ai-mode');
        document.body.style.overflow = 'hidden';
        document.body.style.height = '100svh';
        root.style.overflow = 'hidden';
        root.style.height = '100%';
    } else {
        document.body.classList.remove('is-ai-mode');
        document.body.style.overflow = '';
        document.body.style.height = '';
        root.style.overflow = 'visible';
        root.style.height = '';
    }

    let html = '';
    switch (state.view) {
        case 'home': html = renderHome(); break;
        case 'planner': html = renderPlanner(); break;
        case 'voti': html = renderGradesView(); break;
        case 'ai_assistant': html = renderAIAssistantView(); break;
        case 'academic_profile': html = renderAcademicProfile(); break;
        case 'profile': html = renderProfile(); break;
        case 'circolari': html = (typeof renderCircolariView === 'function') ? renderCircolariView() : renderHome(); break;
        default: html = renderHome(); break;
    }

    root.innerHTML = html;
    if (typeof updateOfflineBadge === 'function') updateOfflineBadge();

    requestAnimationFrame(() => {
        if (state.view === 'home') {
            const mediaVal = parseFloat(calcolaMedia(state.voti)) || 0;

            if (typeof renderMediaGauge === 'function') renderMediaGauge(mediaVal);
        }
        if (state.view === 'planner') {
            if (typeof renderCustomCalendar === 'function') renderCustomCalendar();
        }
        if (state.view === 'voti' && typeof initGradesCharts === 'function') {
            initGradesCharts();
        }

        if (typeof gsapAnimateView === 'function') {
            gsapAnimateView();
        }
        if (window.removeLoader) window.removeLoader();
    });
};

// ── UI HELPERS & PROFILE ──
window.logout = async function () {
    if (confirm('Sei sicuro di voler disconnettere? I tuoi planner e feed saranno mantenuti.')) {
        const currentUserId = getUserId();
        const currentLsPrefix = getActiveProfileKey();

        if (currentUserId && currentUserId !== 'guest') {
            localStorage.setItem(`${currentLsPrefix}:planned_tasks`, JSON.stringify(state.plannedTasks || {}));
            localStorage.setItem(`${currentLsPrefix}:planner_updated_at`, new Date().toISOString());

            try {
                const payload = {
                    plannedTasks: state.plannedTasks || {},
                    plannedDetails: {},
                    updatedAt: new Date().toISOString()
                };
                await fetch(`${API_BASE_URL}/api/planner/${encodeURIComponent(currentUserId)}`, {
                    method: 'PUT',
                    headers: getSessionHeaders(),
                    body: JSON.stringify(payload)
                });
            } catch (e) { console.warn("Logout save failed", e); }
        }

        sessionManager.clear();
        if (typeof supabaseClient !== 'undefined' && supabaseClient.auth) supabaseClient.auth.signOut();

        state.isLoggedIn = false;
        state.didup.connected = false;
        state.user = { name: '', class: '' };
        state.tasks = [];
        state.voti = [];
        state.promemoria = [];
        state.isOffline = false;
        state.lastSync = null;
        state.plannedTasks = {};

        state.view = 'login';
        if (window._threadsPoller) clearInterval(window._threadsPoller);
        window.scheduleRender();
    }
};

window.saveProfileToServer = async function (profileData) {
    const userId = getUserId();
    const response = await fetch(`${API_BASE_URL}/api/profile`, {
        method: 'PUT',
        headers: getSessionHeaders(),
        body: JSON.stringify({
            userId: userId,
            name: profileData.name || state.user.name,
            class: profileData.class || state.user.class,
            specialization: profileData.specialization || state.user.specialization,
            avatar: null
        })
    });
    return await response.json();
};

window.saveProfileChanges = async function () {
    const newNameInput = document.getElementById('edit-user-name');
    if (!newNameInput) return;
    const newName = newNameInput.value.trim();
    if (!newName) return alert("Inserisci almeno il nome");

    try {
        if (typeof showBoot === 'function') showBoot("Salvataggio profilo...");
        await window.saveProfileToServer({ name: newName });
        state.user.name = newName;
        localStorage.setItem(lsKey('user'), JSON.stringify(state.user));
        closeModal();
        window.scheduleRender();
        if (typeof hideBoot === 'function') hideBoot();
    } catch (error) {
        if (typeof hideBoot === 'function') hideBoot();
        alert("❌ Errore durante il salvataggio: " + error.message);
    }
};

// ── QUOTES ──
const MOTIVATIONAL_QUOTES = [
    "Il successo è la somma di piccoli sforzi, ripetuti giorno dopo giorno.",
    "There is no tomorrow", "No risk, no story",
    "Non contare i giorni, fai in modo che i giorni contino.",
    "La perseveranza batte il talento quando il talento non persevera.",
    "L'unico modo per fare un ottimo lavoro è amare quello che fai.",
    "Il fallimento è solo l'opportunità di iniziare di nuovo con più intelligenza.",
    "Il miglior momento per piantare un albero era 20 anni fa. Il secondo miglior momento è ora.",
    "Non importa quanto vai piano, l'importante è che non ti fermi.",
    "La tua unica limitazione è la tua immaginazione.",
    "Fai oggi ciò che gli altri non faranno, così domani potrai fare ciò che gli altri non potranno.",
    "La disciplina è fare ciò che va fatto, quando va fatto, anche se non ne hai voglia.",
    "Ogni grande traguardo inizia con la decisione di provare.",
    "Le difficoltà spesso preparano le persone comuni a un destino straordinario.",
    "La motivazione ti dà la spinta, l'abitudine ti fa andare avanti.",
    "Credi in te stesso e sarai a metà strada.",
    "Se puoi sognarlo, puoi farlo.",
    "Il successo non è definitivo, il fallimento non è fatale: ciò che conta è il coraggio di continuare.",
    "Punta alla luna. Anche se sbagli, atterrerai tra le stelle.",
    "Non aspettare che le condizioni siano perfette. Inizia dove sei, usa quello che hai, fai quello che puoi.",
    "La tua mente è la tua risorsa più preziosa. Coltivala.",
    "Ogni errore è una lezione appresa sul cammino verso il successo.",
    "La pazienza è amara, ma il suo frutto è dolce.",
    "Sogna in grande, lavora sodo, rimani umile.",
    "Non smettere mai di imparare, perché la vita non smette mai di insegnare.",
    "Il segreto per andare avanti è iniziare.",
    "La qualità non è un atto, è un'abitudine.",
    "Sii il cambiamento che vuoi vedere nel mondo.",
    "Non paragonare il tuo inizio con la metà del film di qualcun altro.",
    "Colui che sposta una montagna inizia portando via piccole pietre.",
    "Il futuro appartiene a coloro che credono nella bellezza dei propri sogni.",
    "La felicità non è qualcosa di pronto all'uso. Viene dalle tue stesse azioni.",
    "L'ostacolo è la via.", "Rimani concentrato sui tuoi obiettivi, non sulle distrazioni.",
    "Ogni giorno è una nuova opportunità per migliorare.",
    "La forza non deriva dalla capacità fisica, ma da una volontà indomita.",
    "Non fermarti quando sei stanco. Fermati quando hai finito.",
    "L'eccellenza non si ottiene in un giorno, ma attraverso la costanza.",
    "Trasforma le tue ferite in saggezza.",
    "La vita è per il 10% cosa ti accade e per il 90% come reagisci.",
    "Se vuoi qualcosa che non hai mai avuto, devi fare qualcosa che non hai mai fatto.",
    "Agisci come se quello che fai facesse la differenza. La fa.",
    "Non guardare l'orologio; fai quello che fa lui. Continua ad andare.",
    "La tua velocità non conta finché non smetti di muoverti.",
    "Il successo è camminare da un fallimento all'altro senza perdere l'entusiasmo.",
    "Le persone che hanno successo sono quelle che si alzano e cercano le circostanze che vogliono.",
    "Credere di poterlo fare è già metà del lavoro.",
    "Non lasciare che ieri occupi troppo di oggi.",
    "Se non ora, quando?",
    "L'unico limite ai nostri traguardi di domani saranno i nostri dubbi di oggi.",
    "Fai del tuo meglio, e il resto verrà da sé.",
    "Sii orgoglioso di quanto sei arrivato lontano. Abbi fede in quanto lontano puoi andare."
];

window.getDailyQuote = function () {
    const todayStr = getLocalDateString();
    try {
        const cached = JSON.parse(localStorage.getItem('mh_daily_quote') || '{}');
        if (cached.quote && cached.date === todayStr) return cached.quote;
    } catch (e) { }
    const randomQuote = MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)];
    localStorage.setItem('mh_daily_quote', JSON.stringify({ quote: randomQuote, date: todayStr }));
    return randomQuote;
};

window.refreshDailyQuote = async function (btn) {
    if (btn) {
        const icon = btn.querySelector('i');
        if (icon) icon.style.transform = 'rotate(360deg)';
        btn.style.opacity = '0.3';
    }
    const todayStr = getLocalDateString();
    const currentQuote = window.getDailyQuote();
    let newQuote = currentQuote;
    for (let i = 0; i < 5; i++) {
        newQuote = MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)];
        if (newQuote !== currentQuote) break;
    }
    localStorage.setItem('mh_daily_quote', JSON.stringify({ quote: newQuote, date: todayStr }));
    await new Promise(r => setTimeout(r, 400));
    if (btn) {
        const icon = btn.querySelector('i');
        if (icon) icon.style.transform = 'rotate(0deg)';
        btn.style.opacity = '0.6';
    }
    window.scheduleRender();
};

window.refreshCircolari = function () {
    if (typeof showToast === 'function') showToast('Aggiornamento circolari...');
    if (typeof loadCircolari === 'function') loadCircolari();
};

window.requestCircularSynthesis = async function (id, link) {
    const btn = document.getElementById(`btn-sintesi-${id}`);
    const placeholder = document.getElementById(`sintesi-placeholder-${id}`);
    if (btn) btn.style.display = 'none';
    if (placeholder) {
        placeholder.innerHTML = `
            <div class="sintesi-progress-container" style="width:100%; max-width:300px; margin:0 auto; text-align:left;">
                <span id="sintesi-progress-label-${id}" class="sintesi-progress-label">INITIALIZING_ENGINE</span>
                <div class="sintesi-progress-bg">
                    <div id="sintesi-progress-bar-${id}" class="sintesi-progress-fill" style="width:0%;"></div>
                </div>
            </div>`;
    }
    const label = document.getElementById(`sintesi-progress-label-${id}`);
    const bar = document.getElementById(`sintesi-progress-bar-${id}`);
    let progress = 0;
    const stages = [
        { limit: 25, text: "SCANNING_METADATA", duration: 1500 },
        { limit: 50, text: "FETCHING_PDF_STREAM", duration: 2500 },
        { limit: 75, text: "EXTRACTING_TEXT_LAYER", duration: 3500 },
        { limit: 90, text: "NEURAL_SYNTHESIS_RUNNING", duration: 5000 }
    ];
    let currentStage = 0;
    const interval = setInterval(() => {
        if (progress >= 90 || !bar) { clearInterval(interval); return; }
        progress += (90 / 120);
        bar.style.width = progress + '%';
        if (currentStage < stages.length && progress > stages[currentStage].limit) {
            if (label) label.innerText = stages[currentStage].text;
            currentStage++;
        }
    }, 100);
    if (typeof window.loadCircolareSintesi === 'function') await window.loadCircolareSintesi(id, link);
    clearInterval(interval);
};

window.loadCircolareSintesi = async function (id, link) {
    try {
        console.log(`[Network] Sintesi Request: ${id}`);
        const response = await fetch(`${API_BASE_URL}/api/circolari/sintesi`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, link })
        });
        const data = await response.json();
        if (data.success && data.sintesi) {
            const circolare = state.circolari.find(c => c.id === id);
            if (circolare) circolare.sintesi = data.sintesi;

            const box = document.getElementById(`sintesi-box-${id}`);
            if (box) {
                box.innerHTML = `
                    <div class="ai-prose" style="animation: fadeIn 0.4s ease-out;">
                        ${marked.parse(data.sintesi)}
                    </div>`;
            }
        } else {
            const label = document.getElementById(`sintesi-progress-label-${id}`);
            if (label) {
                label.innerText = "ERROR: ANALYSIS_FAILED";
                label.style.color = "var(--red)";
            }
        }
    } catch (e) {
        console.error("Synthesis error:", e);
        const label = document.getElementById(`sintesi-progress-label-${id}`);
        if (label) {
            label.innerText = "ERROR: NETWORK_TIMEOUT";
            label.style.color = "var(--red)";
        }
    }
};

// ── PLANNER & QUESTS ──
window.refreshPlanWeekModalContent = function () {
    const contentEl = document.getElementById('plan-week-modal-content');
    if (!contentEl) return;
    const todayStr = getLocalDateString();
    const todayDate = new Date();
    const dayLabels = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
    const next7Days = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(todayDate);
        d.setDate(todayDate.getDate() + i);
        const ds = getLocalDateString(d);
        next7Days.push({ date: d, dateStr: ds, label: dayLabels[d.getDay()], dayNum: d.getDate() });
    }
    const now2w = new Date(); now2w.setHours(0, 0, 0, 0);
    const twoWeeksLater = new Date(now2w); twoWeeksLater.setDate(now2w.getDate() + 14);
    const calendarTasks = state.tasks.filter(t => {
        if (t.done || !t.due_date || t.subject === 'QUEST' || t.id.startsWith('ai_')) return false;
        const d = parseArgoDate(t.due_date);
        return d >= now2w && d <= twoWeeksLater;
    });
    contentEl.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; padding: 0 4px;">
            <h2 style="margin:0; font-family:'Inter', sans-serif; font-size: 24px; font-weight: 800; color: #141414; letter-spacing: -0.02em;">Pianifica Settimana</h2>
            <button onclick="closeModal()" style="background:#F0EDE8; border:none; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#141414;">
                <i class="ph ph-x" style="font-size: 18px;"></i>
            </button>
        </div>
        <div style="display: flex; flex-direction: column; gap: 20px; max-height: 520px; overflow-y: auto; padding-right: 8px; padding-bottom: 20px;">
            ${calendarTasks.length === 0 ? '<div style="text-align:center; padding:40px 20px; color:#908C86; font-family:JetBrains Mono, monospace; font-size:12px; text-transform:uppercase;">Nessun compito nelle prossime 2 settimane.</div>' : ''}
            ${calendarTasks.map(t => {
        const subContent = t.subject || 'N/A';
        const abbr = getSubjectAbbrev(subContent);
        const key = abbr.toLowerCase();
        return `
                <div style="background: #FFFFFF; padding: 20px; border-radius: 20px; border: 1px solid #E0DDD8; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
                    <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 14px;">
                        <div style="min-width: 0; flex:1;">
                            <div style="font-family:'JetBrains Mono', monospace; font-size: 9px; font-weight: 800; color: var(--${key}-t, #141414); text-transform: uppercase; letter-spacing: 0.1em; background: var(--${key}, #EEE); padding: 3px 8px; border-radius: 6px; display: inline-block; margin-bottom: 8px;">${escapeHtml(subContent)}</div>
                            <div style="font-size: 15px; font-weight: 700; color: #141414; line-height: 1.4; padding-right: 10px;">${escapeHtml(t.text)}</div>
                        </div>
                    </div>
                    <div style="display: flex; gap: 6px;">
                        ${next7Days.map(day => {
            const isPlanned = state.plannedTasks[day.dateStr] && state.plannedTasks[day.dateStr].includes(t.id);
            const isToday = day.dateStr === todayStr;
            return `
                            <div data-task-id="${t.id}" data-date="${day.dateStr}" 
                                onclick="togglePlanDay('${t.id}', '${day.dateStr}')"
                                style="flex: 1; text-align:center; padding: 12px 4px; border-radius: 14px; cursor: pointer; transition: all 0.2s;
                                background: ${isPlanned ? '#141414' : '#F6F5F3'};
                                color: ${isPlanned ? 'white' : '#908C86'};
                                border: ${isToday ? '2px solid #007AFF' : '1px solid #E0DDD8'};">
                                <div style="font-family:'JetBrains Mono', monospace; font-size: 9px; font-weight: 700; margin-bottom: 4px; opacity: ${isPlanned ? '0.6' : '1'};">${day.label.toUpperCase()}</div>
                                <div style="font-weight: 800; font-size: 15px; letter-spacing: -0.02em;">${day.dayNum}</div>
                            </div>`;
        }).join('')}
                    </div>
                </div>`;
    }).join('')}
        </div>
        <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #F0EDE8;">
            <button onclick="closeModal()" style="width: 100%; height: 50px; background: #141414; color: white; border: none; border-radius: 16px; font-size: 15px; font-weight: 800; cursor: pointer; transition: transform 0.2s;">Fatto</button>
        </div>`;
};

window.updateWeekDayButton = function (taskId, dateStr) {
    const isPlanned = state.plannedTasks[dateStr] && state.plannedTasks[dateStr].includes(taskId);
    const todayStr = getLocalDateString();
    document.querySelectorAll(`[data-task-id="${taskId}"][data-date="${dateStr}"]`).forEach(btn => {
        if (isPlanned) {
            btn.style.background = '#141414';
            btn.style.borderColor = '#141414';
            btn.style.color = 'white';
        } else {
            btn.style.background = '#F6F5F3';
            btn.style.borderColor = (dateStr === todayStr) ? '#007AFF' : '#E0DDD8';
            btn.style.color = '#908C86';
        }
    });
};

window.addCustomQuestFromInput = function () {
    const textInput = document.getElementById('quest-text-input');
    const dateSelect = document.getElementById('quest-date-select');
    if (!textInput || !dateSelect) return;
    const text = textInput.value.trim();
    const dateStr = dateSelect.value;
    if (!text) return showToast('Inserisci un compito!');
    const quest = { id: 'quest-' + Date.now(), text, subject: 'QUEST', due_date: dateStr, done: false };
    state.tasks.push(quest);
    if (!state.plannedTasks[dateStr]) state.plannedTasks[dateStr] = [];
    state.plannedTasks[dateStr].push(quest.id);
    if (typeof saveTasks === 'function') saveTasks();
    if (typeof debouncedSavePlannerRemote === 'function') debouncedSavePlannerRemote(500);
    showToast('Compito aggiunto!');
    textInput.value = '';
    window.refreshPlanWeekModalContent();
    if (typeof notifyPlannerChanged === 'function') notifyPlannerChanged();
};

window.selectDay = function (day) {
    state.selectedDay = day;
    window.scheduleRender();
};

window.getVotiData = function () {
    return (state.voti && state.voti.length > 0) ? state.voti : ((state.grades && state.grades.length > 0) ? state.grades : []);
};

window.getAllSubjects = function () {
    const fromGrades = window.getVotiData().map(v => v.materia || v.subject).filter(Boolean);
    const fromTasks = (state.tasks || []).map(t => t.subject).filter(Boolean);
    const fromExams = (state.exams || []).map(e => e.subject).filter(Boolean);
    const all = [...new Set([...fromGrades, ...fromTasks, ...fromExams])];
    return all.length === 0 ? ['Italiano', 'Matematica', 'Inglese', 'Storia', 'Scienze', 'Fisica', 'Filosofia', 'Arte', 'Ed. Fisica', 'Religione'] : all.sort();
};

window.submitExamForm = function () {
    let subject = document.getElementById('examSubject').value;
    if (subject === '__custom') {
        subject = (document.getElementById('examCustomSubject').value || '').trim();
        if (!subject) return showToast('Inserisci il nome della materia', '#ff453a');
    }
    const type = document.getElementById('examType').value;
    const date = document.getElementById('examDate').value;
    const topic = (document.getElementById('examTopic').value || '').trim();
    if (!date) return showToast('Seleziona una data', '#ff453a');
    state.exams.push({ subject, type, date, topic });
    const examTask = { id: 'exam_' + Date.now(), text: `${type}: ${topic || subject}`, subject, due_date: date, done: false, isExam: true };
    state.tasks.push(examTask);
    if (typeof saveTasks === 'function') saveTasks();
    closeModal();
    window.scheduleRender();
    showToast(`✅ ${type} di ${subject} aggiunta al ${date}!`, 'var(--green)');
};

window.removeExam = function (index) {
    state.exams.splice(index, 1);
    if (typeof saveTasks === 'function') saveTasks();
    window.scheduleRender();
};

window.submitBacklogForm = function () {
    const subject = document.getElementById('backlogSubject').value;
    const topic = (document.getElementById('backlogTopic').value || '').trim();
    if (!topic) return showToast('Inserisci l\'argomento da recuperare', '#ff453a');
    state.backlog.push({ subject, topic });
    if (typeof saveTasks === 'function') saveTasks();
    closeModal();
    window.scheduleRender();
    showToast(`📚 Arretrato di ${subject} aggiunto!`, 'var(--green)');
};

window.removeBacklog = function (index) {
    state.backlog.splice(index, 1);
    if (typeof saveTasks === 'function') saveTasks();
    window.scheduleRender();
};

// ── AI ASSISTANT HELPERS ──
window.sendAIChatQuick = function (text) {
    state.aiChatInputValue = '';
    const input = document.getElementById('aiChatInput');
    if (input) input.value = text;
    window.sendAIChat();
};

window.clearAIChat = function () {
    state.aiChatHistory = [];
    localStorage.setItem(lsKey('ai_chat'), '[]');
    state.aiResponse = '';
    window.scheduleRender();
};

window.deleteAIChatMessage = function (index) {
    if (!confirm('Eliminare questo messaggio?')) return;
    state.aiChatHistory.splice(index, 1);
    localStorage.setItem(lsKey('ai_chat'), JSON.stringify(state.aiChatHistory));
    window.scheduleRender();
};

window.stopVoiceInput = function () {
    if (window.recognition) { window.recognition.stop(); window.recognition = null; }
    const btn = document.getElementById('aiMicBtn');
    if (btn) { btn.classList.remove('mic-active'); btn.innerHTML = '<i class="ph ph-microphone"></i>'; }
};

window.sendAIChat = async function () {
    window.stopVoiceInput();
    const input = document.getElementById('aiChatInput');
    const text = (input?.value || '').trim();
    if (!text) return;
    state.aiChatInputValue = '';
    const nowTs = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    state.aiChatHistory.push({ role: 'user', text, ts: nowTs });
    if (input) { input.value = ''; input.style.height = 'auto'; }
    window.scheduleRender();
    setTimeout(() => { const chatDiv = document.getElementById('aiChatMessages'); if (chatDiv) chatDiv.scrollTo({ top: chatDiv.scrollHeight, behavior: 'smooth' }); }, 100);

    const today = new Date();
    const todayStr = getLocalDateString();
    const hour = today.getHours();
    const endOfWeek = new Date(today);
    endOfWeek.setDate(today.getDate() + (7 - today.getDay()));

    const argoTasks = (state.tasks || []).filter(t => {
        if (t.done || t.id.startsWith('ai_') || t.subject === 'QUEST') return false;
        if (!t.due_date) return true;
        if (hour >= 14 && t.due_date <= todayStr) return false;
        return true;
    }).sort((a, b) => (a.due_date || '9999') < (b.due_date || '9999') ? -1 : 1);

    const thisWeekTasks = [], laterTasks = [];
    argoTasks.forEach(t => {
        const dueDate = t.due_date ? parseArgoDate(t.due_date) : null;
        const dueDateStr = dueDate ? dueDate.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }) : 'N/D';
        const entry = `- [${t.subject}] ${t.text} → consegna: ${dueDateStr}`;
        (dueDate && dueDate <= endOfWeek) ? thisWeekTasks.push(entry) : laterTasks.push(entry);
    });

    const exams = (state.exams || []).map(ex => `- ${ex.type} di ${ex.subject} il ${ex.date} (${ex.topic || 'gen.'})`).join('\n');
    const verifiche = (state.verifiche || []).map(v => `- ${v.materia || v.subject || 'Materia'}: ${v.argomento || v.topic || 'N/D'} (${v.data || v.date || 'data non indicata'})`).join('\n');
    const reminders = (state.reminders || state.promemoria || []).slice(0, 12).map(r => `- ${r.text || r.title || r.descrizione || r.oggetto || 'Promemoria'}`).join('\n');
    const backlog = (state.backlog || []).slice(0, 12).map(b => `- ${b.subject || 'Generale'}: ${b.text || b.title || b.task || ''}`).join('\n');
    const grades = (state.voti || []).slice(0, 25).map(v => `- ${v.materia || v.subject || 'Materia'}: ${v.valore || v.value || 'N/D'} (${v.data || v.date || 'data n/d'})`).join('\n');
    const attendanceSummary = state.assenzeData ? [
        `Assenze totali: ${state.assenzeData.totaleAssenze ?? 0}`,
        `Ritardi totali: ${state.assenzeData.totaleRitardi ?? 0}`,
        `Uscite totali: ${state.assenzeData.totaleUscite ?? 0}`,
        `Ore assenza totali: ${state.assenzeData.oreAssenzaTotali ?? 0}`,
        `Da giustificare: ${state.assenzeData.daGiustificare ?? 0}`
    ].join(' | ') : 'Nessun dato presenze/assenze disponibile';

    const plannedSummary = Object.entries(state.plannedTasks || {}).filter(([date]) => date >= todayStr).map(([date, ids]) => {
        const dayTasks = ids.map(id => { const t = (state.tasks || []).find(x => x.id === id); return t ? `[${t.subject}] ${t.text}` : null; }).filter(Boolean);
        return dayTasks.length ? `  ${date}: ${dayTasks.join(', ')}` : null;
    }).filter(Boolean).join('\n');

    const systemContext = `Sei G-AI, tutor di G-Diary.
Stile: amichevole, pratico, meno rigido, incoraggiante e chiaro.
Rispondi in italiano naturale.

OGGI: ${today.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
PROFILO: ${state.user?.name || 'Studente'} (${state.user?.class || 'classe n/d'})
DISPONIBILITÀ: ${state.availability?.start || '15:00'}-${state.availability?.end || '19:00'}
ULTIMO SYNC: ${state.lastSync || 'n/d'} | STREAK: ${state.streak ?? 0}

🔴 SCADENZE QUESTA SETTIMANA:
${thisWeekTasks.length ? thisWeekTasks.join('\n') : 'Nessuna'}

📋 COMPITI FUTURI:
${laterTasks.length ? laterTasks.join('\n') : 'Nessuno'}

📝 ESAMI:
${exams || 'nessuno'}

📚 VERIFICHE:
${verifiche || 'nessuna'}

📊 VOTI RECENTI:
${grades || 'nessuno'}

📌 PROMEMORIA:
${reminders || 'nessuno'}

🧩 BACKLOG:
${backlog || 'vuoto'}

🏫 PRESENZE/ASSENZE:
${attendanceSummary}

🗓️ GIÀ PIANIFICATO:
${plannedSummary || 'Niente pianificato'}

OBIETTIVI:
${JSON.stringify(state.goals || {}, null, 2)}

REGOLE OPERATIVE:
1) Puoi usare TUTTI i dati sopra per decidere cosa proporre.
2) Quando l'utente chiede pianificazione giornaliera o settimanale, usa una tabella Markdown semplice (non troppo elaborata), es. colonne: Giorno | Fascia oraria | Attività | Priorità.
3) Prima di proporre il piano definitivo, se mancano dettagli essenziali fai 2-4 domande brevi su: livello di preparazione, urgenza/immediatezza, priorità, eventuali vincoli orari.
4) Se ci sono dati su assenze/ritardi/da giustificare, ricordali in modo utile e non giudicante.
5) Mantieni risposte utili e concrete, evitando rigidità e formalismi eccessivi.`;

    const contents = [{ role: 'user', parts: [{ text: systemContext }] }, { role: 'model', parts: [{ text: 'Capito! Sono il tuo tutor AI. Come posso aiutarti oggi? 📚' }] }];
    state.aiChatHistory.forEach(msg => contents.push({ role: msg.role === 'user' ? 'user' : 'model', parts: [{ text: msg.text }] }));

    try {
        const response = await fetch(`${API_BASE_URL}/api/ai/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: contents }) });
        const data = await response.json();
        if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
            const aiText = data.candidates[0].content.parts[0].text;
            const hasPlan = /\b\d{1,2}[:.]\d{2}\b/.test(aiText) && /lune|mart|merc|giov|vend|sab|dom|\d{4}-\d{2}-\d{2}/i.test(aiText);
            state.aiChatHistory.push({ role: 'ai', text: aiText, ts: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }), hasPlan });
        } else {
            state.aiChatHistory.push({ role: 'ai', text: '⚠️ IA momentaneamente non disponibile.', ts: nowTs });
        }
    } catch (e) { state.aiChatHistory.push({ role: 'ai', text: '⚠️ Errore di connessione.', ts: nowTs }); }

    localStorage.setItem(lsKey('ai_chat'), JSON.stringify(state.aiChatHistory));
    window.scheduleRender();
    setTimeout(() => { const chatDiv = document.getElementById('aiChatMessages'); if (chatDiv) chatDiv.scrollTop = chatDiv.scrollHeight; }, 50);
};

window.applyAIPlanFromChat = function (msgIndex) {
    const msg = state.aiChatHistory[msgIndex];
    if (!msg || msg.role !== 'ai') return;
    const todayStr = getLocalDateString();
    let currentDate = todayStr, addedCount = 0;
    const DAY_IT = { lune: 1, lunedì: 1, mart: 2, martedì: 2, merc: 3, mercoledì: 3, giov: 4, giovedì: 4, vend: 5, venerdì: 5, sab: 6, sabato: 6, dom: 0, domenica: 0 };

    msg.text.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;
        const cleanLine = trimmed.replace(/[#*_\[\]]/g, '').trim().toLowerCase();

        // Check for date/day header
        let foundDate = null;
        const isoMatch = trimmed.match(/(\d{4}-\d{2}-\d{2})/);
        if (isoMatch) foundDate = isoMatch[1];
        else {
            for (const [key, dNum] of Object.entries(DAY_IT)) {
                if (cleanLine.includes(key) && !/\d{1,2}[:.]\d{2}/.test(cleanLine)) {
                    const d = new Date(); d.setDate(d.getDate() + (dNum - d.getDay()));
                    foundDate = getLocalDateString(d); break;
                }
            }
        }
        if (foundDate) { currentDate = foundDate; return; }

        const timeMatch = trimmed.match(/(\d{1,2})[.:](\d{2})/);
        if (!timeMatch) return;
        const timeStr = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
        let taskText = trimmed.replace(/^[#*\->\s•·]+/, '').replace(/\d{1,2}[.:]\d{2}(\s*[-–—]\s*\d{1,2}[.:]\d{2})?/, '').replace(/^[:\-–—\s]+/, '').trim();
        if (/pausa|break|riposo/i.test(taskText) || taskText.length < 2) return;

        let subject = 'Studio', topic = taskText;
        const bracketMatch = taskText.match(/^\[?([^\]\-–—:]+)[\]\-–—:\s]+(.+)$/);
        if (bracketMatch) { subject = bracketMatch[1].trim(); topic = bracketMatch[2].trim(); }
        subject = subject.replace(/[^\p{L}\s]/gu, '').trim();
        subject = subject.charAt(0).toUpperCase() + subject.slice(1).toLowerCase();

        const newTask = { id: 'ai_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5), subject, text: `[AI] ${timeStr} — ${topic}`, due_date: currentDate, done: false, created_at: new Date().toISOString() };
        state.tasks.push(newTask);
        if (!state.plannedTasks[currentDate]) state.plannedTasks[currentDate] = [];
        state.plannedTasks[currentDate].push(newTask.id);
        addedCount++;
    });

    if (addedCount > 0) {
        if (typeof saveTasks === 'function') saveTasks();
        if (typeof debouncedSavePlannerRemote === 'function') debouncedSavePlannerRemote(300);
        showToast(`✅ ${addedCount} sessioni aggiunte al Planner!`, 'var(--green)');
        setTimeout(() => window.navigate('planner'), 900);
    } else showToast('⚠️ Nessuna sessione valida trovata nel messaggio.', 'var(--orange)');
};

window.saveGeminiKey = function () {
    const val = document.getElementById('geminiApiKeyInput')?.value?.trim();
    if (val) { state.geminiKey = val; localStorage.setItem('g_diary_gemini_key', val); showToast('Chiave salvata! 🛡️'); window.scheduleRender(); }
};
// ========================================
// GSAP ANIMATION SYSTEM — Premium Transitions
// ========================================

function gsapAnimateView() {
    const root = document.getElementById('app');
    if (!root) return;

    // Kill previous ScrollTriggers
    if (typeof ScrollTrigger !== 'undefined') {
        ScrollTrigger.getAll().forEach(t => t.kill());
        gsap.registerPlugin(ScrollTrigger);
    }

    const view = root.querySelector('.view');
    if (!view) return;

    // Master timeline for orchestrated entrance
    const master = gsap.timeline({ defaults: { ease: 'power3.out' } });

    // 1. VIEW ENTRANCE — Cinematic fade + slide + blur
    master.fromTo(view,
        { opacity: 0, y: 40, filter: 'blur(8px)' },
        { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.7 }
    );

    // 2. HERO — Apple-style cascading reveal
    const hero = view.querySelector('.greeting-card');
    if (hero) {
        const heroTl = gsap.timeline({ defaults: { ease: 'power3.out' } });
        heroTl.fromTo(hero,
            { opacity: 0, y: 50, scale: 0.95 },
            { opacity: 1, y: 0, scale: 1, duration: 0.8 }
        );

        // Greeting text elements
        const heroTitle = hero.querySelector('.greeting-text');
        if (heroTitle) {
            heroTl.fromTo(heroTitle,
                { opacity: 0, y: 20, filter: 'blur(4px)' },
                { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.6 },
                '-=0.5'
            );
        }

        // Period and quote with stagger
        const heroMeta = hero.querySelectorAll('.greeting-period, .greeting-quote');
        if (heroMeta.length) {
            heroTl.fromTo(heroMeta,
                { opacity: 0, y: 15 },
                { opacity: 1, y: 0, duration: 0.5, stagger: 0.1 },
                '-=0.3'
            );
        }

        master.add(heroTl, 0.1);
    }

    // 3. DASHBOARD CARDS — Spring stagger with scale bounce
    const metricCards = view.querySelectorAll('.row-3 > .card, .row-2 > div > .card, .streak-card, .verifica-card, .bigstat, .circ-widget');
    if (metricCards.length) {
        master.fromTo(metricCards,
            { opacity: 0, y: 30, scale: 0.92 },
            {
                opacity: 1, y: 0, scale: 1,
                duration: 0.6,
                stagger: 0.08,
                ease: 'back.out(1.2)'
            },
            0.2
        );
    }

    // 4. GENERAL CARDS — Elastic entrance
    const cards = view.querySelectorAll('.card, .glass-panel, .subject-summary-card, .registro-card');
    if (cards.length) {
        master.fromTo(cards,
            { opacity: 0, y: 35, scale: 0.94 },
            {
                opacity: 1, y: 0, scale: 1,
                duration: 0.55,
                stagger: 0.07,
                ease: 'back.out(1.15)'
            },
            0.15
        );
    }

    // 5. CIRCOLARI — Slide from right with parallax depth
    const circolari = view.querySelectorAll('.circolare-card');
    if (circolari.length) {
        master.fromTo(circolari,
            { opacity: 0, x: 60, rotateY: 8 },
            {
                opacity: 1, x: 0, rotateY: 0,
                duration: 0.6,
                stagger: 0.06,
                ease: 'power2.out'
            },
            0.3
        );
    }

    // 6. SECTION HEADERS — Smooth slide up with slight blur
    const headers = view.querySelectorAll('h1, h2, .section-action');
    if (headers.length) {
        master.fromTo(headers,
            { opacity: 0, y: 15, filter: 'blur(3px)' },
            {
                opacity: 1, y: 0, filter: 'blur(0px)',
                duration: 0.45,
                stagger: 0.05,
                ease: 'power2.out'
            },
            0.1
        );
    }

    // 7. BUTTONS — Scale in with spring
    const buttons = view.querySelectorAll('.btn-primary, .btn-secondary, .fab');
    if (buttons.length) {
        master.fromTo(buttons,
            { opacity: 0, scale: 0.85 },
            {
                opacity: 1, scale: 1,
                duration: 0.5,
                stagger: 0.05,
                ease: 'back.out(2)'
            },
            0.35
        );
    }

    // 8. SCROLL-TRIGGERED REVEALS — with intersection
    if (typeof ScrollTrigger !== 'undefined') {
        // Focus items and list items
        view.querySelectorAll('.focus-item, .glass-list-item, .studio-entry').forEach(item => {
            gsap.fromTo(item,
                { opacity: 0, y: 20, filter: 'blur(3px)' },
                {
                    opacity: 1, y: 0, filter: 'blur(0px)',
                    duration: 0.5,
                    ease: 'power2.out',
                    scrollTrigger: {
                        trigger: item,
                        start: 'top 88%',
                        toggleActions: 'play none none none',
                        once: true
                    }
                }
            );
        });

        // Cards that are below the fold
        view.querySelectorAll('.circolare-card, .registro-card').forEach((card, i) => {
            gsap.fromTo(card,
                { opacity: 0, y: 25, scale: 0.96 },
                {
                    opacity: 1, y: 0, scale: 1,
                    duration: 0.5,
                    delay: i * 0.05,
                    ease: 'back.out(1.1)',
                    scrollTrigger: {
                        trigger: card,
                        start: 'top 92%',
                        toggleActions: 'play none none none',
                        once: true
                    }
                }
            );
        });
    }

    // 9. INTERACTIVE HOVER EFFECTS — magnetic feel on cards
    view.querySelectorAll('.card, .metric-card, .circolare-card, .home-glass-card').forEach(card => {
        card.addEventListener('mouseenter', () => {
            gsap.to(card, {
                scale: 1.02,
                boxShadow: '0 12px 40px rgba(0, 0, 0, 0.12)',
                duration: 0.3,
                ease: 'power2.out'
            });
        });
        card.addEventListener('mouseleave', () => {
            gsap.to(card, {
                scale: 1,
                boxShadow: '0 2px 12px rgba(0, 0, 0, 0.06)',
                duration: 0.4,
                ease: 'elastic.out(1, 0.5)'
            });
        });
    });

    // 10. BUTTON PRESS FEEDBACK
    view.querySelectorAll('.btn-primary, .btn-secondary, .btn-icon-glass').forEach(btn => {
        btn.addEventListener('mousedown', () => {
            gsap.to(btn, { scale: 0.95, duration: 0.1, ease: 'power2.in' });
        });
        btn.addEventListener('mouseup', () => {
            gsap.to(btn, { scale: 1, duration: 0.3, ease: 'elastic.out(1, 0.4)' });
        });
        btn.addEventListener('mouseleave', () => {
            gsap.to(btn, { scale: 1, duration: 0.2, ease: 'power2.out' });
        });
    });

    // 11. COUNTER ANIMATION for numeric values
    view.querySelectorAll('.media-value, [data-animate-number]').forEach(el => {
        const text = el.textContent.trim();
        const num = parseFloat(text);
        if (!isNaN(num) && num > 0) {
            const obj = { val: 0 };
            gsap.to(obj, {
                val: num,
                duration: 1.2,
                delay: 0.5,
                ease: 'power2.out',
                onUpdate: () => {
                    el.textContent = num % 1 !== 0
                        ? obj.val.toFixed(2)
                        : Math.round(obj.val).toString();
                }
            });
        }
    });
}

// GSAP Modal Animations — Spring physics
function gsapOpenModal(overlay) {
    if (!overlay || typeof gsap === 'undefined') return;
    const content = overlay.querySelector('.modal-content');
    gsap.fromTo(overlay,
        { opacity: 0 },
        { opacity: 1, duration: 0.3, ease: 'power2.out' }
    );
    if (content) {
        gsap.fromTo(content,
            { scale: 0.88, y: 30, filter: 'blur(4px)' },
            { scale: 1, y: 0, filter: 'blur(0px)', duration: 0.45, ease: 'back.out(1.4)' }
        );
    }
}

function gsapCloseModal(overlay, onComplete) {
    if (!overlay || typeof gsap === 'undefined') {
        if (onComplete) onComplete();
        return;
    }
    const content = overlay.querySelector('.modal-content');
    const tl = gsap.timeline({ onComplete });
    if (content) {
        tl.to(content, { scale: 0.9, y: 15, opacity: 0, filter: 'blur(4px)', duration: 0.25, ease: 'power2.in' }, 0);
    }
    tl.to(overlay, { opacity: 0, duration: 0.2, ease: 'power2.in' }, 0.08);
}

// Nav transition animation
function gsapAnimateNav() {
    const nav = document.querySelector('.nav-links');
    if (!nav || typeof gsap === 'undefined') return;
    const activeItem = nav.querySelector('.nav-item.active');
    if (activeItem) {
        gsap.fromTo(activeItem,
            { scale: 0.92 },
            { scale: 1, duration: 0.3, ease: 'back.out(2)' }
        );
    }
}

/* Console LOG for GSAP */
console.log('✅ GSAP Animations consolidated into ui.js');

function renderCircolariView() {
    const list = state.circolari || [];
    const toShow = list.slice(0, 15);

    return `
<div class="dashboard view" style="width: 100%;">
    <div class="planner-content" style="padding: 16px 32px 40px; width: 100%; max-width: 1180px; margin: 0 auto;">
        
        <header style="margin-bottom: 32px;">
            <div style="font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 800; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.15em; margin-bottom: 8px;">
                Comunicazioni Ufficiali
            </div>
            <h1 style="font-family: 'JetBrains Mono', monospace; font-size: 32px; font-weight: 800; text-transform: uppercase; margin: 0; color: #141414; letter-spacing: -0.02em;">
                Circolari
            </h1>
            <div style="margin-top:14px;">
                <a href="https://www.liceogandhi.edu.it" target="_blank" rel="noopener noreferrer" style="display:inline-flex; align-items:center; gap:8px; height:36px; padding:0 14px; border-radius:10px; background:#141414; color:#FFF; font-family:'JetBrains Mono', monospace; font-size:11px; font-weight:800; text-transform:uppercase; text-decoration:none;">
                    <i class="ph-bold ph-globe" style="font-size:14px;"></i> Vai al sito
                </a>
            </div>
        </header>

        <div style="display: flex; flex-direction: column; gap: 16px;">
            ${toShow.length ? toShow.map(c => `
            <div class="card" onclick="mostraCircolare('${c.id}')" style="cursor: pointer; padding: 24px; border-radius: 18px; display: flex; align-items: center; gap: 20px; transition: all 0.2s;">
                <div style="width: 52px; height: 52px; border-radius: 12px; background: #F0F0F3; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                    <i class="ph-bold ph-file-text" style="font-size: 24px; color: #141414;"></i>
                </div>
                <div style="flex: 1;">
                    <div style="font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 800; color: var(--accent-warm); text-transform: uppercase; margin-bottom: 4px;">
                        Circolare N. ${c.numero} &middot; ${c.data}
                    </div>
                    <div style="font-size: 16px; font-weight: 700; color: #141414; line-height: 1.4;">
                        ${c.titolo}
                    </div>
                </div>
                <i class="ph-bold ph-caret-right" style="font-size: 20px; color: #BCB8B2;"></i>
            </div>
            `).join('') : '<div class="card" style="padding: 40px; text-align: center; color: var(--text-dim);">Nessuna circolare trovata.</div>'}
        </div>
    </div>
</div>`;
}

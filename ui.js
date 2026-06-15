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

function escapeJsSingleQuote(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
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

let _agendaSearchDebounceTimer = null;
window.handleAgendaSearch = function (event) {
    state.agendaSearchQuery = event.target.value;
    clearTimeout(_agendaSearchDebounceTimer);
    _agendaSearchDebounceTimer = setTimeout(() => {
        state._filterJustTriggered = true; // Use light animation
        refreshAgenda();
    }, 120);
};

window.setAgendaFilter = function (subject) {
    state.agendaSearchSubject = subject;
    refreshAgenda();
};
const PASSING_GRADE_THRESHOLD = 6;
const CHART_INTERMEDIATE_TICK_RATIO = 0.8;
const CHART_MIN_RANGE_EPSILON = 0.0001;
const CHART_LINE_COLOR = '#2563EB';
const CHART_LABEL_COLOR = 'rgba(20,20,20,0.45)';
const CHART_LABEL_FONT = '800 10px Inter';
const GOAL_GRADE_SCALE_DESC = [10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6];
const MAX_GRADE_VALUE = 10;
const MAX_GOAL_SCENARIOS = 6;
const BRAND_GRADIENT = 'linear-gradient(135deg, #0D1F2D 0%, #1A6B8A 45%, #C6F2DF 100%)';
const GOAL_GRADE_OPTIONS_DESC = GOAL_GRADE_SCALE_DESC.includes(PASSING_GRADE_THRESHOLD)
    ? GOAL_GRADE_SCALE_DESC
    : [...GOAL_GRADE_SCALE_DESC, PASSING_GRADE_THRESHOLD].sort((a, b) => b - a);
const PRINT_DIALOG_DELAY_MS = 220;
const SUBJECT_TREND_GRADIENT_TOP_ALPHA = 0.95;
const SUBJECT_TREND_GRADIENT_MID_ALPHA = 0.4;
const SUBJECT_TREND_GRADIENT_BOTTOM_ALPHA = 0.08;
const CLASS_ACTIVITIES_WEEK_LOOKBACK = 16;
const CLASS_ACTIVITIES_WEEK_LOOKAHEAD = 8;
const CLASS_ACTIVITIES_MAX_WEEK_OPTIONS = 80;
const MOBILE_WEEK_LABEL_BREAKPOINT = 700;
const PLANNER_MOBILE_DROPDOWN_DEFAULT_WIDTH = 214;
const PLANNER_MOBILE_DROPDOWN_DEFAULT_HEIGHT = 220;
const PLANNER_MOBILE_DROPDOWN_MARGIN = 10;
const PLANNER_MOBILE_DROPDOWN_FLIP_CLEARANCE = 12;
const PLANNER_MOBILE_DROPDOWN_OFFSET = -2;
const PLANNER_MOBILE_DROPDOWN_SCROLL_LISTENER_OPTIONS = { capture: true };
let plannerMobileDropdownRepositionListener = null;
let subjectTrendAnimationFrame = null;
const SUBJECT_TREND_ANIMATION_STEP = 0.06;
// Start slightly above 0 to avoid an all-zero first frame and reduce perceived flicker.
const SUBJECT_TREND_ANIMATION_INITIAL_PROGRESS = 0.04;

function normalizeSubjectName(name) {
    // Unify subject labels coming from different DidUP payloads/UI variants
    // (e.g. trailing asterisks, extra spaces, accents and apostrophe variants) before grouping/filtering.
    return (name || '')
        .toString()
        // NFD separates accented letters into base char + combining mark (e.g. é -> e + ́).
        .normalize('NFD')
        // Remove combining marks to compare subjects regardless of accents.
        .replace(/[\u0300-\u036f]/g, '')
        // Normalize typographic apostrophes/backticks/acute accents to a single apostrophe.
        .replace(/[’`´]/g, "'")
        .replace(/['"]/g, '')
        .replace(/[./]/g, ' ')
        .replace(/&/g, ' e ')
        .replace(/\*/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function isArtDrawingSubjectNormalized(normalized) {
    const s = (normalized || '').toString();
    if (!s) return false;
    return s.includes('disegno')
        || s.includes('storia dellarte')
        || s.includes('storia arte')
        || s.includes('storiaarte')
        || s.includes('dellarte')
        || s.includes('arte triennio');
}

function areSubjectsEquivalent(subjectA, subjectB) {
    const a = normalizeSubjectName(subjectA);
    const b = normalizeSubjectName(subjectB);
    if (!a || !b) return false;
    if (a === b) return true;
    if (isArtDrawingSubjectNormalized(a) && isArtDrawingSubjectNormalized(b)) return true;
    return false;
}

function getSubjectGroupKey(subject) {
    const normalized = normalizeSubjectName(subject);
    if (!normalized) return 'altro';
    if (isArtDrawingSubjectNormalized(normalized)) return 'area_disegno_storia_arte';
    return normalized;
}

function isUserGeneratedTaskId(id) {
    if (typeof id !== 'string') return false;
    return id.startsWith('manual_') || id.startsWith('quest-');
}

function hasPlannedTasks(plannedTasks) {
    if (!plannedTasks || typeof plannedTasks !== 'object') return false;
    return Object.values(plannedTasks).some(ids => Array.isArray(ids) && ids.length > 0);
}

window._truncateWithEllipsis = function truncateWithEllipsis(value, max = 180) {
    const txt = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!txt) return '';
    return txt.length > max ? `${txt.slice(0, max)}…` : txt;
};
const truncateWithEllipsis = window._truncateWithEllipsis;

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
    } catch (_) { }
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
            newList.id = 'weekly-agenda-list'; // Ensure ID consistency
            list.parentNode.replaceChild(newList, list);
            // Avoid lag by using light animation for filters
            if (!state._filterJustTriggered && typeof animatePlannerSurface === 'function') {
                animatePlannerSurface('list');
            } else if (state._filterJustTriggered) {
                // Subtle fade for filter results instead of heavy stagger
                gsap.fromTo(newList.querySelectorAll('.agenda-task-card'), { opacity: 0.5 }, { opacity: 1, duration: 0.2 });
                state._filterJustTriggered = false;
            }
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
        gsap.fromTo(days, { y: 12, scale: 0.985 }, {
            y: 0,
            scale: 1,
            duration: 0.28,
            ease: 'power2.out',
            stagger: { each: 0.015, from: 'start' },
            clearProps: 'transform'
        });
        gsap.fromTo(badges, { x: -4 }, {
            x: 0,
            duration: 0.22,
            ease: 'power1.out',
            stagger: 0.01,
            clearProps: 'transform'
        });
        return;
    }
    const listCards = document.querySelectorAll('#weekly-agenda-list .card, #weekly-agenda-list .asw-task-card, #weekly-agenda-list .agenda-day-section');
    const listBadges = document.querySelectorAll('#weekly-agenda-list .agenda-subject-badge, #weekly-agenda-list .agenda-time-badge, #weekly-agenda-list .agenda-day-month, #weekly-agenda-list .agenda-day-label, #weekly-agenda-list .asw-subject-badge, #weekly-agenda-list .asw-label-tag');
    const listUi = document.querySelectorAll('#weekly-agenda-list .agenda-search-container, #weekly-agenda-list .agenda-filters-scroll, #weekly-agenda-list .filter-chip, #weekly-agenda-list .agenda-task-main, #weekly-agenda-list .agenda-task-actions, #weekly-agenda-list .agenda-task-action-btn, #weekly-agenda-list [data-task-text]');
    gsap.fromTo(listCards, { opacity: 0, y: 10 }, {
        opacity: 1,
        y: 0,
        duration: 0.26,
        ease: 'power2.out',
        stagger: 0.02,
        clearProps: 'transform,opacity'
    });
    gsap.fromTo(listBadges, { opacity: 0, scale: 0.96, y: 4 }, {
        opacity: 1,
        scale: 1,
        y: 0,
        duration: 0.24,
        ease: 'power2.out',
        stagger: 0.01,
        clearProps: 'transform,opacity'
    });
    gsap.fromTo(listUi, { opacity: 0, y: 6 }, {
        opacity: 1,
        y: 0,
        duration: 0.24,
        ease: 'power2.out',
        stagger: 0.008,
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
    if (!subjName) return;
    state._gradeSubjectsScrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
    state.activeSubject = subjName;
    scheduleRender(0);
};

window.handleGradeSubjectClick = function (subjectName) {
    state.view = 'voti';
    window.navigateSubject(subjectName);
    if (typeof closeModal === 'function') closeModal();
};

window.handleGradeSubjectClickFromEncoded = function (encodedSubjectName) {
    const rawSubject = (encodedSubjectName || '').toString();
    let subjectName = rawSubject;
    try {
        subjectName = decodeURIComponent(rawSubject);
        // Some inline handlers can pass an already-encoded payload again after intermediate transformations.
        // Attempt one extra decode only when the original payload still contains encoded percent markers (%25...).
        if (/%25/.test(rawSubject)) {
            try {
                const maybeDoubleDecoded = decodeURIComponent(subjectName);
                if (maybeDoubleDecoded !== subjectName) subjectName = maybeDoubleDecoded;
            } catch (_) { }
        }
    } catch (_) {
        subjectName = rawSubject;
    }
    window.handleGradeSubjectClick(subjectName);
};

window.closeSubject = function () {
    const restoreY = Number.isFinite(state._gradeSubjectsScrollY) ? state._gradeSubjectsScrollY : null;
    state.activeSubject = null;
    scheduleRender(0);
    if (restoreY !== null) {
        requestAnimationFrame(() => {
            window.scrollTo({ top: restoreY, behavior: 'auto' });
            state._gradeSubjectsScrollY = null;
        });
    }
};
// --- Google Calendar OAuth2 (Universal) ---
window.refreshSessionToken = async function () {
    const s = JSON.parse(localStorage.getItem('argo_session') || '{}');
    if (!s || !s.schoolCode || !(s.userName || s.username)) return false;

    // Restore password from sessionStorage if RAM copy was lost (iOS process kill, page reload)
    if (!window._argoPasswordRuntime) {
        try {
            const stored = sessionStorage.getItem('_argo_pwd_session');
            if (stored) {
                window._argoPasswordRuntime = decodeURIComponent(escape(atob(stored)));
                console.log('[refreshSessionToken] Restored password from sessionStorage');
            }
        } catch (_) {}
    }

    // Helper: apply refreshed session data from server response
    const _applyRefreshedSession = (data) => {
        const sessionData = {
            ...data.session,
            studentId: data.student?.id || s.studentId,
            sessionToken: data.sessionToken
        };
        if (typeof sessionManager !== 'undefined' && sessionManager.save) {
            sessionManager.save(sessionData);
        } else {
            localStorage.setItem('argo_session', JSON.stringify({ ...s, ...sessionData }));
        }
    };

    // Strategy 1: use in-memory password (app still in RAM from recent login)
    if (window._argoPasswordRuntime) {
        try {
            const res = await fetch(`${window.API_BASE_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    schoolCode: s.schoolCode,
                    username: s.userName || s.username,
                    password: window._argoPasswordRuntime,
                    profileIndex: s.profileIndex
                })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.success && data?.sessionToken) {
                _applyRefreshedSession(data);
                console.log('[refreshSessionToken] ✅ Refreshed via in-memory password');
                return true;
            }
        } catch (e) {
            console.warn('[refreshSessionToken] Strategy 1 (RAM) failed:', e.message);
        }
    }

    // Strategy 2: server-side refresh using Supabase-stored encrypted credentials
    const userId = (typeof window.getUserId === 'function' ? window.getUserId() : null) || s.studentId;
    if (userId && userId !== 'guest') {
        // Attempt up to 2 times with a short delay (Argo sometimes returns transient 401s)
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                if (attempt > 1) {
                    console.log(`[refreshSessionToken] Strategy 2 retry #${attempt} after 2s delay...`);
                    await new Promise(r => setTimeout(r, 2000));
                }
                const res = await fetch(`${window.API_BASE_URL}/api/auth?action=refresh-session`, {
                    method: 'POST',
                    headers: getSessionHeaders(),
                    body: JSON.stringify({ userId })
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok && data?.success && data?.sessionToken) {
                    _applyRefreshedSession(data);
                    console.log(`[refreshSessionToken] ✅ Refreshed via server-side credentials (attempt ${attempt})`);
                    return true;
                }
                // If server returned 403 (session token invalid), no point retrying
                if (res.status === 403) {
                    console.warn('[refreshSessionToken] Strategy 2: 403 Non autorizzato — sessionToken invalid, stopping retry');
                    break;
                }
            } catch (e) {
                console.warn(`[refreshSessionToken] Strategy 2 attempt ${attempt} failed:`, e.message);
            }
        }
    }

    console.warn('[refreshSessionToken] ❌ All strategies failed');
    return false;
};

window.googleFetchWithAuthRetry = async function (url, options = {}) {
    let res = await fetch(url, options);
    if (res.status !== 401 && res.status !== 403) return res;

    const refreshed = await window.refreshSessionToken().catch(() => false);
    if (!refreshed) return res;

    const retryOpts = { ...options, headers: getSessionHeaders(options.headers || {}) };
    return fetch(url, retryOpts);
};

window.connectGoogle = async function () {
    const userId = window.getUserId();
    if (!userId || userId === 'guest') { showToast('Devi essere loggato per collegare Google.', 'error', 'var(--red)'); return; }

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
        showToast(err.message || 'Errore collegamento Google', 'error', 'var(--red)');
    }
};

window.syncGoogleCalendar = async function () {
    const btn = event?.currentTarget;
    const originalHtml = btn?.innerHTML || '';
    try {
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ph-bold ph-circle-notch ph-spin"></i> Aggiornamento...'; }
        const userId = window.getUserId();
        const session = JSON.parse(localStorage.getItem('argo_session') || '{}');
        const fullSession = {
            ...session,
            profileIndex: session.profileIndex ?? 0
        };
        // NON inviamo state.tasks: forziamo il server a scaricare i compiti aggiornati da Argo
        const res = await window.googleFetchWithAuthRetry(`${window.API_BASE_URL}/api/google?action=sync`, {
            method: 'POST',
            headers: getSessionHeaders(),
            body: JSON.stringify({ userId, session: fullSession })
        });
        const data = await res.json();
        if (data.success) {
            state.googleConnected = true;
            localStorage.setItem('gc_google_connected_cache', '1');
            showToast(`✅ Sincronizzati ${data.added || 0} nuovi compiti su Google Calendar!`, 'success', 'var(--green)');
        } else {
            if (data?.error === 'GOOGLE_AUTH_EXPIRED') {
                state.googleConnected = false;
                localStorage.setItem('gc_google_connected_cache', '0');
                // Force a full render because render dedup may otherwise skip profile card refresh.
                state._forceRender = true;
                window.scheduleRender(0);
                throw new Error('Sessione Google scaduta. Ricollega Google dal profilo.');
            }
            throw new Error(data.error || 'Sync fallito');
        }
    } catch (err) {
        console.error('Google Sync Error:', err);
        showToast(err.message || 'Errore durante il sync', 'error', 'var(--red)');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }
    }
};

window.disconnectGoogle = async function () {
    try {
        const userId = window.getUserId();
        const res = await window.googleFetchWithAuthRetry(`${window.API_BASE_URL}/api/google?action=disconnect&userId=${encodeURIComponent(userId)}`, {
            method: 'GET',
            headers: getSessionHeaders()
        });
        const data = await res.json();
        if (data.success) {
            state.googleConnected = false;
            localStorage.setItem('gc_google_connected_cache', '0');
            state._forceRender = true;
            showToast('Google Calendar disconnesso.', 'warning', 'var(--orange)');
            window.scheduleRender(0);
        }
    } catch (e) { showToast('Errore disconnessione Google', 'error', 'var(--red)'); }
};

window.checkGoogleStatus = async function () {
    try {
        const userId = window.getUserId();
        if (!userId || userId === 'guest') return;
        const prevConnected = !!state.googleConnected;
        const res = await window.googleFetchWithAuthRetry(`${window.API_BASE_URL}/api/google?action=status&userId=${encodeURIComponent(userId)}`, {
            method: 'GET',
            headers: getSessionHeaders()
        });
        const data = await res.json();
        const nextConnected = !!data.connected;
        state.googleConnected = nextConnected;
        localStorage.setItem('gc_google_connected_cache', nextConnected ? '1' : '0');
        // State updated silently — profile view reads state.googleConnected on navigation
        // No full re-render needed (eliminates double render on boot)
        if (prevConnected !== nextConnected && state.view === 'profile') {
            state._forceRender = true;
            window.scheduleRender(0);
        }
    } catch (e) {
        const wasConnected = !!state.googleConnected;
        state.googleConnected = false;
        localStorage.setItem('gc_google_connected_cache', '0');
        if (wasConnected && state.view === 'profile') {
            state._forceRender = true;
            window.scheduleRender(0);
        }
    }
};

window.saveArgoToSupabase = async function () {
    try {
        const session = JSON.parse(localStorage.getItem('argo_session') || '{}');
        const userId = window.getUserId();
        if (!userId || userId === 'guest' || !session.userName) return;
        // Include runtime password so server can persist encrypted credentials in Supabase
        const pwd = window._argoPasswordRuntime || '';

        await window.googleFetchWithAuthRetry(`${window.API_BASE_URL}/api/google?action=save-argo`, {
            method: 'POST',
            headers: getSessionHeaders(),
            body: JSON.stringify({
                userId,
                schoolCode: session.schoolCode,
                username: session.userName || session.username,
                password: pwd,
                profileIndex: session.profileIndex ?? 0
            })
        });
        console.log('✅ Credenziali Argo salvate correttamente nel cloud');
    } catch (e) {
        console.error('❌ Errore salvataggio cloud', e);
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

function getNumericGradeValue(vote) {
    if (!vote) return null;
    const raw = (vote.valore || vote.value || '').toString().replace(',', '.').trim();
    if (isGiustifica(raw)) return null;
    const num = parseFloat(raw);
    return Number.isFinite(num) ? num : null;
}

function getVoteDate(vote) {
    const d = parseArgoDate(vote?.data || vote?.date);
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
    return d;
}
/**
 * Restituisce l'etichetta UI per uno scenario di proiezione obiettivo.
 * @param {{combo?: boolean, exact?: boolean, n?: number}} scenario Scenario calcolato (combo, exact, numero voti).
 * @param {boolean} lowercase Se true, restituisce testo in minuscolo per card scure.
 * @returns {string} Etichetta human-readable da mostrare nella proiezione.
 */
function getProjectionScenarioLabel(scenario, lowercase = false) {
    if (scenario?.combo) return lowercase ? 'combinazione utile' : 'Combinazione utile';
    if (scenario?.exact) return lowercase ? 'prossimo voto esatto' : 'Prossimo voto esatto';
    if ((scenario?.n || 0) === 1) return lowercase ? 'prossimo voto' : 'Prossimo voto';
    return lowercase ? `prossimi ${scenario?.n || 0} voti` : `Prossimi ${scenario?.n || 0} voti`;
}
function getProjectionComboDetailLabel(grade, extraTopGrades, maxGradeValue) {
    return `1 voto ${grade.toFixed(2)} + ${extraTopGrades} vot${extraTopGrades === 1 ? 'o' : 'i'} da ${maxGradeValue.toFixed(2)}`;
}

function getSchoolYearRanges(refDate = new Date()) {
    const year = refDate.getFullYear();
    const month = refDate.getMonth();
    const startYear = month >= 8 ? year : year - 1; // school year starts in September
    const endYear = startYear + 1;
    return {
        startYear,
        endYear,
        firstTermStart: new Date(startYear, 8, 1, 0, 0, 0, 0),      // 1 Sep 00:00:00
        firstTermEnd: new Date(endYear, 0, 31, 23, 59, 59, 999),    // 31 Jan 23:59:59
        secondTermStart: new Date(endYear, 1, 1, 0, 0, 0, 0),       // 1 Feb 00:00:00
        secondTermEnd: new Date(endYear, 5, 30, 23, 59, 59, 999)     // 30 Jun 23:59:59
    };
}

function getCurrentSchoolTerm(refDate = new Date()) {
    const ranges = getSchoolYearRanges(refDate);
    if (refDate >= ranges.firstTermStart && refDate <= ranges.firstTermEnd) return 'first';
    if (refDate >= ranges.secondTermStart && refDate <= ranges.secondTermEnd) return 'second';
    return null;
}

function getVotesBySchoolTerm(votes, term, refDate = new Date()) {
    const ranges = getSchoolYearRanges(refDate);
    const list = Array.isArray(votes) ? votes : [];
    return list.filter(v => {
        const d = getVoteDate(v);
        if (!d) return false;
        if (term === 'first') return d >= ranges.firstTermStart && d <= ranges.firstTermEnd;
        if (term === 'second') return d >= ranges.secondTermStart && d <= ranges.secondTermEnd;
        return false;
    });
}

function averageFromNumeric(values) {
    if (!Array.isArray(values) || values.length === 0) return null;
    const valid = values.filter(v => Number.isFinite(v));
    if (!valid.length) return null;
    return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function getNextGradeSimulatorValue() {
    const inState = Number(state.nextGradeSimulator);
    if (Number.isFinite(inState)) return Math.max(1, Math.min(10, Math.round(inState)));
    try {
        const stored = Number(localStorage.getItem(lsKey('next_grade_sim')));
        if (Number.isFinite(stored)) return Math.max(1, Math.min(10, Math.round(stored)));
    } catch (_) { }
    return 7;
}

function setNextGradeSimulatorValue(value) {
    const next = Math.max(1, Math.min(10, Math.round(Number(value) || 7)));
    state.nextGradeSimulator = next;
    try {
        localStorage.setItem(lsKey('next_grade_sim'), String(next));
    } catch (_) { }
    return next;
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

// ── closeModal fallback (nel caso app-bootstrap.js non l'abbia ancora definita) ──
if (typeof window.closeModal !== 'function') {
    window.closeModal = function(e) {
        if (e && e.target !== e.currentTarget) return; // stopPropagation behaviour
        var mc = document.getElementById('modal-container');
        if (mc) mc.innerHTML = '';
    };
}

const modalRuntime = { pendingCloseTimeout: null };
function showModal(html, className = '') {
    const container = getModalContainer();
    if (!container) return;
    if (modalRuntime.pendingCloseTimeout) {
        clearTimeout(modalRuntime.pendingCloseTimeout);
        modalRuntime.pendingCloseTimeout = null;
    }
    container.innerHTML = `
            <div class="modal-overlay active" onclick="closeModal(event)" style="position:fixed;top:0;left:0;right:0;bottom:0;z-index:99990;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(20px);box-sizing:border-box;transition: opacity 0.3s ease;">
                <div class="modal-content liquid-glass rounded-[40px] deep-shadow ${className}" onclick="event.stopPropagation()" style="position:relative;z-index:99991;max-height:calc(100dvh - 32px);overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;width:100%;max-width:640px;padding:0;animation: modalAppear 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);">
                    ${html}
                </div>
            </div>
        `;
}

function showToast(message, type = 'success', customBackground = '') {
    const existing = document.getElementById('g-toast');
    if (existing) existing.remove();

    const typeValue = typeof type === 'string' ? type.toLowerCase() : '';
    const color = typeValue === 'warning' ? '#FF9500' : typeValue === 'error' ? '#FF3B30' : '#0058bc';

    const toast = document.createElement('div');
    toast.id = 'g-toast';
    toast.className = 'liquid-glass rounded-full px-6 py-3 fixed bottom-24 left-1/2 -translate-x-1/2 z-[10000] flex items-center gap-3 deep-shadow';
    toast.style.border = `1px solid ${color}40`;

    toast.innerHTML = `
        <span class="material-symbols-outlined text-[20px]" style="color: ${color}">${typeValue === 'error' ? 'error' : typeValue === 'warning' ? 'warning' : 'check_circle'}</span>
        <span class="text-[14px] font-bold text-on-surface">${message}</span>
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(20px)';
        toast.style.transition = 'all 0.4s ease-in';
        setTimeout(() => toast.remove(), 400);
    }, 2500);
}
function showBoot(text) {
window.showBoot = showBoot; // expose globally for app-bootstrap.js
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
    const currentView = state.view;

    // Helper to generate a nav item link with Liquid Glass aesthetics
    const renderNavItem = (view, iconBase, label) => {
        const isActive = currentView === view;
        const color = isActive ? '#0051C5' : '#8B95A5';
        const fontStyle = isActive ? 'font-bold' : 'font-semibold';
        const iconClass = isActive ? `ph-fill ${iconBase}` : `ph ${iconBase}`;
        const glowHtml = ''; // nessun glow, solo colore

        // Sostituito <a> con <button> per evitare problemi di reload
        return `
        <button onclick="navigate('${view}')" 
           class="nav-item relative flex flex-col items-center justify-center gap-1.5 w-[76px] h-[64px] transition-colors bg-transparent border-none outline-none cursor-pointer p-0"
           style="color: ${color}; -webkit-tap-highlight-color: transparent;"
           onmouseenter="if(!${isActive}) this.style.color='#475569'"
           onmouseleave="if(!${isActive}) this.style.color='#8B95A5'">
            ${glowHtml}
            <i class="${iconClass} text-[28px]"></i>
            <span class="text-[13px] ${fontStyle} tracking-wide">${label}</span>
        </button>
        `;
    };

    return `
        <!-- ══ BOTTOM NAV — Liquid Glass ══ -->
        <nav class="liquid-navbar fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center justify-around px-4 py-2 rounded-[32px] z-[1000] w-[92%] max-w-[380px] h-[76px] md:hidden">
            ${renderNavItem('home', 'ph-squares-four', 'Overview')}
            ${renderNavItem('planner', 'ph-calendar-blank', 'Planner')}
            ${renderNavItem('voti', 'ph-exam', 'Grades')}
            ${renderNavItem('circolari', 'ph-newspaper', 'Circulars')}
        </nav>

        <!-- Drawer overlay -->
        <div id="drawerOverlay" onclick="closeDrawer()" style="
            position:fixed; inset:0; background:rgba(15,23,42,0.45);
            backdrop-filter:blur(4px); opacity:0; pointer-events:none;
            z-index:9999; display:flex; align-items:flex-end;
            transition:opacity 0.3s ease;">
            <div id="drawerContent" onclick="event.stopPropagation()" style="
                width:100%; background:white; border-radius:36px 36px 0 0;
                padding:32px 32px 40px; box-shadow:0 -10px 40px rgba(0,0,0,0.12);
                transform:translateY(100%); display:flex; flex-direction:column;
                max-height:80%; overflow-y:auto;
                transition:transform 0.3s cubic-bezier(0.16,1,0.3,1);">
                <div style="width:44px;height:5px;background:#E2E8F0;border-radius:999px;margin:0 auto 24px;flex-shrink:0;"></div>
                <div id="drawerDynamicBody"></div>
            </div>
        </div>

        <!-- Dialog overlay -->
        <div id="dialogOverlay" style="
            position:fixed; inset:0; background:rgba(15,23,42,0.45);
            backdrop-filter:blur(4px); opacity:0; pointer-events:none;
            z-index:9999; display:flex; align-items:center; justify-content:center;
            padding:0 24px; transition:opacity 0.2s ease;">
            <div style="background:white; border-radius:24px; padding:24px;
                        width:100%; max-height:80%; overflow-y:auto;
                        box-shadow:0 25px 50px rgba(0,0,0,0.15);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                    <h4 id="dialogTitle" style="font-size:1.1rem;font-weight:700;color:#0F172A;">Dettagli</h4>
                    <button onclick="closeDialog()" style="width:32px;height:32px;border-radius:50%;
                        background:#F1F5F9;border:none;display:flex;align-items:center;
                        justify-content:center;color:#64748B;cursor:pointer;">
                        <i data-lucide="x" style="width:16px;height:16px;"></i>
                    </button>
                </div>
                <div id="dialogBody" style="font-size:0.875rem;color:#475569;"></div>
            </div>
        </div>

        <script>
            if (typeof lucide !== 'undefined') lucide.createIcons();
        </script>
    `;
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
function normalizeTipoVerifica(tipo, upperCase = true) {
    const t = (tipo || '').toString().toLowerCase().trim();
    if (t === 'scritta') return upperCase ? 'SCRITTA' : 'Scritta';
    if (t === 'orale') return upperCase ? 'ORALE' : 'Orale';
    return upperCase ? 'VERIFICA' : 'Valutazione';
}
function getHomeTaskWidgetData() {
    const mode = state.homeTaskFocus === 'today' ? 'today' : 'tomorrow';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = getLocalDateString(today);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = getLocalDateString(tomorrow);

    if (mode === 'today') {
        const plannedTodayIds = (state.plannedTasks && state.plannedTasks[todayStr]) || [];
        const tasks = (state.tasks || []).filter(t => {
            if (t.subject === 'QUEST') return false;
            if (t.isExam) return false;
            return plannedTodayIds.includes(t.id);
        });
        return {
            mode,
            title: 'Oggi',
            dateStr: todayStr,
            emptyMessage: 'Nessun compito pianificato per oggi.',
            tasks
        };
    }

    const tasks = (state.tasks || []).filter(t => {
        if (t.subject === 'QUEST') return false;
        if (t.isExam) return false;
        return t.due_date === tomorrowStr;
    });
    return {
        mode,
        title: 'Domani',
        dateStr: tomorrowStr,
        emptyMessage: 'Nessun compito assegnato per domani.',
        tasks
    };
}
function renderHomeTaskListHtml(homeTaskData) {
    if (!homeTaskData.tasks.length) {
        return `<div style="font-size:11px; color:#C0BBB4; padding:10px 0; text-align:center;">${homeTaskData.emptyMessage}</div>`;
    }
    return homeTaskData.tasks.map(t => {
        const abbr = getSubjectAbbrev(t.subject);
        const key = abbr.toLowerCase();
        return `
              <div style="display:flex; align-items:center; gap:9px; padding:6px 0; border-bottom:1px solid #F4F2EE; cursor:pointer;" onclick="toggleTask('${escapeJsSingleQuote(t.id)}')">
                <div data-task-toggle="${escapeHtml(t.id)}" style="width:17px; height:17px; border:1.5px solid ${t.done ? '#141414' : '#DEDAD4'}; border-radius:5px; flex-shrink:0; display:flex; align-items:center; justify-content:center; background:${t.done ? '#141414' : '#fff'}; transition: background 0.15s ease, border-color 0.15s ease;">
                  ${t.done ? '<svg width="8" height="5" viewBox="0 0 8 5"><path d="M1 2.5L3 4.5L7 1" stroke="white" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>' : ''}
                </div>
                <span style="font-family:\'JetBrains Mono\',monospace; font-size:9px; font-weight:500; border-radius:5px; padding:2px 6px; flex-shrink:0; background:var(--${key},#EEE); color:var(--${key}-t,#444);">${abbr}</span>
                <span data-task-text="${escapeHtml(t.id)}" style="font-size:12.5px; font-weight:500; color:${t.done ? '#C8C4BE' : '#141414'}; flex:1; line-height:1.3; ${t.done ? 'text-decoration:line-through;' : ''} white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(t.text)}</span>
                ${isUserGeneratedTaskId(t.id) ? `
                <button onclick="event.stopPropagation(); deleteCalendarTask('${escapeJsSingleQuote(t.id)}');" style="width:20px; height:20px; border-radius:6px; background:#FFF0EE; border:1px solid rgba(255,59,48,0.18); display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0;" aria-label="Elimina attività" title="Elimina attività">
                    <i class="ph-bold ph-trash" style="font-size:10px; color:#FF3B30;"></i>
                </button>` : ''}
              </div>`;
    }).join('');
}
function updateHomeTaskFocusWidget() {
    if (state.view !== 'home') return false;
    const homeTaskData = getHomeTaskWidgetData();
    const label = document.getElementById('home-focus-label');
    const list = document.getElementById('home-focus-task-list');
    const btnToday = document.getElementById('home-focus-btn-today');
    const btnTomorrow = document.getElementById('home-focus-btn-tomorrow');
    if (!label || !list || !btnToday || !btnTomorrow) return false;

    label.textContent = homeTaskData.title;
    list.innerHTML = renderHomeTaskListHtml(homeTaskData);

    const applyBtnState = (btn, active) => {
        btn.style.borderColor = active ? '#141414' : '#D3CEC7';
        btn.style.background = active ? '#141414' : '#FFFFFF';
        btn.style.color = active ? '#FFFFFF' : '#4F4A43';
    };
    applyBtnState(btnToday, homeTaskData.mode === 'today');
    applyBtnState(btnTomorrow, homeTaskData.mode === 'tomorrow');
    return true;
}
function updateNextGradeSimulatorWidget() {
    if (state.view !== 'voti') return false;
    const simValueEl = document.getElementById('next-grade-sim-value');
    const currentAvgEl = document.getElementById('next-grade-current-avg');
    const simAvgEl = document.getElementById('next-grade-sim-avg');
    const impactEl = document.getElementById('next-grade-sim-impact');
    const termLabelEl = document.getElementById('next-grade-current-term-label');
    if (!simValueEl || !currentAvgEl || !simAvgEl || !impactEl) return false;
    let votiData = getVotiData();
    if (state.activeSubject) {
        votiData = votiData.filter(v => areSubjectsEquivalent(v.materia || v.subject, state.activeSubject));
    }
    const currentTerm = getCurrentSchoolTerm(new Date());
    const termVotes = currentTerm ? getVotesBySchoolTerm(votiData, currentTerm) : [];
    const numericVotes = termVotes.map(getNumericGradeValue).filter(v => Number.isFinite(v));
    const media = averageFromNumeric(numericVotes);
    const simulatorValue = getNextGradeSimulatorValue();
    const simulatedAvg = averageFromNumeric([...numericVotes, simulatorValue]);
    const simulatedDelta = Number.isFinite(media) && Number.isFinite(simulatedAvg) ? (simulatedAvg - media) : null;
    simValueEl.textContent = `voto: ${simulatorValue}`;
    currentAvgEl.textContent = Number.isFinite(media) ? media.toFixed(2) : '—';
    simAvgEl.textContent = Number.isFinite(simulatedAvg) ? simulatedAvg.toFixed(2) : '—';
    if (Number.isFinite(simulatedDelta)) {
        impactEl.textContent = `${simulatedDelta >= 0 ? '+' : ''}${simulatedDelta.toFixed(2)}`;
        impactEl.style.color = simulatedDelta >= 0 ? '#2DB86A' : '#FF3B30';
    } else {
        impactEl.textContent = '—';
        impactEl.style.color = '#908C86';
    }
    if (termLabelEl) {
        termLabelEl.textContent = currentTerm === 'first' ? 'Primo quadrimestre' : (currentTerm === 'second' ? 'Secondo quadrimestre' : 'Nessun quadrimestre attivo');
    }
    return true;
}
window.setHomeTaskFocus = function (mode) {
    state.homeTaskFocus = mode === 'today' ? 'today' : 'tomorrow';
    if (state.view === 'home') {
        if (!updateHomeTaskFocusWidget() && typeof scheduleRender === 'function') scheduleRender(0);
    }
};
function updateHomeView() {
    if (state.view !== 'home') return;

    const focusCard = document.getElementById('home-focus-task-list');
    if (focusCard) {
        const focusData = getHomeTaskWidgetData();
        const liveIds = new Set(focusData.tasks.map(t => t.id));

        // Remove DOM rows for tasks that no longer exist
        focusCard.querySelectorAll('[data-task-toggle]').forEach(cb => {
            const taskId = cb.getAttribute('data-task-toggle');
            if (!liveIds.has(taskId)) {
                const row = cb.parentElement;
                if (row && row !== focusCard) {
                    if (typeof gsap !== 'undefined') {
                        gsap.to(row, { opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0, marginTop: 0, marginBottom: 0, duration: 0.2, ease: 'power2.in', onComplete: () => row.remove() });
                    } else {
                        row.remove();
                    }
                }
            }
        });

        // Show empty message if no tasks remain after removal
        setTimeout(() => {
            const remaining = focusCard.querySelectorAll('[data-task-toggle]').length;
            if (remaining === 0 && !focusCard.querySelector('[data-empty-msg]')) {
                const empty = document.createElement('div');
                empty.setAttribute('data-empty-msg', '1');
                empty.style.cssText = 'font-size:11px; color:#C0BBB4; padding:10px 0; text-align:center;';
                empty.textContent = focusData.emptyMessage || 'Nessun compito';
                focusCard.appendChild(empty);
            }
        }, 220);

        // Update done/undone state for remaining tasks
        focusData.tasks.forEach(t => {
            const cb = focusCard.querySelector(`[data-task-toggle="${t.id}"]`);
            const txt = focusCard.querySelector(`[data-task-text="${t.id}"]`);
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
function getCalendarTasksForDate(dateStr) {
    const plannedIds = (state.plannedTasks && state.plannedTasks[dateStr]) || [];
    const tasks = Array.isArray(state.tasks) ? state.tasks : [];
    const merged = new Map();
    tasks.forEach(t => {
        if (!t || t.subject === 'QUEST' || t.isExam) return;
        if (t.due_date === dateStr || plannedIds.includes(t.id)) {
            merged.set(t.id, t);
        }
    });
    return [...merged.values()];
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

        const dayTasks = getCalendarTasksForDate(dateStr);

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
    let daySections = '';
    let totalItems = 0;

    for (let i = 0; i < 7; i++) {
        const dayDate = new Date(weekStart);
        dayDate.setDate(weekStart.getDate() + i);
        const dateStr = getLocalDateString(dayDate);
        const isToday = dateStr === todayISO;
        const isTomorrow = (() => { const tm = new Date(); tm.setDate(tm.getDate() + 1); return dateStr === getLocalDateString(tm); })();
        const isPast = dayDate < today && !isToday;

        const dayTasks = getCalendarTasksForDate(dateStr);
        const dayVerifiche = verificheByDate[dateStr] || [];

        if (dayTasks.length === 0 && dayVerifiche.length === 0) continue;
        hasAny = true;
        totalItems += dayTasks.length + dayVerifiche.length;

        const labelText = isToday ? 'OGGI' : isTomorrow ? 'DOMANI' : '';
        const labelColor = isToday ? '#34C759' : '#FF9F0A';

        daySections += `
            <div class="asw-day-section">
                <div class="asw-day-header">
                    <div class="asw-date-block">
                        <span class="asw-day-name" style="color:${isToday ? '#34C759' : isPast ? '#C0BBB4' : '#908C86'};">${dayNames[i]}</span>
                        <span class="asw-day-num" style="color:${isToday ? '#34C759' : isPast ? '#C0BBB4' : '#141414'};">${dayDate.getDate()}</span>
                        <span class="asw-month" style="color:${isPast ? '#C0BBB4' : '#908C86'};">${monthNames[dayDate.getMonth()]}</span>
                    </div>
                    <div class="asw-separator"></div>
                    ${labelText ? `<span class="asw-label-tag" style="color:${labelColor}; border-color:${labelColor};">${labelText}</span>` : ''}
                </div>
                <div class="asw-tasks-list">
                    ${dayVerifiche.map(v => {
            const abbr = getSubjectAbbrev(v.subject);
            const subjColor = getSubjectColor(v.subject);
            return `
                        <div class="asw-task-card asw-verifica-card">
                            <div class="asw-task-stripe" style="background:#FF9F0A;"></div>
                            <div class="asw-task-body">
                                <div class="asw-task-meta">
                                    <span class="asw-subject-badge" style="color:#D97706; background:rgba(255,159,10,0.1);">${escapeHtml(abbr)}</span>
                                    <span class="asw-verifica-tag"><i class="ph-bold ph-pencil-simple"></i> ${escapeHtml(normalizeTipoVerifica(v.tipo))}</span>
                                </div>
                                <div class="asw-task-text">${escapeHtml(v.text || v.subject)}</div>
                            </div>
                        </div>`;
        }).join('')}
                    ${dayTasks.map(t => {
            const subjColor = getSubjectColor(t.subject);
            const abbr = getSubjectAbbrev(t.subject);
            const displayText = (t.text || '').replace(/\*/g, '').trim();
            return `
                        <div class="asw-task-card${t.done ? ' asw-task-done' : ''}${isPast && !t.done ? ' asw-task-past' : ''}" onclick="toggleTask('${escapeJsSingleQuote(t.id)}')">
                            <div class="asw-task-stripe" style="background:${t.done ? '#C8C5C0' : subjColor};"></div>
                            <div class="asw-task-body">
                                <div class="asw-task-meta">
                                    <span class="asw-subject-badge" style="color:${t.done ? '#908C86' : subjColor}; background:rgba(0,0,0,0.04);">${escapeHtml(abbr)}</span>
                                </div>
                                <div class="asw-task-text" data-task-text="${escapeHtml(t.id)}">${escapeHtml(displayText)}</div>
                            </div>
                            <div class="asw-task-actions">
                                <div class="asw-toggle-btn" data-task-toggle="${t.id}" style="border-color:${t.done ? '#141414' : '#C8C5C0'}; background:${t.done ? '#141414' : 'transparent'};">
                                    ${t.done ? '<i class="ph-bold ph-check" style="font-size:11px; color:#fff;"></i>' : ''}
                                </div>
                                ${isUserGeneratedTaskId(t.id) ? `
                                <button class="asw-delete-btn" onclick="event.stopPropagation(); deleteCalendarTask('${escapeJsSingleQuote(t.id)}');" aria-label="Elimina attività">
                                    <i class="ph-bold ph-trash" style="font-size:11px;"></i>
                                </button>` : ''}
                            </div>
                        </div>`;
        }).join('')}
                </div>
            </div>`;
    }

    if (!hasAny) return '';

    return `<div class="asw-root">
        <div class="asw-header">
            <span class="asw-header-title">// AGENDA SETTIMANALE</span>
            <span class="asw-header-count">${totalItems} ITEM${totalItems !== 1 ? 'S' : ''}</span>
        </div>
        <div class="asw-body">${daySections}</div>
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
        <div class="view login-view min-h-screen flex flex-col justify-center items-center p-8 text-center bg-background">
            <div class="w-24 h-24 bg-primary/10 rounded-[32px] liquid-glass flex items-center justify-center mb-10 liquid-shadow">
                <img src="gandhi-diary-icon-192.png" alt="Gandhi Diary" class="w-16 h-16 rounded-2xl object-cover">
            </div>
            
            <h1 class="headline-lg text-primary mb-2">G-Connect</h1>
            <p class="body-lg text-on-surface-variant/60 mb-12 max-w-[280px]">Il compagno di studio definitivo per gli studenti del Gandhi.</p>
            
            <div class="w-full max-w-[320px] flex flex-col gap-4">
                <button onclick="window.openArgoLogin()"
                    style="width:100%;height:56px;border-radius:18px;border:none;cursor:pointer;
                           background:linear-gradient(135deg,#2563eb,#4f46e5);color:white;
                           font-size:16px;font-weight:800;font-family:Hanken Grotesk,sans-serif;
                           display:flex;align-items:center;justify-content:center;gap:10px;
                           box-shadow:0 8px 24px -6px rgba(37,99,235,0.45);"
                    ontouchstart="this.style.transform='scale(0.97)'"
                    ontouchend="this.style.transform='scale(1)'">
                    <span class="material-symbols-outlined" style="font-size:22px;">login</span>
                    Accedi con DidUP
                </button>
                
                ${hasSession ? `
                <div class="p-6 liquid-glass rounded-[28px] mt-4 liquid-shadow">
                    <div class="label-sm text-on-surface-variant/40 mb-1">Sessione salvata</div>
                    <div class="title-md mb-4">${escapeHtml(state.user?.name || 'Utente')}</div>
                    <button onclick="logout()" class="w-full py-3 rounded-2xl bg-error/10 text-error font-bold text-[13px] hover:bg-error/20 transition-all">
                        Usa altro account
                    </button>
                </div>
                ` : ''}
            </div>
        </div>`;
}
// ================================================================
// G-CONNECT — renderHome() PATCH v7
// ================================================================
// Multi-widget dashboard with swipeable interface

function renderHome() {
    // Register the carousel scroll handler
    window.handleCarouselScroll = function(el) {
        const scrollLeft = el.scrollLeft;
        const width = el.clientWidth;
        const index = Math.round(scrollLeft / width);
        const dots = document.querySelectorAll('.carousel-dot');
        dots.forEach((dot, idx) => {
            if (idx === index) {
                dot.style.width = '20px';
                dot.style.height = '6px';
                dot.style.background = '#0250C5';
            } else {
                dot.style.width = '6px';
                dot.style.height = '6px';
                dot.style.background = '#CBD5E1';
            }
        });
    };

    // 1. Recupero dei dati reali dal backend/stato globale
    const media = parseFloat(calcolaMedia(getVotiData())) || 0;
    const assenze = state.assenzeData || {};
    const verifiche = state.manualVerifiche || [];
    
    // 2. Calcolo dinamico per l'anello di progresso del widget Assenze
    const oreAssenzaTotali = typeof assenze.oreAssenzaTotali === 'number' ? assenze.oreAssenzaTotali : 0;
    const ritardiTotali = typeof assenze.totaleRitardi === 'number' ? assenze.totaleRitardi : 0;
    const usciteTotali = typeof assenze.totaleUscite === 'number' ? assenze.totaleUscite : 0;
    const assenzeGiorni = typeof assenze.totaleAssenze === 'number' ? assenze.totaleAssenze : 0;
    
    const maxOreIpotetiche = 100;
    const progressPercentage = Math.min((oreAssenzaTotali / maxOreIpotetiche) * 100, 100);
    const dashOffset = 251.2 - (251.2 * (progressPercentage / 100));

    // 3. Calcolo sicuro delle date locali
    const today = new Date();
    const todayISO = getLocalDateString(today);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowISO = getLocalDateString(tomorrow);

    // Filtriamo i dati reali per Domani
    const tomorrowVerifiche = (state.verifiche || []).filter(v => v.data === tomorrowISO);
    const tomorrowHomework = (state.tasks || []).filter(t => t.due_date === tomorrowISO);
    const allTomorrowItems = [
        ...tomorrowVerifiche.map(v => ({ id: v.id, isExam: true, title: v.materia || v.subject, desc: v.text || v.descrizione, done: false })),
        ...tomorrowHomework.map(h => ({ id: h.id, isExam: false, title: h.subject, desc: h.text, done: h.done }))
    ];

    // 4. Prossima Verifica Imminente (per il 3° Widget del carosello)
    const argoUpcoming = (state.verifiche || [])
        .filter(v => v.data && v.data >= todayISO)
        .map(v => ({ materia: v.materia || v.subject || '', data: v.data, text: v.text || v.descrizione || '', tipo: v.tipo || '', source: 'argo' }));
    const manualUpcoming = (state.manualVerifiche || [])
        .filter(v => !v.done && v.date && v.date >= todayISO)
        .map(v => ({ materia: v.subject || '', data: v.date, text: v.args || '', tipo: v.type || '', source: 'manual', id: v.id }));
    
    const seenVerifiche = new Set();
    const upcomingVerifiche = [...argoUpcoming, ...manualUpcoming]
        .filter(v => {
            const key = `${v.data}||${v.materia.toLowerCase()}`;
            if (seenVerifiche.has(key)) return false;
            seenVerifiche.add(key);
            return true;
        })
        .sort((a, b) => a.data.localeCompare(b.data));

    const nextVerifica = upcomingVerifiche[0];

    let daysDiff = 0;
    let countdownText = '';
    let urgencyLabel = '';
    let urgencyColor = '';
    let progressWidth = 100;

    if (nextVerifica) {
        const examDate = parseLocalDate(nextVerifica.data);
        const todayZero = new Date(today);
        todayZero.setHours(0, 0, 0, 0);
        const timeDiff = examDate.getTime() - todayZero.getTime();
        daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

        if (daysDiff < 0) countdownText = 'Superata';
        else if (daysDiff === 0) countdownText = 'Oggi';
        else if (daysDiff === 1) countdownText = 'Domani';
        else countdownText = `${daysDiff} gg`;

        if (daysDiff <= 2) {
            urgencyLabel = 'HARD';
            urgencyColor = 'color:#DC2626; background:#FEF2F2; border:1px solid #FECACA;';
        } else if (daysDiff <= 5) {
            urgencyLabel = 'MEDIUM';
            urgencyColor = 'color:#D97706; background:#FFFBEB; border:1px solid #FDE68A;';
        } else {
            urgencyLabel = 'EASY';
            urgencyColor = 'color:#059669; background:#F0FDF4; border:1px solid #A7F3D0;';
        }

        progressWidth = Math.max(0, Math.min(100, ((10 - daysDiff) / 10) * 100));
    }

    // Helper per icone Lucide delle materie
    const getSubjectLucideIcon = (subject) => {
        const s = (subject || '').toLowerCase();
        if (s.includes('matem') || s.includes('math')) return 'calculator';
        if (s.includes('fisic') || s.includes('physics') || s.includes('scienz') || s.includes('chimic')) return 'flask-conical';
        if (s.includes('storia') || s.includes('history') || s.includes('filosofia')) return 'book-open';
        if (s.includes('inglese') || s.includes('english') || s.includes('lingua') || s.includes('italiano')) return 'languages';
        if (s.includes('arte') || s.includes('disegno')) return 'palette';
        if (s.includes('informatica') || s.includes('computer')) return 'cpu';
        return 'graduation-cap';
    };

    // Helper per colori inline delle materie
    const getSubjectInlineColors = (subject, isExam) => {
        if (isExam) return { bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' };
        const s = (subject || '').toLowerCase();
        if (s.includes('matem') || s.includes('math')) return { bg: '#EFF6FF', text: '#2563EB', border: '#BFDBFE' };
        if (s.includes('fisic') || s.includes('physics') || s.includes('scienz') || s.includes('chimic')) return { bg: '#F0FDF4', text: '#16A34A', border: '#BBF7D0' };
        return { bg: '#EEF2FF', text: '#4F46E5', border: '#C7D2FE' };
    };

    // 5. Card compatte per sezione "Domani" — border-radius ridotto, padding ridotto, icone più piccole
    const htmlDomani = allTomorrowItems.length > 0
        ? allTomorrowItems.map(item => {
            const icon = getSubjectLucideIcon(item.title);
            const colors = getSubjectInlineColors(item.title, item.isExam);
            return `
            <div style="
                background:white; border-radius:22px; padding:16px 18px;
                box-shadow:0 2px 12px -2px rgba(0,0,0,0.04);
                border:1px solid #EEF0F3; margin-bottom:10px;
                position:relative; overflow:hidden; cursor:pointer;
                transition:transform 0.2s ease;
            " onclick="${item.isExam ? '' : `toggleTask('${item.id}')`}"
               onmouseenter="this.style.transform='scale(1.01)'" onmouseleave="this.style.transform='scale(1)'">
                <!-- Accento laterale rosso -->
                <div style="position:absolute;left:0;top:12%;height:76%;width:4px;background:#E5A7A7;border-radius:0 4px 4px 0;"></div>

                <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:10px;padding-left:10px;">
                    <div style="width:40px;height:40px;border-radius:50%;background:${colors.bg};display:flex;align-items:center;justify-content:center;color:${colors.text};">
                        <i data-lucide="${icon}" style="width:18px;height:18px;stroke-width:1.5;"></i>
                    </div>
                    <span style="
                        display:inline-block; background:${colors.bg}; color:${colors.text};
                        font-size:10px; font-weight:700; letter-spacing:0.06em;
                        text-transform:uppercase; padding:4px 10px; border-radius:999px;
                        border:1px solid ${colors.border};
                    ">${item.isExam ? 'Verifica' : 'Compito'}</span>
                </div>
                
                <h4 style="font-size:1rem;font-weight:700;color:#1F2937;margin:0 0 4px 10px;">${escapeHtml(item.title || 'Generico')}</h4>
                
                <div style="display:flex;align-items:center;color:#6B7280;font-size:12px;margin-left:10px;">
                    <i data-lucide="clock" style="width:13px;height:13px;margin-right:6px;stroke-width:2;"></i>
                    <span style="font-weight:500;">${item.isExam ? '09:00 - 12:00' : 'Scadenza domani'}</span>
                </div>

                ${item.desc ? `<p style="font-size:12px;color:#9CA3AF;font-style:italic;margin:8px 0 0 10px;border-top:1px solid #F3F4F6;padding-top:8px;">"${escapeHtml(truncateWithEllipsis(item.desc, 100))}"</p>` : ''}
            </div>`;
        }).join('')
        : `<div style="text-align:center;padding:32px 16px;background:white;border-radius:22px;border:1px solid #EEF0F3;color:#9CA3AF;font-style:italic;">Nessun impegno programmato per domani.</div>`;

    // Inizializzazione icone Lucide subito dopo l'inserimento nel DOM
    setTimeout(() => { if (window.lucide) lucide.createIcons(); }, 80);

    // Avatar utente
    const userPhoto = state.userPhoto || '';
    const avatarHtml = userPhoto
        ? `<img src="${escapeHtml(userPhoto)}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;cursor:pointer;border:2px solid #EEF0F3;" onclick="navigate('profile')" alt="Profilo">`
        : `<div style="width:40px;height:40px;border-radius:50%;background:#EFF6FF;display:flex;align-items:center;justify-content:center;cursor:pointer;border:1.5px solid rgba(0,81,197,0.18);" onclick="navigate('profile')">
            <span class="material-symbols-outlined" style="font-size:20px;color:#0051C5;font-variation-settings:'FILL' 1;">person</span>
           </div>`;

    // 6. Ritorno dell'HTML strutturale della Dashboard
    return `
    <main class="view-fullbleed min-h-screen pb-32 pt-6 font-sans text-[#1F2937] antialiased overflow-y-auto hide-scrollbar">

        <div style="padding:0;">

            <!-- HEADER: GANDHI DIARY + Avatar -->
            <div style="display:flex;justify-content:space-between;align-items:center;padding:0 24px 16px;">
                <h1 style="font-size:13px;font-weight:800;letter-spacing:0.12em;color:#9CA3AF;text-transform:uppercase;margin:0;">GANDHI DIARY</h1>
                ${avatarHtml}
            </div>

            <div style="margin-bottom: 16px;">
                <div class="widgets-container" id="home-carousel" onscroll="handleCarouselScroll(this)">

                    <div class="widget-card">
                        <div class="card-media-premium rounded-[28px] p-5 w-full flex flex-col justify-between" style="height:220px;background:linear-gradient(135deg,#ffffff 0%,#eff4ff 100%);position:relative;overflow:hidden;">
                            <!-- Blob decorativi identici alla card media in Voti -->
                            <div style="position:absolute;top:-36px;right:-36px;width:140px;height:140px;background:rgba(219,234,254,0.45);border-radius:50%;filter:blur(28px);pointer-events:none;"></div>
                            <div style="position:absolute;bottom:-36px;left:-36px;width:140px;height:140px;background:rgba(243,232,255,0.35);border-radius:50%;filter:blur(28px);pointer-events:none;"></div>
                            <div style="position:relative;z-index:1;display:flex;justify-content:space-between;align-items:start;">
                                <div>
                                    <h2 style="color:#0051C5;font-weight:800;font-size:1.15rem;line-height:1.2;letter-spacing:-0.01em;">Buongiorno, ${getSafeUserName()}</h2>
                                    <p style="color:rgba(2,80,197,0.6);font-size:13px;font-weight:500;margin-top:2px;">Media generale attiva</p>
                                </div>
                                <div style="width:40px;height:40px;border-radius:50%;background:#EFF6FF;display:flex;align-items:center;justify-content:center;color:#0250C5;">
                                    <i data-lucide="graduation-cap" style="width:20px;height:20px;stroke-width:2;"></i>
                                </div>
                            </div>

                            <div style="margin-top:8px;">
                                <span style="font-size:3.2rem;font-weight:800;color:#0250C5;letter-spacing:-0.03em;">${media.toFixed(2)}</span>
                            </div>

                            <div style="display:flex;align-items:flex-end;justify-content:space-between;height:44px;margin-top:4px;padding:0 2px;position:relative;">
                                <div style="width:12%;background:rgba(37,99,235,0.08);border-radius:6px;height:40%;"></div>
                                <div style="width:12%;background:rgba(37,99,235,0.12);border-radius:6px;height:60%;"></div>
                                <div style="width:12%;background:rgba(37,99,235,0.08);border-radius:6px;height:45%;"></div>
                                <div style="width:12%;background:rgba(37,99,235,0.16);border-radius:6px;height:70%;"></div>
                                <div style="width:12%;background:rgba(37,99,235,0.24);border-radius:6px;height:85%;"></div>
                                <div style="width:12%;background:#0250C5;border-radius:6px;height:95%;position:relative;display:flex;justify-content:center;">
                                    <div style="position:absolute;top:-22px;background:#1F2937;color:white;font-size:7px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;padding:2px 6px;border-radius:4px;box-shadow:0 2px 6px rgba(0,0,0,0.15);">NOW</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="widget-card">
                        <div class="card-assenze-premium rounded-[28px] p-5 w-full flex flex-col justify-between" style="height:220px;background:linear-gradient(135deg,#ffffff 0%,#fff1f2 100%);position:relative;overflow:hidden;">
                            <div style="position:absolute;top:-36px;right:-36px;width:140px;height:140px;background:rgba(254,202,202,0.45);border-radius:50%;filter:blur(28px);pointer-events:none;"></div>
                            <div style="position:absolute;bottom:-36px;left:-36px;width:140px;height:140px;background:rgba(243,182,182,0.35);border-radius:50%;filter:blur(28px);pointer-events:none;"></div>
                            <div style="position:relative;z-index:1;width:100%;height:100%;display:flex;flex-direction:column;justify-content:space-between;">
                                <div style="display:flex;justify-content:space-between;align-items:start;">
                                    <h2 style="font-weight:700;font-size:1.15rem;color:#BD1118;letter-spacing:-0.01em;">Assenze</h2>
                                    <div style="width:40px;height:40px;border-radius:50%;background:#FEF2F2;display:flex;align-items:center;justify-content:center;color:#BD1118;">
                                        <i data-lucide="user-x" style="width:20px;height:20px;"></i>
                                    </div>
                                </div>
                                <div style="display:flex;justify-content:space-between;align-items:center;margin:6px 0;">
                                    <div style="font-size:3.2rem;font-weight:700;color:#BD1118;letter-spacing:-0.03em;">
                                        ${oreAssenzaTotali.toFixed(1)}<span style="font-size:2rem;font-weight:600;">h</span>
                                    </div>
                                    <div style="position:relative;width:72px;height:72px;display:flex;align-items:center;justify-content:center;">
                                        <svg style="width:100%;height:100%;transform:rotate(-90deg);" viewBox="0 0 100 100">
                                            <circle style="stroke:#FEE2E2;" stroke-width="8" cx="50" cy="50" r="40" fill="transparent"></circle>
                                            <circle style="stroke:#BD1118;" stroke-width="8" stroke-linecap="round" cx="50" cy="50" r="40" fill="transparent" stroke-dasharray="251.2" stroke-dashoffset="${dashOffset}"></circle>
                                        </svg>
                                        <span style="position:absolute;font-size:11px;font-weight:700;color:#BD1118;">${Math.round(progressPercentage)}%</span>
                                    </div>
                                </div>
                                <div style="display:flex;justify-content:space-between;gap:10px;">
                                    <div style="background:#FAFBFC;border-radius:14px;padding:8px 6px;flex:1;text-align:center;border:1px solid #F3F4F6;">
                                        <div style="font-weight:700;font-size:14px;color:#BD1118;">${assenzeGiorni}g</div>
                                        <div style="font-size:8px;font-weight:600;color:#9CA3AF;letter-spacing:0.08em;text-transform:uppercase;margin-top:2px;">Assenze</div>
                                    </div>
                                    <div style="background:#FAFBFC;border-radius:14px;padding:8px 6px;flex:1;text-align:center;border:1px solid #F3F4F6;">
                                        <div style="font-weight:700;font-size:14px;color:#1F2937;">${ritardiTotali}</div>
                                        <div style="font-size:8px;font-weight:600;color:#9CA3AF;letter-spacing:0.08em;text-transform:uppercase;margin-top:2px;">Ritardi</div>
                                    </div>
                                    <div style="background:#FAFBFC;border-radius:14px;padding:8px 6px;flex:1;text-align:center;border:1px solid #F3F4F6;">
                                        <div style="font-weight:700;font-size:14px;color:#1F2937;">${usciteTotali}</div>
                                        <div style="font-size:8px;font-weight:600;color:#9CA3AF;letter-spacing:0.08em;text-transform:uppercase;margin-top:2px;">Uscite</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="widget-card">
                        <div class="card-verifiche-premium rounded-[28px] p-5 w-full flex flex-col justify-between" style="height:220px;background:linear-gradient(135deg,#ffffff 0%,#f0fdf4 100%);position:relative;overflow:hidden;">
                            <div style="position:absolute;top:-36px;right:-36px;width:140px;height:140px;background:rgba(187,247,208,0.45);border-radius:50%;filter:blur(28px);pointer-events:none;"></div>
                            <div style="position:absolute;bottom:-36px;left:-36px;width:140px;height:140px;background:rgba(134,239,172,0.35);border-radius:50%;filter:blur(28px);pointer-events:none;"></div>
                            <div style="position:relative;z-index:1;width:100%;height:100%;display:flex;flex-direction:column;justify-content:space-between;">
                            ${nextVerifica ? `
                                <div style="display:flex;flex-direction:column;justify-content:space-between;height:100%;width:100%;">
                                    <div style="display:flex;justify-content:space-between;align-items:start;">
                                        <div style="display:flex;flex-direction:column;">
                                            <h2 style="font-weight:600;font-size:1.15rem;color:#059669;">Prossime Verifiche</h2>
                                            <p style="color:rgba(5,150,105,0.6);font-size:11px;font-weight:500;margin-top:2px;">${upcomingVerifiche.length} verifiche in programma</p>
                                        </div>
                                        <div style="width:40px;height:40px;border-radius:50%;background:#F0FDF4;display:flex;align-items:center;justify-content:center;color:#059669;">
                                            <i data-lucide="calendar" style="width:20px;height:20px;"></i>
                                        </div>
                                    </div>

                                    <div style="display:flex;justify-content:space-between;align-items:center;margin:4px 0;">
                                        <div style="display:flex;flex-direction:column;min-width:0;padding-right:8px;">
                                            <span style="font-size:1.1rem;font-weight:700;color:#1F2937;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(nextVerifica.materia)}</span>
                                            <span style="font-size:11px;color:#9CA3AF;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;">${escapeHtml(nextVerifica.text || 'Valutazione')}</span>
                                        </div>
                                        <div style="display:flex;flex-direction:column;align-items:flex-end;flex-shrink:0;">
                                            <span style="font-size:1.8rem;font-weight:800;color:#059669;letter-spacing:-0.02em;">${countdownText}</span>
                                            <span style="
                                                display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;
                                                font-size:8px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;
                                                margin-top:3px;${urgencyColor}
                                            ">${urgencyLabel}</span>
                                        </div>
                                    </div>

                                    <div style="width:100%;">
                                        <div style="display:flex;justify-content:space-between;font-size:8px;font-weight:700;color:#9CA3AF;margin-bottom:4px;padding:0 2px;">
                                            <span>STATO STUDIO</span>
                                            <span>${daysDiff >= 0 ? daysDiff : 0} GG RIMANENTI</span>
                                        </div>
                                        <div style="width:100%;background:#E5E7EB;border-radius:999px;height:6px;overflow:hidden;">
                                            <div style="height:100%;border-radius:999px;transition:width 0.5s ease-out;width:${progressWidth}%;background:#059669;"></div>
                                        </div>
                                    </div>
                                </div>
                            ` : `
                                <div style="display:flex;flex-direction:column;justify-content:space-between;height:100%;width:100%;">
                                    <div style="display:flex;justify-content:space-between;align-items:start;">
                                        <h2 style="font-weight:600;font-size:1.15rem;color:#059669;">Prossime Verifiche</h2>
                                        <div style="width:40px;height:40px;border-radius:50%;background:#F0FDF4;display:flex;align-items:center;justify-content:center;color:#059669;">
                                            <i data-lucide="calendar-check" style="width:20px;height:20px;"></i>
                                        </div>
                                    </div>
                                    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;margin:auto 0;text-align:center;">
                                        <span class="material-symbols-outlined" style="font-size:28px;color:rgba(5,150,105,0.35);margin-bottom:4px;">event_available</span>
                                        <p style="font-size:13px;font-weight:600;color:#065F46;">Nessuna verifica</p>
                                        <p style="font-size:11px;color:#9CA3AF;margin-top:2px;">Niente da studiare per ora!</p>
                                    </div>
                                </div>
                            `}
                            </div><!-- /z-index wrapper verifiche -->
                        </div>
                    </div>
                </div>

                <div class="widget-indicators">
                    <div class="widget-indicator active carousel-dot" style="width: 20px; height: 6px; border-radius: 4px; background: #0250C5; transition: all 0.3s;"></div>
                    <div class="widget-indicator carousel-dot" style="width: 6px; height: 6px; border-radius: 4px; background: #CBD5E1; transition: all 0.3s;"></div>
                    <div class="widget-indicator carousel-dot" style="width: 6px; height: 6px; border-radius: 4px; background: #CBD5E1; transition: all 0.3s;"></div>
                </div>
            </div>

            <!-- Sezione Domani — compatta -->
            <div style="padding:0 24px;">
                <div style="margin-bottom:24px;">
                    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:12px;padding:0 2px;">
                        <h3 style="font-size:1.35rem;font-weight:700;color:#1F2937;margin:0;">Domani</h3>
                        <a href="#" style="color:#0250C5;font-weight:500;font-size:13px;text-decoration:none;" onclick="navigate('planner')">See all</a>
                    </div>
                    ${htmlDomani}
                </div>
            </div>

        </div>
    </main>
    `;
}

function renderAcademicProfile() {
    const subjects = [...new Set(getVotiData().map(v => v.materia || v.subject))];

    return `
            <div class="view academic-profile-view pb-32">
                <header class="mb-8 pt-4">
                    <h1 class="headline-lg text-primary mb-1">Profilo Accademico</h1>
                    <p class="body-md text-on-surface-variant/60">Analisi e impostazioni studio</p>
               </header>

                <!-- Study Availability -->
                <section class="liquid-glass rounded-[40px] p-8 mb-6 liquid-shadow">
                    <div class="flex items-center gap-3 mb-6">
                        <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                            <span class="material-symbols-outlined">schedule</span>
                        </div>
                        <h2 class="title-md">Disponibilità Studio</h2>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="flex flex-col gap-2">
                            <label class="label-sm text-on-surface-variant/40">Inizio</label>
                            <input type="time" id="studyStart" value="${state.availability.start}" onchange="saveAvailability()" 
                                class="bg-surface-container-low border border-white/40 rounded-2xl h-14 px-4 font-bold text-on-surface">
                       </div>
                        <div class="flex flex-col gap-2">
                            <label class="label-sm text-on-surface-variant/40">Fine</label>
                            <input type="time" id="studyEnd" value="${state.availability.end}" onchange="saveAvailability()" 
                                class="bg-surface-container-low border border-white/40 rounded-2xl h-14 px-4 font-bold text-on-surface">
                       </div>
                   </div>
               </section>

                <!-- Difficult Subjects -->
                <section class="liquid-glass rounded-[40px] p-8 mb-6 liquid-shadow">
                    <div class="flex items-center gap-3 mb-2">
                        <div class="w-10 h-10 rounded-xl bg-error/10 flex items-center justify-center text-error">
                            <span class="material-symbols-outlined">priority_high</span>
                        </div>
                        <h2 class="title-md">Materie Critiche</h2>
                    </div>
                    <p class="body-md text-on-surface-variant/60 mb-6">Seleziona le materie in cui hai più difficoltà.</p>
                    <div class="flex flex-wrap gap-2">
                        ${subjects.length > 0 ? subjects.map(s => {
        const active = state.difficulty.includes(s);
        const safeS = s.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        return `
            <button onclick="toggleDifficulty('${safeS}')" class="liquid-pill px-5 py-3 text-[13px] font-bold transition-all border ${active ? 'bg-primary text-on-primary border-primary shadow-lg' : 'bg-white/40 text-on-surface border-white/60'}">
                ${s}
            </button>`;
    }).join('') : '<div class="body-md text-on-surface-variant/40 p-4">Nessuna materia trovata.</div>'}
                   </div>
               </section>
           </div>`;
}
function renderMediaGauge(target = 0) {
    // Redundant in Liquid Glass design - replaced by bar charts in renderHome/renderGradesView
    return;
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
function colorWithAlpha(color, alpha) {
    const safeAlpha = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
    const source = String(color || '').trim();
    if (!source) return `rgba(37, 99, 235, ${safeAlpha})`;

    const hexMatch = source.match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
    if (hexMatch) {
        const hex = hexMatch[1];
        // Expand shorthand hex (#abc / #abcd) to full form (#aabbcc / #aabbccdd).
        const expanded = hex.length <= 4 ? hex.split('').map(ch => ch + ch).join('') : hex;
        const rgb = expanded.length === 8 ? expanded.slice(0, 6) : expanded;
        const r = parseInt(rgb.slice(0, 2), 16);
        const g = parseInt(rgb.slice(2, 4), 16);
        const b = parseInt(rgb.slice(4, 6), 16);
        if ([r, g, b].every(Number.isFinite)) return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
    }

    const hslMatch = source.match(/^hsl\(\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)%\s*,\s*([+-]?\d*\.?\d+)%\s*\)$/i);
    if (hslMatch) return `hsla(${hslMatch[1]}, ${hslMatch[2]}%, ${hslMatch[3]}%, ${safeAlpha})`;

    const hslaMatch = source.match(/^hsla\(\s*([^)]+)\)$/i);
    if (hslaMatch) {
        const parts = hslaMatch[1].split(',').map(p => p.trim());
        if (parts.length >= 3) return `hsla(${parts[0]}, ${parts[1]}, ${parts[2]}, ${safeAlpha})`;
    }

    const rgbMatch = source.match(/^rgb\(\s*([^)]+)\)$/i);
    if (rgbMatch) {
        const parts = rgbMatch[1].split(',').map(p => p.trim());
        if (parts.length >= 3) return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${safeAlpha})`;
    }

    const rgbaMatch = source.match(/^rgba\(\s*([^)]+)\)$/i);
    if (rgbaMatch) {
        const parts = rgbaMatch[1].split(',').map(p => p.trim());
        if (parts.length >= 3) return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${safeAlpha})`;
    }

    return source;
}
function drawSubjectTrendFrame(ctx, W, H, trendItems, subjColor, progress = 1) {
    if (!Array.isArray(trendItems) || trendItems.length === 0) return;
    const p = { left: 44, right: 18, top: 16, bottom: 34 };
    const innerW = Math.max(1, W - p.left - p.right);
    const innerH = Math.max(1, H - p.top - p.bottom);
    const yMin = 0;
    const yMax = 10;
    const ySpan = yMax - yMin;
    const dateMin = trendItems[0].date.getTime();
    const dateMax = trendItems[trendItems.length - 1].date.getTime();
    const dateSpan = Math.max(1, dateMax - dateMin);
    const points = trendItems.map(item => {
        const x = p.left + ((item.date.getTime() - dateMin) / dateSpan) * innerW;
        const y = p.top + (1 - ((item.value - yMin) / ySpan)) * innerH;
        return { x, y, value: item.value };
    });

    ctx.clearRect(0, 0, W, H);

    const ticks = [0, PASSING_GRADE_THRESHOLD, 8, 10];
    ticks.forEach(t => {
        const y = p.top + (1 - ((t - yMin) / ySpan)) * innerH;
        ctx.strokeStyle = '#E8E4DE';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.left, y);
        ctx.lineTo(W - p.right, y);
        ctx.stroke();
        ctx.fillStyle = '#908C86';
        ctx.font = '700 10px JetBrains Mono';
        ctx.textAlign = 'right';
        ctx.fillText(String(t), p.left - 8, y + 3);
    });

    const visibleCount = Math.max(1, Math.ceil((points.length - 1) * progress) + 1);
    const visiblePoints = points.slice(0, visibleCount);

    if (visiblePoints.length >= 2) {
        const grad = ctx.createLinearGradient(0, p.top, 0, H - p.bottom);
        grad.addColorStop(0, colorWithAlpha(subjColor, SUBJECT_TREND_GRADIENT_TOP_ALPHA));
        grad.addColorStop(0.55, colorWithAlpha(subjColor, SUBJECT_TREND_GRADIENT_MID_ALPHA));
        grad.addColorStop(1, colorWithAlpha(subjColor, SUBJECT_TREND_GRADIENT_BOTTOM_ALPHA));
        ctx.beginPath();
        ctx.moveTo(visiblePoints[0].x, H - p.bottom);
        visiblePoints.forEach(pt => ctx.lineTo(pt.x, pt.y));
        ctx.lineTo(visiblePoints[visiblePoints.length - 1].x, H - p.bottom);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
    }

    ctx.strokeStyle = subjColor;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    visiblePoints.forEach((pt, i) => {
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();

    visiblePoints.forEach(pt => {
        ctx.fillStyle = pt.value >= PASSING_GRADE_THRESHOLD ? '#2DB86A' : '#FF3B30';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.stroke();
    });

    const firstLabel = trendItems[0].date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
    const lastLabel = trendItems[trendItems.length - 1].date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
    ctx.fillStyle = '#908C86';
    ctx.font = '700 10px JetBrains Mono';
    ctx.textAlign = 'left';
    ctx.fillText(firstLabel, p.left, H - 10);
    ctx.textAlign = 'right';
    ctx.fillText(lastLabel, W - p.right, H - 10);
}
function initSubjectTrendChart(canvasId, trendItems, subjColor) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !Array.isArray(trendItems) || trendItems.length === 0) return;
    const { ctx, rect } = setupCanvas(canvas);
    const W = rect.width;
    const H = rect.height;
    if (subjectTrendAnimationFrame) cancelAnimationFrame(subjectTrendAnimationFrame);
    let animationProgress = 0;
    const animate = () => {
        const chartCanvas = document.getElementById(canvasId);
        if (!chartCanvas) {
            subjectTrendAnimationFrame = null;
            return;
        }
        animationProgress = Math.min(1, animationProgress + SUBJECT_TREND_ANIMATION_STEP);
        drawSubjectTrendFrame(ctx, W, H, trendItems, subjColor, animationProgress);
        if (animationProgress < 1) {
            subjectTrendAnimationFrame = requestAnimationFrame(animate);
        } else {
            subjectTrendAnimationFrame = null;
        }
    };
    drawSubjectTrendFrame(ctx, W, H, trendItems, subjColor, SUBJECT_TREND_ANIMATION_INITIAL_PROGRESS);
    subjectTrendAnimationFrame = requestAnimationFrame(animate);
}
function scheduleSubjectTrendChartInit(payload) {
    if (!payload || !Array.isArray(payload.points) || payload.points.length === 0) return;
    const color = payload.color || '#2563EB';
    const normalized = payload.points
        .map(p => {
            const value = Number(p?.value);
            const date = new Date(p?.date);
            if (!Number.isFinite(value) || Number.isNaN(date.getTime())) return null;
            return { value, date };
        })
        .filter(Boolean);
    if (!normalized.length) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
        if (typeof initSubjectTrendChart === 'function') {
            initSubjectTrendChart('subjectTrendCanvas', normalized, color);
        }
    }));
}
window.scheduleSubjectTrendChartInit = scheduleSubjectTrendChartInit;
function mountSubjectTrendChartFromDom() {
    const canvas = document.getElementById('subjectTrendCanvas');
    if (!canvas) return;
    const pointsEncoded = canvas.getAttribute('data-points');
    const color = canvas.getAttribute('data-color') || '#2563EB';
    if (!pointsEncoded) return;
    try {
        const decoded = decodeURIComponent(pointsEncoded);
        const points = JSON.parse(decoded);
        if (typeof scheduleSubjectTrendChartInit === 'function') {
            scheduleSubjectTrendChartInit({ points, color });
        }
    } catch (e) {
        console.warn('Unable to mount subject trend chart:', e?.message || e);
    }
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
        votiData = votiData.filter(v => areSubjectsEquivalent(v.materia || v.subject, state.activeSubject));
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

    // Progressive moving average
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
    const stepX = (W - padding * 2) / (points.length - 1);
    const series = points.map(p => p.val);
    const labels = points.map(p => {
        const d = parseArgoDate(p.date);
        return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
    });
    const values = points.map(p => p.raw);
    const minV = Math.max(0, Math.min(...values, ...series) - 0.5);
    const maxV = Math.min(10, Math.max(...values, ...series, 8) + 0.5);

    function getY(val) {
        const ratio = (val - minV) / Math.max(CHART_MIN_RANGE_EPSILON, (maxV - minV));
        return (H - padding * 1.5) - ratio * (H - padding * 2.5);
    }

    // Area Gradient
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(37, 99, 235, 1)');
    grad.addColorStop(0.55, 'rgba(37, 99, 235, 0.45)');
    grad.addColorStop(1, 'rgba(37, 99, 235, 0.08)');

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
    ctx.strokeStyle = CHART_LINE_COLOR;
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
        ctx.fillStyle = CHART_LABEL_COLOR;
        ctx.font = CHART_LABEL_FONT;
        ctx.textAlign = 'center';
        ctx.fillText(labels[i], x, H - 5);
    });
}
function renderSubjectDetailView(subjectName) {
    const normalizedSubject = normalizeSubjectName(subjectName);
    const votiData = getVotiData()
        .filter(v => areSubjectsEquivalent(v.materia || v.subject, normalizedSubject))
        .sort((a, b) => parseArgoDate(b.data || b.date) - parseArgoDate(a.data || a.date));
    const media = parseFloat(calcolaMedia(votiData)) || 0;
    const goal = state.goals?.[subjectName] || 8.0;
    const n = votiData.length;

    // ── Semester split ────────────────────────────────────────────────────────
    function semesterOf(v) {
        const raw = v.data || v.date || '';
        const d = parseArgoDate ? parseArgoDate(raw) : new Date(raw);
        if (!d || isNaN(d)) return 0;
        const m = d.getMonth();
        return (m >= 8 || m === 0) ? 1 : 2;
    }
    const s1 = votiData.filter(v => semesterOf(v) === 1);
    const s2 = votiData.filter(v => semesterOf(v) === 2);
    const media1 = parseFloat(calcolaMedia(s1)) || 0;
    const media2 = parseFloat(calcolaMedia(s2)) || 0;
    const hasSemesters = s1.length > 0 && s2.length > 0;

    // ── Predictive Hub IDs ────────────────────────────────────────────────────
    const uid = Math.random().toString(36).slice(2, 7);
    const simLblId = 'sL' + uid;
    const simResId = 'sR' + uid;
    const simDefault = ((media * n + 7.5) / (n + 1)).toFixed(2);

    // ── Goal text: realistic multi-scenario breakdown ───────────────────────
    let goalText;
    if (n > 0 && goal > media) {
        const gap = goal - media;
        const sumNow = media * n;

        // Impossibility check: even all 10s can't reach goal
        // Max achievable with k perfect grades: (sumNow + k*10)/(n+k)
        // As k→∞ this tends to 10. If goal > 10 it's impossible (shouldn't happen).
        // Sanity: if gap > 4 (e.g. media 4, goal 9) → "feet on the ground"
        if (gap >= 4) {
            goalText = `Obiettivo di <b style="color:#1e3a8a">${goal.toFixed(1)}</b> con media attuale ${media.toFixed(2)}: resta con i piedi per terra! La distanza è troppo grande per essere colmata in tempi ragionevoli.`;
        } else {
            // Build scenarios for grade values 7, 8, 9, 10 (all above goal, capped at 10)
            const gradeValues = [7, 8, 9, 10].filter(g => g > goal);
            const scenarios = [];

            for (const gradeVal of gradeValues) {
                // k = ceil((goal*(n+k) - sumNow) / gradeVal)  solved:
                // k >= (goal*n - sumNow) / (gradeVal - goal)
                const raw = (goal * n - sumNow) / (gradeVal - goal);
                const k = Math.ceil(raw);
                if (k >= 1 && k <= 30 && Number.isFinite(k)) {
                    scenarios.push({ gradeVal, k });
                }
            }

            if (scenarios.length === 0) {
                // Even 10s not enough in reasonable count — very high goal
                goalText = `Per raggiungere <b style="color:#1e3a8a">${goal.toFixed(1)}</b> con media attuale ${media.toFixed(2)} servirebbero troppi voti perfetti. Considera un obiettivo più vicino alla tua media attuale.`;
            } else {
                // Pick 2-3 most readable scenarios (prefer fewest votes needed)
                const picked = scenarios.slice(0, 3);
                const lines = picked.map(s =>
                    `<b style="color:#2563eb">${s.k} ${s.k===1?'voto':'voti'} da ${s.gradeVal}</b>`
                ).join(' &nbsp;·&nbsp; ');
                goalText = `Per raggiungere <b style="color:#1e3a8a">${goal.toFixed(1)}</b> ti bastano: ${lines}.`;
            }
        }
    } else if (media >= goal) {
        goalText = `Hai già raggiunto il tuo obiettivo di <b style="color:#1e3a8a">${goal.toFixed(1)}</b>. Continua così!`;
    } else {
        goalText = `Imposta un obiettivo per ricevere suggerimenti personalizzati.`;
    }

    // ── SVG area chart: aggregated by month, last 6 months ──────────────────
    const MN = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
    // Build monthly averages for this subject
    const subMonthMap = {};
    votiData.forEach(v => {
        const raw = v.data || v.date || '';
        const d0 = parseArgoDate ? parseArgoDate(raw) : new Date(raw);
        if (!d0 || isNaN(d0)) return;
        const key = d0.getFullYear() * 100 + d0.getMonth();
        if (!subMonthMap[key]) subMonthMap[key] = { label: MN[d0.getMonth()], nums: [] };
        const val = getNumericGradeValue(v);
        if (Number.isFinite(val)) subMonthMap[key].nums.push(val);
    });
    const subMonthList = Object.entries(subMonthMap)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([, m]) => ({ label: m.label, avg: m.nums.reduce((s, x) => s + x, 0) / m.nums.length }))
        .slice(-6);

    let svgArea = '', svgPath = '', svgDots = '';
    let xLabels = [];
    if (subMonthList.length >= 2) {
        const W = 300, H = 100, PAD = 10;
        const pts = subMonthList.map((m, i) => {
            const x = PAD + (i / (subMonthList.length - 1)) * (W - PAD * 2);
            const y = H - PAD - ((m.avg - 1) / 9) * (H - PAD * 2);
            return [x, y];
        });
        let d = `M${pts[0][0]},${pts[0][1]}`;
        for (let i = 1; i < pts.length; i++) {
            const cx = (pts[i-1][0] + pts[i][0]) / 2;
            d += ` C${cx},${pts[i-1][1]} ${cx},${pts[i][1]} ${pts[i][0]},${pts[i][1]}`;
        }
        svgPath = `<path d="${d}" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round"/>`;
        svgArea = `<path d="${d} L${pts[pts.length-1][0]},100 L${pts[0][0]},100 Z" fill="url(#bG${uid})" opacity="0.7"/>`;
        svgDots = pts.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="#2563eb"/>`).join('');
        xLabels = subMonthList.map(m => m.label);
    }

    // ── Date formatting ───────────────────────────────────────────────────────
    function fmtDate(raw) {
        if (!raw) return '';
        const d = parseArgoDate ? parseArgoDate(raw) : new Date(raw);
        if (!d || isNaN(d)) return raw;
        return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
    }

    // ── Voti list rows ────────────────────────────────────────────────────────
    const votiRows = votiData.map((v, i) => {
        const val = getNumericGradeValue(v);
        const color = val >= 6 ? '#2563eb' : '#dc2626';
        const sep = i < votiData.length - 1 ? '<div style="height:1px;background:#f1f5f9;margin:12px 0;"></div>' : '';
        return `
        <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
                <h4 style="font-size:14px;font-weight:700;color:#1e293b;margin:0 0 3px;">${escapeHtml(normalizeTipoVerifica(v.tipo, false))}</h4>
                <span style="font-size:11px;font-weight:600;color:#94a3b8;">${fmtDate(v.data || v.date)}</span>
            </div>
            <span style="font-size:17px;font-weight:800;color:${color};">${v.valore || v.value}</span>
        </div>${sep}`;
    }).join('');

    const CARD = 'background:white;border-radius:32px;padding:24px;box-shadow:0 8px 30px -10px rgba(0,0,0,0.06);border:1px solid #f8fafc;margin-bottom:16px;';

    return `
    <div class="view-fullbleed min-h-screen pb-32" style="background:#f4f7fb;background-image:radial-gradient(circle at 50% 0%,rgba(224,231,255,0.4) 0%,transparent 50%);background-attachment:fixed;">
        <div style="padding:max(env(safe-area-inset-top,0px),40px) 24px 0;font-family:Hanken Grotesk,sans-serif;">

            <!-- Header -->
            <header style="display:flex;align-items:center;gap:14px;margin-bottom:24px;">
                <button onclick="window.closeSubject()" style="width:44px;height:44px;border-radius:16px;background:white;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px -4px rgba(0,0,0,0.08);flex-shrink:0;" ontouchstart="this.style.transform='scale(0.93)'" ontouchend="this.style.transform='scale(1)'">
                    <span class="material-symbols-outlined" style="font-size:20px;color:#1e3a8a;">arrow_back</span>
                </button>
                <h1 style="font-size:24px;font-weight:800;color:#1e3a8a;letter-spacing:-0.02em;margin:0;">${escapeHtml(subjectName)}</h1>
            </header>

            <!-- CARD 1: Media + grafico area -->
            <div style="${CARD}">
                <p style="font-size:10px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 4px;">Media Materia</p>
                <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:24px;">
                    <span style="font-size:56px;font-weight:800;color:#2563eb;line-height:1;letter-spacing:-0.03em;">${media.toFixed(2)}</span>
                    ${ (() => {
                        // Delta: media con tutti i voti - media senza l'ultimo voto
                        const sortedByDate = [...votiData].sort((a,b) => (a.data||a.date||'').localeCompare(b.data||b.date||''));
                        const allNums = sortedByDate.map(getNumericGradeValue).filter(v => Number.isFinite(v));
                        const mediaConTutti = allNums.length > 0 ? allNums.reduce((s,x)=>s+x,0)/allNums.length : null;
                        const mediaSenzaUltimo = allNums.length > 1 ? allNums.slice(0,-1).reduce((s,x)=>s+x,0)/(allNums.length-1) : null;
                        if (mediaConTutti !== null && mediaSenzaUltimo !== null) {
                            const diff = mediaConTutti - mediaSenzaUltimo;
                            const fmt  = diff.toFixed(2).replace('.', ',');
                            const isP  = diff >= 0;
                            return `<div style="display:flex;align-items:center;gap:5px;background:${isP ? 'rgba(230,244,234,0.9)' : 'rgba(254,242,242,0.9)'};border:1px solid ${isP ? '#bce3c8' : '#fecaca'};padding:5px 11px;border-radius:999px;margin-bottom:4px;">
                                <span class="material-symbols-outlined" style="font-size:12px;color:${isP ? '#16a34a' : '#dc2626'};font-variation-settings:'FILL' 1;">${isP ? 'trending_up' : 'trending_down'}</span>
                                <span style="font-size:10px;font-weight:800;color:${isP ? '#16a34a' : '#dc2626'};letter-spacing:0.05em;">${fmt}</span>
                            </div>`;
                        } else if (n >= 2) {
                            return `<div style="display:flex;align-items:center;gap:5px;background:#eff6ff;border:1px solid #bfdbfe;padding:5px 11px;border-radius:999px;margin-bottom:4px;">
                                <span class="material-symbols-outlined" style="font-size:12px;color:#2563eb;font-variation-settings:'FILL' 1;">trending_up</span>
                                <span style="font-size:10px;font-weight:800;color:#2563eb;letter-spacing:0.05em;text-transform:uppercase;">${n} voti totali</span>
                            </div>`;
                        }
                        return '';
                    })() }
                </div>
                ${subMonthList.length >= 2 ? `
                <div style="width:100%;height:96px;margin-bottom:10px;">
                    <svg viewBox="0 0 300 100" style="width:100%;height:100%;" preserveAspectRatio="none">
                        <defs>
                            <linearGradient id="bG${uid}" x1="0" x2="0" y1="0" y2="1">
                                <stop offset="0%" stop-color="#2563eb" stop-opacity="0.18"/>
                                <stop offset="100%" stop-color="#2563eb" stop-opacity="0"/>
                            </linearGradient>
                        </defs>
                        ${svgArea}${svgPath}${svgDots}
                    </svg>
                </div>
                <div style="display:flex;justify-content:space-between;padding:0 2px;">
                    ${xLabels.map(l => `<span style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.07em;">${l}</span>`).join('')}
                </div>` : ''}
            </div>

            <!-- CARD 2: Predictive Hub -->
            <div style="${CARD}">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
                    <div style="width:40px;height:40px;border-radius:50%;background:#eff6ff;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <span class="material-symbols-outlined" style="font-size:20px;color:#2563eb;font-variation-settings:'FILL' 1;">bolt</span>
                    </div>
                    <h2 style="font-size:18px;font-weight:700;color:#1e3a8a;margin:0;">Predictive Hub</h2>
                </div>
                <p style="font-size:13px;color:#64748b;line-height:1.6;font-weight:500;margin:0 0 20px;">Simula il tuo prossimo voto per vedere come influisce sulla media in tempo reale.</p>
                <div style="margin-bottom:20px;">
                    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:10px;">
                        <span style="font-size:10px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:0.1em;">Voto simulato</span>
                        <span id="${simLblId}" style="font-size:22px;font-weight:800;color:#2563eb;line-height:1;">7.5</span>
                    </div>
                    <input id="${uid}-range" type="range" min="1" max="10" step="0.5" value="7.5"
                        style="width:100%;height:6px;border-radius:4px;outline:none;cursor:pointer;-webkit-appearance:none;background:linear-gradient(to right,#2563eb 65%,#dbeafe 65%);"
                        oninput="(function(el){var pct=(el.value-1)/9*100;el.style.background='linear-gradient(to right,#2563eb '+pct+'%,#dbeafe '+pct+'%)';document.getElementById('${simLblId}').textContent=parseFloat(el.value).toFixed(1);var nm=((${media}*${n})+parseFloat(el.value))/(${n}+1);document.getElementById('${simResId}').textContent=nm.toFixed(2);})(this)">
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;background:#f8fafc;border-radius:20px;padding:14px 16px;border:1px solid #f1f5f9;">
                    <div>
                        <p style="font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 3px;">Media stimata</p>
                        <span id="${simResId}" style="font-size:24px;font-weight:800;color:#1e3a8a;line-height:1;">${simDefault}</span>
                    </div>
                    <div style="width:44px;height:44px;border-radius:50%;background:white;border:1px solid #e2e8f0;display:flex;align-items:center;justify-content:center;">
                        <span class="material-symbols-outlined" style="font-size:20px;color:#94a3b8;">auto_fix_high</span>
                    </div>
                </div>
            </div>

            <!-- CARD 3: Confronto Semestri -->
            ${hasSemesters ? `
            <div style="${CARD}">
                <p style="font-size:10px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 20px;">Confronto Semestri</p>
                <div style="margin-bottom:18px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px;">
                        <span style="font-size:14px;font-weight:700;color:#1e293b;">1° Semestre</span>
                        <span style="font-size:15px;font-weight:700;color:#475569;">${media1.toFixed(1)}</span>
                    </div>
                    <div style="width:100%;background:#f1f5f9;height:8px;border-radius:999px;overflow:hidden;">
                        <div style="width:${(media1/10*100).toFixed(0)}%;height:100%;background:#94a3b8;border-radius:999px;"></div>
                    </div>
                </div>
                <div style="margin-bottom:20px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px;">
                        <span style="font-size:14px;font-weight:700;color:#1e293b;">2° Semestre</span>
                        <span style="font-size:15px;font-weight:700;color:#2563eb;">${media2.toFixed(1)}</span>
                    </div>
                    <div style="width:100%;background:#f1f5f9;height:8px;border-radius:999px;overflow:hidden;">
                        <div style="width:${(media2/10*100).toFixed(0)}%;height:100%;background:#2563eb;border-radius:999px;"></div>
                    </div>
                </div>
                ${media2 > media1 ? `
                <div style="background:#f0fdf4;border-radius:20px;padding:14px 16px;display:flex;align-items:center;gap:14px;">
                    <div style="width:40px;height:40px;border-radius:14px;background:#dcfce7;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <span class="material-symbols-outlined" style="font-size:18px;color:#16a34a;">keyboard_double_arrow_up</span>
                    </div>
                    <p style="font-size:13px;color:#374151;line-height:1.4;margin:0;">Stai andando <b style="color:#1e293b;">${((media2-media1)/media1*100).toFixed(0)}% meglio</b> rispetto al primo semestre.</p>
                </div>` : `
                <div style="background:#fff7ed;border-radius:20px;padding:14px 16px;display:flex;align-items:center;gap:14px;">
                    <div style="width:40px;height:40px;border-radius:14px;background:#fed7aa;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <span class="material-symbols-outlined" style="font-size:18px;color:#ea580c;">keyboard_double_arrow_down</span>
                    </div>
                    <p style="font-size:13px;color:#374151;line-height:1.4;margin:0;">La media del 2° semestre è inferiore al primo. Puoi migliorare!</p>
                </div>`}
            </div>` : ''}

            <!-- CARD 4: Voti Ricevuti -->
            <div style="${CARD}">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
                    <p style="font-size:10px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:0.1em;margin:0;">Voti Ricevuti</p>
                    <span class="material-symbols-outlined" style="font-size:16px;color:#93c5fd;">history</span>
                </div>
                ${votiRows}
            </div>

            <!-- CARD 5: Obiettivo Accademico -->
            <div style="${CARD}margin-bottom:0;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;">
                    <div style="display:flex;align-items:center;gap:12px;">
                        <div style="width:40px;height:40px;border-radius:50%;background:#eff6ff;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                            <span class="material-symbols-outlined" style="font-size:18px;color:#1e3a8a;font-variation-settings:'FILL' 1;">flag</span>
                        </div>
                        <h2 style="font-size:17px;font-weight:700;color:#1e3a8a;margin:0;line-height:1.3;">Obiettivo<br>Accademico</h2>
                    </div>
                    <div style="text-align:right;cursor:pointer;" onclick="promptSetGoal('${escapeJsSingleQuote(subjectName)}')">
                        <p style="font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 2px;">Target</p>
                        <div style="display:flex;align-items:center;gap:5px;justify-content:flex-end;">
                            <span style="font-size:24px;font-weight:800;color:#1e3a8a;line-height:1;">${goal.toFixed(1)}</span>
                            <span class="material-symbols-outlined" style="font-size:14px;color:#64748b;">edit</span>
                        </div>
                    </div>
                </div>
                <p style="font-size:13px;color:#475569;line-height:1.65;font-weight:500;margin:0 0 14px;">${goalText}</p>
                <div style="display:flex;align-items:center;gap:6px;">
                    <span class="material-symbols-outlined" style="font-size:13px;color:#94a3b8;">info</span>
                    <span style="font-size:10px;color:#94a3b8;font-weight:600;">Calcolato in base alla tua media attuale di ${media.toFixed(1)}</span>
                </div>
            </div>

        </div>
    </div>`;
}

function mostraAssenzeModal() {
    const ad = state.assenzeData || { assenze: [], ritardi: [], uscite: [], totaleAssenze: 0, totaleRitardi: 0, totaleUscite: 0, oreAssenzaTotali: 0 };
    const all = [...ad.assenze.map(x => ({ ...x, icon: 'event_busy', color: 'error' })),
    ...ad.ritardi.map(x => ({ ...x, icon: 'schedule', color: 'orange' })),
    ...ad.uscite.map(x => ({ ...x, icon: 'logout', color: 'primary' }))];

    all.sort((a, b) => new Date(b.data) - new Date(a.data));

    showModal(`
        <div class="flex flex-col gap-6">
            <header>
                <h2 class="title-md text-primary mb-1">Riepilogo Assenze</h2>
                <p class="body-md text-on-surface-variant/60">Totale ore assenza: <b>${ad.oreAssenzaTotali.toFixed(1)}h</b></p>
            </header>

            <div class="grid grid-cols-2 gap-4">
                <div class="p-4 rounded-2xl bg-error/10 text-error border border-error/10">
                    <div class="label-sm opacity-60 mb-1">Assenze</div>
                    <div class="text-2xl font-bold">${ad.totaleAssenze}</div>
                </div>
                <div class="p-4 rounded-2xl bg-orange/10 text-orange border border-orange/10">
                    <div class="label-sm opacity-60 mb-1">Ritardi/Uscite</div>
                    <div class="text-2xl font-bold">${ad.totaleRitardi + ad.totaleUscite}</div>
                </div>
            </div>

            <div class="flex flex-col gap-3 max-h-[300px] overflow-y-auto no-scrollbar">
                ${all.map(a => `
                    <div class="flex items-center gap-4 p-4 rounded-2xl bg-surface-container-low border border-white/40">
                        <div class="w-10 h-10 rounded-full bg-${a.color}/10 flex items-center justify-center text-${a.color}">
                            <span class="material-symbols-outlined text-[20px]">${a.icon}</span>
                        </div>
                        <div class="flex-1">
                            <div class="font-bold text-sm">${new Date(a.data).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}</div>
                            <div class="text-[11px] text-on-surface-variant/60 uppercase font-bold">${a.tipo || 'Evento'}</div>
                        </div>
                        <div class="text-right">
                             <div class="label-sm ${a.giustificata ? 'text-green' : 'text-error'}">${a.giustificata ? 'OK' : 'DA GIUST.'}</div>
                        </div>
                    </div>
                `).join('')}
            </div>

            <button class="btn btn-primary w-full" onclick="closeModal()">Chiudi</button>
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
        <div class="flex flex-col gap-6">
            <header>
                <h2 class="title-md text-primary mb-1">Prossime Verifiche</h2>
                <p class="body-md text-on-surface-variant/60">Calendario prove ed esami</p>
            </header>

            <div class="flex flex-col gap-4 max-h-[400px] overflow-y-auto no-scrollbar">
                ${all.length === 0 ? `
                    <div class="p-12 text-center text-on-surface-variant/40">
                        <span class="material-symbols-outlined text-4xl mb-2">event_available</span>
                        <p class="font-medium">Nessuna verifica in programma</p>
                    </div>
                ` : all.map(v => `
                    <div class="p-5 rounded-[28px] bg-surface-container-low border border-white/40 flex items-center gap-4">
                        <div class="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-bold">
                            ${getSubjectAbbrev(v.materia)}
                        </div>
                        <div class="flex-1 min-width-0">
                            <h3 class="font-bold text-[15px] truncate">${escapeHtml(v.text || v.materia)}</h3>
                            <p class="text-[12px] text-on-surface-variant/60 uppercase font-bold tracking-wider">${v.data}</p>
                        </div>
                        ${v.source === 'manual' ? `
                            <button onclick="deleteManualVerifica('${v.id}')" class="w-8 h-8 rounded-full bg-error/10 text-error flex items-center justify-center">
                                <span class="material-symbols-outlined text-[18px]">delete</span>
                            </button>
                        ` : ''}
                    </div>
                `).join('')}
            </div>

            <button class="btn btn-primary w-full" onclick="closeModal()">Chiudi</button>
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
    const normalizedTipo = (v.tipo || '').toString().trim().toLowerCase();
    const tipoLabel = normalizedTipo === 'scritta' ? 'SCRITTA' : normalizedTipo === 'orale' ? 'ORALE' : '';
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

    // ── Build overlay inline — zero CSS class dependencies ──────────────────
    const overlay = document.createElement('div');
    overlay.id = 'circ-overlay-' + id;
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,0.4);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);display:flex;align-items:flex-end;justify-content:center;';

    const sheet = document.createElement('div');
    sheet.style.cssText = 'width:100%;max-width:520px;background:#ffffff;border-radius:32px 32px 0 0;display:flex;flex-direction:column;max-height:92vh;box-shadow:0 -4px 32px rgba(0,0,0,0.12);transform:translateY(100%);transition:transform 0.3s cubic-bezier(0.2,0.8,0.2,1);font-family:Hanken Grotesk,sans-serif;';

    const sintesiContent = c.sintesi
        ? `<div style="font-size:15px;line-height:1.7;color:#334155;">${typeof marked !== 'undefined' ? marked.parse(c.sintesi) : escapeHtml(c.sintesi)}</div>`
        : `<div id="sintesi-placeholder-${c.id}" style="display:flex;flex-direction:column;align-items:center;text-align:center;padding:20px 0;gap:12px;">
               <div style="width:56px;height:56px;border-radius:20px;background:#eff6ff;display:flex;align-items:center;justify-content:center;">
                   <span class="material-symbols-outlined" style="font-size:28px;color:#2563eb;font-variation-settings:'FILL' 1;">auto_awesome</span>
               </div>
               <p style="font-size:15px;font-weight:700;color:#0f172a;margin:0;">Analisi AI disponibile</p>
               <p style="font-size:13px;color:#94a3b8;font-weight:500;margin:0;max-width:220px;">Ottieni una sintesi intelligente dei punti chiave della circolare.</p>
               <button id="btn-sintesi-${c.id}" onclick="window._circ_startSintesi('${escapeJsSingleQuote(c.id)}','${escapeJsSingleQuote(c.link || '')}')" style="width:100%;height:48px;border-radius:14px;background:#2563eb;color:white;border:none;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-family:Hanken Grotesk,sans-serif;margin-top:4px;">
                   <span class="material-symbols-outlined" style="font-size:18px;font-variation-settings:'FILL' 1;">psychology</span>
                   Elabora Sintesi
               </button>
           </div>`;

    sheet.innerHTML = `
        <!-- Drag handle -->
        <div style="display:flex;justify-content:center;padding:14px 0 6px;flex-shrink:0;">
            <div style="width:40px;height:4px;border-radius:999px;background:#d1d5db;"></div>
        </div>

        <!-- Header -->
        <div style="padding:8px 22px 16px;flex-shrink:0;border-bottom:1px solid #f1f5f9;">
            <p style="font-size:10px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 6px;">Circolare N. ${escapeHtml(String(c.numero || ''))}</p>
            <h2 style="font-size:20px;font-weight:800;color:#0f172a;line-height:1.25;margin:0 0 8px;letter-spacing:-0.01em;">${escapeHtml(c.titolo)}</h2>
            <div style="display:flex;align-items:center;gap:6px;">
                <span class="material-symbols-outlined" style="font-size:14px;color:#94a3b8;">calendar_today</span>
                <span style="font-size:13px;font-weight:500;color:#64748b;">${escapeHtml(c.data || '')}</span>
            </div>
        </div>

        <!-- Scrollable body -->
        <div id="sintesi-box-${c.id}" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:20px 22px;">
            ${sintesiContent}
        </div>

        <!-- Actions -->
        <div style="padding:16px 22px calc(28px + env(safe-area-inset-bottom,0px));flex-shrink:0;display:flex;flex-direction:column;gap:10px;border-top:1px solid #f1f5f9;">
            ${c.link ? `<button onclick="window.open('${escapeJsSingleQuote(c.link)}','_blank')" style="width:100%;height:52px;border-radius:15px;background:#2563eb;color:white;border:none;font-size:15px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-family:Hanken Grotesk,sans-serif;box-shadow:0 6px 18px -4px rgba(37,99,235,0.35);">
                <span class="material-symbols-outlined" style="font-size:19px;">open_in_new</span>Apri Documento
            </button>` : ''}
            <button id="circ-close-btn-${id}" style="width:100%;height:44px;background:none;border:none;color:#2563eb;font-size:15px;font-weight:700;cursor:pointer;font-family:Hanken Grotesk,sans-serif;">Chiudi</button>
        </div>
    `;

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => { sheet.style.transform = 'translateY(0)'; });

    // Close logic — robust DOM removal
    function closeCirc() {
        sheet.style.transform = 'translateY(100%)';
        setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 320);
    }
    overlay.addEventListener('click', e => { if (e.target === overlay) closeCirc(); });
    document.getElementById('circ-close-btn-' + id).addEventListener('click', closeCirc);

    // ── Sintesi progress animation ───────────────────────────────────────────
    window._circ_startSintesi = function(cid, link) {
        const btn = document.getElementById('btn-sintesi-' + cid);
        const placeholder = document.getElementById('sintesi-placeholder-' + cid);
        if (!placeholder) return;

        // Replace placeholder with progress UI
        placeholder.innerHTML = `
            <div style="width:100%;padding:8px 0;">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
                    <div style="width:36px;height:36px;border-radius:50%;background:#eff6ff;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <span class="material-symbols-outlined" style="font-size:18px;color:#2563eb;font-variation-settings:'FILL' 1;">psychology</span>
                    </div>
                    <div style="flex:1;">
                        <p id="sintesi-stage-${cid}" style="font-size:11px;font-weight:800;color:#2563eb;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 6px;">Avvio analisi…</p>
                        <div style="width:100%;height:6px;background:#e2e8f0;border-radius:999px;overflow:hidden;">
                            <div id="sintesi-bar-${cid}" style="height:100%;width:0%;background:linear-gradient(90deg,#2563eb,#60a5fa);border-radius:999px;transition:width 0.4s ease;"></div>
                        </div>
                    </div>
                </div>
                <p id="sintesi-sub-${cid}" style="font-size:12px;color:#94a3b8;font-weight:500;margin:0;">Lettura del documento in corso…</p>
            </div>`;

        const stages = [
            { pct: 15, label: 'Scansione metadati…',       sub: 'Identificazione del documento' },
            { pct: 35, label: 'Recupero PDF…',             sub: 'Download del file circolare' },
            { pct: 60, label: 'Estrazione testo…',         sub: 'Analisi del contenuto' },
            { pct: 80, label: 'Sintesi neurale in corso…', sub: 'Il modello AI sta elaborando' },
            { pct: 92, label: 'Quasi pronto…',             sub: 'Finalizzazione della risposta' },
        ];
        let si = 0;
        const bar = document.getElementById('sintesi-bar-' + cid);
        const stageEl = document.getElementById('sintesi-stage-' + cid);
        const subEl = document.getElementById('sintesi-sub-' + cid);

        const iv = setInterval(() => {
            if (si >= stages.length) { clearInterval(iv); return; }
            const s = stages[si++];
            if (bar) bar.style.width = s.pct + '%';
            if (stageEl) stageEl.textContent = s.label;
            if (subEl) subEl.textContent = s.sub;
        }, 1400);

        // Call the real synthesis
        (async () => {
            if (typeof window.requestCircularSynthesis === 'function') {
                await window.requestCircularSynthesis(cid, link);
            }
            clearInterval(iv);
            if (bar) bar.style.width = '100%';
            if (stageEl) stageEl.textContent = 'Completato';
        })();
    };
}
function renderDayDetailModal(dateStr) {
    const container = getModalContainer();
    if (!container) return;

    const date = parseArgoDate(dateStr);
    const formattedDate = date.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });

    const tasksForDay = getCalendarTasksForDate(dateStr);
    const verificheForDay = [];
    (state.verifiche || []).filter(v => v.data === dateStr).forEach(v => {
        verificheForDay.push({ subject: v.materia || v.subject || '', text: v.text || v.descrizione || '', tipo: v.tipo || '' });
    });
    (state.manualVerifiche || []).filter(v => v.date === dateStr).forEach(v => {
        verificheForDay.push({ subject: v.subject || '', text: v.args || '', tipo: v.type || '', id: v.id });
    });

    const hasContent = tasksForDay.length > 0 || verificheForDay.length > 0;

    showModal(`
        <div class="flex flex-col gap-6">
            <header>
                <div class="label-sm text-primary mb-1">Agenda Giornaliera</div>
                <h2 class="title-md text-on-surface capitalize">${formattedDate}</h2>
            </header>

            <div id="modal-task-list" class="flex flex-col gap-4 max-h-[400px] overflow-y-auto no-scrollbar">
                ${!hasContent ? `
                    <div class="p-12 text-center text-on-surface-variant/40">
                        <span class="material-symbols-outlined text-4xl mb-2">event_note</span>
                        <p class="font-medium">Nessun impegno pianificato</p>
                    </div>
                ` : ''}

                ${verificheForDay.map(v => `
                    <div class="p-5 rounded-[28px] bg-error/5 border border-error/20 flex items-center gap-4">
                        <div class="w-10 h-10 rounded-xl bg-error/10 flex items-center justify-center text-error">
                            <span class="material-symbols-outlined text-[20px]">warning</span>
                        </div>
                        <div class="flex-1">
                            <div class="label-sm text-error mb-1">${escapeHtml(normalizeTipoVerifica(v.tipo))}</div>
                            <h3 class="font-bold text-[15px]">${escapeHtml(v.text || v.subject)}</h3>
                        </div>
                    </div>
                `).join('')}

                ${tasksForDay.map(t => `
                    <div class="p-5 rounded-[28px] bg-surface-container-low border border-white/40 flex items-center gap-4 ${t.done ? 'opacity-50' : ''}">
                        <button onclick="toggleTask('${escapeJsSingleQuote(t.id)}'); renderDayDetailModal('${escapeJsSingleQuote(dateStr)}');" class="w-10 h-10 rounded-xl ${t.done ? 'bg-green/10 text-green' : 'bg-primary/10 text-primary'} flex items-center justify-center border border-white/60">
                            <span class="material-symbols-outlined text-[20px]">${t.done ? 'task_alt' : 'circle'}</span>
                        </button>
                        <div class="flex-1 min-width-0">
                            <div class="label-sm text-on-surface-variant/40 mb-1">${escapeHtml(t.subject)}</div>
                            <h3 class="font-bold text-[15px] truncate ${t.done ? 'line-through' : ''}">${escapeHtml(t.text)}</h3>
                        </div>
                        ${isUserGeneratedTaskId(t.id) ? `
                            <button onclick="deleteCalendarTask('${escapeJsSingleQuote(t.id)}', '${escapeJsSingleQuote(dateStr)}')" class="w-8 h-8 rounded-full bg-error/10 text-error flex items-center justify-center">
                                <span class="material-symbols-outlined text-[18px]">delete</span>
                            </button>
                        ` : ''}
                    </div>
                `).join('')}
            </div>

            <button class="btn btn-primary w-full h-14" onclick="closeModal()">Chiudi</button>
        </div>
    `);
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
function deleteCalendarTask(taskId, dateStr = '') {
    if (!taskId || !isUserGeneratedTaskId(taskId)) return;
    const shouldRefreshDayModal = Boolean(dateStr && document.getElementById('modal-task-list'));
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
    if (shouldRefreshDayModal) {
        renderDayDetailModal(dateStr);
    }
    notifyPlannerChanged();
    if (typeof updateHomeTaskFocusWidget === 'function') updateHomeTaskFocusWidget();
    if (typeof updateHomeView === 'function') updateHomeView();
    if (typeof renderCustomCalendar === 'function') renderCustomCalendar();
    if (typeof scheduleRender === 'function' && state.view === 'planner') scheduleRender(0);
}
function clearPlannedCalendarTasks() {
    const planned = (state.plannedTasks && typeof state.plannedTasks === 'object') ? state.plannedTasks : {};
    const hasPlanned = hasPlannedTasks(planned);
    if (!hasPlanned) {
        if (typeof showToast === 'function') showToast('Nessun compito pianificato da eliminare');
        return;
    }
    if (!confirm('Vuoi eliminare tutti i compiti pianificati nel calendario? L\'azione verrà salvata anche nel database.')) return;

    state.plannedTasks = {};
    saveTasks();
    if (typeof debouncedSavePlannerRemote === 'function') debouncedSavePlannerRemote(300);
    if (typeof showToast === 'function') showToast('Compiti pianificati eliminati');

    notifyPlannerChanged();
    if (state.view === 'planner' && state.uiMode === 'calendar' && typeof renderCustomCalendar === 'function') {
        renderCustomCalendar();
    } else if (state.view === 'planner' && typeof refreshAgenda === 'function') {
        refreshAgenda();
    } else if (typeof scheduleRender === 'function') {
        scheduleRender(0);
    }
}
function notifyPlannerChanged() {
    // ✅ FIX: invalida sempre la cache agenda prima di aggiornare
    state._weeklyAgendaCacheHtml = '';
    try { localStorage.removeItem(getAgendaCacheKey()); } catch (_) { }

    // badge sul bottone Organizza Oggi e Dashboard
    if (typeof updatePlannerCounter === 'function') updatePlannerCounter();
    // updateHomeView rimuove/aggiorna righe esistenti; updateHomeTaskFocusWidget
    // fa un re-render completo del widget (aggiunge anche i task appena pianificati)
    if (typeof updateHomeView === 'function') updateHomeView();
    if (typeof updateHomeTaskFocusWidget === 'function') updateHomeTaskFocusWidget();

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
function getPlannedTasksTotalCount() {
    return Object.values(state.plannedTasks || {}).reduce((sum, list) => {
        if (!Array.isArray(list)) return sum;
        return sum + list.length;
    }, 0);
}
function getSubjectColor(subject) {
    let s = (subject || '').trim();
    s = s.replace(/[*_\[\]]/g, '').trim();
    if (!s) return '#3B9DD4';

    const normalized = normalizeSubjectName(s);
    const abbr = getSubjectAbbrev(s).toLowerCase();
    const colorByAbbrev = {
        mat: '#3B9DD4',
        fis: '#2563EB',
        ing: '#2DB86A',
        ita: '#9B4DD4',
        sto: '#C8921E',
        geo: '#D4A037',
        lat: '#D44B4B',
        sci: '#1DB87A',
        bio: '#1DB870',
        chi: '#9040C8',
        fil: '#7060C8',
        art: '#E06020',
        dis: '#E06020',
        scm: '#38A020',
        rel: '#C82090',
        inf: '#3060D0',
        dir: '#2A5CC8',
        eco: '#C89020',
        fra: '#3055C0',
        ted: '#C82060',
        spa: '#C83030',
        grc: '#C82090',
        civ: '#E67E22'
    };
    if (colorByAbbrev[abbr]) return colorByAbbrev[abbr];

    if (normalized.includes('educazione civica') || normalized.includes('ed civica') || normalized.includes('civica')) return '#E67E22';
    if (normalized.includes('scienze motorie') || normalized.includes('motorie') || normalized.includes('sportive')) return '#38A020';
    if (normalized.includes('scienze naturali') || normalized.includes('naturali')) return '#1DB87A';
    if (normalized.includes('filosofia')) return '#7060C8';
    if (normalized.includes('fisica')) return '#2563EB';
    const isArtDrawingSubject = isArtDrawingSubjectNormalized(normalized);
    if (isArtDrawingSubject) return '#E06020';

    // Fallback: stable vibrant color
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
        hash = s.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash % 360);
    return `hsl(${h}, 80%, 52%)`;
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
    const tasks = Array.isArray(state.tasks) ? state.tasks : [];
    const plannedTasks = (state.plannedTasks && typeof state.plannedTasks === 'object') ? state.plannedTasks : {};

    if (state.plannerMode === 'registro') {
        tasks.forEach(t => {
            if (t.subject !== 'QUEST' && !t.isExam && t.due_date) {
                list.push({ ...t, displayDate: t.due_date });
            }
        });
    } else {
        Object.entries(plannedTasks).forEach(([dateStr, ids]) => {
            if (!Array.isArray(ids)) return;
            ids.forEach(id => {
                const t = tasks.find(tk => tk.id === id);
                if (t && !t.isExam) list.push({ ...t, displayDate: dateStr });
            });
        });
    }



    // --- LIVE FILTERING LOGIC ---
    const query = (state.agendaSearchQuery || "").toLowerCase().trim();
    const filterSubject = state.agendaSearchSubject || "all";
    if (state.agendaSortOrder !== "due_desc") state.agendaSortOrder = "due_desc";

    const preparedList = list.map(t => ({
        ...t,
        _dueTs: parseArgoDate(t.displayDate).getTime()
    }));

    const filteredList = preparedList.filter(t => {
        const matchesQuery = !query ||
            (t.text || "").toLowerCase().includes(query) ||
            (t.subject || "").toLowerCase().includes(query);

        const matchesSubject = filterSubject === "all" ||
            (t.subject || "").toLowerCase().trim() === filterSubject.toLowerCase().trim();

        return matchesQuery && matchesSubject;
    }).sort((a, b) => b._dueTs - a._dueTs);

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
                        <div class="filter-chip ${filterSubject === 'all' ? 'active' : ''}" onclick="state.agendaSearchSubject='all'; state._filterJustTriggered=true; refreshAgenda();">
                            <i class="ph ph-rows"></i> Tutti
                        </div>
                        ${allSubjects.map(s => {
        const escapedS = s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
        return `
                                <div class="filter-chip ${filterSubject === s ? 'active' : ''}" onclick="state.agendaSearchSubject='${escapedS}'; state._filterJustTriggered=true; refreshAgenda();">
                                    ${s}
                                </div>
                            `;
    }).join('')}
                    </div>
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
    const sortedDates = Object.keys(grouped).sort((a, b) => parseArgoDate(b).getTime() - parseArgoDate(a).getTime());

    return `
        <div id="weekly-agenda-list" class="weekly-agenda-root" style="display: flex; flex-direction: column; gap: 32px;">
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
            ? `<span class="agenda-day-label" style="font-family: var(--font-main); font-size:10px; font-weight:800; color:${labelColor}; border: 1px solid ${labelColor}; padding:2px 8px; border-radius:4px; text-transform:uppercase; letter-spacing:0.05em;">${labelText}</span>`
            : '';

        return `
            <div class="agenda-day-section">
                <!-- TE Date Header -->
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                    <div style="display:flex; flex-direction:column; align-items:center; min-width:44px;">
                        <span style="font-family: var(--font-main); font-size:24px; font-weight:800; color:${isToday ? 'var(--accent)' : 'var(--text-primary)'}; line-height:1; letter-spacing:-0.04em;">${dayNum}</span>
                        <span class="agenda-day-month" style="font-family: var(--font-main); font-size:10px; font-weight:700; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.1em; margin-top:2px;">${monthName}</span>
                    </div>
                    <div style="flex:1; height:1px; background:rgba(0,0,0,0.05);"></div>
                    <div style="font-family: var(--font-main); font-size:12px; font-weight:700; color:var(--text-dim); text-transform:capitalize; letter-spacing:-0.01em;">${dayName}</div>
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
                        <div class="card agenda-task-card" style="display:flex; align-items:stretch; background:${t.done ? '#FAFAF9' : '#FFFFFF'}; border: 1px solid ${t.done ? '#EDEBE7' : 'rgba(0,0,0,0.06)'}; border-radius:14px; min-height:80px; box-shadow: 0 1px 3px rgba(0,0,0,0.02); transition: background 0.2s cubic-bezier(0.2, 0.8, 0.2, 1), border-color 0.2s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);">
                        <div style="width:4px; background:${t.done ? '#C8C5C0' : subjColor}; flex-shrink:0;"></div>
                        
                        <div class="agenda-task-main" style="flex:1; padding:16px 20px; min-width:0; display:flex; flex-direction:column; justify-content:center;">
                            <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px; flex-wrap:wrap;">
                                <span class="agenda-subject-badge" style="font-family: var(--font-main); font-size:9px; font-weight:700; color:${t.done ? '#908C86' : subjColor}; text-transform:uppercase; letter-spacing:0.08em; background:rgba(0,0,0,0.04); padding:2px 6px; border-radius:4px;">${escapeHtml(cleanSubject)}</span>
                                ${timeStr ? `<span class="agenda-time-badge" style="font-family: var(--font-main); font-size:9px; font-weight:600; color:#908C86; background:#F6F5F3; padding:2px 6px; border-radius:4px;">${escapeHtml(timeStr)}</span>` : ''}
                            </div>
                            <div data-task-text="${escapeHtml(t.id)}" style="font-family: var(--font-main); font-size:14px; font-weight:600; color:${t.done ? '#908C86' : '#141414'}; line-height:1.5; word-break:break-word; ${t.done ? 'text-decoration:line-through; opacity: 0.5;' : ''}">${escapeHtml(displayText)}</div>
                        </div>
                        
                        <div class="agenda-task-actions" style="padding:0 16px; display:flex; align-items:center; justify-content:center; gap:8px; flex-shrink:0; border-left: 1px dashed rgba(0,0,0,0.04);">
                            <div class="agenda-task-action-btn" data-task-toggle="${escapeHtml(t.id)}" onclick="toggleTask('${escapeJsSingleQuote(t.id)}')" style="width:30px; height:30px; border-radius:8px; border:1.5px solid ${t.done ? '#141414' : '#C8C5C0'}; background:${t.done ? '#141414' : 'transparent'}; display:flex; align-items:center; justify-content:center; cursor:pointer; transition: background 0.18s ease, border-color 0.18s ease; flex-shrink:0;">
                                ${t.done ? '<i class="ph-bold ph-check" style="font-size:14px; color:#fff;"></i>' : ''}
                            </div>
                            ${isUserGeneratedTaskId(t.id) ? `
                            <button class="agenda-task-action-btn" onclick="event.stopPropagation(); deleteCalendarTask('${escapeJsSingleQuote(t.id)}');" style="width:30px; height:30px; border-radius:8px; border:1px solid rgba(255,59,48,0.18); background:#FFF0EE; color:#FF3B30; display:flex; align-items:center; justify-content:center; cursor:pointer; transition: background 0.18s ease; flex-shrink:0;" aria-label="Elimina attività">
                                <i class="ph-bold ph-trash" style="font-size:13px;"></i>
                            </button>` : ''}
                        </div>
                    </div>`;
        }).join('')}
                </div>
            </div>`;
    }).join('')}
        </div>`;
}

function getActivityDateObject(activity) {
    const rawDate = activity?.date || activity?.datGiorno || '';
    const parsed = parseArgoDate(rawDate);
    if (!(parsed instanceof Date) || Number.isNaN(parsed.getTime())) return null;
    return parsed;
}

function getCurrentSchoolYearLabel() {
    const now = new Date();
    // Convenzione scolastica italiana: anno scolastico da settembre ad agosto.
    const startYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    return `${startYear}-${startYear + 1}`;
}

function getSchoolYearLabelForDate(date) {
    // Convenzione scolastica italiana: anno scolastico da settembre ad agosto.
    const startYear = date.getMonth() >= 8 ? date.getFullYear() : date.getFullYear() - 1;
    return `${startYear}-${startYear + 1}`;
}

function getIsoWeekInputValue(date) {
    const target = new Date(date.getTime());
    target.setHours(0, 0, 0, 0);
    const day = (target.getDay() + 6) % 7;
    target.setDate(target.getDate() - day + 3);
    const firstThursday = new Date(target.getFullYear(), 0, 4);
    const firstThursdayDay = (firstThursday.getDay() + 6) % 7;
    firstThursday.setDate(firstThursday.getDate() - firstThursdayDay + 3);
    const week = 1 + Math.round((target - firstThursday) / (7 * 24 * 60 * 60 * 1000));
    return `${target.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

function parseIsoWeekRange(weekValue) {
    const match = String(weekValue || '').match(/^(\d{4})-W(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const week = Number(match[2]);
    if (!Number.isFinite(year) || !Number.isFinite(week)) return null;
    const jan4 = new Date(year, 0, 4, 12, 0, 0);
    const jan4Day = (jan4.getDay() + 6) % 7;
    const week1Monday = new Date(jan4);
    week1Monday.setDate(jan4.getDate() - jan4Day);
    const start = new Date(week1Monday);
    start.setDate(week1Monday.getDate() + (week - 1) * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start, end };
}

function getViewportWidth() {
    return window.innerWidth || document.documentElement.clientWidth || 0;
}

function getWeekSelectionDetailLabel(weekValue, options = {}) {
    const match = String(weekValue || '').match(/^(\d{4})-W(\d{2})$/);
    const range = parseIsoWeekRange(weekValue);
    if (!match || !range) return '';
    const weekNumber = Number(match[2]);
    const weekYear = Number(match[1]);
    const startLabel = range.start.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit' });
    const endLabel = range.end.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit' });
    if (options.compact) return `${startLabel} → ${endLabel}`;
    return `Settimana ${weekNumber} del ${weekYear} · da ${startLabel} a ${endLabel}`;
}

function getWeekSelectionOptionLabel(weekValue, options = {}) {
    const normalizedWeek = String(weekValue || '');
    if (!/^\d{4}-W\d{2}$/.test(normalizedWeek)) return normalizedWeek;
    const range = parseIsoWeekRange(normalizedWeek);
    if (!range) return normalizedWeek;
    const startLabel = range.start.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
    const endLabel = range.end.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
    if (options.compact) return `${startLabel} → ${endLabel}`;
    const weekNumber = Number(normalizedWeek.slice(6));
    return `Settimana ${weekNumber} · ${startLabel} → ${endLabel}`;
}

function shiftIsoWeekValue(weekValue, deltaWeeks) {
    const range = parseIsoWeekRange(weekValue);
    if (!range || !Number.isFinite(deltaWeeks)) return weekValue;
    const target = new Date(range.start);
    target.setDate(target.getDate() + (deltaWeeks * 7));
    return getIsoWeekInputValue(target);
}

function getClassActivitiesWeekOptions(selectedWeekValue) {
    const weeks = new Set();
    const today = new Date();
    // Keep a wide recent/upcoming window so users can switch weeks quickly without raw ISO inputs.
    for (let offset = -CLASS_ACTIVITIES_WEEK_LOOKBACK; offset <= CLASS_ACTIVITIES_WEEK_LOOKAHEAD; offset += 1) {
        const d = new Date(today);
        d.setDate(today.getDate() + (offset * 7));
        weeks.add(getIsoWeekInputValue(d));
    }
    getSortedCompletedClassActivities().forEach((activity) => {
        if (activity?._parsedDate instanceof Date) {
            weeks.add(getIsoWeekInputValue(activity._parsedDate));
        }
    });
    const selected = selectedWeekValue || getIsoWeekInputValue(today);
    weeks.add(selected);
    const sorted = [...weeks].sort((a, b) => {
        const aStart = parseIsoWeekRange(a)?.start?.getTime?.() ?? 0;
        const bStart = parseIsoWeekRange(b)?.start?.getTime?.() ?? 0;
        return bStart - aStart;
    });
    // Safety cap to keep the dropdown compact even when there are many historical school years.
    return sorted.slice(0, CLASS_ACTIVITIES_MAX_WEEK_OPTIONS);
}

function getSortedCompletedClassActivities() {
    return (Array.isArray(state.classActivities) ? state.classActivities : [])
        .map((a) => ({ ...a, _parsedDate: getActivityDateObject(a) }))
        .filter((a) => a._parsedDate)
        .sort((a, b) => {
            const delta = b._parsedDate.getTime() - a._parsedDate.getTime();
            if (delta !== 0) return delta;
            return String(b?.id || '').localeCompare(String(a?.id || ''));
        });
}

function getClassActivitiesExportSelection() {
    const saved = state.classActivitiesExport || {};
    const period = saved.period || 'month';
    const monthValue = saved.month || getLocalDateString().slice(0, 7);
    const weekValue = saved.week || getIsoWeekInputValue(new Date());
    const schoolYearValue = saved.schoolYear || getCurrentSchoolYearLabel();
    const all = getSortedCompletedClassActivities();
    let items = all;
    let periodLabel = 'Intero anno scolastico';

    if (period === 'month') {
        items = all.filter((a) => getLocalDateString(a._parsedDate).slice(0, 7) === monthValue);
        const [y, m] = monthValue.split('-');
        const monthName = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
        periodLabel = `Mese: ${monthName}`;
    } else if (period === 'week') {
        const range = parseIsoWeekRange(weekValue);
        if (range) {
            const startKey = getLocalDateString(range.start);
            const endKey = getLocalDateString(range.end);
            items = all.filter((a) => {
                const key = getLocalDateString(a._parsedDate);
                return key >= startKey && key <= endKey;
            });
            periodLabel = getWeekSelectionDetailLabel(weekValue) || `Settimana: ${range.start.toLocaleDateString('it-IT')} - ${range.end.toLocaleDateString('it-IT')}`;
        } else {
            items = [];
            periodLabel = 'Settimana non valida';
        }
    } else if (period === 'school_year') {
        const m = schoolYearValue.match(/^(\d{4})-(\d{4})$/);
        if (m) {
            const start = new Date(Number(m[1]), 8, 1, 0, 0, 0);
            const end = new Date(Number(m[2]), 7, 31, 23, 59, 59);
            items = all.filter((a) => a._parsedDate >= start && a._parsedDate <= end);
            periodLabel = `Anno scolastico: ${m[1]}/${m[2]}`;
        } else {
            items = [];
            periodLabel = 'Anno scolastico non valido';
        }
    }

    return { period, monthValue, weekValue, schoolYearValue, items, periodLabel, totalItems: all.length };
}

function renderClassActivitiesExportModalContent() {
    const modalContent = document.getElementById('class-activities-export-modal-content');
    if (!modalContent) return;
    const selection = getClassActivitiesExportSelection();
    const weekOptions = getClassActivitiesWeekOptions(selection.weekValue);
    if (!weekOptions.includes(selection.weekValue) && weekOptions.length > 0) {
        selection.weekValue = weekOptions[0];
        state.classActivitiesExport = state.classActivitiesExport || {};
        state.classActivitiesExport.week = selection.weekValue;
    }
    const viewportWidth = getViewportWidth();
    const compactWeekLabels = viewportWidth <= MOBILE_WEEK_LABEL_BREAKPOINT;
    const weekDetailLabel = getWeekSelectionDetailLabel(selection.weekValue, compactWeekLabels ? { compact: true } : {});
    const years = [...new Set(getSortedCompletedClassActivities().map(a => getSchoolYearLabelForDate(a._parsedDate)))].sort((a, b) => b.localeCompare(a));
    if (!years.length) years.push(getCurrentSchoolYearLabel());


    // ── Period controls — tutto inline, zero dipendenze CSS esterne ─────────
    const S = 'width:100%;padding:12px 14px;border-radius:13px;border:1.5px solid rgba(226,232,240,0.9);background:white;color:#1e293b;font-size:14px;font-weight:500;font-family:Hanken Grotesk,sans-serif;outline:none;box-sizing:border-box;-webkit-appearance:none;';

    const periodControls = selection.period === 'month'
        ? `<input type="month" value="${escapeHtml(selection.monthValue)}" onchange="updateClassActivitiesExportPeriodValue('month', this.value)" style="${S}">`
        : selection.period === 'week'
            ? `<div style="display:flex;flex-direction:column;gap:6px;">
                <div style="display:flex;align-items:center;gap:8px;">
                    <button type="button" onclick="shiftClassActivitiesExportWeek(-1)" style="width:38px;height:38px;border-radius:50%;background:#f1f5f9;border:1.5px solid rgba(226,232,240,0.9);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <span class="material-symbols-outlined" style="font-size:18px;color:#64748b;">chevron_left</span>
                    </button>
                    <select onchange="updateClassActivitiesExportPeriodValue('week', this.value)" style="${S}flex:1;">
                        ${weekOptions.map((weekValue) => `<option value="${escapeHtml(weekValue)}" ${selection.weekValue === weekValue ? 'selected' : ''}>${escapeHtml(getWeekSelectionOptionLabel(weekValue, compactWeekLabels ? { compact: true } : {}))}</option>`).join('')}
                    </select>
                    <button type="button" onclick="shiftClassActivitiesExportWeek(1)" style="width:38px;height:38px;border-radius:50%;background:#f1f5f9;border:1.5px solid rgba(226,232,240,0.9);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <span class="material-symbols-outlined" style="font-size:18px;color:#64748b;">chevron_right</span>
                    </button>
                </div>
                ${weekDetailLabel ? `<p style="font-size:11px;color:#94a3b8;font-weight:700;text-align:center;margin:0;">${escapeHtml(weekDetailLabel)}</p>` : ''}
              </div>`
            : `<select onchange="updateClassActivitiesExportPeriodValue('school_year', this.value)" style="${S}">
                ${years.map(y => `<option value="${escapeHtml(y)}" ${selection.schoolYearValue === y ? 'selected' : ''}>${escapeHtml(y.replace('-', '/'))}</option>`).join('')}
              </select>`;

    const mkTab = (period, label) => {
        const act = selection.period === period;
        return `<button onclick="setClassActivitiesExportPeriod('${period}')" style="padding:10px 4px;border-radius:13px;font-size:12px;font-weight:700;cursor:pointer;font-family:Hanken Grotesk,sans-serif;border:${act?'2px solid #2563eb':'1.5px solid rgba(226,232,240,0.9)'};background:${act?'#2563eb':'white'};color:${act?'white':'#64748b'};">${label}</button>`;
    };

    modalContent.innerHTML = `
        <div style="font-family:Hanken Grotesk,sans-serif;">
            <!-- Header -->
            <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:18px 22px 16px;">
                <div>
                    <h2 style="margin:0;font-size:20px;font-weight:800;color:#0f172a;letter-spacing:-0.01em;">Esporta attività</h2>
                    <p style="margin:4px 0 0;font-size:12px;color:#94a3b8;font-weight:500;">Solo attività svolte in classe</p>
                </div>
                <button onclick="(function(){var o=document.querySelector('.modal-overlay.active');if(o)o.remove();else{var mc=document.getElementById('class-activities-export-modal-content');if(mc&&mc.parentNode)mc.parentNode.remove();}})()" style="width:36px;height:36px;border-radius:50%;background:#f1f5f9;border:none;color:#64748b;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px;">
                    <span class="material-symbols-outlined" style="font-size:18px;line-height:1;">close</span>
                </button>
            </div>

            <!-- Period tabs + controls -->
            <div style="padding:0 22px 16px;display:flex;flex-direction:column;gap:12px;">
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;">
                    ${mkTab('week','Settimana')}
                    ${mkTab('month','Mese')}
                    ${mkTab('school_year','Anno scol.')}
                </div>
                <div>${periodControls}</div>
                <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#f8fafc;border-radius:14px;border:1.5px solid rgba(226,232,240,0.9);">
                    <span style="font-size:12px;color:#64748b;font-weight:500;">${escapeHtml(selection.periodLabel)}</span>
                    <span style="font-size:13px;font-weight:800;color:#2563eb;">${selection.items.length} attività trovate</span>
                </div>
            </div>

            <!-- PDF button -->
            <div style="padding:0 22px 8px;">
                <button onclick="downloadClassActivitiesPdf()" style="width:100%;height:52px;border-radius:15px;border:none;background:#2563eb;color:white;font-size:15px;font-weight:700;cursor:pointer;font-family:Hanken Grotesk,sans-serif;box-shadow:0 6px 18px -4px rgba(37,99,235,0.30);display:flex;align-items:center;justify-content:center;gap:8px;" ontouchstart="this.style.transform='scale(0.97)'" ontouchend="this.style.transform='scale(1)'">
                    <span class="material-symbols-outlined" style="font-size:20px;font-variation-settings:'FILL' 1;">picture_as_pdf</span>
                    Genera PDF
                </button>
                <p style="text-align:center;font-size:11px;color:#94a3b8;margin:8px 0 0;line-height:1.4;">Si aprirà l'anteprima di stampa: scegli "Salva come PDF".</p>
            </div>
        </div>
    `;
}

window.openClassActivitiesExportModal = function () {
    const modalContainer = getModalContainer();
    if (!modalContainer) return;
    if (!state.classActivitiesExport) {
        state.classActivitiesExport = {
            period: 'month',
            month: getLocalDateString().slice(0, 7),
            week: getIsoWeekInputValue(new Date()),
            schoolYear: getCurrentSchoolYearLabel()
        };
    }
    modalContainer.innerHTML = `
        <div class="modal-overlay active" onclick="closeModal(event)" style="position:fixed;inset:0;z-index:99990;background:rgba(15,23,42,0.35);display:flex;align-items:flex-end;justify-content:center;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);">
            <div id="class-activities-export-modal-content" onclick="event.stopPropagation()" style="width:100%;max-width:480px;background:#ffffff;border-radius:32px 32px 0 0;padding:0 0 calc(28px + env(safe-area-inset-bottom,0px)) 0;box-shadow:0 -4px 24px rgba(0,0,0,0.10);overflow:hidden;max-height:90vh;overflow-y:auto;font-family:Hanken Grotesk,sans-serif;"></div>
        </div>
    `;
    renderClassActivitiesExportModalContent();
};

window.setClassActivitiesExportPeriod = function (period) {
    state.classActivitiesExport = state.classActivitiesExport || {};
    state.classActivitiesExport.period = period;
    renderClassActivitiesExportModalContent();
};

window.togglePlannerMobileDropdown = function (event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById('planner-mobile-menu');
    const toggle = document.getElementById('planner-menu-toggle');
    if (!menu || !toggle) return;

    const isActive = menu.classList.contains('active');

    // Close all other dropdowns first if any (optional but good practice)

    if (isActive) {
        closePlannerMobileDropdown();
    } else {
        menu.classList.add('active');
        toggle.classList.add('active');
        toggle.setAttribute('aria-expanded', 'true');
        repositionPlannerMobileDropdown();
        plannerMobileDropdownRepositionListener = repositionPlannerMobileDropdown;
        window.addEventListener('resize', plannerMobileDropdownRepositionListener, { passive: true });
        window.addEventListener('scroll', plannerMobileDropdownRepositionListener, PLANNER_MOBILE_DROPDOWN_SCROLL_LISTENER_OPTIONS);

        // Add one-time listener to close when clicking outside
        const closeOnOutsideClick = (e) => {
            if (!menu.contains(e.target) && !toggle.contains(e.target)) {
                closePlannerMobileDropdown();
                document.removeEventListener('click', closeOnOutsideClick);
            }
        };
        setTimeout(() => document.addEventListener('click', closeOnOutsideClick), 0);
    }
};

window.closePlannerMobileDropdown = function () {
    const menu = document.getElementById('planner-mobile-menu');
    const toggle = document.getElementById('planner-menu-toggle');
    if (menu) menu.classList.remove('active');
    if (toggle) {
        toggle.classList.remove('active');
        toggle.setAttribute('aria-expanded', 'false');
    }
    if (plannerMobileDropdownRepositionListener) {
        window.removeEventListener('resize', plannerMobileDropdownRepositionListener);
        window.removeEventListener('scroll', plannerMobileDropdownRepositionListener, PLANNER_MOBILE_DROPDOWN_SCROLL_LISTENER_OPTIONS);
        plannerMobileDropdownRepositionListener = null;
    }
};

function repositionPlannerMobileDropdown() {
    const menu = document.getElementById('planner-mobile-menu');
    const toggle = document.getElementById('planner-menu-toggle');
    if (!menu || !toggle || !menu.classList.contains('active')) return;

    const toggleRect = toggle.getBoundingClientRect();
    const viewportWidth = getViewportWidth();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const menuWidth = menu.offsetWidth || PLANNER_MOBILE_DROPDOWN_DEFAULT_WIDTH;
    const menuHeight = menu.offsetHeight || PLANNER_MOBILE_DROPDOWN_DEFAULT_HEIGHT;
    const margin = PLANNER_MOBILE_DROPDOWN_MARGIN;

    let left = toggleRect.right - menuWidth;
    const minLeft = margin;
    const maxLeft = Math.max(minLeft, viewportWidth - menuWidth - margin);
    left = Math.min(Math.max(left, minLeft), maxLeft);

    let top = toggleRect.bottom + PLANNER_MOBILE_DROPDOWN_OFFSET;
    const spaceBelow = viewportHeight - top - margin;
    if (spaceBelow < menuHeight && toggleRect.top > (menuHeight + PLANNER_MOBILE_DROPDOWN_FLIP_CLEARANCE)) {
        top = Math.max(margin, toggleRect.top - menuHeight - PLANNER_MOBILE_DROPDOWN_OFFSET);
        menu.style.transformOrigin = 'bottom right';
    } else {
        menu.style.transformOrigin = 'top right';
    }

    menu.style.position = 'fixed';
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
    menu.style.right = 'auto';
}

window.handlePlannerMobileMenuAction = function (action) {
    closePlannerMobileDropdown();
    if (action === 'plan') {
        showPlanWeekModal();
        return;
    }
    if (action === 'pdf') {
        openClassActivitiesExportModal();
        return;
    }
    if (action === 'clear') {
        clearPlannedCalendarTasks();
    }
};

window.updateClassActivitiesExportPeriodValue = function (period, value) {
    state.classActivitiesExport = state.classActivitiesExport || {};
    if (period === 'month') state.classActivitiesExport.month = value;
    if (period === 'week') state.classActivitiesExport.week = value;
    if (period === 'school_year') state.classActivitiesExport.schoolYear = value;
    renderClassActivitiesExportModalContent();
};

window.shiftClassActivitiesExportWeek = function (deltaWeeks) {
    state.classActivitiesExport = state.classActivitiesExport || {};
    const current = state.classActivitiesExport.week || getIsoWeekInputValue(new Date());
    state.classActivitiesExport.week = shiftIsoWeekValue(current, deltaWeeks);
    renderClassActivitiesExportModalContent();
};

window.downloadClassActivitiesPdf = function () {
    const selection = getClassActivitiesExportSelection();
    if (!selection.items.length) {
        showToast('Nessuna attività svolta trovata per questo filtro.', 'warning');
        return;
    }
    const renderedItems = selection.items.map((a, idx) => {
        const dateText = (a.date || a.datGiorno || '').trim() || getLocalDateString(a._parsedDate);
        const subjectText = (a.subject || a.materia || 'Materia').trim();
        const contentText = (a.content || a.text || a.argomento || '').trim() || 'Contenuto non disponibile';
        return `
            <div class="entry">
                <div class="entry-head">
                    <span class="entry-index">#${idx + 1}</span>
                    <span class="entry-date">${escapeHtml(dateText)}</span>
                    <span class="entry-subject">${escapeHtml(subjectText)}</span>
                </div>
                <p>${escapeHtml(contentText)}</p>
            </div>
        `;
    }).join('');

    const printableHtml = `
        <!doctype html>
        <html lang="it">
        <head>
            <meta charset="utf-8">
            <title>Attivita_svolte_${selection.period}_${new Date().toISOString().slice(0, 10)}</title>
            <style>
                @page { size: A4; margin: 18mm 14mm; }
                body { font-family: Inter, -apple-system, BlinkMacSystemFont, Arial, sans-serif; color:#111; line-height:1.45; }
                .doc-head { border-bottom: 1px solid #E6E6E6; padding-bottom: 12px; margin-bottom: 18px; }
                .doc-head h1 { font-size: 20px; margin:0 0 4px 0; letter-spacing:-0.02em; }
                .doc-head .meta { font-size: 12px; color:#555; }
                .note { font-size: 12px; color:#444; background:#F7F7F7; border:1px solid #ECECEC; border-radius:10px; padding:10px 12px; margin-bottom:16px; }
                .entry { border:1px solid #EAEAEA; border-radius:10px; padding:10px 12px; margin-bottom:10px; page-break-inside: avoid; }
                .entry-head { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:6px; }
                .entry-index { font-weight:700; font-size:11px; color:#3B82F6; }
                .entry-date, .entry-subject { font-size:11px; color:#666; font-weight:600; }
                .entry p { margin:0; font-size:13px; color:#111; white-space:pre-wrap; }
            </style>
        </head>
        <body>
            <div class="doc-head">
                <h1>Attività svolte in classe</h1>
                <div class="meta">${escapeHtml(selection.periodLabel)} · ${selection.items.length} attività · Generato il ${new Date().toLocaleString('it-IT')}</div>
            </div>
            <div class="note">
                Documento esportato da G-Diary per condivisione su strumenti esterni. Include esclusivamente attività svolte in classe.
            </div>
            ${renderedItems}
            <script>
                window.addEventListener('load', function () {
                    // Piccolo delay per garantire che layout e font siano renderizzati prima del print dialog.
                    setTimeout(function () { window.print(); }, ${PRINT_DIALOG_DELAY_MS});
                });
            </script>
        </body>
        </html>
    `;

    const popup = window.open('', '_blank');
    if (!popup) {
        showToast('Popup bloccato: abilita i popup per generare il PDF.', 'warning');
        return;
    }
    popup.document.open();
    popup.document.write(printableHtml);
    popup.document.close();
};

window.showPlanWeekModal = function () {
    const modalContainer = getModalContainer();
    if (!modalContainer) return;
    state.planWeekInitialPlannedCount = getPlannedTasksTotalCount();

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
        btn.style.background = isNowPlanned ? '#141414' : '#FFFFFF';
        btn.style.color = isNowPlanned ? 'white' : '#4F4A43';
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
    const currentSum = safeMedia * safeCount;
    const done = safeMedia >= safeGoal;
    const gap = Math.max(0, safeGoal - safeMedia);

    if (done) return { done: true, gap: 0, scenarios: [] };

    const grades = (typeof GOAL_GRADE_OPTIONS_DESC !== 'undefined') ? GOAL_GRADE_OPTIONS_DESC : [10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6];
    const scenarios = [];

    for (const g of grades) {
        if (g <= safeGoal) continue;
        const denom = g - safeGoal;
        if (denom <= 1e-9) continue;

        const nNeeded = Math.ceil((safeGoal * safeCount - currentSum) / denom);

        if (nNeeded >= 1 && nNeeded <= 5) {
            scenarios.push({
                n: nNeeded,
                grade: g,
                label: nNeeded === 1 ? `Prossimo voto: ${g}` : `Prossimi ${nNeeded} voti: ${g}`
            });
        }
    }

    if (safeGoal < MAX_GRADE_VALUE) {
        // Include anche voti sotto-obiettivo (>= sufficienza) per mostrare percorsi realistici:
        // 1) ipotizziamo un prossimo voto g inferiore al goal;
        // 2) stimiamo quanti 10 servono dopo quel voto per rientrare nel target;
        // 3) limitiamo a scenari brevi (massimo 5 voti totali) per mantenere suggerimenti utili.
        for (const g of grades) {
            if (g < PASSING_GRADE_THRESHOLD || g >= safeGoal) continue;
            const sumAfterOne = currentSum + g;
            const countAfterOne = safeCount + 1;
            const denom = MAX_GRADE_VALUE - safeGoal;
            if (denom <= 1e-9) continue;
            const extraTopGrades = Math.ceil((safeGoal * countAfterOne - sumAfterOne) / denom);
            const totalVotes = 1 + extraTopGrades;
            if (extraTopGrades >= 1 && totalVotes <= 5) {
                scenarios.push({
                    n: totalVotes,
                    grade: g,
                    combo: true,
                    extraTopGrades,
                    label: getProjectionComboDetailLabel(g, extraTopGrades, MAX_GRADE_VALUE)
                });
            }
        }
    }

    const uniqueScenarios = [];
    const seenKeys = new Set();
    const sortedScenarios = scenarios.sort((a, b) => a.n - b.n || b.grade - a.grade);
    for (const s of sortedScenarios) {
        const normalizedGrade = Number.isFinite(s.grade) ? s.grade.toFixed(2) : '0.00';
        const normalizedExtra = Number.isFinite(s.extraTopGrades) ? s.extraTopGrades : 0;
        const key = s.combo ? `combo-${normalizedGrade}-${normalizedExtra}` : `single-${normalizedGrade}`;
        if (!seenKeys.has(key)) {
            uniqueScenarios.push(s);
            seenKeys.add(key);
        }
        if (uniqueScenarios.length >= 4) break;
    }

    if (uniqueScenarios.length === 0) {
        const exact = (safeGoal * (safeCount + 1)) - currentSum;
        if (exact > 0 && exact <= 10) {
            uniqueScenarios.push({
                n: 1,
                grade: exact,
                exact: true,
                label: `Prossimo voto esatto: ${exact.toFixed(2)}`
            });
        }
    }

    return {
        done,
        gap,
        scenarios: uniqueScenarios
    };
}
function renderVoti() {
    const votiData = (state.voti && state.voti.length > 0) ? state.voti :
        ((state.grades && state.grades.length > 0) ? state.grades : []);

    if (votiData.length === 0) {
        return `
        <div class="liquid-glass rounded-[40px] p-12 text-center flex flex-col items-center gap-6">
            <div class="w-20 h-20 rounded-[28px] bg-primary/10 flex items-center justify-center text-primary">
                <span class="material-symbols-outlined text-4xl">school</span>
            </div>
            <div>
                <p class="body-lg text-on-surface-variant/60 font-medium mb-6">Nessun voto registrato.</p>
                <button onclick="performArgoSync()" class="btn btn-primary">Sincronizza DidUP</button>
            </div>
        </div> `;
    }

    return `
        <div class="flex flex-col gap-4">
            ${votiData.map(v => {
                const rawVal = (v.valore || v.value || '').toString();
                const giu = isGiustifica(rawVal);
                const displayVal = giu ? 'GIU' : rawVal;
                const mat = v.materia || v.subject || 'Materia';
                const val = getNumericGradeValue(v);
                const isSuff = val >= 6;
                const encodedMat = encodeURIComponent(mat || '').replace(/'/g, '%27');

                return `
                <div class="liquid-glass rounded-[28px] p-6 liquid-shadow cursor-pointer transition-all hover:scale-[1.02] flex items-center gap-6" onclick="handleGradeSubjectClickFromEncoded('${encodedMat}')">
                    <div class="w-14 h-14 rounded-2xl ${giu ? 'bg-surface-dim text-on-surface/40' : (isSuff ? 'bg-green/10 text-green' : 'bg-error/10 text-error')} flex items-center justify-center text-2xl font-bold border border-white/40">
                        ${displayVal}
                    </div>
                    <div class="flex-1 min-width-0">
                        <h3 class="font-bold text-on-surface truncate">${mat}</h3>
                        <p class="text-on-surface-variant/40 text-[12px] font-bold uppercase tracking-wider">${v.data || v.date} • ${v.tipo || v.type}</p>
                    </div>
                    <span class="material-symbols-outlined text-on-surface-variant/20">chevron_right</span>
                </div>`;
            }).join('')}
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

    // Build options: 5.0 to 10.0 in steps of 0.5
    const options = [];
    for (let v = 5.0; v <= 10.0; v = Math.round((v + 0.5) * 10) / 10) options.push(v);

    // Overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,0.35);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);display:flex;align-items:flex-end;justify-content:center;';

    // Sheet
    const sheet = document.createElement('div');
    sheet.style.cssText = 'width:100%;max-width:480px;background:#ffffff;border-radius:32px 32px 0 0;padding:0 0 calc(28px + env(safe-area-inset-bottom,0px)) 0;box-shadow:0 -4px 24px rgba(0,0,0,0.10);font-family:Hanken Grotesk,sans-serif;transform:translateY(100%);transition:transform 0.28s cubic-bezier(0.2,0.8,0.2,1);';
    sheet.innerHTML = `
        <div style="display:flex;justify-content:center;padding:14px 0 6px;">
            <div style="width:40px;height:4px;border-radius:999px;background:#d1d5db;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 22px 16px;">
            <h2 style="margin:0;font-size:20px;font-weight:800;color:#0f172a;letter-spacing:-0.01em;">Obiettivo</h2>
            <button id="goal-close-btn" style="width:36px;height:36px;border-radius:50%;background:#f1f5f9;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;">
                <span class="material-symbols-outlined" style="font-size:18px;color:#64748b;">close</span>
            </button>
        </div>
        <div style="padding:0 22px 20px;">
            <p style="font-size:13px;color:#64748b;font-weight:500;margin:0 0 16px;">Seleziona la media che vuoi raggiungere in questa materia.</p>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
                ${options.map(v => {
                    const isActive = Math.abs(v - currentGoal) < 0.01;
                    return `<button data-goal-val="${v}" style="padding:14px 8px;border-radius:16px;font-size:16px;font-weight:800;font-family:Hanken Grotesk,sans-serif;cursor:pointer;border:${isActive?'2px solid #2563eb':'1.5px solid rgba(226,232,240,0.9)'};background:${isActive?'#2563eb':'white'};color:${isActive?'white':'#1e293b'};transition:all 0.12s ease;" ontouchstart="this.style.transform='scale(0.95)'" ontouchend="this.style.transform='scale(1)'">${v.toFixed(1)}</button>`;
                }).join('')}
            </div>
        </div>
    `;

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => { sheet.style.transform = 'translateY(0)'; });

    function closeSheet() {
        sheet.style.transform = 'translateY(100%)';
        setTimeout(() => overlay.remove(), 300);
    }

    overlay.addEventListener('click', e => { if (e.target === overlay) closeSheet(); });
    sheet.querySelector('#goal-close-btn').addEventListener('click', closeSheet);

    sheet.querySelectorAll('[data-goal-val]').forEach(btn => {
        btn.addEventListener('click', () => {
            const val = parseFloat(btn.dataset.goalVal);
            if (!state.goals) state.goals = {};
            state.goals[type] = val;
            localStorage.setItem(lsKey('goals'), JSON.stringify(state.goals));
            closeSheet();
            // Re-render immediately without full page refresh
            state._forceRender = true;
            if (typeof scheduleRender === 'function') scheduleRender(0);
        });
    });
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
                    showToast('🎉 Sessione completata! Pausa di 5 min.', 'success', 'var(--green)');
                } else {
                    pomodoroState.mode = 'focus';
                    pomodoroState.timeLeft = 25 * 60;
                    showToast('💪 Pausa finita! Torna a studiare.', 'success', '#7c3aed');
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
    // Voice input removed - AI chat functionality has been disabled
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
// openArgoLogin — definita su window così è raggiungibile da onclick inline
window.openArgoLogin = function openArgoLogin() {
    var modalContainer = getModalContainer();
    if (!modalContainer) {
        console.error('[openArgoLogin] modal container non trovato');
        return;
    }

    modalContainer.innerHTML = `
        <div onclick="(typeof closeModal==='function'?closeModal(event):document.getElementById('modal-container').innerHTML='')"
             style="position:fixed;inset:0;z-index:99990;background:rgba(15,23,42,0.35);
                    backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
                    display:flex;align-items:flex-end;justify-content:center;padding:0;">
            <div onclick="event.stopPropagation()"
                 style="width:100%;max-width:420px;background:rgba(255,255,255,0.82);
                        backdrop-filter:blur(40px);-webkit-backdrop-filter:blur(40px);
                        border:1px solid rgba(255,255,255,0.6);
                        border-radius:32px 32px 0 0;
                        padding:20px 24px calc(28px + env(safe-area-inset-bottom,0px));
                        box-shadow:0 -8px 40px -8px rgba(0,0,0,0.14);">

                <!-- Handle -->
                <div style="display:flex;justify-content:center;margin-bottom:16px;">
                    <div style="width:36px;height:4px;border-radius:999px;background:rgba(0,0,0,0.12);"></div>
                </div>

                <!-- Logo + titolo -->
                <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;">
                    <div style="width:48px;height:48px;border-radius:14px;overflow:hidden;flex-shrink:0;
                                box-shadow:0 4px 12px rgba(0,0,0,0.12);">
                        <img src="gandhi-diary-icon-192.png" alt="Gandhi Diary"
                             onerror="this.src='gandhi-diary-icon-512.png'"
                             style="width:100%;height:100%;object-fit:cover;">
                    </div>
                    <div>
                        <div style="font-size:18px;font-weight:800;color:#0f172a;letter-spacing:-0.01em;">Accedi con DidUP</div>
                        <div style="font-size:12px;color:#94a3b8;font-weight:600;">Inserisci le credenziali del registro</div>
                    </div>
                </div>

                <!-- Status server -->
                <div id="server-status"
                     style="margin-bottom:16px;font-size:12px;color:#f59e0b;
                            display:flex;align-items:center;justify-content:center;gap:6px;
                            background:rgba(245,158,11,0.08);border-radius:10px;padding:8px;">
                    <span style="width:7px;height:7px;background:#f59e0b;border-radius:50%;flex-shrink:0;"></span>
                    Verifica stato server in corso...
                </div>

                <!-- Campi input -->
                <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px;">
                    <input id="argo-school" placeholder="Codice Scuola (es. SS19014)" autocomplete="organization"
                           value="${localStorage.getItem('argo_school') || ''}"
                           style="height:48px;border-radius:14px;border:1.5px solid rgba(226,232,240,0.8);
                                  padding:0 16px;font-size:15px;font-weight:500;
                                  background:rgba(255,255,255,0.9);color:#0f172a;
                                  font-family:Hanken Grotesk,sans-serif;outline:none;width:100%;box-sizing:border-box;">
                    <input id="argo-user" placeholder="Nome Utente" autocomplete="username"
                           style="height:48px;border-radius:14px;border:1.5px solid rgba(226,232,240,0.8);
                                  padding:0 16px;font-size:15px;font-weight:500;
                                  background:rgba(255,255,255,0.9);color:#0f172a;
                                  font-family:Hanken Grotesk,sans-serif;outline:none;width:100%;box-sizing:border-box;">
                    <input id="argo-pass" type="password" placeholder="Password" autocomplete="current-password"
                           style="height:48px;border-radius:14px;border:1.5px solid rgba(226,232,240,0.8);
                                  padding:0 16px;font-size:15px;font-weight:500;
                                  background:rgba(255,255,255,0.9);color:#0f172a;
                                  font-family:Hanken Grotesk,sans-serif;outline:none;width:100%;box-sizing:border-box;">
                </div>

                <!-- Bottone accedi -->
                <button id="login-btn"
                        onclick="if(typeof performArgoSync==='function')performArgoSync();else console.error('performArgoSync non definita')"
                        style="width:100%;height:52px;border-radius:16px;border:none;cursor:pointer;
                               background:linear-gradient(135deg,#2563eb,#4f46e5);color:white;
                               font-size:16px;font-weight:800;font-family:Hanken Grotesk,sans-serif;
                               box-shadow:0 6px 20px -6px rgba(37,99,235,0.45);margin-bottom:10px;"
                        ontouchstart="this.style.opacity='0.85'" ontouchend="this.style.opacity='1'">
                    Accedi e Sincronizza
                </button>

                <!-- Annulla -->
                <button onclick="(typeof closeModal==='function'?closeModal():document.getElementById('modal-container').innerHTML='')"
                        style="width:100%;height:44px;border-radius:14px;border:none;cursor:pointer;
                               background:rgba(241,245,249,0.8);color:#64748b;
                               font-size:14px;font-weight:700;font-family:Hanken Grotesk,sans-serif;">
                    Annulla
                </button>
            </div>
        </div>`;

    // checkServerHealth chiamata con guardia — non blocca il modal se non definita
    try {
        if (typeof checkServerHealth === 'function') checkServerHealth();
    } catch(err) {
        console.warn('[openArgoLogin] checkServerHealth non disponibile:', err.message);
        var ss = document.getElementById('server-status');
        if (ss) { ss.style.color = '#22c55e'; ss.innerHTML = '<span style="width:7px;height:7px;background:#22c55e;border-radius:50%;flex-shrink:0;"></span> Server pronto'; }
    }
};
function showProfileSelectionModal(profiles, credentials) {
    const container = getModalContainer();
    if (!container) return;

    // ── Costruisce le card profilo ────────────────────────────────────────────
    const profileCards = profiles.map(function(p) {
        const initial = escapeHtml((p.name || 'S')[0].toUpperCase());
        const name    = escapeHtml(p.name  || ('Studente ' + (p.index + 1)));
        const cls     = escapeHtml(p.class || p.school || '');
        // Colore avatar basato sull'iniziale
        const hue     = ((p.name || 'A').charCodeAt(0) * 37) % 360;
        const avatarBg = 'hsl(' + hue + ',60%,48%)';

        return '<button class="btn-profile" data-index="' + p.index + '" ' +
            'style="width:100%;display:flex;align-items:center;gap:14px;padding:14px 16px;' +
            'background:rgba(255,255,255,0.7);border:1px solid rgba(255,255,255,0.7);' +
            'border-radius:20px;cursor:pointer;text-align:left;' +
            '-webkit-tap-highlight-color:transparent;' +
            'box-shadow:0 2px 12px -4px rgba(0,0,0,0.06);' +
            'transition:transform 0.12s ease;" ' +
            'ontouchstart="this.style.transform=\'scale(0.97)\'" ' +
            'ontouchend="this.style.transform=\'scale(1)\'">' +
                '<div style="width:48px;height:48px;border-radius:16px;flex-shrink:0;' +
                'background:' + avatarBg + ';' +
                'display:flex;align-items:center;justify-content:center;' +
                'font-size:20px;font-weight:800;color:white;' +
                'box-shadow:0 4px 12px -4px ' + avatarBg + ';">' +
                    initial +
                '</div>' +
                '<div style="flex:1;min-width:0;">' +
                    '<div class="profile-name" style="font-size:15px;font-weight:800;color:#0f172a;' +
                    'font-family:Hanken Grotesk,sans-serif;letter-spacing:-0.01em;' +
                    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + name + '</div>' +
                    (cls ? '<div class="profile-class" style="font-size:12px;font-weight:600;color:#94a3b8;' +
                    'font-family:Hanken Grotesk,sans-serif;margin-top:2px;">' + cls + '</div>' : '') +
                '</div>' +
                '<span class="material-symbols-outlined" style="font-size:18px;color:#cbd5e1;flex-shrink:0;">chevron_right</span>' +
            '</button>';
    }).join('');

    // ── Overlay + bottom-sheet liquid glass ───────────────────────────────────
    container.innerHTML =
        '<div id="psel-overlay" ' +
        'style="position:fixed;inset:0;z-index:9999;' +
        'background:rgba(15,23,42,0.28);' +
        'backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);' +
        'display:flex;align-items:flex-end;justify-content:center;' +
        'opacity:0;transition:opacity 0.18s ease;">' +

            '<div id="psel-card" ' +
            'style="width:100%;max-width:480px;' +
            'background:rgba(248,250,252,0.88);' +
            'backdrop-filter:blur(40px);-webkit-backdrop-filter:blur(40px);' +
            'border:1px solid rgba(255,255,255,0.65);' +
            'border-radius:32px 32px 0 0;' +
            'padding:0 20px calc(24px + env(safe-area-inset-bottom,0px)) 20px;' +
            'box-shadow:0 -8px 40px -8px rgba(0,0,0,0.14),inset 0 1px 0 rgba(255,255,255,0.9);' +
            'transform:translateY(32px);' +
            'transition:transform 0.24s cubic-bezier(0.2,0.8,0.2,1);">' +

                // drag handle
                '<div style="display:flex;justify-content:center;padding:14px 0 10px;">' +
                    '<div style="width:36px;height:4px;border-radius:999px;background:rgba(0,0,0,0.10);"></div>' +
                '</div>' +

                // header
                '<div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;">' +
                    '<div style="width:46px;height:46px;border-radius:14px;overflow:hidden;flex-shrink:0;' +
                    'box-shadow:0 4px 12px rgba(0,0,0,0.10);">' +
                        '<img src="gandhi-diary-icon-192.png" alt="Gandhi Diary" ' +
                        'onerror="this.src=\'gandhi-diary-icon-512.png\'" ' +
                        'style="width:100%;height:100%;object-fit:cover;">' +
                    '</div>' +
                    '<div>' +
                        '<div style="font-size:18px;font-weight:800;color:#0f172a;' +
                        'letter-spacing:-0.02em;font-family:Hanken Grotesk,sans-serif;">' +
                            'Seleziona Profilo' +
                        '</div>' +
                        '<div style="font-size:12px;font-weight:600;color:#94a3b8;' +
                        'font-family:Hanken Grotesk,sans-serif;margin-top:2px;">' +
                            'Scegli quale studente visualizzare' +
                        '</div>' +
                    '</div>' +
                '</div>' +

                // lista profili
                '<div class="profiles-list" style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px;">' +
                    profileCards +
                '</div>' +

                // annulla
                '<button onclick="var mc=document.getElementById(\'modal-container\');if(typeof closeModal===\'function\')closeModal();else if(mc)mc.innerHTML=\'\';" ' +
                'style="width:100%;height:48px;border-radius:16px;border:none;cursor:pointer;' +
                'background:rgba(241,245,249,0.9);color:#64748b;' +
                'font-size:14px;font-weight:700;font-family:Hanken Grotesk,sans-serif;">' +
                    'Annulla' +
                '</button>' +

            '</div>' +
        '</div>';

    // Animazione entrata
    requestAnimationFrame(function() {
        var ov = document.getElementById('psel-overlay');
        var cd = document.getElementById('psel-card');
        if (ov) ov.style.opacity = '1';
        if (cd) cd.style.transform = 'translateY(0)';
    });

    // Chiudi cliccando backdrop
    var overlay = document.getElementById('psel-overlay');
    if (overlay) {
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) {
                overlay.style.opacity = '0';
                setTimeout(function() { container.innerHTML = ''; }, 180);
            }
        });
    }

    // ── Click su profilo ──────────────────────────────────────────────────────
    var list = container.querySelector('.profiles-list');
    if (!list) return;

    list.addEventListener('click', async function(ev) {
        var btn = ev.target.closest('.btn-profile');
        if (!btn) return;

        var selectedName = btn.querySelector('.profile-name') ?
            btn.querySelector('.profile-name').textContent : 'Studente';

        // Loading screen dentro la card
        var card = document.getElementById('psel-card');
        if (card) {
            card.innerHTML =
                '<div style="display:flex;flex-direction:column;align-items:center;' +
                'justify-content:center;padding:52px 24px;gap:20px;text-align:center;">' +
                    '<div style="width:52px;height:52px;border-radius:50%;' +
                    'background:conic-gradient(from 0deg,#2563eb 0%,#4f46e5 50%,rgba(191,219,254,0.3) 100%);' +
                    '-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 5px),#000 calc(100% - 5px));' +
                    'mask:radial-gradient(farthest-side,transparent calc(100% - 5px),#000 calc(100% - 5px));' +
                    'animation:spin 0.85s cubic-bezier(.4,0,.2,1) infinite;"></div>' +
                    '<div>' +
                        '<div style="font-size:16px;font-weight:800;color:#0f172a;' +
                        'font-family:Hanken Grotesk,sans-serif;letter-spacing:-0.01em;margin-bottom:4px;">' +
                            'Caricamento profilo' +
                        '</div>' +
                        '<div style="font-size:13px;color:#64748b;font-family:Hanken Grotesk,sans-serif;">' +
                            escapeHtml(selectedName) +
                        '</div>' +
                    '</div>' +
                    '<div style="font-size:11px;font-weight:700;color:#cbd5e1;' +
                    'text-transform:uppercase;letter-spacing:0.08em;' +
                    'font-family:Hanken Grotesk,sans-serif;">' +
                        'Sincronizzazione in corso…' +
                    '</div>' +
                '</div>';
        }

        await selectProfile(parseInt(btn.dataset.index, 10), credentials);
    }, { once: true });

    // Risolvi nomi veri in background
    if (typeof resolveProfileNamesAsync === 'function') {
        resolveProfileNamesAsync(profiles, credentials, container);
    }
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
    const preselectedDate = state.selectedDate || getLocalDateString();
    const allTasks  = (state.tasks||[]).filter(t=>t.subject!=='QUEST');
    const subjects  = [...new Set(allTasks.map(t=>t.subject||t.materia||'').filter(Boolean))].sort();
    const subjectOptions = subjects.length
        ? subjects.map(s=>`<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('')
        : '<option value="Generale">Generale</option>';
    const pendingTasks = allTasks.filter(t=>!t.done && (t.due_date||'')>=getLocalDateString());
    const pendingSubjs = [...new Set(pendingTasks.map(t=>t.subject||t.materia||'Generale'))].sort();

    const INP = 'width:100%;padding:13px 16px;border-radius:14px;border:1.5px solid rgba(226,232,240,0.9);background:rgba(255,255,255,0.9);color:#1e293b;font-size:15px;font-weight:500;outline:none;box-sizing:border-box;font-family:\'Hanken Grotesk\',sans-serif;';
    const LBL = 'font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:7px;display:block;';

    // Full-screen-style bottom sheet
    showModal(`
<div style="padding:24px 20px 32px;background:linear-gradient(160deg,#f8fafc 0%,#eff6ff 100%);border-radius:32px;font-family:Hanken Grotesk,sans-serif;width:100%;box-sizing:border-box;">

    <!-- Header — X uses document.getElementById approach to avoid scope issues -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <div>
            <h2 style="margin:0;font-size:20px;font-weight:800;color:#0f172a;letter-spacing:-0.01em;">Aggiungi</h2>
            <p style="margin:2px 0 0;font-size:12px;color:#94a3b8;font-weight:500;">Compito, verifica o impegno</p>
        </div>
        <button id="qs-close-btn" style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.9);border:1.5px solid rgba(226,232,240,0.7);color:#64748b;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <span class="material-symbols-outlined" style="font-size:18px;line-height:1;">close</span>
        </button>
    </div>

    <!-- 3 tabs -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px;margin-bottom:20px;">
        <button id="qs-tab-new"      style="padding:11px 4px;border-radius:13px;border:2px solid #2563eb;background:#2563eb;color:white;font-size:12px;font-weight:700;cursor:pointer;font-family:Hanken Grotesk,sans-serif;" id="qs-tab-new">📚 Nuovo</button>
        <button id="qs-tab-existing" style="padding:11px 4px;border-radius:13px;border:1.5px solid rgba(226,232,240,0.9);background:white;color:#64748b;font-size:12px;font-weight:700;cursor:pointer;font-family:Hanken Grotesk,sans-serif;">📋 Assegnati</button>
        <button id="qs-tab-verifica" style="padding:11px 4px;border-radius:13px;border:1.5px solid rgba(226,232,240,0.9);background:white;color:#64748b;font-size:12px;font-weight:700;cursor:pointer;font-family:Hanken Grotesk,sans-serif;">✏️ Verifica</button>
    </div>

    <!-- PANEL: Nuovo compito -->
    <div id="qs-panel-new" style="display:flex;flex-direction:column;gap:14px;">
        <div><label style="${LBL}">Materia</label><select id="qs-subject" style="${INP}-webkit-appearance:none;">${subjectOptions}</select></div>
        <div><label style="${LBL}">Descrizione</label><textarea id="qs-text" placeholder="Es. Esercizi pag. 47-49..." rows="3" style="${INP}resize:none;line-height:1.5;"></textarea></div>
        <div><label style="${LBL}">Data di consegna</label><input id="qs-date" type="date" value="${preselectedDate}" style="${INP}" /></div>
        <button id="qs-submit-new" style="width:100%;height:52px;border-radius:15px;border:none;background:#2563eb;color:white;font-size:15px;font-weight:700;cursor:pointer;font-family:Hanken Grotesk,sans-serif;box-shadow:0 6px 18px -4px rgba(37,99,235,0.3);display:flex;align-items:center;justify-content:center;gap:7px;">
            <span class="material-symbols-outlined" style="font-size:20px;font-variation-settings:'FILL' 1;">check_circle</span>Aggiungi compito
        </button>
    </div>

    <!-- PANEL: Assegnati -->
    <div id="qs-panel-existing" style="display:none;flex-direction:column;gap:10px;">
        <p style="font-size:13px;color:#64748b;margin:0 0 6px;">Seleziona un compito già assegnato, poi scegli quando studiarlo.</p>
        <div style="max-height:38vh;overflow-y:auto;display:flex;flex-direction:column;gap:6px;padding-right:2px;">
        ${pendingSubjs.length>0 ? pendingSubjs.map(s=>`
            <p style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.1em;margin:6px 0 3px;">${escapeHtml(s)}</p>
            ${pendingTasks.filter(t=>(t.subject||t.materia||'Generale')===s).map(t=>`
            <div id="qs-ex-${escapeHtml(t.id)}" style="background:white;border-radius:14px;padding:12px 14px;border:1.5px solid rgba(226,232,240,0.9);cursor:pointer;display:flex;flex-direction:column;gap:2px;transition:border-color 0.15s;">
                <span style="font-size:13px;font-weight:600;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(t.text||'')}</span>
                <span style="font-size:11px;color:#94a3b8;">Scadenza: ${t.due_date||'—'}</span>
            </div>`).join('')}`).join('') : '<p style="text-align:center;color:#94a3b8;font-size:13px;padding:20px 0;">Nessun compito pendente</p>'}
        </div>
        <div id="qs-existing-date-row" style="display:none;flex-direction:column;gap:8px;padding-top:10px;border-top:1px solid rgba(226,232,240,0.6);">
            <label style="${LBL}">Quando lo studi?</label>
            <input id="qs-existing-date" type="date" value="${preselectedDate}" style="${INP}" />
            <button id="qs-submit-existing" style="width:100%;height:50px;border-radius:15px;border:none;background:#2563eb;color:white;font-size:15px;font-weight:700;cursor:pointer;font-family:Hanken Grotesk,sans-serif;box-shadow:0 6px 18px -4px rgba(37,99,235,0.3);">Aggiungi alla Agenda</button>
        </div>
    </div>

    <!-- PANEL: Verifica -->
    <div id="qs-panel-verifica" style="display:none;flex-direction:column;gap:14px;">
        <div><label style="${LBL}">Materia</label><select id="qs-v-subject" style="${INP}-webkit-appearance:none;">${subjectOptions}</select></div>
        <div><label style="${LBL}">Argomenti</label><textarea id="qs-v-text" placeholder="Es. Capitoli 3-5, derivate..." rows="2" style="${INP}resize:none;line-height:1.5;"></textarea></div>
        <div><label style="${LBL}">Tipo</label>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px;">
                <button id="qs-vt-scritta" style="padding:10px 4px;border-radius:12px;border:2px solid #2563eb;background:#2563eb;color:white;font-size:12px;font-weight:700;cursor:pointer;font-family:Hanken Grotesk,sans-serif;">Scritta</button>
                <button id="qs-vt-orale"   style="padding:10px 4px;border-radius:12px;border:1.5px solid rgba(226,232,240,0.9);background:white;color:#64748b;font-size:12px;font-weight:700;cursor:pointer;font-family:Hanken Grotesk,sans-serif;">Orale</button>
                <button id="qs-vt-pratica" style="padding:10px 4px;border-radius:12px;border:1.5px solid rgba(226,232,240,0.9);background:white;color:#64748b;font-size:12px;font-weight:700;cursor:pointer;font-family:Hanken Grotesk,sans-serif;">Pratica</button>
            </div>
        </div>
        <div><label style="${LBL}">Data</label><input id="qs-v-date" type="date" value="${preselectedDate}" style="${INP}" /></div>
        <button id="qs-submit-verifica" style="width:100%;height:52px;border-radius:15px;border:none;background:#dc2626;color:white;font-size:15px;font-weight:700;cursor:pointer;font-family:Hanken Grotesk,sans-serif;box-shadow:0 6px 18px -4px rgba(220,38,38,0.28);display:flex;align-items:center;justify-content:center;gap:7px;">
            <span class="material-symbols-outlined" style="font-size:19px;">warning</span>Aggiungi verifica
        </button>
    </div>
</div>
    `);

    // ── Wire up all interactivity after DOM is ready ────────────────────────────
    requestAnimationFrame(() => {
        // Styles for tabs
        const ACTIVE_BLUE = 'padding:11px 4px;border-radius:13px;border:2px solid #2563eb;background:#2563eb;color:white;font-size:12px;font-weight:700;cursor:pointer;font-family:Hanken Grotesk,sans-serif;';
        const ACTIVE_RED  = 'padding:11px 4px;border-radius:13px;border:2px solid #dc2626;background:#dc2626;color:white;font-size:12px;font-weight:700;cursor:pointer;font-family:Hanken Grotesk,sans-serif;';
        const INACTIVE    = 'padding:11px 4px;border-radius:13px;border:1.5px solid rgba(226,232,240,0.9);background:white;color:#64748b;font-size:12px;font-weight:700;cursor:pointer;font-family:Hanken Grotesk,sans-serif;';
        const CHIP_ACT = 'padding:10px 4px;border-radius:12px;border:2px solid #2563eb;background:#2563eb;color:white;font-size:12px;font-weight:700;cursor:pointer;font-family:Hanken Grotesk,sans-serif;';
        const CHIP_IN  = 'padding:10px 4px;border-radius:12px;border:1.5px solid rgba(226,232,240,0.9);background:white;color:#64748b;font-size:12px;font-weight:700;cursor:pointer;font-family:Hanken Grotesk,sans-serif;';

        let currentTab = 'new';
        let pickedTaskId = null;
        let vTipo = 'scritta';

        function switchTab(tab) {
            currentTab = tab;
            ['new','existing','verifica'].forEach(t => {
                const btn = document.getElementById('qs-tab-'+t);
                const panel = document.getElementById('qs-panel-'+t);
                if (!btn || !panel) return;
                btn.style.cssText = t===tab ? (t==='verifica' ? ACTIVE_RED : ACTIVE_BLUE) : INACTIVE;
                panel.style.display = t===tab ? 'flex' : 'none';
            });
        }

        // Close button
        const closeBtn = document.getElementById('qs-close-btn');
        if (closeBtn) closeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            const overlay = document.querySelector('.modal-overlay.active');
            if (overlay) overlay.remove();
            else if (typeof closeModal === 'function') closeModal();
        });

        // Tab buttons
        ['new','existing','verifica'].forEach(t => {
            const btn = document.getElementById('qs-tab-'+t);
            if (btn) btn.onclick = () => switchTab(t);
        });

        // Existing task cards
        document.querySelectorAll('[id^="qs-ex-"]').forEach(el => {
            el.onclick = () => {
                pickedTaskId = el.id.replace('qs-ex-','');
                document.querySelectorAll('[id^="qs-ex-"]').forEach(e => {
                    e.style.border = '1.5px solid rgba(226,232,240,0.9)';
                    e.style.background = 'white';
                });
                el.style.border = '2px solid #2563eb';
                el.style.background = 'rgba(239,246,255,0.6)';
                const row = document.getElementById('qs-existing-date-row');
                if (row) row.style.display = 'flex';
            };
        });

        // Verifica tipo chips
        ['scritta','orale','pratica'].forEach(t => {
            const btn = document.getElementById('qs-vt-'+t);
            if (!btn) return;
            btn.onclick = () => {
                vTipo = t;
                ['scritta','orale','pratica'].forEach(tt => {
                    const b = document.getElementById('qs-vt-'+tt);
                    if (b) b.style.cssText = tt===t ? CHIP_ACT : CHIP_IN;
                });
            };
        });

        function doAdd(subject, text, date, isExam) {
            if (!text.trim()) return false;
            if (!date) return false;
            const r = applyImmediateCalendarAction({type:'add',missing:[],subject,text,date,time:'',isExam});
            if (r.ok) {
                if(typeof closeModal==='function') closeModal();
                state.selectedDate = date;
                window._plannerDayContentCache = null;
                state._forceRender = true;
                showToast((isExam?'Verifica':'Compito')+' aggiunto!','success');
                scheduleRender(0);
                return true;
            }
            showToast('Errore nell\'aggiunta','error');
            return false;
        }

        // Submit new
        const sbNew = document.getElementById('qs-submit-new');
        if (sbNew) sbNew.onclick = () => {
            const sub = document.getElementById('qs-subject')?.value?.trim()||'Generale';
            const txt = document.getElementById('qs-text')?.value?.trim()||'';
            const dt  = document.getElementById('qs-date')?.value||getLocalDateString();
            if (!txt) { const el=document.getElementById('qs-text'); if(el){el.style.border='2px solid #ef4444';el.focus();} return; }
            doAdd(sub,txt,dt,false);
        };

        // Submit existing
        const sbEx = document.getElementById('qs-submit-existing');
        if (sbEx) sbEx.onclick = () => {
            if (!pickedTaskId) { showToast('Seleziona un compito','warning'); return; }
            const orig=(state.tasks||[]).find(t=>t.id===pickedTaskId);
            if (!orig) { showToast('Compito non trovato','error'); return; }
            const dt=document.getElementById('qs-existing-date')?.value||getLocalDateString();
            doAdd(orig.subject||'Generale',orig.text||'',dt,false);
        };

        // Submit verifica
        const sbVer = document.getElementById('qs-submit-verifica');
        if (sbVer) sbVer.onclick = () => {
            const sub = document.getElementById('qs-v-subject')?.value?.trim()||'Generale';
            const txt = document.getElementById('qs-v-text')?.value?.trim()||'';
            const dt  = document.getElementById('qs-v-date')?.value||getLocalDateString();
            if (!txt) { const el=document.getElementById('qs-v-text'); if(el){el.style.border='2px solid #ef4444';el.focus();} return; }
            doAdd(sub,`${vTipo.charAt(0).toUpperCase()+vTipo.slice(1)} · ${txt}`,dt,true);
        };
    });
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
function closePlannerDropdown() {
    const menu = document.getElementById('planner-cloud-menu');
    const btn = document.getElementById('planner-cloud-btn');
    if (menu) menu.classList.remove('active');
    if (btn) {
        btn.classList.remove('active');
        btn.setAttribute('aria-expanded', 'false');
    }
    if (window._plannerMenuCloseHandler) {
        document.removeEventListener('pointerdown', window._plannerMenuCloseHandler);
        window._plannerMenuCloseHandler = null;
    }
}
window.closePlannerDropdown = closePlannerDropdown;

function togglePlannerMenu(event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById('planner-cloud-menu');
    const btn = document.getElementById('planner-cloud-btn') || event?.currentTarget || event?.target?.closest('button');
    if (!menu || !btn) return;

    const isVisible = menu.classList.contains('active');
    if (!isVisible) {
        menu.classList.add('active');
        btn.classList.add('active');
        btn.setAttribute('aria-expanded', 'true');
        const closeHandler = (e) => {
            if (!menu.contains(e.target) && !btn.contains(e.target)) {
                closePlannerDropdown();
            }
        };
        window._plannerMenuCloseHandler = closeHandler;
        // Minimal delay to prevent the same tap used to open the menu from immediately closing it.
        setTimeout(() => {
            document.addEventListener('pointerdown', closeHandler);
        }, 10);
    } else {
        closePlannerDropdown();
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
window.allowedViews = ['home', 'planner', 'voti', 'academic_profile', 'profile', 'circolari'];

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
    if (window._gRenderRAF || state.booting || state._loggedOut) return;
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

// ── Render deduplication: skip if view+login state unchanged ──
let _lastRenderedView = null;
let _lastRenderedLoggedIn = null;
let _lastRenderedTaskCount = -1;
let _lastRenderedVotiCount = -1;

window._renderCore = function () {
    if (state._loggedOut) return; // Post-logout guard
    const root = document.getElementById('app');
    const nav = document.getElementById('nav-container');
    if (!root || !nav) return;

    if (!state.isLoggedIn) {
        // Deduplicate: skip if already showing login
        if (_lastRenderedLoggedIn === false) return;
        _lastRenderedLoggedIn = false;
        _lastRenderedView = 'login';
        document.body.classList.add('logged-out');
        root.innerHTML = renderLogin();
        nav.innerHTML = '';
        return;
    }

    // Deduplicate: skip full re-render if same view + same data counts + same AI state
    const taskCount = (state.tasks || []).length;
    const votiCount = (state.voti || []).length;
    const _plannerStateKey = state.view === 'planner'
        ? [state.selectedDate||'',state.plannerWeekOffset||0,state.plannerMonthView||false,
           state.plannerMonthViewYear||0,state.plannerMonthViewMonth||0,
           state.agendaSearchQuery||'',state.agendaSearchSubject||''].join('|')
        : '';
    if (_lastRenderedLoggedIn === true &&
        _lastRenderedView === state.view &&
        _lastRenderedTaskCount === taskCount &&
        _lastRenderedVotiCount === votiCount &&
        (window.__lastPlannerKey||'') === _plannerStateKey &&
        !state._forceRender) {
        return;
    }
    window.__lastPlannerKey = _plannerStateKey;
    _lastRenderedLoggedIn = true;
    _lastRenderedView = state.view;
    _lastRenderedTaskCount = taskCount;
    _lastRenderedVotiCount = votiCount;
    state._forceRender = false;

    document.body.classList.remove('logged-out');

    nav.innerHTML = renderNav();

    document.body.style.overflow = '';
    document.body.style.height = '';
    root.style.overflow = 'visible';
    root.style.height = '';

    let html = '';
    switch (state.view) {
        case 'home': html = renderHome(); break;
        case 'planner': html = renderPlanner(); break;
        case 'voti': html = renderGradesView(); break;
        case 'academic_profile': html = renderAcademicProfile(); break;
        case 'profile': html = renderProfile(); break;
        case 'circolari': html = (typeof renderCircolariView === 'function') ? renderCircolariView() : renderHome(); break;
        default: html = renderHome(); break;
    }

    root.innerHTML = html;
    if (state._scrollTopAfterRender) {
        window.scrollTo({ top: 0, behavior: 'auto' });
        state._scrollTopAfterRender = false;
    }
    if (typeof updateOfflineBadge === 'function') updateOfflineBadge();

    requestAnimationFrame(() => {
        if (state.view === 'home') {
            const mediaVal = parseFloat(calcolaMedia(state.voti)) || 0;

            if (typeof renderMediaGauge === 'function') renderMediaGauge(mediaVal);
        }
        if (state.view === 'planner') {
            if (typeof renderCustomCalendar === 'function') renderCustomCalendar();
            // Auto-scroll week carousel to the active slide (instant, no animation)
            const _pc = document.getElementById('planner-week-carousel');
            if (_pc && window._plannerInitialSlide !== undefined) {
                _pc.scrollTo({ left: window._plannerInitialSlide * _pc.clientWidth, behavior: 'instant' });
            }
            // Restore search bar focus + cursor if user was typing
            if (window._psfocused) {
                const _si = document.getElementById('planner-search-input');
                if (_si) {
                    _si.focus();
                    const _pos = window._pscursor !== undefined ? window._pscursor : _si.value.length;
                    try { _si.setSelectionRange(_pos, _pos); } catch(e) {}
                }
            }
        }
        if (state.view === 'voti' && typeof initGradesCharts === 'function') {
            initGradesCharts();
        }
        if (state.view === 'voti' && typeof mountSubjectTrendChartFromDom === 'function') {
            mountSubjectTrendChartFromDom();
        }

        if (typeof gsapAnimateView === 'function') {
            gsapAnimateView();
        }
        if (window.removeLoader) window.removeLoader();
        
        // Initialize Lucide icons for new content
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    });
};

// ── UI HELPERS & PROFILE ──
window.removeLoader = function () {
    const loader = document.getElementById('app-loader');
    if (loader) {
        loader.style.transition = 'opacity 0.5s ease';
        loader.style.opacity = '0';
        setTimeout(() => loader.remove(), 500);
    }
};

window.logout = async function () {
    if (confirm('Sei sicuro di voler disconnettere? I tuoi planner e feed saranno mantenuti.')) {
        // ── CRITICAL: Set logout flag FIRST to block ALL async renders ──
        state._loggedOut = true;
        state.isLoggedIn = false;
        state.view = 'login'; // Immediate visual shift target

        // ── Kill all running GSAP animations (prevents late onComplete/onUpdate calls) ──
        if (typeof gsap !== 'undefined') {
            gsap.killTweensOf("*");
        }

        const currentUserId = getUserId();
        const currentLsPrefix = getActiveProfileKey();

        if (currentUserId && currentUserId !== 'guest') {
            localStorage.setItem(`${currentLsPrefix}:planned_tasks`, JSON.stringify(state.plannedTasks || {}));
            localStorage.setItem(`${currentLsPrefix}:planner_updated_at`, new Date().toISOString());
        }

        sessionManager.clear();
        // Clear Argo password from RAM and sessionStorage
        window._argoPasswordRuntime = null;
        try { sessionStorage.removeItem('_argo_pwd_session'); } catch(_) {}
        if (supabaseClient && supabaseClient.auth) supabaseClient.auth.signOut().catch(e => console.warn('[Logout] Supabase signOut failed:', e));

        state.booting = false;
        state.syncing = false;
        state.didup.connected = false;
        state.didup.stale = false;
        state.didup.lastSuccessTs = 0;
        state.user = { name: '', class: '' };
        state.tasks = [];
        state.voti = [];
        state.promemoria = [];
        state.isOffline = false;
        state.lastSync = null;
        state.plannedTasks = {};

        window._bootRenderedOnce = false;
        if (window._threadsPoller) clearInterval(window._threadsPoller);

        // Cancel any pending render timers
        clearTimeout(window._gRenderTimer);
        window._gRenderTimer = null;
        if (window._gRenderRAF) {
            cancelAnimationFrame(window._gRenderRAF);
            window._gRenderRAF = null;
        }

        // Write login directly and imperatively — bypasses all async pipelines
        state.view = 'login';
        if (window.location.hash !== '#login') {
            window.history.replaceState(null, '', '#login');
        }

        const _logoutAppRoot = document.getElementById('app');
        const _logoutNav = document.getElementById('nav-container');

        const forceLoginRender = () => {
            if (_logoutAppRoot) {
                document.body.classList.add('logged-out');
                document.body.classList.remove('is-ai-mode');
                document.body.style.overflow = '';
                document.body.style.height = '';
                _logoutAppRoot.style.overflow = 'visible';
                _logoutAppRoot.style.height = '';
                _logoutAppRoot.innerHTML = (typeof renderLogin === 'function') ? renderLogin() : '';
            }
            if (_logoutNav) _logoutNav.innerHTML = '';
        };

        forceLoginRender();

        // ── Mutation Guard: Prevent any other component from overwriting login for 1s ──
        if (_logoutAppRoot) {
            const observer = new MutationObserver((mutations) => {
                if (state._loggedOut && !_logoutAppRoot.querySelector('.login-container')) {
                    console.warn("[Guard] Detected unathorized DOM write post-logout, reverting to login...");
                    forceLoginRender();
                }
            });
            observer.observe(_logoutAppRoot, { childList: true, subtree: true });
            setTimeout(() => {
                observer.disconnect();
                state._loggedOut = false; // Release lock for future interactions
            }, 1000);
        }

        // Reset render dedup state
        _lastRenderedLoggedIn = false;
        _lastRenderedView = 'login';

        if (currentUserId && currentUserId !== 'guest') {
            const payload = {
                plannedTasks: state.plannedTasks || {},
                plannedDetails: {},
                updatedAt: new Date().toISOString()
            };
            fetch(`${API_BASE_URL}/api/planner/${encodeURIComponent(currentUserId)}`, {
                method: 'PUT',
                headers: getSessionHeaders(),
                body: JSON.stringify(payload),
                keepalive: true
            }).catch((e) => { console.warn("Logout save failed", e); });
        }
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
    window.scheduleRender(0);
};

window.handleManualOwaResyncClick = function (event) {
    if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
    if (!confirm('Eseguire un resync manuale completo dei dati OWA?')) return;
    if (typeof window.runManualOwaResync === 'function') window.runManualOwaResync();
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
    const calendarTasks = (Array.isArray(state.tasks) ? state.tasks : []).filter(t => {
        if (t.done || !t.due_date || t.subject === 'QUEST') return false;
        const d = parseArgoDate(t.due_date);
        return d >= now2w && d <= twoWeeksLater;
    });
    contentEl.innerHTML = `
        <div style="display: flex; align-items: center; margin-bottom: 24px; padding: 0 4px;">
            <h2 style="margin:0; flex:1; min-width:0; font-family:'JetBrains Mono', monospace; font-size: 18px; font-weight: 800; color: #141414; letter-spacing: 0.01em; text-transform: uppercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Pianifica Settimana</h2>
            <button onclick="closeModal()" style="flex-shrink:0; margin-left:auto; background:#F0EDE8; border:1px solid #DAD4CC; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#141414;">
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
                <div style="background: #FFFFFF; padding: 20px; border-radius: 16px; border: 1px solid #DAD4CC; box-shadow: 0 3px 10px rgba(0,0,0,0.03);">
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
                                style="flex: 1; text-align:center; padding: 12px 4px; border-radius: 12px; cursor: pointer; transition: all 0.2s;
                                background: ${isPlanned ? '#141414' : '#FFFFFF'};
                                color: ${isPlanned ? 'white' : '#4F4A43'};
                                border: ${isToday ? '2px solid #007AFF' : '1px solid #E0DDD8'};">
                                <div style="font-family:'JetBrains Mono', monospace; font-size: 9px; font-weight: 700; margin-bottom: 4px; opacity: ${isPlanned ? '0.6' : '1'};">${day.label.toUpperCase()}</div>
                                <div style="font-weight: 800; font-size: 15px; letter-spacing: -0.02em;">${day.dayNum}</div>
                            </div>`;
        }).join('')}
                    </div>
                </div>`;
    }).join('')}
        </div>
        <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #F0EDE8; display:flex; align-items:center; gap:10px;">
            <button id="plan-week-done-btn" onclick="finalizePlanWeekModal()" style="width: 100%; height: 50px; background: #141414; color: white; border: none; border-radius: 16px; font-size: 15px; font-weight: 800; cursor: pointer; transition: all 0.25s cubic-bezier(0.2,0.8,0.2,1);">Fatto</button>
            <span id="plan-week-added-badge" class="badge badge-success" style="display:none; white-space:nowrap; font-family:'JetBrains Mono',monospace; font-size:10px; font-weight:700;">0 compiti aggiunti</span>
        </div>`;
};
window.finalizePlanWeekModal = function () {
    const doneBtn = document.getElementById('plan-week-done-btn');
    const addedBadge = document.getElementById('plan-week-added-badge');
    const initialPlannedCount = state.planWeekInitialPlannedCount ?? 0;
    const added = Math.max(0, getPlannedTasksTotalCount() - initialPlannedCount);

    if (doneBtn) {
        doneBtn.style.background = '#2DB86A';
        doneBtn.style.color = '#FFFFFF';
        doneBtn.textContent = 'Fatto ✓';
        doneBtn.style.transform = 'scale(0.98)';
        setTimeout(() => { if (doneBtn) doneBtn.style.transform = 'scale(1)'; }, 180);
    }
    if (addedBadge && added > 0) {
        addedBadge.style.display = 'inline-flex';
        addedBadge.textContent = `${added} compiti aggiunti`;
    }

    // Aggiornamento immediato di calendario e widget oggi/domani prima della chiusura modale
    if (typeof notifyPlannerChanged === 'function') notifyPlannerChanged();

    setTimeout(() => {
        closeModal();
        if (added > 0 && typeof showToast === 'function') {
            showToast(`${added} compiti aggiunti`);
        }
    }, 300); // 300ms: permette all'animazione "Fatto ✓" di essere visibile prima della chiusura modale
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
            btn.style.background = '#FFFFFF';
            btn.style.borderColor = (dateStr === todayStr) ? '#007AFF' : '#E0DDD8';
            btn.style.color = '#4F4A43';
        }
    });
};

window.addCustomQuestFromInput = function () {
    showToast('Task manuali disattivate: restano solo compiti assegnati.');
};

window.adjustNextGradeSimulator = function (delta) {
    const current = getNextGradeSimulatorValue();
    setNextGradeSimulatorValue(current + (Number(delta) || 0));
    if (state.view === 'voti') {
        if (!updateNextGradeSimulatorWidget()) scheduleRender(0);
    }
};

window.selectDay = function (day) {
    state.selectedDay = day;
    window.scheduleRender(0);
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
        if (!subject) return showToast('Inserisci il nome della materia', 'error', '#ff453a');
    }
    const type = document.getElementById('examType').value;
    const date = document.getElementById('examDate').value;
    const topic = (document.getElementById('examTopic').value || '').trim();
    if (!date) return showToast('Seleziona una data', 'error', '#ff453a');
    state.exams.push({ subject, type, date, topic });
    const examTask = { id: 'exam_' + Date.now(), text: `${type}: ${topic || subject}`, subject, due_date: date, done: false, isExam: true };
    state.tasks.push(examTask);
    if (typeof saveTasks === 'function') saveTasks();
    closeModal();
    window.scheduleRender();
    showToast(`✅ ${type} di ${subject} aggiunta al ${date}!`, 'success', 'var(--green)');
};

window.removeExam = function (index) {
    state.exams.splice(index, 1);
    if (typeof saveTasks === 'function') saveTasks();
    window.scheduleRender();
};

window.submitBacklogForm = function () {
    const subject = document.getElementById('backlogSubject').value;
    const topic = (document.getElementById('backlogTopic').value || '').trim();
    if (!topic) return showToast('Inserisci l\'argomento da recuperare', 'error', '#ff453a');
    state.backlog.push({ subject, topic });
    if (typeof saveTasks === 'function') saveTasks();
    closeModal();
    window.scheduleRender();
    showToast(`📚 Arretrato di ${subject} aggiunto!`, 'success', 'var(--green)');
};

window.removeBacklog = function (index) {
    state.backlog.splice(index, 1);
    if (typeof saveTasks === 'function') saveTasks();
    window.scheduleRender();
};

// ── AI ASSISTANT HELPERS ──
window.sendAIChatQuick = function (text) {
    // AI chat functionality has been disabled
};
window.sendAIChatQuickAt = function (index) {
    // AI chat functionality has been disabled
};
window.handleAIChatInputKeypress = function (event) {
    // AI chat functionality has been disabled
};
window.startNewAIChat = function () {
    // AI chat functionality has been disabled
};
window.clearAIChat = function (options = {}) {
    // AI chat functionality has been disabled
};
window.deleteAIChatMessage = function (index) {
    // AI chat functionality has been disabled
};
window.stopVoiceInput = function () {
    // AI chat functionality has been disabled
};

function extractImmediateCalendarAction(text) {
    const raw = String(text || '');
    if (!raw) return null;
    const normalized = raw.toLowerCase();
    const wantsAdd = /\b(aggiungi|inserisci|crea|carica|programma)\b/.test(normalized) && /\b(calendario|agenda)\b/.test(normalized);
    const wantsDelete = /\b(elimina|rimuovi|cancella)\b/.test(normalized) && /\b(calendario|agenda)\b/.test(normalized);
    if (!wantsAdd && !wantsDelete) return null;

    const dateIsoMatch = raw.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    const dateSlashMatch = raw.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/);
    let date = '';
    if (dateIsoMatch) {
        date = dateIsoMatch[1];
    } else if (dateSlashMatch) {
        const day = String(Number(dateSlashMatch[1])).padStart(2, '0');
        const month = String(Number(dateSlashMatch[2])).padStart(2, '0');
        const now = new Date();
        let yearNum = Number(dateSlashMatch[3] || now.getFullYear());
        const candidate = new Date(yearNum, Number(month) - 1, Number(day), 12, 0, 0);
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
        if (!dateSlashMatch[3] && !Number.isNaN(candidate.getTime()) && candidate < today) yearNum += 1;
        date = `${String(yearNum).padStart(4, '0')}-${month}-${day}`;
    }

    const timeMatch = raw.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
    const time = timeMatch ? `${String(timeMatch[1]).padStart(2, '0')}:${timeMatch[2]}` : '';

    let subject = '';
    const subjectMatch = raw.match(/(?:materia|subject)\s*[:\-]\s*([^\n,;]+)/i);
    if (subjectMatch) subject = subjectMatch[1].trim();
    if (!subject) {
        const known = ['italiano', 'matematica', 'storia', 'inglese', 'informatica', 'fisica', 'chimica', 'scienze', 'latino', 'filosofia', 'arte', 'motoria', 'religione'];
        const found = known.find(s => normalized.includes(s));
        if (found) subject = found.charAt(0).toUpperCase() + found.slice(1);
    }

    let textTask = '';
    const quoted = raw.match(/["“”']([^"“”']{3,140})["“”']/);
    if (quoted) textTask = quoted[1].trim();
    if (!textTask) {
        const after = raw.split(/(?:aggiungi|inserisci|crea|carica|programma)/i)[1] || '';
        if (after) {
            textTask = after.replace(/\b(calendario|agenda|alle|ore|materia)\b/gi, ' ').replace(/\s+/g, ' ').trim();
        }
    }

    if (wantsDelete) {
        const deleteMissing = [];
        if (!date) deleteMissing.push('data (es. 2026-04-10)');
        if (!textTask) deleteMissing.push('titolo attività');
        return {
            type: 'delete',
            date,
            text: textTask,
            missing: deleteMissing
        };
    }

    const missing = [];
    if (!time) missing.push('orario (es. 16:30)');
    if (!date) missing.push('data (es. 2026-04-10)');
    if (!textTask) missing.push('attività');

    return {
        type: 'add',
        date,
        time,
        subject: subject || 'Studio',
        text: textTask,
        missing
    };
}

function applyImmediateCalendarAction(action) {
    if (!action || action.type !== 'add' || !Array.isArray(action.missing) || action.missing.length) return { ok: false };
    if (!state.plannedTasks || typeof state.plannedTasks !== 'object') state.plannedTasks = {};
    if (!state.plannedDetails || typeof state.plannedDetails !== 'object') state.plannedDetails = {};
    if (!Array.isArray(state.tasks)) state.tasks = [];

    const id = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const task = {
        id,
        subject: action.subject || 'Studio',
        text: action.text,
        due_date: action.date,
        done: false
    };
    state.tasks.push(task);
    if (!Array.isArray(state.plannedTasks[action.date])) state.plannedTasks[action.date] = [];
    if (!state.plannedTasks[action.date].includes(id)) state.plannedTasks[action.date].push(id);
    state.plannedDetails[id] = { time: action.time };
    if (typeof saveTasks === 'function') saveTasks();
    if (typeof debouncedSavePlannerRemote === 'function') debouncedSavePlannerRemote(200);
    return { ok: true, id };
}

function normalizeAiResponseMarkdown(text) {
    const input = String(text || '').replace(/\r/g, '');
    // Defensive normalization: even if prompt asks for non-table markdown,
    // models may still output tables; convert them to readable bullet sections.
    if (!/(^|\n)\s*\|/.test(input)) return input;
    const lines = input.split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        const isTableRow = /\|/.test(line) && line.trim().startsWith('|');
        if (!isTableRow) {
            out.push(line);
            i += 1;
            continue;
        }
        const table = [];
        while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim().startsWith('|')) {
            table.push(lines[i]);
            i += 1;
        }
        if (table.length < 2) {
            out.push(...table);
            continue;
        }
        const rows = table
            .map(r => r.split('|').map(c => c.trim()).filter(Boolean))
            .filter(cols => cols.length > 0);
        const header = rows[0] || [];
        // Drop markdown table separator rows (---, :---:, etc.).
        const body = rows.slice(1).filter(cols => !cols.every(c => /^:?-{2,}:?$/.test(c)));
        if (!header.length || !body.length) {
            out.push(...table);
            continue;
        }
        body.forEach((cols, rowIdx) => {
            out.push(`- **Riga ${rowIdx + 1}**`);
            cols.forEach((cell, colIdx) => {
                const label = header[colIdx] || `Colonna ${colIdx + 1}`;
                out.push(`  - ${label}: ${cell || '-'}`);
            });
        });
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

function deleteImmediateCalendarAction(action) {
    if (!action || action.type !== 'delete') return { ok: false };
    const sourceTasks = Array.isArray(state.tasks) ? state.tasks : [];
    const normalizedNeedle = String(action.text || '').trim().toLowerCase();
    const filtered = sourceTasks.filter((t) => {
        if (!t || !t.id) return false;
        if (!isUserGeneratedTaskId(t.id)) return false;
        if (action.date && t.due_date !== action.date) return false;
        if (normalizedNeedle) {
            const hay = `${t.subject || ''} ${t.text || ''}`.toLowerCase();
            if (!hay.includes(normalizedNeedle)) return false;
        }
        return true;
    });
    if (!filtered.length) return { ok: false, reason: 'not_found' };
    const idsToDelete = new Set(filtered.map(t => t.id));
    state.tasks = sourceTasks.filter(t => !idsToDelete.has(t.id));
    Object.keys(state.plannedTasks || {}).forEach((dateKey) => {
        const ids = state.plannedTasks[dateKey];
        if (Array.isArray(ids)) state.plannedTasks[dateKey] = ids.filter(id => !idsToDelete.has(id));
    });
    Object.keys(state.plannedDetails || {}).forEach((id) => {
        if (idsToDelete.has(id)) delete state.plannedDetails[id];
    });
    if (typeof saveTasks === 'function') saveTasks();
    if (typeof debouncedSavePlannerRemote === 'function') debouncedSavePlannerRemote(200);
    return { ok: true, count: filtered.length };
}

// AI chat functionality has been disabled
window.sendAIChat = async function () {
    // AI chat functionality has been disabled
    showToast('Chat AI disattivata', 'info');
};

window.clearSyncDiagnostics = function () {
    state.syncDiagnostics = [];
    localStorage.setItem(lsKey('sync_diagnostics'), '[]');
    window.scheduleRender();
    showToast('Log sync puliti');
};

window.applyAIPlanFromChat = function (msgIndex) {
    // AI chat functionality has been disabled
};

window.saveGeminiKey = function () {
    // AI chat functionality has been disabled
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

    // ── Gradient palettes for featured cards ─────────────────────────────────
    const palettes = [
        { bg: 'linear-gradient(135deg,#ffffff 0%,#e0efff 50%,#b3d4ff 100%)', shadow: '0 10px 40px -10px rgba(37,99,235,0.15)', icon: 'campaign',       iconColor: '#1d4ed8', iconBg: '#dbeafe', badgeText: 'In evidenza' },
        { bg: 'linear-gradient(135deg,#ffffff 0%,#f3e8ff 70%,#e9d5ff 100%)', shadow: '0 8px 30px -12px rgba(147,51,234,0.15)', icon: 'calendar_month', iconColor: '#6d28d9', iconBg: '#f3e8ff', badgeText: 'Evento'       },
        { bg: 'linear-gradient(135deg,#ffffff 0%,#f0fdf4 70%,#bbf7d0 100%)', shadow: '0 8px 30px -12px rgba(22,163,74,0.12)',  icon: 'school',         iconColor: '#15803d', iconBg: '#dcfce7', badgeText: 'Comunicato'    },
    ];

    function fmtDate(raw) {
        if (!raw) return '';
        const d = parseArgoDate ? parseArgoDate(raw) : new Date(raw);
        if (!d || isNaN(d)) return raw;
        const diff = Math.round((new Date() - d) / 86400000);
        if (diff === 0) return 'Oggi';
        if (diff === 1) return 'Ieri';
        return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
    }

    // First card: full-width featured
    const featured   = list[0] || null;
    // Next 2: small grid
    const gridCards  = list.slice(1, 3);
    // Rest: list rows
    const recentList = list.slice(3);

    const featuredHtml = featured ? `
        <div style="border-radius:36px;padding:24px;margin-bottom:16px;box-shadow:0 10px 40px -10px rgba(37,99,235,0.15);border:1px solid rgba(255,255,255,0.6);background:linear-gradient(135deg,#ffffff 0%,#e0efff 50%,#b3d4ff 100%);cursor:pointer;position:relative;overflow:hidden;" onclick="mostraCircolare('${escapeJsSingleQuote(featured.id)}')" ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform='scale(1)'">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
                <div style="background:#dbeafe;border:1px solid rgba(191,219,254,0.6);color:#1d4ed8;font-size:11px;font-weight:700;padding:4px 12px;border-radius:999px;font-family:Hanken Grotesk,sans-serif;">In evidenza</div>
                <span class="material-symbols-outlined" style="font-size:20px;color:#1d4ed8;font-variation-settings:'FILL' 1;">campaign</span>
            </div>
            <h2 style="font-size:24px;font-weight:800;color:#0f172a;line-height:1.2;margin:0 0 28px;letter-spacing:-0.01em;font-family:Hanken Grotesk,sans-serif;">${escapeHtml(featured.titolo)}</h2>
            <div style="display:flex;justify-content:space-between;align-items:flex-end;">
                <span style="font-size:13px;font-weight:600;color:#475569;font-family:Hanken Grotesk,sans-serif;">${fmtDate(featured.data)}</span>
                <div style="width:52px;height:52px;border-radius:50%;background:#0058bc;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 20px -4px rgba(0,88,188,0.4);" ontouchstart="this.style.transform='scale(0.93)'" ontouchend="this.style.transform='scale(1)'">
                    <span class="material-symbols-outlined" style="font-size:22px;color:white;">arrow_forward</span>
                </div>
            </div>
        </div>` : '';

    const gridHtml = gridCards.length ? `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:32px;">
            ${gridCards.map((c, i) => {
                const p = palettes[i + 1] || palettes[0];
                return `<div style="border-radius:32px;padding:22px;background:${p.bg};box-shadow:${p.shadow};border:1px solid rgba(255,255,255,0.6);display:flex;flex-direction:column;cursor:pointer;min-height:160px;" onclick="mostraCircolare('${escapeJsSingleQuote(c.id)}')" ontouchstart="this.style.transform='scale(0.97)'" ontouchend="this.style.transform='scale(1)'">
                    <span class="material-symbols-outlined" style="font-size:24px;color:${p.iconColor};margin-bottom:10px;font-variation-settings:'FILL' 1;">${p.icon}</span>
                    <h3 style="font-size:16px;font-weight:700;color:#0f172a;line-height:1.25;margin:0 0 auto;font-family:Hanken Grotesk,sans-serif;">${escapeHtml(c.titolo)}</h3>
                    <span style="font-size:12px;font-weight:500;color:#64748b;margin-top:14px;font-family:Hanken Grotesk,sans-serif;">${fmtDate(c.data)}</span>
                </div>`;
            }).join('')}
        </div>` : '';

    const recentHtml = recentList.length ? `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <h2 style="font-size:20px;font-weight:800;color:#1b1b1d;letter-spacing:-0.01em;margin:0;font-family:Hanken Grotesk,sans-serif;">Circolari recenti</h2>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;">
            ${recentList.map(c => `
                <div style="background:rgba(255,255,255,0.8);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.9);box-shadow:0 4px 20px -8px rgba(0,0,0,0.05);border-radius:28px;padding:14px 16px;display:flex;align-items:center;gap:14px;cursor:pointer;transition:transform 0.12s ease;" onclick="mostraCircolare('${escapeJsSingleQuote(c.id)}')" ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform='scale(1)'">
                    <div style="width:48px;height:48px;border-radius:50%;background:#f1f5f9;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <span class="material-symbols-outlined" style="font-size:22px;color:#475569;font-variation-settings:'FILL' 1;">description</span>
                    </div>
                    <div style="flex:1;min-width:0;">
                        <p style="font-size:15px;font-weight:700;color:#0f172a;margin:0 0 3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:Hanken Grotesk,sans-serif;">${escapeHtml(c.titolo)}</p>
                        <p style="font-size:12px;font-weight:500;color:#94a3b8;margin:0;font-family:Hanken Grotesk,sans-serif;">${fmtDate(c.data)}</p>
                    </div>
                    <span class="material-symbols-outlined" style="font-size:18px;color:#cbd5e1;flex-shrink:0;">chevron_right</span>
                </div>`).join('')}
        </div>` : '';

    const emptyHtml = !list.length ? `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;">
            <span class="material-symbols-outlined" style="font-size:48px;color:#cbd5e1;margin-bottom:12px;">inbox</span>
            <p style="font-size:16px;font-weight:600;color:#94a3b8;margin:0;font-family:Hanken Grotesk,sans-serif;">Nessuna circolare disponibile</p>
        </div>` : '';

    return `
    <div class="view-fullbleed min-h-screen pb-32" style="background:#f8fafc;background-image:radial-gradient(circle at 10% 0%,rgba(224,231,255,0.3) 0%,transparent 40%),radial-gradient(circle at 90% 80%,rgba(240,230,255,0.2) 0%,transparent 40%);background-attachment:fixed;">
        <div style="padding:max(env(safe-area-inset-top,0px),32px) 24px 0;font-family:Hanken Grotesk,sans-serif;">

            <!-- Header -->
            <header style="margin-bottom:24px;">
                <h1 style="font-size:30px;font-weight:800;color:#1b1b1d;letter-spacing:-0.025em;margin:0 0 4px;line-height:1;">In Evidenza</h1>
            </header>

            ${featuredHtml}
            ${gridHtml}
            ${recentHtml}
            ${emptyHtml}

        </div>
    </div>`;
}

function getSubjectIcon(subject) {
    const s = normalizeSubjectName(subject);
    if (s.includes('matem')) return 'functions';
    if (s.includes('fisic')) return 'science';
    if (s.includes('storia')) return 'history_edu';
    if (s.includes('arte') || s.includes('disegno')) return 'palette';
    if (s.includes('lingua') || s.includes('inglese') || s.includes('italiano')) return 'menu_book';
    return 'school';
}
window._plannerGetDayContentHTML = function() {
    // Usa la cache se disponibile (invalidata da ogni render completo o cambio giorno)
    if (window._plannerDayContentCache) return window._plannerDayContentCache;
    const today = new Date();
    today.setHours(0,0,0,0);
    const todayISO = getLocalDateString(today);
    const selectedDate = state.selectedDate || todayISO;
    const MN = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
    const dayLabels = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];
    
    const allTasks = (state.tasks||[]).filter(t=>t.subject!=='QUEST');
    const dayTasks = allTasks.filter(t=>t.due_date===selectedDate);
    const upcomingCount = allTasks.filter(t=>{
        if(t.done) return false;
        const d = parseLocalDate(t.due_date);
        if(isNaN(d.getTime())) return false;
        return (d-today)/86400000>0 && (d-today)/86400000<=7;
    }).length;

    const TC = window._plannerTC;
    if(!TC) return '';

    // Aggiunto padding-bottom: 120px per evitare l'accavallamento con la Navbar
    let html = '<div style="padding:0 24px 120px 24px;display:flex;flex-direction:column;gap:10px;">';

    const d = new Date(selectedDate+'T00:00:00');
    const diff = Math.round((d-today)/86400000);
    const base = `${dayLabels[d.getDay()]} ${d.getDate()} ${MN[d.getMonth()]}`;
    let title = base;
    if(diff===0) title = `Oggi · ${base}`;
    else if(diff===1) title = `Domani · ${base}`;
    else if(diff===-1) title = `Ieri · ${base}`;

    html += `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
        <h2 style="font-size:15px;font-weight:700;color:#1e293b;margin:0;">${title}</h2>
        <span style="font-size:11px;font-weight:700;color:#94a3b8;">${dayTasks.length} ${dayTasks.length===1?'evento':'eventi'}</span>
    </div>`;

    if (upcomingCount>0 && selectedDate===todayISO) {
        html += `<div style="background:#f0f7ff;border:1.5px solid rgba(191,219,254,0.6);border-radius:20px;padding:14px 16px;box-shadow:0 4px 16px -8px rgba(37,99,235,0.12);">
            <div style="display:flex;align-items:center;gap:9px;margin-bottom:5px;">
                <div style="width:30px;height:30px;border-radius:50%;background:#1e40af;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><span class="material-symbols-outlined" style="font-size:15px;color:white;font-variation-settings:'FILL' 1;">lightbulb</span></div>
                <span style="font-size:13px;font-weight:700;color:#1e40af;">Smart Planner</span>
            </div>
            <p style="font-size:12px;color:#475569;line-height:1.5;margin:0 0 6px;">Hai <strong>${upcomingCount}</strong> compiti nei prossimi 7 giorni.</p>
            <button onclick="const si=document.getElementById('planner-search-input');if(si){si.focus();si.select();}" style="color:#1e40af;font-weight:700;font-size:11px;background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:3px;font-family:Hanken Grotesk,sans-serif;padding:0;">Cerca <span class="material-symbols-outlined" style="font-size:13px;">arrow_forward</span></button>
        </div>`;
    }

    if (dayTasks.length) {
        html += dayTasks.map(t=>TC(t,false)).join('');
    } else {
        html += `<div style="background:white;border-radius:22px;padding:44px 16px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:10px;border:1.5px solid rgba(241,245,249,0.9);box-shadow:0 3px 14px -6px rgba(0,0,0,0.05);">
            <span class="material-symbols-outlined" style="font-size:44px;color:#cbd5e1;">event_busy</span>
            <p style="font-size:14px;font-weight:600;color:#94a3b8;margin:0;">Nessuna attività per questo giorno</p>
        </div>`;
    }

    html += `</div>`;
    window._plannerDayContentCache = html; // salva cache
    return html;
};

function renderPlanner() {
    const today = new Date();
    today.setHours(0,0,0,0);
    const todayISO = getLocalDateString(today);

    const selectedDate = state.selectedDate || todayISO;
    const showSearchPanel = !!(state.plannerSearchOpen||(state.agendaSearchQuery||'').trim());
    const query = (state.agendaSearchQuery||'').toLowerCase().trim();
    const filterSubject = state.agendaSearchSubject||'all';

    const MN = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
    const selDate = new Date(selectedDate+'T00:00:00');
    const dayLabels = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];

    // Build 5 weeks: prev, current-2, current-1, current, next (centred on today)
    // We render 5 week slides; on mount we scroll to index 2 (today's week)
    const TOTAL_WEEKS = 5;      // slides total
    const CENTER_IDX  = 2;      // today's week is slide index 2

    // Build all 5 weeks centred on the SELECTED date (not always on today)
    // This allows navigating to any school-year date via the month picker.
    const weeks = [];
    for (let w = -CENTER_IDX; w <= TOTAL_WEEKS - CENTER_IDX - 1; w++) {
        const wStart = new Date(selDate);
        wStart.setDate(selDate.getDate() - selDate.getDay() + w * 7); // Sun-start
        const days = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(wStart);
            d.setDate(wStart.getDate() + i);
            const iso = getLocalDateString(d);
            days.push({
                label: dayLabels[d.getDay()],
                dayNum: d.getDate(),
                iso,
                isToday: iso === todayISO,
                hasTask: (state.tasks||[]).some(t=>t.due_date===iso&&t.subject!=='QUEST')
            });
        }
        weeks.push(days);
    }

    // Since carousel is centred on selDate, selected date is ALWAYS in CENTER_IDX slide
    const activeSlide = CENTER_IDX;

    const allTasks   = (state.tasks||[]).filter(t=>t.subject!=='QUEST');
    const subjects   = [...new Set(allTasks.map(t=>t.subject||t.materia||'').filter(Boolean))].sort();
    const dayTasks   = allTasks.filter(t=>t.due_date===selectedDate);
    const upcomingCount = allTasks.filter(t=>{
        if(t.done) return false;
        const d = parseLocalDate(t.due_date);
        if(isNaN(d.getTime())) return false;
        return (d-today)/86400000>0 && (d-today)/86400000<=7;
    }).length;

    // searchResults: attivo quando c'è query o filtro materia (nearest deadline first)
    const searchResults = (query || filterSubject !== 'all') ? allTasks.filter(t=>{
        if(filterSubject!=='all'&&(t.subject||t.materia||'')!==filterSubject) return false;
        if(!query) return true;
        return (t.subject||'').toLowerCase().includes(query)
            || (t.materia||'').toLowerCase().includes(query)
            || (t.text||'').toLowerCase().includes(query);
    }).sort((a,b)=>(b.due_date||'').localeCompare(a.due_date||'')) : [];

    // ── Month label derived from selected date ───────────────────
    const monthLabel = `${MN[selDate.getMonth()]} ${selDate.getFullYear()}`;

    // ── Task card renderer ───────────────────────────────────────
    function TC(t, showDate) {
        const isExam = t.isExam||t.type==='verifica'||/verifica|interrogazione|test|esame|simulazione/i.test(t.text);
        const subj = escapeHtml(t.subject||t.materia||'');
        const txt  = escapeHtml(t.text||'');
        const tid  = escapeJsSingleQuote(t.id);
        const icon = (typeof getSubjectIcon==='function') ? getSubjectIcon(t.subject||t.materia||'') : 'book';
        const canDel = typeof isUserGeneratedTaskId==='function' ? isUserGeneratedTaskId(t.id) : false;
        const dLabel = showDate&&t.due_date ? (()=>{
            const d=new Date(t.due_date+'T00:00:00');
            return `<span style="font-size:9px;font-weight:700;color:#94a3b8;display:block;margin-bottom:2px;text-transform:uppercase;">${d.getDate()} ${MN[d.getMonth()]}</span>`;
        })() : '';
        const delBtn = canDel ? `<button onclick="event.stopPropagation();deleteCalendarTask('${tid}');state._forceRender=true;scheduleRender(0);" style="width:30px;height:30px;border-radius:50%;background:#fff0ee;border:1px solid rgba(255,59,48,0.18);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;"><span class="material-symbols-outlined" style="font-size:14px;color:#ef4444;">delete</span></button>` : '';
        const rerender = "state._forceRender=true;scheduleRender(0);";

        if (isExam) return `
        <div onclick="toggleTask('${tid}');${rerender}" style="background:rgba(254,242,242,0.85);border:1.5px solid rgba(254,202,202,0.6);border-radius:22px;padding:16px 18px;position:relative;overflow:hidden;cursor:pointer;${t.done?'opacity:0.5;':''}box-shadow:0 4px 16px -6px rgba(239,68,68,0.18);">
            <div style="position:absolute;top:-24px;right:-24px;width:80px;height:80px;background:rgba(254,202,202,0.25);border-radius:50%;filter:blur(16px);pointer-events:none;"></div>
            ${dLabel}
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;position:relative;z-index:1;">
                <div style="flex:1;min-width:0;">
                    <h3 style="font-size:15px;font-weight:700;color:#1e293b;margin:0 0 3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${t.done?'text-decoration:line-through;':''}">${subj}</h3>
                    <p style="font-size:13px;color:#64748b;margin:0 0 12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${txt}</p>
                </div>
                <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">${delBtn}<span class="material-symbols-outlined" style="font-size:22px;color:#dc2626;">warning</span></div>
            </div>
            <div style="display:inline-flex;background:rgba(254,226,226,0.95);color:#b91c1c;font-size:9px;font-weight:700;padding:4px 10px;border-radius:999px;letter-spacing:0.05em;">VERIFICA${t.done?' · ✓':''}</div>
        </div>`;

        if (t.done) return `
        <div onclick="toggleTask('${tid}');${rerender}" style="background:white;border-radius:20px;padding:14px 16px;display:flex;align-items:center;gap:13px;border:1.5px solid rgba(241,245,249,0.9);opacity:0.5;cursor:pointer;">
            <div style="width:44px;height:44px;flex-shrink:0;background:#f0fdf4;border-radius:14px;display:flex;align-items:center;justify-content:center;color:#10b981;"><span class="material-symbols-outlined" style="font-size:20px;font-variation-settings:'FILL' 1;">task_alt</span></div>
            <div style="flex:1;min-width:0;">${dLabel}<h3 style="font-size:14px;font-weight:700;color:#64748b;text-decoration:line-through;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${subj}</h3><p style="font-size:12px;color:#94a3b8;text-decoration:line-through;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px;">${txt}</p></div>${delBtn}
        </div>`;

        return `
        <div onclick="toggleTask('${tid}');${rerender}" style="background:white;border-radius:20px;padding:14px 16px;display:flex;align-items:center;gap:13px;box-shadow:0 4px 18px -8px rgba(0,0,0,0.08);border:1.5px solid rgba(241,245,249,0.9);cursor:pointer;">
            <div style="width:44px;height:44px;flex-shrink:0;background:#eff6ff;border-radius:14px;display:flex;align-items:center;justify-content:center;color:#1e40af;"><span class="material-symbols-outlined" style="font-size:20px;">${icon}</span></div>
            <div style="flex:1;min-width:0;">${dLabel}<h3 style="font-size:14px;font-weight:700;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${subj}</h3><p style="font-size:12px;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px;">${txt}</p></div>${delBtn}
        </div>`;
    }

    // Salva TC e MN su window per refreshPlannerSearch() (aggiornamento chirurgico)
    window._plannerTC = TC;
    window._plannerMN = MN;
    window._plannerDayContentCache = null; // invalidata ad ogni render completo

    // ── Week slide HTML (one slide = one week of 7 day pills) ────
    function weekSlide(days, slideIdx) {
        return `<div class="planner-week-slide" style="flex:0 0 100%;width:100%;display:flex;gap:6px;padding:8px 20px 24px 20px;box-sizing:border-box;scroll-snap-align:start;transform:translateZ(0);-webkit-transform:translateZ(0);">
            ${days.map(d => {
                const isSel = d.iso === selectedDate;
                return `<div onclick="plannerSelectDay('${d.iso}')" style="
                    flex:1;height:88px;border-radius:20px;
                    display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;
                    cursor:pointer;
                    background:${isSel ? '#2563eb' : 'white'};
                    border:${isSel ? 'none' : '1.5px solid rgba(241,245,249,0.9)'};
                    box-shadow:${isSel ? 'inset 0 1px 1px rgba(255,255,255,0.2),0 0 0 2.5px rgba(37,99,235,0.18)' : 'none'};
                    transform:translateZ(0);
                    will-change:background,box-shadow;
                    -webkit-backface-visibility:hidden;
                    backface-visibility:hidden;
                    transition:background 0.13s ease,box-shadow 0.13s ease,border-color 0.13s ease;
                    -webkit-tap-highlight-color:transparent;
                ">
                    <span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:${isSel?'rgba(255,255,255,0.75)':'#94a3b8'};">${d.label}</span>
                    <span style="font-size:20px;font-weight:800;color:${isSel?'white':'#1e293b'};line-height:1;">${d.dayNum}</span>
                    <div style="width:5px;height:5px;border-radius:50%;background:${
                        d.isToday
                            ? (isSel ? 'rgba(255,255,255,0.9)' : '#2563eb')
                            : d.hasTask
                                ? (isSel ? 'rgba(255,255,255,0.45)' : 'rgba(37,99,235,0.28)')
                                : 'transparent'
                    };"></div>
                </div>`;
            }).join('')}
        </div>`;
    }

    // Dot indicators (5 dots, one per week)
    const dotsHtml = weeks.map((_, i) => `
        <div class="planner-week-dot" data-idx="${i}" style="
            width:${i===activeSlide?'20px':'6px'};height:6px;border-radius:4px;
            background:${i===activeSlide?'#2563eb':'#CBD5E1'};
            transition:all 0.3s ease;cursor:pointer;
        " onclick="plannerJumpToWeek(${i})"></div>
    `).join('');

    window._plannerInitialSlide = activeSlide; // per post-render scroll
    return `
    <div class="view-fullbleed planner-view min-h-screen pb-32" style="padding:0;">

        <!-- ══ HEADER ══ -->
        <header style="display:flex;justify-content:space-between;align-items:flex-end;padding:max(env(safe-area-inset-top,0px),28px) 24px 16px;">
            <h1 style="font-size:30px;font-weight:800;color:#1e40af;letter-spacing:-0.025em;margin:0;line-height:1;">Agenda</h1>
            <button onclick="window.openPlannerMonthPicker()" style="display:flex;align-items:center;gap:6px;background:rgba(255,255,255,0.92);border:1.5px solid rgba(255,255,255,0.85);padding:7px 14px 7px 10px;border-radius:999px;box-shadow:0 2px 12px -2px rgba(0,0,0,0.10);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);cursor:pointer;font-family:Hanken Grotesk,sans-serif;" ontouchstart="this.style.transform='scale(0.95)'" ontouchend="this.style.transform='scale(1)'">
                <span class="material-symbols-outlined" style="font-size:16px;color:#1e40af;font-variation-settings:'FILL' 1;">calendar_month</span>
                <span style="font-size:13px;font-weight:700;color:#1e40af;">${monthLabel}</span>
            </button>
        </header>

        <!-- ══ SEARCH BAR (Apple pill, sempre visibile) ══ -->
        <div style="padding:0 24px 14px;">
            <div style="position:relative;">
                <span class="material-symbols-outlined" style="position:absolute;left:16px;top:50%;transform:translateY(-50%);color:#94a3b8;font-size:18px;pointer-events:none;">search</span>
                <input id="planner-search-input" type="text" placeholder="Cerca compiti, verifiche..."
                    value="${escapeHtml(query)}"
                    oninput="window._psfocused=true;window._pscursor=this.selectionStart;state.agendaSearchQuery=this.value;window.refreshPlannerSearch&&window.refreshPlannerSearch();"
                    onfocus="window._psfocused=true;"
                    onblur="setTimeout(()=>{window._psfocused=false;},200);"
                    style="width:100%;height:46px;padding:0 46px;border-radius:999px;background:white;border:none;box-shadow:0 2px 16px -4px rgba(0,0,0,0.08);font-size:15px;font-weight:500;color:#1e293b;outline:none;font-family:Hanken Grotesk,sans-serif;box-sizing:border-box;" />
${query ? `<button onclick="state.agendaSearchQuery='';const si=document.getElementById('planner-search-input');if(si)si.value='';window.refreshPlannerSearch&&window.refreshPlannerSearch();" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:#f1f5f9;border:none;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#64748b;padding:0;"><span class="material-symbols-outlined" style="font-size:15px;">close</span></button>` : ''}            </div>
        </div>

        <!-- ══ WEEK CAROUSEL (same mechanics as dashboard widgets) ══ -->
       <div id="planner-week-carousel" style="
            display:flex;
            overflow-x:auto;
            scroll-snap-type:x mandatory;
            scroll-behavior:smooth;
            -webkit-overflow-scrolling:touch;
            scrollbar-width:none;
            -ms-overflow-style:none;
            gap:0;
            margin: 0 0 -20px 0;
            padding:0;
        " onscroll="handlePlannerCarouselScroll(this)">
            ${weeks.map((wk,i) => weekSlide(wk, i)).join('')}
        </div>

        <!-- Dot indicators -->
        <div style="display:flex;justify-content:center;align-items:center;gap:7px;margin:10px 0 16px;">
            ${dotsHtml}
        </div>

        <!-- ══ RISULTATI RICERCA / CONTENUTO GIORNO ══ -->
        <div id="planner-content-area">
        ${(query || filterSubject !== 'all') ? `
        <div style="padding:0 24px;">
            <!-- Subject chips -->
            <div style="display:flex;overflow-x:auto;gap:7px;padding-bottom:12px;scrollbar-width:none;">
                ${[{l:'Tutte',s:'all'},...subjects.map(s=>({l:s,s}))].map(({l,s})=>`
                <button onclick="state.agendaSearchSubject='${escapeJsSingleQuote(s)}';window.refreshPlannerSearch&&window.refreshPlannerSearch();" style="flex-shrink:0;padding:7px 14px;border-radius:999px;font-size:12px;font-weight:700;cursor:pointer;font-family:Hanken Grotesk,sans-serif;border:${filterSubject===s?'2px solid #2563eb':'1.5px solid rgba(226,232,240,0.9)'};background:${filterSubject===s?'#2563eb':'white'};color:${filterSubject===s?'white':'#64748b'};">${escapeHtml(l)}</button>`).join('')}
            </div>
            <div style="font-size:11px;font-weight:600;color:#94a3b8;margin-bottom:10px;">${searchResults.length} risultati${query?` per "${escapeHtml(query)}"`:''}</div>
            <div style="display:flex;flex-direction:column;gap:9px;">
                ${searchResults.length ? searchResults.map(t=>TC(t,true)).join('') : `<div style="text-align:center;padding:40px 0;"><span class="material-symbols-outlined" style="font-size:40px;color:#cbd5e1;">search_off</span><p style="color:#94a3b8;font-size:14px;font-weight:600;margin:8px 0 0;">Nessun risultato</p></div>`}
            </div>
        </div>` : `

        <!-- ══ DAY CONTENT ══ -->
        <div style="padding:0 24px;display:flex;flex-direction:column;gap:10px;">

            <!-- Selected day label -->
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                <h2 style="font-size:15px;font-weight:700;color:#1e293b;margin:0;">
                    ${(()=>{
                        const d=new Date(selectedDate+'T00:00:00');
                        const diff=Math.round((d-today)/86400000);
                        const base=`${dayLabels[d.getDay()]} ${d.getDate()} ${MN[d.getMonth()]}`;
                        if(diff===0) return `Oggi · ${base}`;
                        if(diff===1) return `Domani · ${base}`;
                        if(diff===-1) return `Ieri · ${base}`;
                        return base;
                    })()}
                </h2>
                <span style="font-size:11px;font-weight:700;color:#94a3b8;">${dayTasks.length} ${dayTasks.length===1?'evento':'eventi'}</span>
            </div>

            ${upcomingCount>0 && selectedDate===todayISO ? `
            <div style="background:#f0f7ff;border:1.5px solid rgba(191,219,254,0.6);border-radius:20px;padding:14px 16px;box-shadow:0 4px 16px -8px rgba(37,99,235,0.12);">
                <div style="display:flex;align-items:center;gap:9px;margin-bottom:5px;">
                    <div style="width:30px;height:30px;border-radius:50%;background:#1e40af;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><span class="material-symbols-outlined" style="font-size:15px;color:white;font-variation-settings:'FILL' 1;">lightbulb</span></div>
                    <span style="font-size:13px;font-weight:700;color:#1e40af;">Smart Planner</span>
                </div>
                <p style="font-size:12px;color:#475569;line-height:1.5;margin:0 0 6px;">Hai <strong>${upcomingCount}</strong> compiti nei prossimi 7 giorni.</p>
                <button onclick="const si=document.getElementById('planner-search-input');if(si){si.focus();si.select();}" style="color:#1e40af;font-weight:700;font-size:11px;background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:3px;font-family:Hanken Grotesk,sans-serif;padding:0;">Cerca <span class="material-symbols-outlined" style="font-size:13px;">arrow_forward</span></button>
            </div>` : ''}

            ${dayTasks.length ? dayTasks.map(t=>TC(t,false)).join('') : `
            <div style="background:white;border-radius:22px;padding:44px 16px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:10px;border:1.5px solid rgba(241,245,249,0.9);box-shadow:0 3px 14px -6px rgba(0,0,0,0.05);">
                <span class="material-symbols-outlined" style="font-size:44px;color:#cbd5e1;">event_busy</span>
                <p style="font-size:14px;font-weight:600;color:#94a3b8;margin:0;">Nessuna attività per questo giorno</p>
            </div>`}
        </div>`}

        </div><!-- /planner-content-area -->

        <!-- ══ FABs ══ -->
        <div style="position:fixed;bottom:calc(112px + env(safe-area-inset-bottom,0px));right:18px;display:flex;flex-direction:column;align-items:center;gap:12px;z-index:40;">
            <button onclick="window.openClassActivitiesExportModal&&openClassActivitiesExportModal();" style="width:52px;height:52px;border-radius:50%;background:#4f46e5;color:white;border:none;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 20px rgba(79,70,229,0.32);cursor:pointer;" ontouchstart="this.style.transform='scale(0.91)'" ontouchend="this.style.transform='scale(1)'">
                <span class="material-symbols-outlined" style="font-size:22px;">history</span>
            </button>
            <button onclick="showQuickAddTaskModal()" style="width:52px;height:52px;border-radius:50%;background:#2563eb;color:white;border:none;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(37,99,235,0.38);cursor:pointer;" ontouchstart="this.style.transform='scale(0.91)'" ontouchend="this.style.transform='scale(1)'">
                <span class="material-symbols-outlined" style="font-size:26px;">add</span>
            </button>
        </div>

        <!-- carousel JS moved to module level -->
    </div>`;
}



// ══════════════════════════════════════════════════════════════════════════════
// MONTH PICKER — bottom-sheet overlay per navigare all'anno scolastico
// Aperto dal badge mese nella header del planner.
// Gestisce il proprio DOM separatamente dal ciclo di render principale.
// ══════════════════════════════════════════════════════════════════════════════

window.openPlannerMonthPicker = function() {
    // Toggle: se già aperto, chiudi
    if (document.getElementById('month-picker-overlay')) {
        window.closePlannerMonthPicker();
        return;
    }
    // Inizializza sul mese della data selezionata
    const sel = new Date((state.selectedDate || getLocalDateString(new Date())) + 'T00:00:00');
    window._pk = { year: sel.getFullYear(), month: sel.getMonth() };
    window._renderMonthPicker();
};

window.closePlannerMonthPicker = function() {
    const el = document.getElementById('month-picker-overlay');
    if (el) {
        el.style.opacity = '0';
        el.style.transition = 'opacity 0.15s ease';
        setTimeout(() => el.remove(), 150);
    }
};

window._renderMonthPicker = function() {
    const MN_FULL = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                     'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
    const { year, month } = window._pk;
    const todayISO    = getLocalDateString(new Date());
    const selectedISO = state.selectedDate || todayISO;

    const firstDay = new Date(year, month, 1);
    const lastDay  = new Date(year, month + 1, 0);
    const startDow = (firstDay.getDay() + 6) % 7; 

    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push('<div></div>');

    for (let d = 1; d <= lastDay.getDate(); d++) {
        const iso       = year + '-' + String(month + 1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
        const isToday   = iso === todayISO;
        const isSel     = iso === selectedISO;
        const hasVerif  = (state.verifiche  || []).some(function(v){ return (v.data||v.date||'') === iso; });
        const hasTask   = (state.tasks      || []).some(function(t){ return t.due_date === iso && t.subject !== 'QUEST' && !t.done; });
        const dotColor  = hasVerif ? '#f97316' : '#3b82f6';

        let bg = 'transparent', color = '#1e293b', fw = '400', ring = 'none', shadow = 'none';
        if (isSel)   { bg = '#2563eb'; color = 'white'; fw = '800'; shadow = '0 4px 14px -3px rgba(37,99,235,0.45)'; }
        else if (isToday) { bg = 'rgba(37,99,235,0.09)'; color = '#2563eb'; fw = '700'; ring = '2px solid rgba(37,99,235,0.25)'; }

        const dot = (hasTask || hasVerif) && !isSel
            ? '<span style="position:absolute;bottom:3px;left:50%;transform:translateX(-50%);width:4px;height:4px;border-radius:50%;display:block;background:' + dotColor + ';"></span>'
            : '';

        cells.push(
            '<button onclick="window._pkSelectDay(\'' + iso + '\')" ' +
            'style="position:relative;width:100%;aspect-ratio:1/1;border-radius:50%;border:' + ring + ';' +
            'cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
            'background:' + bg + ';' +
            'box-shadow:' + shadow + ';' +
            'font-size:14px;font-weight:' + fw + ';color:' + color + ';' +
            'font-family:Hanken Grotesk,sans-serif;transition:transform 0.1s ease;' +
            '-webkit-tap-highlight-color:transparent;" ' +
            'ontouchstart="this.style.transform=\'scale(0.88)\'" ontouchend="this.style.transform=\'scale(1)\'">' +
            d + dot + '</button>'
        );
    }

    const schoolYear = (month >= 8) ? year + '\u2013' + (year + 1) : (year - 1) + '\u2013' + year;

    const innerHTML = 
        '<div data-drag-handle style="display:flex;justify-content:center;padding:16px 0 8px;cursor:grab;touch-action:none;">' +
            '<div style="width:40px;height:4px;border-radius:999px;background:#d1d5db;"></div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 20px 4px;">' +
            '<button onclick="window._pkPrev()" style="width:38px;height:38px;border-radius:50%;background:rgba(241,245,249,0.85);border:1px solid rgba(255,255,255,0.6);cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);">' +
                '<span class="material-symbols-outlined" style="font-size:20px;color:#1e40af;">chevron_left</span>' +
            '</button>' +
            '<div style="text-align:center;">' +
                '<div style="font-size:18px;font-weight:800;color:#0f172a;letter-spacing:-0.02em;">' + MN_FULL[month] + ' ' + year + '</div>' +
                '<div style="font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.06em;text-transform:uppercase;margin-top:1px;">A.S.\u00a0' + schoolYear + '</div>' +
            '</div>' +
            '<button onclick="window._pkNext()" style="width:38px;height:38px;border-radius:50%;background:rgba(241,245,249,0.85);border:1px solid rgba(255,255,255,0.6);cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);">' +
                '<span class="material-symbols-outlined" style="font-size:20px;color:#1e40af;">chevron_right</span>' +
            '</button>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(7,1fr);padding:14px 16px 6px;">' +
            ['L','M','M','G','V','S','D'].map(function(l){ return '<div style="text-align:center;font-size:11px;font-weight:700;color:#cbd5e1;">' + l + '</div>'; }).join('') +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;padding:0 16px;">' + cells.join('') + '</div>' +
        '<div style="padding:16px 20px 0;display:flex;justify-content:center;">' +
            '<button onclick="window._pkSelectDay(\'' + todayISO + '\')" style="padding:10px 28px;border-radius:999px;background:rgba(239,246,255,0.9);border:1px solid rgba(191,219,254,0.6);cursor:pointer;font-size:13px;font-weight:700;color:#2563eb;font-family:Hanken Grotesk,sans-serif;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);">Vai a Oggi</button>' +
        '</div>';

    // FIX SCATTO MESE: Aggiorniamo solo il contenuto senza rimuovere l'overlay!
    const existing = document.getElementById('month-picker-overlay');
    if (existing) {
        const card = existing.querySelector('.month-picker-card');
        if (card) card.innerHTML = innerHTML;
        return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'month-picker-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.30);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);z-index:9000;display:flex;align-items:flex-end;justify-content:center;padding:0;opacity:0;transition:opacity 0.18s ease;';
    overlay.onclick = function(e) { if (e.target === overlay) window.closePlannerMonthPicker(); };

    const card = document.createElement('div');
    card.className = 'month-picker-card';
    card.style.cssText = 'width:100%;max-width:430px;background:#ffffff;border:none;border-radius:32px 32px 0 0;padding:0 0 calc(28px + env(safe-area-inset-bottom,0px)) 0;box-shadow:0 -4px 24px rgba(0,0,0,0.10);overflow:hidden;transform:translateY(100%);transition:transform 0.28s cubic-bezier(0.2,0.8,0.2,1);';
    card.innerHTML = innerHTML;

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    requestAnimationFrame(function() {
        overlay.style.opacity = '1';
        card.style.transform  = 'translateY(0px)';
    });

    // ── Drag-to-dismiss sul drag handle ─────────────────────────────────────
    var handle = card.querySelector('[data-drag-handle]');
    if (!handle) handle = card.firstElementChild; // fallback: prima div (drag handle)
    var startY = 0, currentY = 0, dragging = false;
    function onTouchStart(e) {
        startY = e.touches[0].clientY;
        currentY = 0;
        dragging = true;
        card.style.transition = 'none';
    }
    function onTouchMove(e) {
        if (!dragging) return;
        currentY = e.touches[0].clientY - startY;
        if (currentY < 0) currentY = 0;
        card.style.transform = 'translateY(' + currentY + 'px)';
    }
    function onTouchEnd() {
        if (!dragging) return;
        dragging = false;
        card.style.transition = 'transform 0.28s cubic-bezier(0.2,0.8,0.2,1)';
        if (currentY > 100) {
            window.closePlannerMonthPicker();
        } else {
            card.style.transform = 'translateY(0px)';
        }
    }
    handle.addEventListener('touchstart', onTouchStart, { passive: true });
    handle.addEventListener('touchmove',  onTouchMove,  { passive: true });
    handle.addEventListener('touchend',   onTouchEnd);
};

window._pkPrev = function() {
    window._pk.month--;
    if (window._pk.month < 0) { window._pk.month = 11; window._pk.year--; }
    window._renderMonthPicker();
};

window._pkNext = function() {
    window._pk.month++;
    if (window._pk.month > 11) { window._pk.month = 0; window._pk.year++; }
    window._renderMonthPicker();
};

window._pkSelectDay = function(iso) {
    state.selectedDate = iso;
    window._plannerDayContentCache = null;
    state._forceRender = true;
    window.closePlannerMonthPicker();
    scheduleRender(0);
};


// ══════════════════════════════════════════════════════════════════════════════
// refreshPlannerSearch — aggiornamento CHIRURGICO dei risultati ricerca
// Aggiorna solo #planner-content-area senza toccare header, search bar o carousel.
// Chiamata dall'oninput della search bar e dai chip filtro materia.
// ══════════════════════════════════════════════════════════════════════════════
// ── Builder chirurgico day content (usato da refreshPlannerSearch quando query svuotata) ──
window._buildPlannerDayContentHTML = function() {
    const TC = window._plannerTC;
    if (!TC) return null;
    const MN = window._plannerMN || ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                                      'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
    const dayLabels  = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];
    const today      = new Date(); today.setHours(0,0,0,0);
    const todayISO   = getLocalDateString(today);
    const selDate    = state.selectedDate || todayISO;
    const allTasks   = (state.tasks || []).filter(function(t){ return t.subject !== 'QUEST'; });
    const dayTasks   = allTasks.filter(function(t){ return t.due_date === selDate; });
    const upcoming   = allTasks.filter(function(t){
        if(t.done) return false;
        try { var d = parseLocalDate(t.due_date); var diff = (d-today)/86400000; return diff > 0 && diff <= 7; }
        catch(e){ return false; }
    }).length;
    var d    = new Date(selDate + 'T00:00:00');
    var diff = Math.round((d-today)/86400000);
    var base = dayLabels[d.getDay()] + ' ' + d.getDate() + ' ' + MN[d.getMonth()];
    var dayLabel = diff===0 ? 'Oggi · '+base : diff===1 ? 'Domani · '+base : diff===-1 ? 'Ieri · '+base : base;
    var smart = upcoming > 0 && selDate === todayISO
        ? '<div style="background:#f0f7ff;border:1.5px solid rgba(191,219,254,0.6);border-radius:20px;padding:14px 16px;">' +
          '<div style="display:flex;align-items:center;gap:9px;margin-bottom:5px;">' +
          '<div style="width:30px;height:30px;border-radius:50%;background:#1e40af;display:flex;align-items:center;justify-content:center;">' +
          '<span class="material-symbols-outlined" style="font-size:15px;color:white;">lightbulb</span></div>' +
          '<span style="font-size:13px;font-weight:700;color:#1e40af;">Smart Planner</span></div>' +
          '<p style="font-size:12px;color:#475569;margin:0 0 6px;">Hai <strong>' + upcoming + '</strong> compiti nei prossimi 7 giorni.</p>' +
          '</div>' : '';
    var empty = '<div style="background:rgba(255,255,255,0.7);border-radius:22px;padding:44px 16px;text-align:center;border:1.5px solid rgba(241,245,249,0.9);">' +
        '<span class="material-symbols-outlined" style="font-size:44px;color:#cbd5e1;">event_busy</span>' +
        '<p style="font-size:14px;font-weight:600;color:#94a3b8;margin:8px 0 0;">Nessuna attività per questo giorno</p></div>';
    return '<div style="padding:0 24px 140px;display:flex;flex-direction:column;gap:10px;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">' +
        '<h2 style="font-size:15px;font-weight:700;color:#1e293b;margin:0;">' + dayLabel + '</h2>' +
        '<span style="font-size:11px;font-weight:700;color:#94a3b8;">' + dayTasks.length + (dayTasks.length===1?' evento':' eventi') + '</span></div>' +
        smart + (dayTasks.length ? dayTasks.map(function(t){ return TC(t,false); }).join('') : empty) +
        '</div>';
};

window.refreshPlannerSearch = function() {
    const area = document.getElementById('planner-content-area');
    if (!area) {
        state._forceRender = true;
        scheduleRender(60);
        return;
    }

    const query         = (state.agendaSearchQuery || '').toLowerCase().trim();
    const filterSubject = state.agendaSearchSubject || 'all';

    // FIX SCATTO: quando la query torna vuota, ripristina il giorno senza toccare il DOM se non è cambiato
    if (!query && filterSubject === 'all') {
        if (window._plannerGetDayContentHTML) {
            const freshHtml = window._plannerGetDayContentHTML();
            // Scrivi solo se il contenuto è effettivamente diverso, altrimenti lascia stare
            if (area.innerHTML !== freshHtml) {
                area.innerHTML = freshHtml;
            }
        }
        // Non chiamare scheduleRender: evita il re-mount dell'intera view
        return;
    }

    const TC = window._plannerTC;
    const MN = window._plannerMN || ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
    if (!TC) { state._forceRender = true; scheduleRender(60); return; }

    const allTasks = (state.tasks || []).filter(function(t) { return t.subject !== 'QUEST'; });
    const subjects = [...new Set(allTasks.map(function(t) {
        return t.subject || t.materia || '';
    }).filter(Boolean))].sort();

    // FIX ORDINE: Da più recente a meno recente (Discendente, b localeCompare a)
    const results = allTasks.filter(function(t) {
        if (filterSubject !== 'all' && (t.subject || t.materia || '') !== filterSubject) return false;
        if (!query) return true;
        return (t.subject  || '').toLowerCase().includes(query)
            || (t.materia  || '').toLowerCase().includes(query)
            || (t.text     || '').toLowerCase().includes(query);
    }).sort(function(a, b) {
        return (b.due_date || '').localeCompare(a.due_date || '');
    });

    const chipsHtml = [{l: 'Tutte', s: 'all'}]
        .concat(subjects.map(function(s) { return {l: s, s: s}; }))
        .map(function(item) {
            const active = filterSubject === item.s;
            const safeS = escapeJsSingleQuote(item.s);
            return '<button onclick="state.agendaSearchSubject=\'' + safeS + '\';window.refreshPlannerSearch&&window.refreshPlannerSearch();" ' +
                'style="flex-shrink:0;padding:7px 14px;border-radius:999px;font-size:12px;font-weight:700;cursor:pointer;font-family:Hanken Grotesk,sans-serif;white-space:nowrap;' +
                'border:' + (active ? '2px solid #2563eb' : '1.5px solid rgba(226,232,240,0.9)') + ';' +
                'background:' + (active ? '#2563eb' : 'white') + ';' +
                'color:' + (active ? 'white' : '#64748b') + ';">' +
                escapeHtml(item.l) + '</button>';
        }).join('');

    const emptyHtml = '<div style="text-align:center;padding:44px 0;">' +
        '<span class="material-symbols-outlined" style="font-size:44px;color:#cbd5e1;">search_off</span>' +
        '<p style="color:#94a3b8;font-size:14px;font-weight:600;margin:8px 0 0;">Nessun risultato</p>' +
        '</div>';

    const countLabel = results.length + ' risultat' + (results.length === 1 ? 'o' : 'i') +
        (query ? ' per "' + escapeHtml(query) + '"' : '');

    // FIX NAVBAR OVERLAP: Aggiunto padding-bottom: 120px
    area.innerHTML =
        '<div style="padding:0 24px 120px 24px;">' +
            '<div style="display:flex;overflow-x:auto;gap:7px;padding-bottom:12px;scrollbar-width:none;-ms-overflow-style:none;">' +
                chipsHtml +
            '</div>' +
            '<div style="font-size:11px;font-weight:600;color:#94a3b8;margin-bottom:12px;">' + countLabel + '</div>' +
            '<div style="display:flex;flex-direction:column;gap:9px;">' +
                (results.length ? results.map(function(t) { return TC(t, true); }).join('') : emptyHtml) +
            '</div>' +
        '</div>';
};

// ══════════════════════════════════════════════════════════════════════════════
// PLANNER CAROUSEL FUNCTIONS — definite a livello modulo (non in innerHTML)
// Gli script dentro innerHTML non vengono eseguiti dai browser per sicurezza.
// ══════════════════════════════════════════════════════════════════════════════

window.plannerSelectDay = function(iso) {
    state.selectedDate = iso;
    // Aggiornamento chirurgico pillole senza full re-render
    document.querySelectorAll('.planner-week-slide > div[onclick]').forEach(function(el) {
        const m = el.getAttribute('onclick').match(/'([^']+)'/);
        const elIso = m ? m[1] : null;
        if (!elIso) return;
        const isSel = elIso === iso;
        el.style.background  = isSel ? '#2563eb' : 'white';
        el.style.border      = isSel ? '1.5px solid rgba(241,245,249,0.9)' : '1.5px solid rgba(241,245,249,0.9)';
        el.style.boxShadow   = isSel
            ? 'inset 0 1px 1px rgba(255,255,255,0.2),0 0 0 2.5px rgba(37,99,235,0.18)'
            : 'none';
        el.style.transform   = 'translateZ(0)'; // fisso, no scale → zero layer thrashing
        el.style.filter      = '';              // mai cambiare → evita flash GPU WebKit
        const spans = el.querySelectorAll('span');
        if (spans[0]) spans[0].style.color = isSel ? 'rgba(255,255,255,0.75)' : '#94a3b8';
        if (spans[1]) spans[1].style.color = isSel ? 'white' : '#1e293b';
    });
    // Swap istantaneo: niente opacity, niente scale → zero flash/nero WebKit
    var _area = document.getElementById('planner-content-area');
    var _dayHtml = window._buildPlannerDayContentHTML && window._buildPlannerDayContentHTML();
    if (_area && _dayHtml) {
        _area.innerHTML = _dayHtml; // sostituzione diretta, nessuna animazione intermedia
    } else {
        // fallback solo se builder non disponibile
        state._forceRender = true;
        scheduleRender(60);
    }
};

window.handlePlannerCarouselScroll = function(el) {
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (window._lastPlannerScrollIdx === idx) return; // evita aggiornamenti inutili
    window._lastPlannerScrollIdx = idx;
    document.querySelectorAll('.planner-week-dot').forEach(function(dot, i) {
        dot.style.width      = i === idx ? '20px' : '6px';
        dot.style.background = i === idx ? '#2563eb' : '#CBD5E1';
        dot.style.borderRadius = '4px';
    });
    // Aggiorna lo stato settimana senza re-render immediato
    if (typeof state !== 'undefined') {
        state.plannerWeekOffset = (state.plannerWeekOffset || 0) + (idx - (window._plannerInitialSlide || 0));
        window._plannerInitialSlide = idx;
    }
};

window.plannerJumpToWeek = function(idx) {
    const el = document.getElementById('planner-week-carousel');
    if (el) el.scrollTo({ left: idx * el.clientWidth, behavior: 'smooth' });
};

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
    const isGoogleConnected = !!(state.googleConnected || localStorage.getItem('gc_google_connected_cache') === '1');
    const userName  = escapeHtml(state.user?.name  || 'Utente');
    const userClass = escapeHtml(normalizeClassUi(state.user?.class || '') || 'Studente');
    const initials  = (state.user?.name || 'U').trim().split(' ').map(function(w){ return w[0]; }).slice(0,2).join('').toUpperCase();

    return `
    <div class="view-fullbleed profile-view hide-scrollbar"
         style="padding:0 24px;height:100dvh;overflow-y:scroll;-webkit-overflow-scrolling:touch;">

        <!-- ── HEADER ── -->
        <div style="display:flex;align-items:center;gap:14px;
                    padding:max(env(safe-area-inset-top,0px),28px) 0 20px;">
            <button onclick="navigate('home')"
                style="width:44px;height:44px;border-radius:50%;
                       background:rgba(255,255,255,0.7);backdrop-filter:blur(12px);
                       -webkit-backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.6);
                       display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;"
                ontouchstart="this.style.transform='scale(0.92)'"
                ontouchend="this.style.transform='scale(1)'">
                <span class="material-symbols-outlined" style="font-size:20px;color:#1e40af;">arrow_back</span>
            </button>
            <div>
                <h1 style="font-size:26px;font-weight:800;color:#0f172a;
                            letter-spacing:-0.02em;margin:0;line-height:1.1;">Profilo</h1>
                <p style="font-size:13px;color:#94a3b8;font-weight:600;margin:2px 0 0;">
                    Gestione account e impostazioni</p>
            </div>
        </div>

        <!-- ── CARTA UTENTE ── -->
        <div style="background:rgba(255,255,255,0.65);backdrop-filter:blur(40px);
                    -webkit-backdrop-filter:blur(40px);border:1px solid rgba(255,255,255,0.55);
                    border-radius:28px;padding:20px;display:flex;align-items:center;gap:16px;
                    margin-bottom:20px;
                    box-shadow:0 4px 20px -8px rgba(0,0,0,0.08),inset 0 1px 0 rgba(255,255,255,0.8);">
            <div style="width:56px;height:56px;border-radius:50%;
                        background:linear-gradient(135deg,#2563eb,#4f46e5);
                        display:flex;align-items:center;justify-content:center;flex-shrink:0;
                        box-shadow:0 6px 16px -4px rgba(37,99,235,0.38);">
                <span style="font-size:22px;font-weight:800;color:white;">${initials}</span>
            </div>
            <div style="min-width:0;flex:1;">
                <div style="font-size:18px;font-weight:800;color:#0f172a;
                            white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${userName}</div>
                <div style="font-size:13px;font-weight:600;color:#64748b;margin-top:2px;">${userClass}</div>
                <div style="display:flex;align-items:center;gap:5px;margin-top:6px;">
                    <div style="width:7px;height:7px;border-radius:50%;background:#22c55e;
                                box-shadow:0 0 0 2px rgba(34,197,94,0.2);"></div>
                    <span style="font-size:11px;font-weight:700;color:#22c55e;">DidUP Collegato</span>
                </div>
            </div>
        </div>

        <!-- ══════════════════════════════════════════════════════ -->
        <!-- ── LOGOUT — visibile subito, nessun modal complesso ── -->
        <!-- ══════════════════════════════════════════════════════ -->
        <button onclick="if(confirm('Sei sicuro di voler uscire dall\\'account?')){if(typeof logout==='function')logout();}"
            style="width:100%;height:52px;border-radius:18px;
                   background:rgba(239,68,68,0.07);
                   border:1.5px solid rgba(239,68,68,0.18);
                   display:flex;align-items:center;justify-content:center;gap:10px;
                   color:#dc2626;font-size:15px;font-weight:700;cursor:pointer;
                   font-family:Hanken Grotesk,sans-serif;
                   margin-bottom:28px;
                   box-shadow:0 2px 12px -4px rgba(239,68,68,0.12);"
            ontouchstart="this.style.background='rgba(239,68,68,0.13)'"
            ontouchend="this.style.background='rgba(239,68,68,0.07)'">
            <span class="material-symbols-outlined" style="font-size:20px;">logout</span>
            Esci dall'Account
        </button>

        <!-- ── GOOGLE CALENDAR ── -->
        <div style="margin-bottom:28px;">
            <p style="font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:0.08em;
                      text-transform:uppercase;margin:0 0 12px 2px;">Google Calendar</p>
            <div style="background:rgba(255,255,255,0.65);backdrop-filter:blur(40px);
                        -webkit-backdrop-filter:blur(40px);border:1px solid rgba(255,255,255,0.55);
                        border-radius:28px;overflow:hidden;
                        box-shadow:0 4px 20px -8px rgba(0,0,0,0.07),inset 0 1px 0 rgba(255,255,255,0.8);">
                ${isGoogleConnected ? `
                <div style="padding:20px;">
                    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
                        <div style="width:42px;height:42px;border-radius:14px;
                                    background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.25);
                                    display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                            <span class="material-symbols-outlined"
                                  style="font-size:22px;color:#16a34a;font-variation-settings:'FILL' 1;">
                                calendar_month</span>
                        </div>
                        <div>
                            <div style="font-size:15px;font-weight:700;color:#0f172a;">Google Calendar</div>
                            <div style="font-size:12px;font-weight:600;color:#16a34a;
                                        display:flex;align-items:center;gap:4px;">
                                <span style="width:6px;height:6px;border-radius:50%;
                                             background:#22c55e;display:inline-block;"></span>
                                Account collegato
                            </div>
                        </div>
                    </div>
                    <p style="font-size:13px;color:#64748b;line-height:1.5;margin:0 0 14px;">
                        Verifiche e compiti sincronizzati automaticamente con Google Calendar.
                    </p>
                    <div style="display:flex;gap:10px;">
                        <button onclick="window.syncGoogleCalendar&&syncGoogleCalendar()"
                            style="flex:1;height:44px;border-radius:14px;border:none;cursor:pointer;
                                   background:#2563eb;color:white;font-size:13px;font-weight:700;
                                   font-family:Hanken Grotesk,sans-serif;
                                   display:flex;align-items:center;justify-content:center;gap:7px;"
                            ontouchstart="this.style.opacity='0.8'"
                            ontouchend="this.style.opacity='1'">
                            <span class="material-symbols-outlined" style="font-size:17px;">sync</span>
                            Sincronizza ora
                        </button>
                        <button onclick="if(confirm('Disconnettere Google Calendar?'))window.disconnectGoogle&&disconnectGoogle()"
                            style="height:44px;padding:0 16px;border-radius:14px;cursor:pointer;
                                   background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);
                                   color:#dc2626;font-size:13px;font-weight:700;
                                   font-family:Hanken Grotesk,sans-serif;white-space:nowrap;"
                            ontouchstart="this.style.opacity='0.7'"
                            ontouchend="this.style.opacity='1'">
                            Disconnetti
                        </button>
                    </div>
                </div>` : `
                <div style="padding:20px;">
                    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
                        <div style="width:42px;height:42px;border-radius:14px;
                                    background:rgba(255,255,255,0.8);border:1px solid rgba(226,232,240,0.9);
                                    display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                            <span class="material-symbols-outlined" style="font-size:22px;color:#64748b;">
                                calendar_month</span>
                        </div>
                        <div>
                            <div style="font-size:15px;font-weight:700;color:#0f172a;">Google Calendar</div>
                            <div style="font-size:12px;font-weight:600;color:#94a3b8;">Non collegato</div>
                        </div>
                    </div>
                    <p style="font-size:13px;color:#64748b;line-height:1.55;margin:0 0 14px;">
                        Collega il tuo Google Calendar per sincronizzare automaticamente verifiche
                        e compiti. Funziona in background senza dover aprire l'app.
                    </p>
                    <div style="background:rgba(239,246,255,0.7);border:1px solid rgba(191,219,254,0.5);
                                border-radius:16px;padding:14px 16px;margin-bottom:16px;">
                        <div style="font-size:11px;font-weight:700;color:#1e40af;text-transform:uppercase;
                                    letter-spacing:0.06em;margin-bottom:10px;">Come collegare</div>
                        ${[
                            'Tocca "Collega Google Calendar" qui sotto',
                            'Scegli il tuo account Google scolastico o personale',
                            'Autorizza Gandhi Diary ad accedere al calendario',
                            'Verifiche e compiti appariranno in Google Calendar entro pochi secondi'
                          ].map((s,i) => `
                        <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:${i<3?'9px':'0'};">
                            <div style="width:20px;height:20px;border-radius:50%;background:#2563eb;color:white;
                                        font-size:10px;font-weight:800;display:flex;align-items:center;
                                        justify-content:center;flex-shrink:0;margin-top:1px;">${i+1}</div>
                            <span style="font-size:13px;color:#374151;line-height:1.45;">${s}</span>
                        </div>`).join('')}
                    </div>
                    <button onclick="window.connectGoogle&&connectGoogle()"
                        style="width:100%;height:48px;border-radius:16px;border:none;cursor:pointer;
                               background:linear-gradient(135deg,#2563eb,#4f46e5);color:white;
                               font-size:15px;font-weight:700;font-family:Hanken Grotesk,sans-serif;
                               display:flex;align-items:center;justify-content:center;gap:8px;
                               box-shadow:0 6px 20px -6px rgba(37,99,235,0.45);"
                        ontouchstart="this.style.transform='scale(0.97)'"
                        ontouchend="this.style.transform='scale(1)'">
                        <span class="material-symbols-outlined" style="font-size:19px;">link</span>
                        Collega Google Calendar
                    </button>
                </div>`}
            </div>
        </div>

        <!-- ── IMPOSTAZIONI ── -->
        <div style="margin-bottom:28px;">
            <p style="font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:0.08em;
                      text-transform:uppercase;margin:0 0 12px 2px;">Impostazioni</p>
            <div style="background:rgba(255,255,255,0.65);backdrop-filter:blur(40px);
                        -webkit-backdrop-filter:blur(40px);border:1px solid rgba(255,255,255,0.55);
                        border-radius:28px;overflow:hidden;
                        box-shadow:0 4px 20px -8px rgba(0,0,0,0.07),inset 0 1px 0 rgba(255,255,255,0.8);">
                <div onclick="showToast('Notifiche in arrivo prossimamente','info')"
                    style="display:flex;align-items:center;justify-content:space-between;
                           padding:16px 20px;cursor:pointer;"
                    ontouchstart="this.style.background='rgba(0,0,0,0.03)'"
                    ontouchend="this.style.background='transparent'">
                    <div style="display:flex;align-items:center;gap:13px;">
                        <div style="width:34px;height:34px;border-radius:10px;
                                    background:rgba(249,115,22,0.1);
                                    display:flex;align-items:center;justify-content:center;">
                            <span class="material-symbols-outlined"
                                  style="font-size:18px;color:#ea580c;">notifications</span>
                        </div>
                        <span style="font-size:15px;font-weight:600;color:#0f172a;">Notifiche</span>
                    </div>
                    <span class="material-symbols-outlined"
                          style="font-size:18px;color:#cbd5e1;">chevron_right</span>
                </div>
                <div style="height:1px;background:rgba(226,232,240,0.5);margin:0 20px;"></div>
                <div onclick="showToast('Privacy & Sicurezza in arrivo','info')"
                    style="display:flex;align-items:center;justify-content:space-between;
                           padding:16px 20px;cursor:pointer;"
                    ontouchstart="this.style.background='rgba(0,0,0,0.03)'"
                    ontouchend="this.style.background='transparent'">
                    <div style="display:flex;align-items:center;gap:13px;">
                        <div style="width:34px;height:34px;border-radius:10px;
                                    background:rgba(20,184,166,0.1);
                                    display:flex;align-items:center;justify-content:center;">
                            <span class="material-symbols-outlined"
                                  style="font-size:18px;color:#0d9488;">lock</span>
                        </div>
                        <span style="font-size:15px;font-weight:600;color:#0f172a;">
                            Privacy & Sicurezza</span>
                    </div>
                    <span class="material-symbols-outlined"
                          style="font-size:18px;color:#cbd5e1;">chevron_right</span>
                </div>
            </div>
        </div>

        <!-- versione app + spacer navbar -->
        <p style="text-align:center;font-size:11px;color:#cbd5e1;font-weight:600;
                  letter-spacing:0.04em;padding-bottom:12px;">Gandhi Diary • v3.3.8</p>
        <div style="height:100px;"></div><!-- spacer sopra la navbar -->

    </div>
    `;
}


function renderGradesView() {
    if (state.activeSubject) return renderSubjectDetailView(state.activeSubject);

    const votiData = getVotiData();
    const numericVotes = votiData.map(getNumericGradeValue).filter(v => Number.isFinite(v));
    const media = averageFromNumeric(numericVotes) || 0;

    // ── Monthly aggregation: group all votes by year-month ──────────────────
    const MONTHS_IT = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

    function voteYearMonth(v) {
        const raw = v.data || v.date || '';
        const d = (typeof parseArgoDate === 'function') ? parseArgoDate(raw) : new Date(raw);
        return (d && !isNaN(d)) ? { y: d.getFullYear(), m: d.getMonth(), key: d.getFullYear() * 100 + d.getMonth() } : null;
    }

    // Build a map of { key -> { label, avg } } sorted chronologically
    const monthMap = {};
    votiData.forEach(v => {
        const ym = voteYearMonth(v);
        const val = getNumericGradeValue(v);
        if (!ym || !Number.isFinite(val)) return;
        if (!monthMap[ym.key]) monthMap[ym.key] = { key: ym.key, label: MONTHS_IT[ym.m], nums: [] };
        monthMap[ym.key].nums.push(val);
    });
    const monthList = Object.values(monthMap)
        .sort((a, b) => a.key - b.key)
        .map(m => ({ ...m, avg: averageFromNumeric(m.nums) }));

    // Last 7 months with data for bar chart
    const chartMonths = monthList.slice(-7);
    // Trend: compare last two months with data
    const mediaCurMese  = monthList.length >= 1 ? monthList[monthList.length - 1].avg  : null;
    const mediaPrevMese = monthList.length >= 2 ? monthList[monthList.length - 2].avg  : null;
    const prevMonthLabel = monthList.length >= 2 ? monthList[monthList.length - 2].label : '';

    // ── Per-subject stats ────────────────────────────────────────────────────
    const subjectsMap = {};
    votiData.forEach(v => {
        const sub = v.materia || v.subject || 'Altro';
        const key = getSubjectGroupKey(sub);
        if (!subjectsMap[key]) subjectsMap[key] = { name: sub, list: [] };
        subjectsMap[key].list.push(v);
    });

    const subjects = Object.values(subjectsMap).map(({ name, list }) => {
        const nums = list.map(getNumericGradeValue).filter(v => Number.isFinite(v));
        const subMedia = averageFromNumeric(nums) || 0;
        const lastVote = [...list].sort((a, b) =>
            (b.data || b.date || '').localeCompare(a.data || a.date || '')
        )[0];
        const lastVal = getNumericGradeValue(lastVote);
        return { name, media: subMedia, lastVote: lastVal };
    }).sort((a, b) => b.media - a.media);

    // ── Bar chart: one bar per month (last 7 months with data) ─────────────
    const chartBars = chartMonths.map((m, i) => {
        const pct = Math.round((m.avg / 10) * 100);
        const isLast = i === chartMonths.length - 1;
        const isSecondLast = i === chartMonths.length - 2;
        const color = isLast ? '#2563eb' : isSecondLast ? '#82aee6' : '#cbd5e1';
        const shadow = isLast ? '0 4px 12px rgba(37,99,235,0.3)' : '0 2px 6px rgba(0,0,0,0.06)';
        return { pct, color, shadow, label: m.label };
    });

    // Pad left with empty bars up to 7
    while (chartBars.length < 7) {
        chartBars.unshift({ pct: 0, color: '#e2e8f0', shadow: 'none', label: '' });
    }

    const barsHtml = chartBars.map(b => `
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;">
            <span style="font-size:9px;font-weight:700;color:#475569;opacity:0.9;margin-bottom:4px;min-height:13px;text-align:center;">${b.label}</span>
            <div style="width:100%;height:${b.pct || 2}%;background:${b.color};border-radius:6px 6px 0 0;box-shadow:${b.shadow};min-height:3px;"></div>
        </div>`).join('');

    // ── Badge helpers ─────────────────────────────────────────────────────────
    function getBadge(m) {
        if (m >= 8) return { bg:'#e6f4ea', border:'#bce3c8', color:'#16a34a', label:'Ottimo' };
        if (m >= 7) return { bg:'#eff6ff', border:'#bfdbfe', color:'#2563eb', label:'Buono' };
        if (m >= 6) return { bg:'#fff7ed', border:'#fed7aa', color:'#ea580c', label:'Discreto' };
        return      { bg:'#fef2f2', border:'#fecaca', color:'#dc2626', label:'Insufficiente' };
    }

    function getTrend(lastVal, avg) {
        if (lastVal === null || lastVal === undefined) return '<span style="color:#94a3b8;font-weight:700;">—</span>';
        if (lastVal > avg)  return '<span style="font-size:16px;font-weight:800;color:#16a34a;line-height:1;">&#8593;</span>';
        if (lastVal < avg)  return '<span style="font-size:16px;font-weight:800;color:#dc2626;line-height:1;">&#8595;</span>';
        return '<span style="color:#94a3b8;font-weight:700;">—</span>';
    }

    // ── Subject cards HTML ────────────────────────────────────────────────────
    const subjectsHtml = subjects.map(s => {
        const badge = getBadge(s.media);
        const color = getSubjectColor(s.name);
        const iconBg = color + '22';
        return `
        <div style="background:rgba(255,255,255,0.7);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.9);box-shadow:0 10px 40px -10px rgba(0,0,0,0.04);border-radius:32px;padding:24px;cursor:pointer;transition:transform 0.12s ease;" onclick="navigateSubject('${escapeJsSingleQuote(s.name)}')" ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform='scale(1)'">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
                <div style="width:42px;height:42px;border-radius:50%;background:${iconBg};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                    <span class="material-symbols-outlined" style="font-size:20px;color:${color};font-variation-settings:'FILL' 1;">${getSubjectIcon(s.name)}</span>
                </div>
                <div style="background:${badge.bg};border:1px solid ${badge.border};color:${badge.color};font-size:11px;font-weight:700;padding:4px 12px;border-radius:999px;font-family:Hanken Grotesk,sans-serif;">
                    ${badge.label}
                </div>
            </div>
            <h4 style="font-size:20px;font-weight:800;color:#1b1b1d;letter-spacing:-0.01em;margin:0 0 2px;font-family:Hanken Grotesk,sans-serif;">${escapeHtml(s.name)}</h4>
            <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:4px;">
                <span style="font-size:44px;font-weight:800;color:#0058bc;line-height:1;letter-spacing:-0.02em;font-family:Hanken Grotesk,sans-serif;">${s.media.toFixed(1)}</span>
                <div style="font-size:13px;color:#64748b;font-weight:500;display:flex;align-items:center;gap:5px;padding-bottom:4px;font-family:Hanken Grotesk,sans-serif;">
                    Ultimo: ${s.lastVote !== null && s.lastVote !== undefined ? s.lastVote : '—'}
                    ${getTrend(s.lastVote, s.media)}
                </div>
            </div>
        </div>`;
    }).join('');

    return `
    <div class="view-fullbleed min-h-screen pb-32" style="background:#f8fafc;background-image:radial-gradient(circle at 10% 0%,rgba(224,231,255,0.4) 0%,transparent 40%),radial-gradient(circle at 90% 80%,rgba(240,230,255,0.3) 0%,transparent 40%);background-attachment:fixed;">
        <div style="padding:max(env(safe-area-inset-top,0px),32px) 24px 0;">

            <!-- Header -->
            <header style="display:flex;justify-content:space-between;align-items:center;margin-bottom:28px;">
                <h1 style="font-size:30px;font-weight:800;color:#0058bc;letter-spacing:-0.025em;margin:0;line-height:1;">Voti</h1>
            </header>

            <!-- ── CARD MEDIA GENERALE ────────────────────────────────────── -->
            <div style="background:linear-gradient(135deg,#ffffff 0%,#eff4ff 100%);box-shadow:0 12px 35px -10px rgba(37,99,235,0.12),inset 0 2px 5px rgba(255,255,255,0.8);border:1px solid rgba(255,255,255,0.9);border-radius:36px;padding:28px;margin-bottom:32px;position:relative;overflow:hidden;">
                <!-- Decorative blobs -->
                <div style="position:absolute;top:-40px;right:-40px;width:160px;height:160px;background:rgba(219,234,254,0.5);border-radius:50%;filter:blur(32px);pointer-events:none;"></div>
                <div style="position:absolute;bottom:-40px;left:-40px;width:160px;height:160px;background:rgba(243,232,255,0.4);border-radius:50%;filter:blur(32px);pointer-events:none;"></div>

                <div style="position:relative;z-index:1;">
                    <p style="font-size:13px;font-weight:600;color:#64748b;margin:0 0 4px;font-family:Hanken Grotesk,sans-serif;">Media Generale</p>
                    <div style="display:flex;align-items:center;gap:14px;margin-bottom:6px;">
                        <span style="font-size:56px;font-weight:800;color:#0058bc;line-height:1;letter-spacing:-0.03em;font-family:Hanken Grotesk,sans-serif;">${media.toFixed(2)}</span>
                        ${ (() => {
                            if (mediaCurMese !== null && mediaPrevMese !== null) {
                                const diff = mediaCurMese - mediaPrevMese;
                                const diffFmt = diff.toFixed(2).replace('.', ',');
                                const isPos = diff >= 0;
                                const bg     = isPos ? 'rgba(230,244,234,0.9)' : 'rgba(254,242,242,0.9)';
                                const border = isPos ? '#bce3c8' : '#fecaca';
                                const clr    = isPos ? '#16a34a' : '#dc2626';
                                const icon   = isPos ? 'trending_up' : 'trending_down';
                                return `<div style="display:flex;align-items:center;gap:4px;background:${bg};border:1px solid ${border};padding:4px 10px;border-radius:999px;margin-top:8px;">
                                    <span class="material-symbols-outlined" style="font-size:13px;color:${clr};font-variation-settings:'FILL' 1;">${icon}</span>
                                    <span style="font-size:11px;font-weight:700;color:${clr};letter-spacing:0.04em;">${diffFmt}</span>
                                </div>`;
                            } else if (numericVotes.length >= 2) {
                                return `<div style="display:flex;align-items:center;gap:4px;background:rgba(230,244,234,0.8);border:1px solid #bce3c8;padding:4px 10px;border-radius:999px;margin-top:8px;">
                                    <span class="material-symbols-outlined" style="font-size:13px;color:#16a34a;font-variation-settings:'FILL' 1;">trending_up</span>
                                    <span style="font-size:11px;font-weight:700;color:#16a34a;letter-spacing:0.04em;">${numericVotes.length} voti</span>
                                </div>`;
                            }
                            return '';
                        })() }
                    </div>
                    <p style="font-size:12px;color:#94a3b8;font-weight:500;margin:0 0 24px;font-family:Hanken Grotesk,sans-serif;">Ultimo aggiornamento: Oggi</p>

                    <!-- Bar chart (ultimi voti) -->
                    <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:5px;height:100px;">
                        ${barsHtml}
                    </div>
                </div>
            </div>

            <!-- ── MATERIE ─────────────────────────────────────────────────── -->
            <h2 style="font-size:20px;font-weight:800;color:#1b1b1d;letter-spacing:-0.01em;margin:0 0 20px 4px;font-family:Hanken Grotesk,sans-serif;">Materie</h2>

            <div style="display:flex;flex-direction:column;gap:16px;">
                ${subjectsHtml}
            </div>

        </div>
    </div>`;
}

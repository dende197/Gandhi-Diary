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
                <div class="modal-content liquid-glass rounded-[40px] deep-shadow ${className}" onclick="event.stopPropagation()" style="position:relative;z-index:99991;max-height:calc(100dvh - 32px);overflow:hidden;display:flex;flex-direction:column;width:100%;max-width:640px;padding:32px;animation: modalAppear 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);">
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
        const color = isActive ? '#0056D2' : '#8B95A5';
        const fontStyle = isActive ? 'font-bold' : 'font-semibold';
        const iconClass = isActive ? `ph-fill ${iconBase}` : `ph ${iconBase}`;
        const glowHtml = isActive ? '<div class="active-glow"></div>' : '';

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
                <button class="btn btn-primary w-full h-14 text-lg" onclick="openArgoLogin()">
                    <span class="material-symbols-outlined">login</span> Accedi con DidUP
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
        : `<div style="width:40px;height:40px;border-radius:50%;background:#1F2937;display:flex;align-items:center;justify-content:center;cursor:pointer;border:2px solid #EEF0F3;" onclick="navigate('profile')">
            <span class="material-symbols-outlined" style="font-size:20px;color:white;">person</span>
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

            <div style="position: relative; margin-bottom: 24px;">
                <div class="widgets-container" id="home-carousel" onscroll="handleCarouselScroll(this)">

                    <div class="widget-card">
                        <div class="card-media-premium rounded-[28px] p-5 w-full flex flex-col justify-between mx-auto" style="height:220px; max-width: calc(100% - 32px);">
                            <div style="display:flex;justify-content:space-between;align-items:start;">
                                <div>
                                    <h2 style="color:#0250C5;font-weight:700;font-size:1.15rem;line-height:1.2;">Buongiorno, ${getSafeUserName()}</h2>
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
                        <div class="card-assenze-premium rounded-[28px] p-5 w-full flex flex-col justify-between mx-auto" style="height:220px; max-width: calc(100% - 32px);">
                            <div style="display:flex;justify-content:space-between;align-items:start;">
                                <h2 style="font-weight:600;font-size:1.15rem;color:#BD1118;">Assenze</h2>
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

                    <div class="widget-card">
                        <div class="card-verifiche-premium rounded-[28px] p-5 w-full flex flex-col justify-between mx-auto" style="height:220px; max-width: calc(100% - 32px);">
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
                        </div>
                    </div>
                </div>

                <div class="widget-indicators" style="position: absolute; bottom: -10px; left: 0; right: 0;">
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

    return `
        <div class="view subject-detail-view pb-32">
            <header class="flex items-center gap-4 mb-8 pt-4">
                <button onclick="window.closeSubject()" class="w-12 h-12 rounded-2xl liquid-glass flex items-center justify-center text-primary cursor-pointer hover:scale-105 transition-all">
                    <span class="material-symbols-outlined">arrow_back</span>
                </button>
                <div>
                    <h1 class="headline-lg text-primary">${subjectName}</h1>
                    <p class="body-md text-on-surface-variant/60">Dettaglio voti e andamento</p>
                </div>
            </header>

            <section class="liquid-glass rounded-[40px] p-8 mb-10 liquid-shadow relative overflow-hidden">
                <div class="flex justify-between items-center mb-6">
                    <div>
                        <div class="label-sm text-on-surface-variant/40 mb-1">Media Materia</div>
                        <div class="text-[48px] font-bold text-primary leading-none">${media.toFixed(2)}</div>
                    </div>
                    <div class="text-right" onclick="promptSetGoal('${escapeJsSingleQuote(subjectName)}')">
                        <div class="label-sm text-on-surface-variant/40 mb-1">Obiettivo</div>
                        <div class="text-2xl font-bold text-on-surface flex items-center justify-end gap-2">
                            ${goal.toFixed(1)} <span class="material-symbols-outlined text-primary text-sm">edit</span>
                        </div>
                    </div>
                </div>
                <div class="h-2 bg-primary/10 rounded-full overflow-hidden">
                    <div class="h-full bg-primary" style="width: ${(media / goal * 100).toFixed(0)}%"></div>
                </div>
            </section>

            <h2 class="title-md mb-6">Voti Ricevuti</h2>
            <div class="flex flex-col gap-4">
                ${votiData.map(v => {
                    const val = getNumericGradeValue(v);
                    const isSuff = val >= 6;
                    return `
                    <div class="liquid-glass rounded-[28px] p-6 liquid-shadow flex items-center gap-6">
                        <div class="w-14 h-14 rounded-2xl ${isSuff ? 'bg-green/10 text-green' : 'bg-error/10 text-error'} flex items-center justify-center text-2xl font-bold border border-white/40">
                            ${v.valore || v.value}
                        </div>
                        <div class="flex-1">
                            <h3 class="font-bold text-on-surface">${normalizeTipoVerifica(v.tipo, false)}</h3>
                            <p class="text-on-surface-variant/40 text-[13px] font-medium">${v.data || v.date}</p>
                        </div>
                        ${v.commento ? `<span class="material-symbols-outlined text-primary/40" title="${escapeHtml(v.commento)}">chat_bubble</span>` : ''}
                    </div>`;
                }).join('')}
            </div>
        </div> `;
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

    showModal(`
        <div class="flex flex-col h-full">
            <header class="mb-6">
                <div class="label-sm text-primary mb-2">Circolare N. ${c.numero}</div>
                <h2 class="title-md text-on-surface mb-2">${c.titolo}</h2>
                <p class="body-md text-on-surface-variant/60 flex items-center gap-2">
                    <span class="material-symbols-outlined text-sm">calendar_today</span> ${c.data}
                </p>
            </header>

            <div class="flex-1 overflow-y-auto no-scrollbar mb-6 p-6 rounded-[32px] bg-surface-container-low border border-white/40">
                <div id="sintesi-box-${c.id}" class="h-full">
                    ${c.sintesi ? `<div class="ai-prose">${marked.parse(c.sintesi)}</div>` : `
                        <div class="flex flex-col items-center justify-center h-full text-center gap-4">
                            <div class="w-16 h-16 rounded-2xl liquid-glass flex items-center justify-center text-primary mb-2">
                                <span class="material-symbols-outlined text-3xl">auto_awesome</span>
                            </div>
                            <p class="body-md font-bold text-on-surface">Analisi AI Disponibile</p>
                            <p class="body-md text-on-surface-variant/60 max-w-[240px] mb-4">Ottieni una sintesi intelligente dei punti chiave.</p>
                            <button onclick="requestCircularSynthesis('${c.id}', '${c.link}')" class="btn btn-glass w-full">
                                Elabora Sintesi
                            </button>
                        </div>
                    `}
                </div>
            </div>

            <div class="flex flex-col gap-3">
                <button onclick="window.open('${c.link}', '_blank')" class="btn btn-primary w-full h-14">
                    <span class="material-symbols-outlined">open_in_new</span> Apri Documento
                </button>
                <button onclick="closeModal()" class="btn btn-glass w-full h-14">Chiudi</button>
            </div>
        </div>
    `);
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

    const periodControls = selection.period === 'month'
        ? `<input type="month" class="activities-export-input" value="${escapeHtml(selection.monthValue)}" onchange="updateClassActivitiesExportPeriodValue('month', this.value)">`
        : selection.period === 'week'
            ? `<div class="activities-week-picker-wrap">
                <div class="activities-week-picker">
                    <button type="button" class="activities-week-nav-btn" onclick="shiftClassActivitiesExportWeek(-1)" aria-label="Settimana precedente">
                        <i class="ph-bold ph-caret-left"></i>
                    </button>
                    <select class="activities-export-input activities-week-select" onchange="updateClassActivitiesExportPeriodValue('week', this.value)">
                        ${weekOptions.map((weekValue) => `<option value="${escapeHtml(weekValue)}" ${selection.weekValue === weekValue ? 'selected' : ''}>${escapeHtml(getWeekSelectionOptionLabel(weekValue, compactWeekLabels ? { compact: true } : {}))}</option>`).join('')}
                    </select>
                    <button type="button" class="activities-week-nav-btn" onclick="shiftClassActivitiesExportWeek(1)" aria-label="Settimana successiva">
                        <i class="ph-bold ph-caret-right"></i>
                    </button>
                </div>
                ${weekDetailLabel ? `<small style="font-size:11px; color:#6B6761; font-weight:700;">${escapeHtml(weekDetailLabel)}</small>` : ''}
              </div>`
            : `<select class="activities-export-input" onchange="updateClassActivitiesExportPeriodValue('school_year', this.value)">
                ${years.map(y => `<option value="${escapeHtml(y)}" ${selection.schoolYearValue === y ? 'selected' : ''}>${escapeHtml(y.replace('-', '/'))}</option>`).join('')}
              </select>`;

    modalContent.innerHTML = `
        <div class="activities-export-modal">
            <div class="activities-export-head">
                <div class="activities-export-title-wrap">
                    <h2>Download attività svolte (PDF)</h2>
                    <p>Solo attività svolte in classe, aggiornate automaticamente ad ogni nuovo sync.</p>
                </div>
                <button class="activities-export-close" onclick="closeModal()" aria-label="Chiudi">
                    <i class="ph-bold ph-x"></i>
                </button>
            </div>

            <div class="activities-export-info-card">
                <div class="activities-export-info-badge">Info point</div>
                <p>Il Tutor AI ha limiti strutturali di contesto e può non restituire grandi volumi di attività in un solo messaggio. Da qui puoi esportare in PDF tutte le attività svolte e usarle su strumenti esterni (ChatGPT, Claude, NotebookLM) con un formato chiaro e lineare.</p>
            </div>

            <div class="activities-export-filters">
                <div class="activities-export-filter-tabs">
                    <button class="${selection.period === 'week' ? 'active' : ''}" onclick="setClassActivitiesExportPeriod('week')">Settimana</button>
                    <button class="${selection.period === 'month' ? 'active' : ''}" onclick="setClassActivitiesExportPeriod('month')">Mese</button>
                    <button class="${selection.period === 'school_year' ? 'active' : ''}" onclick="setClassActivitiesExportPeriod('school_year')">Anno scolastico</button>
                </div>
                <div class="activities-export-filter-input">${periodControls}</div>
                <div class="activities-export-stats">
                    <span>${escapeHtml(selection.periodLabel)}</span>
                    <strong>${selection.items.length} attività trovate</strong>
                </div>
            </div>

            <div class="activities-export-actions">
                <button class="activities-export-download-btn" onclick="downloadClassActivitiesPdf()">
                    <i class="ph-bold ph-file-pdf"></i>
                    Genera PDF
                </button>
                <small>Si aprirà l’anteprima di stampa: scegli “Salva come PDF”.</small>
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
        <div class="modal-overlay active" onclick="closeModal(event)" style="position:fixed;top:0;left:0;right:0;bottom:0;z-index:99990;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(4px);box-sizing:border-box;">
            <div id="class-activities-export-modal-content" class="modal-content glass-panel activities-export-shell" onclick="event.stopPropagation()"></div>
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
function openArgoLogin() {
    const modalContainer = getModalContainer();
    if (!modalContainer) return;
    modalContainer.innerHTML = `
        <div class="modal-overlay active" onclick="closeModal(event)" style="display:flex; align-items:center; justify-content:center; padding:16px;">
            <div class="modal-content" onclick="event.stopPropagation()" style="width:100%; max-width:380px; margin:0 auto;">
                <div style="text-align:center; margin-bottom:20px;">
                    <div style="width:60px; height:60px; background:var(--meeting-gradient); border-radius:16px; display:flex; align-items:center; justify-content:center; margin:0 auto 16px auto; box-shadow:0 8px 18px rgba(13,31,45,0.24); overflow:hidden;">
                       <img src="gandhi-diary-icon-192.png" alt="Gandhi Diary" onerror="this.onerror=null; this.src='gandhi-diary-icon-512.png';" style="width:44px; height:44px; border-radius:10px; object-fit:cover;">
                    </div>
                    <h2 style="margin:0; color:var(--text-primary);">Collega DidUP</h2>
                </div>

                <div id="server-status" style="margin-bottom: 20px; font-size: 12px; color: var(--orange); display: flex; align-items: center; justify-content: center; gap: 6px;">
                    <span style="width: 8px; height: 8px; background: var(--orange); border-radius: 50%;"></span>
                    In attesa del server...
                </div>

                <input id="argo-school" placeholder="Codice Scuola" value="${localStorage.getItem('argo_school') || ''}">
                <input id="argo-user" placeholder="Nome Utente">
                <input type="password" id="argo-pass" placeholder="Password">
                <button id="login-btn" onclick="performArgoSync()" class="btn-primary" style="width:100%; margin-top:10px; background:var(--meeting-gradient); border:none; color:#fff;">Accedi e Sincronizza</button>
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
        <div class="modal-overlay active" style="z-index: 9999; animation: fadeIn 0.3s ease-out; display:flex; align-items:center; justify-content:center; padding:16px;">
            <div class="modal-content" onclick="event.stopPropagation()" style="width:100%; max-width: 440px; margin:0 auto; padding: 0; overflow: hidden;">
                <div style="padding: 28px 24px 20px; text-align: center; border-bottom: 1px solid rgba(0,0,0,0.06);">
                    <div style="width: 64px; height: 64px; background: #141414; border-radius: 18px; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; overflow:hidden;">
                        <img src="gandhi-diary-icon-192.png" alt="Gandhi Diary" onerror="this.onerror=null; this.src='gandhi-diary-icon-512.png';" style="width:48px; height:48px; border-radius:12px; object-fit:cover;">
                    </div>
                    <h2 style="font-size: 20px; font-weight: 800; margin: 0 0 6px 0; color: var(--text-primary);">Seleziona Profilo</h2>
                    <p style="font-size: 14px; color: var(--text-secondary); margin: 0;">Scegli quale studente visualizzare</p>
                </div>

                <div class="profiles-list" style="padding: 16px; display: flex; flex-direction: column; gap: 10px; max-height: 50vh; overflow-y: auto;">
                    ${profiles.map(p => `
                        <button class="btn-profile"
                                data-index="${p.index}"
                                style="background: var(--bg-card); border: 1px solid rgba(0,0,0,0.06); padding: 14px 16px; border-radius: 16px; display: flex; align-items: center; gap: 14px; cursor: pointer; transition: all 0.2s; width: 100%; text-align: left; -webkit-tap-highlight-color: transparent; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
                            <div class="profile-avatar" style="width: 44px; height: 44px; background: #141414; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 18px; color: white; flex-shrink: 0;">
                                ${escapeHtml((p.name || 'S')[0].toUpperCase())}
                            </div>
                            <div style="flex-grow: 1; min-width: 0;">
                                <div class="profile-name" style="font-weight: 700; font-size: 16px; color: var(--text-primary); margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(p.name || ('Studente ' + (p.index + 1)))}</div>
                                <div class="profile-class" style="font-size: 13px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(p.class || p.school || 'Caricamento...')}</div>
                            </div>
                            <i class="ph-bold ph-caret-right" style="color: var(--text-dim); flex-shrink: 0;"></i>
                        </button>
                    `).join('')}
                </div>

                <div style="padding: 12px 16px 16px; border-top: 1px solid rgba(0,0,0,0.06);">
                    <button onclick="closeModal()" style="width: 100%; height: 44px; border-radius: 14px; border: none; background: rgba(0,0,0,0.05); color: var(--text-secondary); font-weight: 600; cursor: pointer; font-size: 14px;">Annulla</button>
                </div>
            </div>
        </div>`;

    // Event Delegation
    const list = container.querySelector('.profiles-list');
    list.addEventListener('click', async (ev) => {
        const btn = ev.target.closest('.btn-profile');
        if (!btn) return;

        // Get selected profile name for the loading screen
        const selectedName = btn.querySelector('.profile-name')?.textContent || 'Studente';

        // Replace entire modal content with a large gradient spinner
        const modalContent = container.querySelector('.modal-content');
        if (modalContent) {
            modalContent.style.transition = 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
            modalContent.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 48px 24px; gap: 24px; text-align: center;">
                    <div style="width: 56px; height: 56px; border-radius: 50%; display: inline-block;
                        animation: profile-loader-spin 1s linear infinite;
                        background: conic-gradient(#C6F2DF, #1A6B8A, #0D1F2D, transparent 90%);
                        -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 5px));
                        mask: radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 5px));">
                    </div>
                    <div>
                        <div style="font-size: 17px; font-weight: 700; color: var(--text-primary); margin-bottom: 6px;">Caricamento profilo</div>
                        <div style="font-size: 14px; color: var(--text-secondary);">${escapeHtml(selectedName)}</div>
                    </div>
                    <div style="font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.1em;">Sincronizzazione in corso…</div>
                </div>
            `;
        }

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
    showModal(`
                <div style="padding: 28px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <h2 style="margin: 0; font-size: 22px; font-weight: 800; color: #141414;">Task Manuali Disattivate</h2>
                        <button onclick="closeModal()" style="width: 32px; height: 32px; border-radius: 10px; border: 1px solid #E0DDD8; background: #F6F5F3; color: #141414; cursor: pointer; display: flex; align-items: center; justify-content: center;"><i class="ph-bold ph-x" style="font-size: 14px;"></i></button>
                    </div>
                    <p style="font-family:'JetBrains Mono', monospace; font-size: 10px; color: #908C86; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 24px;">// SOLO_COMPITI_ASSEGNATI</p>
                    <div style="border:1px solid #E0DDD8; border-radius:14px; background:#F6F5F3; padding:14px; font-size:14px; color:#141414; line-height:1.45;">
                        Per mantenere l'agenda pulita usiamo solo i compiti assegnati dal registro.
                        <br><br>
                        Se avevi task manuali/AI, sono stati rimossi automaticamente.
                    </div>
                    <button id="submit-quick-task-btn" onclick="submitQuickTask()" style="width: 100%; margin-top: 24px; padding: 16px; border-radius: 16px; border: none; background: #141414; color: #FFF; font-family:'JetBrains Mono', monospace; font-size: 13px; font-weight: 800; text-transform: uppercase; cursor: pointer; box-shadow: 0 4px 16px rgba(0,0,0,0.1); transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);">
                        <i class="ph-bold ph-check-circle" style="margin-right: 8px;"></i> Ho capito
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
    if (_lastRenderedLoggedIn === true &&
        _lastRenderedView === state.view &&
        _lastRenderedTaskCount === taskCount &&
        _lastRenderedVotiCount === votiCount &&
        !state._forceRender) {
        return;
    }
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
    const urgent = list.slice(0, 2);
    const recent = list.slice(2, 6);

    return `
    <div class="view circulars-view pb-32">
        <header class="mb-8 pt-4">
            <h1 class="headline-lg text-primary mb-1">In Evidenza</h1>
            <p class="body-md text-on-surface-variant/60">Important updates</p>
        </header>

        <!-- Urgent Circulars (Horizontal Scroll) -->
        <section class="mb-10">
            <div class="flex overflow-x-auto no-scrollbar gap-4 py-2">
                ${urgent.length ? urgent.map(c => `
                    <div class="flex-none w-[280px] liquid-glass rounded-[32px] p-6 liquid-shadow relative overflow-hidden group cursor-pointer" onclick="mostraCircolare('${escapeJsSingleQuote(c.id)}')">
                        <div class="flex justify-between items-start mb-4">
                            <span class="text-primary text-[10px] font-bold uppercase tracking-wider">Urgent</span>
                            <div class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                <span class="material-symbols-outlined text-[18px]">campaign</span>
                            </div>
                        </div>
                        <h3 class="title-md text-on-surface line-clamp-2 mb-4 h-14">${c.titolo}</h3>
                        <p class="body-md text-on-surface-variant/40 line-clamp-2 mb-6 text-[13px]">Please review the updated examination timetable ...</p>
                        <div class="flex justify-between items-center mt-auto">
                            <span class="text-on-surface-variant/40 text-[11px] font-medium">${c.data}</span>
                            <div class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
                            </div>
                        </div>
                        <!-- Glow effect -->
                        <div class="absolute -top-10 -right-10 w-32 h-32 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-colors"></div>
                    </div>
                `).join('') : `
                    <div class="flex-none w-full liquid-glass rounded-[32px] p-12 text-center text-on-surface-variant/40">
                        Nessun avviso in evidenza.
                    </div>
                `}
            </div>
        </section>

        <section>
            <div class="flex justify-between items-center mb-6">
                <h2 class="title-md">Recent Circulars</h2>
                <button class="text-primary font-bold text-[13px]">View All</button>
            </div>

            <div class="flex flex-col gap-3">
                ${recent.length ? recent.map(c => `
                    <div class="liquid-glass rounded-[24px] p-5 liquid-shadow flex justify-between items-center group cursor-pointer transition-all hover:translate-x-1" onclick="mostraCircolare('${escapeJsSingleQuote(c.id)}')">
                        <div class="flex-1 min-width-0 pr-4">
                            <h3 class="font-bold text-[15px] text-on-surface truncate mb-1">${c.titolo}</h3>
                            <p class="text-on-surface-variant/40 text-[12px] font-medium">New healthy options added to the daily rotat...</p>
                        </div>
                        <div class="text-right shrink-0">
                            <p class="text-on-surface-variant/40 text-[11px] font-bold">${c.data}</p>
                        </div>
                    </div>
                `).join('') : `
                    <div class="liquid-glass rounded-[24px] p-8 text-center text-on-surface-variant/40">
                        Nessuna circolare recente.
                    </div>
                `}
            </div>
        </section>
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

function renderPlanner() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = getLocalDateString(today);

    // Week Scroller Data
    const weekDays = [];
    const dayLabels = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
    const startOfWeek = new Date(today);
    const day = today.getDay();
    const diff = today.getDate() - day; // Sunday is 0
    startOfWeek.setDate(diff);

    for (let i = 0; i < 7; i++) {
        const d = new Date(startOfWeek);
        d.setDate(startOfWeek.getDate() + i);
        const iso = getLocalDateString(d);
        weekDays.push({
            label: dayLabels[d.getDay()],
            dayNum: d.getDate(),
            iso: iso,
            isToday: iso === todayISO
        });
    }

    // Tasks for the smart timeline (using today as default if none selected)
    const selectedDate = state.selectedDate || todayISO;
    const dayTasks = (state.tasks || []).filter(t => t.due_date === selectedDate);

    return `
    <div class="view planner-view pb-32">
        <header class="flex justify-between items-center mb-6 pt-4">
            <h1 class="text-primary font-bold text-xl">Agenda</h1>
            <button class="text-primary font-bold text-[12px] uppercase tracking-widest hover:opacity-80 transition-opacity" onclick="state.selectedDate='${todayISO}'; scheduleRender(0);">Oggi</button>
        </header>

        <!-- Week Scroller -->
        <section class="mb-8">
            <div class="flex overflow-x-auto no-scrollbar gap-3 py-2">
                ${weekDays.map(d => `
                    <div class="flex-none w-14 h-20 flex flex-col items-center justify-center rounded-2xl cursor-pointer transition-all duration-300 ${d.iso === selectedDate ? 'bg-primary text-on-primary active-liquid-shadow scale-105' : 'liquid-glass liquid-shadow hover:translate-y-[-2px]'}"
                         onclick="state.selectedDate='${d.iso}'; scheduleRender(0);">
                        <span class="text-[10px] uppercase mb-1 font-bold ${d.iso === selectedDate ? 'opacity-80' : 'text-on-surface-variant/60'}">${d.label}</span>
                        <span class="text-[18px] font-bold">${d.dayNum}</span>
                        ${d.isToday && d.iso !== selectedDate ? '<div class="h-1 w-1 bg-primary rounded-full mt-1"></div>' : ''}
                        ${d.iso === selectedDate ? '<div class="h-1 w-1 bg-white rounded-full mt-1"></div>' : ''}
                    </div>
                `).join('')}
            </div>
        </section>

        <!-- Smart Agenda Timeline -->
        <section class="flex flex-col gap-6">
            ${dayTasks.length ? dayTasks.map(t => {
                const isExam = t.isExam || /verifica|interrogazione|test|esame/i.test(t.text);
                const colorClass = isExam ? 'error' : 'primary';
                const timeMatch = (t.text || '').match(/(\d{1,2}:\d{2})/);
                const timeStr = timeMatch ? timeMatch[1] : '08:30';

                return `
                <div class="flex gap-4">
                    <div class="w-12 flex flex-col items-end pt-3 shrink-0">
                        <span class="text-[12px] text-on-surface-variant font-bold">${timeStr}</span>
                        <span class="text-[10px] text-on-surface-variant/40 mt-0.5">09:30</span>
                    </div>
                    <div class="flex-1 liquid-glass rounded-[28px] p-5 relative group hover:shadow-xl transition-all duration-300 liquid-shadow overflow-visible ${isExam ? 'bg-error-container/5 border-error/10' : ''}">
                        <div class="absolute left-0 top-4 bottom-4 w-1 bg-${colorClass} rounded-full"></div>
                        <div class="flex justify-between items-start mb-2">
                            <div class="flex flex-col pl-3">
                                <span class="text-[10px] text-${colorClass} uppercase tracking-wider font-bold mb-0.5 flex items-center gap-1">
                                    ${isExam ? '<span class="material-symbols-outlined text-[12px]">warning</span> SIMULAZIONE' : 'LEZIONE'}
                                </span>
                                <h3 class="title-md text-on-surface">${t.subject}</h3>
                            </div>
                            <div class="w-10 h-10 rounded-2xl bg-${colorClass}/10 flex items-center justify-center text-${colorClass} border border-white/40 shadow-sm shrink-0">
                                <span class="material-symbols-outlined text-[22px]">${getSubjectIcon(t.subject)}</span>
                            </div>
                        </div>
                        <p class="body-md text-on-surface-variant/70 mb-3 pl-3">${t.text}</p>
                        <div class="flex items-center gap-2 pl-3">
                            <span class="material-symbols-outlined text-[16px] text-${colorClass}/60">location_on</span>
                            <span class="body-md text-[13px] text-on-surface-variant">Aula 3B</span>
                        </div>
                        ${!t.done && !isExam ? `
                            <button class="w-full liquid-pill py-3 px-4 mt-4 flex items-center justify-center gap-2 hover:bg-white/80 transition-all text-primary font-bold text-[14px]" onclick="toggleTask('${t.id}')">
                                <span class="material-symbols-outlined text-[20px]">check_circle</span>
                                <span>Segna completato</span>
                            </button>
                        ` : t.done ? `
                             <div class="w-full py-3 px-4 mt-4 flex items-center justify-center gap-2 text-green font-bold text-[14px]">
                                <span class="material-symbols-outlined text-[20px]">task_alt</span>
                                <span>Completato</span>
                            </div>
                        ` : ''}
                    </div>
                </div>`;
            }).join('') : `
                <div class="liquid-glass rounded-[40px] p-12 text-center flex flex-col items-center gap-4">
                    <span class="material-symbols-outlined text-[48px] text-on-surface-variant/20">event_busy</span>
                    <p class="body-lg text-on-surface-variant/40 font-medium">Nessuna attività programmata</p>
                </div>
            `}
        </section>
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

function renderProfile() {
    const isGoogleConnected = state.googleConnected || localStorage.getItem('gc_google_connected_cache') === '1';
    
    // Funzioni helper integrate direttamente per il toggle della UI
    window.toggleConnectionLocal = function(type) {
        if(type === 'didup') {
            showToast('Il sync DidUP viene gestito in automatico dal background.', 'info');
            return;
        }
        if(type === 'calendar') {
            isGoogleConnected ? window.syncGoogleCalendar() : window.connectGoogle();
        }
    };

    return `
    <div class="view profile-view pb-32 pt-6 px-4">
        
        <header class="flex items-center gap-4 mb-8">
            <button onclick="navigate('home')" class="w-12 h-12 rounded-2xl liquid-glass flex items-center justify-center text-slate-800 cursor-pointer hover:scale-105 transition-all shadow-sm">
                <span class="material-symbols-outlined">arrow_back</span>
            </button>
            <div>
                <h1 class="text-2xl font-bold text-slate-800">Profilo</h1>
                <p class="text-sm text-slate-500 font-medium">Gestione account e impostazioni</p>
            </div>
        </header>

        <div class="w-full bg-slate-50/20 rounded-[48px] p-6 shadow-xl relative overflow-hidden border border-white/50 flex flex-col gap-8 mx-auto" style="max-width: 420px;">
            
            <div class="absolute w-72 h-72 bg-blue-300/10 rounded-full blur-3xl -top-20 -left-10 -z-10"></div>
            <div class="absolute w-72 h-72 bg-red-200/10 rounded-full blur-3xl -bottom-20 -right-10 -z-10"></div>

            <div class="flex flex-col items-center text-center">
                <div class="w-20 h-20 rounded-full bg-slate-800/10 flex items-center justify-center text-slate-800 text-3xl font-bold mb-3 border border-white/60 shadow-sm">
                    ${(state.user.name || 'A')[0].toUpperCase()}
                </div>
                <h2 class="text-xl font-bold text-slate-800">${escapeHtml(state.user.name || 'Andrea')}</h2>
                <div class="mt-2 bg-slate-800/10 text-slate-800 px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-widest border border-white/40">
                    CLASSE ${escapeHtml((normalizeClassUi(state.user.class) || '4D') + (state.user.specialization ? ' ' + state.user.specialization : ''))}
                </div>
            </div>

            <div class="flex flex-col gap-4">
                <h3 class="text-[12px] font-extrabold text-slate-400 tracking-[0.1em] px-1 uppercase">Connessioni</h3>
                
                <div class="grid grid-cols-2 gap-4">
                    <div onclick="toggleConnectionLocal('didup')" class="liquid-glass rounded-[32px] p-5 flex flex-col items-center text-center gap-3 cursor-pointer transition-all duration-300 hover:scale-[1.02] active:scale-95">
                        <div class="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-500">
                            <span class="material-symbols-outlined text-[24px] font-light">power</span>
                        </div>
                        <div class="flex flex-col gap-0.5">
                            <span class="text-[11px] font-bold text-slate-400 tracking-wider">DIDUP</span>
                            <span class="text-[13px] font-extrabold text-[#10b981] tracking-wide">COLLEGATO</span>
                        </div>
                    </div>

                    <div onclick="toggleConnectionLocal('calendar')" class="liquid-glass rounded-[32px] p-5 flex flex-col items-center text-center gap-3 cursor-pointer transition-all duration-300 hover:scale-[1.02] active:scale-95">
                        <div class="w-12 h-12 rounded-2xl ${isGoogleConnected ? 'bg-emerald-50 text-emerald-500' : 'bg-red-50 text-red-500'} flex items-center justify-center transition-colors duration-300">
                            <span class="material-symbols-outlined text-[24px] font-light">calendar_today</span>
                        </div>
                        <div class="flex flex-col gap-0.5">
                            <span class="text-[11px] font-bold text-slate-400 tracking-wider">CALENDAR</span>
                            <span class="text-[13px] font-extrabold ${isGoogleConnected ? 'text-[#10b981]' : 'text-red-500'} tracking-wide">${isGoogleConnected ? 'COLLEGATO' : 'DISCONNESSO'}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="flex flex-col gap-4">
                <h3 class="text-[12px] font-extrabold text-slate-400 tracking-[0.1em] px-1 uppercase">Impostazioni Account</h3>
                
                <div class="liquid-glass rounded-[32px] overflow-hidden flex flex-col p-1.5 gap-0.5">
                    <div class="interactive-row flex items-center justify-between p-4 px-5 rounded-[26px] cursor-pointer hover:bg-white/30" onclick="showEditProfileModal()">
                        <span class="text-[15px] font-semibold text-slate-800">Modifica Profilo</span>
                        <span class="material-symbols-outlined text-slate-400 text-[18px]">chevron_right</span>
                    </div>
                    
                    <div class="h-[1px] bg-slate-200/40 mx-4"></div>

                    <div class="interactive-row flex items-center justify-between p-4 px-5 rounded-[26px] cursor-pointer hover:bg-white/30" onclick="performArgoSync()">
                        <span class="text-[15px] font-semibold text-slate-800">Forza Sync DidUp</span>
                        <span class="material-symbols-outlined text-slate-400 text-[18px]">sync</span>
                    </div>
                </div>
            </div>

            <button onclick="mostraConfermaEsciUI()" class="mt-2 w-full h-14 rounded-full border border-red-200/60 bg-red-500/[0.04] backdrop-blur-md flex items-center justify-center gap-2 text-red-600 font-bold text-base transition-all duration-200 hover:bg-red-500/[0.08] active:scale-[0.97]">
                <span class="material-symbols-outlined text-[20px]">logout</span>
                <span>Esci dall'Account</span>
            </button>
        </div>

        <div id="logout-modal" class="fixed inset-0 bg-slate-900/20 backdrop-blur-md flex items-center justify-center p-6 opacity-0 pointer-events-none transition-all duration-300 z-[9999]">
            <div class="liquid-glass rounded-[36px] p-8 max-w-[340px] w-full text-center flex flex-col gap-6 scale-90 transition-transform duration-300" id="modal-box">
                <div class="w-12 h-12 rounded-full bg-red-500/10 text-red-600 flex items-center justify-center mx-auto">
                    <span class="material-symbols-outlined text-[24px]">logout</span>
                </div>
                <div>
                    <h4 class="text-lg font-bold text-slate-800">Sei sicuro di voler uscire?</h4>
                    <p class="text-sm text-slate-500 mt-2">Dovrai inserire nuovamente le tue credenziali al prossimo accesso.</p>
                </div>
                <div class="flex gap-3 mt-2">
                    <button onclick="nascondiConfermaEsciUI()" class="flex-1 py-3 rounded-full bg-white/50 border border-white/60 text-slate-600 font-semibold text-sm hover:bg-white/80 transition-colors">Annulla</button>
                    <button onclick="nascondiConfermaEsciUI(); logout();" class="flex-1 py-3 rounded-full bg-red-600 text-white font-semibold text-sm hover:bg-red-700 transition-colors shadow-lg shadow-red-600/20">Esci</button>
                </div>
            </div>
        </div>
    </div>
    
    <script>
        window.mostraConfermaEsciUI = function() {
            const modal = document.getElementById('logout-modal');
            const box = document.getElementById('modal-box');
            if(modal && box) {
                modal.classList.remove('opacity-0', 'pointer-events-none');
                box.classList.remove('scale-90');
            }
        }
        window.nascondiConfermaEsciUI = function() {
            const modal = document.getElementById('logout-modal');
            const box = document.getElementById('modal-box');
            if(modal && box) {
                modal.classList.add('opacity-0', 'pointer-events-none');
                box.classList.add('scale-90');
            }
        }
    </script>
    `;
}

function renderGradesView() {
    if (state.activeSubject) return renderSubjectDetailView(state.activeSubject);

    const votiData = getVotiData();
    const numericVotes = votiData.map(getNumericGradeValue).filter(v => Number.isFinite(v));
    const media = averageFromNumeric(numericVotes) || 0;

    const subjectsMap = {};
    votiData.forEach(v => {
        const sub = v.materia || v.subject || 'Altro';
        const subjectKey = getSubjectGroupKey(sub);
        if (!subjectsMap[subjectKey]) subjectsMap[subjectKey] = { name: sub, list: [] };
        subjectsMap[subjectKey].list.push(v);
    });

    const subjects = Object.values(subjectsMap).map(({ name, list }) => {
        const subMedia = averageFromNumeric(list.map(getNumericGradeValue).filter(v => Number.isFinite(v))) || 0;
        const lastVote = list.sort((a, b) => (b.data || b.date || '').localeCompare(a.data || a.date || ''))[0];
        const lastVal = getNumericGradeValue(lastVote);
        return { name, media: subMedia, lastVote: lastVal };
    }).sort((a, b) => b.media - a.media);

    return `
    <div class="view grades-view pb-32">
        <header class="flex justify-between items-center mb-6 pt-4">
            <h1 class="text-primary font-bold text-xl">Voti & Rendimento</h1>
        </header>

        <!-- Main Media Card -->
        <section class="liquid-glass rounded-[40px] p-8 mb-10 relative overflow-hidden">
            <h2 class="body-md text-on-surface-variant/60 mb-2">Media Generale</h2>
            <div class="flex items-center gap-4 mb-4">
                <span class="text-[56px] font-bold text-primary leading-none">${media.toFixed(1)}</span>
                <span class="bg-green/10 text-green px-3 py-1 rounded-full font-bold text-[12px] flex items-center gap-1">
                    <span class="material-symbols-outlined text-[14px]">trending_up</span> +0.2
                </span>
            </div>
            <p class="text-on-surface-variant/40 text-[11px] mb-8">Ultimo aggiornamento: Oggi</p>

            <!-- Media Graph Placeholder -->
            <div class="flex items-end gap-2 h-24">
                <div class="flex-1 bg-primary/5 rounded-t-lg h-[20%]"></div>
                <div class="flex-1 bg-primary/10 rounded-t-lg h-[40%]"></div>
                <div class="flex-1 bg-primary/20 rounded-t-lg h-[30%]"></div>
                <div class="flex-1 bg-primary/30 rounded-t-lg h-[60%]"></div>
                <div class="flex-1 bg-primary/40 rounded-t-lg h-[50%]"></div>
                <div class="flex-1 bg-primary/50 rounded-t-lg h-[70%]"></div>
                <div class="flex-1 bg-primary rounded-t-lg h-[90%] relative">
                    <div class="absolute -top-6 left-1/2 -translate-x-1/2 text-on-surface-variant/60 text-[9px] font-bold">Feb</div>
                </div>
            </div>
        </section>

        <h2 class="title-md mb-6">Materie</h2>

        <!-- Subjects Grid -->
        <div class="flex flex-col gap-4">
            ${subjects.map(s => {
                const status = s.media >= 8 ? 'Ottimo' : s.media >= 7 ? 'Buono' : s.media >= 6 ? 'Discreto' : 'Insufficiente';
                const statusColor = s.media >= 8 ? 'green' : s.media >= 7 ? 'primary' : s.media >= 6 ? 'orange' : 'error';

                return `
                <div class="liquid-glass rounded-[28px] p-6 liquid-shadow cursor-pointer transition-all hover:scale-[1.02]" onclick="navigateSubject('${escapeJsSingleQuote(s.name)}')">
                    <div class="flex justify-between items-start mb-4">
                        <div class="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                            <span class="material-symbols-outlined">${getSubjectIcon(s.name)}</span>
                        </div>
                        <span class="bg-${statusColor}/10 text-${statusColor} px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">${status}</span>
                    </div>
                    <h3 class="title-md text-on-surface mb-1">${s.name}</h3>
                    <div class="flex justify-between items-baseline">
                        <span class="text-[32px] font-bold text-primary">${s.media.toFixed(1)}</span>
                        <div class="flex items-center gap-1.5">
                            <span class="text-on-surface-variant/40 text-[12px] font-medium">Ultimo: ${s.lastVote || '—'}</span>
                            ${s.lastVote ? `<span class="material-symbols-outlined text-[14px] ${s.lastVote >= s.media ? 'text-green' : 'text-error'}">${s.lastVote >= s.media ? 'trending_up' : 'trending_down'}</span>` : ''}
                        </div>
                    </div>
                </div>`;
            }).join('')}
        </div>
    </div>`;
}

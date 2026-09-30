/* Shared lifecycle for asynchronous client operations. No credentials are persisted here. */
(function () {
    let generation = 0;
    const pending = new Set();
    window.ClientRuntime = {
        capture() {
            const userId = window.getUserId?.();
            const stateId = window.state?.user?.id;
            const epoch = generation;
            return () => epoch === generation && userId === window.getUserId?.() &&
                stateId === window.state?.user?.id && !window.state?._loggedOut;
        },
        invalidate() {
            generation++;
            for (const controller of pending) controller.abort();
            pending.clear();
        }
    };
    window.fetchWithDeadline = async function (url, options = {}, timeoutMs = undefined) {
        const endpoint = new URL(url, window.location.href);
        const slow = ['/sync','/login','/api/resolve-profile'].includes(endpoint.pathname) ||
            (endpoint.pathname === '/api/auth' && ['sync','login','refresh-session','resolve-profile'].includes(endpoint.searchParams.get('action'))) ||
            (endpoint.pathname === '/api/google' && endpoint.searchParams.get('action') === 'sync') || endpoint.pathname.endsWith('/sintesi');
        timeoutMs ??= slow ? 125000 : 20000;
        const controller = new AbortController();
        let timer;
        const cleanup = () => {
            clearTimeout(timer);
            pending.delete(controller);
            options.signal?.removeEventListener('abort', abort);
        };
        const abort = () => { controller.abort(); cleanup(); };
        pending.add(controller);
        timer = setTimeout(abort, timeoutMs);
        options.signal?.addEventListener('abort', abort, { once: true });
        if (options.signal?.aborted) abort();
        try {
            const response = await fetch(url, { ...options, signal: controller.signal });
            // Keep the deadline active until the body is consumed, not just until headers arrive.
            return new Proxy(response, {get(target, property) {
                const value = Reflect.get(target, property, target);
                if (['json','text','arrayBuffer','blob','formData'].includes(property) && typeof value === 'function') {
                    return async (...args) => { try { return await value.apply(target,args); } finally { cleanup(); } };
                }
                return typeof value === 'function' ? value.bind(target) : value;
            }});
        } catch (error) {
            cleanup();
            throw error;
        }
    };
})();

// Secondary views and dialogs are loaded once, on demand. Failures remain retryable.
(function () {
    const loads = new Map();
    window.loadFrontendFeature = function (name) {
        if (!['views','modals'].includes(name)) return Promise.reject(new Error('Funzione sconosciuta'));
        if (!loads.has(name)) {
            const pending = new Promise((resolve,reject) => {
                const script = document.createElement('script');
                script.src = `assets/ui-${name}.js?v=4.2.0`;
                script.onload = resolve;
                script.onerror = () => { script.remove(); reject(new Error('Schermata non disponibile. Riprova quando sei online.')); };
                document.head.appendChild(script);
            }).catch(error => { loads.delete(name); window.showToast?.(error.message,'error'); throw error; });
            loads.set(name,pending);
        }
        return loads.get(name);
    };
})();

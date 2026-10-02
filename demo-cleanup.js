/* Only explicit demo IDs are disposable; real data must never be matched by content/counts. */
(function () {
    const isDemo = item => /^(v26-|task-demo-|verif-demo-|act-demo-|ass-demo-|rit-demo-|usc-demo-|nota-demo-|demo_)/.test(String(item?.id || ''));
    window.purgeAllDemoData = function (target) {
        for (const field of ['voti','tasks','verifiche','manualVerifiche','classActivities']) {
            if (Array.isArray(target?.[field])) target[field] = target[field].filter(item => !isDemo(item));
        }
        const absences = target?.assenzeData;
        if (absences && ['assenze','ritardi','uscite','note'].some(field => absences[field]?.some(isDemo))) target.assenzeData = null;
    };
    for (const key of Object.keys(localStorage)) {
        try {
            if (/(^|:)(voti|tasks|verifiche|class_activities|manual_verifiche)$/.test(key)) {
                const items = JSON.parse(localStorage.getItem(key));
                if (Array.isArray(items) && items.some(isDemo)) localStorage.setItem(key, JSON.stringify(items.filter(item => !isDemo(item))));
            }
        } catch (_) {}
    }
})();

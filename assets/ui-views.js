function renderAcademicProfile(){loadAcademicPreferences();const subjects=[...new Set(getVotiData().map(v=>v.materia||v.subject))];return`
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
                        <h2 class="title-md">Disponibilit\xE0 Studio</h2>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="flex flex-col gap-2">
                            <label class="label-sm text-on-surface-variant/40">Inizio</label>
                            <input type="time" id="studyStart" value="${escapeHtml(state.availability.start)}" onchange="saveAvailability()"
                                class="bg-surface-container-low border border-white/40 rounded-2xl h-14 px-4 font-bold text-on-surface">
                       </div>
                        <div class="flex flex-col gap-2">
                            <label class="label-sm text-on-surface-variant/40">Fine</label>
                            <input type="time" id="studyEnd" value="${escapeHtml(state.availability.end)}" onchange="saveAvailability()"
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
                    <p class="body-md text-on-surface-variant/60 mb-6">Seleziona le materie in cui hai pi\xF9 difficolt\xE0.</p>
                    <div class="flex flex-wrap gap-2">
                        ${subjects.length>0?subjects.map(s=>{const active=state.difficulty.includes(s);return`
            <button onclick="toggleDifficulty('${escapeJsSingleQuote(s)}')" class="liquid-pill px-5 py-3 text-[13px] font-bold transition-all border ${active?"bg-primary text-on-primary border-primary shadow-lg":"bg-white/40 text-on-surface border-white/60"}">
                ${escapeHtml(s)}
            </button>`}).join(""):'<div class="body-md text-on-surface-variant/40 p-4">Nessuna materia trovata.</div>'}
                   </div>
               </section>
           </div>`}function renderProfile(){const isGoogleConnected=!!(state.googleConnected||localStorage.getItem(lsKey("google_connected_cache"))==="1"),rawName=typeof getSafeUserName=="function"?getSafeUserName():state.user?.name||"Utente",userName=escapeHtml(typeof toDisplayName=="function"?toDisplayName(rawName):rawName),effClass=typeof getEffectiveUserClass=="function"?getEffectiveUserClass():"",userClass=escapeHtml(effClass||(typeof normalizeClassUi=="function"?normalizeClassUi(state.user?.class||"",state.user?.specialization||""):state.user?.class||"")||"Studente"),initials=(rawName||"U").trim().split(" ").map(function(w){return w[0]}).slice(0,2).join("").toUpperCase()||"U",isRep=typeof isCurrentUserRepresentative=="function"?isCurrentUserRepresentative():!1,lastSyncTs=typeof getPersistedLastSyncAt=="function"?getPersistedLastSyncAt():state.didup?.lastSuccessTs||null;let lastSyncLabel="Recentemente";if(lastSyncTs){const syncD=new Date(lastSyncTs);if(!isNaN(syncD.getTime())){const isToday=syncD.toDateString()===new Date().toDateString(),timeStr=syncD.toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"});lastSyncLabel=isToday?`Oggi, ${timeStr}`:`${syncD.getDate()}/${syncD.getMonth()+1}, ${timeStr}`}}return`
    <div class="view-fullbleed profile-view hide-scrollbar"
         style="padding:0 20px 140px 20px;min-height:100vh;height:100dvh;overflow-y:scroll;-webkit-overflow-scrolling:touch;background:var(--background, #0b1326);font-family:'Inter',sans-serif;color:#dae2fd;">

        <!-- \u2500\u2500 AMBIENT GLOW SPHERES (Classic Blue) \u2500\u2500 -->
        <div style="position:fixed;top:0;right:0;width:320px;height:320px;background:radial-gradient(circle,rgba(37,99,235,0.14) 0%,transparent 70%);filter:blur(60px);pointer-events:none;z-index:0;"></div>
        <div style="position:fixed;bottom:100px;left:0;width:280px;height:280px;background:radial-gradient(circle,rgba(41,151,255,0.1) 0%,transparent 70%);filter:blur(50px);pointer-events:none;z-index:0;"></div>

        <div style="position:relative;z-index:1;max-width:540px;margin:0 auto;">

            <!-- \u2500\u2500 HEADER (iOS HIG) \u2500\u2500 -->
            <header class="ios-header-wrapper" style="display:flex;align-items:center;justify-content:space-between;padding:max(env(safe-area-inset-top,0px),24px) 0 20px 0;">
                <div style="display:flex;align-items:center;gap:14px;">
                    <button onclick="if(typeof window.triggerHaptic==='function')window.triggerHaptic('light');navigate('home')"
                        style="width:40px;height:40px;border-radius:14px;
                               background:rgba(23,31,51,0.85);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
                               border:1px solid rgba(182,196,255,0.16);border-top:1px solid rgba(255,255,255,0.25);
                               display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;color:#b6c4ff;
                               box-shadow:0 4px 16px rgba(0,0,0,0.3);transition:transform 0.15s ease;"
                        ontouchstart="this.style.transform='scale(0.92)'"
                        ontouchend="this.style.transform='scale(1)'"
                        aria-label="Torna alla Home">
                        <i class="ph-bold ph-arrow-left" style="font-size:18px;"></i>
                    </button>
                    <div>
                        <div class="ios-sub-title" style="color:#b6c4ff;font-weight:800;letter-spacing:0.08em;font-size:11px;">ACCOUNT & SISTEMA</div>
                        <h1 class="ios-large-title" style="color:#dae2fd;font-weight:800;font-size:32px;letter-spacing:-0.03em;margin:2px 0 0;">Profilo</h1>
                    </div>
                </div>
                <button onclick="if(typeof window.triggerHaptic==='function')window.triggerHaptic('medium');if(typeof showToast==='function')showToast('Sincronizzazione DidUP in corso...','info');if(typeof runAutomaticSyncCycle==='function')runAutomaticSyncCycle('manual',{force:true});"
                    style="width:40px;height:40px;border-radius:14px;
                           background:rgba(23,31,51,0.85);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
                           border:1px solid rgba(182,196,255,0.16);border-top:1px solid rgba(255,255,255,0.25);
                           display:flex;align-items:center;justify-content:center;cursor:pointer;color:#b6c4ff;
                           box-shadow:0 4px 16px rgba(0,0,0,0.3);transition:transform 0.15s ease;"
                    ontouchstart="this.style.transform='scale(0.92)'"
                    ontouchend="this.style.transform='scale(1)'"
                    aria-label="Sincronizza">
                    <i class="ph-bold ph-arrows-clockwise" style="font-size:18px;"></i>
                </button>
            </header>

            <!-- \u2500\u2500 HERO USER CARD (Clean Liquid Glass with Solid Blue Avatar) \u2500\u2500 -->
            <div style="
                background:linear-gradient(135deg, rgba(37,99,235,0.22) 0%, rgba(20,29,51,0.92) 100%);
                backdrop-filter:blur(36px) saturate(190%);-webkit-backdrop-filter:blur(36px) saturate(190%);
                border:1px solid rgba(182,196,255,0.18);border-top:1px solid rgba(255,255,255,0.35);
                border-radius:28px;padding:22px 20px;margin-bottom:20px;
                box-shadow:0 16px 40px -10px rgba(6,14,32,0.75), inset 0 1px 0 rgba(255,255,255,0.18);
                position:relative;overflow:hidden;
            ">
                <!-- Ambient Blue Glow -->
                <div style="position:absolute;top:0;right:0;width:140px;height:140px;background:radial-gradient(circle,rgba(37,99,235,0.25) 0%,transparent 70%);filter:blur(24px);pointer-events:none;"></div>

                <div style="display:flex;align-items:center;gap:16px;">
                    <!-- Classic Blue Avatar -->
                    <div style="
                        width:60px;height:60px;border-radius:18px;
                        background:linear-gradient(135deg, #1d4ed8 0%, #2563eb 60%, #3b82f6 100%);
                        display:flex;align-items:center;justify-content:center;flex-shrink:0;
                        box-shadow:0 8px 24px -4px rgba(37,99,235,0.5), inset 0 1px 1px rgba(255,255,255,0.35);
                        border:1px solid rgba(255,255,255,0.22);
                    ">
                        <span style="font-size:24px;font-weight:900;color:#ffffff;letter-spacing:-0.02em;">${initials}</span>
                    </div>

                    <div style="min-width:0;flex:1;">
                        <h2 style="font-size:20px;font-weight:800;color:#ffffff;margin:0 0 4px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:-0.02em;">
                            ${userName}
                        </h2>
                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                            <span style="font-size:11.5px;font-weight:700;color:#b6c4ff;background:rgba(37,99,235,0.22);border:0.5px solid rgba(182,196,255,0.25);padding:2px 8px;border-radius:8px;">
                                ${userClass}
                            </span>
                            <div style="display:inline-flex;align-items:center;gap:5px;background:rgba(48,209,88,0.14);border:0.5px solid rgba(48,209,88,0.3);padding:2px 8px;border-radius:999px;">
                                <span style="width:6px;height:6px;border-radius:50%;background:#30d158;box-shadow:0 0 8px #30d158;display:inline-block;"></span>
                                <span style="font-size:10.5px;font-weight:800;color:#30d158;letter-spacing:0.02em;">DidUP Sincronizzato</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- \u2500\u2500 SEZIONE: RUOLO DI CLASSE (Rappresentante) \u2500\u2500 -->
            <div style="margin-bottom:20px;">
                <p style="font-size:11px;font-weight:800;color:#8e909f;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 10px 4px;display:flex;align-items:center;gap:6px;">
                    <i class="ph-fill ph-users-three" style="color:#2997ff;"></i> RUOLO DI CLASSE
                </p>
                <div style="
                    background:rgba(23,31,51,0.85);backdrop-filter:blur(30px);-webkit-backdrop-filter:blur(30px);
                    border:1px solid rgba(182,196,255,0.14);border-top:1px solid rgba(255,255,255,0.25);
                    border-radius:26px;padding:18px 20px;
                    box-shadow:0 12px 32px -8px rgba(6,14,32,0.6);
                ">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;">
                        <div style="display:flex;align-items:center;gap:14px;min-width:0;flex:1;">
                            <div style="
                                width:46px;height:46px;border-radius:15px;
                                background:${isRep?"rgba(48,209,88,0.16)":"rgba(41,151,255,0.14)"};
                                border:1px solid ${isRep?"rgba(48,209,88,0.35)":"rgba(41,151,255,0.25)"};
                                display:flex;align-items:center;justify-content:center;flex-shrink:0;
                                color:${isRep?"#30d158":"#2997ff"};
                                box-shadow:0 0 14px ${isRep?"rgba(48,209,88,0.25)":"rgba(41,151,255,0.2)"};
                            ">
                                <i class="ph-fill ph-identification-badge" style="font-size:24px;"></i>
                            </div>
                            <div style="min-width:0;">
                                <div style="font-size:16px;font-weight:800;color:#ffffff;line-height:1.2;">
                                    Rappresentante di Classe
                                </div>
                                <div style="font-size:12px;font-weight:600;color:${isRep?"#30d158":"#8e909f"};margin-top:3px;">
                                    ${isRep?`Attivo \xB7 Classe ${escapeHtml(effClass)}`:`Non attivo \xB7 Classe: ${escapeHtml(effClass||"Non impostata")}`}
                                </div>
                            </div>
                        </div>

                        <!-- Apple HIG Native Smooth Switch -->
                        <label style="position:relative;display:inline-flex;align-items:center;justify-content:center;min-width:54px;min-height:44px;cursor:pointer;-webkit-tap-highlight-color:transparent;">
                            <input type="checkbox" ${isRep?"checked":""} onchange="window.toggleClassRepresentative(this.checked)" style="opacity:0;width:0;height:0;position:absolute;" />
                            <span style="position:relative;display:inline-block;width:51px;height:31px;background:${isRep?"#30d158":"rgba(120,120,128,0.32)"};border-radius:34px;transition:all 0.25s cubic-bezier(0.16,1,0.3,1);box-shadow:${isRep?"0 0 12px rgba(48,209,88,0.4)":"none"};">
                                <span style="position:absolute;content:'';height:27px;width:27px;left:2px;bottom:2px;background:#ffffff;border-radius:50%;transition:transform 0.25s cubic-bezier(0.16,1,0.3,1);box-shadow:0 3px 8px rgba(0,0,0,0.3);transform:${isRep?"translateX(20px)":"translateX(0)"};"></span>
                            </span>
                        </label>
                    </div>

                    <div style="margin-top:14px;padding-top:14px;border-top:0.5px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:space-between;">
                        <span style="font-size:12px;color:#8e909f;font-weight:500;">
                            ${effClass?`Classe attiva: <strong style="color:#b6c4ff;">${escapeHtml(effClass)}</strong>`:"Classe non definita"}
                        </span>
                    </div>
                </div>
            </div>

            ${window.PushSettings?window.PushSettings.render():""}

            <!-- \u2500\u2500 SEZIONE: GOOGLE CALENDAR CLOUD \u2500\u2500 -->
            <div style="margin-bottom:20px;">
                <p style="font-size:11px;font-weight:800;color:#8e909f;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 10px 4px;display:flex;align-items:center;gap:6px;">
                    <i class="ph-fill ph-calendar-check" style="color:#30d158;"></i> GOOGLE CALENDAR SYNC
                </p>
                <div style="
                    background:rgba(23,31,51,0.85);backdrop-filter:blur(30px);-webkit-backdrop-filter:blur(30px);
                    border:1px solid rgba(182,196,255,0.14);border-top:1px solid rgba(255,255,255,0.25);
                    border-radius:26px;overflow:hidden;
                    box-shadow:0 12px 32px -8px rgba(6,14,32,0.6);
                ">
                    ${isGoogleConnected?`
                    <div style="padding:20px;">
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;">
                            <div style="display:flex;align-items:center;gap:12px;">
                                <div style="width:44px;height:44px;border-radius:14px;background:rgba(48,209,88,0.16);border:1px solid rgba(48,209,88,0.35);display:flex;align-items:center;justify-content:center;color:#30d158;flex-shrink:0;box-shadow:0 0 14px rgba(48,209,88,0.25);">
                                    <i class="ph-fill ph-google-logo" style="font-size:22px;"></i>
                                </div>
                                <div>
                                    <div style="font-size:16px;font-weight:800;color:#ffffff;line-height:1.2;">Google Calendar${state.googleStatusUnknown?" \xB7 stato da verificare":""}</div>
                                    <div style="font-size:11.5px;font-weight:700;color:#30d158;display:flex;align-items:center;gap:5px;margin-top:2px;">
                                        <span style="width:6px;height:6px;border-radius:50%;background:#30d158;box-shadow:0 0 6px #30d158;"></span>
                                        Sincronizzazione Cloud Attiva
                                    </div>
                                </div>
                            </div>
                            <span style="font-size:10.5px;font-weight:700;color:#8e909f;background:rgba(255,255,255,0.06);padding:3px 8px;border-radius:8px;">
                                Cloud 24/7
                            </span>
                        </div>
                        <p style="font-size:12.5px;color:#c4c5d6;line-height:1.55;margin:0 0 12px;">
                            Compiti, verifiche e <strong>assenze da giustificare</strong> vengono sincronizzati automaticamente con il tuo calendario Google. I promemoria per le assenze rimangono visibili nel calendario finch\xE9 non vengono giustificate.
                        </p>

                        <!-- Feature highlights -->
                        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px;">
                            <span style="font-size:11px;font-weight:600;color:#b6c4ff;background:rgba(37,99,235,0.16);border:0.5px solid rgba(182,196,255,0.2);padding:3px 9px;border-radius:8px;">
                                \u{1F4DD} Compiti ed esercizi
                            </span>
                            <span style="font-size:11px;font-weight:600;color:#30d158;background:rgba(48,209,88,0.14);border:0.5px solid rgba(48,209,88,0.25);padding:3px 9px;border-radius:8px;">
                                \u{1F3AF} Verifiche ed esami
                            </span>
                            <span style="font-size:11px;font-weight:600;color:#ff9f0a;background:rgba(255,159,10,0.14);border:0.5px solid rgba(255,159,10,0.25);padding:3px 9px;border-radius:8px;">
                                \u26A0\uFE0F Assenze da giustificare
                            </span>
                        </div>

                        <div style="display:flex;gap:10px;">
                            <button onclick="if(typeof window.triggerHaptic==='function')window.triggerHaptic('medium');if(typeof syncGoogleCalendar==='function')syncGoogleCalendar();"
                                style="flex:1;height:46px;border-radius:14px;border:none;cursor:pointer;
                                       background:linear-gradient(135deg,#1d4ed8 0%,#2563eb 100%);color:#ffffff;
                                       font-size:13.5px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:7px;
                                       box-shadow:0 4px 16px rgba(37,99,235,0.45);transition:transform 0.12s ease;"
                                ontouchstart="this.style.transform='scale(0.97)'"
                                ontouchend="this.style.transform='scale(1)'">
                                <i class="ph-bold ph-arrows-clockwise" style="font-size:16px;"></i>
                                Sincronizza Ora
                            </button>
                            <button onclick="if(confirm('Disconnettere Google Calendar?')){if(typeof disconnectGoogle==='function')disconnectGoogle();}"
                                style="height:46px;padding:0 16px;border-radius:14px;cursor:pointer;
                                       background:rgba(255,69,58,0.12);border:1px solid rgba(255,69,58,0.25);
                                       color:#ff453a;font-size:13px;font-weight:700;white-space:nowrap;transition:transform 0.12s ease;"
                                ontouchstart="this.style.transform='scale(0.97)'"
                                ontouchend="this.style.transform='scale(1)'">
                                Disconnetti
                            </button>
                        </div>
                    </div>`:`
                    <div style="padding:20px;">
                        <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
                            <div style="width:44px;height:44px;border-radius:14px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);display:flex;align-items:center;justify-content:center;color:#8e909f;flex-shrink:0;">
                                <i class="ph-fill ph-google-logo" style="font-size:22px;"></i>
                            </div>
                            <div>
                                <div style="font-size:16px;font-weight:800;color:#ffffff;line-height:1.2;">Google Calendar${state.googleStatusUnknown?" \xB7 stato da verificare":""}</div>
                                <div style="font-size:12px;font-weight:600;color:#8e909f;margin-top:2px;">Non collegato</div>
                            </div>
                        </div>
                        <p style="font-size:12.5px;color:#c4c5d6;line-height:1.55;margin:0 0 14px;">
                            Collega Google Calendar per sincronizzare automaticamente verifiche, compiti e i <strong>promemoria delle assenze/ritardi da giustificare</strong> (che rimarranno nel tuo calendario fino all'avvenuta giustificazione).
                        </p>
                        <div style="background:rgba(37,99,235,0.12);border:1px solid rgba(182,196,255,0.18);border-radius:16px;padding:12px 14px;margin-bottom:16px;">
                            <div style="font-size:10px;font-weight:800;color:#b6c4ff;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:8px;">
                                Come Funziona
                            </div>
                            ${['Tocca "Collega Google Calendar" qui sotto',"Accedi con il tuo account Google scolastico o personale","Sincronizzazione automatica di compiti, verifiche e assenze da giustificare"].map((step,idx)=>`
                            <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:${idx<2?"8px":"0"};">
                                <div style="width:18px;height:18px;border-radius:50%;background:#2563eb;color:#ffffff;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;">
                                    ${idx+1}
                                </div>
                                <span style="font-size:12px;color:#dae2fd;line-height:1.4;">${step}</span>
                            </div>`).join("")}
                        </div>
                        <button onclick="if(typeof window.connectGoogle==='function')window.connectGoogle();"
                            style="width:100%;height:48px;border-radius:16px;border:none;cursor:pointer;
                                   background:linear-gradient(135deg,#1d4ed8 0%,#2563eb 100%);color:#ffffff;
                                   font-size:14.5px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px;
                                   box-shadow:0 6px 20px -4px rgba(37,99,235,0.5);transition:transform 0.12s ease;"
                            ontouchstart="this.style.transform='scale(0.98)'"
                            ontouchend="this.style.transform='scale(1)'">
                            <i class="ph-bold ph-link" style="font-size:17px;"></i>
                            Collega Google Calendar
                        </button>
                    </div>`}
                </div>
            </div>

            <!-- \u2500\u2500 SEZIONE: SISTEMA & DIAGNOSTICA \u2500\u2500 -->
            <div style="margin-bottom:24px;">
                <p style="font-size:11px;font-weight:800;color:#8e909f;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 10px 4px;display:flex;align-items:center;gap:6px;">
                    <i class="ph-fill ph-gear-six" style="color:#8e909f;"></i> SISTEMA & DIAGNOSTICA
                </p>
                <div style="
                    background:rgba(23,31,51,0.85);backdrop-filter:blur(30px);-webkit-backdrop-filter:blur(30px);
                    border:1px solid rgba(182,196,255,0.14);border-top:1px solid rgba(255,255,255,0.25);
                    border-radius:26px;overflow:hidden;
                    box-shadow:0 12px 32px -8px rgba(6,14,32,0.6);
                ">
                    <div style="display:flex;align-items:center;justify-content:space-between;padding:15px 18px;">
                        <span style="font-size:13.5px;font-weight:600;color:#c4c5d6;">Ultima Sincronizzazione</span>
                        <span style="font-size:12.5px;font-weight:700;color:#b6c4ff;background:rgba(37,99,235,0.18);padding:3px 9px;border-radius:8px;">${lastSyncLabel}</span>
                    </div>

                    <div style="height:0.5px;background:rgba(255,255,255,0.08);margin:0 18px;"></div>

                    <div style="display:flex;align-items:center;justify-content:space-between;padding:15px 18px;">
                        <span style="font-size:13.5px;font-weight:600;color:#c4c5d6;">Serverless Engine</span>
                        <span style="font-size:12.5px;font-weight:700;color:#30d158;display:flex;align-items:center;gap:4px;">
                            <i class="ph-fill ph-check-circle" style="font-size:14px;"></i> Attivo & Reattivo
                        </span>
                    </div>

                    <div style="height:0.5px;background:rgba(255,255,255,0.08);margin:0 18px;"></div>

                    <div onclick="if(confirm('Svuotare la cache locale e ricaricare i dati?')){try{localStorage.clear();sessionStorage.clear();}catch(e){}location.reload();}"
                        style="display:flex;align-items:center;justify-content:space-between;padding:15px 18px;cursor:pointer;transition:background 0.15s ease;"
                        ontouchstart="this.style.background='rgba(255,255,255,0.06)'"
                        ontouchend="this.style.background='transparent'">
                        <span style="font-size:13.5px;font-weight:600;color:#ff9f0a;display:flex;align-items:center;gap:8px;">
                            <i class="ph-bold ph-trash" style="font-size:16px;"></i> Svuota Cache & Reset Dati
                        </span>
                        <i class="ph-bold ph-caret-right" style="font-size:16px;color:#8e909f;"></i>
                    </div>
                </div>
            </div>

            <!-- \u2500\u2500 LOGOUT (Apple Frosted Danger Button) \u2500\u2500 -->
            <button onclick="window.handleLogoutPrompt()"
                style="
                    width:100%;height:54px;border-radius:20px;
                    background:rgba(255,69,58,0.12);
                    border:1px solid rgba(255,69,58,0.28);border-top:1px solid rgba(255,255,255,0.2);
                    display:flex;align-items:center;justify-content:center;gap:10px;
                    color:#ff453a;font-size:15px;font-weight:800;cursor:pointer;
                    font-family:'Inter',sans-serif;
                    margin-bottom:28px;
                    box-shadow:0 6px 20px -6px rgba(255,69,58,0.3);
                    transition:transform 0.15s ease, background 0.15s ease;
                "
                ontouchstart="this.style.transform='scale(0.98)';this.style.background='rgba(255,69,58,0.2)'"
                ontouchend="this.style.transform='scale(1)';this.style.background='rgba(255,69,58,0.12)'">
                <i class="ph-bold ph-sign-out" style="font-size:20px;"></i>
                Esci dall'Account
            </button>

            <!-- \u2500\u2500 FOOTER APP INFO \u2500\u2500 -->
            <div style="text-align:center;padding-bottom:20px;">
                <p style="font-size:12px;font-weight:700;color:#8e909f;letter-spacing:0.04em;margin:0 0 4px;">
                    Gandhi Diary \u2022 v4.0.3
                </p>
                <p style="font-size:11px;font-weight:500;color:rgba(255,255,255,0.35);margin:0;">
                    Liceo Gandhi \xB7 Liquid Glass Interface
                </p>
            </div>

            <!-- \u2500\u2500 DEDICATED BOTTOM SPACER FOR NAVBAR SCROLLING \u2500\u2500 -->
            <div style="height:140px;flex-shrink:0;"></div>

        </div>
    </div>
    `}function renderGradesView(){if(state.activeSubject)return renderSubjectDetailView(state.activeSubject);const allVoti=getVotiData(),currentYearKey=getCurrentSchoolYearKey(),availableYears=getAvailableSchoolYears(allVoti);let activeYearKey=getActiveSchoolYear();availableYears.includes(activeYearKey)||(activeYearKey=currentYearKey,state.selectedSchoolYear=activeYearKey);const isCurrentSchoolYear=activeYearKey===currentYearKey,archiveYears=availableYears.filter(yk=>yk!==activeYearKey),votiData=getVotesForSchoolYear(activeYearKey,allVoti),trendSummary=getGradeMonthlyTrendSummary(votiData),media=trendSummary.media,hasMedia=media!==null&&Number.isFinite(media)&&votiData.length>0,monthList=trendSummary.monthList||[],diffStr=trendSummary.diffStr,isPositive=trendSummary.isPositive,MN_FULL=["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"],now=new Date,monthYearLabel=`${MN_FULL[now.getMonth()]} ${now.getFullYear()}`;let graphHtml="";if(monthList.length>=2){const rawVals=monthList.map(m=>m.avg),minV=Math.min(...rawVals),span=Math.max(...rawVals)-minV||1,pts=rawVals.map((val,i)=>{const x=Math.round(14+i/(rawVals.length-1)*312),norm=(val-minV)/span,y=Math.round(54-norm*40);return{x,y}}),linePathD=pts.map((p,i)=>i===0?`M ${p.x} ${p.y}`:`L ${p.x} ${p.y}`).join(" "),areaPathD=`${linePathD} L ${pts[pts.length-1].x} 70 L ${pts[0].x} 70 Z`,lastPt=pts[pts.length-1];graphHtml=`
        <div style="height:70px;width:100%;position:relative;z-index:1;">
            <svg viewBox="0 0 340 70" style="width:100%;height:100%;display:block;overflow:visible;" preserveAspectRatio="none">
                <defs>
                    <linearGradient id="voti-area-gradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#2997ff" stop-opacity="0.25"></stop>
                        <stop offset="50%" stop-color="#30d158" stop-opacity="0.08"></stop>
                        <stop offset="100%" stop-color="#30d158" stop-opacity="0"></stop>
                    </linearGradient>
                    <linearGradient id="voti-line-gradient" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stop-color="#2997ff"></stop>
                        <stop offset="100%" stop-color="#30d158"></stop>
                    </linearGradient>
                </defs>
                <path class="grade-chart-area" d="${areaPathD}" fill="url(#voti-area-gradient)"></path>
                <path class="grade-chart-line" d="${linePathD}" fill="none" stroke="url(#voti-line-gradient)" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"></path>
                <circle class="grade-chart-dot" cx="${lastPt.x}" cy="${lastPt.y}" r="4.5" fill="#30d158" stroke="#ffffff" stroke-width="2"></circle>
            </svg>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:6px;padding:0 4px;font-size:11px;font-weight:700;color:rgba(255,255,255,0.45);position:relative;z-index:1;">
            ${monthList.map((m,idx)=>`<span style="${idx===monthList.length-1?"color:#30d158;font-weight:800;":""}">${m.label}</span>`).join("")}
        </div>`}else graphHtml="";const subjectsMap={},canonicalSubjects=typeof CANONICAL_GRADES_SUBJECTS<"u"&&Array.isArray(CANONICAL_GRADES_SUBJECTS)?CANONICAL_GRADES_SUBJECTS:["Italiano","Matematica","Fisica","Inglese","Scienze Naturali","Informatica","Filosofia","Storia Triennio","Disegno e Storia Dell'arte Triennio","Educazione Civica","Scienze Motorie e Sportive"];canonicalSubjects.forEach(sub=>{const key=getSubjectGroupKey(sub);subjectsMap[key]={name:sub,list:[]}}),votiData.forEach(v=>{const sub=v.materia||v.subject||"Altro",key=getSubjectGroupKey(sub);if(!subjectsMap[key]){const canonicalName=typeof getSubjectCanonicalName=="function"?getSubjectCanonicalName(sub):null;subjectsMap[key]={name:canonicalName||formatSubjectTitle(sub),list:[]}}subjectsMap[key].list.push(v)});let subjects=Object.values(subjectsMap).map(({name,list})=>{const nums=list.map(getNumericGradeValue).filter(v=>Number.isFinite(v)),hasVotes=nums.length>0,subMedia=hasVotes?averageFromNumeric(nums)||0:null,lastVote=hasVotes?[...list].sort((a,b)=>(b.data||b.date||"").localeCompare(a.data||a.date||""))[0]:null,lastVal=lastVote?getNumericGradeValue(lastVote):null,lastDate=lastVote&&(lastVote.data||lastVote.date)||"";return{name,media:subMedia,hasVotes,lastVote:lastVal,lastVoteDate:lastDate}}).sort((a,b)=>{const idxA=canonicalSubjects.indexOf(a.name),idxB=canonicalSubjects.indexOf(b.name);return idxA!==-1&&idxB!==-1?idxA-idxB:idxA!==-1?-1:idxB!==-1?1:a.name.localeCompare(b.name)}),materieContentHtml="",subjectSlidesCount=0;if(subjects.length>0){const subjectSlides=[];for(let i=0;i<subjects.length;i+=5)subjectSlides.push(subjects.slice(i,i+5));subjectSlidesCount=subjectSlides.length;const slidesHtml=subjectSlides.map(slideItems=>{const featureItem=slideItems[0],gridItems=slideItems.slice(1),featureNameFormatted=formatSubjectTitle(featureItem?featureItem.name:""),featureDateFormatted=featureItem&&featureItem.lastVoteDate?formatFriendlyDate(featureItem.lastVoteDate):"",featureTheme=featureItem?getSubjectTheme(featureItem.name):getSubjectTheme(""),hasFeatVotes=!!(featureItem&&featureItem.hasVotes&&featureItem.media!==null),featureHtml=featureItem?`
            <div style="position:relative;padding:16px 18px;background:rgba(20,31,54,0.85);backdrop-filter:blur(25px) saturate(180%);-webkit-backdrop-filter:blur(25px) saturate(180%);border:0.5px solid ${featureTheme.border};border-top:1px solid rgba(255,255,255,0.25);border-radius:24px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;margin-bottom:12px;transition:transform 0.15s ease;box-shadow:0 8px 24px -6px rgba(6,14,32,0.6);overflow:hidden;" onclick="navigateSubject('${escapeJsSingleQuote(featureItem.name)}')" ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform='scale(1)'">
                <!-- Sfumatura cromatica in angolo del colore della materia -->
                <div style="position:absolute;top:-28px;right:-28px;width:100px;height:100px;background:${featureTheme.color};opacity:0.22;border-radius:50%;filter:blur(26px);pointer-events:none;"></div>

                <div style="display:flex;align-items:center;gap:14px;min-width:0;flex:1;position:relative;z-index:1;">
                    <div style="width:44px;height:44px;border-radius:14px;background:${featureTheme.iconBg};border:1px solid ${featureTheme.border};display:flex;align-items:center;justify-content:center;color:${featureTheme.color};flex-shrink:0;">
                        <i class="ph-fill ${featureTheme.icon}" style="font-size:22px;"></i>
                    </div>
                    <div style="min-width:0;flex:1;">
                        <h3 style="font-size:15px;font-weight:700;color:#ffffff;margin:0 0 3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(featureNameFormatted)}</h3>
                        <p style="font-size:12px;color:rgba(255,255,255,0.6);margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${hasFeatVotes?`Ultimo: ${featureItem.lastVote!==null?featureItem.lastVote:"\u2014"} (${featureDateFormatted})`:"Nessuna valutazione per ora"}</p>
                    </div>
                </div>
                <div style="text-align:right;flex-shrink:0;margin-left:12px;position:relative;z-index:1;">
                    <span style="font-size:22px;font-weight:800;color:${hasFeatVotes?featureItem.media>=6?"#ffffff":"#ffb4ab":"rgba(255,255,255,0.45)"};letter-spacing:-0.02em;">${hasFeatVotes?featureItem.media.toFixed(1):"\u2014"}</span>
                </div>
            </div>`:"",gridCardsHtml=gridItems.map(item=>{const itemFormattedName=formatSubjectTitle(item.name),itemTheme=getSubjectTheme(item.name),hasItemVotes=!!(item.hasVotes&&item.media!==null);return`
                <div style="position:relative;padding:14px 16px;background:rgba(20,31,54,0.85);backdrop-filter:blur(25px) saturate(180%);-webkit-backdrop-filter:blur(25px) saturate(180%);border:0.5px solid ${itemTheme.border};border-top:1px solid rgba(255,255,255,0.22);border-radius:20px;display:flex;flex-direction:column;justify-content:space-between;height:114px;box-sizing:border-box;cursor:pointer;transition:transform 0.15s ease;overflow:hidden;" onclick="navigateSubject('${escapeJsSingleQuote(item.name)}')" ontouchstart="this.style.transform='scale(0.97)'" ontouchend="this.style.transform='scale(1)'">
                    <!-- Sfumatura cromatica in angolo del colore della materia -->
                    <div style="position:absolute;top:-22px;right:-22px;width:76px;height:76px;background:${itemTheme.color};opacity:0.20;border-radius:50%;filter:blur(20px);pointer-events:none;"></div>

                    <div style="display:flex;justify-content:space-between;align-items:center;position:relative;z-index:1;">
                        <div style="width:36px;height:36px;border-radius:12px;background:${itemTheme.iconBg};border:1px solid ${itemTheme.border};display:flex;align-items:center;justify-content:center;color:${itemTheme.color};flex-shrink:0;">
                            <i class="ph-fill ${itemTheme.icon}" style="font-size:18px;"></i>
                        </div>
                        <span style="font-size:20px;font-weight:800;color:${hasItemVotes?item.media>=6?"#ffffff":"#ffb4ab":"rgba(255,255,255,0.45)"};letter-spacing:-0.02em;flex-shrink:0;">${hasItemVotes?item.media.toFixed(1):"\u2014"}</span>
                    </div>
                    <h3 style="font-size:13px;font-weight:700;color:${itemTheme.color};line-height:1.25;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;position:relative;z-index:1;">${escapeHtml(itemFormattedName)}</h3>
                </div>`}).join("");return`
            <div class="voti-subjects-slide" style="flex:0 0 100%;min-width:100%;width:100%;max-width:100%;box-sizing:border-box;scroll-snap-align:start;scroll-snap-stop:always;display:flex;flex-direction:column;justify-content:flex-start;min-height:310px;padding:0 20px;">
                ${featureHtml}
                ${gridCardsHtml?`<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    ${gridCardsHtml}
                </div>`:""}
            </div>`}).join(""),dotsHtml=subjectSlides.map((_,i)=>`
            <div class="voti-subjects-dot" data-idx="${i}" onclick="window.votiJumpToSlide(${i})" style="width:${i===0?"20px":"6px"};height:6px;border-radius:9999px;background:${i===0?"#2997ff":"rgba(255,255,255,0.25)"};transition:all 0.3s cubic-bezier(0.2,0.8,0.2,1);cursor:pointer;-webkit-tap-highlight-color:transparent;"></div>
        `).join("");materieContentHtml=`
        <div id="voti-subjects-carousel" style="
            display: flex;
            overflow-x: auto;
            scroll-snap-type: x mandatory;
            scroll-behavior: smooth;
            -webkit-overflow-scrolling: touch;
            overscroll-behavior-x: contain;
            scrollbar-width: none;
            -ms-overflow-style: none;
            gap: 0;
            margin: 0 -20px;
            padding: 0;
            width: calc(100% + 40px);
        " onscroll="handleVotiSubjectsScroll(this)">
            ${slidesHtml}
        </div>
        ${subjectSlides.length>1?`
        <div style="display:flex;justify-content:center;align-items:center;gap:6px;margin-top:6px;">
            ${dotsHtml}
        </div>`:""}`}let aiInsightText="L'anno scolastico \xE8 appena iniziato. Appena riceverai le prime valutazioni, l'AI analizzer\xE0 il tuo rendimento e suggerir\xE0 strategie di studio personalizzate.";if(votiData.length>0&&subjects.length>0){const validWithVotes=subjects.filter(s=>s.hasVotes&&s.media!==null),minSubj=validWithVotes.length>0?[...validWithVotes].sort((a,b)=>a.media-b.media)[0]:null;minSubj&&minSubj.media<7&&minSubj.media>0?aiInsightText=`Il tuo rendimento complessivo \xE8 solido. Ti suggeriamo di dedicare 30m extra a ${formatSubjectTitle(minSubj.name)} per equilibrare la media generale.`:hasMedia&&media>=8.5?aiInsightText="Rendimento straordinario in tutte le materie! Mantieni questo ritmo costante per il prossimo trimestre.":aiInsightText="Rendimento equilibrato nelle materie registrate. Continua con costanza nello studio quotidiano."}const totVoti=votiData.length,suffCount=votiData.filter(v=>getNumericGradeValue(v)>=6).length,insuffCount=totVoti-suffCount,suffPct=totVoti>0?Math.round(suffCount/totVoti*100):0,validSubjects=subjects.filter(s=>s.hasVotes&&s.media!==null),bestSubject=validSubjects.length>0?validSubjects[0]:null,minSubject=validSubjects.length>0?[...validSubjects].sort((a,b)=>a.media-b.media)[0]:null;let globalStatusBadge={label:"In attesa",color:"rgba(255,255,255,0.6)",bg:"rgba(255,255,255,0.08)",border:"rgba(255,255,255,0.14)",icon:"ph-hourglass-simple"};return hasMedia&&(media>=8.5?globalStatusBadge={label:"Eccellente",color:"#30d158",bg:"rgba(48,209,88,0.18)",border:"rgba(48,209,88,0.38)",icon:"ph-star"}:media>=7.5?globalStatusBadge={label:"Ottimo",color:"#30d158",bg:"rgba(48,209,88,0.15)",border:"rgba(48,209,88,0.35)",icon:"ph-trend-up"}:media>=6.5?globalStatusBadge={label:"Discreto",color:"#64d2ff",bg:"rgba(100,210,255,0.15)",border:"rgba(100,210,255,0.35)",icon:"ph-thumbs-up"}:media>=6?globalStatusBadge={label:"Sufficiente",color:"#2997ff",bg:"rgba(41,151,255,0.15)",border:"rgba(41,151,255,0.35)",icon:"ph-check"}:globalStatusBadge={label:"Critico",color:"#ff453a",bg:"rgba(255,69,58,0.18)",border:"rgba(255,69,58,0.38)",icon:"ph-warning"}),`
    <div class="view-fullbleed min-h-screen" style="padding:0 0 160px 0;background:var(--bg-base, #0c1424);font-family:'Inter',sans-serif;">

        <!-- \u2550\u2550 HEADER (iOS HIG Large Title) \u2550\u2550 -->
        <header class="ios-header-wrapper" style="padding:max(env(safe-area-inset-top,0px),24px) 20px 14px;">
            <div class="ios-sub-title">VALUTAZIONI & MEDIE</div>
            <h1 class="ios-large-title">Voti</h1>
        </header>

        ${availableYears.length>1?`
        <!-- \u2550\u2550 SCHOOL YEAR SELECTOR (ANNO SCOLASTICO) \u2550\u2550 -->
        <div style="display:flex;align-items:center;gap:8px;padding:0 20px 14px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;">
            ${availableYears.map(yk=>{const isSelected=yk===activeYearKey,isCurr=yk===currentYearKey,label=`A.S. ${yk}${isCurr?" (In corso)":" (Archivio)"}`;return`
                <button onclick="window.selectSchoolYear('${yk}')" style="
                    display:inline-flex;align-items:center;gap:6px;
                    padding:7px 14px;border-radius:9999px;font-size:12px;font-weight:700;
                    white-space:nowrap;cursor:pointer;transition:all 0.2s ease;
                    background:${isSelected?"rgba(41,151,255,0.22)":"rgba(255,255,255,0.06)"};
                    border:${isSelected?"1px solid rgba(41,151,255,0.6)":"1px solid rgba(255,255,255,0.1)"};
                    color:${isSelected?"#ffffff":"rgba(255,255,255,0.65)"};
                    box-shadow:${isSelected?"0 2px 10px rgba(41,151,255,0.25)":"none"};
                " ontouchstart="this.style.transform='scale(0.96)'" ontouchend="this.style.transform='scale(1)'">
                    <i class="ph-bold ${isCurr?"ph-graduation-cap":"ph-archive"}" style="font-size:13px;color:${isSelected?"#2997ff":"rgba(255,255,255,0.5)"};"></i>
                    <span>${label}</span>
                </button>`}).join("")}
        </div>`:""}

        <main style="padding:0 20px;display:flex;flex-direction:column;gap:18px;">
            <!-- \u2550\u2550 HERO CARD: MEDIA GENERALE & STATISTICHE \u2550\u2550 -->
            <section style="position:relative;padding:22px 20px 20px;background:rgba(18,26,44,0.76);backdrop-filter:blur(30px) saturate(180%);-webkit-backdrop-filter:blur(30px) saturate(180%);border:0.5px solid rgba(255,255,255,0.12);border-top:1px solid rgba(255,255,255,0.24);border-radius:28px;box-shadow:0 20px 48px -12px rgba(0,0,0,0.65);overflow:hidden;">
                <!-- Dual Corner Chromatic Glows (Azure top-right, Emerald bottom-left) -->
                <div style="position:absolute;top:-30px;right:-30px;width:120px;height:120px;background:#2997ff;opacity:0.22;border-radius:50%;filter:blur(30px);pointer-events:none;"></div>
                <div style="position:absolute;bottom:-30px;left:-30px;width:100px;height:100px;background:#30d158;opacity:0.14;border-radius:50%;filter:blur(28px);pointer-events:none;"></div>

                <!-- Header Row -->
                <div style="display:flex;justify-content:space-between;align-items:center;position:relative;z-index:1;margin-bottom:12px;">
                    <div style="display:flex;align-items:center;gap:6px;">
                        <span style="width:7px;height:7px;border-radius:50%;background:#2997ff;box-shadow:0 0 8px rgba(41,151,255,0.8);"></span>
                        <span style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#2997ff;">MEDIA GENERALE</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:9999px;background:rgba(41,151,255,0.14);border:0.5px solid rgba(41,151,255,0.35);font-size:10px;font-weight:700;color:#2997ff;backdrop-filter:blur(12px);">
                            <i class="ph-bold ph-graduation-cap" style="font-size:12px;"></i> A.S. ${escapeHtml(activeYearKey)}
                        </span>
                        <button onclick="if(navigator.share){navigator.share({title:'Media Generale',text:'La mia media su Gandhi Diary per l\\'A.S. ${escapeJsSingleQuote(activeYearKey)} \xE8 ${hasMedia?media.toFixed(2):"in aggiornamento"}!'}).catch(()=>{});}" style="width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,0.08);border:0.5px solid rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;cursor:pointer;color:#ffffff;transition:transform 0.15s ease;" ontouchstart="this.style.transform='scale(0.9)'" ontouchend="this.style.transform='scale(1)'">
                            <i class="ph ph-share-network text-[16px] text-[#ffffff]"></i>
                        </button>
                    </div>
                </div>

                <!-- Primary Number & Badges -->
                <div style="display:flex;align-items:baseline;justify-content:space-between;position:relative;z-index:1;margin-bottom:16px;">
                    <div style="display:flex;align-items:baseline;gap:12px;">
                        <span style="font-size:52px;font-weight:800;color:#ffffff;letter-spacing:-0.03em;line-height:1;font-variant-numeric:tabular-nums;">${hasMedia?media.toFixed(2):"\u2014"}</span>
                        ${hasMedia&&diffStr?`
                        <div style="background:${isPositive?"rgba(48,209,88,0.18)":"rgba(255,69,58,0.18)"};padding:3px 9px;border-radius:9999px;display:inline-flex;align-items:center;gap:4px;border:1px solid ${isPositive?"rgba(48,209,88,0.4)":"rgba(255,69,58,0.4)"};box-shadow:0 2px 6px ${isPositive?"rgba(48,209,88,0.15)":"rgba(255,69,58,0.15)"};">
                            <i class="ph-bold ${isPositive?"ph-trend-up":"ph-trend-down"}" style="font-size:12px;color:${isPositive?"#30d158":"#ff453a"};"></i>
                            <span style="font-size:11px;font-weight:700;color:${isPositive?"#30d158":"#ff453a"};">${diffStr}</span>
                        </div>`:""}
                    </div>
                    <span style="display:inline-flex;align-items:center;gap:5px;padding:4px 11px;border-radius:9999px;background:${globalStatusBadge.bg};border:1px solid ${globalStatusBadge.border};font-size:11px;font-weight:700;color:${globalStatusBadge.color};">
                        <i class="ph-fill ${globalStatusBadge.icon}" style="font-size:13px;"></i> ${globalStatusBadge.label}
                    </span>
                </div>



                <!-- 4 Bento Metric Pills (2x2 Grid) -->
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;position:relative;z-index:1;margin-bottom:16px;">
                    <!-- Bento 1: Totale Voti -->
                    <div style="background:rgba(41,151,255,0.08);padding:9px 12px;border-radius:14px;border:0.5px solid rgba(41,151,255,0.22);display:flex;flex-direction:column;gap:2px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <span style="font-size:9px;font-weight:700;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.04em;">Valutazioni</span>
                            <i class="ph-fill ph-list-numbers" style="font-size:13px;color:#2997ff;"></i>
                        </div>
                        <span style="font-size:16px;font-weight:800;color:#2997ff;font-variant-numeric:tabular-nums;">${totVoti} <span style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.7);">totali</span></span>
                    </div>

                    <!-- Bento 2: Tasso Sufficienze -->
                    <div style="background:rgba(48,209,88,0.08);padding:9px 12px;border-radius:14px;border:0.5px solid rgba(48,209,88,0.22);display:flex;flex-direction:column;gap:2px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <span style="font-size:9px;font-weight:700;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.04em;">Sufficienze</span>
                            <i class="ph-fill ph-check-circle" style="font-size:13px;color:#30d158;"></i>
                        </div>
                        <span style="font-size:16px;font-weight:800;color:#30d158;font-variant-numeric:tabular-nums;">${totVoti>0?`${suffPct}% <span style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.7);">(${suffCount}/${totVoti})</span>`:"\u2014"}</span>
                    </div>

                    <!-- Bento 3: Materia Top -->
                    <div style="background:rgba(255,159,10,0.08);padding:9px 12px;border-radius:14px;border:0.5px solid rgba(255,159,10,0.22);display:flex;flex-direction:column;gap:2px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <span style="font-size:9px;font-weight:700;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.04em;">Materia Top</span>
                            <i class="ph-fill ph-trophy" style="font-size:13px;color:#ff9f0a;"></i>
                        </div>
                        <span style="font-size:14px;font-weight:800;color:#ff9f0a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${bestSubject&&totVoti>0?`${bestSubject.media.toFixed(1)} ${formatSubjectTitle(bestSubject.name)}`:"\u2014"}</span>
                    </div>

                    <!-- Bento 4: Da Monitorare -->
                    <div style="background:rgba(191,90,242,0.08);padding:9px 12px;border-radius:14px;border:0.5px solid rgba(191,90,242,0.22);display:flex;flex-direction:column;gap:2px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <span style="font-size:9px;font-weight:700;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.04em;">Da Monitorare</span>
                            <i class="ph-fill ph-crosshair" style="font-size:13px;color:#bf5af2;"></i>
                        </div>
                        <span style="font-size:14px;font-weight:800;color:#bf5af2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${minSubject&&totVoti>0?`${minSubject.media.toFixed(1)} ${formatSubjectTitle(minSubject.name)}`:"\u2014"}</span>
                    </div>
                </div>

                <!-- Bilancio Sufficienze vs Insufficienze Ratio Bar -->
                <div style="position:relative;z-index:1;margin-bottom:14px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;font-size:10px;font-weight:700;">
                        <span style="color:#30d158;display:flex;align-items:center;gap:3px;"><i class="ph-bold ph-check" style="font-size:10px;"></i> ${suffCount} Sufficienze</span>
                        <span style="color:${insuffCount>0?"#ff453a":"rgba(255,255,255,0.4)"};display:flex;align-items:center;gap:3px;">${insuffCount} Insufficienze <i class="ph-bold ph-x" style="font-size:10px;"></i></span>
                    </div>
                    <div style="width:100%;height:5px;background:rgba(255,255,255,0.06);border-radius:9999px;overflow:hidden;display:flex;">
                        <div style="width:${totVoti>0?suffPct:0}%;height:100%;background:#30d158;border-radius:9999px 0 0 9999px;transition:width 0.4s ease;"></div>
                        <div style="width:${totVoti>0?100-suffPct:0}%;height:100%;background:#ff453a;border-radius:0 9999px 9999px 0;transition:width 0.4s ease;"></div>
                    </div>
                </div>

                <!-- Trend Graph SVG or Empty State -->
                ${graphHtml}
            </section>

            <!-- Subjects Bento Section -->
            <section style="display:flex;flex-direction:column;gap:12px;">
                <div style="display:flex;justify-content:space-between;align-items:center;padding:0 4px;">
                    <h2 style="font-size:20px;font-weight:700;color:#ffffff;margin:0;line-height:1.2;letter-spacing:-0.01em;">Materie</h2>
                    <span style="font-size:13px;font-weight:600;color:#2997ff;cursor:pointer;opacity:0.9;transition:opacity 0.15s ease;" onmouseenter="this.style.opacity='1'" onmouseleave="this.style.opacity='0.9'" onclick="if(typeof openAllGradesModal==='function')openAllGradesModal();">Tutti i voti</span>
                </div>

                ${materieContentHtml}
            </section>

            <!-- AI Insight Card (Apple Material) -->
            <section style="padding:16px 18px;background:rgba(20,31,54,0.78);backdrop-filter:blur(25px) saturate(180%);-webkit-backdrop-filter:blur(25px) saturate(180%);border:0.5px solid rgba(255,255,255,0.12);border-top:1px solid rgba(255,255,255,0.22);border-radius:24px;display:flex;align-items:center;gap:14px;">
                <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#2997ff 0%,#0058bc 100%);display:flex;align-items:center;justify-content:center;color:#ffffff;box-shadow:0 4px 14px rgba(41,151,255,0.35);flex-shrink:0;">
                    <i class="ph-fill ph-sparkle text-[20px]"></i>
                </div>
                <div style="flex:1;min-width:0;">
                    <h4 style="font-size:11px;font-weight:700;color:#2997ff;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 2px;">AI Insight</h4>
                    <p style="font-size:13px;color:rgba(255,255,255,0.85);line-height:1.45;margin:0;">${aiInsightText}</p>
                </div>
            </section>
        </main>
    </div>`}

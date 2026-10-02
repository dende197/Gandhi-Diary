function showQuickAddTaskModal(){const preselectedDate=state.selectedDate||getLocalDateString(),allTasks=(state.tasks||[]).filter(t=>t.subject!=="QUEST"),subjects=[...new Set(allTasks.map(t=>t.subject||t.materia||"").filter(Boolean))].sort(),subjectOptions=subjects.length?subjects.map(s=>`<option value="${escapeHtml(s)}">${escapeHtml(formatSubjectTitle(s))}</option>`).join(""):'<option value="Generale">Generale</option>',pendingTasks=allTasks.filter(t=>!t.done&&(t.due_date||"")>=getLocalDateString()),pendingSubjs=[...new Set(pendingTasks.map(t=>t.subject||t.materia||"Generale"))].sort(),INP="width:100%;padding:13px 16px;border-radius:16px;border:0.5px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.06);color:#ffffff;font-size:14px;font-weight:500;outline:none;box-sizing:border-box;font-family:'Inter',sans-serif;",LBL="font-size:11px;font-weight:700;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:7px;display:block;";showModal(`
<div style="padding:24px 22px 32px;background:rgba(18,26,44,0.96);backdrop-filter:blur(30px) saturate(180%);-webkit-backdrop-filter:blur(30px) saturate(180%);border:0.5px solid rgba(255,255,255,0.15);border-top:1px solid rgba(255,255,255,0.25);border-radius:32px 32px 0 0;font-family:'Inter',sans-serif;width:100%;box-sizing:border-box;position:relative;overflow:hidden;">
    <!-- Ambient top glow -->
    <div style="position:absolute;top:-20px;right:-20px;width:120px;height:120px;background:#2997ff;opacity:0.2;border-radius:50%;filter:blur(30px);pointer-events:none;"></div>

    <!-- Header -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;position:relative;z-index:1;">
        <div>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                <span style="width:6px;height:6px;border-radius:50%;background:#2997ff;box-shadow:0 0 8px #2997ff;"></span>
                <span style="font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#2997ff;">NUOVA ATTIVIT\xC0</span>
            </div>
            <h2 style="margin:0;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">Aggiungi</h2>
            <p style="margin:2px 0 0;font-size:12px;color:rgba(255,255,255,0.6);font-weight:500;">Compito, verifica o impegno sul calendario</p>
        </div>
        <button id="qs-close-btn" style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.08);border:0.5px solid rgba(255,255,255,0.15);color:rgba(255,255,255,0.8);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:transform 0.15s ease;" ontouchstart="this.style.transform='scale(0.9)'" ontouchend="this.style.transform='scale(1)'">
            <i class="ph ph-x" style="font-size:18px;"></i>
        </button>
    </div>

    <!-- 3 tabs -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;background:rgba(255,255,255,0.05);padding:4px;border-radius:16px;border:0.5px solid rgba(255,255,255,0.1);margin-bottom:20px;position:relative;z-index:1;">
        <button id="qs-tab-new"      style="padding:10px 4px;border-radius:12px;border:1px solid rgba(41,151,255,0.6);background:#2997ff;color:#ffffff;font-size:12px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;box-shadow:0 4px 14px rgba(41,151,255,0.35);display:flex;align-items:center;justify-content:center;gap:5px;transition:all 0.2s ease;"><i class="ph-fill ph-book-open" style="font-size:14px;"></i> Compito</button>
        <button id="qs-tab-existing" style="padding:10px 4px;border-radius:12px;border:none;background:transparent;color:rgba(255,255,255,0.7);font-size:12px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;display:flex;align-items:center;justify-content:center;gap:5px;transition:all 0.2s ease;"><i class="ph-fill ph-list-checks" style="font-size:14px;"></i> Assegnati</button>
        <button id="qs-tab-verifica" style="padding:10px 4px;border-radius:12px;border:none;background:transparent;color:rgba(255,255,255,0.7);font-size:12px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;display:flex;align-items:center;justify-content:center;gap:5px;transition:all 0.2s ease;"><i class="ph-fill ph-pencil-simple-line" style="font-size:14px;"></i> Verifica</button>
    </div>

    <!-- PANEL: Nuovo compito -->
    <div id="qs-panel-new" style="display:flex;flex-direction:column;gap:14px;position:relative;z-index:1;">
        <div><label style="${LBL}">Materia</label><select id="qs-subject" style="${INP}-webkit-appearance:none;">${subjectOptions}</select></div>
        <div><label style="${LBL}">Descrizione</label><textarea id="qs-text" placeholder="Es. Esercizi pag. 47-49, studio cap. 3..." rows="3" style="${INP}resize:none;line-height:1.5;"></textarea></div>
        <div><label style="${LBL}">Data di consegna</label><input id="qs-date" type="date" value="${preselectedDate}" style="${INP}" /></div>
        <button id="qs-submit-new" style="width:100%;height:52px;border-radius:18px;border:1px solid rgba(255,255,255,0.3);background:linear-gradient(135deg,#2997ff 0%,#0058bc 100%);color:#ffffff;font-size:15px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;box-shadow:0 8px 24px rgba(41,151,255,0.4);display:flex;align-items:center;justify-content:center;gap:7px;transition:transform 0.15s ease;" ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform='scale(1)'">
            <i class="ph-bold ph-plus-circle" style="font-size:20px;"></i> Aggiungi Compito
        </button>
    </div>

    <!-- PANEL: Assegnati -->
    <div id="qs-panel-existing" style="display:none;flex-direction:column;gap:12px;position:relative;z-index:1;">
        <p style="font-size:12px;color:rgba(255,255,255,0.65);margin:0 0 4px;">Seleziona un compito gi\xE0 assegnato dai docenti, poi scegli quando inserirlo nel diario.</p>
        <div style="max-height:38vh;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding-right:2px;">
        ${pendingSubjs.length>0?pendingSubjs.map(s=>`
            <p style="font-size:10px;font-weight:700;color:#2997ff;text-transform:uppercase;letter-spacing:0.08em;margin:6px 0 2px;">${escapeHtml(formatSubjectTitle(s))}</p>
            ${pendingTasks.filter(t=>(t.subject||t.materia||"Generale")===s).map(t=>`
            <div id="qs-ex-${escapeHtml(t.id)}" style="background:rgba(20,31,54,0.75);border-radius:16px;padding:12px 14px;border:0.5px solid rgba(255,255,255,0.12);cursor:pointer;display:flex;flex-direction:column;gap:3px;transition:all 0.15s ease;">
                <span style="font-size:13px;font-weight:600;color:#ffffff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(t.text||"")}</span>
                <span style="font-size:11px;color:rgba(255,255,255,0.5);">Scadenza: ${t.due_date||"\u2014"}</span>
            </div>`).join("")}`).join(""):'<p style="text-align:center;color:rgba(255,255,255,0.4);font-size:13px;padding:24px 0;">Nessun compito pendente trovato</p>'}
        </div>
        <div id="qs-existing-date-row" style="display:none;flex-direction:column;gap:10px;padding-top:10px;border-top:0.5px solid rgba(255,255,255,0.1);">
            <label style="${LBL}">Quando vuoi studiarlo?</label>
            <input id="qs-existing-date" type="date" value="${preselectedDate}" style="${INP}" />
            <button id="qs-submit-existing" style="width:100%;height:50px;border-radius:18px;border:1px solid rgba(255,255,255,0.3);background:linear-gradient(135deg,#30d158 0%,#1e8e3e 100%);color:#ffffff;font-size:15px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;box-shadow:0 8px 24px rgba(48,209,88,0.35);display:flex;align-items:center;justify-content:center;gap:7px;transition:transform 0.15s ease;" ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform='scale(1)'">
                <i class="ph-bold ph-calendar-plus" style="font-size:19px;"></i> Aggiungi al Planner
            </button>
        </div>
    </div>

    <!-- PANEL: Verifica -->
    <div id="qs-panel-verifica" style="display:none;flex-direction:column;gap:14px;position:relative;z-index:1;">
        <div><label style="${LBL}">Materia</label><select id="qs-v-subject" style="${INP}-webkit-appearance:none;">${subjectOptions}</select></div>
        <div><label style="${LBL}">Argomenti</label><textarea id="qs-v-text" placeholder="Es. Capitoli 3-5, derivate, sintassi..." rows="2" style="${INP}resize:none;line-height:1.5;"></textarea></div>
        <div><label style="${LBL}">Tipologia Prova</label>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;background:rgba(255,255,255,0.05);padding:4px;border-radius:16px;border:0.5px solid rgba(255,255,255,0.1);">
                <button id="qs-vt-scritta" style="padding:10px 4px;border-radius:12px;border:1px solid rgba(255,69,58,0.6);background:#ff453a;color:#ffffff;font-size:12px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;box-shadow:0 4px 14px rgba(255,69,58,0.35);transition:all 0.2s ease;">Scritta</button>
                <button id="qs-vt-orale"   style="padding:10px 4px;border-radius:12px;border:none;background:transparent;color:rgba(255,255,255,0.7);font-size:12px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;transition:all 0.2s ease;">Orale</button>
                <button id="qs-vt-pratica" style="padding:10px 4px;border-radius:12px;border:none;background:transparent;color:rgba(255,255,255,0.7);font-size:12px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;transition:all 0.2s ease;">Pratica</button>
            </div>
        </div>
        <div><label style="${LBL}">Data</label><input id="qs-v-date" type="date" value="${preselectedDate}" style="${INP}" /></div>
        <button id="qs-submit-verifica" style="width:100%;height:52px;border-radius:18px;border:1px solid rgba(255,255,255,0.3);background:linear-gradient(135deg,#ff453a 0%,#b91c1c 100%);color:#ffffff;font-size:15px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;box-shadow:0 8px 24px rgba(255,69,58,0.4);display:flex;align-items:center;justify-content:center;gap:7px;transition:transform 0.15s ease;" ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform='scale(1)'">
            <i class="ph-bold ph-warning" style="font-size:19px;"></i> Aggiungi Verifica
        </button>
    </div>
</div>
    `),requestAnimationFrame(()=>{const ACTIVE_BLUE="padding:10px 4px;border-radius:12px;border:1px solid rgba(41,151,255,0.6);background:#2997ff;color:#ffffff;font-size:12px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;box-shadow:0 4px 14px rgba(41,151,255,0.35);display:flex;align-items:center;justify-content:center;gap:5px;transition:all 0.2s ease;",ACTIVE_GREEN="padding:10px 4px;border-radius:12px;border:1px solid rgba(48,209,88,0.6);background:#30d158;color:#ffffff;font-size:12px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;box-shadow:0 4px 14px rgba(48,209,88,0.35);display:flex;align-items:center;justify-content:center;gap:5px;transition:all 0.2s ease;",ACTIVE_RED="padding:10px 4px;border-radius:12px;border:1px solid rgba(255,69,58,0.6);background:#ff453a;color:#ffffff;font-size:12px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;box-shadow:0 4px 14px rgba(255,69,58,0.35);display:flex;align-items:center;justify-content:center;gap:5px;transition:all 0.2s ease;",INACTIVE="padding:10px 4px;border-radius:12px;border:none;background:transparent;color:rgba(255,255,255,0.7);font-size:12px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;display:flex;align-items:center;justify-content:center;gap:5px;transition:all 0.2s ease;",CHIP_ACT="padding:10px 4px;border-radius:12px;border:1px solid rgba(255,69,58,0.6);background:#ff453a;color:#ffffff;font-size:12px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;box-shadow:0 4px 14px rgba(255,69,58,0.35);transition:all 0.2s ease;",CHIP_IN="padding:10px 4px;border-radius:12px;border:none;background:transparent;color:rgba(255,255,255,0.7);font-size:12px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;transition:all 0.2s ease;";let currentTab="new",pickedTaskId=null,vTipo="scritta";function switchTab(tab){currentTab=tab,["new","existing","verifica"].forEach(t=>{const btn=document.getElementById("qs-tab-"+t),panel=document.getElementById("qs-panel-"+t);if(!btn||!panel)return;const actStyle=t==="verifica"?ACTIVE_RED:t==="existing"?ACTIVE_GREEN:ACTIVE_BLUE;btn.style.cssText=t===tab?actStyle:INACTIVE,panel.style.display=t===tab?"flex":"none"})}const closeBtn=document.getElementById("qs-close-btn");closeBtn&&closeBtn.addEventListener("click",function(e){e.stopPropagation();const overlay=document.querySelector(".modal-overlay.active");overlay?overlay.remove():typeof closeModal=="function"&&closeModal()}),["new","existing","verifica"].forEach(t=>{const btn=document.getElementById("qs-tab-"+t);btn&&(btn.onclick=()=>switchTab(t))}),document.querySelectorAll('[id^="qs-ex-"]').forEach(el=>{el.onclick=()=>{pickedTaskId=el.id.replace("qs-ex-",""),document.querySelectorAll('[id^="qs-ex-"]').forEach(e=>{e.style.border="0.5px solid rgba(255,255,255,0.12)",e.style.background="rgba(20,31,54,0.75)"}),el.style.border="1px solid #30d158",el.style.background="rgba(48,209,88,0.15)";const row=document.getElementById("qs-existing-date-row");row&&(row.style.display="flex")}}),["scritta","orale","pratica"].forEach(t=>{const btn=document.getElementById("qs-vt-"+t);btn&&(btn.onclick=()=>{vTipo=t,["scritta","orale","pratica"].forEach(tt=>{const b=document.getElementById("qs-vt-"+tt);b&&(b.style.cssText=tt===t?CHIP_ACT:CHIP_IN)})})});async function doAdd(subject,text,date,isExam){if(doAdd.pending)return!1;doAdd.pending=!0;try{return!text.trim()||!date?!1:(await applyImmediateCalendarAction({type:"add",missing:[],subject,text,date,time:"",isExam,examType:vTipo})).ok?(typeof closeModal=="function"&&closeModal(),state.selectedDate=date,window._plannerDayContentCache=null,state._forceRender=!0,showToast((isExam?"Verifica":"Compito")+" aggiunto!","success"),scheduleRender(0),!0):(showToast("Errore nell'aggiunta","error"),!1)}catch(error){return showToast(error.message||"Salvataggio non riuscito","error"),!1}finally{doAdd.pending=!1}}const sbNew=document.getElementById("qs-submit-new");sbNew&&(sbNew.onclick=()=>{const sub=document.getElementById("qs-subject")?.value?.trim()||"Generale",txt=document.getElementById("qs-text")?.value?.trim()||"",dt=document.getElementById("qs-date")?.value||getLocalDateString();if(!txt){const el=document.getElementById("qs-text");el&&(el.style.border="2px solid var(--error)",el.focus());return}doAdd(sub,txt,dt,!1)});const sbEx=document.getElementById("qs-submit-existing");sbEx&&(sbEx.onclick=()=>{if(!pickedTaskId){showToast("Seleziona un compito","warning");return}const orig=(state.tasks||[]).find(t=>t.id===pickedTaskId);if(!orig){showToast("Compito non trovato","error");return}const dt=document.getElementById("qs-existing-date")?.value||getLocalDateString();Array.isArray(state.plannedTasks[dt])||(state.plannedTasks[dt]=[]),state.plannedTasks[dt].includes(orig.id)||state.plannedTasks[dt].push(orig.id),saveTasks(),closeModal(),state.selectedDate=dt,scheduleRender(0)});const sbVer=document.getElementById("qs-submit-verifica");sbVer&&(sbVer.onclick=()=>{const sub=document.getElementById("qs-v-subject")?.value?.trim()||"Generale",txt=document.getElementById("qs-v-text")?.value?.trim()||"",dt=document.getElementById("qs-v-date")?.value||getLocalDateString();if(!txt){const el=document.getElementById("qs-v-text");el&&(el.style.border="2px solid var(--error)",el.focus());return}doAdd(sub,`${vTipo.charAt(0).toUpperCase()+vTipo.slice(1)} \xB7 ${txt}`,dt,!0)})})}function showAddRegistroTaskModal(){const subjects=[...new Set(state.tasks.map(t=>t.subject).filter(Boolean))],subjectOptions=subjects.length>0?subjects.map(s=>`<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join(""):'<option value="Generale">Generale</option>';showModal(`
                <div style="padding: 28px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <h2 style="margin: 0; font-size: 22px; font-weight: 800; color:var(--on-surface);">Nuova Verifica</h2>
                        <button onclick="closeModal()" style="width: 32px; height: 32px; border-radius: 10px; border: 1px solid var(--outline-variant); background:var(--surface-container-low); color:var(--on-surface); cursor: pointer; display: flex; align-items: center; justify-content: center;"><i class="ph-bold ph-x" style="font-size: 14px;"></i></button>
                    </div>
                    <p style="font-family:'JetBrains Mono', monospace; font-size: 10px; color:var(--on-surface-variant); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 24px;">// AGGIUNGI_VERIFICA_O_ORALE</p>
                    <div style="display: flex; flex-direction: column; gap: 18px;">
                        <div>
                            <label style="font-family:'JetBrains Mono', monospace; font-size: 10px; font-weight: 800; color:var(--on-surface-variant); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; display: block;">Tipo</label>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                                <button id="tipo-scritta" onclick="selectRegistroTipo('scritta')" style="padding: 14px; border-radius: 14px; border: 2px solid var(--on-surface); background: #141414; color: #FFF; font-family:'JetBrains Mono', monospace; font-size: 12px; font-weight: 800; text-transform: uppercase; cursor: pointer; transition: all 0.2s;">\u270F\uFE0F Scritta</button>
                                <button id="tipo-orale" onclick="selectRegistroTipo('orale')" style="padding: 14px; border-radius: 14px; border: 1px solid var(--outline-variant); background:var(--surface-container-low); color:var(--on-surface); font-family:'JetBrains Mono', monospace; font-size: 12px; font-weight: 800; text-transform: uppercase; cursor: pointer; transition: all 0.2s;">\u{1F3A4} Orale</button>
                            </div>
                        </div>
                        <div>
                            <label style="font-family:'JetBrains Mono', monospace; font-size: 10px; font-weight: 800; color:var(--on-surface-variant); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; display: block;">Materia</label>
                            <select id="registroTaskSubject" style="width: 100%; padding: 14px 16px; border-radius: 14px; border: 1px solid var(--outline-variant); background:var(--surface-container-low); color:var(--on-surface); font-size: 15px; font-weight: 600; outline: none; box-sizing: border-box; -webkit-appearance: none;">
                                ${subjectOptions}
                            </select>
                        </div>
                        <div>
                            <label style="font-family:'JetBrains Mono', monospace; font-size: 10px; font-weight: 800; color:var(--on-surface-variant); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; display: block;">Argomenti</label>
                            <textarea id="registroTaskArgs" placeholder="Es. Capitoli 3-5, Equazioni 2\xB0 grado" rows="2"
                                style="width: 100%; padding: 14px 16px; border-radius: 14px; border: 1px solid var(--outline-variant); background:var(--surface-container-low); color:var(--on-surface); font-size: 14px; outline: none; resize: vertical; box-sizing: border-box;"></textarea>
                        </div>
                        <div>
                            <label style="font-family:'JetBrains Mono', monospace; font-size: 10px; font-weight: 800; color:var(--on-surface-variant); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; display: block;">Data</label>
                            <input id="registroTaskDate" type="date" value="${getLocalDateString()}"
                                style="width: 100%; padding: 14px 16px; border-radius: 14px; border: 1px solid var(--outline-variant); background:var(--surface-container-low); color:var(--on-surface); font-size: 15px; font-weight: 600; outline: none; box-sizing: border-box;" />
                        </div>
                    </div>
                    <button id="submit-registro-btn" onclick="submitRegistroTask()" style="width: 100%; margin-top: 24px; padding: 16px; border-radius: 16px; border: none; background: #141414; color: #FFF; font-family:'JetBrains Mono', monospace; font-size: 13px; font-weight: 800; text-transform: uppercase; cursor: pointer; box-shadow: 0 4px 16px rgba(0,0,0,0.1); transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);">
                        <i class="ph-bold ph-plus" style="margin-right: 8px;"></i> Aggiungi Verifica
                    </button>
                    <style>
                        #submit-registro-btn:active { transform: scale(0.96); opacity: 0.8; }
                    </style>
                </div>
        `),window._registroTipo="scritta"}function showCompetencyInputModal(){const votiData=getVotiData(),subjectsMap={};votiData.forEach(v=>{const sub=v.materia||v.subject||"Altro";subjectsMap[sub]||(subjectsMap[sub]=[]),subjectsMap[sub].push(v)});const allSubjects=new Set(Object.keys(subjectsMap));state.tasks.forEach(t=>{t.subject&&allSubjects.add(t.subject)});const subjectsList=[...allSubjects].map(name=>{const list=subjectsMap[name]||[],media=list.length>0&&parseFloat(calcolaMedia(list))||0,color=getSubjectColor(name),savedLevel=(state.prepLevels||{})[name]||3,priority=media<6?"\u{1F534} Recupero":media<7?"\u{1F7E1} Migliorabile":"\u{1F7E2} Buona";return{name,media,color,priority,count:list.length,savedLevel}}).sort((a,b)=>a.media-b.media),levelLabels={1:"Per niente pronto",2:"Poco pronto",3:"Sufficiente",4:"Abbastanza pronto",5:"Molto pronto"};showModal(`
                <div style="padding: 24px; max-height: 80vh; overflow-y: auto;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <h2 style="margin: 0; font-size: 20px; font-weight: 800;">\u{1F3AF} Competenze & Priorit\xE0</h2>
                        <i class="ph ph-x" onclick="closeModal()" style="cursor:pointer; font-size: 22px; opacity: 0.6;"></i>
                    </div>
                    <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 16px;">Indica la tua preparazione (1-5) per ogni materia. L'AI user\xE0 sia i voti sia il tuo livello dichiarato.</p>

                    <div style="display: flex; flex-direction: column; gap: 14px; margin-bottom: 24px;">
                        ${subjectsList.map(s=>`
                            <div style="padding: 18px; border-radius: 16px; background: rgba(var(--glass-rgb),0.035); border: 1px solid rgba(var(--glass-rgb),0.08);">
                                <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 12px; cursor: pointer;" onclick="const chk=this.querySelector('input'); chk.checked=!chk.checked">
                                    <input type="checkbox" value="${escapeHtml(s.name)}" class="competency-check" id="comp-${s.name.replace(/[^a-zA-Z0-9]/g,"_")}" ${s.media<6.5||s.savedLevel<3?"checked":""} style="accent-color: var(--accent); width: 22px; height: 22px; cursor: pointer;" onclick="event.stopPropagation()" />
                                    <span style="background: ${s.color}; width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;"></span>
                                    <div style="flex: 1; min-width: 0;">
                                        <div style="font-size: 15px; font-weight: 700; color: white;">${escapeHtml(s.name)}</div>
                                        <div style="font-size: 11px; color: var(--text-dim); margin-top: 2px;">${s.count>0?`Media: ${s.media.toFixed(2)} \xB7 ${s.priority}`:"Nessun voto"}</div>
                                    </div>
                                </div>
                                <div style="display: flex; flex-direction: column; gap: 8px; padding-left: 2px;">
                                    <div style="display: flex; justify-content: space-between; align-items: center;">
                                        <span style="font-size: 11px; color: var(--text-dim); text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Preparazione:</span>
                                        <span id="prep-label-${s.name.replace(/[^a-zA-Z0-9]/g,"_")}" style="font-size: 12px; color: var(--accent); font-weight: 800;">${escapeHtml(levelLabels[s.savedLevel])}</span>
                                    </div>
                                    <div style="height: 48px; display: flex; align-items: center;">
                                        <input type="range" min="1" max="5" value="${s.savedLevel}" class="prep-slider" data-subject="${escapeHtml(s.name)}"
                                            oninput="document.getElementById('prep-label-${s.name.replace(/[^a-zA-Z0-9]/g,"_")}').textContent = ['','Per niente','Poco','Sufficiente','Abbastanza','Molto'][this.value]"
                                            style="flex: 1; accent-color: var(--accent); height: 8px; cursor: pointer;" />
                                    </div>
                                </div>
                            </div>
                        `).join("")}
                        ${subjectsList.length===0?'<div style="text-align:center; padding:40px; color:var(--text-dim); font-size:14px;">Nessun voto disponibile. Sincronizza prima i voti.</div>':""}
                    </div>

                    <button class="btn-primary" onclick="submitCompetencyRequest()" style="width: 100%; border:none; color:white; font-size: 16px; font-weight: 800; padding: 18px; border-radius: 16px;">
                        <i class="ph-bold ph-sparkle" style="margin-right: 8px;"></i> Chiedi un Piano all'AI
                    </button>
                </div>
        `)}

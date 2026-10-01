try{const _curSchool=localStorage.getItem("argo_school");(!_curSchool||_curSchool==="SG28499"||_curSchool==="SS19014")&&localStorage.setItem("argo_school","SG20925")}catch{}function escapeHtml(str){return str==null?"":String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function escapeJsSingleQuote(str){return str==null?"":String(str).replace(/\\/g,"\\\\").replace(/'/g,"\\x27").replace(/"/g,"\\x22").replace(/&/g,"\\x26").replace(/</g,"\\x3c").replace(/>/g,"\\x3e").replace(/\r/g,"\\r").replace(/\n/g,"\\n").replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029")}function openExternalLink(value){try{const url=new URL(value,location.href);if(!["https:","http:"].includes(url.protocol))throw new Error("URL non valido");window.open(url.href,"_blank","noopener,noreferrer")}catch{showToast("Collegamento non valido","error")}}const savedTheme="liquid-glass";window.scrollToSearch=function(){state.view!=="planner"&&state.view!=="home_diary"&&navigate("planner"),state.uiMode!=="list"&&switchPlannerView("list"),setTimeout(()=>{const searchInput=document.querySelector(".agenda-search-input");searchInput&&(searchInput.scrollIntoView({behavior:"smooth",block:"center"}),searchInput.focus())},300)};let _agendaSearchDebounceTimer=null;window.handleAgendaSearch=function(event2){state.agendaSearchQuery=event2.target.value,clearTimeout(_agendaSearchDebounceTimer),_agendaSearchDebounceTimer=setTimeout(()=>{state._filterJustTriggered=!0,refreshAgenda()},120)},window.setAgendaFilter=function(subject){state.agendaSearchSubject=subject,refreshAgenda()};const PASSING_GRADE_THRESHOLD=6,CHART_INTERMEDIATE_TICK_RATIO=.8,CHART_MIN_RANGE_EPSILON=1e-4,CHART_LINE_COLOR="#2563EB",CHART_LABEL_COLOR="rgba(20,20,20,0.45)",CHART_LABEL_FONT="800 10px Inter",GOAL_GRADE_SCALE_DESC=[10,9.5,9,8.5,8,7.5,7,6.5,6],MAX_GRADE_VALUE=10,MAX_GOAL_SCENARIOS=6,BRAND_GRADIENT="linear-gradient(135deg, #0D1F2D 0%, #1A6B8A 45%, #C6F2DF 100%)",GOAL_GRADE_OPTIONS_DESC=GOAL_GRADE_SCALE_DESC.includes(PASSING_GRADE_THRESHOLD)?GOAL_GRADE_SCALE_DESC:[...GOAL_GRADE_SCALE_DESC,PASSING_GRADE_THRESHOLD].sort((a,b)=>b-a),PRINT_DIALOG_DELAY_MS=220,SUBJECT_TREND_GRADIENT_TOP_ALPHA=.95,SUBJECT_TREND_GRADIENT_MID_ALPHA=.4,SUBJECT_TREND_GRADIENT_BOTTOM_ALPHA=.08,CLASS_ACTIVITIES_WEEK_LOOKBACK=16,CLASS_ACTIVITIES_WEEK_LOOKAHEAD=8,CLASS_ACTIVITIES_MAX_WEEK_OPTIONS=80,MOBILE_WEEK_LABEL_BREAKPOINT=700,PLANNER_MOBILE_DROPDOWN_DEFAULT_WIDTH=214,PLANNER_MOBILE_DROPDOWN_DEFAULT_HEIGHT=220,PLANNER_MOBILE_DROPDOWN_MARGIN=10,PLANNER_MOBILE_DROPDOWN_FLIP_CLEARANCE=12,PLANNER_MOBILE_DROPDOWN_OFFSET=-2,PLANNER_MOBILE_DROPDOWN_SCROLL_LISTENER_OPTIONS={capture:!0};let plannerMobileDropdownRepositionListener=null,subjectTrendAnimationFrame=null;const SUBJECT_TREND_ANIMATION_STEP=.06,SUBJECT_TREND_ANIMATION_INITIAL_PROGRESS=.04;function normalizeSubjectName(name){return(name||"").toString().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[’`´]/g,"'").replace(/['"]/g,"").replace(/[./]/g," ").replace(/&/g," e ").replace(/\*/g,"").replace(/\s+/g," ").trim().toLowerCase()}function isArtDrawingSubjectNormalized(normalized){const s=(normalized||"").toString();return s?s.includes("disegno")||s.includes("storia dellarte")||s.includes("storia arte")||s.includes("storiaarte")||s.includes("dellarte")||s.includes("arte triennio"):!1}const CANONICAL_GRADES_SUBJECTS=["Italiano","Matematica","Fisica","Inglese","Scienze Naturali","Informatica","Filosofia","Storia Triennio","Disegno e Storia Dell'arte Triennio","Educazione Civica","Scienze Motorie e Sportive"];function getSubjectCanonicalName(subject){if(!subject)return"";const norm=typeof normalizeSubjectName=="function"?normalizeSubjectName(subject):String(subject||"").toLowerCase().trim();return norm?typeof isArtDrawingSubjectNormalized=="function"&&isArtDrawingSubjectNormalized(norm)||norm.includes("disegn")||norm.includes("dellarte")||norm.includes("storia dell")||norm.includes("arte")&&!norm.includes("letterat")?"Disegno e Storia Dell'arte Triennio":norm.includes("civic")||norm.includes("cittadin")?"Educazione Civica":norm.includes("stori")?"Storia Triennio":norm.includes("ital")||norm.includes("letter")||norm.includes("narrat")||norm.includes("antol")||norm.includes("gramm")?"Italiano":norm.includes("filos")?"Filosofia":norm.includes("ingl")||norm.includes("stranier")?"Inglese":norm.includes("inform")?"Informatica":norm.includes("motor")||norm.includes("sport")||norm.includes("ginnas")||norm.includes("educazione")&&norm.includes("fisic")?"Scienze Motorie e Sportive":norm.includes("scienz")||norm.includes("chimic")||norm.includes("biol")||norm.includes("geol")||norm.includes("natura")?"Scienze Naturali":norm.includes("fisic")?"Fisica":norm.includes("matem")||norm.includes("algeb")||norm.includes("geom")||norm.includes("trigon")?"Matematica":"":""}function getSubjectGroupKey(subject){if(typeof getSubjectCanonicalName=="function"){const canonical=getSubjectCanonicalName(subject);if(canonical)return"canonical_"+normalizeSubjectName(canonical)}const normalized=normalizeSubjectName(subject);return normalized?typeof isArtDrawingSubjectNormalized=="function"&&isArtDrawingSubjectNormalized(normalized)?"canonical_disegno e storia dellarte triennio":normalized:"altro"}function areSubjectsEquivalent(subjectA,subjectB){const a=normalizeSubjectName(subjectA),b=normalizeSubjectName(subjectB);if(!a||!b)return!1;if(a===b||typeof isArtDrawingSubjectNormalized=="function"&&isArtDrawingSubjectNormalized(a)&&isArtDrawingSubjectNormalized(b))return!0;if(typeof getSubjectGroupKey=="function"){const keyA=getSubjectGroupKey(subjectA),keyB=getSubjectGroupKey(subjectB);if(keyA&&keyB&&keyA!=="altro"&&keyA===keyB)return!0}return!1}function isUserGeneratedTaskId(id){return typeof id!="string"?!1:id.startsWith("manual_")||id.startsWith("quest-")}function hasPlannedTasks(plannedTasks){return!plannedTasks||typeof plannedTasks!="object"?!1:Object.values(plannedTasks).some(ids=>Array.isArray(ids)&&ids.length>0)}window._truncateWithEllipsis=function(value,max=180){const txt=String(value??"").replace(/\s+/g," ").trim();return txt?txt.length>max?`${txt.slice(0,max)}\u2026`:txt:""};const truncateWithEllipsis=window._truncateWithEllipsis;function getAgendaCacheKey(){try{return`${lsKey("weekly_agenda_cache")}:${state.plannerMode||"registro"}:${state.agendaSortOrder||"due_desc"}:${state.agendaSearchSubject||"all"}:${state.agendaSearchQuery||""}`}catch(e){return console.warn("Agenda cache key fallback:",e?.message||e),`weekly_agenda_cache:${state.plannerMode||"registro"}:${state.agendaSortOrder||"due_desc"}:${state.agendaSearchSubject||"all"}:${state.agendaSearchQuery||""}`}}function getCachedWeeklyAgendaHtml(){return state._weeklyAgendaCacheKey===getAgendaCacheKey()&&state._weeklyAgendaCacheHtml||""}function saveWeeklyAgendaCache(html){state._weeklyAgendaCacheKey=getAgendaCacheKey(),state._weeklyAgendaCacheHtml=html||""}window.warmWeeklyAgendaCache=function(force=!1){if(!force&&state.uiMode!=="calendar")return;const snapshot={agendaSortOrder:state.agendaSortOrder,agendaSearchSubject:state.agendaSearchSubject,agendaSearchQuery:state.agendaSearchQuery};try{state.agendaSearchQuery="",state.agendaSearchSubject="all",state.agendaSortOrder="due_desc";const baseHtml=renderWeeklyAgenda();baseHtml&&saveWeeklyAgendaCache(baseHtml)}finally{state.agendaSortOrder=snapshot.agendaSortOrder,state.agendaSearchSubject=snapshot.agendaSearchSubject,state.agendaSearchQuery=snapshot.agendaSearchQuery}},window.refreshAgenda=function(){const list=document.getElementById("weekly-agenda-list");if(list){const temp=document.createElement("div"),html=renderWeeklyAgenda();saveWeeklyAgendaCache(html),temp.innerHTML=html;const newList=temp.firstElementChild;newList?(newList.id="weekly-agenda-list",list.parentNode.replaceChild(newList,list),!state._filterJustTriggered&&typeof animatePlannerSurface=="function"?animatePlannerSurface("list"):state._filterJustTriggered&&(gsap.fromTo(newList.querySelectorAll(".agenda-task-card"),{opacity:.5},{opacity:1,duration:.2}),state._filterJustTriggered=!1)):list.innerHTML="";const searchInput=document.getElementById("weekly-agenda-list")?.querySelector(".agenda-search-input");if(searchInput){searchInput.focus();const val=searchInput.value;searchInput.value="",searchInput.value=val}}else scheduleRender(0)};function refreshPlannerSwitchButtons(){Array.from(document.querySelectorAll(".view-switch .switch-btn")).forEach(btn=>{const isActive=btn.dataset.plannerView===state.uiMode;btn.classList.toggle("active",isActive),btn.style.background=isActive?"var(--on-surface)":"transparent",btn.style.color=isActive?"white":"var(--text-secondary)"})}function animatePlannerSurface(view){if(typeof gsap>"u")return;if(view==="calendar"){const days=document.querySelectorAll(".calendar-day"),badges=document.querySelectorAll(".event-badge");gsap.fromTo(days,{y:12,scale:.985},{y:0,scale:1,duration:.28,ease:"power2.out",stagger:{each:.015,from:"start"},clearProps:"transform"}),gsap.fromTo(badges,{x:-4},{x:0,duration:.22,ease:"power1.out",stagger:.01,clearProps:"transform"});return}const listCards=document.querySelectorAll("#weekly-agenda-list .card, #weekly-agenda-list .asw-task-card, #weekly-agenda-list .agenda-day-section"),listBadges=document.querySelectorAll("#weekly-agenda-list .agenda-subject-badge, #weekly-agenda-list .agenda-time-badge, #weekly-agenda-list .agenda-day-month, #weekly-agenda-list .agenda-day-label, #weekly-agenda-list .asw-subject-badge, #weekly-agenda-list .asw-label-tag"),listUi=document.querySelectorAll("#weekly-agenda-list .agenda-search-container, #weekly-agenda-list .agenda-filters-scroll, #weekly-agenda-list .filter-chip, #weekly-agenda-list .agenda-task-main, #weekly-agenda-list .agenda-task-actions, #weekly-agenda-list .agenda-task-action-btn, #weekly-agenda-list [data-task-text]");gsap.fromTo(listCards,{opacity:0,y:10},{opacity:1,y:0,duration:.26,ease:"power2.out",stagger:.02,clearProps:"transform,opacity"}),gsap.fromTo(listBadges,{opacity:0,scale:.96,y:4},{opacity:1,scale:1,y:0,duration:.24,ease:"power2.out",stagger:.01,clearProps:"transform,opacity"}),gsap.fromTo(listUi,{opacity:0,y:6},{opacity:1,y:0,duration:.24,ease:"power2.out",stagger:.008,clearProps:"transform,opacity"})}window.switchPlannerMode=function(mode){state.plannerMode=mode,document.querySelectorAll("[data-planner-mode]").forEach(btn=>{const isActive=btn.dataset.plannerMode===mode;btn.style.background=isActive?"rgba(139,92,246,0.25)":"transparent",btn.style.color=isActive?"white":"rgba(var(--glass-rgb),0.6)",btn.style.border=isActive?"1px solid rgba(139,92,246,0.4)":"1px solid transparent"});const list=document.getElementById("weekly-agenda-list");list&&typeof gsap<"u"?gsap.to(list,{opacity:0,y:4,duration:.12,ease:"power2.in",onComplete:()=>{const temp=document.createElement("div");temp.innerHTML=renderWeeklyAgenda();const newList=temp.firstElementChild;newList?(list.parentNode.replaceChild(newList,list),gsap.fromTo(newList,{opacity:0,y:8},{opacity:1,y:0,duration:.28,ease:"power2.out",clearProps:"transform,opacity"})):gsap.fromTo(list,{opacity:0,y:8},{opacity:1,y:0,duration:.28,ease:"power2.out",clearProps:"transform,opacity"})}}):scheduleRender(0)},window.switchPlannerView=function(view){if(view!=="calendar"&&view!=="list"||state.uiMode===view)return;state.uiMode=view,localStorage.setItem("g_diary_planner_view",view);const content=document.getElementById("planner-main-content"),canPatchInPlace=state.view==="planner"&&content,runSwap=()=>{if(!canPatchInPlace){scheduleRender(0);return}if(view==="calendar")typeof window.warmWeeklyAgendaCache=="function"&&window.warmWeeklyAgendaCache(!0),content.innerHTML='<div id="calendar"></div>',renderCustomCalendar(),animatePlannerSurface("calendar");else{const cachedAgenda=getCachedWeeklyAgendaHtml(),listHtml=cachedAgenda||renderWeeklyAgenda();!cachedAgenda&&listHtml&&saveWeeklyAgendaCache(listHtml),content.innerHTML=listHtml,animatePlannerSurface("list")}refreshPlannerSwitchButtons()};if(content&&typeof gsap<"u"){gsap.to(content,{opacity:0,y:4,scale:.995,duration:.1,ease:"power2.in",onComplete:()=>{runSwap();const newContent=document.getElementById("planner-main-content");newContent&&gsap.fromTo(newContent,{opacity:0,y:6,scale:.995},{opacity:1,y:0,scale:1,duration:.16,ease:"power2.out",clearProps:"transform,opacity"})}});return}runSwap()},window.navigateSubject=function(subjName){subjName&&(state._gradeSubjectsScrollY=window.pageYOffset||document.documentElement.scrollTop||0,state.activeSubject=subjName,scheduleRender(0))},window.handleGradeSubjectClick=function(subjectName){state.view="voti",window.navigateSubject(subjectName),typeof closeModal=="function"&&closeModal()},window.handleGradeSubjectClickFromEncoded=function(encodedSubjectName){const rawSubject=(encodedSubjectName||"").toString();let subjectName=rawSubject;try{if(subjectName=decodeURIComponent(rawSubject),/%25/.test(rawSubject))try{const maybeDoubleDecoded=decodeURIComponent(subjectName);maybeDoubleDecoded!==subjectName&&(subjectName=maybeDoubleDecoded)}catch{}}catch{subjectName=rawSubject}window.handleGradeSubjectClick(subjectName)},window.closeSubject=function(){const restoreY=Number.isFinite(state._gradeSubjectsScrollY)?state._gradeSubjectsScrollY:null;state.activeSubject=null,scheduleRender(0),restoreY!==null&&requestAnimationFrame(()=>{window.scrollTo({top:restoreY,behavior:"auto"}),state._gradeSubjectsScrollY=null})};let _refreshSessionPromise=null;window.refreshSessionToken=async function(){return _refreshSessionPromise?(console.log("[refreshSessionToken] \u23F3 Reusing in-flight refresh promise"),_refreshSessionPromise):(_refreshSessionPromise=(async()=>{try{return await _doRefreshSession()}finally{_refreshSessionPromise=null}})(),_refreshSessionPromise)};async function _doRefreshSession(){const isCurrent=ClientRuntime.capture(),s=JSON.parse(localStorage.getItem("argo_session")||"{}");if(!s||!s.schoolCode||!(s.userName||s.username))return!1;const _applyRefreshedSession=data=>{if(!isCurrent())return;const sessionData={...data.session,studentId:data.student?.id||s.studentId,sessionToken:data.sessionToken};typeof sessionManager<"u"&&sessionManager.save?sessionManager.save(sessionData):localStorage.setItem("argo_session",JSON.stringify({...s,...sessionData}))};if(window._argoPasswordRuntime)try{const res=await fetchWithDeadline(`${window.API_BASE_URL}/login`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({schoolCode:s.schoolCode,username:s.userName||s.username,password:window._argoPasswordRuntime,profileIndex:s.profileIndex})}),data=await res.json().catch(()=>({}));if(!isCurrent())return!1;if(res.ok&&data?.success&&data?.sessionToken)return _applyRefreshedSession(data),console.log("[refreshSessionToken] \u2705 Refreshed via in-memory password"),!0}catch(e){console.warn("[refreshSessionToken] Strategy 1 (RAM) failed:",e.message)}const userId=(typeof window.getUserId=="function"?window.getUserId():null)||s.studentId;if(userId&&userId!=="guest")for(let attempt=1;attempt<=2;attempt++)try{attempt>1&&(console.log(`[refreshSessionToken] Strategy 2 retry #${attempt} after 2s delay...`),await new Promise(r=>setTimeout(r,2e3)));const res=await fetchWithDeadline(`${window.API_BASE_URL}/api/auth?action=refresh-session`,{method:"POST",headers:getSessionHeaders(),body:JSON.stringify({userId})}),data=await res.json().catch(()=>({}));if(!isCurrent())return!1;if(res.ok&&data?.success&&data?.sessionToken)return _applyRefreshedSession(data),console.log(`[refreshSessionToken] \u2705 Refreshed via server-side credentials (attempt ${attempt})`),!0;if(res.status===403){console.warn("[refreshSessionToken] Strategy 2: 403 Non autorizzato \u2014 sessionToken invalid, stopping retry");break}}catch(e){console.warn(`[refreshSessionToken] Strategy 2 attempt ${attempt} failed:`,e.message)}return console.warn("[refreshSessionToken] \u274C All strategies failed"),!1}window.googleFetchWithAuthRetry=async function(url,options={}){const isCurrent=ClientRuntime.capture();let res=await fetchWithDeadline(url,options);if(res.status!==401&&res.status!==403)return res;const refreshed=await window.refreshSessionToken().catch(()=>!1);if(!isCurrent())throw new Error("Il profilo attivo \xE8 cambiato");if(!refreshed)return res;const retryOpts={...options,headers:getSessionHeaders(options.headers||{})};return fetchWithDeadline(url,retryOpts)},window.connectGoogle=async function(){const isCurrent=ClientRuntime.capture(),userId=window.getUserId();if(!userId||userId==="guest"){showToast("Devi essere loggato per collegare Google.","error","var(--red)");return}try{const response=await window.googleFetchWithAuthRetry(`${window.API_BASE_URL}/api/google?action=auth-url`,{method:"POST",headers:getSessionHeaders(),body:JSON.stringify({userId})}),data=await response.json().catch(()=>({}));if(!isCurrent())return;if(!response.ok||!data?.success||!data?.url)throw new Error(data?.error||"Autorizzazione Google fallita");window.location.href=data.url}catch(err){console.error("Google auth-url error:",err),showToast(err.message||"Errore collegamento Google","error","var(--red)")}},window.syncGoogleCalendar=async function(event2){const isCurrent=ClientRuntime.capture(),btn=event2?.currentTarget,originalHtml=btn?.innerHTML||"";try{btn&&(btn.disabled=!0,btn.innerHTML='<i class="ph-bold ph-circle-notch ph-spin"></i> Aggiornamento...');const userId=window.getUserId(),session=JSON.parse(localStorage.getItem("argo_session")||"{}"),fullSession={...session,profileIndex:session.profileIndex??0},data=await(await window.googleFetchWithAuthRetry(`${window.API_BASE_URL}/api/google?action=sync`,{method:"POST",headers:getSessionHeaders(),body:JSON.stringify({userId,session:fullSession})})).json();if(!isCurrent())return;if(data.success)state.googleConnected=!0,localStorage.setItem(lsKey("google_connected_cache"),"1"),showToast(`\u2705 Sincronizzati ${data.added||0} nuovi compiti su Google Calendar!`,"success","var(--green)");else throw data?.error==="GOOGLE_AUTH_EXPIRED"?(state.googleConnected=!1,localStorage.setItem(lsKey("google_connected_cache"),"0"),state._forceRender=!0,window.scheduleRender(0),new Error("Sessione Google scaduta. Ricollega Google dal profilo.")):new Error(data.error||"Sync fallito")}catch(err){console.error("Google Sync Error:",err),showToast(err.message||"Errore durante il sync","error","var(--red)")}finally{btn&&(btn.disabled=!1,btn.innerHTML=originalHtml)}},window.disconnectGoogle=async function(){const isCurrent=ClientRuntime.capture();try{const userId=window.getUserId(),data=await(await window.googleFetchWithAuthRetry(`${window.API_BASE_URL}/api/google?action=disconnect&userId=${encodeURIComponent(userId)}`,{method:"GET",headers:getSessionHeaders()})).json();if(!isCurrent())return;data.success&&(state.googleConnected=!1,localStorage.setItem(lsKey("google_connected_cache"),"0"),state._forceRender=!0,showToast("Google Calendar disconnesso.","warning","var(--orange)"),window.scheduleRender(0))}catch{showToast("Errore disconnessione Google","error","var(--red)")}},window.checkGoogleStatus=async function(){const isCurrent=ClientRuntime.capture();try{const userId=window.getUserId();if(!userId||userId==="guest")return;const res=await window.googleFetchWithAuthRetry(`${window.API_BASE_URL}/api/google?action=status&userId=${encodeURIComponent(userId)}`,{method:"GET",headers:getSessionHeaders()}),data=await res.json();if(!isCurrent())return;if(!res.ok||typeof data.connected!="boolean")throw new Error(data.error||"Stato Google non disponibile");state.googleConnected=data.connected,state.googleStatusUnknown=!1,localStorage.setItem(lsKey("google_connected_cache"),data.connected?"1":"0")}catch{if(!isCurrent())return;state.googleStatusUnknown=!0}state.view==="profile"&&window.scheduleRender(0)},window.saveArgoToSupabase=async function(){try{const session=JSON.parse(localStorage.getItem("argo_session")||"{}"),userId=window.getUserId();if(!userId||userId==="guest"||!session.userName)return;const pwd=window._argoPasswordRuntime||"";await window.googleFetchWithAuthRetry(`${window.API_BASE_URL}/api/google?action=save-argo`,{method:"POST",headers:getSessionHeaders(),body:JSON.stringify({userId,schoolCode:session.schoolCode,username:session.userName||session.username,password:pwd,profileIndex:session.profileIndex??0})}),console.log("\u2705 Credenziali Argo salvate correttamente nel cloud")}catch(e){console.error("\u274C Errore salvataggio cloud",e)}};function calcolaMedia(voti){if(!voti||voti.length===0)return null;const validi=voti.map(v=>{let s=(v.valore||v.value||"").toString().replace(",",".");return parseFloat(s)}).filter(n=>!isNaN(n));return validi.length===0?null:(validi.reduce((a,b)=>a+b,0)/validi.length).toFixed(2)}function isGiustifica(val){if(!val&&val!==0)return!0;const s=val.toString().replace(",",".").trim();return s===""||s==="-"||s==="\u2014"||isNaN(parseFloat(s))}function getNumericGradeValue(vote){if(!vote)return null;const raw=(vote.valore||vote.value||"").toString().replace(",",".").trim();if(isGiustifica(raw))return null;const num=parseFloat(raw);return Number.isFinite(num)?num:null}function getVoteDate(vote){const raw=vote?.data||vote?.date;if(!raw)return null;if(raw instanceof Date)return Number.isNaN(raw.getTime())?null:raw;const d=typeof parseArgoDate=="function"?parseArgoDate(raw):typeof window<"u"&&typeof window.parseArgoDate=="function"?window.parseArgoDate(raw):new Date(raw);return!(d instanceof Date)||Number.isNaN(d.getTime())?null:d}function getProjectionScenarioLabel(scenario,lowercase=!1){return scenario?.combo?lowercase?"combinazione utile":"Combinazione utile":scenario?.exact?lowercase?"prossimo voto esatto":"Prossimo voto esatto":(scenario?.n||0)===1?lowercase?"prossimo voto":"Prossimo voto":lowercase?`prossimi ${scenario?.n||0} voti`:`Prossimi ${scenario?.n||0} voti`}function getProjectionComboDetailLabel(grade,extraTopGrades,maxGradeValue){return`1 voto ${grade.toFixed(2)} + ${extraTopGrades} vot${extraTopGrades===1?"o":"i"} da ${maxGradeValue.toFixed(2)}`}function getSchoolYearFromDate(dateInput){if(!dateInput)return null;const d=dateInput instanceof Date?dateInput:typeof parseArgoDate=="function"?parseArgoDate(dateInput):new Date(dateInput);if(!(d instanceof Date)||Number.isNaN(d.getTime())||d.getTime()<=864e5)return null;const y=d.getFullYear(),startYear=d.getMonth()>=8?y:y-1,endYear=startYear+1,shortEnd=String(endYear).slice(-2);return{startYear,endYear,key:`${startYear}/${shortEnd}`,label:`A.S. ${startYear}/${shortEnd}`,startDate:new Date(startYear,8,1,0,0,0,0),endDate:new Date(endYear,7,31,23,59,59,999)}}function getCurrentSchoolYearKey(refDate=new Date){const sy=getSchoolYearFromDate(refDate);return sy?sy.key:"2026/27"}function getAvailableSchoolYears(allVotes=null,refDate=new Date){const currentKey=getCurrentSchoolYearKey(refDate),votes=Array.isArray(allVotes)?allVotes:typeof getVotiData=="function"?getVotiData():state.voti||[],yearSet=new Set;return yearSet.add(currentKey),(votes||[]).forEach(v=>{const raw=v.data||v.date||"",sy=getSchoolYearFromDate(raw);sy&&yearSet.add(sy.key)}),Array.from(yearSet).sort((a,b)=>b.localeCompare(a))}function getVotesForSchoolYear(yearKey,allVotes=null){const votes=Array.isArray(allVotes)?allVotes:typeof getVotiData=="function"?getVotiData():state.voti||[];return yearKey?(votes||[]).filter(v=>{const raw=v.data||v.date||"",sy=getSchoolYearFromDate(raw);return sy&&sy.key===yearKey}):votes}function getActiveSchoolYear(){if(state.selectedSchoolYear)return state.selectedSchoolYear;try{const key=typeof lsKey=="function"?lsKey("selected_school_year"):"selected_school_year",stored=localStorage.getItem(key);if(stored)return state.selectedSchoolYear=stored,stored}catch{}return getCurrentSchoolYearKey()}window.selectSchoolYear=function(yearKey){state.selectedSchoolYear=yearKey;try{const key=typeof lsKey=="function"?lsKey("selected_school_year"):"selected_school_year";localStorage.setItem(key,yearKey)}catch{}typeof window.scheduleRender=="function"&&window.scheduleRender(0)};function getSchoolYearRanges(refDate=new Date){const year=refDate.getFullYear(),startYear=refDate.getMonth()>=8?year:year-1,endYear=startYear+1;return{startYear,endYear,firstTermStart:new Date(startYear,8,1,0,0,0,0),firstTermEnd:new Date(endYear,0,31,23,59,59,999),secondTermStart:new Date(endYear,1,1,0,0,0,0),secondTermEnd:new Date(endYear,7,31,23,59,59,999)}}function getCurrentSchoolTerm(refDate=new Date){const ranges=getSchoolYearRanges(refDate);return refDate>=ranges.firstTermStart&&refDate<=ranges.firstTermEnd?"first":refDate>=ranges.secondTermStart&&refDate<=ranges.secondTermEnd?"second":refDate.getMonth()>=8||refDate.getMonth()===0?"first":"second"}function getVotesBySchoolTerm(votes,term,refDate=new Date){const ranges=getSchoolYearRanges(refDate);return(Array.isArray(votes)?votes:[]).filter(v=>{const d=getVoteDate(v);return d?term==="first"?d>=ranges.firstTermStart&&d<=ranges.firstTermEnd:term==="second"?d>=ranges.secondTermStart&&d<=ranges.secondTermEnd:!1:!1})}function getPreviousYearTermComparison({subject=null,refDate=new Date,allVotes=null,prevYearKey=null}={}){const d=refDate instanceof Date?refDate:typeof parseArgoDate=="function"?parseArgoDate(refDate):new Date(refDate),validDate=d instanceof Date&&!Number.isNaN(d.getTime())&&d.getTime()>864e5?d:new Date,currentSy=getSchoolYearFromDate(validDate)||{startYear:2026,endYear:2027,key:"2026/27"},prevStartYear=currentSy.startYear-1,prevEndYear=currentSy.endYear-1,targetPrevKey=prevYearKey||`${prevStartYear}/${String(prevEndYear).slice(-2)}`,m=validDate.getMonth(),isFirstTerm=m>=8||m===0,term=isFirstTerm?"first":"second",termLabel=isFirstTerm?"1\xB0 Quadrimestre":"2\xB0 Quadrimestre",termShort=isFirstTerm?"1\xB0Q":"2\xB0Q",prevTermStart=isFirstTerm?new Date(prevStartYear,8,1,0,0,0,0):new Date(prevEndYear,1,1,0,0,0,0),prevTermEnd=isFirstTerm?new Date(prevEndYear,0,31,23,59,59,999):new Date(prevEndYear,7,31,23,59,59,999),votes=Array.isArray(allVotes)?allVotes:typeof getVotiData=="function"?getVotiData():state.voti||[],prevYearVotes=getVotesForSchoolYear(targetPrevKey,votes);let targetVotes=prevYearVotes;subject&&(targetVotes=prevYearVotes.filter(v=>areSubjectsEquivalent(v.materia||v.subject,subject)));const prevTermVotes=targetVotes.filter(v=>{const vd=getVoteDate(v);return vd&&vd>=prevTermStart&&vd<=prevTermEnd}),termNums=prevTermVotes.map(getNumericGradeValue).filter(n=>Number.isFinite(n)),yearNums=targetVotes.map(getNumericGradeValue).filter(n=>Number.isFinite(n)),prevTermMedia=termNums.length?averageFromNumeric(termNums):null,prevYearFullMedia=yearNums.length?averageFromNumeric(yearNums):null;return{prevYearKey:targetPrevKey,currentYearKey:currentSy.key,term,termLabel,termShort,prevTermMedia,prevYearFullMedia,prevTermVotesCount:prevTermVotes.length,prevYearVotesCount:targetVotes.length}}function averageFromNumeric(values){if(!Array.isArray(values)||values.length===0)return null;const valid=values.filter(v=>Number.isFinite(v));return valid.length?valid.reduce((a,b)=>a+b,0)/valid.length:null}function getGradeMonthlyTrendSummary(votiData=null){const data=votiData!==null?votiData:typeof getVotiData=="function"?getVotiData():state.voti||[],numericVotes=(data||[]).map(getNumericGradeValue).filter(v=>Number.isFinite(v)),media=numericVotes.length>0?averageFromNumeric(numericVotes):null,MONTHS_IT=["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];function voteYearMonth(v){const raw=v.data||v.date||"",d=typeof parseArgoDate=="function"?parseArgoDate(raw):new Date(raw);return d&&!isNaN(d)?{y:d.getFullYear(),m:d.getMonth(),key:d.getFullYear()*100+d.getMonth()}:null}const monthMap={};(data||[]).forEach(v=>{const ym=voteYearMonth(v),val=getNumericGradeValue(v);!ym||!Number.isFinite(val)||(monthMap[ym.key]||(monthMap[ym.key]={key:ym.key,label:MONTHS_IT[ym.m],nums:[]}),monthMap[ym.key].nums.push(val))});const monthList=Object.values(monthMap).sort((a,b)=>a.key-b.key).map(m=>({...m,avg:averageFromNumeric(m.nums)})),mediaCurMese=monthList.length>=1?monthList[monthList.length-1].avg:null,mediaPrevMese=monthList.length>=2?monthList[monthList.length-2].avg:null;let diffStr="",diffVal=0,isPositive=!0,hasComparison=!1;return mediaCurMese!==null&&mediaPrevMese!==null?(diffVal=mediaCurMese-mediaPrevMese,isPositive=diffVal>=0,diffStr=(isPositive?"+":"")+diffVal.toFixed(2),hasComparison=!0):numericVotes.length>=2&&(diffStr=`${numericVotes.length} voti`,isPositive=!0),{media,monthList,mediaCurMese,mediaPrevMese,diffVal,diffStr,isPositive,hasComparison,numericVotes}}function getNextGradeSimulatorValue(){const inState=Number(state.nextGradeSimulator);if(Number.isFinite(inState))return Math.max(1,Math.min(10,Math.round(inState)));try{const stored=Number(localStorage.getItem(lsKey("next_grade_sim")));if(Number.isFinite(stored))return Math.max(1,Math.min(10,Math.round(stored)))}catch{}return 7}function setNextGradeSimulatorValue(value){const next=Math.max(1,Math.min(10,Math.round(Number(value)||7)));state.nextGradeSimulator=next;try{localStorage.setItem(lsKey("next_grade_sim"),String(next))}catch{}return next}function getMotivationalFallback(){const quotes=["Un piccolo passo oggi vale pi\xF9 di dieci domani.","La costanza batte il talento quando il talento non \xE8 costante.","Fatto \xE8 meglio di perfetto.","Studia con calma, migliora ogni giorno.","La conoscenza \xE8 potere.","La curiosit\xE0 \xE8 il motore dell'apprendimento.","Ogni errore \xE8 un passo verso la comprensione.","La disciplina \xE8 il ponte tra gli obiettivi e i risultati.","Un libro \xE8 un giardino tascabile.","Imparare senza riflettere \xE8 tempo perso."],day=new Date().getDate();return quotes[day%quotes.length]}function getSafeUserName(){const full=state?.user?.name?.trim();if(!full)return"Studente";const parts=full.split(/\s+/);return parts.length>1?parts.slice(1).join(" "):parts[0]}function toDisplayName(name){return name&&String(name).toLowerCase().replace(/(^|\s|['-])([a-zà-ÿ])/g,(m,sep,ch)=>sep+ch.toUpperCase())}function gaugeClassForMedia(m){return m>=6.5?"gauge-good":m>=6?"gauge-warn":"gauge-bad"}function getSpecializationFullName(spec,rawClass=""){const classMatch=String(rawClass).toUpperCase().match(/\b(SA|SU|LS|LC|LL|EC|CAT|AFM|ITI)\b/),code=(classMatch?classMatch[1]:null)||spec;return{SA:"Scienze Applicate",LC:"Liceo Classico",SU:"Scienze Umane",LL:"Liceo Linguistico",LS:"Liceo Scientifico",EC:"Economico Sociale",CAT:"Costruzioni Ambiente Territorio",AFM:"Amministrazione Finanza Marketing",ITI:"Istituto Tecnico Industriale"}[code]||code||"Indirizzo N/D"}function getLocalDateString(date=new Date){const d=new Date(date),year=d.getFullYear(),month=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");return`${year}-${month}-${day}`}function parseLocalDate(dateStr){const parts=(dateStr||"").split("-");return parts.length!==3?new Date(NaN):new Date(Number(parts[0]),Number(parts[1])-1,Number(parts[2]))}function getSchoolDate(){const italyStr=new Date().toLocaleString("en-US",{timeZone:"Europe/Rome"});return new Date(italyStr)}function updateOfflineBadge(){offlineBadge&&(state.isOffline?(console.log("\u26A0\uFE0F Mostro offline badge"),offlineBadge.classList.add("show")):offlineBadge.classList.remove("show"))}function getModalContainer(){let el=document.getElementById("modal-container");return el||(el=document.createElement("div"),el.id="modal-container",document.body.appendChild(el)),el}typeof window.closeModal!="function"&&(window.closeModal=function(e){if(!(e&&e.target!==e.currentTarget)){var mc=document.getElementById("modal-container");mc&&(mc.innerHTML="")}});const modalRuntime={pendingCloseTimeout:null};function showModal(html,className=""){const container=getModalContainer();container&&(modalRuntime.pendingCloseTimeout&&(clearTimeout(modalRuntime.pendingCloseTimeout),modalRuntime.pendingCloseTimeout=null),container.innerHTML=`
            <div class="modal-overlay active" onclick="closeModal(event)" style="position:fixed;top:0;left:0;right:0;bottom:0;z-index:99990;background:rgba(var(--glass-rgb),0.2);display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(20px);box-sizing:border-box;transition: opacity 0.3s ease;">
                <div class="modal-content liquid-glass rounded-[40px] deep-shadow ${className}" onclick="event.stopPropagation()" style="position:relative;z-index:99991;max-height:calc(100dvh - 32px);overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;width:100%;max-width:640px;padding:0;animation: modalAppear 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);">
                    ${html}
                </div>
            </div>
        `)}window._activeToasts=[];function showToast(message,type="success",customBackground=""){typeof message=="object"&&message!==null&&(type=message.type||type,customBackground=message.customBackground||customBackground,message=message.message||message.text||JSON.stringify(message)),typeof window.triggerHaptic=="function"&&window.triggerHaptic(type==="error"?"error":"light");let stack=document.getElementById("toast-stack-container");stack||(stack=document.createElement("div"),stack.id="toast-stack-container",document.body.appendChild(stack));const typeValue=typeof type=="string"?type.toLowerCase():"success",id="toast_"+Date.now()+"_"+Math.random().toString(36).substr(2,5);let iconName="ph-check-circle",iconClass="text-[#30d158]",toastTypeClass="toast-success";typeValue==="error"?(iconName="ph-x-circle",iconClass="text-[#ff453a]",toastTypeClass="toast-error"):typeValue==="warning"?(iconName="ph-warning-circle",iconClass="text-[#ff9f0a]",toastTypeClass="toast-warning"):typeValue==="info"&&(iconName="ph-info",iconClass="text-[#2997ff]",toastTypeClass="toast-info");const toastObj={id,message,typeValue,iconName,iconClass,toastTypeClass,created:Date.now()};window._activeToasts.unshift(toastObj),window._activeToasts.length>3&&window._activeToasts.pop(),_renderToastStack(),setTimeout(()=>{_dismissToast(id)},3200)}window._dismissToast=function(id){const el=document.getElementById(id);el&&(el.style.opacity="0",el.style.transform="translateY(16px) scale(0.9)",el.style.transition="all 0.25s cubic-bezier(0.16,1,0.3,1)"),setTimeout(()=>{window._activeToasts=window._activeToasts.filter(t=>t.id!==id),_renderToastStack()},250)};function _renderToastStack(){const stack=document.getElementById("toast-stack-container");if(!stack)return;if(window._activeToasts.length===0){stack.innerHTML="";return}stack.innerHTML=window._activeToasts.map((t,idx)=>{const tierClass=`toast-tier-${idx}`;return`
        <div id="${t.id}" class="ios-glass-toast ${t.toastTypeClass} ${tierClass}" data-id="${t.id}">
            <i class="ph-fill ${t.iconName} ${t.iconClass} text-[22px] flex-shrink-0"></i>
            <span class="text-[14px] font-semibold text-[#f1f5f9] tracking-tight leading-snug flex-1">${escapeHtml(t.message)}</span>
            <button onclick="_dismissToast('${t.id}')" style="background:none;border:none;color:rgba(255,255,255,0.4);cursor:pointer;padding:4px;display:flex;align-items:center;justify-content:center;">
                <i class="ph ph-x text-[14px]"></i>
            </button>
        </div>
        `}).join("");const topToastEl=stack.querySelector(".toast-tier-0");if(topToastEl){let startX=0,currentX=0,isDragging=!1;topToastEl.addEventListener("touchstart",e=>{e.touches&&e.touches.length===1&&(startX=e.touches[0].clientX,isDragging=!0)},{passive:!0}),topToastEl.addEventListener("touchmove",e=>{!isDragging||!e.touches||(currentX=e.touches[0].clientX-startX,topToastEl.style.transform=`translateX(${currentX}px) scale(1)`,topToastEl.style.opacity=`${Math.max(.2,1-Math.abs(currentX)/180)}`)},{passive:!0}),topToastEl.addEventListener("touchend",()=>{if(isDragging)if(isDragging=!1,Math.abs(currentX)>75){typeof window.triggerHaptic=="function"&&window.triggerHaptic("light");const id=topToastEl.getAttribute("data-id");window._dismissToast(id)}else topToastEl.style.transform="translateY(0) scale(1)",topToastEl.style.opacity="1",topToastEl.style.transition="transform 0.25s cubic-bezier(0.16,1,0.3,1), opacity 0.25s ease"},{passive:!0})}}window.openBottomSheet=function(opts={}){typeof window.triggerHaptic=="function"&&window.triggerHaptic("medium");const{title="",html="",onClose=null}=opts;let root=document.getElementById("ios-bottom-sheet-root");root||(root=document.createElement("div"),root.id="ios-bottom-sheet-root",document.body.appendChild(root)),root.innerHTML=`
        <div id="ios-sheet-backdrop" class="ios-sheet-backdrop" onclick="window.closeBottomSheet()"></div>
        <div id="ios-bottom-sheet" class="ios-bottom-sheet">
            <div class="ios-sheet-handle-bar" id="ios-sheet-drag-handle"></div>
            ${title?`
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;padding-bottom:12px;border-bottom:0.5px solid rgba(255,255,255,0.08);">
                <h3 style="font-size:18px;font-weight:700;color:var(--text-primary);margin:0;">${escapeHtml(title)}</h3>
                <button onclick="window.closeBottomSheet()" style="width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,0.08);border:none;color:var(--text-secondary);cursor:pointer;display:flex;align-items:center;justify-content:center;">
                    <i class="ph ph-x text-[16px]"></i>
                </button>
            </div>`:""}
            <div id="ios-sheet-content" style="overflow-y:auto;max-height:75vh;-webkit-overflow-scrolling:touch;">
                ${html}
            </div>
        </div>
    `,window._bottomSheetOnClose=onClose,requestAnimationFrame(()=>{const backdrop=document.getElementById("ios-sheet-backdrop"),sheet=document.getElementById("ios-bottom-sheet");backdrop&&backdrop.classList.add("active"),sheet&&sheet.classList.add("open");const handle=document.getElementById("ios-sheet-drag-handle");if(handle&&sheet){let startY=0,currentY=0,isDragging=!1;handle.addEventListener("touchstart",e=>{e.touches&&e.touches.length===1&&(startY=e.touches[0].clientY,isDragging=!0)},{passive:!0}),handle.addEventListener("touchmove",e=>{!isDragging||!e.touches||(currentY=Math.max(0,e.touches[0].clientY-startY),sheet.style.transform=`translateY(${currentY}px)`)},{passive:!0}),handle.addEventListener("touchend",()=>{isDragging&&(isDragging=!1,currentY>110?window.closeBottomSheet():(sheet.style.transform="translateY(0)",sheet.style.transition="transform 0.3s cubic-bezier(0.16,1,0.3,1)"))},{passive:!0})}})},window.closeBottomSheet=function(){const backdrop=document.getElementById("ios-sheet-backdrop"),sheet=document.getElementById("ios-bottom-sheet");sheet&&sheet.classList.remove("open"),backdrop&&backdrop.classList.remove("active"),typeof window.triggerHaptic=="function"&&window.triggerHaptic("light"),setTimeout(()=>{const root=document.getElementById("ios-bottom-sheet-root");root&&(root.innerHTML=""),typeof window._bottomSheetOnClose=="function"&&(window._bottomSheetOnClose(),window._bottomSheetOnClose=null)},350)},window.openContextMenu=function(e,items=[]){e&&e.preventDefault&&e.preventDefault(),typeof window.triggerHaptic=="function"&&window.triggerHaptic("medium");let root=document.getElementById("ios-context-root");root||(root=document.createElement("div"),root.id="ios-context-root",document.body.appendChild(root));const x=Math.min(window.innerWidth-220,Math.max(16,e.clientX||(e.touches&&e.touches[0]?e.touches[0].clientX:40))),y=Math.min(window.innerHeight-200,Math.max(70,e.clientY||(e.touches&&e.touches[0]?e.touches[0].clientY:100))),itemsHtml=items.map((item,i)=>item.separator?'<div class="ios-context-separator"></div>':`
        <button class="ios-context-item ${item.danger?"danger":""}" onclick="window.closeContextMenu();${item.action||""}">
            <span>${escapeHtml(item.label)}</span>
            <i class="ph ${item.icon||"ph-dots-three"} text-[18px]"></i>
        </button>
        `).join("");root.innerHTML=`
        <div class="ios-context-overlay active" onclick="window.closeContextMenu()"></div>
        <div id="ios-context-menu-box" class="ios-context-menu open" style="top:${y}px;left:${x}px;">
            ${itemsHtml}
        </div>
    `},window.closeContextMenu=function(){const root=document.getElementById("ios-context-root");root&&(root.innerHTML="")},window.setupLargeHeaderScroll=function(container){if(!container)return;const largeTitle=container.querySelector(".ios-large-title"),compactNav=container.querySelector(".ios-compact-nav");!largeTitle&&!compactNav||container.addEventListener("scroll",()=>{(container.scrollTop||window.scrollY||0)>35?(compactNav&&compactNav.classList.add("visible"),largeTitle&&(largeTitle.style.opacity="0",largeTitle.style.transform="scale(0.96)")):(compactNav&&compactNav.classList.remove("visible"),largeTitle&&(largeTitle.style.opacity="1",largeTitle.style.transform="scale(1)"))},{passive:!0})};function showBoot(text){window.showBoot=showBoot;const el=document.getElementById("boot-overlay");if(el){if(text){const t=el.querySelector(".boot-title");t&&(t.textContent=text)}el.style.display="flex",el.classList.remove("hidden")}}function hideBoot(){const el=document.getElementById("boot-overlay");el&&(el.classList.add("hidden"),setTimeout(()=>{el.style.display="none"},300));const loader=document.getElementById("app-loader");loader&&(loader.style.opacity="0",setTimeout(()=>loader.remove(),500))}function detectTrackUi(text){if(!text)return null;const s=String(text).toUpperCase().replace(/[\(\)\[\],.\-_/]/g," ").replace(/\s+/g," ").trim();return s?/\b(?:OPZIONE\s+)?SCIENZE\s+APPLICATE\b|\bSC\s*APP(?:LICATE)?\b|\bSA\b/.test(s)?"SA":/\bSCIENZE\s+UMANE\b|\bSC\s*UMANE\b|\bECONOMICO\s+SOCIALE\b|\bLES\b|\bSU\b/.test(s)?"SU":/\b(?:LICEO\s+)?CLASSICO\b|\bCL\b|\bLC\b/.test(s)?"CL":/\b(?:LICEO\s+)?SCIENTIFICO\b|\bLS\b/.test(s)?"LS":/\b(?:LICEO\s+)?LINGUISTICO\b|\bLL\b/.test(s)?"LL":/\b(?:LICEO\s+)?ARTISTICO\b|\bLA\b/.test(s)?"LA":null:null}function normalizeClassUi(cls,track){if(!cls)return null;let txt=String(cls).toUpperCase().trim();if(!txt||txt==="..."||txt===".."||txt==="N/D"||txt==="STUDENTE"||txt==="UNDEFINED"||txt==="NULL"||txt==="---"||/^\s*[1-5]\s*(?:ORE|ANNI|ANNO|OGGETTI|OTTOBRE|ORA|ORDINE|OFFERTA|ORARIO|OVVERO|OGNI|OLTRE)\b/i.test(txt))return null;txt=txt.replace(/\bPRIMA\b|\bI\^?\b/g,"1").replace(/\bSECONDA\b|\bII\^?\b/g,"2").replace(/\bTERZA\b|\bIII\^?\b/g,"3").replace(/\bQUARTA\b|\bIV\^?\b/g,"4").replace(/\bQUINTA\b|\bV\^?\b/g,"5");const alreadyFormatted=txt.match(/^([1-5])\s*([A-Z]{1,2})\s*\(([A-Z]{2,4})\)$/);if(alreadyFormatted)return`${alreadyFormatted[1]}${alreadyFormatted[2]} (${alreadyFormatted[3]})`;let detectedTrack=detectTrackUi(track)||detectTrackUi(txt);const compactMatch=txt.match(/\b([1-5])[\^°]?\s*([A-Z])\s*(SA|LS|SU|CL|LC|LL|LA)\b/i);if(compactMatch){const year=compactMatch[1],section=compactMatch[2].toUpperCase(),t=detectTrackUi(compactMatch[3])||compactMatch[3].toUpperCase();return`${year}${section} (${t})`}const explicitMatch=txt.match(/(?:CLASSE\s*[:\-]?\s*)?([1-5])[\^°]?\s*(?:(?:SEZ(?:IONE)?\.?|\/|\-)\s*[:\-]?\s*)?([A-Z]{1,2})\b/i);if(explicitMatch){const year=explicitMatch[1],section=explicitMatch[2].toUpperCase();if(!/^(ORE|AN|P|DA)$/i.test(section))return detectedTrack?`${year}${section} (${detectedTrack})`:`${year}${section}`}const fallbackMatch=txt.match(/([1-5])\s*([A-Z]{1,2})/);if(fallbackMatch){const year=fallbackMatch[1],section=fallbackMatch[2].toUpperCase();if(!/^(ORE|AN|P|DA)$/i.test(section))return detectedTrack?`${year}${section} (${detectedTrack})`:`${year}${section}`}return txt.length<=15&&txt!=="..."&&txt!=="N/D"&&txt!=="STUDENTE"?txt:null}function isValidClass(cls){if(!cls)return!1;const s=String(cls).trim().toUpperCase();return s.length>=1&&s.length<=20}function isValidName(name){if(!name||typeof name!="string")return!1;const trimmed=name.trim();return trimmed.length<2?!1:/^[a-zA-ZÀ-ÿ0-9\s'.\-]+$/.test(trimmed)}function renderNav(){if(!state.isLoggedIn||state.view==="login"||state._loggedOut){const nc=document.getElementById("nav-container");return nc&&(nc.innerHTML=""),""}const currentView=state.view,renderNavItem=(view,iconBase,label)=>{const isActive=currentView===view,color=isActive?"#2997ff":"rgba(255, 255, 255, 0.45)",fontStyle=isActive?"font-bold":"font-medium",iconClass=isActive?`ph-fill ${iconBase}`:`ph ${iconBase}`;return`
        <button onclick="if(typeof window.triggerHaptic==='function')window.triggerHaptic('selection');navigate('${view}')" 
           class="nav-item relative flex flex-col items-center justify-center gap-1 min-w-[56px] min-h-[48px] px-2 py-1 transition-transform active:scale-95 bg-transparent border-none outline-none cursor-pointer"
           style="color:${color};-webkit-tap-highlight-color:transparent;">
            <i class="${iconClass} text-[22px] relative z-10 transition-transform ${isActive?"scale-110":""}"></i>
            <span class="text-[10px] ${fontStyle} tracking-tight relative z-10">${label}</span>
            ${isActive?'<div style="position:absolute;bottom:2px;width:4px;height:4px;border-radius:50%;background:#2997ff;box-shadow:0 0 8px #2997ff;"></div>':""}
        </button>
        `};return`
        <!-- \u2550\u2550 BOTTOM NAV \u2014 4K Ultra HD Liquid Glass Floating Pill (iOS HIG) \u2550\u2550 -->
        <nav class="liquid-navbar fixed bottom-5 left-1/2 -translate-x-1/2 flex items-center justify-around px-3 rounded-[36px] z-[1000] w-[90%] max-w-[360px] h-[64px] md:hidden" style="background:rgba(12,19,34,0.86)!important;backdrop-filter:blur(32px) saturate(190%)!important;-webkit-backdrop-filter:blur(32px) saturate(190%)!important;border:0.5px solid rgba(255,255,255,0.14)!important;box-shadow:0 20px 48px -10px rgba(0,0,0,0.7),inset 0 1px 1px rgba(255,255,255,0.12)!important;">
            ${renderNavItem("home","ph-squares-four","Overview")}
            ${renderNavItem("planner","ph-calendar-blank","Planner")}
            ${renderNavItem("voti","ph-star","Grades")}
            ${renderNavItem("circolari","ph-file-text","Circulars")}
        </nav>

        <!-- \u2550\u2550 TOP NAV \u2014 Tablet & Desktop only (\u2265 768px) \u2550\u2550 -->
        <nav class="top-bar-nav fixed top-0 left-1/2 -translate-x-1/2 hidden md:flex items-center justify-center gap-4 z-[1000]" style="background:rgba(12,19,34,0.9);backdrop-filter:blur(24px);border:0.5px solid rgba(255,255,255,0.1);">
            ${renderNavItem("home","ph-squares-four","Overview")}
            ${renderNavItem("planner","ph-calendar-blank","Planner")}
            ${renderNavItem("voti","ph-star","Grades")}
            ${renderNavItem("circolari","ph-file-text","Circulars")}
        </nav>

        <!-- Drawer overlay -->
        <div id="drawerOverlay" onclick="closeDrawer()" style="
            position:fixed; inset:0; background:rgba(15,23,42,0.45);
            backdrop-filter:blur(4px); opacity:0; pointer-events:none;
            z-index:9999; display:flex; align-items:flex-end;
            transition:opacity 0.3s ease;">
            <div id="drawerContent" onclick="event.stopPropagation()" style="
                width:100%; background:var(--surface-container-lowest); border-radius:36px 36px 0 0;
                padding:32px 32px 40px; box-shadow:0 -10px 40px rgba(0,0,0,0.12);
                transform:translateY(100%); display:flex; flex-direction:column;
                max-height:80%; overflow-y:auto;
                transition:transform 0.3s cubic-bezier(0.16,1,0.3,1);">
                <div style="width:44px;height:5px;background:var(--surface-container-low);border-radius:999px;margin:0 auto 24px;flex-shrink:0;"></div>
                <div id="drawerDynamicBody"></div>
            </div>
        </div>

        <!-- Dialog overlay -->
        <div id="dialogOverlay" style="
            position:fixed; inset:0; background:rgba(15,23,42,0.45);
            backdrop-filter:blur(4px); opacity:0; pointer-events:none;
            z-index:9999; display:flex; align-items:center; justify-content:center;
            padding:0 24px; transition:opacity 0.2s ease;">
            <div style="background:var(--surface-container-lowest); border-radius:24px; padding:24px;
                        width:100%; max-height:80%; overflow-y:auto;
                        box-shadow:0 25px 50px rgba(0,0,0,0.15);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                    <h4 id="dialogTitle" style="font-size:1.1rem;font-weight:700;color:var(--on-surface);">Dettagli</h4>
                    <button onclick="closeDialog()" style="width:32px;height:32px;border-radius:50%;
                        background:var(--surface-container-low);border:none;display:flex;align-items:center;
                        justify-content:center;color:var(--on-surface-variant);cursor:pointer;">
                        <i data-lucide="x" style="width:16px;height:16px;"></i>
                    </button>
                </div>
                <div id="dialogBody" style="font-size:0.875rem;color:var(--on-surface-variant);"></div>
            </div>
        </div>

        <script>
            if (typeof lucide !== 'undefined') lucide.createIcons();
        <\/script>
    `}function updatePlanTaskUI(taskId,isPlanned){const taskElement=document.querySelector(`[data-task-id="${taskId}"]`);if(!taskElement)return;const checkbox=taskElement.querySelector(".plan-checkbox, [data-plan-checkbox]"),container=taskElement;checkbox&&(isPlanned?(checkbox.style.background="var(--green, #30D158)",checkbox.style.borderColor="var(--green, #30D158)",checkbox.innerHTML='<i class="ph-bold ph-check" style="font-size: 16px; color: black;"></i>'):(checkbox.style.background="transparent",checkbox.style.borderColor="rgba(var(--glass-rgb),0.2)",checkbox.innerHTML=""),checkbox.style.transform="scale(0.85) translateZ(0)",requestAnimationFrame(()=>{setTimeout(()=>{checkbox.style.transform="scale(1) translateZ(0)"},50)})),container&&(container.style.transition="all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",container.style.borderLeftColor=isPlanned?"var(--green, #30D158)":"rgba(var(--glass-rgb),0.05)",container.style.background=isPlanned?"rgba(48, 209, 88, 0.08)":"rgba(var(--glass-rgb),0.03)")}function updatePlannerCounter(){}function normalizeTipoVerifica(tipo,upperCase=!0){const t=(tipo||"").toString().toLowerCase().trim();return t==="scritta"?upperCase?"SCRITTA":"Scritta":t==="orale"?upperCase?"ORALE":"Orale":upperCase?"VERIFICA":"Valutazione"}function getHomeTaskWidgetData(){const mode=state.homeTaskFocus==="today"?"today":"tomorrow",today=new Date;today.setHours(0,0,0,0);const todayStr=getLocalDateString(today),tomorrow=new Date(today);tomorrow.setDate(tomorrow.getDate()+1);const tomorrowStr=getLocalDateString(tomorrow);if(mode==="today"){const plannedTodayIds=state.plannedTasks&&state.plannedTasks[todayStr]||[],tasks2=(state.tasks||[]).filter(t=>t.subject==="QUEST"||t.isExam?!1:plannedTodayIds.includes(t.id));return{mode,title:"Oggi",dateStr:todayStr,emptyMessage:"Nessun compito pianificato per oggi.",tasks:tasks2}}const tasks=(state.tasks||[]).filter(t=>t.subject==="QUEST"||t.isExam?!1:t.due_date===tomorrowStr);return{mode,title:"Domani",dateStr:tomorrowStr,emptyMessage:"Nessun compito assegnato per domani.",tasks}}function renderHomeTaskListHtml(homeTaskData){return homeTaskData.tasks.length?homeTaskData.tasks.map(t=>{const abbr=getSubjectAbbrev(t.subject),key=abbr.toLowerCase();return`
              <div style="display:flex; align-items:center; gap:9px; padding:6px 0; border-bottom:1px solid var(--outline-variant); cursor:pointer;" onclick="toggleTask('${escapeJsSingleQuote(t.id)}',event)">
                <div data-task-toggle="${escapeHtml(t.id)}" style="width:17px; height:17px; border:1.5px solid ${t.done?"var(--on-surface)":"var(--outline-variant)"}; border-radius:5px; flex-shrink:0; display:flex; align-items:center; justify-content:center; background:${t.done?"var(--on-surface)":"var(--surface-container-lowest)"}; transition: background 0.15s ease, border-color 0.15s ease;">
                  ${t.done?'<svg width="8" height="5" viewBox="0 0 8 5"><path d="M1 2.5L3 4.5L7 1" stroke="white" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>':""}
                </div>
                <span style="font-family:'JetBrains Mono',monospace; font-size:9px; font-weight:500; border-radius:5px; padding:2px 6px; flex-shrink:0; background:var(--${key},#EEE); color:var(--${key}-t,#444);">${abbr}</span>
                <span data-task-text="${escapeHtml(t.id)}" style="font-size:12.5px; font-weight:500; color:${t.done?"var(--on-surface-variant)":"var(--on-surface)"}; flex:1; line-height:1.3; ${t.done?"text-decoration:line-through;":""} white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(t.text)}</span>
                ${isUserGeneratedTaskId(t.id)?`
                <button onclick="event.stopPropagation(); deleteCalendarTask('${escapeJsSingleQuote(t.id)}');" style="width:20px; height:20px; border-radius:6px; background:var(--error-container); border:1px solid rgba(255,59,48,0.18); display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0;" aria-label="Elimina attivit\xE0" title="Elimina attivit\xE0">
                    <i class="ph-bold ph-trash" style="font-size:10px; color:var(--error);"></i>
                </button>`:""}
              </div>`}).join(""):`<div style="font-size:11px; color:var(--outline-variant); padding:10px 0; text-align:center;">${homeTaskData.emptyMessage}</div>`}function updateHomeTaskFocusWidget(){if(state.view!=="home")return!1;const homeTaskData=getHomeTaskWidgetData(),label=document.getElementById("home-focus-label"),list=document.getElementById("home-focus-task-list"),btnToday=document.getElementById("home-focus-btn-today"),btnTomorrow=document.getElementById("home-focus-btn-tomorrow");if(!label||!list||!btnToday||!btnTomorrow)return!1;label.textContent=homeTaskData.title,list.innerHTML=renderHomeTaskListHtml(homeTaskData);const applyBtnState=(btn,active)=>{btn.style.borderColor=active?"var(--on-surface)":"var(--outline-variant)",btn.style.background=active?"var(--on-surface)":"var(--surface-container-lowest)",btn.style.color=active?"var(--surface-container-lowest)":"#4F4A43"};return applyBtnState(btnToday,homeTaskData.mode==="today"),applyBtnState(btnTomorrow,homeTaskData.mode==="tomorrow"),!0}function updateNextGradeSimulatorWidget(){if(state.view!=="voti")return!1;const simValueEl=document.getElementById("next-grade-sim-value"),currentAvgEl=document.getElementById("next-grade-current-avg"),simAvgEl=document.getElementById("next-grade-sim-avg"),impactEl=document.getElementById("next-grade-sim-impact"),termLabelEl=document.getElementById("next-grade-current-term-label");if(!simValueEl||!currentAvgEl||!simAvgEl||!impactEl)return!1;let votiData=getVotiData();state.activeSubject&&(votiData=votiData.filter(v=>areSubjectsEquivalent(v.materia||v.subject,state.activeSubject)));const currentTerm=getCurrentSchoolTerm(new Date),numericVotes=(currentTerm?getVotesBySchoolTerm(votiData,currentTerm):[]).map(getNumericGradeValue).filter(v=>Number.isFinite(v)),media=averageFromNumeric(numericVotes),simulatorValue=getNextGradeSimulatorValue(),simulatedAvg=averageFromNumeric([...numericVotes,simulatorValue]),simulatedDelta=Number.isFinite(media)&&Number.isFinite(simulatedAvg)?simulatedAvg-media:null;return simValueEl.textContent=`voto: ${simulatorValue}`,currentAvgEl.textContent=Number.isFinite(media)?media.toFixed(2):"\u2014",simAvgEl.textContent=Number.isFinite(simulatedAvg)?simulatedAvg.toFixed(2):"\u2014",Number.isFinite(simulatedDelta)?(impactEl.textContent=`${simulatedDelta>=0?"+":""}${simulatedDelta.toFixed(2)}`,impactEl.style.color=simulatedDelta>=0?"#2DB86A":"#FF3B30"):(impactEl.textContent="\u2014",impactEl.style.color="var(--on-surface-variant)"),termLabelEl&&(termLabelEl.textContent=currentTerm==="first"?"Primo quadrimestre":currentTerm==="second"?"Secondo quadrimestre":"Nessun quadrimestre attivo"),!0}window.setHomeTaskFocus=function(mode){state.homeTaskFocus=mode==="today"?"today":"tomorrow",state.view==="home"&&!updateHomeTaskFocusWidget()&&typeof scheduleRender=="function"&&scheduleRender(0)};function updateHomeView(){if(state.view!=="home")return;const focusCard=document.getElementById("home-focus-task-list");if(focusCard){const focusData=getHomeTaskWidgetData(),liveIds=new Set(focusData.tasks.map(t=>t.id));focusCard.querySelectorAll("[data-task-toggle]").forEach(cb=>{const taskId=cb.getAttribute("data-task-toggle");if(!liveIds.has(taskId)){const row=cb.parentElement;row&&row!==focusCard&&(typeof gsap<"u"?gsap.to(row,{opacity:0,height:0,paddingTop:0,paddingBottom:0,marginTop:0,marginBottom:0,duration:.2,ease:"power2.in",onComplete:()=>row.remove()}):row.remove())}}),setTimeout(()=>{if(focusCard.querySelectorAll("[data-task-toggle]").length===0&&!focusCard.querySelector("[data-empty-msg]")){const empty=document.createElement("div");empty.setAttribute("data-empty-msg","1"),empty.style.cssText="font-size:11px; color:var(--outline-variant); padding:10px 0; text-align:center;",empty.textContent=focusData.emptyMessage||"Nessun compito",focusCard.appendChild(empty)}},220),focusData.tasks.forEach(t=>{const cb=focusCard.querySelector(`[data-task-toggle="${t.id}"]`),txt=focusCard.querySelector(`[data-task-text="${t.id}"]`);cb&&(cb.style.background=t.done?"var(--on-surface)":"var(--surface-container-lowest)",cb.style.borderColor=t.done?"var(--on-surface)":"var(--outline-variant)",cb.innerHTML=t.done?'<svg width="8" height="5" viewBox="0 0 8 5"><path d="M1 2.5L3 4.5L7 1" stroke="white" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>':""),txt&&(txt.style.textDecoration=t.done?"line-through":"none",txt.style.color=t.done?"var(--on-surface-variant)":"var(--on-surface)")})}}function buildCalendarEventsFromState(){return(state.tasks||[]).filter(t=>t.due_date&&t.hasValidDate).map(t=>{const color=getSubjectColor(t.subject||"Generico");return{title:`${(t.subject||"GEN").substring(0,4).toUpperCase()}: ${t.text}`,start:t.due_date,color:t.done?"#30D158":color,textColor:"var(--surface-container-lowest)",extendedProps:{fullText:t.text,subject:t.subject}}})}function getCalendarTasksForDate(dateStr){const plannedIds=state.plannedTasks&&state.plannedTasks[dateStr]||[],tasks=Array.isArray(state.tasks)?state.tasks:[],merged=new Map;return tasks.forEach(t=>{!t||t.subject==="QUEST"||t.isExam||(t.due_date===dateStr||plannedIds.includes(t.id))&&merged.set(t.id,t)}),[...merged.values()]}function getSubjectAbbrev(subject){if(!subject)return"GEN";let cleanSubj=subject.replace(/[*_\[\]]/g,"").trim();if(!cleanSubj)return"GEN";const abbrevs={ITALIANO:"ITA",MATEMATICA:"MAT",INGLESSE:"ING",INGLESE:"ING",STORIA:"STO",GEOGRAFIA:"GEO",FILOSOFIA:"FIL",FISICA:"FIS",SCIENZE:"SCI",BIOLOGIA:"BIO",CHIMICA:"CHI",ARTE:"ART",DISEGNO:"DIS",RELIGIONE:"REL","EDUCAZIONE FISICA":"SCM","SCIENZE MOTORIE":"SCM",INFORMATICA:"INF",DIRITTO:"DIR",ECONOMIA:"ECO",FRANCESE:"FRA",TEDESCO:"TED",SPAGNOLO:"SPA","FILOSOFIA E STORIA":"STO","MATEMATICA E FISICA":"MAT","SCIENZE NATURALI":"SCI","LINGUA E LETTERATURA ITALIANA":"ITA","LINGUA E CULTURA LATINA":"LAT","LINGUA E LETT. ITALIANA":"ITA","LINGUA E LETTER. ITALIANA":"ITA","LINGUA E CULTURA STRANIERA":"ING","LINGUA STRANIERA":"ING","MATEM. CON INFORMATICA":"MAT","MATEMATICA CON INFORMATICA":"MAT","SCIENZE NAT. CHIM. BIO.":"SCI","SC. NATURALI":"SCI","DISEGNO E STORIA DELL'ARTE":"ART","STORIA DELL'ARTE":"ART","DISEGNO E STORIA DELL'ARTE TRIENNIO":"ART","STORIA TRIENNIO":"STO","SCIENZE MOTORIE E SPORTIVE":"SCM","SC. MOTORIE E SPORTIVE":"SCM",GRECO:"GRC",LATINO:"LAT","LINGUA E CULTURA GRECA":"GRC",GEOSTORIA:"STO","STORIA E GEOGRAFIA":"STO",IRC:"REL","ED.CIVICA":"CIV","EDUCAZIONE CIVICA":"CIV"},key=cleanSubj.toUpperCase().trim();if(console.log(`[Debug] Matching subject: "${key}"`),abbrevs[key])return abbrevs[key];for(let[full,short]of Object.entries(abbrevs))if(key.includes(full))return console.log(`[Debug] Partial match: "${full}" -> ${short}`),short;return key.includes("MATEM")?"MAT":key.includes("FISIC")?"FIS":key.includes("ITALIA")?"ITA":key.includes("INGLE")?"ING":key.includes("LATIN")?"LAT":key.includes("GREC")?"GRC":key.includes("FILOS")?"FIL":key.includes("STORI")?"STO":key.includes("SCIEN")?"SCI":key.includes("DISEG")?"DIS":key.includes("RELIG")?"REL":key.includes("FRANC")?"FRA":key.includes("TEDES")?"TED":key.includes("SPAGN")?"SPA":key.includes("INFOR")?"INF":key.includes("CHIMI")?"CHI":(console.warn(`[Debug] No match for: "${key}", using fallback.`),key.substring(0,3).toUpperCase())}function initPlannerCalendar(){renderCustomCalendar()}function syncCalendarEvents(){renderCustomCalendar()}function renderCustomCalendar(){const calendarEl=document.getElementById("calendar");if(!calendarEl)return;const today=new Date;today.setHours(0,0,0,0);const d=today.getDay(),diffToMonday=today.getDate()-(d===0?6:d-1),startOfCurrentWeek=new Date(new Date(today).setDate(diffToMonday));startOfCurrentWeek.setHours(0,0,0,0);const startDate=new Date(startOfCurrentWeek);startDate.setDate(startOfCurrentWeek.getDate()+calendarState.weekOffset*7);const endDate=new Date(startDate);endDate.setDate(startDate.getDate()+13);const monthNames=["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"],weekLabel=`Settimana ${startDate.getDate()} ${monthNames[startDate.getMonth()]} - ${endDate.getDate()} ${monthNames[endDate.getMonth()]}`,todayISO=getLocalDateString(today),verificheByDate={};(state.verifiche||[]).forEach(v=>{const dateKey=v.data||"";dateKey&&(verificheByDate[dateKey]||(verificheByDate[dateKey]=[]),verificheByDate[dateKey].push({subject:v.materia||v.subject||"",text:v.text||"",tipo:v.tipo||""}))}),(state.manualVerifiche||[]).forEach(v=>{const dateKey=v.date||"";dateKey&&(verificheByDate[dateKey]||(verificheByDate[dateKey]=[]),verificheByDate[dateKey].push({subject:v.subject||"",text:v.args||"",tipo:v.type||""}))});let html=`
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
            `;const tempDate=new Date(startDate);for(let i=0;i<14;i++){const dateStr=getLocalDateString(tempDate),isToday=dateStr===todayISO,isPast=tempDate<today&&!isToday,dayTasks=getCalendarTasksForDate(dateStr),dayVerifiche=verificheByDate[dateStr]||[],dayMood=typeof window.getDailyMoodForDate=="function"?window.getDailyMoodForDate(dateStr):null;html+=`
                    <div class="calendar-day ${isToday?"today":""} ${isPast?"past":""}" 
                         onclick="${isPast?"":`handleDayClick('${dateStr}')`}">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px;">
                            <div class="day-number">${tempDate.getDate()}</div>
                            ${dayMood?`<span style="font-size:12px;line-height:1;">${dayMood.emoji}</span>`:isToday?'<div style="width:5px; height:5px; border-radius:50%; background:#007AFF; margin-top:4px;"></div>':""}
                        </div>
                        <div class="day-events">
                            ${dayVerifiche.slice(0,2).map(v=>{const color=getSubjectColor(v.subject),abbrev=getSubjectAbbrev(v.subject);return`<div class="event-badge" aria-label="Verifica ${escapeHtml(v.subject||"")}" style="background:${color}; outline:2px solid rgba(255,159,10,0.6); outline-offset:-1px;" title="${escapeHtml(v.tipo+(v.text?": "+v.text:""))}">${abbrev}\u270F</div>`}).join("")}
                            ${dayTasks.slice(0,Math.max(0,3-dayVerifiche.length)).map(t=>{const color=getSubjectColor(t.subject),abbrev=getSubjectAbbrev(t.subject);return`<div class="event-badge ${t.done?"done":""}" style="background: ${color}">${abbrev}</div>`}).join("")}
                            ${dayVerifiche.length+dayTasks.length>3?`<div class="more-events">+${dayVerifiche.length+dayTasks.length-3}</div>`:""}
                       </div>
                   </div>
                `,tempDate.setDate(tempDate.getDate()+1)}html+="</div></div>";const listHtml=renderCalendarWeekList(startDate);calendarEl.innerHTML=html+listHtml,typeof animatePlannerSurface=="function"&&animatePlannerSurface("calendar")}function renderCalendarWeekList(weekStart){const today=new Date;today.setHours(0,0,0,0);const todayISO=getLocalDateString(today),dayNames=["LUN","MAR","MER","GIO","VEN","SAB","DOM"],monthNames=["GEN","FEB","MAR","APR","MAG","GIU","LUG","AGO","SET","OTT","NOV","DIC"],verificheByDate={};(state.verifiche||[]).forEach(v=>{const dateKey=v.data||"";dateKey&&(verificheByDate[dateKey]||(verificheByDate[dateKey]=[]),verificheByDate[dateKey].push({subject:v.materia||v.subject||"",text:v.text||v.descrizione||"",tipo:v.tipo||"",isVerifica:!0}))}),(state.manualVerifiche||[]).forEach(v=>{const dateKey=v.date||"";dateKey&&(verificheByDate[dateKey]||(verificheByDate[dateKey]=[]),verificheByDate[dateKey].push({subject:v.subject||"",text:v.args||"",tipo:v.type||"",isVerifica:!0}))});let hasAny=!1,daySections="",totalItems=0;for(let i=0;i<7;i++){const dayDate=new Date(weekStart);dayDate.setDate(weekStart.getDate()+i);const dateStr=getLocalDateString(dayDate),isToday=dateStr===todayISO,isTomorrow=(()=>{const tm=new Date;return tm.setDate(tm.getDate()+1),dateStr===getLocalDateString(tm)})(),isPast=dayDate<today&&!isToday,dayTasks=getCalendarTasksForDate(dateStr),dayVerifiche=verificheByDate[dateStr]||[];if(dayTasks.length===0&&dayVerifiche.length===0)continue;hasAny=!0,totalItems+=dayTasks.length+dayVerifiche.length;const labelText=isToday?"OGGI":isTomorrow?"DOMANI":"",labelColor=isToday?"var(--success)":"#FF9F0A";daySections+=`
            <div class="asw-day-section">
                <div class="asw-day-header">
                    <div class="asw-date-block">
                        <span class="asw-day-name" style="color:${isToday?"var(--success)":isPast?"var(--outline)":"var(--on-surface-variant)"};">${dayNames[i]}</span>
                        <span class="asw-day-num" style="color:${isToday?"var(--success)":isPast?"var(--outline)":"var(--on-surface)"};">${dayDate.getDate()}</span>
                        <span class="asw-month" style="color:${isPast?"var(--outline)":"var(--on-surface-variant)"};">${monthNames[dayDate.getMonth()]}</span>
                    </div>
                    <div class="asw-separator"></div>
                    ${labelText?`<span class="asw-label-tag" style="color:${labelColor}; border-color:${labelColor};">${labelText}</span>`:""}
                </div>
                <div class="asw-tasks-list">
                    ${dayVerifiche.map(v=>{const abbr=getSubjectAbbrev(v.subject),subjColor=getSubjectColor(v.subject);return`
                        <div class="asw-task-card asw-verifica-card">
                            <div class="asw-task-stripe" style="background:#FF9F0A;"></div>
                            <div class="asw-task-body">
                                <div class="asw-task-meta">
                                    <span class="asw-subject-badge" style="color:var(--warning); background:rgba(255,159,10,0.1);">${escapeHtml(abbr)}</span>
                                    <span class="asw-verifica-tag"><i class="ph-bold ph-pencil-simple"></i> ${escapeHtml(normalizeTipoVerifica(v.tipo))}</span>
                                </div>
                                <div class="asw-task-text">${escapeHtml(v.text||v.subject)}</div>
                            </div>
                        </div>`}).join("")}
                    ${dayTasks.map(t=>{const subjColor=getSubjectColor(t.subject),abbr=getSubjectAbbrev(t.subject),displayText=(t.text||"").replace(/\*/g,"").trim();return`
                        <div class="asw-task-card${t.done?" asw-task-done":""}${isPast&&!t.done?" asw-task-past":""}" onclick="toggleTask('${escapeJsSingleQuote(t.id)}',event)">
                            <div class="asw-task-stripe" style="background:${t.done?"var(--outline-variant)":subjColor};"></div>
                            <div class="asw-task-body">
                                <div class="asw-task-meta">
                                    <span class="asw-subject-badge" style="color:${t.done?"var(--on-surface-variant)":subjColor}; background:rgba(0,0,0,0.04);">${escapeHtml(abbr)}</span>
                                </div>
                                <div class="asw-task-text" data-task-text="${escapeHtml(t.id)}">${escapeHtml(displayText)}</div>
                            </div>
                            <div class="asw-task-actions">
                                <div class="asw-toggle-btn" data-task-toggle="${t.id}" style="border-color:${t.done?"var(--on-surface)":"var(--outline-variant)"}; background:${t.done?"var(--on-surface)":"transparent"};">
                                    ${t.done?'<i class="ph-bold ph-check" style="font-size:11px; color:#fff;"></i>':""}
                                </div>
                                ${isUserGeneratedTaskId(t.id)?`
                                <button class="asw-delete-btn" onclick="event.stopPropagation(); deleteCalendarTask('${escapeJsSingleQuote(t.id)}');" aria-label="Elimina attivit\xE0">
                                    <i class="ph-bold ph-trash" style="font-size:11px;"></i>
                                </button>`:""}
                            </div>
                        </div>`}).join("")}
                </div>
            </div>`}return hasAny?`<div class="asw-root">
        <div class="asw-header">
            <span class="asw-header-title">// AGENDA SETTIMANALE</span>
            <span class="asw-header-count">${totalItems} ITEM${totalItems!==1?"S":""}</span>
        </div>
        <div class="asw-body">${daySections}</div>
    </div>`:""}function navigateCalendar(dir){calendarState.weekOffset+=dir,renderCustomCalendar()}function handleDayClick(dateStr){typeof renderDayDetailModal=="function"&&renderDayDetailModal(dateStr)}function renderLogin(){const savedSession=typeof sessionManager<"u"&&sessionManager.load?sessionManager.load():null,hasSession=savedSession&&(typeof sessionManager<"u"&&sessionManager.isLoggedIn?sessionManager.isLoggedIn():!!savedSession.userName),rawName=typeof getSafeUserName=="function"?getSafeUserName():state.user?.name||savedSession?.name||savedSession?.userName||"Utente",userName=escapeHtml(typeof toDisplayName=="function"?toDisplayName(rawName):rawName),effClass=typeof getEffectiveUserClass=="function"?getEffectiveUserClass():state.user?.class||savedSession?.class||"",userClass=escapeHtml(effClass||"Studente"),initials=(rawName||"U").trim().split(" ").map(function(w){return w[0]}).slice(0,2).join("").toUpperCase()||"U";return`
    <div class="view login-view min-h-screen hide-scrollbar"
         style="min-height:100vh;height:100dvh;overflow-y:auto;-webkit-overflow-scrolling:touch;background:var(--background, #0b1326);font-family:'Inter',sans-serif;color:#dae2fd;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:max(env(safe-area-inset-top,0px),32px) 24px max(env(safe-area-inset-bottom,0px),32px);position:relative;">

        <!-- Ambient Glow Spheres (Deep Royal Blue) -->
        <div style="position:fixed;top:0;left:50%;transform:translateX(-50%);width:360px;height:360px;background:radial-gradient(circle,rgba(37,99,235,0.22) 0%,rgba(29,78,216,0.08) 50%,transparent 70%);filter:blur(60px);pointer-events:none;z-index:0;"></div>
        <div style="position:fixed;bottom:0;right:0;width:280px;height:280px;background:radial-gradient(circle,rgba(41,151,255,0.12) 0%,transparent 70%);filter:blur(50px);pointer-events:none;z-index:0;"></div>

        <div style="position:relative;z-index:1;width:100%;max-width:400px;display:flex;flex-direction:column;align-items:center;text-align:center;">

            <!-- App Icon Tile with Specular Rim & Glowing Shadow -->
            <div style="width:84px;height:84px;border-radius:26px;
                        background:rgba(23,31,51,0.85);backdrop-filter:blur(30px);-webkit-backdrop-filter:blur(30px);
                        border:1px solid rgba(182,196,255,0.2);border-top:1px solid rgba(255,255,255,0.4);
                        display:flex;align-items:center;justify-content:center;margin-bottom:20px;
                        box-shadow:0 16px 36px -8px rgba(6,14,32,0.8), 0 0 24px rgba(37,99,235,0.3);
                        position:relative;overflow:hidden;">
                <img src="gandhi-diary-icon-192.png" alt="Gandhi Diary"
                     onerror="this.src='gandhi-diary-icon-512.png'"
                     style="width:58px;height:58px;border-radius:18px;object-fit:cover;">
            </div>

            <!-- Header Titles -->
            <div style="display:inline-flex;align-items:center;gap:6px;background:rgba(37,99,235,0.18);border:0.5px solid rgba(182,196,255,0.25);padding:3px 10px;border-radius:999px;margin-bottom:10px;">
                <span style="width:6px;height:6px;border-radius:50%;background:#30d158;box-shadow:0 0 6px #30d158;"></span>
                <span style="font-size:11px;font-weight:800;color:#b6c4ff;letter-spacing:0.06em;text-transform:uppercase;">LICEO GANDHI \xB7 DIARIO DIGITALE</span>
            </div>

            <h1 style="font-size:32px;font-weight:900;color:#ffffff;letter-spacing:-0.03em;margin:0 0 8px;line-height:1.15;">
                Gandhi Diary
            </h1>
            <p style="font-size:14px;font-weight:500;color:#c4c5d6;line-height:1.5;margin:0 0 24px;max-width:320px;">
                Il compagno di studio moderno, veloce e intelligente per gli studenti del Liceo Gandhi.
            </p>

            <!-- Feature Glass Bento Rows -->
            <div style="width:100%;display:flex;flex-direction:column;gap:8px;margin-bottom:28px;">
                <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:16px;background:rgba(23,31,51,0.65);backdrop-filter:blur(20px);border:1px solid rgba(182,196,255,0.12);text-align:left;">
                    <div style="width:34px;height:34px;border-radius:10px;background:rgba(37,99,235,0.18);border:1px solid rgba(182,196,255,0.25);display:flex;align-items:center;justify-content:center;color:#2997ff;flex-shrink:0;">
                        <i class="ph-bold ph-lightning" style="font-size:18px;"></i>
                    </div>
                    <div style="min-width:0;">
                        <div style="font-size:13px;font-weight:700;color:#ffffff;">Sincronizzazione DidUP Istantanea</div>
                        <div style="font-size:11px;color:#8e909f;font-weight:500;">Voti, compiti, verifiche e assenze sempre aggiornati</div>
                    </div>
                </div>

                <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:16px;background:rgba(23,31,51,0.65);backdrop-filter:blur(20px);border:1px solid rgba(182,196,255,0.12);text-align:left;">
                    <div style="width:34px;height:34px;border-radius:10px;background:rgba(48,209,88,0.16);border:1px solid rgba(48,209,88,0.3);display:flex;align-items:center;justify-content:center;color:#30d158;flex-shrink:0;">
                        <i class="ph-bold ph-calendar-check" style="font-size:18px;"></i>
                    </div>
                    <div style="min-width:0;">
                        <div style="font-size:13px;font-weight:700;color:#ffffff;">Google Calendar Cloud Sync</div>
                        <div style="font-size:11px;color:#8e909f;font-weight:500;">Compiti, verifiche e assenze sincronizzati nel calendario</div>
                    </div>
                </div>
            </div>

            <!-- Action Area -->
            <div style="width:100%;display:flex;flex-direction:column;gap:12px;">
                ${hasSession?`
                <!-- Resume Session Card -->
                <div style="background:rgba(23,31,51,0.85);backdrop-filter:blur(30px);-webkit-backdrop-filter:blur(30px);
                            border:1px solid rgba(182,196,255,0.16);border-top:1px solid rgba(255,255,255,0.3);
                            border-radius:24px;padding:18px 18px 16px;box-shadow:0 12px 32px -8px rgba(6,14,32,0.6);margin-bottom:6px;">
                    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;text-align:left;">
                        <div style="width:46px;height:46px;border-radius:14px;background:linear-gradient(135deg,#1d4ed8,#2563eb);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;color:#ffffff;flex-shrink:0;box-shadow:0 4px 14px rgba(37,99,235,0.4);">
                            ${initials}
                        </div>
                        <div style="min-width:0;flex:1;">
                            <div style="font-size:11px;font-weight:700;color:#8e909f;text-transform:uppercase;letter-spacing:0.06em;">Sessione Salvata</div>
                            <div style="font-size:16px;font-weight:800;color:#ffffff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${userName}</div>
                            <div style="font-size:11.5px;font-weight:600;color:#b6c4ff;">${userClass}</div>
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;">
                        <button onclick="if(typeof window.triggerHaptic==='function')window.triggerHaptic('medium');navigate('home')"
                            style="flex:1;height:46px;border-radius:14px;border:none;cursor:pointer;
                                   background:linear-gradient(135deg,#1d4ed8 0%,#2563eb 100%);color:#ffffff;
                                   font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:6px;
                                   box-shadow:0 4px 16px rgba(37,99,235,0.45);transition:transform 0.12s ease;"
                            ontouchstart="this.style.transform='scale(0.97)'"
                            ontouchend="this.style.transform='scale(1)'">
                            Continua <i class="ph-bold ph-arrow-right" style="font-size:16px;"></i>
                        </button>
                        <button onclick="if(typeof window.triggerHaptic==='function')window.triggerHaptic('light');window.openArgoLogin()"
                            style="height:46px;padding:0 14px;border-radius:14px;border:1px solid rgba(255,255,255,0.14);cursor:pointer;
                                   background:rgba(255,255,255,0.06);color:#dae2fd;font-size:13px;font-weight:700;white-space:nowrap;transition:transform 0.12s ease;"
                            ontouchstart="this.style.transform='scale(0.97)'"
                            ontouchend="this.style.transform='scale(1)'">
                            Altro Account
                        </button>
                    </div>
                </div>
                `:`
                <!-- Main Login Button -->
                <button onclick="if(typeof window.triggerHaptic==='function')window.triggerHaptic('medium');window.openArgoLogin()"
                    style="width:100%;height:54px;border-radius:18px;border:none;cursor:pointer;
                           background:linear-gradient(135deg,#1d4ed8 0%,#2563eb 60%,#3b82f6 100%);color:#ffffff;
                           font-size:16px;font-weight:800;font-family:'Inter',sans-serif;
                           display:flex;align-items:center;justify-content:center;gap:10px;
                           box-shadow:0 8px 28px -6px rgba(37,99,235,0.6), inset 0 1px 1px rgba(255,255,255,0.35);
                           transition:transform 0.15s ease;"
                    ontouchstart="this.style.transform='scale(0.97)'"
                    ontouchend="this.style.transform='scale(1)'">
                    <i class="ph-bold ph-sign-in" style="font-size:20px;"></i>
                    Accedi con DidUP
                </button>
                `}
            </div>

            <!-- Security Footer Note -->
            <div style="display:inline-flex;align-items:center;justify-content:center;gap:7px;margin-top:20px;color:#8e909f;font-size:11.5px;font-weight:600;line-height:1;text-align:center;">
                <i class="ph-fill ph-shield-check" style="font-size:15px;color:#30d158;display:inline-block;vertical-align:middle;flex-shrink:0;"></i>
                <span style="display:inline-block;vertical-align:middle;line-height:1.2;">Crittografia end-to-end \xB7 Credenziali protette sul dispositivo</span>
            </div>

        </div>
    </div>
    `}function gcInitMediaWidgetSwipe(){const widget=document.getElementById("home-media-widget"),track=document.getElementById("home-media-track");if(!widget||!track)return;let currentSlide=0,startX=0,startY=0,currentX=0,currentY=0,isDragging=!1,isHorizontal=null;const totalSlides=track.children.length;function goToSlide(index){currentSlide=Math.max(0,Math.min(totalSlides-1,index)),track.style.transform=`translateX(-${currentSlide*100}%)`;for(let i=0;i<totalSlides;i++){const dot=document.getElementById(`home-media-dot${i}`);dot&&(i===currentSlide?(dot.style.width="18px",dot.style.background="#ffffff",dot.style.opacity="1"):(dot.style.width="5px",dot.style.background="rgba(255,255,255,0.3)",dot.style.opacity="0.6"))}}function handleSwipe(){if(currentX!==0&&isHorizontal){const diffX=startX-currentX;Math.abs(diffX)>35&&(diffX>0&&currentSlide<totalSlides-1?goToSlide(currentSlide+1):diffX<0&&currentSlide>0&&goToSlide(currentSlide-1))}startX=0,startY=0,currentX=0,currentY=0,isHorizontal=null}widget.addEventListener("touchstart",e=>{startX=e.touches[0].clientX,startY=e.touches[0].clientY,currentX=startX,currentY=startY,isDragging=!0,isHorizontal=null},{passive:!0}),widget.addEventListener("touchmove",e=>{if(isDragging&&(currentX=e.touches[0].clientX,currentY=e.touches[0].clientY,isHorizontal===null)){const dx=Math.abs(currentX-startX),dy=Math.abs(currentY-startY);(dx>8||dy>8)&&(isHorizontal=dx>dy)}},{passive:!0}),widget.addEventListener("touchend",()=>{isDragging&&(isDragging=!1,handleSwipe())}),widget.addEventListener("mousedown",e=>{startX=e.clientX,currentX=startX,isDragging=!0,isHorizontal=!0}),widget.addEventListener("mousemove",e=>{isDragging&&(currentX=e.clientX)}),widget.addEventListener("mouseup",()=>{isDragging&&(isDragging=!1,handleSwipe())}),widget.addEventListener("mouseleave",()=>{isDragging&&(isDragging=!1,handleSwipe())}),window._gcMediaGoToSlideImpl=goToSlide}window.gcMediaGoToSlide=function(index){typeof window._gcMediaGoToSlideImpl=="function"&&window._gcMediaGoToSlideImpl(index)};function renderHome(){window.handleCarouselScroll=function(el){const scrollLeft=el.scrollLeft,width=el.clientWidth,index=Math.round(scrollLeft/width),dots=document.querySelectorAll(".carousel-dot"),cs=getComputedStyle(document.documentElement),activeBg=cs.getPropertyValue("--primary").trim()||"#0250C5",inactiveBg=cs.getPropertyValue("--surface-container-high").trim()||"#CBD5E1";dots.forEach((dot,idx)=>{idx===index?(dot.style.width="20px",dot.style.height="6px",dot.style.background=activeBg):(dot.style.width="6px",dot.style.height="6px",dot.style.background=inactiveBg)})};const isInitialLoad=!state.lastSync&&(!state.tasks||state.tasks.length===0)&&(!state.voti||state.voti.length===0),currentSchoolYearKey=typeof getCurrentSchoolYearKey=="function"?getCurrentSchoolYearKey():"2026/27",currentYearVotes=typeof getVotesForSchoolYear=="function"?getVotesForSchoolYear(currentSchoolYearKey):state.voti||[],trendSummary=getGradeMonthlyTrendSummary(currentYearVotes),media=trendSummary.media!==null?trendSummary.media:parseFloat(calcolaMedia(currentYearVotes))||0,hasHomeMedia=trendSummary.media!==null&&Number.isFinite(trendSummary.media)&&currentYearVotes.length>0,diffStr=trendSummary.diffStr,isPositive=trendSummary.isPositive,assenze=state.assenzeData||{},verifiche=state.manualVerifiche||[],oreAssenzaTotali=typeof assenze.oreAssenzaTotali=="number"?assenze.oreAssenzaTotali:0,ritardiTotali=typeof assenze.totaleRitardi=="number"?assenze.totaleRitardi:0,usciteTotali=typeof assenze.totaleUscite=="number"?assenze.totaleUscite:0,assenzeGiorni=typeof assenze.totaleAssenze=="number"?assenze.totaleAssenze:0,today=new Date,todayISO=getLocalDateString(today),tomorrow=new Date(today);tomorrow.setDate(tomorrow.getDate()+1);const tomorrowISO=getLocalDateString(tomorrow),isVerificaItem=item=>{if(!item)return!1;if(item.isExam)return!0;const typeStr=String(item.type||item.tipo||"").toLowerCase();if(typeStr.includes("verifica")||typeStr.includes("orale")||typeStr.includes("pratica")||typeStr.includes("test")||typeStr.includes("esame"))return!0;const textStr=`${item.text||""} ${item.desc||""} ${item.descrizione||""} ${item.title||""} ${item.subject||""} ${item.materia||""}`.toLowerCase();return/verifica|interrogazione|test|esame|simulazione/i.test(textStr)},todayVerifiche=(state.verifiche||[]).filter(v=>v.data===todayISO),todayHomework=(state.tasks||[]).filter(t=>t.due_date===todayISO&&t.subject!=="QUEST"),seenToday=new Set,allTodayItems=[];todayVerifiche.forEach(v=>{const key=`${v.id||""}||${v.materia||v.subject||""}||${v.text||""}`;seenToday.has(key)||(seenToday.add(key),allTodayItems.push({id:v.id,isExam:!0,subject:v.materia||v.subject||"Materia",desc:v.text||v.descrizione||"Verifica in programma",done:!1}))}),todayHomework.forEach(h=>{const isExam=isVerificaItem(h),key=`${h.id||""}||${h.subject||""}||${h.text||""}`;seenToday.has(key)||(seenToday.add(key),allTodayItems.push({id:h.id,isExam,subject:h.subject||h.materia||"Materia",desc:h.text||h.title||"",done:!!h.done}))});const tomorrowVerifiche=(state.verifiche||[]).filter(v=>v.data===tomorrowISO),tomorrowHomework=(state.tasks||[]).filter(t=>t.due_date===tomorrowISO&&t.subject!=="QUEST"),seenTomorrow=new Set,allTomorrowItems=[];tomorrowVerifiche.forEach(v=>{const key=`${v.id||""}||${v.materia||v.subject||""}||${v.text||""}`;seenTomorrow.has(key)||(seenTomorrow.add(key),allTomorrowItems.push({id:v.id,isExam:!0,subject:v.materia||v.subject||"Materia",desc:v.text||v.descrizione||"Verifica in programma",done:!1}))}),tomorrowHomework.forEach(h=>{const isExam=isVerificaItem(h),key=`${h.id||""}||${h.subject||""}||${h.text||""}`;seenTomorrow.has(key)||(seenTomorrow.add(key),allTomorrowItems.push({id:h.id,isExam,subject:h.subject||h.materia||"Materia",desc:h.text||h.title||"",done:!!h.done}))});const argoUpcoming=(state.verifiche||[]).filter(v=>v.data&&v.data>=todayISO).map(v=>({materia:v.materia||v.subject||"",data:v.data,text:v.text||v.descrizione||"",tipo:v.tipo||"",source:"argo"})),manualUpcoming=(state.manualVerifiche||[]).filter(v=>!v.done&&v.date&&v.date>=todayISO).map(v=>({materia:v.subject||"",data:v.date,text:v.args||"",tipo:v.type||"",source:"manual",id:v.id})),seenVerifiche=new Set,nextVerifica=[...argoUpcoming,...manualUpcoming].filter(v=>{const key=`${v.data}||${v.materia.toLowerCase()}`;return seenVerifiche.has(key)?!1:(seenVerifiche.add(key),!0)}).sort((a,b)=>a.data.localeCompare(b.data))[0];let daysDiff=0,countdownText="",urgencyLabel="",urgencyColor="",progressWidth=100;if(nextVerifica){const examDate=parseLocalDate(nextVerifica.data),todayZero=new Date(today);todayZero.setHours(0,0,0,0);const timeDiff=examDate.getTime()-todayZero.getTime();daysDiff=Math.ceil(timeDiff/(1e3*3600*24)),daysDiff<0?countdownText="Superata":daysDiff===0?countdownText="Oggi":daysDiff===1?countdownText="Domani":countdownText=`${daysDiff} gg`,daysDiff<=2?(urgencyLabel="HARD",urgencyColor="color:var(--error); background:var(--error-container); border:1px solid var(--outline-variant);"):daysDiff<=5?(urgencyLabel="MEDIUM",urgencyColor="color:var(--warning); background:var(--warning-container); border:1px solid var(--outline-variant);"):(urgencyLabel="EASY",urgencyColor="color:var(--success); background:var(--success-container); border:1px solid var(--outline-variant);"),progressWidth=Math.max(0,Math.min(100,(10-daysDiff)/10*100))}const renderHomeItemCard=(item,defaultTimeLabel)=>{const isExam=item.isExam,theme=typeof getSubjectTheme=="function"?getSubjectTheme(item.subject):{color:"#2997ff",icon:"ph-book-open"},cardBg=isExam?"linear-gradient(135deg, rgba(239,68,68,0.22) 0%, rgba(20,31,54,0.92) 100%)":"rgba(20,31,54,0.78)",cardBorder=isExam?"1px solid rgba(239,68,68,0.45)":"0.5px solid rgba(255,255,255,0.12)",cardShadow=isExam?"box-shadow:0 0 22px rgba(239,68,68,0.22);":"",accentColor=isExam?"#ff453a":"#2997ff",iconName=isExam?"ph-exam":"ph-book-open",iconBg=isExam?"rgba(239,68,68,0.25)":"rgba(41,151,255,0.16)",iconColor=isExam?"#ffb4ab":"#2997ff",iconBorder=isExam?"rgba(239,68,68,0.45)":"rgba(41,151,255,0.32)",badgeHtml=isExam?'<span style="background:rgba(239,68,68,0.28);color:#ffb4ab;font-size:9.5px;font-weight:800;padding:3px 9px;border-radius:999px;letter-spacing:0.05em;border:1px solid rgba(239,68,68,0.45);display:inline-flex;align-items:center;gap:4px;"><i class="ph-fill ph-warning" style="font-size:10px;"></i> VERIFICA</span>':'<span style="background:rgba(41,151,255,0.16);color:#2997ff;font-size:9.5px;font-weight:800;padding:3px 9px;border-radius:999px;letter-spacing:0.05em;border:0.5px solid rgba(41,151,255,0.35);display:inline-flex;align-items:center;gap:4px;"><i class="ph-fill ph-check-square" style="font-size:10px;"></i> COMPITO</span>',timeStr=isExam?"09:00 - 12:00":defaultTimeLabel||"In programma",doneStyle=item.done?"opacity:0.55;":"",doneText=item.done?"text-decoration:line-through;":"";return`
        <div class="home-task-card" onclick="openTaskDetailModal('${escapeJsSingleQuote(item.id)}')" ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform='scale(1)'" style="
            background:${cardBg};
            backdrop-filter:blur(25px) saturate(180%);-webkit-backdrop-filter:blur(25px) saturate(180%);
            border:${cardBorder};border-top:1px solid rgba(255,255,255,0.25);
            border-radius:22px;padding:16px 18px;margin-bottom:10px;
            position:relative;overflow:hidden;cursor:pointer;
            transition:transform 0.15s ease;${cardShadow}${doneStyle}
        ">
            <!-- Accento laterale -->
            <div style="position:absolute;left:0;top:15%;height:70%;width:${isExam?"4px":"3.5px"};background:${accentColor};border-radius:0 4px 4px 0;"></div>

            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding-left:8px;">
                <div style="display:flex;align-items:center;gap:10px;">
                    <div style="width:38px;height:38px;border-radius:12px;background:${iconBg};border:0.5px solid ${iconBorder};display:flex;align-items:center;justify-content:center;color:${iconColor};flex-shrink:0;">
                        <i class="ph-bold ${iconName}" style="font-size:19px;"></i>
                    </div>
                    <div>
                        <span style="font-size:10.5px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;color:${isExam?"#ffb4ab":theme.color};">${escapeHtml(item.subject)}</span>
                    </div>
                </div>
                <div>
                    ${badgeHtml}
                </div>
            </div>

            <h4 style="font-size:14.5px;font-weight:700;color:#ffffff;margin:0 0 4px 8px;line-height:1.3;${doneText}">${escapeHtml(item.desc||item.subject)}</h4>

            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;padding-left:8px;">
                <div style="display:flex;align-items:center;color:rgba(255,255,255,0.55);font-size:11.5px;">
                    <i class="ph ph-clock" style="font-size:13px;margin-right:5px;"></i>
                    <span style="font-weight:500;">${timeStr}</span>
                </div>
                <span style="font-size:11px;font-weight:600;color:rgba(182,196,255,0.7);display:flex;align-items:center;gap:2px;">
                    Dettagli <i class="ph-bold ph-caret-right" style="font-size:11px;"></i>
                </span>
            </div>
        </div>`},htmlOggi=allTodayItems.length>0?allTodayItems.map(item=>renderHomeItemCard(item,"Oggi")).join(""):'<div class="empty-state-card" style="text-align:center;padding:24px 16px;background:rgba(20,31,54,0.78);backdrop-filter:blur(25px);border:0.5px solid rgba(255,255,255,0.12);border-radius:22px;color:rgba(255,255,255,0.5);font-size:13px;font-style:italic;">Nessun compito o verifica per oggi.</div>',htmlDomani=allTomorrowItems.length>0?allTomorrowItems.map(item=>renderHomeItemCard(item,"Scadenza domani")).join(""):'<div class="empty-state-card" style="text-align:center;padding:24px 16px;background:rgba(20,31,54,0.78);backdrop-filter:blur(25px);border:0.5px solid rgba(255,255,255,0.12);border-radius:22px;color:rgba(255,255,255,0.5);font-size:13px;font-style:italic;">Nessun impegno programmato per domani.</div>';setTimeout(()=>{window.lucide&&lucide.createIcons()},80),setTimeout(()=>{typeof gcInitMediaWidgetSwipe=="function"&&gcInitMediaWidgetSwipe()},80);const userPhoto=state.userPhoto||"",avatarHtml=userPhoto?`<img src="${escapeHtml(userPhoto)}" style="width:44px;height:44px;border-radius:50%;object-fit:cover;cursor:pointer;border:1px solid rgba(255,255,255,0.2);" onclick="navigate('profile')" alt="Profilo">`:`<div style="width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;cursor:pointer;" onclick="navigate('profile')">
            <i class="ph ph-user" style="font-size:22px;color:#ffffff;"></i>
           </div>`,_homeNotifCount=(typeof window.getComprehensiveNotificationData=="function"?window.getComprehensiveNotificationData():{todayCount:0,todayItems:[],upcomingItems:[],recentItems:[]}).todayCount,_homeNotifLabel=_homeNotifCount===0?"Nessuna novit\xE0 oggi":_homeNotifCount===1?"1 novit\xE0 oggi":`${_homeNotifCount} novit\xE0 oggi`,_mediaColor=media>=8?"#30d158":media>=7?"#64d2ff":media>=6?"#ff9f0a":media>0?"#ff453a":"#8e909f",_monteOreTotale=Number(assenze.monteOreAnnuale)>0?Number(assenze.monteOreAnnuale):null,_limiteOreMax=_monteOreTotale?Math.round(_monteOreTotale*.25):null,_assenzePctTotale=_monteOreTotale?(oreAssenzaTotali/_monteOreTotale*100).toFixed(1):"\u2014",_assenzeStatusColor=_limiteOreMax&&oreAssenzaTotali>=_limiteOreMax?"#ff453a":_limiteOreMax&&oreAssenzaTotali>=_limiteOreMax*.75?"#ff9f0a":"#30d158",_assenzeStatusBg=_limiteOreMax&&oreAssenzaTotali>=_limiteOreMax?"rgba(255,69,58,0.15)":_limiteOreMax&&oreAssenzaTotali>=_limiteOreMax*.75?"rgba(255,159,10,0.15)":"rgba(48,209,88,0.15)",_countdownsData=typeof window.getSchoolCountdowns=="function"?window.getSchoolCountdowns():null,_nearestMilestone=_countdownsData?.nearest||{title:"Calendario da impostare",emoji:"\u{1F4C5}",badgeText:"Imposta le date",dateFormatted:"Date personali"},_todayMoodEntry=(typeof window.getDailyMoods=="function"?window.getDailyMoods():{})[todayISO]||null,_hour=today.getHours(),_greetWord=_hour<6?"Buonanotte":_hour<12?"Buongiorno":_hour<18?"Buon pomeriggio":"Buonasera";return`
    <main class="view-fullbleed min-h-screen pb-32 pt-2 font-sans text-[#dae2fd] antialiased overflow-y-auto hide-scrollbar" style="background:var(--background, #0b1326);">

        <div style="padding:0;">

            <!-- HEADER (iOS HIG Large Title): Overview + Rewind Circular Badge + Avatar -->
            <header class="ios-header-wrapper" style="display:flex;justify-content:space-between;align-items:flex-end;padding:max(env(safe-area-inset-top,0px),24px) 20px 14px 20px;">
                <div>
                    <div class="ios-sub-title" style="color:rgba(255,255,255,0.5);font-weight:700;letter-spacing:0.06em;font-size:11px;">PANORAMICA</div>
                    <h1 class="ios-large-title" style="color:#ffffff;font-weight:800;font-size:32px;letter-spacing:-0.03em;margin:2px 0 0;">Overview</h1>
                </div>
                <div style="display:flex;align-items:center;gap:12px;">
                    ${typeof window.renderTodayRewindBadgeHTML=="function"?window.renderTodayRewindBadgeHTML():""}
                    ${avatarHtml}
                </div>
            </header>

            <div style="margin-bottom: 16px; padding: 0 20px;">
                <!-- WIDGET PRINCIPALE \u2014 Apple Liquid Glass Carousel a 3 Slide -->
                <div id="home-media-widget" style="
                    background: linear-gradient(150deg, rgba(22,34,58,0.92) 0%, rgba(10,16,30,0.96) 100%);
                    backdrop-filter: blur(40px) saturate(210%);-webkit-backdrop-filter: blur(40px) saturate(210%);
                    border: 0.5px solid rgba(255,255,255,0.14);
                    border-top: 1px solid rgba(255,255,255,0.30);
                    border-radius: 28px;
                    position: relative;
                    overflow: hidden;
                    box-shadow: 0 16px 40px -10px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.18);
                    user-select: none;
                ">
                    <!-- Glow Spheres Liquid Glass (Corner Anchored - Deep Indigo & Azure) -->
                    <div style="position:absolute;top:0;right:0;width:170px;height:170px;transform:translate(35%,-35%);background:radial-gradient(circle,rgba(41,151,255,0.24) 0%,rgba(56,189,248,0.10) 50%,transparent 70%);pointer-events:none;filter:blur(30px);border-radius:9999px;"></div>
                    <div style="position:absolute;bottom:0;left:0;width:170px;height:170px;transform:translate(-35%,35%);background:radial-gradient(circle,rgba(99,102,241,0.22) 0%,rgba(41,151,255,0.12) 50%,transparent 70%);pointer-events:none;filter:blur(30px);border-radius:9999px;"></div>

                    <!-- Carousel Track -->
                    <div id="home-media-track" style="display:flex;width:100%;transition:transform 0.4s cubic-bezier(0.16,1,0.3,1);will-change:transform;">

                        <!-- \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 SLIDE 1: QUADRO GENERALE & MEDIA (Spazioso Saluto Hero) \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 -->
                        <div style="width:100%;min-width:100%;max-width:100%;flex-shrink:0;box-sizing:border-box;padding:20px 20px 16px 20px;display:flex;flex-direction:column;justify-content:space-between;min-height:226px;">
                            <!-- Ampio Saluto Hero -->
                            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
                                <div>
                                    <div style="display:flex;align-items:center;gap:6px;">
                                        <span style="display:flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:6px;background:rgba(41,151,255,0.2);color:#2997ff;font-size:11px;">
                                            <i class="ph-fill ph-sparkle"></i>
                                        </span>
                                        <span style="font-size:10px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#2997ff;">QUADRO GENERALE</span>
                                    </div>
                                    <h2 style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.03em;margin:4px 0 0;line-height:1.2;font-family:'Inter',sans-serif;">
                                        ${_greetWord}, ${toDisplayName(getSafeUserName())}
                                    </h2>
                                    <p style="font-size:12px;font-weight:500;color:rgba(255,255,255,0.55);margin:2px 0 0;">
                                        ${today.toLocaleDateString("it-IT",{weekday:"long",day:"numeric",month:"long"})}
                                    </p>
                                </div>
                                <span style="
                                    font-size:10.5px;font-weight:700;color:rgba(255,255,255,0.7);
                                    background:rgba(255,255,255,0.06);border:0.5px solid rgba(255,255,255,0.12);
                                    padding:4px 10px;border-radius:999px;backdrop-filter:blur(10px);white-space:nowrap;
                                ">
                                    A.S. 2026/27
                                </span>
                            </div>

                            <!-- 3 Bento Badges (Media, Assenze %, Prossima Verifica) -->
                            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
                                <!-- 1. Media -->
                                <div onclick="navigate('voti')" style="
                                    background:rgba(255,255,255,0.04);
                                    border:0.5px solid rgba(255,255,255,0.12);border-top:1px solid rgba(255,255,255,0.22);
                                    border-radius:16px;padding:10px 9px;cursor:pointer;
                                    display:flex;flex-direction:column;justify-content:space-between;min-height:86px;
                                    transition:transform 0.15s ease;
                                " ontouchstart="this.style.transform='scale(0.96)'" ontouchend="this.style.transform='scale(1)'">
                                    <div style="display:flex;align-items:center;justify-content:space-between;">
                                        <span style="font-size:8.5px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:rgba(255,255,255,0.6);">MEDIA</span>
                                        <i class="ph-bold ph-chart-line-up" style="font-size:11px;color:${_mediaColor};"></i>
                                    </div>
                                    <div style="font-size:22px;font-weight:900;color:${_mediaColor};font-variant-numeric:tabular-nums;line-height:1;letter-spacing:-0.03em;margin:3px 0 1px;">
                                        ${hasHomeMedia?media.toFixed(2):"\u2014"}
                                    </div>
                                    <span style="font-size:9px;font-weight:800;color:${hasHomeMedia?isPositive?"#30d158":"#ff453a":"#2997ff"};background:${hasHomeMedia?isPositive?"rgba(48,209,88,0.15)":"rgba(255,69,58,0.15)":"rgba(41,151,255,0.15)"};padding:1px 5px;border-radius:999px;display:inline-flex;align-items:center;gap:2px;width:fit-content;white-space:nowrap;">
                                        <i class="ph-bold ${hasHomeMedia?isPositive?"ph-trend-up":"ph-trend-down":"ph-sparkle"}" style="font-size:8px;"></i>${hasHomeMedia&&diffStr?diffStr:"Nuovo A.S."}
                                    </span>
                                </div>

                                <!-- 2. Assenze % -->
                                <div onclick="mostraAssenzeModal()" style="
                                    background:rgba(255,255,255,0.04);
                                    border:0.5px solid rgba(255,255,255,0.12);border-top:1px solid rgba(255,255,255,0.22);
                                    border-radius:16px;padding:10px 9px;cursor:pointer;
                                    display:flex;flex-direction:column;justify-content:space-between;min-height:86px;
                                    transition:transform 0.15s ease;
                                " ontouchstart="this.style.transform='scale(0.96)'" ontouchend="this.style.transform='scale(1)'">
                                    <div style="display:flex;align-items:center;justify-content:space-between;">
                                        <span style="font-size:8.5px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:rgba(255,255,255,0.6);">ASSENZE</span>
                                        <i class="ph-bold ph-calendar-x" style="font-size:11px;color:${_assenzeStatusColor};"></i>
                                    </div>
                                    <div style="font-size:20px;font-weight:900;color:${_assenzeStatusColor};font-variant-numeric:tabular-nums;line-height:1;letter-spacing:-0.03em;margin:3px 0 1px;">
                                        ${_assenzePctTotale}%
                                    </div>
                                    <span style="font-size:8.5px;font-weight:700;color:${_assenzeStatusColor};background:${_assenzeStatusBg};padding:1px 5px;border-radius:999px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:fit-content;" title="${_monteOreTotale?`Monte ore annuale: ${_monteOreTotale}h`:"Monte ore annuale non disponibile"}">
                                        ${oreAssenzaTotali}h${_monteOreTotale?` / ${_monteOreTotale}h`:""}
                                    </span>
                                </div>

                                <!-- 3. Prossima Verifica -->
                                <div onclick="navigate('planner')" style="
                                    background:rgba(255,255,255,0.04);
                                    border:0.5px solid rgba(255,255,255,0.12);border-top:1px solid rgba(255,255,255,0.22);
                                    border-radius:16px;padding:10px 9px;cursor:pointer;
                                    display:flex;flex-direction:column;justify-content:space-between;min-height:86px;
                                    transition:transform 0.15s ease;
                                " ontouchstart="this.style.transform='scale(0.96)'" ontouchend="this.style.transform='scale(1)'">
                                    <div style="display:flex;align-items:center;justify-content:space-between;">
                                        <span style="font-size:8.5px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:rgba(255,255,255,0.6);">VERIFICA</span>
                                        <i class="ph-bold ph-exam" style="font-size:11px;color:#ff453a;"></i>
                                    </div>
                                    <div style="font-size:12px;font-weight:800;color:#ffffff;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:3px 0 1px;">
                                        ${nextVerifica?escapeHtml(nextVerifica.materia):"Nessuna \u{1F389}"}
                                    </div>
                                    <span style="font-size:8.5px;font-weight:800;color:${nextVerifica?daysDiff<=2?"#ff453a":"#ff9f0a":"#30d158"};background:${nextVerifica?daysDiff<=2?"rgba(255,69,58,0.18)":"rgba(255,159,10,0.18)":"rgba(48,209,88,0.15)"};padding:1px 5px;border-radius:999px;white-space:nowrap;width:fit-content;">
                                        ${nextVerifica?countdownText:"Libero"}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <!-- \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 SLIDE 2: QUANTO MANCA A... (Traguardi Scolastici) \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 -->
                        <div onclick="window.openSchoolCountdownsModal()" style="width:100%;min-width:100%;max-width:100%;flex-shrink:0;box-sizing:border-box;padding:20px 20px 16px 20px;display:flex;flex-direction:column;justify-content:space-between;min-height:226px;cursor:pointer;">
                            <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:0.5px solid rgba(255,255,255,0.08);padding-bottom:10px;">
                                <div style="display:flex;align-items:center;gap:6px;">
                                    <span style="display:flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:6px;background:rgba(99,102,241,0.22);color:#818cf8;font-size:11px;">
                                        <i class="ph-fill ph-hourglass-high"></i>
                                    </span>
                                    <span style="font-size:10.5px;font-weight:800;letter-spacing:0.07em;text-transform:uppercase;color:#818cf8;">QUANTO MANCA A...</span>
                                </div>
                                <span style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.6);">
                                    \u2728 Prossima tappa
                                </span>
                            </div>

                            <div style="text-align:center;margin:2px 0;">
                                <h3 style="font-size:16px;font-weight:800;color:#ffffff;margin:0 0 2px;letter-spacing:-0.02em;">${_nearestMilestone.title}</h3>
                                <p style="font-size:11.5px;color:rgba(255,255,255,0.5);margin:0;">${_nearestMilestone.dateFormatted} \xB7 Tocca per vedere tutti i traguardi</p>
                            </div>

                            <!-- Central Bento Capsule -->
                            <div style="
                                background: rgba(255,255,255,0.05);
                                border: 0.5px solid rgba(255,255,255,0.12);
                                border-top: 1px solid rgba(255,255,255,0.22);
                                border-radius: 16px; padding: 10px 14px;
                                display: flex; align-items: center; justify-content: space-between; gap: 12px;
                                box-shadow: 0 4px 16px rgba(0,0,0,0.25);
                            ">
                                <div style="display:flex;align-items:center;gap:10px;min-width:0;">
                                    <div style="
                                        width:38px;height:38px;border-radius:12px;
                                        background:rgba(99,102,241,0.20);border:0.5px solid rgba(99,102,241,0.40);
                                        display:flex;align-items:center;justify-content:center;
                                        font-size:20px;flex-shrink:0;box-shadow:0 0 14px rgba(99,102,241,0.3);
                                    ">
                                        ${_nearestMilestone.emoji}
                                    </div>
                                    <div style="min-width:0;">
                                        <div style="font-size:13.5px;font-weight:700;color:#ffffff;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                                            ${_nearestMilestone.desc||"Traguardo imminente"}
                                        </div>
                                        <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:1px;">
                                            ${_nearestMilestone.dateFormatted}
                                        </div>
                                    </div>
                                </div>
                                <span style="
                                    font-size:13px;font-weight:900;font-variant-numeric:tabular-nums;
                                    color:#818cf8;background:rgba(99,102,241,0.18);border:0.5px solid rgba(99,102,241,0.35);
                                    padding:5px 12px;border-radius:999px;white-space:nowrap;
                                ">
                                    ${_nearestMilestone.badgeText}
                                </span>
                            </div>

                            <!-- Bottom Progress Line -->
                            <div style="display:flex;flex-direction:column;gap:4px;margin-top:2px;">
                                <div style="display:flex;justify-content:space-between;align-items:center;">
                                    <span style="font-size:9.5px;font-weight:700;color:rgba(255,255,255,0.45);text-transform:uppercase;letter-spacing:0.04em;">Progresso Anno Scolastico</span>
                                    <span style="font-size:10px;font-weight:800;color:#818cf8;">${_countdownsData?.schoolYearProgress??"\u2014"}%</span>
                                </div>
                                <div style="width:100%;height:4px;background:rgba(255,255,255,0.08);border-radius:999px;overflow:hidden;">
                                    <div style="width:${_countdownsData?.schoolYearProgress??0}%;height:100%;background:linear-gradient(90deg,#818cf8,#2997ff);border-radius:999px;"></div>
                                </div>
                            </div>
                        </div>

                        <!-- \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 SLIDE 3: DIARIO & MOOD GIORNALIERO (Com'\xE8 andata oggi?) \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 -->
                        <div style="width:100%;min-width:100%;max-width:100%;flex-shrink:0;box-sizing:border-box;padding:20px 20px 16px 20px;display:flex;flex-direction:column;justify-content:space-between;min-height:226px;">
                            <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:0.5px solid rgba(255,255,255,0.08);padding-bottom:10px;">
                                <div style="display:flex;align-items:center;gap:6px;">
                                    <span style="display:flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:6px;background:rgba(255,214,10,0.2);color:#ffd60a;font-size:11px;">
                                        <i class="ph-fill ph-smiley"></i>
                                    </span>
                                    <span style="font-size:10.5px;font-weight:800;letter-spacing:0.07em;text-transform:uppercase;color:#ffd60a;">DIARIO & MOOD</span>
                                </div>
                                <span id="home-daily-mood-label" style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.6);">
                                    ${_todayMoodEntry?`\u2728 <strong style="color:${_todayMoodEntry.color};">${_todayMoodEntry.emoji} ${_todayMoodEntry.label}</strong>`:"Tocca una faccina"}
                                </span>
                            </div>

                            <div style="text-align:center;margin:2px 0;">
                                <h3 style="font-size:16px;font-weight:800;color:#ffffff;margin:0 0 2px;letter-spacing:-0.02em;">Com'\xE8 andata oggi?</h3>
                                <p style="font-size:11.5px;color:rgba(255,255,255,0.5);margin:0;">Scegli la tua reazione per registrarla nel diario</p>
                            </div>

                            <!-- 5 Faccine Emoji -->
                            <div id="home-daily-mood-buttons" style="display:flex;justify-content:space-between;gap:8px;">
                                ${[{idx:0,emoji:"\u{1F62B}",label:"Pessima",color:"#ff453a",bg:"rgba(255,69,58,0.22)"},{idx:1,emoji:"\u{1F971}",label:"Faticosa",color:"#ff9f0a",bg:"rgba(255,159,10,0.22)"},{idx:2,emoji:"\u{1F610}",label:"Normale",color:"#ffd60a",bg:"rgba(255,214,10,0.22)"},{idx:3,emoji:"\u{1F60A}",label:"Buona",color:"#64d2ff",bg:"rgba(100,210,255,0.22)"},{idx:4,emoji:"\u{1F929}",label:"Top!",color:"#30d158",bg:"rgba(48,209,88,0.22)"}].map(item=>{const isSelected=_todayMoodEntry&&_todayMoodEntry.index===item.idx;return`
                                    <button type="button" data-mood-idx="${item.idx}" onclick="window.setDailyMood(${item.idx})" style="
                                        flex: 1; height: 44px; border-radius: 14px;
                                        background: ${isSelected?item.bg:"rgba(255,255,255,0.06)"};
                                        border: ${isSelected?`1.5px solid ${item.color}`:"0.5px solid rgba(255,255,255,0.12)"};
                                        box-shadow: ${isSelected?`0 0 16px ${item.color}50, 0 4px 12px rgba(0,0,0,0.3)`:"none"};
                                        transform: ${isSelected?"scale(1.12)":"scale(1)"};
                                        font-size: 20px; display: flex; align-items: center; justify-content: center;
                                        cursor: pointer; transition: all 0.2s cubic-bezier(0.16,1,0.3,1);
                                        -webkit-tap-highlight-color: transparent;
                                    " title="${item.label}" ontouchstart="this.style.transform='scale(0.9)'" ontouchend="this.style.transform='${isSelected?"scale(1.12)":"scale(1)"}'">
                                        ${item.emoji}
                                    </button>`}).join("")}
                            </div>

                            <div style="font-size:10px;color:rgba(255,255,255,0.4);text-align:center;margin-top:2px;">
                                \u{1F4C5} Sincronizzato con il calendario del Planner
                            </div>
                        </div>

                    </div>

                    <!-- Capsule Indicator Dots -->
                    <div style="display:flex;align-items:center;justify-content:center;gap:6px;padding:0 0 10px;">
                        <button id="home-media-dot0" onclick="gcMediaGoToSlide(0)" aria-label="Slide 1" style="height:4px;width:18px;background:#ffffff;border-radius:9999px;border:none;padding:0;cursor:pointer;transition:all 0.3s ease;"></button>
                        <button id="home-media-dot1" onclick="gcMediaGoToSlide(1)" aria-label="Slide 2" style="height:4px;width:5px;background:rgba(255,255,255,0.3);border-radius:9999px;border:none;padding:0;cursor:pointer;transition:all 0.3s ease;"></button>
                        <button id="home-media-dot2" onclick="gcMediaGoToSlide(2)" aria-label="Slide 3" style="height:4px;width:5px;background:rgba(255,255,255,0.3);border-radius:9999px;border:none;padding:0;cursor:pointer;transition:all 0.3s ease;"></button>
                    </div>
                </div>
            </div>

            <!-- SEZIONE DOMANI -->
            <div style="padding:0 20px;margin-top:20px;">
                <div style="margin-bottom:20px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding:0 2px;">
                        <h3 style="font-size:20px;font-weight:700;color:#dae2fd;margin:0;letter-spacing:-0.01em;">Domani</h3>
                        <a href="#" style="color:#b6c4ff;font-weight:600;font-size:13px;text-decoration:none;" onclick="navigate('planner')">Vedi tutto</a>
                    </div>
                    ${htmlDomani.includes("empty-state-card")?`
                    <div style="background:rgba(23,31,51,0.85);backdrop-filter:blur(32px) saturate(190%);-webkit-backdrop-filter:blur(32px) saturate(190%);border:0.5px solid rgba(182,196,255,0.14);border-top:1px solid rgba(255,255,255,0.25);border-radius:24px;min-height:84px;display:flex;align-items:center;justify-content:center;text-align:center;padding:16px 20px;">
                        <p style="font-size:13px;color:#8e909f;margin:0;font-style:italic;">Nessun impegno programmato per domani.</p>
                    </div>`:htmlDomani}
                </div>
            </div>



        </div>
    </main>
    `}window.getComprehensiveNotificationData=function(){const today=new Date,todayISO=getLocalDateString(today);function parseItemDateISO(raw){if(!raw)return null;if(typeof raw=="string"){const trimmed=raw.trim();if(/^\d{4}-\d{2}-\d{2}$/.test(trimmed))return trimmed;const isoMatch=trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);if(isoMatch)return`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;const numMatch=trimmed.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/);if(numMatch)return`${numMatch[3]}-${numMatch[2].padStart(2,"0")}-${numMatch[1].padStart(2,"0")}`;const textMatch=trimmed.match(/^(\d{1,2})\s+([a-zA-Zàèéìòù]+)\s+(\d{4})/i);if(textMatch){const mKey=textMatch[2].toLowerCase(),monthMap={gen:"01",gennaio:"01",feb:"02",febbraio:"02",mar:"03",marzo:"03",apr:"04",aprile:"04",mag:"05",maggio:"05",giu:"06",giugno:"06",lug:"07",luglio:"07",ago:"08",agosto:"08",set:"09",sett:"09",settembre:"09",ott:"10",ottobre:"10",nov:"11",novembre:"11",dic:"12",dicembre:"12"},m=monthMap[mKey]||monthMap[mKey.substring(0,3)];if(m)return`${textMatch[3]}-${m}-${textMatch[1].padStart(2,"0")}`}}const d=typeof parseArgoDate=="function"?parseArgoDate(raw):new Date(raw);return d&&!isNaN(d.getTime())&&d.getTime()>864e5?getLocalDateString(d):null}const _getStoredArr=k=>{try{const key=typeof lsKey=="function"?lsKey(k):k;return JSON.parse(localStorage.getItem(key)||localStorage.getItem(k)||"[]")}catch{return[]}},circolariList=(Array.isArray(state.circolari)&&state.circolari.length>0?state.circolari:_getStoredArr("circolari")).map(c=>{const iso=parseItemDateISO(c.dataPubblicazione||c.date||c.data||c.pubblDate||c.data_pubblicazione),rawNum=c.numero||(c.titolo?(c.titolo.match(/n\.?\s*(\d+)/i)||[])[1]:"")||"";return{category:"circolari",categoryLabel:"Circolare",type:"circolare",id:c.id,numero:rawNum,title:c.titolo||c.title||"Circolare",desc:c.descrizione||c.oggetto||(rawNum?`Circolare n. ${rawNum}`:"Comunicazione ufficiale"),borderAccent:"#ffd60a",dateISO:iso,rawDate:c.data||c.date||"",icon:"ph-file-text",iconColor:"#ffd60a",iconBg:"rgba(255,214,10,0.16)",action:`mostraCircolare('${escapeJsSingleQuote(c.id)}')`}}),votiList=(typeof getVotiData=="function"?getVotiData():state.voti||[]).map(v=>{const iso=parseItemDateISO(v.data||v.date),val=v.valore||v.voto||v.value||"",subj=v.materia||v.subject||"Materia",numVal=parseFloat(String(val).replace(",",".")),isGood=!isNaN(numVal)&&numVal>=6,valColor=isNaN(numVal)?"#2997ff":isGood?"#30d158":"#ff453a",valBg=isNaN(numVal)?"rgba(41,151,255,0.18)":isGood?"rgba(48,209,88,0.18)":"rgba(255,69,58,0.18)";return{category:"voti",categoryLabel:"Voto",type:"voto",subject:subj,title:subj,tipo:v.tipo||"Valutazione",commento:v.commento||"",desc:`${v.tipo||"Valutazione"}${v.commento?" \u2014 "+v.commento:""}`,val,valColor,valBg,borderAccent:valColor,dateISO:iso,rawDate:v.data||v.date,icon:"ph-chart-line-up",iconColor:valColor,iconBg:valBg,action:"navigate('voti')"}}),ad=state.assenzeData||{},assenzeRaw=(ad.assenze||[]).map(a=>({category:"assenze",categoryLabel:"Assenza",type:"assenza",title:"Assenza Scolastica",dettaglio:a.numOre?`${a.numOre} ore di assenza`:a.oraInizio?`${a.oraInizio}\xAA - ${a.oraFine||5}\xAA ora`:"Giornata intera",desc:a.numOre?`Assenza di ${a.numOre} ore`:a.oraInizio?`${a.oraInizio}\xAA - ${a.oraFine||5}\xAA ora`:"Giornata intera",giustificata:!!a.giustificata,borderAccent:"#ff453a",dateISO:parseItemDateISO(a.data||a.date),rawDate:a.data||a.date,icon:"ph-calendar-x",iconColor:"#ff453a",iconBg:"rgba(255,69,58,0.16)",action:"mostraAssenzeModal()"})),ritardiRaw=(ad.ritardi||[]).map(r=>({category:"assenze",categoryLabel:"Ritardo",type:"ritardo",title:"Ingresso in Ritardo",dettaglio:r.oraInizio?`Entrata ore ${r.oraInizio}`:r.numOre?`${r.numOre}\xAA ora`:"Ingresso posticipato",desc:r.oraInizio?`Entrata ore ${r.oraInizio}`:r.numOre?`${r.numOre}\xAA ora`:"Ingresso posticipato",giustificata:!!(r.giustificato||r.giustificata),borderAccent:"#ff9f0a",dateISO:parseItemDateISO(r.data||r.date),rawDate:r.data||r.date,icon:"ph-clock-countdown",iconColor:"#ff9f0a",iconBg:"rgba(255,159,10,0.16)",action:"mostraAssenzeModal()"})),usciteRaw=(ad.uscite||[]).map(u=>({category:"assenze",categoryLabel:"Uscita",type:"uscita",title:"Uscita Anticipata",dettaglio:u.oraFine||u.oraInizio?`Uscita ore ${u.oraFine||u.oraInizio}`:"Uscita anticipata",desc:u.oraFine||u.oraInizio?`Uscita ore ${u.oraFine||u.oraInizio}`:"Uscita anticipata",giustificata:!!(u.giustificato||u.giustificata),borderAccent:"#64d2ff",dateISO:parseItemDateISO(u.data||u.date),rawDate:u.data||u.date,icon:"ph-sign-out",iconColor:"#64d2ff",iconBg:"rgba(100,210,255,0.16)",action:"mostraAssenzeModal()"})),noteRaw=(ad.note||state.note||[]).map(n=>({category:"note",categoryLabel:"Nota",type:"nota",title:"Nota Disciplinare",autore:n.autore||"Docente",testo:n.testo||n.descrizione||"",desc:n.autore?`Docente: ${n.autore} \u2014 ${n.testo||n.descrizione||""}`:n.testo||n.descrizione||"Annotazione docente",borderAccent:"#bf5af2",dateISO:parseItemDateISO(n.data||n.date),rawDate:n.data||n.date,icon:"ph-warning-octagon",iconColor:"#bf5af2",iconBg:"rgba(191,90,242,0.16)",action:"mostraAssenzeModal()"})),tasksRaw=(state.tasks||[]).filter(t=>t.subject!=="QUEST").map(t=>{const iso=parseItemDateISO(t.due_date||t.assigned_date||t.created_at),subj=t.subject||t.materia||"Compito";return{category:"compiti",categoryLabel:"Compito",type:"compito",id:t.id,subject:subj,title:subj,desc:t.text||t.title||"Compito assegnato",done:!!t.done,borderAccent:"#2997ff",dateISO:iso,rawDate:t.due_date,icon:"ph-book-open",iconColor:"#2997ff",iconBg:"rgba(41,151,255,0.16)",action:"navigate('planner')"}}),verificheRaw=(state.verifiche||[]).map(v=>{const iso=parseItemDateISO(v.data||v.date),subj=v.materia||v.subject||"Verifica";return{category:"verifiche",categoryLabel:"Verifica",type:"verifica",id:v.id,subject:subj,title:subj,desc:v.text||v.descrizione||"Verifica in programma",borderAccent:"#ff9f0a",dateISO:iso,rawDate:v.data||v.date,icon:"ph-pencil-simple",iconColor:"#ff9f0a",iconBg:"rgba(255,159,10,0.16)",action:"navigate('planner')"}}),effClass=typeof getEffectiveUserClass=="function"?getEffectiveUserClass():"",proposalsList=(effClass&&typeof getStoredClassProposals=="function"?getStoredClassProposals(effClass):[]).map(p=>{const isAssembly=p.type==="assembly",iso=parseItemDateISO(p.created_at||p.date||p.targetDate);return{category:"proposte",categoryLabel:isAssembly?"Assemblea":"Proposta",type:"proposta",id:p.id,rawProp:p,title:isAssembly?"Richiesta Assemblea di Classe":`Sposta Verifica: ${p.subject||"Verifica"}`,desc:p.reason||(isAssembly?`Proposta per ${p.targetDate}`:`Nuova data richiesta: ${p.targetDate}`),dateISO:iso,status:p.status,borderAccent:isAssembly?"#30d158":"#32ade6",icon:isAssembly?"ph-users-three":"ph-calendar-plus",iconColor:isAssembly?"#30d158":"#32ade6",iconBg:isAssembly?"rgba(48,209,88,0.16)":"rgba(50,173,230,0.16)",action:null}}),classActRaw=(Array.isArray(state.classActivities)?state.classActivities:[]).map(a=>{const d=typeof getActivityDateObject=="function"?getActivityDateObject(a):null,iso=d?getLocalDateString(d):parseItemDateISO(a.data||a.date);return{category:"lezioni",categoryLabel:"Lezione",type:"lezione",title:`Lezione: ${a.materia||a.subject||"Materia"}`,desc:a.argomento||a.attivita||a.description||"Argomento svolto in classe",dateISO:iso,icon:"ph-chalkboard-teacher",iconColor:"#64d2ff",iconBg:"rgba(100,210,255,0.16)",action:null}}),promemoriaRaw=(state.promemoria||state.bacheca||state.announcements||[]).map(p=>{const iso=parseItemDateISO(p.data||p.date||p.datePubbl||p.dataPubblicazione);return{category:"comunicazioni",categoryLabel:"Avviso",type:"comunicazione",title:p.titolo||p.title||p.oggetto||"Comunicazione",desc:p.testo||p.text||p.descrizione||"",dateISO:iso,icon:"ph-megaphone-simple",iconColor:"#ffd60a",iconBg:"rgba(255,214,10,0.16)",action:null}}),allItems=[...circolariList,...votiList,...assenzeRaw,...ritardiRaw,...usciteRaw,...noteRaw,...tasksRaw,...verificheRaw,...proposalsList,...classActRaw,...promemoriaRaw],todayItems=allItems.filter(item=>item.dateISO&&item.dateISO===todayISO),upcomingItems=allItems.filter(item=>item.dateISO&&item.dateISO>todayISO);upcomingItems.sort((a,b)=>(a.dateISO||"").localeCompare(b.dateISO||""));const recentItems=allItems.filter(item=>{if(!item.dateISO)return!0;if(item.dateISO>=todayISO)return!1;const itemDate=new Date(item.dateISO),diffDays=(today-itemDate)/(1e3*60*60*24);return diffDays>=0&&diffDays<=90});return recentItems.sort((a,b)=>(b.dateISO||"").localeCompare(a.dateISO||"")),{todayISO,todayItems,upcomingItems,recentItems,todayCount:todayItems.length,totalCount:allItems.length}},window.renderTodayRewindBadgeHTML=function(){const today=new Date,todayISO=typeof getLocalDateString=="function"?getLocalDateString(today):today.toISOString().split("T")[0];let isSeen=!1;try{isSeen=localStorage.getItem(`gc_seen_rewind_v2_${todayISO}`)==="true"}catch{}const slides=typeof window.getTodayRewindSlides=="function"?window.getTodayRewindSlides():[],hasRealNews=slides.length>0&&slides[0].id!=="quiet_day",totalEvents=hasRealNews?slides.length:0;return hasRealNews&&!isSeen?`
        <div id="today-rewind-header-badge" style="position: relative; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            <!-- Sfumatura / bagliore morbido attorno all'icona notifiche -->
            <div class="notification-aura-glow" style="
                position: absolute;
                inset: -6px;
                border-radius: 50%;
                background: radial-gradient(circle, rgba(0, 210, 255, 0.75) 0%, rgba(41, 151, 255, 0.5) 45%, rgba(99, 102, 241, 0.28) 75%, transparent 100%);
                filter: blur(8px);
                pointer-events: none;
                z-index: 0;
            "></div>

            <button onclick="if(typeof window.triggerHaptic==='function')window.triggerHaptic('medium');window.openTodayRewind();" title="Novit\xE0 di oggi (${totalEvents})" aria-label="Novit\xE0 di oggi (${totalEvents})" style="
                position: relative;
                z-index: 1;
                width: 44px;
                height: 44px;
                border-radius: 50%;
                background: linear-gradient(135deg, rgba(0, 210, 255, 0.95) 0%, rgba(41, 151, 255, 0.95) 45%, rgba(99, 102, 241, 0.95) 80%, rgba(191, 90, 242, 0.9) 100%);
                padding: 2.5px;
                border: none;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 4px 16px rgba(41, 151, 255, 0.4);
                transition: transform 0.15s ease;
                box-sizing: border-box;
            " ontouchstart="this.style.transform='scale(0.92)'" ontouchend="this.style.transform='scale(1)'">
                <div style="width: 100%; height: 100%; border-radius: 50%; background: #081126; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden;">
                    <!-- Glowing ambient center -->
                    <div style="position: absolute; inset: 0; background: radial-gradient(circle, rgba(0, 210, 255, 0.35) 0%, transparent 70%);"></div>
                    <i class="ph-fill ph-bell" style="font-size: 20px; color: #ffffff; filter: drop-shadow(0 0 6px rgba(0, 210, 255, 0.85));"></i>
                </div>
                <span style="position: absolute; top: -2px; right: -2px; min-width: 18px; height: 18px; border-radius: 999px; background: #2997ff; border: 2px solid #081126; display: flex; align-items: center; justify-content: center; font-size: 9.5px; font-weight: 800; color: #ffffff; padding: 0 4px; box-shadow: 0 2px 8px rgba(41, 151, 255, 0.8);">
                    ${totalEvents>9?"9+":totalEvents}
                </span>
            </button>
        </div>`:`
        <div id="today-rewind-header-badge" style="position: relative; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            <button onclick="if(typeof window.triggerHaptic==='function')window.triggerHaptic('light');window.openTodayRewind();" title="Novit\xE0 di oggi" aria-label="Novit\xE0 di oggi" style="
                position: relative;
                width: 44px;
                height: 44px;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.08);
                border: 1.5px solid rgba(255, 255, 255, 0.18);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: transform 0.15s ease, background 0.15s ease;
                box-sizing: border-box;
            " ontouchstart="this.style.transform='scale(0.92)'" ontouchend="this.style.transform='scale(1)'">
                <i class="ph-bold ph-bell" style="font-size: 19px; color: rgba(255, 255, 255, 0.72);"></i>
            </button>
        </div>`},window.updateTodayRewindBadge=function(){const badge=document.getElementById("today-rewind-header-badge");badge&&typeof window.renderTodayRewindBadgeHTML=="function"&&(badge.outerHTML=window.renderTodayRewindBadgeHTML())},window.updateTodayStoriesTray=function(){window.updateTodayRewindBadge()},window.markTodayRewindSeen=function(){const today=new Date,todayISO=typeof getLocalDateString=="function"?getLocalDateString(today):today.toISOString().split("T")[0];try{localStorage.setItem(`gc_seen_rewind_v2_${todayISO}`,"true")}catch{}typeof window.updateTodayRewindBadge=="function"&&window.updateTodayRewindBadge()},window.getTodayRewindSlides=function(){const today=new Date,todayISO=typeof getLocalDateString=="function"?getLocalDateString(today):today.toISOString().split("T")[0],daysOfWeek=["Domenica","Luned\xEC","Marted\xEC","Mercoled\xEC","Gioved\xEC","Venerd\xEC","Sabato"],months=["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"],todayFormatted=`${daysOfWeek[today.getDay()]}, ${today.getDate()} ${months[today.getMonth()]}`,userName=typeof toDisplayName=="function"&&typeof getSafeUserName=="function"?toDisplayName(getSafeUserName()):state.user?.name||"Studente",effClass=typeof getEffectiveUserClass=="function"?getEffectiveUserClass():"",userId=typeof getClassRepAuthInfo=="function"?getClassRepAuthInfo().userId:String(state.user?.id||"utente"),notifData=typeof window.getComprehensiveNotificationData=="function"?window.getComprehensiveNotificationData():{todayItems:[]},isRealItem=it=>it&&typeof it=="object"&&!String(it.id||"").match(/^(v26-|task-demo-|verif-demo-|act-demo-|demo_)/),votiData=typeof getVotiData=="function"?getVotiData():[];let todayVoti=votiData.filter(v=>{if(!isRealItem(v))return!1;const d=v.data||v.date||v.dataISO||"";return d===todayISO||d.startsWith(todayISO)});todayVoti.length===0&&(todayVoti=votiData.filter(v=>{if(!isRealItem(v))return!1;const d=v.data||v.date||v.dataISO||"";if(!d)return!1;const diff=(today-new Date(d))/(1e3*60*60*24);return diff>=0&&diff<=4}).slice(0,2));let todayCompiti=[];Array.isArray(state.tasks)&&(state.tasks.filter(isRealItem).forEach(t=>{if(t.subject==="QUEST")return;const dueStr=t.due_date||t.date||"",assStr=t.assigned_date||t.created_at||"",isDueToday=dueStr===todayISO||dueStr.startsWith(todayISO),isAssignedToday=assStr===todayISO||assStr.startsWith(todayISO);(isDueToday||isAssignedToday)&&todayCompiti.push({id:t.id,materia:t.subject||"Compito",compito:t.text||t.title||"Nessun dettaglio specificato",scadenza:t.due_date||todayISO,isToday:!0})}),todayCompiti.length===0&&state.tasks.filter(isRealItem).forEach(t=>{if(t.subject==="QUEST")return;const dueStr=t.due_date||t.date||"";dueStr&&dueStr>todayISO&&(new Date(dueStr)-today)/864e5<=4&&todayCompiti.push({id:t.id,materia:t.subject||"Compito",compito:t.text||t.title||"Nessun dettaglio specificato",scadenza:t.due_date||dueStr,isUpcoming:!0})})),(notifData.todayItems||[]).filter(isRealItem).forEach(it=>{if(it.type==="compito"||it.category==="compiti"){const taskText=it.desc||it.content||it.compito||it.title||"",taskSubj=it.subject||it.materia||it.categoryLabel||"Compito";todayCompiti.some(c=>c.id&&it.id&&c.id===it.id||c.compito===taskText&&c.materia===taskSubj)||todayCompiti.push({id:it.id,materia:taskSubj,compito:taskText||"Nessun dettaglio specificato",scadenza:it.rawDate||it.dateISO||todayISO,isToday:!0})}});let todayVerifiche=[];(state.verifiche||[]).concat(state.manualVerifiche||[]).filter(isRealItem).forEach(v=>{const d=v.data||v.date||"";if(!d)return;const isToday=d===todayISO||d.startsWith(todayISO),diff=(new Date(d)-today)/(1e3*60*60*24);(isToday||diff>0&&diff<=5)&&todayVerifiche.push({id:v.id,materia:v.materia||v.subject||"Verifica",descrizione:v.text||v.descrizione||"Verifica in programma",data:d,isToday})});let activeProps=(effClass&&typeof getStoredClassProposals=="function"?getStoredClassProposals(effClass):[]).filter(p=>isRealItem(p)&&(!p.status||p.status==="pending"||p.status==="approved"||p.status==="active"));const assemblyProps=activeProps.filter(p=>p.type==="assembly"),rescheduleProps=activeProps.filter(p=>p.type!=="assembly"),circolariData=typeof getCircolariData=="function"?getCircolariData():[];let todayCircolari=circolariData.filter(c=>{if(!isRealItem(c))return!1;const d=c.data||c.dataISO||c.created_at||"";return d===todayISO||d.startsWith(todayISO)});(notifData.todayItems||[]).filter(isRealItem).forEach(it=>{(it.type==="circolare"||it.category==="circolari")&&(todayCircolari.some(c=>c.id&&c.id===it.id||c.titolo===it.title)||todayCircolari.push({id:it.id,numero:it.numero||"",titolo:it.title||it.desc,desc:it.desc||""}))}),todayCircolari.length===0&&circolariData.length>0&&(todayCircolari=circolariData.filter(isRealItem).slice(0,1));const daGiustificare=state.assenzeData&&state.assenzeData.daGiustificare>0?state.assenzeData.daGiustificare:0,slides=[];if(todayVoti.forEach((voto,idx)=>{const val=voto.voto||voto.valore||"8",numVal=parseFloat(String(val).replace(",",".")),isSuff=isNaN(numVal)?!0:numVal>=6;slides.push({id:`voto_${voto.id||idx}`,category:"voti",categoryBadge:"NUOVA VALUTAZIONE",tag:isSuff?"REGISTRO":"ATTENZIONE",icon:"ph-graduation-cap",timestamp:voto.data||"Oggi",theme:{gradient:isSuff?"linear-gradient(160deg, #022c22 0%, #064e3b 40%, #059669 75%, #10b981 100%)":"linear-gradient(160deg, #3f0713 0%, #881337 40%, #be123c 75%, #f43f5e 100%)",glow:isSuff?"rgba(16, 185, 129, 0.55)":"rgba(244, 63, 94, 0.55)",accent:isSuff?"#34d399":"#fb7185"},primaryAction:{label:"Apri nel Registro Voti",icon:"ph-graduation-cap",action:"window.closeTodayRewind(); navigate('voti');"},renderCardHtml:()=>`
                <div class="story-apple-card" style="
                    background: rgba(255, 255, 255, 0.12); backdrop-filter: blur(35px); -webkit-backdrop-filter: blur(35px);
                    border: 1px solid rgba(255, 255, 255, 0.25); border-radius: 32px;
                    padding: 26px 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.6);
                    display: flex; flex-direction: column; align-items: center; text-align: center;
                ">
                    <div style="
                        width: 90px; height: 90px; border-radius: 26px;
                        background: ${isSuff?"linear-gradient(135deg, rgba(52, 211, 153, 0.9), rgba(5, 150, 105, 0.95))":"linear-gradient(135deg, rgba(251, 113, 133, 0.9), rgba(225, 29, 72, 0.95))"};
                        border: 2px solid rgba(255,255,255,0.45);
                        box-shadow: 0 12px 32px ${isSuff?"rgba(52, 211, 153, 0.55)":"rgba(244, 63, 94, 0.55)"}, inset 0 1px 1px rgba(255,255,255,0.7);
                        display: flex; align-items: center; justify-content: center;
                        font-size: 40px; font-weight: 900; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Rounded', sans-serif;
                        letter-spacing: -0.03em; margin-bottom: 16px;
                    ">
                        ${escapeHtml(val)}
                    </div>

                    <div style="
                        display: inline-flex; align-items: center; gap: 6px;
                        background: rgba(255,255,255,0.16); border: 1px solid rgba(255,255,255,0.25);
                        padding: 4px 14px; border-radius: 999px; font-size: 11.5px; font-weight: 800;
                        text-transform: uppercase; letter-spacing: 0.08em; color: #ffffff; margin-bottom: 10px;
                    ">
                        <i class="ph-bold ph-star" style="color: ${isSuff?"#34d399":"#fb7185"};"></i>
                        <span>${escapeHtml(voto.tipo||"Valutazione")}</span>
                    </div>

                    <div style="
                        font-size: 27px; font-weight: 900; color: #ffffff; letter-spacing: -0.02em;
                        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif; line-height: 1.15; margin-bottom: 4px;
                    ">
                        ${escapeHtml(voto.materia||"Materia")}
                    </div>

                    ${voto.docente?`
                    <div style="font-size: 13.5px; color: rgba(255,255,255,0.78); font-weight: 600; margin-bottom: 14px;">
                        <i class="ph-bold ph-chalkboard-teacher" style="opacity: 0.85; margin-right: 4px;"></i>${escapeHtml(voto.docente)}
                    </div>`:'<div style="height: 12px;"></div>'}

                    ${voto.commento?`
                    <div style="
                        width: 100%; box-sizing: border-box;
                        background: rgba(0, 0, 0, 0.22); backdrop-filter: blur(20px);
                        border: 1px solid rgba(255,255,255,0.16); border-radius: 20px;
                        padding: 14px 16px; text-align: left; margin-top: 4px;
                    ">
                        <div style="font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: rgba(255,255,255,0.65); margin-bottom: 4px;">
                            Nota del Docente
                        </div>
                        <div style="font-size: 14px; color: rgba(255,255,255,0.95); font-style: italic; line-height: 1.45;">
                            "${escapeHtml(voto.commento)}"
                        </div>
                    </div>
                    `:""}
                </div>
            `})}),todayCompiti.forEach((c,idx)=>{slides.push({id:`compito_${c.id||idx}`,category:"compiti",categoryBadge:"COMPITO ASSEGNATO",tag:c.isUpcoming?"IN ARRIVO":"PER OGGI",icon:"ph-book-open",timestamp:c.scadenza||"Oggi",theme:{gradient:"linear-gradient(160deg, #100e2b 0%, #1e1b4b 40%, #4338ca 75%, #6366f1 100%)",glow:"rgba(99, 102, 241, 0.55)",accent:"#818cf8"},primaryAction:{label:"Apri nel Diario",icon:"ph-notebook",action:"window.closeTodayRewind(); navigate('planner');"},renderCardHtml:()=>`
                <div class="story-apple-card" style="
                    background: rgba(255, 255, 255, 0.12); backdrop-filter: blur(35px); -webkit-backdrop-filter: blur(35px);
                    border: 1px solid rgba(255, 255, 255, 0.25); border-radius: 32px;
                    padding: 24px 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.6);
                    display: flex; flex-direction: column;
                ">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
                        <div style="
                            display: inline-flex; align-items: center; gap: 7px;
                            background: rgba(255,255,255,0.18); border: 1px solid rgba(255,255,255,0.3);
                            padding: 5px 14px; border-radius: 999px;
                        ">
                            <i class="ph-bold ph-book-open" style="color: #a5b4fc; font-size: 14px;"></i>
                            <span style="font-size: 12px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; color: #ffffff;">
                                ${escapeHtml(c.materia||"Compito")}
                            </span>
                        </div>

                        <div style="
                            display: inline-flex; align-items: center; gap: 5px;
                            background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.18);
                            padding: 5px 12px; border-radius: 999px; font-size: 11.5px; font-weight: 700; color: #a5b4fc;
                        ">
                            <i class="ph-bold ph-calendar"></i>
                            <span>${escapeHtml(c.scadenza||todayISO)}</span>
                        </div>
                    </div>

                    <div style="
                        font-size: 26px; font-weight: 900; color: #ffffff; letter-spacing: -0.02em;
                        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif; line-height: 1.2; margin-bottom: 14px;
                    ">
                        ${escapeHtml(c.materia||"Compito")}
                    </div>

                    <div style="
                        background: rgba(0,0,0,0.22); backdrop-filter: blur(20px);
                        border: 1px solid rgba(255,255,255,0.16); border-radius: 20px;
                        padding: 16px 18px; max-height: 220px; overflow-y: auto;
                    ">
                        <div style="font-size: 15px; color: #ffffff; line-height: 1.55; word-break: break-word; font-weight: 500;">
                            ${escapeHtml(c.compito||"Nessun dettaglio specificato")}
                        </div>
                    </div>
                </div>
            `})}),todayVerifiche.forEach((v,idx)=>{slides.push({id:`verifica_${v.id||idx}`,category:"verifiche",categoryBadge:"VERIFICA IN PROGRAMMA",tag:v.isToday?"OGGI":"CALENDARIO",icon:"ph-pencil-simple",timestamp:v.data||"In arrivo",theme:{gradient:"linear-gradient(160deg, #2e1003 0%, #451a03 40%, #b45309 75%, #f59e0b 100%)",glow:"rgba(245, 158, 11, 0.55)",accent:"#fbbf24"},primaryAction:{label:"Vedi nel Calendario",icon:"ph-calendar",action:"window.closeTodayRewind(); navigate('planner');"},renderCardHtml:()=>`
                <div class="story-apple-card" style="
                    background: rgba(255, 255, 255, 0.12); backdrop-filter: blur(35px); -webkit-backdrop-filter: blur(35px);
                    border: 1px solid rgba(255, 255, 255, 0.25); border-radius: 32px;
                    padding: 24px 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.6);
                    display: flex; flex-direction: column;
                ">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
                        <div style="
                            display: inline-flex; align-items: center; gap: 7px;
                            background: rgba(255,255,255,0.18); border: 1px solid rgba(255,255,255,0.3);
                            padding: 5px 14px; border-radius: 999px;
                        ">
                            <i class="ph-bold ph-pencil-simple" style="color: #fed7aa; font-size: 14px;"></i>
                            <span style="font-size: 12px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; color: #ffffff;">
                                VERIFICA PROGRAMMATA
                            </span>
                        </div>
                        <div style="
                            display: inline-flex; align-items: center; gap: 5px;
                            background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.18);
                            padding: 5px 12px; border-radius: 999px; font-size: 11.5px; font-weight: 700; color: #fed7aa;
                        ">
                            <i class="ph-bold ph-calendar"></i>
                            <span>${escapeHtml(v.data||"In arrivo")}</span>
                        </div>
                    </div>

                    <div style="
                        font-size: 26px; font-weight: 900; color: #ffffff; letter-spacing: -0.02em;
                        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif; line-height: 1.2; margin-bottom: 14px;
                    ">
                        ${escapeHtml(v.materia||"Verifica")}
                    </div>

                    <div style="
                        background: rgba(0,0,0,0.22); backdrop-filter: blur(20px);
                        border: 1px solid rgba(255,255,255,0.16); border-radius: 20px;
                        padding: 16px 18px; max-height: 200px; overflow-y: auto;
                    ">
                        <div style="font-size: 15px; color: #ffffff; line-height: 1.5; word-break: break-word;">
                            ${escapeHtml(v.descrizione||"Verifica scritta/orale programmata")}
                        </div>
                    </div>
                </div>
            `})}),rescheduleProps.forEach((prop,idx)=>{const votes=prop.votes||{accept:[],decline:[],alternatives:[]},acceptList=Array.isArray(votes.accept)?votes.accept:[],declineList=Array.isArray(votes.decline)?votes.decline:[],acceptCount=acceptList.length,declineCount=declineList.length,hasAccepted=acceptList.includes(userId),hasDeclined=declineList.includes(userId);slides.push({id:`reschedule_${prop.id||idx}`,category:"spostamento",categoryBadge:"SPOSTAMENTO VERIFICA",tag:"VOTAZIONE",icon:"ph-calendar-plus",timestamp:"Proposta Aperta",theme:{gradient:"linear-gradient(160deg, #330f04 0%, #7c2d12 40%, #c2410c 75%, #ea580c 100%)",glow:"rgba(234, 88, 12, 0.55)",accent:"#fb923c"},primaryAction:{label:"Gestione Proposte",icon:"ph-sliders-horizontal",action:"window.closeTodayRewind(); if(typeof window.openClassRepModal==='function')window.openClassRepModal();"},renderCardHtml:()=>`
                <div class="story-apple-card" style="
                    background: rgba(255, 255, 255, 0.12); backdrop-filter: blur(35px); -webkit-backdrop-filter: blur(35px);
                    border: 1px solid rgba(255, 255, 255, 0.25); border-radius: 32px;
                    padding: 24px 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.6);
                    display: flex; flex-direction: column;
                ">
                    <div style="font-size: 24px; font-weight: 900; color: #ffffff; line-height: 1.2; margin-bottom: 12px;">
                        Spostamento ${escapeHtml(prop.subject||"Verifica")}
                    </div>

                    <div style="
                        display: flex; align-items: center; justify-content: space-between; gap: 8px;
                        background: rgba(0,0,0,0.22); border: 1px solid rgba(255,255,255,0.18);
                        border-radius: 16px; padding: 12px 14px; margin-bottom: 12px;
                    ">
                        <span style="font-size: 13px; color: rgba(255,255,255,0.8);">
                            Da: <strong style="color:#ffffff;">${escapeHtml(prop.originalDate||"\u2014")}</strong>
                        </span>
                        <i class="ph-bold ph-arrow-right" style="color: #fb923c; font-size: 14px;"></i>
                        <span style="font-size: 13px; color: rgba(255,255,255,0.8);">
                            A: <strong style="color:#ffffff;">${escapeHtml(prop.targetDate||"\u2014")}</strong>
                        </span>
                    </div>

                    <div style="font-size: 13.5px; color: rgba(255,255,255,0.9); line-height: 1.45; margin-bottom: 16px;">
                        <strong>Motivo:</strong> ${escapeHtml(prop.reason||"Carico didattico")}
                    </div>

                    <div style="display: flex; gap: 10px;">
                        <button onclick="event.stopPropagation(); if(typeof window.triggerHaptic==='function')window.triggerHaptic('medium'); window.voteClassProposal('${prop.id}', 'accept');" style="
                            flex: 1; padding: 12px; border-radius: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;
                            background: ${hasAccepted?"#30d158":"rgba(255,255,255,0.12)"};
                            border: 1.5px solid ${hasAccepted?"#30d158":"rgba(255,255,255,0.25)"};
                            color: ${hasAccepted?"#000000":"#ffffff"}; font-size: 13px; font-weight: 800;
                        ">
                            <i class="ph-bold ph-thumbs-up"></i>
                            <span>S\xEC (${acceptCount})</span>
                        </button>
                        <button onclick="event.stopPropagation(); if(typeof window.triggerHaptic==='function')window.triggerHaptic('medium'); window.voteClassProposal('${prop.id}', 'decline');" style="
                            flex: 1; padding: 12px; border-radius: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;
                            background: ${hasDeclined?"#ff453a":"rgba(255,255,255,0.12)"};
                            border: 1.5px solid ${hasDeclined?"#ff453a":"rgba(255,255,255,0.25)"};
                            color: #ffffff; font-size: 13px; font-weight: 800;
                        ">
                            <i class="ph-bold ph-thumbs-down"></i>
                            <span>No (${declineCount})</span>
                        </button>
                    </div>
                </div>
            `})}),assemblyProps.forEach((prop,idx)=>{const votes=prop.votes||{accept:[],decline:[],alternatives:[]},acceptList=Array.isArray(votes.accept)?votes.accept:[],declineList=Array.isArray(votes.decline)?votes.decline:[],altList=Array.isArray(votes.alternatives)?votes.alternatives:[],acceptCount=acceptList.length,declineCount=declineList.length,altCount=altList.length,hasAccepted=acceptList.includes(userId),hasDeclined=declineList.includes(userId),hasAlt=altList.some(a=>a.userId===userId);slides.push({id:`assembly_${prop.id||idx}`,category:"assemblea",categoryBadge:"ASSEMBLEA DI CLASSE",tag:"VOTAZIONE",icon:"ph-users-three",timestamp:"Proposta Aperta",theme:{gradient:"linear-gradient(160deg, #022325 0%, #042f2e 40%, #0f766e 75%, #06b6d4 100%)",glow:"rgba(6, 182, 212, 0.55)",accent:"#22d3ee"},primaryAction:{label:"Gestione Assemblea",icon:"ph-users-three",action:"window.closeTodayRewind(); if(typeof window.openClassRepModal==='function')window.openClassRepModal();"},renderCardHtml:()=>`
                <div class="story-apple-card" style="
                    background: rgba(255, 255, 255, 0.12); backdrop-filter: blur(35px); -webkit-backdrop-filter: blur(35px);
                    border: 1px solid rgba(255, 255, 255, 0.25); border-radius: 32px;
                    padding: 24px 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.6);
                    display: flex; flex-direction: column;
                ">
                    <div style="font-size: 24px; font-weight: 900; color: #ffffff; line-height: 1.2; margin-bottom: 12px;">
                        Richiesta Assemblea
                    </div>

                    <div style="
                        display: inline-flex; align-items: center; gap: 8px;
                        background: rgba(0,0,0,0.22); border: 1px solid rgba(255,255,255,0.18);
                        border-radius: 14px; padding: 8px 14px; margin-bottom: 12px; color: #ffffff; font-size: 13.5px; font-weight: 700;
                    ">
                        <i class="ph-bold ph-calendar" style="color: #22d3ee;"></i>
                        <span>Data: <strong style="color:#ffffff;">${escapeHtml(prop.targetDate||"In definizione")}</strong></span>
                    </div>

                    <div style="font-size: 13.5px; color: rgba(255,255,255,0.9); line-height: 1.45; margin-bottom: 16px;">
                        <strong>Ordine del giorno:</strong> ${escapeHtml(prop.reason||"Discussione andamento didattico e organizzazione")}
                    </div>

                    <div style="display: flex; gap: 8px;">
                        <button onclick="event.stopPropagation(); if(typeof window.triggerHaptic==='function')window.triggerHaptic('medium'); window.voteClassProposal('${prop.id}', 'accept');" style="
                            flex: 1; padding: 10px 6px; border-radius: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 5px;
                            background: ${hasAccepted?"#30d158":"rgba(255,255,255,0.12)"};
                            border: 1.5px solid ${hasAccepted?"#30d158":"rgba(255,255,255,0.25)"};
                            color: ${hasAccepted?"#000000":"#ffffff"}; font-size: 12.5px; font-weight: 800;
                        ">
                            <i class="ph-bold ph-thumbs-up"></i>
                            <span>S\xEC (${acceptCount})</span>
                        </button>
                        <button onclick="event.stopPropagation(); if(typeof window.triggerHaptic==='function')window.triggerHaptic('medium'); window.voteClassProposal('${prop.id}', 'decline');" style="
                            flex: 1; padding: 10px 6px; border-radius: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 5px;
                            background: ${hasDeclined?"#ff453a":"rgba(255,255,255,0.12)"};
                            border: 1.5px solid ${hasDeclined?"#ff453a":"rgba(255,255,255,0.25)"};
                            color: #ffffff; font-size: 12.5px; font-weight: 800;
                        ">
                            <i class="ph-bold ph-thumbs-down"></i>
                            <span>No (${declineCount})</span>
                        </button>
                        <button onclick="event.stopPropagation(); const altD = prompt('Data alternativa (YYYY-MM-DD):', '${prop.targetDate||""}'); if(altD) window.voteClassProposal('${prop.id}', 'alternative', altD);" style="
                            flex: 1; padding: 10px 6px; border-radius: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 5px;
                            background: ${hasAlt?"#ff9f0a":"rgba(255,255,255,0.12)"};
                            border: 1.5px solid ${hasAlt?"#ff9f0a":"rgba(255,255,255,0.25)"};
                            color: ${hasAlt?"#000000":"#ffffff"}; font-size: 12.5px; font-weight: 800;
                        ">
                            <i class="ph-bold ph-calendar-plus"></i>
                            <span>Altra (${altCount})</span>
                        </button>
                    </div>
                </div>
            `})}),todayCircolari.forEach((circ,idx)=>{slides.push({id:`circ_${circ.id||idx}`,category:"circolari",categoryBadge:"CIRCOLARE UFFICIALE",tag:circ.numero?`N\xB0 ${circ.numero}`:"UFFICIALE",icon:"ph-newspaper",timestamp:circ.numero?`Circolare N\xB0 ${circ.numero}`:"Oggi",theme:{gradient:"linear-gradient(160deg, #051226 0%, #0c2340 40%, #1d4ed8 75%, #38bdf8 100%)",glow:"rgba(56, 189, 248, 0.55)",accent:"#60a5fa"},primaryAction:{label:"Leggi Circolare Completa",icon:"ph-arrow-up-right",action:`window.closeTodayRewind(); if(typeof openCircolareDetails==='function')openCircolareDetails('${circ.id}'); else navigate('circolari');`},renderCardHtml:()=>`
                <div class="story-apple-card" style="
                    background: rgba(255, 255, 255, 0.12); backdrop-filter: blur(35px); -webkit-backdrop-filter: blur(35px);
                    border: 1px solid rgba(255, 255, 255, 0.25); border-radius: 32px;
                    padding: 24px 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.6);
                    display: flex; flex-direction: column;
                ">
                    <div style="
                        font-size: 22px; font-weight: 900; color: #ffffff; letter-spacing: -0.01em;
                        line-height: 1.3; margin-bottom: 12px;
                    ">
                        ${escapeHtml(circ.titolo||"Nuova Circolare")}
                    </div>

                    <div style="
                        background: rgba(0,0,0,0.22); backdrop-filter: blur(20px);
                        border: 1px solid rgba(255,255,255,0.16); border-radius: 20px;
                        padding: 16px 18px; max-height: 220px; overflow-y: auto;
                    ">
                        <p style="font-size: 14.5px; color: rgba(255,255,255,0.9); line-height: 1.5; margin: 0;">
                            ${escapeHtml(circ.desc||"Tocca il pulsante qui sotto per visualizzare il documento integrale.")}
                        </p>
                    </div>
                </div>
            `})}),daGiustificare>0&&slides.push({id:"assenze_alert",category:"assenze",categoryBadge:"REGISTRO ASSENZE",tag:"ATTENZIONE",icon:"ph-warning",timestamp:"Da Giustificare",theme:{gradient:"linear-gradient(160deg, #320f04 0%, #7c2d12 40%, #b45309 75%, #ea580c 100%)",glow:"rgba(234, 88, 12, 0.55)",accent:"#fb923c"},primaryAction:{label:"Giustifica nel Registro",icon:"ph-check-circle",action:"window.closeTodayRewind(); if(typeof mostraAssenzeModal==='function')mostraAssenzeModal(); else navigate('assenze');"},renderCardHtml:()=>`
                <div class="story-apple-card" style="
                    background: rgba(255, 255, 255, 0.12); backdrop-filter: blur(35px); -webkit-backdrop-filter: blur(35px);
                    border: 1px solid rgba(255, 255, 255, 0.25); border-radius: 32px;
                    padding: 26px 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.6);
                    display: flex; flex-direction: column; align-items: center; text-align: center;
                ">
                    <div style="
                        width: 80px; height: 80px; border-radius: 50%;
                        background: rgba(251, 146, 60, 0.2); border: 2px solid rgba(251, 146, 60, 0.6);
                        display: flex; align-items: center; justify-content: center; margin-bottom: 16px;
                        box-shadow: 0 8px 24px rgba(234, 88, 12, 0.4);
                    ">
                        <i class="ph-fill ph-warning" style="font-size: 38px; color: #fb923c;"></i>
                    </div>
                    <div style="font-size: 24px; font-weight: 900; color: #ffffff; margin-bottom: 6px;">
                        ${daGiustificare} ${daGiustificare===1?"Assenza da Giustificare":"Assenze da Giustificare"}
                    </div>
                    <div style="font-size: 14px; color: rgba(255,255,255,0.85); line-height: 1.45;">
                        Ricordati di far firmare o giustificare i giorni di assenza tramite il libretto o l'app Argo.
                    </div>
                </div>
            `}),slides.length===0){const media=typeof calculateMedia=="function"?calculateMedia():state.media||null;slides.push({id:"quiet_day",category:"tranquillo",categoryBadge:"REGISTRO AGGIORNATO",tag:"IN PARI",icon:"ph-check-circle",timestamp:todayFormatted,theme:{gradient:"linear-gradient(160deg, #060c18 0%, #0f172a 40%, #1e293b 75%, #0284c7 100%)",glow:"rgba(41, 151, 255, 0.45)",accent:"#38bdf8"},primaryAction:{label:"Chiudi Storie",icon:"ph-check",action:"window.closeTodayRewind();"},renderCardHtml:()=>`
                <div class="story-apple-card" style="
                    background: rgba(255, 255, 255, 0.12); backdrop-filter: blur(35px); -webkit-backdrop-filter: blur(35px);
                    border: 1px solid rgba(255, 255, 255, 0.25); border-radius: 32px;
                    padding: 30px 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.6);
                    display: flex; flex-direction: column; align-items: center; text-align: center;
                ">
                    <div style="
                        width: 84px; height: 84px; border-radius: 50%;
                        background: rgba(48, 209, 88, 0.2); border: 2px solid rgba(48, 209, 88, 0.6);
                        display: flex; align-items: center; justify-content: center; margin-bottom: 18px;
                        box-shadow: 0 10px 30px rgba(48, 209, 88, 0.45);
                    ">
                        <i class="ph-fill ph-check-circle" style="font-size: 44px; color: #30d158;"></i>
                    </div>
                    <div style="font-size: 26px; font-weight: 900; color: #ffffff; margin-bottom: 8px;">
                        Tutto in Ordine!
                    </div>
                    <div style="font-size: 14.5px; color: rgba(255,255,255,0.85); line-height: 1.5; margin-bottom: 16px;">
                        Nessuna nuova valutazione o compito inserito oggi dal server. Sei perfettamente in pari!
                    </div>
                    ${media?`
                    <div style="
                        display: inline-flex; align-items: center; gap: 8px;
                        background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25);
                        padding: 8px 18px; border-radius: 999px; font-size: 13.5px; font-weight: 800; color: #ffffff;
                    ">
                        <i class="ph-bold ph-chart-line-up" style="color: #38bdf8;"></i>
                        <span>Media Voti Attuale: <strong style="color:#38bdf8;">${media}</strong></span>
                    </div>
                    `:""}
                </div>
            `})}return slides},window._rewindState=null,window.openTodayRewind=function(slideIdx=0){typeof window.triggerHaptic=="function"&&window.triggerHaptic("medium");const slides=window.getTodayRewindSlides();if(!slides||slides.length===0)return;window._rewindState={slides,currentIndex:Math.max(0,Math.min(slideIdx,slides.length-1)),timer:null,startTime:0,duration:5500,remainingTime:5500,isPaused:!1};let overlay=document.getElementById("today-rewind-viewer-overlay");overlay||(overlay=document.createElement("div"),overlay.id="today-rewind-viewer-overlay",overlay.style.cssText=`
            position: fixed; inset: 0; z-index: 999999;
            background: #000000 !important;
            width: 100vw; height: 100vh; height: 100dvh;
            display: flex; align-items: stretch; justify-content: center;
            opacity: 0; transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;
            overflow: hidden; touch-action: none;
        `,document.body.appendChild(overlay));const mainContainer=document.querySelector(".main-container"),navContainer=document.getElementById("nav-container");mainContainer&&(mainContainer.style.visibility="hidden"),navContainer&&(navContainer.style.visibility="hidden"),document.body.style.overflow="hidden",window._setupRewindTapNavigation(overlay),window._renderRewindFrame(window._rewindState.currentIndex),requestAnimationFrame(()=>{overlay&&(overlay.style.opacity="1"),window._startRewindSlideTimer()}),window._rewindKeydownHandler||(window._rewindKeydownHandler=function(e){e.key==="Escape"?window.closeTodayRewind():e.key==="ArrowRight"?window.rewindNextSlide():e.key==="ArrowLeft"?window.rewindPrevSlide():e.key===" "&&window.togglePauseRewindViewer()},window.addEventListener("keydown",window._rewindKeydownHandler))},window._setupRewindTapNavigation=function(overlay){if(!overlay)return;let touchStartX=0,touchStartY=0,isHolding=!1,holdTimeout=null,isTouchDrag=!1,lastTouchEndTime=0;const triggerTapFlash=side=>{const el=document.getElementById(side==="left"?"story-flash-left":"story-flash-right");el&&(el.classList.remove("story-tap-flash-active"),el.offsetWidth,el.classList.add("story-tap-flash-active"))},doNavigate=function(clientX){const rect=overlay.getBoundingClientRect(),width=rect.width||window.innerWidth||360;clientX-rect.left<width*.35?(triggerTapFlash("left"),window.rewindPrevSlide()):(triggerTapFlash("right"),window.rewindNextSlide())};overlay.onclick=function(e){Date.now()-lastTouchEndTime<500||e.target.closest("button, a, input, textarea, [data-prevent-slide]")||doNavigate(e.clientX)},overlay.onmousedown=function(e){e.target.closest("button, a, input, textarea, [data-prevent-slide]")||(holdTimeout=setTimeout(()=>{isHolding=!0,window.pauseRewindViewer(),window._setRewindChromeVisibility(!1)},160))},overlay.onmouseup=function(e){clearTimeout(holdTimeout),isHolding&&(isHolding=!1,window.resumeRewindViewer(),window._setRewindChromeVisibility(!0))},overlay.ontouchstart=function(e){if(e.touches&&e.touches.length===1){if(touchStartX=e.touches[0].clientX,touchStartY=e.touches[0].clientY,isTouchDrag=!1,e.target.closest("button, a, input, textarea, [data-prevent-slide]"))return;holdTimeout=setTimeout(()=>{isHolding=!0,window.pauseRewindViewer(),window._setRewindChromeVisibility(!1)},160)}},overlay.ontouchmove=function(e){if(e.touches&&e.touches.length===1){const diffY=e.touches[0].clientY-touchStartY,diffX=Math.abs(e.touches[0].clientX-touchStartX);(Math.abs(diffY)>8||diffX>8)&&!isHolding&&(isTouchDrag=!0,clearTimeout(holdTimeout));const frame=document.getElementById("today-rewind-frame");if(diffY>0&&frame){const damping=Math.min(diffY,180),scale=Math.max(.85,1-diffY/900);frame.style.transform=`translateY(${damping}px) scale(${scale})`}}},overlay.ontouchend=function(e){lastTouchEndTime=Date.now(),clearTimeout(holdTimeout);const frame=document.getElementById("today-rewind-frame");if(isHolding){isHolding=!1,window.resumeRewindViewer(),window._setRewindChromeVisibility(!0),frame&&(frame.style.transform="translateY(0) scale(1)",frame.style.transition="transform 0.24s cubic-bezier(0.16, 1, 0.3, 1)");return}if(e.changedTouches&&e.changedTouches.length===1){const touchX=e.changedTouches[0].clientX,touchY=e.changedTouches[0].clientY,diffY=touchY-touchStartY,diffX=Math.abs(touchX-touchStartX);if(diffY>70&&diffX<90){e.cancelable&&e.preventDefault(),window.closeTodayRewind();return}if(isTouchDrag&&Math.abs(diffY)>15){frame&&(frame.style.transform="translateY(0) scale(1)",frame.style.transition="transform 0.24s cubic-bezier(0.16, 1, 0.3, 1)");return}const target=document.elementFromPoint(touchX,touchY);if(target&&target.closest("button, a, input, textarea, [data-prevent-slide]"))return;e.cancelable&&e.preventDefault(),doNavigate(touchX)}frame&&(frame.style.transform="translateY(0) scale(1)",frame.style.transition="transform 0.24s cubic-bezier(0.16, 1, 0.3, 1)")}},window._setRewindChromeVisibility=function(visible){const top=document.getElementById("story-top-chrome"),bottom=document.getElementById("story-bottom-chrome"),opacity=visible?"1":"0.15";top&&(top.style.transition="opacity 0.18s ease",top.style.opacity=opacity),bottom&&(bottom.style.transition="opacity 0.18s ease",bottom.style.opacity=opacity)},window._renderRewindFrame=function(slideIdx){const overlay=document.getElementById("today-rewind-viewer-overlay");if(!overlay||!window._rewindState)return;const slides=window._rewindState.slides,currentSlide=slides[slideIdx];if(!currentSlide)return;const slideCount=slides.length;slideIdx===slideCount-1&&typeof window.markTodayRewindSeen=="function"&&window.markTodayRewindSeen();const progressSegmentsHtml=slides.map((s,idx)=>{let barInner="";return idx<slideIdx?barInner='<div style="width:100%;height:100%;background:#ffffff;border-radius:999px;"></div>':idx===slideIdx?barInner='<div id="active-rewind-progress-bar" style="height:100%;background:#ffffff;border-radius:999px;width:0%;"></div>':barInner='<div style="width:0%;height:100%;background:#ffffff;border-radius:999px;"></div>',`
        <div style="flex:1;height:3px;background:rgba(255,255,255,0.22);border-radius:999px;overflow:hidden;position:relative;">
            ${barInner}
        </div>`}).join(""),theme=currentSlide.theme||{gradient:"linear-gradient(160deg, #090e17 0%, #0f172a 40%, #1e293b 75%, #0284c7 100%)",glow:"rgba(41, 151, 255, 0.45)",accent:"#38bdf8"};overlay.style.background="#000000",overlay.innerHTML=`
    <!-- Dynamic Ambient Gradient Mesh -->
    <div id="story-ambient-mesh" style="
        position: absolute; inset: 0; background: ${theme.gradient};
        transition: background 0.35s ease; z-index: 1; overflow: hidden; pointer-events: none;
    ">
        <!-- Radiant blur orbs with subtle floating animation -->
        <div class="story-orb-float" style="
            position: absolute; top: -12%; left: 50%; transform: translateX(-50%);
            width: 440px; height: 440px; background: ${theme.glow};
            filter: blur(80px); border-radius: 50%; opacity: 0.85;
        "></div>
        <div class="story-orb-float" style="
            position: absolute; bottom: -15%; right: 10%;
            width: 360px; height: 360px; background: ${theme.glow};
            filter: blur(95px); border-radius: 50%; opacity: 0.6;
        "></div>
    </div>

    <!-- Tap Flash Visual Indicators -->
    <div id="story-flash-left" class="story-tap-flash-left"></div>
    <div id="story-flash-right" class="story-tap-flash-right"></div>

    <!-- Main Frame (Safe-area padded) -->
    <div id="today-rewind-frame" style="
        width: 100%; height: 100%; height: 100dvh; max-width: 480px; margin: 0 auto;
        position: relative; display: flex; flex-direction: column; justify-content: space-between;
        padding: max(env(safe-area-inset-top, 0px), 14px) 18px max(env(safe-area-inset-bottom, 0px), 18px) 18px;
        box-sizing: border-box; z-index: 10;
    ">
        <!-- \u2500\u2500 TOP CHROME \u2500\u2500 -->
        <div id="story-top-chrome" style="position: relative; z-index: 30; flex-shrink: 0; transition: opacity 0.2s ease;">
            <!-- Segmented Progress Bars -->
            <div style="display: flex; gap: 4.5px; width: 100%; margin-bottom: 12px;">
                ${progressSegmentsHtml}
            </div>

            <!-- Header Info Bar -->
            <div style="display: flex; align-items: center; justify-content: space-between;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <!-- Rounded Icon Tile with Apple Glass Ring -->
                    <div style="
                        width: 38px; height: 38px; border-radius: 12px;
                        background: rgba(255, 255, 255, 0.16); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
                        border: 1px solid rgba(255, 255, 255, 0.28); display: flex; align-items: center; justify-content: center;
                        box-shadow: 0 4px 16px rgba(0,0,0,0.25), inset 0 1px 1px rgba(255,255,255,0.4); flex-shrink: 0;
                    ">
                        <i class="ph-fill ${currentSlide.icon||"ph-bell"}" style="font-size: 20px; color: #ffffff;"></i>
                    </div>

                    <div>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="
                                font-size: 14px; font-weight: 800; color: #ffffff; letter-spacing: -0.01em;
                                font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
                            ">
                                ${escapeHtml(currentSlide.categoryBadge||"G-CONNECT")}
                            </span>
                            <span style="
                                font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em;
                                background: rgba(255,255,255,0.18); backdrop-filter: blur(10px);
                                color: #ffffff; padding: 2px 7px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.25);
                            ">
                                ${escapeHtml(currentSlide.tag||"OGGI")}
                            </span>
                        </div>
                        <div style="font-size: 11.5px; color: rgba(255,255,255,0.72); font-weight: 500; display: flex; align-items: center; gap: 5px; margin-top: 1px;">
                            <span>${escapeHtml(currentSlide.timestamp||"Oggi")}</span>
                            <span>\xB7</span>
                            <span style="color: #ffffff; font-weight: 700;">${slideIdx+1} di ${slideCount}</span>
                        </div>
                    </div>
                </div>

                <!-- Sleek Close Button (X) -->
                <button onclick="event.stopPropagation(); window.closeTodayRewind();" title="Chiudi" aria-label="Chiudi storie" style="
                    width: 34px; height: 34px; border-radius: 50%;
                    background: rgba(0, 0, 0, 0.28); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
                    border: 1px solid rgba(255, 255, 255, 0.24); color: #ffffff;
                    display: flex; align-items: center; justify-content: center; cursor: pointer;
                    box-shadow: 0 4px 14px rgba(0,0,0,0.3); transition: transform 0.15s ease;
                " ontouchstart="this.style.transform='scale(0.92)'" ontouchend="this.style.transform='scale(1)'">
                    <i class="ph-bold ph-x" style="font-size: 14px;"></i>
                </button>
            </div>
        </div>

        <!-- \u2500\u2500 CENTER CONTENT (Card) \u2500\u2500 -->
        <div id="instagram-story-content-card" style="
            flex: 1; min-height: 0; display: flex; flex-direction: column; justify-content: center;
            padding: 10px 0; z-index: 20; position: relative;
        ">
            ${currentSlide.renderCardHtml?currentSlide.renderCardHtml():""}
        </div>

        <!-- \u2500\u2500 BOTTOM ACTION CHROME (Only 1 sleek Apple pill button, no extra arrows!) \u2500\u2500 -->
        <div id="story-bottom-chrome" style="position: relative; z-index: 30; flex-shrink: 0; transition: opacity 0.2s ease;">
            ${currentSlide.primaryAction?`
            <button onclick="event.stopPropagation(); ${currentSlide.primaryAction.action||""}" style="
                width: 100%; height: 50px; border-radius: 999px;
                background: rgba(255, 255, 255, 0.2); backdrop-filter: blur(30px); -webkit-backdrop-filter: blur(30px);
                border: 1px solid rgba(255, 255, 255, 0.35);
                color: #ffffff; font-size: 14.5px; font-weight: 800;
                font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
                letter-spacing: -0.01em; display: flex; align-items: center; justify-content: center; gap: 8px;
                cursor: pointer; box-shadow: 0 8px 30px rgba(0,0,0,0.35), inset 0 1px 1px rgba(255,255,255,0.6);
                transition: transform 0.15s ease, background 0.15s ease;
            " ontouchstart="this.style.transform='scale(0.97)'" ontouchend="this.style.transform='scale(1)'">
                <i class="ph-bold ${currentSlide.primaryAction.icon||"ph-arrow-up-right"}" style="font-size: 17px;"></i>
                <span>${currentSlide.primaryAction.label}</span>
            </button>
            `:`
            <div style="height: 10px;"></div>
            `}
        </div>
    </div>`},window.rerenderCurrentStorySlide=function(){window._rewindState&&typeof window._renderRewindFrame=="function"&&window._renderRewindFrame(window._rewindState.currentIndex)},window._startRewindSlideTimer=function(){if(!window._rewindState)return;window._rewindState.timer&&(clearTimeout(window._rewindState.timer),window._rewindState.timer=null);const duration=window._rewindState.remainingTime||window._rewindState.duration;window._rewindState.startTime=Date.now();const progressBar=document.getElementById("active-rewind-progress-bar");progressBar&&(progressBar.style.transition="none",progressBar.style.width="0%",progressBar.offsetWidth,progressBar.style.transition=`width ${duration}ms linear`,progressBar.style.width="100%"),window._rewindState.timer=setTimeout(()=>{window.rewindNextSlide(!0)},duration)},window.pauseRewindViewer=function(){if(!window._rewindState||window._rewindState.isPaused)return;window._rewindState.isPaused=!0,window._rewindState.timer&&(clearTimeout(window._rewindState.timer),window._rewindState.timer=null);const elapsed=Date.now()-window._rewindState.startTime;window._rewindState.remainingTime=Math.max(0,(window._rewindState.remainingTime||window._rewindState.duration)-elapsed);const progressBar=document.getElementById("active-rewind-progress-bar");if(progressBar){const computedWidth=window.getComputedStyle(progressBar).width;progressBar.style.transition="none",progressBar.style.width=computedWidth}},window.resumeRewindViewer=function(){!window._rewindState||!window._rewindState.isPaused||(window._rewindState.isPaused=!1,window._startRewindSlideTimer())},window.togglePauseRewindViewer=function(){window._rewindState&&(window._rewindState.isPaused?(window.resumeRewindViewer(),window._setRewindChromeVisibility(!0)):(window.pauseRewindViewer(),window._setRewindChromeVisibility(!1)))},window.rewindNextSlide=function(force=!1){if(!window._rewindState)return;const now=Date.now();if(!force&&window._rewindLastNavTime&&now-window._rewindLastNavTime<240)return;window._rewindLastNavTime=now,typeof window.triggerHaptic=="function"&&window.triggerHaptic("light");const slides=window._rewindState.slides;window._rewindState.currentIndex<slides.length-1?(window._rewindState.currentIndex++,window._rewindState.remainingTime=window._rewindState.duration,window._rewindState.isPaused=!1,window._renderRewindFrame(window._rewindState.currentIndex),window._startRewindSlideTimer()):(typeof window.markTodayRewindSeen=="function"&&window.markTodayRewindSeen(),window.closeTodayRewind())},window.rewindPrevSlide=function(force=!1){if(!window._rewindState)return;const now=Date.now();!force&&window._rewindLastNavTime&&now-window._rewindLastNavTime<240||(window._rewindLastNavTime=now,typeof window.triggerHaptic=="function"&&window.triggerHaptic("light"),window._rewindState.currentIndex>0?(window._rewindState.currentIndex--,window._rewindState.remainingTime=window._rewindState.duration,window._rewindState.isPaused=!1,window._renderRewindFrame(window._rewindState.currentIndex),window._startRewindSlideTimer()):(window._rewindState.remainingTime=window._rewindState.duration,window._renderRewindFrame(0),window._startRewindSlideTimer()))},window.rewindGoToSlide=function(idx){if(!window._rewindState)return;const slides=window._rewindState.slides;idx>=0&&idx<slides.length&&(window._rewindState.currentIndex=idx,window._rewindState.remainingTime=window._rewindState.duration,window._rewindState.isPaused=!1,window._renderRewindFrame(idx),window._startRewindSlideTimer())},window.closeTodayRewind=function(){typeof window.triggerHaptic=="function"&&window.triggerHaptic("light"),window._rewindState&&window._rewindState.timer&&(clearTimeout(window._rewindState.timer),window._rewindState.timer=null);const overlay=document.getElementById("today-rewind-viewer-overlay"),frame=document.getElementById("today-rewind-frame");frame&&(frame.style.transform="translateY(80px) scale(0.92)",frame.style.opacity="0",frame.style.transition="all 0.22s cubic-bezier(0.16, 1, 0.3, 1)");const mainContainer=document.querySelector(".main-container"),navContainer=document.getElementById("nav-container");mainContainer&&(mainContainer.style.visibility=""),navContainer&&(navContainer.style.visibility=""),document.body.style.overflow="",overlay&&(overlay.style.opacity="0",overlay.style.transition="opacity 0.22s ease-out",setTimeout(()=>{overlay.remove()},230)),window._rewindKeydownHandler&&(window.removeEventListener("keydown",window._rewindKeydownHandler),window._rewindKeydownHandler=null)},window.openTodayNotifications=function(mode){return(mode==="archive"||mode==="list")&&typeof window.openNotificationsArchive=="function"?window.openNotificationsArchive("all"):window.openTodayRewind()};function openNotificationsArchive(initialTab){typeof window.triggerHaptic=="function"&&window.triggerHaptic("medium");const today=new Date,todayISO=getLocalDateString(today),MN=["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"],dayLabel=`${today.getDate()} ${MN[today.getMonth()]} ${today.getFullYear()}`,data=window.getComprehensiveNotificationData(),effClass=typeof getEffectiveUserClass=="function"?getEffectiveUserClass():"";effClass&&(typeof window.setupClassRealtimeSubscription=="function"&&window.setupClassRealtimeSubscription(),typeof window._fetchClassDataSilent=="function"&&window._fetchClassDataSilent(effClass));const isRep=typeof isCurrentUserRepresentative=="function"?isCurrentUserRepresentative():!1,userId=String(state.user?.id||"utente");window._notifCategoryFilter=initialTab||window._notifCategoryFilter||"all";function getFriendlyDateLabel(iso,raw){if(!iso)return raw||"Data non specificata";if(iso===todayISO)return"Oggi";const parts=iso.split("-");if(parts.length===3){const y=parseInt(parts[0],10),m=parseInt(parts[1],10)-1,d=parseInt(parts[2],10),targetDate=new Date(y,m,d),todayZero=new Date(today.getFullYear(),today.getMonth(),today.getDate()),diffDays=Math.round((targetDate.getTime()-todayZero.getTime())/(1e3*60*60*24)),dayNames=["Domenica","Luned\xEC","Marted\xEC","Mercoled\xEC","Gioved\xEC","Venerd\xEC","Sabato"],monthNames=["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"],monthShort=["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];return diffDays===0?`Oggi \xB7 ${dayNames[targetDate.getDay()]} ${d} ${monthShort[m]}`:diffDays===1?`Domani \xB7 ${dayNames[targetDate.getDay()]} ${d} ${monthShort[m]}`:diffDays===-1?`Ieri \xB7 ${dayNames[targetDate.getDay()]} ${d} ${monthShort[m]}`:diffDays===2?`Dopodomani \xB7 ${dayNames[targetDate.getDay()]} ${d} ${monthShort[m]}`:diffDays>0&&diffDays<=7?`${dayNames[targetDate.getDay()]} ${d} ${monthShort[m]}`:diffDays<0&&diffDays>=-7?`${dayNames[targetDate.getDay()]} ${d} ${monthShort[m]}`:y===today.getFullYear()?`${dayNames[targetDate.getDay()]} ${d} ${monthNames[m]}`:`${d} ${monthShort[m]} ${y}`}return raw||iso}function getCardDateChip(iso,raw){if(!iso)return raw?`<span style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.7);background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.14);padding:2px 8px;border-radius:999px;white-space:nowrap;">${escapeHtml(raw)}</span>`:"";if(iso===todayISO)return'<span style="font-size:10px;font-weight:800;color:#30d158;background:rgba(48,209,88,0.18);border:1px solid rgba(48,209,88,0.45);padding:2px 8px;border-radius:999px;display:inline-flex;align-items:center;gap:3px;white-space:nowrap;"><i class="ph-fill ph-circle" style="font-size:5px;"></i> OGGI</span>';const parts=iso.split("-");if(parts.length===3){const y=parseInt(parts[0],10),m=parseInt(parts[1],10)-1,d=parseInt(parts[2],10),targetDate=new Date(y,m,d),todayZero=new Date(today.getFullYear(),today.getMonth(),today.getDate()),diffDays=Math.round((targetDate.getTime()-todayZero.getTime())/(1e3*60*60*24));if(diffDays===1)return'<span style="font-size:10px;font-weight:800;color:#ff9f0a;background:rgba(255,159,10,0.18);border:1px solid rgba(255,159,10,0.45);padding:2px 8px;border-radius:999px;white-space:nowrap;">DOMANI</span>';if(diffDays===-1)return'<span style="font-size:10px;font-weight:800;color:rgba(255,255,255,0.75);background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.16);padding:2px 8px;border-radius:999px;white-space:nowrap;">IERI</span>';if(diffDays>1&&diffDays<=7)return`<span style="font-size:10px;font-weight:800;color:#ff9f0a;background:rgba(255,159,10,0.14);border:1px solid rgba(255,159,10,0.35);padding:2px 8px;border-radius:999px;white-space:nowrap;">${["Dom","Lun","Mar","Mer","Gio","Ven","Sab"][targetDate.getDay()]} ${d}</span>`;const mnShort=["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"][m];return`<span style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.65);background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);padding:2px 8px;border-radius:999px;white-space:nowrap;">${d} ${mnShort}</span>`}return raw?`<span style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.7);background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);padding:2px 8px;border-radius:999px;white-space:nowrap;">${escapeHtml(raw)}</span>`:""}function renderItemCard(item){if(item.type==="proposta"){const prop=item.rawProp,isAssembly=prop.type==="assembly",title=isAssembly?"Assemblea di Classe":`Sposta Verifica: ${escapeHtml(prop.subject||"Verifica")}`,icon=isAssembly?"ph-users-three":"ph-calendar-plus",accentColor=isAssembly?"#30d158":"#32ade6",acceptVotes=Array.isArray(prop.votes?.accept)?prop.votes.accept:[],declineVotes=Array.isArray(prop.votes?.decline)?prop.votes.decline:[],altVotes=Array.isArray(prop.votes?.alternatives)?prop.votes.alternatives:[],hasAccepted=acceptVotes.includes(userId),hasDeclined=declineVotes.includes(userId),hasAlt=altVotes.some(a=>a.userId===userId),statusBadge=prop.status==="approved"?'<span style="background:rgba(48,209,88,0.18);color:#30d158;font-size:10px;font-weight:800;padding:3px 9px;border-radius:999px;border:1px solid rgba(48,209,88,0.45);white-space:nowrap;">APPROVATA</span>':prop.status==="rejected"?'<span style="background:rgba(255,69,58,0.18);color:#ff453a;font-size:10px;font-weight:800;padding:3px 9px;border-radius:999px;border:1px solid rgba(255,69,58,0.45);white-space:nowrap;">RIFIUTATA</span>':'<span style="background:rgba(50,173,230,0.18);color:#32ade6;font-size:10px;font-weight:800;padding:3px 9px;border-radius:999px;border:1px solid rgba(50,173,230,0.45);white-space:nowrap;">IN VOTAZIONE</span>';return`
            <div data-notif-card style="
                background:rgba(20,31,54,0.85);
                backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
                border:1px solid rgba(255,255,255,0.12);border-left:4.5px solid ${accentColor};
                border-radius:18px;padding:14px 15px;margin-bottom:10px;
                box-shadow:0 6px 20px rgba(0,0,0,0.25);
                display:flex;flex-direction:column;gap:9px;
            ">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
                    <div style="display:flex;align-items:center;gap:6px;">
                        <span style="font-size:10px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:${accentColor};display:flex;align-items:center;gap:4px;">
                            <i class="ph-bold ${icon}"></i> ${item.categoryLabel}
                        </span>
                        ${getCardDateChip(item.dateISO,item.rawDate)}
                    </div>
                    <div style="flex-shrink:0;">${statusBadge}</div>
                </div>

                <div>
                    <div style="font-size:15.5px;font-weight:800;color:#ffffff;line-height:1.25;">${title}</div>
                    <div style="font-size:12.5px;font-weight:600;color:rgba(255,255,255,0.75);margin-top:3px;">
                        ${isAssembly?`Data proposta: <strong style="color:#32ade6;">${prop.targetDate}</strong> (${escapeHtml(prop.duration||"2 ore")})`:`Da: <strong>${prop.originalDate||"\u2014"}</strong> \u2794 A: <strong style="color:#ff9f0a;">${prop.targetDate}</strong>`}
                    </div>
                </div>

                ${prop.reason?`
                <div style="font-size:12.5px;color:rgba(255,255,255,0.88);line-height:1.4;background:rgba(255,255,255,0.04);border-left:2px solid ${accentColor};padding:6px 10px;border-radius:0 8px 8px 0;">
                    <strong style="color:rgba(255,255,255,0.6);font-size:11px;">${escapeHtml(prop.authorName||"Compagno")}:</strong> ${escapeHtml(prop.reason)}
                </div>`:""}

                <div style="display:flex;align-items:center;justify-content:space-between;font-size:11.5px;color:rgba(255,255,255,0.7);padding:0 2px;">
                    <span>Voti: <strong style="color:#30d158;">${acceptVotes.length}</strong> Favorevoli \xB7 <strong style="color:#ff453a;">${declineVotes.length}</strong> Contrari</span>
                    ${altVotes.length>0?`<span style="color:#ff9f0a;font-weight:700;">${altVotes.length} alternative</span>`:""}
                </div>

                ${prop.status==="pending"?`
                <div style="display:grid;grid-template-columns:1fr 1fr 1.2fr;gap:8px;margin-top:2px;">
                    <button onclick="window.voteClassProposal('${prop.id}', 'accept')" style="min-height:38px;border-radius:12px;background:${hasAccepted?"#30d158":"rgba(48,209,88,0.16)"};color:${hasAccepted?"#ffffff":"#30d158"};font-size:12px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;border:1px solid rgba(48,209,88,0.4);">
                        <i class="ph-bold ph-check"></i> Accetta
                    </button>
                    <button onclick="window.voteClassProposal('${prop.id}', 'decline')" style="min-height:38px;border-radius:12px;background:${hasDeclined?"#ff453a":"rgba(255,69,58,0.16)"};color:${hasDeclined?"#ffffff":"#ff453a"};font-size:12px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;border:1px solid rgba(255,69,58,0.4);">
                        <i class="ph-bold ph-x"></i> Rifiuta
                    </button>
                    <button onclick="const altD = prompt('Inserisci una data alternativa (YYYY-MM-DD):', '${prop.targetDate}'); if (altD) window.voteClassProposal('${prop.id}', 'alternative', altD);" style="min-height:38px;border-radius:12px;background:${hasAlt?"#ff9f0a":"rgba(255,159,10,0.16)"};color:${hasAlt?"#ffffff":"#ff9f0a"};font-size:11px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:3px;border:1px solid rgba(255,159,10,0.4);">
                        <i class="ph-bold ph-calendar"></i> Altra Data
                    </button>
                </div>`:""}

                ${isRep&&prop.status==="pending"?`
                <div style="margin-top:4px;padding-top:8px;border-top:0.5px solid rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:space-between;">
                    <span style="font-size:10.5px;font-weight:800;color:#2997ff;text-transform:uppercase;letter-spacing:0.04em;">Rappresentante</span>
                    <div style="display:flex;gap:6px;">
                        <button onclick="window.manageClassProposal('${prop.id}', 'approved')" style="padding:5px 12px;border-radius:9px;background:#30d158;border:none;color:#ffffff;font-size:11px;font-weight:800;cursor:pointer;">Approva</button>
                        <button onclick="window.manageClassProposal('${prop.id}', 'rejected')" style="padding:5px 12px;border-radius:9px;background:rgba(255,69,58,0.2);border:1px solid rgba(255,69,58,0.4);color:#ff453a;font-size:11px;font-weight:800;cursor:pointer;">Archivia</button>
                    </div>
                </div>`:""}
            </div>`}const borderAccent=item.borderAccent||"#2997ff",clickAttr=item.action?`onclick="if(typeof window.triggerHaptic==='function')window.triggerHaptic('light');closeTodayNotifications();${item.action};" style="cursor:pointer;"`:"";if(item.type==="voto")return`
            <div data-notif-card ${clickAttr} style="
                background:rgba(20,31,54,0.85);
                backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
                border:1px solid rgba(255,255,255,0.12);border-left:4.5px solid ${item.valColor};
                border-radius:18px;padding:14px 15px;margin-bottom:10px;
                display:flex;flex-direction:column;gap:6px;
                box-shadow:0 6px 20px rgba(0,0,0,0.25);
                transition:transform 0.15s ease;
            " ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform='scale(1)'">
                
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                    <span style="font-size:10px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:${item.valColor};display:inline-flex;align-items:center;gap:4px;">
                        <i class="ph-bold ph-chart-line-up"></i> VOTO VALUTATO
                    </span>
                    ${getCardDateChip(item.dateISO,item.rawDate)}
                </div>

                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:2px;">
                    <div style="min-width:0;flex:1;">
                        <div style="font-size:16px;font-weight:800;color:#ffffff;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                            ${escapeHtml(item.subject||item.title)}
                        </div>
                        <div style="font-size:12.5px;font-weight:600;color:rgba(255,255,255,0.78);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                            ${escapeHtml(item.tipo||"Valutazione")}
                        </div>
                        ${item.commento?`<div style="font-size:11.5px;color:rgba(255,255,255,0.55);margin-top:2px;font-style:italic;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">"${escapeHtml(item.commento)}"</div>`:""}
                    </div>

                    <div style="flex-shrink:0;min-width:48px;height:48px;border-radius:14px;background:${item.valBg};border:1.5px solid ${item.valColor}77;display:flex;align-items:center;justify-content:center;box-shadow:0 0 16px ${item.valColor}33;padding:0 8px;">
                        <span style="font-size:20px;font-weight:900;color:${item.valColor};font-variant-numeric:tabular-nums;line-height:1;">
                            ${escapeHtml(String(item.val))}
                        </span>
                    </div>
                </div>
            </div>`;if(item.type==="verifica")return`
            <div data-notif-card ${clickAttr} style="
                background:rgba(20,31,54,0.85);
                backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
                border:1px solid rgba(255,255,255,0.12);border-left:4.5px solid #ff9f0a;
                border-radius:18px;padding:14px 15px;margin-bottom:10px;
                display:flex;flex-direction:column;gap:6px;
                box-shadow:0 6px 20px rgba(0,0,0,0.25);
                transition:transform 0.15s ease;
            " ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform='scale(1)'">
                
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                    <span style="font-size:10px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:#ff9f0a;display:inline-flex;align-items:center;gap:4px;">
                        <i class="ph-bold ph-pencil-simple"></i> VERIFICA IN PROGRAMMA
                    </span>
                    ${getCardDateChip(item.dateISO,item.rawDate)}
                </div>

                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:2px;">
                    <div style="min-width:0;flex:1;">
                        <div style="font-size:16px;font-weight:800;color:#ffffff;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                            ${escapeHtml(item.subject||item.title)}
                        </div>
                        <div style="font-size:13px;font-weight:500;color:rgba(255,255,255,0.85);margin-top:3px;line-height:1.35;">
                            ${escapeHtml(item.desc)}
                        </div>
                    </div>

                    <div style="flex-shrink:0;width:42px;height:42px;border-radius:13px;background:rgba(255,159,10,0.16);border:1px solid rgba(255,159,10,0.4);display:flex;align-items:center;justify-content:center;color:#ff9f0a;">
                        <i class="ph-bold ph-calendar-check" style="font-size:20px;"></i>
                    </div>
                </div>
            </div>`;if(item.type==="compito")return`
            <div data-notif-card ${clickAttr} style="
                background:rgba(20,31,54,0.85);
                backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
                border:1px solid rgba(255,255,255,0.12);border-left:4.5px solid #2997ff;
                border-radius:18px;padding:14px 15px;margin-bottom:10px;
                display:flex;flex-direction:column;gap:6px;
                box-shadow:0 6px 20px rgba(0,0,0,0.25);
                transition:transform 0.15s ease;
            " ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform='scale(1)'">
                
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                    <span style="font-size:10px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:#2997ff;display:inline-flex;align-items:center;gap:4px;">
                        <i class="ph-bold ph-book-open"></i> COMPITO ASSEGNATO
                    </span>
                    ${getCardDateChip(item.dateISO,item.rawDate)}
                </div>

                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-top:2px;">
                    <div style="min-width:0;flex:1;">
                        <div style="font-size:16px;font-weight:800;color:#ffffff;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                            ${escapeHtml(item.subject||item.title)}
                        </div>
                        <div style="font-size:13px;font-weight:500;color:rgba(255,255,255,0.88);margin-top:3px;line-height:1.4;">
                            ${escapeHtml(item.desc)}
                        </div>
                    </div>

                    <div style="flex-shrink:0;background:${item.done?"rgba(48,209,88,0.16)":"rgba(41,151,255,0.16)"};border:1px solid ${item.done?"rgba(48,209,88,0.4)":"rgba(41,151,255,0.4)"};color:${item.done?"#30d158":"#2997ff"};padding:4px 9px;border-radius:10px;font-size:11px;font-weight:800;display:flex;align-items:center;gap:4px;white-space:nowrap;">
                        ${item.done?'<i class="ph-bold ph-check"></i> Fatto':"Da fare"}
                    </div>
                </div>
            </div>`;if(item.type==="circolare")return`
            <div data-notif-card ${clickAttr} style="
                background:rgba(20,31,54,0.85);
                backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
                border:1px solid rgba(255,255,255,0.12);border-left:4.5px solid #ffd60a;
                border-radius:18px;padding:14px 15px;margin-bottom:10px;
                display:flex;flex-direction:column;gap:6px;
                box-shadow:0 6px 20px rgba(0,0,0,0.25);
                transition:transform 0.15s ease;
            " ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform='scale(1)'">
                
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                    <span style="font-size:10px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:#ffd60a;display:inline-flex;align-items:center;gap:4px;">
                        <i class="ph-bold ph-file-text"></i> ${item.numero?`CIRCOLARE N. ${escapeHtml(item.numero)}`:"CIRCOLARE"}
                    </span>
                    ${getCardDateChip(item.dateISO,item.rawDate)}
                </div>

                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:2px;">
                    <div style="min-width:0;flex:1;">
                        <div style="font-size:14.5px;font-weight:700;color:#ffffff;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">
                            ${escapeHtml(item.title)}
                        </div>
                    </div>

                    <div style="flex-shrink:0;display:flex;align-items:center;gap:4px;background:rgba(255,214,10,0.14);border:1px solid rgba(255,214,10,0.35);color:#ffd60a;padding:5px 10px;border-radius:10px;font-size:11px;font-weight:800;white-space:nowrap;">
                        <span>Apri</span> <i class="ph-bold ph-arrow-right" style="font-size:11px;"></i>
                    </div>
                </div>
            </div>`;if(item.type==="assenza"||item.type==="ritardo"||item.type==="uscita"){const statusLabel=item.giustificata?"Giustificata":"Da giustificare",statusColor=item.giustificata?"#30d158":"#ff453a",statusBg=item.giustificata?"rgba(48,209,88,0.16)":"rgba(255,69,58,0.16)",statusBorder=item.giustificata?"rgba(48,209,88,0.4)":"rgba(255,69,58,0.4)";return`
            <div data-notif-card ${clickAttr} style="
                background:rgba(20,31,54,0.85);
                backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
                border:1px solid rgba(255,255,255,0.12);border-left:4.5px solid ${borderAccent};
                border-radius:18px;padding:14px 15px;margin-bottom:10px;
                display:flex;flex-direction:column;gap:6px;
                box-shadow:0 6px 20px rgba(0,0,0,0.25);
                transition:transform 0.15s ease;
            " ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform='scale(1)'">
                
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                    <span style="font-size:10px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:${borderAccent};display:inline-flex;align-items:center;gap:4px;">
                        <i class="ph-bold ${item.icon}"></i> ${escapeHtml(item.categoryLabel)}
                    </span>
                    ${getCardDateChip(item.dateISO,item.rawDate)}
                </div>

                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:2px;">
                    <div style="min-width:0;flex:1;">
                        <div style="font-size:15px;font-weight:800;color:#ffffff;line-height:1.25;">
                            ${escapeHtml(item.title)}
                        </div>
                        <div style="font-size:12.5px;font-weight:600;color:rgba(255,255,255,0.78);margin-top:2px;">
                            ${escapeHtml(item.dettaglio||item.desc)}
                        </div>
                    </div>

                    <div style="flex-shrink:0;background:${statusBg};border:1px solid ${statusBorder};color:${statusColor};padding:4px 9px;border-radius:10px;font-size:10.5px;font-weight:800;white-space:nowrap;">
                        ${statusLabel}
                    </div>
                </div>
            </div>`}return item.type==="nota"?`
            <div data-notif-card ${clickAttr} style="
                background:rgba(20,31,54,0.85);
                backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
                border:1px solid rgba(255,255,255,0.12);border-left:4.5px solid #bf5af2;
                border-radius:18px;padding:14px 15px;margin-bottom:10px;
                display:flex;flex-direction:column;gap:6px;
                box-shadow:0 6px 20px rgba(0,0,0,0.25);
                transition:transform 0.15s ease;
            " ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform='scale(1)'">
                
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                    <span style="font-size:10px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:#bf5af2;display:inline-flex;align-items:center;gap:4px;">
                        <i class="ph-bold ph-warning-octagon"></i> NOTA DISCIPLINARE
                    </span>
                    ${getCardDateChip(item.dateISO,item.rawDate)}
                </div>

                <div style="margin-top:2px;">
                    <div style="display:inline-flex;align-items:center;gap:5px;background:rgba(191,90,242,0.16);border:1px solid rgba(191,90,242,0.35);padding:2px 8px;border-radius:6px;font-size:11px;font-weight:800;color:#bf5af2;margin-bottom:6px;">
                        <i class="ph-bold ph-user"></i> ${escapeHtml(item.autore||"Docente")}
                    </div>
                    <div style="font-size:13px;color:rgba(255,255,255,0.92);line-height:1.45;font-style:italic;background:rgba(255,255,255,0.04);border-left:2px solid #bf5af2;padding:6px 10px;border-radius:0 8px 8px 0;">
                        "${escapeHtml(item.testo||item.desc)}"
                    </div>
                </div>
            </div>`:`
        <div data-notif-card ${clickAttr} style="
            background:rgba(20,31,54,0.85);
            backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
            border:1px solid rgba(255,255,255,0.12);border-left:4.5px solid ${borderAccent};
            border-radius:18px;padding:14px 15px;margin-bottom:10px;
            display:flex;flex-direction:column;gap:6px;
            box-shadow:0 6px 20px rgba(0,0,0,0.25);
            transition:transform 0.15s ease;
        " ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform='scale(1)'">
            
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                <span style="font-size:10px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:${borderAccent};display:inline-flex;align-items:center;gap:4px;">
                    <i class="ph-bold ${item.icon||"ph-bell"}"></i> ${escapeHtml(item.categoryLabel||item.type)}
                </span>
                ${getCardDateChip(item.dateISO,item.rawDate)}
            </div>

            <div style="margin-top:2px;">
                <div style="font-size:15px;font-weight:800;color:#ffffff;line-height:1.25;">
                    ${escapeHtml(item.title)}
                </div>
                ${item.desc?`
                <div style="font-size:12.5px;color:rgba(255,255,255,0.82);margin-top:3px;line-height:1.4;">
                    ${escapeHtml(item.desc)}
                </div>`:""}
            </div>
        </div>`}function renderGroupedByDate(items){if(!items||items.length===0)return"";const groups={},groupOrder=[];return items.forEach(item=>{const key=item.dateISO||"undated";groups[key]||(groups[key]=[],groupOrder.push(key)),groups[key].push(item)}),groupOrder.map(key=>{const groupItems=groups[key],isUndated=key==="undated",friendly=isUndated?"Altre Attivit\xE0":getFriendlyDateLabel(key,groupItems[0]?.rawDate),isOggi=key===todayISO,isFuturo=key>todayISO,accent=isOggi?"#30d158":isFuturo?"#ff9f0a":isUndated?"rgba(255,255,255,0.5)":"#2997ff",bg=isOggi?"rgba(48,209,88,0.14)":isFuturo?"rgba(255,159,10,0.14)":isUndated?"rgba(255,255,255,0.06)":"rgba(255,255,255,0.07)",border=isOggi?"rgba(48,209,88,0.35)":isFuturo?"rgba(255,159,10,0.35)":"rgba(255,255,255,0.12)",textColor=isOggi?"#30d158":isFuturo?"#ff9f0a":isUndated?"rgba(255,255,255,0.6)":"rgba(255,255,255,0.85)";return`
            <div style="display:flex;align-items:center;gap:8px;margin:18px 0 10px;padding:0 2px;">
                <span style="display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:800;letter-spacing:0.05em;text-transform:uppercase;color:${textColor};background:${bg};border:1px solid ${border};padding:3px 11px;border-radius:999px;">
                    <i class="${isOggi?"ph-fill ph-circle":isFuturo?"ph-bold ph-calendar-plus":isUndated?"ph-bold ph-dots-three":"ph-bold ph-calendar-blank"}" style="font-size:${isOggi?"6px":"11px"};"></i> ${escapeHtml(friendly)}
                </span>
                <div style="flex:1;height:1px;background:${isOggi?"rgba(48,209,88,0.2)":isFuturo?"rgba(255,159,10,0.2)":"rgba(255,255,255,0.08)"};"></div>
                <span style="font-size:10px;font-weight:800;color:${textColor};opacity:0.8;background:rgba(255,255,255,0.05);padding:1px 6px;border-radius:999px;">${groupItems.length}</span>
            </div>`+groupItems.map(renderItemCard).join("")}).join("")}function buildNotifContentHtml(filter){const d=window.getComprehensiveNotificationData(),all=[...d.todayItems,...d.upcomingItems,...d.recentItems];if(filter==="oggi")return d.todayItems.length>0?renderGroupedByDate(d.todayItems):`<div style="text-align:center;padding:36px 16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:20px;color:rgba(255,255,255,0.5);font-size:13px;font-weight:500;">
                    <i class="ph ph-sparkle" style="font-size:28px;display:block;margin:0 auto 8px;opacity:0.5;color:#2997ff;"></i>
                    Nessuna novit\xE0 registrata per oggi.
                   </div>`;if(filter==="voti"){const votiItems=all.filter(x=>x.category==="voti"||x.type==="nota");return votiItems.length>0?renderGroupedByDate(votiItems):`<div style="text-align:center;padding:36px 16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:20px;color:rgba(255,255,255,0.5);font-size:13px;font-weight:500;">
                    <i class="ph ph-chart-line-up" style="font-size:28px;display:block;margin:0 auto 8px;opacity:0.5;color:#30d158;"></i>
                    Nessun voto o nota recente registrata.
                   </div>`}if(filter==="compiti"){const compitiItems=all.filter(x=>x.category==="compiti"||x.category==="verifiche");return compitiItems.length>0?renderGroupedByDate(compitiItems):`<div style="text-align:center;padding:36px 16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:20px;color:rgba(255,255,255,0.5);font-size:13px;font-weight:500;">
                    <i class="ph ph-book-open" style="font-size:28px;display:block;margin:0 auto 8px;opacity:0.5;color:#2997ff;"></i>
                    Nessun compito o verifica in arrivo.
                   </div>`}if(filter==="circolari"){const circItems=all.filter(x=>x.category==="circolari"||x.category==="comunicazioni");return circItems.length>0?renderGroupedByDate(circItems):`<div style="text-align:center;padding:36px 16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:20px;color:rgba(255,255,255,0.5);font-size:13px;font-weight:500;">
                    <i class="ph ph-file-text" style="font-size:28px;display:block;margin:0 auto 8px;opacity:0.5;color:#ffd60a;"></i>
                    Nessuna circolare o avviso registrato.
                   </div>`}if(filter==="proposte"){const propItems=all.filter(x=>x.category==="proposte");return propItems.length>0?renderGroupedByDate(propItems):`<div style="text-align:center;padding:36px 16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:20px;color:rgba(255,255,255,0.5);font-size:13px;font-weight:500;">
                    <i class="ph ph-users-three" style="font-size:28px;display:block;margin:0 auto 8px;opacity:0.5;color:#30d158;"></i>
                    Nessuna proposta attiva al momento.
                   </div>`}if(!(d.todayItems.length>0||d.upcomingItems.length>0||d.recentItems.length>0))return`
            <div style="text-align:center;padding:48px 16px;background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.08);border-radius:22px;color:rgba(255,255,255,0.45);font-size:13px;">
                <i class="ph ph-bell-simple-slash" style="font-size:32px;display:block;margin:0 auto 10px;opacity:0.4;color:#2997ff;"></i>
                Nessuna novit\xE0 o notifica recente registrata.
            </div>`;let out="";return d.todayItems.length>0&&(out+=`
            <div style="margin-bottom:20px;">
                ${renderGroupedByDate(d.todayItems)}
            </div>`),d.upcomingItems.length>0&&(out+=`
            <div style="margin-bottom:20px;">
                <div style="display:flex;align-items:center;gap:8px;margin:22px 0 10px;padding:0 2px;">
                    <span style="display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:#ff9f0a;background:rgba(255,159,10,0.16);border:1px solid rgba(255,159,10,0.4);padding:4px 12px;border-radius:999px;">
                        <i class="ph-fill ph-calendar-plus" style="font-size:12px;"></i> PROSSIMI GIORNI (${d.upcomingItems.length})
                    </span>
                    <div style="flex:1;height:1px;background:rgba(255,159,10,0.25);"></div>
                </div>
                ${renderGroupedByDate(d.upcomingItems)}
            </div>`),d.recentItems.length>0&&(out+=`
            <div style="margin-bottom:12px;">
                <div onclick="window.toggleRecentNotifications(this)" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;padding:11px 14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);border-radius:15px;margin-bottom:10px;transition:all 0.15s ease;user-select:none;">
                    <span style="font-size:11px;font-weight:800;letter-spacing:0.07em;text-transform:uppercase;color:rgba(255,255,255,0.65);display:flex;align-items:center;gap:6px;">
                        <i class="ph-fill ph-clock-counter-clockwise"></i> ATTIVIT\xC0 PRECEDENTI (${d.recentItems.length})
                    </span>
                    <div style="display:flex;align-items:center;gap:5px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);padding:3px 10px;border-radius:999px;">
                        <span id="notif-recent-btn-text" style="font-size:10.5px;font-weight:700;color:rgba(255,255,255,0.8);">Nascondi</span>
                        <i id="notif-recent-btn-icon" class="ph-bold ph-caret-down" style="font-size:11px;color:rgba(255,255,255,0.8);display:inline-block;transform:rotate(180deg);"></i>
                    </div>
                </div>
                <div id="notif-recent-items-wrap" data-collapsed="false" style="display:block;">
                    ${renderGroupedByDate(d.recentItems.slice(0,25))}
                </div>
            </div>`),out}const filterTabs=[{id:"all",label:"Tutte",count:data.totalCount},{id:"oggi",label:"Oggi",count:data.todayCount},{id:"voti",label:"Voti & Note",count:data.todayItems.concat(data.upcomingItems,data.recentItems).filter(x=>x.category==="voti"||x.type==="nota").length},{id:"compiti",label:"Compiti & Verifiche",count:data.todayItems.concat(data.upcomingItems,data.recentItems).filter(x=>x.category==="compiti"||x.category==="verifiche").length},{id:"circolari",label:"Circolari & Avvisi",count:data.todayItems.concat(data.upcomingItems,data.recentItems).filter(x=>x.category==="circolari"||x.category==="comunicazioni").length},{id:"proposte",label:"Proposte",count:data.todayItems.concat(data.upcomingItems,data.recentItems).filter(x=>x.category==="proposte").length}];if(window.setNotifCategoryFilter=function(filterId){typeof window.triggerHaptic=="function"&&window.triggerHaptic("selection"),window._notifCategoryFilter=filterId,document.querySelectorAll("#notif-filter-bar button").forEach(btn=>{const isSelected=btn.getAttribute("data-notif-filter")===filterId;btn.style.background=isSelected?"#2997ff":"rgba(20,31,54,0.75)",btn.style.color=isSelected?"#ffffff":"rgba(255,255,255,0.7)",btn.style.borderColor=isSelected?"rgba(41,151,255,0.6)":"rgba(255,255,255,0.12)",btn.style.boxShadow=isSelected?"0 4px 12px rgba(41,151,255,0.35)":"none";const countEl=btn.querySelector(".notif-tab-count");countEl&&(countEl.style.background=isSelected?"rgba(255,255,255,0.25)":"rgba(255,255,255,0.08)")});const container=document.getElementById("today-notif-results-container");container&&(container.innerHTML=buildNotifContentHtml(filterId),container.scrollTop=0)},document.getElementById("today-notif-overlay")){const container=document.getElementById("today-notif-results-container");container&&(container.innerHTML=buildNotifContentHtml(window._notifCategoryFilter));return}const modals=document.getElementById("modals")||document.body,overlayHtml=`
    <div id="today-notif-overlay" style="position:fixed;inset:0;z-index:10000;background:rgba(5,8,17,0.78);backdrop-filter:blur(30px) saturate(190%);-webkit-backdrop-filter:blur(30px) saturate(190%);display:flex;flex-direction:column;justify-content:flex-end;opacity:0;transition:opacity 0.25s ease;font-family:'Inter',sans-serif;" onclick="if(event.target===this)closeTodayNotifications()">
        <div id="today-notif-sheet" style="
            width:100%;max-width:640px;margin:0 auto;height:92vh;max-height:92vh;
            background:rgba(12,20,36,0.96);
            border:1px solid rgba(255,255,255,0.14);
            border-top:1px solid rgba(255,255,255,0.28);
            border-radius:32px 32px 0 0;
            display:flex;flex-direction:column;
            overflow:hidden;
            box-shadow:0 -16px 48px rgba(0,0,0,0.75);
            transform:translateY(100%);
            transition:transform 0.35s cubic-bezier(0.16,1,0.3,1);
        ">
            <!-- Drag Handle Bar -->
            <div id="today-notif-drag-handle" style="display:flex;justify-content:center;padding:12px 0 6px;flex-shrink:0;cursor:grab;touch-action:none;">
                <div style="width:40px;height:5px;background:rgba(255,255,255,0.25);border-radius:999px;"></div>
            </div>

            <!-- Header -->
            <div style="padding:6px 20px 14px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
                <div>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:6px;background:rgba(41,151,255,0.2);color:#2997ff;font-size:11px;">
                            <i class="ph-fill ph-bell"></i>
                        </span>
                        <span style="font-size:10.5px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#2997ff;">CENTRO NOTIFICHE</span>
                    </div>
                    <h2 style="font-size:22px;font-weight:800;color:#ffffff;margin:2px 0 0;letter-spacing:-0.02em;">Novit\xE0 & Attivit\xE0</h2>
                    <p style="font-size:12px;color:rgba(255,255,255,0.6);margin:2px 0 0;font-weight:500;">${dayLabel}</p>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-size:11.5px;font-weight:800;color:${data.todayCount>0?"#2997ff":"rgba(255,255,255,0.6)"};background:${data.todayCount>0?"rgba(41,151,255,0.18)":"rgba(255,255,255,0.06)"};border:1px solid ${data.todayCount>0?"rgba(41,151,255,0.35)":"rgba(255,255,255,0.12)"};padding:5px 11px;border-radius:999px;">
                        ${data.todayCount>0?`${data.todayCount} oggi`:"0 oggi"}
                    </span>
                    <button onclick="closeTodayNotifications()" class="liquid-glass-v8 rim-light squircle-full" style="display:flex;align-items:center;gap:6px;padding:7px 14px;border:none;cursor:pointer;background:rgba(255,255,255,0.08);color:#ffffff;font-size:12px;font-weight:700;font-family:'Inter',sans-serif;transition:transform 0.15s ease;" ontouchstart="this.style.transform='scale(0.92)'" ontouchend="this.style.transform='scale(1)'">
                        <i class="ph ph-x" style="font-size:14px;"></i>
                        <span>Chiudi</span>
                    </button>
                </div>
            </div>

            <!-- Horizontal Category Filter Bar (Evita confusione visiva) -->
            <div id="notif-filter-bar" style="display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;padding:0 20px 14px;flex-shrink:0;">
                ${filterTabs.map(tab=>{const active=window._notifCategoryFilter===tab.id;return`
                    <button data-notif-filter="${tab.id}" onclick="window.setNotifCategoryFilter('${tab.id}')" style="flex-shrink:0;padding:7px 13px;border-radius:9999px;font-size:11.5px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;white-space:nowrap;display:flex;align-items:center;gap:6px;transition:all 0.2s ease;background:${active?"#2997ff":"rgba(20,31,54,0.75)"};border:1px solid ${active?"rgba(41,151,255,0.6)":"rgba(255,255,255,0.12)"};color:${active?"#ffffff":"rgba(255,255,255,0.75)"};box-shadow:${active?"0 4px 12px rgba(41,151,255,0.35)":"none"};">
                        <span>${tab.label}</span>
                        <span class="notif-tab-count" style="font-size:9.5px;opacity:0.85;padding:1px 5px;border-radius:999px;background:${active?"rgba(255,255,255,0.25)":"rgba(255,255,255,0.08)"};">${tab.count}</span>
                    </button>`}).join("")}
            </div>

            <!-- Scrollable List Container (A filo con il bordo del telefono, senza blur cutoffs) -->
            <div id="today-notif-results-container" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:0 20px 80px 20px;">
                ${buildNotifContentHtml(window._notifCategoryFilter)}
            </div>

        </div>
    </div>
    `;if(modals.id==="modals")modals.innerHTML=overlayHtml;else{const temp=document.createElement("div");temp.innerHTML=overlayHtml,modals.appendChild(temp.firstElementChild)}const overlay=document.getElementById("today-notif-overlay"),sheet=document.getElementById("today-notif-sheet");requestAnimationFrame(()=>{overlay&&(overlay.style.opacity="1"),sheet&&(sheet.style.transform="translateY(0)")});const handle=document.getElementById("today-notif-drag-handle");if(handle&&sheet){let startY=0,currentY=0,isDragging=!1;handle.addEventListener("touchstart",e=>{e.touches&&e.touches.length===1&&(startY=e.touches[0].clientY,isDragging=!0)},{passive:!0}),handle.addEventListener("touchmove",e=>{!isDragging||!e.touches||(currentY=Math.max(0,e.touches[0].clientY-startY),sheet.style.transform=`translateY(${currentY}px)`)},{passive:!0}),handle.addEventListener("touchend",()=>{isDragging&&(isDragging=!1,currentY>110?window.closeTodayNotifications():(sheet.style.transform="translateY(0)",sheet.style.transition="transform 0.3s cubic-bezier(0.16,1,0.3,1)"))},{passive:!0})}}window.openNotificationsArchive=openNotificationsArchive;function openTodayNotifications(mode){return mode==="archive"||mode==="list"?openNotificationsArchive("all"):window.openTodayRewind()}window.openTodayNotifications=openTodayNotifications,window.toggleRecentNotifications=function(btn){typeof window.triggerHaptic=="function"&&window.triggerHaptic("light");const wrap=document.getElementById("notif-recent-items-wrap"),text=document.getElementById("notif-recent-btn-text"),icon=document.getElementById("notif-recent-btn-icon");if(!wrap)return;wrap.style.display==="none"||wrap.getAttribute("data-collapsed")==="true"?(wrap.style.display="block",wrap.setAttribute("data-collapsed","false"),text&&(text.textContent="Nascondi"),icon&&(icon.style.transform="rotate(180deg)"),localStorage.setItem("notif_recent_hidden","0")):(wrap.style.display="none",wrap.setAttribute("data-collapsed","true"),text&&(text.textContent="Mostra"),icon&&(icon.style.transform="rotate(0deg)"),localStorage.setItem("notif_recent_hidden","1"))};function closeTodayNotifications(){typeof window.triggerHaptic=="function"&&window.triggerHaptic("light");const overlay=document.getElementById("today-notif-overlay"),sheet=document.getElementById("today-notif-sheet");sheet&&(sheet.style.transform="translateY(100%)"),overlay&&(overlay.style.opacity="0",overlay.style.transition="opacity 0.25s ease-out",setTimeout(()=>{const modals=document.getElementById("modals");modals&&(modals.innerHTML=""),overlay&&overlay.parentNode&&overlay.parentNode!==modals&&overlay.remove()},260))}window.closeTodayNotifications=closeTodayNotifications,window.closeNotificationsArchive=closeTodayNotifications;function loadAcademicPreferences(){if(state._academicKey===lsKey("academic_preferences"))return;state._academicKey=lsKey("academic_preferences");let prefs={};try{prefs=JSON.parse(localStorage.getItem(state._academicKey)||"{}")}catch{}state.availability=prefs.availability||{start:"15:00",end:"18:00"},state.difficulty=Array.isArray(prefs.difficulty)?prefs.difficulty:[]}function saveAcademicPreferences(){localStorage.setItem(lsKey("academic_preferences"),JSON.stringify({availability:state.availability,difficulty:state.difficulty}))}function saveAvailability(){loadAcademicPreferences();const start=document.getElementById("studyStart")?.value,end=document.getElementById("studyEnd")?.value;if(!/^\d{2}:\d{2}$/.test(start||"")||!/^\d{2}:\d{2}$/.test(end||"")||start>=end){showToast("Scegli un orario di fine successivo all\u2019inizio","warning");return}state.availability={start,end},saveAcademicPreferences()}function toggleDifficulty(subject){loadAcademicPreferences(),state.difficulty=state.difficulty.includes(subject)?state.difficulty.filter(s=>s!==subject):[...state.difficulty,subject],saveAcademicPreferences(),scheduleRender(0)}function renderAcademicProfile(){return window.loadFrontendFeature("views").then(()=>window.scheduleRender(0)).catch(()=>{}),'<div class="view" style="padding:24px">Caricamento\u2026 <button onclick="window.scheduleRender(0)">Riprova</button></div>'}function renderMediaGauge(target=0){}function isFutureOrToday(dateStr){if(!dateStr)return!1;const todayStr=getLocalDateString(getSchoolDate());return dateStr>=todayStr}window.isFutureOrToday=isFutureOrToday;function updateWeeklyAgendaView(){if(state.view!=="planner")return;const el=document.getElementById("weekly-agenda-list");if(!el)return;const newContent=renderWeeklyAgenda(),temp=document.createElement("div");temp.innerHTML=newContent;const newList=temp.querySelector("#weekly-agenda-list");el.style.opacity="0",el.style.transition="opacity 0.15s ease-out",setTimeout(()=>{newList?el.innerHTML=newList.innerHTML:el.innerHTML=newContent,el.style.opacity="1"},100)}function setupCanvas(canvas){const rect=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;canvas.width=Math.floor(rect.width*dpr),canvas.height=Math.floor(rect.height*dpr);const ctx=canvas.getContext("2d");return ctx.setTransform(dpr,0,0,dpr,0,0),{ctx,rect,dpr}}function colorWithAlpha(color,alpha){const safeAlpha=Number.isFinite(alpha)?Math.max(0,Math.min(1,alpha)):1,source=String(color||"").trim();if(!source)return`rgba(37, 99, 235, ${safeAlpha})`;const hexMatch=source.match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);if(hexMatch){const hex=hexMatch[1],expanded=hex.length<=4?hex.split("").map(ch=>ch+ch).join(""):hex,rgb=expanded.length===8?expanded.slice(0,6):expanded,r=parseInt(rgb.slice(0,2),16),g=parseInt(rgb.slice(2,4),16),b=parseInt(rgb.slice(4,6),16);if([r,g,b].every(Number.isFinite))return`rgba(${r}, ${g}, ${b}, ${safeAlpha})`}const hslMatch=source.match(/^hsl\(\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)%\s*,\s*([+-]?\d*\.?\d+)%\s*\)$/i);if(hslMatch)return`hsla(${hslMatch[1]}, ${hslMatch[2]}%, ${hslMatch[3]}%, ${safeAlpha})`;const hslaMatch=source.match(/^hsla\(\s*([^)]+)\)$/i);if(hslaMatch){const parts=hslaMatch[1].split(",").map(p=>p.trim());if(parts.length>=3)return`hsla(${parts[0]}, ${parts[1]}, ${parts[2]}, ${safeAlpha})`}const rgbMatch=source.match(/^rgb\(\s*([^)]+)\)$/i);if(rgbMatch){const parts=rgbMatch[1].split(",").map(p=>p.trim());if(parts.length>=3)return`rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${safeAlpha})`}const rgbaMatch=source.match(/^rgba\(\s*([^)]+)\)$/i);if(rgbaMatch){const parts=rgbaMatch[1].split(",").map(p=>p.trim());if(parts.length>=3)return`rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${safeAlpha})`}return source}function drawSubjectTrendFrame(ctx,W,H,trendItems,subjColor,progress=1){if(!Array.isArray(trendItems)||trendItems.length===0)return;const p={left:44,right:18,top:16,bottom:34},innerW=Math.max(1,W-p.left-p.right),innerH=Math.max(1,H-p.top-p.bottom),yMin=0,ySpan=10-yMin,dateMin=trendItems[0].date.getTime(),dateMax=trendItems[trendItems.length-1].date.getTime(),dateSpan=Math.max(1,dateMax-dateMin),points=trendItems.map(item=>{const x=p.left+(item.date.getTime()-dateMin)/dateSpan*innerW,y=p.top+(1-(item.value-yMin)/ySpan)*innerH;return{x,y,value:item.value}});ctx.clearRect(0,0,W,H),[0,PASSING_GRADE_THRESHOLD,8,10].forEach(t=>{const y=p.top+(1-(t-yMin)/ySpan)*innerH;ctx.strokeStyle="#E8E4DE",ctx.lineWidth=1,ctx.beginPath(),ctx.moveTo(p.left,y),ctx.lineTo(W-p.right,y),ctx.stroke(),ctx.fillStyle="var(--on-surface-variant)",ctx.font="700 10px JetBrains Mono",ctx.textAlign="right",ctx.fillText(String(t),p.left-8,y+3)});const visibleCount=Math.max(1,Math.ceil((points.length-1)*progress)+1),visiblePoints=points.slice(0,visibleCount);if(visiblePoints.length>=2){const grad=ctx.createLinearGradient(0,p.top,0,H-p.bottom);grad.addColorStop(0,colorWithAlpha(subjColor,SUBJECT_TREND_GRADIENT_TOP_ALPHA)),grad.addColorStop(.55,colorWithAlpha(subjColor,SUBJECT_TREND_GRADIENT_MID_ALPHA)),grad.addColorStop(1,colorWithAlpha(subjColor,SUBJECT_TREND_GRADIENT_BOTTOM_ALPHA)),ctx.beginPath(),ctx.moveTo(visiblePoints[0].x,H-p.bottom),visiblePoints.forEach(pt=>ctx.lineTo(pt.x,pt.y)),ctx.lineTo(visiblePoints[visiblePoints.length-1].x,H-p.bottom),ctx.closePath(),ctx.fillStyle=grad,ctx.fill()}ctx.strokeStyle=subjColor,ctx.lineWidth=3,ctx.lineCap="round",ctx.lineJoin="round",ctx.beginPath(),visiblePoints.forEach((pt,i)=>{i===0?ctx.moveTo(pt.x,pt.y):ctx.lineTo(pt.x,pt.y)}),ctx.stroke(),visiblePoints.forEach(pt=>{ctx.fillStyle=pt.value>=PASSING_GRADE_THRESHOLD?"#2DB86A":"#FF3B30",ctx.beginPath(),ctx.arc(pt.x,pt.y,4,0,Math.PI*2),ctx.fill(),ctx.strokeStyle="var(--surface-container-lowest)",ctx.lineWidth=2,ctx.stroke()});const firstLabel=trendItems[0].date.toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit"}),lastLabel=trendItems[trendItems.length-1].date.toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit"});ctx.fillStyle="var(--on-surface-variant)",ctx.font="700 10px JetBrains Mono",ctx.textAlign="left",ctx.fillText(firstLabel,p.left,H-10),ctx.textAlign="right",ctx.fillText(lastLabel,W-p.right,H-10)}function initSubjectTrendChart(canvasId,trendItems,subjColor){const canvas=document.getElementById(canvasId);if(!canvas||!Array.isArray(trendItems)||trendItems.length===0)return;const{ctx,rect}=setupCanvas(canvas),W=rect.width,H=rect.height;subjectTrendAnimationFrame&&cancelAnimationFrame(subjectTrendAnimationFrame);let animationProgress=0;const animate=()=>{if(!document.getElementById(canvasId)){subjectTrendAnimationFrame=null;return}animationProgress=Math.min(1,animationProgress+SUBJECT_TREND_ANIMATION_STEP),drawSubjectTrendFrame(ctx,W,H,trendItems,subjColor,animationProgress),animationProgress<1?subjectTrendAnimationFrame=requestAnimationFrame(animate):subjectTrendAnimationFrame=null};drawSubjectTrendFrame(ctx,W,H,trendItems,subjColor,SUBJECT_TREND_ANIMATION_INITIAL_PROGRESS),subjectTrendAnimationFrame=requestAnimationFrame(animate)}function scheduleSubjectTrendChartInit(payload){if(!payload||!Array.isArray(payload.points)||payload.points.length===0)return;const color=payload.color||"#2563EB",normalized=payload.points.map(p=>{const value=Number(p?.value),date=new Date(p?.date);return!Number.isFinite(value)||Number.isNaN(date.getTime())?null:{value,date}}).filter(Boolean);normalized.length&&requestAnimationFrame(()=>requestAnimationFrame(()=>{typeof initSubjectTrendChart=="function"&&initSubjectTrendChart("subjectTrendCanvas",normalized,color)}))}window.scheduleSubjectTrendChartInit=scheduleSubjectTrendChartInit;function mountSubjectTrendChartFromDom(){const canvas=document.getElementById("subjectTrendCanvas");if(!canvas)return;const pointsEncoded=canvas.getAttribute("data-points"),color=canvas.getAttribute("data-color")||"#2563EB";if(pointsEncoded)try{const decoded=decodeURIComponent(pointsEncoded),points=JSON.parse(decoded);typeof scheduleSubjectTrendChartInit=="function"&&scheduleSubjectTrendChartInit({points,color})}catch(e){console.warn("Unable to mount subject trend chart:",e?.message||e)}}function initCustomScrollbar(){const scroller=document.getElementById("custom-scrollbar"),thumb=document.getElementById("scroll-thumb");if(!scroller||!thumb)return;let fadeTimeout,isScrolling=!1;function updateScroll(){const viewportHeight=window.innerHeight,totalHeight=document.documentElement.scrollHeight,scrollY=window.pageYOffset||document.documentElement.scrollTop;if(totalHeight<=viewportHeight+20){scroller.classList.remove("show-scrollbar");return}scroller.classList.add("show-scrollbar");const thumbHeight=Math.max(60,viewportHeight/totalHeight*viewportHeight),thumbTop=scrollY/(totalHeight-viewportHeight)*(viewportHeight-thumbHeight-20);thumb.style.height=thumbHeight+"px",thumb.style.transform=`translateY(${thumbTop+10}px)`,clearTimeout(fadeTimeout),fadeTimeout=setTimeout(()=>{scroller.classList.remove("show-scrollbar")},1800)}window.addEventListener("scroll",updateScroll,{passive:!0}),window.addEventListener("resize",updateScroll),new MutationObserver(updateScroll).observe(document.body,{childList:!0,subtree:!0}),updateScroll()}function initGradesCharts(){const canvas=document.getElementById("gradesTrendCanvas");if(!canvas)return;const{ctx,rect}=setupCanvas(canvas),W=rect.width,H=rect.height;let votiData=[...getVotiData()];if(state.activeSubject&&(votiData=votiData.filter(v=>areSubjectsEquivalent(v.materia||v.subject,state.activeSubject))),votiData.sort((a,b)=>parseArgoDate(a.data||a.date)-parseArgoDate(b.data||b.date)),votiData.length<2){ctx.fillStyle="rgba(var(--glass-rgb),0.3)",ctx.font="700 13px Rubik",ctx.textAlign="center",ctx.fillText("Trend disponibile dopo 2 voti",W/2,H/2);return}let sum=0;const points=votiData.map((v,i)=>{const val=parseFloat((v.valore||v.value||"0").toString().replace(",","."));return sum+=val,{val:sum/(i+1),raw:val,date:v.data||v.date}}),padding=30,stepX=(W-padding*2)/(points.length-1),series=points.map(p=>p.val),labels=points.map(p=>parseArgoDate(p.date).toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit"})),values=points.map(p=>p.raw),minV=Math.max(0,Math.min(...values,...series)-.5),maxV=Math.min(10,Math.max(...values,...series,8)+.5);function getY(val){const ratio=(val-minV)/Math.max(CHART_MIN_RANGE_EPSILON,maxV-minV);return H-padding*1.5-ratio*(H-padding*2.5)}const grad=ctx.createLinearGradient(0,0,0,H);grad.addColorStop(0,"rgba(37, 99, 235, 1)"),grad.addColorStop(.55,"rgba(37, 99, 235, 0.45)"),grad.addColorStop(1,"rgba(37, 99, 235, 0.08)"),ctx.beginPath(),ctx.moveTo(padding,getY(series[0]));for(let i=1;i<series.length;i++)ctx.lineTo(padding+i*stepX,getY(series[i]));ctx.lineTo(W-padding,H-padding*1.5),ctx.lineTo(padding,H-padding*1.5),ctx.closePath(),ctx.fillStyle=grad,ctx.fill(),ctx.beginPath(),ctx.moveTo(padding,getY(series[0]));for(let i=1;i<series.length;i++)ctx.lineTo(padding+i*stepX,getY(series[i]));ctx.strokeStyle=CHART_LINE_COLOR,ctx.lineWidth=4,ctx.lineCap="round",ctx.lineJoin="round",ctx.stroke(),series.forEach((val,i)=>{const x=padding+i*stepX,y=getY(val);ctx.fillStyle="white",ctx.beginPath(),ctx.arc(x,y,4,0,Math.PI*2),ctx.fill(),ctx.fillStyle=CHART_LABEL_COLOR,ctx.font=CHART_LABEL_FONT,ctx.textAlign="center",ctx.fillText(labels[i],x,H-5)})}function renderSubjectDetailView(subjectName){const activeYearKey=typeof getActiveSchoolYear=="function"?getActiveSchoolYear():typeof getCurrentSchoolYearKey=="function"?getCurrentSchoolYearKey():"2026/27",normalizedSubject=normalizeSubjectName(subjectName),votiData=(typeof getVotesForSchoolYear=="function"?getVotesForSchoolYear(activeYearKey):getVotiData()).filter(v=>areSubjectsEquivalent(v.materia||v.subject,normalizedSubject)).sort((a,b)=>parseArgoDate(b.data||b.date)-parseArgoDate(a.data||a.date)),media=parseFloat(calcolaMedia(votiData))||0,hasSubjectMedia=votiData.length>0&&media>0,goal=state.goals?.[subjectName]||8,n=votiData.length,theme=getSubjectTheme(subjectName),formattedTitle=formatSubjectTitle(subjectName),allNums=[...votiData].sort((a,b)=>(a.data||a.date||"").localeCompare(b.data||b.date||"")).map(getNumericGradeValue).filter(v=>Number.isFinite(v)),mediaConTutti=allNums.length>0?allNums.reduce((s,x)=>s+x,0)/allNums.length:null,mediaSenzaUltimo=allNums.length>1?allNums.slice(0,-1).reduce((s,x)=>s+x,0)/(allNums.length-1):null;let diffStr="",isPosTrend=!0;if(mediaConTutti!==null&&mediaSenzaUltimo!==null){const diff=mediaConTutti-mediaSenzaUltimo;isPosTrend=diff>=0,diffStr=(isPosTrend?"+":"")+diff.toFixed(2)}let statusBadge={label:"Sufficiente",color:"#2997ff",bg:"rgba(41,151,255,0.15)",border:"rgba(41,151,255,0.35)",icon:"ph-check-circle"};media>=8.5?statusBadge={label:"Eccellente",color:"#30d158",bg:"rgba(48,209,88,0.18)",border:"rgba(48,209,88,0.38)",icon:"ph-star"}:media>=7.5?statusBadge={label:"Ottimo",color:"#30d158",bg:"rgba(48,209,88,0.15)",border:"rgba(48,209,88,0.35)",icon:"ph-trend-up"}:media>=6.5?statusBadge={label:"Discreto",color:"#64d2ff",bg:"rgba(100,210,255,0.15)",border:"rgba(100,210,255,0.35)",icon:"ph-thumbs-up"}:media>=6?statusBadge={label:"Sufficiente",color:"#2997ff",bg:"rgba(41,151,255,0.15)",border:"rgba(41,151,255,0.35)",icon:"ph-check"}:media>0?statusBadge={label:"Insufficiente",color:"#ff453a",bg:"rgba(255,69,58,0.18)",border:"rgba(255,69,58,0.38)",icon:"ph-warning"}:statusBadge={label:"Nessun Voto",color:"rgba(255,255,255,0.5)",bg:"rgba(255,255,255,0.06)",border:"rgba(255,255,255,0.12)",icon:"ph-info"};function semesterOf(v){const raw=v.data||v.date||"",d=parseArgoDate?parseArgoDate(raw):new Date(raw);if(!d||isNaN(d))return 0;const m=d.getMonth();return m>=8||m===0?1:2}const s1=votiData.filter(v=>semesterOf(v)===1),s2=votiData.filter(v=>semesterOf(v)===2),media1=parseFloat(calcolaMedia(s1))||0,media2=parseFloat(calcolaMedia(s2))||0,hasSemesters=s1.length>0&&s2.length>0,uid=Math.random().toString(36).slice(2,7),simLblId="sL"+uid,simResId="sR"+uid,simDiffId="sD"+uid,simDefault=((media*n+7.5)/(n+1)).toFixed(2),simDeltaInit=(parseFloat(simDefault)-media).toFixed(2);let goalText;if(n>0&&goal>media){const gap=goal-media,sumNow=media*n;if(gap>=4)goalText=`Obiettivo di <strong style="color:#ff9f0a;">${goal.toFixed(1)}</strong> con media attuale di ${media.toFixed(2)}: la distanza \xE8 significativa, procedi per gradi puntando a un target intermedio.`;else{const gradeValues=[7,8,9,10].filter(g=>g>goal),scenarios=[];for(const gradeVal of gradeValues){const raw=(goal*n-sumNow)/(gradeVal-goal),k=Math.ceil(raw);k>=1&&k<=30&&Number.isFinite(k)&&scenarios.push({gradeVal,k})}if(scenarios.length===0)goalText=`Per raggiungere <strong style="color:#ff9f0a;">${goal.toFixed(1)}</strong> con media attuale ${media.toFixed(2)} servirebbero voti massimi costanti. Considera un obiettivo ravvicinato.`;else{const lines=scenarios.slice(0,3).map(s=>`<strong style="color:${theme.color};">${s.k} ${s.k===1?"voto":"voti"} da ${s.gradeVal}</strong>`).join(" &nbsp;\xB7&nbsp; ");goalText=`Per raggiungere <strong style="color:#ff9f0a;">${goal.toFixed(1)}</strong> ti occorrono: ${lines}.`}}}else media>=goal&&media>0?goalText=`\u{1F389} Complimenti! Hai gi\xE0 raggiunto e superato il tuo obiettivo di <strong style="color:#30d158;">${goal.toFixed(1)}</strong>. Mantieni questa media!`:goalText="Imposta un obiettivo personalizzato per visualizzare le simulazioni e i suggerimenti accademici.";const MN=["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"],subMonthMap={};votiData.forEach(v=>{const raw=v.data||v.date||"",d0=parseArgoDate?parseArgoDate(raw):new Date(raw);if(!d0||isNaN(d0))return;const key=d0.getFullYear()*100+d0.getMonth();subMonthMap[key]||(subMonthMap[key]={label:MN[d0.getMonth()],nums:[]});const val=getNumericGradeValue(v);Number.isFinite(val)&&subMonthMap[key].nums.push(val)});const subMonthList=Object.entries(subMonthMap).sort((a,b)=>Number(a[0])-Number(b[0])).map(([,m])=>({label:m.label,avg:m.nums.reduce((s,x)=>s+x,0)/m.nums.length})).slice(-6);let svgArea="",svgPath="",svgDots="",xLabels=[];if(subMonthList.length>=2){const pts=subMonthList.map((m,i)=>{const x=10+i/(subMonthList.length-1)*300,y=70-(m.avg-1)/9*60;return[x,y]});let d=`M${pts[0][0]},${pts[0][1]}`;for(let i=1;i<pts.length;i++){const cx=(pts[i-1][0]+pts[i][0])/2;d+=` C${cx},${pts[i-1][1]} ${cx},${pts[i][1]} ${pts[i][0]},${pts[i][1]}`}svgPath=`<path d="${d}" fill="none" stroke="${theme.color}" stroke-width="2.5" stroke-linecap="round" class="grade-chart-line"/>`,svgArea=`<path d="${d} L${pts[pts.length-1][0]},80 L${pts[0][0]},80 Z" fill="url(#bG${uid})" class="grade-chart-area"/>`;const lastP=pts[pts.length-1];svgDots=`<circle cx="${lastP[0]}" cy="${lastP[1]}" r="4.5" fill="${theme.color}" stroke="#ffffff" stroke-width="2" class="grade-chart-dot"/>`,xLabels=subMonthList.map(m=>m.label)}const votiListHtml=votiData.map((v,i)=>{const isSuff=getNumericGradeValue(v)>=6,color=isSuff?"#30d158":"#ff453a",bgBadge=isSuff?"rgba(48,209,88,0.16)":"rgba(255,69,58,0.16)",borderBadge=isSuff?"rgba(48,209,88,0.35)":"rgba(255,69,58,0.35)",dateStr=(v.data||v.date||"").split("T")[0].split("-").reverse().join("/"),tipoStr=normalizeTipoVerifica(v.tipo,!1),descStr=v.descrizione||v.comment||"";return`
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.06);border-radius:16px;margin-bottom:8px;transition:all 0.2s ease;">
            <div style="min-width:0;flex:1;padding-right:12px;">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
                    <span style="font-size:13px;font-weight:700;color:#ffffff;">${escapeHtml(tipoStr)}</span>
                    <span style="font-size:10px;padding:2px 6px;border-radius:6px;background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.6);font-weight:600;">${dateStr}</span>
                </div>
                ${descStr?`<p style="font-size:11px;color:rgba(255,255,255,0.5);margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(descStr)}</p>`:""}
            </div>
            <span style="display:inline-flex;align-items:center;justify-content:center;min-width:40px;height:32px;padding:0 10px;border-radius:9999px;font-size:16px;font-weight:800;background:${bgBadge};border:1px solid ${borderBadge};color:${color};flex-shrink:0;box-shadow:0 2px 6px ${isSuff?"rgba(48,209,88,0.15)":"rgba(255,69,58,0.15)"};">${v.valore||v.value}</span>
        </div>`}).join(""),goalProgress=media>0?Math.min(100,Math.round(media/goal*100)):0;return`
    <div class="view-fullbleed min-h-screen subject-detail-container" style="padding:0 0 calc(140px + env(safe-area-inset-bottom, 24px)) 0;background:var(--bg-base, #0c1424);font-family:'Inter',sans-serif;">

        <!-- \u2550\u2550 STICKY FROSTED HEADER \u2550\u2550 -->
        <header style="display:flex;align-items:center;justify-content:space-between;padding:max(env(safe-area-inset-top,0px),24px) 20px 14px;background:rgba(12,20,36,0.88);backdrop-filter:blur(25px) saturate(180%);-webkit-backdrop-filter:blur(25px) saturate(180%);position:sticky;top:0;z-index:40;border-bottom:0.5px solid rgba(255,255,255,0.08);">
            <div style="display:flex;align-items:center;gap:12px;min-width:0;flex:1;">
                <button onclick="if(typeof window.triggerHaptic==='function')window.triggerHaptic('light');window.closeSubject()" style="width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,0.08);border:0.5px solid rgba(255,255,255,0.15);cursor:pointer;display:flex;align-items:center;justify-content:center;color:#ffffff;transition:transform 0.15s ease;flex-shrink:0;" ontouchstart="this.style.transform='scale(0.92)'" ontouchend="this.style.transform='scale(1)'">
                    <i class="ph ph-arrow-left text-[20px] text-[#2997ff]"></i>
                </button>
                <div style="min-width:0;flex:1;">
                    <h1 style="font-size:18px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;margin:0;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(formattedTitle)}</h1>
                    <span style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.5);">${n} valutazioni \xB7 A.S. ${escapeHtml(activeYearKey)}</span>
                </div>
            </div>
            <div style="width:38px;height:38px;border-radius:12px;background:${theme.iconBg};border:1px solid ${theme.border};display:flex;align-items:center;justify-content:center;color:${theme.color};flex-shrink:0;margin-left:12px;">
                <i class="ph-fill ${theme.icon}" style="font-size:20px;"></i>
            </div>
        </header>

        <!-- \u2550\u2550 CONTENT CONTAINER \u2550\u2550 -->
        <main style="padding:16px 20px 0;display:flex;flex-direction:column;gap:16px;">

            <!-- \u2500\u2500 CARD 1: HERO MEDIA & ANDAMENTO \u2500\u2500 -->
            <section style="position:relative;padding:20px;background:rgba(20,31,54,0.78);backdrop-filter:blur(25px) saturate(180%);-webkit-backdrop-filter:blur(25px) saturate(180%);border:0.5px solid rgba(255,255,255,0.12);border-top:1px solid rgba(255,255,255,0.22);border-radius:26px;box-shadow:0 16px 36px -10px rgba(0,0,0,0.5);overflow:hidden;">
                <!-- Sfumatura cromatica in angolo -->
                <div style="position:absolute;top:-28px;right:-28px;width:110px;height:110px;background:${theme.color};opacity:0.24;border-radius:50%;filter:blur(28px);pointer-events:none;"></div>

                <div style="display:flex;justify-content:space-between;align-items:flex-start;position:relative;z-index:1;">
                    <div>
                        <span style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${theme.color};display:flex;align-items:center;gap:5px;">
                            <span style="width:6px;height:6px;border-radius:50%;background:${theme.color};box-shadow:0 0 8px ${theme.color};"></span>
                            MEDIA MATERIA
                        </span>
                        <div style="display:flex;align-items:baseline;gap:10px;margin-top:4px;">
                            <span style="font-size:48px;font-weight:800;color:#ffffff;line-height:1;letter-spacing:-0.03em;font-variant-numeric:tabular-nums;">${hasSubjectMedia?media.toFixed(2):"\u2014"}</span>
                            ${diffStr?`
                            <div style="background:${isPosTrend?"rgba(48,209,88,0.18)":"rgba(255,69,58,0.18)"};padding:3px 9px;border-radius:9999px;display:inline-flex;align-items:center;gap:4px;border:1px solid ${isPosTrend?"rgba(48,209,88,0.4)":"rgba(255,69,58,0.4)"};">
                                <i class="ph-bold ${isPosTrend?"ph-trend-up":"ph-trend-down"}" style="font-size:12px;color:${isPosTrend?"#30d158":"#ff453a"};"></i>
                                <span style="font-size:11px;font-weight:700;color:${isPosTrend?"#30d158":"#ff453a"};">${diffStr}</span>
                            </div>`:""}
                        </div>

                    </div>
                    <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:9999px;background:${statusBadge.bg};border:1px solid ${statusBadge.border};font-size:11px;font-weight:700;color:${statusBadge.color};">
                        <i class="ph-fill ${statusBadge.icon}" style="font-size:13px;"></i> ${statusBadge.label}
                    </span>
                </div>

                ${subMonthList.length>=2?`
                <!-- Smooth Subject Sparkline SVG -->
                <div style="width:100%;height:78px;margin-top:14px;position:relative;z-index:1;">
                    <svg viewBox="0 0 320 80" style="width:100%;height:100%;overflow:visible;" preserveAspectRatio="none">
                        <defs>
                            <linearGradient id="bG${uid}" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stop-color="${theme.color}" stop-opacity="0.30"/>
                                <stop offset="100%" stop-color="${theme.color}" stop-opacity="0.0"/>
                            </linearGradient>
                        </defs>
                        ${svgArea}${svgPath}${svgDots}
                    </svg>
                </div>
                <div style="display:flex;justify-content:space-between;padding:0 2px;margin-top:6px;position:relative;z-index:1;">
                    ${xLabels.map((l,i)=>`<span style="font-size:10px;font-weight:700;color:${i===xLabels.length-1?theme.color:"rgba(255,255,255,0.45)"};text-transform:uppercase;letter-spacing:0.06em;">${l}</span>`).join("")}
                </div>`:`
                <div style="margin-top:14px;padding:8px 12px;background:rgba(255,255,255,0.03);border-radius:12px;font-size:11px;color:rgba(255,255,255,0.5);font-style:italic;">
                    Andamento temporale disponibile a partire da 2 mesi di valutazioni.
                </div>`}
            </section>



            <!-- \u2500\u2500 CARD 2: VOTI RICEVUTI \u2500\u2500 -->
            <section style="position:relative;padding:20px;background:rgba(20,31,54,0.78);backdrop-filter:blur(25px) saturate(180%);-webkit-backdrop-filter:blur(25px) saturate(180%);border:0.5px solid rgba(255,255,255,0.12);border-top:1px solid rgba(255,255,255,0.22);border-radius:26px;box-shadow:0 16px 36px -10px rgba(0,0,0,0.5);overflow:hidden;">
                <!-- Sfumatura cromatica in angolo -->
                <div style="position:absolute;top:-28px;right:-28px;width:90px;height:90px;background:${theme.color};opacity:0.18;border-radius:50%;filter:blur(24px);pointer-events:none;"></div>

                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;position:relative;z-index:1;">
                    <span style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:rgba(255,255,255,0.55);display:flex;align-items:center;gap:6px;">
                        <i class="ph-bold ph-list-numbers" style="font-size:13px;color:${theme.color};"></i>
                        VOTI RICEVUTI
                    </span>
                    <span style="font-size:11px;font-weight:700;color:${theme.color};background:${theme.iconBg};border:0.5px solid ${theme.border};padding:2px 8px;border-radius:999px;">
                        ${votiData.length} registrati
                    </span>
                </div>

                <div style="position:relative;z-index:1;">
                    ${votiListHtml||`
                    <div style="text-align:center;padding:24px 12px;color:rgba(255,255,255,0.45);">
                        <i class="ph ph-tray" style="font-size:28px;margin-bottom:6px;display:block;"></i>
                        <p style="font-size:12px;margin:0;font-style:italic;">Nessuna valutazione registrata per ${escapeHtml(formattedTitle)} nell'A.S. ${escapeHtml(activeYearKey)}.</p>
                    </div>`}
                </div>
            </section>

            <!-- \u2500\u2500 CARD 3: SIMULATORE & PREDICTIVE HUB \u2500\u2500 -->
            <section style="position:relative;padding:20px;background:rgba(20,31,54,0.78);backdrop-filter:blur(25px) saturate(180%);-webkit-backdrop-filter:blur(25px) saturate(180%);border:0.5px solid rgba(255,255,255,0.12);border-top:1px solid rgba(255,255,255,0.22);border-radius:26px;box-shadow:0 16px 36px -10px rgba(0,0,0,0.5);overflow:hidden;">
                <!-- Sfumatura cromatica in angolo -->
                <div style="position:absolute;top:-28px;right:-28px;width:90px;height:90px;background:${theme.color};opacity:0.20;border-radius:50%;filter:blur(24px);pointer-events:none;"></div>

                <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;position:relative;z-index:1;">
                    <div style="width:34px;height:34px;border-radius:10px;background:${theme.iconBg};border:1px solid ${theme.border};display:flex;align-items:center;justify-content:center;color:${theme.color};flex-shrink:0;">
                        <i class="ph-fill ph-lightning text-[18px]"></i>
                    </div>
                    <div>
                        <h2 style="font-size:15px;font-weight:700;color:#ffffff;margin:0;">Simulatore Prossimo Voto</h2>
                        <p style="font-size:11px;color:rgba(255,255,255,0.55);margin:0;">Calcola l'impatto istantaneo sulla media</p>
                    </div>
                </div>

                <div style="margin:14px 0 16px;position:relative;z-index:1;">
                    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:8px;">
                        <span style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.04em;">Voto ipotetico</span>
                        <span id="${simLblId}" style="font-size:22px;font-weight:800;color:${theme.color};line-height:1;font-variant-numeric:tabular-nums;">7.5</span>
                    </div>
                    <input id="${uid}-range" type="range" min="1" max="10" step="0.5" value="7.5"
                        style="width:100%;height:6px;border-radius:9999px;outline:none;cursor:pointer;-webkit-appearance:none;background:linear-gradient(to right, ${theme.color} 72.22%, rgba(255,255,255,0.1) 72.22%);"
                        oninput="(function(el){
                            var pct = (el.value - 1) / 9 * 100;
                            el.style.background = 'linear-gradient(to right, ${theme.color} ' + pct + '%, rgba(255,255,255,0.1) ' + pct + '%)';
                            document.getElementById('${simLblId}').textContent = parseFloat(el.value).toFixed(1);
                            var nm = ((${media} * ${n}) + parseFloat(el.value)) / (${n} + 1);
                            var diff = nm - ${media};
                            document.getElementById('${simResId}').textContent = nm.toFixed(2);
                            var diffEl = document.getElementById('${simDiffId}');
                            if(diffEl){
                                diffEl.textContent = (diff >= 0 ? '+' : '') + diff.toFixed(2);
                                diffEl.style.color = diff >= 0 ? '#30d158' : '#ff453a';
                            }
                        })(this)">
                </div>

                <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:18px;padding:12px 16px;position:relative;z-index:1;">
                    <div>
                        <p style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.55);text-transform:uppercase;letter-spacing:0.06em;margin:0 0 2px;">Nuova Media Prevista</p>
                        <div style="display:flex;align-items:baseline;gap:8px;">
                            <span id="${simResId}" style="font-size:24px;font-weight:800;color:#ffffff;line-height:1;font-variant-numeric:tabular-nums;">${simDefault}</span>
                            <span id="${simDiffId}" style="font-size:12px;font-weight:700;color:${parseFloat(simDeltaInit)>=0?"#30d158":"#ff453a"};">
                                ${parseFloat(simDeltaInit)>=0?"+":""}${simDeltaInit}
                            </span>
                        </div>
                    </div>
                    <div style="width:36px;height:36px;border-radius:10px;background:${theme.iconBg};border:1px solid ${theme.border};display:flex;align-items:center;justify-content:center;color:${theme.color};">
                        <i class="ph-fill ph-magic-wand text-[18px]"></i>
                    </div>
                </div>
            </section>

            <!-- \u2500\u2500 CARD 4: CONFRONTO SEMESTRI \u2500\u2500 -->
            ${hasSemesters?`
            <section style="position:relative;padding:20px;background:rgba(20,31,54,0.78);backdrop-filter:blur(25px) saturate(180%);-webkit-backdrop-filter:blur(25px) saturate(180%);border:0.5px solid rgba(255,255,255,0.12);border-top:1px solid rgba(255,255,255,0.22);border-radius:26px;box-shadow:0 16px 36px -10px rgba(0,0,0,0.5);overflow:hidden;">
                <!-- Sfumatura cromatica in angolo -->
                <div style="position:absolute;top:-28px;right:-28px;width:90px;height:90px;background:${theme.color};opacity:0.18;border-radius:50%;filter:blur(24px);pointer-events:none;"></div>

                <p style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.55);text-transform:uppercase;letter-spacing:0.06em;margin:0 0 14px;position:relative;z-index:1;">Confronto Quadrimestri</p>
                <div style="margin-bottom:14px;position:relative;z-index:1;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                        <span style="font-size:13px;font-weight:700;color:#ffffff;">1\xB0 Quadrimestre</span>
                        <span style="font-size:14px;font-weight:700;color:rgba(255,255,255,0.7);">${media1.toFixed(1)}</span>
                    </div>
                    <div style="width:100%;background:rgba(255,255,255,0.06);height:6px;border-radius:9999px;overflow:hidden;">
                        <div style="width:${(media1/10*100).toFixed(0)}%;height:100%;background:rgba(255,255,255,0.4);border-radius:9999px;"></div>
                    </div>
                </div>
                <div style="margin-bottom:14px;position:relative;z-index:1;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                        <span style="font-size:13px;font-weight:700;color:#ffffff;">2\xB0 Quadrimestre</span>
                        <span style="font-size:14px;font-weight:700;color:${theme.color};">${media2.toFixed(1)}</span>
                    </div>
                    <div style="width:100%;background:rgba(255,255,255,0.06);height:6px;border-radius:9999px;overflow:hidden;">
                        <div style="width:${(media2/10*100).toFixed(0)}%;height:100%;background:${theme.color};border-radius:9999px;"></div>
                    </div>
                </div>
                ${media2>=media1?`
                <div style="background:rgba(48,209,88,0.12);border:1px solid rgba(48,209,88,0.28);border-radius:14px;padding:10px 14px;display:flex;align-items:center;gap:10px;position:relative;z-index:1;">
                    <div style="width:30px;height:30px;border-radius:8px;background:rgba(48,209,88,0.2);display:flex;align-items:center;justify-content:center;color:#30d158;flex-shrink:0;">
                        <i class="ph-bold ph-caret-double-up text-[16px]"></i>
                    </div>
                    <p style="font-size:12px;color:rgba(255,255,255,0.9);line-height:1.35;margin:0;">Stai registrando un miglioramento del <strong style="color:#30d158;">+${((media2-media1)/media1*100).toFixed(0)}%</strong> rispetto al primo periodo.</p>
                </div>`:`
                <div style="background:rgba(255,159,10,0.12);border:1px solid rgba(255,159,10,0.28);border-radius:14px;padding:10px 14px;display:flex;align-items:center;gap:10px;position:relative;z-index:1;">
                    <div style="width:30px;height:30px;border-radius:8px;background:rgba(255,159,10,0.2);display:flex;align-items:center;justify-content:center;color:#ff9f0a;flex-shrink:0;">
                        <i class="ph-bold ph-caret-double-down text-[16px]"></i>
                    </div>
                    <p style="font-size:12px;color:rgba(255,255,255,0.9);line-height:1.35;margin:0;">La media del 2\xB0 periodo \xE8 inferiore al primo. Mantieni la concentrazione!</p>
                </div>`}
            </section>`:""}

            <!-- \u2500\u2500 CARD 5: OBIETTIVO ACCADEMICO \u2500\u2500 -->
            <section style="position:relative;padding:20px;background:rgba(20,31,54,0.78);backdrop-filter:blur(25px) saturate(180%);-webkit-backdrop-filter:blur(25px) saturate(180%);border:0.5px solid rgba(255,255,255,0.12);border-top:1px solid rgba(255,255,255,0.22);border-radius:26px;box-shadow:0 16px 36px -10px rgba(0,0,0,0.5);overflow:hidden;">
                <!-- Sfumatura cromatica in angolo -->
                <div style="position:absolute;top:-28px;right:-28px;width:90px;height:90px;background:#ff9f0a;opacity:0.20;border-radius:50%;filter:blur(24px);pointer-events:none;"></div>

                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;position:relative;z-index:1;">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <div style="width:34px;height:34px;border-radius:10px;background:rgba(255,159,10,0.15);border:1px solid rgba(255,159,10,0.3);display:flex;align-items:center;justify-content:center;color:#ff9f0a;flex-shrink:0;">
                            <i class="ph-fill ph-flag-banner text-[18px]"></i>
                        </div>
                        <div>
                            <h2 style="font-size:15px;font-weight:700;color:#ffffff;margin:0;">Obiettivo Accademico</h2>
                            <p style="font-size:11px;color:rgba(255,255,255,0.55);margin:0;">${goalProgress}% completato</p>
                        </div>
                    </div>
                    <div style="text-align:right;cursor:pointer;" onclick="promptSetGoal('${escapeJsSingleQuote(subjectName)}')">
                        <span style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.55);text-transform:uppercase;letter-spacing:0.04em;">Target</span>
                        <div style="display:flex;align-items:center;gap:4px;justify-content:flex-end;">
                            <span style="font-size:22px;font-weight:800;color:#ff9f0a;line-height:1;">${goal.toFixed(1)}</span>
                            <i class="ph ph-pencil-simple text-[14px] text-[rgba(255,255,255,0.6)]"></i>
                        </div>
                    </div>
                </div>

                <!-- Dual Gradient Target Progress Bar -->
                <div style="width:100%;background:rgba(255,255,255,0.08);height:6px;border-radius:9999px;overflow:hidden;position:relative;margin-bottom:12px;z-index:1;">
                    <div style="background:linear-gradient(90deg, ${theme.color} 0%, #30d158 100%);height:100%;border-radius:9999px;width:${goalProgress}%;transition:width 0.4s ease;box-shadow:0 0 8px ${theme.color};"></div>
                </div>

                <div style="padding:10px 14px;background:rgba(255,159,10,0.08);border:0.5px solid rgba(255,159,10,0.22);border-radius:14px;margin-bottom:10px;position:relative;z-index:1;">
                    <p style="font-size:12px;line-height:1.45;color:rgba(255,255,255,0.9);margin:0;">${goalText}</p>
                </div>

                <div style="display:flex;align-items:center;gap:6px;position:relative;z-index:1;">
                    <i class="ph ph-info text-[12px] text-[rgba(255,255,255,0.45)]"></i>
                    <span style="font-size:11px;color:rgba(255,255,255,0.45);font-weight:500;">Calcolato sulla media attuale di ${media.toFixed(1)}</span>
                </div>
            </section>

            <!-- Bottom Safe Area Spacer to guarantee content is never clipped by navbar -->
            <div style="height:120px;" aria-hidden="true"></div>

        </main>
    </div>`}function mostraAssenzeModal(){typeof window.triggerHaptic=="function"&&window.triggerHaptic("medium");const ad=state.assenzeData||{assenze:[],ritardi:[],uscite:[],note:[],totaleAssenze:0,totaleRitardi:0,totaleUscite:0,oreAssenzaTotali:0,daGiustificare:0},rawAssenze=(ad.assenze||[]).map(x=>({...x,tipo:"assenza",label:"Assenza Giornaliera",icon:"ph-calendar-x",iconColor:"#ff453a",iconBg:"rgba(255,69,58,0.16)",hoursStr:x.numOre?`${x.numOre} ore`:x.oraInizio?`${x.oraInizio}\xAA - ${x.oraFine||5}\xAA ora`:"Giornata intera"})),rawRitardi=(ad.ritardi||[]).map(x=>({...x,tipo:"ritardo",label:"Ingresso in Ritardo",icon:"ph-clock-countdown",iconColor:"#ff9f0a",iconBg:"rgba(255,159,10,0.16)",hoursStr:x.oraInizio?`Entrata ore ${x.oraInizio}`:x.numOre?`${x.numOre}\xAA ora`:"Ritardo breve"})),rawUscite=(ad.uscite||[]).map(x=>({...x,tipo:"uscita",label:"Uscita Anticipata",icon:"ph-sign-out",iconColor:"#2997ff",iconBg:"rgba(41,151,255,0.16)",hoursStr:x.oraFine||x.oraInizio?`Uscita ore ${x.oraFine||x.oraInizio}`:x.numOre?`${x.numOre}\xAA ora`:"Uscita anticipata"})),rawNote=(ad.note||[]).map(x=>({...x,tipo:"nota",label:"Nota Disciplinare",icon:"ph-warning",iconColor:"#bf5af2",iconBg:"rgba(191,90,242,0.16)",hoursStr:x.autore||"Docente",giustificata:!0})),all=[...rawAssenze,...rawRitardi,...rawUscite,...rawNote];all.sort((a,b)=>{const da=a.data?new Date(a.data):new Date(0);return(b.data?new Date(b.data):new Date(0))-da});const daGiustificareList=all.filter(a=>a.tipo!=="nota"&&(!a.giustificata||a.daGiustificare)),giustificateList=all.filter(a=>a.giustificata&&!a.daGiustificare),countDaGiustificare=daGiustificareList.length,countGiustificate=giustificateList.length,oreTotali=Number.isFinite(ad.oreAssenzaTotali)&&ad.oreAssenzaTotali>=0?ad.oreAssenzaTotali:"Non disponibili";state.assenzeFilter=state.assenzeFilter||"tutte";const existing=document.getElementById("assenze-modal-overlay");existing&&existing.remove();const overlay=document.createElement("div");overlay.id="assenze-modal-overlay",overlay.style.cssText="position:fixed;inset:0;z-index:99999;background:rgba(5,8,17,0.78);backdrop-filter:blur(30px) saturate(190%);-webkit-backdrop-filter:blur(30px) saturate(190%);display:flex;flex-direction:column;justify-content:flex-end;opacity:0;transition:opacity 0.25s ease;font-family:'Inter',sans-serif;";const sheet=document.createElement("div");sheet.id="assenze-modal-sheet",sheet.style.cssText="width:100%;max-width:640px;margin:0 auto;height:92vh;max-height:92vh;background:rgba(12,20,36,0.96);border:1px solid rgba(255,255,255,0.12);border-top:1px solid rgba(255,255,255,0.25);border-radius:32px 32px 0 0;display:flex;flex-direction:column;box-shadow:0 -12px 48px rgba(0,0,0,0.75);transform:translateY(100%);transition:transform 0.35s cubic-bezier(0.16,1,0.3,1);overflow:hidden;";const renderCardHtml=a=>{const isPending=a.tipo!=="nota"&&(!a.giustificata||a.daGiustificare),d=a.data?new Date(a.data):new Date,dateFormatted=isNaN(d.getTime())?a.data||"Data N/D":d.toLocaleDateString("it-IT",{weekday:"short",day:"numeric",month:"short"}),capitalizedDate=dateFormatted.charAt(0).toUpperCase()+dateFormatted.slice(1),statusBadge=a.tipo==="nota"?'<span style="background:rgba(191,90,242,0.16);border:1px solid rgba(191,90,242,0.4);color:#bf5af2;font-size:10px;font-weight:800;padding:3px 9px;border-radius:9999px;display:inline-flex;align-items:center;gap:4px;white-space:nowrap;flex-shrink:0;"><i class="ph-fill ph-chat-circle-dots"></i> NOTA</span>':isPending?'<span style="background:rgba(255,69,58,0.18);border:1px solid rgba(255,69,58,0.45);color:#ff453a;font-size:10px;font-weight:800;padding:3px 9px;border-radius:9999px;display:inline-flex;align-items:center;gap:4px;white-space:nowrap;flex-shrink:0;"><i class="ph-fill ph-warning-circle"></i> DA GIUSTIFICARE</span>':'<span style="background:rgba(48,209,88,0.15);border:1px solid rgba(48,209,88,0.4);color:#30d158;font-size:10px;font-weight:800;padding:3px 9px;border-radius:9999px;display:inline-flex;align-items:center;gap:4px;white-space:nowrap;flex-shrink:0;"><i class="ph-fill ph-check-circle"></i> GIUSTIFICATA</span>';return`
        <div class="assenze-card-item" data-pending="${isPending}" data-tipo="${a.tipo}" style="display:flex;flex-direction:column;gap:10px;padding:15px 16px;background:rgba(20,31,54,0.82);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid rgba(255,255,255,0.12);border-top:1px solid rgba(255,255,255,0.24);border-radius:20px;box-shadow:0 6px 20px rgba(0,0,0,0.25);transition:transform 0.15s ease;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
                <div style="display:flex;align-items:center;gap:12px;min-width:0;flex:1;">
                    <div style="width:40px;height:40px;border-radius:13px;background:${a.iconBg};border:1px solid ${a.iconColor}40;display:flex;align-items:center;justify-content:center;color:${a.iconColor};flex-shrink:0;box-shadow:0 0 12px ${a.iconColor}20;">
                        <i class="ph-bold ${a.icon}" style="font-size:20px;"></i>
                    </div>
                    <div style="min-width:0;flex:1;">
                        <h4 style="font-size:14.5px;font-weight:700;color:#ffffff;margin:0 0 3px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(a.label)}</h4>
                        <span style="font-size:12px;color:rgba(255,255,255,0.65);font-weight:600;">${capitalizedDate} \xB7 ${escapeHtml(a.hoursStr)}</span>
                    </div>
                </div>
                <div>
                    ${statusBadge}
                </div>
            </div>
            ${a.nota||a.testo||a.motivo?`
            <div style="padding:9px 13px;background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.09);border-radius:12px;font-size:12.5px;color:rgba(255,255,255,0.88);line-height:1.45;">
                "${escapeHtml(a.nota||a.testo||a.motivo)}"
            </div>`:""}
        </div>`};sheet.innerHTML=`
        <!-- Drag Handle Bar -->
        <div id="assenze-modal-drag-handle" style="display:flex;justify-content:center;padding:12px 0 6px;flex-shrink:0;cursor:grab;touch-action:none;">
            <div style="width:40px;height:5px;border-radius:999px;background:rgba(255,255,255,0.25);"></div>
        </div>

        <!-- Header Bar -->
        <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 20px 14px;flex-shrink:0;">
            <div>
                <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#ff453a;display:flex;align-items:center;gap:6px;">
                    <i class="ph-fill ph-calendar-blank"></i> REGISTRO DIDATTICO \xB7 ARGO
                </div>
                <h2 style="font-size:22px;font-weight:800;color:#ffffff;margin:2px 0 0;letter-spacing:-0.02em;">Registro Assenze</h2>
            </div>
            <button onclick="window.closeAssenzeModal()" class="liquid-glass-v8 rim-light squircle-full" style="display:flex;align-items:center;gap:6px;padding:7px 14px;border:none;cursor:pointer;background:rgba(255,255,255,0.08);color:#ffffff;font-size:12px;font-weight:700;font-family:'Inter',sans-serif;transition:transform 0.15s ease;" ontouchstart="this.style.transform='scale(0.92)'" ontouchend="this.style.transform='scale(1)'">
                <i class="ph ph-x" style="font-size:14px;"></i>
                <span>Chiudi</span>
            </button>
        </div>

        <!-- Summary Metrics Cards (3 Colonne) -->
        <div style="padding:0 20px 12px;flex-shrink:0;">
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
                <!-- Da Giustificare -->
                <div style="padding:11px 10px;background:${countDaGiustificare>0?"rgba(255,69,58,0.16)":"rgba(255,255,255,0.04)"};border:1px solid ${countDaGiustificare>0?"rgba(255,69,58,0.4)":"rgba(255,255,255,0.1)"};border-radius:18px;text-align:center;box-shadow:${countDaGiustificare>0?"0 0 16px rgba(255,69,58,0.2)":"none"};">
                    <span style="font-size:10px;font-weight:800;text-transform:uppercase;color:${countDaGiustificare>0?"#ff453a":"rgba(255,255,255,0.5)"};display:block;margin-bottom:3px;letter-spacing:0.04em;">Da Giustif.</span>
                    <span style="font-size:22px;font-weight:900;color:${countDaGiustificare>0?"#ff453a":"#ffffff"};line-height:1;font-variant-numeric:tabular-nums;">${countDaGiustificare}</span>
                </div>
                <!-- Giustificate -->
                <div style="padding:11px 10px;background:rgba(48,209,88,0.12);border:1px solid rgba(48,209,88,0.32);border-radius:18px;text-align:center;">
                    <span style="font-size:10px;font-weight:800;text-transform:uppercase;color:#30d158;display:block;margin-bottom:3px;letter-spacing:0.04em;">Giustificate</span>
                    <span style="font-size:22px;font-weight:900;color:#30d158;line-height:1;font-variant-numeric:tabular-nums;">${countGiustificate}</span>
                </div>
                <!-- Ore Assenza Totali -->
                <div style="padding:11px 10px;background:rgba(41,151,255,0.12);border:1px solid rgba(41,151,255,0.32);border-radius:18px;text-align:center;">
                    <span style="font-size:10px;font-weight:800;text-transform:uppercase;color:#2997ff;display:block;margin-bottom:3px;letter-spacing:0.04em;">Ore Totali</span>
                    <span style="font-size:22px;font-weight:900;color:#2997ff;line-height:1;font-variant-numeric:tabular-nums;">${typeof oreTotali=="number"?oreTotali.toFixed(0)+"h":oreTotali}</span>
                </div>
            </div>
        </div>

        <!-- Segmented Filter Control -->
        <div style="padding:0 20px 12px;flex-shrink:0;">
            <div id="assenze-filter-bar" style="display:flex;background:rgba(10,16,28,0.75);padding:4px;border-radius:16px;border:1px solid rgba(255,255,255,0.1);gap:4px;">
                ${[{id:"tutte",label:"Tutte",count:all.length},{id:"pending",label:"Da Giustif.",count:countDaGiustificare},{id:"justified",label:"Giustificate",count:countGiustificate},{id:"note",label:"Note",count:rawNote.length}].map(tab=>{const active=(state.assenzeFilter||"tutte")===tab.id;return`
                    <button class="assenze-tab-btn" data-filter="${tab.id}" onclick="window.filterAssenzeView('${tab.id}')" style="flex:1;padding:8px 4px;border-radius:12px;font-size:11.5px;font-weight:${active?"700":"600"};border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;font-family:'Inter',sans-serif;transition:all 0.2s ease;background:${active?"#2997ff":"transparent"};color:${active?"#ffffff":"rgba(255,255,255,0.6)"};box-shadow:${active?"0 2px 8px rgba(41,151,255,0.35)":"none"};">
                        <span>${tab.label}</span>
                        <span style="font-size:9.5px;opacity:0.85;padding:1px 5px;border-radius:999px;background:${active?"rgba(255,255,255,0.25)":"rgba(255,255,255,0.08)"};">${tab.count}</span>
                    </button>`}).join("")}
            </div>
        </div>

        <!-- Scrollable List Container (Flush to bottom edge of screen, NO mask-image, NO blur cutoffs) -->
        <div id="assenze-items-list" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:0 20px 80px 20px;display:flex;flex-direction:column;gap:10px;">
            ${all.length>0?all.map(renderCardHtml).join(""):""}
            <!-- Empty State -->
            <div id="assenze-empty-msg" style="display:${all.length===0?"flex":"none"};flex-direction:column;align-items:center;justify-content:center;padding:48px 20px;text-align:center;gap:8px;">
                <div style="width:48px;height:48px;border-radius:50%;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.4);">
                    <i class="ph ph-check" style="font-size:24px;"></i>
                </div>
                <span style="font-size:14px;color:rgba(255,255,255,0.5);font-weight:500;">Nessun evento o assenza da visualizzare in questa categoria.</span>
            </div>
        </div>
    `,overlay.appendChild(sheet),document.body.appendChild(overlay),requestAnimationFrame(()=>{overlay.style.opacity="1",sheet.style.transform="translateY(0)"}),overlay.addEventListener("click",e=>{e.target===overlay&&window.closeAssenzeModal()});const handle=document.getElementById("assenze-modal-drag-handle");if(handle){let startY=0,currentY=0,isDragging=!1;handle.addEventListener("touchstart",e=>{e.touches&&e.touches.length===1&&(startY=e.touches[0].clientY,isDragging=!0)},{passive:!0}),handle.addEventListener("touchmove",e=>{!isDragging||!e.touches||(currentY=Math.max(0,e.touches[0].clientY-startY),sheet.style.transform=`translateY(${currentY}px)`)},{passive:!0}),handle.addEventListener("touchend",()=>{isDragging&&(isDragging=!1,currentY>110?window.closeAssenzeModal():(sheet.style.transform="translateY(0)",sheet.style.transition="transform 0.3s cubic-bezier(0.16,1,0.3,1)"))},{passive:!0})}window.filterAssenzeView=function(filterType){typeof window.triggerHaptic=="function"&&window.triggerHaptic("selection"),state.assenzeFilter=filterType,document.querySelectorAll("#assenze-filter-bar .assenze-tab-btn").forEach(btn=>{const isSelected=btn.getAttribute("data-filter")===filterType;btn.style.background=isSelected?"#2997ff":"transparent",btn.style.color=isSelected?"#ffffff":"rgba(255,255,255,0.6)",btn.style.fontWeight=isSelected?"700":"600",btn.style.boxShadow=isSelected?"0 2px 8px rgba(41,151,255,0.35)":"none";const badge=btn.querySelector("span:nth-child(2)");badge&&(badge.style.background=isSelected?"rgba(255,255,255,0.25)":"rgba(255,255,255,0.08)")}),document.querySelectorAll("#assenze-items-list .assenze-card-item").forEach(card=>{const isPending=card.getAttribute("data-pending")==="true",tipo=card.getAttribute("data-tipo");filterType==="tutte"?card.style.display="flex":filterType==="pending"?card.style.display=isPending?"flex":"none":filterType==="justified"?card.style.display=!isPending&&tipo!=="nota"?"flex":"none":filterType==="note"&&(card.style.display=tipo==="nota"?"flex":"none")});const listEl=document.getElementById("assenze-items-list"),emptyEl=document.getElementById("assenze-empty-msg");if(listEl&&emptyEl){const visibleCards=Array.from(listEl.querySelectorAll(".assenze-card-item")).filter(c=>c.style.display!=="none");emptyEl.style.display=visibleCards.length===0?"flex":"none"}},window.closeAssenzeModal=function(){typeof window.triggerHaptic=="function"&&window.triggerHaptic("light");const ov=document.getElementById("assenze-modal-overlay"),sh=document.getElementById("assenze-modal-sheet");ov&&(sh&&(sh.style.transform="translateY(100%)"),ov.style.opacity="0",setTimeout(()=>{ov&&ov.parentNode&&ov.remove()},320))},state.assenzeFilter&&state.assenzeFilter!=="tutte"&&window.filterAssenzeView(state.assenzeFilter)}window.mostraAssenzeModal=mostraAssenzeModal;function mostraVerificheModal(){const today=new Date;today.setHours(0,0,0,0);const todayISO=getLocalDateString(today),allVerifiche=(state.verifiche||[]).filter(v=>v.data&&v.data>=todayISO).sort((a,b)=>a.data.localeCompare(b.data)),manualExams=(state.manualVerifiche||[]).filter(v=>!v.done&&v.date&&v.date>=todayISO).map(v=>({materia:v.subject,data:v.date,text:v.args,tipo:v.type,source:"manual",id:v.id})),combined=[...allVerifiche,...manualExams],seen=new Set,all=combined.filter(v=>{const key=`${v.data}||${(v.materia||"").toLowerCase()||""}`;return seen.has(key)?!1:(seen.add(key),!0)}).sort((a,b)=>(a.data||"").localeCompare(b.data||""));showModal(`
        <div class="flex flex-col gap-6">
            <header>
                <h2 class="title-md text-primary mb-1">Prossime Verifiche</h2>
                <p class="body-md text-on-surface-variant/60">Calendario prove ed esami</p>
            </header>

            <div class="flex flex-col gap-4 max-h-[400px] overflow-y-auto no-scrollbar">
                ${all.length===0?`
                    <div class="p-12 text-center text-on-surface-variant/40">
                        <span class="material-symbols-outlined text-4xl mb-2">event_available</span>
                        <p class="font-medium">Nessuna verifica in programma</p>
                    </div>
                `:all.map(v=>`
                    <div class="p-5 rounded-[28px] bg-surface-container-low border border-white/40 flex items-center gap-4">
                        <div class="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-bold">
                            ${getSubjectAbbrev(v.materia)}
                        </div>
                        <div class="flex-1 min-width-0">
                            <h3 class="font-bold text-[15px] truncate">${escapeHtml(v.text||v.materia)}</h3>
                            <p class="text-[12px] text-on-surface-variant/60 uppercase font-bold tracking-wider">${v.data}</p>
                        </div>
                        ${v.source==="manual"?`
                            <button onclick="deleteManualVerifica('${v.id}')" class="w-8 h-8 rounded-full bg-error/10 text-error flex items-center justify-center">
                                <span class="material-symbols-outlined text-[18px]">delete</span>
                            </button>
                        `:""}
                    </div>
                `).join("")}
            </div>

            <button class="btn btn-primary w-full" onclick="closeModal()">Chiudi</button>
        </div>
    `)}window.mostraVerificheModal=mostraVerificheModal,window._navVerifica=function(dir){const today=new Date;today.setHours(0,0,0,0);const todayISO=getLocalDateString(today),argoV=(state.verifiche||[]).filter(v2=>v2.data&&v2.data>=todayISO).sort((a,b)=>a.data.localeCompare(b.data)),manualV=(state.manualVerifiche||[]).filter(v2=>!v2.done&&v2.date&&v2.date>=todayISO).map(v2=>({materia:v2.subject,data:v2.date,text:v2.args,tipo:v2.type})),seen=new Set,all=[...argoV,...manualV].filter(v2=>{const k=`${v2.data}||${(v2.materia||"").toLowerCase()}`;return seen.has(k)?!1:(seen.add(k),!0)}).sort((a,b)=>a.data.localeCompare(b.data));if(all.length<=1)return;window._verificheIdx=Math.max(0,Math.min(all.length-1,(window._verificheIdx||0)+dir));const v=all[window._verificheIdx];if(!v)return;const abbr=typeof getSubjectAbbrev=="function"?getSubjectAbbrev(v.materia):(v.materia||"").substring(0,3).toUpperCase(),key=abbr.toLowerCase(),normalizedTipo=(v.tipo||"").toString().trim().toLowerCase(),tipoLabel=normalizedTipo==="scritta"?"SCRITTA":normalizedTipo==="orale"?"ORALE":"",examDate=parseLocalDate(v.data),daysLeft=Math.ceil((examDate-today)/864e5),desc=(v.text||v.materia||"").substring(0,45),el=id=>document.getElementById(id),abbrEl=el("vw-abbr");abbrEl&&(abbrEl.textContent=abbr,abbrEl.style.background=`var(--${key},var(--mat))`,abbrEl.style.color=`var(--${key}-t,var(--mat-t))`);const tipoEl=el("vw-tipo");tipoEl&&(tipoEl.textContent=tipoLabel);const counterEl=el("vw-counter");counterEl&&(counterEl.textContent=`${window._verificheIdx+1}/${all.length}`);const descEl=el("vw-desc");descEl&&(descEl.textContent=desc);const daysEl=el("vw-days");daysEl&&(daysEl.textContent=daysLeft);const barFill=el("vw-bar-fill");barFill&&(barFill.style.width=Math.max(5,100-daysLeft*8)+"%",barFill.style.background=`var(--${key}-dot,var(--mat-dot))`)};async function mostraCircolare(id){const c=state.circolari.find(x=>x.id===id);if(!c)return;c.sintesi&&typeof marked>"u"&&typeof window.ensureMarked=="function"&&await window.ensureMarked();const overlay=document.createElement("div");overlay.id="circ-overlay-"+id,overlay.style.cssText="position:fixed;inset:0;z-index:99999;background:rgba(6,14,32,0.65);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);display:flex;align-items:flex-end;justify-content:center;";const sheet=document.createElement("div");sheet.style.cssText="width:100%;max-width:540px;background:rgba(18,29,50,0.96);backdrop-filter:blur(40px) saturate(200%);-webkit-backdrop-filter:blur(40px) saturate(200%);border:1px solid rgba(182,196,255,0.18);border-top:1px solid rgba(255,255,255,0.35);border-radius:32px 32px 0 0;display:flex;flex-direction:column;max-height:92vh;box-shadow:0 -12px 48px rgba(6,14,32,0.85);transform:translateY(100%);transition:transform 0.35s cubic-bezier(0.16,1,0.3,1);font-family:'Inter',sans-serif;color:#dae2fd;";const sintesiContent=c.sintesi?`<div style="font-size:14px;line-height:1.75;color:#dae2fd;">${typeof window.renderSafeMarkdown=="function"?window.renderSafeMarkdown(c.sintesi):escapeHtml(c.sintesi)}</div>`:`<div id="sintesi-placeholder-${c.id}" style="display:flex;flex-direction:column;align-items:center;text-align:center;padding:24px 16px;gap:12px;background:rgba(23,31,51,0.8);border:1px solid rgba(182,196,255,0.14);border-radius:22px;">
               <div style="width:52px;height:52px;border-radius:18px;background:rgba(47,88,205,0.25);border:1px solid rgba(182,196,255,0.3);display:flex;align-items:center;justify-content:center;color:#b6c4ff;">
                   <i class="ph-fill ph-sparkle" style="font-size:26px;"></i>
               </div>
               <p style="font-size:16px;font-weight:800;color:#dae2fd;margin:0;">Analisi & Sintesi AI</p>
               <p style="font-size:13px;color:#c4c5d6;font-weight:500;margin:0;max-width:280px;line-height:1.5;">Ottieni una sintesi intelligente con estrazione automatica dei punti chiave e delle date importanti.</p>
               <button id="btn-sintesi-${c.id}" onclick="window._circ_startSintesi('${escapeJsSingleQuote(c.id)}','${escapeJsSingleQuote(c.link||"")}')" style="width:100%;height:48px;border-radius:14px;background:linear-gradient(135deg,#2f58cd 0%,#3b82f6 100%);color:#ffffff;border:none;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-family:'Inter',sans-serif;margin-top:6px;box-shadow:0 4px 16px rgba(47,88,205,0.4);">
                   <i class="ph-bold ph-lightning" style="font-size:17px;"></i>
                   Elabora Sintesi con AI
               </button>
           </div>`;sheet.innerHTML=`
        <!-- Drag handle -->
        <div style="display:flex;justify-content:center;padding:14px 0 8px;flex-shrink:0;">
            <div style="width:44px;height:5px;border-radius:999px;background:rgba(182,196,255,0.3);"></div>
        </div>

        <!-- Header -->
        <div style="padding:6px 22px 16px;flex-shrink:0;border-bottom:1px solid rgba(182,196,255,0.12);">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                <span style="font-size:11px;font-weight:800;color:#b6c4ff;text-transform:uppercase;letter-spacing:0.08em;background:rgba(47,88,205,0.22);border:1px solid rgba(182,196,255,0.25);padding:3px 10px;border-radius:999px;">Circolare N. ${escapeHtml(String(c.numero||"\u2014"))}</span>
                <span style="font-size:12px;font-weight:600;color:#8e909f;display:flex;align-items:center;gap:4px;"><i class="ph-bold ph-calendar" style="color:#b6c4ff;"></i> ${escapeHtml(c.data||"")}</span>
            </div>
            <h2 style="font-size:19px;font-weight:800;color:#dae2fd;line-height:1.3;margin:0;letter-spacing:-0.02em;">${escapeHtml(c.titolo)}</h2>
        </div>

        <!-- Scrollable body -->
        <div id="sintesi-box-${c.id}" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:20px 22px;">
            ${sintesiContent}
        </div>

        <!-- Actions -->
        <div style="padding:14px 22px calc(24px + env(safe-area-inset-bottom,0px));flex-shrink:0;display:flex;flex-direction:column;gap:8px;border-top:1px solid rgba(182,196,255,0.12);">
            ${c.link?`<button onclick="openExternalLink('${escapeJsSingleQuote(c.link)}')" style="width:100%;height:50px;border-radius:15px;background:linear-gradient(135deg,#2f58cd 0%,#3b82f6 100%);color:#ffffff;border:none;font-size:15px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-family:'Inter',sans-serif;box-shadow:0 6px 20px -4px rgba(47,88,205,0.5);">
                <i class="ph-bold ph-file-arrow-up" style="font-size:18px;"></i> Apri Documento PDF Ufficiale
            </button>`:""}
            <button id="circ-close-btn-${id}" style="width:100%;height:42px;background:none;border:none;color:#b6c4ff;font-size:14px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;">Chiudi</button>
        </div>
    `,overlay.appendChild(sheet),document.body.appendChild(overlay),requestAnimationFrame(()=>{sheet.style.transform="translateY(0)"});function closeCirc(){sheet.style.transform="translateY(100%)",setTimeout(()=>{overlay.parentNode&&overlay.remove()},320)}overlay.addEventListener("click",e=>{e.target===overlay&&closeCirc()}),document.getElementById("circ-close-btn-"+id).addEventListener("click",closeCirc),window._circ_startSintesi=async function(cid,link){if(window.navigator?.vibrate)try{window.navigator.vibrate(15)}catch{}const placeholder=document.getElementById("sintesi-placeholder-"+cid);if(!placeholder)return;placeholder.innerHTML=`
            <div id="sintesi-card-${cid}" style="width:100%;background:rgba(23,31,51,0.88);backdrop-filter:blur(24px) saturate(190%);-webkit-backdrop-filter:blur(24px) saturate(190%);border:1px solid rgba(182,196,255,0.22);border-top:1px solid rgba(255,255,255,0.28);border-radius:24px;padding:22px 20px;box-shadow:0 12px 36px rgba(6,14,32,0.65), inset 0 1px 0 rgba(255,255,255,0.15);display:flex;flex-direction:column;gap:14px;box-sizing:border-box;text-align:left;animation:fadeIn 0.35s ease-out;">
                <!-- Header row with pulsing icon, badge and percentage -->
                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
                    <div style="display:flex;align-items:center;gap:12px;">
                        <div id="sintesi-icon-${cid}" style="width:42px;height:42px;border-radius:15px;background:rgba(47,88,205,0.25);border:1px solid rgba(182,196,255,0.35);display:flex;align-items:center;justify-content:center;color:#b6c4ff;box-shadow:0 0 18px rgba(47,88,205,0.45);flex-shrink:0;animation:liquidGlowPulse 2.4s infinite ease-in-out;">
                            <i class="ph-fill ph-sparkle" style="font-size:22px;"></i>
                        </div>
                        <div>
                            <span id="sintesi-badge-${cid}" style="font-size:10.5px;font-weight:800;color:#b6c4ff;text-transform:uppercase;letter-spacing:0.08em;background:rgba(47,88,205,0.22);border:1px solid rgba(182,196,255,0.28);padding:3px 9px;border-radius:999px;display:inline-block;">Sintesi AI</span>
                            <p id="sintesi-title-${cid}" style="font-size:14px;color:#dae2fd;font-weight:700;margin:4px 0 0;line-height:1.3;">Avvio elaborazione\u2026</p>
                        </div>
                    </div>
                    <span id="sintesi-pct-${cid}" style="font-size:13px;font-weight:800;color:#b6c4ff;font-variant-numeric:tabular-nums;background:rgba(6,14,32,0.6);padding:4px 9px;border-radius:10px;border:1px solid rgba(182,196,255,0.18);flex-shrink:0;">0%</span>
                </div>

                <!-- Liquid Progress Bar -->
                <div style="width:100%;height:8px;background:rgba(6,14,32,0.75);border:0.5px solid rgba(182,196,255,0.18);border-radius:999px;overflow:hidden;position:relative;box-shadow:inset 0 1px 3px rgba(0,0,0,0.6);">
                    <div id="sintesi-bar-${cid}" style="height:100%;width:0%;background:linear-gradient(90deg,#2f58cd 0%,#3b82f6 50%,#b6c4ff 100%);border-radius:999px;transition:width 0.35s cubic-bezier(0.16,1,0.3,1);box-shadow:0 0 14px rgba(79,120,255,0.7);"></div>
                </div>

                <!-- Subtitle / status details -->
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                    <p id="sintesi-desc-${cid}" style="font-size:12px;color:#c4c5d6;font-weight:500;margin:0;line-height:1.4;">Scansione del documento in corso\u2026</p>
                    <div style="display:flex;align-items:center;gap:4px;color:#8e909f;font-size:11px;font-weight:600;flex-shrink:0;">
                        <i class="ph-bold ph-lightning" style="color:#b6c4ff;"></i> AI Assistant
                    </div>
                </div>
            </div>`;const stages=[{pct:22,title:"Identificazione circolare\u2026",desc:"Scansione metadati e ricerca allegati"},{pct:48,title:"Recupero documento\u2026",desc:"Download ed estrazione del testo"},{pct:74,title:"Analisi neurale AI\u2026",desc:"Estrazione punti chiave, date e scadenze"},{pct:92,title:"Finalizzazione sintesi\u2026",desc:"Formattazione del riassunto per la lettura"}];let currentStageIdx=0,progress=6;const bar=document.getElementById("sintesi-bar-"+cid),titleEl=document.getElementById("sintesi-title-"+cid),descEl=document.getElementById("sintesi-desc-"+cid),pctEl=document.getElementById("sintesi-pct-"+cid),iv=setInterval(()=>{if(progress>=92)return;progress+=(92-progress)*.12+.6,progress>92&&(progress=92);const rounded=Math.round(progress);if(bar&&(bar.style.width=rounded+"%"),pctEl&&(pctEl.textContent=rounded+"%"),currentStageIdx<stages.length&&progress>=stages[currentStageIdx].pct){const s=stages[currentStageIdx++];titleEl&&(titleEl.textContent=s.title),descEl&&(descEl.textContent=s.desc)}},320);try{const result=await window.loadCircolareSintesi(cid,link);if(clearInterval(iv),result&&result.success&&result.sintesi){bar&&(bar.style.width="100%"),pctEl&&(pctEl.textContent="100%");const badge=document.getElementById("sintesi-badge-"+cid);if(badge&&(badge.textContent="Completato",badge.style.background="rgba(74, 222, 128, 0.2)",badge.style.color="#4ade80",badge.style.borderColor="rgba(74, 222, 128, 0.35)"),titleEl&&(titleEl.textContent="Sintesi completata!"),descEl&&(descEl.textContent="Riassunto pronto per la consultazione."),window.navigator?.vibrate)try{window.navigator.vibrate(25)}catch{}setTimeout(async()=>{await window.ensureMarked();const box=document.getElementById(`sintesi-box-${cid}`);box&&(box.innerHTML=`
                            <div class="ai-prose" style="animation: fadeIn 0.4s ease-out; font-size:14px; line-height:1.75; color:#dae2fd;">
                                ${window.renderSafeMarkdown(result.sintesi)}
                            </div>`)},380)}else{const errMsg=result&&result.error||"Impossibile completare la sintesi.";_renderSintesiError(cid,link,errMsg)}}catch(err){clearInterval(iv),_renderSintesiError(cid,link,err?.message||"Errore di connessione durante la sintesi.")}};function _renderSintesiError(cid,link,errMsg){const card=document.getElementById("sintesi-card-"+cid);card&&(card.style.borderColor="rgba(255, 120, 120, 0.35)",card.style.background="rgba(38, 20, 30, 0.88)",card.innerHTML=`
            <div style="display:flex;align-items:center;gap:12px;">
                <div style="width:42px;height:42px;border-radius:15px;background:rgba(255,80,80,0.2);border:1px solid rgba(255,120,120,0.35);display:flex;align-items:center;justify-content:center;color:#ff9e9e;flex-shrink:0;">
                    <i class="ph-bold ph-warning-circle" style="font-size:22px;"></i>
                </div>
                <div>
                    <span style="font-size:10.5px;font-weight:800;color:#ff9e9e;text-transform:uppercase;letter-spacing:0.08em;background:rgba(255,80,80,0.2);border:1px solid rgba(255,120,120,0.3);padding:3px 9px;border-radius:999px;display:inline-block;">Errore Sintesi</span>
                    <p style="font-size:14px;color:#dae2fd;font-weight:700;margin:4px 0 0;line-height:1.3;">Elaborazione non riuscita</p>
                </div>
            </div>
            <p style="font-size:12.5px;color:#ffc4c4;margin:0;line-height:1.45;">${escapeHtml(errMsg)}</p>
            <button onclick="window._circ_startSintesi('${escapeJsSingleQuote(cid)}', '${escapeJsSingleQuote(link||"")}')" style="width:100%;height:44px;border-radius:14px;background:linear-gradient(135deg,#2f58cd 0%,#3b82f6 100%);color:#ffffff;border:none;font-size:13.5px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-family:'Inter',sans-serif;margin-top:4px;box-shadow:0 4px 16px rgba(47,88,205,0.4);">
                <i class="ph-bold ph-arrows-clockwise" style="font-size:16px;"></i>
                Riprova Elaborazione
            </button>
        `)}}function renderDayDetailModal(dateStr){if(!getModalContainer())return;const formattedDate=parseArgoDate(dateStr).toLocaleDateString("it-IT",{weekday:"long",day:"numeric",month:"long"}),tasksForDay=getCalendarTasksForDate(dateStr),verificheForDay=[];(state.verifiche||[]).filter(v=>v.data===dateStr).forEach(v=>{verificheForDay.push({subject:v.materia||v.subject||"",text:v.text||v.descrizione||"",tipo:v.tipo||""})}),(state.manualVerifiche||[]).filter(v=>v.date===dateStr).forEach(v=>{verificheForDay.push({subject:v.subject||"",text:v.args||"",tipo:v.type||"",id:v.id})});const hasContent=tasksForDay.length>0||verificheForDay.length>0;showModal(`
        <div class="flex flex-col gap-6">
            <header>
                <div class="label-sm text-primary mb-1">Agenda Giornaliera</div>
                <h2 class="title-md text-on-surface capitalize">${formattedDate}</h2>
            </header>

            <div id="modal-task-list" class="flex flex-col gap-4 max-h-[400px] overflow-y-auto no-scrollbar">
                ${hasContent?"":`
                    <div class="p-12 text-center text-on-surface-variant/40">
                        <span class="material-symbols-outlined text-4xl mb-2">event_note</span>
                        <p class="font-medium">Nessun impegno pianificato</p>
                    </div>
                `}

                ${verificheForDay.map(v=>`
                    <div class="p-5 rounded-[28px] bg-error/5 border border-error/20 flex items-center gap-4">
                        <div class="w-10 h-10 rounded-xl bg-error/10 flex items-center justify-center text-error">
                            <span class="material-symbols-outlined text-[20px]">warning</span>
                        </div>
                        <div class="flex-1">
                            <div class="label-sm text-error mb-1">${escapeHtml(normalizeTipoVerifica(v.tipo))}</div>
                            <h3 class="font-bold text-[15px]">${escapeHtml(v.text||v.subject)}</h3>
                        </div>
                    </div>
                `).join("")}

                ${tasksForDay.map(t=>`
                    <div class="p-5 rounded-[28px] bg-surface-container-low border border-white/40 flex items-center gap-4 ${t.done?"opacity-50":""}">
                        <button onclick="toggleTask('${escapeJsSingleQuote(t.id)}',event); renderDayDetailModal('${escapeJsSingleQuote(dateStr)}');" class="w-10 h-10 rounded-xl ${t.done?"bg-green/10 text-green":"bg-primary/10 text-primary"} flex items-center justify-center border border-white/60">
                            <span class="material-symbols-outlined text-[20px]">${t.done?"task_alt":"circle"}</span>
                        </button>
                        <div class="flex-1 min-width-0">
                            <div class="label-sm text-on-surface-variant/40 mb-1">${escapeHtml(t.subject)}</div>
                            <h3 class="font-bold text-[15px] truncate ${t.done?"line-through":""}">${escapeHtml(t.text)}</h3>
                        </div>
                        ${isUserGeneratedTaskId(t.id)?`
                            <button onclick="deleteCalendarTask('${escapeJsSingleQuote(t.id)}', '${escapeJsSingleQuote(dateStr)}')" class="w-8 h-8 rounded-full bg-error/10 text-error flex items-center justify-center">
                                <span class="material-symbols-outlined text-[18px]">delete</span>
                            </button>
                        `:""}
                    </div>
                `).join("")}
            </div>

            <button class="btn btn-primary w-full h-14" onclick="closeModal()">Chiudi</button>
        </div>
    `)}function togglePlanInModal(dateStr,taskId){state.plannedTasks[dateStr]||(state.plannedTasks[dateStr]=[]);const index=state.plannedTasks[dateStr].indexOf(taskId);index>-1?state.plannedTasks[dateStr].splice(index,1):state.plannedTasks[dateStr].push(taskId),saveTasks(),typeof debouncedSavePlannerRemote=="function"&&debouncedSavePlannerRemote(500);const calendarEl=document.getElementById("calendar");calendarEl&&calendarEl._fullCalendar&&syncCalendarEvents(calendarEl._fullCalendar),renderDayDetailModal(dateStr),notifyPlannerChanged()}function deleteCalendarTask(taskId,dateStr=""){if(!taskId||!isUserGeneratedTaskId(taskId))return;const shouldRefreshDayModal=!!(dateStr&&document.getElementById("modal-task-list"));state.tasks=state.tasks.filter(t=>t.id!==taskId),Object.keys(state.plannedTasks||{}).forEach(d=>{Array.isArray(state.plannedTasks[d])&&(state.plannedTasks[d]=state.plannedTasks[d].filter(id=>id!==taskId))}),saveTasks(),typeof debouncedSavePlannerRemote=="function"&&debouncedSavePlannerRemote(500),typeof showToast=="function"&&showToast("Attivit\xE0 eliminata"),shouldRefreshDayModal&&renderDayDetailModal(dateStr),notifyPlannerChanged(),typeof updateHomeTaskFocusWidget=="function"&&updateHomeTaskFocusWidget(),typeof updateHomeView=="function"&&updateHomeView(),typeof renderCustomCalendar=="function"&&renderCustomCalendar(),typeof scheduleRender=="function"&&state.view==="planner"&&scheduleRender(0)}function clearPlannedCalendarTasks(){const planned=state.plannedTasks&&typeof state.plannedTasks=="object"?state.plannedTasks:{};if(!hasPlannedTasks(planned)){typeof showToast=="function"&&showToast("Nessun compito pianificato da eliminare");return}confirm("Vuoi eliminare tutti i compiti pianificati nel calendario? L'azione verr\xE0 salvata anche nel database.")&&(state.plannedTasks={},saveTasks(),typeof debouncedSavePlannerRemote=="function"&&debouncedSavePlannerRemote(300),typeof showToast=="function"&&showToast("Compiti pianificati eliminati"),notifyPlannerChanged(),state.view==="planner"&&state.uiMode==="calendar"&&typeof renderCustomCalendar=="function"?renderCustomCalendar():state.view==="planner"&&typeof refreshAgenda=="function"?refreshAgenda():typeof scheduleRender=="function"&&scheduleRender(0))}function notifyPlannerChanged(){state._weeklyAgendaCacheHtml="";try{localStorage.removeItem(getAgendaCacheKey())}catch{}if(typeof updatePlannerCounter=="function"&&void 0,typeof updateHomeView=="function"&&updateHomeView(),typeof updateHomeTaskFocusWidget=="function"&&updateHomeTaskFocusWidget(),state.view==="planner"){const agendaEl=document.getElementById("weekly-agenda-list");if(agendaEl){const newContent=renderWeeklyAgenda(),temp=document.createElement("div");temp.innerHTML=newContent;const newList=temp.querySelector("#weekly-agenda-list");newList&&(agendaEl.innerHTML=newList.innerHTML)}}typeof renderCustomCalendar=="function"&&renderCustomCalendar();const calendarEl=document.getElementById("calendar");calendarEl&&calendarEl._fullCalendar&&(syncCalendarEvents(calendarEl._fullCalendar),calendarEl._fullCalendar.updateSize())}function getPlannedTasksTotalCount(){return Object.values(state.plannedTasks||{}).reduce((sum,list)=>Array.isArray(list)?sum+list.length:sum,0)}function getSubjectColor(subject){let s=(subject||"").trim();if(s=s.replace(/[*_\[\]]/g,"").trim(),!s)return"#3B9DD4";const normalized=normalizeSubjectName(s),abbr=getSubjectAbbrev(s).toLowerCase(),colorByAbbrev={mat:"#2563EB",fis:"#6366F1",ing:"#14B8A6",ita:"#EF4444",sto:"#EAB308",geo:"#D4A037",lat:"#D44B4B",sci:"#22C55E",bio:"#10B981",chi:"#9040C8",fil:"#A855F7",art:"#FF6B00",dis:"#FF6B00",scm:"#E0F2FE",rel:"#C82090",inf:"#06B6D4",dir:"#2A5CC8",eco:"#C89020",fra:"#3055C0",ted:"#C82060",spa:"#C83030",grc:"#C82090",civ:"#B46534"};if(colorByAbbrev[abbr])return colorByAbbrev[abbr];if(normalized.includes("educazione civica")||normalized.includes("ed civica")||normalized.includes("civica"))return"#B46534";if(normalized.includes("scienze motorie")||normalized.includes("motorie")||normalized.includes("sportive"))return"#E0F2FE";if(normalized.includes("scienze naturali")||normalized.includes("naturali"))return"#22C55E";if(normalized.includes("informatica"))return"#06B6D4";if(normalized.includes("matematica"))return"#2563EB";if(normalized.includes("filosofia"))return"#A855F7";if(normalized.includes("fisica"))return"#6366F1";if(normalized.includes("storia"))return"#EAB308";if(normalized.includes("italiano"))return"#EF4444";if(normalized.includes("inglese"))return"#14B8A6";if(isArtDrawingSubjectNormalized(normalized))return"#FF6B00";let hash=0;for(let i=0;i<s.length;i++)hash=s.charCodeAt(i)+((hash<<5)-hash);return`hsl(${Math.abs(hash%360)}, 80%, 52%)`}function renderAvatar(displayName,size=44){const initials=displayName.split(" ").map(n=>n[0]).join("").toUpperCase().slice(0,2),hash=Array.from(displayName).reduce((acc,char)=>char.charCodeAt(0)+((acc<<5)-acc),0),bg=`hsl(${Math.abs(hash%360)}, 60%, 45%)`;return`
            <div style="width:${size}px; height:${size}px; background:${bg}; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; font-weight:700; font-size:${size*.4}px; border:2px solid rgba(var(--glass-rgb),0.15); flex-shrink:0; pointer-events:none;">
                ${initials}
            </div>`}function showEditProfileModal(){const modalContainer2=getModalContainer();modalContainer2&&(modalContainer2.innerHTML=`
        <div class="modal-overlay active" onclick="closeModal(event)">
            <div class="modal-content" onclick="event.stopPropagation()" style="width: 100%; max-width: 440px; animation: slideUp 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                    <h2 style="margin: 0; font-size: 22px; font-weight: 800;">Modifica Profilo</h2>
                    <button onclick="closeModal()" style="background: none; border: none; color: var(--text-dim); cursor: pointer; font-size: 20px;"><i class="ph-bold ph-x"></i></button>
                </div>
                
                <div style="display: flex; flex-direction: column; gap: 20px;">
                    <div>
                        <label style="display: block; font-size: 11px; font-weight: 800; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Nome Completo</label>
                        <input type="text" id="edit-user-name" value="${escapeHtml(state.user.name||"")}" placeholder="Esempio: Andrea Rossi">
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
        </div>`)}function showProfileActions(){const modalContainer2=getModalContainer();modalContainer2&&(modalContainer2.innerHTML=`
        <div class="modal-overlay active" onclick="closeModal(event)">
            <div class="modal-content" onclick="event.stopPropagation()" style="width: 100%; max-width: 380px; padding: 8px; animation: slideUp 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);">
                <!-- User Profile Summary -->
                <div style="padding: 24px; display: flex; align-items: center; gap: 16px;">
                    ${renderAvatar(state.user.name,56)}
                    <div style="min-width: 0;">
                        <div style="font-size: 18px; font-weight: 800; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(state.user.name)}</div>
                        <div style="font-size: 13px; color: var(--text-dim); font-weight: 600;">${escapeHtml(typeof getEffectiveUserClass=="function"&&getEffectiveUserClass()||normalizeClassUi(state.user?.class,state.user?.specialization)||"Studente")}</div>
                    </div>
                </div>

                <div style="padding: 0 8px 12px 8px; display: flex; flex-direction: column; gap: 4px;">
                    <button class="nav-item" onclick="closeModal(); navigate('profile');" style="width: 100%; border-radius: 12px; height: 52px; display: flex; align-items: center; gap: 12px; padding: 0 16px; background: transparent; border: none; cursor: pointer;">
                        <i class="ph-bold ph-gear" style="font-size: 20px; color: var(--text-dim);"></i>
                        <span style="font-size: 14px; font-weight: 700; color: var(--text-primary);">Configurazione</span>
                    </button>

                    <div style="height: 1px; background: rgba(var(--glass-rgb),0.05); margin: 8px 4px;"></div>

                    <button onclick="logout()" style="width: 100%; border-radius: 12px; height: 52px; display: flex; align-items: center; gap: 12px; padding: 0 16px; background: rgba(239, 68, 68, 0.05); border: none; cursor: pointer; color: var(--red);">
                        <i class="ph-bold ph-sign-out" style="font-size: 20px;"></i>
                        <span style="font-size: 14px; font-weight: 800;">Esci dall'Account</span>
                    </button>
                </div>
            </div>
        </div>`)}window.showProfileActions=showProfileActions;function renderSettings(){return`
            <div class="view">
                <div style="margin-bottom: 24px;">
                    <h1 style="font-size: 28px; color: var(--text-primary);">Impostazioni</h1>
                    <p style="font-size: 15px; color: var(--text-secondary);">Configura la tua esperienza</p>
               </div>

                <div class="glass-panel" style="padding: 0; overflow: hidden;">
                    <!-- Profile Section -->
                    <div style="padding: 20px; display: flex; align-items: center; gap: 16px; border-bottom: 1px solid rgba(var(--glass-rgb),0.05);">
                         ${renderAvatar(state.user.name,56)}
                        <div>
                            <div style="font-size: 17px; font-weight: 600; color: var(--text-primary);">${escapeHtml(state.user.name)}</div>
                            <div style="font-size: 14px; color: var(--text-secondary);">${escapeHtml(typeof getEffectiveUserClass=="function"&&getEffectiveUserClass()||normalizeClassUi(state.user?.class,state.user?.specialization)||state.user?.class||"Studente")}</div>
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
            `}function renderWeeklyAgenda(){const list=[];new Date().setHours(0,0,0,0);const tasks=Array.isArray(state.tasks)?state.tasks:[],plannedTasks=state.plannedTasks&&typeof state.plannedTasks=="object"?state.plannedTasks:{};state.plannerMode==="registro"?tasks.forEach(t=>{t.subject!=="QUEST"&&!t.isExam&&t.due_date&&list.push({...t,displayDate:t.due_date})}):Object.entries(plannedTasks).forEach(([dateStr,ids])=>{Array.isArray(ids)&&ids.forEach(id=>{const t=tasks.find(tk=>tk.id===id);t&&!t.isExam&&list.push({...t,displayDate:dateStr})})});const query=(state.agendaSearchQuery||"").toLowerCase().trim(),filterSubject=state.agendaSearchSubject||"all";state.agendaSortOrder!=="due_desc"&&(state.agendaSortOrder="due_desc");const filteredList=list.map(t=>({...t,_dueTs:parseArgoDate(t.displayDate).getTime()})).filter(t=>{const matchesQuery=!query||(t.text||"").toLowerCase().includes(query)||(t.subject||"").toLowerCase().includes(query),matchesSubject=filterSubject==="all"||(t.subject||"").toLowerCase().trim()===filterSubject.toLowerCase().trim();return matchesQuery&&matchesSubject}).sort((a,b)=>b._dueTs-a._dueTs),allSubjects=[...new Set(list.map(t=>t.subject?.trim()).filter(Boolean))].sort(),searchHeader=`
                <div class="agenda-search-container">
                    <div class="search-input-wrapper">
                        <i class="ph-bold ph-magnifying-glass"></i>
                        <input type="text" 
                               class="agenda-search-input" 
                               placeholder="Cerca tra i tuoi compiti..." 
                               value="${state.agendaSearchQuery||""}"
                               oninput="handleAgendaSearch(event)">
                    </div>
                    <div class="agenda-filters-scroll">
                        <div class="filter-chip ${filterSubject==="all"?"active":""}" onclick="state.agendaSearchSubject='all'; state._filterJustTriggered=true; refreshAgenda();">
                            <i class="ph ph-rows"></i> Tutti
                        </div>
                        ${allSubjects.map(s=>{const escapedS=s.replace(/\\/g,"\\\\").replace(/'/g,"\\'");return`
                                <div class="filter-chip ${filterSubject===s?"active":""}" onclick="state.agendaSearchSubject='${escapedS}'; state._filterJustTriggered=true; refreshAgenda();">
                                    ${s}
                                </div>
                            `}).join("")}
                    </div>
                </div>
            `;if(!filteredList.length)return`
                ${searchHeader}
                <div class="card" style="text-align: center; color: var(--text-dim); padding: 50px 20px; font-family: 'Inter', sans-serif; background: rgba(0,0,0,0.02); border: 1px dashed rgba(0,0,0,0.05);">
                    <i class="ph ph-magnifying-glass" style="font-size: 40px; opacity: 0.2; margin-bottom: 12px; display: block;"></i>
                    <div style="font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">// NESSUN RISULTATO</div>
                    <p style="font-size: 12px; margin-top: 4px; opacity: 0.6;">Prova a cambiare i filtri o la ricerca</p>
                </div> `;const grouped={};filteredList.forEach(t=>{grouped[t.displayDate]||(grouped[t.displayDate]=[]),grouped[t.displayDate].push(t)});const sortedDates=Object.keys(grouped).sort((a,b)=>parseArgoDate(b).getTime()-parseArgoDate(a).getTime());return`
        <div id="weekly-agenda-list" class="weekly-agenda-root" style="display: flex; flex-direction: column; gap: 32px;">
            ${searchHeader}
            ${sortedDates.map(dateStr=>{const d=parseArgoDate(dateStr),dayNum=d.toLocaleDateString("it-IT",{day:"numeric"}),dayName=d.toLocaleDateString("it-IT",{weekday:"long"}),monthName=d.toLocaleDateString("it-IT",{month:"short"}),isToday=dateStr===getLocalDateString(),isTomorrow=(()=>{const tm=new Date;return tm.setDate(tm.getDate()+1),dateStr===getLocalDateString(tm)})(),labelColor=isToday?"var(--success)":isTomorrow?"#FF9F0A":"transparent",labelTag=isToday||isTomorrow?`<span class="agenda-day-label" style="font-family: var(--font-main); font-size:10px; font-weight:800; color:${labelColor}; border: 1px solid ${labelColor}; padding:2px 8px; border-radius:4px; text-transform:uppercase; letter-spacing:0.05em;">${isToday?"TODAY":isTomorrow?"BEYOND":""}</span>`:"";return`
            <div class="agenda-day-section">
                <!-- TE Date Header -->
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                    <div style="display:flex; flex-direction:column; align-items:center; min-width:44px;">
                        <span style="font-family: var(--font-main); font-size:24px; font-weight:800; color:${isToday?"var(--accent)":"var(--text-primary)"}; line-height:1; letter-spacing:-0.04em;">${dayNum}</span>
                        <span class="agenda-day-month" style="font-family: var(--font-main); font-size:10px; font-weight:700; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.1em; margin-top:2px;">${monthName}</span>
                    </div>
                    <div style="flex:1; height:1px; background:rgba(0,0,0,0.05);"></div>
                    <div style="font-family: var(--font-main); font-size:12px; font-weight:700; color:var(--text-dim); text-transform:capitalize; letter-spacing:-0.01em;">${dayName}</div>
                    ${labelTag}
                </div>
                
                <!-- Tasks List -->
                <div style="display:flex; flex-direction:column; gap:12px;">
                    ${grouped[dateStr].filter(t=>!/check-?list|check\s*liste|checklist\s*&\s*review/i.test(t.text||t.description||"")).map(t=>{const subjColor=getSubjectColor(t.subject),cleanSubject=(t.subject||"").replace(/\*/g,"").trim(),timeMatch=(t.text||"").match(/(\d{1,2}:\d{2})/),timeStr=timeMatch?timeMatch[1]:"",displayText=(t.text||t.description||"Task").replace(/^\[AI\]\s*/i,"").replace(/^\d{2}:\d{2}\s*[—\-]\s*/,"").replace(/\*/g,"").replace(/[\s|]+$/,"").trim();return`
                        <div class="card agenda-task-card" style="display:flex; align-items:stretch; background:${t.done?"#FAFAF9":"var(--surface-container-lowest)"}; border: 1px solid ${t.done?"#EDEBE7":"rgba(0,0,0,0.06)"}; border-radius:14px; min-height:80px; box-shadow: 0 1px 3px rgba(0,0,0,0.02); transition: background 0.2s cubic-bezier(0.2, 0.8, 0.2, 1), border-color 0.2s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);">
                        <div style="width:4px; background:${t.done?"var(--outline-variant)":subjColor}; flex-shrink:0;"></div>
                        
                        <div class="agenda-task-main" style="flex:1; padding:16px 20px; min-width:0; display:flex; flex-direction:column; justify-content:center;">
                            <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px; flex-wrap:wrap;">
                                <span class="agenda-subject-badge" style="font-family: var(--font-main); font-size:9px; font-weight:700; color:${t.done?"var(--on-surface-variant)":subjColor}; text-transform:uppercase; letter-spacing:0.08em; background:rgba(0,0,0,0.04); padding:2px 6px; border-radius:4px;">${escapeHtml(cleanSubject)}</span>
                                ${timeStr?`<span class="agenda-time-badge" style="font-family: var(--font-main); font-size:9px; font-weight:600; color:var(--on-surface-variant); background:var(--surface-container-low); padding:2px 6px; border-radius:4px;">${escapeHtml(timeStr)}</span>`:""}
                            </div>
                            <div data-task-text="${escapeHtml(t.id)}" style="font-family: var(--font-main); font-size:14px; font-weight:600; color:${t.done?"var(--on-surface-variant)":"var(--on-surface)"}; line-height:1.5; word-break:break-word; ${t.done?"text-decoration:line-through; opacity: 0.5;":""}">${escapeHtml(displayText)}</div>
                        </div>
                        
                        <div class="agenda-task-actions" style="padding:0 16px; display:flex; align-items:center; justify-content:center; gap:8px; flex-shrink:0; border-left: 1px dashed rgba(0,0,0,0.04);">
                            <div class="agenda-task-action-btn" data-task-toggle="${escapeHtml(t.id)}" onclick="toggleTask('${escapeJsSingleQuote(t.id)}',event)" style="width:30px; height:30px; border-radius:8px; border:1.5px solid ${t.done?"var(--on-surface)":"var(--outline-variant)"}; background:${t.done?"var(--on-surface)":"transparent"}; display:flex; align-items:center; justify-content:center; cursor:pointer; transition: background 0.18s ease, border-color 0.18s ease; flex-shrink:0;">
                                ${t.done?'<i class="ph-bold ph-check" style="font-size:14px; color:#fff;"></i>':""}
                            </div>
                            ${isUserGeneratedTaskId(t.id)?`
                            <button class="agenda-task-action-btn" onclick="event.stopPropagation(); deleteCalendarTask('${escapeJsSingleQuote(t.id)}');" style="width:30px; height:30px; border-radius:8px; border:1px solid rgba(255,59,48,0.18); background:var(--error-container); color:var(--error); display:flex; align-items:center; justify-content:center; cursor:pointer; transition: background 0.18s ease; flex-shrink:0;" aria-label="Elimina attivit\xE0">
                                <i class="ph-bold ph-trash" style="font-size:13px;"></i>
                            </button>`:""}
                        </div>
                    </div>`}).join("")}
                </div>
            </div>`}).join("")}
        </div>`}function getActivityDateObject(activity){const rawDate=activity?.date||activity?.datGiorno||"",parsed=parseArgoDate(rawDate);return!(parsed instanceof Date)||Number.isNaN(parsed.getTime())?null:parsed}function getCurrentSchoolYearLabel(){const now=new Date,startYear=now.getMonth()>=8?now.getFullYear():now.getFullYear()-1;return`${startYear}-${startYear+1}`}function getSchoolYearLabelForDate(date){const startYear=date.getMonth()>=8?date.getFullYear():date.getFullYear()-1;return`${startYear}-${startYear+1}`}function getIsoWeekInputValue(date){const target=new Date(date.getTime());target.setHours(0,0,0,0);const day=(target.getDay()+6)%7;target.setDate(target.getDate()-day+3);const firstThursday=new Date(target.getFullYear(),0,4),firstThursdayDay=(firstThursday.getDay()+6)%7;firstThursday.setDate(firstThursday.getDate()-firstThursdayDay+3);const week=1+Math.round((target-firstThursday)/(10080*60*1e3));return`${target.getFullYear()}-W${String(week).padStart(2,"0")}`}function parseIsoWeekRange(weekValue){const match=String(weekValue||"").match(/^(\d{4})-W(\d{2})$/);if(!match)return null;const year=Number(match[1]),week=Number(match[2]);if(!Number.isFinite(year)||!Number.isFinite(week))return null;const jan4=new Date(year,0,4,12,0,0),jan4Day=(jan4.getDay()+6)%7,week1Monday=new Date(jan4);week1Monday.setDate(jan4.getDate()-jan4Day);const start=new Date(week1Monday);start.setDate(week1Monday.getDate()+(week-1)*7);const end=new Date(start);return end.setDate(start.getDate()+6),{start,end}}function getViewportWidth(){return window.innerWidth||document.documentElement.clientWidth||0}function getWeekSelectionDetailLabel(weekValue,options={}){const match=String(weekValue||"").match(/^(\d{4})-W(\d{2})$/),range=parseIsoWeekRange(weekValue);if(!match||!range)return"";const weekNumber=Number(match[2]),weekYear=Number(match[1]),startLabel=range.start.toLocaleDateString("it-IT",{weekday:"short",day:"2-digit",month:"2-digit"}),endLabel=range.end.toLocaleDateString("it-IT",{weekday:"short",day:"2-digit",month:"2-digit"});return options.compact?`${startLabel} \u2192 ${endLabel}`:`Settimana ${weekNumber} del ${weekYear} \xB7 da ${startLabel} a ${endLabel}`}function getWeekSelectionOptionLabel(weekValue,options={}){const normalizedWeek=String(weekValue||"");if(!/^\d{4}-W\d{2}$/.test(normalizedWeek))return normalizedWeek;const range=parseIsoWeekRange(normalizedWeek);if(!range)return normalizedWeek;const startLabel=range.start.toLocaleDateString("it-IT",{day:"2-digit",month:"short"}),endLabel=range.end.toLocaleDateString("it-IT",{day:"2-digit",month:"short"});return options.compact?`${startLabel} \u2192 ${endLabel}`:`Settimana ${Number(normalizedWeek.slice(6))} \xB7 ${startLabel} \u2192 ${endLabel}`}function shiftIsoWeekValue(weekValue,deltaWeeks){const range=parseIsoWeekRange(weekValue);if(!range||!Number.isFinite(deltaWeeks))return weekValue;const target=new Date(range.start);return target.setDate(target.getDate()+deltaWeeks*7),getIsoWeekInputValue(target)}function getClassActivitiesWeekOptions(selectedWeekValue){const weeks=new Set,today=new Date;for(let offset=-CLASS_ACTIVITIES_WEEK_LOOKBACK;offset<=CLASS_ACTIVITIES_WEEK_LOOKAHEAD;offset+=1){const d=new Date(today);d.setDate(today.getDate()+offset*7),weeks.add(getIsoWeekInputValue(d))}getSortedCompletedClassActivities().forEach(activity=>{activity?._parsedDate instanceof Date&&weeks.add(getIsoWeekInputValue(activity._parsedDate))});const selected=selectedWeekValue||getIsoWeekInputValue(today);return weeks.add(selected),[...weeks].sort((a,b)=>{const aStart=parseIsoWeekRange(a)?.start?.getTime?.()??0;return(parseIsoWeekRange(b)?.start?.getTime?.()??0)-aStart}).slice(0,CLASS_ACTIVITIES_MAX_WEEK_OPTIONS)}function getSortedCompletedClassActivities(){return(Array.isArray(state.classActivities)?state.classActivities:[]).map(a=>({...a,_parsedDate:getActivityDateObject(a)})).filter(a=>a._parsedDate).sort((a,b)=>{const delta=b._parsedDate.getTime()-a._parsedDate.getTime();return delta!==0?delta:String(b?.id||"").localeCompare(String(a?.id||""))})}function getClassActivitiesExportSelection(){const saved=state.classActivitiesExport||{},period=saved.period||"month",monthValue=saved.month||getLocalDateString().slice(0,7),weekValue=saved.week||getIsoWeekInputValue(new Date),schoolYearValue=saved.schoolYear||getCurrentSchoolYearLabel(),all=getSortedCompletedClassActivities();let items=all,periodLabel="Intero anno scolastico";if(period==="month"){items=all.filter(a=>getLocalDateString(a._parsedDate).slice(0,7)===monthValue);const[y,m]=monthValue.split("-");periodLabel=`Mese: ${new Date(Number(y),Number(m)-1,1).toLocaleDateString("it-IT",{month:"long",year:"numeric"})}`}else if(period==="week"){const range=parseIsoWeekRange(weekValue);if(range){const startKey=getLocalDateString(range.start),endKey=getLocalDateString(range.end);items=all.filter(a=>{const key=getLocalDateString(a._parsedDate);return key>=startKey&&key<=endKey}),periodLabel=getWeekSelectionDetailLabel(weekValue)||`Settimana: ${range.start.toLocaleDateString("it-IT")} - ${range.end.toLocaleDateString("it-IT")}`}else items=[],periodLabel="Settimana non valida"}else if(period==="school_year"){const m=schoolYearValue.match(/^(\d{4})-(\d{4})$/);if(m){const start=new Date(Number(m[1]),8,1,0,0,0),end=new Date(Number(m[2]),7,31,23,59,59);items=all.filter(a=>a._parsedDate>=start&&a._parsedDate<=end),periodLabel=`Anno scolastico: ${m[1]}/${m[2]}`}else items=[],periodLabel="Anno scolastico non valido"}return{period,monthValue,weekValue,schoolYearValue,items,periodLabel,totalItems:all.length}}function renderClassActivitiesExportModalContent(){const modalContent=document.getElementById("class-activities-export-modal-content");if(!modalContent)return;const selection=getClassActivitiesExportSelection(),weekOptions=getClassActivitiesWeekOptions(selection.weekValue);!weekOptions.includes(selection.weekValue)&&weekOptions.length>0&&(selection.weekValue=weekOptions[0],state.classActivitiesExport=state.classActivitiesExport||{},state.classActivitiesExport.week=selection.weekValue);const compactWeekLabels=getViewportWidth()<=MOBILE_WEEK_LABEL_BREAKPOINT,weekDetailLabel=getWeekSelectionDetailLabel(selection.weekValue,compactWeekLabels?{compact:!0}:{}),years=[...new Set(getSortedCompletedClassActivities().map(a=>getSchoolYearLabelForDate(a._parsedDate)))].sort((a,b)=>b.localeCompare(a));years.length||years.push(getCurrentSchoolYearLabel());const S="width:100%;padding:14px 16px;border-radius:16px;border:0.5px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.06);color:#ffffff;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;outline:none;box-sizing:border-box;-webkit-appearance:none;",periodControls=selection.period==="month"?`<input type="month" value="${escapeHtml(selection.monthValue)}" onchange="updateClassActivitiesExportPeriodValue('month', this.value)" style="${S}">`:selection.period==="week"?`<div style="display:flex;flex-direction:column;gap:8px;">
                <div style="display:flex;align-items:center;gap:8px;">
                    <button type="button" onclick="shiftClassActivitiesExportWeek(-1)" style="width:42px;height:42px;border-radius:50%;background:rgba(255,255,255,0.08);border:0.5px solid rgba(255,255,255,0.15);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#ffffff;transition:transform 0.15s ease;" ontouchstart="this.style.transform='scale(0.92)'" ontouchend="this.style.transform='scale(1)'">
                        <i class="ph-bold ph-caret-left" style="font-size:18px;"></i>
                    </button>
                    <select onchange="updateClassActivitiesExportPeriodValue('week', this.value)" style="${S}flex:1;">
                        ${weekOptions.map(weekValue=>`<option value="${escapeHtml(weekValue)}" ${selection.weekValue===weekValue?"selected":""}>${escapeHtml(getWeekSelectionOptionLabel(weekValue,compactWeekLabels?{compact:!0}:{}))}</option>`).join("")}
                    </select>
                    <button type="button" onclick="shiftClassActivitiesExportWeek(1)" style="width:42px;height:42px;border-radius:50%;background:rgba(255,255,255,0.08);border:0.5px solid rgba(255,255,255,0.15);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#ffffff;transition:transform 0.15s ease;" ontouchstart="this.style.transform='scale(0.92)'" ontouchend="this.style.transform='scale(1)'">
                        <i class="ph-bold ph-caret-right" style="font-size:18px;"></i>
                    </button>
                </div>
                ${weekDetailLabel?`<p style="font-size:11px;color:rgba(255,255,255,0.5);font-weight:600;text-align:center;margin:0;">${escapeHtml(weekDetailLabel)}</p>`:""}
              </div>`:`<select onchange="updateClassActivitiesExportPeriodValue('school_year', this.value)" style="${S}">
                ${years.map(y=>`<option value="${escapeHtml(y)}" ${selection.schoolYearValue===y?"selected":""}>${escapeHtml(y.replace("-","/"))}</option>`).join("")}
              </select>`,mkTab=(period,label,icon)=>{const act=selection.period===period;return`<button onclick="setClassActivitiesExportPeriod('${period}')" style="padding:10px 6px;border-radius:12px;font-size:12px;font-weight:${act?"700":"600"};cursor:pointer;font-family:'Inter',sans-serif;border:${act?"1px solid rgba(41,151,255,0.6)":"none"};background:${act?"#2997ff":"transparent"};color:${act?"#ffffff":"rgba(255,255,255,0.7)"};box-shadow:${act?"0 4px 14px rgba(41,151,255,0.35)":"none"};display:flex;align-items:center;justify-content:center;gap:5px;transition:all 0.2s ease;">
            <i class="ph-fill ${icon}" style="font-size:14px;color:${act?"#ffffff":"#2997ff"};"></i>
            <span>${label}</span>
        </button>`};modalContent.innerHTML=`
        <div style="font-family:'Inter',sans-serif;color:#ffffff;position:relative;">
            <!-- Ambient Top Glow -->
            <div style="position:absolute;top:-20px;right:-20px;width:120px;height:120px;background:#2997ff;opacity:0.2;border-radius:50%;filter:blur(30px);pointer-events:none;"></div>

            <!-- Header -->
            <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:24px 24px 18px;position:relative;z-index:1;">
                <div>
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                        <span style="width:6px;height:6px;border-radius:50%;background:#2997ff;box-shadow:0 0 8px #2997ff;"></span>
                        <span style="font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#2997ff;">REPORT ACCADEMICO</span>
                    </div>
                    <h2 style="margin:0;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">Esporta Attivit\xE0</h2>
                    <p style="margin:3px 0 0;font-size:12px;color:rgba(255,255,255,0.6);font-weight:500;">Attivit\xE0 e lezioni registrate sul diario</p>
                </div>
                <button onclick="(function(){var o=document.querySelector('.modal-overlay.active');if(o)o.remove();else{var mc=document.getElementById('class-activities-export-modal-content');if(mc&&mc.parentNode)mc.parentNode.remove();}})()" style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.08);border:0.5px solid rgba(255,255,255,0.15);color:rgba(255,255,255,0.8);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:transform 0.15s ease;" ontouchstart="this.style.transform='scale(0.9)'" ontouchend="this.style.transform='scale(1)'">
                    <i class="ph ph-x" style="font-size:18px;"></i>
                </button>
            </div>

            <!-- Period tabs + controls -->
            <div style="padding:0 24px 16px;display:flex;flex-direction:column;gap:14px;position:relative;z-index:1;">
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;background:rgba(255,255,255,0.05);padding:4px;border-radius:16px;border:0.5px solid rgba(255,255,255,0.1);">
                    ${mkTab("week","Settimana","ph-calendar")}
                    ${mkTab("month","Mese","ph-calendar-blank")}
                    ${mkTab("school_year","Anno","ph-graduation-cap")}
                </div>
                <div>${periodControls}</div>
                <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:rgba(20,31,54,0.75);border-radius:16px;border:0.5px solid rgba(255,255,255,0.12);">
                    <span style="font-size:13px;color:rgba(255,255,255,0.7);font-weight:500;">${escapeHtml(selection.periodLabel)}</span>
                    <span style="font-size:12px;font-weight:800;color:#2997ff;background:rgba(41,151,255,0.15);padding:4px 12px;border-radius:999px;border:0.5px solid rgba(41,151,255,0.3);">${selection.items.length} trovate</span>
                </div>
            </div>

            <!-- PDF button -->
            <div style="padding:0 24px 8px;position:relative;z-index:1;">
                <button onclick="downloadClassActivitiesPdf()" style="width:100%;height:52px;border-radius:18px;border:1px solid rgba(255,255,255,0.3);background:linear-gradient(135deg,#2997ff 0%,#0058bc 100%);color:white;font-size:15px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;box-shadow:0 8px 24px rgba(41,151,255,0.4);display:flex;align-items:center;justify-content:center;gap:8px;transition:transform 0.15s ease;" ontouchstart="this.style.transform='scale(0.97)'" ontouchend="this.style.transform='scale(1)'">
                    <i class="ph-bold ph-file-pdf" style="font-size:20px;"></i>
                    Genera PDF Ufficiale
                </button>
                <p style="text-align:center;font-size:11px;color:rgba(255,255,255,0.45);margin:10px 0 0;line-height:1.4;">Si aprir\xE0 l'anteprima di stampa Apple/sistema: seleziona "Salva come PDF".</p>
            </div>
        </div>
    `}window.openClassActivitiesExportModal=function(){const modalContainer2=getModalContainer();modalContainer2&&(state.classActivitiesExport||(state.classActivitiesExport={period:"month",month:getLocalDateString().slice(0,7),week:getIsoWeekInputValue(new Date),schoolYear:getCurrentSchoolYearLabel()}),modalContainer2.innerHTML=`
        <div class="modal-overlay active" onclick="closeModal(event)" style="position:fixed;inset:0;z-index:99990;background:rgba(5,8,17,0.75);display:flex;align-items:flex-end;justify-content:center;backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);">
            <div id="class-activities-export-modal-content" onclick="event.stopPropagation()" style="width:100%;max-width:480px;background:rgba(18,26,44,0.95);border:0.5px solid rgba(255,255,255,0.15);border-top:1px solid rgba(255,255,255,0.25);border-radius:32px 32px 0 0;padding:0 0 calc(28px + env(safe-area-inset-bottom,0px)) 0;box-shadow:0 -12px 40px rgba(0,0,0,0.6);overflow:hidden;max-height:90vh;overflow-y:auto;font-family:'Inter',sans-serif;"></div>
        </div>
    `,renderClassActivitiesExportModalContent())},window.setClassActivitiesExportPeriod=function(period){state.classActivitiesExport=state.classActivitiesExport||{},state.classActivitiesExport.period=period,renderClassActivitiesExportModalContent()},window.togglePlannerMobileDropdown=function(event2){typeof event2<"u"&&event2?.stopPropagation();const menu=document.getElementById("planner-mobile-menu"),toggle=document.getElementById("planner-menu-toggle");if(!menu||!toggle)return;if(menu.classList.contains("active"))closePlannerMobileDropdown();else{menu.classList.add("active"),toggle.classList.add("active"),toggle.setAttribute("aria-expanded","true"),repositionPlannerMobileDropdown(),plannerMobileDropdownRepositionListener=repositionPlannerMobileDropdown,window.addEventListener("resize",plannerMobileDropdownRepositionListener,{passive:!0}),window.addEventListener("scroll",plannerMobileDropdownRepositionListener,PLANNER_MOBILE_DROPDOWN_SCROLL_LISTENER_OPTIONS);const closeOnOutsideClick=e=>{!menu.contains(e.target)&&!toggle.contains(e.target)&&(closePlannerMobileDropdown(),document.removeEventListener("click",closeOnOutsideClick))};setTimeout(()=>document.addEventListener("click",closeOnOutsideClick),0)}},window.closePlannerMobileDropdown=function(){const menu=document.getElementById("planner-mobile-menu"),toggle=document.getElementById("planner-menu-toggle");menu&&menu.classList.remove("active"),toggle&&(toggle.classList.remove("active"),toggle.setAttribute("aria-expanded","false")),plannerMobileDropdownRepositionListener&&(window.removeEventListener("resize",plannerMobileDropdownRepositionListener),window.removeEventListener("scroll",plannerMobileDropdownRepositionListener,PLANNER_MOBILE_DROPDOWN_SCROLL_LISTENER_OPTIONS),plannerMobileDropdownRepositionListener=null)};function repositionPlannerMobileDropdown(){const menu=document.getElementById("planner-mobile-menu"),toggle=document.getElementById("planner-menu-toggle");if(!menu||!toggle||!menu.classList.contains("active"))return;const toggleRect=toggle.getBoundingClientRect(),viewportWidth=getViewportWidth(),viewportHeight=window.innerHeight||document.documentElement.clientHeight||0,menuWidth=menu.offsetWidth||PLANNER_MOBILE_DROPDOWN_DEFAULT_WIDTH,menuHeight=menu.offsetHeight||PLANNER_MOBILE_DROPDOWN_DEFAULT_HEIGHT,margin=PLANNER_MOBILE_DROPDOWN_MARGIN;let left=toggleRect.right-menuWidth;const minLeft=margin,maxLeft=Math.max(minLeft,viewportWidth-menuWidth-margin);left=Math.min(Math.max(left,minLeft),maxLeft);let top=toggleRect.bottom+PLANNER_MOBILE_DROPDOWN_OFFSET;viewportHeight-top-margin<menuHeight&&toggleRect.top>menuHeight+PLANNER_MOBILE_DROPDOWN_FLIP_CLEARANCE?(top=Math.max(margin,toggleRect.top-menuHeight-PLANNER_MOBILE_DROPDOWN_OFFSET),menu.style.transformOrigin="bottom right"):menu.style.transformOrigin="top right",menu.style.position="fixed",menu.style.left=`${Math.round(left)}px`,menu.style.top=`${Math.round(top)}px`,menu.style.right="auto"}window.handlePlannerMobileMenuAction=function(action){if(closePlannerMobileDropdown(),action==="plan"){showPlanWeekModal();return}if(action==="pdf"){openClassActivitiesExportModal();return}action==="clear"&&clearPlannedCalendarTasks()},window.updateClassActivitiesExportPeriodValue=function(period,value){state.classActivitiesExport=state.classActivitiesExport||{},period==="month"&&(state.classActivitiesExport.month=value),period==="week"&&(state.classActivitiesExport.week=value),period==="school_year"&&(state.classActivitiesExport.schoolYear=value),renderClassActivitiesExportModalContent()},window.shiftClassActivitiesExportWeek=function(deltaWeeks){state.classActivitiesExport=state.classActivitiesExport||{};const current=state.classActivitiesExport.week||getIsoWeekInputValue(new Date);state.classActivitiesExport.week=shiftIsoWeekValue(current,deltaWeeks),renderClassActivitiesExportModalContent()},window.downloadClassActivitiesPdf=function(){const selection=getClassActivitiesExportSelection();if(!selection.items.length){showToast("Nessuna attivit\xE0 svolta trovata per questo filtro.","warning");return}const renderedItems=selection.items.map((a,idx)=>{const dateText=(a.date||a.datGiorno||"").trim()||getLocalDateString(a._parsedDate),subjectText=(a.subject||a.materia||"Materia").trim(),contentText=(a.content||a.text||a.argomento||"").trim()||"Contenuto non disponibile";return`
            <div class="entry">
                <div class="entry-head">
                    <span class="entry-index">#${idx+1}</span>
                    <span class="entry-date">${escapeHtml(dateText)}</span>
                    <span class="entry-subject">${escapeHtml(subjectText)}</span>
                </div>
                <p>${escapeHtml(contentText)}</p>
            </div>
        `}).join(""),printableHtml=`
        <!doctype html>
        <html lang="it">
        <head>
            <meta charset="utf-8">
            <title>Attivita_svolte_${selection.period}_${new Date().toISOString().slice(0,10)}</title>
            <style>
                @page { size: A4; margin: 18mm 14mm; }
                body { font-family: Inter, -apple-system, BlinkMacSystemFont, Arial, sans-serif; color:#111; line-height:1.45; }
                .doc-head { border-bottom: 1px solid var(--outline-variant); padding-bottom: 12px; margin-bottom: 18px; }
                .doc-head h1 { font-size: 20px; margin:0 0 4px 0; letter-spacing:-0.02em; }
                .doc-head .meta { font-size: 12px; color:#555; }
                .note { font-size: 12px; color:#444; background:var(--surface-container-low); border:1px solid var(--outline-variant); border-radius:10px; padding:10px 12px; margin-bottom:16px; }
                .entry { border:1px solid var(--outline-variant); border-radius:10px; padding:10px 12px; margin-bottom:10px; page-break-inside: avoid; }
                .entry-head { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:6px; }
                .entry-index { font-weight:700; font-size:11px; color:var(--info); }
                .entry-date, .entry-subject { font-size:11px; color:#666; font-weight:600; }
                .entry p { margin:0; font-size:13px; color:#111; white-space:pre-wrap; }
            </style>
        </head>
        <body>
            <div class="doc-head">
                <h1>Attivit\xE0 svolte in classe</h1>
                <div class="meta">${escapeHtml(selection.periodLabel)} \xB7 ${selection.items.length} attivit\xE0 \xB7 Generato il ${new Date().toLocaleString("it-IT")}</div>
            </div>
            <div class="note">
                Documento esportato da G-Diary per condivisione su strumenti esterni. Include esclusivamente attivit\xE0 svolte in classe.
            </div>
            ${renderedItems}
            <script>
                window.addEventListener('load', function () {
                    // Piccolo delay per garantire che layout e font siano renderizzati prima del print dialog.
                    setTimeout(function () { window.print(); }, ${PRINT_DIALOG_DELAY_MS});
                });
            <\/script>
        </body>
        </html>
    `,popup=window.open("","_blank");if(!popup){showToast("Popup bloccato: abilita i popup per generare il PDF.","warning");return}popup.document.open(),popup.document.write(printableHtml),popup.document.close()},window.showPlanWeekModal=function(){const modalContainer2=getModalContainer();modalContainer2&&(state.planWeekInitialPlannedCount=getPlannedTasksTotalCount(),modalContainer2.innerHTML=`
        <div class="modal-overlay active" onclick="closeModal(event)" style="position:fixed;top:0;left:0;right:0;bottom:0;z-index:99990;background:rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);">
            <div id="plan-week-modal-content" class="modal-content glass-panel" onclick="event.stopPropagation()" style="position:relative;z-index:99991;width: 100%; max-width: 450px; padding: 24px; max-height: 90vh; overflow-y: auto;">
            </div>
        </div> `,refreshPlanWeekModalContent())};function togglePlanDay(taskId,dateStr){typeof event<"u"&&event&&event.stopPropagation&&event.stopPropagation();const todayStr=getLocalDateString();if(dateStr<todayStr)return;state.plannedTasks[dateStr]||(state.plannedTasks[dateStr]=[]);const index=state.plannedTasks[dateStr].indexOf(taskId);index>-1?state.plannedTasks[dateStr].splice(index,1):state.plannedTasks[dateStr].push(taskId),saveTasks();const isNowPlanned=state.plannedTasks[dateStr]&&state.plannedTasks[dateStr].includes(taskId);document.querySelectorAll(`[data-task-id="${taskId}"][data-date="${dateStr}"]`).forEach(btn=>{btn.style.background=isNowPlanned?"var(--on-surface)":"var(--surface-container-lowest)",btn.style.color=isNowPlanned?"white":"#4F4A43",btn.style.border=isNowPlanned?"2px solid var(--on-surface)":dateStr===todayStr?"2px solid #007AFF":"1px solid var(--outline-variant)",btn.style.transform="scale(0.9)",setTimeout(()=>{btn.style.transform="scale(1)",btn.style.transition="all 0.25s cubic-bezier(0.2,0.8,0.2,1)"},80)}),notifyPlannerChanged()}function showVotiView(){modalContainer.innerHTML=`
        <div class="modal-overlay active" onclick="closeModal(event)">
            <div class="modal-content" onclick="event.stopPropagation()" style="max-height:85vh; overflow-y:auto; padding: 0;">
                <div style="position: sticky; top: 0; background:#1c1c1e; padding: 20px; border-bottom:1px solid rgba(var(--glass-rgb),0.1); display:flex; justify-content:space-between; align-items:center; z-index: 10;">
                    <h2 style="margin:0;">Voti DidUP</h2>
                    <button onclick="closeModal()" style="background:none; border:none; color:var(--blue); font-weight:700; font-size:16px; cursor:pointer;">Chiudi</button>
                </div>
                <div style="padding: 20px;">
                    ${renderVoti()}
                </div>
            </div>
            </div> `}function getGoalProjection(media,goal,count){const safeMedia=Number.isFinite(media)?media:0,safeGoal=Number.isFinite(goal)?goal:8,safeCount=Number.isFinite(count)?count:0,currentSum=safeMedia*safeCount,done=safeMedia>=safeGoal,gap=Math.max(0,safeGoal-safeMedia);if(done)return{done:!0,gap:0,scenarios:[]};const grades=typeof GOAL_GRADE_OPTIONS_DESC<"u"?GOAL_GRADE_OPTIONS_DESC:[10,9.5,9,8.5,8,7.5,7,6.5,6],scenarios=[];for(const g of grades){if(g<=safeGoal)continue;const denom=g-safeGoal;if(denom<=1e-9)continue;const nNeeded=Math.ceil((safeGoal*safeCount-currentSum)/denom);nNeeded>=1&&nNeeded<=5&&scenarios.push({n:nNeeded,grade:g,label:nNeeded===1?`Prossimo voto: ${g}`:`Prossimi ${nNeeded} voti: ${g}`})}if(safeGoal<MAX_GRADE_VALUE)for(const g of grades){if(g<PASSING_GRADE_THRESHOLD||g>=safeGoal)continue;const sumAfterOne=currentSum+g,countAfterOne=safeCount+1,denom=MAX_GRADE_VALUE-safeGoal;if(denom<=1e-9)continue;const extraTopGrades=Math.ceil((safeGoal*countAfterOne-sumAfterOne)/denom),totalVotes=1+extraTopGrades;extraTopGrades>=1&&totalVotes<=5&&scenarios.push({n:totalVotes,grade:g,combo:!0,extraTopGrades,label:getProjectionComboDetailLabel(g,extraTopGrades,MAX_GRADE_VALUE)})}const uniqueScenarios=[],seenKeys=new Set,sortedScenarios=scenarios.sort((a,b)=>a.n-b.n||b.grade-a.grade);for(const s of sortedScenarios){const normalizedGrade=Number.isFinite(s.grade)?s.grade.toFixed(2):"0.00",normalizedExtra=Number.isFinite(s.extraTopGrades)?s.extraTopGrades:0,key=s.combo?`combo-${normalizedGrade}-${normalizedExtra}`:`single-${normalizedGrade}`;if(seenKeys.has(key)||(uniqueScenarios.push(s),seenKeys.add(key)),uniqueScenarios.length>=4)break}if(uniqueScenarios.length===0){const exact=safeGoal*(safeCount+1)-currentSum;exact>0&&exact<=10&&uniqueScenarios.push({n:1,grade:exact,exact:!0,label:`Prossimo voto esatto: ${exact.toFixed(2)}`})}return{done,gap,scenarios:uniqueScenarios}}function renderVoti(){const votiData=state.voti&&state.voti.length>0?state.voti:state.grades&&state.grades.length>0?state.grades:[];return votiData.length===0?`
        <div class="liquid-glass rounded-[40px] p-12 text-center flex flex-col items-center gap-6">
            <div class="w-20 h-20 rounded-[28px] bg-primary/10 flex items-center justify-center text-primary">
                <span class="material-symbols-outlined text-4xl">school</span>
            </div>
            <div>
                <p class="body-lg text-on-surface-variant/60 font-medium mb-6">Nessun voto registrato.</p>
                <button onclick="performArgoSync()" class="btn btn-primary">Sincronizza DidUP</button>
            </div>
        </div> `:`
        <div class="flex flex-col gap-4">
            ${votiData.map(v=>{const rawVal=(v.valore||v.value||"").toString(),giu=isGiustifica(rawVal),displayVal=giu?"GIU":rawVal,mat=v.materia||v.subject||"Materia",isSuff=getNumericGradeValue(v)>=6;return`
                <div class="liquid-glass rounded-[28px] p-6 liquid-shadow cursor-pointer transition-all hover:scale-[1.02] flex items-center gap-6" onclick="handleGradeSubjectClickFromEncoded('${encodeURIComponent(mat||"").replace(/'/g,"%27")}')">
                    <div class="w-14 h-14 rounded-2xl ${giu?"bg-surface-dim text-on-surface/40":isSuff?"bg-green/10 text-green":"bg-error/10 text-error"} flex items-center justify-center text-2xl font-bold border border-white/40">
                        ${displayVal}
                    </div>
                    <div class="flex-1 min-width-0">
                        <h3 class="font-bold text-on-surface truncate">${mat}</h3>
                        <p class="text-on-surface-variant/40 text-[12px] font-bold uppercase tracking-wider">${v.data||v.date} \u2022 ${v.tipo||v.type}</p>
                    </div>
                    <span class="material-symbols-outlined text-on-surface-variant/20">chevron_right</span>
                </div>`}).join("")}
        </div> `}function showBachecaModal(){const dataBacheca=state.promemoria&&state.promemoria.length>0?state.promemoria:state.announcements&&state.announcements.length>0?state.announcements:[];console.log("\u{1F4E2} Rendering bacheca - state.promemoria:",state.promemoria?.length||0,"state.announcements:",state.announcements?.length||0),modalContainer.innerHTML=`
        <div class="modal-overlay active" onclick="closeModal(event)">
            <div class="modal-content" style="max-height:85vh; overflow-y:auto; padding: 0;">
                <div style="position: sticky; top: 0; background:#1c1c1e; padding: 20px; border-bottom:1px solid rgba(var(--glass-rgb),0.1); display:flex; justify-content:space-between; align-items:center; z-index: 10;">
                    <h2 style="margin:0;">Bacheca & Avvisi</h2>
                    <button onclick="closeModal()" style="background:none; border:none; color:var(--orange); font-weight:700; font-size:16px; cursor:pointer;">Chiudi</button>
                </div>
                <div style="padding: 20px; display:flex; flex-direction:column; gap:12px;">
                    ${dataBacheca.length===0?`<div style="text-align:center; padding: 40px; color: var(--text-secondary);">
                        <i class="ph ph-megaphone" style="font-size: 48px; opacity: 0.3; margin-bottom: 12px; display: block;"></i>
                        Nessun avviso in bacheca<br>
                        <span style="font-size: 12px; margin-top: 8px; display: block;">Scorri verso il basso dalla parte alta della schermata per aggiornare i dati.</span>
                   </div>`:dataBacheca.map(item=>{const data=item.data||item.date||item.datGiorno||"Data non disponibile",autore=item.autore||item.docente||"Docente",oggetto=item.oggetto||item.titolo||item.title||"Avviso",testo=item.testo||item.text||item.descrizione||item.description||"",url=item.url||item.allegato||null;return`
                                <div class="glass-list-item" style="border-left: 4px solid var(--orange); background: rgba(255, 159, 10, 0.08);">
                                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                        <div style="padding:4px 8px; background: rgba(255, 159, 10, 0.2); border-radius:6px; display:flex; gap:6px; align-items:center;">
                                            <i class="ph-fill ph-bell" style="color: var(--orange); font-size: 14px;"></i>
                                            <span style="font-size:11px; color:var(--warning); font-weight:700; text-transform:uppercase;">AVVISO</span>
                                       </div>
                                        <div style="font-size:12px; color:var(--text-secondary); font-weight:600;">
                                            ${data} \u2022 ${autore}
                                       </div>
                                   </div>
                                    <div style="font-weight:700; font-size:17px; margin-bottom:8px; color: white; line-height:1.3;">${oggetto}</div>
                                    ${testo?`<div style="font-size:14px; opacity:0.9; line-height:1.6; color:var(--outline-variant); margin-bottom: ${url?"8px":"0"}; white-space: pre-wrap;">${testo}</div>`:""}
                                    ${url?`<a href="${url}" target="_blank" style="margin-top:12px; background:rgba(37, 99, 235, 0.2); padding:8px 12px; border-radius:8px; border:1px solid rgba(37, 99, 235, 0.3); color:var(--info); font-size:13px; display:inline-flex; align-items:center; gap:6px; font-weight:600; text-decoration:none;">
                                        <i class="ph ph-paperclip"></i> Apri Allegato <i class="ph-bold ph-arrow-up-right" style="font-size:10px;"></i>
                                   </a>`:""}
                               </div>
                            `}).join("")}
                </div>
            </div>
           </div> `}function promptSetGoal(type){const currentGoal=state.goals?.[type]||8,options=[];for(let v=5;v<=10;v=Math.round((v+.5)*10)/10)options.push(v);const overlay=document.createElement("div");overlay.style.cssText="position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,0.35);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);display:flex;align-items:flex-end;justify-content:center;";const sheet=document.createElement("div");sheet.style.cssText="width:100%;max-width:480px;background:var(--surface-container-lowest);border-radius:32px 32px 0 0;padding:0 0 calc(28px + env(safe-area-inset-bottom,0px)) 0;box-shadow:0 -4px 24px rgba(0,0,0,0.10);font-family:Hanken Grotesk,sans-serif;transform:translateY(100%);transition:transform 0.28s cubic-bezier(0.2,0.8,0.2,1);",sheet.innerHTML=`
        <div style="display:flex;justify-content:center;padding:14px 0 6px;">
            <div style="width:40px;height:4px;border-radius:999px;background:var(--surface-container-high);"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 22px 16px;">
            <h2 style="margin:0;font-size:20px;font-weight:800;color:var(--on-surface);letter-spacing:-0.01em;">Obiettivo</h2>
            <button id="goal-close-btn" style="width:36px;height:36px;border-radius:50%;background:var(--surface-container-low);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;">
                <span class="material-symbols-outlined" style="font-size:18px;color:var(--on-surface-variant);">close</span>
            </button>
        </div>
        <div style="padding:0 22px 20px;">
            <p style="font-size:13px;color:var(--on-surface-variant);font-weight:500;margin:0 0 16px;">Seleziona la media che vuoi raggiungere in questa materia.</p>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
                ${options.map(v=>{const isActive=Math.abs(v-currentGoal)<.01;return`<button data-goal-val="${v}" style="padding:14px 8px;border-radius:16px;font-size:16px;font-weight:800;font-family:Hanken Grotesk,sans-serif;cursor:pointer;border:${isActive?"2px solid var(--primary)":"1.5px solid rgba(226,232,240,0.9)"};background:${isActive?"#2563eb":"white"};color:${isActive?"white":"#1e293b"};transition:all 0.12s ease;" ontouchstart="this.style.transform='scale(0.95)'" ontouchend="this.style.transform='scale(1)'">${v.toFixed(1)}</button>`}).join("")}
            </div>
        </div>
    `,overlay.appendChild(sheet),document.body.appendChild(overlay),requestAnimationFrame(()=>{sheet.style.transform="translateY(0)"});function closeSheet(){sheet.style.transform="translateY(100%)",setTimeout(()=>overlay.remove(),300)}overlay.addEventListener("click",e=>{e.target===overlay&&closeSheet()}),sheet.querySelector("#goal-close-btn").addEventListener("click",closeSheet),sheet.querySelectorAll("[data-goal-val]").forEach(btn=>{btn.addEventListener("click",()=>{const val=parseFloat(btn.dataset.goalVal);state.goals||(state.goals={}),state.goals[type]=val,localStorage.setItem(lsKey("goals"),JSON.stringify(state.goals)),closeSheet(),state._forceRender=!0,typeof scheduleRender=="function"&&scheduleRender(0)})})}function toggleVoiceInput(){}function promptAddBacklog(){showAddBacklogModal()}function showAddBacklogModal(){const container=getModalContainer();if(!container)return;const subjects=getAllSubjects();container.innerHTML=`
            <div class="modal-overlay active" onclick="closeModal(event)">
                <div class="modal-content glass-panel" onclick="event.stopPropagation()" style="max-width:420px; padding:24px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                        <h2 style="margin:0; font-size:18px; font-weight:800;">\u{1F4DA} Argomento Arretrato</h2>
                        <button onclick="closeModal()" style="background:none; border:none; color:var(--info); font-weight:700; cursor:pointer;">Chiudi</button>
                   </div>

                    <div style="display:flex; flex-direction:column; gap:16px;">
                        <div>
                            <label style="display:block; font-size:11px; font-weight:700; color:rgba(var(--glass-rgb),0.5); text-transform:uppercase; margin-bottom:6px;">Materia</label>
                            <select id="backlogSubject" style="width:100%; height:46px; background:rgba(0,0,0,0.3); border:1px solid rgba(var(--glass-rgb),0.15); border-radius:12px; color:white; padding:0 12px; font-size:14px; outline:none; appearance:none; -webkit-appearance:none;">
                                ${subjects.map(s=>`<option value="${s}" style="background:#1a1a2e;">${s}</option>`).join("")}
                           </select>
                       </div>

                        <div>
                            <label style="display:block; font-size:11px; font-weight:700; color:rgba(var(--glass-rgb),0.5); text-transform:uppercase; margin-bottom:6px;">Cosa devi recuperare?</label>
                            <input type="text" id="backlogTopic" placeholder="Es: Equazioni di 2\xB0 grado, Canto V Inferno..." style="width:100%; height:46px; background:rgba(0,0,0,0.3); border:1px solid rgba(var(--glass-rgb),0.15); border-radius:12px; color:white; padding:0 12px; font-size:14px; outline:none;">
                       </div>

                        <button onclick="submitBacklogForm()" style="width:100%; height:50px; background:var(--blue); color:white; border:none; border-radius:14px; font-size:16px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
                            <i class="ph-bold ph-check-circle"></i> Aggiungi Arretrato
                       </button>
                   </div>
               </div>
           </div>`}function renderVerifiche(){const exams=state.exams||[];return exams.sort((a,b)=>new Date(a.date)-new Date(b.date)),exams.length===0?`
                    <div class="view">
                        <h1 style="font-size: 28px; color: var(--text-primary); margin-bottom: 24px;">Verifiche</h1>
                        <div class="glass-panel" style="padding: 40px; text-align: center; display: flex; flex-direction: column; align-items: center;">
                            <div style="width: 64px; height: 64px; background: rgba(var(--glass-rgb),0.05); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
                                <i class="ph-bold ph-exam" style="font-size: 32px; color: var(--text-secondary);"></i>
                           </div>
                            <h3 style="font-size: 18px; color: var(--text-primary); margin-bottom: 8px;">Nessuna verifica</h3>
                            <p style="font-size: 15px; color: var(--text-secondary); margin-bottom: 24px;">Non hai verifiche in programma.</p>
                            <button onclick="promptAddExam()" class="btn-primary" style="padding: 12px 24px;">
                                <i class="ph-bold ph-plus"></i> Aggiungi Verifica
                           </button>
                       </div>
                   </div>`:`
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
                        ${exams.map((e,index)=>{const dateObj=new Date(e.date),dayName=dateObj.toLocaleDateString("it-IT",{weekday:"short"}),dayNum=dateObj.getDate(),monthName=dateObj.toLocaleDateString("it-IT",{month:"short"}),color=getSubjectColor(e.subject);return`
                            <div class="glass-panel" style="padding: 20px; display: flex; align-items: flex-start; gap: 16px;">
                                <div style="min-width: 50px; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(var(--glass-rgb),0.05); border-radius: 12px; padding: 10px 0; border: 1px solid rgba(var(--glass-rgb),0.05);">
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
                                    <p style="font-size: 14px; color: var(--text-secondary); line-height: 1.4;">${e.topic||"Nessun argomento specificato"}</p>
                               </div>
                           </div>
                            `}).join("")}
                   </div>
               </div>`}function renderRecoveries(){const backlog=state.backlog||[];return backlog.length===0?`
                    <div class="view">
                        <h1 style="font-size: 28px; color: var(--text-primary); margin-bottom: 24px;">Arretrati</h1>
                        <div class="glass-panel" style="padding: 40px; text-align: center; display: flex; flex-direction: column; align-items: center;">
                            <div style="width: 64px; height: 64px; background: rgba(var(--glass-rgb),0.05); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
                                <i class="ph-bold ph-check-fat" style="font-size: 32px; color: var(--green);"></i>
                           </div>
                            <h3 style="font-size: 18px; color: var(--text-primary); margin-bottom: 8px;">Tutto in ordine!</h3>
                            <p style="font-size: 15px; color: var(--text-secondary); margin-bottom: 24px;">Non hai argomenti da recuperare.</p>
                            <button onclick="promptAddBacklog()" class="btn-primary" style="padding: 12px 24px;">
                                <i class="ph-bold ph-plus"></i> Aggiungi Arretrato
                           </button>
                       </div>
                   </div>`:`
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
                        ${backlog.map((b,index)=>`
                            <div class="glass-panel" style="padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; gap: 16px;">
                                <div style="flex: 1; min-width: 0;">
                                    <div style="font-size: 11px; font-weight: 700; color: ${getSubjectColor(b.subject)}; text-transform: uppercase; margin-bottom: 4px;">${escapeHtml(b.subject)}</div>
                                    <div style="font-size: 15px; font-weight: 500; color: var(--text-primary); line-height: 1.3;">${escapeHtml(b.topic)}</div>
                               </div>
                                <button onclick="removeBacklog(${index})" style="width: 32px; height: 32px; border-radius: 50%; border: 1px solid rgba(var(--glass-rgb),0.1); background: rgba(var(--glass-rgb),0.05); color: var(--text-secondary); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s;">
                                    <i class="ph-bold ph-check"></i>
                               </button>
                           </div>
                        `).join("")}
                   </div>
               </div>`}window.openArgoLogin=function(){var modalContainer2=getModalContainer();if(!modalContainer2){console.error("[openArgoLogin] modal container non trovato");return}modalContainer2.innerHTML=`
        <div id="argo-login-backdrop"
             onclick="(typeof closeModal==='function'?closeModal(event):document.getElementById('modal-container').innerHTML='')"
             style="position:fixed;inset:0;z-index:99990;background:rgba(11,19,38,0.7);
                    backdrop-filter:blur(24px) saturate(180%);-webkit-backdrop-filter:blur(24px) saturate(180%);
                    display:flex;align-items:flex-end;justify-content:center;padding:0;
                    opacity:0;transition:opacity 0.22s ease;">
            <div onclick="event.stopPropagation()" id="argo-login-card"
                 style="width:100%;max-width:440px;background:rgba(23,31,51,0.95);
                        backdrop-filter:blur(40px) saturate(190%);-webkit-backdrop-filter:blur(40px) saturate(190%);
                        border:1px solid rgba(182,196,255,0.18);border-top:1px solid rgba(255,255,255,0.35);
                        border-radius:32px 32px 0 0;
                        padding:20px 24px calc(28px + env(safe-area-inset-bottom,0px));
                        box-shadow:0 -12px 48px -8px rgba(6,14,32,0.8), inset 0 1px 0 rgba(255,255,255,0.2);
                        transform:translateY(40px);transition:transform 0.26s cubic-bezier(0.16,1,0.3,1);font-family:'Inter',sans-serif;color:#dae2fd;">

                <!-- Drag Handle -->
                <div style="display:flex;justify-content:center;margin-bottom:16px;">
                    <div style="width:38px;height:4.5px;border-radius:999px;background:rgba(255,255,255,0.22);"></div>
                </div>

                <!-- Logo + Titolo -->
                <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px;">
                    <div style="width:48px;height:48px;border-radius:15px;overflow:hidden;flex-shrink:0;
                                background:rgba(37,99,235,0.2);border:1px solid rgba(182,196,255,0.25);
                                display:flex;align-items:center;justify-content:center;
                                box-shadow:0 6px 16px -4px rgba(37,99,235,0.4);">
                        <img src="gandhi-diary-icon-192.png" alt="Gandhi Diary"
                             onerror="this.src='gandhi-diary-icon-512.png'"
                             style="width:34px;height:34px;border-radius:10px;object-fit:cover;">
                    </div>
                    <div>
                        <div style="font-size:19px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;line-height:1.2;">Accedi con DidUP</div>
                        <div style="font-size:12px;color:#8e909f;font-weight:500;margin-top:2px;">Inserisci le credenziali del registro Argo</div>
                    </div>
                </div>

                <!-- Status server -->
                <div id="server-status"
                     style="margin-bottom:16px;font-size:11.5px;color:#30d158;font-weight:700;
                            display:flex;align-items:center;justify-content:center;gap:6px;
                            background:rgba(48,209,88,0.12);border:0.5px solid rgba(48,209,88,0.28);border-radius:12px;padding:8px 12px;">
                    <span style="width:6px;height:6px;background:#30d158;border-radius:50%;flex-shrink:0;box-shadow:0 0 6px #30d158;"></span>
                    Server DidUP online & pronto
                </div>

                <!-- Form Inputs -->
                <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:18px;">
                    <!-- Codice Scuola -->
                    <div style="position:relative;display:flex;align-items:center;">
                        <i class="ph-bold ph-buildings" style="position:absolute;left:14px;color:#8e909f;font-size:18px;pointer-events:none;"></i>
                        <input id="argo-school" placeholder="Codice Scuola (es. SG20925)" autocomplete="organization"
                               value="${(()=>{const s=localStorage.getItem("argo_school");return!s||s==="SG28499"||s==="SS19014"?"SG20925":s})()}"
                               style="height:48px;border-radius:14px;border:1px solid rgba(255,255,255,0.12);
                                      padding:0 14px 0 42px;font-size:14.5px;font-weight:600;
                                      background:rgba(255,255,255,0.05);color:#ffffff;
                                      font-family:'Inter',sans-serif;outline:none;width:100%;box-sizing:border-box;
                                      transition:border-color 0.15s ease, box-shadow 0.15s ease;"
                               onfocus="this.style.borderColor='#2563eb';this.style.boxShadow='0 0 12px rgba(37,99,235,0.35)';"
                               onblur="this.style.borderColor='rgba(255,255,255,0.12)';this.style.boxShadow='none';">
                    </div>

                    <!-- Nome Utente -->
                    <div style="position:relative;display:flex;align-items:center;">
                        <i class="ph-bold ph-user" style="position:absolute;left:14px;color:#8e909f;font-size:18px;pointer-events:none;"></i>
                        <input id="argo-user" placeholder="Nome Utente (es. s.cognome.1234)" autocomplete="username"
                               style="height:48px;border-radius:14px;border:1px solid rgba(255,255,255,0.12);
                                      padding:0 14px 0 42px;font-size:14.5px;font-weight:600;
                                      background:rgba(255,255,255,0.05);color:#ffffff;
                                      font-family:'Inter',sans-serif;outline:none;width:100%;box-sizing:border-box;
                                      transition:border-color 0.15s ease, box-shadow 0.15s ease;"
                               onfocus="this.style.borderColor='#2563eb';this.style.boxShadow='0 0 12px rgba(37,99,235,0.35)';"
                               onblur="this.style.borderColor='rgba(255,255,255,0.12)';this.style.boxShadow='none';">
                    </div>

                    <!-- Password + Eye toggle -->
                    <div style="position:relative;display:flex;align-items:center;">
                        <i class="ph-bold ph-lock-key" style="position:absolute;left:14px;color:#8e909f;font-size:18px;pointer-events:none;"></i>
                        <input id="argo-pass" type="password" placeholder="Password DidUP" autocomplete="current-password"
                               style="height:48px;border-radius:14px;border:1px solid rgba(255,255,255,0.12);
                                      padding:0 42px 0 42px;font-size:14.5px;font-weight:600;
                                      background:rgba(255,255,255,0.05);color:#ffffff;
                                      font-family:'Inter',sans-serif;outline:none;width:100%;box-sizing:border-box;
                                      transition:border-color 0.15s ease, box-shadow 0.15s ease;"
                               onfocus="this.style.borderColor='#2563eb';this.style.boxShadow='0 0 12px rgba(37,99,235,0.35)';"
                               onblur="this.style.borderColor='rgba(255,255,255,0.12)';this.style.boxShadow='none';"
                               onkeydown="if(event.key==='Enter'){if(typeof performArgoSync==='function')performArgoSync();}">
                        <button type="button" onclick="var p=document.getElementById('argo-pass');var ic=this.querySelector('i');if(p){if(p.type==='password'){p.type='text';ic.className='ph-bold ph-eye-slash';}else{p.type='password';ic.className='ph-bold ph-eye';}}"
                                style="position:absolute;right:10px;background:none;border:none;color:#8e909f;cursor:pointer;padding:6px;display:flex;align-items:center;justify-content:center;">
                            <i class="ph-bold ph-eye" style="font-size:18px;"></i>
                        </button>
                    </div>
                </div>

                <!-- Primary Submit Button -->
                <button id="login-btn"
                        onclick="if(typeof window.triggerHaptic==='function')window.triggerHaptic('medium');if(typeof performArgoSync==='function')performArgoSync();else console.error('performArgoSync non definita')"
                        style="width:100%;height:52px;border-radius:16px;border:none;cursor:pointer;
                               background:linear-gradient(135deg,#1d4ed8 0%,#2563eb 100%);color:#ffffff;
                               font-size:15.5px;font-weight:800;font-family:'Inter',sans-serif;
                               box-shadow:0 6px 24px -4px rgba(37,99,235,0.55), inset 0 1px 1px rgba(255,255,255,0.3);margin-bottom:10px;
                               display:flex;align-items:center;justify-content:center;gap:8px;transition:transform 0.12s ease;"
                        ontouchstart="this.style.transform='scale(0.98)'"
                        ontouchend="this.style.transform='scale(1)'">
                    <i class="ph-bold ph-sign-in" style="font-size:18px;"></i>
                    Accedi e Sincronizza
                </button>

                <!-- Cancel Button -->
                <button onclick="(typeof closeModal==='function'?closeModal():document.getElementById('modal-container').innerHTML='')"
                        style="width:100%;height:44px;border-radius:14px;border:1px solid rgba(255,255,255,0.1);cursor:pointer;
                               background:rgba(255,255,255,0.05);color:#8e909f;
                               font-size:13.5px;font-weight:700;font-family:'Inter',sans-serif;transition:transform 0.12s ease;"
                        ontouchstart="this.style.transform='scale(0.98)'"
                        ontouchend="this.style.transform='scale(1)'">
                    Annulla
                </button>
            </div>
        </div>`,requestAnimationFrame(function(){var bd=document.getElementById("argo-login-backdrop"),cd=document.getElementById("argo-login-card");bd&&(bd.style.opacity="1"),cd&&(cd.style.transform="translateY(0)")});try{typeof checkServerHealth=="function"&&checkServerHealth()}catch(err){console.warn("[openArgoLogin] checkServerHealth non disponibile:",err.message);var ss=document.getElementById("server-status");ss&&(ss.style.color="#30d158",ss.style.background="rgba(48,209,88,0.12)",ss.innerHTML='<span style="width:6px;height:6px;background:#30d158;border-radius:50%;flex-shrink:0;box-shadow:0 0 6px #30d158;"></span> Server pronto')}};function showProfileSelectionModal(profiles,credentials){const container=getModalContainer();if(!container)return;const profileCards=profiles.map(function(p){const initial=escapeHtml((p.name||"S")[0].toUpperCase()),name=escapeHtml(p.name||"Studente "+(p.index+1)),cls=escapeHtml(p.class||p.school||"");return`
        <button class="btn-profile" data-index="${p.index}"
            style="width:100%;display:flex;align-items:center;gap:14px;padding:14px 16px;
                   background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);
                   border-radius:20px;cursor:pointer;text-align:left;
                   -webkit-tap-highlight-color:transparent;
                   box-shadow:0 4px 16px -4px rgba(0,0,0,0.3);
                   transition:transform 0.12s ease, background 0.15s ease, border-color 0.15s ease;"
            ontouchstart="this.style.transform='scale(0.97)';this.style.background='rgba(37,99,235,0.15)';this.style.borderColor='rgba(37,99,235,0.4)';"
            ontouchend="this.style.transform='scale(1)';this.style.background='rgba(255,255,255,0.05)';this.style.borderColor='rgba(255,255,255,0.12)';">
            <!-- Student Avatar -->
            <div style="width:48px;height:48px;border-radius:15px;flex-shrink:0;
                        background:linear-gradient(135deg,#1d4ed8 0%,#2563eb 100%);
                        border:1px solid rgba(255,255,255,0.2);
                        display:flex;align-items:center;justify-content:center;
                        font-size:20px;font-weight:900;color:#ffffff;
                        box-shadow:0 4px 14px -2px rgba(37,99,235,0.5);">
                ${initial}
            </div>
            <!-- Info -->
            <div style="flex:1;min-width:0;">
                <div class="profile-name" style="font-size:15.5px;font-weight:800;color:#ffffff;
                            font-family:'Inter',sans-serif;letter-spacing:-0.01em;line-height:1.2;
                            white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</div>
                ${cls?`
                <div class="profile-class" style="display:inline-flex;align-items:center;gap:4px;margin-top:4px;
                            font-size:11px;font-weight:700;color:#b6c4ff;
                            background:rgba(37,99,235,0.2);border:0.5px solid rgba(182,196,255,0.25);
                            padding:1px 7px;border-radius:6px;">
                    <i class="ph-bold ph-graduation-cap" style="font-size:11px;"></i> ${cls}
                </div>`:""}
            </div>
            <i class="ph-bold ph-caret-right" style="font-size:18px;color:#8e909f;flex-shrink:0;"></i>
        </button>`}).join("");container.innerHTML=`
        <div id="psel-overlay"
             style="position:fixed;inset:0;z-index:99990;
                    background:rgba(11,19,38,0.7);
                    backdrop-filter:blur(24px) saturate(180%);-webkit-backdrop-filter:blur(24px) saturate(180%);
                    display:flex;align-items:flex-end;justify-content:center;
                    opacity:0;transition:opacity 0.22s ease;">

            <div id="psel-card"
                 style="width:100%;max-width:460px;
                        background:rgba(23,31,51,0.95);
                        backdrop-filter:blur(40px) saturate(190%);-webkit-backdrop-filter:blur(40px) saturate(190%);
                        border:1px solid rgba(182,196,255,0.18);border-top:1px solid rgba(255,255,255,0.35);
                        border-radius:32px 32px 0 0;
                        padding:0 22px calc(24px + env(safe-area-inset-bottom,0px)) 22px;
                        box-shadow:0 -12px 48px -8px rgba(6,14,32,0.8), inset 0 1px 0 rgba(255,255,255,0.2);
                        transform:translateY(40px);
                        transition:transform 0.26s cubic-bezier(0.16,1,0.3,1);font-family:'Inter',sans-serif;color:#dae2fd;">

                <!-- Drag Handle -->
                <div style="display:flex;justify-content:center;padding:14px 0 12px;">
                    <div style="width:38px;height:4.5px;border-radius:999px;background:rgba(255,255,255,0.22);"></div>
                </div>

                <!-- Header -->
                <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;">
                    <div style="width:46px;height:46px;border-radius:15px;overflow:hidden;flex-shrink:0;
                                background:rgba(37,99,235,0.2);border:1px solid rgba(182,196,255,0.25);
                                display:flex;align-items:center;justify-content:center;
                                box-shadow:0 4px 14px rgba(37,99,235,0.4);">
                        <i class="ph-fill ph-users-three" style="font-size:24px;color:#2997ff;"></i>
                    </div>
                    <div>
                        <div style="font-size:18px;font-weight:800;color:#ffffff;
                                    letter-spacing:-0.02em;line-height:1.2;">
                            Seleziona Profilo
                        </div>
                        <div style="font-size:12px;font-weight:500;color:#8e909f;margin-top:2px;">
                            Scegli quale studente visualizzare
                        </div>
                    </div>
                </div>

                <!-- Profiles List -->
                <div class="profiles-list" style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px;max-height:50vh;overflow-y:auto;">
                    ${profileCards}
                </div>

                <!-- Cancel Button -->
                <button onclick="var mc=document.getElementById('modal-container');if(typeof closeModal==='function')closeModal();else if(mc)mc.innerHTML='';"
                        style="width:100%;height:46px;border-radius:14px;border:1px solid rgba(255,255,255,0.1);cursor:pointer;
                               background:rgba(255,255,255,0.05);color:#8e909f;
                               font-size:13.5px;font-weight:700;font-family:'Inter',sans-serif;">
                    Annulla
                </button>

            </div>
        </div>`,requestAnimationFrame(function(){var ov=document.getElementById("psel-overlay"),cd=document.getElementById("psel-card");ov&&(ov.style.opacity="1"),cd&&(cd.style.transform="translateY(0)")});var overlay=document.getElementById("psel-overlay");overlay&&overlay.addEventListener("click",function(e){e.target===overlay&&(overlay.style.opacity="0",setTimeout(function(){container.innerHTML=""},180))});var list=container.querySelector(".profiles-list");list&&(list.addEventListener("click",async function(ev){var btn=ev.target.closest(".btn-profile");if(btn){var selectedName=btn.querySelector(".profile-name")?btn.querySelector(".profile-name").textContent:"Studente",card=document.getElementById("psel-card");card&&(card.innerHTML=`
                <div style="display:flex;flex-direction:column;align-items:center;
                            justify-content:center;padding:52px 24px;gap:18px;text-align:center;">
                    <div style="width:54px;height:54px;border-radius:50%;
                                border:3.5px solid rgba(37,99,235,0.2);
                                border-top-color:#2563eb;
                                animation:spin 0.8s cubic-bezier(0.4,0,0.2,1) infinite;
                                box-shadow:0 0 16px rgba(37,99,235,0.4);"></div>
                    <div>
                        <div style="font-size:17px;font-weight:800;color:#ffffff;
                                    letter-spacing:-0.01em;margin-bottom:4px;">
                            Caricamento profilo
                        </div>
                        <div style="font-size:13.5px;color:#b6c4ff;font-weight:600;">
                            ${escapeHtml(selectedName)}
                        </div>
                    </div>
                    <div style="font-size:11.5px;font-weight:700;color:#8e909f;
                                text-transform:uppercase;letter-spacing:0.08em;">
                        Sincronizzazione in corso\u2026
                    </div>
                </div>`),await selectProfile(parseInt(btn.dataset.index,10),credentials)}},{once:!0}),typeof resolveProfileNamesAsync=="function"&&resolveProfileNamesAsync(profiles,credentials,container))}function setLoginBtnText(txt){const btn=document.getElementById("login-btn")||document.querySelector(".login-btn")||document.querySelector("#loginBtn")||document.querySelector('button[onclick*="performArgoSync"]')||document.querySelector('button[type="submit"]');btn&&(btn.innerText=txt,btn.disabled=/\.\.\.|Connessione|Sincronizzazione/.test(txt))}function toggleTask(id,event2){event2?.stopPropagation();let t=state.tasks.find(x=>x.id===id);if(t||(t=state.reminders.find(x=>x.id===id)),t){t.done=!t.done,saveTasks(),state.reminders&&state.reminders.find(x=>x.id===id)&&localStorage.setItem(lsKey("reminders"),JSON.stringify(state.reminders)),document.querySelectorAll(`[data-task-toggle="${id}"]`).forEach(cb=>{cb.closest(".planner-content")||cb.closest("#weekly-agenda-list")?(cb.style.borderColor=t.done?"var(--on-surface)":"var(--outline-variant)",cb.style.background=t.done?"var(--on-surface)":"transparent",cb.innerHTML=t.done?'<i class="ph-bold ph-check" style="font-size:14px; color:#fff;"></i>':""):(cb.style.borderColor=t.done?"var(--on-surface)":"var(--outline-variant)",cb.style.background=t.done?"var(--on-surface)":"var(--surface-container-lowest)",cb.innerHTML=t.done?'<svg width="8" height="5" viewBox="0 0 8 5"><path d="M1 2.5L3 4.5L7 1" stroke="white" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>':""),cb.style.transform="scale(0.85)",setTimeout(()=>{cb.style.transform="scale(1)"},120)}),document.querySelectorAll(`[data-task-text="${id}"]`).forEach(el=>{el.style.textDecoration=t.done?"line-through":"none",el.style.opacity=t.done?"0.5":"1",el.style.color=t.done?"var(--on-surface-variant)":""}),updatePlanTaskUI(id,t.done);const calendarEl=document.getElementById("calendar");if(calendarEl&&calendarEl._fullCalendar&&syncCalendarEvents(calendarEl._fullCalendar),state.view==="planner"&&typeof renderCustomCalendar=="function"&&renderCustomCalendar(),state.view==="planner"){const agendaEl=document.getElementById("weekly-agenda-list");if(agendaEl){const newContent=renderWeeklyAgenda(),temp=document.createElement("div");temp.innerHTML=newContent;const newList=temp.querySelector("#weekly-agenda-list");newList&&(agendaEl.innerHTML=newList.innerHTML)}}const badge=document.querySelector("[data-completed-badge]");if(badge){const todayTasks=state.tasks.filter(t2=>{if(!t2.dateObj)return!1;const today=new Date;today.setHours(0,0,0,0);const d=new Date(t2.dateObj);return d.setHours(0,0,0,0),d.getTime()===today.getTime()}),completedToday=todayTasks.filter(t2=>t2.done).length;badge.textContent=`${completedToday}/${todayTasks.length}`}state.view==="home"&&typeof updateHomeView=="function"&&updateHomeView()}}function showQuickAddTaskModal(...args){const current=ClientRuntime.capture();return window.loadFrontendFeature("modals").then(()=>{if(current())return window.showQuickAddTaskModal(...args)}).catch(()=>{})}function showAddRegistroTaskModal(...args){const current=ClientRuntime.capture();return window.loadFrontendFeature("modals").then(()=>{if(current())return window.showAddRegistroTaskModal(...args)}).catch(()=>{})}window.selectRegistroTipo=function(tipo){window._registroTipo=tipo;const btnSc=document.getElementById("tipo-scritta"),btnOr=document.getElementById("tipo-orale");btnSc&&btnOr&&(tipo==="scritta"?(btnSc.style.cssText="padding:14px; border-radius:14px; border:2px solid var(--on-surface); background:#141414; color:#FFF; font-family:JetBrains Mono,monospace; font-size:12px; font-weight:800; text-transform:uppercase; cursor:pointer; transition:all 0.2s;",btnOr.style.cssText="padding:14px; border-radius:14px; border:1px solid var(--outline-variant); background:var(--surface-container-low); color:var(--on-surface); font-family:JetBrains Mono,monospace; font-size:12px; font-weight:800; text-transform:uppercase; cursor:pointer; transition:all 0.2s;"):(btnOr.style.cssText="padding:14px; border-radius:14px; border:2px solid var(--on-surface); background:#141414; color:#FFF; font-family:JetBrains Mono,monospace; font-size:12px; font-weight:800; text-transform:uppercase; cursor:pointer; transition:all 0.2s;",btnSc.style.cssText="padding:14px; border-radius:14px; border:1px solid var(--outline-variant); background:var(--surface-container-low); color:var(--on-surface); font-family:JetBrains Mono,monospace; font-size:12px; font-weight:800; text-transform:uppercase; cursor:pointer; transition:all 0.2s;"))};function showCompetencyInputModal(...args){const current=ClientRuntime.capture();return window.loadFrontendFeature("modals").then(()=>{if(current())return window.showCompetencyInputModal(...args)}).catch(()=>{})}function showOrganizeStudyModal(){const todayStr=getLocalDateString(getSchoolDate()),plannedIds=state.plannedTasks[todayStr]||[],allPendingTasks=state.tasks.filter(t=>!t.done);modalContainer.innerHTML=`
            <div class="modal-overlay active" onclick="closeModal(event)">
                <div class="modal-content glass-panel" onclick="event.stopPropagation()" style="max-width: 450px; padding: 30px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                        <h2 style="margin:0; font-size: 24px;">Cosa fai oggi?</h2>
                        <i class="ph ph-x" onclick="closeModal()" style="cursor:pointer; font-size: 28px; opacity: 0.6;"></i>
                    </div>
                    <p style="font-size: 15px; opacity: 0.8; margin-bottom: 24px; line-height: 1.5;">Seleziona i compiti che vuoi affrontare oggi.</p>
                    
                    <div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 30px; max-height: 450px; overflow-y: auto;">
                        ${allPendingTasks.length>0?allPendingTasks.map(t=>{const isPlanned=plannedIds.includes(t.id),subjectColor=getSubjectColor(t.subject);return`
                                <div class="glass-list-item" style="padding: 18px; display: flex; align-items: center; gap: 16px; cursor: pointer; border-left: 4px solid ${isPlanned?"var(--green)":"rgba(var(--glass-rgb),0.05)"}; background: ${isPlanned?"rgba(48, 209, 88, 0.08)":"rgba(var(--glass-rgb),0.03)"};" onclick="togglePlanTask('${t.id}')">
                                    <div class="plan-checkbox ${isPlanned?"checked":""}" style="width: 28px; height: 28px; border-radius: 8px; background: ${isPlanned?"var(--green)":"transparent"}; border: 2px solid ${isPlanned?"var(--green)":"rgba(var(--glass-rgb),0.2)"}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                        ${isPlanned?'<i class="ph-bold ph-check" style="font-size: 16px; color: black;"></i>':""}
                                    </div>
                                    <div style="flex: 1; min-width: 0;">
                                        <div style="font-weight: 700; font-size: 16px; color: white;">${escapeHtml(t.text)}</div>
                                        <div style="font-size: 12px; color: ${subjectColor}; font-weight: 800; text-transform: uppercase;">${escapeHtml(t.subject)}</div>
                                    </div>
                                </div>
                            `}).join(""):'<div style="text-align: center; opacity: 0.5; padding: 40px;">Nessun compito in sospeso.</div>'}
                    </div>
                    <button onclick="closeModal()" class="btn-primary" style="width: 100%; padding: 16px; font-size: 16px; font-weight: 700;">Salva Agenda</button>
                </div>
            </div>
        `}function closePlannerDropdown(){const menu=document.getElementById("planner-cloud-menu"),btn=document.getElementById("planner-cloud-btn");menu&&menu.classList.remove("active"),btn&&(btn.classList.remove("active"),btn.setAttribute("aria-expanded","false")),window._plannerMenuCloseHandler&&(document.removeEventListener("pointerdown",window._plannerMenuCloseHandler),window._plannerMenuCloseHandler=null)}window.closePlannerDropdown=closePlannerDropdown;function togglePlannerMenu(event2){typeof event2<"u"&&event2?.stopPropagation();const menu=document.getElementById("planner-cloud-menu"),btn=document.getElementById("planner-cloud-btn")||(typeof event2<"u"?event2?.currentTarget||event2?.target?.closest("button"):null);if(!menu||!btn)return;if(menu.classList.contains("active"))closePlannerDropdown();else{menu.classList.add("active"),btn.classList.add("active"),btn.setAttribute("aria-expanded","true");const closeHandler=e=>{!menu.contains(e.target)&&!btn.contains(e.target)&&closePlannerDropdown()};window._plannerMenuCloseHandler=closeHandler,setTimeout(()=>{document.addEventListener("pointerdown",closeHandler)},10)}}function showTasksBySubjectModal(){const subjects=[...new Set(state.tasks.map(t=>t.subject))].sort();modalContainer.innerHTML=`
            <div class="modal-overlay active" onclick="closeModal(event)">
                <div class="modal-content glass-panel" onclick="event.stopPropagation()" style="max-width: 500px; padding: 24px; max-height: 85vh; overflow-y: auto;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                        <h2 style="margin:0;">Compiti per Materia</h2>
                        <i class="ph ph-x" onclick="closeModal()" style="cursor:pointer; font-size: 24px;"></i>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 24px;">
                        ${subjects.map(s=>{const subjectTasks=state.tasks.filter(t=>t.subject===s),color=getSubjectColor(s);return`
                                <div style="border-left: 4px solid ${color}; padding-left: 16px;">
                                    <h3 style="color: ${color}; text-transform: uppercase; font-size: 14px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
                                        <i class="ph-fill ph-book-open"></i> ${s}
                                        <span style="font-size: 10px; padding: 2px 8px; border-radius: 20px; font-weight: 800; border: 1px solid ${color}40;">${subjectTasks.length}</span>
                                    </h3>
                                    <div style="display: flex; flex-direction: column; gap: 10px;">
                                        ${subjectTasks.map(t=>`
                                            <div class="glass-list-item" style="padding: 12px; display: flex; align-items: center; gap: 12px; background: rgba(var(--glass-rgb),0.03);">
                                                <div class="task-checkbox ${t.done?"checked":""}" style="width: 18px; height: 18px; border: 2px solid ${t.done?"var(--green)":"rgba(var(--glass-rgb),0.2)"}; border-radius: 5px; background: ${t.done?"var(--green)":"transparent"}; display: flex; align-items: center; justify-content: center;">
                                                    ${t.done?'<i class="ph-bold ph-check" style="font-size: 10px; color: black;"></i>':""}
                                                </div>
                                                <div style="flex: 1;">
                                                    <div style="font-size: 14px; font-weight: 600; color: white; ${t.done?"opacity: 0.5; text-decoration: line-through;":""}">${escapeHtml(t.text)}</div>
                                                    <div style="font-size: 10px; opacity: 0.5;">${t.display_date}</div>
                                                </div>
                                            </div>
                                        `).join("")}
                                    </div>
                                </div>
                            `}).join("")}
                    </div>
                    <button onclick="closeModal()" class="btn-primary" style="margin-top: 30px; width: 100%;">Chiudi</button>
                </div>
            </div>
        `}function togglePlanTask(id){typeof event<"u"&&event?.stopPropagation();const todayStr=getLocalDateString(getSchoolDate());state.plannedTasks[todayStr]||(state.plannedTasks[todayStr]=[]);const index=state.plannedTasks[todayStr].indexOf(id);index>-1?state.plannedTasks[todayStr].splice(index,1):state.plannedTasks[todayStr].push(id),saveTasks(),updatePlanTaskUI(id,state.plannedTasks[todayStr].includes(id)),notifyPlannerChanged()}function updateTaskUI(taskId,isDone){const checkbox=document.querySelector(`[data-task-toggle="${taskId}"]`),taskText=document.querySelector(`[data-task-text="${taskId}"]`);checkbox&&(checkbox.style.transition="all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",isDone?(checkbox.style.background="var(--green, #30D158)",checkbox.style.borderColor="var(--green, #30D158)",checkbox.innerHTML='<i class="ph-bold ph-check" style="font-size: 10px; color: black;"></i>'):(checkbox.style.background="transparent",checkbox.style.borderColor="rgba(var(--glass-rgb),0.2)",checkbox.innerHTML=""),checkbox.style.transform="scale(0.85) translateZ(0)",requestAnimationFrame(()=>{setTimeout(()=>{checkbox.style.transform="scale(1) translateZ(0)"},50)})),taskText&&(taskText.style.transition="all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",isDone?(taskText.style.opacity="0.5",taskText.style.textDecoration="line-through"):(taskText.style.opacity="1",taskText.style.textDecoration="none"))}function updateMediaWidget(value){}function initHomeWidgets({mediaValue=7.64}={}){}function togglePollCreatorUI(){const ui=document.getElementById("poll-creator-ui");ui&&(ui.style.display=ui.style.display==="none"||ui.style.display===""?"block":"none")}document.addEventListener("animationend",e=>{(e.target.classList.contains("view")||e.target.classList.contains("hero-container")||e.target.classList.contains("greeting-card"))&&e.target.classList.add("anim-done")},!0),(function(){const safeBind=(name,fn)=>{typeof window[name]!="function"&&(window[name]=fn)};safeBind("showProfileActions",function(){try{if(typeof closeModal!="function"||typeof getModalContainer!="function")return;const container=getModalContainer();if(!container)return;container.innerHTML=`
                <div class="modal-overlay active" onclick="closeModal(event)">
                  <div class="modal-content" onclick="event.stopPropagation()" style="width: 100%; max-width: 360px; padding: 16px; border-radius: 20px; background:var(--surface-container-lowest); box-shadow: 0 20px 40px rgba(0,0,0,0.2);">
                    <div style="font-size: 18px; font-weight: 800; color: var(--text-primary); margin-bottom: 12px;">Profilo</div>
                    <p style="font-size: 14px; color: var(--text-secondary); margin-bottom: 20px;">Sessione caricata parzialmente. Riprova a navigare nel profilo.</p>
                    <button onclick="closeModal(); if(window.navigate) navigate('profile')" class="btn-primary" style="width:100%; margin-bottom:8px; border-radius: 12px; height: 48px; font-weight: 700;">Apri profilo</button>
                    <button onclick="if(window.logout) logout()" style="width: 100%; height: 48px; border-radius: 12px; border: none; background: rgba(239, 68, 68, 0.05); color: var(--red); font-weight: 800; cursor: pointer;">Esci</button>
                  </div>
                </div>`}catch(e){console.error("showProfileActions fallback error",e)}}),safeBind("isFutureOrToday",function(dateStr){if(!dateStr)return!1;const today=typeof getLocalDateString=="function"?getLocalDateString(new Date):new Date().toISOString().slice(0,10);return String(dateStr)>=today})})(),window.allowedViews=["home","planner","voti","academic_profile","profile","circolari"],window.currentViewFromHash=function(){const v=(location.hash||"").replace("#","").trim();return window.allowedViews.includes(v)?v:null};let _lastRenderTime=0;const RENDER_MIN_GAP=50;window._gRenderRAF=null,window._gRenderTimer=null,window.render=function(){if(!(!window.state||state.booting||state._loggedOut&&state.view!=="login")){if(window.__fluidityIsBfcacheSuppressed?.()){window.scheduleRender(220);return}window._gRenderRAF||(window._gRenderRAF=requestAnimationFrame(()=>{try{window._renderCore()}finally{window._gRenderRAF=null}}))}},window.scheduleRender=function(delay=80){clearTimeout(window._gRenderTimer),window._gRenderTimer=setTimeout(window.render,Math.max(0,delay))};let _lastRenderedView=null,_lastRenderedLoggedIn=null,_lastRenderedTaskCount=-1,_lastRenderedVotiCount=-1;window._renderCore=function(){if(state._loggedOut&&state.view!=="login")return;const root=document.getElementById("app"),nav=document.getElementById("nav-container");if(!root||!nav)return;if(!state.isLoggedIn){if(_lastRenderedLoggedIn===!1)return;_lastRenderedLoggedIn=!1,_lastRenderedView="login",document.body.classList.add("logged-out"),root.innerHTML=renderLogin(),nav.innerHTML="";return}_lastRenderedLoggedIn=!0,_lastRenderedView=state.view,state._forceRender=!1,document.body.classList.remove("logged-out"),nav.innerHTML=renderNav(),document.body.style.overflow="",document.body.style.height="",root.style.overflow="visible",root.style.height="";let html="";switch(state.view){case"home":html=renderHome();break;case"planner":html=renderPlanner();break;case"voti":html=renderGradesView();break;case"academic_profile":html=renderAcademicProfile();break;case"profile":html=renderProfile();break;case"circolari":html=typeof renderCircolariView=="function"?renderCircolariView():renderHome();break;default:html=renderHome();break}root.innerHTML=html,state._scrollTopAfterRender&&(window.scrollTo({top:0,behavior:"auto"}),state._scrollTopAfterRender=!1),typeof updateOfflineBadge=="function"&&updateOfflineBadge(),requestAnimationFrame(()=>{const viewEl=root.firstElementChild||root;if(typeof window.setupLargeHeaderScroll=="function"&&window.setupLargeHeaderScroll(viewEl),state.view==="home"){const mediaVal=parseFloat(calcolaMedia(state.voti))||0;typeof renderMediaGauge=="function"&&void 0}if(state.view==="planner"){typeof renderCustomCalendar=="function"&&renderCustomCalendar();const doScroll=()=>{if(typeof window._scrollPlannerToActiveWeek=="function")window._scrollPlannerToActiveWeek();else{const _pc=document.getElementById("planner-week-carousel");if(_pc){const w=_pc.clientWidth||_pc.offsetWidth||window.innerWidth,idx=window._plannerInitialSlide!==void 0?window._plannerInitialSlide:2;_pc.scrollLeft=idx*w}}};doScroll(),requestAnimationFrame(doScroll),setTimeout(doScroll,30),setTimeout(doScroll,120)}state.view==="voti"&&typeof initGradesCharts=="function"&&initGradesCharts(),state.view==="voti"&&typeof mountSubjectTrendChartFromDom=="function"&&mountSubjectTrendChartFromDom(),typeof gsapAnimateView=="function"&&gsapAnimateView(),window.removeLoader&&window.removeLoader(),typeof lucide<"u"&&lucide.createIcons()})},window.removeLoader=function(){const loader=document.getElementById("app-loader");loader&&(loader.style.transition="opacity 0.5s ease",loader.style.opacity="0",setTimeout(()=>loader.remove(),500))},window.handleLogoutPrompt=function(){try{typeof window.triggerHaptic=="function"&&window.triggerHaptic("medium")}catch{}confirm("Sei sicuro di voler uscire dall'account?")&&typeof window.logout=="function"&&window.logout(!0)},window.logout=async function(skipConfirm=!1){if(!skipConfirm&&!confirm("Sei sicuro di voler uscire dall'account?"))return;const logoutUser=getUserId();if(logoutUser&&logoutUser!=="guest")try{window.saveTasksToSupabase&&await window.saveTasksToSupabase(),window.PushSettings&&await window.PushSettings.detach();const response=await fetchWithDeadline(`${API_BASE_URL}/api/auth?action=logout`,{method:"POST",headers:getSessionHeaders(),body:JSON.stringify({userId:logoutUser}),signal:AbortSignal.timeout(15e3)});if(!response.ok&&response.status!==403)throw new Error("Revoca sessione non riuscita")}catch{typeof window.showToast=="function"&&window.showToast("Connessione necessaria per uscire in sicurezza. Riprova.","warning");return}clearInterval(window._classPollTimer),ClientRuntime.invalidate(),state._loggedOut=!0,state.isLoggedIn=!1,state.view="login",typeof gsap<"u"&&gsap.killTweensOf("*");const currentUserId=getUserId(),currentLsPrefix=getActiveProfileKey();currentUserId&&currentUserId!=="guest"&&(localStorage.setItem(`${currentLsPrefix}:planned_tasks`,JSON.stringify(state.plannedTasks||{})),localStorage.setItem(`${currentLsPrefix}:planner_updated_at`,new Date().toISOString())),sessionManager.clear(),window._argoPasswordRuntime=null;try{sessionStorage.removeItem("_argo_pwd_session")}catch{}supabaseClient&&supabaseClient.auth&&supabaseClient.auth.signOut().catch(e=>console.warn("[Logout] Supabase signOut failed:",e)),state.booting=!1,state.syncing=!1,state.didup.connected=!1,state.didup.stale=!1,state.didup.lastSuccessTs=0,state.user={name:"",class:""},state.tasks=[],state.voti=[],state.promemoria=[],state.isOffline=!1,state.lastSync=null,state.plannedTasks={},window._bootRenderedOnce=!1,window._threadsPoller&&clearInterval(window._threadsPoller),clearTimeout(window._gRenderTimer),window._gRenderTimer=null,window._gRenderRAF&&(cancelAnimationFrame(window._gRenderRAF),window._gRenderRAF=null),state.view="login",window.location.hash!=="#login"&&window.history.replaceState(null,"","#login");const _logoutAppRoot=document.getElementById("app"),_logoutNav=document.getElementById("nav-container"),forceLoginRender=()=>{_logoutAppRoot&&(document.body.classList.add("logged-out"),document.body.classList.remove("is-ai-mode"),document.body.style.overflow="",document.body.style.height="",_logoutAppRoot.style.overflow="visible",_logoutAppRoot.style.height="",_logoutAppRoot.innerHTML=typeof renderLogin=="function"?renderLogin():""),_logoutNav&&(_logoutNav.innerHTML="")};if(forceLoginRender(),_logoutAppRoot){const observer=new MutationObserver(mutations=>{state._loggedOut&&!_logoutAppRoot.querySelector(".login-container")&&(console.warn("[Guard] Detected unathorized DOM write post-logout, reverting to login..."),forceLoginRender())});observer.observe(_logoutAppRoot,{childList:!0,subtree:!0}),setTimeout(()=>{observer.disconnect(),state._loggedOut=!1},1e3)}_lastRenderedLoggedIn=!1,_lastRenderedView="login"},window.saveProfileToServer=async function(profileData){const isCurrent=ClientRuntime.capture(),response=await fetchWithDeadline(`${API_BASE_URL}/api/profile`,{method:"PUT",headers:getSessionHeaders(),body:JSON.stringify({userId:getUserId(),...profileData})}),result=await response.json();if(!isCurrent())throw new Error("Il profilo attivo \xE8 cambiato.");if(!response.ok||result.success===!1)throw new Error(result.error||"Salvataggio profilo non riuscito");return result},window.saveProfileChanges=async function(){const newNameInput=document.getElementById("edit-user-name");if(!newNameInput)return;const newName=newNameInput.value.trim();if(!newName)return alert("Inserisci almeno il nome");try{typeof showBoot=="function"&&showBoot("Salvataggio profilo..."),await window.saveProfileToServer({name:newName}),state.user.name=newName,localStorage.setItem(lsKey("user"),JSON.stringify(state.user)),closeModal(),window.scheduleRender(),typeof hideBoot=="function"&&hideBoot()}catch(error){typeof hideBoot=="function"&&hideBoot(),alert("\u274C Errore durante il salvataggio: "+error.message)}};const MOTIVATIONAL_QUOTES=["Il successo \xE8 la somma di piccoli sforzi, ripetuti giorno dopo giorno.","There is no tomorrow","No risk, no story","Non contare i giorni, fai in modo che i giorni contino.","La perseveranza batte il talento quando il talento non persevera.","L'unico modo per fare un ottimo lavoro \xE8 amare quello che fai.","Il fallimento \xE8 solo l'opportunit\xE0 di iniziare di nuovo con pi\xF9 intelligenza.","Il miglior momento per piantare un albero era 20 anni fa. Il secondo miglior momento \xE8 ora.","Non importa quanto vai piano, l'importante \xE8 che non ti fermi.","La tua unica limitazione \xE8 la tua immaginazione.","Fai oggi ci\xF2 che gli altri non faranno, cos\xEC domani potrai fare ci\xF2 che gli altri non potranno.","La disciplina \xE8 fare ci\xF2 che va fatto, quando va fatto, anche se non ne hai voglia.","Ogni grande traguardo inizia con la decisione di provare.","Le difficolt\xE0 spesso preparano le persone comuni a un destino straordinario.","La motivazione ti d\xE0 la spinta, l'abitudine ti fa andare avanti.","Credi in te stesso e sarai a met\xE0 strada.","Se puoi sognarlo, puoi farlo.","Il successo non \xE8 definitivo, il fallimento non \xE8 fatale: ci\xF2 che conta \xE8 il coraggio di continuare.","Punta alla luna. Anche se sbagli, atterrerai tra le stelle.","Non aspettare che le condizioni siano perfette. Inizia dove sei, usa quello che hai, fai quello che puoi.","La tua mente \xE8 la tua risorsa pi\xF9 preziosa. Coltivala.","Ogni errore \xE8 una lezione appresa sul cammino verso il successo.","La pazienza \xE8 amara, ma il suo frutto \xE8 dolce.","Sogna in grande, lavora sodo, rimani umile.","Non smettere mai di imparare, perch\xE9 la vita non smette mai di insegnare.","Il segreto per andare avanti \xE8 iniziare.","La qualit\xE0 non \xE8 un atto, \xE8 un'abitudine.","Sii il cambiamento che vuoi vedere nel mondo.","Non paragonare il tuo inizio con la met\xE0 del film di qualcun altro.","Colui che sposta una montagna inizia portando via piccole pietre.","Il futuro appartiene a coloro che credono nella bellezza dei propri sogni.","La felicit\xE0 non \xE8 qualcosa di pronto all'uso. Viene dalle tue stesse azioni.","L'ostacolo \xE8 la via.","Rimani concentrato sui tuoi obiettivi, non sulle distrazioni.","Ogni giorno \xE8 una nuova opportunit\xE0 per migliorare.","La forza non deriva dalla capacit\xE0 fisica, ma da una volont\xE0 indomita.","Non fermarti quando sei stanco. Fermati quando hai finito.","L'eccellenza non si ottiene in un giorno, ma attraverso la costanza.","Trasforma le tue ferite in saggezza.","La vita \xE8 per il 10% cosa ti accade e per il 90% come reagisci.","Se vuoi qualcosa che non hai mai avuto, devi fare qualcosa che non hai mai fatto.","Agisci come se quello che fai facesse la differenza. La fa.","Non guardare l'orologio; fai quello che fa lui. Continua ad andare.","La tua velocit\xE0 non conta finch\xE9 non smetti di muoverti.","Il successo \xE8 camminare da un fallimento all'altro senza perdere l'entusiasmo.","Le persone che hanno successo sono quelle che si alzano e cercano le circostanze che vogliono.","Credere di poterlo fare \xE8 gi\xE0 met\xE0 del lavoro.","Non lasciare che ieri occupi troppo di oggi.","Se non ora, quando?","L'unico limite ai nostri traguardi di domani saranno i nostri dubbi di oggi.","Fai del tuo meglio, e il resto verr\xE0 da s\xE9.","Sii orgoglioso di quanto sei arrivato lontano. Abbi fede in quanto lontano puoi andare."];window.getDailyQuote=function(){const todayStr=getLocalDateString();try{const cached=JSON.parse(localStorage.getItem("mh_daily_quote")||"{}");if(cached.quote&&cached.date===todayStr)return cached.quote}catch{}const randomQuote=MOTIVATIONAL_QUOTES[Math.floor(Math.random()*MOTIVATIONAL_QUOTES.length)];return localStorage.setItem("mh_daily_quote",JSON.stringify({quote:randomQuote,date:todayStr})),randomQuote},window.refreshDailyQuote=async function(btn){if(btn){const icon=btn.querySelector("i");icon&&(icon.style.transform="rotate(360deg)"),btn.style.opacity="0.3"}const todayStr=getLocalDateString(),currentQuote=window.getDailyQuote();let newQuote=currentQuote;for(let i=0;i<5&&(newQuote=MOTIVATIONAL_QUOTES[Math.floor(Math.random()*MOTIVATIONAL_QUOTES.length)],newQuote===currentQuote);i++);if(localStorage.setItem("mh_daily_quote",JSON.stringify({quote:newQuote,date:todayStr})),await new Promise(r=>setTimeout(r,400)),btn){const icon=btn.querySelector("i");icon&&(icon.style.transform="rotate(0deg)"),btn.style.opacity="0.6"}window.scheduleRender(0)},window.handleManualOwaResyncClick=function(event2){typeof event2<"u"&&event2&&typeof event2.stopPropagation=="function"&&event2.stopPropagation(),confirm("Eseguire un resync manuale completo dei dati OWA?")&&typeof window.runManualOwaResync=="function"&&window.runManualOwaResync()},window.refreshCircolari=function(){typeof showToast=="function"&&showToast("Aggiornamento circolari..."),typeof loadCircolari=="function"&&loadCircolari()},window.requestCircularSynthesis=async function(id,link){return typeof window._circ_startSintesi=="function"?window._circ_startSintesi(id,link):window.loadCircolareSintesi(id,link)},window.renderSafeMarkdown=function(md){if(!md)return"";try{let rawHtml=typeof marked<"u"?marked.parse(String(md)):escapeHtml(md);return typeof window.DOMPurify<"u"&&typeof window.DOMPurify.sanitize=="function"?window.DOMPurify.sanitize(rawHtml,{ALLOWED_TAGS:["p","b","i","em","strong","a","ul","ol","li","br","hr","h1","h2","h3","h4","h5","h6","blockquote","code","pre","span"],ALLOWED_ATTR:["href","target","rel","class","style"]}):escapeHtml(md)}catch{return escapeHtml(md)}},window.ensureMarked=function(){return new Promise((resolve,reject)=>{if(typeof marked<"u")return resolve();const script=document.createElement("script");script.src="https://cdn.jsdelivr.net/npm/marked@14.1.2/marked.min.js",script.onload=resolve,script.onerror=reject,document.head.appendChild(script)})},window.loadCircolareSintesi=async function(id,link){try{console.log(`[Network] Sintesi Request: ${id}`);let session=null;try{if(typeof sessionManager<"u"&&sessionManager.load)session=sessionManager.load();else if(typeof window.sessionManager<"u"&&window.sessionManager.load)session=window.sessionManager.load();else{const raw=localStorage.getItem("argo_session");raw&&(session=JSON.parse(raw))}}catch{}const sessionToken=typeof state<"u"&&state.sessionToken||session&&session.sessionToken||"",resolvedUserId=typeof window.getUserId=="function"?window.getUserId():session&&(session.studentId||session.userId||session.pid)||state&&state.user&&state.user.id||"",headers={"Content-Type":"application/json"};sessionToken&&(headers["x-session-token"]=sessionToken),resolvedUserId&&(headers["x-user-id"]=resolvedUserId);const data=await(await fetchWithDeadline(`${API_BASE_URL}/api/circolari/sintesi`,{method:"POST",headers,body:JSON.stringify({id,link,userId:resolvedUserId})})).json();if(data.success&&data.sintesi){const circolare=typeof state<"u"&&state.circolari?state.circolari.find(c=>c.id===id):null;return circolare&&(circolare.sintesi=data.sintesi),{success:!0,sintesi:data.sintesi}}else return{success:!1,error:data.error||"Analisi AI non riuscita."}}catch(e){return console.error("Synthesis error:",e),{success:!1,error:"Errore di rete durante la richiesta. Riprova pi\xF9 tardi."}}},window.refreshPlanWeekModalContent=function(){const contentEl=document.getElementById("plan-week-modal-content");if(!contentEl)return;const todayStr=getLocalDateString(),todayDate=new Date,dayLabels=["Dom","Lun","Mar","Mer","Gio","Ven","Sab"],next7Days=[];for(let i=0;i<7;i++){const d=new Date(todayDate);d.setDate(todayDate.getDate()+i);const ds=getLocalDateString(d);next7Days.push({date:d,dateStr:ds,label:dayLabels[d.getDay()],dayNum:d.getDate()})}const now2w=new Date;now2w.setHours(0,0,0,0);const twoWeeksLater=new Date(now2w);twoWeeksLater.setDate(now2w.getDate()+14);const calendarTasks=(Array.isArray(state.tasks)?state.tasks:[]).filter(t=>{if(t.done||!t.due_date||t.subject==="QUEST")return!1;const d=parseArgoDate(t.due_date);return d>=now2w&&d<=twoWeeksLater});contentEl.innerHTML=`
        <div style="display: flex; align-items: center; margin-bottom: 24px; padding: 0 4px;">
            <h2 style="margin:0; flex:1; min-width:0; font-family:'JetBrains Mono', monospace; font-size: 18px; font-weight: 800; color:var(--on-surface); letter-spacing: 0.01em; text-transform: uppercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Pianifica Settimana</h2>
            <button onclick="closeModal()" style="flex-shrink:0; margin-left:auto; background:var(--surface-container-low); border:1px solid var(--outline-variant); width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--on-surface);">
                <i class="ph ph-x" style="font-size: 18px;"></i>
            </button>
        </div>
        <div style="display: flex; flex-direction: column; gap: 20px; max-height: 520px; overflow-y: auto; padding-right: 8px; padding-bottom: 20px;">
            ${calendarTasks.length===0?'<div style="text-align:center; padding:40px 20px; color:var(--on-surface-variant); font-family:JetBrains Mono, monospace; font-size:12px; text-transform:uppercase;">Nessun compito nelle prossime 2 settimane.</div>':""}
            ${calendarTasks.map(t=>{const subContent=t.subject||"N/A",key=getSubjectAbbrev(subContent).toLowerCase();return`
                <div style="background:var(--surface-container-lowest); padding: 20px; border-radius: 16px; border: 1px solid var(--outline-variant); box-shadow: 0 3px 10px rgba(0,0,0,0.03);">
                    <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 14px;">
                        <div style="min-width: 0; flex:1;">
                            <div style="font-family:'JetBrains Mono', monospace; font-size: 9px; font-weight: 800; color: var(--${key}-t, #141414); text-transform: uppercase; letter-spacing: 0.1em; background: var(--${key}, #EEE); padding: 3px 8px; border-radius: 6px; display: inline-block; margin-bottom: 8px;">${escapeHtml(subContent)}</div>
                            <div style="font-size: 15px; font-weight: 700; color:var(--on-surface); line-height: 1.4; padding-right: 10px;">${escapeHtml(t.text)}</div>
                        </div>
                    </div>
                    <div style="display: flex; gap: 6px;">
                        ${next7Days.map(day=>{const isPlanned=state.plannedTasks[day.dateStr]&&state.plannedTasks[day.dateStr].includes(t.id),isToday=day.dateStr===todayStr;return`
                            <div data-task-id="${t.id}" data-date="${day.dateStr}" 
                                onclick="togglePlanDay('${t.id}', '${day.dateStr}')"
                                style="flex: 1; text-align:center; padding: 12px 4px; border-radius: 12px; cursor: pointer; transition: all 0.2s;
                                background: ${isPlanned?"var(--on-surface)":"var(--surface-container-lowest)"};
                                color: ${isPlanned?"white":"#4F4A43"};
                                border: ${isToday?"2px solid #007AFF":"1px solid var(--outline-variant)"};">
                                <div style="font-family:'JetBrains Mono', monospace; font-size: 9px; font-weight: 700; margin-bottom: 4px; opacity: ${isPlanned?"0.6":"1"};">${day.label.toUpperCase()}</div>
                                <div style="font-weight: 800; font-size: 15px; letter-spacing: -0.02em;">${day.dayNum}</div>
                            </div>`}).join("")}
                    </div>
                </div>`}).join("")}
        </div>
        <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--outline-variant); display:flex; align-items:center; gap:10px;">
            <button id="plan-week-done-btn" onclick="finalizePlanWeekModal()" style="width: 100%; height: 50px; background: #141414; color: white; border: none; border-radius: 16px; font-size: 15px; font-weight: 800; cursor: pointer; transition: all 0.25s cubic-bezier(0.2,0.8,0.2,1);">Fatto</button>
            <span id="plan-week-added-badge" class="badge badge-success" style="display:none; white-space:nowrap; font-family:'JetBrains Mono',monospace; font-size:10px; font-weight:700;">0 compiti aggiunti</span>
        </div>`},window.finalizePlanWeekModal=function(){const doneBtn=document.getElementById("plan-week-done-btn"),addedBadge=document.getElementById("plan-week-added-badge"),initialPlannedCount=state.planWeekInitialPlannedCount??0,added=Math.max(0,getPlannedTasksTotalCount()-initialPlannedCount);doneBtn&&(doneBtn.style.background="#2DB86A",doneBtn.style.color="var(--surface-container-lowest)",doneBtn.textContent="Fatto \u2713",doneBtn.style.transform="scale(0.98)",setTimeout(()=>{doneBtn&&(doneBtn.style.transform="scale(1)")},180)),addedBadge&&added>0&&(addedBadge.style.display="inline-flex",addedBadge.textContent=`${added} compiti aggiunti`),typeof notifyPlannerChanged=="function"&&notifyPlannerChanged(),setTimeout(()=>{closeModal(),added>0&&typeof showToast=="function"&&showToast(`${added} compiti aggiunti`)},300)},window.updateWeekDayButton=function(taskId,dateStr){const isPlanned=state.plannedTasks[dateStr]&&state.plannedTasks[dateStr].includes(taskId),todayStr=getLocalDateString();document.querySelectorAll(`[data-task-id="${taskId}"][data-date="${dateStr}"]`).forEach(btn=>{isPlanned?(btn.style.background="var(--on-surface)",btn.style.borderColor="var(--on-surface)",btn.style.color="var(--surface)"):(btn.style.background="var(--surface-container-lowest)",btn.style.borderColor=dateStr===todayStr?"var(--primary)":"var(--outline-variant)",btn.style.color="var(--on-surface-variant)")})},window.addCustomQuestFromInput=function(){showToast("Task manuali disattivate: restano solo compiti assegnati.")},window.adjustNextGradeSimulator=function(delta){const current=getNextGradeSimulatorValue();setNextGradeSimulatorValue(current+(Number(delta)||0)),state.view==="voti"&&(updateNextGradeSimulatorWidget()||scheduleRender(0))},window.selectDay=function(day){state.selectedDay=day,window.scheduleRender(0)},window.getVotiData=function(){return state.voti&&state.voti.length>0?state.voti:state.grades&&state.grades.length>0?state.grades:[]},window.getAllSubjects=function(){const fromGrades=window.getVotiData().map(v=>v.materia||v.subject).filter(Boolean),fromTasks=(state.tasks||[]).map(t=>t.subject).filter(Boolean),fromExams=(state.exams||[]).map(e=>e.subject).filter(Boolean),all=[...new Set([...fromGrades,...fromTasks,...fromExams])];return all.length===0?["Italiano","Matematica","Inglese","Storia","Scienze","Fisica","Filosofia","Arte","Ed. Fisica","Religione"]:all.sort()},window.submitExamForm=function(){let subject=document.getElementById("examSubject").value;if(subject==="__custom"&&(subject=(document.getElementById("examCustomSubject").value||"").trim(),!subject))return showToast("Inserisci il nome della materia","error","#ff453a");const type=document.getElementById("examType").value,date=document.getElementById("examDate").value,topic=(document.getElementById("examTopic").value||"").trim();if(!date)return showToast("Seleziona una data","error","#ff453a");state.exams.push({subject,type,date,topic});const examTask={id:"exam_"+Date.now(),text:`${type}: ${topic||subject}`,subject,due_date:date,done:!1,isExam:!0};state.tasks.push(examTask),typeof saveTasks=="function"&&saveTasks(),closeModal(),window.scheduleRender(),showToast(`\u2705 ${type} di ${subject} aggiunta al ${date}!`,"success","var(--green)")},window.removeExam=function(index){state.exams.splice(index,1),typeof saveTasks=="function"&&saveTasks(),window.scheduleRender()},window.submitBacklogForm=function(){const subject=document.getElementById("backlogSubject").value,topic=(document.getElementById("backlogTopic").value||"").trim();if(!topic)return showToast("Inserisci l'argomento da recuperare","error","#ff453a");state.backlog.push({subject,topic}),typeof saveTasks=="function"&&saveTasks(),closeModal(),window.scheduleRender(),showToast(`\u{1F4DA} Arretrato di ${subject} aggiunto!`,"success","var(--green)")},window.removeBacklog=function(index){state.backlog.splice(index,1),typeof saveTasks=="function"&&saveTasks(),window.scheduleRender()},window.sendAIChatQuick=function(text){},window.sendAIChatQuickAt=function(index){},window.handleAIChatInputKeypress=function(event2){},window.startNewAIChat=function(){},window.clearAIChat=function(options={}){},window.deleteAIChatMessage=function(index){},window.stopVoiceInput=function(){};function extractImmediateCalendarAction(text){const raw=String(text||"");if(!raw)return null;const normalized=raw.toLowerCase(),wantsAdd=/\b(aggiungi|inserisci|crea|carica|programma)\b/.test(normalized)&&/\b(calendario|agenda)\b/.test(normalized),wantsDelete=/\b(elimina|rimuovi|cancella)\b/.test(normalized)&&/\b(calendario|agenda)\b/.test(normalized);if(!wantsAdd&&!wantsDelete)return null;const dateIsoMatch=raw.match(/\b(\d{4}-\d{2}-\d{2})\b/),dateSlashMatch=raw.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/);let date="";if(dateIsoMatch)date=dateIsoMatch[1];else if(dateSlashMatch){const day=String(Number(dateSlashMatch[1])).padStart(2,"0"),month=String(Number(dateSlashMatch[2])).padStart(2,"0"),now=new Date;let yearNum=Number(dateSlashMatch[3]||now.getFullYear());const candidate=new Date(yearNum,Number(month)-1,Number(day),12,0,0),today=new Date(now.getFullYear(),now.getMonth(),now.getDate(),12,0,0);!dateSlashMatch[3]&&!Number.isNaN(candidate.getTime())&&candidate<today&&(yearNum+=1),date=`${String(yearNum).padStart(4,"0")}-${month}-${day}`}const timeMatch=raw.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/),time=timeMatch?`${String(timeMatch[1]).padStart(2,"0")}:${timeMatch[2]}`:"";let subject="";const subjectMatch=raw.match(/(?:materia|subject)\s*[:\-]\s*([^\n,;]+)/i);if(subjectMatch&&(subject=subjectMatch[1].trim()),!subject){const found=["italiano","matematica","storia","inglese","informatica","fisica","chimica","scienze","latino","filosofia","arte","motoria","religione"].find(s=>normalized.includes(s));found&&(subject=found.charAt(0).toUpperCase()+found.slice(1))}let textTask="";const quoted=raw.match(/["“”']([^"“”']{3,140})["“”']/);if(quoted&&(textTask=quoted[1].trim()),!textTask){const after=raw.split(/(?:aggiungi|inserisci|crea|carica|programma)/i)[1]||"";after&&(textTask=after.replace(/\b(calendario|agenda|alle|ore|materia)\b/gi," ").replace(/\s+/g," ").trim())}if(wantsDelete){const deleteMissing=[];return date||deleteMissing.push("data (es. 2026-04-10)"),textTask||deleteMissing.push("titolo attivit\xE0"),{type:"delete",date,text:textTask,missing:deleteMissing}}const missing=[];return time||missing.push("orario (es. 16:30)"),date||missing.push("data (es. 2026-04-10)"),textTask||missing.push("attivit\xE0"),{type:"add",date,time,subject:subject||"Studio",text:textTask,missing}}async function applyImmediateCalendarAction(action){if(!action||action.type!=="add"||!Array.isArray(action.missing)||action.missing.length)return{ok:!1};if(!/^\d{4}-\d{2}-\d{2}$/.test(action.date||"")||!String(action.text||"").trim())return{ok:!1};if(action.isExam){const isCurrent=ClientRuntime.capture(),res=await fetchWithDeadline(`${API_BASE_URL}/api/manual-verifiche/${encodeURIComponent(getUserId())}`,{method:"POST",headers:getSessionHeaders(),body:JSON.stringify({subject:action.subject||"Studio",date:action.date,type:action.examType||"scritta",args:action.text})}),result=await res.json();if(!isCurrent())return{ok:!1};if(!res.ok||!result.success||!result.data)throw new Error(result.error||"Salvataggio verifica non riuscito");return state.manualVerifiche=[...state.manualVerifiche||[],result.data],localStorage.setItem(lsKey("manual_verifiche"),JSON.stringify(state.manualVerifiche)),{ok:!0,id:result.data.id}}(!state.plannedTasks||typeof state.plannedTasks!="object")&&(state.plannedTasks={}),(!state.plannedDetails||typeof state.plannedDetails!="object")&&(state.plannedDetails={}),Array.isArray(state.tasks)||(state.tasks=[]);const id=`manual_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,task={id,subject:action.subject||"Studio",text:action.text,due_date:action.date,done:!1};return state.tasks.push(task),Array.isArray(state.plannedTasks[action.date])||(state.plannedTasks[action.date]=[]),state.plannedTasks[action.date].includes(id)||state.plannedTasks[action.date].push(id),state.plannedDetails[id]={time:action.time},typeof saveTasks=="function"&&saveTasks(),{ok:!0,id}}function normalizeAiResponseMarkdown(text){const input=String(text||"").replace(/\r/g,"");if(!/(^|\n)\s*\|/.test(input))return input;const lines=input.split(`
`),out=[];let i=0;for(;i<lines.length;){const line=lines[i];if(!(/\|/.test(line)&&line.trim().startsWith("|"))){out.push(line),i+=1;continue}const table=[];for(;i<lines.length&&/\|/.test(lines[i])&&lines[i].trim().startsWith("|");)table.push(lines[i]),i+=1;if(table.length<2){out.push(...table);continue}const rows=table.map(r=>r.split("|").map(c=>c.trim()).filter(Boolean)).filter(cols=>cols.length>0),header=rows[0]||[],body=rows.slice(1).filter(cols=>!cols.every(c=>/^:?-{2,}:?$/.test(c)));if(!header.length||!body.length){out.push(...table);continue}body.forEach((cols,rowIdx)=>{out.push(`- **Riga ${rowIdx+1}**`),cols.forEach((cell,colIdx)=>{const label=header[colIdx]||`Colonna ${colIdx+1}`;out.push(`  - ${label}: ${cell||"-"}`)})})}return out.join(`
`).replace(/\n{3,}/g,`

`)}function deleteImmediateCalendarAction(action){if(!action||action.type!=="delete")return{ok:!1};const sourceTasks=Array.isArray(state.tasks)?state.tasks:[],normalizedNeedle=String(action.text||"").trim().toLowerCase(),filtered=sourceTasks.filter(t=>!(!t||!t.id||!isUserGeneratedTaskId(t.id)||action.date&&t.due_date!==action.date||normalizedNeedle&&!`${t.subject||""} ${t.text||""}`.toLowerCase().includes(normalizedNeedle)));if(!filtered.length)return{ok:!1,reason:"not_found"};const idsToDelete=new Set(filtered.map(t=>t.id));return state.tasks=sourceTasks.filter(t=>!idsToDelete.has(t.id)),Object.keys(state.plannedTasks||{}).forEach(dateKey=>{const ids=state.plannedTasks[dateKey];Array.isArray(ids)&&(state.plannedTasks[dateKey]=ids.filter(id=>!idsToDelete.has(id)))}),Object.keys(state.plannedDetails||{}).forEach(id=>{idsToDelete.has(id)&&delete state.plannedDetails[id]}),typeof saveTasks=="function"&&saveTasks(),{ok:!0,count:filtered.length}}window.sendAIChat=async function(){showToast("Chat AI disattivata","info")},window.clearSyncDiagnostics=function(){state.syncDiagnostics=[],localStorage.setItem(lsKey("sync_diagnostics"),"[]"),window.scheduleRender(),showToast("Log sync puliti")},window.applyAIPlanFromChat=function(msgIndex){},window.saveGeminiKey=function(){};function gsapAnimateView(){if(typeof gsap>"u")return;const root=document.getElementById("app");if(!root)return;typeof ScrollTrigger<"u"&&(ScrollTrigger.getAll().forEach(t=>t.kill()),gsap.registerPlugin(ScrollTrigger));const view=root.querySelector(".view");if(!view)return;const master=gsap.timeline({defaults:{ease:"power3.out"}});master.fromTo(view,{opacity:0,y:40,filter:"blur(8px)"},{opacity:1,y:0,filter:"blur(0px)",duration:.7});const hero=view.querySelector(".greeting-card");if(hero){const heroTl=gsap.timeline({defaults:{ease:"power3.out"}});heroTl.fromTo(hero,{opacity:0,y:50,scale:.95},{opacity:1,y:0,scale:1,duration:.8});const heroTitle=hero.querySelector(".greeting-text");heroTitle&&heroTl.fromTo(heroTitle,{opacity:0,y:20,filter:"blur(4px)"},{opacity:1,y:0,filter:"blur(0px)",duration:.6},"-=0.5");const heroMeta=hero.querySelectorAll(".greeting-period, .greeting-quote");heroMeta.length&&heroTl.fromTo(heroMeta,{opacity:0,y:15},{opacity:1,y:0,duration:.5,stagger:.1},"-=0.3"),master.add(heroTl,.1)}const metricCards=view.querySelectorAll(".row-3 > .card, .row-2 > div > .card, .streak-card, .verifica-card, .bigstat, .circ-widget");metricCards.length&&master.fromTo(metricCards,{opacity:0,y:30,scale:.92},{opacity:1,y:0,scale:1,duration:.6,stagger:.08,ease:"back.out(1.2)"},.2);const cards=view.querySelectorAll(".card, .glass-panel, .subject-summary-card, .registro-card");cards.length&&master.fromTo(cards,{opacity:0,y:35,scale:.94},{opacity:1,y:0,scale:1,duration:.55,stagger:.07,ease:"back.out(1.15)"},.15);const circolari=view.querySelectorAll(".circolare-card");circolari.length&&master.fromTo(circolari,{opacity:0,x:60,rotateY:8},{opacity:1,x:0,rotateY:0,duration:.6,stagger:.06,ease:"power2.out"},.3);const headers=view.querySelectorAll("h1, h2, .section-action");headers.length&&master.fromTo(headers,{opacity:0,y:15,filter:"blur(3px)"},{opacity:1,y:0,filter:"blur(0px)",duration:.45,stagger:.05,ease:"power2.out"},.1);const buttons=view.querySelectorAll(".btn-primary, .btn-secondary, .fab");buttons.length&&master.fromTo(buttons,{opacity:0,scale:.85},{opacity:1,scale:1,duration:.5,stagger:.05,ease:"back.out(2)"},.35),typeof ScrollTrigger<"u"&&(view.querySelectorAll(".focus-item, .glass-list-item, .studio-entry").forEach(item=>{gsap.fromTo(item,{opacity:0,y:20,filter:"blur(3px)"},{opacity:1,y:0,filter:"blur(0px)",duration:.5,ease:"power2.out",scrollTrigger:{trigger:item,start:"top 88%",toggleActions:"play none none none",once:!0}})}),view.querySelectorAll(".circolare-card, .registro-card").forEach((card,i)=>{gsap.fromTo(card,{opacity:0,y:25,scale:.96},{opacity:1,y:0,scale:1,duration:.5,delay:i*.05,ease:"back.out(1.1)",scrollTrigger:{trigger:card,start:"top 92%",toggleActions:"play none none none",once:!0}})})),view.querySelectorAll(".card, .metric-card, .circolare-card, .home-glass-card").forEach(card=>{card.addEventListener("mouseenter",()=>{gsap.to(card,{scale:1.02,boxShadow:"0 12px 40px rgba(0, 0, 0, 0.12)",duration:.3,ease:"power2.out"})}),card.addEventListener("mouseleave",()=>{gsap.to(card,{scale:1,boxShadow:"0 2px 12px rgba(0, 0, 0, 0.06)",duration:.4,ease:"elastic.out(1, 0.5)"})})}),view.querySelectorAll(".btn-primary, .btn-secondary, .btn-icon-glass").forEach(btn=>{btn.addEventListener("mousedown",()=>{gsap.to(btn,{scale:.95,duration:.1,ease:"power2.in"})}),btn.addEventListener("mouseup",()=>{gsap.to(btn,{scale:1,duration:.3,ease:"elastic.out(1, 0.4)"})}),btn.addEventListener("mouseleave",()=>{gsap.to(btn,{scale:1,duration:.2,ease:"power2.out"})})}),view.querySelectorAll(".media-value, [data-animate-number]").forEach(el=>{const text=el.textContent.trim(),num=parseFloat(text);if(!isNaN(num)&&num>0){const obj={val:0};gsap.to(obj,{val:num,duration:1.2,delay:.5,ease:"power2.out",onUpdate:()=>{el.textContent=num%1!==0?obj.val.toFixed(2):Math.round(obj.val).toString()}})}})}function gsapOpenModal(overlay){if(!overlay||typeof gsap>"u")return;const content=overlay.querySelector(".modal-content");gsap.fromTo(overlay,{opacity:0},{opacity:1,duration:.3,ease:"power2.out"}),content&&gsap.fromTo(content,{scale:.88,y:30,filter:"blur(4px)"},{scale:1,y:0,filter:"blur(0px)",duration:.45,ease:"back.out(1.4)"})}function gsapCloseModal(overlay,onComplete){if(!overlay||typeof gsap>"u"){onComplete&&onComplete();return}const content=overlay.querySelector(".modal-content"),tl=gsap.timeline({onComplete});content&&tl.to(content,{scale:.9,y:15,opacity:0,filter:"blur(4px)",duration:.25,ease:"power2.in"},0),tl.to(overlay,{opacity:0,duration:.2,ease:"power2.in"},.08)}function gsapAnimateNav(){const nav=document.querySelector(".nav-links");if(!nav||typeof gsap>"u")return;const activeItem=nav.querySelector(".nav-item.active");activeItem&&gsap.fromTo(activeItem,{scale:.92},{scale:1,duration:.3,ease:"back.out(2)"})}console.log("\u2705 GSAP Animations consolidated into ui.js");function renderCircolariView(){const list=state.circolari||[];(!list||list.length===0)&&typeof window.loadCircolari=="function"&&!window._loadingCircolariNow&&(window._loadingCircolariNow=!0,window.loadCircolari().finally(()=>{window._loadingCircolariNow=!1}));function fmtDate(raw){if(!raw)return"";const d=typeof parseArgoDate=="function"?parseArgoDate(raw):typeof window.parseArgoDate=="function"?window.parseArgoDate(raw):new Date(raw);if(!d||isNaN(d)||d.getTime()<=864e5)return raw;const diff=Math.round((new Date-d)/864e5);return diff===0?"Oggi":diff===1?"Ieri":d.toLocaleDateString("it-IT",{day:"numeric",month:"short"})}const q=(state.circolariSearchQuery||"").toLowerCase().trim(),filteredList=q?list.filter(c=>((c.titolo||"")+" "+(c.numero||"")+" "+(c.data||"")).toLowerCase().includes(q)):list,featured=!q&&list.length>0?list[0]:null,gridCards=!q&&list.length>1?list.slice(1,3):[],recentList=q?filteredList:list.slice(3),featuredHtml=featured?`
        <div style="border-radius:28px;padding:22px 20px;margin-bottom:20px;box-shadow:0 28px 56px -14px rgba(6,14,32,0.75), inset 0 1px 1px rgba(255,255,255,0.3);border:1px solid rgba(182,196,255,0.2);border-top:1px solid rgba(255,255,255,0.35);background:linear-gradient(135deg,rgba(47,88,205,0.35) 0%,rgba(23,31,51,0.9) 100%);backdrop-filter:blur(36px) saturate(190%);-webkit-backdrop-filter:blur(36px) saturate(190%);cursor:pointer;position:relative;overflow:hidden;" onclick="mostraCircolare('${escapeJsSingleQuote(featured.id)}')" ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform='scale(1)'">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <span style="background:rgba(47,88,205,0.25);border:1px solid rgba(182,196,255,0.3);color:#b6c4ff;font-size:11px;font-weight:800;padding:4px 12px;border-radius:999px;display:inline-flex;align-items:center;gap:6px;letter-spacing:0.04em;">
                    <i class="ph-fill ph-sparkle" style="font-size:13px;"></i> IN EVIDENZA ${featured.numero?"\xB7 N. "+escapeHtml(featured.numero):""}
                </span>
                <span style="font-size:12px;font-weight:600;color:#c4c5d6;display:flex;align-items:center;gap:4px;">
                    <i class="ph-bold ph-calendar" style="color:#b6c4ff;"></i> ${fmtDate(featured.data)}
                </span>
            </div>
            <h2 style="font-size:19px;font-weight:800;color:#dae2fd;line-height:1.35;margin:0 0 20px;letter-spacing:-0.02em;">${escapeHtml(featured.titolo)}</h2>
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:12px;font-weight:600;color:#8e909f;">Tocca per consultare</span>
                <div style="background:linear-gradient(135deg,#2f58cd 0%,#3b82f6 100%);color:#ffffff;font-size:12px;font-weight:700;padding:8px 16px;border-radius:14px;display:flex;align-items:center;gap:6px;box-shadow:0 4px 16px rgba(47,88,205,0.45);">
                    <i class="ph-bold ph-file-text"></i> Leggi e Sintesi AI \u2192
                </div>
            </div>
        </div>`:"",gridHtml=gridCards.length?`
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px;">
            ${gridCards.map((c,i)=>{const isFirst=i===0,accentColor=isFirst?"#b6c4ff":"#6ee7b7",bgAccent=isFirst?"rgba(47,88,205,0.25)":"rgba(110,231,183,0.15)",iconName=isFirst?"ph-calendar-star":"ph-file-text";return`<div style="border-radius:22px;padding:18px 16px;background:rgba(23,31,51,0.85);backdrop-filter:blur(28px);-webkit-backdrop-filter:blur(28px);box-shadow:0 12px 28px -10px rgba(6,14,32,0.6);border:1px solid rgba(182,196,255,0.14);border-top:1px solid rgba(255,255,255,0.25);display:flex;flex-direction:column;cursor:pointer;min-height:150px;justify-content:space-between;" onclick="mostraCircolare('${escapeJsSingleQuote(c.id)}')" ontouchstart="this.style.transform='scale(0.97)'" ontouchend="this.style.transform='scale(1)'">
                    <div>
                        <div style="width:36px;height:36px;border-radius:12px;background:${bgAccent};border:1px solid ${accentColor}44;display:flex;align-items:center;justify-content:center;color:${accentColor};margin-bottom:12px;">
                            <i class="ph-fill ${iconName}" style="font-size:18px;"></i>
                        </div>
                        <h3 style="font-size:14px;font-weight:700;color:#dae2fd;line-height:1.3;margin:0;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">${escapeHtml(c.titolo)}</h3>
                    </div>
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px;font-size:11px;font-weight:600;color:#8e909f;">
                        <span>${c.numero?"N. "+escapeHtml(c.numero):""}</span>
                        <span>${fmtDate(c.data)}</span>
                    </div>
                </div>`}).join("")}
        </div>`:"",recentHtml=recentList.length?`
        <div style="display:flex;justify-content:space-between;align-items:center;margin:8px 0 14px;">
            <h2 style="font-size:18px;font-weight:800;color:#dae2fd;letter-spacing:-0.01em;margin:0;">${q?"Risultati ricerca":"Tutte le Circolari"}</h2>
            <span style="font-size:11px;font-weight:700;color:#8e909f;background:rgba(23,31,51,0.85);border:1px solid rgba(182,196,255,0.14);padding:3px 10px;border-radius:999px;">${recentList.length} ${recentList.length===1?"comunicazione":"comunicazioni"}</span>
        </div>
        <div id="circolari-list-container" style="display:flex;flex-direction:column;gap:10px;">
            ${recentList.map(c=>`
                <div data-circ-item data-circ-search="${escapeHtml(((c.titolo||"")+" "+(c.numero||"")+" "+(c.data||"")).toLowerCase())}" style="background:rgba(23,31,51,0.82);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid rgba(182,196,255,0.12);border-top:1px solid rgba(255,255,255,0.22);box-shadow:0 6px 20px -8px rgba(6,14,32,0.6);border-radius:20px;padding:14px 16px;display:flex;align-items:center;gap:14px;cursor:pointer;transition:transform 0.12s ease;" onclick="mostraCircolare('${escapeJsSingleQuote(c.id)}')" ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform='scale(1)'">
                    <div style="width:42px;height:42px;border-radius:14px;background:rgba(47,88,205,0.2);border:1px solid rgba(182,196,255,0.25);display:flex;align-items:center;justify-content:center;color:#b6c4ff;flex-shrink:0;">
                        <i class="ph-fill ph-file-text" style="font-size:20px;"></i>
                    </div>
                    <div style="flex:1;min-width:0;">
                        <p style="font-size:14px;font-weight:700;color:#dae2fd;margin:0 0 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.3;">${escapeHtml(c.titolo)}</p>
                        <div style="display:flex;align-items:center;gap:8px;font-size:11px;color:#8e909f;font-weight:600;">
                            ${c.numero?`<span style="background:rgba(182,196,255,0.1);padding:1px 6px;border-radius:6px;color:#b6c4ff;">N. ${escapeHtml(c.numero)}</span>`:""}
                            <span>${fmtDate(c.data)}</span>
                            ${c.sintesi?'<span style="color:#b6c4ff;font-weight:700;display:flex;align-items:center;gap:3px;"><i class="ph-bold ph-sparkle"></i> AI</span>':""}
                        </div>
                    </div>
                    <i class="ph-bold ph-caret-right" style="font-size:16px;color:rgba(182,196,255,0.4);flex-shrink:0;"></i>
                </div>`).join("")}
        </div>`:"",emptyHtml=!list.length||q&&!filteredList.length?`
        <div id="circ-search-empty" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;">
            <div style="width:56px;height:56px;border-radius:20px;background:rgba(23,31,51,0.85);border:1px solid rgba(182,196,255,0.16);display:flex;align-items:center;justify-content:center;color:#8e909f;margin-bottom:14px;">
                <i class="ph-bold ph-tray" style="font-size:28px;"></i>
            </div>
            <p style="font-size:16px;font-weight:700;color:#dae2fd;margin:0 0 4px;">Nessuna circolare trovata</p>
            <p style="font-size:13px;font-weight:500;color:#8e909f;margin:0;">${q?"Nessun elemento corrisponde ai criteri di ricerca":"Non ci sono comunicazioni pubblicate al momento"}</p>
        </div>`:"";return`
    <div class="view-fullbleed min-h-screen pb-32" style="background:var(--background, #0b1326);font-family:'Inter',sans-serif;color:#dae2fd;">
        <header class="ios-header-wrapper" style="display:flex;justify-content:space-between;align-items:flex-end;padding:max(env(safe-area-inset-top,0px),24px) 20px 16px;">
            <div>
                <div class="ios-sub-title" style="color:#b6c4ff;font-weight:800;letter-spacing:0.08em;font-size:11px;">COMUNICAZIONI SCUOLA</div>
                <h1 class="ios-large-title" style="color:#dae2fd;font-weight:800;font-size:32px;letter-spacing:-0.03em;margin:2px 0 0;">Circolari</h1>
            </div>
            <button onclick="if(typeof loadCircolari==='function'){loadCircolari().then(()=>render());}" style="width:38px;height:38px;border-radius:12px;background:rgba(23,31,51,0.85);border:1px solid rgba(182,196,255,0.16);color:#b6c4ff;cursor:pointer;display:flex;align-items:center;justify-content:center;" aria-label="Aggiorna circolari">
                <i class="ph-bold ph-arrows-clockwise" style="font-size:18px;"></i>
            </button>
        </header>

        <div style="padding:0 20px;">
            <!-- Search Bar -->
            <div style="margin-bottom:18px;position:relative;">
                <div style="display:flex;align-items:center;background:rgba(23,31,51,0.85);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid rgba(182,196,255,0.16);border-radius:18px;padding:12px 16px;gap:10px;box-shadow:0 8px 24px -6px rgba(6,14,32,0.6);">
                    <i class="ph-bold ph-magnifying-glass" style="color:#b6c4ff;font-size:18px;flex-shrink:0;"></i>
                    <input id="circ-search-input" type="text" placeholder="Cerca per titolo, numero o data..." oninput="window.filterCircolari(this.value)" value="${escapeHtml(state.circolariSearchQuery||"")}" style="background:none;border:none;color:#dae2fd;font-size:14px;width:100%;outline:none;font-family:'Inter',sans-serif;" />
                    ${state.circolariSearchQuery?`<i class="ph-bold ph-x-circle" style="color:#8e909f;cursor:pointer;font-size:18px;" onclick="const si=document.getElementById('circ-search-input');if(si){si.value='';window.filterCircolari('');}"></i>`:""}
                </div>
            </div>

            ${featuredHtml}
            ${gridHtml}
            ${recentHtml}
            ${emptyHtml}
        </div>
    </div>`}window.filterCircolari=function(query){state.circolariSearchQuery=query;const container=document.getElementById("circolari-list-container");if(!container){typeof render=="function"&&render();return}const items=container.querySelectorAll("[data-circ-item]"),q=(query||"").toLowerCase().trim();let visibleCount=0;items.forEach(el=>{const text=el.getAttribute("data-circ-search")||"",match=!q||text.includes(q);el.style.display=match?"flex":"none",match&&visibleCount++});const emptyEl=document.getElementById("circ-search-empty");emptyEl&&(emptyEl.style.display=visibleCount===0&&q?"flex":"none")};function getSubjectTheme(rawSubject){const s=(typeof normalizeSubjectName=="function"?normalizeSubjectName(rawSubject):String(rawSubject||"")).toLowerCase();return s.includes("motor")||s.includes("ed. fis")||s.includes("sport")||s.includes("ginnas")||s.includes("educazione")&&s.includes("fisic")?{color:"#e0f2fe",gradient:"linear-gradient(135deg, rgba(224, 242, 254, 0.18) 0%, rgba(23, 31, 51, 0.92) 100%)",border:"rgba(224, 242, 254, 0.38)",icon:"ph-person-simple-run",iconBg:"rgba(224, 242, 254, 0.18)",glow:"rgba(224, 242, 254, 0.35)"}:s.includes("civic")||s.includes("cittadin")?{color:"#b46534",gradient:"linear-gradient(135deg, rgba(180, 101, 52, 0.20) 0%, rgba(23, 31, 51, 0.92) 100%)",border:"rgba(180, 101, 52, 0.38)",icon:"ph-scales",iconBg:"rgba(180, 101, 52, 0.22)",glow:"rgba(180, 101, 52, 0.35)"}:s.includes("inform")||s.includes("sistemi")||s.includes("tps")||s.includes("telecom")||s.includes("tecnol")?{color:"#06b6d4",gradient:"linear-gradient(135deg, rgba(6, 182, 212, 0.18) 0%, rgba(23, 31, 51, 0.92) 100%)",border:"rgba(6, 182, 212, 0.35)",icon:"ph-code",iconBg:"rgba(6, 182, 212, 0.22)",glow:"rgba(6, 182, 212, 0.40)"}:s.includes("matem")||s.includes("algeb")||s.includes("geom")||s.includes("trigon")?{color:"#2563eb",gradient:"linear-gradient(135deg, rgba(37, 99, 235, 0.18) 0%, rgba(23, 31, 51, 0.92) 100%)",border:"rgba(37, 99, 235, 0.35)",icon:"ph-calculator",iconBg:"rgba(37, 99, 235, 0.22)",glow:"rgba(37, 99, 235, 0.35)"}:s.includes("ital")||s.includes("letter")||s.includes("epic")||s.includes("antol")||s.includes("narrat")||s.includes("gramm")?{color:"#ef4444",gradient:"linear-gradient(135deg, rgba(239, 68, 68, 0.18) 0%, rgba(23, 31, 51, 0.92) 100%)",border:"rgba(239, 68, 68, 0.35)",icon:"ph-book-open-text",iconBg:"rgba(239, 68, 68, 0.22)",glow:"rgba(239, 68, 68, 0.35)"}:(s.includes("storia")||s.includes("geogr"))&&!s.includes("arte")?{color:"#eab308",gradient:"linear-gradient(135deg, rgba(234, 179, 8, 0.18) 0%, rgba(23, 31, 51, 0.92) 100%)",border:"rgba(234, 179, 8, 0.35)",icon:"ph-scroll",iconBg:"rgba(234, 179, 8, 0.22)",glow:"rgba(234, 179, 8, 0.35)"}:s.includes("filos")?{color:"#a855f7",gradient:"linear-gradient(135deg, rgba(168, 85, 247, 0.18) 0%, rgba(23, 31, 51, 0.92) 100%)",border:"rgba(168, 85, 247, 0.35)",icon:"ph-brain",iconBg:"rgba(168, 85, 247, 0.22)",glow:"rgba(168, 85, 247, 0.35)"}:s.includes("ingl")||s.includes("franc")||s.includes("spag")||s.includes("tedes")||s.includes("lingua")?{color:"#14b8a6",gradient:"linear-gradient(135deg, rgba(20, 184, 166, 0.18) 0%, rgba(23, 31, 51, 0.92) 100%)",border:"rgba(20, 184, 166, 0.35)",icon:"ph-globe",iconBg:"rgba(20, 184, 166, 0.22)",glow:"rgba(20, 184, 166, 0.35)"}:s.includes("fisic")&&!s.includes("educazione")&&!s.includes("motor")?{color:"#6366f1",gradient:"linear-gradient(135deg, rgba(99, 102, 241, 0.18) 0%, rgba(23, 31, 51, 0.92) 100%)",border:"rgba(99, 102, 241, 0.35)",icon:"ph-atom",iconBg:"rgba(99, 102, 241, 0.22)",glow:"rgba(99, 102, 241, 0.35)"}:s.includes("scienz")||s.includes("chimic")||s.includes("biol")||s.includes("geol")||s.includes("natura")?{color:"#22c55e",gradient:"linear-gradient(135deg, rgba(34, 197, 94, 0.18) 0%, rgba(23, 31, 51, 0.92) 100%)",border:"rgba(34, 197, 94, 0.35)",icon:"ph-flask",iconBg:"rgba(34, 197, 94, 0.22)",glow:"rgba(34, 197, 94, 0.35)"}:s.includes("arte")||s.includes("disegn")?{color:"#ff6b00",gradient:"linear-gradient(135deg, rgba(255, 107, 0, 0.18) 0%, rgba(23, 31, 51, 0.92) 100%)",border:"rgba(255, 107, 0, 0.35)",icon:"ph-palette",iconBg:"rgba(255, 107, 0, 0.22)",glow:"rgba(255, 107, 0, 0.35)"}:s.includes("diritto")||s.includes("econ")?{color:"#cbd5e1",gradient:"linear-gradient(135deg, rgba(148, 163, 184, 0.18) 0%, rgba(23, 31, 51, 0.92) 100%)",border:"rgba(203, 213, 225, 0.32)",icon:"ph-scales",iconBg:"rgba(148, 163, 184, 0.22)",glow:"rgba(148, 163, 184, 0.35)"}:s.includes("relig")||s.includes("rc")?{color:"#e2e8f0",gradient:"linear-gradient(135deg, rgba(226, 232, 240, 0.15) 0%, rgba(23, 31, 51, 0.92) 100%)",border:"rgba(226, 232, 240, 0.28)",icon:"ph-hands-praying",iconBg:"rgba(226, 232, 240, 0.18)",glow:"rgba(226, 232, 240, 0.25)"}:{color:"#b6c4ff",gradient:"linear-gradient(135deg, rgba(47, 88, 205, 0.2) 0%, rgba(23, 31, 51, 0.92) 100%)",border:"rgba(182, 196, 255, 0.25)",icon:"ph-book-bookmark",iconBg:"rgba(47, 88, 205, 0.25)",glow:"rgba(182, 196, 255, 0.3)"}}window.getSubjectTheme=getSubjectTheme;function getSubjectIcon(subject){const t=getSubjectTheme(subject);return t.icon?t.icon.replace("ph-",""):"book"}window.openTaskDetailModal=function(taskId){const t=(state.tasks||[]).find(x=>String(x.id)===String(taskId))||(state.verifiche||[]).find(x=>String(x.id)===String(taskId))||(state.manualVerifiche||[]).find(x=>String(x.id)===String(taskId));if(!t)return;const isExam=t.isExam||t.type==="verifica"||/verifica|interrogazione|test|esame|simulazione/i.test(t.text||""),subj=t.subject||t.materia||"Attivit\xE0",txt=t.text||t.args||t.descrizione||"Nessuna descrizione specificata.",dueDate=t.due_date||t.data||t.date||"",theme=getSubjectTheme(subj);let formattedDate=dueDate;if(dueDate){const d=typeof parseLocalDate=="function"?parseLocalDate(dueDate):new Date(dueDate+"T00:00:00");isNaN(d.getTime())||(formattedDate=d.toLocaleDateString("it-IT",{weekday:"long",day:"numeric",month:"long",year:"numeric"}),formattedDate=formattedDate.charAt(0).toUpperCase()+formattedDate.slice(1))}const canDel=typeof isUserGeneratedTaskId=="function"?isUserGeneratedTaskId(t.id):!1,existing=document.getElementById("task-detail-modal-overlay");existing&&existing.remove();const overlay=document.createElement("div");overlay.id="task-detail-modal-overlay",overlay.style.cssText="position:fixed;inset:0;z-index:99999;background:rgba(6,14,32,0.65);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);display:flex;align-items:flex-end;justify-content:center;";const sheet=document.createElement("div");sheet.style.cssText="width:100%;max-width:540px;background:rgba(18,29,50,0.96);backdrop-filter:blur(40px) saturate(200%);-webkit-backdrop-filter:blur(40px) saturate(200%);border:1px solid rgba(182,196,255,0.18);border-top:1px solid rgba(255,255,255,0.35);border-radius:32px 32px 0 0;display:flex;flex-direction:column;max-height:90vh;box-shadow:0 -12px 48px rgba(6,14,32,0.85);transform:translateY(100%);transition:transform 0.35s cubic-bezier(0.16,1,0.3,1);font-family:'Inter',sans-serif;color:#dae2fd;",sheet.innerHTML=`
        <!-- Drag handle -->
        <div style="display:flex;justify-content:center;padding:14px 0 8px;flex-shrink:0;">
            <div style="width:44px;height:5px;border-radius:999px;background:rgba(182,196,255,0.3);"></div>
        </div>

        <!-- Header -->
        <div style="padding:8px 22px 14px;flex-shrink:0;border-bottom:1px solid rgba(182,196,255,0.12);">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                <div style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:999px;background:${theme.iconBg};border:1px solid ${theme.border};color:${theme.color};font-size:12px;font-weight:800;letter-spacing:0.03em;">
                    <i class="ph-fill ${theme.icon}" style="font-size:14px;"></i>
                    <span>${escapeHtml(subj)}</span>
                </div>
                ${isExam?`
                    <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:999px;background:rgba(239,68,68,0.2);border:1px solid rgba(239,68,68,0.35);color:#ffb4ab;font-size:11px;font-weight:800;letter-spacing:0.04em;">
                        <i class="ph-bold ph-warning" style="font-size:13px;"></i> VERIFICA
                    </span>
                `:`
                    <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:999px;background:${t.done?"rgba(110,231,183,0.18)":"rgba(47,88,205,0.22)"};border:1px solid ${t.done?"rgba(110,231,183,0.35)":"rgba(182,196,255,0.25)"};color:${t.done?"#6ee7b7":"#b6c4ff"};font-size:11px;font-weight:700;">
                        <i class="ph-bold ${t.done?"ph-check-circle":"ph-clock"}" style="font-size:13px;"></i> ${t.done?"Completato":"Da svolgere"}
                    </span>
                `}
            </div>

            <div style="display:flex;align-items:center;gap:6px;color:#8e909f;font-size:13px;font-weight:500;">
                <i class="ph-bold ph-calendar-blank" style="color:${theme.color};font-size:15px;"></i>
                <span>${escapeHtml(formattedDate)}</span>
            </div>
        </div>

        <!-- Body -->
        <div style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:20px 22px;">
            <div style="background:rgba(23,31,51,0.85);border:1px solid rgba(182,196,255,0.14);border-radius:20px;padding:18px 20px;box-shadow:0 8px 24px -6px rgba(6,14,32,0.6);">
                <h3 style="font-size:11px;font-weight:800;color:${theme.color};text-transform:uppercase;letter-spacing:0.08em;margin:0 0 10px;">Dettaglio Assegnazione</h3>
                <p style="font-size:15px;line-height:1.65;color:#dae2fd;margin:0;white-space:pre-wrap;word-break:break-word;user-select:text;-webkit-user-select:text;">${escapeHtml(txt)}</p>
            </div>
        </div>

        <!-- Actions -->
        <div style="padding:14px 22px calc(24px + env(safe-area-inset-bottom,0px));flex-shrink:0;display:flex;flex-direction:column;gap:10px;border-top:1px solid rgba(182,196,255,0.12);">
            <button onclick="toggleTask('${escapeJsSingleQuote(t.id)}',event); openTaskDetailModal('${escapeJsSingleQuote(t.id)}'); if(typeof window.updatePlannerSearchModalResults==='function')window.updatePlannerSearchModalResults(); state._forceRender=true; scheduleRender(0);" style="width:100%;height:48px;border-radius:15px;background:${t.done?"rgba(110,231,183,0.18)":"linear-gradient(135deg,#2f58cd 0%,#3b82f6 100%)"};border:${t.done?"1px solid rgba(110,231,183,0.35)":"none"};color:${t.done?"#6ee7b7":"#ffffff"};font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-family:'Inter',sans-serif;box-shadow:${t.done?"none":"0 4px 16px rgba(47,88,205,0.45)"};">
                <i class="ph-bold ${t.done?"ph-arrow-counter-clockwise":"ph-check"}" style="font-size:18px;"></i>
                <span>${t.done?"Riapri (Segna come Da Svolgere)":"Segna come Completato"}</span>
            </button>

            ${canDel?`
            <button onclick="deleteCalendarTask('${escapeJsSingleQuote(t.id)}'); window.closeTaskDetailModal(); if(typeof window.updatePlannerSearchModalResults==='function')window.updatePlannerSearchModalResults(); state._forceRender=true; scheduleRender(0);" style="width:100%;height:44px;border-radius:14px;background:rgba(255,59,48,0.12);border:1px solid rgba(255,59,48,0.25);color:#ffb4ab;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;font-family:'Inter',sans-serif;">
                <i class="ph-bold ph-trash" style="font-size:16px;"></i> Elimina Attivit\xE0
            </button>
            `:""}

            <button onclick="window.closeTaskDetailModal()" style="width:100%;height:38px;background:none;border:none;color:#b6c4ff;font-size:14px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;">Chiudi</button>
        </div>
    `,overlay.appendChild(sheet),document.body.appendChild(overlay),requestAnimationFrame(()=>{sheet.style.transform="translateY(0)"}),window.closeTaskDetailModal=function(){sheet.style.transform="translateY(100%)",setTimeout(()=>{overlay.parentNode&&overlay.remove()},320)},overlay.addEventListener("click",e=>{e.target===overlay&&window.closeTaskDetailModal()})},window._plannerGetDayContentHTML=function(){if(window._plannerDayContentCache)return window._plannerDayContentCache;const today=new Date;today.setHours(0,0,0,0);const todayISO=getLocalDateString(today),selectedDate=state.selectedDate||todayISO,MN=["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"],dayLabels=["Dom","Lun","Mar","Mer","Gio","Ven","Sab"],allTasks=(state.tasks||[]).filter(t=>t.subject!=="QUEST"),dayTasks=allTasks.filter(t=>t.due_date===selectedDate),upcomingCount=allTasks.filter(t=>{if(t.done)return!1;const d2=parseLocalDate(t.due_date);return isNaN(d2.getTime())?!1:(d2-today)/864e5>0&&(d2-today)/864e5<=7}).length,TC=window._plannerTC;if(!TC)return"";let html='<div style="padding:0 24px 120px 24px;display:flex;flex-direction:column;gap:10px;">';const d=new Date(selectedDate+"T00:00:00"),diff=Math.round((d-today)/864e5),base=`${dayLabels[d.getDay()]} ${d.getDate()} ${MN[d.getMonth()]}`;let title=base;return diff===0?title=`Oggi \xB7 ${base}`:diff===1?title=`Domani \xB7 ${base}`:diff===-1&&(title=`Ieri \xB7 ${base}`),html+=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
        <h2 style="font-size:15px;font-weight:700;color:var(--on-surface);margin:0;">${title}</h2>
        <span style="font-size:11px;font-weight:700;color:var(--outline);">${dayTasks.length} ${dayTasks.length===1?"evento":"eventi"}</span>
    </div>`,upcomingCount>0&&selectedDate===todayISO&&(html+=`<div style="background:var(--info-container);border:1.5px solid rgba(191,219,254,0.6);border-radius:20px;padding:14px 16px;box-shadow:0 4px 16px -8px rgba(37,99,235,0.12);">
            <div style="display:flex;align-items:center;gap:9px;margin-bottom:5px;">
                <div style="width:30px;height:30px;border-radius:50%;background:#1e40af;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><span class="material-symbols-outlined" style="font-size:15px;color:white;font-variation-settings:'FILL' 1;">lightbulb</span></div>
                <span style="font-size:13px;font-weight:700;color:var(--info);">Smart Planner</span>
            </div>
            <p style="font-size:12px;color:var(--on-surface-variant);line-height:1.5;margin:0 0 6px;">Hai <strong>${upcomingCount}</strong> compiti nei prossimi 7 giorni.</p>
            <button onclick="const si=document.getElementById('planner-search-input');if(si){si.focus();si.select();}" style="color:var(--info);font-weight:700;font-size:11px;background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:3px;font-family:Hanken Grotesk,sans-serif;padding:0;">Cerca <span class="material-symbols-outlined" style="font-size:13px;">arrow_forward</span></button>
        </div>`),dayTasks.length?html+=dayTasks.map(t=>TC(t,!1)).join(""):html+=`<div class="planner-empty-card" style="background:var(--surface-container-lowest);border-radius:22px;padding:44px 16px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:10px;border:none;box-shadow:0 3px 14px -6px rgba(0,0,0,0.05);">
            <span class="material-symbols-outlined" style="font-size:44px;color:var(--outline-variant);">event_busy</span>
            <p style="font-size:14px;font-weight:600;color:var(--outline);margin:0;">Nessuna attivit\xE0 per questo giorno</p>
        </div>`,html+="</div>",window._plannerDayContentCache=html,html};function renderPlanner(){const today=new Date;today.setHours(0,0,0,0);const todayISO=getLocalDateString(today),selectedDate=state.selectedDate||todayISO,showSearchPanel=!!(state.plannerSearchOpen||(state.agendaSearchQuery||"").trim()||state.agendaSearchSubject&&state.agendaSearchSubject!=="all"),query=(state.agendaSearchQuery||"").toLowerCase().trim(),filterSubject=state.agendaSearchSubject||"all",MN=["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"],selDate=new Date(selectedDate+"T00:00:00"),dayLabels=["Dom","Lun","Mar","Mer","Gio","Ven","Sab"],TOTAL_WEEKS=5,CENTER_IDX=2,weeks=[];for(let w=-CENTER_IDX;w<=TOTAL_WEEKS-CENTER_IDX-1;w++){const wStart=new Date(selDate);wStart.setDate(selDate.getDate()-selDate.getDay()+w*7);const days=[];for(let i=0;i<7;i++){const d=new Date(wStart);d.setDate(wStart.getDate()+i);const iso=getLocalDateString(d);days.push({label:dayLabels[d.getDay()],dayNum:d.getDate(),iso,isToday:iso===todayISO,hasTask:(state.tasks||[]).some(t=>t.due_date===iso&&t.subject!=="QUEST")})}weeks.push(days)}const activeSlide=CENTER_IDX,allTasks=(state.tasks||[]).filter(t=>t.subject!=="QUEST"),subjects=[...new Set(allTasks.map(t=>t.subject||t.materia||"").filter(Boolean))].sort(),dayTasks=allTasks.filter(t=>t.due_date===selectedDate),upcomingCount=allTasks.filter(t=>{if(t.done)return!1;const d=parseLocalDate(t.due_date);return isNaN(d.getTime())?!1:(d-today)/864e5>0&&(d-today)/864e5<=7}).length,searchResults=showSearchPanel?allTasks.filter(t=>filterSubject!=="all"&&(t.subject||t.materia||"")!==filterSubject?!1:query?(t.subject||"").toLowerCase().includes(query)||(t.materia||"").toLowerCase().includes(query)||(t.text||"").toLowerCase().includes(query):!0).sort((a,b)=>(b.due_date||"").localeCompare(a.due_date||"")):[],monthLabel=`${MN[selDate.getMonth()]} ${selDate.getFullYear()}`;function TC(t,showDate){const isExam=t.isExam||t.type==="verifica"||/verifica|interrogazione|test|esame|simulazione/i.test(t.text||""),subj=escapeHtml(t.subject||t.materia||""),txt=escapeHtml(t.text||""),tid=escapeJsSingleQuote(t.id),theme=getSubjectTheme(t.subject||t.materia||""),canDel=typeof isUserGeneratedTaskId=="function"?isUserGeneratedTaskId(t.id):!1,dLabel=showDate&&t.due_date?(()=>{const d=new Date(t.due_date+"T00:00:00");return`<span style="font-size:10px;font-weight:700;color:rgba(218,226,253,0.6);display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em;">${d.getDate()} ${MN[d.getMonth()]}</span>`})():"",delBtn=canDel?`<button onclick="event.stopPropagation();deleteCalendarTask('${tid}');if(typeof window.updatePlannerSearchModalResults==='function')window.updatePlannerSearchModalResults();state._forceRender=true;scheduleRender(0);" style="width:30px;height:30px;border-radius:50%;background:rgba(255,59,48,0.2);border:1px solid rgba(255,59,48,0.3);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;"><span class="material-symbols-outlined" style="font-size:14px;color:#ffb4ab;">delete</span></button>`:"",rerender="if(typeof window.updatePlannerSearchModalResults==='function')window.updatePlannerSearchModalResults();state._forceRender=true;scheduleRender(0);";return isExam?`
        <div class="planner-task-exam" onclick="openTaskDetailModal('${tid}')" ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform='scale(1)'" style="background:linear-gradient(135deg, rgba(239,68,68,0.22) 0%, rgba(23,31,51,0.9) 100%);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid rgba(239,68,68,0.4);border-top:1px solid rgba(255,255,255,0.25);border-radius:20px;padding:14px 16px;position:relative;overflow:hidden;cursor:pointer;${t.done?"opacity:0.5;":""}box-shadow:0 0 20px rgba(239,68,68,0.25);transition:transform 0.12s ease;">
            <div style="position:absolute;top:-24px;right:-24px;width:80px;height:80px;background:rgba(239,68,68,0.25);border-radius:50%;filter:blur(16px);pointer-events:none;"></div>
            ${dLabel}
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;position:relative;z-index:1;">
                <div style="flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
                        <span style="font-size:10px;font-weight:800;color:${theme.color};text-transform:uppercase;letter-spacing:0.04em;">${subj}</span>
                    </div>
                    <p style="font-size:13px;font-weight:600;color:#dae2fd;margin:0 0 10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${t.done?"text-decoration:line-through;":""}">${txt}</p>
                </div>
                <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
                    ${delBtn}
                    <div onclick="event.stopPropagation();toggleTask('${tid}',event);${rerender}" style="width:36px;height:36px;border-radius:12px;background:rgba(239,68,68,0.25);border:1px solid rgba(239,68,68,0.4);display:flex;align-items:center;justify-content:center;color:#ffb4ab;cursor:pointer;" title="Segna come completato">
                        <i class="ph-bold ${t.done?"ph-check-circle":"ph-warning"}" style="font-size:18px;"></i>
                    </div>
                </div>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;position:relative;z-index:1;">
                <div style="display:inline-flex;background:rgba(239,68,68,0.3);color:#ffb4ab;font-size:9px;font-weight:800;padding:3px 8px;border-radius:999px;letter-spacing:0.05em;border:1px solid rgba(239,68,68,0.45);">VERIFICA${t.done?" \xB7 COMPLETATA":""}</div>
                <span style="font-size:11px;font-weight:600;color:rgba(182,196,255,0.7);display:flex;align-items:center;gap:2px;">Dettagli <i class="ph-bold ph-caret-right" style="font-size:12px;"></i></span>
            </div>
        </div>`:t.done?`
        <div class="planner-task-done" onclick="openTaskDetailModal('${tid}')" ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform='scale(1)'" style="background:rgba(23,31,51,0.7);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid rgba(182,196,255,0.1);border-radius:20px;padding:14px 16px;display:flex;align-items:center;gap:12px;opacity:0.55;cursor:pointer;transition:transform 0.12s ease;">
            <div onclick="event.stopPropagation();toggleTask('${tid}',event);${rerender}" style="width:40px;height:40px;flex-shrink:0;background:rgba(52,211,153,0.18);border:1px solid rgba(52,211,153,0.35);border-radius:12px;display:flex;align-items:center;justify-content:center;color:#34d399;cursor:pointer;" title="Riapri compito">
                <i class="ph-fill ph-check-circle" style="font-size:20px;"></i>
            </div>
            <div style="flex:1;min-width:0;">
                ${dLabel}
                <h3 style="font-size:13px;font-weight:800;color:${theme.color};text-decoration:line-through;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0 0 2px;">${subj}</h3>
                <p style="font-size:12px;color:rgba(196,197,214,0.6);text-decoration:line-through;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0;">${txt}</p>
            </div>
            ${delBtn}
            <i class="ph-bold ph-caret-right" style="font-size:16px;color:rgba(182,196,255,0.3);flex-shrink:0;"></i>
        </div>`:`
        <div class="planner-task-todo" onclick="openTaskDetailModal('${tid}')" ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform='scale(1)'" style="background:${theme.gradient};backdrop-filter:blur(28px);-webkit-backdrop-filter:blur(28px);border:1px solid ${theme.border};border-top:1px solid rgba(255,255,255,0.25);box-shadow:0 8px 24px -8px rgba(6,14,32,0.6), inset 0 1px 0 rgba(255,255,255,0.15);border-radius:20px;padding:14px 16px;display:flex;align-items:center;gap:12px;cursor:pointer;transition:transform 0.12s ease;">
            <div onclick="event.stopPropagation();toggleTask('${tid}',event);${rerender}" style="width:40px;height:40px;flex-shrink:0;background:${theme.iconBg};border:1px solid ${theme.border};border-radius:12px;display:flex;align-items:center;justify-content:center;color:${theme.color};cursor:pointer;transition:transform 0.15s ease;" ontouchstart="this.style.transform='scale(0.9)'" ontouchend="this.style.transform='scale(1)'" title="Segna come completato">
                <i class="ph-fill ${theme.icon}" style="font-size:20px;"></i>
            </div>
            <div style="flex:1;min-width:0;">
                ${dLabel}
                <h3 style="font-size:13px;font-weight:800;color:${theme.color};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0 0 2px;letter-spacing:0.02em;">${subj}</h3>
                <p style="font-size:13px;font-weight:500;color:#dae2fd;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0;line-height:1.35;">${txt}</p>
            </div>
            ${delBtn}
            <i class="ph-bold ph-caret-right" style="font-size:16px;color:rgba(182,196,255,0.4);flex-shrink:0;"></i>
        </div>`}window._plannerTC=TC,window._plannerMN=MN,window._plannerDayContentCache=null;function weekSlide(days,slideIdx){return`<div class="planner-week-slide" style="flex:0 0 100%;min-width:100%;width:100%;max-width:100%;display:flex;justify-content:space-between;gap:6px;padding:16px 20px 24px 20px;box-sizing:border-box;scroll-snap-align:start;scroll-snap-stop:always;">
            ${days.map(d=>{const isSel=d.iso===selectedDate,dayMood=typeof window.getDailyMoodForDate=="function"?window.getDailyMoodForDate(d.iso):null,indicatorHtml=dayMood?`<span style="font-size:14px;line-height:1;margin-top:5px;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.5));">${dayMood.emoji}</span>`:`<div class="planner-task-dot" data-has-task="${d.isToday||d.hasTask?"true":"false"}" style="width:5px;height:5px;border-radius:9999px;background:${d.isToday||d.hasTask?isSel?"#ffffff":"rgba(182,196,255,0.6)":"transparent"};margin-top:6px;"></div>`;return isSel?`<div class="planner-day-pill active-blue-glow squircle-full" onclick="plannerSelectDay('${d.iso}')" style="
                        flex:1 1 0%;min-width:0;height:96px;
                        display:flex;flex-direction:column;align-items:center;justify-content:center;
                        cursor:pointer;transition:transform 0.15s ease;
                        -webkit-tap-highlight-color:transparent;
                    " ontouchstart="this.style.transform='scale(0.95)'" ontouchend="this.style.transform='scale(1)'">
                        <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#ffffff;margin-bottom:4px;opacity:0.8;">${d.label}</span>
                        <span style="font-size:22px;font-weight:700;color:#ffffff;line-height:1;">${d.dayNum}</span>
                        ${indicatorHtml}
                    </div>`:`<div class="planner-day-pill liquid-glass-v8 rim-light squircle-full" onclick="plannerSelectDay('${d.iso}')" style="
                        flex:1 1 0%;min-width:0;height:96px;
                        display:flex;flex-direction:column;align-items:center;justify-content:center;
                        cursor:pointer;opacity:0.65;transition:transform 0.15s ease, opacity 0.15s ease;
                        -webkit-tap-highlight-color:transparent;
                    " ontouchstart="this.style.transform='scale(0.95)'" ontouchend="this.style.transform='scale(1)'">
                        <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#c4c5d6;margin-bottom:4px;">${d.label}</span>
                        <span style="font-size:20px;font-weight:700;color:#dae2fd;line-height:1;">${d.dayNum}</span>
                        ${indicatorHtml}
                    </div>`}).join("")}
        </div>`}const dotsHtml=weeks.map((_,i)=>`
        <div class="planner-week-dot" data-idx="${i}" style="
            width:${i===activeSlide?"20px":"6px"};height:6px;border-radius:9999px;
            background:${i===activeSlide?"rgba(47,88,205,0.8)":"rgba(255,255,255,0.2)"};
            transition:all 0.3s ease;cursor:pointer;
        " onclick="plannerJumpToWeek(${i})"></div>
    `).join("");return window._plannerInitialSlide=activeSlide,`
    <div class="view-fullbleed planner-view min-h-screen pb-40" style="padding:0;background:var(--bg-base, #050811);">

        <!-- \u2550\u2550 HEADER (iOS HIG Large Title) \u2550\u2550 -->
        <header class="ios-header-wrapper" style="display:flex;justify-content:space-between;align-items:flex-end;padding:max(env(safe-area-inset-top,0px),24px) 20px 16px;">
            <div>
                <div class="ios-sub-title">AGENDA SCOLASTICA</div>
                <h1 class="ios-large-title">Planner</h1>
            </div>
            <button onclick="if(typeof window.triggerHaptic==='function')window.triggerHaptic('light');window.openPlannerMonthPicker()" class="liquid-glass-v8 rim-light squircle-full shadow-lg" style="display:flex;align-items:center;gap:6px;padding:8px 16px;border:none;cursor:pointer;backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);" ontouchstart="this.style.transform='scale(0.95)'" ontouchend="this.style.transform='scale(1)'">
                <i class="ph ph-calendar-blank text-[18px] text-[rgba(218,226,253,0.8)]"></i>
                <span style="font-size:14px;font-weight:600;color:var(--text-primary);letter-spacing:0.02em;">${monthLabel}</span>
            </button>
        </header>

        <!-- \u2550\u2550 SEARCH TRIGGER (Apple Liquid Glass Spotlight Button) \u2550\u2550 -->
        <div style="padding:0 20px 16px;">
            <div onclick="if(typeof window.triggerHaptic==='function')window.triggerHaptic('light');window.openPlannerSearchModal&&window.openPlannerSearchModal();"
                class="liquid-glass-v8 squircle-md rim-light"
                style="padding:13px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer;background:rgba(20,31,54,0.75);border:0.5px solid rgba(255,255,255,0.12);border-top:1px solid rgba(255,255,255,0.22);border-radius:20px;box-shadow:0 4px 20px -6px rgba(0,0,0,0.3);transition:transform 0.15s ease;"
                ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform='scale(1)'">
                <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
                    <i class="ph ph-magnifying-glass" style="font-size:18px;color:#2997ff;flex-shrink:0;"></i>
                    <span style="font-size:14px;color:rgba(255,255,255,0.55);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:'Inter',sans-serif;">Cerca compiti, verifiche o filtra per materia...</span>
                </div>
                <div style="display:flex;align-items:center;gap:5px;background:rgba(41,151,255,0.12);border:0.5px solid rgba(41,151,255,0.25);border-radius:999px;padding:4px 10px;flex-shrink:0;">
                    <i class="ph-bold ph-funnel" style="font-size:12px;color:#2997ff;"></i>
                    <span style="font-size:11px;font-weight:700;color:#2997ff;">Filtri</span>
                </div>
            </div>
        </div>

        <!-- \u2550\u2550 WEEK CAROUSEL (Liquid Glass Capsules) \u2550\u2550 -->
       <div id="planner-week-carousel" style="
            display:flex;
            overflow-x:auto;
            scroll-snap-type:x mandatory;
            -webkit-overflow-scrolling:touch;
            overscroll-behavior-x:contain;
            scrollbar-width:none;
            -ms-overflow-style:none;
            gap:0;
            margin:-12px 0 -12px;
            padding:12px 0;
            width:100%;
        " onscroll="handlePlannerCarouselScroll(this)">
            ${weeks.map((wk,i)=>weekSlide(wk,i)).join("")}
        </div>

        <!-- Dot indicators -->
        <div style="display:flex;justify-content:center;align-items:center;gap:6px;margin:12px 0 20px;">
            ${dotsHtml}
        </div>

        <!-- \u2550\u2550 DAY CONTENT \u2550\u2550 -->
        <div id="planner-content-area" style="padding:0 20px 140px 20px;">
            <div style="display:flex;flex-direction:column;gap:16px;">

                <!-- Selected day header -->
                <div style="display:flex;align-items:center;justify-content:space-between;padding:0 4px;">
                    <h2 style="font-size:18px;font-weight:600;color:rgba(218,226,253,0.9);margin:0;line-height:1.2;" class="sentence-case">
                        ${(()=>{const d=new Date(selectedDate+"T00:00:00"),diff=Math.round((d-today)/864e5),base=`${dayLabels[d.getDay()]} ${d.getDate()} ${MN[d.getMonth()]}`;return diff===0?`Oggi \xB7 ${base}`:diff===1?`Domani \xB7 ${base}`:diff===-1?`Ieri \xB7 ${base}`:base})()}
                    </h2>
                    <span style="font-size:12px;font-weight:500;color:rgba(196,197,214,0.6);">${dayTasks.length} ${dayTasks.length===1?"evento":"eventi"}</span>
                </div>

                ${upcomingCount>0&&selectedDate===todayISO?`
                <div class="liquid-glass-v8 squircle-md rim-light" style="padding:16px 18px;background:linear-gradient(135deg, rgba(47,88,205,0.2) 0%, rgba(255,255,255,0.02) 100%);">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
                        <div style="width:32px;height:32px;border-radius:50%;background:#2f58cd;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><span class="material-symbols-outlined" style="font-size:16px;color:white;font-variation-settings:'FILL' 1;">lightbulb</span></div>
                        <span style="font-size:14px;font-weight:700;color:#dae2fd;">Smart Planner</span>
                    </div>
                    <p style="font-size:13px;color:rgba(196,197,214,0.8);line-height:1.5;margin:0 0 8px;">Hai <strong>${upcomingCount}</strong> compiti nei prossimi 7 giorni.</p>
                    <button onclick="window.openPlannerSearchModal&&window.openPlannerSearchModal();" style="color:#b6c4ff;font-weight:600;font-size:12px;background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:4px;font-family:'Inter',sans-serif;padding:0;">Cerca & Filtra tutti <span class="material-symbols-outlined" style="font-size:14px;">arrow_forward</span></button>
                </div>`:""}

                ${dayTasks.length?`<div style="display:flex;flex-direction:column;gap:12px;">${dayTasks.map(t=>TC(t,!1)).join("")}</div>`:`
                <!-- Empty State Bento Card (Apple Liquid Glass) -->
                <div class="liquid-glass-v8 squircle-lg rim-light" style="padding:40px 20px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;min-height:280px;background:rgba(20,31,54,0.6);border-radius:28px;border:0.5px solid rgba(255,255,255,0.1);">
                    <div style="position:relative;margin-bottom:20px;">
                        <div style="position:absolute;inset:0;background:rgba(41,151,255,0.2);filter:blur(24px);border-radius:9999px;"></div>
                        <div style="position:relative;width:72px;height:72px;border-radius:22px;background:rgba(41,151,255,0.1);border:1px solid rgba(41,151,255,0.25);display:flex;align-items:center;justify-content:center;color:#2997ff;">
                            <i class="ph ph-calendar-x" style="font-size:36px;"></i>
                        </div>
                    </div>
                    <h4 style="font-size:16px;font-weight:700;color:#ffffff;margin:0 0 4px;">Nessuna attivit\xE0</h4>
                    <p style="font-size:13px;font-weight:500;color:rgba(255,255,255,0.5);max-width:240px;line-height:1.5;margin:0;">
                        Nessun compito o verifica programmata per questo giorno.
                    </p>
                </div>`}
            </div>
        </div><!-- /planner-content-area -->

        <!-- \u2550\u2550 FLOATING ACTIONS (Apple Liquid Glass Aligned Dock) \u2550\u2550 -->
        <div style="position:fixed;bottom:calc(110px + env(safe-area-inset-bottom,0px));right:20px;display:flex;flex-direction:column;align-items:center;gap:12px;z-index:40;">
            <button onclick="window.openClassActivitiesExportModal&&openClassActivitiesExportModal();" title="Esporta attivit\xE0" class="liquid-glass-v8 rim-light shadow-lg" style="width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:0.5px solid rgba(255,255,255,0.18);border-top:1px solid rgba(255,255,255,0.3);background:rgba(20,31,54,0.85);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);color:#2997ff;cursor:pointer;transition:transform 0.15s ease;box-shadow:0 8px 24px -4px rgba(0,0,0,0.5);" ontouchstart="this.style.transform='scale(0.9)'" ontouchend="this.style.transform='scale(1)'">
                <i class="ph-bold ph-export" style="font-size:20px;"></i>
            </button>
            <button onclick="showQuickAddTaskModal()" title="Aggiungi attivit\xE0" class="shadow-2xl" style="width:54px;height:54px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,0.35);background:linear-gradient(135deg,#2997ff 0%,#0058bc 100%);color:#ffffff;cursor:pointer;transition:transform 0.15s ease;box-shadow:0 8px 28px rgba(41,151,255,0.5);" ontouchstart="this.style.transform='scale(0.92)'" ontouchend="this.style.transform='scale(1)'">
                <i class="ph-bold ph-plus" style="font-size:26px;"></i>
            </button>
        </div>

    </div>`}function getEffectiveUserClass(){const override=localStorage.getItem(lsKey("user_class_override"));if(override){const normOverride=typeof normalizeClassUi=="function"?normalizeClassUi(override):override;if(normOverride&&normOverride!=="N/D"&&normOverride!=="Studente")return normOverride.trim().toUpperCase()}const savedSession=typeof sessionManager<"u"&&sessionManager.load?sessionManager.load():null,candidates=[{c:state.user?.class,t:state.user?.specialization},{c:state.userData?.class,t:state.userData?.specialization},{c:savedSession?.class,t:savedSession?.specialization},{c:localStorage.getItem(lsKey("cached_user_class")),t:null}];for(const cand of candidates)if(cand.c&&cand.c!=="..."&&cand.c!=="N/D"&&cand.c!=="Studente"){const norm=typeof normalizeClassUi=="function"?normalizeClassUi(cand.c,cand.t):cand.c;if(norm&&norm!=="..."&&norm!=="N/D"&&norm!=="Studente"){const res=norm.trim().toUpperCase();try{localStorage.setItem(lsKey("cached_user_class"),res)}catch{}return res}}return""}function getClassCacheKey(kind,className){const session=window.sessionManager?.load()||{},year=typeof getCurrentSchoolYearKey=="function"?getCurrentSchoolYearKey():String(new Date().getFullYear());return lsKey(`class_${kind}:${session.schoolCode||""}:${year}:${(className||"DEFAULT").toUpperCase()}`)}function getClassRepresentativeStorageKey(className){return getClassCacheKey("reps",className)}function getClassProposalsStorageKey(className){return getClassCacheKey("proposals",className)}function getStoredClassRepresentatives(className){const key=getClassRepresentativeStorageKey(className);try{const data=JSON.parse(localStorage.getItem(key));return Array.isArray(data)?data:[]}catch{return[]}}function saveStoredClassRepresentatives(className,reps){const key=getClassRepresentativeStorageKey(className);localStorage.setItem(key,JSON.stringify(reps||[]))}function getStoredClassProposals(className){const key=getClassProposalsStorageKey(className);try{const data=JSON.parse(localStorage.getItem(key));if(Array.isArray(data))return data}catch{}return[]}function saveStoredClassProposals(className,props){const key=getClassProposalsStorageKey(className);localStorage.setItem(key,JSON.stringify(props||[]))}function getClassRepAuthInfo(){let session=null;typeof sessionManager<"u"&&sessionManager.load?session=sessionManager.load():typeof window.sessionManager<"u"&&window.sessionManager.load&&(session=window.sessionManager.load());const userId=(typeof window.getUserId=="function"?window.getUserId():null)||session&&(session.studentId||session.userId||session.pid)||state.user&&state.user.id||"guest",userName=state.user&&state.user.name&&state.user.name!=="Studente"?state.user.name:session&&session.userName||state.user&&state.user.name||"Studente";let headers=typeof window.getSessionHeaders=="function"?window.getSessionHeaders():{"Content-Type":"application/json"};if(!headers["x-session-token"]){const token=typeof state<"u"&&state.sessionToken||session&&session.sessionToken||localStorage.getItem("gc_cached_session_token")||"";token&&(headers["x-session-token"]=token)}return headers["x-user-id"]=userId,{userId,userName,headers}}function isCurrentUserRepresentative(){const userClass=getEffectiveUserClass();if(!userClass)return!1;const{userId}=getClassRepAuthInfo();return getStoredClassRepresentatives(userClass).some(r=>String(r.userId||r.user_id)===String(userId))}window._classRealtimeChannel=null,window._classRealtimeSubscribedClass=null,window._isFetchingClassData=!1,window._fetchClassDataSilent=async function(className){const isCurrent=ClientRuntime.capture(),targetClass=className||getEffectiveUserClass();if(targetClass&&!window._isFetchingClassDataSilent){window._isFetchingClassDataSilent=!0;try{const apiBase=window.API_BASE_URL||(typeof API_BASE_URL<"u"?API_BASE_URL:""),json=await(await fetchWithDeadline(`${apiBase}/api/class-representative?class=${encodeURIComponent(targetClass)}`,{headers:getClassRepAuthInfo().headers})).json();if(!isCurrent())return;if(json&&json.success){let changed=!1;Array.isArray(json.representatives)&&JSON.stringify(getStoredClassRepresentatives(targetClass))!==JSON.stringify(json.representatives)&&(saveStoredClassRepresentatives(targetClass,json.representatives),changed=!0),Array.isArray(json.proposals)&&JSON.stringify(getStoredClassProposals(targetClass))!==JSON.stringify(json.proposals)&&(saveStoredClassProposals(targetClass,json.proposals),changed=!0),changed&&(typeof window.updateTodayStoriesTray=="function"&&window.updateTodayStoriesTray(),state._forceRender=!0,scheduleRender(0))}}catch(err){console.warn("[ClassDataSync] Silent fetch failed:",err.message)}finally{window._isFetchingClassDataSilent=!1}}},window.fetchRemoteClassData=async function(className,forceRender=!1){const isCurrent=ClientRuntime.capture(),targetClass=className||getEffectiveUserClass();if(targetClass&&!window._isFetchingClassData){window._isFetchingClassData=!0;try{const apiBase=window.API_BASE_URL||(typeof API_BASE_URL<"u"?API_BASE_URL:""),json=await(await fetchWithDeadline(`${apiBase}/api/class-representative?class=${encodeURIComponent(targetClass)}`,{headers:getClassRepAuthInfo().headers})).json();if(!isCurrent())return;if(json&&json.success)if(Array.isArray(json.representatives)&&saveStoredClassRepresentatives(targetClass,json.representatives),Array.isArray(json.proposals)&&saveStoredClassProposals(targetClass,json.proposals),typeof window.updateTodayStoriesTray=="function"&&window.updateTodayStoriesTray(),document.getElementById("today-notif-overlay")&&typeof window.openTodayNotifications=="function"){const currentScroll=document.getElementById("today-notif-overlay")?.querySelector('[style*="overflow-y"]')?.scrollTop||0;window.openTodayNotifications();const updatedScroll=document.getElementById("today-notif-overlay")?.querySelector('[style*="overflow-y"]');updatedScroll&&currentScroll>0&&(updatedScroll.scrollTop=currentScroll)}else forceRender&&(state._forceRender=!0,scheduleRender(0))}catch(err){console.warn("[ClassDataSync] Remote fetch failed:",err.message)}finally{window._isFetchingClassData=!1}}},window.setupClassRealtimeSubscription=async function(){clearInterval(window._classPollTimer);const userId=getClassRepAuthInfo().userId;window._classPollTimer=setInterval(()=>{state.isLoggedIn&&document.visibilityState==="visible"&&getClassRepAuthInfo().userId===userId&&window._fetchClassDataSilent(getEffectiveUserClass())},6e4)},window.toggleClassRepresentative=async function(enable){typeof window.triggerHaptic=="function"&&window.triggerHaptic("light");let userClass=getEffectiveUserClass();if(!userClass){window.promptSetUserClass(enteredClass=>{enteredClass&&window.toggleClassRepresentative(enable)});return}const{userId,userName,headers}=getClassRepAuthInfo(),currentReps=getStoredClassRepresentatives(userClass);if(enable){if(!currentReps.some(r=>String(r.userId||r.user_id)===String(userId))){if(currentReps.length>=2){typeof window.triggerHaptic=="function"&&window.triggerHaptic("error"),alert("Limite massimo raggiunto (2/2 Rappresentanti attivi per questa classe). Uno dei rappresentanti attuali deve prima disattivare il proprio ruolo."),state._forceRender=!0,scheduleRender(0);return}currentReps.push({userId,name:userName,class:userClass,updatedAt:new Date().toISOString()}),saveStoredClassRepresentatives(userClass,currentReps),showToast("Ruolo Rappresentante di Classe attivato!","success")}}else{const updated=currentReps.filter(r=>String(r.userId||r.user_id)!==String(userId));saveStoredClassRepresentatives(userClass,updated),showToast("Ruolo Rappresentante disattivato","info")}try{const apiBase=window.API_BASE_URL||(typeof API_BASE_URL<"u"?API_BASE_URL:""),json=await(await fetchWithDeadline(`${apiBase}/api/class-representative`,{method:"POST",headers,body:JSON.stringify({action:"set_representative",class:userClass,userId,userName,enable})})).json().catch(()=>({}));if(json.limitReached){typeof window.triggerHaptic=="function"&&window.triggerHaptic("error"),alert(json.error||"Limite massimo raggiunto (2/2 Rappresentanti attivi per questa classe).");const reverted=currentReps.filter(r=>String(r.userId||r.user_id)!==String(userId));saveStoredClassRepresentatives(userClass,reverted)}else json.success&&Array.isArray(json.representatives)&&saveStoredClassRepresentatives(userClass,json.representatives)}catch(e){console.warn("[ClassRep] Sync error:",e.message)}state._forceRender=!0,scheduleRender(0)},window.promptSetUserClass=function(callback){typeof window.triggerHaptic=="function"&&window.triggerHaptic("light");const overlay=document.createElement("div");overlay.id="set-class-modal-overlay",overlay.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,0.65);backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px) saturate(180%);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;transition:opacity 0.2s ease;";const currentCls=getEffectiveUserClass();overlay.innerHTML=`
    <div style="width:100%;max-width:380px;background:rgba(20,31,54,0.88);backdrop-filter:blur(30px) saturate(190%);-webkit-backdrop-filter:blur(30px) saturate(190%);border:0.5px solid rgba(255,255,255,0.15);border-top:1px solid rgba(255,255,255,0.25);border-radius:28px;padding:24px;box-shadow:0 20px 50px rgba(0,0,0,0.6);display:flex;flex-direction:column;gap:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="display:flex;align-items:center;gap:10px;">
                <div style="width:38px;height:38px;border-radius:12px;background:rgba(41,151,255,0.15);border:1px solid rgba(41,151,255,0.3);display:flex;align-items:center;justify-content:center;color:#2997ff;">
                    <i class="ph-fill ph-graduation-cap text-[20px]"></i>
                </div>
                <h3 style="font-size:18px;font-weight:700;color:#ffffff;margin:0;">Seleziona Classe</h3>
            </div>
            <button onclick="document.getElementById('set-class-modal-overlay')?.remove();" style="width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,0.08);border:none;color:rgba(255,255,255,0.6);display:flex;align-items:center;justify-content:center;cursor:pointer;">
                <span class="material-symbols-outlined" style="font-size:18px;">close</span>
            </button>
        </div>
        <p style="font-size:13px;color:rgba(255,255,255,0.7);line-height:1.45;margin:0;">
            Non siamo riusciti a rilevare automaticamente la tua classe dal registro. Inserisci la tua classe e indirizzo (es. <strong>4D (SA)</strong>, <strong>5A (LS)</strong>, <strong>3B</strong>) per attivare le funzioni di classe.
        </p>
        <div>
            <label style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:6px;">Nome Classe e Indirizzo</label>
            <input id="user-manual-class-input" type="text" placeholder="Es. 4D (SA)" value="${escapeHtml(currentCls)}" style="width:100%;height:46px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);border-radius:14px;padding:0 14px;color:#ffffff;font-size:16px;font-weight:700;outline:none;box-sizing:border-box;text-transform:uppercase;" />
        </div>
        <div style="display:flex;gap:10px;margin-top:6px;">
            <button onclick="document.getElementById('set-class-modal-overlay')?.remove();" style="flex:1;height:46px;border-radius:14px;background:rgba(255,255,255,0.08);border:0.5px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.8);font-size:14px;font-weight:600;cursor:pointer;">Annulla</button>
            <button id="save-manual-class-btn" style="flex:1;height:46px;border-radius:14px;background:#2997ff;border:none;color:#ffffff;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 4px 14px rgba(41,151,255,0.4);">Salva</button>
        </div>
    </div>
    `,document.body.appendChild(overlay),requestAnimationFrame(()=>{overlay.style.opacity="1"}),document.getElementById("save-manual-class-btn").onclick=function(){const val=(document.getElementById("user-manual-class-input")?.value||"").trim().toUpperCase();if(!val){alert("Inserisci una classe valida (es. 4D (SA))");return}const normVal=typeof normalizeClassUi=="function"&&normalizeClassUi(val)||val;state.user||(state.user={}),state.user.class=normVal,localStorage.setItem(lsKey("user_class_override"),normVal),showToast(`Classe impostata: ${normVal}`,"success"),overlay.remove(),typeof callback=="function"&&callback(normVal),state._forceRender=!0,scheduleRender(0)}},window._modalCalStates={},window._createModalCalendarState=function(initialIso){const sel=new Date((initialIso||getLocalDateString(new Date))+"T00:00:00");return{selectedIso:initialIso||getLocalDateString(new Date),year:sel.getFullYear(),month:sel.getMonth()}},window._renderInlineCalendarHTML=function(containerId){const calState=window._modalCalStates[containerId];if(!calState)return"";const MN_FULL=["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"],{year,month,selectedIso}=calState,todayISO=getLocalDateString(new Date),firstDay=new Date(year,month,1),lastDay=new Date(year,month+1,0),startDow=(firstDay.getDay()+6)%7,cells=[];for(let i=0;i<startDow;i++)cells.push("<div></div>");for(let d=1;d<=lastDay.getDate();d++){const iso=year+"-"+String(month+1).padStart(2,"0")+"-"+String(d).padStart(2,"0"),isToday=iso===todayISO,isSel=iso===selectedIso,hasVerif=(state.verifiche||[]).some(function(v){return(v.data||v.date||"")===iso}),hasTask=(state.tasks||[]).some(function(t){return t.due_date===iso&&t.subject!=="QUEST"&&!t.done}),dotColor=hasVerif?"#ff453a":"#2997ff";let bg="transparent",color="#ffffff",fw="500",ring="none",shadow="none";isSel?(bg="#2997ff",color="#ffffff",fw="700",shadow="0 4px 12px rgba(41,151,255,0.45)"):isToday&&(bg="rgba(41,151,255,0.15)",color="#2997ff",fw="700",ring="1px solid rgba(41,151,255,0.3)");const dot=(hasTask||hasVerif)&&!isSel?'<span style="position:absolute;bottom:3px;left:50%;transform:translateX(-50%);width:4px;height:4px;border-radius:50%;display:block;background:'+dotColor+';"></span>':"";cells.push(`<button type="button" onclick="window._onModalCalSelect('`+containerId+"','"+iso+`')" style="position:relative;width:100%;aspect-ratio:1/1;border-radius:50%;border:`+ring+";cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;background:"+bg+";box-shadow:"+shadow+";font-size:13px;font-weight:"+fw+";color:"+color+`;font-family:'Inter',sans-serif;transition:transform 0.1s ease;-webkit-tap-highlight-color:transparent;" ontouchstart="this.style.transform='scale(0.88)'" ontouchend="this.style.transform='scale(1)'">`+d+dot+"</button>")}const dayVerifiche=(state.verifiche||[]).concat(state.manualVerifiche||[]).filter(v=>(v.data||v.date||"")===selectedIso),dayTasks=(state.tasks||[]).filter(t=>t.due_date===selectedIso&&t.subject!=="QUEST"&&!t.done);let eventsInfo="";return dayVerifiche.length>0?eventsInfo=`<div style="display:flex;align-items:center;gap:6px;color:#ff453a;font-size:11px;font-weight:600;"><span class="material-symbols-outlined" style="font-size:15px;">warning</span> Verifica: ${escapeHtml(dayVerifiche.map(v=>v.materia||v.subject).join(", "))}</div>`:dayTasks.length>0?eventsInfo=`<div style="display:flex;align-items:center;gap:6px;color:#2997ff;font-size:11px;font-weight:600;"><span class="material-symbols-outlined" style="font-size:15px;">assignment</span> ${dayTasks.length} compiti</div>`:eventsInfo='<div style="display:flex;align-items:center;gap:6px;color:#30d158;font-size:11px;font-weight:600;"><span class="material-symbols-outlined" style="font-size:15px;">check_circle</span> Nessun impegno</div>',`
    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:12px 14px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <button type="button" onclick="window._onModalCalNav('${containerId}', -1)" style="width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,0.08);border:none;color:#2997ff;display:flex;align-items:center;justify-content:center;cursor:pointer;">
                <span class="material-symbols-outlined" style="font-size:18px;">chevron_left</span>
            </button>
            <div style="font-size:14px;font-weight:700;color:#ffffff;">${MN_FULL[month]} ${year}</div>
            <button type="button" onclick="window._onModalCalNav('${containerId}', 1)" style="width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,0.08);border:none;color:#2997ff;display:flex;align-items:center;justify-content:center;cursor:pointer;">
                <span class="material-symbols-outlined" style="font-size:18px;">chevron_right</span>
            </button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,0.45);margin-bottom:6px;">
            ${["L","M","M","G","V","S","D"].map(l=>`<div>${l}</div>`).join("")}
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:10px;">
            ${cells.join("")}
        </div>
        <div style="padding-top:8px;border-top:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
            <span style="font-size:11px;color:rgba(255,255,255,0.7);">Data: <strong style="color:#2997ff;">${selectedIso}</strong></span>
            ${eventsInfo}
        </div>
    </div>
    `},window._onModalCalNav=function(containerId,delta){typeof window.triggerHaptic=="function"&&window.triggerHaptic("light");const calState=window._modalCalStates[containerId];if(!calState)return;calState.month+=delta,calState.month<0&&(calState.month=11,calState.year--),calState.month>11&&(calState.month=0,calState.year++);const el=document.getElementById(containerId);el&&(el.innerHTML=window._renderInlineCalendarHTML(containerId))},window._onModalCalSelect=function(containerId,iso){typeof window.triggerHaptic=="function"&&window.triggerHaptic("light");const calState=window._modalCalStates[containerId];if(!calState)return;calState.selectedIso=iso;const el=document.getElementById(containerId);el&&(el.innerHTML=window._renderInlineCalendarHTML(containerId))},window._selectedAssemblyHours=["4\xAA Ora","5\xAA Ora"],window._toggleAssemblyHour=function(hour){typeof window.triggerHaptic=="function"&&window.triggerHaptic("light"),Array.isArray(window._selectedAssemblyHours)||(window._selectedAssemblyHours=[]);const idx=window._selectedAssemblyHours.indexOf(hour);idx>=0?window._selectedAssemblyHours.splice(idx,1):(window._selectedAssemblyHours.length>=2&&window._selectedAssemblyHours.shift(),window._selectedAssemblyHours.push(hour)),window._updateAssemblyHoursUI()},window._updateAssemblyHoursUI=function(){["1\xAA Ora","2\xAA Ora","3\xAA Ora","4\xAA Ora","5\xAA Ora"].forEach(h=>{const btn=document.getElementById("ashour-btn-"+h.replace(/\s/g,""));if(btn){const isSel=(window._selectedAssemblyHours||[]).includes(h);btn.style.background=isSel?"#30d158":"rgba(255,255,255,0.08)",btn.style.color=isSel?"#ffffff":"rgba(255,255,255,0.8)",btn.style.borderColor=isSel?"#30d158":"rgba(255,255,255,0.15)"}});const label=document.getElementById("ashour-selected-label");if(label){const count=(window._selectedAssemblyHours||[]).length;label.textContent=count>0?`Selezionate: ${window._selectedAssemblyHours.join(", ")} (${count}/2 ore)`:"Nessuna ora selezionata (seleziona max 2)"}},window.openRequestAssemblyModal=function(){typeof window.triggerHaptic=="function"&&window.triggerHaptic("light");let userClass=getEffectiveUserClass();if(!userClass){window.promptSetUserClass(cls=>{cls&&window.openRequestAssemblyModal()});return}const defaultDate=state.selectedDate||getLocalDateString(new Date);window._modalCalStates["assembly-cal-container"]=window._createModalCalendarState(defaultDate),window._selectedAssemblyHours=["4\xAA Ora","5\xAA Ora"];const overlay=document.createElement("div");overlay.id="request-assembly-modal",overlay.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,0.65);backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px) saturate(180%);z-index:99999;display:flex;align-items:flex-end;justify-content:center;padding:0;opacity:0;transition:opacity 0.2s ease;",overlay.onclick=function(e){e.target===overlay&&overlay.remove()};const hoursChips=["1\xAA Ora","2\xAA Ora","3\xAA Ora","4\xAA Ora","5\xAA Ora"].map(h=>{const isSel=window._selectedAssemblyHours.includes(h);return`<button type="button" id="ashour-btn-${h.replace(/\s/g,"")}" onclick="window._toggleAssemblyHour('${h}')" style="flex:1;min-height:44px;border-radius:12px;border:1px solid ${isSel?"#30d158":"rgba(255,255,255,0.15)"};background:${isSel?"#30d158":"rgba(255,255,255,0.08)"};color:${isSel?"#ffffff":"rgba(255,255,255,0.8)"};font-size:12px;font-weight:700;cursor:pointer;transition:all 0.15s ease;-webkit-tap-highlight-color:transparent;">${h}</button>`}).join("");overlay.innerHTML=`
    <div style="width:100%;max-width:440px;max-height:88dvh;overflow-y:auto;background:rgba(20,31,54,0.92);backdrop-filter:blur(30px) saturate(190%);-webkit-backdrop-filter:blur(30px) saturate(190%);border-top:1px solid rgba(255,255,255,0.22);border-radius:32px 32px 0 0;padding:20px 20px calc(28px + env(safe-area-inset-bottom,0px));box-shadow:0 -10px 40px rgba(0,0,0,0.5);display:flex;flex-direction:column;gap:16px;box-sizing:border-box;">
        <div data-drag-handle style="display:flex;justify-content:center;padding:4px 0 6px;cursor:grab;">
            <div style="width:40px;height:4px;border-radius:999px;background:rgba(255,255,255,0.25);"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="display:flex;align-items:center;gap:10px;">
                <div style="width:40px;height:40px;border-radius:12px;background:rgba(48,209,88,0.15);border:1px solid rgba(48,209,88,0.3);display:flex;align-items:center;justify-content:center;color:#30d158;">
                    <i class="ph-fill ph-users-three text-[22px]"></i>
                </div>
                <div>
                    <h3 style="font-size:18px;font-weight:700;color:#ffffff;margin:0;">Richiedi Assemblea</h3>
                    <p style="font-size:12px;color:rgba(255,255,255,0.6);margin:2px 0 0;">Classe ${escapeHtml(userClass)}</p>
                </div>
            </div>
            <button onclick="document.getElementById('request-assembly-modal')?.remove();" style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.08);border:none;color:rgba(255,255,255,0.7);display:flex;align-items:center;justify-content:center;cursor:pointer;">
                <span class="material-symbols-outlined" style="font-size:20px;">close</span>
            </button>
        </div>

        <!-- Selettore Data con Calendario e Indicatori Verifiche/Compiti -->
        <div>
            <label style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:6px;">Scegli Data Assemblea</label>
            <div id="assembly-cal-container">
                ${window._renderInlineCalendarHTML("assembly-cal-container")}
            </div>
        </div>

        <!-- Selettore 5 Ore Scolastiche (Max 2 ore) -->
        <div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <label style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.06em;margin:0;">Ore Assemblea (Max 2 ore)</label>
                <span id="ashour-selected-label" style="font-size:11px;color:#30d158;font-weight:600;">Selezionate: 4\xAA Ora, 5\xAA Ora (2/2)</span>
            </div>
            <div style="display:flex;gap:6px;">
                ${hoursChips}
            </div>
        </div>

        <div>
            <label style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:6px;">Ordine del Giorno / Motivazione</label>
            <textarea id="assembly-reason-input" placeholder="Es. Discussione gita scolastica, organizzazione eventi..." rows="3" style="width:100%;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);border-radius:14px;padding:12px 14px;color:#ffffff;font-size:14px;font-weight:500;outline:none;box-sizing:border-box;resize:none;line-height:1.4;"></textarea>
        </div>

        <button id="submit-assembly-btn" style="width:100%;min-height:50px;border-radius:16px;background:linear-gradient(180deg,#30d158 0%,#28b84d 100%);border:none;color:#ffffff;font-size:15px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 6px 20px rgba(48,209,88,0.35);margin-top:4px;">
            <i class="ph-bold ph-paper-plane-tilt text-[18px]"></i>
            Invia Richiesta alla Classe
        </button>
    </div>
    `,document.body.appendChild(overlay),requestAnimationFrame(()=>{overlay.style.opacity="1"}),document.getElementById("submit-assembly-btn").onclick=function(){const targetDate=window._modalCalStates["assembly-cal-container"]?.selectedIso||defaultDate,selectedHours=window._selectedAssemblyHours||[],reason=(document.getElementById("assembly-reason-input")?.value||"").trim();if(!targetDate){alert("Seleziona una data per l'assemblea");return}if(!selectedHours.length){alert("Seleziona almeno 1 ora scolastica (max 2)");return}if(!reason){alert("Inserisci l'ordine del giorno o la motivazione");return}typeof window.triggerHaptic=="function"&&window.triggerHaptic("medium"),window.submitClassProposal({type:"assembly",class:userClass,targetDate,duration:selectedHours.join(", "),reason}),overlay.remove(),showToast("Richiesta assemblea inviata ai compagni e rappresentanti!","success")}},window.openRescheduleExamModal=function(){typeof window.triggerHaptic=="function"&&window.triggerHaptic("light");let userClass=getEffectiveUserClass();if(!userClass){window.promptSetUserClass(cls=>{cls&&window.openRescheduleExamModal()});return}const defaultDate=state.selectedDate||getLocalDateString(new Date);window._modalCalStates["reschedule-cal-container"]=window._createModalCalendarState(defaultDate);const subjectOptions=(state.verifiche||[]).concat(state.manualVerifiche||[]).filter(v=>(v.data||v.date||"")>=getLocalDateString(new Date)).map(v=>({id:v.id,subject:v.materia||v.subject||"Verifica",date:v.data||v.date||"",desc:v.text||v.descrizione||v.args||""})).map(v=>`<option value="${escapeHtml(v.subject)}||${escapeHtml(v.date)}">${escapeHtml(v.subject)} (${v.date})</option>`).join(""),overlay=document.createElement("div");overlay.id="reschedule-exam-modal",overlay.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,0.65);backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px) saturate(180%);z-index:99999;display:flex;align-items:flex-end;justify-content:center;padding:0;opacity:0;transition:opacity 0.2s ease;",overlay.onclick=function(e){e.target===overlay&&overlay.remove()},overlay.innerHTML=`
    <div style="width:100%;max-width:440px;max-height:88dvh;overflow-y:auto;background:rgba(20,31,54,0.92);backdrop-filter:blur(30px) saturate(190%);-webkit-backdrop-filter:blur(30px) saturate(190%);border-top:1px solid rgba(255,255,255,0.22);border-radius:32px 32px 0 0;padding:20px 20px calc(28px + env(safe-area-inset-bottom,0px));box-shadow:0 -10px 40px rgba(0,0,0,0.5);display:flex;flex-direction:column;gap:16px;box-sizing:border-box;">
        <div data-drag-handle style="display:flex;justify-content:center;padding:4px 0 6px;cursor:grab;">
            <div style="width:40px;height:4px;border-radius:999px;background:rgba(255,255,255,0.25);"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="display:flex;align-items:center;gap:10px;">
                <div style="width:40px;height:40px;border-radius:12px;background:rgba(255,159,10,0.15);border:1px solid rgba(255,159,10,0.3);display:flex;align-items:center;justify-content:center;color:#ff9f0a;">
                    <i class="ph-fill ph-calendar-plus text-[22px]"></i>
                </div>
                <div>
                    <h3 style="font-size:18px;font-weight:700;color:#ffffff;margin:0;">Sposta Verifica</h3>
                    <p style="font-size:12px;color:rgba(255,255,255,0.6);margin:2px 0 0;">Classe ${escapeHtml(userClass)}</p>
                </div>
            </div>
            <button onclick="document.getElementById('reschedule-exam-modal')?.remove();" style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.08);border:none;color:rgba(255,255,255,0.7);display:flex;align-items:center;justify-content:center;cursor:pointer;">
                <span class="material-symbols-outlined" style="font-size:20px;">close</span>
            </button>
        </div>

        <div>
            <label style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:6px;">Materia / Verifica da Spostare</label>
            ${subjectOptions?`
            <select id="exam-select-picker" onchange="const p=this.value.split('||');if(p[1])document.getElementById('exam-orig-date-input').value=p[1];if(p[0])document.getElementById('exam-subject-input').value=p[0];" style="width:100%;height:48px;background:rgba(20,31,54,0.95);border:1px solid rgba(255,255,255,0.15);border-radius:14px;padding:0 14px;color:#ffffff;font-size:14px;font-weight:600;outline:none;box-sizing:border-box;margin-bottom:8px;">
                <option value="">-- Seleziona Verifica Esistente --</option>
                ${subjectOptions}
                <option value="Altro||">Altra materia (inserimento manuale)</option>
            </select>`:""}
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                <input id="exam-subject-input" type="text" placeholder="Nome Materia (es. Matematica)" style="width:100%;height:46px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);border-radius:14px;padding:0 14px;color:#ffffff;font-size:14px;font-weight:600;outline:none;box-sizing:border-box;" />
                <input id="exam-orig-date-input" type="date" value="${defaultDate}" style="width:100%;height:46px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);border-radius:14px;padding:0 12px;color:#ffffff;font-size:14px;font-weight:600;outline:none;box-sizing:border-box;" />
            </div>
        </div>

        <!-- Selettore Nuova Data con Calendario e Indicatori Verifiche/Compiti -->
        <div>
            <label style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:6px;">Nuova Data Proposta</label>
            <div id="reschedule-cal-container">
                ${window._renderInlineCalendarHTML("reschedule-cal-container")}
            </div>
        </div>

        <div>
            <label style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:6px;">Motivazione dello Spostamento</label>
            <textarea id="exam-reason-input" placeholder="Es. Sovrapposizione con altra verifica, richiesta tempo per ripasso..." rows="3" style="width:100%;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);border-radius:14px;padding:12px 14px;color:#ffffff;font-size:14px;font-weight:500;outline:none;box-sizing:border-box;resize:none;line-height:1.4;"></textarea>
        </div>

        <button id="submit-reschedule-btn" style="width:100%;min-height:50px;border-radius:16px;background:linear-gradient(180deg,#ff9f0a 0%,#e08b00 100%);border:none;color:#ffffff;font-size:15px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 6px 20px rgba(255,159,10,0.35);margin-top:4px;">
            <i class="ph-bold ph-calendar-plus text-[18px]"></i>
            Proponi Spostamento alla Classe
        </button>
    </div>
    `,document.body.appendChild(overlay),requestAnimationFrame(()=>{overlay.style.opacity="1"}),document.getElementById("submit-reschedule-btn").onclick=function(){let subject=(document.getElementById("exam-subject-input")?.value||"").trim();const pickerVal=document.getElementById("exam-select-picker")?.value;!subject&&pickerVal&&!pickerVal.startsWith("Altro")&&(subject=pickerVal.split("||")[0]);const originalDate=document.getElementById("exam-orig-date-input")?.value,targetDate=window._modalCalStates["reschedule-cal-container"]?.selectedIso||defaultDate,reason=(document.getElementById("exam-reason-input")?.value||"").trim();if(!subject){alert("Inserisci la materia della verifica");return}if(!targetDate){alert("Seleziona la nuova data proposta");return}if(!reason){alert("Inserisci la motivazione dello spostamento");return}typeof window.triggerHaptic=="function"&&window.triggerHaptic("medium"),window.submitClassProposal({type:"exam_reschedule",class:userClass,subject,originalDate,targetDate,reason}),overlay.remove(),showToast("Proposta di spostamento verifica inviata!","success")}},window.submitClassProposal=async function(proposalData){const isCurrent=ClientRuntime.capture(),userClass=proposalData.class||getEffectiveUserClass(),{userId,userName,headers}=getClassRepAuthInfo();try{const res=await fetchWithDeadline(`${window.API_BASE_URL||""}/api/class-representative`,{method:"POST",headers,body:JSON.stringify({...proposalData,action:"create_proposal",class:userClass,authorId:userId,authorName:userName})}),json=await res.json();if(!isCurrent())return!1;if(!res.ok||!json.success||!json.proposal)throw new Error(json.error||"Richiesta non salvata");const current=getStoredClassProposals(userClass).filter(p=>p.id!==json.proposal.id);return saveStoredClassProposals(userClass,[json.proposal,...current]),showToast("Proposta salvata","success"),window.updateTodayStoriesTray?.(),scheduleRender(0),!0}catch(error){return isCurrent()&&showToast(error.message||"Invio non riuscito. Riprova.","error"),!1}},window.voteClassProposal=async function(proposalId,voteType,alternativeDate,note){typeof window.triggerHaptic=="function"&&window.triggerHaptic("light");const userClass=getEffectiveUserClass(),{userId,userName,headers}=getClassRepAuthInfo(),currentProps=getStoredClassProposals(userClass),prop=currentProps.find(p=>p.id===proposalId);if(prop){prop.votes||(prop.votes={accept:[],decline:[],alternatives:[]}),Array.isArray(prop.votes.accept)||(prop.votes.accept=[]),Array.isArray(prop.votes.decline)||(prop.votes.decline=[]),Array.isArray(prop.votes.alternatives)||(prop.votes.alternatives=[]),prop.votes.accept=prop.votes.accept.filter(id=>id!==userId),prop.votes.decline=prop.votes.decline.filter(id=>id!==userId),prop.votes.alternatives=prop.votes.alternatives.filter(a=>a.userId!==userId),voteType==="accept"?(prop.votes.accept.push(userId),showToast("Hai votato a favore","success")):voteType==="decline"?(prop.votes.decline.push(userId),showToast("Hai votato contro","info")):voteType==="alternative"&&(prop.votes.alternatives.push({userId,userName,date:alternativeDate||prop.targetDate,note:note||""}),showToast("Proposta data alternativa inviata","success")),saveStoredClassProposals(userClass,currentProps),typeof window.updateTodayStoriesTray=="function"&&window.updateTodayStoriesTray(),document.getElementById("instagram-story-content-card")&&typeof window.rerenderCurrentStorySlide=="function"&&window.rerenderCurrentStorySlide(),document.getElementById("today-notif-overlay")&&typeof window.openTodayNotifications=="function"&&openTodayNotifications();try{const apiBase=window.API_BASE_URL||(typeof API_BASE_URL<"u"?API_BASE_URL:"");await fetchWithDeadline(`${apiBase}/api/class-representative`,{method:"POST",headers,body:JSON.stringify({action:"vote",class:userClass,proposalId,userId,userName,voteType,alternativeDate,note})}),window._fetchClassDataSilent(userClass)}catch(e){console.warn("[ClassProposal] Vote sync failed:",e.message)}}},window.manageClassProposal=async function(proposalId,newStatus){typeof window.triggerHaptic=="function"&&window.triggerHaptic("medium");const userClass=getEffectiveUserClass(),{userId,headers}=getClassRepAuthInfo(),currentProps=getStoredClassProposals(userClass),prop=currentProps.find(p=>p.id===proposalId);if(prop){prop.status=newStatus==="approved"?"approved":"rejected",prop.managedAt=new Date().toISOString(),saveStoredClassProposals(userClass,currentProps),showToast(newStatus==="approved"?"Proposta approvata ufficialmente!":"Proposta archiviata","success"),typeof window.updateTodayStoriesTray=="function"&&window.updateTodayStoriesTray(),document.getElementById("instagram-story-content-card")&&typeof window.rerenderCurrentStorySlide=="function"&&window.rerenderCurrentStorySlide(),document.getElementById("today-notif-overlay")&&typeof window.openTodayNotifications=="function"&&openTodayNotifications();try{const apiBase=window.API_BASE_URL||(typeof API_BASE_URL<"u"?API_BASE_URL:"");await fetchWithDeadline(`${apiBase}/api/class-representative`,{method:"POST",headers,body:JSON.stringify({action:"manage_proposal",class:userClass,proposalId,status:prop.status,userId})}),window._fetchClassDataSilent(userClass)}catch(e){console.warn("[ClassProposal] Manage sync failed:",e.message)}}},window.openPlannerMonthPicker=function(){if(document.getElementById("month-picker-overlay")){window.closePlannerMonthPicker();return}const sel=new Date((state.selectedDate||getLocalDateString(new Date))+"T00:00:00");window._pk={year:sel.getFullYear(),month:sel.getMonth()},window._renderMonthPicker()},window.closePlannerMonthPicker=function(){const el=document.getElementById("month-picker-overlay");el&&(el.style.opacity="0",el.style.transition="opacity 0.15s ease",setTimeout(()=>el.remove(),150))},window._renderMonthPicker=function(){const MN_FULL=["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"],{year,month}=window._pk,todayISO=getLocalDateString(new Date),selectedISO=state.selectedDate||todayISO,firstDay=new Date(year,month,1),lastDay=new Date(year,month+1,0),startDow=(firstDay.getDay()+6)%7,cells=[];for(let i=0;i<startDow;i++)cells.push("<div></div>");for(let d=1;d<=lastDay.getDate();d++){const iso=year+"-"+String(month+1).padStart(2,"0")+"-"+String(d).padStart(2,"0"),isToday=iso===todayISO,isSel=iso===selectedISO,hasVerif=(state.verifiche||[]).some(function(v){return(v.data||v.date||"")===iso}),hasTask=(state.tasks||[]).some(function(t){return t.due_date===iso&&t.subject!=="QUEST"&&!t.done}),dotColor=hasVerif?"#ff453a":"#2997ff",dayMood=typeof window.getDailyMoodForDate=="function"?window.getDailyMoodForDate(iso):null;let bg="transparent",color="#ffffff",fw="500",ring="none",shadow="none";isSel?(bg="#2997ff",color="#ffffff",fw="700",shadow="0 4px 14px rgba(41,151,255,0.5)"):isToday&&(bg="rgba(41,151,255,0.18)",color="#2997ff",fw="700",ring="1px solid rgba(41,151,255,0.35)");let indicator="";dayMood?indicator='<span style="position:absolute;bottom:2px;left:50%;transform:translateX(-50%);font-size:10px;line-height:1;">'+dayMood.emoji+"</span>":(hasTask||hasVerif)&&!isSel&&(indicator='<span style="position:absolute;bottom:4px;left:50%;transform:translateX(-50%);width:4px;height:4px;border-radius:50%;display:block;background:'+dotColor+';"></span>'),cells.push(`<button onclick="window._pkSelectDay('`+iso+`')" style="position:relative;width:100%;aspect-ratio:1/1;border-radius:50%;border:`+ring+";cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;background:"+bg+";box-shadow:"+shadow+";font-size:14px;font-weight:"+fw+";color:"+color+`;font-family:'Inter',sans-serif;transition:transform 0.1s ease;-webkit-tap-highlight-color:transparent;" ontouchstart="this.style.transform='scale(0.88)'" ontouchend="this.style.transform='scale(1)'">`+d+indicator+"</button>")}const schoolYear=month>=8?year+"\u2013"+(year+1):year-1+"\u2013"+year,innerHTML='<div data-drag-handle style="display:flex;justify-content:center;padding:16px 0 6px;cursor:grab;touch-action:none;"><div style="width:40px;height:4px;border-radius:999px;background:rgba(255,255,255,0.25);"></div></div><div style="display:flex;align-items:center;justify-content:space-between;padding:6px 20px 8px;"><button onclick="window._pkPrev()" class="liquid-glass-v8 squircle-full rim-light" style="width:38px;height:38px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#ffffff;background:rgba(255,255,255,0.08);"><span class="material-symbols-outlined" style="font-size:20px;color:#2997ff;">chevron_left</span></button><div style="text-align:center;"><div style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">'+MN_FULL[month]+" "+year+'</div><div style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.6);letter-spacing:0.06em;text-transform:uppercase;margin-top:1px;">A.S.\xA0'+schoolYear+'</div></div><div style="display:flex;align-items:center;gap:6px;"><button onclick="window._pkNext()" class="liquid-glass-v8 squircle-full rim-light" style="width:38px;height:38px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#ffffff;background:rgba(255,255,255,0.08);"><span class="material-symbols-outlined" style="font-size:20px;color:#2997ff;">chevron_right</span></button><button onclick="window.closePlannerMonthPicker()" style="padding:6px 14px;border-radius:9999px;background:rgba(41,151,255,0.18);border:1px solid rgba(41,151,255,0.35);color:#2997ff;font-size:12px;font-weight:700;cursor:pointer;min-height:36px;display:flex;align-items:center;justify-content:center;">Fine</button></div></div><div style="display:grid;grid-template-columns:repeat(7,1fr);padding:10px 16px 4px;">'+["L","M","M","G","V","S","D"].map(function(l){return'<div style="text-align:center;font-size:11px;font-weight:700;color:rgba(255,255,255,0.45);">'+l+"</div>"}).join("")+'</div><div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;padding:0 16px;">'+cells.join("")+`</div><div style="padding:14px 16px 0;display:flex;flex-direction:column;gap:8px;"><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"><button onclick="window.openRequestAssemblyModal()" style="min-height:48px;padding:10px 12px;background:rgba(48,209,88,0.14);border:1px solid rgba(48,209,88,0.35);border-radius:16px;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;color:#30d158;font-size:13px;font-weight:700;font-family:'Inter',sans-serif;-webkit-tap-highlight-color:transparent;" ontouchstart="this.style.transform='scale(0.96)'" ontouchend="this.style.transform='scale(1)'"><i class="ph-fill ph-users-three text-[18px]"></i><span>Assemblea</span></button><button onclick="window.openRescheduleExamModal()" style="min-height:48px;padding:10px 12px;background:rgba(255,159,10,0.14);border:1px solid rgba(255,159,10,0.35);border-radius:16px;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;color:#ff9f0a;font-size:13px;font-weight:700;font-family:'Inter',sans-serif;-webkit-tap-highlight-color:transparent;" ontouchstart="this.style.transform='scale(0.96)'" ontouchend="this.style.transform='scale(1)'"><i class="ph-fill ph-calendar-plus text-[18px]"></i><span>Sposta Verifica</span></button></div></div>`,existing=document.getElementById("month-picker-overlay");if(existing){const card2=existing.querySelector(".month-picker-card");card2&&(card2.innerHTML=innerHTML);return}const overlay=document.createElement("div");overlay.id="month-picker-overlay",overlay.style.cssText="position:fixed;inset:0;background:rgba(7,13,27,0.7);backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px) saturate(180%);z-index:9000;display:flex;align-items:flex-end;justify-content:center;padding:0;opacity:0;transition:opacity 0.18s ease;",overlay.onclick=function(e){e.target===overlay&&window.closePlannerMonthPicker()};const card=document.createElement("div");card.className="month-picker-card",card.style.cssText="width:100%;max-width:430px;background:rgba(20,31,54,0.85);backdrop-filter:blur(30px) saturate(190%);-webkit-backdrop-filter:blur(30px) saturate(190%);border-top:1px solid rgba(255,255,255,0.22);border-radius:32px 32px 0 0;padding:0 0 calc(24px + env(safe-area-inset-bottom,0px)) 0;box-shadow:0 -8px 36px rgba(0,0,0,0.5);overflow:hidden;transform:translateY(100%);transition:transform 0.28s cubic-bezier(0.2,0.8,0.2,1);",card.innerHTML=innerHTML,overlay.appendChild(card),document.body.appendChild(overlay),requestAnimationFrame(function(){overlay.style.opacity="1",card.style.transform="translateY(0px)"});var handle=card.querySelector("[data-drag-handle]");handle||(handle=card.firstElementChild);var startY=0,currentY=0,dragging=!1;function onTouchStart(e){startY=e.touches[0].clientY,currentY=0,dragging=!0,card.style.transition="none"}function onTouchMove(e){dragging&&(currentY=e.touches[0].clientY-startY,currentY<0&&(currentY=0),card.style.transform="translateY("+currentY+"px)")}function onTouchEnd(){dragging&&(dragging=!1,card.style.transition="transform 0.28s cubic-bezier(0.2,0.8,0.2,1)",currentY>100?window.closePlannerMonthPicker():card.style.transform="translateY(0px)")}handle.addEventListener("touchstart",onTouchStart,{passive:!0}),handle.addEventListener("touchmove",onTouchMove,{passive:!0}),handle.addEventListener("touchend",onTouchEnd)},window._pkPrev=function(){window._pk.month--,window._pk.month<0&&(window._pk.month=11,window._pk.year--),window._renderMonthPicker()},window._pkNext=function(){window._pk.month++,window._pk.month>11&&(window._pk.month=0,window._pk.year++),window._renderMonthPicker()},window._pkSelectDay=function(iso){state.selectedDate=iso,window._plannerDayContentCache=null,typeof window.triggerHaptic=="function"&&window.triggerHaptic("light"),window._renderMonthPicker(),state._forceRender=!0,scheduleRender(0)},window._buildPlannerDayContentHTML=function(){const TC=window._plannerTC;if(!TC)return null;const MN=window._plannerMN||["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"],dayLabels=["Dom","Lun","Mar","Mer","Gio","Ven","Sab"],today=new Date;today.setHours(0,0,0,0);const todayISO=getLocalDateString(today),selDate=state.selectedDate||todayISO,allTasks=(state.tasks||[]).filter(function(t){return t.subject!=="QUEST"}),dayTasks=allTasks.filter(function(t){return t.due_date===selDate}),upcoming=allTasks.filter(function(t){if(t.done)return!1;try{var d2=parseLocalDate(t.due_date),diff2=(d2-today)/864e5;return diff2>0&&diff2<=7}catch{return!1}}).length;var d=new Date(selDate+"T00:00:00"),diff=Math.round((d-today)/864e5),base=dayLabels[d.getDay()]+" "+d.getDate()+" "+MN[d.getMonth()],dayLabel=diff===0?"Oggi \xB7 "+base:diff===1?"Domani \xB7 "+base:diff===-1?"Ieri \xB7 "+base:base,smart=upcoming>0&&selDate===todayISO?`<div class="liquid-glass-v8 squircle-md rim-light" style="padding:16px 18px;background:linear-gradient(135deg, rgba(47,88,205,0.2) 0%, rgba(255,255,255,0.02) 100%);"><div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;"><div style="width:32px;height:32px;border-radius:50%;background:#2f58cd;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><span class="material-symbols-outlined" style="font-size:16px;color:white;font-variation-settings:'FILL' 1;">lightbulb</span></div><span style="font-size:14px;font-weight:700;color:#dae2fd;">Smart Planner</span></div><p style="font-size:13px;color:rgba(196,197,214,0.8);line-height:1.5;margin:0 0 8px;">Hai <strong>`+upcoming+`</strong> compiti nei prossimi 7 giorni.</p><button onclick="const si=document.getElementById('planner-search-input');if(si){si.focus();si.select();}" style="color:#b6c4ff;font-weight:600;font-size:12px;background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:4px;font-family:'Inter',sans-serif;padding:0;">Cerca <span class="material-symbols-outlined" style="font-size:14px;">arrow_forward</span></button></div>`:"",empty='<div class="liquid-glass-v8 squircle-lg rim-light" style="padding:40px 20px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;min-height:280px;background:rgba(20,31,54,0.6);border-radius:28px;border:0.5px solid rgba(255,255,255,0.1);"><div style="position:relative;margin-bottom:20px;"><div style="position:absolute;inset:0;background:rgba(41,151,255,0.2);filter:blur(24px);border-radius:9999px;"></div><div style="position:relative;width:72px;height:72px;border-radius:22px;background:rgba(41,151,255,0.1);border:1px solid rgba(41,151,255,0.25);display:flex;align-items:center;justify-content:center;color:#2997ff;"><i class="ph ph-calendar-x" style="font-size:36px;"></i></div></div><h4 style="font-size:16px;font-weight:700;color:#ffffff;margin:0 0 4px;">Nessuna attivit\xE0</h4><p style="font-size:13px;font-weight:500;color:rgba(255,255,255,0.5);max-width:240px;line-height:1.5;margin:0;">Nessun compito o verifica programmata per questo giorno.</p></div>';return'<div style="display:flex;flex-direction:column;gap:16px;"><div style="display:flex;align-items:center;justify-content:space-between;padding:0 4px;"><h2 style="font-size:18px;font-weight:600;color:rgba(218,226,253,0.9);margin:0;line-height:1.2;" class="sentence-case">'+dayLabel+'</h2><span style="font-size:12px;font-weight:500;color:rgba(196,197,214,0.6);">'+dayTasks.length+(dayTasks.length===1?" evento":" eventi")+"</span></div>"+smart+(dayTasks.length?'<div style="display:flex;flex-direction:column;gap:12px;">'+dayTasks.map(function(t){return TC(t,!1)}).join("")+"</div>":empty)+"</div>"},window.openPlannerSearchModal=function(initialQuery,initialSubject){typeof window.triggerHaptic=="function"&&window.triggerHaptic("light"),initialQuery!==void 0&&(state.plannerSearchModalQuery=initialQuery),initialSubject!==void 0&&(state.plannerSearchModalSubject=initialSubject),state.plannerSearchModalCategory||(state.plannerSearchModalCategory="all");const existing=document.getElementById("planner-search-modal-overlay");existing&&existing.remove();const overlay=document.createElement("div");overlay.id="planner-search-modal-overlay",overlay.style.cssText="position:fixed;inset:0;z-index:99999;background:rgba(5,8,17,0.75);backdrop-filter:blur(30px) saturate(190%);-webkit-backdrop-filter:blur(30px) saturate(190%);display:flex;flex-direction:column;justify-content:flex-end;opacity:0;transition:opacity 0.25s ease;font-family:'Inter',sans-serif;";const sheet=document.createElement("div");sheet.id="planner-search-modal-sheet",sheet.style.cssText="width:100%;max-width:640px;margin:0 auto;height:92vh;max-height:92vh;background:rgba(12,20,36,0.96);border:1px solid rgba(255,255,255,0.12);border-top:1px solid rgba(255,255,255,0.25);border-radius:32px 32px 0 0;display:flex;flex-direction:column;box-shadow:0 -12px 48px rgba(0,0,0,0.75);transform:translateY(100%);transition:transform 0.35s cubic-bezier(0.16,1,0.3,1);overflow:hidden;",overlay.appendChild(sheet),document.body.appendChild(overlay),window.renderPlannerSearchModalContent(sheet),requestAnimationFrame(()=>{overlay.style.opacity="1",sheet.style.transform="translateY(0)"}),overlay.addEventListener("click",e=>{e.target===overlay&&window.closePlannerSearchModal()})},window.closePlannerSearchModal=function(){typeof window.triggerHaptic=="function"&&window.triggerHaptic("light");const overlay=document.getElementById("planner-search-modal-overlay"),sheet=document.getElementById("planner-search-modal-sheet");overlay&&(sheet&&(sheet.style.transform="translateY(100%)"),overlay.style.opacity="0",setTimeout(()=>{overlay&&overlay.parentNode&&overlay.remove()},320))},window.clearPlannerModalSearchInput=function(){state.plannerSearchModalQuery="";const inp=document.getElementById("planner-modal-search-input");inp&&(inp.value="",inp.focus());const btn=document.getElementById("planner-modal-search-clear-btn");btn&&(btn.style.display="none"),window.updatePlannerSearchModalResults&&window.updatePlannerSearchModalResults()},window.renderPlannerSearchModalContent=function(sheet){if(sheet||(sheet=document.getElementById("planner-search-modal-sheet")),!sheet)return;const allTasks=(state.tasks||[]).filter(t=>t.subject!=="QUEST"),subjects=[...new Set(allTasks.map(t=>t.subject||t.materia||"").filter(Boolean))].sort(),allCount=allTasks.length,tasksOnlyCount=allTasks.filter(t=>!t.done&&!(t.isExam||t.type==="verifica"||/verifica|interrogazione|test|esame|simulazione/i.test(t.text||""))).length,examsOnlyCount=allTasks.filter(t=>!t.done&&(t.isExam||t.type==="verifica"||/verifica|interrogazione|test|esame|simulazione/i.test(t.text||""))).length,doneCount=allTasks.filter(t=>t.done).length,curCategory=state.plannerSearchModalCategory||"all",curSubject=state.plannerSearchModalSubject||"all",curQuery=state.plannerSearchModalQuery||"";sheet.innerHTML=`
        <!-- Drag Handle -->
        <div style="display:flex;justify-content:center;padding:12px 0 6px;flex-shrink:0;">
            <div style="width:40px;height:5px;border-radius:999px;background:rgba(255,255,255,0.25);"></div>
        </div>

        <!-- Header Bar -->
        <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 20px 14px;flex-shrink:0;">
            <div>
                <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#2997ff;">ARCHIVIO COMPITI & VERIFICHE</div>
                <h2 style="font-size:20px;font-weight:800;color:#ffffff;margin:2px 0 0;letter-spacing:-0.02em;">Cerca & Filtri</h2>
            </div>
            <button onclick="window.closePlannerSearchModal()" class="liquid-glass-v8 rim-light squircle-full" style="display:flex;align-items:center;gap:6px;padding:7px 14px;border:none;cursor:pointer;background:rgba(255,255,255,0.08);color:#ffffff;font-size:12px;font-weight:700;font-family:'Inter',sans-serif;">
                <i class="ph ph-x" style="font-size:14px;"></i>
                <span>Chiudi</span>
            </button>
        </div>

        <!-- Search Bar (Apple Spotlight Input) -->
        <div style="padding:0 20px 12px;flex-shrink:0;">
            <div class="liquid-glass-v8 squircle-md rim-light" style="padding:11px 15px;display:flex;align-items:center;gap:10px;background:rgba(20,31,54,0.85);border:0.5px solid rgba(255,255,255,0.15);border-top:1px solid rgba(255,255,255,0.25);border-radius:18px;box-shadow:0 4px 16px -4px rgba(0,0,0,0.4);">
                <i class="ph ph-magnifying-glass" style="font-size:18px;color:#2997ff;flex-shrink:0;"></i>
                <input id="planner-modal-search-input" type="text"
                    placeholder="Cerca per titolo, materia o argomento..."
                    value="${escapeHtml(curQuery)}"
                    oninput="state.plannerSearchModalQuery=this.value;const clr=document.getElementById('planner-modal-search-clear-btn');if(clr)clr.style.display=this.value?'flex':'none';window.updatePlannerSearchModalResults&&window.updatePlannerSearchModalResults();"
                    style="width:100%;background:transparent;border:none;outline:none;font-size:14px;color:#ffffff;padding:0;font-family:'Inter',sans-serif;" />
                <button id="planner-modal-search-clear-btn" onclick="window.clearPlannerModalSearchInput()" style="display:${curQuery?"flex":"none"};background:none;border:none;color:rgba(255,255,255,0.5);cursor:pointer;padding:0;align-items:center;justify-content:center;flex-shrink:0;" title="Cancella">
                    <i class="ph-fill ph-x-circle" style="font-size:18px;"></i>
                </button>
            </div>
        </div>

        <!-- Category Filter Segments -->
        <div style="padding:0 20px 10px;flex-shrink:0;">
            <div style="display:flex;gap:8px;background:rgba(10,16,28,0.7);padding:5px;border-radius:16px;border:0.5px solid rgba(255,255,255,0.08);">
                ${[{id:"all",label:"Tutti",icon:"ph-squares-four",count:allCount},{id:"tasks",label:"Compiti",icon:"ph-book-open",count:tasksOnlyCount},{id:"exams",label:"Verifiche",icon:"ph-pencil-simple",count:examsOnlyCount}].map(cat=>{const active=curCategory===cat.id;return`
                    <button onclick="state.plannerSearchModalCategory='${cat.id}';window.renderPlannerSearchModalContent();" style="flex:1;padding:8px 6px;border-radius:12px;font-size:12px;font-weight:${active?"700":"600"};border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;font-family:'Inter',sans-serif;transition:all 0.2s ease;background:${active?"#2997ff":"transparent"};color:${active?"#ffffff":"rgba(255,255,255,0.6)"};box-shadow:${active?"0 2px 8px rgba(41,151,255,0.35)":"none"};">
                        <i class="ph-bold ${cat.icon}" style="font-size:14px;"></i>
                        <span>${cat.label}</span>
                        <span style="font-size:10px;opacity:0.85;padding:1px 6px;border-radius:999px;background:${active?"rgba(255,255,255,0.25)":"rgba(255,255,255,0.08)"};">${cat.count}</span>
                    </button>`}).join("")}
            </div>
        </div>

        <!-- Subject Chips Filter Bar -->
        <div style="padding:0 20px 12px;flex-shrink:0;">
            <div id="planner-modal-chips-bar" style="display:flex;overflow-x:auto;gap:8px;padding-bottom:4px;scrollbar-width:none;-webkit-overflow-scrolling:touch;">
                ${[{l:"Tutte le materie",s:"all",count:allCount},...subjects.map(s=>({l:s,s,count:allTasks.filter(t=>(t.subject||t.materia||"")===s).length}))].map(item=>{const isAll=item.s==="all",active=curSubject===item.s,theme=isAll?{color:"#2997ff",icon:"ph-squares-four"}:getSubjectTheme(item.s);return`
                    <button onclick="state.plannerSearchModalSubject='${escapeJsSingleQuote(item.s)}';window.updatePlannerSearchModalResults&&window.updatePlannerSearchModalResults();" style="flex-shrink:0;padding:6px 12px;border-radius:9999px;font-size:11px;font-weight:${active?"700":"600"};cursor:pointer;font-family:'Inter',sans-serif;white-space:nowrap;display:flex;align-items:center;gap:6px;transition:all 0.2s ease;background:${active?"#2997ff":"rgba(20,31,54,0.75)"};border:${active?"1px solid rgba(41,151,255,0.6)":"0.5px solid rgba(255,255,255,0.12)"};color:${active?"#ffffff":"rgba(255,255,255,0.8)"};box-shadow:${active?"0 4px 12px rgba(41,151,255,0.3)":"none"};">
                        <i class="ph-fill ${theme.icon||"ph-bookmark"}" style="font-size:13px;color:${active?"#ffffff":theme.color};"></i>
                        <span>${escapeHtml(formatSubjectTitle(item.l))}</span>
                        <span style="font-size:9px;opacity:0.8;background:${active?"rgba(255,255,255,0.25)":"rgba(255,255,255,0.08)"};padding:1px 5px;border-radius:999px;">${item.count}</span>
                    </button>`}).join("")}
            </div>
        </div>

        <!-- Scrollable Results Container -->
        <div id="planner-modal-results-container" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:0 20px 80px 20px;">
        </div>
    `,window.updatePlannerSearchModalResults()},window.updatePlannerSearchModalResults=function(){const container=document.getElementById("planner-modal-results-container");if(!container)return;const allTasks=(state.tasks||[]).filter(t=>t.subject!=="QUEST"),query=(state.plannerSearchModalQuery||"").toLowerCase().trim(),filterSubject=state.plannerSearchModalSubject||"all",filterCategory=state.plannerSearchModalCategory||"all",chipsBar=document.getElementById("planner-modal-chips-bar");chipsBar&&chipsBar.querySelectorAll("button").forEach(btn=>{const m=(btn.getAttribute("onclick")||"").match(/plannerSearchModalSubject='([^']+)'/),s=m?m[1]:"",active=filterSubject===s;btn.style.background=active?"#2997ff":"rgba(20,31,54,0.75)",btn.style.border=active?"1px solid rgba(41,151,255,0.6)":"0.5px solid rgba(255,255,255,0.12)",btn.style.color=active?"#ffffff":"rgba(255,255,255,0.8)",btn.style.boxShadow=active?"0 4px 12px rgba(41,151,255,0.3)":"none"});const filtered=allTasks.filter(t=>{const isExam=t.isExam||t.type==="verifica"||/verifica|interrogazione|test|esame|simulazione/i.test(t.text||"");return filterCategory==="tasks"&&(isExam||t.done)||filterCategory==="exams"&&(!isExam||t.done)||filterSubject!=="all"&&(t.subject||t.materia||"")!==filterSubject?!1:query?(t.subject||"").toLowerCase().includes(query)||(t.materia||"").toLowerCase().includes(query)||(t.text||"").toLowerCase().includes(query):!0}).sort((a,b)=>(b.due_date||"").localeCompare(a.due_date||"")),TC=window._plannerTC;if(!TC)return;const countLabel=filtered.length+(filtered.length===1?" attivit\xE0 trovata":" attivit\xE0 trovate");container.innerHTML=`
        <div style="font-size:12px;font-weight:600;color:rgba(255,255,255,0.7);margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;padding:0 2px;">
            <span style="display:flex;align-items:center;gap:6px;">
                <i class="ph-bold ph-funnel" style="color:#2997ff;"></i> ${countLabel}
            </span>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;">
            ${filtered.length?filtered.map(t=>TC(t,!0)).join(""):`
            <div class="liquid-glass-v8 squircle-lg rim-light" style="text-align:center;padding:44px 20px;background:rgba(20,31,54,0.7);border-radius:24px;border:0.5px solid rgba(255,255,255,0.12);">
                <i class="ph ph-magnifying-glass" style="font-size:40px;color:rgba(255,255,255,0.25);"></i>
                <h4 style="color:#ffffff;font-size:15px;font-weight:700;margin:12px 0 4px;">Nessuna attivit\xE0 trovata</h4>
                <p style="color:rgba(255,255,255,0.5);font-size:13px;font-weight:500;margin:0;">Prova a modificare i termini di ricerca o i filtri selezionati.</p>
            </div>`}
        </div>
    `},window.refreshPlannerSearch=function(){window.updatePlannerSearchModalResults&&window.updatePlannerSearchModalResults()},window.closePlannerSearch=function(){window.closePlannerSearchModal&&window.closePlannerSearchModal()},window.getDailyMoods=function(){const key=lsKey("daily_moods");if(!state.dailyMoods||state._dailyMoodsKey!==key){state._dailyMoodsKey=key;try{state.dailyMoods=JSON.parse(localStorage.getItem(lsKey("daily_moods"))||"{}")}catch{state.dailyMoods={}}}return state.dailyMoods||{}},window.getDailyMoodForDate=function(isoDate){return isoDate&&window.getDailyMoods()[isoDate]||null},window.setDailyMood=function(moodIdx){const selected=[{index:0,emoji:"\u{1F62B}",label:"Pessima",color:"#ff453a",bg:"rgba(255,69,58,0.22)"},{index:1,emoji:"\u{1F971}",label:"Faticosa",color:"#ff9f0a",bg:"rgba(255,159,10,0.22)"},{index:2,emoji:"\u{1F610}",label:"Normale",color:"#ffd60a",bg:"rgba(255,214,10,0.22)"},{index:3,emoji:"\u{1F60A}",label:"Buona",color:"#64d2ff",bg:"rgba(100,210,255,0.22)"},{index:4,emoji:"\u{1F929}",label:"Top!",color:"#30d158",bg:"rgba(48,209,88,0.22)"}][moodIdx];if(!selected)return;const todayISO=getLocalDateString(new Date),moods=window.getDailyMoods();moods[todayISO]={index:selected.index,emoji:selected.emoji,label:selected.label,color:selected.color,date:todayISO,updatedAt:new Date().toISOString()},state.dailyMoods=moods;try{localStorage.setItem(lsKey("daily_moods"),JSON.stringify(moods))}catch{}typeof window.triggerHaptic=="function"&&window.triggerHaptic("medium");const moodContainer=document.getElementById("home-daily-mood-buttons");if(moodContainer){moodContainer.querySelectorAll("[data-mood-idx]").forEach(btn=>{const isCur=parseInt(btn.getAttribute("data-mood-idx"))===selected.index;btn.style.background=isCur?selected.bg:"rgba(255,255,255,0.06)",btn.style.border=isCur?`1.5px solid ${selected.color}`:"0.5px solid rgba(255,255,255,0.12)",btn.style.boxShadow=isCur?`0 0 16px ${selected.color}50, 0 4px 12px rgba(0,0,0,0.3)`:"none",btn.style.transform=isCur?"scale(1.15)":"scale(1)"});const labelEl=document.getElementById("home-daily-mood-label");labelEl&&(labelEl.innerHTML=`\u2728 Mood registrato: <strong style="color:${selected.color};">${selected.emoji} ${selected.label}</strong>`)}};function getSchoolCalendarConfig(){const now=new Date,year=now.getMonth()>=8?now.getFullYear():now.getFullYear()-1,key=lsKey(`school_calendar:${year}`);let dates={};try{dates=JSON.parse(localStorage.getItem(key)||"{}")}catch{}return{key,year,dates}}function getSchoolCalendarFields(){return[["inizio","Inizio lezioni"],["natale","Inizio vacanze di Natale"],["quadrimestre","Fine primo quadrimestre"],["pasqua","Inizio vacanze di Pasqua"],["fine_scuola","Fine delle lezioni"],["maturita","Prima prova di maturit\xE0"]]}window.saveSchoolCalendar=function(){const config=getSchoolCalendarConfig(),dates={};for(const[id]of getSchoolCalendarFields()){const value=document.getElementById("school-date-"+id)?.value;value&&(dates[id]=value)}if(dates.inizio&&dates.fine_scuola&&dates.inizio>=dates.fine_scuola){showToast("La fine delle lezioni deve seguire l\u2019inizio","warning");return}localStorage.setItem(config.key,JSON.stringify(dates)),window.closeSchoolCountdownsModal(),window.openSchoolCountdownsModal(),scheduleRender(0)},window.getSchoolCountdowns=function(){const{year,dates}=getSchoolCalendarConfig(),today=new Date,day=d=>Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/864e5,parse=value=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value||""))return null;const[y,m,d]=value.split("-").map(Number),date=new Date(y,m-1,d);return date.getFullYear()===y&&date.getMonth()===m-1&&date.getDate()===d?date:null},milestones=getSchoolCalendarFields().filter(([id])=>id!=="inizio").flatMap(([id,title])=>{const date=parse(dates[id]);if(!date)return[];const daysLeft=day(date)-day(today);return[{id,title,date,daysLeft,emoji:"\u{1F4C5}",color:"#64d2ff",bg:"rgba(100,210,255,0.15)",border:"rgba(100,210,255,0.35)",desc:"Data impostata per il tuo calendario",isPast:daysLeft<0,isToday:daysLeft===0,badgeText:daysLeft<0?"Passato":daysLeft===0?"Oggi!":`${daysLeft} giorni`,dateFormatted:date.toLocaleDateString("it-IT",{day:"numeric",month:"short",year:"numeric"})}]}).sort((a,b)=>a.date-b.date),start=parse(dates.inizio),end=parse(dates.fine_scuola),schoolYearProgress=start&&end&&end>start?Math.round(Math.max(0,Math.min(1,(day(today)-day(start))/(day(end)-day(start))))*100):null;return{milestones,schoolYearProgress,schoolYearLabel:`${year}/${year+1}`,nearest:milestones.find(m=>!m.isPast)||{title:"Calendario da impostare",emoji:"\u{1F4C5}",desc:"Inserisci le date comunicate dalla scuola",badgeText:"Imposta le date",dateFormatted:"Date personali",daysLeft:null}}},window.openSchoolCountdownsModal=function(){if(document.getElementById("school-countdowns-modal-overlay"))return;typeof window.triggerHaptic=="function"&&window.triggerHaptic("light");const data=window.getSchoolCountdowns(),overlay=document.createElement("div");overlay.id="school-countdowns-modal-overlay",overlay.style.cssText=`
        position: fixed; inset: 0; z-index: 99999;
        background: rgba(5,8,17,0.78);
        backdrop-filter: blur(28px) saturate(190%);
        -webkit-backdrop-filter: blur(28px) saturate(190%);
        display: flex; flex-direction: column; justify-content: flex-end;
        animation: fadeInOverlay 0.25s ease-out forwards;
    `,overlay.innerHTML=`
        <div onclick="window.closeSchoolCountdownsModal()" style="flex:1;"></div>
        <div id="school-countdowns-modal-sheet" style="
            background: linear-gradient(160deg, rgba(22,34,58,0.96) 0%, rgba(10,16,30,0.98) 100%);
            backdrop-filter: blur(40px) saturate(210%);
            -webkit-backdrop-filter: blur(40px) saturate(210%);
            border: 0.5px solid rgba(255,255,255,0.15);
            border-top: 1.5px solid rgba(255,255,255,0.30);
            border-radius: 32px 32px 0 0;
            padding: 12px 20px 40px 20px;
            max-height: 85vh;
            display: flex; flex-direction: column;
            box-shadow: 0 -12px 40px rgba(0,0,0,0.7);
            animation: slideUpModal 0.3s cubic-bezier(0.16,1,0.3,1) forwards;
        ">
            <!-- Drag Handle -->
            <div style="display:flex;justify-content:center;padding:6px 0 12px;">
                <div style="width:40px;height:5px;border-radius:999px;background:rgba(255,255,255,0.25);"></div>
            </div>

            <details style="margin:12px 0;color:white;overflow:auto;flex-shrink:0;max-height:40vh;">
                <summary style="cursor:pointer;padding:10px;">Imposta le date della tua scuola</summary>
                <p style="font-size:12px;">Usa le date comunicate dalla scuola. Le impostazioni sono salvate su questo dispositivo per il profilo e l\u2019anno selezionati.</p>
                ${getSchoolCalendarFields().map(([id,label])=>`<label style="display:flex;justify-content:space-between;gap:8px;padding:6px;font-size:12px;">${label}<input type="date" id="school-date-${id}" value="${escapeHtml(getSchoolCalendarConfig().dates[id]||"")}" style="color:white;background:#17233b;border:1px solid #536078;border-radius:6px;"></label>`).join("")}
                <button onclick="window.saveSchoolCalendar()" style="padding:10px;border-radius:10px;">Salva calendario</button>
            </details>
            <!-- Header -->
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <div>
                    <div style="font-size:10px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#ff9f0a;">CONTO ALLA ROVESCIA</div>
                    <h2 style="font-size:20px;font-weight:800;color:#ffffff;margin:2px 0 0;letter-spacing:-0.02em;">Quanto Manca A...</h2>
                </div>
                <button onclick="window.closeSchoolCountdownsModal()" class="liquid-glass-v8 rim-light squircle-full" style="display:flex;align-items:center;gap:6px;padding:7px 14px;border:none;cursor:pointer;background:rgba(255,255,255,0.08);color:#ffffff;font-size:12px;font-weight:700;font-family:'Inter',sans-serif;">
                    <i class="ph ph-x" style="font-size:14px;"></i>
                    <span>Chiudi</span>
                </button>
            </div>

            <!-- School Year Progress Card -->
            <div style="background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.12);border-radius:20px;padding:14px 16px;margin-bottom:16px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                    <span style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.05em;">ANNO SCOLASTICO ${data.schoolYearLabel}</span>
                    <span style="font-size:12px;font-weight:800;color:#2997ff;">${data.schoolYearProgress===null?"Imposta inizio e fine lezioni":data.schoolYearProgress+"% completato"}</span>
                </div>
                <div style="width:100%;height:7px;background:rgba(255,255,255,0.08);border-radius:999px;overflow:hidden;">
                    <div style="width:${data.schoolYearProgress??0}%;height:100%;background:linear-gradient(90deg,#2997ff,#30d158);border-radius:999px;"></div>
                </div>
            </div>

            <!-- Milestones List -->
            <div style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;gap:10px;padding-bottom:10px;">
                ${data.milestones.map(m=>`
                <div style="
                    background: ${m.isToday?"rgba(255,214,10,0.12)":"rgba(255,255,255,0.03)"};
                    border: 0.5px solid ${m.isToday?"rgba(255,214,10,0.4)":"rgba(255,255,255,0.09)"};
                    border-radius: 18px; padding: 12px 14px;
                    display: flex; align-items: center; justify-content: space-between; gap: 12px;
                    opacity: ${m.isPast?"0.5":"1"};
                ">
                    <div style="display:flex;align-items:center;gap:12px;min-width:0;">
                        <div style="width:40px;height:40px;border-radius:14px;background:${m.bg};border:0.5px solid ${m.border};display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">
                            ${m.emoji}
                        </div>
                        <div style="min-width:0;">
                            <h4 style="font-size:14px;font-weight:700;color:#ffffff;margin:0 0 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${m.title}</h4>
                            <p style="font-size:11.5px;color:rgba(255,255,255,0.5);margin:0;">${m.dateFormatted} \xB7 ${m.desc}</p>
                        </div>
                    </div>
                    <span style="
                        flex-shrink: 0; font-size: 12px; font-weight: 800; font-variant-numeric: tabular-nums;
                        padding: 5px 12px; border-radius: 999px;
                        background: ${m.isPast?"rgba(255,255,255,0.06)":m.bg};
                        color: ${m.isPast?"rgba(255,255,255,0.4)":m.color};
                        border: 0.5px solid ${m.isPast?"transparent":m.border};
                    ">
                        ${m.badgeText}
                    </span>
                </div>
                `).join("")}
            </div>
        </div>
    `,document.body.appendChild(overlay)},window.closeSchoolCountdownsModal=function(){const overlay=document.getElementById("school-countdowns-modal-overlay");if(!overlay)return;const sheet=document.getElementById("school-countdowns-modal-sheet");sheet&&(sheet.style.animation="slideDownModal 0.2s cubic-bezier(0.16,1,0.3,1) forwards"),overlay.style.animation="fadeOutOverlay 0.2s ease-in forwards",setTimeout(()=>overlay.remove(),200)},window.plannerSelectDay=function(iso){state.selectedDate=iso,document.querySelectorAll(".planner-day-pill").forEach(function(el){const m=(el.getAttribute("onclick")||"").match(/'([^']+)'/),elIso=m?m[1]:null;if(!elIso)return;const isSel=elIso===iso;isSel?(el.className="planner-day-pill active-blue-glow squircle-full",el.style.opacity="1"):(el.className="planner-day-pill liquid-glass-v8 rim-light squircle-full",el.style.opacity="0.65");const spans=el.querySelectorAll("span");spans[0]&&(spans[0].style.color="#ffffff",spans[0].style.opacity=isSel?"0.8":"0.6"),spans[1]&&(spans[1].style.color=isSel?"#ffffff":"#dae2fd");const dot=el.querySelector(".planner-task-dot");dot&&(dot.getAttribute("data-has-task")==="true"?(dot.style.background=isSel?"#ffffff":"rgba(182,196,255,0.6)",dot.style.boxShadow=isSel?"0 0 8px rgba(255,255,255,0.8)":"none"):(dot.style.background="transparent",dot.style.boxShadow="none"))});try{const d=new Date(iso+"T00:00:00"),MN=window._plannerMN||["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"],monthHeaderSpan=document.querySelector(".planner-view header button span:nth-child(2)");monthHeaderSpan&&!isNaN(d.getTime())&&(monthHeaderSpan.textContent=`${MN[d.getMonth()]} ${d.getFullYear()}`)}catch{}var _area=document.getElementById("planner-content-area"),_dayHtml=window._buildPlannerDayContentHTML&&window._buildPlannerDayContentHTML();_area&&_dayHtml?_area.innerHTML=_dayHtml:(state._forceRender=!0,scheduleRender(0))},window.handlePlannerCarouselScroll=function(el){if(!el)return;const slideWidth=el.clientWidth||el.offsetWidth||window.innerWidth;if(!slideWidth)return;const idx=Math.max(0,Math.min(4,Math.round(el.scrollLeft/slideWidth)));window._lastPlannerScrollIdx!==idx&&(window._lastPlannerScrollIdx=idx,document.querySelectorAll(".planner-week-dot").forEach(function(dot,i){dot.style.width=i===idx?"20px":"6px",dot.style.background=i===idx?"rgba(47, 88, 205, 0.8)":"rgba(255, 255, 255, 0.2)",dot.style.borderRadius="9999px"}))},window.plannerJumpToWeek=function(idx){const el=document.getElementById("planner-week-carousel");if(el){const targetSlide=el.querySelectorAll(".planner-week-slide")[idx];if(targetSlide)el.scrollTo({left:targetSlide.offsetLeft,behavior:"smooth"});else{const slideWidth=el.clientWidth||el.offsetWidth||window.innerWidth;el.scrollTo({left:idx*slideWidth,behavior:"smooth"})}}},window._scrollPlannerToActiveWeek=function(){const _pc=document.getElementById("planner-week-carousel");if(!_pc)return;const slides=_pc.querySelectorAll(".planner-week-slide"),targetIdx=2,targetSlide=slides[targetIdx]||slides[0];if(targetSlide){const offset=targetSlide.offsetLeft;_pc.scrollTo({left:offset,behavior:"instant"}),_pc.scrollLeft=offset,document.querySelectorAll(".planner-week-dot").forEach(function(dot,i){dot.style.width=i===targetIdx?"20px":"6px",dot.style.background=i===targetIdx?"rgba(47, 88, 205, 0.8)":"rgba(255, 255, 255, 0.2)",dot.style.borderRadius="9999px"})}};function formatFullDate(dateInput){if(!dateInput)return"";const date=new Date(dateInput);if(isNaN(date.getTime()))return"";const months=["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"],day=date.getDate(),month=months[date.getMonth()],year=date.getFullYear(),time=date.toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"});return`${day} ${month} ${year} \u2022 ${time} `}function renderProfile(){return window.loadFrontendFeature("views").then(()=>window.scheduleRender(0)).catch(()=>{}),'<div class="view" style="padding:24px">Caricamento\u2026 <button onclick="window.scheduleRender(0)">Riprova</button></div>'}function formatSubjectTitle(str){if(!str)return"Materia";if(typeof getSubjectCanonicalName=="function"){const canonical=getSubjectCanonicalName(str);if(canonical)return canonical}return str.trim().toLowerCase().replace(/(^|\s|-|\/)\S/g,l=>l.toUpperCase()).replace(/\b(e|ed|di|del|della|degli|in|con|su|per|tra|fra)\b/gi,w=>w.toLowerCase()).replace(/^[a-z]/,l=>l.toUpperCase())}function formatFriendlyDate(dateStr){if(!dateStr||dateStr==="recentissimo")return"ieri";if(dateStr.includes("ieri")||dateStr.includes("fa"))return dateStr;const d=typeof parseArgoDate=="function"?parseArgoDate(dateStr):new Date(dateStr);if(!d||isNaN(d))return dateStr;const now=new Date,dDate=new Date(d.getFullYear(),d.getMonth(),d.getDate()),nowDate=new Date(now.getFullYear(),now.getMonth(),now.getDate()),diffDays=Math.round((nowDate-dDate)/864e5);if(diffDays===0)return"oggi";if(diffDays===1)return"ieri";if(diffDays>1&&diffDays<=7)return`${diffDays} giorni fa`;const MONTHS_SHORT=["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];return`${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`}function renderGradesView(){return window.loadFrontendFeature("views").then(()=>window.scheduleRender(0)).catch(()=>{}),'<div class="view" style="padding:24px">Caricamento\u2026 <button onclick="window.scheduleRender(0)">Riprova</button></div>'}window.votiJumpToSlide=function(idx){const el=document.getElementById("voti-subjects-carousel");if(el){const targetSlide=el.querySelectorAll(".voti-subjects-slide")[idx];if(targetSlide)el.scrollTo({left:targetSlide.offsetLeft,behavior:"smooth"});else{const slideWidth=el.clientWidth||el.offsetWidth||window.innerWidth;el.scrollTo({left:idx*slideWidth,behavior:"smooth"})}}},window.handleVotiSubjectsScroll=function(el){if(!el)return;const slideWidth=el.clientWidth||el.offsetWidth||window.innerWidth;if(!slideWidth)return;const idx=Math.round(el.scrollLeft/slideWidth);document.querySelectorAll(".voti-subjects-dot").forEach(function(dot,i){dot.style.width=i===idx?"20px":"6px",dot.style.background=i===idx?"#2997ff":"rgba(255, 255, 255, 0.25)",dot.style.borderRadius="9999px"})},window.openAllGradesModal=function(){const activeYearKey=typeof getActiveSchoolYear=="function"?getActiveSchoolYear():getCurrentSchoolYearKey(),allVoti=getVotiData(),rawVoti=typeof getVotesForSchoolYear=="function"?getVotesForSchoolYear(activeYearKey,allVoti):allVoti;if(!rawVoti||rawVoti.length===0){typeof window.openBottomSheet=="function"?window.openBottomSheet({title:`Tutti i Voti \xB7 A.S. ${escapeHtml(activeYearKey)} (0)`,html:`
                    <div style="text-align:center;padding:36px 20px 24px;color:rgba(255,255,255,0.7);">
                        <div style="width:58px;height:58px;border-radius:18px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;color:#0a84ff;font-size:26px;">
                            <i class="ph-fill ph-student"></i>
                        </div>
                        <h4 style="font-size:16px;font-weight:700;color:#fff;margin:0 0 6px;">Nessun voto registrato</h4>
                        <p style="font-size:13px;color:rgba(255,255,255,0.5);margin:0;line-height:1.4;">Non sono ancora presenti valutazioni per l'anno scolastico ${escapeHtml(activeYearKey)}.</p>
                    </div>
                `}):typeof window.showToast=="function"&&window.showToast(`Nessuna valutazione registrata per l'A.S. ${activeYearKey}`,"info");return}const sortedVoti=[...rawVoti].sort((a,b)=>parseArgoDate(b.data||b.date)-parseArgoDate(a.data||a.date)),html=`
        <div style="display:flex;flex-direction:column;gap:10px;padding-bottom:20px;">
            ${sortedVoti.map(v=>{const isSuff=getNumericGradeValue(v)>=6,color=isSuff?"#30d158":"#ff453a",bgBadge=isSuff?"rgba(48,209,88,0.15)":"rgba(255,69,58,0.15)",borderBadge=isSuff?"rgba(48,209,88,0.3)":"rgba(255,69,58,0.3)",date=(v.data||v.date||"").split("T")[0].split("-").reverse().join("/"),subj=formatSubjectTitle(v.materia||v.subject||"Materia"),itemTheme=getSubjectTheme(v.materia||v.subject||""),tipo=normalizeTipoVerifica(v.tipo,!1),desc=v.descrizione||v.comment||"";return`
                <div style="position:relative;overflow:hidden;padding:14px 16px;background:rgba(20,31,54,0.78);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:0.5px solid rgba(255,255,255,0.1);border-top:1px solid rgba(255,255,255,0.18);border-radius:18px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
                    <!-- Sfumatura cromatica in angolo del colore della materia -->
                    <div style="position:absolute;top:-20px;right:-20px;width:64px;height:64px;background:${itemTheme.color};opacity:0.18;border-radius:50%;filter:blur(18px);pointer-events:none;"></div>

                    <div style="width:36px;height:36px;border-radius:12px;background:${itemTheme.iconBg};border:1px solid ${itemTheme.border};display:flex;align-items:center;justify-content:center;color:${itemTheme.color};flex-shrink:0;position:relative;z-index:1;">
                        <i class="ph-fill ${itemTheme.icon}" style="font-size:18px;"></i>
                    </div>
                    <div style="min-width:0;flex:1;position:relative;z-index:1;">
                        <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
                            <span style="font-size:14px;font-weight:700;color:#ffffff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(subj)}</span>
                            <span style="font-size:11px;padding:2px 6px;border-radius:6px;background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.6);font-weight:600;">${escapeHtml(tipo)}</span>
                        </div>
                        <p style="font-size:12px;color:rgba(255,255,255,0.5);margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${date}${desc?` \xB7 ${escapeHtml(desc)}`:""}</p>
                    </div>
                    <span style="display:inline-flex;align-items:center;justify-content:center;min-width:38px;padding:4px 10px;border-radius:9999px;font-size:16px;font-weight:800;background:${bgBadge};border:1px solid ${borderBadge};color:${color};flex-shrink:0;position:relative;z-index:1;">${v.valore||v.value}</span>
                </div>`}).join("")}
        </div>
    `;typeof window.openBottomSheet=="function"&&window.openBottomSheet({title:`Tutti i Voti \xB7 A.S. ${escapeHtml(activeYearKey)} (${sortedVoti.length})`,html})};

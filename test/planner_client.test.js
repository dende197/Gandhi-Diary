const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function plannerClient(fetch) {
    const source=fs.readFileSync(path.join(__dirname,'../app-bootstrap.js'),'utf8');
    const start=source.indexOf('        let plannerSaveQueue =');
    const end=source.indexOf('        const PULL_REFRESH_TRIGGER_PX',start);
    const values=new Map();
    const state={isLoggedIn:true,user:{id:'alice'},plannedTasks:{a:'2026-10-01'},plannedDetails:{}};
    const window={showToast(){}};
    vm.runInNewContext(source.slice(start,end),{state,window,fetch,API_BASE_URL:'https://example.test',getSessionHeaders:()=>({}),
        localStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},console:{warn(){}}});
    return {state,values,save:window.saveTasksToSupabase};
}
test('planner client serializes writes using acknowledged versions',async()=>{
    const writes=[];
    const c=plannerClient(async(url,options)=>{
        if(!options.method)return {ok:true,json:async()=>({data:{version:0}})};
        const body=JSON.parse(options.body);writes.push(body);
        await new Promise(resolve=>setTimeout(resolve,5));
        return {ok:true,status:200,json:async()=>({data:{version:body.version+1}})};
    });
    const first=c.save();c.state.plannedTasks={a:'2026-10-02'};const second=c.save();
    await Promise.all([first,second]);
    assert.deepEqual(writes.map(w=>w.version),[0,1]);
    assert.equal(writes[0].plannedTasks.a,'2026-10-01');assert.equal(writes[1].plannedTasks.a,'2026-10-02');
    assert.equal(JSON.parse(c.values.get('gc_planner_sync:alice')).draft,undefined);
});
test('planner client keeps local draft when server rejects a stale version',async()=>{
    const c=plannerClient(async()=>({ok:false,status:409}));
    c.values.set('gc_planner_sync:alice',JSON.stringify({version:2}));
    await c.save();
    const record=JSON.parse(c.values.get('gc_planner_sync:alice'));
    assert.equal(record.version,2);assert.equal(record.draft.plannedTasks.a,'2026-10-01');
});

// USB network callbacks and production engine in the installed WebView.
// Isolated engines use in-memory persistence and fake audio; no paid requests.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {connect,run,sleep}=require('./device-harness.cjs');
const out='artifacts/task-continuity/';
(async()=>{
 const original={wifi:run(['shell','settings','get','global','wifi_on']).toString().trim(),mobile:run(['shell','settings','get','global','mobile_data']).toString().trim()};
 const h=await connect(),report={original};
 try{
  report.before=await h.read(()=>({tasks:bajiaoEngine.state.tasks.map(t=>({id:t.id,status:t.status,pauseRequested:t.pauseRequested})),network:bajiaoEngine.productionNetworkState()}));
  assert.notEqual(report.before.network,'offline');
  report.setup=await h.read(async()=>{
   const make=async(name)=>{
    const e=new Bajiao.Engine({saveState:async()=>{},mergeAudio:async()=>({id:'fake-merged',duration:2})}),b=await e.addBook(name,'甲。乙。'),c=b.chapters[0],calls=[];
    c.segments=Bajiao.units(c.text).map(s=>({...s,speaker:'旁白',confidence:1}));e.state.settings.ttsParallel=1;let fail=true;
    e.synthesize=async text=>{calls.push(text);if(text==='乙。'&&fail)throw new Bajiao.ApiError('simulated timeout',408,true);return {id:'fake-'+text,duration:1};};
    await e.enqueue(b.id,[c.id]);return {e,c,calls,ready:()=>fail=false};
   };
   window.__continuityCases=[await make('automatic'),await make('explicit pause')];
   await __continuityCases[1].e.pause(__continuityCases[1].e.state.tasks[0].id);
   let lastNetwork=bajiaoEngine.productionNetworkState();window.__continuityEvent=()=>{const network=bajiaoEngine.productionNetworkState(),changed=network!==lastNetwork;lastNetwork=network;for(const x of __continuityCases)x.e.refreshProductionNetwork(changed&&network!=='offline').catch(()=>{});};
   window.addEventListener('productionnetworkchange',__continuityEvent);
   return __continuityCases.map(x=>({status:x.e.state.tasks[0].status,retry:x.e.state.tasks[0].retryWaiting,calls:x.calls}));
  });
  assert.equal(report.setup[0].status,'queued');assert.equal(report.setup[1].status,'paused');
  run(['shell','svc','data','disable']);run(['shell','svc','wifi','disable']);
  for(let i=0;i<60;i++){if(await h.read(()=>bajiaoEngine.productionNetworkState()==='offline'))break;await sleep(200);}
  report.offlineNative=await h.read(()=>device.call('networkState'));report.offlineRadios={wifi:run(['shell','settings','get','global','wifi_on']).toString().trim(),mobile:run(['shell','settings','get','global','mobile_data']).toString().trim()};report.offline=await h.read(()=>bajiaoEngine.productionNetworkState());assert.equal(report.offline,'offline');
  await h.read(()=>__continuityCases.forEach(x=>x.ready()));
  if(original.wifi==='1')run(['shell','svc','wifi','enable']);if(original.mobile==='1')run(['shell','svc','data','enable']);
  for(let i=0;i<120;i++){if(await h.read(()=>__continuityCases[0].e.state.tasks[0].status==='done'))break;await sleep(200);}
  report.reconnected=await h.read(()=>({network:bajiaoEngine.productionNetworkState(),cases:__continuityCases.map(x=>({task:x.e.state.tasks[0],calls:x.calls,audio:x.c.segments.map(s=>s.audio)}))}));
  const [auto,paused]=report.reconnected.cases;assert.equal(auto.task.status,'done');assert.deepEqual(auto.calls,['甲。','乙。','乙。']);assert.equal(paused.task.status,'paused');assert.deepEqual(paused.calls,['甲。','乙。']);
  await h.read(async()=>{const x=__continuityCases[1];await x.e.resume(x.e.state.tasks[0].id);});
  report.manualResume=await h.read(()=>__continuityCases[1].e.state.tasks[0].status);assert.equal(report.manualResume,'done');
  report.after=await h.read(()=>({tasks:bajiaoEngine.state.tasks.map(t=>({id:t.id,status:t.status,pauseRequested:t.pauseRequested})),network:bajiaoEngine.productionNetworkState()}));
  assert.deepEqual(report.after.tasks,report.before.tasks);report.pass=true;
 }finally{
  run(['shell','svc','wifi',original.wifi==='1'?'enable':'disable']);run(['shell','svc','data',original.mobile==='1'?'enable':'disable']);
  await h.read(()=>{window.removeEventListener('productionnetworkchange',window.__continuityEvent);for(const x of window.__continuityCases||[])clearTimeout(x.e._productionRetryTimer);delete window.__continuityCases;delete window.__continuityEvent;}).catch(()=>{});
  fs.writeFileSync(out+'device-network-report.json',JSON.stringify(report,null,2));await h.browser.close();
 }
 console.log('PASS installed WebView: real USB offline/reconnect automatically finishes only the active task; explicit pause survives; saved audio and user tasks preserved; no paid model calls');
})().catch(e=>{console.error(e);process.exitCode=1});

const {test}=require('node:test'),assert=require('node:assert/strict');
const {Engine,ApiError,units,isNetworkRetryable}=require('../app/src/main/assets/core.js');
async function fixture(pipeline=false){
 const e=new Engine({features:{pipeline},saveState:async()=>{},mergeAudio:async()=>({id:'chapter.wav',duration:2})});
 const b=await e.addBook('重试测试','甲。乙。'),c=b.chapters[0];
 c.segments=units(c.text).map(s=>({...s,speaker:'旁白',confidence:1}));e.state.settings.ttsParallel=1;
 return {e,b,c};
}
for(const pipeline of [false,true])test(`transient failure retains checkpoint and retries beyond ten rounds (pipeline=${pipeline})`,async()=>{
 const {e,b,c}=await fixture(pipeline),calls=[];let failing=true;
 e.synthesize=async text=>{calls.push(text);if(text==='乙。'&&failing)throw new ApiError('connection reset',503,true);return {id:text,duration:1};};
 await e.enqueue(b.id,[c.id]);const t=e.state.tasks[0];
 for(let i=0;i<12;i++){
  assert.equal(t.status,'queued');assert.equal(t.retryWaiting,true);assert.equal(t.pauseRequested,false);
  assert.equal(c.segments[0].audio,'甲。');assert(t.nextRetryAt>Date.now());assert.equal(e.nextQueued(),null);
  t.nextRetryAt=0;await e.kick();
 }
 assert(t.retryCount>10);failing=false;t.nextRetryAt=0;await e.kick();
 assert.equal(t.status,'done');assert.equal(c.audio,'chapter.wav');assert.equal(calls.filter(s=>s==='甲。').length,1);
 assert.equal(e._ttsActive,0);assert.equal(e._synthRunning,0);
});
test('retry deadline dispatches automatically, without a user resume',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:100000});const {e}=await fixture();
 e.state.tasks=[{id:'retry',status:'queued',retryWaiting:true,nextRetryAt:130000}];let calls=0;
 e.kick=async()=>{calls++;};e.scheduleProductionRetry();t.mock.timers.tick(29999);assert.equal(calls,0);
 t.mock.timers.tick(1);assert.equal(calls,1);
});
test('reload recovers interrupted work, legacy transient failures and priority yields, retaining explicit pauses',async()=>{
 const {e}=await fixture();e.state.tasks=[
  {id:'running',status:'running',pauseRequested:false},
  {id:'draining-user-pause',status:'running',pauseRequested:true},
  {id:'yield',status:'running',pauseRequested:true,yieldRequested:true},
  {id:'paused',status:'paused',pauseRequested:true},
  {id:'legacy-interruption',status:'paused',pauseRequested:false},
  {id:'network',status:'failed',error:{status:408,message:'timeout'}},
  {id:'auth',status:'failed',error:{status:401,message:'invalid token'}},
  {id:'cancelled',status:'cancelled',pauseRequested:true},
  {id:'delayed',status:'queued',retryWaiting:true,nextRetryAt:Date.now()+60000,retryCount:15},
 ];
 const restored=new Engine(e.io,JSON.parse(JSON.stringify(e.state)));
 assert.deepEqual(restored.state.tasks.map(t=>t.status),['queued','paused','queued','paused','queued','queued','failed','cancelled','queued']);
 assert.equal(restored.state.tasks.at(-1).retryCount,15);assert(restored.state.tasks.at(-1).nextRetryAt>Date.now());
});
for(const action of ['pause','cancel','removeTask'])test(`${action} prevents a delayed network retry from restarting`,async()=>{
 const {e,b,c}=await fixture();let calls=0;e.synthesize=async()=>{calls++;throw new ApiError('timeout',408,true);};
 await e.enqueue(b.id,[c.id]);const t=e.state.tasks[0];await e[action](t.id);await e.kick();
 assert.equal(calls,1);assert.equal(e.nextQueued(),null);assert.equal(e._productionRetryTimer,null);
});
test('permanent failures do not loop even when message or provider flag mentions retry',async()=>{
 for(const status of [400,401,403,404,413,422])assert.equal(isNetworkRetryable({status,retryable:true,message:'network error'}),false);
 const {e,b,c}=await fixture();let calls=0;e.synthesize=async()=>{calls++;throw new ApiError('unauthorized',401,true);};
 await e.enqueue(b.id,[c.id]);assert.equal(e.state.tasks[0].status,'failed');assert.equal(calls,1);assert.equal(e._productionRetryTimer,null);
});
test('manual pause overrides priority yield while the old owner drains',async()=>{
 const {e}=await fixture(),t={id:'yield',status:'running'};e.state.tasks=[t];e._frontActive.add(t);
 await e.pause(t.id,'priority');assert.equal(t.yieldRequested,true);await e.pause(t.id);e._frontActive.delete(t);t.status='paused';await e.finishTaskRun(t);
 assert.equal(t.status,'paused');assert.equal(t.pauseRequested,true);assert.equal(t.pauseReason,'user');assert.equal(e.nextQueued(),null);
});
test('pausing interrupts request backoff promptly and leaves no extra paid request',{timeout:2000},async()=>{
 const {e}=await fixture();let paused=false,calls=0;
 e.io.request=async()=>{calls++;throw new ApiError('timeout',408,true);};
 const job=e.performRequest('llm',{}, {shouldPause:()=>paused});
 for(let i=0;i<30&&!e._requestRetryWaiters?.size;i++)await new Promise(r=>setImmediate(r));
 assert.equal(e._requestRetryWaiters.size,1);paused=true;e.wakeRequestRetries();
 await assert.rejects(job,/任务已暂停/);assert.equal(calls,1);assert.equal(e._requestRetryWaiters.size,0);
});
test('a queued save includes dirty chapters restored by a preceding failed snapshot',async()=>{
 const {e,c}=await fixture();let fail=false,entered,release,persisted;
 e.io.saveSnapshot=async(header,chapters)=>{if(fail){fail=false;entered();await new Promise(r=>release=r);throw Error('temporary storage failure');}persisted=JSON.parse(chapters);};
 await e.persist();c.segments[0].audio='saved.wav';e.touch(c);fail=true;
 const started=new Promise(r=>entered=r),first=e.persist();await started;
 const second=e.persist();const rejected=assert.rejects(first,/storage failure/);release();await rejected;await second;
 assert.equal(persisted[0].segments[0].audio,'saved.wav');
});
test('edits while merging are automatically requeued without regenerating saved audio',async()=>{
 const {e,b,c}=await fixture();c.segments.forEach((s,i)=>s.audio='saved-'+i);let merges=0,requests=0;
 e.synthesize=async()=>{requests++;throw Error('must preserve saved audio');};
 e.io.mergeAudio=async()=>{merges++;if(merges===1)c.segments[0].emotion='修改';return {id:'merged.wav',duration:2};};
 await e.enqueue(b.id,[c.id]);const t=e.state.tasks[0];assert.equal(t.status,'queued');assert(t.nextRetryAt>Date.now());
 t.nextRetryAt=0;await e.kick();assert.equal(t.status,'done');assert.equal(merges,2);assert.equal(requests,0);
});
for(const pipeline of [false,true])test(`transient checkpoint failure schedules recovery without synthesizing saved audio twice (pipeline=${pipeline})`,async()=>{
 const {e,b,c}=await fixture(pipeline),calls=[];let fail=true;
 e.io.saveState=async()=>{if(fail&&c.segments[0].audio){fail=false;throw Error('temporary storage failure');}};
 e.synthesize=async text=>{calls.push(text);return {id:text,duration:1};};
 await e.enqueue(b.id,[c.id]);const t=e.state.tasks[0];assert.equal(t.status,'queued');assert.equal(t.retryKind,'checkpoint');assert(t.nextRetryAt>Date.now());
 t.nextRetryAt=0;await e.kick();assert.equal(t.status,'done');assert.deepEqual(calls,['甲。','乙。']);
});

const {test}=require('node:test'),assert=require('node:assert/strict');
const {Engine,ApiError,DEFAULTS,makeState,parseRetryCount,taskRetryMessage,units}=require('../app/src/main/assets/core.js');

test('retry counts default to three, preserve saved choices and accept arbitrary non-negative integers',()=>{
 assert.equal(DEFAULTS.retries,3);assert.equal(new Engine({}).state.settings.retries,3);
 for(const value of [0,1,3,7,1000,'0',' 12 ','007'])assert.equal(parseRetryCount(value),Number(value));
 for(const value of ['', ' ', '-1', '1.5', '1e2', 'abc', 'Infinity',NaN,Infinity,-1,1.2,null,undefined,true,'9007199254740993'])assert.equal(parseRetryCount(value),null,String(value));
 for(const value of [0,2,9]){const state=makeState();state.settings.retries=value;assert.equal(new Engine({},state).state.settings.retries,value);}
 const state=makeState();state.settings.retries='invalid';assert.equal(new Engine({},state).state.settings.retries,3);
});

for(const pipeline of [false,true])for(const provider of ['llm','tts'])for(const retries of [0,3,7])test(`${provider} retries exactly ${retries} times then stops (pipeline=${pipeline})`,async()=>{
 const calls=[],counts=[],e=new Engine({features:{pipeline},saveState:async()=>{},sleep:async()=>{},request:async()=>{calls.push(provider);throw new ApiError('请求超时',408,true);}});
 e.state.settings.retries=retries;e.state.settings.ttsParallel=1;
 const b=await e.addBook('请求失败','甲。'),c=b.chapters[0];
 if(provider==='tts'){c.segments=units(c.text).map(s=>({...s,speaker:'旁白',confidence:1}));e.synthesize=async function(){return this.request('tts',{model:'test'});};}
 e.onChange(()=>{const t=e.state.tasks[0];if(t?.requestRetryCount)counts.push(t.requestRetryCount);});
 await e.enqueue(b.id,[c.id]);const t=e.state.tasks[0];
 assert.equal(calls.length,retries+1);assert.equal(t.status,'failed');assert.equal(t.retryAttempts,retries);
 assert.equal(taskRetryMessage(t),`重试${retries}次后仍然失败，请手动处理。`);
 assert.deepEqual([...new Set(counts)],Array.from({length:retries},(_,i)=>i+1));
 assert.equal(e._productionRetryTimer,null);assert.equal(t.nextRetryAt,undefined);
 await e.kick();assert.equal(calls.length,retries+1);
 const restored=new Engine(e.io,JSON.parse(JSON.stringify(e.state)));await restored.recoverProduction();
 assert.equal(restored.state.tasks[0].status,'failed');assert.equal(calls.length,retries+1);
});

test('retry success clears the hint and manual resume starts a fresh budget without replacing completed audio',async()=>{
 let failing=true,calls=0;const hints=[];
 const e=new Engine({saveState:async()=>{},sleep:async()=>{},request:async()=>{calls++;if(failing)throw new ApiError('timeout',408,true);return {};},mergeAudio:async()=>({id:'chapter.wav',duration:2})});
 const b=await e.addBook('保留进度','甲。乙。'),c=b.chapters[0];c.segments=units(c.text).map(s=>({...s,speaker:'旁白',confidence:1}));c.segments[0].audio='saved.wav';
 e.synthesize=async function(){await this.request('tts',{model:'test'});return {id:'new.wav',duration:1};};
 e.onChange(()=>{if(e.state.tasks[0])hints.push(taskRetryMessage(e.state.tasks[0]));});
 await e.enqueue(b.id,[c.id]);const t=e.state.tasks[0];assert.equal(calls,4);assert.equal(t.status,'failed');
 failing=false;await e.resume(t.id);assert.equal(calls,5);assert.equal(t.status,'done');assert.equal(c.segments[0].audio,'saved.wav');
 assert.equal(t.retryExhausted,false);assert.equal(taskRetryMessage(t),'');assert(hints.includes('制作失败，正在第3次重试。'));
});

test('one successful concurrent request does not erase another request retry hint',async()=>{
 const e=new Engine({saveState:async()=>{}}),t={id:'parallel',status:'running',phase:'合成对白'};e.state.tasks=[t];
 e.setTaskRequestRetry(t,'first',2);e.setTaskRequestRetry(t,'second',1);
 e.setTaskRequestRetry(t,'second',0);assert.equal(taskRetryMessage(t),'制作失败，正在第2次重试。');
 e.setTaskRequestRetry(t,'first',0);assert.equal(taskRetryMessage(t),'');
});

test('non-recoverable failures never consume automatic retries',async()=>{
 for(const status of [400,401,403,422]){
  let calls=0;const e=new Engine({saveState:async()=>{},request:async()=>{calls++;throw new ApiError('拒绝请求',status,true);}});
  await assert.rejects(e.performRequest('llm',{}));assert.equal(calls,1);
 }
});

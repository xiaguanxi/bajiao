const {test}=require('node:test'),assert=require('node:assert/strict');
const {Engine,ModelPrompts}=require('../app/src/main/assets/core.js');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function fixture(n=5){
 const e=new Engine({saveState:async()=>{}}),b=await e.addBook('排序测试',Array.from({length:n},(_,i)=>`第${i+1}章\n章节内容。`).join('\n'));
 e.state.tasks=b.chapters.map((c,i)=>({id:'t'+i,bookId:b.id,chapterId:c.id,status:'queued',created:n-i,prio:0}));
 return {e,b,t:e.state.tasks};
}
test('chapter order wins over enqueue time, status and playback source; manual drag survives reload',async()=>{
 const {e,t}=await fixture();t[0].source='auto';t[3].source='explicit';t[1].status='paused';t[2].status='running';
 assert.deepEqual(e.pendingOrder().map(t=>t.id),['t0','t1','t2','t3','t4']);
 await e.reorderTask('t4','t0');assert.deepEqual(e.pendingOrder().map(t=>t.id),['t4','t0','t1','t2','t3']);
 assert(e.taskPriority(t[4])>e.taskPriority(t[0]));
 const restored=new Engine({saveState:async()=>{}},JSON.parse(JSON.stringify(e.state)));
 assert.deepEqual(restored.pendingOrder().map(t=>t.id),['t4','t0','t1','t2','t3']);
 await restored.moveTask('t2','top');assert.equal(restored.pendingOrder()[0].id,'t2');
});
test('single Start pauses lowest priority owners only and reserves the next slot until they drain',async()=>{
 const {e,t}=await fixture();e.state.settings.taskParallel=2;
 t[0].status=t[1].status='running';e._frontActive.add(t[0]);e._frontActive.add(t[1]);
 // Isolate dispatch so assertions can inspect both the draining and available states.
 e.kick=async()=>{};await e.resume('t4');
 assert.equal(t[0].pauseRequested,undefined);assert.equal(t[1].pauseRequested,true);assert.equal(t[4].status,'queued');assert.equal(e.nextQueued(),null);
 e._frontActive.delete(t[1]);t[1].status='paused';assert.equal(e.nextQueued(),t[4]);assert.equal(t[0].status,'running');
});
test('Start pauses enough owners after a concurrency reduction, lowest first',async()=>{
 const {e,t}=await fixture();e.state.settings.taskParallel=1;e.kick=async()=>{};
 const stopped=[],pause=e.pause.bind(e);e.pause=async (id,reason)=>{stopped.push(id);return pause(id,reason);};
 for(const task of t.slice(0,3)){task.status='running';e._frontActive.add(task);}
 await e.resume('t4');assert.deepEqual(stopped,['t2','t1','t0']);assert(t.slice(0,3).every(t=>t.pauseRequested));
});
test('preemption preserves saved segments, waits for inflight work and starts the selected chapter next',{timeout:5000},async()=>{
 const {e,b,t}=await fixture(3);const entered=deferred(),release=deferred(),calls=[];
 b.chapters[0].segments=[{id:0,text:'已有片段',audio:'saved.wav'}];
 e.work=async task=>{calls.push(task.id);if(task===t[0]){entered.resolve();await release.promise;task.status=task.pauseRequested?'paused':'done';}else task.status='done';};
 const run=e.kick();await entered.promise;const start=e.resume('t2');
 await e.saveChain;assert.equal(t[0].pauseRequested,true);assert.deepEqual(calls,['t0']);
 release.resolve();await Promise.all([run,start]);assert.deepEqual(calls,['t0','t2','t0','t1']);assert.equal(t[0].status,'done');assert.equal(b.chapters[0].segments[0].audio,'saved.wav');
});
test('bulk resume and confirmed tasks keep chapter order and prior manual ordering',async()=>{
 const {e,t}=await fixture();e.kick=async()=>{};for(const task of t)task.status='paused';
 await e.resumeTasks(['t4','t2','t0']);assert.deepEqual(e.pendingOrder().map(t=>t.id),['t0','t1','t2','t3','t4']);
 await e.reorderTask('t3','t0');t[1].status='waiting';await e.resumeWaiting(t[1].bookId);assert.equal(e.pendingOrder()[0].id,'t3');
});
test('pipeline respects manual priority even when a later chapter is moved above an earlier one',async()=>{
 const {e,t}=await fixture();e.features.pipeline=true;await e.reorderTask('t4','t0');assert.equal(e.nextQueued(),t[4]);
});
test('narrator restraint is scoped to narration; single-character speech keeps clear articulation',()=>{
 const e=new Engine({}),direction={directionVersion:1,scene:'门口',delivery:'先急后缓，轻轻强调。'};
 const character={...direction,speaker:'林晚',text:'别走。'};
 assert.equal(e.speechDirection('preset:茉莉','担心','',undefined,character),'场景：门口\n指导：先急后缓，轻轻强调。');
 const narrator=e.speechDirection('preset:白桦','担心','',undefined,{...character,speaker:'旁白'});
 assert.equal(narrator,'场景：门口\n指导：先急后缓，轻轻强调。');assert.match(ModelPrompts.annotationRules,/旁白的 emotion 与 delivery 必须从生成时就采用克制/);
 for(const text of ['“啊！”','嗯。','「不」','好','A!'])assert.match(e.speechDirection('preset:茉莉','', '',undefined,{...direction,speaker:'林晚',text}),/吐字务必清晰完整/);
 assert(!e.speechDirection('preset:茉莉','', '',undefined,{...character,text:'……'}).includes('本句只有一个字'));
 assert.equal(e.speechDirection('preset:白桦','', '', ' 自定义\n指导 ',{speaker:'旁白',text:'嗯'}),' 自定义\n指导 ');
 assert.match(ModelPrompts.annotationRules,/单字语句/);assert.match(ModelPrompts.direction({batch:[],context:[]}),/旁白自然克制/);
});
test('single-character character speech sends clear-articulation guidance without changing its acting direction',async()=>{
 const calls=[],wave=require('./wav-fixture.cjs')();
 const e=new Engine({saveState:async()=>{},request:async(_,body)=>{calls.push(body);return {choices:[{finish_reason:'stop',message:{audio:{data:wave}}}]};},saveRawAudio:async()=>({id:'single.wav',duration:2,playable:true})});
 await e.synthesize('“嗯。”','preset:茉莉','迟疑',{speaker:'林晚',scene:'门口',delivery:'轻声迟疑，收住尾音。',directionVersion:1});
 assert.match(calls[0].messages[0].content,/指导：轻声迟疑，收住尾音。/);assert.match(calls[0].messages[0].content,/吐字务必清晰完整/);
 assert(!calls[0].messages[0].content.includes('旁白以'));assert.deepEqual(calls[0].messages[1],{role:'assistant',content:'“嗯。”'});
});

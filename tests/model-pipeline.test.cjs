const {test}=require('node:test'),assert=require('node:assert/strict');
const {Engine,units}=require('../app/src/main/assets/core.js'),{Scheduler}=require('../app/src/main/assets/model-scheduler.js');
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function setup(){const e=new Engine({features:{pipeline:true},saveState:async()=>{},mergeAudio:async ids=>({id:ids.join('+'),duration:ids.length})});const b=await e.addBook('pipeline','第一章\n甲。\n第二章\n乙。\n第三章\n丙。');for(const c of b.chapters)c.segments=units(c.text).map(s=>({...s,speaker:'旁白',emotion:'自然',confidence:1}));return {e,b};}
test('default front concurrency prefetches exactly one chapter while TTS is held',{timeout:5000},async()=>{
 const {e,b}=await setup(),entered=gate(),second=gate(),release=gate(),events=[];const analyze=e.analyze.bind(e);e.analyze=async(...args)=>{events.push(args[1]);const result=await analyze(...args);if(args[1]===b.chapters[1].id)second.resolve();return result;};
 let first=true;e.synthesize=async text=>{if(first){first=false;entered.resolve();await release.promise;}return {id:text,duration:1};};const run=e.enqueue(b.id,b.chapters.map(c=>c.id));await entered.promise;await second.promise;
 assert.deepEqual(events,b.chapters.slice(0,2).map(c=>c.id));release.resolve();await run;assert(e.state.tasks.every(t=>t.status==='done'));assert.equal(new Set(events).size,3);
});
test('narrator synthesis runs while a new character design is held',{timeout:5000},async()=>{
 const {e,b}=await setup(),c=b.chapters[0],design=gate(),release=gate(),narrator=gate();b.characters.push({name:'角色',description:'青年男声',voice:null});c.text+='角色台词。';c.segments.push({id:c.segments.length,text:'角色台词。',speaker:'角色',emotion:'自然',confidence:1});
 e.design=async()=>{design.resolve();await release.promise;return {id:'new',sample:'ref.wav'};};e.synthesize=async text=>{narrator.resolve();return {id:text,duration:1};};const run=e.enqueue(b.id,[c.id]);await design.promise;await narrator.promise;assert.equal(c.audio,undefined);release.resolve();await run;assert.equal(e.state.tasks[0].status,'done');assert(c.segments.every(s=>s.audio));
});
test('pipeline pause/resume waits for old owner and preserves each finished sentence',{timeout:5000},async()=>{
 const {e,b}=await setup(),entered=gate(),release=gate(),c=b.chapters[0],calls=[];e.synthesize=async text=>{calls.push(text);if(calls.length===1){entered.resolve();await release.promise;}return {id:text,duration:1};};const run=e.enqueue(b.id,[c.id]);await entered.promise;const t=e.state.tasks[0];await e.pause(t.id);const resumed=e.resume(t.id);assert(t.resumeRequested);release.resolve();await Promise.all([run,resumed]);assert.equal(t.status,'done');assert.equal(calls.length,c.segments.length);assert.equal(new Set(calls).size,calls.length);
});
test('all TTS models share a network budget, clones retain a separate limit',{timeout:5000},async()=>{
 const e=new Engine({saveState:async()=>{},request:async()=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,15));active--;return {};}});let active=0,max=0;await Promise.all(['mimo-v2.5-tts','mimo-v2.5-tts-voiceclone','mimo-v2.5-tts-voicedesign','mimo-v2.5-tts'].map(model=>e.request('tts',{model})));assert.equal(max,2);assert.equal(e.requestScheduler().active,0);
});
test('scheduler promotes manual work ahead of queued warming and cancels before sending',async()=>{
 const s=new Scheduler(()=>1,()=>1),first=await s.acquire('m'),order=[];const warm=s.acquire('m',0).then(slot=>{order.push('warm');slot.release();});const manual=s.acquire('m',100).then(slot=>{order.push('manual');slot.release();});const cancelled=s.acquire('m',200,()=>true);await assert.rejects(cancelled,/暂停/);first.release();await Promise.all([warm,manual]);assert.deepEqual(order,['manual','warm']);
});
test('manual redo reaches the network scheduler ahead of an automatic clone already waiting',{timeout:5000},async()=>{
 const e=new Engine({saveState:async()=>{}}),entered=gate(),release=gate(),order=[];e.io.request=async(_,body)=>{order.push(body.label);if(order.length===1){entered.resolve();await release.promise;}return {};};
 const first=e.request('tts',{model:'mimo-v2.5-tts-voiceclone',label:'inflight'},null,{priority:20});await entered.promise;const automatic=e.request('tts',{model:'mimo-v2.5-tts-voiceclone',label:'automatic'},null,{priority:20});const manual=e.request('tts',{model:'mimo-v2.5-tts-voiceclone',label:'manual'},null,{priority:100});release.resolve();await Promise.all([first,automatic,manual]);assert.deepEqual(order,['inflight','manual','automatic']);
});
for(const edit of ['binding','delete','merge'])test(`pipeline discards stale in-flight audio after ${edit}`,{timeout:5000},async()=>{
 const {e,b}=await setup(),c=b.chapters[0],entered=gate(),release=gate();e.synthesize=async()=>{entered.resolve();await release.promise;return {id:'stale.wav',duration:1};};const run=e.enqueue(b.id,[c.id]);await entered.promise;
 if(edit==='binding')await e.bind(b.id,'旁白','preset:茉莉',false);
 if(edit==='delete')await e.deleteBook(b.id);
 if(edit==='merge'){b.characters.push({name:'新旁白',voice:'preset:茉莉',description:'女声'});await e.mergeRoles(b.id,'新旁白','旁白');}
 release.resolve();await run;assert(!c.segments.some(s=>s.audio==='stale.wav'));assert.notEqual(c.audio,'stale.wav');
});
test('a role description edited during design cannot receive the old candidate',async()=>{
 const {e,b}=await setup(),role={name:'角色',description:'男声'};b.characters.push(role);const release=gate();e.design=async()=>{await release.promise;return {id:'old',sample:'old.wav'};};const pending=e.ensureDesignCandidate(b,role);role.description='女声';release.resolve();assert.equal(await pending,null);assert.equal(role.candidate,undefined);
});
test('a role removed after annotation retains its original decision during automatic fallback',async()=>{
 const {e,b}=await setup(),c=b.chapters[0];c.segments[0].speaker='已移除角色';c.segments[0].confidence=.24;e.analyze=async()=>c;e.synthesize=async()=>({id:'narration.wav',duration:1});await e.enqueue(b.id,[c.id]);const s=c.segments[0];assert.equal(s.speaker,'旁白');assert.equal(s.confidence,.24);assert.equal(s.annotationOriginal.speaker,'已移除角色');assert(s.annotationFallbackReason);
});

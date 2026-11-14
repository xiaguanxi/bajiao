const {test}=require('node:test'),assert=require('node:assert/strict');
const V=require('../app/src/main/assets/core.js'),UX=require('../app/src/main/assets/ux.js');
const io=()=>({features:{direction:false},saveState:async()=>{},mergeAudio:async()=>({id:'chapter.wav',duration:2})});

for(const response of [
 {base_resp:{status_code:1026,status_msg:'input new_sensitive (1026)'}},
 {error:{code:'1027',message:'output new_sensitive (1027)'}},
 'http'
])test('rejected annotation stops for manual handling while other chapters complete: '+JSON.stringify(response),async()=>{
 const e=new V.Engine(io());e.state.settings.mode='manual';const b=await e.addBook('测试','第1章 失败\n'+Array.from({length:50},(_,i)=>'原文'+i+'。').join('')+'\n第2章 继续\n后续。');
 const [c,next]=b.chapters;next.segments=[{id:0,text:next.text,speaker:'旁白',confidence:1,audio:'saved.wav'}];let calls=0;
 e.io.request=async()=>{calls++;if(response==='http'){const err=new V.ApiError('input new_sensitive (1026)',500,true);err.code='1026';throw err;}return response;};
 const text=c.text;await e.enqueue(b.id,[c.id,next.id]);const [waiting,done]=e.state.tasks;
 assert.equal(calls,1,'a permanent refusal cannot trigger smaller-batch requests');assert.equal(waiting.total,50);assert.equal(waiting.status,'failed');assert.equal(waiting.phase,'内容审核未通过');assert.equal(c.segments.length,50);assert(c.segments.every(s=>s.annotationStatus==='pending'));assert.equal(waiting.error.retryable,false);assert(c.analysisDraft.pending.length);
 assert.equal(c.text,text);assert.equal(done.status,'done');assert.equal(next.segments[0].audio,'saved.wav');assert.equal(next.audio,'chapter.wav');
});

test('legacy analyzed batch stays intact while only unresolved annotation sentences need repair',async()=>{
 const e=new V.Engine(io());e.state.settings.mode='manual';const b=await e.addBook('测试',Array.from({length:50},(_,i)=>'原文'+i+'。').join('')),c=b.chapters[0],input=V.units(c.text);
 c.analysisDraft={segments:input.slice(0,45).map(x=>({...x,speaker:'旁白',emotion:'',confidence:1,audio:'saved-'+x.id})),next:45,batchSize:45};const strip=o=>JSON.stringify(o,(k,v)=>k==='promptMode'?undefined:v);const checkpoint=strip(c.analysisDraft.segments);
 e.io.request=async()=>({base_resp:{status_code:1026,status_msg:'input new_sensitive (1026)'}});await e.enqueue(b.id,[c.id]);const t=e.state.tasks[0];
 assert.equal(strip(c.segments.slice(0,45)),checkpoint);assert.equal(c.segments.filter(s=>s.annotationStatus==='pending').length,5);assert.equal(t.status,'failed');assert(c.analysisDraft.pending.length);assert.equal(c.segments.filter(s=>s.audio).length,45);
 let calls=0;e.io.request=async()=>{calls++;throw Error('successful annotations must not be repeated');};e.synthesize=async text=>({id:text,duration:1});
 for(const s of c.segments.slice(45))await e.correct(b.id,c.id,s.id,'旁白','自然朗读');await e.resume(t.id);
 assert.equal(t.status,'done');assert.equal(calls,0);assert.equal(t.message,'');assert.equal(t.error,null);assert.equal(c.segments.length,50);assert.equal(c.analysisDraft,undefined);assert.equal(strip(c.segments.slice(0,45)),checkpoint);
});

test('one rejected synthesis sentence is pending while other sentences and chapters finish',async()=>{
 const e=new V.Engine(io());e.state.settings.mode='manual';const b=await e.addBook('测试','第1章 待处理\n甲。乙。丙。\n第2章 后续\n丁。');e.state.settings.ttsParallel=1;
 for(const c of b.chapters)c.segments=V.units(c.text).map(s=>({...s,speaker:'旁白',emotion:'',confidence:1}));b.chapters[0].segments[0].audio='existing.wav';const calls=[];
 e.synthesize=async text=>{calls.push(text);if(text==='乙。')throw new V.ApiError('input new_sensitive (1026)',1026,false);return {id:text,duration:1};};await e.enqueue(b.id,b.chapters.map(c=>c.id));
 const [waiting,done]=e.state.tasks;assert.equal(waiting.status,'waiting');assert.equal(done.status,'done');const [saved,rejected,after]=b.chapters[0].segments;
 assert.equal(saved.audio,'existing.wav');assert.equal(rejected.qualityStatus,'pending');assert.equal(rejected.audio,undefined);assert.equal(after.audio,'丙。');assert.equal(b.chapters[0].audio,undefined);assert.deepEqual(calls,['乙。','丙。','丁。']);
});

test('legacy queued refusal is moved to failed on reload without altering audio',()=>{
 const state=V.makeState();state.tasks=[{id:'legacy',status:'queued',message:'input new_sensitive (1026)',done:120,total:121},{id:'normal',status:'queued',message:''}];state.voices=[{id:'v',sample:'original.wav',description:'女声'}];
 const e=new V.Engine(io(),state);assert.equal(e.state.tasks[0].status,'failed');assert.equal(e.state.tasks[0].done,120);assert.equal(e.state.tasks[1].status,'queued');assert.equal(e.state.voices[0].sample,'original.wav');
 assert.equal(V.isContentRejected(new V.ApiError('网络错误',429,true)),false);assert.equal(V.isContentRejected({code:1026,message:'拒绝'}),true);
});

for(const pipeline of [false,true])test('automatic skip preserves text and completed audio, pipeline='+pipeline,async()=>{
 const merges=[],e=new V.Engine({...io(),features:{direction:false,pipeline},mergeAudio:async ids=>{merges.push(ids);return {id:'merged.wav',duration:2};}});
 e.state.settings.ttsContentRejectedMode='skip';
 const b=await e.addBook('审核跳过','甲。乙。丙。'),c=b.chapters[0],source=c.text;
 c.segments=V.units(c.text).map(s=>({...s,speaker:'旁白',confidence:1}));c.segments[0].audio='saved.wav';const calls=[];
 e.synthesize=async text=>{calls.push(text);if(text==='乙。')throw new V.ApiError('input new_sensitive (1026)',1026,false);return {id:'after.wav',duration:1};};
 await e.enqueue(b.id,[c.id]);const t=e.state.tasks[0];
 assert.equal(t.status,'done');assert.equal(c.audio,'merged.wav');assert.equal(c.text,source);assert.equal(c.segments[1].text,'乙。');assert.equal(c.segments[1].skip,true);assert.equal(c.segments[1].audio,'skip');
 assert.deepEqual(calls.sort(),['丙。','乙。'].sort());assert.deepEqual(merges,[['saved.wav','after.wav']]);
 const reloaded=new V.Engine(io(),JSON.parse(JSON.stringify(e.state)));assert.equal(reloaded.chapter(b.id,c.id).segments[1].audio,'skip');
});

test('manual skip resolves refusals one by one and can be undone after reload',async()=>{
 const e=new V.Engine(io()),b=await e.addBook('手动跳过','甲。乙。丙。'),c=b.chapters[0];
 c.segments=V.units(c.text).map(s=>({...s,speaker:'旁白',confidence:1}));c.segments[0].audio='keep.wav';let calls=0;
 e.synthesize=async()=>{calls++;throw new V.ApiError('output new_sensitive (1027)',1027,false);};
 await e.enqueue(b.id,[c.id]);const t=e.state.tasks[0];assert.equal(t.status,'waiting');
 await e.setSegmentSkipped(b.id,c.id,1,true);await e.resumeTasks([t.id]);assert.equal(t.status,'waiting');assert.equal(calls,2);
 await e.setSegmentSkipped(b.id,c.id,2,true);await e.resumeTasks([t.id]);assert.equal(t.status,'done');assert.equal(calls,2);assert.equal(c.segments[0].audio,'keep.wav');
 const reload=new V.Engine(io(),JSON.parse(JSON.stringify(e.state)));await reload.setSegmentSkipped(b.id,c.id,1,false);
 const restored=reload.chapter(b.id,c.id);assert.equal(restored.segments[1].audio,null);assert.equal(restored.segments[1].skip,false);assert.equal(restored.segments[1].qualityStatus,'pending');assert.equal(reload.state.tasks[0].status,'paused');assert.equal(restored.audioStale,true);
});

test('automatic skip of every sentence completes without merging empty audio',async()=>{
 const e=new V.Engine({...io(),mergeAudio:async()=>{throw Error('empty audio must not merge');}}),b=await e.addBook('全跳过','甲。'),c=b.chapters[0];
 e.state.settings.ttsContentRejectedMode='skip';c.segments=[{id:0,text:'甲。',speaker:'旁白',confidence:1}];
 e.synthesize=async()=>{const error=new V.ApiError('拒绝',0,false);error.code='1027';throw error;};await e.enqueue(b.id,[c.id]);
 assert.equal(c.status,'skipped');assert.equal(c.audio,null);assert.equal(e.state.tasks[0].status,'done');assert.equal(e.state.tasks[0].skipped,1);
});

for(const error of [new V.ApiError('参数错误',400,false),new V.QualityError('音频需检查'),new V.ApiError('HTTP 503',503,false)])test('automatic skip excludes other errors: '+error.message,async()=>{
 const e=new V.Engine(io()),b=await e.addBook('保留异常','甲。'),c=b.chapters[0];e.state.settings.ttsContentRejectedMode='skip';
 c.segments=[{id:0,text:'甲。',speaker:'旁白',confidence:1}];e.synthesize=async()=>{throw error;};await e.enqueue(b.id,[c.id]);
 assert.notEqual(e.state.tasks[0].status,'done');assert.notEqual(c.segments[0].skip,true);assert.notEqual(c.segments[0].audio,'skip');
});

test('switching an existing refusal to automatic skip does not call TTS again',async()=>{
 const e=new V.Engine(io()),b=await e.addBook('切换策略','甲。乙。'),c=b.chapters[0];c.segments=V.units(c.text).map(s=>({...s,speaker:'旁白',confidence:1}));
 let calls=0;e.synthesize=async()=>{calls++;const error=new V.ApiError('审核拒绝',0,false);error.code='1026';throw error;};
 await e.enqueue(b.id,[c.id]);assert.equal(e.state.tasks[0].status,'waiting');e.state.settings.ttsContentRejectedMode='skip';await e.resumeTasks([e.state.tasks[0].id]);
 assert.equal(calls,2);assert.equal(e.state.tasks[0].status,'done');assert.equal(c.status,'skipped');
});

test('skip is blocked while the sentence is being synthesized',async()=>{
 const e=new V.Engine(io()),b=await e.addBook('合成中','甲。'),c=b.chapters[0];c.segments=[{id:0,text:'甲。',speaker:'旁白',confidence:1}];
 e._activeSegments=new Set([JSON.stringify([b.id,c.id,0])]);await assert.rejects(e.setSegmentSkipped(b.id,c.id,0,true),/正在合成/);assert.equal(c.segments[0].skip,undefined);
});

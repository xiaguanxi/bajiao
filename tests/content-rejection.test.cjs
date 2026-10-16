const {test}=require('node:test'),assert=require('node:assert/strict');
const V=require('../app/src/main/assets/core.js'),UX=require('../app/src/main/assets/ux.js');
const io=()=>({features:{direction:false},saveState:async()=>{},mergeAudio:async()=>({id:'chapter.wav',duration:2})});

for(const response of [
 {base_resp:{status_code:1026,status_msg:'input new_sensitive (1026)'}},
 {error:{code:'1027',message:'output new_sensitive (1027)'}},
 'http'
])test('rejected annotation requests narrow to single sentences and other chapters complete: '+JSON.stringify(response),async()=>{
 const e=new V.Engine(io());e.state.settings.mode='manual';const b=await e.addBook('测试','第1章 失败\n'+Array.from({length:50},(_,i)=>'原文'+i+'。').join('')+'\n第2章 继续\n后续。');
 const [c,next]=b.chapters;next.segments=[{id:0,text:next.text,speaker:'旁白',confidence:1,audio:'saved.wav'}];let calls=0;
 e.io.request=async()=>{calls++;if(response==='http'){const err=new V.ApiError('input new_sensitive (1026)',500,true);err.code='1026';throw err;}return response;};
 const text=c.text;await e.enqueue(b.id,[c.id,next.id]);const [waiting,done]=e.state.tasks;
 assert.equal(calls,61,'45 + groups of five + singles, then final five + singles');assert.equal(waiting.total,50);assert.equal(waiting.status,'waiting');assert.equal(waiting.phase,'标注待处理');assert.equal(c.segments.length,50);assert(c.segments.every(s=>s.annotationStatus==='failed'));assert.equal(waiting.error,null);
 assert.equal(c.text,text);assert.equal(done.status,'done');assert.equal(next.segments[0].audio,'saved.wav');assert.equal(next.audio,'chapter.wav');
});

test('legacy analyzed batch stays intact while only unresolved annotation sentences need repair',async()=>{
 const e=new V.Engine(io());e.state.settings.mode='manual';const b=await e.addBook('测试',Array.from({length:50},(_,i)=>'原文'+i+'。').join('')),c=b.chapters[0],input=V.units(c.text);
 c.analysisDraft={segments:input.slice(0,45).map(x=>({...x,speaker:'旁白',emotion:'',confidence:1,audio:'saved-'+x.id})),next:45,batchSize:45};const checkpoint=JSON.stringify(c.analysisDraft.segments);
 e.io.request=async()=>({base_resp:{status_code:1026,status_msg:'input new_sensitive (1026)'}});await e.enqueue(b.id,[c.id]);const t=e.state.tasks[0];
 assert.equal(JSON.stringify(c.segments.slice(0,45)),checkpoint);assert.equal(c.segments.filter(s=>s.annotationStatus==='failed').length,5);assert.equal(c.analysisDraft,undefined);assert.equal(t.done,45);
 let calls=0;e.io.request=async()=>{calls++;throw Error('successful annotations must not be repeated');};e.synthesize=async text=>({id:text,duration:1});
 for(const s of c.segments.slice(45))await e.correct(b.id,c.id,s.id,'旁白','自然朗读');await e.resume(t.id);
 assert.equal(t.status,'done');assert.equal(calls,0);assert.equal(t.message,'');assert.equal(t.error,null);assert.equal(c.segments.length,50);assert.equal(c.analysisDraft,undefined);assert.equal(JSON.stringify(c.segments.slice(0,45)),checkpoint);
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

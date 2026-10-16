const {test}=require('node:test'),assert=require('node:assert/strict');
const V=require('../app/src/main/assets/core.js');
const io=()=>({saveState:async()=>{},mergeAudio:async()=>({id:'whole.wav',duration:10})});
const batch=prompt=>JSON.parse(prompt.split('本批片段：')[1]);
const labels=lines=>({characters:[],lines:lines.map(s=>({id:s.id,speaker:'旁白',emotion:'自然',confidence:1}))});
const setup=async(n=95)=>{const e=new V.Engine(io()),b=await e.addBook('逐句恢复',Array.from({length:n},(_,i)=>'原文'+i+'。').join(''));return {e,b,c:b.chapters[0]};};

for(const mode of ['manual','auto'])test(mode+': whole-context rejection isolates one failed line, preserving all other annotations and audio',async()=>{
 const {e,b,c}=await setup();e.state.settings.mode=mode;e.state.settings.ttsParallel=1;const calls=[],spoken=[];
 e.llm=async prompt=>{const lines=batch(prompt);calls.push(lines.map(s=>s.id));if(prompt.includes('本章完整上下文')||lines.some(s=>s.id===48))throw new V.ApiError('input new_sensitive (1026)',1026,false);return labels(lines);};
 e.synthesize=async text=>{spoken.push(text);return {id:'audio-'+text,duration:1};};await e.enqueue(b.id,[c.id]);const t=e.state.tasks[0];
 assert.equal(c.segments.length,95);assert.equal(V.normalize(c.segments.map(s=>s.text).join('')),V.normalize(c.text));assert(calls.some(ids=>ids.length===90));assert(calls.some(ids=>ids.length===5));assert(calls.some(ids=>ids.length===1&&ids[0]===48));
 assert.equal(c.segments.filter(s=>s.annotationStatus===(mode==='auto'?'fallback':'failed')).length,1);assert.equal(c.segments[48].annotationStatus,mode==='auto'?'fallback':'failed');assert.equal(new Set(spoken).size,spoken.length);
 for(const s of c.segments.filter(s=>s.id!==48))assert.equal(s.annotationStatus,'complete');
 if(mode==='auto'){assert.equal(t.status,'done');assert.equal(spoken.length,95);assert.equal(c.segments[48].speaker,'旁白');assert.equal(c.segments[48].confidence,0);}
 else{assert.equal(t.status,'waiting');assert.equal(t.phase,'标注待处理');assert.equal(t.done,94);assert.equal(spoken.length,94);const saved=c.segments.filter(s=>s.id!==48).map(s=>s.audio),count=calls.length;await e.correct(b.id,c.id,48,'旁白','自然');await e.resume(t.id);assert.equal(t.status,'done');assert.equal(calls.length,count);assert.equal(spoken.length,95);assert.deepEqual(c.segments.filter(s=>s.id!==48).map(s=>s.audio),saved);}
});

test('partial malformed responses retry only missing, duplicate or malformed IDs',async()=>{
 const {e,b,c}=await setup(8),calls=[];
 e.llm=async prompt=>{const lines=batch(prompt);calls.push(lines.map(s=>s.id));const out=labels(lines);if(calls.length===1){out.lines=out.lines.filter(s=>s.id!==1);out.lines.push({...out.lines.find(s=>s.id===3)});out.lines.find(s=>s.id===5).confidence='bad';}return out;};
 await e.analyze(b.id,c.id);assert.deepEqual(calls,[[0,1,2,3,4,5,6,7],[1,3,5]]);assert(c.segments.every(s=>s.annotationStatus==='complete'));
});

test('pause after a batch failure persists the split retry queue and reload does not repeat that batch',async()=>{
 const {e,b,c}=await setup(50);let pause=false,snapshot,calls=[];e.io.saveState=async text=>{snapshot=text;};
 e.llm=async prompt=>{calls.push(batch(prompt).map(s=>s.id));pause=true;return {lines:[]};};
 await e.analyze(b.id,c.id,()=>pause);assert.equal(c.segments.length,50);assert.equal(c.analysisDraft.next,0);assert.equal(c.analysisDraft.pending[0].ids.length,5);
 const restored=new V.Engine(io(),JSON.parse(snapshot));restored.llm=async prompt=>{const lines=batch(prompt);calls.push(lines.map(s=>s.id));return labels(lines);};await restored.analyze(b.id,c.id);
 assert.equal(calls.filter(ids=>ids.length===50).length,1);assert.equal(calls[1].length,5);assert(restored.chapter(b.id,c.id).segments.every(s=>s.annotationStatus==='complete'));
});

test('legacy failure exposes every sentence, keeps checkpoint audio, and starts retry with a small batch',async()=>{
 const {e,b,c}=await setup(95),input=V.units(c.text);c.analysisDraft={segments:input.slice(0,45).map(s=>({...s,speaker:'旁白',emotion:'自然',confidence:1,audio:'saved-'+s.id})),next:45,batchSize:45};
 const saved=JSON.stringify(c.analysisDraft.segments);e.state.tasks=[{id:'legacy',bookId:b.id,chapterId:c.id,status:'failed',error:{provider:'llm',stage:'标注角色',batchStart:46,batchEnd:90,message:'input new_sensitive (1026)'}}];
 await e.prepareAnnotations(b.id,c.id);assert.equal(c.segments.length,95);assert.equal(JSON.stringify(c.segments.slice(0,45)),saved);assert.equal(c.segments.filter(s=>s.annotationError).length,45);assert.equal(c.analysisDraft.pending[0].ids.length,5);
 const calls=[];e.llm=async prompt=>{const lines=batch(prompt);calls.push(lines.map(s=>s.id));return labels(lines);};await e.analyze(b.id,c.id);assert.equal(calls[0].length,5);assert(calls.flat().every(id=>id>=45));assert.equal(JSON.stringify(c.segments.slice(0,45)),saved);
});

test('manual correction during an in-flight annotation request wins over the model result',async()=>{
 const {e,b,c}=await setup(2);let resolve,entered;const started=new Promise(r=>entered=r);e.llm=async prompt=>{entered();await new Promise(r=>resolve=r);return labels(batch(prompt));};
 const job=e.analyze(b.id,c.id);await started;await e.correct(b.id,c.id,0,'旁白','用户指定的语气');resolve();await job;assert.equal(c.segments[0].emotion,'用户指定的语气');assert.equal(c.segments[0].annotationStatus,'resolved');assert.equal(c.segments[1].annotationStatus,'complete');
});

test('automatic annotation uses narration for low-confidence known speakers as well as unknown speakers',async()=>{
 const {e,b,c}=await setup(2);e.state.settings.mode='auto';b.characters.push({name:'沈砚',voice:'preset:白桦'});c.segments=[{id:0,text:'原文0。',speaker:'沈砚',confidence:.1},{id:1,text:'原文1。',speaker:'未知角色',confidence:0}];
 await e.analyze(b.id,c.id);assert(c.segments.every(s=>s.speaker==='旁白'&&s.annotationOriginal&&s.annotationStatus==='fallback'));
});

test('simultaneous annotation entries share a job and saving failures never trigger model retries',async()=>{
 const {e,b,c}=await setup(2);let calls=0;e.llm=async prompt=>{calls++;return labels(batch(prompt));};await Promise.all([e.analyze(b.id,c.id),e.analyze(b.id,c.id)]);assert.equal(calls,1);
 const other=await setup(2);other.e.io.saveState=async()=>{throw Error('磁盘已满');};other.e.llm=async()=>{throw Error('must not request after failed checkpoint write');};await assert.rejects(other.e.analyze(other.b.id,other.c.id),/磁盘已满/);
});

test('pausing an in-flight split retry keeps that batch in its durable queue',async()=>{
 const {e,b,c}=await setup(8);let pause=false;
 e.llm=async()=>{pause=true;return {lines:[]};};await e.analyze(b.id,c.id,()=>pause);
 const before=JSON.stringify(c.analysisDraft.pending);pause=false;let entered,release;const started=new Promise(r=>entered=r);
 e.llm=async()=>{entered();await new Promise(r=>release=r);throw Error('中断');};const job=e.analyze(b.id,c.id,()=>pause);await started;pause=true;release();await job;
 assert.equal(JSON.stringify(c.analysisDraft.pending),before);pause=false;const ids=[];e.llm=async prompt=>{const lines=batch(prompt);ids.push(...lines.map(s=>s.id));return labels(lines);};await e.analyze(b.id,c.id,()=>pause);assert.deepEqual(ids,[0,1,2,3,4,5,6,7]);
});

test('missing IDs in an older draft checkpoint are still annotated',async()=>{
 const {e,b,c}=await setup(5),input=V.units(c.text);c.analysisDraft={next:3,batchSize:45,segments:[{...input[0],speaker:'旁白',confidence:1,emotion:'自然'}]};
 const ids=[];e.llm=async prompt=>{const lines=batch(prompt);ids.push(...lines.map(s=>s.id));return labels(lines);};await e.analyze(b.id,c.id);assert.deepEqual(ids.sort(),[1,2,3,4]);assert(c.segments.every(s=>s.annotationStatus!=='pending'));
});

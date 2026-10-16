const {test}=require('node:test'),assert=require('node:assert/strict');
const {Engine,ApiError,units}=require('../app/src/main/assets/core.js');
const io=()=>({saveState:async()=>{},sleep:async()=>{}});
for(const [status,attempts] of [[503,3],[401,1],[429,3]])test(`annotation HTTP ${status} preserves the batch and bounds requests`,async()=>{
 let calls=0,snapshot;const e=new Engine({...io(),saveState:async s=>{snapshot=s;},request:async()=>{calls++;throw new ApiError('service failure',status,status===503||status===429);}});
 const b=await e.addBook('failure','一句。'.repeat(45)),c=b.chapters[0];await e.enqueue(b.id,[c.id]);
 assert.equal(calls,attempts);assert.equal(e.state.tasks[0].status,'failed');assert(c.segments.every(s=>s.annotationStatus==='pending'));assert.equal(c.analysisDraft.pending[0].ids.length,24);
 const resumed=new Engine(io(),JSON.parse(snapshot));const seen=[];resumed.llm=async p=>{const batch=JSON.parse(p.split('本批片段：')[1]);seen.push(...batch.map(s=>s.id));return {lines:batch.map(s=>({...s,speaker:'旁白',emotion:'自然',confidence:1,scene:'',delivery:'平静叙述，语速适中'}))};};await resumed.analyze(b.id,c.id);assert.deepEqual(seen,units(c.text).map(s=>s.id));
});
test('failed checkpoint prevents a request; generic failures never become narration',async()=>{
 const e=new Engine(io()),b=await e.addBook('disk','甲。');let requests=0;e.llm=async()=>{requests++;throw Error('unexpected failure');};
 await assert.rejects(e.analyze(b.id,b.chapters[0].id),/unexpected/);assert.equal(requests,1);assert.equal(b.chapters[0].segments[0].annotationStatus,'pending');
 e.io.saveState=async()=>{throw Error('disk full');};await assert.rejects(e.analyze(b.id,b.chapters[0].id),/disk full/);assert.equal(requests,1);
});
test('automatic narration retains the original uncertain decision',async()=>{
 const e=new Engine(io()),b=await e.addBook('uncertain','“谁？”');e.llm=async()=>({lines:[{id:0,speaker:'未知角色',emotion:'担忧',confidence:.2}]});await e.analyze(b.id,b.chapters[0].id);
 const s=b.chapters[0].segments[0];assert.equal(s.annotationStatus,'fallback');assert.equal(s.confidence,0);assert.equal(s.annotationOriginal.speaker,'未知角色');assert.equal(s.annotationOriginal.confidence,.2);assert(s.annotationFallbackReason);assert.equal(s.audio,null);
});

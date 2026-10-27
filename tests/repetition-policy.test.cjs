const {test}=require('node:test'),assert=require('node:assert/strict');
const {Engine,segmentAudioIds}=require('../app/src/main/assets/core.js');
const Q=require('../app/src/main/assets/audio-quality.js');
const {waveInfo}=require('./node-io.cjs');
const {fixture,wav,audioReply,chapter}=require('./native-speech.cjs');
const text='宛如白莲宗的悬骰宫一般！',normal=wav([{seed:3,seconds:3}]);
const repeated=wav([{seed:3,seconds:3},{silence:true,seconds:8.38},{seed:3,seconds:3,gain:.8}]);
const shortGap=wav([{seed:3,seconds:3},{silence:true,seconds:.6},{seed:3,seconds:3,gain:.8}]);

test('clean retry wins; cropped prefix is byte exact with at least 250ms quiet tail',async t=>{
 const f=fixture(t,(_,__,calls)=>audioReply(calls.length===1?repeated:normal));
 const file=await f.e.synthesize(text,'preset:白桦');assert.equal(f.calls.length,2);assert(f.bytes(file.id).equals(normal));assert(!f.events.some(e=>e.type==='truncate'));
 const g=fixture(t,()=>audioReply(repeated)),cut=await g.e.synthesize(text,'preset:白桦');
 const prefix=waveInfo(g.bytes(cut.id)).pcm,original=waveInfo(repeated).pcm;assert(prefix.equals(original.subarray(0,prefix.length)));assert.equal(cut.duration,3.25);assert(g.bytes(cut.rawAudioIds[0]).equals(repeated));
});
test('automatic mode retains original bytes and completes when the gap is too short',async t=>{
 const f=fixture(t,(_,body)=>audioReply(body.messages.at(-1).content===text?shortGap:normal));
 const {b,c}=await chapter(f.e,[text,'正常的一句。']);await f.e.enqueue(b.id,[c.id]);const s=c.segments[0];
 assert.equal(f.calls.filter(c=>c.body.messages.at(-1).content===text).length,2);assert.equal(s.qualityStatus,'passed_with_warnings');assert(s.repetitionUnresolved);assert(f.bytes(s.audio).equals(shortGap));assert(c.audio);assert.equal(f.e.state.tasks[0].status,'done');
 const count=f.calls.length;await f.e.resume(f.e.state.tasks[0].id);assert.equal(f.calls.length,count);
});
test('confirmation mode waits; resume never pays; explicit confirmation uses existing audio',async t=>{
 const f=fixture(t,(_,body)=>audioReply(body.messages.at(-1).content===text?shortGap:normal));f.e.state.settings.qualityConfirmRetry=true;
 const {b,c}=await chapter(f.e,[text,'正常的一句。']);await f.e.enqueue(b.id,[c.id]);let s=c.segments[0];
 assert.equal(s.qualityAttempts,1);assert.equal(s.qualityStatus,'pending');assert(!s.audio&&!c.audio);assert(c.segments[1].audio);assert(s.speechDraft.pendingRaw.confirmationRequired);
 const e=new Engine(f.io,JSON.parse(JSON.stringify(f.e.state))),count=f.calls.length;await e.resume(e.state.tasks[0].id);assert.equal(f.calls.length,count);
 await e.regenerateSegment(b.id,c.id,s.id,{acceptRepeated:true});s=e.chapter(b.id,c.id).segments[0];assert.equal(f.calls.length,count);assert(s.repetitionConfirmed&&s.repetitionUnresolved);assert(f.bytes(s.audio).equals(shortGap));assert(e.chapter(b.id,c.id).audio);assert.equal(e.state.tasks[0].status,'done');
});
test('confirmation rejects changed source and releases busy lock',async t=>{
 const f=fixture(t,()=>audioReply(shortGap));f.e.state.settings.qualityConfirmRetry=true;const {b,c}=await chapter(f.e,[text]);await f.e.enqueue(b.id,[c.id]);c.segments[0].ttsPrompt='修改后的朗读提示词';
 await assert.rejects(f.e.regenerateSegment(b.id,c.id,0,{acceptRepeated:true}),/已修改/);assert(!f.e.segmentBusy(b.id,c.id,0));assert.equal(f.calls.length,2);
});

test('split confirmation approves only the selected part and preserves completed parts across restart',async t=>{
 const texts=['正常的一句。',text,'接下去的另一个句子。'],whole=texts.join('');
 const f=fixture(t,(_,body)=>{const source=body.messages.at(-1).content;if(source===whole)throw Error('text too long');return audioReply(source===texts[0]?normal:shortGap);});
 f.e.state.settings.qualityConfirmRetry=true;const {b,c}=await chapter(f.e,[whole]);await f.e.enqueue(b.id,[c.id]);
 const saved=c.segments[0].speechDraft;assert(saved.splitDraft);assert.equal(saved.files.length,1);assert.equal(saved.pendingRaw.text,text);const calls=f.calls.length;
 const e=new Engine(f.io,JSON.parse(JSON.stringify(f.e.state)));
 await assert.rejects(e.regenerateSegment(b.id,c.id,0,{acceptRepeated:true}),/试听后确认/);
 let s=e.chapter(b.id,c.id).segments[0];assert.equal(f.calls.length,calls+1);assert.equal(s.speechDraft.files.length,2);assert.equal(s.speechDraft.pendingRaw.text,texts[2]);assert(s.speechDraft.pendingRaw.confirmationRequired);assert(!s.audio);
 await e.regenerateSegment(b.id,c.id,0,{acceptRepeated:true});s=e.chapter(b.id,c.id).segments[0];assert.equal(f.calls.length,calls+1);assert(s.audio&&s.repetitionConfirmed);assert(e.chapter(b.id,c.id).audio);
});

test('releasing chapter or book audio clears repair metadata and releases retained files',async t=>{
 for(const scope of ['chapter','book']){
  const f=fixture(t,()=>audioReply(repeated)),{b,c}=await chapter(f.e,[text]);await f.e.enqueue(b.id,[c.id]);assert(c.segments[0].repetitionCorrection);const refs=segmentAudioIds(c.segments[0]);assert(refs.length>=2);
  if(scope==='chapter')await f.e.clearChapterAudio(b.id,c.id);else await f.e.clearBookAudio(b.id);
  assert.equal(c.segments[0].repetitionCorrection,undefined);assert.deepEqual(segmentAudioIds(c.segments[0]),[]);assert.equal((await f.io.audioStats()).fileCount,0);
 }
});
test('pause after crop resumes without another synthesis, crop or raw bridge read',async t=>{
 const f=fixture(t,()=>audioReply(repeated));let draft={},pause=true;
 await assert.rejects(f.e.synthesize(text,'preset:白桦','自然',{shouldPause:()=>pause&&!!draft.pendingRaw?.repetitionCorrection?.applied,onQuality:d=>draft={...draft,...d}}),/暂停/);
 const crops=f.events.filter(e=>e.type==='truncate').length,count=f.calls.length;pause=false;
 const file=await f.e.synthesize(text,'preset:白桦','自然',{...JSON.parse(JSON.stringify(draft))});assert(file.repetitionRemoved);assert.equal(f.calls.length,count);assert.equal(f.events.filter(e=>e.type==='truncate').length,crops);assert.equal(f.reads.length,0);
 assert(segmentAudioIds({speechDraft:draft}).includes(file.repetitionCorrection.id));
});
test('manual redo is the fresh attempt and never buys an additional quality retry',async t=>{
 const f=fixture(t,()=>audioReply(repeated)),{b,c}=await chapter(f.e,[text]);await f.e.regenerateSegment(b.id,c.id,0);assert.equal(f.calls.length,1);assert(c.segments[0].repetitionCorrection);assert(c.audio);
});
test('truncated output can never be approved by repetition cropping',async t=>{
 const f=fixture(t,()=>audioReply(repeated,'length'));await assert.rejects(f.e.synthesize(text,'preset:白桦'),/截断/);assert.equal(f.calls.length,2);assert(!f.events.some(e=>e.type==='truncate'));
});
test('ordinary long pause, different speech, and intentional source repeats are never cropped',async t=>{
 for(const source of ['回来！回来！','回来！回来！求你了！','别走，别走，我还有话要说。'])assert(!Q.repetitionCandidate(repeated.toString('base64'),source).suspected);
 const f=fixture(t,()=>audioReply(wav([{seed:3,seconds:3},{silence:true,seconds:8.38},{seed:7,seconds:3}])));
 const file=await f.e.synthesize(text,'preset:白桦');assert.equal(f.calls.length,1);assert(!file.repetitionRemoved);assert(!f.events.some(e=>e.type==='truncate'));
});
test('scores remain stable with different gaps; gapless or short gaps never permit cropping',()=>{
 const a=Q.repetitionCandidate(repeated.toString('base64'),text),b=Q.repetitionCandidate(shortGap.toString('base64'),text);assert(a.suspected&&b.suspected);assert(Math.abs(a.score-b.score)<.02);assert(a.cropEligible);assert(!b.cropEligible);
 const gapless=wav([{seed:3,seconds:3},{seed:3,seconds:3,gain:.8}]).toString('base64');assert(Q.repetitionCandidate(gapless,text).suspected);assert(!Q.repetitionCandidate(gapless,text).cropEligible);
});
test('a matching beginning cannot authorize removal of a different ending',async t=>{
 const source=wav([{seed:3,seconds:3},{silence:true,seconds:4},{seed:3,seconds:2.6},{seed:7,seconds:.4}]),evidence=Q.repetitionCandidate(source.toString('base64'),text);
 assert(evidence.suspected);assert(evidence.score<.34);assert(evidence.blockScores[3]>.5);assert(!evidence.cropEligible);
 const f=fixture(t,()=>audioReply(source)),file=await f.e.synthesize(text,'preset:白桦');assert.equal(f.calls.length,2);assert(file.repetitionUnresolved);assert(!file.repetitionRemoved);assert(f.bytes(file.id).equals(source));assert(!f.events.some(e=>e.type==='truncate'));
});

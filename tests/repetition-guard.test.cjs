const {test}=require('node:test'),assert=require('node:assert/strict');
const {Engine}=require('../app/src/main/assets/core.js');
const Q=require('../app/src/main/assets/audio-quality.js');
const {fixture,wav,audioReply,chapter}=require('./native-speech.cjs');
const text='宛如白莲宗的悬骰宫一般！',normal=wav([{seed:3,seconds:3}]);
const repeated=wav([{seed:3,seconds:3},{silence:true,seconds:8.38},{seed:3,seconds:3,gain:.8}]);
test('repeated raw speech is blocked before silence trimming, then a clean retry replaces it',async t=>{
 const f=fixture(t,(_,__,calls)=>audioReply(calls.length===1?repeated:normal));
 const file=await f.e.synthesize(text,'preset:白桦');assert.equal(f.calls.length,2);assert.equal(f.processed.length,1);assert.equal(file.qualityAttempts,1);assert.equal(file.rawAudioIds.length,2);
 assert(f.bytes(file.rawAudioIds[0]).equals(repeated));assert(f.bytes(file.id).equals(normal));assert.deepEqual(file.qualityIssues,[]);
});
for(const count of [0,1,2,3])test(`configured retries then crop a clear long-gap duplicate, TTS=${count}`,async t=>{
 const f=fixture(t,(_,body)=>audioReply(body.messages.at(-1).content===text?repeated:normal));f.e.state.settings.ttsRetries=count;
 const {b,c}=await chapter(f.e,[text,'正常的一句。']);await f.e.enqueue(b.id,[c.id]);const s=c.segments[0];
 assert.equal(f.calls.filter(c=>c.body.messages.at(-1).content===text).length,count+1);assert.equal(f.processed.length,2);
 assert.equal(s.qualityStatus,'corrected');assert(s.audio);assert(c.audio);assert(c.segments[1].audio);assert.equal(f.e.state.tasks[0].status,'done');assert(s.repetitionCorrection.applied);
 assert.equal(f.events.find(e=>e.type==='truncate').requests,count+1,'all configured retries precede cropping');
 const restored=new Engine(f.io,JSON.parse(JSON.stringify(f.e.state))),before=f.calls.length;await restored.resume(restored.state.tasks[0].id);assert.equal(f.calls.length,before,'ordinary resume cannot buy another retry or approve the bad clip');
});
test('an old pending checkpoint marked false is rechecked with current rules and cannot bypass the gate',async t=>{
 const f=fixture(t,()=>assert.fail('no model call allowed'));
 const raw=await f.io.saveRawAudio(repeated.toString('base64'),'wav');let draft={};
 const file=await f.e.synthesize(text,'preset:白桦','自然',{qualityAttempts:1,pendingRaw:{file:raw,text,finishReason:'stop',silenceProcessingVersion:1,suspectedRepeat:false},onQuality:d=>draft={...draft,...d}});
 assert(file.repetitionRemoved);assert.equal(f.calls.length,0);assert.equal(f.processed.length,1);assert.equal(f.reads.length,1);assert.equal(draft.pendingRaw.repetitionCheckVersion,Q.REPETITION_CHECK_VERSION);assert.equal(draft.pendingRaw.suspectedRepeat,true);
});
test('a pause before repetition rejection preserves evidence and does not read or synthesize again',async t=>{
 const f=fixture(t,()=>audioReply(repeated));let draft={},pause=true;
 await assert.rejects(f.e.synthesize(text,'preset:白桦','自然',{shouldPause:()=>pause&&!!draft.pendingRaw,onQuality:d=>draft={...draft,...d}}),/暂停/);
 pause=false;const file=await f.e.synthesize(text,'preset:白桦','自然',{...JSON.parse(JSON.stringify(draft))});assert(file.repetitionRemoved);assert.equal(f.calls.length,2);assert.equal(f.reads.length,0);assert.equal(f.processed.length,1);
});
test('old accepted split fragments with a repetition warning cannot be merged into new output',async t=>{
 const f=fixture(t,()=>assert.fail('no model request allowed'));let merges=0;f.io.mergeAudio=async()=>{merges++;assert.fail('must not publish');};
 await assert.rejects(f.e.synthesize(text+text,'preset:白桦','自然',{splitDraft:true,files:[{id:'bad.wav',qualityIssues:['疑似重复'],qualityStatus:'corrected'}]}),/疑似重复/);assert.equal(merges,0);assert.equal(f.calls.length,0);
});
test('gapless copies are detected; source repetitions and different acoustic sequences are preserved',()=>{
 const gapless=wav([{seed:3,seconds:3},{seed:3,seconds:3,gain:.8}]).toString('base64');assert(Q.repetitionCandidate(gapless,text).suspected);
 assert(!Q.repetitionCandidate(wav([{seed:3,seconds:3},{seed:7,seconds:3}]).toString('base64'),text).suspected);
 for(const source of ['回来！回来！','回来！回来！求你了！','别走，别走，我还有话要说。'])assert(!Q.repetitionCandidate(gapless,source).suspected);
 assert(Q.analyzeProcessedSpeech({supported:true,duration:7.27,corrected:true},text,'stop',true).hardIssues.includes('疑似重复'),'a silence-corrected label cannot override repetition failure');
});

const {test}=require('node:test'),assert=require('node:assert/strict');
const {Engine}=require('../app/src/main/assets/core.js');
function fixture(){
 let saved,calls=0;const files=new Map(),e=new Engine({saveState:async s=>{saved=s;},audioDurations:async ids=>Object.fromEntries(ids.map(id=>[id,files.has(id)?2000:-1])),cleanupAudio:async keep=>{for(const id of files.keys())if(!keep.includes(id))files.delete(id);return {};}});
 e.synthesize=async(text,voice)=>{calls++;const file={id:'preview-'+calls+'.wav',rawAudioIds:['raw-'+calls+'.wav'],duration:2};files.set(file.id,true);files.set(file.rawAudioIds[0],true);return file;};
 return {e,files,get calls(){return calls;},get saved(){return saved;}};
}
test('preset auditions survive restart and audio cleanup without another synthesis',async()=>{
 const f=fixture(),first=await f.e.presetPreview('白桦');assert.equal(f.calls,1);
 assert.deepEqual(await f.e.presetPreview('白桦'),first);assert.equal(f.calls,1);
 const reopened=new Engine(f.e.io,JSON.parse(f.saved));reopened.synthesize=()=>assert.fail('cached audition must not synthesize');
 await reopened.garbageCollectAudio();assert(f.files.has(first.id));assert(f.files.has(first.rawAudioIds[0]));
 assert.deepEqual(await reopened.presetPreview('白桦'),first);
});
test('concurrent requests for the same preset share one synthesis and persist once',async()=>{
 const f=fixture(),synthesize=f.e.synthesize;let release;f.e.synthesize=async(...args)=>{await new Promise(r=>release=r);return synthesize(...args);};
 const a=f.e.presetPreview('白桦'),b=f.e.presetPreview('白桦');await Promise.resolve();release();
 assert.deepEqual(await a,await b);assert.equal(f.calls,1);assert.equal(f.e.presetPreviewJobs.size,0);
});
test('Android snapshot headers retain the preview cache',async()=>{
 const f=fixture();let header;f.e.io.saveSnapshot=async value=>{header=value;};
 const file=await f.e.presetPreview('白桦'),state=JSON.parse(header);assert.deepEqual(state.presetPreviews['v1:白桦'],file);
 const reopened=new Engine(f.e.io,state);reopened.synthesize=()=>assert.fail('snapshot cache must be reused');assert.deepEqual(await reopened.presetPreview('白桦'),file);
});
test('a missing cached file is regenerated once; different presets have separate caches',async()=>{
 const f=fixture(),first=await f.e.presetPreview('白桦');f.files.delete(first.id);
 const [a,b]=await Promise.all([f.e.presetPreview('白桦'),f.e.presetPreview('白桦')]);assert.deepEqual(a,b);assert.notEqual(a.id,first.id);assert.equal(f.calls,2);
 await f.e.presetPreview('茉莉');assert.equal(f.calls,3);assert.equal(Object.keys(f.e.state.presetPreviews).length,2);
});
test('failed generation clears the pending state and can be retried',async()=>{
 const f=fixture(),synthesize=f.e.synthesize;f.e.synthesize=async()=>{throw Error('网络已断开');};
 await assert.rejects(f.e.presetPreview('白桦'),/网络已断开/);assert.equal(f.e.presetPreviewJobs.size,0);assert.deepEqual(f.e.state.presetPreviews,{});
 f.e.synthesize=synthesize;await f.e.presetPreview('白桦');assert.equal(f.calls,1);
 await assert.rejects(f.e.presetPreview('invalid'),/无效/);assert.equal(f.calls,1);
});
test('cleanup cannot race the cache file publication',async()=>{
 const f=fixture(),synthesize=f.e.synthesize;let release;f.e.synthesize=async(...args)=>{await new Promise(r=>release=r);return synthesize(...args);};
 const job=f.e.presetPreview('白桦');await Promise.resolve();await assert.rejects(f.e.garbageCollectAudio(),/正在生成/);release();await job;await f.e.garbageCollectAudio();assert.equal(f.files.size,2);
});

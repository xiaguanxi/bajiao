const {test}=require('node:test'),assert=require('node:assert/strict');
const V=require('../app/src/main/assets/core.js'),S=require('../app/src/main/assets/settings-model.js'),wave=require('./wav-fixture.cjs');
const good=wave(),silent=Buffer.from(good,'base64');silent.fill(0,44);
const reply=audio=>({choices:[{finish_reason:'stop',message:{audio:{data:audio}}}]});
function fixture(response,ttsRetries=2){
 const calls=[],stored=new Map();let serial=0;
 const e=new V.Engine({saveState:async()=>{},sleep:async()=>{},request:async(provider,body)=>{calls.push({provider,body});const value=await response(calls.length,provider,body);if(value instanceof Error)throw value;return value;},
  saveRawAudio:async data=>{const id='raw-'+serial++;stored.set(id,data);return {id,duration:data?3:0,playable:!!data};},
  saveAudio:async data=>{const id='audio-'+serial++;stored.set(id,data);return {id,duration:3};},readAudio:async id=>({base64:stored.get(id)}),mergeAudio:async()=>({id:'merged.wav',duration:6})});
 Object.assign(e.state.settings,{llmRetries:1,ttsRetries,ttsParallel:1});return {e,calls,stored};
}
test('v3 migrates the old count to both providers and drops the conflicting quality policies',()=>{
 const saved=S.normalize({retries:2,qualityAutoRetry:false,qualityConfirmRetry:true,future:'preserved'});
 assert.equal(saved.llmRetries,2);assert.equal(saved.ttsRetries,2);assert.equal(saved.settingsVersion,3);assert.equal(saved.future,'preserved');
 const json=JSON.parse(JSON.stringify(saved));for(const key of ['retries','qualityAutoRetry','qualityConfirmRetry'])assert(!Object.hasOwn(json,key));
 const split=S.normalize({...json,llmRetries:0,ttsRetries:7,retries:2});assert.equal(split.llmRetries,0);assert.equal(split.ttsRetries,7);
});
test('LLM and TTS have independent request budgets including zero',async()=>{
 for(const provider of ['llm','tts'])for(const count of [0,2,6]){
  const {e,calls}=fixture(()=>new V.ApiError('timeout',408,true));Object.assign(e.state.settings,{llmRetries:provider==='llm'?count:9,ttsRetries:provider==='tts'?count:9});
  const error=await e.performRequest(provider,{model:'test'}).catch(error=>error);assert(error instanceof Error);assert.equal(calls.length,count+1);assert.equal(error.requestRetries,count);assert.equal(error.provider,provider);
 }
});
test('transport and audio failures share a TTS budget instead of multiplying retries',async()=>{
 for(const responses of [[new V.ApiError('timeout',408,true),reply(''),reply('')],[reply(''),new V.ApiError('HTTP 503',503,true),reply('')]]){
  const {e,calls}=fixture(index=>responses[index-1]||reply(good));let draft={};
  const error=await e.synthesize('这是一段检查重试上限的文字。','preset:白桦','',{onQuality:d=>{draft={...draft,...d};}}).catch(error=>error);
  assert(error.qualityPending);assert.equal(calls.length,3);assert.equal(error.requestRetries,2);assert.equal(draft.retryAttempts,2);assert(draft.pendingRaw);
 }
 const {e,calls}=fixture(index=>index===1?new V.ApiError('timeout',408,true):reply(index===2?'':good));const file=await e.synthesize('这是一段检查重试上限的文字。','preset:白桦');assert.equal(calls.length,3);assert.equal(file.qualityAttempts,2);
});
test('audio failures use the configured count and zero sends just the initial call',async()=>{
 for(const count of [0,1,3]){const {e,calls}=fixture(()=>reply(''),count);await assert.rejects(e.synthesize('重试失败后交给人工处理。','preset:白桦'),/合成异常/);assert.equal(calls.length,count+1);}
});
test('non-retryable authentication, quota, parameters and content refusals stop immediately',async()=>{
 const errors=[new V.ApiError('bad key',401,true),new V.ApiError('参数错误',400,true),new V.ApiError('payment required',402,true),Object.assign(new V.ApiError('quota exhausted',429,true),{code:'insufficient_quota'}),new V.ApiError('余额不足',429,true),Object.assign(new V.ApiError('input sensitive',500,true),{code:'1026'})];
 for(const error of errors)for(const provider of ['llm','tts']){const {e,calls}=fixture(()=>error,5);await assert.rejects(e.performRequest(provider,{model:'test'}));assert.equal(calls.length,1);assert(!e.state.modelLimits?.test?.limited,'permanent failures must not lower the TTS concurrency limit');}
});
test('HTTP-success content refusals are not mistaken for retryable empty audio',async()=>{
 for(const method of ['synthesize','design'])for(const reason of ['content_filter','refusal']){
  const {e,calls}=fixture(()=>({choices:[{finish_reason:reason,message:{audio:{data:''}}}]}),5);
  const error=await (method==='synthesize'?e.synthesize('不可重试的内容拒绝。','preset:白桦'):e.design('自然清晰的青年男声。','内容拒绝。')).catch(error=>error);
  assert(V.isContentRejected(error));assert.equal(calls.length,1);
 }
});

test('LLM refusals stop annotation without an automatic smaller-batch or target-only request',async()=>{
 for(const speakerUncertaintyMode of ['narrator','review']){
  const {e,calls}=fixture(()=>Object.assign(new V.ApiError('input new_sensitive (1026)',500,true),{code:'1026'}));e.state.settings.llmRetries=5;e.state.settings.speakerUncertaintyMode=speakerUncertaintyMode;
  const b=await e.addBook('不可重试的标注错误',Array.from({length:50},(_,i)=>'原文'+i+'。').join('')),c=b.chapters[0];await e.enqueue(b.id,[c.id]);
  assert.equal(calls.length,1);assert.equal(e.state.tasks[0].status,'failed');assert.equal(e.state.tasks[0].error.retryable,false);assert(c.analysisDraft.pending.length);assert(c.segments.every(s=>s.annotationStatus==='pending'));
  await e.kick();const restored=new V.Engine(e.io,JSON.parse(JSON.stringify(e.state)));await restored.recoverProduction();assert.equal(calls.length,1);
 }
});
test('quality exhaustion remains manual across resume/reload and preserves other finished sentences',async()=>{
 const {e,calls}=fixture((_,provider,body)=>reply(body.messages.find(m=>m.role==='assistant').content==='失败的一句。'?'':good));const b=await e.addBook('失败处理','失败的一句。成功的一句。'),c=b.chapters[0];
 c.segments=V.units(c.text).map(s=>({...s,speaker:'旁白',confidence:1}));await e.enqueue(b.id,[c.id]);const task=e.state.tasks[0];
 assert.equal(task.status,'waiting');assert.equal(c.segments[0].qualityStatus,'pending');assert.equal(c.segments[0].qualityAttempts,2);assert(c.segments[1].audio);assert.equal(calls.length,4);
 await e.resume(task.id);assert.equal(calls.length,4);const restored=new V.Engine(e.io,JSON.parse(JSON.stringify(e.state)));await restored.recoverProduction();assert.equal(calls.length,4);assert.equal(restored.chapter(b.id,c.id).segments[0].qualityStatus,'pending');
});
test('manual re-synthesis starts a fresh configured budget and protects existing audio on failure',async()=>{
 const {e,calls}=fixture(()=>reply('')),b=await e.addBook('已有成品','保留原来的成品。'),c=b.chapters[0];c.audio='old-chapter.wav';c.segments=[{id:0,text:c.text,speaker:'旁白',confidence:1,audio:'old-line.wav',qualityAttempts:7}];
 await assert.rejects(e.regenerateSegment(b.id,c.id,0),/合成异常/);assert.equal(calls.length,3);assert.equal(c.segments[0].audio,'old-line.wav');assert.equal(c.audio,'old-chapter.wav');assert.equal(c.segments[0].retryDraft.retryAttempts,2);
});
test('a pause before a reserved retry does not reset the consumed TTS budget',async()=>{
 const {e,calls}=fixture(()=>reply(''));let paused=false,draft={};
 await assert.rejects(e.synthesize('暂停和继续仍遵守次数。','preset:白桦','',{shouldPause:()=>paused,onQuality:d=>{draft={...draft,...d};if(d.retryAttempts===1&&!d.pendingRaw)paused=true;}}),/暂停/);
 assert.equal(calls.length,1);assert.equal(draft.retryAttempts,1);await assert.rejects(e.synthesize('暂停和继续仍遵守次数。','preset:白桦','',draft),/合成异常/);assert.equal(calls.length,3);
});
test('split synthesis shares additional retries and retains completed parts',async()=>{
 const {e,calls}=fixture(index=>reply(index===2?good:''));let parts=[];
 await assert.rejects(e.synthesize('第一句。第二句。','preset:白桦','',{forceSplit:true,onPart:files=>{parts=[...files];}}),/合成异常/);
 assert.equal(calls.length,4);assert.equal(parts.length,1);
});
test('voice design shares its TTS transport and empty-response retry budget',async()=>{
 const {e,calls}=fixture(index=>index===1?new V.ApiError('timeout',408,true):reply(''));
 await assert.rejects(e.design('青年男性，自然清晰。','样本试听文字。'),/没有返回样本/);assert.equal(calls.length,3);
});
test('manually resuming a failed TTS task resets its budget without resetting a paused task',async()=>{
 let failing=true,resumed=0;const {e,calls}=fixture(()=>failing?new V.ApiError('timeout',408,true):reply(++resumed===1?'':good));
 const b=await e.addBook('手动恢复','恢复制作的一句。'),c=b.chapters[0];c.segments=V.units(c.text).map(s=>({...s,speaker:'旁白',confidence:1}));await e.enqueue(b.id,[c.id]);assert.equal(calls.length,3);assert.equal(e.state.tasks[0].status,'failed');
 const restored=new V.Engine(e.io,JSON.parse(JSON.stringify(e.state)));failing=false;await restored.resume(restored.state.tasks[0].id);assert.equal(calls.length,5);assert.equal(restored.state.tasks[0].status,'done');
});

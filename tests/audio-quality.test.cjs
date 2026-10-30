const {test}=require('node:test'),assert=require('node:assert/strict');
const {cleanRepeatedSpeech,intentionalRepeat}=require('../app/src/main/assets/audio-quality.js');
const {Engine}=require('../app/src/main/assets/core.js');
const {waveInfo,mergeWave}=require('./node-io.cjs');
function wav(sequences){
 const rate=8000,parts=[];
 for(const {seed=1,seconds=2,gain=1,silence=false} of sequences){const pcm=Buffer.alloc(Math.round(seconds*rate)*2);if(!silence)for(let i=0;i<pcm.length/2;i++){const t=i/rate,syllable=Math.floor(t/.13),freq=170+(syllable*seed*113%1400),env=Math.sin(Math.PI*(t%.13)/.13)**2;const value=gain*env*(Math.sin(2*Math.PI*freq*t)+.4*Math.sin(2*Math.PI*freq*2.73*t));pcm.writeInt16LE(Math.round(value*7000),i*2);}parts.push(pcm);}
 const pcm=Buffer.concat(parts),head=Buffer.alloc(44);head.write('RIFF');head.writeUInt32LE(pcm.length+36,4);head.write('WAVEfmt ',8);head.writeUInt32LE(16,16);head.writeUInt16LE(1,20);head.writeUInt16LE(1,22);head.writeUInt32LE(rate,24);head.writeUInt32LE(rate*2,28);head.writeUInt16LE(2,32);head.writeUInt16LE(16,34);head.write('data',36);head.writeUInt32LE(pcm.length,40);return Buffer.concat([head,pcm]);
}
const crypto=require('node:crypto');
const {repetitionCandidate,analyzeSpeech}=require('../app/src/main/assets/audio-quality.js');
const text='前一秒，浮空山还是艳阳高照。',dup=wav([{seed:3},{silence:true,seconds:.6},{seed:3,gain:.8}]);
function memoryEngine(handler){
 // Deliberately retains the pre-0.8.3 IO contract for legacy draft compatibility.
 // New native processing is exercised with production Java in silence-processing.test.cjs.
 const stored=new Map(),calls=[],snapshots=[];
 const e=new Engine({saveState:async value=>snapshots.push(JSON.parse(value)),
  request:async(provider,body)=>{calls.push({provider,body});return handler(provider,body,calls);},
  saveRawAudio:async data=>{const bytes=Buffer.from(data,'base64'),valid=analyzeSpeech(data,'甲').supported,id=crypto.createHash('sha256').update(bytes).digest('hex')+(valid?'.wav':'.raw');stored.set(id,bytes);return {id,duration:valid?waveInfo(bytes).duration:0,playable:valid};},
  saveAudio:async data=>{const bytes=Buffer.from(data,'base64'),id=crypto.createHash('sha256').update(bytes).digest('hex')+'.wav';stored.set(id,bytes);return {id,duration:waveInfo(bytes).duration};},
  readAudio:async id=>({base64:stored.get(id).toString('base64')}),
  mergeAudio:async ids=>{const bytes=mergeWave(ids.map(id=>stored.get(id)));const id=crypto.createHash('sha256').update(bytes).digest('hex')+'.wav';stored.set(id,bytes);return {id,duration:waveInfo(bytes).duration};},sleep:async()=>{}});
 e.state.settings.retries=0;e.state.settings.ttsRetries=1;return {e,stored,calls,snapshots};
}
const audioReply=(data,finish_reason='stop')=>({choices:[{finish_reason,message:{audio:{data:data.toString('base64')}}}]});
const textReply=content=>({choices:[{finish_reason:'stop',message:{content}}]});
const normal=wav([{seed:2}]),silent=wav([{silence:true,seconds:5}]);
async function chapter(e,texts=[text,'正常的一句。']){
 const b=await e.addBook('本地测试',texts.join('')),c=b.chapters[0];
 c.segments=texts.map((text,id)=>({id,text,speaker:'旁白',confidence:1}));
 return {b,c};
}
test('local diagnostics never crop even with purported transcript evidence',()=>{
 const b64=dup.toString('base64');
 assert(repetitionCandidate(b64,text).suspected);
 assert.deepEqual(cleanRepeatedSpeech(b64,text,{original:text+text,candidate:text}),{base64:b64,removed:false});
});
test('ordinary quiet and fading speech preserve all bytes with one TTS request',async()=>{
 for(const gain of [1,.005,.001]){
  const source=wav([{seed:2,gain}]),{e,calls,stored}=memoryEngine(provider=>{assert.equal(provider,'tts');return audioReply(source);});
  const f=await e.synthesize(text,'preset:白桦');assert.equal(f.qualityStatus,'passed');assert(stored.get(f.id).equals(source));assert.equal(calls.length,1);assert.equal(f.generationVersion,3);
 }
});
test('long pauses alone warn without another request; repeated speech cannot pass',async()=>{
 for(const source of [wav([{seconds:1},{silence:true,seconds:4},{seed:4,seconds:1}])]){
  const {e,stored,calls}=memoryEngine(()=>audioReply(source)),f=await e.synthesize(text,'preset:白桦');
  assert.equal(f.qualityStatus,'passed_with_warnings');assert(f.qualityIssues.length);assert(stored.get(f.id).equals(source));assert.equal(calls.length,1);
 }
 const {e,calls,stored}=memoryEngine(()=>audioReply(dup));let draft={};
 await assert.rejects(e.synthesize(text,'preset:白桦','自然',{onQuality:d=>draft={...draft,...d}}),/疑似重复/);
 assert.equal(calls.length,2);assert(draft.rawAudioIds.every(id=>stored.has(id)));assert.equal(draft.pendingRaw.qualityApproved,false);
});
test('intentional full and partial repetitions are preserved',async()=>{
 for(const source of ['回来！回来！','回来！回来！求你了！','别走，别走，我还有话要说。']){
  const {e,stored,calls}=memoryEngine(()=>audioReply(dup)),f=await e.synthesize(source,'preset:白桦');
  assert(stored.get(f.id).equals(dup));assert(!f.repetitionRemoved);assert.equal(calls.length,1);
 }
 assert(intentionalRepeat('回来！回来！'));
});
test('configured TTS counts bound quality retries and survive reload',async()=>{
 for(const count of [0,1,2,4]){
  const {e,calls}=memoryEngine(()=>audioReply(silent));e.state.settings.ttsRetries=count;
  const {b,c}=await chapter(e,[text]);await e.enqueue(b.id,[c.id]);
  assert.equal(calls.length,count+1);assert.equal(c.segments[0].qualityStatus,'pending');assert(!c.audio);
  const restored=new Engine(e.io,JSON.parse(JSON.stringify(e.state)));assert.equal(restored.state.settings.ttsRetries,count);
 }
});

test('explicit truncation, invalid structure and empty return retry only once',async()=>{
 for(const reply of [audioReply(normal,'length'),audioReply(Buffer.from('invalid')),audioReply(Buffer.alloc(0))]){
  const {e,calls,stored}=memoryEngine(()=>reply);let draft={};
  await assert.rejects(e.synthesize(text,'preset:白桦','自然',{onQuality:d=>{draft={...draft,...d};}}),/合成异常/);
  assert.equal(calls.length,2);assert.equal(draft.qualityAttempts,1);assert(draft.rawAudioIds.every(id=>stored.has(id)));
  if(!analyzeSpeech(reply.choices[0].message.audio.data,text).supported)assert.equal(draft.pendingRaw.playable,false);
 }
});
test('a successful quality retry retains the first raw return',async()=>{
 const {e,calls,stored}=memoryEngine((_,__,calls)=>audioReply(calls.length===1?silent:normal));
 const f=await e.synthesize(text,'preset:白桦');assert.equal(f.qualityAttempts,1);assert.equal(calls.length,2);
 assert.equal(f.rawAudioIds.length,2);assert(stored.get(f.rawAudioIds[0]).equals(silent));assert(stored.get(f.id).equals(normal));
});
test('pending sentence does not stop other sentences and ordinary resume never pays again',async()=>{
 const {e,calls}=memoryEngine((_,body)=>audioReply(body.messages.find(m=>m.role==='assistant').content===text?silent:normal));
 const {b,c}=await chapter(e);await e.enqueue(b.id,[c.id]);const t=e.state.tasks[0];
 assert.equal(t.status,'waiting');assert(!c.segments[0].audio);assert(c.segments[1].audio);assert(!c.audio);
 const count=calls.length;await e.resume(t.id);await e.resumeWaiting(b.id);
 assert.equal(calls.length,count);assert.equal(c.segments[0].qualityAttempts,1);
 assert(e.collectReferencedAudio().includes(c.segments[0].speechDraft.rawAudioIds[0]));
});
test('confirmation can never be bypassed by resume or accepting a role',async()=>{
 const {e,calls}=memoryEngine(()=>audioReply(silent));
 const {b,c}=await chapter(e,[text]);await e.enqueue(b.id,[c.id]);const count=calls.length;
 await e.resume(e.state.tasks[0].id);await e.bind(b.id,'旁白','preset:白桦');
 assert.equal(calls.length,count);assert.equal(c.segments[0].qualityAttempts,1);
});
test('manual retry affects exactly the selected sentence, leaving another pending',async()=>{
 const {e,calls}=memoryEngine(()=>audioReply(normal));const {b,c}=await chapter(e);
 for(const s of c.segments){s.qualityStatus='pending';s.speechDraft={generationVersion:3,qualityAttempts:1};}
 await e.regenerateSegment(b.id,c.id,0);
 assert(c.segments[0].audio);assert(!c.segments[1].audio);assert(!c.audio);assert.equal(calls.length,1);
 assert.equal(calls[0].body.messages.find(m=>m.role==='assistant').content,text);
});
test('manual retry uses a fresh configured quality budget',async()=>{
 const {e,calls}=memoryEngine(()=>audioReply(silent)),{b,c}=await chapter(e,[text]);
 await assert.rejects(e.regenerateSegment(b.id,c.id,0),/合成异常/);
 assert.equal(calls.length,2);assert.equal(c.segments[0].qualityStatus,'pending');assert(c.segments[0].speechDraft.pendingRaw);
});
test('manual failure preserves old playable references and diagnostics',async()=>{
 const {e,calls,stored}=memoryEngine(()=>audioReply(silent)),{b,c}=await chapter(e,[text]);
 const old=await e.io.saveAudio(normal.toString('base64'));c.segments[0].audio=old.id;c.audio='old-chapter.wav';c.status='ready';
 await assert.rejects(e.regenerateSegment(b.id,c.id,0));assert.equal(c.segments[0].audio,old.id);assert.equal(c.audio,'old-chapter.wav');
 assert(c.segments[0].retryError);assert.equal(calls.length,2);assert(c.segments[0].retryDraft.rawAudioIds.every(id=>stored.has(id)));
});
test('successful manual replacement stages the affected chapter and preserves other segments',async()=>{
 const {e,calls}=memoryEngine(()=>audioReply(normal)),{b,c}=await chapter(e);
 const old=await e.io.saveAudio(dup.toString('base64'));c.segments.forEach(s=>s.audio=old.id);c.audio='old-chapter.wav';
 const other=JSON.stringify(c.segments[1]);await e.regenerateSegment(b.id,c.id,0);
 assert.notEqual(c.segments[0].audio,old.id);assert.notEqual(c.audio,'old-chapter.wav');assert.equal(c.status,'ready');assert.equal(JSON.stringify(c.segments[1]),other);assert.equal(calls.length,1);
});
test('failed chapter merge keeps the previous sentence and chapter references',async()=>{
 const {e}=memoryEngine(()=>audioReply(normal)),{b,c}=await chapter(e,[text]);c.segments[0].audio='old.wav';c.audio='old-chapter.wav';
 e.io.mergeAudio=async()=>{throw Error('disk full');};
 await assert.rejects(e.regenerateSegment(b.id,c.id,0),/disk full/);assert.equal(c.audio,'old-chapter.wav');assert.equal(c.segments[0].audio,'old.wav');
});
test('duplicate manual submission sends one request and exposes its busy state',async()=>{
 let release;const gate=new Promise(r=>release=r);const {e,calls}=memoryEngine(async()=>{await gate;return audioReply(normal);}),{b,c}=await chapter(e,[text]);
 const first=e.regenerateSegment(b.id,c.id,0);await new Promise(r=>setTimeout(r,5));assert(e.segmentBusy(b.id,c.id,0));
 assert.equal(await e.regenerateSegment(b.id,c.id,0),false);release();await first;assert.equal(calls.length,1);assert(!e.segmentBusy(b.id,c.id,0));
});
test('source edits during manual generation discard the stale result',async()=>{
 let c;const {e}=memoryEngine(()=>{c.segments[0].text='编辑后的原文。';return audioReply(normal);}),context=await chapter(e,[text]);c=context.c;
 assert.equal(await e.regenerateSegment(context.b.id,c.id,0),false);assert(!c.segments[0].audio);
});
test('unversioned ASR pending draft is not reused with a different prompt identity',async()=>{
 const {e,calls}=memoryEngine(()=>audioReply(normal)),{b,c}=await chapter(e,[text]);
 const raw=await e.io.saveAudio(dup.toString('base64')),s=c.segments[0],role=b.characters[0];
 s.qualityStatus='pending';s.speechDraft={key:JSON.stringify({text:s.text,speaker:s.speaker,emotion:s.emotion,voice:role.voice,description:role.description}),generationVersion:2,pendingRaw:{file:raw,text:s.text,finishReason:'stop'},rawAudioIds:[raw.id],qualityFailure:'unavailable'};
 await e.enqueue(b.id,[c.id]);assert.equal(calls.length,1);assert.notEqual(s.audio,raw.id);assert.equal(s.qualityStatus,'passed');assert(s.rawAudioIds.includes(raw.id));
});
test('pause after archiving resumes without re-synthesis',async()=>{
 const {e,calls}=memoryEngine(()=>audioReply(normal));let pause=true,draft={};
 await assert.rejects(e.synthesize(text,'preset:白桦','自然',{shouldPause:()=>pause&&!!draft.pendingRaw,onQuality:d=>{draft={...draft,...d};}}),/暂停/);
 pause=false;const file=await e.synthesize(text,'preset:白桦','自然',draft);assert(file.id);assert.equal(calls.length,1);
});
test('quality retry count survives a pause before the second request',async()=>{
 const {e,calls}=memoryEngine(()=>audioReply(silent));let pause=false,draft={};
 await assert.rejects(e.synthesize(text,'preset:白桦','自然',{shouldPause:()=>pause,onQuality:d=>{draft={...draft,...d};if(d.qualityAttempts===1&&!d.pendingRaw)pause=true;}}),/暂停/);
 assert.equal(calls.length,1);assert.equal(draft.qualityAttempts,1);
 await assert.rejects(e.synthesize(text,'preset:白桦','自然',draft),/合成异常/);assert.equal(calls.length,2);
});
test('legacy repair and unsupported provider cannot touch audio or call a service',async()=>{
 const e=new Engine({request:async()=>{throw Error('unexpected request');}});
 assert.equal(await e.repairChapterAudio(),0);await assert.rejects(e.request('asr',{}),/无效模型/);assert.equal(e.transcribeAudio,undefined);
});
test('authentication, quotas and local persistence errors do not split or retry quality',async()=>{
 for(const status of [401,403,402,429]){const {e,calls}=memoryEngine(()=>{throw Object.assign(new (require('../app/src/main/assets/core.js').ApiError)('HTTP '+status,status,false),status===429?{code:'insufficient_quota'}:{});});await assert.rejects(e.synthesize('甲。乙。','preset:白桦'));assert.equal(calls.length,1);}
 const {e,calls}=memoryEngine(()=>audioReply(normal));e.io.saveRawAudio=async()=>{throw Error('disk full');};await assert.rejects(e.synthesize('甲。乙。','preset:白桦'),/disk full/);assert.equal(calls.length,1);
});
test('repetition in split synthesis shares one retry and cannot publish a bad merged result',async()=>{
 const {e,calls}=memoryEngine((_,__,calls)=>audioReply(calls.length===2?normal:dup));let merged=0,files=[];e.io.mergeAudio=async()=>{merged++;throw Error('bad merge');};
 await assert.rejects(e.synthesize(text+text,'preset:白桦','自然',{forceSplit:true,onPart:parts=>files=[...parts]}),/疑似重复/);
 assert.equal(calls.length,3);assert.equal(files.length,1);assert.equal(merged,0);
});
module.exports={wav,memoryEngine,audioReply,textReply};

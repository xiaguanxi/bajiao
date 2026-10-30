const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {Engine}=require('../app/src/main/assets/core.js');
const {waveInfo}=require('./node-io.cjs');
const {fixture,wav,audioReply,chapter}=require('./native-speech.cjs');
const text='前一秒，浮空山还是艳阳高照。';
const normal=wav([{seed:2}]);
const silent=wav([{silence:true,seconds:5}]);
const nearSilent=wav([{silence:true,noise:2,seconds:5}]);
const noisyGap=wav([{seconds:2,seed:2},{silence:true,noise:2,seconds:6},{seconds:2,seed:5}]);

test('fresh speech archives the exact raw response before native trimming, without another TTS request',async t=>{
 const f=fixture(t,provider=>{assert.equal(provider,'tts');return audioReply(noisyGap);});let draft={};
 const file=await f.e.synthesize(text,'preset:白桦','自然',{onQuality:update=>{draft={...draft,...update};}});
 assert.equal(f.calls.length,1);assert.equal(f.processed.length,1);assert.equal(f.reads.length,0);
 assert.deepEqual(f.events.map(x=>x.type),['archive','process']);
 const rawId=f.events[0].id;assert.equal(f.events[1].id,rawId);assert(f.bytes(rawId).equals(noisyGap));
 assert.notEqual(file.id,rawId);assert.equal(file.qualityStatus,'corrected');assert.equal(file.corrected,true);
 assert.equal(file.supported,true);assert.equal(file.allSilent,false);assert.equal(file.allNearSilent,false);
 assert.equal(file.originalDuration,10);assert(file.duration>4&&file.duration<5);
 assert(file.longestSilenceMs<=500);assert(file.removedMs>5000);assert(file.trimRanges.length>0);
 assert.equal(file.silenceProcessing.version,1);assert.deepEqual(file.silenceProcessing.trimRanges,file.trimRanges);
 assert.equal(file.silenceProcessing.removedMs,file.removedMs);assert.deepEqual(file.rawAudioIds,[rawId]);
 assert.equal(draft.pendingRaw.silenceProcessingVersion,1);assert.equal(draft.pendingRaw.processedFile.id,file.id);
 // Reconstruct the expected derivative from the reported original-coordinate cuts.
 const {pcm,fmt}=waveInfo(noisyGap),rate=fmt.readUInt32LE(4),align=fmt.readUInt16LE(12),chunks=[];let from=0;
 for(const range of file.trimRanges){const start=Math.round(range.startMs*rate/1000)*align,end=Math.round(range.endMs*rate/1000)*align;assert(start>=from&&end>start);chunks.push(pcm.subarray(from,start));from=end;}
 chunks.push(pcm.subarray(from));assert(waveInfo(f.bytes(file.id)).pcm.equals(Buffer.concat(chunks)),'only reported quiet ranges may be removed');
 assert(Math.abs(file.originalDuration-file.duration-file.removedMs/1000)<1e-6);
});

const badReturns=[
 ['digital silence',audioReply(silent),/全静音/],
 ['near silence',audioReply(nearSilent),/全近静音/],
 ['truncated response',audioReply(normal,'length'),/截断/],
 ['corrupt response',audioReply(Buffer.from('broken WAV payload')),/损坏|解码/],
 ['empty response',audioReply(Buffer.alloc(0)),/损坏|空音频|解码/],
 ['residual excessive duration',audioReply(wav([{seed:4,seconds:8},{seed:7,seconds:8},{seed:9,seconds:9}])),/时长/]
];
for(const [name,reply,issue] of badReturns)for(const count of [0,1,2,4]){
 test(`${name}: TTS count=${count} bounds all native quality retries`,async t=>{
  const f=fixture(t,()=>reply);f.e.state.settings.ttsRetries=count;
  const {b,c}=await chapter(f.e,[text]);await f.e.enqueue(b.id,[c.id]);const s=c.segments[0],expected=count+1;
  assert.equal(f.calls.length,expected);assert.equal(f.processed.length,expected);assert.equal(f.reads.length,0);
  assert.equal(s.qualityStatus,'pending');assert.equal(s.qualityAttempts,expected-1);assert.match(s.failReason,issue);assert(!s.audio);assert(!c.audio);
  assert.equal(s.speechDraft.pendingRaw.silenceProcessingVersion,1);
  for(const id of s.speechDraft.rawAudioIds){assert(fs.existsSync(path.join(f.dir,id)));assert(f.e.collectReferencedAudio().includes(id));}
  const callsBeforeResume=f.calls.length;await f.e.resume(f.e.state.tasks[0].id);await f.e.resumeWaiting(b.id);await f.e.bind(b.id,'旁白','preset:白桦');
  assert.equal(f.calls.length,callsBeforeResume,'resume and voice confirmation cannot grant another paid quality retry');
  const restored=new Engine(f.io,JSON.parse(JSON.stringify(f.e.state)));
  assert.equal(restored.state.settings.ttsRetries,count);
  assert.equal(restored.chapter(b.id,c.id).segments[0].speechDraft.pendingRaw.silenceProcessingVersion,1);
 });
}

test('a native quality retry retains both original returns and accepts the corrected replacement',async t=>{
 const f=fixture(t,(_,__,calls)=>audioReply(calls.length===1?nearSilent:noisyGap));
 const file=await f.e.synthesize(text,'preset:白桦');
 assert.equal(f.calls.length,2);assert.equal(file.qualityAttempts,1);assert.equal(file.qualityStatus,'corrected');
 assert.equal(file.rawAudioIds.length,2);assert(f.bytes(file.rawAudioIds[0]).equals(nearSilent));assert(f.bytes(file.rawAudioIds[1]).equals(noisyGap));
 assert.equal(f.reads.length,0);
});

test('native correction still hard-rejects excessive residual speech duration',async t=>{
 const source=wav([{seconds:5},{seconds:6,silence:true,noise:2},{seconds:5,seed:5}]);
 const f=fixture(t,()=>audioReply(source));f.e.state.settings.ttsRetries=0;
 await assert.rejects(f.e.synthesize('甲。','preset:白桦'),/处理后时长仍异常/);
 assert.equal(f.calls.length,1);assert.equal(f.processed[0].file.corrected,true);
 assert(f.processed[0].file.duration>8);assert(f.bytes(f.processed[0].rawId).equals(source));
});

test('193 seconds of trailing near noise is corrected locally with one paid TTS response',async t=>{
 const source=wav([{seconds:2,seed:4},{seconds:193,silence:true,noise:2}]);
 const f=fixture(t,()=>audioReply(source)),file=await f.e.synthesize('山里的风停了。','preset:白桦');
 assert.equal(f.calls.length,1);assert.equal(f.processed.length,1);assert.equal(file.qualityStatus,'corrected');
 assert.equal(file.originalDuration,195);assert(file.duration>=2.2&&file.duration<=2.4);assert(file.removedMs>192000);
 assert(f.bytes(file.rawAudioIds[0]).equals(source));assert.equal(f.reads.length,0);
});

const actualSample=path.resolve(__dirname,'../artifacts/silence-v083/chapter37-original.wav');
test('saved chapter-37 sample remains pending when scattered residual noise exceeds the text duration limit',{skip:!fs.existsSync(actualSample)},async t=>{
 const source=fs.readFileSync(actualSample),actualText='柳宗主的大秘密？';
 const f=fixture(t,()=>audioReply(source)),{b,c}=await chapter(f.e,[actualText]);
 await f.e.enqueue(b.id,[c.id]);const s=c.segments[0];
 assert.equal(f.calls.length,2);assert.equal(s.qualityAttempts,1);assert.equal(s.qualityStatus,'pending');assert(!s.audio);assert(!c.audio);
 assert.match(s.failReason,/处理后时长仍异常/);assert.equal(f.reads.length,0);
 for(const processed of f.processed){assert(processed.file.corrected);assert(processed.file.duration>9.5);assert(processed.file.duration<processed.file.originalDuration);assert(f.bytes(processed.rawId).equals(source));}
 assert.equal(f.e.state.tasks[0].status,'waiting');
});

test('archived raw above 8 MiB resumes by native file ID after state reload, never readAudio or TTS',async t=>{
 const source=wav([{seconds:2},{silence:true,noise:2,seconds:8},{seconds:2,seed:5}],{rate:192000,channels:2});
 assert(source.length>8*1024*1024);
 const f=fixture(t,()=>audioReply(source)),{b,c}=await chapter(f.e,[text]);
 const save=f.io.saveState;let paused=false;
 f.io.saveState=async data=>{const pending=JSON.parse(data).books[0]?.chapters[0]?.segments[0]?.speechDraft?.pendingRaw;if(pending&&!paused){paused=true;f.e.state.tasks[0].pauseRequested=true;}return save(data);};
 await f.e.enqueue(b.id,[c.id]);assert.equal(f.e.state.tasks[0].status,'paused');
 const pending=c.segments[0].speechDraft.pendingRaw;assert.equal(pending.silenceProcessingVersion,1);assert(pending.file.size>8*1024*1024);
 assert.equal(f.calls.length,1);assert.equal(f.processed.length,0);assert.equal(f.reads.length,0);assert(f.bytes(pending.file.id).equals(source));
 const restored=new Engine(f.io,JSON.parse(fs.readFileSync(path.join(f.dir,'state.json'),'utf8')));
 f.io.readAudio=async()=>{assert.fail('native resume must not load base64 through readAudio');};
 f.io.request=async()=>{assert.fail('native resume must not purchase another synthesis');};
 await restored.resume(restored.state.tasks[0].id);
 const completed=restored.chapter(b.id,c.id);assert.equal(completed.status,'ready');assert.equal(completed.segments[0].qualityStatus,'corrected');
 assert.equal(f.processed.length,1);assert.equal(f.processed[0].rawId,pending.file.id);assert.equal(f.calls.length,1);
});

test('a pause after native processing keeps raw and derivative reachable through cleanup and reload',async t=>{
 const f=fixture(t,()=>audioReply(noisyGap)),{b,c}=await chapter(f.e,[text]);const save=f.io.saveState;let paused=false;
 f.io.saveState=async data=>{const pending=JSON.parse(data).books[0]?.chapters[0]?.segments[0]?.speechDraft?.pendingRaw;if(pending?.processedFile&&!paused){paused=true;f.e.state.tasks[0].pauseRequested=true;}return save(data);};
 await f.e.enqueue(b.id,[c.id]);assert.equal(f.e.state.tasks[0].status,'paused');
 const pending=c.segments[0].speechDraft.pendingRaw,raw=pending.file.id,derivative=pending.processedFile.id;
 assert.notEqual(raw,derivative);assert(f.e.collectReferencedAudio().includes(raw));assert(f.e.collectReferencedAudio().includes(derivative));
 const orphan=await f.io.saveAudio(wav([{seed:9,seconds:1}]).toString('base64'),'wav');
 const restored=new Engine(f.io,JSON.parse(fs.readFileSync(path.join(f.dir,'state.json'),'utf8')));
 await restored.garbageCollectAudio();assert(!fs.existsSync(path.join(f.dir,orphan.id)));assert(f.bytes(raw).equals(noisyGap));assert(f.bytes(derivative).length>44);
 await restored.resume(restored.state.tasks[0].id);
 assert.equal(restored.chapter(b.id,c.id).segments[0].audio,derivative);assert.equal(f.calls.length,1);assert.equal(f.reads.length,0);
 assert(restored.collectReferencedAudio().includes(raw));assert(restored.collectReferencedAudio().includes(derivative));
});

test('one native quality retry is shared across split parts and a pause before retry',async t=>{
 const f=fixture(t,(_,__,calls)=>audioReply(calls.length===2?normal:nearSilent));let draft={},pause=false;
 const onQuality=update=>{draft={...draft,...update};if(update.qualityAttempts===1&&update.pendingRaw===null)pause=true;};
 await assert.rejects(f.e.synthesize(text+text,'preset:白桦','自然',{forceSplit:true,shouldPause:()=>pause,onQuality}),/暂停/);
 assert.equal(f.calls.length,1);assert.equal(draft.qualityAttempts,1);assert.equal(draft.splitDraft,true);
 pause=false;
 await assert.rejects(f.e.synthesize(text+text,'preset:白桦','自然',{...draft,shouldPause:()=>pause,onQuality:update=>{draft={...draft,...update};},onPart:files=>{draft={...draft,files:[...files],pendingRaw:null};}}),/合成异常/);
 assert.equal(f.calls.length,3,'first bad part, its one retry, then the second bad part');assert.equal(draft.qualityAttempts,1);assert.equal(draft.files.length,1);assert.equal(f.reads.length,0);
});

test('a completed native split part survives pause and is merged with processing metadata',async t=>{
 const f=fixture(t,()=>audioReply(noisyGap));let draft={},pause=false;
 const onQuality=update=>{draft={...draft,...update};};
 await assert.rejects(f.e.synthesize(text+text,'preset:白桦','自然',{forceSplit:true,shouldPause:()=>pause,onQuality,onPart:files=>{draft={...draft,files:[...files],pendingRaw:null};pause=true;}}),/暂停/);
 assert.equal(f.calls.length,1);assert.equal(draft.files.length,1);
 pause=false;const file=await f.e.synthesize(text+text,'preset:白桦','自然',{...JSON.parse(JSON.stringify(draft)),onQuality});
 assert.equal(f.calls.length,2);assert.equal(file.qualityStatus,'corrected');assert.equal(file.silenceProcessing.version,1);
 assert.equal(file.silenceProcessing.parts.length,2);assert(file.silenceProcessing.parts.every(p=>p.trimRanges.length>0));
 assert.equal(file.silenceProcessing.removedMs,draft.files[0].silenceProcessing.removedMs*2);
 assert(Math.abs(file.silenceProcessing.originalDuration-file.duration-file.silenceProcessing.removedMs/1000)<1e-6);
});

test('manual native quality failure preserves old playable segment and chapter references',async t=>{
 const f=fixture(t,()=>audioReply(nearSilent)),{b,c}=await chapter(f.e,[text]);
 const old=await f.io.saveAudio(normal.toString('base64'),'wav'),oldChapter=await f.io.mergeAudio([old.id,old.id]);
 Object.assign(c.segments[0],{audio:old.id,qualityStatus:'passed',silenceProcessing:{version:1,removedMs:0}});Object.assign(c,{audio:oldChapter.id,status:'ready'});
 const priorMetadata=JSON.stringify(c.segments[0].silenceProcessing);
 await assert.rejects(f.e.regenerateSegment(b.id,c.id,0),/全近静音/);
 const s=c.segments[0];assert.equal(s.audio,old.id);assert.equal(c.audio,oldChapter.id);assert.equal(JSON.stringify(s.silenceProcessing),priorMetadata);
 assert.equal(f.calls.length,2,'explicit regeneration starts a fresh budget with one configured extra attempt');assert.match(s.retryError,/全近静音/);
 assert(s.retryDraft.pendingRaw);for(const id of [old.id,oldChapter.id,...s.retryDraft.rawAudioIds])assert(f.e.collectReferencedAudio().includes(id));
 await f.e.garbageCollectAudio();assert(f.bytes(old.id).equals(normal));assert.equal(waveInfo(f.bytes(oldChapter.id)).duration,4);assert(s.retryDraft.rawAudioIds.every(id=>fs.existsSync(path.join(f.dir,id))));
});

test('ordinary low gain, fading, deliberate repetition and short pauses preserve every WAV byte',async t=>{
 const cases=[normal,wav([{gain:.005}]),wav([{gain:.001}]),wav([{fade:true}]),wav([{seed:3},{silence:true,seconds:.6},{seed:3,gain:.8}]),wav([{seconds:1},{silence:true,noise:2,seconds:2.5},{seconds:1,seed:5}])];
 for(const [index,source] of cases.entries()){
  const f=fixture(t,()=>audioReply(source)),file=await f.e.synthesize(index===4?text+text:text,'preset:白桦');
  assert.equal(f.calls.length,1);assert.equal(file.corrected,false);assert.equal(file.removedMs,0);assert.deepEqual(file.trimRanges,[]);
  assert(f.bytes(file.id).equals(source));assert.equal(file.id,file.rawAudioIds[0]);assert.equal(file.repetitionRemoved,false);
 }
});

test('a legacy pending raw without processing version uses legacy checks even when native is available',async t=>{
 const f=fixture(t,()=>{assert.fail('legacy pending raw must be reused');}),raw=await f.io.saveRawAudio(noisyGap.toString('base64'),'wav');
 const pendingRaw={file:raw,text,finishReason:'stop'};
 const file=await f.e.synthesize(text,'preset:白桦','自然',{generationVersion:2,pendingRaw,rawAudioIds:[raw.id]});
 assert.equal(f.processed.length,0);assert.deepEqual(f.reads,[raw.id]);assert.equal(f.calls.length,0);
 assert.equal(file.id,raw.id);assert(f.bytes(file.id).equals(noisyGap));assert.equal(file.silenceProcessing,undefined);
 assert.equal(file.qualityStatus,'passed');
});

test('new responses without a native capability retain the compatible legacy path',async t=>{
 const f=fixture(t,()=>audioReply(noisyGap));delete f.io.processSpeechAudio;
 const file=await f.e.synthesize(text,'preset:白桦');assert.equal(f.calls.length,1);assert.equal(f.processed.length,0);
 assert.equal(file.silenceProcessing,undefined);assert(f.bytes(file.id).equals(noisyGap));assert.equal(file.qualityStatus,'passed');
});

test('old completed chapter and segment audio remain immutable on upgrade and resume',async t=>{
 const f=fixture(t,()=>{assert.fail('completed legacy chapter cannot synthesize');}),{b,c}=await chapter(f.e,[text]);
 const old=await f.io.saveAudio(noisyGap.toString('base64'),'wav');
 Object.assign(c.segments[0],{audio:old.id,generationVersion:2,qualityStatus:'passed',durMs:10000});Object.assign(c,{audio:old.id,duration:10,status:'ready'});
 const before=JSON.stringify(c.segments[0]),restored=new Engine(f.io,JSON.parse(JSON.stringify(f.e.state)));
 assert.equal(await restored.repairChapterAudio(b.id,c.id),0);await restored.enqueue(b.id,[c.id]);await restored.resumeWaiting(b.id);
 assert.equal(JSON.stringify(restored.chapter(b.id,c.id).segments[0]),before);assert.equal(restored.chapter(b.id,c.id).audio,old.id);
 assert.equal(f.processed.length,0);assert.equal(f.calls.length,0);assert(f.bytes(old.id).equals(noisyGap));
});

test('pure punctuation and imported voice reference audio bypass native speech processing',async t=>{
 const f=fixture(t,()=>audioReply(normal));
 const silence=await f.e.synthesize('……！？','preset:白桦');assert(silence.silence);assert.equal(f.calls.length,0);assert.equal(f.processed.length,0);
 const reference=await f.io.saveAudio(noisyGap.toString('base64'),'wav');
 const voice=await f.e.importVoice({...reference,name:'Reference.wav',format:'wav',size:noisyGap.length});
 assert.equal(f.processed.length,0);assert(f.bytes(reference.id).equals(noisyGap));
 const file=await f.e.synthesize(text,voice.id);
 assert.equal(f.calls.length,1);assert.equal(f.processed.length,1);assert.notEqual(f.processed[0].rawId,reference.id);
 assert.equal(f.calls[0].body.model,'mimo-v2.5-tts-voiceclone');assert(f.calls[0].body.audio.voice.endsWith(noisyGap.toString('base64')));
 assert(f.bytes(reference.id).equals(noisyGap));assert(file.silenceProcessing);
});

test('corrected metadata persists on segments through chapter merge, state roundtrip and manual replacement',async t=>{
 const f=fixture(t,()=>audioReply(noisyGap)),{b,c}=await chapter(f.e,[text,'山里的风停了。']);
 await f.e.enqueue(b.id,[c.id]);assert.equal(c.status,'ready');assert.equal(f.calls.length,2);
 const metadata=c.segments.map(s=>s.silenceProcessing);assert(metadata.every(m=>m.version===1&&m.removedMs>5000&&m.trimRanges.length));
 assert(c.segments.every(s=>s.qualityStatus==='corrected'&&s.rawAudioIds.length===1));
 assert(Math.abs(waveInfo(f.bytes(c.audio)).duration-c.duration)<1e-6);
 const saved=JSON.parse(fs.readFileSync(path.join(f.dir,'state.json'),'utf8')),restored=new Engine(f.io,saved);
 assert.deepEqual(restored.chapter(b.id,c.id).segments.map(s=>s.silenceProcessing),metadata);
 const untouched=JSON.stringify(restored.chapter(b.id,c.id).segments[1]);
 await restored.regenerateSegment(b.id,c.id,0);
 assert.equal(f.calls.length,3);assert.equal(restored.chapter(b.id,c.id).segments[0].qualityStatus,'corrected');
 assert.deepEqual(restored.chapter(b.id,c.id).segments[0].silenceProcessing,metadata[0]);assert.equal(JSON.stringify(restored.chapter(b.id,c.id).segments[1]),untouched);
 await restored.persist();const final=new Engine(f.io,JSON.parse(fs.readFileSync(path.join(f.dir,'state.json'),'utf8')));
 assert.deepEqual(final.chapter(b.id,c.id).segments.map(s=>s.silenceProcessing),metadata);
 for(const s of final.chapter(b.id,c.id).segments)for(const id of [s.audio,...s.rawAudioIds])assert(final.collectReferencedAudio().includes(id));
});

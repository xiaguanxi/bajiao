// USB regression: isolated Engine + real Android bridge/files/player, replayed TTS
// response. Never writes the user's library, invokes a model, or remakes a chapter.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const assert=require('node:assert/strict');
const serial=process.env.ANDROID_SERIAL||'a1bb2037';
const adb=path.resolve('.tools/android-sdk/platform-tools/adb.exe');
const out=path.resolve('artifacts/silence-v083');
const run=args=>cp.execFileSync(adb,['-s',serial,...args],{maxBuffer:128*1024*1024,timeout:60000});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const readFile=name=>run(['exec-out','run-as','com.vocast.app','cat',name]);
const hashes=()=>run(['shell','run-as','com.vocast.app','sh','-c','"sha256sum files/audio/*"']).toString().trim().split(/\r?\n/).map(line=>line.trim().split(/\s+/)).reduce((map,[hash,name])=>({...map,[name]:hash}),{});
async function connect(){
 const pid=run(['shell','pidof','com.vocast.app']).toString().trim().split(/\s+/)[0];
 const sockets=run(['shell','cat','/proc/net/unix']).toString();
 const socket=sockets.match(new RegExp('@([^\\s]*webview_devtools_remote_'+pid+')\\b'))?.[1];
 assert(socket,'app WebView socket must be ready');
 const port=run(['forward','tcp:0','localabstract:'+socket]).toString().trim();
 const targets=await(await fetch('http://127.0.0.1:'+port+'/json')).json();
 const target=targets.find(t=>t.url.includes('app.vocast.local'));assert(target);
 const ws=new WebSocket(target.webSocketDebuggerUrl),pending=new Map();let sequence=0;
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 ws.addEventListener('message',event=>{const message=JSON.parse(event.data);if(!message.id)return;const request=pending.get(message.id);if(!request)return;pending.delete(message.id);clearTimeout(request.timer);message.error?request.reject(Error(message.error.message)):request.resolve(message.result);});
 const send=(method,params)=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},120000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
 return {async evaluate(fn,arg){const result=await send('Runtime.evaluate',{expression:'('+fn.toString()+')('+JSON.stringify(arg)+')',returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;},close(){ws.close();run(['forward','--remove','tcp:'+port]);}};
}
async function main(){
 fs.mkdirSync(out,{recursive:true});
 const source=fs.readFileSync(path.join(out,'chapter37-original.wav'));
 const {waveInfo}=require('./node-io.cjs'),wave=waveInfo(source),rate=wave.fmt.readUInt32LE(4),align=wave.fmt.readUInt16LE(12);
 assert.equal(wave.fmt.readUInt16LE(14),16);assert.equal(wave.fmt.length,16);
 const encode=pcm=>{const head=Buffer.from(source.subarray(0,44));head.writeUInt32LE(pcm.length+36,4);head.writeUInt32LE(pcm.length,40);return Buffer.concat([head,pcm]);};
 const normal=encode(wave.pcm.subarray(0,Math.round(rate*2.16)*align));
 const quiet=Buffer.alloc(Math.round(rate*193)*align);for(let at=0;at<quiet.length;at+=2)quiet.writeInt16LE((at/2)%3-1,at);
 const longSilence=encode(Buffer.concat([waveInfo(normal).pcm,quiet]));
 const beforeLibrary=JSON.parse(readFile('files/library.json')),beforeHashes=hashes();
 const h=await connect();let report;
 try{
  report=await h.evaluate(async payload=>{
   const {base64,originalBase64,normalBase64}=payload;
   const check=(value,message)=>{if(!value)throw Error(message);};
   let requests=0,persists=0,reads=0,processors=0,draft={},paused=false;
   const io={saveState:async()=>{persists++;},saveRawAudio:device.saveRawAudio,saveAudio:device.saveAudio,
    mergeAudio:device.mergeAudio,silence:device.silence,audioDurations:device.audioDurations,
    processSpeechAudio:async id=>{processors++;return device.processSpeechAudio(id);},
    readAudio:async id=>{reads++;return device.readAudio(id);},
    request:async()=>{requests++;return {choices:[{finish_reason:'stop',message:{audio:{data:base64}}}]};}};
   const e=new Vocast.Engine(io);e.state.settings.retries=0;
   const actualRaw=await device.saveRawAudio(originalBase64,'wav');
   const actualSample=await device.processSpeechAudio(actualRaw.id);
   check(actualSample.corrected&&actualSample.removedMs>190000,'original sample must lose long blank intervals');
   // Remaining scattered sounds can still make the seven-character sentence too
   // long: its quality retry must happen after trimming, not accept the anomaly.
   let residualCalls=0;
   const residualEngine=new Vocast.Engine({...io,request:async()=>{residualCalls++;return {choices:[{finish_reason:'stop',message:{audio:{data:residualCalls===1?originalBase64:normalBase64}}}]};}});
   residualEngine.state.settings.retries=0;
   const residualRetry=await residualEngine.synthesize('柳宗主的大秘密？','preset:白桦');
   check(residualCalls===2&&residualRetry.qualityAttempts===1,'residual duration anomaly must retry once');
   // Pause after the >8 MB response is durably archived; resume by native ID.
   await e.synthesize('柳宗主的大秘密？','preset:白桦','自然',{
    shouldPause:()=>paused,
    onQuality:async fields=>{draft={...draft,...fields};if(fields.pendingRaw&&!fields.pendingRaw.processedFile)paused=true;}
   }).then(()=>{throw Error('pause expected');},error=>check(error.message==='任务已暂停',error.message));
   check(requests===1&&draft.pendingRaw.silenceProcessingVersion===1,'archive must retain processing version');
   paused=false;
   const file=await e.synthesize('柳宗主的大秘密？','preset:白桦','自然',draft);
   check(requests===1&&reads===0,'resume must neither call TTS nor read large base64');
   check(file.qualityStatus==='corrected'&&file.silenceProcessing.removedMs>190000,'long near silence must be corrected');
   check(file.rawAudioIds.includes(draft.pendingRaw.file.id),'raw return must remain referenced');
   const processedAgain=await device.processSpeechAudio(file.id);
   check(!processedAgain.corrected&&processedAgain.id===file.id,'processing must be idempotent');
   // Manual redo and chapter merge run entirely in this isolated in-memory book.
   const b=await e.addBook('静音处理本地验证','柳宗主的大秘密？'),c=b.chapters[0];
   c.segments=[{id:0,text:'柳宗主的大秘密？',speaker:'旁白',confidence:1},{id:1,text:'柳宗主的大秘密？',speaker:'旁白',confidence:1,audio:file.id,durMs:Math.round(file.duration*1000)}];
   await e.regenerateSegment(b.id,c.id,0);
   check(c.segments[0].silenceProcessing.removedMs===file.silenceProcessing.removedMs,'segment must retain trim metadata');
   check(c.audio&&c.duration>=file.duration*2&&c.duration<file.duration*2+1,'chapter merge must use corrected lengths');
   const duration=await device.audioDurations([file.id,c.audio]);
   check(Math.abs(duration[file.id]-file.duration*1000)<2,'native duration must reflect corrected file');
   const playbackBefore=await device.call('playbackState');
   check(!playbackBefore.playing,'device must be idle before playback regression');
   await device.call('play',{id:c.audio,title:'静音处理验证',bookTitle:'本地回归',duration:Math.round(c.duration*1000),speed:1,position:0,hasPrev:false,hasNext:false});
   return {requests,persists,reads,processors,file,actualSample,residualRetry:{id:residualRetry.id,rawAudioIds:residualRetry.rawAudioIds,calls:residualCalls,qualityAttempts:residualRetry.qualityAttempts,duration:residualRetry.duration},chapter:{id:c.audio,duration:c.duration},playbackBefore};
  },{base64:longSilence.toString('base64'),originalBase64:source.toString('base64'),normalBase64:normal.toString('base64')});
  let state;
  for(let i=0;i<40;i++){state=await h.evaluate(()=>device.call('playbackState'));if(state.playing&&state.position>200)break;await wait(150);}
  assert.equal(state.id,report.chapter.id);assert.equal(state.playing,true);assert(state.position>200);assert(Math.abs(state.duration-report.chapter.duration*1000)<30);assert(!state.error);
  report.playback={...state};
  await h.evaluate(()=>device.call('playback',{op:'pause'}));
  const paused=await h.evaluate(()=>device.call('playbackState'));assert.equal(paused.playing,false);
  await h.evaluate(()=>device.call('playback',{op:'stop'}));
  const afterLibrary=JSON.parse(readFile('files/library.json'));
  const references=s=>s.books.map(b=>({id:b.id,characters:b.characters,chapters:b.chapters.map(c=>({id:c.id,storageRef:c.storageRef,audio:c.audio,duration:c.duration}))}));
  assert.deepEqual(references(afterLibrary),references(beforeLibrary));
  assert.deepEqual(afterLibrary.usage,beforeLibrary.usage);
  const afterHashes=hashes();for(const [name,hash] of Object.entries(beforeHashes))assert.equal(afterHashes[name],hash,'existing audio changed: '+name);
  const owned=[report.file.id,...report.file.rawAudioIds,report.actualSample.id,report.residualRetry.id,...report.residualRetry.rawAudioIds,report.chapter.id];
  const testIds=[...new Set(owned)].filter(id=>!beforeHashes['files/audio/'+id]);
  if(testIds.length)await h.evaluate(ids=>device.deleteAudio(ids),testIds);
  const cleanupHashes=hashes();
  for(const [name,hash] of Object.entries(beforeHashes))assert.equal(cleanupHashes[name],hash,'existing audio changed during test cleanup');
  report={passed:true,...report,device:serial,existingAudioVerified:Object.keys(beforeHashes).length,libraryReferencesUnchanged:true,modelCalls:0,testFilesRemoved:testIds.length,mode:'replayed response; real Android bridge, processing, merge and playback'};
  fs.writeFileSync(path.join(out,'device-report.json'),JSON.stringify(report,null,2));
  fs.writeFileSync(path.join(out,'android-after.png'),run(['exec-out','screencap','-p']));
  console.log(JSON.stringify({passed:true,sourceDuration:report.file.originalDuration,correctedDuration:report.file.duration,removedMs:report.file.removedMs,existingAudioVerified:report.existingAudioVerified,modelCalls:0}));
 }finally{
  // Stop only the test playback, including if an assertion failed.
  try{await h.evaluate(()=>device.call('playbackState')).then(s=>s.id===report?.chapter?.id?h.evaluate(()=>device.call('playback',{op:'stop'})):null);}catch(_){}
  h.close();
 }
}
module.exports={connect};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});

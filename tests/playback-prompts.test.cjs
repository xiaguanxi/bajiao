const {test}=require('node:test'),assert=require('node:assert/strict');
const V=require('../app/src/main/assets/core.js'),{Controller,TEXT}=require('../app/src/main/assets/playback-prompts.js');
test('native quiet interval starts at completion and rejects obsolete prompt tokens',()=>{
 const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),jdk=process.env.JAVA_HOME||path.resolve('.tools',fs.readdirSync('.tools').find(n=>n.startsWith('jdk-'))),out=path.resolve('artifacts/playback-prompts-20261015/java');fs.mkdirSync(out,{recursive:true});
 execFileSync(path.join(jdk,'bin/javac.exe'),['-encoding','UTF-8','-d',out,'app/src/main/java/com/vocast/app/PlaybackPromptGate.java','tests/PlaybackPromptGateTest.java']);
 assert.match(execFileSync(path.join(jdk,'bin/java.exe'),['-cp',out,'com.vocast.app.PlaybackPromptGateTest'],{encoding:'utf8'}),/PASS native prompt/);
});
async function setup(){const e=new V.Engine({saveState:async()=>{}}),b=await e.addBook('提示语','第一章\n正文。'),calls=[],tts=[];e.synthesize=async(text,voice,style,options)=>{tts.push({text,voice,style,options});return {id:'prompt-'+tts.length+'.wav',duration:4,rawAudioIds:['raw-'+tts.length+'.wav']};};const p=new Controller({engine:e,call:async(action,payload)=>{calls.push({action,...payload});}});return {e,b,p,calls,tts};}
test('narrator prompt cache survives reload and is protected from audio cleanup',async()=>{
 const {e,b,p,tts}=await setup();const chapters=JSON.stringify(b.chapters);await Promise.all([p.prepare(b.id,'waiting'),p.prepare(b.id,'waiting')]);assert.equal(tts.length,1);assert.equal(tts[0].voice,b.characters.find(r=>r.name==='旁白').voice);assert.equal(tts[0].text,TEXT.waiting);assert.equal(JSON.stringify(b.chapters),chapters);
 assert(e.collectReferencedAudio().includes('prompt-1.wav'));assert(e.collectReferencedAudio().includes('raw-1.wav'));const restored=new V.Engine({saveState:async()=>{}},JSON.parse(JSON.stringify(e.state)));restored.synthesize=()=>{throw Error('must use cache');};const q=new Controller({engine:restored,canSynthesize:()=>false,call:async()=>{}});assert.equal((await q.prepare(b.id,'waiting')).id,'prompt-1.wav');
});
test('custom narrator and changed bindings generate the correct new voice without touching chapter audio',async()=>{
 const {e,b,p,tts}=await setup();await p.prepare(b.id,'finished');e.state.voices.push({id:'custom',sample:'sample.wav',format:'wav',description:'温柔的声音'});b.characters[0].voice='custom';b.characters[0].description='温柔舒缓';await p.prepare(b.id,'finished');assert.equal(tts.length,2);assert.equal(tts[1].voice,'custom');assert.equal(tts[1].options.voiceDescription,'温柔舒缓');assert.equal(tts[1].text,TEXT.finished);e.state.voices[0].sample='replacement.wav';await p.prepare(b.id,'finished');assert.equal(tts.length,3);
});
test('one notice per wait episode arms a three-second native delay, then supplies cached audio',async()=>{
 const {b,p,calls}=await setup();await p.prepare(b.id,'waiting');p.schedule('waiting',b.id,b.chapters[0].id,'sentence.wav');const item=p.pending;p.schedule('waiting',b.id,b.chapters[0].id,'sentence.wav');assert.equal(p.pending,item);await item.ready;assert.deepEqual(calls.map(c=>c.op),['schedule','ready']);assert.equal(calls[0].delayMs,3000);assert.equal(calls[0].expectedAudioId,'sentence.wav');assert.equal(calls[1].id,'prompt-1.wav');p.cancel();assert.equal(calls.at(-1).op,'cancel');assert.equal(calls.at(-1).token,item.token);
});
test('content resuming while TTS is in flight prevents stale prompt playback',async()=>{
 const {e,b,p,calls}=await setup();let finish;e.synthesize=()=>new Promise(r=>finish=r);p.schedule('waiting',b.id,b.chapters[0].id,'old.wav');const pending=p.pending;while(!finish)await new Promise(r=>setImmediate(r));p.cancel();finish({id:'late.wav'});await pending.ready;assert.deepEqual(calls.map(c=>c.op),['schedule','cancel']);assert.equal(b.playbackPrompts.waiting.file.id,'late.wav','cache may finish for future use, but cannot play a stale notice');
});
test('binding changes and book removal during synthesis discard obsolete prompt results',async()=>{
 for(const change of [b=>b.characters[0].voice='preset:茉莉',(b,e)=>e.state.books.splice(0,1)]){const {e,b,p,calls}=await setup();let finish;e.synthesize=()=>new Promise(r=>finish=r);p.schedule('finished',b.id,b.chapters[0].id,'last.wav');const item=p.pending;while(!finish)await new Promise(r=>setImmediate(r));change(b,e);finish({id:'stale.wav'});await item.ready;assert(!calls.some(c=>c.op==='ready'));assert(!b.playbackPrompts);assert.equal(e._ttsActive,0);}
});
test('prompt failure stays outside production tasks and repeated playback does not spam requests',async()=>{
 const {e,b,p,calls}=await setup();let count=0;e.synthesize=async()=>{count++;throw Error('offline');};p.schedule('waiting',b.id,b.chapters[0].id,'part.wav');await p.pending.ready;await p.prepare(b.id,'waiting');assert.equal(count,1);assert.deepEqual(calls.map(c=>c.op),['schedule','cancel']);assert.deepEqual(e.state.tasks,[]);assert.equal(e._ttsActive,0);
});
test('prompt generation shares the production concurrency budget',async()=>{
 const {e,b,p}=await setup();e.state.settings.ttsParallel=1;let release,started=0;e.synthesize=async()=>{started++;if(started===1)await new Promise(r=>release=r);return {id:'audio-'+started+'.wav'};};const first=p.prepare(b.id,'waiting'),second=p.prepare(b.id,'finished');while(!release)await new Promise(r=>setImmediate(r));assert.equal(started,1);assert.equal(e._ttsActive,1);release();await Promise.all([first,second]);assert.equal(started,2);assert.equal(e._ttsActive,0);
});
test('deleting a book or clearing all its audio releases prompt cache, but listened cleanup preserves it',async()=>{
 for(const op of ['delete','all','listened']){const {e,b,p}=await setup();const deleted=[];e.io.deleteAudio=async ids=>{deleted.push(...ids);return {freedBytes:4};};await p.prepare(b.id,'waiting');if(op==='delete')await e.deleteBook(b.id);else await e.clearBookAudio(b.id,{onlyListened:op==='listened'});assert.equal(deleted.includes('prompt-1.wav'),op!=='listened');if(op==='listened')assert(b.playbackPrompts.waiting);}
});

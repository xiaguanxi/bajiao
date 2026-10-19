// Runs the real player and synthesizer against a local native bridge fixture.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/xiagu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const V=require('../app/src/main/assets/core.js'),{TEXT}=require('../app/src/main/assets/playback-prompts.js'),wav=require('./wav-fixture.cjs')();
(async()=>{
 const root=path.resolve('app/src/main/assets'),out=path.resolve('artifacts/playback-prompts-20261015');fs.mkdirSync(out,{recursive:true});
 const e=new V.Engine({saveState:async()=>{}}),b=await e.addBook('朗读提示','第一章 制作\n甲。乙。\n第二章 完结\n结束。');e.state.settings.autoProduceUpcoming=false;
 e.state.voices=[{id:'custom-narrator',sample:'narrator.wav',format:'wav',description:'温暖自然'}];b.characters[0].voice='custom-narrator';
 b.chapters[0].status='annotated';b.chapters[0].segments=[{id:0,text:'甲。',speaker:'旁白',confidence:1,audio:'line0.wav',durMs:5000},{id:1,text:'乙。',speaker:'旁白',confidence:1,audio:null},{id:2,text:'丙。',speaker:'旁白',confidence:1,audio:null}];
 b.chapters[1].audio='last.wav';b.chapters[1].duration=10;b.chapters[1].status='ready';b.chapters[1].segments=[{id:0,text:'结束。',speaker:'旁白',audio:'end-line.wav',durMs:10000,confidence:1}];
 e.state.tasks=[{id:'making',bookId:b.id,chapterId:b.chapters[0].id,status:'queued',phase:'合成对白',total:2,done:1}];
 let state=JSON.parse(JSON.stringify(e.state)),playback={id:'',position:0,playing:false,sleepRemainingMs:0},audio=0;const calls=[],errors=[];
 const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return res.writeHead(404).end();res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));});await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:393,height:873}});page.on('pageerror',e=>errors.push(e.message));
  await page.exposeFunction('nativeCall',async(id,action,payload)=>{const p=JSON.parse(payload||'{}');calls.push({action,...p});let result=true;
   if(action==='load')result={state,llmConfigured:true,ttsConfigured:true};
   else if(action==='playbackPrompt')await page.evaluate(p=>{window.fixturePrompts=window.fixturePrompts||[];window.fixturePrompts.push(p);},p);
   else if(action==='playbackState')result={...playback};
   else if(action==='play')playback={...playback,id:p.id,position:p.position||0,playing:true};
   else if(action==='playback'){if(p.op==='pause')playback.playing=false;if(p.op==='resume')playback.playing=true;}
   else if(action==='readAudio')result={base64:wav};
   else if(action==='request')result={choices:[{finish_reason:'stop',message:{audio:{data:wav}}}]};
   else if(action==='saveRawAudio')result={id:'prompt-'+(++audio)+'.wav',duration:2,playable:true};
   else if(action==='saveSnapshot'){const chapters=new Map(state.books.flatMap(b=>b.chapters).map(c=>[c.id,c]));for(const c of JSON.parse(p.chapters))chapters.set(c.id,c);state=JSON.parse(p.header);for(const b of state.books)b.chapters=b.chapters.map(c=>chapters.get(c.id)||c);}
   await page.evaluate(v=>window.nativeResult(v),{id,result});
  });await page.addInitScript(()=>{window.Native={call:(...args)=>window.nativeCall(...args)};});await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.bajiaoEngine);
  await page.evaluate(()=>{window.bajiaoEngine.kick=async()=>{};window.bajiaoEngine.state.tasks[0].status='running';});
  const click=act=>page.locator('button[data-act="'+act+'"]').first().click(),prompts=()=>calls.filter(c=>c.action==='playbackPrompt');
  const complete=async()=>{playback.playing=false;await page.evaluate(id=>window.onNativePlaybackAction('completion',10000,id),playback.id);};
  await click('book:'+b.id);await click('read:'+b.chapters[0].id);await click('makeandlisten');await page.locator('[data-segstream="0"]').waitFor();await click('playchapter');
  await page.waitForFunction(()=>window.bajiaoEngine.state.books[0].playbackPrompts?.waiting?.file?.id);
  assert(calls.some(c=>c.action==='request'&&c.body.model==='mimo-v2.5-tts-voiceclone'&&c.body.messages[1].content===TEXT.waiting));
  await complete();await page.waitForFunction(()=>window.fixturePrompts?.at(-1)?.op==='ready');assert.equal(prompts().filter(c=>c.op==='schedule').length,1);assert.equal(prompts().at(-1).op,'ready');assert.equal(prompts()[0].delayMs,3000);const firstToken=prompts()[0].token;
  await page.evaluate(()=>window.bajiaoEngine.persist());await page.evaluate(()=>window.bajiaoEngine.persist());assert.equal(prompts().filter(c=>c.op==='schedule').length,1,'production checkpoints do not repeat the notice');
  // New audio before/after the quiet interval always resumes the next sentence.
  await page.evaluate(async()=>{const e=window.bajiaoEngine,c=e.state.books[0].chapters[0];c.segments[1].audio='line1.wav';c.segments[1].durMs=5000;e.touch(c);await e.persist();});
  await page.waitForFunction(()=>document.querySelector('[data-segstream="1"]')&&document.querySelector('#playBtn')?.dataset.playing==='true');assert.equal(playback.id,'line1.wav');assert(prompts().some(c=>c.op==='cancel'&&c.token===firstToken));
  assert.equal(await page.evaluate(()=>window.bajiaoEngine.state.books[0].chapters[0].segments.length),3,'prompt is not inserted into the chapter');
  // Pausing during a production wait cancels both the notice and automatic resume.
  await complete();await page.waitForFunction(()=>window.fixturePrompts?.at(-1)?.op==='ready');const pausedToken=prompts().at(-1).token;await page.evaluate(()=>window.onNativePlaybackAction('pause',0));assert(prompts().some(c=>c.op==='cancel'&&c.token===pausedToken));
  const pausedPlays=calls.filter(c=>c.action==='play').length;await page.evaluate(async()=>{const e=window.bajiaoEngine,c=e.state.books[0].chapters[0];c.segments[2].audio='line2.wav';c.segments[2].durMs=5000;e.touch(c);await e.persist();});assert.equal(calls.filter(c=>c.action==='play').length,pausedPlays,'new content respects a manual pause');
  playback.playing=true;await page.evaluate(()=>window.onNativePlaybackAction('play',0));await complete();assert.equal(playback.id,'line2.wav','explicitly resuming restores continuous playback');
  // A complete streamed chapter waits for merging instead of announcing book completion.
  await complete();assert.equal(prompts().filter(c=>c.op==='schedule').at(-1).expectedAudioId,'line2.wav');assert(!calls.some(c=>c.action==='request'&&c.body.messages[1].content===TEXT.finished));
  await page.evaluate(async()=>{const e=window.bajiaoEngine,c=e.state.books[0].chapters[0];c.audio='merged.wav';c.duration=10;c.status='ready';e.state.tasks[0].status='done';e.touch(c);await e.persist();});
  await page.waitForFunction(()=>document.querySelector('.vc-slim-titles h2')?.textContent.includes('完结'));assert.equal(playback.id,'last.wav');await page.waitForFunction(()=>window.bajiaoEngine.state.books[0].playbackPrompts?.finished?.file?.id);
  const normalPlays=calls.filter(c=>c.action==='play').length;await complete();await page.waitForFunction(()=>window.fixturePrompts?.at(-1)?.op==='ready');assert.equal(prompts().filter(c=>c.op==='schedule').at(-1).expectedAudioId,'last.wav');assert.equal(prompts().at(-1).op,'ready');assert.equal(calls.filter(c=>c.action==='play').length,normalPlays,'friendly ending uses the separate native prompt player');assert.equal(playback.id,'last.wav');assert.equal(await page.evaluate(()=>window.bajiaoEngine.state.books[0].chapters[1].lastPlayedPosition),10000);
  const endingToken=prompts().at(-1).token;await page.evaluate(()=>window.onNativePlaybackAction('pause',0));assert(prompts().some(c=>c.op==='cancel'&&c.token===endingToken));
  // Sleep boundaries suppress all notices, even at the last chapter.
  await page.evaluate(()=>{const e=window.bajiaoEngine;e.state.sleepChapterPlan={bookId:e.state.books[0].id,remaining:1,lastChapterId:null};});const schedules=prompts().filter(c=>c.op==='schedule').length;await complete();assert.equal(prompts().filter(c=>c.op==='schedule').length,schedules);
  assert.equal(calls.filter(c=>c.action==='request').length,2,'each friendly phrase is generated once for the bound narrator');assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'ui-report.json'),JSON.stringify({passed:true,checks:['bound custom narrator used for both phrases','three-second native schedule','one notice per waiting episode','background checkpoints do not repeat','new sentence cancels and resumes','manual pause blocks auto resume until explicit play','merge wait cancels on auto-next','book ending preserves original player and progress','pause cancels pending ending','chapter sleep suppresses notice','cached TTS phrases generated once'],errors},null,2));console.log('PASS narrator notices for production catch-up and whole-book completion');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

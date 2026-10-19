// Frontend restart with stale lazy chapter bodies and a newer native checkpoint. No real model calls.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/xiagu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const V=require('../app/src/main/assets/core.js');
(async()=>{
 const root=path.resolve('app/src/main/assets'),out=path.resolve('artifacts/resume-profiles');fs.mkdirSync(out,{recursive:true});
 const e=new V.Engine({saveState:async()=>{}}),b=await e.addBook('断点与角色资料','第一章 开始\n林晚是医馆的学徒。她轻声说：“我去取药。”\n第二章 继续\n另一段故事。');
 const [whole,stream]=b.chapters;whole.audio='whole.wav';whole.duration=100;whole.listened=true;whole.segments=[{id:0,text:whole.text,speaker:'旁白',audio:'whole-clip.wav',durMs:100000}];
 stream.segments=Array.from({length:7},(_,i)=>({id:i,text:'这是第'+i+'句。',speaker:'旁白',audio:i<6?'s'+i+'.wav':null,durMs:10000}));stream.status='annotated';
 b.characters.push({name:'林晚',description:'自然清晰的声音',voice:'preset:冰糖',aliases:[]});e.state.settings.autoProduceUpcoming=false;
 let state=JSON.parse(JSON.stringify(e.state)),bodies=new Map(b.chapters.map(c=>[c.id,JSON.parse(JSON.stringify(c))]));
 let checkpoint={bookId:b.id,chapterId:whole.id,position:98500,offsetMs:98500,audioId:'whole.wav',segmentId:-1,completed:false,at:Date.now()+1000};
 let playback={id:'',position:0,playing:false};const plays=[],errors=[],modelCalls=[];
 const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+req.url.split('?')[0]);if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return res.writeHead(404).end();res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:393,height:820}});page.on('pageerror',e=>errors.push(e.message));
  await page.exposeFunction('fixtureNative',async(id,action,payload)=>{const p=JSON.parse(payload);let result=true;
   if(action==='load')result={state:{...state,books:state.books.map(b=>({...b,chapters:b.chapters.map(c=>({...c,segmentCount:c.segmentCount??bodies.get(c.id)?.segments?.length??0,unloaded:true,text:undefined,segments:[]}))}))},playbackCheckpoint:checkpoint,llmConfigured:true,ttsConfigured:false};
   else if(action==='loadChapter')result=bodies.get(p.id);
   else if(action==='saveSnapshot'){for(const c of JSON.parse(p.chapters))bodies.set(c.id,c);state=JSON.parse(p.header);}
   else if(action==='saveState')state=JSON.parse(p.text);
   else if(action==='play'){plays.push(p);playback={...p,playing:!p.startPaused};}
   else if(action==='playbackState')result=playback;
   else if(action==='playback'){if(p.op==='pause')playback.playing=false;if(p.op==='resume')playback.playing=true;if(p.op==='seek')playback.position=p.value;}
   else if(action==='audioDurations')result=Object.fromEntries(p.ids.map(id=>[id,id.startsWith('whole')?100000:10000]));
   else if(action==='audioTimeline')result={id:'whole.wav',duration:100,parts:[{audio:'whole-clip.wav',startMs:0,endMs:100000}]};
   else if(action==='request'){assert.equal(p.provider,'llm');modelCalls.push(p.body);result={choices:[{message:{content:JSON.stringify({characters:[{name:'林晚',background:'医馆的学徒。',description:'女声，音色柔和，轻声吐字清楚。',evidence:'林晚是医馆的学徒。'}]})},finish_reason:'stop'}]};}
   else if(action==='networkState')result={connected:true,wifi:true};
   return {id,result};
  });
  await page.addInitScript(()=>{window.Native={call:(...args)=>window.fixtureNative(...args).then(window.nativeResult)};});
  const load=async()=>{await page.goto('http://127.0.0.1:'+server.address().port+'/index.html');await page.waitForFunction(()=>!!window.vocastEngine);};
  const click=async action=>{await page.locator('[data-act="'+action+'"]').first().click();};
  await load();await click('resumebook:'+b.id+':'+whole.id);await page.waitForFunction(()=>document.querySelector('#playBtn'));
  assert.equal(plays.at(-1).position,98500,'near-end listened marker must preserve position');assert.equal(plays.at(-1).bookId,b.id);
  playback.position=100000;playback.playing=false;await page.evaluate(async()=>{const e=window.vocastEngine,b=e.state.books[0],c=b.chapters[0];await e.updatePlaybackProgress(b.id,c.id,100000,100000,true);await window.onNativePlaybackAction('pause',0,'whole.wav');});await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.vocastEngine.state.books[0].chapters[0].playbackCompleted),true,'pause after completion must not erase the completed checkpoint');
  // Native journal advances while the persisted chapter body still has the old zero position.
  checkpoint={...checkpoint,chapterId:stream.id,position:25375,offsetMs:5375,audioId:'s2.wav',segmentId:2,at:Date.now()+2000};playback={id:'',playing:false,position:0};
  await load();await click('resumebook:'+b.id+':'+stream.id);await page.waitForFunction(()=>document.querySelector('#playBtn'));
  assert.equal(plays.at(-1).id,'s2.wav');assert.equal(plays.at(-1).position,5375);assert.equal(plays.at(-1).segmentId,2);assert.equal(plays.at(-1).positionBase,20000);
  playback.position=7321;await page.waitForFunction(()=>window.vocastEngine.state.lastPlayback?.position===27321);
  assert.equal(await page.evaluate(()=>window.vocastEngine.state.lastPlayback.segmentId),2);
  await page.evaluate(()=>window.appBackground());await page.waitForTimeout(100);
  assert.equal(state.lastPlayback.position,27321);assert.equal(state.books[0].chapters[1].lastPlayedPosition,27321);
  await click('back');await click('go:roles');await page.waitForFunction(()=>window.vocastEngine.state.books[0].characters.find(r=>r.name==='林晚')?.background==='医馆的学徒。');
  assert.equal(modelCalls.length,1);assert.match(await page.locator('.vc-role-background').nth(1).textContent(),/医馆的学徒/);assert.match(await page.locator('.vc-role-description').nth(1).textContent(),/音色柔和/);
  for(const width of [320,393,768]){await page.setViewportSize({width,height:820});await page.waitForTimeout(50);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(out,'roles-'+width+'.png'),fullPage:true});}
  await click('back');await click('go:roles');await page.waitForTimeout(100);assert.equal(modelCalls.length,1,'completed profiles must not be requested again');assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'ui-report.json'),JSON.stringify({passed:true,plays,modelRequests:modelCalls.length,errors},null,2));console.log('PASS whole/stream restart, sentence offsets, background persistence, character backfill and 320/393/768 layouts');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

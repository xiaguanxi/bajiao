// Shipped frontend with local native playback/production events; no paid requests.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/xiagu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {Engine}=require('../app/src/main/assets/core.js');
(async()=>{
 const root=path.resolve('app/src/main/assets'),out=path.resolve('artifacts/chapter-boundary');fs.mkdirSync(out,{recursive:true});
 const seedEngine=new Engine({saveState:async()=>{}}),b=await seedEngine.addBook('章末自动续播','第一章 当前\n甲。乙。\n第二章 下一章\n丙。丁。');
 seedEngine.state.settings.autoProduceUpcoming=false;
 for(const [index,c] of b.chapters.entries()){
  c.status='annotated';c.segments=[0,1].map(id=>({id,text:index===0?['甲。','乙。'][id]:['丙。','丁。'][id],speaker:'旁白',confidence:1,annotationStatus:'complete',audio:index===0?'current-'+id+'.wav':null,durMs:5000}));
 }
 seedEngine.state.tasks=b.chapters.map((c,index)=>({id:'task-'+index,bookId:b.id,chapterId:c.id,status:'paused',pauseRequested:true,phase:'合并章节',done:index?0:2,total:2}));
 const seed=JSON.parse(JSON.stringify(seedEngine.state)),calls=[],errors=[],cases=[];let playback,page;
 const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return res.writeHead(404).end();
  res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');
  let source=fs.readFileSync(file);
  // Observe private state only in the test response; the shipped assets stay intact.
  if(path.basename(file)==='app.js')source=source.toString().replace(/\}\)\(\);\s*$/,'window.boundaryDiagnostic=()=>({page,bookId,chapterId,session:{...productionPlaybackSession},stream:streamState?{...streamState}:null,waitingForNextChapterId,waitingForNextChapterPaused,playingChapterId,playingId,productionPlaybackBusy,playbackNavigationBusy});\n})();');
  res.end(source);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  page=await browser.newPage({viewport:{width:393,height:873}});page.setDefaultTimeout(6000);page.on('pageerror',error=>errors.push(error.message));
  await page.exposeFunction('fixtureNative',async(id,action,payload)=>{
   const p=JSON.parse(payload||'{}');calls.push({action,...p});let result=true,error=null;
   if(action==='load')result={state:JSON.parse(JSON.stringify(seed)),llmConfigured:false,ttsConfigured:false};
   else if(action==='playbackState')result={...playback};
   else if(action==='play')playback={id:p.id,position:p.position||0,playing:!p.startPaused};
   else if(action==='playback'){if(p.op==='pause'||p.op==='stop')playback.playing=false;if(p.op==='resume')playback.playing=true;}
   else if(action==='audioDurations')result={};
   else if(action==='networkState')result='wifi';
   else if(action==='request'||action==='testModelConfiguration')error={message:'Forbidden model call',retryable:false};
   if(!page.isClosed())await page.evaluate(value=>window.nativeResult(value),{id,result:error?null:result,error});
  });
  await page.addInitScript(()=>{window.Native={call:(...args)=>window.fixtureNative(...args)};});
  const act=a=>page.locator('[data-act="'+a+'"]').first().click(),diagnostic=()=>page.evaluate(()=>window.boundaryDiagnostic());
  const settle=()=>page.waitForFunction(()=>!window.boundaryDiagnostic().productionPlaybackBusy&&!window.boundaryDiagnostic().playbackNavigationBusy);
  const plays=()=>calls.filter(c=>c.action==='play').length;
  const setReady=async(index,removeTask=false)=>{
   await page.evaluate(async({index,removeTask})=>{const e=bajiaoEngine,c=e.state.books[0].chapters[index];for(const s of c.segments)s.audio=(index?'next-':'current-')+s.id+'.wav';c.audio=index?'next-whole.wav':'current-whole.wav';c.duration=10;c.status='ready';e.state.tasks.find(t=>t.id==='task-'+index).status='done';if(removeTask)e.state.tasks=e.state.tasks.filter(t=>t.chapterId!==c.id);e.touch(c);await e.persist();},{index,removeTask});await settle();
  };
  const setPart=async id=>{await page.evaluate(async id=>{const e=bajiaoEngine,c=e.state.books[0].chapters[1];c.segments[id].audio='next-'+id+'.wav';e.touch(c);await e.persist();},id);await settle();};
  const complete=async()=>{playback.playing=false;playback.position=playback.id.includes('whole')?10000:5000;await page.evaluate(({id,pos})=>window.onNativePlaybackAction('completion',pos,id),{id:playback.id,pos:playback.position});await settle();};
  const scenarios=[
   {name:'whole chapter waits for next',whole:true},
   {name:'merge and next chapter share one wait'},
   {name:'next ready before current merge',readyEarly:true},
   ...['cancelled','failed','done'].map(history=>({name:'older '+history+' task cannot block playback',whole:true,history})),
   {name:'ready audio survives removal of task history',whole:true,removeTask:true},
   {name:'continuous first sentence resumes before the chapter merge',whole:true,partial:true},
   {name:'out-of-order audio waits for the first sentence',whole:true,partial:true,outOfOrder:true},
   ...['quality','raw'].map(stay=>({name:'partial next chapter preserves the open '+stay+' page',whole:true,partial:true,stay})),
   ...['player','mini','system'].map(pause=>({name:pause+' pause keeps the boundary wait paused until explicit play',pause})),
   {name:'second wait after new content stops until manual resume',partial:true,secondWait:true},
   {name:'chapter merge never interrupts an unfinished sentence',noPreempt:true},
   {name:'duplicate completion cannot double-count a wait or sleep chapter',duplicates:true},
   {name:'chapter sleep ends at the boundary without auto playback',sleep:true},
   {name:'latest failed task stops an unplayable next chapter',whole:true,failed:true}
  ];
  for(const scenario of scenarios){
   calls.length=0;playback={id:'',playing:false,position:0};await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.bajiaoEngine&&window.boundaryDiagnostic);
   await page.evaluate(scenario=>{const e=bajiaoEngine,b=e.state.books[0];e.kick=async()=>{};for(const t of e.state.tasks)Object.assign(t,{status:'running',pauseRequested:false});if(scenario.whole){const c=b.chapters[0];c.audio='current-whole.wav';c.duration=10;c.status='ready';e.state.tasks[0].status='done';}if(scenario.history)e.state.tasks.splice(1,0,{id:'old-task',bookId:b.id,chapterId:b.chapters[1].id,status:scenario.history});if(scenario.duplicates||scenario.sleep)e.state.sleepChapterPlan={bookId:b.id,remaining:scenario.sleep?1:2,lastChapterId:null};},scenario);
   await act('book:'+b.id);await act('read:'+b.chapters[0].id);if(!scenario.whole)await act('makeandlisten');await act('playchapter');
   await page.waitForFunction(id=>window.boundaryDiagnostic().playingId===id,scenario.whole?'current-whole.wav':'current-0.wav');
   if(!scenario.whole){await act('streamsegment:1');await page.waitForFunction(()=>window.boundaryDiagnostic().playingId==='current-1.wav');}
   const originalPlays=plays();
   if(scenario.readyEarly)await setReady(1);
   if(scenario.noPreempt){await setReady(0);await setReady(1);assert.equal(plays(),originalPlays);assert.equal(playback.id,'current-1.wav');}
   await complete();const afterCompletion=await diagnostic();
   if(!scenario.whole&&!scenario.noPreempt)await setReady(0);const afterMerge=await diagnostic();
   if(scenario.readyEarly||scenario.noPreempt){assert.equal(playback.id,'next-whole.wav');assert.equal(plays(),originalPlays+1);}
   else if(scenario.sleep){
    await page.evaluate(id=>window.onNativePlaybackAction('pause',0,id),playback.id);await setReady(1);await page.waitForTimeout(200);assert.equal(plays(),originalPlays);assert.equal(await page.evaluate(()=>bajiaoEngine.state.sleepChapterPlan),null);assert.equal((await diagnostic()).session.paused,true);
   }else if(scenario.failed){
    await page.evaluate(async()=>{const e=bajiaoEngine;e.state.tasks.find(t=>t.id==='task-1').status='failed';await e.persist();});await settle();assert.equal(plays(),originalPlays);assert.equal((await diagnostic()).session.paused,true);assert.equal((await diagnostic()).waitingForNextChapterId,null);assert.match(await page.locator('#toast').innerText(),/制作失败/);
   }else{
    assert.equal(afterMerge.session.catchUps,1,scenario.name);assert.equal(afterMerge.session.paused,false,scenario.name);assert.equal(afterMerge.waitingForNextChapterId,b.chapters[1].id);
    if(scenario.duplicates){for(let n=0;n<3;n++)await complete();assert.equal((await diagnostic()).session.catchUps,1);assert.equal(await page.evaluate(()=>bajiaoEngine.state.sleepChapterPlan.remaining),1);}
    if(scenario.pause){
     if(scenario.pause==='mini'){await act('back');await act('miniplaypause');}
     else if(scenario.pause==='system'){playback.playing=false;await page.evaluate(id=>window.onNativePlaybackAction('pause',0,id),playback.id);}
     else await act('playchapter');
     await page.waitForFunction(()=>window.boundaryDiagnostic().session.paused);
     await setReady(1);await page.waitForTimeout(200);assert.equal(plays(),originalPlays);assert.equal((await diagnostic()).session.paused,true);
     if(scenario.pause==='mini')await act('miniplaypause');
     else if(scenario.pause==='system'){playback.playing=true;await page.evaluate(id=>window.onNativePlaybackAction('play',0,id),playback.id);}
     else await act('playchapter');
     await page.waitForFunction(()=>window.boundaryDiagnostic().playingId==='next-whole.wav');
     await settle();
    }else if(scenario.partial){
     if(scenario.stay){if(scenario.stay==='quality'){await act('back');await act('go:settings');await act('go:quality');await page.locator('#productionLlmRetries').fill('8');}else await act('go:raw');}
     if(scenario.outOfOrder){await setPart(1);assert.equal(plays(),originalPlays);assert.equal((await diagnostic()).waitingForNextChapterId,b.chapters[1].id);}
     await setPart(0);assert.equal(playback.id,'next-0.wav');assert.equal(await page.evaluate(()=>bajiaoEngine.state.tasks.find(t=>t.id==='task-1').status),'running');
     if(scenario.stay){const view=await diagnostic();assert.equal(view.page,scenario.stay);assert.equal(view.chapterId,b.chapters[0].id);if(scenario.stay==='quality'){assert.equal(await page.locator('#productionLlmRetries').inputValue(),'8');assert.equal(await page.evaluate(()=>bajiaoEngine.state.settings.llmRetries),3);}}
     if(scenario.secondWait){
      await complete();assert.equal((await diagnostic()).session.catchUps,2);assert.equal((await diagnostic()).session.paused,true);assert.equal((await diagnostic()).session.stoppedForSlowProduction,true);const stoppedPlays=plays();await setReady(1);await page.waitForTimeout(200);assert.equal(plays(),stoppedPlays);await act('playchapter');await page.waitForFunction(()=>window.boundaryDiagnostic().playingId==='next-1.wav');await settle();assert.equal(playback.id,'next-1.wav');assert.equal(plays(),stoppedPlays+1);
     }
    }else await setReady(1,!!scenario.removeTask);
    if(!scenario.partial)assert.equal(playback.id,'next-whole.wav',scenario.name);
    assert.equal((await diagnostic()).playingChapterId,b.chapters[1].id);assert.equal((await diagnostic()).session.paused,false);assert.equal((await diagnostic()).session.waitingForProduction,false);assert.equal(await page.locator('[data-production-wait-stop]').count(),0);
    if(scenario.name==='merge and next chapter share one wait'){
     for(const width of [320,393,768]){await page.setViewportSize({width,height:873});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(out,'resumed-'+width+'.png')});}await page.setViewportSize({width:393,height:873});
    }
   }
   await page.evaluate(()=>bajiaoEngine.persist());await settle();assert.equal(calls.filter(c=>c.action==='request'||c.action==='testModelConfiguration').length,0);
   const record={name:scenario.name,afterCompletion,afterMerge,result:await diagnostic(),playback:{...playback},nativeWaits:calls.filter(c=>c.action==='playback'&&c.op==='wait').length,nativePauses:calls.filter(c=>c.action==='playback'&&c.op==='pause').length};cases.push(record);console.log('PASS '+scenario.name);
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'ui-report.json'),JSON.stringify({passed:true,cases:cases.length,checks:cases,errors,modelCalls:0},null,2));
 }catch(error){await page.screenshot({path:path.join(out,'failure.png')});throw error;}finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

// Verify the real player DOM and native commands, without calling model providers.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/xiagu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const V=require('../app/src/main/assets/core.js');
(async()=>{
 const assets=path.resolve('app/src/main/assets'),out=path.resolve('artifacts/player-controls-20261015');fs.mkdirSync(out,{recursive:true});
 const seed=new V.Engine({saveState:async()=>{}}),b=await seed.addBook('播放器交互',Array.from({length:5},(_,i)=>`第${i+1}章 测试${i+1}\n这是第${i+1}章的原文。`).join('\n'));
 seed.state.settings.autoProduceUpcoming=false;
 for(const [i,c] of b.chapters.entries()){c.audio='chapter-'+i+'.wav';c.duration=120;c.status='ready';c.segments=[{id:0,text:c.text,speaker:'旁白',confidence:1,startMs:0,durMs:120000}];}
 let state=JSON.parse(JSON.stringify(seed.state)),playback={playing:false,position:30000,duration:120000,id:'',sleepRemainingMs:0};const calls=[],errors=[];
 const server=http.createServer((req,res)=>{const f=path.resolve(assets,'.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));if(!f.startsWith(assets+path.sep)||!fs.existsSync(f))return res.writeHead(404).end();res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(f));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:393,height:873}});page.on('pageerror',e=>errors.push(e.message));
  await page.exposeFunction('nativeCall',async(id,action,payload)=>{const p=JSON.parse(payload||'{}');let result=true;
   if(action==='load')result={state,llmConfigured:true,ttsConfigured:true};
   else if(action==='saveSnapshot'){const chapters=new Map(state.books.flatMap(b=>b.chapters).map(c=>[c.id,c]));for(const c of JSON.parse(p.chapters))chapters.set(c.id,c);state=JSON.parse(p.header);for(const b of state.books)b.chapters=b.chapters.map(c=>chapters.get(c.id)||c);}
   else if(action==='loadChapter')result=state.books.flatMap(b=>b.chapters).find(c=>c.id===p.id);
   else if(action==='saveState')state=JSON.parse(p.text);
   else if(action==='playbackState')result={...playback};
   else if(action==='play'){calls.push({action,...p});playback={...playback,id:p.id,playing:true,position:p.position||0,duration:p.duration};}
   else if(action==='playback'){calls.push({action,...p});if(p.op==='sleep')playback.sleepRemainingMs=p.value*60000;if(p.op==='pause')playback.playing=false;if(p.op==='resume')playback.playing=true;if(p.op==='seek')playback.position=p.value;}
   await page.evaluate(v=>window.nativeResult(v),{id,result});
  });await page.addInitScript(()=>{window.Native={call:(...args)=>window.nativeCall(...args)};});
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.bajiaoEngine);
  const click=act=>page.locator('button[data-act="'+act+'"]').first().click();
  const openTimer=()=>page.locator('.vc-player-tools [data-act="sleepmenu"]').click();
  const modal=page.locator('.vc-player-sheet');
  const waitSetting=async value=>page.waitForFunction(v=>window.bajiaoEngine.state.settings.sleepTimer===v,value);
  await click('book:'+b.id);await click('read:'+b.chapters[0].id);await page.locator('.vc-ctlbar').waitFor();
  // Keep the speed key in its original slot; move the seek keys around the range.
  assert.equal(await page.locator('.vc-ctlbar>button').first().getAttribute('data-act'),'speedmodal');
  assert.deepEqual(await page.locator('.vc-player-progress>button').evaluateAll(es=>es.map(e=>e.dataset.act)),['seekback','seekforward']);
  for(const size of [{width:320,height:740},{width:393,height:873},{width:768,height:1024},{width:736,height:393}]){
   await page.setViewportSize(size);
   const boxes=await page.evaluate(()=>{const rect=q=>{const r=document.querySelector(q).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};return {back:rect('[data-act=seekback]'),range:rect('#seek'),forward:rect('[data-act=seekforward]'),timer:rect('.vc-timer-button'),controls:rect('.vc-ctlbar'),overflow:document.documentElement.scrollWidth>innerWidth};});
   assert(!boxes.overflow);assert(boxes.back.right<=boxes.range.x);assert(boxes.range.right<=boxes.forward.x);assert(boxes.timer.bottom<=boxes.back.y+2);assert(boxes.controls.bottom<=size.height);assert(boxes.back.width>=44&&boxes.back.height>=44);
   await page.screenshot({path:path.join(out,'player-'+size.width+'x'+size.height+'.png'),animations:'disabled'});
   await click('speedmodal');await modal.waitFor();const speedBox=await modal.boundingBox();assert(Math.abs(speedBox.y+speedBox.height-size.height)<2,'speed sheet sits at screen bottom');assert(await page.evaluate(()=>document.querySelector('.vc-player-sheet').scrollWidth<=document.querySelector('.vc-player-sheet').clientWidth));await click('closespeed');
   await openTimer();await modal.waitFor();assert(await page.evaluate(()=>document.querySelector('.vc-player-sheet').scrollWidth<=document.querySelector('.vc-player-sheet').clientWidth));await click('closesleep');
  }
  await page.setViewportSize({width:393,height:873});
  playback.position=30000;await click('seekback');assert.equal(playback.position,15000);await click('seekforward');assert.equal(playback.position,30000);
  // A dragged slider previews immediately, commits on release, and stays open.
  await click('speedmodal');await page.locator('#speedRange').focus();
  await page.locator('#speedRange').evaluate(r=>{window.savedSpeedRange=r;r.value='1.35';r.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await page.locator('#speedBubble').textContent(),'1.35x');
  await page.evaluate(async()=>{await window.bajiaoEngine.persist();});
  assert(await page.evaluate(()=>window.savedSpeedRange===document.querySelector('#speedRange')),'background saves preserve slider DOM');
  await page.locator('#speedRange').evaluate(r=>r.dispatchEvent(new Event('change',{bubbles:true})));
  await page.waitForFunction(()=>window.bajiaoEngine.state.playbackSpeed===1.35);assert.equal(calls.filter(c=>c.op==='speed').at(-1).value,1.35);
  await click('setspeed:3');await page.waitForFunction(()=>window.bajiaoEngine.state.playbackSpeed===3);assert.equal(await page.locator('#speedRange').inputValue(),'3');assert.equal(await page.locator('[data-act="setspeed:3"]').getAttribute('aria-pressed'),'true');
  await page.screenshot({path:path.join(out,'speed-sheet.png'),animations:'disabled'});await click('closespeed');assert.equal(await page.locator('#speedBtnVal').textContent(),'3x');
  // Native timer commands, selected states, cancellation, and resume last choice.
  await openTimer();await click('setsleep:30');await waitSetting(30);assert.equal(calls.filter(c=>c.op==='sleep').at(-1).value,30);assert.equal(await page.locator('[data-sleep-choice="30"]').getAttribute('aria-pressed'),'true');assert.equal(await page.getByRole('switch').getAttribute('aria-checked'),'true');
  await click('togglesleep');await waitSetting(0);assert.equal(calls.filter(c=>c.op==='sleep').at(-1).value,0);assert.equal(await page.getByRole('switch').getAttribute('aria-checked'),'false');
  await click('togglesleep');await waitSetting(30);await click('sleepcustom');await page.locator('#sleepMinutes').fill('0');await click('setsleepcustom');assert.equal(await page.evaluate(()=>window.bajiaoEngine.state.settings.sleepTimer),30);assert.match(await page.locator('#toast').textContent(),/1–720/);
  await page.locator('#sleepMinutes').fill('7');await click('setsleepcustom');await waitSetting(7);assert.equal(calls.filter(c=>c.op==='sleep').at(-1).value,7);assert.match(await page.locator('[data-act="sleepcustom"]').textContent(),/7 分钟/);
  await page.screenshot({path:path.join(out,'timer-custom.png'),animations:'disabled'});await click('closesleep');
  playback.sleepRemainingMs=0;await openTimer();assert.equal(await page.getByRole('switch').getAttribute('aria-checked'),'false','expired native timer clears active status');await click('closesleep');
  // Chapter timing counts complete chapters, not native segment completions.
  for(const count of [1,2,3]){
   await page.locator('.vc-ctlbar [data-act="back"]').click();await click('read:'+b.chapters[0].id);await page.locator('.vc-ctlbar').waitFor();
   await openTimer();await click('setsleep:chapters:'+count);await waitSetting('chapters:'+count);assert.equal(calls.filter(c=>c.op==='sleep').at(-1).value,0,'chapter timing cancels the native minute timer');
   assert.equal(await page.locator('[data-sleep-choice="chapters:'+count+'"]').getAttribute('aria-pressed'),'true');
   if(count===2)await page.screenshot({path:path.join(out,'timer-chapters.png'),animations:'disabled'});await click('closesleep');
   await page.setViewportSize({width:320,height:740});assert(await page.locator('.vc-timer-button').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'active timer text fits a 320px screen');await page.setViewportSize({width:393,height:873});
   // Reload keeps the persisted chapter countdown (as on activity recreation).
   if(count===3){await page.reload();await page.waitForFunction(()=>window.bajiaoEngine);await click('book:'+b.id);await click('read:'+b.chapters[0].id);await page.locator('.vc-ctlbar').waitFor();assert.equal(await page.evaluate(()=>window.bajiaoEngine.state.sleepChapterPlan.remaining),3);}
   if(!playback.playing)await click('playchapter');
   for(let i=0;i<count;i++){
    playback.playing=false;const before=calls.filter(c=>c.action==='play').length;
    await page.evaluate(audio=>window.onNativePlaybackAction('completion',120000,audio),playback.id);
    if(i<count-1){assert.equal(calls.filter(c=>c.action==='play').length,before+1);assert.equal(playback.id,b.chapters[i+1].audio);assert.equal(await page.evaluate(()=>window.bajiaoEngine.state.sleepChapterPlan.remaining),count-i-1);}
    else {assert.equal(calls.filter(c=>c.action==='play').length,before,'no next chapter after timer boundary');assert.equal(await page.evaluate(()=>window.bajiaoEngine.state.sleepChapterPlan),null);assert.equal(playback.playing,false);}
   }
  }
  // A streamed chapter has several native completion events, but counts only once.
  await page.evaluate(()=>{const e=window.bajiaoEngine,c=e.state.books[0].chapters[3];c.audio=null;c.status='annotated';c.segments=[{id:0,text:'第一句。',speaker:'旁白',confidence:1,audio:'stream-0.wav',durMs:10000},{id:1,text:'第二句。',speaker:'旁白',confidence:1,audio:'stream-1.wav',durMs:10000}];e.touch(c);window.renderApp();});
  await click('nextchapter');await page.waitForFunction(()=>document.querySelector('[data-segstream="0"]'));
  assert.equal(playback.id,'stream-0.wav');await openTimer();await click('setsleep:chapters:1');await waitSetting('chapters:1');await click('closesleep');
  playback.playing=false;await page.evaluate(()=>window.onNativePlaybackAction('completion',10000,'stream-0.wav'));assert.equal(playback.id,'stream-1.wav');assert.equal(await page.evaluate(()=>window.bajiaoEngine.state.sleepChapterPlan.remaining),1);
  const beforeStreamEnd=calls.filter(c=>c.action==='play').length;playback.playing=false;await page.evaluate(()=>window.onNativePlaybackAction('completion',10000,'stream-1.wav'));assert.equal(calls.filter(c=>c.action==='play').length,beforeStreamEnd);assert.equal(await page.evaluate(()=>window.bajiaoEngine.state.sleepChapterPlan),null);
  // Palette follows the reader theme even though the sheet is outside the reader.
  await page.evaluate(()=>{window.bajiaoEngine.state.settings.readerTheme='dark';window.renderApp();});await openTimer();assert.equal(await modal.getAttribute('data-theme'),'dark');assert.equal(await modal.evaluate(el=>getComputedStyle(el).color),'rgb(228, 233, 228)');await page.screenshot({path:path.join(out,'timer-dark.png'),animations:'disabled'});
  await page.keyboard.press('Escape');await modal.waitFor({state:'detached'});assert.equal(await page.locator('main[inert]').count(),0);
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'ui-report.json'),JSON.stringify({passed:true,checks:['320/393/768px and landscape layout','seek commands around progress','original speed position','bottom sheets and dark theme','slider preview and native commit','3x preset','stable slider across save','minute timer and toggle memory','custom validation and timing','native timer expiry','1/2/3 complete chapter boundaries','chapter timer persisted across reload','stream segments count as one chapter','Escape restores page interaction'],errors},null,2));console.log('PASS player controls, speed and sleep sheets, native commands and chapter timers');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

// Real frontend and native fixture: no model requests or user library writes.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/xiagu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const V=require('../app/src/main/assets/core.js');
(async()=>{
 const root=path.resolve('app/src/main/assets'),out=path.resolve('artifacts/listening-v089');fs.mkdirSync(out,{recursive:true});
 const e=new V.Engine({saveState:async()=>{}}),b=await e.addBook('女大三千位列仙班','第一章 开始\n一段正文。\n第二章 继续\n另一段正文。');await e.addBook('还不起学贷的我只好兼职猎魔','甲。');
 e.state.settings.autoProduceUpcoming=false;
 const c=b.chapters[0];c.segments=Array.from({length:24},(_,i)=>({id:i,text:'这是第'+(i+1)+'句字幕，检查手动浏览和连续播放时的显示。',speaker:'旁白',confidence:1,audio:i<18?'s'+i+'.wav':null,durMs:2000}));c.status='annotated';
 let playback={id:'',playing:false,position:0},page;const errors=[],plays=[],calls=[];
 const server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));if(!f.startsWith(root+path.sep)||!fs.existsSync(f))return res.writeHead(404).end();res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(f));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  page=await browser.newPage({viewport:{width:361,height:800},hasTouch:true});page.setDefaultTimeout(6000);page.on('pageerror',err=>errors.push(err.message));
  await page.exposeFunction('nativeCall',async(id,action,payload)=>{
   const p=JSON.parse(payload||'{}');let result=true;
   if(action==='load')result={state:e.state,llmConfigured:false,ttsConfigured:false};
   else if(action==='playbackState')result={...playback};
   else if(action==='play'){plays.push(p);playback={id:p.id,playing:!p.startPaused,position:p.position||0};}
   else if(action==='playback'){calls.push(p);if(p.op==='seek')playback.position=p.value;if(p.op==='pause')playback.playing=false;if(p.op==='resume')playback.playing=true;}
   else if(action==='request')throw Error('Unexpected model request');
   await page.evaluate(v=>window.nativeResult(v),{id,result});
  });
  await page.addInitScript(()=>{window.Native={call:(...args)=>window.nativeCall(...args)};const now=Date.now.bind(Date);window.testTimeOffset=0;Date.now=()=>now()+window.testTimeOffset;});
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.bajiaoEngine);
  const click=act=>page.locator('[data-act="'+act+'"]').first().click();
  const metrics=[];
  for(const width of [320,361,412,768]){
   await page.setViewportSize({width,height:873});const covers=await page.locator('.vc-covers .vc-cover').evaluateAll(rows=>rows.map(row=>{const r=row.getBoundingClientRect();return{top:r.top,height:r.height};}));
   assert.equal(covers.length,2);assert(Math.abs(covers[0].top-covers[1].top)<1);assert.equal(covers[0].height,covers[1].height);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));metrics.push({width,covers});
  }
  await page.setViewportSize({width:361,height:800});await page.screenshot({path:path.join(out,'shelf.png')});await click('book:'+b.id);await page.waitForTimeout(350);
  const gap=await page.evaluate(()=>document.querySelector('.vc-catalog-sheet').getBoundingClientRect().top-document.querySelector('.vc-detail-actions').getBoundingClientRect().bottom);assert(gap>=10&&gap<=16,'catalog gap '+gap);await page.screenshot({path:path.join(out,'catalog.png')});
  await click('read:'+c.id);await click('go:listen');assert.equal(await page.locator('#seek').getAttribute('max'),'36000');
  // Idle scrubbing loads a sentence at its internal offset while staying paused.
  const setProgress=async value=>{await page.locator('#seek').evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},value);await page.waitForTimeout(100);};
  await setProgress(7500);assert.equal(playback.id,'s3.wav');assert.equal(playback.position,1500);assert.equal(playback.playing,false);assert.equal(plays.at(-1).startPaused,true);
  await page.locator('#playBtn').click();await page.waitForTimeout(100);assert.equal(playback.playing,true);
  await setProgress(8500);assert.equal(playback.id,'s4.wav');assert.equal(playback.position,500);assert.equal(playback.playing,true);
  await setProgress(9100);assert.equal(playback.position,1100);assert.equal(plays.at(-1).id,'s4.wav');assert.equal(calls.at(-1).op,'seek');
  // +/-15 seconds remains a time seek in streaming mode.
  await click('seekforward');assert.equal(playback.id,'s12.wav');assert.equal(playback.position,100);await click('seekback');assert.equal(playback.id,'s4.wav');assert.equal(playback.position,1100);
  // Production cannot replace the progress input during a real mouse drag.
  const range=await page.locator('#seek').boundingBox();await page.mouse.move(range.x+range.width*.25,range.y+range.height/2);await page.mouse.down();
  await page.evaluate(()=>{window.draggedSeek=document.getElementById('seek');const c=window.bajiaoEngine.state.books[0].chapters[0];c.segments[18].audio='s18.wav';window.renderApp();});
  assert(await page.evaluate(()=>window.draggedSeek===document.getElementById('seek')));await page.mouse.move(range.x+range.width*.65,range.y+range.height/2,{steps:8});await page.mouse.up();await page.waitForTimeout(150);
  assert.equal(await page.locator('#seek').getAttribute('max'),'38000');assert(playback.position>0&&playback.position<2000);assert(playback.playing);
  // Highlight has no class churn when native polls report the same sentence.
  await page.evaluate(()=>{window.activeLine=document.querySelector('.vc-transcript-line.active');window.activeChanges=0;window.classObserver=new MutationObserver(list=>window.activeChanges+=list.length);window.classObserver.observe(window.activeLine,{attributes:true,attributeFilter:['class']});});await page.waitForTimeout(550);assert.equal(await page.evaluate(()=>window.activeChanges),0);
  // User scrolling freezes both highlight and centering across automatic advance.
  const held=await page.locator('.vc-transcript-line.active').getAttribute('data-segstream');
  await page.locator('#transcriptPanel').dispatchEvent('touchstart',{touches:[]});await page.locator('#transcriptPanel').evaluate(el=>{el.scrollTop=10;el.dispatchEvent(new Event('touchmove',{bubbles:true}));el.dispatchEvent(new Event('touchend',{bubbles:true}));window.heldScroll=el.scrollTop;});
  await page.evaluate(()=>window.onNativePlaybackAction('completion',0));await page.waitForTimeout(300);assert.equal(await page.locator('.vc-transcript-line.active').getAttribute('data-segstream'),held);assert.equal(await page.locator('#transcriptPanel').evaluate(el=>el.scrollTop),await page.evaluate(()=>window.heldScroll));
  await page.evaluate(()=>{window.bajiaoEngine.state.books[0].chapters[0].segments[19].audio='s19.wav';window.renderApp();});assert(await page.evaluate(()=>window.activeLine===document.querySelector('.vc-transcript-line.active')));assert.equal(await page.evaluate(()=>window.activeChanges),0);
  await page.evaluate(()=>window.testTimeOffset+=4000);await page.waitForTimeout(50);assert.equal(await page.locator('.vc-transcript-line.active').getAttribute('data-segstream'),held);
  await page.evaluate(()=>window.testTimeOffset+=1200);await page.waitForFunction(held=>document.querySelector('.vc-transcript-line.active')?.dataset.segstream!==held,held);
  const offset=await page.evaluate(()=>{const r=document.querySelector('.vc-transcript-line.active').getBoundingClientRect(),p=document.querySelector('#transcriptPanel').getBoundingClientRect();return r.top+r.height/2-p.top-p.height/2;});assert(Math.abs(offset)<4,'follow resumes at center: '+offset);
  await page.screenshot({path:path.join(out,'subtitles.png')});
  // A merged chapter keeps its streaming position; subsequent full-audio seek also stays paused.
  await page.evaluate(()=>{const c=window.bajiaoEngine.state.books[0].chapters[0];c.audio='merged.wav';c.duration=48;window.renderApp();});assert.equal(await page.locator('#seek').getAttribute('max'),'40000');
  await page.locator('#playBtn').click();assert(!playback.playing);await setProgress(39500);assert.equal(playback.id,'s19.wav');assert.equal(playback.position,1500);assert(!playback.playing);
  await click('back');await click('read:'+c.id);await click('go:listen');await setProgress(13500); // stream state deliberately persists when returning to the current chapter
  assert.equal(playback.position,1500);assert(!playback.playing);
  // A gap excludes later generated audio from the seekable duration.
  await page.evaluate(()=>{window.bajiaoEngine.state.books[0].chapters[0].segments[21].audio='s21.wav';window.renderApp();});assert.equal(await page.locator('#seek').getAttribute('max'),'40000');
  await click('back');await page.evaluate(()=>{const c=window.bajiaoEngine.state.books[0].chapters[1];c.audio='whole2.wav';c.duration=60;c.segments=Array.from({length:30},(_,i)=>({id:i,text:'另一章第'+i+'句。',speaker:'旁白',confidence:1,audio:'w'+i+'.wav',durMs:2000}));window.renderApp();});
  await click('read:'+b.chapters[1].id);await click('go:listen');await setProgress(13500);assert.equal(playback.id,'whole2.wav');assert.equal(playback.position,13500);assert(!playback.playing);assert.equal(plays.at(-1).startPaused,true);
  await setProgress(21500);assert.equal(playback.position,21500);assert(!playback.playing);await page.locator('#playBtn').click();await setProgress(30500);assert.equal(playback.position,30500);assert(playback.playing);
  playback.position=31500;await page.waitForTimeout(160);assert.equal(await page.locator('#seek').inputValue(),'31500','focused slider continues following after release');
  await click('back');await click('go:roles');await click('chooserole:旁白');await click('choosetab:preset');assert.match(await page.locator('[data-act="choosevoice:preset:冰糖"]').innerText(),/中文青年女性/);assert.match(await page.locator('[data-act="choosevoice:preset:白桦"]').innerText(),/中文中年男性/);
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({passed:true,metrics,gap,offset,plays,errors},null,2));console.log('PASS covers, catalog gap, 5s gesture hold, stable subtitle nodes, stream scrubbing and pause preservation');
 }finally{await browser.close();server.close();}
})().catch(err=>{console.error(err);process.exitCode=1;});

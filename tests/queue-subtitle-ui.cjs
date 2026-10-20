// Real assets with a local native fixture. No model requests or user data writes.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/xiagu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const V=require('../app/src/main/assets/core.js');
(async()=>{
 const root=path.resolve('app/src/main/assets'),out=path.resolve('artifacts/queue-subtitle');fs.mkdirSync(out,{recursive:true});
 const state=V.makeState();state.settings.autoProduceUpcoming=false;
 const segments=Array.from({length:18},(_,i)=>({id:i,text:i===9?'嗯。':'这是第'+(i+1)+'句字幕，用于核对开始播放时的居中位置。',speaker:'旁白',confidence:1,audio:'seg'+i+'.wav',durMs:1000}));
 state.books=[{id:'book',name:'字幕与队列验证',characters:[{name:'旁白',voice:'preset:白桦'}],chapters:Array.from({length:8},(_,i)=>({id:'c'+i,title:'第'+(i+1)+'章 验证章节',text:'章节内容。',segments:i===0?segments:[],status:'annotated'}))}];
 state.voices=[{id:'voice',name:'清亮青年女性',description:'声音温柔清晰，带一点轻微气声，语速舒缓自然。',source:'design',format:'wav',sample:'reference.wav',enabled:true}];
 let playback={id:'',playing:false,position:0},page;const errors=[],starts=[];
 const server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));if(!f.startsWith(root+path.sep)||!fs.existsSync(f))return res.writeHead(404).end();res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(f));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  page=await browser.newPage({viewport:{width:393,height:873}});page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));
  await page.exposeFunction('nativeCall',async(id,action,payload)=>{
   const p=JSON.parse(payload||'{}');let result=true;
   if(action==='load')result={state,llmConfigured:false,ttsConfigured:false};
   else if(action==='playbackState')result=playback;
   else if(action==='play'){
    const visual=await page.evaluate(()=>{const row=document.querySelector('.vc-transcript-line.active'),panel=document.getElementById('transcriptPanel');if(!row||!panel)return null;const r=row.getBoundingClientRect(),p=panel.getBoundingClientRect();return {id:row.dataset.segstream,offset:r.top+r.height/2-p.top-p.height/2};});
    starts.push({id:p.id,visual});playback={id:p.id,playing:true,position:p.position||0};
   }else if(action==='playback'&&p.op==='seek')playback.position=p.value;
   else if(action==='request')throw Error('Unexpected paid request');
   await page.evaluate(value=>window.nativeResult(value),{id,result});
  });
  await page.addInitScript(()=>{window.Native={call:(...args)=>window.nativeCall(...args)};});
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.bajiaoEngine);
  const click=act=>page.locator('[data-act="'+act+'"]').first().click();
  await click('go:voices');assert.match(await page.locator('.voice-library-copy small').innerText(),/声音温柔清晰/);
  for(const width of [320,393,768]){await page.setViewportSize({width,height:873});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await page.setViewportSize({width:393,height:873});await page.screenshot({path:path.join(out,'voices.png')});
  await page.evaluate(()=>{const e=window.bajiaoEngine;e.state.tasks=e.state.books[0].chapters.map((c,i)=>({id:'task'+i,bookId:'book',chapterId:c.id,status:'queued',prio:0,created:8-i,phase:'等待开始',done:0,total:18}));window.renderApp();});
  await click('go:tasks');assert.deepEqual(await page.locator('[data-task-id]').evaluateAll(rows=>rows.map(r=>r.dataset.taskId)),Array.from({length:8},(_,i)=>'task'+i));
  assert.equal(await page.locator('[data-act^="taskup:"],[data-act^="taskdown:"]').count(),0);
  assert.equal(await page.locator('[data-task-drag]').count(),8);
  for(const width of [320,393,768]){await page.setViewportSize({width,height:873});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await page.setViewportSize({width:393,height:873});
  const height=(await page.locator('[data-task-id="task1"]').boundingBox()).height;assert(height<220,'task cards must be compact: '+height);
  const from=await page.locator('[data-task-drag="task2"]').boundingBox(),to=await page.locator('[data-task-id="task0"]').boundingBox();
  await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();await page.mouse.move(to.x+30,to.y+12,{steps:14});await page.mouse.up();
  await page.waitForFunction(()=>window.bajiaoEngine.pendingOrder()[0].id==='task2');
  assert.equal(await page.locator('[data-task-id]').first().getAttribute('data-task-id'),'task2');
  await page.screenshot({path:path.join(out,'tasks.png')});
  // Touch pointer path uses the same capture/drag events and remains scrollable elsewhere.
  await page.evaluate(()=>{const h=document.querySelector('[data-task-drag="task1"]');document.querySelector('#screen').setPointerCapture=()=>{};const r=h.getBoundingClientRect();h.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch',pointerId:77,button:0,clientX:r.x+16,clientY:r.y+16}));const target=document.querySelector('[data-task-id="task2"]').getBoundingClientRect();document.querySelector('#screen').dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerType:'touch',pointerId:77,clientX:target.x+30,clientY:target.y+8}));document.querySelector('#screen').dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'touch',pointerId:77}));});
  await page.waitForFunction(()=>window.bajiaoEngine.pendingOrder()[0].id==='task1');
  await page.evaluate(()=>{
   const e=window.bajiaoEngine;e.state.books[0].chapters[7].audio='completed.wav';
   e.state.tasks=[{id:'finished',bookId:'book',chapterId:'c7',status:'done',phase:'完成',done:18,total:18},{id:'cancelled',bookId:'book',chapterId:'c6',status:'cancelled',phase:'已取消'},{id:'orphan',bookId:'removed',chapterId:'missing',status:'done',phase:'完成'}];window.renderApp();
  });
  await click('tasktab:done');
  for(const width of [320,393,768]){
   await page.setViewportSize({width,height:873});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   for(const id of ['finished','cancelled','orphan']){
    const clear=page.locator('[data-act="removetask:'+id+'"]'),card=page.locator('.vc-panel').filter({has:clear});
    assert.equal(await card.locator('.vc-task-card-header [data-act="removetask:'+id+'"]').count(),1);
    assert.equal(await card.locator('.vc-task-card-actions [data-act^="removetask:"]').count(),0);
    assert.equal(await card.getByText('完成',{exact:true}).count(),0);
    const button=await clear.boundingBox(),bounds=await card.boundingBox(),heading=await card.locator('h3').boundingBox();
    assert(button.x>bounds.x+bounds.width/2);assert(button.y+button.height<=heading.y+1);
   }
   await page.screenshot({path:path.join(out,'completed-tasks-'+width+'.png')});
  }
  await click('removetask:finished');assert.equal(await page.locator('[data-task-id="finished"]').count(),0);
  assert.equal(await page.evaluate(()=>window.bajiaoEngine.state.books[0].chapters[7].audio),'completed.wav');
  await click('removetask:cancelled');await click('removetask:orphan');
  assert.equal(await page.evaluate(()=>window.bajiaoEngine.state.tasks.length),0);
  await page.setViewportSize({width:393,height:873});await click('tasktab:active');
  await page.evaluate(()=>{window.bajiaoEngine.state.tasks=[];window.renderApp();});
  await click('go:shelf');await click('book:book');await click('read:c0');await click('go:listen');await page.locator('#playBtn').click();
  await page.waitForFunction(()=>document.querySelector('.vc-transcript-line.active')?.dataset.segstream==='0');
  assert.equal(starts[0].visual.id,'0');assert(Math.abs(starts[0].visual.offset)<4,'first subtitle is centered before audio starts');
  // Deliberately scroll the transcript away, then explicitly start a one-character sentence.
  await page.locator('[data-act="streamsegment:9"]').scrollIntoViewIfNeeded();await click('streamsegment:9');
  await page.waitForFunction(()=>document.querySelector('.vc-transcript-line.active')?.dataset.segstream==='9');
  const ninth=starts.find(s=>s.id==='seg9.wav');assert.equal(ninth.visual.id,'9');assert(Math.abs(ninth.visual.offset)<4,'single-character line is centered before native play');
  await page.evaluate(()=>window.onNativePlaybackAction('completion',0));
  await page.waitForFunction(()=>document.querySelector('.vc-transcript-line.active')?.dataset.segstream==='10');
  const next=starts.find(s=>s.id==='seg10.wav');assert.equal(next.visual.id,'10');assert(Math.abs(next.visual.offset)<4,'automatic stream advance centers before native play');
  await page.screenshot({path:path.join(out,'subtitles.png')});
  // Merging a chapter while segment playback continues must retain the active segment identity.
  await page.evaluate(()=>{const c=window.bajiaoEngine.state.books[0].chapters[0];c.audio='merged.wav';c.duration=18;window.renderApp();});
  assert.equal(await page.locator('.vc-transcript-line.active').getAttribute('data-segstream'),'10');
  await page.evaluate(async()=>{await window.bajiaoEngine.updatePlaybackProgress('book','c0',0,18000,false);});
  await click('back');await click('back');await click('resumebook:book:c0');
  await page.waitForFunction(()=>document.querySelector('.vc-transcript-line.active')?.dataset.segstream==='0');
  const whole=starts.find(s=>s.id==='merged.wav');assert.equal(whole.visual.id,'0');assert(Math.abs(whole.visual.offset)<4);
  playback.position=1050;
  await page.waitForFunction(()=>document.querySelector('.vc-transcript-line.active')?.dataset.segstream==='1',{},{timeout:500});
  await click('seekseg:1000');await page.waitForTimeout(150);playback.position=2050;
  await page.waitForFunction(()=>document.querySelector('.vc-transcript-line.active')?.dataset.segstream==='2',{},{timeout:500});
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({passed:true,taskCardHeight:height,starts,errors},null,2));
  console.log('PASS description, responsive layout, compact tasks without up/down buttons, mouse/touch reorder, completed-card header clear preserving audio, immediate stream subtitles and merge continuity; card height '+height);
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

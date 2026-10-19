// Real catalog/player UI with local chapter storage and a paused scheduler fixture.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/xiagu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const V=require('../app/src/main/assets/core.js');
(async()=>{
 const assets=path.resolve('app/src/main/assets'),out=path.resolve('artifacts/chapter-production-20261015');fs.mkdirSync(out,{recursive:true});
 const seed=new V.Engine({saveState:async()=>{}}),b=await seed.addBook('制作交互',Array.from({length:6},(_,i)=>`第${i+1}章 测试${i+1}\n这是第${i+1}章的原文。`).join('\n'));
 seed.state.settings.autoProduceUpcoming=false;
 b.chapters[1].segments=[{id:0,text:b.chapters[1].text,speaker:'旁白',confidence:1}];
 b.chapters[1].status='annotated';
 b.chapters[2].audio='old.wav';b.chapters[2].audioStale=true;
 b.chapters[3].audio='ready.wav';b.chapters[3].status='ready';
 seed.state.tasks=[{id:'running-annotation',bookId:b.id,chapterId:b.chapters[1].id,status:'queued',phase:'合成对白'},
  {id:'running-old',bookId:b.id,chapterId:b.chapters[2].id,status:'queued',phase:'重新合成'},
  {id:'done',bookId:b.id,chapterId:b.chapters[3].id,status:'done',phase:'已完成'}];
 const full=JSON.parse(JSON.stringify(seed.state)),state=JSON.parse(JSON.stringify(full));
 state.books[0].chapters=state.books[0].chapters.map(({text,segments,...c})=>({...c,textLength:text.length,segmentCount:segments.length,unloaded:true}));
 const server=http.createServer((req,res)=>{const f=path.resolve(assets,'.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));if(!f.startsWith(assets+path.sep)||!fs.existsSync(f))return res.writeHead(404).end();res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(f));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:393,height:873}}),errors=[],loads=[];let configured=true;page.on('pageerror',e=>errors.push(e.message));
  await page.exposeFunction('nativeCall',async(id,action,payload)=>{const p=JSON.parse(payload||'{}');let result=true;
   if(action==='load')result={state,llmConfigured:configured,ttsConfigured:configured};
   else if(action==='loadChapter'){loads.push(p.id);result=full.books[0].chapters.find(c=>c.id===p.id);}
   else if(action==='playbackState')result={playing:false,position:0};
   await page.evaluate(v=>window.nativeResult(v),{id,result});
  });await page.addInitScript(()=>{window.Native={call:(...args)=>window.nativeCall(...args)};});
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.bajiaoEngine);
  await page.evaluate(()=>{const e=window.bajiaoEngine;e.kick=async()=>{};for(const t of e.state.tasks)if(t.status==='queued')t.status='running';window.enqueued=0;window.resumed=0;const enqueue=e.enqueue.bind(e);e.enqueue=(...args)=>{window.enqueued++;return enqueue(...args);};e.resume=()=>{window.resumed++;throw Error('active task must not be resumed');};});
  const click=act=>page.locator('button[data-act="'+act+'"]').first().click();
  const row=i=>page.locator('[data-chapter-id="'+b.chapters[i].id+'"]');
  const modal=page.locator('.vc-modal-overlay[data-act="closeunmade"]');
  const assertProducing=async()=>{await modal.waitFor();assert.match(await modal.innerText(),/当前章节正在制作中/);assert.equal(await modal.locator('.vc-stack button').count(),2);assert.equal(await modal.locator('[data-act="makechapter"]').count(),0);assert.equal(await modal.locator('[data-act="readraw"]').count(),1);assert.equal(await modal.locator('[data-act="makeandlisten"]').count(),1);};
  await click('book:'+b.id);await row(0).waitFor();assert.equal(await row(0).locator('.vc-chapter-produce svg').count(),1);assert.equal(await row(0).locator('.vc-tag').count(),0,'unproduced text is replaced by icon');
  for(const width of [320,393]){await page.setViewportSize({width,height:873});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const size=await row(0).locator('.vc-chapter-produce').boundingBox();assert(size.width>=40&&size.height>=44);}
  await page.screenshot({path:path.join(out,'catalog-icons.png')});
  // Queue a task immediately, staying on the catalog and without loading chapter text.
  await row(0).locator('.vc-chapter-produce').click();await page.waitForFunction(()=>window.bajiaoEngine.state.tasks.length===4);await row(0).getByText('制作中',{exact:true}).waitFor();assert.equal(loads.length,0);assert.equal(await page.locator('main[data-page="detail"]').count(),1);assert.equal(await modal.count(),0);
  await click('read:'+b.chapters[0].id);await assertProducing();assert.match(await modal.innerText(),/排队等待/);
  await page.screenshot({path:path.join(out,'producing-options.png')});
  await click('readraw');await page.locator('main[data-page="raw"]').waitFor();assert.match(await page.locator('.reader').innerText(),/第1章的原文/);await click('back');await page.locator('main[data-page="detail"]').waitFor();
  await click('read:'+b.chapters[0].id);await assertProducing();await click('makeandlisten');await page.locator('main[data-page="listen"]').waitFor();assert.match(await page.locator('main').innerText(),/边做边听/);assert.equal(await page.evaluate(()=>window.enqueued),1);assert.equal(await page.evaluate(()=>window.resumed),0);await click('back');await page.locator('main[data-page="detail"]').waitFor();
  // Already annotated and stale-audio chapters must also use the in-progress choices.
  for(const i of [1,2]){await click('read:'+b.chapters[i].id);await assertProducing();await click('makeandlisten');await page.locator('main[data-page="listen"]').waitFor();assert(loads.includes(b.chapters[i].id),'stream entry loads chapter text');await click('back');await page.locator('main[data-page="detail"]').waitFor();}
  assert.equal(await page.evaluate(()=>window.enqueued),1);assert.equal(await page.evaluate(()=>window.resumed),0);
  await click('read:'+b.chapters[3].id);await page.locator('main[data-page="listen"]').waitFor();assert.equal(await modal.count(),0);await click('back');await page.locator('main[data-page="detail"]').waitFor();
  // An existing ordinary unmade dialog updates as a task starts in the background.
  await click('read:'+b.chapters[4].id);await modal.locator('[data-act="makechapter"]').waitFor();await page.evaluate(async({bid,cid})=>window.bajiaoEngine.enqueue(bid,[cid]),{bid:b.id,cid:b.chapters[4].id});await assertProducing();await click('closeunmade');
  // Even two clicks before a row refresh cannot enqueue duplicate work.
  await row(5).locator('.vc-chapter-produce').evaluate(el=>{el.click();el.click();});await page.waitForFunction(cid=>window.bajiaoEngine.state.tasks.filter(t=>t.chapterId===cid).length===1,b.chapters[5].id);assert.equal(await page.evaluate(()=>window.enqueued),3);await assertProducing();await click('closeunmade');
  // Missing credentials block new production, but do not block listening to an existing task.
  configured=false;await page.reload();await page.waitForFunction(()=>window.bajiaoEngine);await click('book:'+b.id);await row(0).locator('.vc-chapter-produce').click();await page.locator('main[data-page="settings"]').waitFor();assert.equal(await page.evaluate(()=>window.bajiaoEngine.state.tasks.length),3);
  await click('go:shelf');await click('book:'+b.id);await page.locator('main[data-page="detail"]').waitFor();await click('read:'+b.chapters[1].id);await assertProducing();await click('makeandlisten');await page.locator('main[data-page="listen"]').waitFor();assert.equal(await page.evaluate(()=>window.bajiaoEngine.state.tasks.length),3);
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'ui-report.json'),JSON.stringify({passed:true,checks:['hammer icon replaces unproduced label','320/393px touch controls','direct single task without chapter text load','queued/running/annotated/stale audio chapter choices','read original and return to catalog','listen while making loads chapter and reuses task','completed chapter keeps player navigation','dialog follows background task start','rapid clicks deduplicate tasks','credentials required only for new production'],errors},null,2));console.log('PASS chapter creation icons, in-progress choices and task reuse');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

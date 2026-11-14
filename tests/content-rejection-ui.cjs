// Runs shipped UI assets with an in-memory native bridge and no model service calls.
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const V=require('../app/src/main/assets/core.js');
(async()=>{
 const root=path.resolve('app/src/main/assets'),out=path.resolve('artifacts/content-rejection');fs.mkdirSync(out,{recursive:true});
 const seed=new V.Engine({saveState:async()=>{}}),b=await seed.addBook('审核失败处理','第1章 测试\n甲。乙。丙。\n第2章 后续\n丁。');
 seed.state.settings.autoProduceUpcoming=false;
 for(const c of b.chapters)c.segments=V.units(c.text).map(s=>({...s,speaker:'旁白',confidence:1}));
 const c=b.chapters[0];c.segments[0].audio='keep.wav';
 let state=JSON.parse(JSON.stringify(seed.state));const chapters=new Map(state.books.flatMap(b=>b.chapters).map(c=>[c.id,c])),calls=[],errors=[];
 const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return res.writeHead(404).end();res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:393,height:873}});page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  await page.exposeFunction('fixtureNative',async(id,action,payload)=>{const p=JSON.parse(payload||'{}');calls.push({action,p});let result=true,error=null;
   if(action==='load')result={state:JSON.parse(JSON.stringify(state)),llmConfigured:true,ttsConfigured:true};
   else if(action==='saveSnapshot'){for(const full of JSON.parse(p.chapters))chapters.set(full.id,full);state=JSON.parse(p.header);for(const b of state.books)b.chapters=b.chapters.map(c=>({...chapters.get(c.id),...c}));}
   else if(action==='loadChapter')result=chapters.get(p.id);
   else if(action==='networkState')result='wifi';
   else if(action==='playbackState')result={playing:false,position:0};
   else if(action==='request')error={message:'input new_sensitive (1026)',code:'1026',status:400,retryable:false};
   else if(action==='mergeAudio')result={id:'merged.wav',duration:p.ids.length};
   await page.evaluate(v=>window.nativeResult(v),{id,result,error});
  });
  await page.addInitScript(()=>window.Native={call:(...args)=>window.fixtureNative(...args)});
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.bajiaoEngine);
  const act=a=>page.locator('[data-act="'+a+'"]').first().click(),requests=()=>calls.filter(c=>c.action==='request');
  await page.evaluate(({bid,cid})=>bajiaoEngine.enqueue(bid,[cid]),{bid:b.id,cid:c.id});assert.equal(requests().length,2);
  await act('go:tasks');await act('tasktab:attention');await page.locator('.vc-task-card [data-act^="task:"]').click();
  const card=id=>page.locator('main[data-page="annotated"] [data-seg="'+id+'"]');
  await card(1).getByRole('button',{name:'跳过本句合成',exact:true}).click();
  await page.waitForFunction(()=>bajiaoEngine.state.tasks[0].status==='waiting'&&bajiaoEngine.state.books[0].chapters[0].segments[1].audio==='skip');assert.equal(requests().length,2);
  await act('opensegment:2');
  for(const width of [320,393]){await page.setViewportSize({width,height:873});const button=page.locator('.vc-segment-sheet [data-act="toggleskip:2"]');assert(await button.isVisible());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(out,'manual-'+width+'.png'),animations:'disabled'});}
  await page.locator('.vc-segment-sheet [data-act="toggleskip:2"]').click();await page.waitForFunction(()=>bajiaoEngine.state.tasks[0].status==='done');
  assert.equal(requests().length,2);assert.deepEqual(calls.filter(c=>c.action==='mergeAudio').at(-1).p.ids,['keep.wav']);
  await page.locator('.vc-segment-sheet [data-act="toggleskip:2"]').click();await page.waitForFunction(()=>bajiaoEngine.state.tasks[0].status==='paused');
  assert.equal(await page.evaluate(()=>bajiaoEngine.state.books[0].chapters[0].segments[2].skip),false);
  await page.locator('button[data-act="closesegment"]').click();await act('back');await act('go:settings');await act('go:quality');
  assert.match(await page.locator('#setting-ttsContentRejectedMode').innerText(),/用户确认/);
  await act('settingspick:ttsContentRejectedMode');await page.locator('.settings-picker').getByRole('button',{name:'直接跳过',exact:true}).click();
  assert.equal(await page.evaluate(()=>bajiaoEngine.state.settings.ttsContentRejectedMode),'review','editing alone does not save');
  await act('settingssave');await page.waitForFunction(()=>bajiaoEngine.state.settings.ttsContentRejectedMode==='skip');
  await page.screenshot({path:path.join(out,'settings.png')});
  await page.reload();await page.waitForFunction(()=>window.bajiaoEngine);assert.equal(await page.evaluate(()=>bajiaoEngine.state.settings.ttsContentRejectedMode),'skip');
  await page.evaluate(({bid,cid})=>bajiaoEngine.enqueue(bid,[cid]),{bid:b.id,cid:b.chapters[1].id});
  assert.equal(requests().length,3);assert.equal(await page.evaluate(()=>bajiaoEngine.state.books[0].chapters[1].status),'skipped');
  assert.equal(await page.evaluate(()=>bajiaoEngine.state.tasks[0].status),'paused','only the selected chapter resumes');assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({passed:true,requests:requests().length,checks:['manual skip on card and in sheet','remaining refusals stay pending','merge keeps completed audio only','undo skip','settings save and reload','automatic refusal skip','other paused chapter preserved','mobile widths'],errors},null,2));
  console.log('PASS content refusal settings, manual skip, automatic skip, undo, persistence and mobile UI');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

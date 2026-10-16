// Shipped Android web assets with native storage mocks; all model responses are local fixtures.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/xiagu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const V=require('../app/src/main/assets/core.js');
(async()=>{
 const assets=path.resolve('app/src/main/assets'),out=path.resolve('artifacts/annotation-recovery-20261015');fs.mkdirSync(out,{recursive:true});
 const seed=new V.Engine({saveState:async()=>{}}),b=await seed.addBook('标注恢复',Array.from({length:3},(_,i)=>`第${i+1}章 标注测试${i+1}\n`+Array.from({length:100},(_,n)=>'句子'+n+'。').join('')).join('\n'));
 seed.state.settings.autoProduceUpcoming=false;const c=b.chapters[0],input=V.units(c.text);
 c.analysisDraft={segments:input.slice(0,45).map(s=>({...s,speaker:'旁白',emotion:'自然',confidence:1,audio:'saved-'+s.id})),next:45,batchSize:45};
 seed.state.tasks=[{id:'legacy',bookId:b.id,chapterId:c.id,status:'failed',phase:'内容审核未通过',done:0,total:100,message:'input new_sensitive (1026)',error:{provider:'llm',stage:'标注角色',batchStart:46,batchEnd:90,code:1026,message:'input new_sensitive (1026)'}}];
 let state=JSON.parse(JSON.stringify(seed.state));const chapters=new Map(state.books.flatMap(b=>b.chapters).map(c=>[c.id,c]));state.books[0].chapters=state.books[0].chapters.map(({text,segments,...c})=>({...c,textLength:text.length,segmentCount:segments.length,unloaded:true}));
 const server=http.createServer((req,res)=>{const f=path.resolve(assets,'.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));if(!f.startsWith(assets+path.sep)||!fs.existsSync(f))return res.writeHead(404).end();res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(f));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:393,height:873}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.exposeFunction('nativeCall',async(id,action,payload)=>{const p=JSON.parse(payload||'{}');let result=true;
   if(action==='load')result={state,llmConfigured:true,ttsConfigured:true};
   else if(action==='loadChapter')result=chapters.get(p.id);
   else if(action==='saveSnapshot'){for(const c of JSON.parse(p.chapters))chapters.set(c.id,c);state=JSON.parse(p.header);}
   else if(action==='playbackState')result={playing:false,position:0};
   await page.evaluate(v=>window.nativeResult(v),{id,result});
  });await page.addInitScript(()=>{window.Native={call:(...args)=>window.nativeCall(...args)};});await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.vocastEngine);
  await page.evaluate(()=>{const e=window.vocastEngine;window.annotationCalls=[];window.spoken=[];
   e.llm=async prompt=>{const lines=JSON.parse(prompt.split('本批片段：')[1]);window.annotationCalls.push(lines.map(s=>s.id));if(lines.some(s=>s.id===48))throw new window.Vocast.ApiError('input new_sensitive (1026)',1026,false);return {characters:[],lines:lines.map(s=>({id:s.id,speaker:'旁白',emotion:'自然',confidence:1}))};};
   e.synthesize=async text=>{window.spoken.push(text);return {id:'audio-'+text,duration:1};};e.io.mergeAudio=async()=>({id:'whole.wav',duration:100});
  });
  const click=act=>page.locator('[data-act="'+act+'"]').first().click();
  await click('go:tasks');await click('tasktab:failed');await page.getByRole('button',{name:'处理标注',exact:true}).click();await page.locator('main[data-page="annotated"]').waitFor();assert.equal(await page.locator('[data-seg]').count(),100);assert.equal(await page.locator('[data-seg].vc-issue-card').count(),45);assert.equal(await page.getByText('还没有标注结果。',{exact:true}).count(),0);assert.equal(await page.locator('[data-seg="0"] .vc-tag').innerText(),'已合成');
  await click('analyze');await page.waitForFunction(()=>!window.vocastEngine.state.books[0].chapters[0].analysisDraft);assert.equal(await page.locator('[data-seg].vc-issue-card').count(),1);assert.equal(await page.locator('[data-seg="48"] [data-act="ignorespeaker:48"]').innerText(),'使用旁白');assert.equal(await page.evaluate(()=>window.annotationCalls[0].length),5);assert.equal(await page.evaluate(()=>window.annotationCalls.flat().some(id=>id<45)),false);
  await page.locator('[data-seg="48"]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'single-failed-annotation.png')});
  await click('resume:legacy');await page.waitForFunction(()=>window.vocastEngine.state.tasks.find(t=>t.id==='legacy').status==='waiting');assert.equal(await page.evaluate(()=>window.vocastEngine.state.tasks[0].done),99);await click('tasktab:attention');await click('task:legacy');await page.locator('main[data-page="annotated"]').waitFor();
  await click('editseg:48');await click('dropdown:segSpeaker');await click('pickopt:segSpeaker|旁白');await page.locator('#segmentEmotion').fill('手动校正');await click('saveseg');await page.locator('main[data-page="annotated"]').waitFor();assert.equal(await page.locator('[data-seg].vc-issue-card').count(),0);
  const before=await page.evaluate(()=>window.spoken.length);await page.getByRole('button',{name:'继续制作',exact:true}).click();await page.waitForFunction(()=>window.vocastEngine.state.tasks[0].status==='done');assert.equal(await page.evaluate(()=>window.spoken.length),before+1);assert.equal(await page.evaluate(()=>window.vocastEngine.state.books[0].chapters[0].segments[0].audio),'saved-0');
  // An automatic task with exactly the same bad sentence must complete using narration.
  await page.evaluate(async({bid,cid})=>{const e=window.vocastEngine;e.state.settings.mode='auto';await e.enqueue(bid,[cid]);},{bid:b.id,cid:b.chapters[1].id});await click('go:tasks');await click('tasktab:done');await click('task:'+(await page.evaluate(cid=>window.vocastEngine.state.tasks.find(t=>t.chapterId===cid).id,b.chapters[1].id)));await page.locator('main[data-page="annotated"]').waitFor();assert.equal(await page.locator('[data-seg]').count(),100);assert.equal(await page.locator('[data-seg].vc-issue-card').count(),0);assert.equal(await page.getByRole('button',{name:'修改说话人',exact:true}).count(),0);assert.equal(await page.locator('[data-seg="48"]').getByText('旁白兜底',{exact:true}).count(),1);await page.locator('[data-seg="48"]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'automatic-narrator-fallback.png')});
  // Switching from raw text to annotations also materializes the whole chapter.
  await click('back');await click('go:shelf');await click('book:'+b.id);await click('read:'+b.chapters[2].id);await click('readraw');await page.locator('main[data-page="raw"]').waitFor();await click('go:annotated');await page.locator('main[data-page="annotated"]').waitFor();assert.equal(await page.locator('[data-seg]').count(),100);assert.equal(await page.getByText('还没有标注结果。',{exact:true}).count(),0);
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'ui-report.json'),JSON.stringify({passed:true,checks:['legacy failed task opens populated annotation page','45 saved annotations/audio preserved','small batch retry narrows to exactly one line','other 99 sentences finish','manual speaker edit and resume synthesizes only repaired sentence','automatic narrator fallback has no review prompt','raw-to-annotation switch shows every sentence'],errors},null,2));console.log('PASS annotation recovery, single-line manual repair and automatic narrator fallback UI');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

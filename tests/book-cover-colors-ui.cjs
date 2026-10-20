// Use real import controls and app assets with local storage; never call a model.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/xiagu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {COVER_STYLES}=require('../app/src/main/assets/core.js');
(async()=>{
 const root=path.resolve('app/src/main/assets'),out=path.resolve('artifacts/reading-defaults');fs.mkdirSync(out,{recursive:true});
 const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return res.writeHead(404).end();
  res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:393,height:852}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  let state=null,serial=0,modelRequests=0;
  await page.exposeFunction('nativeCall',async(id,action,json)=>{
   const p=JSON.parse(json||'{}');let result=true,error=null;
   if(action==='load')result={state,llmConfigured:false,ttsConfigured:false};
   else if(action==='pick')result=[{name:'默认封面'+(++serial)+'.txt',text:'第一章 山风\n正文。'}];
   else if(action==='playbackState')result={playing:false,position:0};
   else if(action==='saveSnapshot'){
    const chapters=new Map((state?.books||[]).flatMap(b=>b.chapters).map(c=>[c.id,c]));
    for(const c of JSON.parse(p.chapters))chapters.set(c.id,c);
    state=JSON.parse(p.header);for(const b of state.books)b.chapters=b.chapters.map(c=>chapters.get(c.id)||c);
   }else if(action==='loadChapter')result=state.books.flatMap(b=>b.chapters).find(c=>c.id===p.id);
   else if(action==='request'){modelRequests++;error={message:'This test forbids model requests',retryable:false};}
   await page.evaluate(value=>window.nativeResult(value),{id,result,error});
  });
  await page.addInitScript(()=>{window.Native={call:(...args)=>window.nativeCall(...args)};});
  const url='http://127.0.0.1:'+server.address().port,act=a=>page.locator('[data-act="'+a+'"]').first().click();
  await page.goto(url);await page.waitForFunction(()=>window.bajiaoEngine);
  for(let i=0;i<=COVER_STYLES.length;i++){
   await act('importbook');await act('confirmsplit');await page.waitForFunction(n=>window.bajiaoEngine.state.books.length===n,i+1);await act('go:shelf');
   const colors=state.books.map(b=>b.coverColor);assert.equal(new Set(colors).size,Math.min(i+1,COVER_STYLES.length));
  }
  const savedColors=state.books.map(b=>b.coverColor);
  await page.reload();await page.waitForFunction(()=>window.bajiaoEngine);
  assert.deepEqual(await page.evaluate(()=>window.bajiaoEngine.state.books.map(b=>b.coverColor)),savedColors);
  const backgrounds=await page.locator('.vc-covers .vc-cover').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).backgroundColor));
  const expected=await page.evaluate(colors=>colors.map(color=>{const node=document.createElement('div');node.style.backgroundColor=color;return node.style.backgroundColor;}),COVER_STYLES.map(s=>s.color));
  assert.equal(backgrounds.length,COVER_STYLES.length+1);assert.deepEqual(new Set(backgrounds),new Set(expected));
  for(const width of [320,393,768]){
   await page.setViewportSize({width,height:852});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:path.join(out,'covers-'+width+'.png'),fullPage:true});
  }
  assert.equal(modelRequests,0);assert.deepEqual(errors,[]);
  const report={passed:true,imports:serial,colors:savedColors,modelRequests,errors};fs.writeFileSync(path.join(out,'covers-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

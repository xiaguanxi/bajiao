// Compare real touch input on the shipping assets; no model calls or device writes.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/xiagu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const V=require('../app/src/main/assets/core.js');
(async()=>{
 const assets=path.resolve(process.env.BAJIAO_CATALOG_ASSETS||'app/src/main/assets'),out=path.resolve(process.env.BAJIAO_CATALOG_REPORT||'artifacts/catalog-smooth/after.json');fs.mkdirSync(path.dirname(out),{recursive:true});
 const e=new V.Engine({saveState:async()=>{}}),book=await e.addBook('长目录滚动测试',Array.from({length:2001},(_,i)=>`第${i+1}章 目录性能验证\n正文。`).join('\n'));
 e.state.settings.autoProduceUpcoming=false;
 const server=http.createServer((req,res)=>{const file=path.resolve(assets,'.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));if(!file.startsWith(assets+path.sep)||!fs.existsSync(file))return res.writeHead(404).end();res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:393,height:873},hasTouch:true,isMobile:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.exposeFunction('nativeCall',async(id,action)=>{assert.notEqual(action,'request');await page.evaluate(v=>window.nativeResult(v),{id,result:action==='load'?{state:e.state,llmConfigured:false,ttsConfigured:false}:action==='playbackState'?{playing:false,position:0}:true});});
  await page.addInitScript(()=>{
   window.Native={call:(...args)=>window.nativeCall(...args)};
   window.scrollWork={rowRectReads:0,preventedMoves:0,overviewMutations:0};
   const rect=Element.prototype.getBoundingClientRect;Element.prototype.getBoundingClientRect=function(){if(this.hasAttribute('data-chapter-id'))window.scrollWork.rowRectReads++;return rect.call(this);};
   const prevent=Event.prototype.preventDefault;Event.prototype.preventDefault=function(){if(this.type==='touchmove'&&this.target.closest?.('#catalog-scroll'))window.scrollWork.preventedMoves++;return prevent.call(this);};
  });
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.bajiaoEngine);
  await page.locator('[data-act="book:'+book.id+'"]').click();await page.locator('.vc-catalog-handle').click();await page.waitForTimeout(300);
  // Populate a long visited range, as repeated browsing would, before measuring.
  for(let i=0;i<65;i++)await page.evaluate(()=>new Promise(resolve=>{const l=document.getElementById('catalog-scroll');l.scrollTop=l.scrollHeight-l.clientHeight-80;requestAnimationFrame(()=>requestAnimationFrame(resolve));}));
  await page.evaluate(()=>{const list=document.getElementById('catalog-scroll'),rows=document.querySelectorAll('#chapter-list>[data-chapter-id]');list.scrollTop=rows[Math.floor(rows.length*.6)].offsetTop-list.offsetTop;});await page.waitForTimeout(250);
  const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  await page.evaluate(()=>{window.scrollWork={rowRectReads:0,preventedMoves:0,overviewMutations:0};window.scrollObserver=new MutationObserver(records=>window.scrollWork.overviewMutations+=records.length);window.scrollObserver.observe(document.querySelector('.vc-detail-overview'),{attributes:true,attributeFilter:['style']});});
  const top=await page.locator('#catalog-scroll').evaluate(el=>el.scrollTop),box=await page.locator('#catalog-scroll').boundingBox(),x=Math.round(box.x+box.width*.55),y=Math.round(box.y+Math.min(420,box.height-20));
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let i=1;i<=14;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-280*i/14}]});await page.waitForTimeout(16);}
  await page.waitForTimeout(140);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(250);
  const result=await page.evaluate(()=>({...window.scrollWork,top:document.getElementById('catalog-scroll').scrollTop,renderedRows:document.querySelectorAll('#chapter-list>[data-chapter-id]').length}));
  // Count icons passed to the converter while one new batch is appended.
  // Existing SVGs retain data-lucide, so a document-wide pass recreates them.
  await page.evaluate(()=>{window.convertedIcons=0;const create=lucide.createIcons;lucide.createIcons=options=>{window.convertedIcons+=(options?.root||document).querySelectorAll('[data-lucide]').length;return create(options);};});
  await page.evaluate(()=>new Promise(resolve=>{const l=document.getElementById('catalog-scroll');l.scrollTop=l.scrollHeight-l.clientHeight-80;requestAnimationFrame(()=>requestAnimationFrame(resolve));}));
  result.iconsConvertedOnAppend=await page.evaluate(()=>window.convertedIcons);
  result.distance=result.top-top;result.cpuThrottle=4;result.errors=errors;
  assert(result.renderedRows>500);assert(result.distance>100);assert.deepEqual(errors,[]);
  if(process.env.BAJIAO_EXPECT_NATIVE==='1'){assert.equal(result.preventedMoves,0);assert.equal(result.overviewMutations,0);assert(result.rowRectReads<500);assert(result.iconsConvertedOnAppend<100);}
  fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

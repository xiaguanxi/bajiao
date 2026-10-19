// Exercise real browser touch input, nested scroll handoff, and background renders.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/xiagu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const V=require('../app/src/main/assets/core.js');
(async()=>{
 const assets=path.resolve('app/src/main/assets'),out=path.resolve('artifacts/catalog-sheet');fs.mkdirSync(out,{recursive:true});
 const engine=new V.Engine({saveState:async()=>{}}),book=await engine.addBook('山海来信',Array.from({length:240},(_,i)=>`第${i+1}章 山中的故事\n这是一段示例原文。`).join('\n'));
 book.author='林间';engine.state.settings.autoProduceUpcoming=false;
 const state=JSON.parse(JSON.stringify(engine.state));
 const server=http.createServer((req,res)=>{const f=path.resolve(assets,'.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));if(!f.startsWith(assets+path.sep)||!fs.existsSync(f))return res.writeHead(404).end();res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(f));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:393,height:873},hasTouch:true,isMobile:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.exposeFunction('nativeCall',async(id,action)=>{const result=action==='load'?{state,llmConfigured:true,ttsConfigured:true}:action==='playbackState'?{playing:false,position:0}:true;await page.evaluate(v=>window.nativeResult(v),{id,result});});
  await page.addInitScript(()=>{window.Native={call:(...args)=>window.nativeCall(...args)};});await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.bajiaoEngine);
  const click=act=>page.locator('button[data-act="'+act+'"]').first().click();
  const metrics=()=>page.evaluate(()=>{const o=document.querySelector('.vc-detail-overview'),l=document.getElementById('catalog-scroll'),h=document.getElementById('catalog-heading');return{height:o.getBoundingClientRect().height,top:l.scrollTop,listHeight:l.clientHeight,heading:h.getBoundingClientRect().top,first:document.querySelector('[data-chapter-id]').dataset.chapterId,count:document.querySelectorAll('[data-chapter-id]').length};});
  const settle=()=>page.waitForTimeout(650);
  const cdp=await page.context().newCDPSession(page);
  const gesture=async(selector,delta,{during,coast=false}={})=>{
   const box=await page.locator(selector).boundingBox(),x=Math.round(box.x+box.width*.55),y=Math.round(selector==='.vc-catalog-handle'?box.y+box.height/2:box.y+Math.min(box.height-20,delta>0?340:40));
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
   for(let i=1;i<=12;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-delta*i/12}]});if(i===6&&during)await during();await page.waitForTimeout(16);}
   if(!coast)await page.waitForTimeout(130);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});const released=await metrics();await settle();return released;
  };
  await click('book:'+book.id);await settle();const initial=await metrics();assert(initial.height>150);assert(initial.listHeight>100);await page.screenshot({path:path.join(out,'detail.png')});
  await gesture('#catalog-scroll',120,{during:async()=>{await page.evaluate(()=>{window.sheetNode=document.querySelector('.vc-catalog-sheet');window.bajiaoEngine.state.books[0].author='林间 · 更新';window.renderApp();});assert(await page.evaluate(()=>window.sheetNode===document.querySelector('.vc-catalog-sheet')),'background render is deferred during dragging');}});
  let m=await metrics();assert(m.height<1,'swiping up expands the entire sheet');assert(m.listHeight>initial.listHeight+150);assert(m.top<1,'sheet motion is consumed before list scrolling');assert.match(await page.locator('.vc-detail-overview').textContent(),/更新/);await page.screenshot({path:path.join(out,'expanded.png')});
  await gesture('#catalog-scroll',280);m=await metrics();assert(m.top>200,'continued upward swipe scrolls chapters');assert(m.height<1);
  const released=await gesture('#catalog-scroll',240,{coast:true});assert((await metrics()).top>released.top+2,'a quick swipe retains list momentum');
  const saved=(await metrics()).top;await gesture('#catalog-scroll',-70);m=await metrics();assert(m.top<saved&&m.top>0);assert(m.height<1,'downward scroll within the list keeps sheet expanded');
  // Handle can lower the sheet without rewinding the current chapter position.
  const beforeHandle=m.top;await gesture('.vc-catalog-handle',-160);m=await metrics();assert(m.height>150);assert(Math.abs(m.top-beforeHandle)<1);await page.screenshot({path:path.join(out,'pulled-down.png')});
  await page.locator('.vc-catalog-handle').click();await settle();assert((await metrics()).height<1);
  await page.evaluate(()=>{document.getElementById('catalog-scroll').scrollTop=65;});await gesture('#catalog-scroll',-240);m=await metrics();assert(m.top<1);assert(m.height>150,'same downward gesture crosses list top and lowers sheet');
  // A tap still opens a chapter, and a drag never activates its starting row.
  assert.equal(await page.locator('.vc-modal-overlay').count(),0);await click('read:'+book.chapters[0].id);await page.locator('[data-act="readraw"]').waitFor();await click('closeunmade');await settle();
  await page.locator('.vc-catalog-handle').focus();await page.keyboard.press('ArrowUp');await settle();assert((await metrics()).height<1);await page.keyboard.press('ArrowDown');await settle();assert((await metrics()).height>150);
  // Wheel input shares the exact same ordering and can cross old chapter groups.
  let box=await page.locator('#catalog-scroll').boundingBox();await page.mouse.move(box.x+100,box.y+80);await page.mouse.wheel(0,700);await settle();assert((await metrics()).height<1);assert((await metrics()).top>100);
  for(let i=0;i<7;i++){await page.mouse.wheel(0,700);await page.waitForTimeout(40);}await settle();
  const indexes=await page.locator('[data-chapter-id]').evaluateAll(rows=>rows.map(el=>Number(el.querySelector('.vc-num').textContent)));
  assert(indexes.length>50,'touch-compatible scroll still loads more than fifty chapters');assert(indexes.every((n,i)=>!i||n===indexes[i-1]+1),'long catalog retains continuous chapter order');
  await click('openepisodes');await click('setchpage:3');await settle();const anchor=await metrics();assert(anchor.first!==book.chapters[0].id);
  await page.evaluate(()=>{document.getElementById('catalog-scroll').scrollTop=40;});await gesture('#catalog-scroll',-150);m=await metrics();assert(m.height<1,'virtual window boundary is not the true chapter-list top');assert.notEqual(m.first,anchor.first,'preceding chapter window is prepended');
  const position=await metrics();await page.evaluate(()=>{window.bajiaoEngine.state.books[0].author='后台刷新';window.renderApp();});await settle();m=await metrics();assert(m.height<1);assert(Math.abs(m.top-position.top)<2,'background update preserves expanded position');
  await click('multiselect');assert.equal(await page.locator('.vc-catalog-handle').count(),0);assert(await page.locator('#catalog-scroll').evaluate(el=>el.clientHeight>300));await click('multiselect');await settle();assert((await metrics()).height<1);
  // Small and large screens, resize, theme, short list, and reduced motion.
  for(const [width,height] of [[320,640],[873,393],[768,873],[393,873]]){await page.setViewportSize({width,height});await settle();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert((await metrics()).height<1);assert((await metrics()).listHeight>96);}
  await page.setViewportSize({width:873,height:393});await page.locator('.vc-catalog-handle').click();await settle();assert((await metrics()).listHeight>=95,'landscape keeps chapters accessible even with book info visible');await page.locator('.vc-catalog-handle').click();await settle();await page.setViewportSize({width:393,height:873});await settle();
  await page.evaluate(()=>{window.bajiaoEngine.state.settings.readerTheme='dark';window.renderApp();});await settle();await page.screenshot({path:path.join(out,'expanded-dark.png')});
  await page.emulateMedia({reducedMotion:'reduce'});await page.locator('.vc-catalog-handle').click();await settle();assert((await metrics()).height>150);
  await click('go:shelf');await click('book:'+book.id);await settle();assert((await metrics()).height>150,'reentering book begins with its information visible');
  await page.evaluate(()=>{window.bajiaoEngine.state.books[0].chapters=window.bajiaoEngine.state.books[0].chapters.slice(0,2);window.renderApp();});await settle();await gesture('#catalog-scroll',120);assert((await metrics()).height<1);await gesture('#catalog-scroll',-160);assert((await metrics()).height>150,'short catalogs can also expand and lower');
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({passed:true,errors,checks:['touch sheet first / chapters second','same gesture returns through true list top','handle independent of current chapter','background refresh deferred during drag','tap versus drag','keyboard and wheel','virtual window prepend','management mode','320/393/768px resize','dark and reduced motion','short list']},null,2));console.log('PASS catalog sheet touch, handle, scroll handoff, refresh, virtualization, keyboard and responsive layout');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

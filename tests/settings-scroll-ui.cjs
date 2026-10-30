// Exercise the shipped UI with a visible mini player; all model calls are forbidden.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/xiagu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const V=require('../app/src/main/assets/core.js');
(async()=>{
 const root=path.resolve('app/src/main/assets'),out=path.resolve('artifacts/settings-scroll');fs.mkdirSync(out,{recursive:true});
 const seed=new V.Engine({saveState:async()=>{}}),book=await seed.addBook('滚动检查','第一章\n已经制作完成的正文。'),chapter=book.chapters[0];
 Object.assign(seed.state.settings,{llmBase:'https://saved.example/v1',llmModel:'saved-model',autoProduceUpcoming:false});
 Object.assign(chapter,{audio:'chapter.wav',duration:120,status:'ready',segments:[{id:0,text:chapter.text,speaker:'旁白',confidence:1,audio:'line.wav',durMs:120000}]});
 let state=JSON.parse(JSON.stringify(seed.state)),playback={playing:false,position:0};const chapters=new Map([[chapter.id,chapter]]),errors=[],modelCalls=[],checks=[];
 const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return res.writeHead(404).end();res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:393,height:873}});page.setDefaultTimeout(8000);page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.exposeFunction('fixtureNative',async(id,action,payload)=>{
   const p=JSON.parse(payload||'{}');let result=true,error=null;
   if(action==='load')result={state:JSON.parse(JSON.stringify(state)),llmConfigured:false,ttsConfigured:false};
   else if(action==='saveSnapshot'){for(const c of JSON.parse(p.chapters))chapters.set(c.id,c);state=JSON.parse(p.header);for(const b of state.books)b.chapters=b.chapters.map(c=>({...chapters.get(c.id),...c}));}
   else if(action==='loadChapter')result=chapters.get(p.id);
   else if(action==='networkState')result='wifi';
   else if(action==='playbackState')result=playback;
   else if(action==='play')playback={...p,playing:true,position:0};
   else if(action==='playback'&&p.op==='pause')playback.playing=false;
   else if(action==='audioDurations')result=Object.fromEntries(p.ids.map(id=>[id,120000]));
   else if(action==='request'||action==='testModelConfiguration'){modelCalls.push(action);error={message:'Model calls are forbidden in layout tests',retryable:false};}
   if(!page.isClosed())await page.evaluate(value=>window.nativeResult(value),{id,result:error?null:result,error});
  });
  await page.addInitScript(()=>{window.Native={call:(...args)=>window.fixtureNative(...args)};});
  const act=action=>page.locator('[data-act="'+action+'"]').first().click();
  const bottom=async()=>{await page.evaluate(()=>window.scrollTo({top:document.scrollingElement.scrollHeight,behavior:'instant'}));await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));};
  const geometry=()=>page.evaluate(()=>{
   const main=document.querySelector('main'),save=document.querySelector('.settings-save'),mini=document.querySelector('.vc-mini-player'),nav=document.querySelector('.vc-nav');
   const candidates=[...document.querySelector('.settings-fields').children].filter(el=>el.getBoundingClientRect().height>0),last=candidates.at(-1),box=last.getBoundingClientRect(),saveBox=save.getBoundingClientRect();
   const x=box.left+box.width/2,y=box.top+box.height/2;
   return {route:main.dataset.page,scrollY,scrollHeight:document.scrollingElement.scrollHeight,viewport:innerHeight,padding:parseFloat(getComputedStyle(main).paddingBottom),lastBottom:box.bottom,saveTop:saveBox.top,saveBottom:saveBox.bottom,miniTop:mini.getBoundingClientRect().top,navTop:nav.getBoundingClientRect().top,miniBottom:mini.getBoundingClientRect().bottom,lastHit:last.contains(document.elementFromPoint(x,y)),overflow:document.documentElement.scrollWidth>innerWidth};
  });
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.bajiaoEngine);
  await act('book:'+book.id);await act('read:'+chapter.id);await page.locator('main[data-page="listen"]').waitFor();await act('playchapter');await act('back');await act('go:settings');await page.locator('.vc-mini-player').waitFor();
  for(const size of [{width:320,height:640},{width:393,height:873},{width:768,height:700},{width:873,height:393}]){
   await page.setViewportSize(size);
   for(const route of Object.keys(V.Settings.PAGE_KEYS)){
    await act('go:'+route);await page.locator('main[data-page="'+route+'"].settings-main.with-mini-player').waitFor();
    if(await page.locator('.settings-advanced summary').count())await page.locator('.settings-advanced summary').click();
    await bottom();const box=await geometry();checks.push({...size,...box});
    if(route==='llm')await page.screenshot({path:path.join(out,'llm-'+size.width+'.png'),animations:'disabled'});
    assert(!box.overflow,route+' must fit the viewport');
    assert(box.lastBottom+8<=box.saveTop,route+' '+size.width+': bottom content is covered by Save at maximum scroll: '+JSON.stringify(box));
    assert(box.lastHit,route+': bottom content must be reachable by touch');
    assert(box.saveBottom<=box.miniTop&&box.miniBottom<=box.navTop+1,route+': Save, mini player and navigation must not overlap');
    await act('back');
   }
  }
  assert.deepEqual(errors,[]);assert.deepEqual(modelCalls,[]);
  fs.writeFileSync(path.join(out,'ui-report.json'),JSON.stringify({passed:true,cases:checks.length,checks,errors,modelCalls:0},null,2));console.log('PASS '+checks.length+' bottom-scroll checks across all ten settings pages, phone/tablet/landscape, with a visible mini player');
 }catch(error){await page.screenshot({path:path.join(out,'failure.png'),animations:'disabled'});throw error;}
 finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

// Batch management with a realistic long library; native storage stays in this fixture.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/xiagu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const V=require('../app/src/main/assets/core.js');
(async()=>{
 const assets=path.resolve('app/src/main/assets'),out=path.resolve('artifacts/voice-library-edit');fs.mkdirSync(out,{recursive:true});
 const engine=new V.Engine({saveState:async()=>{}}),names=['奶声奶气女性','清澈青年女性','自然声音','自然老年男性','自然声音','自然声音'];
 engine.state.voices=Array.from({length:45},(_,i)=>({id:'voice-'+i,name:names[i%names.length],description:['轻柔细腻，带一点稚气','明亮干净，吐字清晰','自然平和，适合日常对白','低沉舒缓，略带沙哑'][i%4],source:i%3?'design':'import',format:'wav',enabled:true,sample:'sample-'+i+'.wav'}));
 const state=JSON.parse(JSON.stringify(engine.state)),errors=[];
 const server=http.createServer((req,res)=>{const f=path.resolve(assets,'.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));if(!f.startsWith(assets+path.sep)||!fs.existsSync(f))return res.writeHead(404).end();res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(f));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:393,height:873},colorScheme:'light'});page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
  await page.exposeFunction('nativeCall',async(id,action)=>{const result=action==='load'?{state,llmConfigured:true,ttsConfigured:true}:action==='playbackState'?{playing:false,position:0}:true;await page.evaluate(v=>window.nativeResult(v),{id,result});});
  await page.addInitScript(()=>{window.Native={call:(...args)=>window.nativeCall(...args)};});await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.bajiaoEngine);
  const act=a=>page.locator('button[data-act="'+a+'"]').first().click(),row=i=>page.locator('[data-act="voicebatchtoggle:voice-'+i+'"]'),shot=name=>page.screenshot({path:path.join(out,name+'.png')});
  const footer=page.locator('.voice-batch-footer'),remove=page.locator('[data-act="voicebatchdelete"]');
  await act('go:voices');await act('voicebatchedit');assert.equal(await row(0).count(),1);assert.equal(await remove.isDisabled(),true);await shot('unselected');
  await row(0).click();assert.equal(await row(0).getAttribute('aria-pressed'),'true');assert.match(await footer.innerText(),/已选 1 项/);assert.equal(await remove.isEnabled(),true);
  await row(1).click();
  const separate=async()=>{const first=await row(0).boundingBox(),second=await row(1).boundingBox();assert(second.y-first.y-first.height>=8,'adjacent selected backgrounds retain an 8px gap');};
  await separate();await shot('selected');await row(2).click();await shot('three-selected');await row(2).click();await row(1).click();assert.equal(await row(1).getAttribute('aria-pressed'),'false');await row(2).click();await shot('nonadjacent-selected');await row(2).click();
  await row(2).focus();await page.keyboard.press('Space');assert.equal(await row(2).getAttribute('aria-pressed'),'true');assert.equal(await row(2).evaluate(el=>el===document.activeElement),true,'keyboard focus survives selection render');
  await act('voicebatchall');assert.equal(await page.locator('.voice-batch-select[aria-pressed="true"]').count(),45);await separate();await shot('all-selected');await page.setViewportSize({width:320,height:700});await separate();await shot('adjacent-narrow');await page.setViewportSize({width:393,height:873});await page.emulateMedia({colorScheme:'dark'});await separate();await shot('adjacent-dark');await page.emulateMedia({colorScheme:'light'});await act('voicebatchall');assert.equal(await remove.isDisabled(),true);
  await row(44).scrollIntoViewIfNeeded();await row(44).click();assert(await footer.isVisible());assert.equal(await remove.isEnabled(),true);assert(await row(44).evaluate(el=>el.getBoundingClientRect().bottom<=document.querySelector('.voice-batch-footer').getBoundingClientRect().top),'last voice stays above the fixed actions');
  const scroll=await page.evaluate(()=>scrollY);await act('voicebatchdelete');await page.getByRole('dialog').waitFor();await act('uxcancel');assert.equal(await page.evaluate(()=>window.bajiaoEngine.state.voices.length),45);assert.equal(await row(44).getAttribute('aria-pressed'),'true');assert(Math.abs((await page.evaluate(()=>scrollY))-scroll)<2,'cancel preserves selection and list position');
  await act('voicebatchdelete');await act('uxconfirm');await page.waitForFunction(()=>window.bajiaoEngine.state.voices.length===44);assert.equal(await footer.count(),0);assert.equal(await page.locator('.voice-batch-row').count(),0);
  await page.evaluate(()=>scrollTo(0,0));await act('voicebatchedit');await row(0).click();
  for(const width of [320,393,768]){
   await page.setViewportSize({width,height:873});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.waitForFunction(()=>{const f=document.querySelector('.voice-batch-footer').getBoundingClientRect(),n=document.querySelector('.vc-nav').getBoundingClientRect();return f.bottom<=n.top+1;});
   const f=await footer.boundingBox(),n=await page.locator('.vc-nav').boundingBox();assert(f.y+f.height<=n.y+1,'actions sit above navigation '+JSON.stringify({width,f,n}));assert(f.x>=0&&f.x+f.width<=width+1);
  }
  await page.setViewportSize({width:320,height:700});await page.evaluate(()=>{window.bajiaoEngine.state.voices[0].name='温柔清亮的年轻女性声音，适合长篇叙事与自然对白';window.renderApp();});await shot('narrow-long-name');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.setViewportSize({width:393,height:873});await page.emulateMedia({colorScheme:'dark'});await shot('dark');await page.emulateMedia({colorScheme:'light'});
  // Fixed actions also reserve space for the existing mini player.
  await page.evaluate(()=>{const mini=document.createElement('div');mini.className='vc-mini-player';mini.textContent='播放中';document.querySelector('#screen-content').append(mini);window.dispatchEvent(new Event('resize'));});await page.waitForTimeout(150);
  const f=await footer.boundingBox(),mini=await page.locator('.vc-mini-player').boundingBox();assert(f.y+f.height<=mini.y+1,'batch actions do not overlap the mini player');
  await act('voicebatchedit');assert.equal(await footer.count(),0);await act('voicetab:preset');assert.equal(await page.locator('.voice-batch-row').count(),0);assert.equal(await page.locator('[data-act="voicebatchedit"]').count(),0);
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({passed:true,checks:['45 voice selection and deselection','keyboard focus','all / none','fixed actions and last-row visibility','deletion cancel preserves scroll','confirmed deletion','320/393/768px layout','long names and dark mode','mini-player clearance','read-only presets'],errors},null,2));console.log('PASS voice library edit layout, selection, keyboard, deletion, scroll and player clearance');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

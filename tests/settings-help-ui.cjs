// Render all local help topics with actual app assets; never call model services.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/xiagu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {Engine}=require('../app/src/main/assets/core.js'),{TOPICS}=require('../app/src/main/assets/settings-help.js');
(async()=>{
 const root=path.resolve('app/src/main/assets'),out=path.resolve('artifacts/settings-help');fs.mkdirSync(out,{recursive:true});
 const e=new Engine({saveState:async()=>{}}),b=await e.addBook('帮助阅读检查','第一章\n帮助页不影响听书。'),c=b.chapters[0];e.state.settings.autoProduceUpcoming=false;
 Object.assign(c,{audio:'chapter.wav',duration:20,status:'ready',segments:[{id:0,text:c.text,speaker:'旁白',confidence:1,audio:'line.wav',durMs:20000}]});
 let playback={id:'',playing:false,position:0};const errors=[],checks=[],requests=[];
 const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return res.writeHead(404).end();res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:393,height:873}});page.setDefaultTimeout(8000);page.on('pageerror',error=>errors.push(error.message));
 const act=a=>page.locator('[data-act="'+a+'"]').first().click(),shot=name=>page.screenshot({path:path.join(out,name+'.png'),animations:'disabled'});
 try{
  await page.exposeFunction('helpNative',async(id,action,payload)=>{const p=JSON.parse(payload||'{}');let result=true,error=null;
   if(action==='load')result={state:JSON.parse(JSON.stringify(e.state)),llmConfigured:false,ttsConfigured:false,version:'0.8.34'};
   else if(action==='playbackState')result={...playback};
   else if(action==='play')playback={id:p.id,position:p.position||0,playing:!p.startPaused};
   else if(action==='playback'){if(p.op==='pause')playback.playing=false;if(p.op==='resume')playback.playing=true;}
   else if(action==='networkState')result='wifi';
   else if(action==='audioDurations')result={};
   else if(action==='request'||action==='testModelConfiguration'){requests.push(action);error={message:'Unexpected model call',retryable:false};}
   if(!page.isClosed())await page.evaluate(value=>window.nativeResult(value),{id,result:error?null:result,error});
  });
  await page.addInitScript(()=>{window.Native={call:(...args)=>window.helpNative(...args)};});await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.bajiaoEngine);
  await act('book:'+b.id);await act('read:'+c.id);await act('playchapter');await page.waitForFunction(()=>document.querySelector('#playBtn')?.dataset.playing==='true');await act('back');await act('go:settings');
  for(const [width,height] of [[320,640],[393,873],[768,873],[873,393]]){
   await page.setViewportSize({width,height});
   for(const topic of Object.keys(TOPICS)){
    await act('go:'+topic);await act('settingshelp:'+topic);const dialog=page.getByRole('dialog');await dialog.waitFor();
    assert.equal(await dialog.locator('header h2').innerText(),TOPICS[topic].title);assert(await dialog.locator('.settings-help-content h3').count()>=2);if(topic==='importpolicy'){assert.equal(await dialog.locator('blockquote').count(),1);assert.equal(await dialog.locator('code').count(),2);}else assert(await dialog.locator('.settings-help-content li').count()>=2);assert(await dialog.locator('.settings-help-content p').count()>=2);
    const copy=await dialog.innerText();assert(!/Keystore|Base URL|mimo-v2\.5|PCM|Token|^## |\*\*/m.test(copy),'technical text or raw Markdown in '+topic);
    const geometry=await dialog.evaluate(el=>{const box=e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right};};const body=el.querySelector('.production-dialog-copy');return {dialog:box(el),header:box(el.querySelector('header')),close:box(el.querySelector('[data-result="close"]')),body:box(body),scrollable:body.scrollHeight>body.clientHeight,overflow:el.scrollWidth>el.clientWidth,documentOverflow:document.documentElement.scrollWidth>innerWidth};});
    assert(geometry.dialog.top>=0&&geometry.dialog.bottom<=height+1,topic+' outside viewport');assert(geometry.close.bottom<=height&&geometry.close.top>=geometry.body.bottom-1,topic+' close hidden');assert(!geometry.overflow&&!geometry.documentOverflow,topic+' overflow');
    await dialog.locator('.production-dialog-copy').evaluate(el=>el.scrollTop=el.scrollHeight);if(geometry.scrollable)assert(await dialog.locator('.production-dialog-copy').evaluate(el=>el.scrollTop+el.clientHeight>=el.scrollHeight-2));
    if(topic==='quality'||width===393&&['llm','voicepolicy'].includes(topic)){await dialog.locator('.production-dialog-copy').evaluate(el=>el.scrollTop=0);await shot(topic+'-'+width);}
    checks.push({topic,width,height,scrollable:geometry.scrollable});await dialog.locator('[data-result="close"]').click();assert.equal(await page.locator('main').getAttribute('data-page'),topic);assert.equal(await page.locator('[data-act="settingshelp:'+topic+'"]').evaluate(el=>document.activeElement===el),true);
    await act('back');
   }
  }
  await page.setViewportSize({width:393,height:873});await act('go:quality');await page.locator('#productionLlmRetries').fill('8');await act('settingshelp:quality');await page.getByRole('dialog').waitFor();await page.evaluate(()=>bajiaoEngine.persist());assert.equal(await page.getByRole('dialog').count(),1);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#productionLlmRetries').inputValue(),'8');assert.equal(await page.evaluate(()=>bajiaoEngine.state.settings.llmRetries),3);assert.equal(await page.locator('[data-act="settingssave"]').isDisabled(),false);
  await act('settingshelp:quality');await page.getByRole('dialog').waitFor();await page.evaluate(()=>window.appBack());assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await page.locator('#productionLlmRetries').inputValue(),'8');
  await act('settingshelp:quality');await page.getByRole('dialog').waitFor();await page.keyboard.press('Tab');assert.equal(await page.locator('.production-dialog-copy').evaluate(el=>document.activeElement===el),true);await page.keyboard.press('Tab');assert.equal(await page.locator('[data-result="close"]').evaluate(el=>document.activeElement===el),true);await page.keyboard.press('Tab');assert.equal(await page.locator('.settings-help-dialog header button').evaluate(el=>document.activeElement===el),true);await page.keyboard.press('Escape');
  await page.locator('#productionLlmRetries').fill('3');await act('back');await act('settingshelp:all');assert.equal(await page.locator('[data-help-topic]').count(),10);assert.equal(await page.locator('[data-help-topic][open]').count(),0);await shot('help-index');
  await page.locator('[data-help-topic="quality"] summary').click();await page.waitForFunction(()=>document.querySelector('[data-help-topic="quality"]')?.open);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));await page.evaluate(()=>bajiaoEngine.persist());assert.equal(await page.locator('[data-help-topic="quality"]').evaluate(el=>el.open),true);assert.match(await page.locator('[data-help-topic="quality"] .settings-help-content').innerText(),/共最多尝试 3 次/);await shot('help-index-open');
  assert.match(await page.locator('.settings-version').innerText(),/0\.8\.34/);assert.equal(playback.playing,true);assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'ui-report.json'),JSON.stringify({passed:true,layoutCases:checks.length,checks,unsavedDraftPreserved:true,androidBack:true,keyboardFocus:true,indexStatePreserved:true,playbackPreserved:true,modelCalls:0,errors},null,2));console.log('PASS '+checks.length+' help layouts; Markdown blocks, drafts, focus, Back, topic index and playback');
 }catch(error){await shot('failure');throw error;}finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

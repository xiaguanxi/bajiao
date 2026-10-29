// Real application assets and controlled model failures; no paid model calls.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/xiagu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const V=require('../app/src/main/assets/core.js');
(async()=>{
 const assets=path.resolve('app/src/main/assets'),out=path.resolve('artifacts/request-retries');fs.mkdirSync(out,{recursive:true});
 let state=V.makeState();state.settings.autoProduceUpcoming=false;const errors=[],checks=[];
 const server=http.createServer((req,res)=>{const file=path.resolve(assets,'.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));if(!file.startsWith(assets+path.sep)||!fs.existsSync(file))return res.writeHead(404).end();res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:393,height:873}});page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
 await page.exposeFunction('nativeCall',async(id,action,payload)=>{const p=JSON.parse(payload||'{}');let result=true;
  if(action==='load')result={state:structuredClone(state),llmConfigured:true,ttsConfigured:true};
  else if(action==='saveSnapshot'){const chapters=new Map(state.books.flatMap(b=>b.chapters).map(c=>[c.id,c]));for(const c of JSON.parse(p.chapters))chapters.set(c.id,c);state=JSON.parse(p.header);for(const b of state.books)b.chapters=b.chapters.map(c=>chapters.get(c.id)||c);}
  else if(action==='saveState')state=JSON.parse(p.text);
  else if(action==='loadChapter')result=state.books.flatMap(b=>b.chapters).find(c=>c.id===p.id);
  else if(action==='networkState')result='wifi';
  else if(action==='playbackState')result={playing:false,position:0};
  else if(action==='request')throw Error('Unexpected real model request');
  if(!page.isClosed())await page.evaluate(value=>window.nativeResult(value),{id,result});
 });
 await page.addInitScript(()=>{window.Native={call:(...args)=>window.nativeCall(...args)};});
 const act=a=>page.locator('button[data-act="'+a+'"]').first().click(),shot=name=>page.screenshot({path:path.join(out,name+'.png'),animations:'disabled'});
 try{
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.bajiaoEngine);
  await act('go:settings');await act('go:quality');assert.equal(await page.locator('#productionRetries').inputValue(),'3');assert.equal(await page.locator('[data-dd="retries"]').count(),0);
  for(const value of ['','-1','1.5','1e2','文字','Infinity','9007199254740993']){
   await page.locator('#productionRetries').fill(value);await act('settingssave');
   assert.match(await page.locator('#error-productionRetries').textContent(),/非负整数/);assert.equal(await page.evaluate(()=>window.bajiaoEngine.state.settings.retries),3);
   assert.equal(await page.locator('#productionRetries').getAttribute('aria-invalid'),'true');
  }
  for(const value of ['0','12','3']){
   await page.locator('#productionRetries').fill(value);assert.equal(await page.evaluate(()=>window.bajiaoEngine.state.settings.retries),3,'draft has no effect until save');
   if(value==='3')assert(await page.locator('[data-act="settingssave"]').isDisabled(),'unchanged draft cannot save');else await act('settingssave');assert.equal(await page.evaluate(()=>window.bajiaoEngine.state.settings.retries),Number(value));
   if(value!=='3'){await page.locator('#productionRetries').fill('3');await act('settingssave');}
  }
  await page.locator('#productionRetries').fill('8');await act('settingspick:qualityMode');await page.locator('.settings-picker').getByRole('button',{name:'人工处理',exact:true}).click();assert.equal(await page.locator('#productionRetries').inputValue(),'8');await act('back');await page.getByRole('dialog').waitFor();await page.locator('[data-result="discard"]').click();
  assert.equal(await page.evaluate(()=>window.bajiaoEngine.state.settings.retries),3);checks.push('default 3; invalid values rejected; 0 and counts above 3 saved; unsaved input survives rendering and discard');
  await act('go:quality');await page.locator('#productionRetries').fill('7');await act('settingssave');await page.reload();await page.waitForFunction(()=>window.bajiaoEngine);await act('go:settings');await act('go:quality');assert.equal(await page.locator('#productionRetries').inputValue(),'7');
  for(const width of [320,393,768]){await page.setViewportSize({width,height:873});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await shot('settings-'+width);}
  await page.locator('#productionRetries').fill('3');await act('settingssave');await act('back');await act('go:tasks');
  await page.evaluate(async()=>{
   const e=window.bajiaoEngine,b=await e.addBook('调用失败提示测试','甲。乙。'),c=b.chapters[0];c.segments=Bajiao.units(c.text).map(s=>({...s,speaker:'旁白',confidence:1}));c.segments[0].audio='saved.wav';e.touch(c);e.state.settings.ttsParallel=1;
   window.retryCalls=0;window.retryFail=true;window.retryWaits=[];
   e.io.request=async()=>{window.retryCalls++;if(window.retryFail)throw new Bajiao.ApiError('模拟请求超时',408,true);return {};};
   e.io.sleep=()=>new Promise(resolve=>window.retryWaits.push(resolve));e.io.mergeAudio=async()=>({id:'merged.wav',duration:2});
   e.synthesize=async function(){await this.request('tts',{model:'test'});return {id:'new.wav',duration:1};};
   window.retryJob=e.enqueue(b.id,[c.id]);
  });
  for(let count=1;count<=3;count++){
   await page.waitForFunction(n=>window.retryCalls===n&&window.retryWaits.length>0,count);
   assert.equal(await page.locator('[data-task-retry]').textContent(),`制作失败，正在第${count}次重试。`);
   if(count===2){for(const width of [320,393,768]){await page.setViewportSize({width,height:873});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await shot('retrying-'+width);}}
   await page.evaluate(()=>window.retryWaits.shift()());
  }
  await page.waitForFunction(()=>window.bajiaoEngine.state.tasks[0].status==='failed');assert.equal(await page.locator('[data-task-retry]').textContent(),'重试3次后仍然失败，请手动处理。');assert.match(await page.locator('.vc-task-error').textContent(),/超时/);
  assert.equal(await page.evaluate(()=>window.retryCalls),4);assert.equal(await page.evaluate(()=>window.bajiaoEngine._productionRetryTimer),null);
  for(const width of [320,393,768]){await page.setViewportSize({width,height:873});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await shot('failed-'+width);}
  checks.push('real retry loop displays attempts 1/2/3 on the card, then fails after exactly 4 requests; all card messages fit 320/393/768 widths');
  await page.reload();await page.waitForFunction(()=>window.bajiaoEngine);assert.equal(await page.evaluate(()=>window.bajiaoEngine.state.tasks[0].status),'failed');await act('go:tasks');await act('tasktab:failed');assert.equal(await page.locator('[data-task-retry]').textContent(),'重试3次后仍然失败，请手动处理。');
  await page.evaluate(()=>{const e=window.bajiaoEngine;window.retryCalls=0;e.io.request=async()=>{window.retryCalls++;return {};};e.io.mergeAudio=async()=>({id:'merged.wav',duration:2});e.synthesize=async function(){await this.request('tts',{model:'test'});return {id:'new.wav',duration:1};};});
  const id=await page.evaluate(()=>window.bajiaoEngine.state.tasks[0].id);await act('resume:'+id);await page.waitForFunction(()=>window.bajiaoEngine.state.tasks[0].status==='done');await act('tasktab:done');assert.equal(await page.evaluate(()=>window.retryCalls),1);assert.equal(await page.evaluate(()=>window.bajiaoEngine.state.books[0].chapters[0].segments[0].audio),'saved.wav');assert(!/重试|失败/.test(await page.locator('.vc-task-card-header').innerText()));
  checks.push('exhaustion survives restart; manual resume succeeds with one request and preserves completed audio');assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'ui-report.json'),JSON.stringify({passed:true,checks,errors,paidRequests:0},null,2));console.log(JSON.stringify({passed:true,checks},null,2));
 }catch(error){await shot('failure');throw error;}finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

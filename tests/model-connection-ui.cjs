// Actual frontend with a controlled native bridge. No external model requests.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const V=require('../app/src/main/assets/core.js');
(async()=>{
 const root=path.resolve('app/src/main/assets'),out=path.resolve('artifacts/model-connection');fs.mkdirSync(out,{recursive:true});
 const seed=new V.Engine({saveState:async()=>{}});Object.assign(seed.state.settings,{llmBase:'https://gateway.example/v1',llmModel:'legacy-model',autoCheckUpdates:false,llmRetries:0});
 let state=JSON.parse(JSON.stringify(seed.state)),key='saved-key',headers=[{name:'X-Client',value:'saved-header-secret'}],failSave=false,failList=false,holdList=false,releaseList;
 const calls=[],errors=[],checks=[],copy=value=>JSON.parse(JSON.stringify(value));
 const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return res.writeHead(404).end();res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL||'msedge',headless:true}),page=await browser.newPage({viewport:{width:393,height:873}});page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.exposeFunction('fixtureNative',async(id,action,payload)=>{
   const p=JSON.parse(payload||'{}');calls.push({action,p});let result=true,error=null;
   try{
    if(action==='load')result={state:copy(state),llmConfigured:!!key||!!headers.length,llmKeyConfigured:!!key,llmHeaders:copy(headers),ttsConfigured:false,version:'development'};
    else if(action==='saveSnapshot')state=JSON.parse(p.header);
    else if(action==='networkState')result={type:'wifi'};
    else if(action==='playbackState')result={playing:false,position:0};
    else if(action==='saveModelConfiguration'){
     if(failSave)throw Error('模拟保存失败');Object.assign(state.settings,p.patch);
     if(p.credential.operation==='replace')key=p.credential.key;if(p.credential.operation==='clear')key='';
     if(p.credential.headers)headers=copy(p.credential.headers);
     result={llmConfigured:!!key||!!headers.length,llmKeyConfigured:!!key,llmHeaders:copy(headers),ttsConfigured:false};
    }else if(action==='listModels'){
     if(holdList)await new Promise(r=>releaseList=r);if(failList)throw Error('HTTP 404');result=['auto-model','auto-model','second-model'];
    }else if(action==='testModelConfiguration'){
     if(p.settings.llmProtocol==='responses')result={status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{"ok":true}'}]}]};
     else if(p.settings.llmProtocol==='anthropic')result={content:[{type:'text',text:'{"ok":true}'}],stop_reason:'end_turn'};
     else result={choices:[{message:{content:'{"ok":true}'},finish_reason:'stop'}]};
    }else if(action==='request')throw Error('Unexpected external request');
   }catch(e){error={message:e.message,status:0,retryable:false};}
   if(!page.isClosed())await page.evaluate(value=>window.nativeResult(value),{id,result:error?null:result,error});
  });
  await page.addInitScript(()=>{window.Native={call:(...args)=>window.fixtureNative(...args)};});
  const act=a=>page.locator('[data-act="'+a+'"]').first().click();
  const open=async()=>{await act('go:settings');await act('go:llm');await page.locator('#llmBase').waitFor();};
  const choose=async(key,label)=>{await act('settingspick:'+key);await page.locator('.settings-picker').getByRole('button',{name:label,exact:true}).click();};
  const save=async()=>{await act('settingssave');await page.waitForFunction(()=>document.querySelector('[data-act="settingssave"]')?.disabled);};
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.bajiaoEngine);await open();
  assert.equal(await page.locator('#llmModel').inputValue(),'legacy-model');assert.equal(await page.locator('.settings-model-row').count(),1);
  assert.equal(await page.locator('#settings-header-value-0').inputValue(),'saved-header-secret');assert.equal(await page.locator('#settings-header-value-0').getAttribute('type'),'password');
  await page.locator('#setting-llmProviderName').fill('自定义网关');await act('settingsheaderadd');
  await page.locator('#settings-header-name-1').fill('x-client');await page.locator('#settings-header-value-1').fill('duplicate');
  const writes=calls.filter(c=>c.action==='saveModelConfiguration').length;await act('settingssave');assert.match(await page.locator('#error-setting-headers').innerText(),/不能重复/);assert.equal(calls.filter(c=>c.action==='saveModelConfiguration').length,writes);
  await page.locator('#settings-header-name-1').fill('Authorization');await page.locator('#settings-header-value-1').fill('Bearer draft-header-secret');
  await act('settingstest');await page.getByText('测试成功',{exact:true}).waitFor();let test=calls.filter(c=>c.action==='testModelConfiguration').at(-1);
  assert.equal(test.p.credential.headers[1].value,'Bearer draft-header-secret');assert.equal(headers.length,1);assert(!JSON.stringify(state).includes('header-secret'));
  await page.locator('#settings-header-value-1').fill('Bearer modified-header-secret');assert.match(await page.locator('.settings-test-result').innerText(),/重新测试/);
  await act('settingskeyvisibility');assert.equal(await page.locator('#settings-header-value-1').getAttribute('type'),'text');await act('settingskeyvisibility');
  checks.push('legacy migration, encrypted-header draft isolation, validation, header visibility and stale connection tests');

  await page.locator('#llmModel').fill('');await act('settingsmodelfetch');await page.locator('.settings-picker').getByRole('button',{name:'auto-model',exact:true}).click();
  assert.equal(await page.locator('#llmModel').inputValue(),'auto-model');assert.equal(calls.filter(c=>c.action==='listModels').at(-1).p.settings.llmModel,'');assert.equal(calls.filter(c=>c.action==='listModels').at(-1).p.credential.headers[1].value,'Bearer modified-header-secret');
  assert.equal(state.settings.llmModel,'legacy-model');
  await act('settingsmodeladd');await page.locator('#settings-new-model').fill('manual-model');await act('settingsmodelconfirm');assert.equal(await page.locator('.settings-model-row').count(),3);
  await act('settingsmodeladd');await page.locator('#settings-new-model').fill('manual-model');await act('settingsmodelconfirm');assert.equal(await page.locator('.settings-model-row').count(),3);
  await act('settingsmodelselect:2');assert.equal(await page.locator('#llmModel').inputValue(),'manual-model');await act('settingsmodelremove:2');assert.equal(await page.locator('#llmModel').inputValue(),'legacy-model');
  failList=true;await act('settingsmodelfetch');await page.getByText('HTTP 404；可手动添加模型。',{exact:true}).waitFor();assert.equal(await page.locator('.settings-picker').count(),0);failList=false;
  holdList=true;await act('settingsmodelfetch');await page.waitForFunction(()=>document.querySelector('[data-act="settingsmodelfetch"]')?.disabled);while(!releaseList)await new Promise(r=>setTimeout(r,10));await page.locator('#setting-llmProviderName').fill('修改中的网关');holdList=false;releaseList();await page.getByText('配置已修改，请重新获取模型。',{exact:true}).waitFor();assert.equal(await page.locator('.settings-picker').count(),0);
  checks.push('model discovery without an ID, manual add/dedup/select/delete, failed and stale fetch handling');

  for(const [protocol,label] of [['responses','OpenAI Responses'],['anthropic','Anthropic Messages'],['openai','OpenAI Chat Completions']]){
   await choose('llmProtocol',label);await act('settingstest');await page.getByText('测试成功',{exact:true}).waitFor();test=calls.filter(c=>c.action==='testModelConfiguration').at(-1);assert.equal(test.p.settings.llmProtocol,protocol);
   if(protocol==='responses'){assert.equal(test.p.body.store,false);assert(test.p.body.input);assert(!test.p.body.messages);}else if(protocol==='anthropic')assert(test.p.body.system);else assert(test.p.body.messages.some(m=>m.role==='system'));
  }
  failSave=true;await act('settingssave');await page.getByText('模拟保存失败',{exact:true}).waitFor();assert.equal(headers.length,1);assert.equal(await page.locator('#settings-header-value-1').inputValue(),'Bearer modified-header-secret');failSave=false;
  await save();assert.equal(headers.length,2);assert.equal(state.settings.llmProviderName,'修改中的网关');assert(!JSON.stringify(state).includes('header-secret'));assert(!Object.hasOwn(state.settings,'llmHeaders'));
  await page.reload();await page.waitForFunction(()=>window.bajiaoEngine);await open();assert.equal(await page.locator('#settings-header-value-1').inputValue(),'Bearer modified-header-secret');assert.equal(await page.locator('.settings-model-row').count(),2);
  await act('settingsheaderremove:1');await act('back');await page.locator('[data-result="discard"]').click();await act('go:llm');assert.equal(await page.locator('.settings-header-row').count(),2);
  checks.push('all API formats use native test path; failed save retains draft; save/reload and discard preserve header credentials');

  await choose('llmProvider','Anthropic');assert.equal(await page.locator('#llmBase').inputValue(),'https://api.anthropic.com/v1');assert.match(await page.locator('#setting-llmProtocol').innerText(),/Anthropic Messages/);
  await act('settingstest');assert.match(await page.locator('#error-setting-credential').innerText(),/对应密钥/);
  await act('settingskeyclear');await act('settingstest');await page.getByText('测试成功',{exact:true}).waitFor();test=calls.filter(c=>c.action==='testModelConfiguration').at(-1);assert.equal(test.p.credential.operation,'clear');await save();assert.equal(key,'');assert.equal(headers.length,2);
  await choose('llmProvider','其他');await page.locator('#setting-llmProviderName').fill('自定义网关');await save();
  for(const width of [320,393,768]){
   await page.setViewportSize({width,height:873});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow at '+width);
   for(const input of ['#settings-header-name-0','#settings-header-value-1']){await page.locator(input).focus();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const box=await page.locator(input).boundingBox(),footer=await page.locator('.settings-save').boundingBox();assert(box.y+box.height<=footer.y,'focused header is hidden under Save');}
   await page.evaluate(()=>{document.activeElement?.blur();document.querySelector('#toast').style.display='none';scrollTo(0,0);});await page.screenshot({path:path.join(out,'model-'+width+'.png'),fullPage:true,animations:'disabled'});
  }
  assert.deepEqual(errors,[]);assert(!calls.some(c=>c.action==='request'));checks.push('provider presets, explicit header-only authentication, 320/393/768 layout and keyboard focus');
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({passed:true,checks,errors,paidRequests:0},null,2));console.log(JSON.stringify({passed:true,checks,errors},null,2));
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

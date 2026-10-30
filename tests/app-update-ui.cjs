'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const V=require('../app/src/main/assets/core.js');

(async()=>{
 const root=path.resolve('app/src/main/assets'),out=path.resolve('artifacts/app-updates');fs.mkdirSync(out,{recursive:true});
 const version=fs.readFileSync('app/build.gradle','utf8').match(/versionName '([^']+)'/)[1];
 let state=V.makeState(),mode='current',failSave=false,finishCheck=null;state.settings.autoCheckUpdates=false;
 const calls=[],errors=[];
 const next={status:'available',version:'0.8.37',downloadUrl:'https://github.com/xiaguanxi/bajiao/releases/download/v0.8.37/Bajiao-0.8.37.apk',notes:'## 更新内容\n- 改善听书体验。\n- <script>throw Error("unsafe")</script>',prerelease:false,checkedAt:Date.now()};
 const server=http.createServer((request,response)=>{const brand=request.url.split('?')[0]==='/brand-icon.png',file=brand?path.resolve('app/src/main/res/drawable-nodpi/bajiao_icon.png'):path.resolve(root,'.'+(request.url==='/'?'/index.html':request.url.split('?')[0]));if((!brand&&!file.startsWith(root+path.sep))||!fs.existsSync(file))return response.writeHead(404).end();response.setHeader('Content-Type',file.endsWith('.png')?'image/png':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');response.end(fs.readFileSync(file));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:393,height:873},deviceScaleFactor:2});page.setDefaultTimeout(8000);page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
 const act=action=>page.locator(`[data-act="${action}"]`).first().click();
 const openAbout=async()=>{await act('go:settings');await act('go:about');};
 try{
  await page.exposeFunction('updateNative',async(id,action,raw)=>{
   const payload=JSON.parse(raw||'{}');calls.push({action,payload});let result=true,error=null;
   if(action==='load')result={state:JSON.parse(JSON.stringify(state)),version,llmConfigured:false,ttsConfigured:false};
   else if(action==='networkState')result='offline';
   else if(action==='playbackState')result={id:'',playing:false,position:0};
   else if(action==='audioDurations')result={};
   else if(action==='saveSnapshot'||action==='saveState'){if(failSave)error={message:'保存失败',retryable:false};else state=JSON.parse(action==='saveSnapshot'?payload.header:payload.text);}
   else if(action==='checkAppUpdate'){
    if(mode==='hold')await new Promise(resolve=>finishCheck=resolve);
    if(mode==='error')error={message:'网络不可用，请稍后重试。',retryable:false};
    else result=mode==='available'?next:mode==='empty'?{status:'empty',checkedAt:Date.now()}:{status:'current',currentVersion:version,checkedAt:Date.now()};
   }else if(['request','testModelConfiguration'].includes(action))throw Error('Unexpected model request');
   if(!page.isClosed())await page.evaluate(value=>window.nativeResult(value),{id,result:error?null:result,error});
  });
  await page.addInitScript(()=>{window.Native={call:(...args)=>window.updateNative(...args)};});
  await page.goto(origin);await page.waitForFunction(()=>window.bajiaoEngine);await openAbout();
  const toggle=page.getByRole('switch',{name:'自动检查更新'});
  assert.equal(await toggle.getAttribute('aria-checked'),'false');
  mode='hold';await act('settingscheckupdate');await page.waitForFunction(()=>document.querySelector('[data-act="settingscheckupdate"]')?.disabled);
  assert.match(await page.locator('.settings-update-status').innerText(),/正在检查/);
  const before=calls.filter(call=>call.action==='checkAppUpdate').length;
  await page.locator('[data-act="settingscheckupdate"]').evaluate(element=>{element.click();element.click();});
  assert.equal(calls.filter(call=>call.action==='checkAppUpdate').length,before);
  mode='current';finishCheck();await page.waitForFunction(()=>document.querySelector('.settings-update-status').textContent.includes('最新版本'));
  assert.equal(state.settings.autoCheckUpdates,false);
  mode='available';await act('settingscheckupdate');await page.waitForFunction(()=>document.querySelector('[data-act="settingsdownloadupdate"]'));
  assert.match(await page.locator('.settings-update-status').innerText(),/0\.8\.37/);assert.equal(calls.filter(call=>call.action==='openAppUpdate').length,0);
  await page.locator('.settings-update-notes summary').click();assert.equal(await page.locator('.settings-update-notes script').count(),0);assert.match(await page.locator('.settings-update-notes').innerText(),/<script>/);
  await page.screenshot({path:path.join(out,'available-example-393.png'),animations:'disabled'});
  await act('settingsdownloadupdate');assert.deepEqual(calls.find(call=>call.action==='openAppUpdate').payload,{url:next.downloadUrl});
  mode='error';await act('settingscheckupdate');await page.waitForFunction(()=>document.querySelector('.settings-update-status').textContent.includes('网络不可用'));assert.equal(await page.locator('[data-act="settingscheckupdate"]').isDisabled(),false);
  mode='empty';await act('settingscheckupdate');await page.waitForFunction(()=>document.querySelector('.settings-update-status').textContent.includes('暂无已发布'));
  mode='current';await toggle.click();await page.waitForFunction(()=>document.querySelector('[role=switch]').getAttribute('aria-checked')==='true');assert.equal(state.settings.autoCheckUpdates,true);
  await page.waitForFunction(()=>document.querySelector('.settings-update-status').textContent.includes('最新版本'));
  await toggle.click();await page.waitForFunction(()=>document.querySelector('[role=switch]').getAttribute('aria-checked')==='false');assert.equal(state.settings.autoCheckUpdates,false);
  await page.reload();await page.waitForFunction(()=>window.bajiaoEngine);await openAbout();assert.equal(await toggle.getAttribute('aria-checked'),'false');
  failSave=true;await toggle.click();await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('保存失败'));assert.equal(await toggle.getAttribute('aria-checked'),'false');assert.equal(state.settings.autoCheckUpdates,false);failSave=false;
  await act('back');await act('settingshelp:all');assert.equal(await page.locator('.settings-header h2').innerText(),'帮助');assert.equal(await page.locator('[data-help-topic]').count(),10);assert.equal(await page.locator('[role=switch]').count(),0);await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('#toast')).opacity)<.01);await page.screenshot({path:path.join(out,'help-393.png')});
  await act('back');await act('go:about');assert.equal(await page.locator('[data-help-topic]').count(),0);
  for(const [width,height] of [[320,640],[393,873],[768,873],[873,393]]){await page.setViewportSize({width,height});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(out,`about-${width}.png`),animations:'disabled'});}
  // A new launch may notify automatically, but downloading still requires a tap.
  state.settings.autoCheckUpdates=true;mode='available';await page.setViewportSize({width:393,height:873});await page.reload();await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('发现芭蕉'));
  assert.equal(calls.filter(call=>call.action==='openAppUpdate').length,1);
  await openAbout();assert.equal(await toggle.getAttribute('aria-checked'),'true');assert(await page.locator('[data-act="settingsdownloadupdate"]').isVisible());
  assert.equal(page.url(),origin+'/');assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'ui-report.json'),JSON.stringify({passed:true,version,helpAndAboutSeparated:true,manualChecks:true,duplicateClicksPrevented:true,latestAndEmptyDistinct:true,newVersionAndDownload:true,networkRecovery:true,automaticOptOutPersists:true,saveFailureRollsBack:true,automaticNoticeWithoutDownload:true,layouts:4,modelCalls:0,errors},null,2));
  console.log('PASS update UI: split pages, latest/empty/new/error, download, persistence, rollback and automatic notice');
 }catch(error){await page.screenshot({path:path.join(out,'failure.png')});throw error;}
 finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});

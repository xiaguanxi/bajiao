const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/xiagu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const V=require('../app/src/main/assets/core.js');
(async()=>{
 const root=path.resolve('app/src/main/assets'),out=path.resolve('artifacts/chapter-stall');fs.mkdirSync(out,{recursive:true});
 const server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));if(!f.startsWith(root+path.sep)||!fs.existsSync(f))return res.writeHead(404).end();res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(f));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});const report=[];
 try{for(const width of [320,361,412,768]){
  const state=V.makeState();state.settings.autoProduceUpcoming=false;
  const segments=Array.from({length:208},(_,id)=>({id,text:id===155?'“我看见一只蜘蛛。”':id===157?'“仔细看，对，看蜘蛛肚子。”':'已完成的正文。',speaker:id===155?'夏洛特':id===157?'高登':'旁白',emotion:'克制紧张并带一点疑惑',confidence:.95,annotationStatus:'complete',audio:[155,157].includes(id)?null:'keep-'+id+'.wav'}));
  state.books=[{id:'b',name:'还不起学贷的我只好兼职猎魔',chapters:[{id:'c',title:'第一章 隐迹渐现',text:segments.map(s=>s.text).join('\n'),segments,status:'waiting'}],characters:[{name:'旁白',voice:'preset:白桦'},{name:'夏洛特',voice:'preset:冰糖'},{name:'高登',voice:'preset:苏打'}]}];
  state.tasks=[{id:'t',bookId:'b',chapterId:'c',status:'waiting',phase:'等待确认',message:'请确认角色音色或校对说话人后继续制作',done:206,total:208}];
  state.tasks.push({id:'paused',bookId:'b',chapterId:'c',status:'paused',pauseRequested:true});
  const page=await browser.newPage({viewport:{width,height:915}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(8000);
  await page.exposeFunction('nativeCall',async(id,action,payload)=>{let result=true;if(action==='load')result={state,llmConfigured:true,ttsConfigured:true};else if(action==='playbackState')result={playing:false,position:0};else if(action==='networkState')result='wifi';else if(action==='request')throw Error('Unexpected model request');else if(action==='mergeAudio')result={id:'merged.wav',duration:900};await page.evaluate(v=>window.nativeResult(v),{id,result});});
  await page.addInitScript(()=>window.Native={call:(...args)=>window.nativeCall(...args)});await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.bajiaoEngine);
  const click=a=>page.locator('[data-act="'+a+'"]').first().click();await click('go:tasks');await click('tasktab:attention');
  assert.equal(await page.evaluate(()=>bajiaoEngine.state.tasks[1].status),'paused','explicit pause survives app startup');
  const action=page.locator('.vc-task-card-actions [data-act="task:t"]');await action.waitFor();const box=await action.boundingBox();await page.screenshot({path:path.join(out,'tasks-'+width+'.png')});assert(box.width>=72,'confirmation action must fit horizontal text');assert(box.height<=40,'confirmation action must not stack vertically');
  await page.screenshot({path:path.join(out,'tasks-'+width+'.png')});await action.click();await page.locator('[data-act="nextissue"]').waitFor();
  await page.waitForFunction(()=>document.activeElement?.dataset.seg==='155');await page.waitForTimeout(100);
  assert.equal(await page.locator('.vc-production-issue').count(),2);assert.equal(await page.locator('.vc-production-issue-detail [data-act="resume:t"]').count(),2);
  const header=page.locator('.vc-slim-top'),headerBox=await header.boundingBox();assert(headerBox.y>=-1,'automatic positioning must keep the locating control visible');
  await click('nextissue');await page.waitForFunction(()=>document.activeElement?.dataset.seg==='155');await click('nextissue');await page.waitForFunction(()=>document.activeElement?.dataset.seg==='157');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert(!overflow,'no horizontal overflow');await page.screenshot({path:path.join(out,'issues-'+width+'.png')});
  await page.evaluate(()=>{window.__recoveryCalls=[];bajiaoEngine.synthesize=async(text,voice)=>{__recoveryCalls.push({text,voice});return {id:'new-'+voice,duration:2};};});await click('resume:t');
  await page.waitForFunction(()=>bajiaoEngine.state.tasks[0].status==='done');const result=await page.evaluate(()=>({calls:__recoveryCalls,done:bajiaoEngine.state.tasks[0].done,kept:bajiaoEngine.state.books[0].chapters[0].segments.filter(s=>s.audio.startsWith('keep-')).length}));
  assert.equal(result.done,208);assert.equal(result.calls.length,2);assert.equal(result.kept,206);assert.deepEqual(errors,[]);report.push({width,...result,button:box,header:headerBox});await page.close();
 }fs.writeFileSync(path.join(out,'ui-report.json'),JSON.stringify(report,null,2));console.log('PASS 320/361/412/768: horizontal task action, visible issue locator, both missing sentences, resume keeps 206 recordings');}
 finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

// Runs the shipped assets at phone sizes with a local native bridge fixture.
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/xiagu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const V=require('../app/src/main/assets/core.js');
(async()=>{
 const root=path.resolve('app/src/main/assets'),out=path.resolve('artifacts/voice-filters-20261015');fs.mkdirSync(out,{recursive:true});
 const server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));if(!f.startsWith(root+path.sep)||!fs.existsSync(f))return res.writeHead(404).end();res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(f));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const seed=new V.Engine({saveState:async()=>{}}),b=await seed.addBook('测试小说','第1章 待处理\n甲。乙。');b.characters.push({name:'金鹏子',description:'中年男性',voice:'preset:白桦'});
  seed.state.voices=[{id:'imported',name:'导入女声',description:'二十五岁女性',source:'import',sample:'import.wav',format:'wav',enabled:true},{id:'designed',name:'设计男声',description:'五十岁男性',source:'design',sample:'design.wav',format:'wav',enabled:true}];
  const c=b.chapters[0];seed.state.tasks=[{id:'rejected',bookId:b.id,chapterId:c.id,status:'failed',phase:'内容审核未通过',done:0,total:0,message:'input new_sensitive (1026)',error:{code:1026,message:'input new_sensitive (1026)',detail:'input new_sensitive (1026)',provider:'llm',stage:'标注角色',batchStart:1,batchEnd:2,retryable:false}}];
  const page=await browser.newPage({viewport:{width:393,height:873}}),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));let state=seed.state;
  await page.exposeFunction('nativeCall',async(id,action,payload)=>{const p=JSON.parse(payload||'{}');let result=true;
   if(action==='load')result={state,llmConfigured:true,ttsConfigured:true};
   else if(action==='saveSnapshot'){const chapters=new Map(state.books.flatMap(b=>b.chapters).map(c=>[c.id,c]));for(const c of JSON.parse(p.chapters))chapters.set(c.id,c);state=JSON.parse(p.header);for(const b of state.books)b.chapters=b.chapters.map(c=>chapters.get(c.id)||c);}
   else if(action==='saveState')state=JSON.parse(p.text);
   else if(action==='loadChapter')result=state.books.flatMap(b=>b.chapters).find(c=>c.id===p.id);
   else if(action==='playbackState')result={playing:false,position:0};
   else if(action==='request'){requests.push(p);result={choices:[{message:{audio:{data:require('./wav-fixture.cjs')()}}}]};}
   else if(action==='saveAudio'||action==='saveRawAudio')result={id:'preview.wav',duration:2};
   await page.evaluate(v=>window.nativeResult(v),{id,result});
  });
  await page.addInitScript(()=>{window.Native={call:(...args)=>window.nativeCall(...args)};});await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.bajiaoEngine);
  const click=act=>page.locator('[data-act="'+act+'"]').first().click();await click('book:'+b.id);await click('go:roles');await click('chooserole:金鹏子');
  assert.equal(await page.locator('.vc-voice-card').count(),11);assert.equal(await page.locator('.vc-voice-card').first().locator('h3').innerText(),'白桦');assert.equal(await page.locator('[data-act="bind:preset:白桦"]').isDisabled(),true);
  const sizes=[];
  for(const width of [320,360,393,412,768]){
   await page.setViewportSize({width,height:873});
   for(const [id,selected] of [['voiceGender','all'],['voiceAge','young'],['voiceSource','preset']]){
    await page.locator('#'+id).selectOption(selected);
    const fit=await page.locator('#'+id).evaluate(el=>{const style=getComputedStyle(el),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');ctx.font=style.font;const text=el.selectedOptions[0].text;return {text,width:el.clientWidth,needed:ctx.measureText(text).width+parseFloat(style.paddingLeft)+parseFloat(style.paddingRight)+24};});
    assert(fit.width>=fit.needed,JSON.stringify({width,id,...fit}));
    await page.locator('#'+id).selectOption('all');
   }
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'no horizontal overflow at '+width);sizes.push(width);
  }
  await page.setViewportSize({width:393,height:873});await page.screenshot({path:path.join(out,'role-voices.png')});
  await page.locator('#voiceSource').selectOption('preset');assert.equal(await page.locator('.vc-voice-card').count(),9);
  await page.locator('#voiceGender').selectOption('f');assert.equal(await page.locator('.vc-voice-card').count(),4);
  await page.locator('#voiceAge').selectOption('old');assert.equal(await page.locator('.vc-voice-card').count(),0);await click('clearvoicefilters');assert.equal(await page.locator('.vc-voice-card').count(),11);
  await page.locator('#voiceSearch').fill('Chloe');await page.waitForFunction(()=>document.querySelectorAll('.vc-voice-card').length===1);await page.locator('#voiceSearch').fill('');await page.waitForFunction(()=>document.querySelectorAll('.vc-voice-card').length===11);
  await click('preset:茉莉');assert.equal(requests.at(-1).body.audio.voice,'茉莉');assert.equal(requests.at(-1).body.model,'mimo-v2.5-tts');await click('bind:preset:茉莉');await page.waitForFunction(()=>window.bajiaoEngine.state.books[0].characters.find(r=>r.name==='金鹏子').voice==='preset:茉莉');
  await click('chooserole:金鹏子');assert.equal(await page.locator('.vc-voice-card').first().locator('h3').innerText(),'茉莉');await page.locator('#voiceSource').selectOption('preset');await click('go:voices');assert.equal(await page.locator('#voiceSource').inputValue(),'all');
  await click('go:tasks');await click('tasktab:failed');const card=page.locator('[data-act="task:rejected"]').first();assert((await card.innerText()).includes('语言模型内容审核未通过'));assert((await card.innerText()).includes('含上下文'));assert.equal(await card.locator('.vc-task-error').count(),1);
  await card.locator('summary').click();assert((await card.locator('code').innerText()).includes('1026'));await page.screenshot({path:path.join(out,'content-rejection.png')});await card.getByRole('button',{name:'处理标注',exact:true}).click();await page.locator('main[data-page="annotated"] [data-seg]').first().waitFor();assert((await page.locator('main').innerText()).includes('甲。'));
  await page.evaluate(()=>{const e=window.bajiaoEngine,b=e.state.books[0],c=b.chapters[0];c.segments=[{id:0,text:'甲。',speaker:'旁白',confidence:1,qualityStatus:'pending',failReason:'input new_sensitive (1026)'}];e.state.tasks[0].status='waiting';});
  await click('back');await click('tasktab:attention');await click('task:rejected');assert((await page.locator('main').innerText()).includes('语音服务内容审核未通过'));assert.equal(await page.getByText('已自动重试 0 / 1 次',{exact:true}).count(),0);
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({passed:true,widths:sizes,checks:['filter text fits','presets searchable and filterable','bound preset first','preset preview and binding','source filter reset','refusal detail and annotation repair navigation','sentence refusal explanation'],errors},null,2));console.log('PASS voice filters, all nine presets, and content rejection UI');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

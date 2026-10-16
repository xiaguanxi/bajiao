// Exercise the real app assets with a local mock bridge; no external model calls.
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/xiagu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const root=path.resolve('app/src/main/assets'),out=path.resolve('artifacts/task-voice-fixes');fs.mkdirSync(out,{recursive:true});
 const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return res.writeHead(404).end();res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:412,height:915}}),errors=[];page.on('pageerror',e=>errors.push(e.message));let state=null,deletes=0;
  await page.exposeFunction('nativeCall',async(id,action,payload)=>{const p=JSON.parse(payload||'{}');let result=true;
   if(action==='load')result={state,llmConfigured:true,ttsConfigured:true};
   else if(action==='saveState')state=JSON.parse(p.text);
   else if(action==='saveSnapshot'){const chapters=new Map((state?.books||[]).flatMap(b=>b.chapters).map(c=>[c.id,c]));for(const c of JSON.parse(p.chapters))chapters.set(c.id,c);state=JSON.parse(p.header);for(const b of state.books)b.chapters=b.chapters.map(c=>chapters.get(c.id)||c);}
   else if(action==='loadChapter')result=state.books.flatMap(b=>b.chapters).find(c=>c.id===p.id);
   else if(action==='playbackState')result={playing:false,position:0};
   else if(action==='request')result={choices:[{message:{audio:{data:'AA=='}}}]};
   else if(action==='saveAudio')result={id:'new-sample.wav'};
   else if(action==='deleteAudio')deletes++;
   await page.evaluate(v=>window.nativeResult(v),{id,result});
  });
  await page.addInitScript(()=>{window.Native={call:(...args)=>window.nativeCall(...args)};});await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.vocastEngine);
  const click=act=>page.locator('[data-act="'+act+'"]').first().click();
  await click('samplebook');
  await page.evaluate(async()=>{const e=window.vocastEngine,b=e.state.books[0],c=b.chapters[0];c.audio='existing-chapter.wav';c.status='ready';c.segments=[{id:0,text:'甲。',speaker:'旁白',confidence:1,audio:'existing-sentence.wav'}];e.state.tasks=[{id:'finished',bookId:b.id,chapterId:c.id,status:'done',phase:'完成',done:1,total:1}];await e.importVoice({name:'沈砚.wav',description:'沈砚，二十多岁青年男性，宗门弟子，声音开朗清亮',id:'existing-voice.wav',format:'wav',size:100});e.touch(c);await e.persist();});
  await click('go:tasks');await click('tasktab:done');const clear=page.locator('[data-act="removetask:finished"]');assert.equal((await clear.innerText()).trim(),'清除');assert.equal(await clear.locator('[data-lucide="trash-2"]').count(),0);assert.equal(await clear.locator('svg').count(),1);await page.screenshot({path:path.join(out,'completed-tasks.png')});await clear.click();assert.equal(state.tasks.length,0);assert.equal(state.books[0].chapters[0].audio,'existing-chapter.wav');assert.equal(deletes,0);
  await click('go:voices');await page.getByRole('heading',{name:'开朗青年男性',exact:true}).waitFor();assert((await page.locator('main').innerText()).includes('沈砚'));assert((await page.locator('main').innerText()).includes('宗门'));await page.screenshot({path:path.join(out,'voices.png')});
  await click('voice:'+state.voices[0].id);await page.locator('#vdescription').fill('林晚，二十五岁的公主，声音温柔清亮');await click('savevoice');assert.equal(state.voices[0].name,'开朗青年男性');assert.equal(state.voices[0].description,'林晚，二十五岁的公主，声音温柔清亮');assert.equal(state.voices[0].sample,'existing-voice.wav');
  await click('go:voices');await click('newdesign');assert.equal(await page.locator('#designName').count(),0);await page.locator('#designDescription').fill('沈砚，青年男性，掌门继承人，声音沉稳低沉');await click('designsample');await page.locator('[data-act="acceptsample"]').waitFor();assert((await page.locator('main').innerText()).includes('沉稳青年男性'));assert((await page.locator('#designDescription').inputValue()).includes('掌门'));await click('acceptsample');await page.getByRole('heading',{name:'沉稳青年男性',exact:true}).waitFor();
  // The task is genuinely in synthesis while UI pause and continue are clicked.
  await page.evaluate(async()=>{const e=window.vocastEngine,b=e.state.books[0],c=b.chapters[0];c.audio=null;c.segments=[{id:0,text:'甲。',speaker:'旁白',emotion:'自然',confidence:1}];e.state.settings.ttsParallel=1;e.io.mergeAudio=async()=>({id:'resumed-chapter.wav',duration:1});e.synthesize=async()=>{window.synthEntered=true;await new Promise(r=>window.releaseSynth=r);return {id:'resumed-sentence.wav',duration:1};};window.activeRun=e.enqueue(b.id,[c.id]);});
  await page.waitForFunction(()=>window.synthEntered);const taskId=await page.evaluate(()=>window.vocastEngine.state.tasks[0].id);await click('go:tasks');await click('tasktab:active');await click('pause:'+taskId);await page.locator('[data-act="resume:'+taskId+'"]').waitFor();await page.screenshot({path:path.join(out,'pause-pending.png')});await click('resume:'+taskId);await page.waitForFunction(()=>window.vocastEngine.state.tasks[0].resumeRequested);await page.evaluate(()=>window.releaseSynth());await page.waitForFunction(()=>window.vocastEngine.state.tasks[0].status==='done');assert.equal(await page.evaluate(()=>window.vocastEngine.state.books[0].chapters[0].audio),'resumed-chapter.wav');assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({passed:true,checks:['completed card x/clear','clear preserves audio','feature names on voice page','edit sanitizes identity','design uses feature name','UI immediate pause/continue'],errors},null,2));console.log('PASS task and voice UI flows');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

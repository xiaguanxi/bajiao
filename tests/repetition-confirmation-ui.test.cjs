const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/xiagu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const V=require('../app/src/main/assets/core.js'),{wav}=require('./native-speech.cjs'),{waveInfo}=require('./node-io.cjs');
(async()=>{
 const root=path.resolve('app/src/main/assets'),server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));if(!f.startsWith(root+path.sep)||!fs.existsSync(f))return res.writeHead(404).end();res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(f));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:412,height:915}}),errors=[],calls=[],audio=new Map();page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
  const text='宛如白莲宗的悬骰宫一般！',raw=wav([{seed:3,seconds:3},{silence:true,seconds:.6},{seed:3,seconds:3,gain:.8}]),state=V.makeState();state.settings.autoProduceUpcoming=false;state.settings.qualityConfirmRetry=true;
  state.books=[{id:'b',name:'重复朗读确认',characters:[{name:'旁白',voice:'preset:白桦'}],chapters:[{id:'c',title:'第一章 核验',text,segments:[{id:0,text,speaker:'旁白',confidence:1}],status:'annotated'}]}];
  await page.exposeFunction('nativeCall',async(id,action,payload)=>{const p=JSON.parse(payload||'{}');calls.push({action,payload:p});let result=true;
   if(action==='load')result={state,llmConfigured:true,ttsConfigured:true};
   else if(action==='networkState')result='wifi';
   else if(action==='playbackState')result={playing:false,position:0};
   else if(action==='request'){assert.equal(p.provider,'tts');assert.equal(p.body.model,'mimo-v2.5-tts');result={choices:[{finish_reason:'stop',message:{audio:{data:raw.toString('base64')}}}]};}
   else if(action==='saveRawAudio'){const bytes=Buffer.from(p.base64,'base64'),id=crypto.createHash('sha256').update(bytes).digest('hex')+'.wav';audio.set(id,bytes);result={id,size:bytes.length,duration:waveInfo(bytes).duration,playable:true};}
   else if(action==='readAudio')result={base64:audio.get(p.id).toString('base64')};
   else if(action==='truncateRepeatedSpeech'||action==='processSpeechAudio')throw Error('unsafe short gap must never enter cropping or silence processing');
   else if(action==='mergeAudio')result={id:'merged.wav',duration:6.6};
   await page.evaluate(v=>window.nativeResult(v),{id,result});
  });
  await page.addInitScript(()=>window.Native={call:(...args)=>window.nativeCall(...args)});await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.vocastEngine);
  await page.evaluate(()=>window.vocastEngine.enqueue('b',['c']));assert.equal(calls.filter(c=>c.action==='request').length,2);
  const click=act=>page.locator('[data-act="'+act+'"]').first().click();await click('book:b');await click('confirm:c');await click('opensegment:0');
  const button=page.locator('.vc-segment-sheet [data-act="confirmrepetition:0"]');await button.waitFor();assert((await button.innerText()).includes('确认保留'));
  const rawId=await page.evaluate(()=>window.vocastEngine.state.books[0].chapters[0].segments[0].speechDraft.pendingRaw.file.id);await page.locator('.vc-segment-sheet [data-act="play:'+rawId+'"]').click();assert.equal(calls.filter(c=>c.action==='play').at(-1).payload.id,rawId);
  fs.mkdirSync('artifacts/auto-repeat',{recursive:true});await page.screenshot({path:'artifacts/auto-repeat/confirmation.png'});
  await button.click();await page.waitForFunction(()=>window.vocastEngine.state.books[0].chapters[0].segments[0].repetitionConfirmed);
  assert.equal(calls.filter(c=>c.action==='request').length,2);assert.equal(await page.evaluate(()=>window.vocastEngine.state.books[0].chapters[0].audio),'merged.wav');assert.equal(await page.evaluate(()=>window.vocastEngine.state.books[0].chapters[0].segments[0].audio),rawId);assert.deepEqual(errors,[]);
  await page.screenshot({path:'artifacts/auto-repeat/confirmed.png'});console.log('PASS confirmation UI: two attempts, original audition, explicit acceptance, no further request, merged chapter');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

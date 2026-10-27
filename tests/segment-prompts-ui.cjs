// Exercises the real WebView assets with a local native bridge and WAV fixture.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/xiagu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const V=require('../app/src/main/assets/core.js'),audio=require('./wav-fixture.cjs')();
(async()=>{
 const out=path.resolve('artifacts/annotation-reading-redesign'),assets=path.resolve('app/src/main/assets');fs.mkdirSync(out,{recursive:true});
 const engine=new V.Engine({saveState:async()=>{}}),book=await engine.addBook('角色音色与提示词','第一章\n甲低声说：“别走。”乙点了点头。\n第二章\n丙。');engine.state.settings.autoProduceUpcoming=false;engine.state.settings.retries=0;
 engine.state.settings.wifiOnlyProduction=false;book.characters.push({name:'林晚',voice:'preset:白桦',description:'青年女性，清澈自然'});
 const chapter=book.chapters[0];chapter.segments=[{id:0,text:'甲低声说：“别走。山间的风已经停了，远处的灯火也渐渐熄灭。”',speaker:'旁白',confidence:1,emotion:'轻声，不要愤怒',directionVersion:1,scene:'山风停了，甲轻声挽留。',delivery:'轻声，不要愤怒；尾音收住，留出短暂停顿。',audio:'old-a.wav',lastSpeechRequest:{promptVersion:1,prompt:'旧固定朗读宣言',text:'旧的文本',voice:'preset:白桦',audio:'old-a.wav'}},{id:1,text:'乙点了点头。',speaker:'旁白',confidence:1,emotion:'平静叙述',audio:'old-b.wav'},{id:2,text:'（广告）',speaker:'广告',skip:true,audio:'skip'}];chapter.audio='old-chapter.wav';chapter.status='ready';chapter.audioStale=true;
 engine.state.tasks=[{id:'done',bookId:book.id,chapterId:chapter.id,status:'done',done:3,total:3}];
 let state=JSON.parse(JSON.stringify(engine.state)),sequence=0,failNext=false,holdNext=false,release;const calls=[],errors=[];
 const server=http.createServer((req,res)=>{const file=path.resolve(assets,'.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));if(!file.startsWith(assets+path.sep)||!fs.existsSync(file))return res.writeHead(404).end();res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:393,height:873}});page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
  await page.exposeFunction('nativeCall',async(id,action,payload)=>{
   const p=JSON.parse(payload||'{}');calls.push({action,payload:p});let result=true,error;
   if(action==='load')result={state,llmConfigured:true,ttsConfigured:true};
   else if(action==='playbackState')result={playing:false,position:0};
   else if(action==='saveSnapshot'){
    const full=new Map(state.books.flatMap(b=>b.chapters).map(c=>[c.id,c]));for(const c of JSON.parse(p.chapters))full.set(c.id,c);state=JSON.parse(p.header);for(const b of state.books)b.chapters=b.chapters.map(c=>({...full.get(c.id),...c}));
   }else if(action==='request'){
    if(holdNext){holdNext=false;await new Promise(r=>release=r);}
    if(failNext){failNext=false;error={message:'测试服务暂时不可用',status:400,retryable:false};}
    else result={choices:[{finish_reason:'stop',message:{audio:{data:audio}}}]};
   }else if(action==='saveRawAudio')result={id:'sentence-'+(++sequence)+'.wav',duration:2,playable:true};
   else if(action==='processSpeechAudio')result={id:p.id,duration:2,originalDuration:2,supported:true,allSilent:false,allNearSilent:false,longestSilenceMs:0,corrected:false,removedMs:0,trimRanges:[],silenceProcessingVersion:1};
   else if(action==='mergeAudio')result={id:'chapter-'+(++sequence)+'.wav',duration:4};
   else if(action==='loadChapter')result=state.books.flatMap(b=>b.chapters).find(c=>c.id===p.id);
   else if(action==='readAudio')result={base64:audio};
   await page.evaluate(v=>window.nativeResult(v),error?{id,error}:{id,result});
  });
  await page.addInitScript(()=>{window.Native={call:(...args)=>window.nativeCall(...args)};});const url='http://127.0.0.1:'+server.address().port;await page.goto(url);await page.waitForFunction(()=>window.bajiaoEngine);
  const click=act=>page.locator((act==='closesegment'?'button':'')+'[data-act="'+act+'"]').first().click(),requests=()=>calls.filter(c=>c.action==='request');
  await click('book:'+book.id);assert(!(await page.locator('#chapter-list').innerText()).includes('待重制'));
  const before=await page.evaluate(()=>({chapters:JSON.stringify(window.bajiaoEngine.state.books[0].chapters),tasks:JSON.stringify(window.bajiaoEngine.state.tasks)}));
  await click('go:roles');await click('chooserole:旁白');await click('choosetab:preset');await click('choosevoice:preset:茉莉');await page.waitForFunction(()=>window.bajiaoEngine.state.books[0].characters[0].voice==='preset:茉莉');
  assert.deepEqual(await page.evaluate(()=>({chapters:JSON.stringify(window.bajiaoEngine.state.books[0].chapters),tasks:JSON.stringify(window.bajiaoEngine.state.tasks)})),before);assert.equal(requests().length,0);
  await click('go:shelf');await click('book:'+book.id);await click('read:'+chapter.id);await click('go:annotated');
  // Sample every animation frame while unrelated annotation updates rebuild the page.
  const samples=await page.evaluate(async()=>{const e=window.bajiaoEngine,c=e.state.books[0].chapters[0],samples=[];for(let n=0;n<3;n++){c.segments[1].confidence=1-n*.001;window.renderApp();for(let f=0;f<16;f++){const tag=document.querySelector('[data-seg="0"] .vc-tag'),box=tag.getBoundingClientRect();samples.push({w:box.width,h:box.height,font:getComputedStyle(tag).fontSize});await new Promise(requestAnimationFrame);}}return samples;});
  assert(Math.max(...samples.map(s=>s.w))-Math.min(...samples.map(s=>s.w))<.1,'synthesized badges never grow during refresh');assert(Math.max(...samples.map(s=>s.h))-Math.min(...samples.map(s=>s.h))<.1);assert(samples.every(s=>s.font==='11px'));
  for(const width of [320,393]){await page.setViewportSize({width,height:873});const card=page.locator('[data-seg="0"]'),bounds=await card.boundingBox(),trigger=await card.locator('.vc-segment-trigger').boundingBox(),text=await card.locator('.vc-quote-text').boundingBox();assert(bounds.x+bounds.width-trigger.x-trigger.width<8,'ellipsis sits at the top right');assert(trigger.y-bounds.y<8);assert(bounds.x+bounds.width-text.x-text.width<18,'body uses full card width');await page.mouse.move(0,0);await page.screenshot({path:path.join(out,'annotated-'+width+'.png')});}
  assert.equal(await page.locator('.vc-segment-advanced').count(),0);await click('opensegment:0');assert.equal(await page.locator('.vc-segment-advanced').count(),1);assert.equal(await page.locator('.vc-segment-sheet [data-act^="editseg:"],.vc-segment-sheet [data-act^="toggleskip:"]').count(),0);
  const advanced=page.locator('[data-advanced-seg="0"]');await page.locator('#ttsPrompt-0').waitFor();await page.screenshot({animations:'disabled',path:path.join(out,'reading-settings-393.png')});
  const defaultPrompt=await page.locator('#ttsPrompt-0').inputValue();assert.equal(defaultPrompt,V.FAST_SPEECH_PROMPT);assert(!defaultPrompt.includes('旧固定朗读宣言'));assert.equal(await page.locator('[data-act="resetsegprompt:0"]').innerText(),'恢复默认提示词');
  const custom='  轻声缓慢，不要愤怒。\n不添加台词 <参考> & "自然"。  ';await page.locator('#ttsPrompt-0').fill(custom);await page.locator('#ttsPrompt-0').focus();
  assert.equal(await page.locator('[data-act="regenerateprompt:0"]').textContent(),'应用修改并重新合成');await click('segmentpreview:0');assert.equal(calls.filter(c=>c.action==='play').at(-1).payload.id,'old-a.wav');await page.locator('#ttsPrompt-0').focus();
  await page.evaluate(()=>window.bajiaoEngine.persist());assert.equal(await page.locator('#ttsPrompt-0').inputValue(),custom);assert(await advanced.isVisible());assert.equal(await page.evaluate(()=>document.activeElement.id),'ttsPrompt-0');assert.equal(requests().length,0);
  holdNext=true;await click('regenerateprompt:0');await page.waitForFunction(()=>window.bajiaoEngine.segmentBusy(window.bajiaoEngine.state.books[0].id,window.bajiaoEngine.state.books[0].chapters[0].id,0));
  await page.locator('[data-act="regenerateprompt:0"][disabled]').waitFor();assert.equal(await page.locator('#ttsPrompt-0').inputValue(),custom);assert.equal(await page.locator('#ttsPrompt-0').getAttribute('readonly'),'');
  while(!release)await new Promise(r=>setTimeout(r,10));release();await page.waitForFunction(()=>window.bajiaoEngine.state.books[0].chapters[0].segments[0].audio==='sentence-1.wav');
  assert.equal(requests().length,1);assert.deepEqual(requests()[0].payload.body.messages,[{role:'user',content:custom},{role:'assistant',content:chapter.segments[0].text}]);assert.equal(requests()[0].payload.body.audio.voice,'茉莉');
  assert.deepEqual(await page.evaluate(()=>window.bajiaoEngine.state.books[0].chapters[0].segments.map(s=>s.audio)),['sentence-1.wav','old-b.wav','skip']);
  await advanced.locator('.vc-last-prompt>summary').click();assert((await advanced.locator('.vc-last-prompt').innerText()).includes(custom.trim()));
  await advanced.scrollIntoViewIfNeeded();await page.screenshot({animations:'disabled',path:path.join(out,'advanced-393.png'),fullPage:true});
  await page.setViewportSize({width:320,height:760});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({animations:'disabled',path:path.join(out,'advanced-320.png'),fullPage:true});
  const oldChapter=await page.evaluate(()=>window.bajiaoEngine.state.books[0].chapters[0].audio);failNext=true;await page.locator('#ttsPrompt-0').fill('失败后保留原音频');await click('regenerateprompt:0');
  await page.waitForFunction(()=>window.bajiaoEngine.state.books[0].chapters[0].segments[0].retryError);assert.equal(await page.evaluate(()=>window.bajiaoEngine.state.books[0].chapters[0].audio),oldChapter);assert.equal(await page.evaluate(()=>window.bajiaoEngine.state.books[0].chapters[0].segments[0].audio),'sentence-1.wav');assert.equal(requests().length,2);
  await page.reload();await page.waitForFunction(()=>window.bajiaoEngine);await click('book:'+book.id);await click('read:'+chapter.id);await click('go:annotated');await click('opensegment:0');assert.equal(await page.locator('#ttsPrompt-0').inputValue(),'失败后保留原音频');
  await click('resetsegprompt:0');assert.equal(await page.locator('#ttsPrompt-0').inputValue(),defaultPrompt);assert.equal(requests().length,2);await click('regenerateprompt:0');
  await page.waitForFunction(()=>!window.bajiaoEngine.state.books[0].chapters[0].segments[0].retryError&&!window.bajiaoEngine.segmentBusy(window.bajiaoEngine.state.books[0].id,window.bajiaoEngine.state.books[0].chapters[0].id,0));assert.equal(requests().length,3);assert.equal(requests()[2].payload.body.messages[0].content,defaultPrompt);assert.equal(await page.evaluate(()=>window.bajiaoEngine.state.books[0].chapters[0].segments[0].ttsPrompt),undefined);
  await page.evaluate(()=>{window.bajiaoEngine.state.settings.readerTheme='dark';window.renderApp();});await page.mouse.move(0,0);await page.screenshot({animations:'disabled',path:path.join(out,'reading-settings-dark.png')});
  await page.locator('button[data-act="closesegment"]').click();await click('opensegment:2');assert(await page.locator('[data-act="regenerateprompt:2"]').isDisabled());await click('closesegment');
  await page.evaluate(()=>{window.bajiaoEngine.state.settings.readerTheme='system';window.renderApp();});await click('editseg:1');assert.equal(await page.locator('#segmentEmotion').count(),0);assert(!(await page.locator('main').innerText()).includes('本句演绎'));await page.screenshot({path:path.join(out,'speaker-replacement.png')});
  const preserved=await page.evaluate(()=>JSON.stringify(window.bajiaoEngine.state.books[0].chapters[0].segments[0]));await click('dropdown:segSpeaker');await click('pickopt:segSpeaker|林晚');await click('saveseg');const repaired=await page.evaluate(()=>window.bajiaoEngine.state.books[0].chapters[0].segments[1]);assert.equal(repaired.speaker,'林晚');assert.equal(repaired.emotion,'平静叙述');assert.equal(await page.evaluate(()=>JSON.stringify(window.bajiaoEngine.state.books[0].chapters[0].segments[0])),preserved);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'ui-report.json'),JSON.stringify({passed:true,viewports:[393,320],requests:requests().length,checks:['voice binding preserves audio and tasks','no stale catalog badge','fixed status badge dimensions across background refreshes','corner action preserves full paragraph width','visible reading prompt and contextual submit label','role replacement preserves sentence emotion','draft and focus survive background persistence','exact custom prompt and untouched source','only selected sentence replaced','failed regeneration preserves audio','saved prompt survives reload','restore default','skipped sentence disabled'],errors},null,2));
  console.log('PASS voice binding, catalog, advanced sentence prompts, exact TTS payload, isolated replacement, failure recovery, reload, default restore and mobile layout');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

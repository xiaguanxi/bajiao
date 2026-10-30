// Real WebView assets with a controlled native bridge; never contacts a model service.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/xiagu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const V=require('../app/src/main/assets/core.js'),wave=require('./wav-fixture.cjs');
const promptTexts=Object.values(require('../app/src/main/assets/playback-prompts.js').TEXT);
(async()=>{
 const root=path.resolve('app/src/main/assets'),out=path.resolve('artifacts/settings-redesign');fs.mkdirSync(out,{recursive:true});
 const seed=new V.Engine({saveState:async()=>{}}),book=await seed.addBook('设置迁移验收','第一章 开始\n'+('雨停了，山雾渐散。\n'.repeat(90))+'第二章 后续\n另一段故事。');
 Object.assign(seed.state.settings,{llmBase:'https://saved.example/v1',llmModel:'saved-model',autoProduceUpcoming:false});
 seed.state.voices.push({id:'my-voice',sample:'my-voice.wav',name:'自定义男声',description:'青年男性，清晰自然',enabled:false});
 let state=JSON.parse(JSON.stringify(seed.state)),credentials={llmKey:'saved-key',ttsKey:'tts-saved-key',llmBase:state.settings.llmBase};
 let failSave=false,failModel=false,failTest=false,holdTest=null,testRelease=null,holdSave=false,saveRelease=null;const calls=[],errors=[],checks=[];
 const chapters=new Map(state.books.flatMap(b=>b.chapters).map(c=>[c.id,c]));let playback={playing:false,position:0};
 const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return res.writeHead(404).end();res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:393,height:873}});page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.exposeFunction('fixtureNative',async(id,action,payload)=>{
   const p=JSON.parse(payload||'{}');calls.push({action,p});let result=true,error=null;
   try{
    if(action==='load')result={state:JSON.parse(JSON.stringify(state)),llmConfigured:!!credentials.llmKey,ttsConfigured:!!credentials.ttsKey,version:'0.8.29'};
    else if(action==='saveSnapshot'){
     if(holdSave)await new Promise(resolve=>saveRelease=resolve);
     if(failSave)throw Error('模拟存储空间不足');for(const c of JSON.parse(p.chapters))chapters.set(c.id,c);state=JSON.parse(p.header);for(const b of state.books)b.chapters=b.chapters.map(c=>({...chapters.get(c.id),...c}));
    }else if(action==='saveModelConfiguration'){
     if(failModel)throw Error('模拟密钥保存失败');Object.assign(state.settings,p.patch);const key=p.provider==='llm'?'llmKey':'ttsKey';
     if(p.credential.operation==='replace')credentials[key]=p.credential.key;if(p.credential.operation==='clear')delete credentials[key];if(p.provider==='llm')credentials.llmBase=state.settings.llmBase;
     result={llmConfigured:!!credentials.llmKey,ttsConfigured:!!credentials.ttsKey};
    }else if(action==='testModelConfiguration'){
     if(holdTest)await new Promise(r=>testRelease=r);if(failTest)throw Error('模拟连接失败');
     if(p.provider==='tts')result={choices:[{finish_reason:'stop',message:{audio:{data:wave()}}}]};
     else result=p.settings.llmProtocol==='anthropic'?{content:[{type:'text',text:'{"ok":true}'}],stop_reason:'end_turn'}:{choices:[{finish_reason:'stop',message:{content:'{"ok":true}'}}]};
    }else if(action==='request'){
     assert(p.provider==='tts'&&promptTexts.includes(p.body.messages?.find(m=>m.role==='assistant')?.content),'only existing friendly player prompts may request audio during player controls');result={choices:[{finish_reason:'stop',message:{audio:{data:wave()}}}]};
    }
    else if(action==='loadChapter')result=chapters.get(p.id);
    else if(action==='networkState')result='wifi';
    else if(action==='playbackState')result=playback;
    else if(action==='play'){playback={...p,playing:true,position:0};}
    else if(action==='playback'){if(p.op==='pause')playback.playing=false;}
    else if(action==='saveAudio'||action==='saveRawAudio')result={id:'test-audio.wav',duration:3,size:100};
    else if(action==='audioStats')result={totalBytes:1048576,fileCount:2,fileSizes:{}};
    else if(action==='audioDurations')result=Object.fromEntries(p.ids.map(id=>[id,3000]));
   }catch(err){error={message:err.message,status:0,retryable:false};}
   if(!page.isClosed())await page.evaluate(v=>window.nativeResult(v),{id,result:error?null:result,error});
  });
  await page.addInitScript(()=>{window.Native={call:(...args)=>window.fixtureNative(...args)};});
  const load=async()=>{await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.bajiaoEngine);};
  const act=a=>page.locator('[data-act="'+a+'"]').first().click();
  const on=p=>page.locator('main[data-page="'+p+'"]');
  const home=async()=>{await act('go:settings');await on('settings').waitFor();};
  const open=async p=>{await home();await act('go:'+p);await on(p).waitFor();};
  const choose=async(key,label)=>{await act('settingspick:'+key);await page.locator('.settings-picker').getByRole('button',{name:label,exact:true}).click();};
  const saved=async()=>{await act('settingssave');await page.waitForFunction(()=>document.querySelector('[data-act="settingssave"]')?.disabled);};
  const shot=name=>page.screenshot({path:path.join(out,name+'.png'),fullPage:true,animations:'disabled'});
  await load();await home();assert.equal(await page.locator('nav [data-act="go:settings"]').innerText(),'设置');
  const production=page.locator('.settings-section').filter({has:page.getByRole('heading',{name:'制作',exact:true})});assert.equal(await production.locator('[data-act="go:voicepolicy"]').count(),1);
  assert.equal(await page.locator('.settings-home-row').count(),10);await shot('home-393');checks.push('ten independently routed settings pages, voice allocation belongs to production, navigation renamed');

  await act('go:productionmode');await choose('promptMode','导演模式');assert.equal(await page.evaluate(()=>bajiaoEngine.state.settings.promptMode),'fast');
  await act('back');await page.getByRole('dialog').waitFor();await page.locator('[data-result="cancel"]').click();assert.equal(await on('productionmode').count(),1);
  await act('back');await page.locator('[data-result="save"]').click();await on('settings').waitFor();assert.equal(state.settings.promptMode,'director');assert.equal(state.settings.speakerUncertaintyMode,'narrator');
  await act('go:productionmode');await choose('speakerUncertaintyMode','等待人工确认');await act('back');await page.locator('[data-result="discard"]').click();assert.equal(state.settings.speakerUncertaintyMode,'narrator');
  checks.push('save-and-leave, discard, continue editing; changing production mode does not change confirmation policies');

  await open('productionpolicy');assert.equal(await page.getByRole('heading',{name:'网络与并发',exact:true}).count(),1);assert.equal(await page.getByText('导演模式',{exact:true}).count(),0);
  await page.locator('.settings-advanced summary').click();const connect=page.locator('#setting-connectTimeoutSeconds');await connect.fill('60');await connect.fill('30');assert(await page.locator('[data-act="settingssave"]').isDisabled());
  for(const bad of ['','4','30.5','1e2','121']){await connect.fill(bad);await act('settingssave');assert.match(await page.locator('#error-setting-connectTimeoutSeconds').innerText(),/整数/);assert.equal(state.settings.connectTimeoutSeconds,30);}
  await connect.fill('75');await connect.focus();await page.evaluate(()=>window.onNativeNetworkChange('other'));assert.equal(await connect.inputValue(),'75');assert.equal(await page.evaluate(()=>document.activeElement.id),'setting-connectTimeoutSeconds');
  await page.evaluate(async()=>{bajiaoEngine.state.settings.keepRecentCount=3;await bajiaoEngine.persist();});await saved();assert.equal(state.settings.connectTimeoutSeconds,75);assert.equal(state.settings.keepRecentCount,3);
  await connect.fill('90');failSave=true;await act('settingssave');await page.getByText('模拟存储空间不足',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>bajiaoEngine.state.settings.connectTimeoutSeconds),75);assert.equal(await connect.inputValue(),'90');failSave=false;await saved();
  await connect.fill('100');holdSave=true;await act('settingssave');await page.waitForFunction(()=>document.getElementById('setting-connectTimeoutSeconds').matches(':disabled'));await act('back');assert.equal(await on('productionpolicy').count(),1);holdSave=false;saveRelease();await page.waitForFunction(()=>!document.querySelector('.settings-fields').disabled);assert.equal(state.settings.connectTimeoutSeconds,100);
  checks.push('integer bounds, dirty reversion, focused drafts survive network changes; patches preserve unrelated updates; storage failures retain drafts and roll back fields');

  await open('voicepolicy');await act('settingspick:defaultVoices.maleLead');await page.keyboard.press('Escape');assert(await page.locator('[data-act="settingssave"]').isDisabled());
  await choose('defaultVoices.maleLead','自定义男声');await choose('defaultVoices.femaleLead','自定义男声');await act('settingssave');assert.match(await page.locator('#error-setting-defaultVoices-femaleLead').innerText(),/不同声线/);
  await choose('defaultVoices.femaleLead','按通用规则匹配');await saved();assert.equal(state.settings.defaultVoices.maleLead,'my-voice');assert.equal(state.books[0].voiceDefaults.maleLead,'preset:苏打');
  await page.evaluate(async()=>{await bajiaoEngine.addBook('新书默认验收','第一章\n正文。');});assert.equal(state.books[1].voiceDefaults.maleLead,'my-voice');assert.equal(state.books[1].voiceDefaults.femaleLead,null);checks.push('preset/personal/default-match selector, duplicate-sample protection, defaults snapshot only on new books');

  await open('llm');await page.locator('#llmModel').fill('draft-model');await page.locator('#llmKey').fill('temporary-key');const writesBefore=calls.filter(c=>c.action==='saveModelConfiguration').length;
  await act('settingstest');await page.getByText('测试成功',{exact:true}).waitFor();assert.equal(credentials.llmKey,'saved-key');assert.equal(state.settings.llmModel,'saved-model');assert.equal(await page.evaluate(()=>bajiaoEngine.state.settings.llmModel),'saved-model');assert.equal(calls.filter(c=>c.action==='saveModelConfiguration').length,writesBefore);
  await page.locator('#llmModel').fill('changed-after-test');assert.match(await page.locator('.settings-test-result').innerText(),/重新测试/);await act('settingskeyvisibility');assert.equal(await page.locator('#llmKey').getAttribute('type'),'text');await act('settingskeyvisibility');assert.equal(await page.locator('#llmKey').getAttribute('type'),'password');
  failTest=true;await act('settingstest');await page.getByText('测试失败',{exact:true}).waitFor();failTest=false;assert.equal(await page.locator('#llmKey').inputValue(),'temporary-key');
  holdTest=true;await act('settingstest');while(!testRelease)await new Promise(resolve=>setTimeout(resolve,10));await page.locator('#llmModel').fill('edited-during-test');holdTest=false;testRelease();await page.waitForFunction(()=>!document.querySelector('[data-act="settingstest"]').disabled);assert.match(await page.locator('.settings-note[role="status"]').innerText(),/重新测试/);await page.locator('#llmModel').fill('changed-after-test');
  failModel=true;await act('settingssave');await page.getByText('模拟密钥保存失败',{exact:true}).waitFor();assert.equal(state.settings.llmModel,'saved-model');assert.equal(credentials.llmKey,'saved-key');failModel=false;await saved();assert.equal(state.settings.llmModel,'changed-after-test');assert.equal(credentials.llmKey,'temporary-key');assert.equal(await page.locator('#llmKey').inputValue(),'');
  await page.locator('#llmBase').fill('https://different.example/v1');await act('settingstest');assert.match(await page.locator('#error-setting-credential').innerText(),/对应密钥/);assert.equal(credentials.llmBase,'https://saved.example/v1');
  await page.locator('#llmKey').fill('different-key');await choose('llmProtocol','Anthropic Messages');await act('settingstest');await page.getByText('测试成功',{exact:true}).waitFor();assert.equal(state.settings.llmProtocol,'openai');await saved();assert.equal(credentials.llmBase,'https://different.example/v1');assert.equal(state.settings.llmProtocol,'anthropic');
  await act('settingskeyclear');assert.equal(credentials.llmKey,'different-key');await saved();assert(!credentials.llmKey);checks.push('tests use ephemeral draft credentials and current protocol; saved settings remain unchanged until save; stale results invalidated; key visibility, native-save failure, origin binding, replacement and clear');
  await page.locator('#llmBase').fill('https://no-key.example/v1');await act('settingssave');assert.match(await page.locator('#error-setting-credential').innerText(),/对应密钥/);await page.locator('#llmBase').fill('https://different.example/v1');assert(await page.locator('[data-act="settingssave"]').isDisabled());

  await open('mimo');await page.locator('#ttsKey').fill('temporary-tts');await act('settingstest');await page.getByText('测试成功',{exact:true}).waitFor();assert.equal(credentials.ttsKey,'tts-saved-key');await act('settingstestplay');assert.equal(playback.id,'test-audio.wav');await act('back');await page.locator('[data-result="discard"]').click();assert.equal(credentials.ttsKey,'tts-saved-key');checks.push('TTS draft synthesis uses common request path, returns playable audio and does not save its key');

  await open('playbackpolicy');await page.locator('#setting-playbackSpeed').fill('1.75');await choose('autoProduceCount','提前 3 章');await page.locator('#setting-autoProduceUpcoming').check();assert.equal(state.settings.playbackSpeed,1);await saved();assert.equal(state.settings.playbackSpeed,1.75);assert(calls.some(c=>c.action==='playback'&&c.p.op==='speed'&&c.p.value===1.75));await page.locator('#setting-autoProduceUpcoming').uncheck();await saved();assert.equal(state.settings.autoProduceCount,3);
  await open('readerpolicy');await choose('readerFontSize','22 px');await choose('readerLineHeight','宽松');assert.equal(state.settings.readerFontSize,16);assert.equal(await page.locator('.settings-reader-preview').evaluate(el=>getComputedStyle(el).fontSize),'22px');await saved();assert.equal(state.settings.readerFontSize,22);assert.equal(state.settings.readerLineHeight,2.2);
  await act('settingsreset');assert.equal(state.settings.readerFontSize,22);await saved();assert.equal(state.settings.readerFontSize,16);
  await open('storagepolicy');await page.locator('#setting-autoDeletePlayed').check();assert.equal(state.settings.autoDeletePlayed,false);await act('settingssave');await page.locator('[data-result="cancel"]').click();assert.equal(state.settings.autoDeletePlayed,false);await act('settingssave');await page.locator('[data-result="save"]').click();await page.waitForFunction(()=>document.querySelector('[data-act="settingssave"]')?.disabled);assert.equal(state.settings.autoDeletePlayed,true);await act('go:storage');await on('storage').waitFor();assert.equal(await page.locator('[data-act="toggleautoproduce"],[data-act="toggleautodelete"]').count(),0);assert.equal(await page.locator('[data-act="clearallaudio"]').count(),1);
  checks.push('playback speed has one source, disabled preproduction retains count, reader preview/reset are save-only, storage management contains actions instead of duplicate settings');

  await open('importpolicy');await choose('splitRule','自定义模板');await page.locator('#productionSplitCustom').fill('');await act('settingssave');assert.match(await page.locator('#error-productionSplitCustom').innerText(),/填写/);await page.locator('#productionSplitCustom').fill('第*章');await saved();
  await open('quality');for(const value of ['-1','1.5','1e3','9007199254740992']){await page.locator('#productionLlmRetries').fill(value);await act('settingssave');assert.match(await page.locator('#error-productionLlmRetries').innerText(),/非负整数/);}await page.locator('#productionLlmRetries').fill('8');await saved();assert.equal(state.settings.llmRetries,8);assert.equal(state.settings.ttsRetries,3);
  await act('settingshelp:quality');await page.getByRole('dialog').waitFor();assert.match(await page.getByRole('dialog').innerText(),/共用同一计数/);assert(await page.getByRole('dialog').locator('.settings-help-content h3').count()>1);assert(await page.getByRole('dialog').locator('li').count()>1);await page.locator('[data-result="close"]').click();assert.equal(await on('quality').count(),1);
  checks.push('custom import validation, unlimited nonnegative retries, help opens without leaving or losing a form');

  for(const width of [320,393,768]){
   await page.setViewportSize({width,height:873});await home();await shot('home-'+width);
   for(const route of Object.keys(V.Settings.PAGE_KEYS)){
    await act('go:'+route);await on(route).waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),route+' '+width+' overflow');
    assert(await page.locator('[data-act="settingssave"]').isVisible());await shot(route+'-'+width);await act('back');await on('settings').waitFor();
   }
  }
  await page.setViewportSize({width:873,height:393});await open('voicepolicy');await act('settingspick:defaultVoices.narrator');assert(await page.locator('.settings-picker-options').evaluate(el=>el.scrollHeight>el.clientHeight));await page.keyboard.press('Escape');await home();await act('settingshelp:all');await on('settingshelp').waitFor();assert.equal(await on('settingshelp').locator('[data-help-topic]').count(),10);await page.locator('[data-help-topic="mimo"] summary').click();assert.match(await on('settingshelp').innerText(),/怎么开始使用/);assert(!/mimo-v2\.5-tts-voiceclone/.test(await on('settingshelp').innerText()));await shot('help-landscape');
  checks.push('all pages at 320/393/768 widths, scrollable landscape picker, offline help and dynamic version');
  assert.equal(calls.filter(c=>c.action==='request').length,0,'settings navigation and saves do not start production');

  await page.setViewportSize({width:393,height:873});await page.evaluate(async()=>{const c=bajiaoEngine.state.books[0].chapters[0];Object.assign(c,{audio:'chapter.wav',duration:10,status:'ready',segments:[{id:0,text:c.text,speaker:'旁白',confidence:1,audio:'line.wav',durMs:10000}]});bajiaoEngine.touch(c);await bajiaoEngine.persist();});
  await act('go:shelf');await act('book:'+book.id);await act('read:'+book.chapters[0].id);await act('go:listen');await act('playchapter');await act('autoproducesettings');await on('playbackpolicy').waitFor();assert.equal(await page.locator('#setting-playbackSpeed').inputValue(),'1.75');await page.locator('#setting-playbackSpeed').fill('1.5');await saved();await act('back');await on('listen').waitFor();assert.equal(await page.locator('#speedBtnVal').innerText(),'1.5x');
  await act('speedmodal');await page.locator('#speedRange').evaluate(el=>{el.value='1.25';el.dispatchEvent(new Event('change',{bubbles:true}));});await page.waitForFunction(()=>bajiaoEngine.state.settings.playbackSpeed===1.25);await act('closespeed');await act('listensettings');await on('storagepolicy').waitFor();assert(await page.locator('#setting-autoDeletePlayed').isChecked());await act('back');await on('listen').waitFor();
  await act('back');await open('playbackpolicy');assert.equal(await page.locator('#setting-playbackSpeed').inputValue(),'1.25');await page.locator('.vc-mini-player').waitFor();assert(await page.evaluate(()=>document.querySelector('.settings-save').getBoundingClientRect().bottom<=document.querySelector('.vc-mini-player').getBoundingClientRect().top));await page.locator('#setting-playbackSpeed').fill('1.75');await shot('save-with-mini');await saved();checks.push('player shortcuts use shared settings and return to the same chapter; immediate speed controls share saved speed; fixed Save stays above the mini player');

  await page.setViewportSize({width:393,height:873});await page.reload();await page.waitForFunction(()=>bajiaoEngine);assert.equal(await page.evaluate(()=>bajiaoEngine.state.settings.llmRetries),8);assert.equal(await page.evaluate(()=>bajiaoEngine.state.settings.ttsRetries),3);assert.equal(await page.evaluate(()=>bajiaoEngine.state.settings.playbackSpeed),1.75);assert.equal(await page.evaluate(()=>bajiaoEngine.state.books[0].voiceDefaults.maleLead),'preset:苏打');
  await home();await page.evaluate(()=>{bajiaoEngine.state.settings.llmModel='model-'+('very-long-name-'.repeat(30));renderApp();});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await shot('long-model-name');
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'ui-report.json'),JSON.stringify({passed:true,checks,errors,testRequests:calls.filter(c=>c.action==='testModelConfiguration').length,mockedFriendlyPrompts:calls.filter(c=>c.action==='request').length,paidRequests:0},null,2));console.log(JSON.stringify({passed:true,checks,errors},null,2));
 }catch(error){await page.screenshot({path:path.join(out,'failure.png'),fullPage:true,animations:'disabled'});fs.writeFileSync(path.join(out,'ui-failure.txt'),error.stack);throw error;}
 finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

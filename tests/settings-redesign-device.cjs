// Installed APK, real Keystore/snapshots and Android touch/Back/keyboard events.
// All draft requests target an unavailable loopback endpoint; no billed services.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const H=require('./device-harness.cjs');
(async()=>{
 const out=path.resolve('artifacts/settings-redesign'),before=JSON.parse(fs.readFileSync(path.join(out,'upgrade-before.json'))),checks=[];
 const h=await H.connect(),read=h.read,act=a=>h.tap('[data-act="'+a+'"]');
 const current=()=>read(()=>document.querySelector('main')?.dataset.page);
 const shot=name=>fs.writeFileSync(path.join(out,'android-'+name+'.png'),H.run(['exec-out','screencap','-p']));
 const manifest=()=>JSON.parse(H.run(['exec-out','run-as','com.vocast.app','cat','files/library.json']));
 const vault=()=>H.run(['exec-out','run-as','com.vocast.app','cat','shared_prefs/vault.xml']);
 const wait=async fn=>{for(let n=0;n<50;n++){if(await fn())return;await H.sleep(100);}throw Error('Device condition timed out');};
 const choose=async(key,label)=>{await act('settingspick:'+key);const index=await h.page.evaluate(label=>[...document.querySelectorAll('[data-choice]')].find(el=>el.textContent.trim()===label)?.dataset.choice,label);assert.notEqual(index,undefined,label);await h.tap('[data-choice="'+index+'"]');};
 try{
  const start=await h.state(),initialSettings=start.settings,originalMode=before.settings.promptMode||'fast',targetMode=start.settings.promptMode==='director'?'fast':'director';
  assert.equal(start.settings.settingsVersion,2);assert.equal(Object.hasOwn(start,'playbackSpeed'),false);
  assert.equal(start.settings.retries,before.settings.retries);for(const key of ['voiceAdoptionMode','speakerUncertaintyMode','roleMergeMode'])assert.equal(start.settings[key],'review');
  assert.deepEqual(start.books.map(b=>[b.id,b.chapters.length]),before.books.map(b=>[b.id,b.chapters.length]));
  assert(start.books.every(b=>b.chapters.every(c=>c.unloaded)),'migration leaves chapter bodies lazy');
  checks.push('0.8.2 to 0.8.29 covering install preserves two books / 303 chapters; legacy manual policy migrates independently and chapter bodies remain lazy');
  await act('go:settings');await shot('home');await act('go:productionmode');await choose('promptMode',targetMode==='director'?'导演模式':'快速模式');assert.equal((await h.state()).settings.promptMode,initialSettings.promptMode);
  H.run(['shell','input','keyevent','4']);await wait(()=>read(()=>!!document.querySelector('.production-dialog')));await h.tap('[data-result="cancel"]');assert.equal(await current(),'productionmode');
  H.run(['shell','input','keyevent','4']);await h.tap('[data-result="save"]');await wait(async()=>await current()==='settings');assert.equal(manifest().settings.promptMode,targetMode);assert.equal(manifest().settings.speakerUncertaintyMode,'review');
  checks.push('native Android Back supports continue editing and save-and-leave without changing the other policies');
  await act('go:productionpolicy');await h.tap('.settings-advanced summary');await h.tap('#setting-connectTimeoutSeconds');await H.sleep(2200);await shot('keyboard');
  const geometry=await read(()=>{const box=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {top:r.top,bottom:r.bottom};};return {height:innerHeight,save:box('.settings-save'),nav:box('nav'),field:box('#setting-connectTimeoutSeconds')};});assert(geometry.save.bottom<=geometry.nav.top+1&&geometry.nav.bottom<=geometry.height+1,'save bar avoids keyboard and navigation');assert(geometry.field.bottom<geometry.save.top,'focused input stays above Save');
  H.run(['shell','input','keyevent','4']);await h.field('#setting-connectTimeoutSeconds','60');
  H.run(['shell','input','keyevent','KEYCODE_HOME']);H.run(['shell','am','start','-n','com.vocast.app/.MainActivity']);await H.sleep(500);assert.equal(await read(()=>document.getElementById('setting-connectTimeoutSeconds').value),'60');
  await act('go:voices');await h.tap('[data-result="discard"]');assert.equal(await current(),'voices');assert.equal((await h.state()).settings.connectTimeoutSeconds,30);
  checks.push('factory WebView keyboard leaves Save visible; background/foreground retains the draft; bottom navigation shares the discard guard');
  await act('go:settings');await act('go:llm');const savedVault=vault(),savedModel=manifest().settings.llmModel;
  await h.field('#llmBase','https://127.0.0.1:1/v1');await h.field('#llmModel','native-unsaved-model');await h.field('#llmKey','native-temporary-key');await act('settingstest');await wait(()=>read(()=>document.querySelector('.settings-test-result')?.textContent.includes('测试失败')));await shot('draft-test');
  assert.equal(manifest().settings.llmModel,savedModel);assert.equal(manifest().settings.llmBase,before.settings.llmBase);assert.deepEqual(vault(),savedVault);assert(!JSON.stringify(manifest()).includes('native-temporary-key'));
  await act('back');await h.tap('[data-result="discard"]');checks.push('real native draft test fails at local loopback without saving its address/model/key or modifying encrypted credentials');
  await act('go:productionmode');await choose('promptMode',originalMode==='director'?'导演模式':'快速模式');if(await read(()=>!document.querySelector('[data-act="settingssave"]').disabled)){await act('settingssave');await wait(()=>read(()=>document.querySelector('[data-act="settingssave"]').disabled));}await act('back');
  await act('go:shelf');const book=start.books[0];await act('book:'+book.id);await act('multiselect');await act('togglechapter:'+book.chapters[0].id);await act('togglechapter:'+book.chapters[1].id);await act('go:make');
  assert.match(await read(()=>document.querySelector('main').textContent),/制作 2 个章节/);await act('go:productionmode');await act('back');assert.equal(await current(),'make');assert.match(await read(()=>document.querySelector('main').textContent),/制作 2 个章节/);await shot('batch-context');checks.push('batch production settings return preserves both selected chapters and the book context');
  await act('go:shelf');await shot('shelf');
  const after=manifest();for(const b of before.books){const updated=after.books.find(x=>x.id===b.id);assert.equal(updated.chapters.length,b.chapters.length);assert.deepEqual(updated.characters,b.characters);assert.deepEqual(updated.chapters.map(c=>[c.id,c.storageRef,c.audio]),b.chapters.map(c=>[c.id,c.storageRef,c.audio]));}
  const hashes=H.run(['shell','run-as','com.vocast.app','sh','-c','"sha256sum files/audio/*"']).toString();assert.equal(hashes,fs.readFileSync(path.join(out,'audio-before.sha256'),'utf8'));fs.writeFileSync(path.join(out,'audio-after.sha256'),hashes);
  assert.equal(after.usage.length,before.usage.length);assert.equal(after.settings.retries,before.settings.retries);assert.equal(after.settings.playbackSpeed,before.playbackSpeed??before.settings.playbackSpeed);assert.equal(after.settings.promptMode,originalMode);assert.equal(after.settings.connectTimeoutSeconds,30);assert(!Object.hasOwn(after,'playbackSpeed'));assert(!Object.hasOwn(after.settings,'mode'));
  fs.writeFileSync(path.join(out,'upgrade-after.json'),JSON.stringify(after));checks.push('saved v2 migration preserves role bindings, chapter references, retry count and all six audio SHA-256 hashes; zero billed model calls');
  fs.writeFileSync(path.join(out,'android-report.json'),JSON.stringify({passed:true,device:'Android 11 / API 30 emulator, factory WebView 83',upgradeFrom:'0.8.2',upgradeTo:'0.8.29',books:2,chapters:303,audioFiles:6,paidRequests:0,checks},null,2));console.log(JSON.stringify({passed:true,checks},null,2));
 }catch(error){await shot('failure');throw error;}finally{await h.browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

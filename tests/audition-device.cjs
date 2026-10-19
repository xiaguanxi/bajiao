// Native touches against an offline Android emulator. No paid synthesis can run.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),H=require('./device-harness.cjs');
const out=path.resolve('artifacts/audition-v082');
(async()=>{
 const h=await H.connect(),checks=[],read=(fn,arg)=>h.page.evaluate(fn,arg),tap=a=>h.tap('button[data-act="'+a+'"]');
 const shot=async name=>{await h.screenshot('audition-v082-'+name);fs.copyFileSync(path.join(H.dir,'audition-v082-'+name+'.png'),path.join(out,'android-'+name+'.png'));};
 const hashes=()=>H.run(['shell','run-as','com.vocast.app','sh','-c','"sha256sum files/audio/*"']).toString();
 try{
  const start=await h.state(),before=hashes();assert.equal(await read(()=>bajiaoEngine.productionNetworkState()),'offline','must be offline before touching audition');
  await tap('go:voices');await tap('voicetab:preset');assert.equal(await read(()=>document.querySelector('[data-act="voicetab:preset"]').getAttribute('aria-pressed')),'true');
  const geometry=await read(()=>{const tab=document.querySelector('[data-act="voicetab:preset"]').getBoundingClientRect(),indicator=document.querySelector('.vc-tab-indicator').getBoundingClientRect();return {tabX:tab.x,indicatorX:indicator.x,tabWidth:tab.width,indicatorWidth:indicator.width,background:getComputedStyle(document.querySelector('.vc-tab-indicator')).backgroundColor};});assert(Math.abs(geometry.indicatorX-geometry.tabX)<2);assert(Math.abs(geometry.indicatorWidth-geometry.tabWidth)<2);await shot('presets');checks.push('factory WebView 83 aligns the white tab selection with the active preset tab');
  await tap('preset:白桦');assert.equal(await read(()=>document.getElementById('busy').hidden),true);await tap('voicetab:mine');await tap('voicetab:preset');
  for(let i=0;i<120&&await read(()=>bajiaoEngine.presetPreviewJobs?.size>0);i++)await H.sleep(250);
  assert.equal(await read(()=>document.querySelector('[data-act="preset:白桦"]').disabled),false);assert.equal(await read(()=>!!document.querySelector('.vc-audition-spinner')),false);assert.equal(await read(()=>!!document.querySelector('.vc-preview-strip')),false);await shot('offline-preview');checks.push('offline audition uses no blocking dialog, permits tab changes and restores the button after failure');
  await tap('go:shelf');const b=start.books.find(b=>b.characters.some(r=>r.voice?.startsWith('preset:')));assert(b);await h.tap('[data-act="book:'+b.id+'"]');await tap('go:roles');const role=b.characters.find(r=>r.voice?.startsWith('preset:'));await tap('chooserole:'+role.name);await tap('choosetab:mine');await tap('choosetab:preset');assert.equal(await read(()=>document.querySelector('.vc-voice-tabs').dataset.selected),'preset');await shot('role-voices');checks.push('role voice picker uses the same tab selection on native touches');
  await tap('go:shelf');const end=await h.state();assert.deepEqual(end.usage,start.usage);assert.equal(hashes(),before);assert.deepEqual(end.books.map(b=>({id:b.id,roles:b.characters.map(r=>[r.name,r.voice]),audio:b.chapters.map(c=>c.audio)})),start.books.map(b=>({id:b.id,roles:b.characters.map(r=>[r.name,r.voice]),audio:b.chapters.map(c=>c.audio)})));checks.push('existing audio bytes, chapter references, role bindings and API usage remain unchanged');
  fs.writeFileSync(path.join(out,'android-report.json'),JSON.stringify({passed:true,checks,geometry,network:'offline',apiUsageChange:0,audioChanged:false},null,2));console.log(JSON.stringify({passed:checks.length,checks}));
 }finally{await h.browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

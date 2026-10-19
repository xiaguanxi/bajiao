const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {connect,run,sleep,log,nativeTap,dir}=require('./device-harness.cjs');
(async()=>{
 run(['shell','cmd','statusbar','collapse']);run(['shell','am','start','-W','-n','com.vocast.app/.MainActivity']);
 const h=await connect();const checks=[];const reportFile=path.join(dir,'playback.json');
 const status=()=>h.read(async()=>await device.call('playbackState'));
 const check=(name,details={})=>{checks.push({name,...details,at:new Date().toISOString()});fs.writeFileSync(reportFile,JSON.stringify({checks,pass:false},null,2));console.log('PASS',name);};
 try{
  const s=await h.state(),b=s.books.find(b=>b.name==='bajiao-novel'),c=b.chapters.find(c=>/^第0001章/.test(c.title));assert(c.audio);
  await h.tap('[data-act="go:shelf"]');await h.tap('[data-act="book:'+b.id+'"]');await h.tap('[data-act="read:'+c.id+'"]');await h.tap('[data-act="playchapter"]');await sleep(1200);
  let p=await status();if(!p.playing){await h.tap('[data-act="playchapter"]');await sleep(700);p=await status();}assert.equal(p.playing,true,p.error);assert.equal(p.id,c.audio);assert(p.duration>600000);const initial=p.position;
  const clockStart=Date.now();for(let i=0;i<32;i++){await sleep(250);p=await status();if(p.position>initial+1800)break;}assert(p.position>initial+1800);assert.equal(p.playing,true);check('Native chapter decoder starts and playback clock advances',{duration:p.duration,clockObservationMs:Date.now()-clockStart});await h.screenshot('chapter-1-playing');
  await h.tap('[data-act="playchapter"]');await sleep(400);p=await status();assert.equal(p.playing,false);const paused=p.position;await sleep(800);assert(Math.abs((await status()).position-paused)<150);check('Pause stops native clock');
  await h.tap('[data-act="playchapter"]');await sleep(300);assert.equal((await status()).playing,true);check('Resume starts native clock');
  p=await status();await h.read(()=>{const s=document.querySelector('#seek');s.value=String(Math.min(Number(s.max),Number(s.value)+15000));s.dispatchEvent(new Event('change',{bubbles:true}));});await sleep(350);assert((await status()).position>p.position+14000);check('Slider seeks forward');
  const forward=(await status()).position;await h.read(()=>{const s=document.querySelector('#seek');s.value=String(Math.max(0,Number(s.value)-15000));s.dispatchEvent(new Event('change',{bubbles:true}));});for(let i=0;i<32;i++){p=await status();if(p.position<forward-13000)break;await sleep(250);}assert(p.position<forward-13000);
  const speedBefore=(await h.read(()=>window.bajiaoEngine.state.playbackSpeed))||1;
  await h.tap('[data-act="speedmodal"]');await sleep(300);
  await h.read(()=>{const r=document.querySelector('#speedRange');r.value='1.25';r.dispatchEvent(new Event('change',{bubbles:true}));});await sleep(400);
  assert.equal(await h.read(()=>window.bajiaoEngine.state.playbackSpeed),1.25);
  assert.equal((await status()).speed,1.25);
  assert.equal(await h.read(()=>document.querySelector('#speedBtnVal').textContent),'1.25x', 'selected speed must show');
  await h.read(()=>{const r=document.querySelector('#speedRange');r.value=String(speedBefore);r.dispatchEvent(new Event('change',{bubbles:true}));});await sleep(300);
  await h.tap('[data-act="closespeed"]');
  check('Slider and speed modal link engine, native and badge');
  assert.equal(await h.read(()=>document.querySelector('[data-act="sleep"]')?.count||document.querySelectorAll('[data-act="sleep"]').length),0,'legacy timer button removed');
  assert(await h.read(()=>document.querySelector('#transcriptPanel .vc-transcript-line.active')), 'subtitle must highlight the playing line');
  check('Subtitle stream follows playback without timer control');
  run(['shell','input','keyevent','3']);log({type:'home',purpose:'Verify background playback'});p=await status();const backgroundStart=Date.now();let background;for(let i=0;i<32;i++){await sleep(250);background=await status();if(background.position>p.position+1200)break;}assert.equal(background.playing,true);assert.equal(background.id,c.audio);assert(background.position>p.position+1200);check('Playback survives Home while production pauses',{clockObservationMs:Date.now()-backgroundStart});
  run(['shell','cmd','statusbar','expand-notifications']);await sleep(700);await h.screenshot('native-playback-notification');
  const tree=require('./device-harness.cjs').nodes();fs.writeFileSync(path.join(dir,'notification-tree.json'),JSON.stringify(tree,null,2));
  if(tree.some(n=>n['content-desc']==='暂停'||n.text==='暂停'))await nativeTap('暂停');else throw Error('Native media pause control missing');
  await sleep(500);assert.equal((await status()).playing,false);check('Native notification pause works');
  run(['shell','cmd','statusbar','collapse']);run(['shell','am','start','-W','-n','com.vocast.app/.MainActivity']);await sleep(600);
  await h.screenshot('playback-after-return');
  const crash=run(['logcat','-d','-b','crash']).toString();fs.writeFileSync(path.join(dir,'playback-crash-after-fix.txt'),crash);assert(!crash.includes('Process: com.vocast.app'));check('No APK crash after audition and full playback controls');
  fs.writeFileSync(reportFile,JSON.stringify({pass:true,checks},null,2));
 }finally{await h.browser.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});

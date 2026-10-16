// APK UI interaction uses native Android input. CDP only observes state.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {connect,run,sleep}=require('./device-harness.cjs');
const out=path.resolve('artifacts/voice-quality');
const hashes=()=>run(['shell','run-as','com.vocast.app','sh','-c','"sha256sum files/audio/*"']).toString().trim().split(/\r?\n/).sort();
const snapshot=s=>JSON.parse(JSON.stringify(s.books.map(b=>({id:b.id,characters:b.characters.map(r=>({name:r.name,voice:r.voice,candidateSample:r.candidate?.sample})),chapters:b.chapters.map(c=>({id:c.id,audio:c.audio||null}))}))));
async function ready(){let last;for(let i=0;i<30;i++){try{return await connect();}catch(e){last=e;await sleep(2000);}}throw last;}
(async()=>{
 const before=JSON.parse(fs.readFileSync(path.join(out,'device-state-before.json')));
 const expected=fs.readFileSync(path.join(out,'device-audio-before.txt'),'utf8').trim().split(/\r?\n/).sort();
 let h=await ready();const checks=[],report={checks,passed:false};
 const check=(name,details={})=>{checks.push({name,...details});fs.writeFileSync(path.join(out,'device-report.json'),JSON.stringify(report,null,2));console.log('PASS',name);};
 try{
  assert.deepEqual(hashes(),expected);const initial=await h.state();assert.deepEqual(snapshot(initial),before.books.map(({name,...b})=>b));check('升级后已有音频哈希与角色绑定不变',{files:expected.length});
  const b=initial.books.find(b=>b.chapters.some(c=>c.audio)),c=b.chapters.find(c=>c.audio);assert(b&&c);
  const manifest=JSON.parse(run(['exec-out','run-as','com.vocast.app','cat','files/library.json']));
  const storage=manifest.books.find(x=>x.id===b.id).chapters.find(x=>x.id===c.id).storageRef;
  const chapterBefore=JSON.parse(run(['exec-out','run-as','com.vocast.app','cat','files/chapters/'+storage+'.json']));
  const refs=ch=>ch.segments.map(s=>({id:s.id,audio:s.audio||null,rawAudioIds:s.rawAudioIds||[],originalAudio:s.originalAudio||null}));
  if(!await h.read(()=>!!document.querySelector('[data-act="go:shelf"]')))await h.tap('[data-act="back"]');
  await h.tap('[data-act="go:shelf"]');await h.tap('[data-act="book:'+b.id+'"]');await h.tap('[data-act="read:'+c.id+'"]');
  for(let n=0;n<2;n++){
   await h.tap('[data-act="playchapter"]');await sleep(750);
   let status=await h.read(async()=>await device.call('playbackState'));
   for(let wait=0;wait<40&&!status.playing&&!status.error;wait++){await sleep(250);status=await h.read(async()=>await device.call('playbackState'));}
   assert.equal(status.playing,true,status.error||'播放器没有完成准备');assert.equal(status.id,c.audio);check(n?'再次播放原生音频正常':'首次播放原生音频正常',status);
   await h.tap('[data-act="playchapter"]');await sleep(300);
  }
  assert((await h.read(()=>document.querySelectorAll('#transcriptPanel .vc-transcript-line').length))>0);check('首次进入听书即加载字幕');
  const loaded=await h.state(),current=loaded.books.find(x=>x.id===b.id).chapters.find(x=>x.id===c.id);assert.deepEqual(refs(current),refs(chapterBefore));assert.deepEqual(hashes(),expected);assert.deepEqual(snapshot(loaded),snapshot(initial));check('反复播放后音频哈希、片段引用与角色绑定不变');
  fs.writeFileSync(path.join(out,'device-playback.png'),run(['exec-out','screencap','-p']));
  await h.browser.close();h=null;run(['shell','am','force-stop','com.vocast.app']);run(['shell','am','start','-n','com.vocast.app/.MainActivity']);await sleep(2500);h=await ready();
  assert.deepEqual(hashes(),expected);assert.deepEqual(snapshot(await h.state()),snapshot(initial));check('进程重启后保留既有音频与绑定');
  report.passed=true;report.completed=new Date().toISOString();fs.writeFileSync(path.join(out,'device-report.json'),JSON.stringify(report,null,2));
 }finally{if(h)await h.browser.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});

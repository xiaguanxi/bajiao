const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {connect,run,sleep,nativeTap,finger,log,dir}=require('./device-harness.cjs');
(async()=>{const h=await connect(),checks=[],file=path.join(dir,'chapter-navigation.json');
 const status=()=>h.read(async()=>await device.call('playbackState'));
 const check=(name,details={})=>{checks.push({name,...details,at:new Date().toISOString()});fs.writeFileSync(file,JSON.stringify({pass:false,checks},null,2));console.log('PASS',name);};
 async function playing(c){for(let i=0;i<30;i++){const p=await status();if(p.id===c.audio&&p.playing){assert.equal(p.title,c.title);assert.equal(p.error,'');return p;}await sleep(250);}throw Error('Chapter did not play: '+c.title);}
 try{
  const s=await h.state(),b=s.books.find(b=>b.name==='bajiao-novel'),chapters=b.chapters.filter(c=>/^第000[1-5]章/.test(c.title));assert.equal(chapters.length,5);assert(chapters.every(c=>c.audio));
  await h.tap('[data-act="go:shelf"]');await h.tap('[data-act="book:'+b.id+'"]');await h.tap('[data-act="read:'+chapters[0].id+'"]');await h.tap('[data-act="playchapter"]');await playing(chapters[0]);
  assert(await h.read(()=>document.querySelector('[data-act="prevchapter"]').disabled));
  for(let i=1;i<5;i++){await h.tap('[data-act="nextchapter"]');const p=await playing(chapters[i]);const a=p.position;let advanced;for(let n=0;n<32;n++){await sleep(250);advanced=await status();if(advanced.position>a+400)break;}assert(advanced.position>a+400);check('UI next plays chapter '+(i+1),{audio:chapters[i].audio,duration:p.duration});}
  assert(await h.read(()=>document.querySelector('[data-act="nextchapter"]').disabled));check('Chapter boundary controls disabled correctly');
  for(let i=3;i>=0;i--){await h.tap('[data-act="prevchapter"]');await playing(chapters[i]);}check('UI previous traverses all five chapters');
  await h.tap('[data-act="back"]');await h.tap('[data-act="read:'+chapters[4].id+'"]');await sleep(1200);
  assert((await h.read(()=>!!document.querySelector('#playBtn'))));assert.equal(await h.read(()=>document.querySelector('#seek').value),'0');
  const beforeUnrelated=(await status()).position;await h.read(()=>{const s=document.querySelector('#seek');s.value=String(Math.min(Number(s.max),Number(s.value)+15000));s.dispatchEvent(new Event('change',{bubbles:true}));});await sleep(400);const afterUnrelated=await status();assert.equal(afterUnrelated.id,chapters[0].audio);assert(afterUnrelated.position<beforeUnrelated+10000);check('Browsing another chapter shows its own idle state and cannot seek the playing chapter');
  await h.tap('[data-act="playchapter"]');await playing(chapters[4]);for(let i=3;i>=0;i--){await h.tap('[data-act="prevchapter"]');await playing(chapters[i]);}
  // Tap the actual seek slider at its right endpoint to exercise natural completion.
  await h.tap('#seek');
  const r=await h.read(()=>{const r=document.querySelector('#seek').getBoundingClientRect();return {x:r.right-3,y:r.y+r.height/2,d:devicePixelRatio};});
  const frames=run(['shell','dumpsys','window','windows']).toString(),bar=frames.match(/Window #\d+ Window\{[^\n]*StatusBar\}:[\s\S]*?mFrame=\[0,0\]\[\d+,(\d+)\]/);assert(bar);
  finger(Math.round(r.x*r.d),Math.round(r.y*r.d+Number(bar[1])));log({type:'rangeTap',selector:'#seek',fraction:1,purpose:'Verify automatic chapter completion'});
  await playing(chapters[1]);check('Native completion automatically starts the next completed chapter');
  await h.tap('[data-act="prevchapter"]');await playing(chapters[0]);
  await h.tap('[data-act="go:settings"]');await h.tap('[data-act="globalpolicy"]');assert((await h.read(()=>document.body.innerText)).includes('音色策略'));
  run(['shell','input','keyevent','3']);log({type:'home',purpose:'Notification chapter navigation from global settings'});
  run(['shell','cmd','statusbar','expand-notifications']);await sleep(500);await nativeTap('下一章');await playing(chapters[1]);
  await nativeTap('上一章');await playing(chapters[0]);check('Real native notification next and previous use the playing book');await h.screenshot('notification-chapter-controls');
  run(['shell','cmd','statusbar','collapse']);run(['shell','am','start','-W','-n','com.vocast.app/.MainActivity']);await sleep(500);
  assert((await h.read(()=>document.body.innerText)).includes('音色策略'));check('Background notification navigation preserves settings page');
  await h.tap('[data-act="go:shelf"]');await h.tap('[data-act="book:'+b.id+'"]');await h.tap('[data-act="read:'+chapters[1].id+'"]');await h.tap('[data-act="playchapter"]');await playing(chapters[1]);
  run(['shell','cmd','statusbar','expand-notifications']);await sleep(400);await nativeTap('下一章');await playing(chapters[2]);run(['shell','cmd','statusbar','collapse']);
  await h.tap('[data-act="back"]');assert((await h.read(()=>document.body.innerText)).includes('章节目录'));await h.tap('[data-act="back"]');assert((await h.read(()=>document.body.innerText)).includes('我的书架'));check('Back returns to directory then shelf after native next');
  const crash=run(['logcat','-d','-b','crash']).toString();assert(!crash.includes('Process: com.vocast.app'));fs.writeFileSync(path.join(dir,'final-crash-log.txt'),crash);check('No Android app crash during five-chapter navigation');
  await h.screenshot('final-shelf');fs.writeFileSync(file,JSON.stringify({pass:true,checks},null,2));
 }finally{await h.browser.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});

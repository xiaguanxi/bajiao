// Exercise the rendered player with fake native playback; no model requests.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/xiagu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const V=require('../app/src/main/assets/core.js');
(async()=>{
 const root=path.resolve('app/src/main/assets'),out=path.resolve('artifacts/seek-time');fs.mkdirSync(out,{recursive:true});
 const e=new V.Engine({saveState:async()=>{}}),b=await e.addBook('进度时间跟随','第一章 整章\n甲。\n第二章 边做边听\n乙。');e.state.settings.autoProduceUpcoming=false;
 const whole=b.chapters[0],stream=b.chapters[1];whole.audio='whole.wav';whole.duration=600;whole.status='ready';
 whole.segments=Array.from({length:20},(_,id)=>({id,text:'字幕'+id+'。',speaker:'旁白',confidence:1,audio:'whole-'+id,durMs:30000}));
 stream.segments=Array.from({length:20},(_,id)=>({id,text:'流播'+id+'。',speaker:'旁白',confidence:1,audio:id<10?'stream-'+id:null,durMs:10000}));
 let playback={id:'',position:0,playing:false},page;const errors=[],metrics=[];
 const server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));if(!f.startsWith(root+path.sep)||!fs.existsSync(f))return res.writeHead(404).end();res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(f));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  page=await browser.newPage({viewport:{width:361,height:800}});page.setDefaultTimeout(6000);page.on('pageerror',err=>errors.push(err.message));
  await page.exposeFunction('nativeCall',async(id,action,payload)=>{const p=JSON.parse(payload||'{}');let result=true;
   if(action==='load')result={state:e.state,llmConfigured:false,ttsConfigured:false};
   else if(action==='playbackState')result={...playback};
   else if(action==='play')playback={...p,position:p.position||0,playing:!p.startPaused};
   else if(action==='playback'){if(p.op==='seek')playback.position=p.value;if(p.op==='pause')playback.playing=false;if(p.op==='resume')playback.playing=true;}
   else if(action==='request')throw Error('Unexpected paid request');
   await page.evaluate(v=>window.nativeResult(v),{id,result});
  });await page.addInitScript(()=>window.Native={call:(...args)=>window.nativeCall(...args)});
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.bajiaoEngine);
  const click=act=>page.locator('[data-act="'+act+'"]').first().click();await click('book:'+b.id);await click('read:'+whole.id);await click('go:listen');await page.locator('#playBtn').click();
  const read=()=>page.evaluate(()=>{const input=document.querySelector('#seek'),track=input.closest('.vc-seek-track'),label=track.querySelector('.vc-seek-times'),r=track.getBoundingClientRect(),l=label.getBoundingClientRect();return {value:Number(input.value),max:Number(input.max),ratio:parseFloat(getComputedStyle(track).getPropertyValue('--seek-position'))/100,width:r.width,centre:l.x+l.width/2-r.x,half:l.width/2,left:l.left-r.left,right:l.right-r.right,time:document.querySelector('#playtime').textContent,total:document.querySelector('#playduration').textContent};});
  const check=async(fraction)=>{const m=await read();assert(Math.abs(m.ratio-fraction)<.00001,JSON.stringify(m));assert(m.left>=-1&&m.right<=1,'label stays inside track');const expected=Math.max(m.half,Math.min(m.width-m.half,6+(m.width-12)*fraction));assert(Math.abs(m.centre-expected)<1.2,'time label must follow the thumb: '+JSON.stringify(m));return m;};
  for(const width of [320,361,412,768]){
   await page.setViewportSize({width,height:873});const positions=[];
   for(const fraction of [0,.1,.25,.5,.75,.95,1]){
    playback.position=600000*fraction;await page.waitForFunction(v=>Number(document.querySelector('#seek').value)===v,playback.position);
    positions.push({fraction,...await check(fraction)});
   }
   assert(positions[5].centre>positions[5].width*.7,'95% position must pass the middle');metrics.push({width,positions});
   playback.position=570000;await page.waitForFunction(()=>Number(document.querySelector('#seek').value)===570000);await page.screenshot({path:path.join(out,'progress-95-'+width+'.png')});
  }
  // input previews immediately and stays put while a native poll still reports the old position.
  await page.locator('#seek').evaluate(el=>{el.value=150000;el.dispatchEvent(new Event('input',{bubbles:true}));});await page.waitForTimeout(160);await check(.25);assert.equal((await read()).time,'02:30');
  await page.locator('#seek').evaluate(el=>el.dispatchEvent(new Event('change',{bubbles:true})));await page.waitForTimeout(100);assert.equal(playback.position,150000);
  // A second forward drag and a backward drag update the same visible indicator.
  for(const value of [570000,60000]){await page.locator('#seek').evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},value);await check(value/600000);await page.locator('#seek').evaluate(el=>el.dispatchEvent(new Event('change',{bubbles:true})));await page.waitForTimeout(100);}
  // Long durations change the label width; centering and both edge bounds still hold.
  await page.evaluate(()=>{const c=bajiaoEngine.state.books[0].chapters[0];c.duration=7200;window.renderApp();});
  playback.position=6840000;await page.waitForFunction(()=>Number(document.querySelector('#seek').value)===6840000);await check(.95);assert.equal((await read()).total,'120:00');
  await click('back');await click('read:'+stream.id);await click('go:listen');
  await page.locator('#seek').evaluate(el=>{el.value=85000;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});await page.waitForTimeout(120);await check(.85);assert.equal((await read()).time,'01:25');assert.equal(playback.position,5000);assert.equal(playback.playing,false);
  await page.evaluate(()=>{const c=bajiaoEngine.state.books[0].chapters[1];c.segments[10].audio='stream-10';window.renderApp();});
  await page.waitForFunction(()=>Number(document.querySelector('#seek').max)===110000);await check(85000/110000);assert.equal((await read()).total,'01:50');
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'ui-report.json'),JSON.stringify({pass:true,metrics,stream:await read(),errors},null,2));
  console.log('PASS 320/361/412/768: playback 0–100%, correct thumb/label position, bounded edges, drag preview/backward seek, long times and growing stream duration');
 }finally{await browser.close();server.close();}
})().catch(err=>{console.error(err);process.exitCode=1;});

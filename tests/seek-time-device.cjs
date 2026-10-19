// Real Android touch input; observation over CDP. Restores the original paused position.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {connect,run,sleep}=require('./device-harness.cjs');
const finger=(x,y)=>run(['shell','input','tap',String(x),String(y)]);
(async()=>{
 const out='artifacts/seek-time/',before=JSON.parse(fs.readFileSync(out+'phone-before.json')),original=before.playback;
 const h=await connect(),report={before,checks:[]};
 run(['shell','uiautomator','dump','/sdcard/bajiao-seek.xml']);
 const xml=run(['exec-out','cat','/sdcard/bajiao-seek.xml']).toString(),web=xml.match(/<node[^>]*class="android.webkit.WebView"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);assert(web);
 const inset=Number(web[2]);
 const tap=async selector=>{const p=await h.page.evaluate(selector=>{const el=document.querySelector(selector);if(!el)return null;const r=el.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return {x:x*devicePixelRatio,y:y*devicePixelRatio,hit:el.contains(document.elementFromPoint(x,y))};},selector);assert(p?.hit,'visible native touch target '+selector);finger(Math.round(p.x),Math.round(p.y+inset));await sleep(450);};
 const read=()=>h.read(async()=>{const p=await device.call('playbackState'),e=document.querySelector('#seek'),t=e?.closest('.vc-seek-track'),r=t?.getBoundingClientRect(),l=t?.querySelector('.vc-seek-times')?.getBoundingClientRect();return {playback:p,seek:e?{value:Number(e.value),max:Number(e.max),ratio:parseFloat(getComputedStyle(t).getPropertyValue('--seek-position'))/100,width:r.width,centre:l.x+l.width/2-r.x,half:l.width/2,left:l.left-r.left,right:l.right-r.right,text:t.querySelector('.vc-seek-times').textContent}:null};});
 try{
  const target=await h.page.evaluate(id=>{for(const b of bajiaoEngine.state.books){const c=b.chapters.find(c=>c.audio===id);if(c)return {bid:b.id,cid:c.id};}},original.id);assert(target);
  if(!await h.read(()=>!!document.querySelector('#seek'))){await tap('[data-act="book:'+target.bid+'"]');await tap('[data-act="read:'+target.cid+'"]');await tap('[data-act="go:listen"]');}

  for(const fraction of [.25,.5,.75,.95]){
   const point=await h.page.evaluate(f=>{const e=document.querySelector('#seek'),r=e.getBoundingClientRect(),x=r.left+6+(r.width-12)*f,y=r.top+r.height/2;return {x:x*devicePixelRatio,y:y*devicePixelRatio,hit:document.elementFromPoint(x,y)===e};},fraction);assert(point.hit);
   finger(Math.round(point.x),Math.round(point.y+inset));await sleep(450);
   const m=await read();assert.equal(m.playback.playing,false);assert.equal(m.playback.id,original.id);assert(Math.abs(m.seek.ratio-fraction)<.012,JSON.stringify(m));
   assert(Math.abs(m.seek.value-m.playback.position)<600);assert(m.seek.left>=-1&&m.seek.right<=1);const expected=Math.max(m.seek.half,Math.min(m.seek.width-m.seek.half,6+(m.seek.width-12)*m.seek.ratio));assert(Math.abs(m.seek.centre-expected)<1.5);
   report.checks.push({fraction,...m});
  }
  await h.page.evaluate(p=>device.call('playback',{op:'seek',value:p.position}),original);await sleep(1700);
  report.after=await read();assert.equal(report.after.playback.position,original.position);assert.equal(report.after.playback.playing,original.playing);
  assert(Math.abs(report.after.seek.ratio-original.position/original.duration)<.0001);assert(report.after.seek.centre>report.after.seek.width*.7);
  fs.writeFileSync(out+'phone-after.png',run(['exec-out','screencap','-p']));report.pass=true;
 }finally{
  if(!report.pass)await h.page.evaluate(p=>device.call('playback',{op:'seek',value:p.position}),original).catch(()=>{});
  fs.writeFileSync(out+'device-report.json',JSON.stringify(report,null,2));await h.browser.close();
 }
 console.log('PASS USB touch at 25/50/75/95%; time label and fill track native progress, remain bounded, and original 14:32 paused position restored');
})().catch(e=>{console.error(e);process.exitCode=1;});

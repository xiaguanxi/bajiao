// Shipped assets with local playback snapshots; never calls model services.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/xiagu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const V=require('../app/src/main/assets/core.js');
(async()=>{
 const root=path.resolve('app/src/main/assets'),out=path.resolve('artifacts/reader-playback');fs.mkdirSync(out,{recursive:true});
 const e=new V.Engine({saveState:async()=>{}}),text=Array.from({length:64},(_,i)=>i===7?'“这是跨行的第八句，\n下面的文字也属于同一句。”':`这是第${i+1}句，沿着山路继续往前走，故事仍在继续。`).join('\n');
 const b=await e.addBook('播放定位','第一章 整章\n'+text+'\n第二章 流播\n'+text),other=await e.addBook('另一本书','第一章\n另一段正文。');
 Object.assign(e.state.settings,{autoProduceUpcoming:false,speakerUncertaintyMode:'review'});
 const whole=b.chapters[0],stream=b.chapters[1];
 for(const [index,c] of b.chapters.entries()){
  c.segments=V.units(c.text).map(unit=>({...unit,speaker:'旁白',confidence:1,annotationStatus:'complete',audio:index===1&&unit.id>35?null:'part-'+index+'-'+unit.id+'.wav',durMs:900+(unit.id%4)*650}));c.status='annotated';
 }
 let at=0;const parts=[];
 for(const s of whole.segments){if([17,37].includes(s.id)){s.audio='skip';s.skip=true;continue;}at+=parts.length?(s.id%3)*125:0;parts.push({id:s.id,audio:s.audio,startMs:at,endMs:at+s.durMs});at+=s.durMs;}
 Object.assign(whole,{audio:'whole.wav',duration:at/1000,status:'ready',audioTimeline:{version:1,audio:'whole.wav',parts}});
 other.chapters[0].segments=V.units(other.chapters[0].text).map(unit=>({...unit,speaker:'旁白',confidence:1,annotationStatus:'complete'}));other.chapters[0].status='annotated';
 const start=id=>parts.find(part=>part.id===id).startMs+100;
 let state=JSON.parse(JSON.stringify(e.state)),playback={id:'',position:0,playing:false},holdReads=false;const heldReads=[],errors=[],requests=[],checks=[];
 const chapters=new Map(state.books.flatMap(book=>book.chapters).map(c=>[c.id,c]));
 const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return res.writeHead(404).end();res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:393,height:873}});page.setDefaultTimeout(8000);page.on('pageerror',err=>errors.push(err.message));
 try{
  await page.exposeFunction('fixtureNative',async(id,action,payload)=>{
   const p=JSON.parse(payload||'{}');let result=true,error=null;
   if(action==='load')result={state,llmConfigured:false,ttsConfigured:false};
   else if(action==='saveSnapshot'){for(const c of JSON.parse(p.chapters))chapters.set(c.id,c);state=JSON.parse(p.header);for(const book of state.books)book.chapters=book.chapters.map(c=>({...chapters.get(c.id),...c}));}
   else if(action==='loadChapter')result=chapters.get(p.id);
   else if(action==='playbackState'){result={...playback};if(holdReads)await new Promise(resolve=>heldReads.push(resolve));}
   else if(action==='play')playback={...p,playing:!p.startPaused,position:p.position||0};
   else if(action==='playback'){if(p.op==='pause')playback.playing=false;if(p.op==='resume')playback.playing=true;if(p.op==='seek')playback.position=p.value;}
   else if(action==='networkState')result='wifi';
   else if(action==='audioDurations')result={};
   else if(action==='request'){requests.push(p.provider);error={message:'Unexpected model request',retryable:false};}
   if(!page.isClosed())await page.evaluate(value=>window.nativeResult(value),{id,result:error?null:result,error});
  });
  await page.addInitScript(()=>window.Native={call:(...args)=>window.fixtureNative(...args)});
  const act=a=>page.locator('[data-act="'+a+'"]').first().click(),mode=()=>page.locator('main').getAttribute('data-page');
  const selected=async(p,id,center=true)=>{
   await page.waitForFunction(({p,id})=>{const main=document.querySelector('main'),nodes=[...main.querySelectorAll('.vc-playing-segment')],attribute=p==='raw'?'data-rawseg':'data-seg';return main.dataset.page===p&&nodes.length&&nodes.every(node=>node.getAttribute(attribute)===String(id)&&node.getAttribute('aria-current')==='true');},{p,id});
   if(center)await page.waitForFunction(()=>{const el=document.querySelector('.vc-playing-segment'),box=el.getBoundingClientRect(),nav=document.querySelector('.vc-nav').getBoundingClientRect(),mini=document.querySelector('.vc-mini-player')?.getBoundingClientRect(),middle=(box.top+box.bottom)/2;return middle>45&&middle<Math.min(nav.top,mini?.top??innerHeight)-8;});
  };
  const shot=name=>page.screenshot({path:path.join(out,name+'.png'),animations:'disabled'});
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.bajiaoEngine);await act('book:'+b.id);await act('read:'+whole.id);await act('playchapter');await page.waitForFunction(()=>document.querySelector('#playBtn')?.dataset.playing==='true');
  playback.position=start(24);await act('go:raw');await selected('raw',24);await shot('whole-raw');
  await page.waitForTimeout(2100);await page.evaluate(()=>bajiaoEngine.persist());await selected('raw',24);checks.push('whole playback enters raw text at the measured sentence boundary with a persistent accessible highlight across background saves');
  await page.evaluate(()=>scrollTo(0,0));const before=await page.evaluate(()=>scrollY);playback.position=start(29);await selected('raw',29,false);assert.equal(await page.evaluate(()=>scrollY),before);checks.push('current highlight follows progress while manual reading scroll stays unchanged');
  await act('go:annotated');await selected('annotated',29);playback.position=start(42);await act('go:raw');await selected('raw',42);await act('go:annotated');await selected('annotated',42);await shot('whole-annotated');checks.push('raw and annotated switches always read the latest playback snapshot');
  playback.position=0;await act('go:raw');await selected('raw',0);checks.push('the first sentence is selected at zero milliseconds');
  playback.position=start(7);await act('go:annotated');await selected('annotated',7);await act('go:raw');await selected('raw',7);assert.equal(await page.locator('.vc-playing-segment').count(),2);checks.push('all raw text spans of a multiline sentence share the highlight');
  playback.position=parts.find(part=>part.id===11).startMs-1;await act('go:annotated');await selected('annotated',10);playback.position=start(16);await selected('annotated',16,false);playback.position=start(18);await selected('annotated',18,false);checks.push('measured merge gaps and skipped advertisements do not select the wrong sentence');
  await act('go:raw');await selected('raw',18);await act('readersettings');playback.position=start(45);await page.evaluate(()=>window.appBack());await selected('raw',45);checks.push('returning from reading settings also centers the current playback sentence');
  holdReads=true;await act('go:annotated');await act('go:raw');await act('readersettings');holdReads=false;for(const resolve of heldReads.splice(0))resolve();await page.waitForTimeout(250);assert.equal(await mode(),'readerpolicy');assert.equal(await page.evaluate(()=>scrollY),0);await page.evaluate(()=>window.appBack());await selected('raw',45);checks.push('late playback replies cannot scroll a page opened after leaving the reader');
  await act('back');await page.evaluate(async()=>{const e=bajiaoEngine,b=e.state.books[0],c=b.chapters[0];c.segments[2].confidence=0;e.state.tasks=[{id:'reader-confirmation',bookId:b.id,chapterId:c.id,status:'waiting',done:0,total:c.segments.length}];e.touch(c);await e.persist();});await act('confirm:'+whole.id);await page.waitForFunction(()=>document.activeElement?.dataset.seg==='2');assert.equal(await page.locator('.vc-playing-segment').getAttribute('data-seg'),'45');checks.push('an explicit confirmation target keeps focus and scroll priority over playback navigation');
  await page.evaluate(async()=>{const e=bajiaoEngine,c=e.state.books[0].chapters[0];e.state.tasks=[];c.segments[2].confidence=1;e.touch(c);await e.persist();});await act('back');await act('go:shelf');await act('book:'+other.id);await act('read:'+other.chapters[0].id);assert.equal(await page.locator('.vc-playing-segment').count(),0);assert.equal(playback.id,'whole.wav');checks.push('reading a different book does not jump to or highlight the playing book');
  await act('go:raw');await act('back');await act('go:shelf');await act('book:'+b.id);await act('read:'+stream.id);await act('go:listen');await act('playchapter');await act('streamsegment:22');await page.waitForFunction(()=>document.querySelector('.vc-transcript-line.active')?.dataset.segstream==='22');assert.equal(playback.id,'part-1-22.wav');playback.position=0;
  await act('go:raw');await selected('raw',22);await act('go:annotated');await selected('annotated',22);await shot('stream-annotated');checks.push('streaming uses its sentence identity even when the local offset is zero');
  holdReads=true;await act('go:raw');while(!heldReads.length)await new Promise(resolve=>setTimeout(resolve,10));playback.playing=false;await page.evaluate(()=>window.onNativePlaybackAction('completion',0,'part-1-22.wav'));holdReads=false;for(const resolve of heldReads.splice(0))resolve();await selected('raw',23);await act('go:annotated');await selected('annotated',23);checks.push('a stream advancing during the navigation request still centers the new sentence and updates its highlight');
  await act('back');await act('read:'+whole.id);await act('go:raw');assert.equal(await page.locator('.vc-playing-segment').count(),0);checks.push('playing another chapter does not override the explicitly opened chapter');
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);fs.writeFileSync(path.join(out,'ui-report.json'),JSON.stringify({passed:true,checks,errors,modelRequests:0},null,2));console.log(JSON.stringify({passed:true,checks},null,2));
 }catch(error){await page.screenshot({path:path.join(out,'failure.png'),animations:'disabled'});throw error;}
 finally{holdReads=false;for(const resolve of heldReads.splice(0))resolve();await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

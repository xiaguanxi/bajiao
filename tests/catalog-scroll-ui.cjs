// Real app assets with a native bridge fixture; scrolling uses browser wheel input.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/xiagu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const V=require('../app/src/main/assets/core.js');
(async()=>{
 const out=path.resolve('artifacts/catalog-20261015'),assets=path.resolve('app/src/main/assets');fs.mkdirSync(out,{recursive:true});
 const e=new V.Engine({saveState:async()=>{}}),b=await e.addBook('长篇目录',Array.from({length:240},(_,i)=>`第${i+1}章 标题${i+1}\n正文${i+1}。`).join('\n'));
 b.chapters.forEach((c,i)=>{if(i%3===2){c.audio='audio-'+i+'.wav';c.duration=60;c.status='ready';}c.segments=[{id:0,text:c.text,speaker:'旁白',confidence:1}];});
 Object.assign(b,{lastPlayedChapterId:b.chapters[128].id,lastPlayedAt:200});b.readProgress={chapterId:b.chapters[79].id,at:100};e.state.lastPlayback={bookId:b.id,chapterId:b.chapters[128].id,at:200,position:12000};e.state.settings.autoProduceUpcoming=false;
 b.chapters[128].lastPlayedPosition=12000;const full=JSON.parse(JSON.stringify(e.state));let state=JSON.parse(JSON.stringify(e.state));state.books[0].chapters=state.books[0].chapters.map(c=>{const {text,segments,...rest}=c;return {...rest,textLength:text.length,segmentCount:segments.length,unloaded:true};});
 const server=http.createServer((req,res)=>{const f=path.resolve(assets,'.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));if(!f.startsWith(assets+path.sep)||!fs.existsSync(f))return res.writeHead(404).end();res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(f));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:393,height:873}}),errors=[],plays=[],loads=[];page.on('pageerror',err=>errors.push(err.message));
  await page.exposeFunction('nativeCall',async(id,action,payload)=>{const p=JSON.parse(payload||'{}');let result=true;
   if(action==='load')result={state,llmConfigured:true,ttsConfigured:true};
   else if(action==='playbackState')result={playing:false,position:0};
   else if(action==='saveSnapshot'){const chapters=new Map(state.books.flatMap(b=>b.chapters).map(c=>[c.id,c]));for(const c of JSON.parse(p.chapters))chapters.set(c.id,c);state=JSON.parse(p.header);for(const b of state.books)b.chapters=b.chapters.map(c=>chapters.get(c.id)||c);}
   else if(action==='loadChapter'){loads.push(p.id);result=full.books[0].chapters.find(c=>c.id===p.id);}
   else if(action==='play'){plays.push(p);await page.evaluate(p=>window.fixturePlay=p,p);result=true;}
   await page.evaluate(v=>window.nativeResult(v),{id,result});
  });await page.addInitScript(()=>{window.Native={call:(...args)=>window.nativeCall(...args)};});await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.bajiaoEngine);
  const click=act=>page.locator('button[data-act="'+act+'"]').first().click();
  const waitAligned=id=>page.waitForFunction(id=>{const row=document.querySelector('[data-chapter-id="'+id+'"]'),heading=document.getElementById('catalog-heading');return row&&heading&&Math.abs(row.getBoundingClientRect().top-heading.getBoundingClientRect().bottom)<=1;},id);
  const row=id=>page.locator('[data-chapter-id="'+id+'"]');
  const goToChapter=async index=>{
   await click('openepisodes');await click('setchpage:'+Math.floor(index/50));await waitAligned(b.chapters[Math.floor(index/50)*50].id);
   for(let step=0;!await row(b.chapters[index].id).count()&&step<12;step++){await page.mouse.move(180,400);await page.mouse.wheel(0,700);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
   for(let step=0;step<4;step++){await row(b.chapters[index].id).evaluate(el=>window.scrollTo(0,Math.ceil(scrollY+el.getBoundingClientRect().top-document.getElementById('catalog-heading').offsetHeight)));await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}await waitAligned(b.chapters[index].id);
  };
  const visible=()=>page.evaluate(()=>{const top=document.getElementById('catalog-heading').getBoundingClientRect().bottom;return [...document.querySelectorAll('[data-chapter-id]')].filter(el=>{const r=el.getBoundingClientRect();return r.bottom>top+1&&r.top<innerHeight;}).map(el=>({id:el.dataset.chapterId,top:el.getBoundingClientRect().top}));});
  await click('book:'+b.id);await page.waitForFunction(()=>document.querySelector('.vc-chapter-current')?.getBoundingClientRect().top<100);
  assert.equal(await page.locator('main #chapterSearch,main #chapterFilter,main #chapterNumber,main [data-act="chapterjump"],main [data-act="editbook"],main [data-act="appendchapter"],main .vc-catalog-search,main .vc-detail-tools').count(),0,'unused catalog forms and buttons are removed without empty wrappers');
  assert.equal(await page.locator('[data-act="continuereading"]').count(),1);assert.equal(await page.locator('[data-act="go:roles"]').count(),1);
  await click('openepisodes');await click('setchpage:0');await waitAligned(b.chapters[0].id);await page.evaluate(()=>{window.scrollTo(0,0);return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});await page.screenshot({path:path.join(out,'simplified-book-details.png'),animations:'disabled'});await click('go:shelf');await click('book:'+b.id);await waitAligned(b.chapters[128].id);
  await page.screenshot({path:path.join(out,'current-progress.png')});assert.equal((await visible())[0].id,b.chapters[128].id);assert.equal(await row(b.chapters[128].id).getAttribute('aria-current'),'location');assert.equal(loads.length,0,'scrolling metadata must not load chapter text');assert((await page.locator('[data-act="openepisodes"]').innerText()).trim()==='选集 ▾');
  await page.screenshot({path:path.join(out,'current-progress.png')});
  for(const width of [320,768,393]){await page.setViewportSize({width,height:873});await click('go:shelf');await click('book:'+b.id);await waitAligned(b.chapters[128].id);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await page.screenshot({path:path.join(out,'current-progress.png')});const currentTop=await row(b.chapters[128].id).evaluate(el=>el.getBoundingClientRect().top);
  await page.mouse.move(180,400);const first=await page.locator('[data-chapter-id]').first().getAttribute('data-chapter-id');await page.mouse.wheel(0,-700);await page.waitForFunction(id=>document.querySelector('[data-chapter-id]').dataset.chapterId!==id,first);
  assert(Math.abs((await row(b.chapters[128].id).evaluate(el=>el.getBoundingClientRect().top))-currentTop-700)<2,'prepending preserves the viewport after the wheel movement');
  assert((await visible()).some(r=>b.chapters.findIndex(c=>c.id===r.id)<128));assert.equal(await page.locator('.vc-chapter-current').count(),1);
  for(let i=0;i<10;i++){await page.mouse.wheel(0,700);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
  assert(await page.locator('[data-chapter-id]').count()>50,'scrolling crosses former fifty-chapter limit');
  const ids=await page.locator('[data-chapter-id]').evaluateAll(rows=>rows.map(r=>r.dataset.chapterId));assert.equal(new Set(ids).size,ids.length);const indexes=ids.map(id=>b.chapters.findIndex(c=>c.id===id));assert(indexes.every((n,i)=>!i||n===indexes[i-1]+1),'original chapter order is continuous');
  const before=await visible();await page.evaluate(()=>window.bajiaoEngine.persist());await click('openepisodes');await click('closeepisodes');const after=await visible();assert.equal(after[0].id,before[0].id);assert(Math.abs(after[0].top-before[0].top)<2,'modal updates preserve the scroll anchor');
  await click('openepisodes');await click('setchpage:0');await waitAligned(b.chapters[0].id);assert.equal((await visible())[0].id,b.chapters[0].id);
  await goToChapter(239);assert.equal((await visible())[0].id,b.chapters[239].id,'last chapter can also be first visible');
  await goToChapter(128);
  await click('multiselect');await click('selectpage');assert.equal(await page.evaluate(()=>document.querySelector('[data-act="go:make"]').textContent.includes('50')),true);await click('multiselect');
  await row(b.chapters[128].id).locator('.vc-chapter-play').click();await page.locator('main[data-page="listen"]').waitFor();await page.waitForFunction(()=>document.querySelector('#transcriptPanel'));await page.waitForFunction(()=>window.fixturePlay?.id==='audio-128.wav');assert(plays.some(p=>p.id==='audio-128.wav'&&p.position===12000),'play icon resumes saved position');assert(loads.includes(b.chapters[128].id));
  await click('back');await page.locator('main[data-page="detail"]').waitFor();await page.waitForFunction(()=>document.querySelector('.vc-chapter-current')?.getBoundingClientRect().top<100);assert.equal((await visible())[0].id,b.chapters[128].id);
  await goToChapter(199);await click('read:'+b.chapters[199].id);await page.locator('main[data-page="annotated"]').waitFor();await click('back');await waitAligned(b.chapters[199].id);assert.equal(await row(b.chapters[199].id).getAttribute('aria-current'),'location');
  await page.screenshot({path:path.join(out,'catalog-after-return.png')});assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'ui-report.json'),JSON.stringify({passed:true,checks:['unused catalog forms and buttons removed','no empty tools wrapper','reading and role actions preserved','latest progress at first visible row','highlight current chapter','prepend earlier chapters','append across fifty','continuous original order','modal scroll stability','group jump','last chapter alignment','batch fifty selection','play icon resumes audio and enters player','return restores progress','newer reading progress supersedes listening','320/393/768 responsive layout'],errors},null,2));console.log('PASS simplified catalog, incremental scrolling, progress anchor, grouping and play navigation');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

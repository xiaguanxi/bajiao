// Verify the single right-side action and its two permitted captions in both catalogs.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/xiagu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const V=require('../app/src/main/assets/core.js');
(async()=>{
 const assets=path.resolve('app/src/main/assets'),out=path.resolve('artifacts/chapter-action-states');fs.mkdirSync(out,{recursive:true});
 const e=new V.Engine({saveState:async()=>{}}),b=await e.addBook('雾山来信',Array.from({length:12},(_,i)=>`第${i+1}章 ${['山间来信','旧日回声','雨后的长街','远方的灯火','天亮之前','未寄出的信'][i%6]}\n山间的风停了，故事才刚刚开始。`).join('\n'));
 e.state.settings.autoProduceUpcoming=false;e.state.settings.wifiOnlyProduction=false;
 const chapter=i=>b.chapters[i],task=(i,status)=>({id:'task-'+i,bookId:b.id,chapterId:chapter(i).id,status,phase:'合成对白'});
 for(const [i,duration] of [[0,340],[1,323],[11,3661]])Object.assign(chapter(i),{audio:'ready-'+i+'.wav',duration,status:'ready'});
 chapter(2).title='第3章 雨后的长街，藏着那些还没说出口的往事';chapter(3).title='第4章 远方的灯火';chapter(4).title='第5章 天亮之前，那封穿过山海的来信终于抵达了故乡';
 chapter(1).listened=true;chapter(4).audioCleared=true;chapter(4).listened=true;
 chapter(7).segments=[{id:0,text:'示例正文',speaker:'旁白',confidence:1}];chapter(7).status='annotated';
 chapter(5).status='waiting';chapter(10).status='skipped';chapter(11).audioStale=true;
 e.state.tasks=[task(3,'running'),task(5,'waiting'),task(6,'queued'),task(8,'failed'),task(9,'paused'),task(11,'running')];
 const state=JSON.parse(JSON.stringify(e.state)),tasks=state.tasks,errors=[],plays=[];state.tasks=[];
 const server=http.createServer((req,res)=>{const f=path.resolve(assets,'.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));if(!f.startsWith(assets+path.sep)||!fs.existsSync(f))return res.writeHead(404).end();res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(f));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:393,height:873},colorScheme:'light'});page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
  await page.exposeFunction('nativeCall',async(id,action,payload)=>{const p=JSON.parse(payload||'{}');let result=true;if(action==='load')result={state,llmConfigured:true,ttsConfigured:true};else if(action==='networkState')result='wifi';else if(action==='playbackState')result={playing:false,position:0};else if(action==='play')plays.push(p.id);await page.evaluate(v=>window.nativeResult(v),{id,result});});
  await page.addInitScript(()=>{window.Native={call:(...args)=>window.nativeCall(...args)};});await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.vocastEngine);await page.evaluate(tasks=>{const e=window.vocastEngine;e.kick=async()=>{};e.state.tasks=tasks;window.renderApp();},tasks);
  const act=a=>page.locator('button[data-act="'+a+'"]').first().click(),row=(i,root='#chapter-list')=>page.locator(root+' [data-chapter-id="'+chapter(i).id+'"]'),shot=name=>page.screenshot({path:path.join(out,name+'.png')});
  const verify=async(root)=>{
   assert.equal(await page.locator(root+' .vc-tag, '+root+' .vc-status-badge, '+root+' .vc-chapter-confirm, '+root+' .vc-current-marker').count(),0,'chapter rows have no extra tags');
   for(let i=0;i<12;i++){
    const r=row(i,root),control=r.locator('.vc-chapter-action');assert.equal(await control.locator('button').count(),1,'each chapter has exactly one right-side button');
    assert.equal(await control.locator(i===0||i===1||i===11?'.vc-chapter-play':'.vc-chapter-produce').count(),1);
    assert.equal(await control.locator(i===0||i===1||i===11?'svg.lucide-play':'svg.lucide-wand-sparkles').count(),1,'the selected magic wand renders for production actions');
    const metadata=(await r.locator('.vc-chapter-meta').textContent()).trim();assert.equal(metadata,[0,1,11].includes(i)?{0:'05:40',1:'05:23',11:'61:01'}[i]:'15 字','audio duration replaces the character count only for available audio');
    const caption=[3,6,11].includes(i)?'制作中':[1,4].includes(i)?'已听完':'';assert.equal((await control.locator('.vc-chapter-caption').allTextContents()).join(''),caption,'chapter '+i+' '+JSON.stringify(await page.evaluate(()=>window.vocastEngine.state.tasks.map(t=>({id:t.id,status:t.status})))));
   }
  };
  const verifyLayout=async root=>{
   for(const i of [0,1,2,3,4]){
    const r=row(i,root),button=r.locator('.vc-chapter-action button'),box=await button.boundingBox();assert(box.width>=44&&box.height>=44,'icon keeps its touch target');
    assert.equal(await button.evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)','action has no background in any state or theme');
    assert.equal(await button.evaluate(el=>getComputedStyle(el).boxShadow),'none');
    if(i!==2&&i!==4)assert((await r.boundingBox()).height<=76,'single-line chapter rows are compact');
    if(!await r.locator('.vc-chapter-caption').count()){
     const bounds=await r.boundingBox();assert(Math.abs(box.y+box.height/2-bounds.y-bounds.height/2)<1,'without a caption the button centers vertically in the whole chapter row');continue;
    }
    const name=await r.locator('.vc-chapter-name').boundingBox();assert(Math.abs(box.y+box.height/2-name.y-name.height/2)<1,'with a caption the icon aligns with the chapter title');
    const caption=await r.locator('.vc-chapter-caption').boundingBox(),meta=await r.locator('.vc-chapter-meta').boundingBox();
    assert(caption.y>=box.y+box.height-.5,'status sits below its icon');assert(Math.abs(caption.y-meta.y)<1&&Math.abs(caption.height-meta.height)<1,'left metadata and right status align');
    assert(Math.abs(caption.x+caption.width/2-box.x-box.width/2)<1,'status centers below its action');
   }
  };
  await act('book:'+b.id);await page.locator('.vc-catalog-handle').click();await page.waitForTimeout(300);await verify('#chapter-list');
  // Check actual placement and screenshot the mixed states at phone widths.
  for(const width of [320,393]){
   await page.setViewportSize({width,height:873});await page.locator('#catalog-scroll').evaluate(el=>el.scrollTop=0);await page.mouse.move(0,0);await shot('detail-'+width);
   await verifyLayout('#chapter-list');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  await act('multiselect');assert.equal(await page.locator('#chapter-list .vc-tag, #chapter-list .vc-chapter-action').count(),0);await act('multiselect');
  // A released chapter regenerates once and replaces its caption with "制作中".
  await row(4).locator('.vc-chapter-produce').click();await row(4).getByText('制作中',{exact:true}).waitFor();assert.equal(await page.evaluate(id=>window.vocastEngine.state.tasks.filter(t=>t.chapterId===id).length,chapter(4).id),1);
  await row(4).locator('.vc-chapter-produce').click();await page.locator('.vc-modal-overlay').waitFor();assert.equal(await page.evaluate(id=>window.vocastEngine.state.tasks.filter(t=>t.chapterId===id).length,chapter(4).id),1);await act('closeunmade');
  await row(0).locator('.vc-chapter-play').click();await page.locator('main[data-page="listen"]').waitFor();assert(plays.includes('ready-0.wav'));await act('playercatalog');
  // Restore the released fixture to inspect the same state matrix in the player sheet.
  await page.evaluate(id=>{const e=window.vocastEngine;e.state.tasks=e.state.tasks.filter(t=>t.chapterId!==id);window.renderApp();},chapter(4).id);await verify('#player-catalog-scroll');await verifyLayout('#player-catalog-scroll');await shot('player-catalog');
  await act('closeplayercatalog');await act('back');await page.locator('main[data-page="detail"]').waitFor();await page.locator('.vc-catalog-handle').click();await page.waitForTimeout(300);await page.emulateMedia({colorScheme:'dark'});await page.mouse.move(0,0);await shot('detail-dark');
  await verifyLayout('#chapter-list');assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({passed:true,checks:['ready / listened / unmade / running / released / waiting / queued / annotated / failed / paused / skipped / stale audio','exactly one action without background','audio duration replaces character count','metadata and status share a baseline, including long titles','compact single-line rows','320/393px touch size and alignment','management has no tags','released chapter regenerates without duplicates','play starts existing audio','player catalog matches detail','dark mode'],errors},null,2));console.log('PASS chapter action state matrix, playback, regeneration, player catalog and compact layout');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

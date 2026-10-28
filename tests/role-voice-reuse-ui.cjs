const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/xiagu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {makeState}=require('../app/src/main/assets/core.js');
(async()=>{
 const root=path.resolve('app/src/main/assets'),out=path.resolve('artifacts/role-voice-reuse');fs.mkdirSync(out,{recursive:true});
 const state=makeState();state.settings.autoProduceUpcoming=false;
 const roles=['韩青','周明','沈砚','旁白','路人甲'].map(name=>({name,voice:'voice-'+name,description:'青年男性，清亮、温润，普通话。',background:'原文中的人物。',profileChecked:true,bitPart:name==='韩青'||name==='路人甲',bitPartSource:'llm'}));
 state.voices=roles.map(r=>({id:r.voice,name:r.name+'的声音',description:r.description,sample:r.voice+'.wav',enabled:true}));
 const full=new Map();
 const chapters=Array.from({length:12},(_,i)=>{
  const speakers=['旁白'];if(i>=3&&i<=9)speakers.push('沈砚');if(i===0)speakers.push('路人甲');if(i===3)speakers.push('周明');if(i===11)speakers.push('韩青');
  const c={id:'c'+(i+1),title:'第'+(i+1)+'章',text:'请进。',status:'ready',audio:'chapter-'+i+'.wav',segments:speakers.map((speaker,id)=>({id,speaker,text:'请进。',confidence:1,annotationStatus:'complete',audio:'line-'+i+'-'+id+'.wav'}))};
  full.set(c.id,c);return {id:c.id,title:c.title,status:c.status,audio:c.audio,segmentCount:c.segments.length,unloaded:true,segments:[]};
 });
 state.books=[{id:'b',name:'音色复用规则',characters:roles,chapters}];
 let stored=state,reads=0,modelCalls=0;const errors=[];
 const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return res.writeHead(404).end();res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:393,height:873}});page.on('pageerror',e=>errors.push(e.message));
  await page.exposeFunction('nativeCall',async(id,action,raw)=>{
   const p=JSON.parse(raw||'{}');let result=true;
   if(action==='load')result={state:stored,llmConfigured:false,ttsConfigured:false};
   else if(action==='loadChapter'){reads++;result=full.get(p.id);}
   else if(action==='saveSnapshot')stored=JSON.parse(p.header);
   else if(action==='playbackState')result={playing:false,position:0};
   else if(action==='request'){modelCalls++;throw Error('role sorting must not call a model');}
   await page.evaluate(v=>window.nativeResult(v),{id,result});
  });
  await page.addInitScript(()=>{window.Native={call:(...args)=>window.nativeCall(...args)};});
  const openRoles=async()=>{await page.locator('[data-act="book:b"]').click();await page.locator('[data-act="go:roles"]').click();await page.waitForFunction(()=>document.querySelector('[data-role-name="沈砚"] .vc-role-appearance')?.textContent.includes('已出场 7 章'));};
  await page.goto('http://127.0.0.1:'+server.address().port);await openRoles();
  assert.deepEqual(await page.locator('.vc-role-card').evaluateAll(nodes=>nodes.map(n=>n.dataset.roleName)),['旁白','沈砚','韩青','周明','路人甲']);
  assert.match(await page.locator('[data-role-name="周明"] .vc-role-appearance').innerText(),/已出场 1 章.*低频且近期未出场/);
  assert.match(await page.locator('[data-role-name="路人甲"] .vc-role-appearance').innerText(),/低频且近期未出场/);
  assert(!await page.locator('main').innerText().then(text=>text.includes('前三章保护')));
  assert.match(await page.locator('[data-role-name="韩青"] .vc-role-appearance').innerText(),/LLM 判定：龙套/);
  assert.equal(reads,12);assert(stored.books[0].chapters.every(c=>Array.isArray(c.characterAppearances)));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(out,'roles.png'),fullPage:true});
  await page.reload();await openRoles();assert.equal(reads,12,'saved metadata avoids rescanning chapter files after restart');
  await page.locator('[data-act="go:voicepolicy"]').last().click();assert.match(await page.locator('main').innerText(),/最近 5 个已标注章节未出现/);
  assert.equal(modelCalls,0);assert.deepEqual(errors,[]);
  console.log('PASS role ordering, chapter counts, rolling five-chapter lending rules and persistent lazy metadata');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

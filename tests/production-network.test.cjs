const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(type='wifi'){
 const win=new EventTarget(),connection=new EventTarget();connection.type=type;
 const context=vm.createContext({module:{exports:{}},require:p=>require('../app/src/main/assets/'+p.replace('./','')),console,setTimeout,clearTimeout,Event,window:win,navigator:{onLine:true,connection}});
 vm.runInContext(fs.readFileSync('app/src/main/assets/core.js','utf8'),context);context.Bajiao=context.module.exports;
 vm.runInContext(fs.readFileSync('app/src/main/assets/production-network.js','utf8'),context);
 const V=context.Bajiao,e=new V.Engine({saveState:async()=>{},mergeAudio:async()=>({id:'merged.wav',duration:2})});win.bajiaoEngine=e;
 return {e,V,win,set(n){connection.type=n;connection.dispatchEvent(new Event('change'));},native(n){win.onNativeNetworkChange(n);}};
}
async function book(e){const b=await e.addBook('network','第1章 开始\n甲。乙。\n第2章 继续\n丙。');for(const c of b.chapters)c.segments=c.text.match(/[^。]+。/g).map((text,id)=>({id,text,speaker:'旁白',confidence:1}));e.state.settings.ttsParallel=1;return b;}
async function settle(e){for(let n=0;n<50&&(e.running||e.state.tasks.some(t=>t.status==='queued'||t.status==='running'));n++)await new Promise(r=>setTimeout(r,5));}

test('new installations use automatic voice adoption, upgrades retain an explicit manual setting',()=>{
 const {V,e}=fixture();assert.equal(e.state.settings.mode,'auto');assert.equal(e.state.settings.wifiOnlyProduction,false);
 const state=V.makeState();state.settings.mode='manual';state.settings.llmModel='saved-model';const upgraded=new V.Engine({},state);assert.equal(upgraded.state.settings.mode,'manual');assert.equal(upgraded.state.settings.llmModel,'saved-model');
});
test('native network state overrides an unavailable or stale browser connection type',()=>{
 const f=fixture('wifi');f.native('other');assert.equal(f.e.productionNetworkState(),'other');f.native('offline');assert.equal(f.e.productionNetworkAllowed({}),false);f.native('wifi');assert.equal(f.e.productionNetworkState(),'wifi');
});
test('Wi-Fi loss stops before the next paid synthesis; reconnect resumes without replacing completed audio',async()=>{
 const f=fixture(),{e}=f,b=await book(e),c=b.chapters[0],calls=[];e.state.settings.wifiOnlyProduction=true;
 e.synthesize=async text=>{calls.push(text);if(calls.length===1)f.set('cellular');return {id:'audio-'+calls.length,duration:1};};
 await e.enqueue(b.id,[c.id]);const t=e.state.tasks[0];assert.equal(t.status,'queued');assert.equal(t.networkWaiting,true);assert.equal(calls.length,1);assert.equal(c.segments[0].audio,'audio-1');assert(!c.segments[1].audio);
 f.set('wifi');await settle(e);assert.equal(t.status,'done');assert.deepEqual(calls,['甲。','乙。']);assert.equal(c.segments[0].audio,'audio-1');
});
test('one-time consent permits only selected chapters, clears on a network change and cannot override offline',async()=>{
 const f=fixture('cellular'),{e}=f,b=await book(e);e.state.settings.wifiOnlyProduction=true;let count=0;e.synthesize=async()=>({id:'audio-'+(++count),duration:1});
 e.grantProductionScope([{bookId:b.id,chapterId:b.chapters[0].id}]);await e.enqueue(b.id,b.chapters.map(c=>c.id));assert.equal(e.state.tasks[0].status,'done');assert.equal(e.state.tasks[1].status,'queued');assert.equal(count,2);
 e._productionGrants=new Set(['scope']);f.set('wifi');assert.equal(e._productionGrants.size,0);await settle(e);assert.equal(e.state.tasks[1].status,'done');
 f.set('none');e._productionGrants.add('scope');assert.equal(e.productionNetworkAllowed({id:'scope'}),false);
});
test('offline segment regeneration does not send a request or replace existing audio',async()=>{
 const f=fixture('none'),{e}=f,b=await book(e),c=b.chapters[0];c.segments[0].audio='original.wav';let calls=0;e.synthesize=async()=>{calls++;return {id:'new.wav'};};
 await assert.rejects(e.regenerateSegment(b.id,c.id,0),/当前无网络/);assert.equal(calls,0);assert.equal(c.segments[0].audio,'original.wav');
});
test('request retry setting bounds all automatic attempts and exhaustion survives reload and reconnect',async()=>{
 const {e,V}=fixture(),b=await book(e);e.state.settings.retries=2;let calls=0;e.io.sleep=async()=>{};e.io.request=async()=>{calls++;throw new V.ApiError('network timeout',408,true);};
 e.synthesize=async()=>e.performRequest('tts',{model:'test'});await e.enqueue(b.id,[b.chapters[0].id]);assert.equal(calls,3);assert.equal(e.state.tasks[0].status,'failed');assert.equal(e.state.tasks[0].retryWaiting,false);assert.equal(e.state.tasks[0].nextRetryAt,undefined);
 assert.equal(e.state.tasks[0].message,'重试2次后仍然失败，请手动处理。');
 const restored=new V.Engine(e.io,JSON.parse(JSON.stringify(e.state)));await restored.recoverProduction();assert.equal(restored.state.tasks[0].status,'failed');assert.equal(calls,3);
 await e.refreshProductionNetwork(true);await e.kick();assert.equal(calls,3);
 calls=0;e.io.request=async()=>{calls++;throw new V.ApiError('unauthorized',401,false);};await assert.rejects(e.performRequest('tts',{}));assert.equal(calls,1);
});

test('reconnect bypasses transient backoff and keeps completed audio; duplicate callbacks do not bypass it',async()=>{
 const f=fixture(),{e,V}=f,b=await book(e),c=b.chapters[0],calls=[];e.state.settings.ttsParallel=1;let fail=true;
 e.synthesize=async text=>{calls.push(text);if(text==='乙。'&&fail)throw new V.ApiError('timeout',408,true);return {id:text,duration:1};};
 await e.enqueue(b.id,[c.id]);const t=e.state.tasks[0];assert.equal(t.retryWaiting,true);
 f.native('wifi');await new Promise(r=>setImmediate(r));assert.equal(calls.length,2,'unchanged network must respect backoff');
 f.native('offline');fail=false;f.native('wifi');await settle(e);
 assert.equal(t.status,'done');assert.equal(calls.filter(s=>s==='甲。').length,1);
});

test('priority yield keeps one-time cellular consent; a real user pause revokes it',async()=>{
 const f=fixture('cellular'),{e}=f,b=await book(e);e.state.settings.wifiOnlyProduction=true;e.kick=async()=>{};
 const t={id:'granted',bookId:b.id,chapterId:b.chapters[0].id,status:'running',pauseRequested:false};e.state.tasks=[t];e._frontActive.add(t);e._productionGrants=new Set([t.id]);
 await e.pause(t.id,'priority');e._frontActive.delete(t);t.status='paused';await e.finishTaskRun(t);
 assert.equal(t.status,'queued');assert.equal(e.productionNetworkAllowed(t),true);
 await e.pause(t.id);assert.equal(t.status,'paused');assert.equal(e.productionNetworkAllowed(t),false);
 f.native('wifi');await new Promise(r=>setImmediate(r));assert.equal(t.status,'paused');
});

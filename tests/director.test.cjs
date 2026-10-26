const {test}=require('node:test'),assert=require('node:assert/strict');
const {Engine,units,parseJson,ApiError,LlmOutputError,PROMPT_VERSION}=require('../app/src/main/assets/core.js');
const wave=require('./wav-fixture.cjs')();
const batchOf=p=>JSON.parse(p.split('本批片段：')[1]);
const labels=batch=>({lines:batch.map(s=>({id:s.id,speaker:'旁白',confidence:1,emotion:'没有生气，略带担忧',scene:'对方正要离开，叙述者描述挽留的经过。',delivery:'节奏先急后缓，轻轻强调挽留，收住尾音。'}))});
async function fixture(n=3){
 const calls=[],snapshots=[];let serial=0;
 const io={saveState:async text=>snapshots.push(JSON.parse(text)),request:async(provider,body)=>{calls.push({provider,body});return {choices:[{finish_reason:'stop',message:{audio:{data:wave}}}]};},saveRawAudio:async()=>({id:'raw-'+(++serial)+'.wav',duration:2}),saveAudio:async()=>({id:'saved-'+(++serial)+'.wav',duration:2}),readAudio:async()=>({base64:wave}),mergeAudio:async()=>({id:'chapter-'+(++serial)+'.wav',duration:3})};
 const e=new Engine(io),b=await e.addBook('导演测试',Array.from({length:n},(_,i)=>'原文'+i+'。').join('')),c=b.chapters[0];e.state.settings.retries=0;e.state.settings.promptMode='director';
 return {e,b,c,io,calls,snapshots};
}

test('new annotations persist and send scene/direction with restrained narration after reload',async()=>{
 const {e,b,c,io,calls,snapshots}=await fixture();let requests=0;e.llm=async p=>{requests++;return labels(batchOf(p));};await e.analyze(b.id,c.id);assert.equal(requests,1);
 const restored=new Engine(io,snapshots.at(-1)),s=restored.chapter(b.id,c.id).segments[0];assert.equal(s.directionVersion,1);
 await restored.regenerateSegment(b.id,c.id,s.id);const body=calls[0].body;
 assert.equal(body.messages[0].role,'user');assert(body.messages[0].content.startsWith('场景：'+s.scene+'\n指导：'+s.delivery));assert.equal(body.messages[0].content,'场景：'+s.scene+'\n指导：'+s.delivery);assert.deepEqual(body.messages[1],{role:'assistant',content:s.text});
 assert(!body.messages[0].content.includes('忠实朗读'));assert(!body.messages[0].content.includes('稳定声音'));
 assert.equal(s.lastSpeechRequest.prompt,body.messages[0].content);assert.equal(s.lastSpeechRequest.promptVersion,4);
});

test('24-line cap also bounds old unfinished queues without relabelling saved IDs',async()=>{
 const {e,b,c}=await fixture(53),input=units(c.text);c.segments=[{...input[0],speaker:'旁白',emotion:'旧情绪',confidence:1,audio:'old.wav'}];
 c.analysisDraft={version:1,next:1,batchSize:90,segments:c.segments};const before=JSON.stringify(c.segments[0]),sizes=[];
 e.llm=async p=>{const batch=batchOf(p);sizes.push(batch.length);return labels(batch);};await e.analyze(b.id,c.id);
 assert.deepEqual(sizes,[24,24,4]);assert.equal(JSON.stringify(c.segments[0]),before);
});

test('missing, invalid and oversized director fields repair only affected IDs once',async()=>{
 const {e,b,c}=await fixture(9),jobs=[];e.llm=async(p,options)=>{const batch=batchOf(p);jobs.push({task:options.task,ids:batch.map(s=>s.id)});const out=labels(batch);
  if(options.task==='annotation')for(const row of out.lines){if(row.id===0)delete row.delivery;if(row.id===2)row.scene='长'.repeat(61);if(row.id===3)row.delivery='长'.repeat(121);if(row.id===4)row.delivery=9;}
  return out;
 };await e.analyze(b.id,c.id);assert.deepEqual(jobs,[{task:'annotation',ids:[0,1,2,3,4,5,6,7,8]},{task:'direction',ids:[0,2,3,4]}]);assert(c.segments.every(s=>s.directionStatus==='ready'));
});

test('failed repair preserves a confirmed dialogue speaker and falls back to emotion',async()=>{
 const {e,b,c}=await fixture(1);c.text='“别走。”';b.characters.push({name:'林晚',description:'女声',voice:'preset:茉莉'});let count=0;
 e.llm=async(p,options)=>{count++;return options.task==='annotation'?{lines:[{id:0,speaker:'林晚',confidence:.96,emotion:'挽留，非责备',scene:'门口'}]}:{lines:[]};};
 await e.analyze(b.id,c.id);const s=c.segments[0];assert.equal(count,2);assert.equal(s.speaker,'林晚');assert.equal(s.confidence,.96);assert.equal(s.annotationStatus,'complete');assert.equal(s.directionStatus,'fallback');assert(s.directionError);assert.equal(s.directionVersion,undefined);
 assert.equal(e.speechDirection('preset:茉莉',s.emotion,'',undefined,s),'挽留，非责备');
});

test('repair checkpoint survives pause/reload and never repeats completed annotation',async()=>{
 const {e,b,c,io,snapshots}=await fixture(7);let pause=false;
 e.llm=async p=>{pause=true;return {lines:labels(batchOf(p)).lines.map(({scene,delivery,...s})=>s)};};await e.analyze(b.id,c.id,()=>pause);
 assert.equal(c.analysisDraft.pending[0].kind,'direction');assert.deepEqual(c.analysisDraft.pending.map(j=>j.ids.length),[5,2]);
 const restored=new Engine(io,snapshots.at(-1)),jobs=[];restored.llm=async(p,options)=>{jobs.push(options.task);return labels(batchOf(p));};await restored.analyze(b.id,c.id);
 assert.deepEqual(jobs,['direction','direction']);assert(restored.chapter(b.id,c.id).segments.every(s=>s.directionVersion===1));
});

test('manual role correction wins during repair and keeps explicit custom prompts',async()=>{
 const {e,b,c}=await fixture(1);b.characters.push({name:'新角色',voice:'preset:茉莉'});let release,entered;const started=new Promise(r=>entered=r);
 e.llm=async(p,options)=>{if(options.task==='annotation')return {lines:[{id:0,speaker:'旁白',emotion:'平静',confidence:1}]};entered();await new Promise(r=>release=r);return labels(batchOf(p));};
 const pending=e.analyze(b.id,c.id);await started;c.segments[0].ttsPrompt='用户自己的指导';await e.correct(b.id,c.id,0,'新角色','疑惑');release();await pending;
 const s=c.segments[0];assert.equal(s.speaker,'新角色');assert.equal(s.delivery,undefined);assert.equal(s.directionVersion,undefined);assert.equal(s.ttsPrompt,'用户自己的指导');
});

test('isolated annotation adds two neighbours and rejects context before target-only retry',async()=>{
 const {e,b,c}=await fixture(6),seen=[];e.llm=async(p,options)=>{const batch=batchOf(p);seen.push(p);
  if(seen.length===1)return {lines:labels(batch).lines.filter(s=>s.id!==3)};
  if(p.includes('仅供理解')&&p.includes('原文1。'))throw new ApiError('内容审核未通过 (1026)',1026,false);
  return labels(batch);
 };await e.analyze(b.id,c.id);assert.equal(seen.length,3);assert(seen[1].includes('原文1。'));assert(seen[1].includes('原文5。'));assert(!seen[2].includes('原文1。'));assert.equal(c.segments[3].directionVersion,1);
});

test('repair context rejection falls back to target-only without losing queue or speakers',async()=>{
 const {e,b,c}=await fixture(3),jobs=[];e.llm=async(p,options)=>{const batch=batchOf(p);jobs.push(options.task);
  if(options.task==='annotation')return {lines:labels(batch).lines.map(s=>s.id===1?{id:1,speaker:'旁白',confidence:1,emotion:'担忧'}:s)};
  if(p.includes('原文0。'))throw new ApiError('内容审核未通过 (1026)',1026,false);
  return labels(batch);
 };await e.analyze(b.id,c.id);assert.deepEqual(jobs,['annotation','direction','direction']);assert.equal(c.segments[1].directionVersion,1);
});

test('truncated repair degrades once; authentication errors retain the pending job',async()=>{
 for(const kind of ['truncated','auth']){const {e,b,c}=await fixture(1);e.llm=async(p,o)=>{if(o.task==='annotation')return {lines:[{id:0,speaker:'旁白',emotion:'克制',confidence:1}]};throw kind==='truncated'?new LlmOutputError('截断','truncated'):new ApiError('unauthorized',401,false);};
  if(kind==='auth'){await assert.rejects(e.analyze(b.id,c.id),/unauthorized/);assert.equal(c.analysisDraft.pending[0].kind,'direction');assert.equal(c.segments[0].directionStatus,'pending');}
  else{await e.analyze(b.id,c.id);assert.equal(c.segments[0].directionStatus,'fallback');assert.equal(c.segments[0].speaker,'旁白');}
 }
});

test('malformed envelope recovery preserves director strings, escapes and field order',()=>{
 const row={delivery:'强调“没有”，不是愤怒；保留 {停顿} 和 "引号"。',scene:'门口\\楼梯',confidence:1,emotion:'担忧',speaker:'旁白',id:0};
 const recovered=parseJson('{broken,"lines":['+JSON.stringify(row)+']}');assert.deepEqual(recovered.lines,[row]);
 const damaged=parseJson('{broken,"lines":[{id:1,speaker:"旁白",emotion:"担忧",confidence:1,scene:"重逢",delivery:"不要生气"}]}');assert.equal(damaged.lines[0].delivery,'不要生气');
});

test('legacy annotations never auto-upgrade; unguided speech omits user message',async()=>{
 const {e,b,c,calls}=await fixture(1);c.segments=[{id:0,text:c.text,speaker:'旁白',emotion:'不生气',confidence:1,scene:'旧场景',delivery:'旧的未启用指导',audio:'old.wav'}];c.audio='chapter.wav';const before=JSON.stringify(c);
 e.llm=async()=>{throw Error('must not annotate');};await e.analyze(b.id,c.id);assert.equal(JSON.stringify(c),before);assert.equal(e.speechDirection('preset:白桦','不生气','低沉男声',undefined,c.segments[0]),'不生气');
 await e.synthesize('测试。','preset:白桦');assert.deepEqual(calls[0].body.messages,[{role:'assistant',content:'测试。'}]);
});

test('custom directions win, empty scene is omitted and negations remain exact',()=>{
 const e=new Engine({}),s={directionVersion:1,scene:'',delivery:'不是赞扬，带冷淡轻讽；“准时”稍加重。'};
 assert.equal(e.speechDirection('preset:白桦','愤怒','男声',undefined,s),'指导：'+s.delivery);assert.equal(e.speechDirection('preset:白桦','愤怒','男声','  自己的\n指导  ',s),'  自己的\n指导  ');
 assert.equal(PROMPT_VERSION,4);
});

test('ads and punctuation never need director repair',async()=>{
 const {e,b,c}=await fixture(1);c.text='……\n广告。';let calls=0;e.llm=async p=>{calls++;return {lines:batchOf(p).map(s=>({id:s.id,speaker:s.text.includes('广告')?'广告':'旁白',emotion:'',confidence:1}))};};
 await e.analyze(b.id,c.id);assert.equal(calls,1);assert(c.segments.every(s=>!s.directionStatus&&!s.directionVersion));
});

test('director edits during TTS invalidate in-flight audio',async()=>{
 const {e,b,c,io}=await fixture(1);e.llm=async p=>labels(batchOf(p));await e.analyze(b.id,c.id);
 let entered,release;const started=new Promise(r=>entered=r);io.request=async()=>{entered();await new Promise(r=>release=r);return {choices:[{finish_reason:'stop',message:{audio:{data:wave}}}]};};
 const pending=e.regenerateSegment(b.id,c.id,0);await started;c.segments[0].delivery='冷淡轻讽，重音放在准时，不是赞扬。';release();assert.equal(await pending,false);assert(!c.segments[0].audio);
});

test('automatic narrator fallback discards character-specific director metadata',async()=>{
 const {e,b,c}=await fixture(1);e.llm=async()=>({lines:[{id:0,speaker:'未知角色',emotion:'惊恐',confidence:.1,scene:'门后有人',delivery:'惊恐尖叫'}]});
 await e.analyze(b.id,c.id);const s=c.segments[0];assert.equal(s.speaker,'旁白');assert.equal(s.directionVersion,undefined);assert.equal(s.delivery,undefined);assert.equal(e.speechDirection('preset:白桦',s.emotion,'',undefined,s),'自然朗读');
});

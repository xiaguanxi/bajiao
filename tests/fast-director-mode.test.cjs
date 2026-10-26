const {test}=require('node:test'),assert=require('node:assert/strict');
const {Engine,FAST_SPEECH_PROMPT,ModelPrompts}=require('../app/src/main/assets/core.js');
const audio=require('./wav-fixture.cjs')();

async function createFixture(handler){
 const calls=[],snapshots=[],merges=[];let n=0;
 const io={
  saveState:async s=>snapshots.push(JSON.parse(s)),
  request:async(provider,body)=>{
   calls.push({provider,body});
   if(handler)return handler(provider,body);
   return {choices:[{finish_reason:'stop',message:{audio:{data:audio}}}]};
  },
  saveRawAudio:async()=>({id:'new-'+(++n)+'.wav',duration:2,playable:true}),
  saveAudio:async()=>({id:'saved-'+(++n)+'.wav',duration:2}),
  readAudio:async()=>({base64:audio}),
  mergeAudio:async ids=>{merges.push(ids);return {id:'merged-'+(++n)+'.wav',duration:ids.length*2};},
  sleep:async()=>{}
 };
 const e=new Engine(io);
 e.state.settings.retries=0;
 return {e,io,calls,snapshots,merges};
}

test('default settings has promptMode fast and FAST_SPEECH_PROMPT defined', ()=>{
 const e=new Engine({});
 assert.equal(e.state.settings.promptMode, 'fast');
 assert.equal(FAST_SPEECH_PROMPT, '流利，吐字清晰。');
});

test('fast mode model prompt omits scene and delivery from schema and rules', ()=>{
 const batch=[{id:0,text:'“去哪里？”'}];
 const fastPrompt=ModelPrompts.annotation({text:batch[0].text,characters:[],batch,threshold:0.5,mode:'fast'});
 const directorPrompt=ModelPrompts.annotation({text:batch[0].text,characters:[],batch,threshold:0.5,mode:'director'});

 assert(!fastPrompt.includes('"scene":'));
 assert(!fastPrompt.includes('"delivery":'));
 assert(!fastPrompt.includes('必须同时生成 scene 和 delivery'));
 assert(fastPrompt.includes('快速模式下无需为片段生成场景和导演提示词'));

 assert(directorPrompt.includes('"scene":'));
 assert(directorPrompt.includes('"delivery":'));
 assert(directorPrompt.includes('必须同时生成 scene 和 delivery'));
});

test('fast mode chapter analysis does not require scene/delivery and synthesizes with FAST_SPEECH_PROMPT', async()=>{
 const {e,calls}=await createFixture();
 assert.equal(e.state.settings.promptMode, 'fast');

 const b=await e.addBook('快慢测试','第一章\n他问：“去哪里？”');
 const c=b.chapters[0];
 await e.bind(b.id,'旁白','preset:白桦');

 e.llm=async p=>{
  assert(!p.includes('"scene"'));
  assert(!p.includes('"delivery"'));
  return {
   lines:[{id:0,speaker:'旁白',emotion:'平静',confidence:1}]
  };
 };

 await e.analyze(b.id, c.id);
 assert.equal(c.promptMode, 'fast');
 assert.equal(c.segments[0].promptMode, 'fast');
 assert.equal(c.segments[0].scene, '');
 assert.equal(c.segments[0].delivery, '');
 assert.equal(c.segments[0].directionStatus, undefined);

 calls.length=0;
 await e.enqueue(b.id, [c.id]);
 assert.equal(e.state.tasks[0].status, 'done');

 const ttsCall=calls.find(call=>call.provider==='tts'||call.body?.messages);
 assert(ttsCall);
 assert.equal(ttsCall.body.messages[0].content, FAST_SPEECH_PROMPT);
});

test('fast mode appends single-character articulation instruction for 1-char sentences', async()=>{
 const {e,calls}=await createFixture();
 e.state.settings.promptMode='fast';
 const b=await e.addBook('单字测试','第一章\n好。');
 const c=b.chapters[0];
 await e.bind(b.id,'旁白','preset:白桦');

 e.llm=async()=>({lines:[{id:0,speaker:'旁白',emotion:'赞同',confidence:1}]});
 await e.analyze(b.id, c.id);

 calls.length=0;
 await e.enqueue(b.id, [c.id]);
 assert.equal(e.state.tasks[0].status, 'done');

 const ttsCall=calls.find(call=>call.provider==='tts'||call.body?.messages);
 assert(ttsCall);
 assert(ttsCall.body.messages[0].content.startsWith(FAST_SPEECH_PROMPT));
 assert(ttsCall.body.messages[0].content.includes('本句只有一个字，吐字务必清晰完整'));
});

test('director mode chapter analysis populates scene and delivery and formats speech direction', async()=>{
 const {e,calls}=await createFixture();
 e.state.settings.promptMode='director';

 const b=await e.addBook('导演测试','第一章\n“不要过去。”');
 const c=b.chapters[0];
 await e.bind(b.id,'旁白','preset:白桦');

 e.llm=async p=>{
  assert(p.includes('"scene"'));
  assert(p.includes('"delivery"'));
  return {
   lines:[{id:0,speaker:'旁白',emotion:'焦急',confidence:1,scene:'走廊昏暗',delivery:'压低声音急促提醒'}]
  };
 };

 await e.analyze(b.id, c.id);
 assert.equal(c.promptMode, 'director');
 assert.equal(c.segments[0].promptMode, 'director');
 assert.equal(c.segments[0].scene, '走廊昏暗');
 assert.equal(c.segments[0].delivery, '压低声音急促提醒');

 calls.length=0;
 await e.enqueue(b.id, [c.id]);
 assert.equal(e.state.tasks[0].status, 'done');

 const ttsCall=calls.find(call=>call.provider==='tts'||call.body?.messages);
 assert(ttsCall);
 assert(ttsCall.body.messages[0].content.includes('场景：走廊昏暗'));
 assert(ttsCall.body.messages[0].content.includes('指导：压低声音急促提醒'));
});

test('existing chapters preserve their mode when global setting is changed', async()=>{
 const {e,calls}=await createFixture();

 // 1. Start in Director Mode
 e.state.settings.promptMode='director';
 const b=await e.addBook('保持模式测试','第一章\n门轻轻开了。\n第二章\n阳光照进房间。');
 const c1=b.chapters[0];
 const c2=b.chapters[1];
 await e.bind(b.id,'旁白','preset:白桦');

 e.llm=async()=>({
  lines:[{id:0,speaker:'旁白',emotion:'神秘',confidence:1,scene:'深夜旧屋',delivery:'轻声慢读'}]
 });
 await e.analyze(b.id, c1.id);
 assert.equal(c1.promptMode, 'director');

 await e.enqueue(b.id, [c1.id]);
 assert.equal(e.state.tasks[0].status, 'done');
 const c1FirstCall=calls.find(call=>call.provider==='tts'||call.body?.messages);
 assert(c1FirstCall.body.messages[0].content.includes('场景：深夜旧屋'));

 // 2. Switch global settings to Fast Mode
 e.state.settings.promptMode='fast';

 // Chapter 1 should retain director mode upon segment regeneration
 calls.length=0;
 assert(await e.regenerateSegment(b.id, c1.id, 0));
 const c1RegenCall=calls.find(call=>call.provider==='tts'||call.body?.messages);
 assert(c1RegenCall.body.messages[0].content.includes('场景：深夜旧屋'));
 assert(!c1RegenCall.body.messages[0].content.includes(FAST_SPEECH_PROMPT));

 // Chapter 2 generated under Fast Mode should use fast mode
 e.llm=async()=>({
  lines:[{id:0,speaker:'旁白',emotion:'明亮',confidence:1}]
 });
 await e.analyze(b.id, c2.id);
 assert.equal(c2.promptMode, 'fast');

 calls.length=0;
 await e.enqueue(b.id, [c2.id]);
 assert.equal(e.state.tasks.find(t=>t.chapterId===c2.id).status, 'done');
 const c2Call=calls.find(call=>call.provider==='tts'||call.body?.messages);
 assert.equal(c2Call.body.messages[0].content, FAST_SPEECH_PROMPT);

 // 3. Switch global settings back to Director Mode
 e.state.settings.promptMode='director';

 // Chapter 2 should still retain Fast Mode upon segment regeneration
 calls.length=0;
 assert(await e.regenerateSegment(b.id, c2.id, 0));
 const c2RegenCall=calls.find(call=>call.provider==='tts'||call.body?.messages);
 assert.equal(c2RegenCall.body.messages[0].content, FAST_SPEECH_PROMPT);
});

test('custom prompt overrides fast mode and reset restores FAST_SPEECH_PROMPT', async()=>{
 const {e,calls}=await createFixture();
 e.state.settings.promptMode='fast';

 const b=await e.addBook('自定义测试','第一章\n他笑了。');
 const c=b.chapters[0];
 await e.bind(b.id,'旁白','preset:白桦');

 e.llm=async()=>({lines:[{id:0,speaker:'旁白',emotion:'自然',confidence:1}]});
 await e.analyze(b.id, c.id);
 await e.enqueue(b.id, [c.id]);

 calls.length=0;
 await e.regenerateSegment(b.id, c.id, 0, {prompt:'极速快读，不要停顿'});
 assert.equal(calls[0].body.messages[0].content, '极速快读，不要停顿');
 assert.equal(c.segments[0].ttsPrompt, '极速快读，不要停顿');

 calls.length=0;
 await e.regenerateSegment(b.id, c.id, 0, {prompt:null});
 assert.equal(calls[0].body.messages[0].content, FAST_SPEECH_PROMPT);
 assert.equal(c.segments[0].ttsPrompt, undefined);
});

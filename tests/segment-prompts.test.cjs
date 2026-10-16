const {test}=require('node:test'),assert=require('node:assert/strict');
const {Engine,normalize}=require('../app/src/main/assets/core.js');
const audio=require('./wav-fixture.cjs')();
async function fixture(handler){
 const calls=[],snapshots=[],merges=[];let n=0;
 const io={saveState:async s=>snapshots.push(JSON.parse(s)),request:async(provider,body)=>{calls.push({provider,body});if(handler)return handler(provider,body);return {choices:[{finish_reason:'stop',message:{audio:{data:audio}}}]};},saveRawAudio:async()=>({id:'new-'+(++n)+'.wav',duration:2,playable:true}),saveAudio:async()=>({id:'saved-'+(++n)+'.wav',duration:2}),readAudio:async()=>({base64:audio}),mergeAudio:async ids=>{merges.push(ids);return {id:'merged-'+(++n)+'.wav',duration:ids.length*2};},sleep:async()=>{}};
 const e=new Engine(io),b=await e.addBook('提示词测试','第一章\n甲。乙。\n第二章\n丙。'),c=b.chapters[0];e.state.settings.retries=0;
 c.segments=[{id:0,text:'甲。',speaker:'旁白',confidence:1,emotion:'轻声，不要愤怒',audio:'old-a.wav'},{id:1,text:'乙。',speaker:'旁白',confidence:1,audio:'old-b.wav'}];c.audio='old-chapter.wav';c.status='ready';
 return {e,b,c,io,calls,snapshots,merges};
}
test('voice binding never loads completed chapters or creates remake tasks',async()=>{
 const {e,b,c,calls}=await fixture();b.chapters[1]={id:'lazy',title:'第二章',unloaded:true,segmentCount:100,audio:'lazy.wav',segments:[]};e.io.loadChapter=async()=>{throw Error('must not load chapters');};
 e.state.tasks=[{id:'done',bookId:b.id,chapterId:c.id,status:'done',done:2}];const chapters=JSON.stringify(b.chapters),tasks=JSON.stringify(e.state.tasks);
 await e.bind(b.id,'旁白','preset:茉莉');assert.equal(b.characters[0].voice,'preset:茉莉');assert.equal(JSON.stringify(b.chapters),chapters);assert.equal(JSON.stringify(e.state.tasks),tasks);assert.equal(calls.length,0);
});
test('custom direction is sent verbatim and only the chosen sentence is replaced',async()=>{
 const {e,b,c,calls,merges,snapshots}=await fixture(),other=JSON.stringify(c.segments[1]),chapter2=JSON.stringify(b.chapters[1]);const prompt='  轻声说话，不要愤怒。\n保留否定词；<参考> & "自然"。  ';
 await e.bind(b.id,'旁白','preset:Mia');assert(await e.regenerateSegment(b.id,c.id,0,{prompt}));
 assert.equal(calls.length,1);assert.deepEqual(calls[0].body.messages,[{role:'user',content:prompt},{role:'assistant',content:'甲。'}]);assert.equal(calls[0].body.audio.voice,'Mia');
 assert.equal(JSON.stringify(c.segments[1]),other);assert.equal(JSON.stringify(b.chapters[1]),chapter2);assert.deepEqual(merges[0],[c.segments[0].audio,'old-b.wav']);assert.equal(c.audioStale,false);assert.equal(e.state.tasks.length,0);
 assert.equal(c.segments[0].lastSpeechRequest.prompt,prompt);assert.equal(c.segments[0].lastSpeechRequest.audio,c.segments[0].audio);assert.equal(snapshots.at(-1).books[0].chapters[0].segments[0].ttsPrompt,prompt);
});
test('failed custom regeneration preserves audio, saves prompt, and can retry after reload',async()=>{
 const {e,b,c,io,snapshots,calls}=await fixture(()=>{throw Error('provider unavailable');});
 await assert.rejects(e.regenerateSegment(b.id,c.id,0,{prompt:'低声，放慢尾音。'}),/provider unavailable/);assert.equal(calls.length,1);assert.equal(c.audio,'old-chapter.wav');assert.equal(c.segments[0].audio,'old-a.wav');assert.equal(c.segments[1].audio,'old-b.wav');
 const next=new Engine({...io,request:async(_,body)=>{assert.equal(body.messages[0].content,'低声，放慢尾音。');return {choices:[{finish_reason:'stop',message:{audio:{data:audio}}}]};}},snapshots.at(-1));
 assert.equal(next.state.tasks.length,0);assert(await next.regenerateSegment(b.id,c.id,0));assert.equal(next.chapter(b.id,c.id).segments[0].lastSpeechRequest.prompt,'低声，放慢尾音。');
});
test('restoring defaults uses the annotation and removes the saved override',async()=>{
 const {e,b,c,calls}=await fixture();e.state.voices.push({id:'custom',sample:'ref.wav',format:'wav',description:'温和女声，不沙哑'});b.characters[0].voice='custom';b.characters[0].description='';c.segments[0].ttsPrompt='旧提示';
 const expected=e.speechDirection('custom',c.segments[0].emotion,'');assert.equal(expected,'轻声，不要愤怒');assert(!expected.includes('温和女声'));
 await e.regenerateSegment(b.id,c.id,0,{prompt:null});assert.equal(calls[0].body.messages[0].content,expected);assert.equal(calls[0].body.model,'mimo-v2.5-tts-voiceclone');assert.equal(c.segments[0].ttsPrompt,undefined);
});
test('split requests retain the exact custom direction and source text',async()=>{
 const {e,calls}=await fixture();const text='甲说：“别走。”乙轻轻点头。'.repeat(60),prompt='只读原文；慢一点。\n不要增加台词。';const result=await e.synthesize(text,'preset:白桦','自然',{prompt});
 assert(calls.length>1);assert(calls.every(x=>x.body.messages[0].content===prompt));assert.equal(normalize(calls.map(x=>x.body.messages[1].content).join('')),normalize(text));assert.equal(result.speechPrompt,prompt);
});
test('duplicate submissions cannot replace the prompt and stale in-flight edits cannot replace audio',async()=>{
 let entered,release;const begun=new Promise(r=>entered=r),gate=new Promise(r=>release=r);const {e,b,c,calls}=await fixture(async()=>{entered();await gate;return {choices:[{finish_reason:'stop',message:{audio:{data:audio}}}]};});
 const first=e.regenerateSegment(b.id,c.id,0,{prompt:'第一次提示'});await begun;assert.equal(await e.regenerateSegment(b.id,c.id,0,{prompt:'第二次提示'}),false);assert.equal(c.segments[0].ttsPrompt,'第一次提示');c.segments[0].ttsPrompt='已修改的提示';release();assert.equal(await first,false);assert.equal(calls.length,1);assert.equal(c.segments[0].audio,'old-a.wav');assert.equal(c.audio,'old-chapter.wav');
});
test('regular chapter production uses saved prompts and records the actual request',async()=>{
 const {e,b,c,calls}=await fixture();c.audio=null;c.segments=[{id:0,text:'甲。',speaker:'旁白',confidence:1,ttsPrompt:'低声自然朗读'}];await e.enqueue(b.id,[c.id]);assert.equal(e.state.tasks[0].status,'done');assert.equal(calls.length,1);assert.equal(calls[0].body.messages[0].content,'低声自然朗读');assert.equal(c.segments[0].lastSpeechRequest.prompt,'低声自然朗读');
});
test('blank directions are rejected without changing prompts or playable audio',async()=>{
 const {e,b,c,calls}=await fixture();c.segments[0].ttsPrompt='保留';await assert.rejects(e.regenerateSegment(b.id,c.id,0,{prompt:'  \n '}),/提示词/);assert.equal(c.segments[0].ttsPrompt,'保留');assert.equal(c.segments[0].audio,'old-a.wav');assert.equal(calls.length,0);assert(!e.segmentBusy(b.id,c.id,0));
});

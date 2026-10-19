const {test}=require('node:test'),assert=require('node:assert/strict');
const {Engine}=require('../app/src/main/assets/core.js');
for(const pipeline of [false,true])test(`auto recovers both in-flight voice edits, pipeline=${pipeline}`,{timeout:5000},async()=>{
 const e=new Engine({features:{pipeline},saveState:async()=>{},mergeAudio:async ids=>({id:ids.join('+'),duration:ids.length})});
 const b=await e.addBook('voice change','甲。乙。丙。'),c=b.chapters[0];
 b.characters.push({name:'甲',voice:'preset:白桦'},{name:'乙',voice:'preset:白桦'});
 c.segments=[{id:0,text:'甲。',speaker:'甲',confidence:1},{id:1,text:'乙。',speaker:'乙',confidence:1},{id:2,text:'丙。',speaker:'旁白',confidence:1,audio:'keep.wav'}];
 let release;const gate=new Promise(r=>release=r),calls=[];
 e.synthesize=async(text,voice)=>{calls.push({text,voice});if(calls.length===2){await e.bind(b.id,'甲','preset:苏打',false);await e.bind(b.id,'乙','preset:冰糖',false);release();}await gate;return {id:text+voice,duration:1};};
 await e.enqueue(b.id,[c.id]);assert.equal(e.state.tasks[0].status,'done');assert.equal(e.state.tasks[0].done,3);assert.equal(calls.length,4);
 assert.equal(c.segments[0].audio,'甲。preset:苏打');assert.equal(c.segments[1].audio,'乙。preset:冰糖');assert.equal(c.segments[2].audio,'keep.wav');assert.equal(e._ttsActive,0);
});
test('repeated edits defer automatic continuation until changes settle',async()=>{
 const e=new Engine({saveState:async()=>{},mergeAudio:async()=>({id:'merged',duration:1})}),b=await e.addBook('edits','甲。'),c=b.chapters[0];c.segments=[{id:0,text:'甲。',speaker:'旁白',confidence:1}];let calls=0;
 e.synthesize=async()=>{calls++;await e.bind(b.id,'旁白',calls===1?'preset:冰糖':'preset:苏打',false);return {id:'stale',duration:1};};await e.enqueue(b.id,[c.id]);
 assert.equal(calls,2);assert.equal(c.segments[0].audio,undefined);assert.equal(e.state.tasks[0].status,'queued');assert.equal(e.state.tasks[0].phase,'修改后自动继续');assert(e.state.tasks[0].nextRetryAt>Date.now());e.state.tasks[0].nextRetryAt=0;await e.kick();assert.equal(e.state.tasks[0].status,'done');
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Engine,units,cleanVoiceDescription,shortVoiceName}=require('../app/src/main/assets/core.js');
const adapter=()=>({saveState:async()=>{},mergeAudio:async()=>({id:'chapter.wav',duration:2}),saveAudio:async()=>({id:'sample.wav'}),request:async()=>({choices:[{message:{audio:{data:'AA=='}}}]})});
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
async function setup(){const e=new Engine(adapter()),b=await e.addBook('测试','甲。乙。'),c=b.chapters[0];e.state.settings.ttsParallel=1;c.segments=units(c.text).map(s=>({...s,speaker:'旁白',emotion:'自然',confidence:1}));return {e,b,c};}

for(const phase of ['analysis','design','synthesis','merge']){
 test(`immediate pause/resume during ${phase} waits for previous owner and completes once`,{timeout:5000},async()=>{
  const {e,b,c}=await setup(),entered=deferred(),release=deferred();let first=true,active=0,maxActive=0;const calls=[];
  async function gate(){if(!first)return;first=false;entered.resolve();await release.promise;}
  if(phase==='analysis'){c.segments=[];e.analyze=async(...args)=>{active++;maxActive=Math.max(maxActive,active);try{await gate();c.segments=units(c.text).map(s=>({...s,speaker:'旁白',emotion:'自然',confidence:1}));return c;}finally{active--;}};}
  if(phase==='design'){b.characters.push({name:'沈砚',description:'二十多岁男性，声音开朗清亮',voice:null});c.segments[1].speaker='沈砚';e.state.settings.mode='auto';e.design=async()=>{active++;maxActive=Math.max(maxActive,active);try{await gate();return {id:'v',sample:'ref.wav',description:'二十多岁男性，声音开朗清亮'};}finally{active--;}};}
  e.synthesize=async text=>{active++;maxActive=Math.max(maxActive,active);calls.push(text);try{if(phase==='synthesis')await gate();return {id:text,duration:1};}finally{active--;}};
  if(phase==='merge'){e.io.mergeAudio=async()=>{active++;maxActive=Math.max(maxActive,active);try{await gate();return {id:'chapter.wav',duration:2};}finally{active--;}};}
  const run=e.enqueue(b.id,[c.id]);await entered.promise;const t=e.state.tasks[0];await e.pause(t.id);
  const resume=e.resume(t.id);await e.saveChain;
  assert.equal(t.resumeRequested,true);assert.equal(t.pauseRequested,true,'pause remains set until in-flight work exits');
  assert.equal(e.nextQueued(),null,'same task cannot acquire another owner');
  release.resolve();await Promise.all([run,resume]);
  assert.equal(t.status,'done');assert.equal(c.audio,'chapter.wav');assert.deepEqual(calls,['甲。','乙。']);assert.equal(maxActive,1);assert.equal(t.synthActive,false);assert.equal(t.resumeRequested,false);assert.equal(e._ttsActive,0);
 });
}

test('batch resume during concurrent synthesis keeps the global TTS budget and saved audio',{timeout:5000},async()=>{
 const {e,b,c}=await setup();e.state.settings.ttsParallel=2;e.state.settings.taskParallel=2;
 const c2={id:'c2',title:'第二章',text:'丙。丁。',segments:units('丙。丁。').map(s=>({...s,speaker:'旁白',emotion:'自然',confidence:1}))};b.chapters.push(c2);
 const release=deferred(),entered=deferred(),calls=[];let active=0,max=0;
 e.synthesize=async text=>{calls.push(text);active++;max=Math.max(max,active);if(calls.length===2)entered.resolve();try{if(calls.length<=2)await release.promise;return {id:text,duration:1};}finally{active--;}};
 const run=e.enqueue(b.id,[c.id,c2.id]);await entered.promise;
 for(const t of e.state.tasks)await e.pause(t.id);
 const resumed=e.resumeTasks(e.state.tasks.map(t=>t.id));await e.saveChain;release.resolve();await Promise.all([run,resumed]);
 assert(e.state.tasks.every(t=>t.status==='done'));assert.equal(max,2);assert.equal(calls.length,4);assert.equal(new Set(calls).size,4);assert.equal(e._ttsActive,0);
});

test('a second pause overrides pending resume and cancellation never restarts the task',{timeout:5000},async()=>{
 const {e,b,c}=await setup(),entered=deferred(),release=deferred();e.synthesize=async()=>{entered.resolve();await release.promise;return {id:'sentence.wav'};};
 const run=e.enqueue(b.id,[c.id]);await entered.promise;const t=e.state.tasks[0];await e.pause(t.id);const resume=e.resume(t.id);await e.saveChain;await e.pause(t.id);assert.equal(t.resumeRequested,false);await e.cancel(t.id);release.resolve();await Promise.all([run,resume]);assert.equal(t.status,'cancelled');assert.equal(c.audio,undefined);
});

test('voice metadata migration keeps reference audio, ids and character bindings',async()=>{
 const {e,b}=await setup();e.state.voices.push({id:'v',name:'沈砚',description:'沈砚，二十多岁的青年男子，掌门继承人，声音开朗清亮',sample:'existing.wav',format:'wav',enabled:true});
 b.characters.push({name:'沈砚',description:'沈砚，青年男子，掌门，声音开朗清亮',voice:'v',candidate:{id:'candidate',name:'沈砚',description:'青年男子，掌门，声音沉稳',sample:'candidate.wav'}});
 const loaded=new Engine(adapter(),JSON.parse(JSON.stringify(e.state))),v=loaded.state.voices[0],role=loaded.book(b.id).characters[1];
 assert.equal(v.name,'开朗青年男性');assert.equal(v.sample,'existing.wav');assert.equal(v.id,'v');assert.equal(role.name,'沈砚');assert.equal(role.voice,'v');assert.equal(role.candidate.name,'沉稳青年男性');
 for(const d of [v.description,role.description,role.candidate.description])assert(!/沈砚|掌门|继承人/.test(d));
 assert.equal(cleanVoiceDescription(v.description),v.description,'migration is idempotent');
});

test('design, import and save sanitize identity and derive names from acoustic traits',async()=>{
 const e=new Engine(adapter());let request;e.io.request=async(provider,body)=>{request=body;return {choices:[{message:{audio:{data:'AA=='}}}]};};
 const desc='林晚，二十五岁的公主，声音温柔清亮';const v=await e.design(desc,'试音。','林晚');
 assert.equal(v.name,'温柔青年女性');assert.equal(request.messages[0].content,'二十五岁女性，声音温柔、清亮');
 v.name='林晚';v.description=desc;await e.saveVoice(v);assert.equal(v.name,'温柔青年女性');
 const imported=await e.importVoice({name:'沈砚.wav',description:'二十多岁青年男性，宗门弟子，声音开朗清亮',id:'import.wav',size:100,format:'wav'});assert.equal(imported.name,'开朗青年男性');assert(!imported.description.includes('宗门'));
 assert.equal(shortVoiceName('六七岁的小女孩，说话奶声奶气'),'奶声奶气儿童女性');
});

test('clearing completed task records preserves all audio and voice resources',async()=>{
 const {e,b,c}=await setup();c.audio='chapter.wav';c.segments[0].audio='sentence.wav';e.state.voices.push({id:'v',sample:'sample.wav'});let deletes=0;e.io.deleteAudio=async()=>{deletes++;};e.state.tasks.push({id:'done',bookId:b.id,chapterId:c.id,status:'done'});await e.removeTask('done');assert.equal(c.audio,'chapter.wav');assert.equal(c.segments[0].audio,'sentence.wav');assert.equal(e.state.voices[0].sample,'sample.wav');assert.equal(deletes,0);
});

test('voice cleanup preserves acoustic negation and degree',()=>{
 const clean=cleanVoiceDescription('二十多岁男性，掌门，声音不沙哑，清亮，略带气声');
 assert.equal(clean,'二十多岁男性，声音不沙哑、清亮、略带气声');
 assert.equal(cleanVoiceDescription(clean),clean);
 assert.equal(shortVoiceName(clean),'清亮青年男性');
});

test('resume after paused status appears still waits for the snapshot owner',{timeout:5000},async()=>{
 const {e,b,c}=await setup(),entered=deferred(),release=deferred(),pausedSave=deferred(),releaseSave=deferred();let first=true,saveHeld=false;const calls=[];
 const save=e.io.saveState;e.io.saveState=async text=>{if(!saveHeld&&JSON.parse(text).tasks.some(t=>t.status==='paused'&&t.synthActive)){saveHeld=true;pausedSave.resolve();await releaseSave.promise;}return save(text);};
 e.synthesize=async text=>{calls.push(text);if(first){first=false;entered.resolve();await release.promise;}return {id:text,duration:1};};
 const run=e.enqueue(b.id,[c.id]);await entered.promise;const t=e.state.tasks[0];await e.pause(t.id);release.resolve();await pausedSave.promise;assert.equal(t.status,'paused');assert.equal(t.synthActive,true);
 const resume=e.resume(t.id);assert.equal(t.resumeRequested,true);assert.equal(e.nextQueued(),null);releaseSave.resolve();await Promise.all([run,resume]);assert.equal(t.status,'done');assert.deepEqual(calls,['甲。','乙。']);
});

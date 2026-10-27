const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Engine,cleanVoiceDescription,voiceConflict,boundedSpeechParts,buildSpeechDirection}=require('../app/src/main/assets/core.js');
function engine(){return new Engine({saveState:async()=>{},saveAudio:async()=>({id:'sample.wav',size:100,duration:3}),request:async()=>({choices:[{message:{audio:{data:require('./wav-fixture.cjs')()},final_text_preview:'适配声音的试听文本。'}}]})});}
const desc='青年女性，清亮、不沙哑，略有气声；纪录片旁白气质，四川话口音。Not angry; restrained warmth, unhurried rhythm.';
test('complete bilingual descriptions survive design, save, import and reload',async()=>{
 const e=engine();const v=await e.design(' \u0000'+desc+'\u0007 ');await e.saveVoice(v);
 const imported=await e.importVoice({name:'sample.wav',description:desc,size:100,format:'wav',id:'import.wav'});
 const loaded=new Engine(e.io,JSON.parse(JSON.stringify(e.state)));
 assert.equal(v.description,desc);assert.equal(imported.description,desc);assert(loaded.state.voices.every(x=>x.description===desc));assert.equal(cleanVoiceDescription(desc),desc);
});
test('automatic design lets MiMo adapt preview; explicit preview stays verbatim',async()=>{
 const e=engine(),calls=[];e.io.request=async(_,body)=>{calls.push(body);return {choices:[{message:{audio:{data:require('./wav-fixture.cjs')()},final_text_preview:'自动试听。'}}]};};
 const auto=await e.design(desc);assert.equal(auto.previewText,'自动试听。');assert.equal(calls[0].audio.optimize_text_preview,true);assert.equal(calls[0].messages.length,1);
 const text='  “别急，我没有生气。”\nWait for me.  ',custom=await e.design(desc,text);
 assert.equal(custom.previewText,text);assert.equal(calls[1].audio.optimize_text_preview,false);assert.equal(calls[1].messages[1].content,text);
});
test('negative, restrained and compound emotions remain natural-language directions',()=>{
 for(const style of ['不生气，但有些委屈','没有疲惫感，轻快而克制','Not angry, slightly sad; then reassuring']){
  const direction=buildSpeechDirection(style,desc);assert(direction.includes(style));assert(!direction.includes(desc));assert(!/\(Angry\)|\(tired\)|280/.test(direction));
 }
});
async function bookWithRoles(e,names=['沈砚','林晚']){const b=await e.addBook('小说','你好。');b.characters.push(...names.map(name=>({name,description:'清亮、不沙哑的青年女性',voice:null})));return b;}
function voice(e,id='v',sample='ref.wav',description='清亮、不沙哑的青年女性'){e.state.voices.push({id,sample,description,enabled:true});}
test('opposite negation, gender and accent are rejected even if LLM requests the match',async()=>{
 for(const incompatible of ['青年女性，沙哑、不清亮','低沉青年男性','清亮的青年女性，粤语口音']){
  const e=engine(),b=await bookWithRoles(e,['林晚']);b.characters[1].description='清亮、不沙哑的青年女性，四川话口音';voice(e,'v','ref',incompatible);e.state.settings.mode='auto';e.llm=async()=>({matches:[{name:'林晚',voiceId:'v'}]});
  await e.matchCharacters(b.id,['林晚']);assert.equal(b.characters[1].voice,null);assert(voiceConflict(b.characters[1].description,incompatible));
 }
});
test('same-book major roles reserve voices across concurrent LLM requests and sample aliases',async()=>{
 const e=engine(),b=await bookWithRoles(e);voice(e);voice(e,'alias','ref.wav');e.state.settings.mode='manual';
 e.llm=async()=>({matches:[{name:'沈砚',voiceId:'v'},{name:'林晚',voiceId:'alias'}]});
 await Promise.all([e.matchCharacters(b.id,['沈砚']),e.matchCharacters(b.id,['林晚'])]);
 assert.equal(b.characters[1].suggestedVoice,'v');assert.equal(b.characters[2].suggestedVoice,undefined);
 assert.equal(e.voiceAvailable(b,b.characters[2],'alias'),false);
});
test('extras reuse compatible extra voices but avoid major voices; another book may reuse',async()=>{
 const e=engine(),b=await bookWithRoles(e,['沈砚','路人甲','路人乙']);voice(e);e.state.settings.mode='auto';
 const [major,a,z]=b.characters.slice(1);a.bitPart=z.bitPart=true;a.voice='v';assert.equal(e.autoVoiceFor(b.id,z.name),'v');
 major.voice='v';assert.equal(e.autoVoiceFor(b.id,z.name),null);major.voice=null;
 e.llm=async()=>({matches:[{name:'林晚',voiceId:'v'}]});const other=await bookWithRoles(e,['林晚']);await e.matchCharacters(other.id,['林晚']);assert.equal(other.characters[1].voice,'v');
});
test('concurrent design is shared only for the same role or compatible extra group',async()=>{
 const e=engine(),b=await bookWithRoles(e,['沈砚','林晚','路人甲','路人乙']);let calls=0;e.design=async description=>{const id='new-'+(++calls);await new Promise(r=>setTimeout(r,5));return {id,sample:id+'.wav',description};};
 const [a,z,x,y]=b.characters.slice(1);x.bitPart=y.bitPart=true;
 const candidates=await Promise.all([e.ensureDesignCandidate(b,a),e.ensureDesignCandidate(b,a),e.ensureDesignCandidate(b,z),e.ensureDesignCandidate(b,x),e.ensureDesignCandidate(b,y)]);
 assert.equal(calls,3);assert.equal(candidates[0].id,candidates[1].id);assert.notEqual(candidates[0].id,candidates[2].id);assert.equal(candidates[3].id,candidates[4].id);
});
test('default display name maps to API id and synthesis leaves novel text untouched',async()=>{
 const e=engine();let body;e.io.request=async(_,b)=>{body=b;return {choices:[{message:{audio:{data:require('./wav-fixture.cjs')()}}}]};};e.saveSpeechAudio=async()=>({id:'new.wav'});
 const text='“我没有生气。”';await e.synthesize(text,'preset:默认嗓音','不生气，平静');assert.equal(body.audio.voice,'mimo_default');assert.equal(body.messages[1].content,text);assert(body.messages[0].content.includes('不生气，平静'));
});
test('length-bound splitting preserves all characters and preferred punctuation boundaries',()=>{
 const text=('声音😀，'+ '甲'.repeat(290)+'；'+ '乙'.repeat(320)+'。').repeat(4);const parts=boundedSpeechParts(text);assert.equal(parts.join(''),text);assert(parts.every(p=>Array.from(p).length<=600));
});
test('local save errors do not trigger sentence splitting even when wording says too long',async()=>{
 const e=engine();let calls=0;e.io.request=async()=>{calls++;return {choices:[{message:{audio:{data:require('./wav-fixture.cjs')()}}}]};};e.io.saveAudio=async()=>{throw Error('file name too long');};await assert.rejects(e.synthesize('甲。乙。','preset:白桦'),/file name too long/);assert.equal(calls,1);
});
test('resuming an already finished legacy chapter preserves every audio reference and binding',async()=>{
 const e=engine(),b=await bookWithRoles(e);const c=b.chapters[0];c.audio='legacy-chapter.wav';c.segments=[{id:0,text:'你好。',speaker:'沈砚',audio:'legacy-line.wav'}];b.characters[1].voice='old-voice';
 e.state.tasks.push({id:'old-task',bookId:b.id,chapterId:c.id,status:'paused'});const strip=o=>JSON.stringify(o,(k,v)=>k==='promptMode'?undefined:v);const before=strip(b);e.io.request=async()=>{throw Error('old chapter must not call models');};e.io.mergeAudio=async()=>{throw Error('old chapter must not merge');};
 await e.resume('old-task');assert.equal(strip(b),before);assert.equal(e.state.tasks[0].status,'done');
});
test('unversioned split checkpoints cannot mix old audio with current prompt identity',async()=>{
 const e=engine(),b=await e.addBook('续做','甲。乙。'),c=b.chapters[0],s={id:0,text:'甲。乙。',speaker:'旁白',emotion:'自然',confidence:1};c.segments=[s];
 s.speechDraft={key:JSON.stringify({text:s.text,speaker:s.speaker,emotion:s.emotion,voice:b.characters[0].voice}),files:[{id:'saved-old.wav',duration:2}]};
 const texts=[];let merges=0;e.synthesizePart=async(text,model,ref,style,options)=>{texts.push(text);return {id:'new.wav',duration:2,generationVersion:2,qualityStatus:'passed',rawAudioIds:options.budget.rawAudioIds};};e.io.mergeAudio=async ids=>{assert.deepEqual(ids,['new.wav']);merges++;return {id:'merged.wav',duration:4};};
 await e.enqueue(b.id,[c.id]);assert.deepEqual(texts,['甲。乙。']);assert.equal(s.audio,'new.wav');assert(s.rawAudioIds.includes('saved-old.wav'));assert.equal(e.state.tasks[0].status,'done');
});
test('new design candidates cannot silently occupy an identical reserved sample',async()=>{
 const e=engine(),b=await bookWithRoles(e);e.design=async()=>({id:Math.random().toString(),sample:'identical.wav'});
 const results=await Promise.allSettled(b.characters.slice(1).map(r=>e.ensureDesignCandidate(b,r)));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
});
test('manual binding while automatic design is in flight takes precedence',async()=>{
 const e=engine(),b=await bookWithRoles(e,['林晚']),c=b.chapters[0],role=b.characters[1];e.state.settings.mode='auto';c.segments=[{id:0,text:'你好。',speaker:'林晚',emotion:'自然',confidence:1}];
 let release,entered;const begun=new Promise(r=>entered=r);e.design=async()=>{entered();await new Promise(r=>release=r);return {id:'new-design',sample:'new-ref.wav'};};e.synthesize=async(_,id)=>{assert.equal(id,'manual-voice');return {id:'line.wav'};};e.io.mergeAudio=async()=>({id:'chapter.wav'});
 const run=e.enqueue(b.id,[c.id]);await begun;role.voice='manual-voice';role.candidate=null;release();await run;assert.equal(role.voice,'manual-voice');assert.equal(role.candidate,null);assert.equal(e.state.tasks[0].status,'done');
});
test('English acoustic negation and contrasting clauses reject opposing traits',()=>{
 assert(voiceConflict('female, not at all hoarse but breathy','female, hoarse'));
 assert(voiceConflict('female, not raspy','female, hoarse'));
 assert.equal(voiceConflict('female, not hoarse but breathy','female, not hoarse, breathy'),false);
});

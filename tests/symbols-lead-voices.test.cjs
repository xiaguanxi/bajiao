const {test}=require('node:test'),assert=require('node:assert/strict');
const V=require('../app/src/main/assets/core.js');
const create=()=>new V.Engine({saveState:async()=>{},mergeAudio:async ids=>({id:'merged.wav',duration:ids.length})});
test('Unicode punctuation and emoji are silent; letters, Chinese and numbers remain speech',()=>{
 for(const text of ['……','【】','***','——','#_$%','❤️','😀👨‍👩‍👦','※\u200b'])assert(V.isPunctOnly(text),text);
 for(const text of ['','你好！','123','A+B','第1章','嗯。'])assert(!V.isPunctOnly(text),text);
});
for(const pipeline of [false,true])test(`symbol-only novel uses no annotation, voice design, TTS, silence or merge, pipeline=${pipeline}`,async()=>{
 const e=create();e.features.pipeline=pipeline;const b=await e.addBook('分隔线','……\n【】\n***\n❤️'),c=b.chapters[0];
 e.llm=e.synthesize=e.design=e.io.mergeAudio=async()=>{throw Error('symbols must not call services');};
 await e.enqueue(b.id,[c.id]);assert.equal(e.state.tasks[0].status,'done');assert.equal(c.status,'skipped');assert.equal(c.audio,null);
 assert(c.segments.length>0);assert(c.segments.every(s=>s.skip&&s.audio==='skip'&&s.annotationStatus==='complete'));
 assert.equal(V.normalize(c.segments.map(s=>s.text).join('')),V.normalize(c.text));
});
test('mixed annotation excludes symbols and resumes an old pending draft without relabelling',async()=>{
 const e=create(),b=await e.addBook('混合','甲。\n……\n***\n乙。'),c=b.chapters[0];await e.prepareAnnotations(b.id,c.id);
 for(const s of c.segments)if(V.isPunctOnly(s.text)){s.audio=null;s.skip=false;s.annotationStatus='pending';}
 c.analysisDraft.pending=[{ids:c.segments.map(s=>s.id)}];const ids=[];
 e.llm=async prompt=>{const batch=JSON.parse(prompt.split('本批片段：')[1]);assert(batch.every(s=>!V.isPunctOnly(s.text)));ids.push(...batch.map(s=>s.id));return {lines:batch.map(s=>({id:s.id,speaker:'旁白',emotion:'自然',confidence:1,scene:'',delivery:'自然读出本句。'}))};};
 await e.analyze(b.id,c.id);assert.equal(ids.length,2);assert.equal(c.analysisDraft,undefined);assert(c.segments.filter(s=>V.isPunctOnly(s.text)).every(s=>s.audio==='skip'));
});
test('new protagonists use Chinese defaults while supporting roles still use the existing matching policy',async()=>{
 const e=create(),b=await e.addBook('主角','男主沈砚和女主林晚走进邮局，配角周叔向他们打招呼。'),c=b.chapters[0];
 const roles=[{name:'沈砚',description:'青年男性',storyRole:'maleLead',roleEvidence:'男主沈砚'},{name:'林晚',description:'青年女性',storyRole:'femaleLead',roleEvidence:'女主林晚'},{name:'周叔',description:'中年男性',storyRole:'other'}];
 e.llm=async()=>({characters:roles,lines:V.units(c.text).map(s=>({id:s.id,speaker:'旁白',emotion:'自然',confidence:1,scene:'',delivery:'自然读出本句。'}))});await e.analyze(b.id,c.id);
 e.state.settings.usePresets=false;e.state.voices=[{id:'library',enabled:true,description:'中年男性'}];let matched=[];
 e.llm=async (prompt,options)=>{if(options?.task==='voice-targets')return {targets:[{name:'周叔',gender:'m',age:'middle'}]};matched.push(prompt);return {matches:[{name:'周叔',voiceId:'library',reason:'声线相容'}]};};
 await e.matchCharacters(b.id,roles.map(r=>r.name));
 assert.equal(b.characters.find(r=>r.name==='旁白').voice,'preset:白桦');assert.equal(b.characters.find(r=>r.name==='沈砚').voice,'preset:苏打');assert.equal(b.characters.find(r=>r.name==='林晚').voice,'preset:冰糖');assert.equal(b.characters.find(r=>r.name==='周叔').voice,'library');
 assert.equal(matched.length,1);assert(!matched[0].includes('"name":"沈砚"'));assert.match(matched[0],/周叔/);
});
test('defaults require valid protagonist evidence and never overwrite saved bindings or legacy books',async()=>{
 const e=create(),b=await e.addBook('证据','沈砚和林晚见到周叔。'),c=b.chapters[0];b.characters.push({name:'沈砚',voice:'custom'},{name:'林晚',voice:null},{name:'周叔',voice:null});
 e.recordLeadRoles(b,c,[{name:'沈砚',storyRole:'maleLead',roleEvidence:'沈砚和林晚'},{name:'林晚',storyRole:'femaleLead',roleEvidence:'原文没有此句'},{name:'周叔',storyRole:'maleLead',roleEvidence:'周叔'}]);
 assert.equal(b.presetLeadVoices.maleLead,'沈砚');assert.equal(b.presetLeadVoices.femaleLead,null);await e.matchCharacters(b.id,['沈砚']);assert.equal(b.characters[1].voice,'custom');
 delete b.presetLeadVoices;e.recordLeadRoles(b,c,[{name:'林晚',storyRole:'femaleLead',roleEvidence:'林晚'}]);assert.equal(b.characters[2].storyRole,undefined);assert.equal(e.defaultLeadVoice(b,b.characters[2]),null);
 assert.equal(V.presetDesc('冰糖'),'中文青年女性');assert.equal(V.presetDesc('茉莉'),'中文成熟女性');assert.equal(V.presetDesc('苏打'),'中文青年男性');assert.equal(V.presetDesc('白桦'),'中文中年男性');
});

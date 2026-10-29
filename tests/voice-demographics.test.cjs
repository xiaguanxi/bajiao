const {test}=require('node:test'),assert=require('node:assert/strict');
const {Engine,LlmOutputError,voiceDemographics,ModelPrompts}=require('../app/src/main/assets/core.js');
const rolesFrom=prompt=>JSON.parse(prompt.split('\n角色：')[1]);
const matchFrom=prompt=>({roles:JSON.parse(prompt.split('角色：')[1].split('\n音色：')[0]),voices:JSON.parse(prompt.split('\n音色：')[1])});
async function fixture(roles=[{name:'林晚',description:'清亮青年女性'}]){
 const e=new Engine({saveState:async()=>{}}),b=await e.addBook('筛选测试','“你好。”');
 e.state.settings.usePresets=false;e.state.settings.mode='auto';b.characters.push(...roles.map(r=>({...r,voice:null})));
 const descriptions=['八岁女性','二十五岁女性','五十岁女性','七十岁女性','八岁男性','二十五岁男性','五十岁男性','七十岁男性'];
 e.state.voices=descriptions.map((description,i)=>({id:'catalog-sentinel-'+i,name:description,description:description+'，清亮自然，普通话',enabled:true,sample:i+'.wav'}));
 return {e,b};
}

test('voice demographics share numeric boundaries, Chinese ages and English ages',()=>{
 for(const [age,expected] of [[0,'child'],[12,'child'],[13,'young'],[39,'young'],[40,'middle'],[59,'middle'],[60,'old']])assert.deepEqual(voiceDemographics(age+'岁女性'),{gender:'f',age:expected});
 assert.deepEqual(voiceDemographics('六七岁的小女孩，奶声奶气'),{gender:'f',age:'child'});
 assert.deepEqual(voiceDemographics('小男孩，清脆童声'),{gender:'m',age:'child'});
 assert.deepEqual(voiceDemographics('二十多岁青年男性'),{gender:'m',age:'young'});
 assert.deepEqual(voiceDemographics('50-year-old male'),{gender:'m',age:'middle'});
 assert.deepEqual(voiceDemographics('65 years old female'),{gender:'f',age:'old'});
 assert.deepEqual(voiceDemographics('middle-aged woman'),{gender:'f',age:'middle'});
});
test('voice names fill missing metadata without overriding descriptions or inventing youth gender',()=>{
 assert.deepEqual(voiceDemographics({name:'自然老年男性',description:'低沉舒缓，略带沙哑'}),{gender:'m',age:'old'});
 assert.deepEqual(voiceDemographics({name:'老年男性',description:'二十岁女性'}),{gender:'f',age:'young'});
 assert.deepEqual(voiceDemographics('青年，清亮自然'),{gender:'unknown',age:'young'});
 assert.deepEqual(voiceDemographics('成熟女性'),{gender:'f',age:'unknown'});
 assert.deepEqual(voiceDemographics('平和自然'),{gender:'unknown',age:'unknown'});
});
test('target request has no catalog and matching sees only the chosen gender and age',async()=>{
 const {e,b}=await fixture(),calls=[];
 e.llm=async(prompt,options)=>{
  calls.push(options.task);
  if(options.task==='voice-targets'){assert(!prompt.includes('catalog-sentinel'));assert(!prompt.includes('availableVoiceIds'));assert.deepEqual(rolesFrom(prompt),[{name:'林晚',description:'清亮青年女性'}]);return {targets:[{name:'林晚',gender:'f',age:'young'}]};}
  const {voices,roles}=matchFrom(prompt);assert.deepEqual(voices.map(v=>v.id),['catalog-sentinel-1']);assert.deepEqual(roles[0].availableVoiceIds,['catalog-sentinel-1']);
  return {matches:[{name:'林晚',voiceId:'catalog-sentinel-1'}]};
 };
 await e.matchCharacters(b.id,['林晚']);assert.deepEqual(calls,['voice-targets','voice-match']);assert.equal(b.characters[1].voice,'catalog-sentinel-1');
});
test('mixed casts receive separate filtered catalogs and cannot choose another group voice',async()=>{
 const {e,b}=await fixture([{name:'林晚',description:'青年女性'},{name:'周叔',description:'中年男性'}]),seen=[];
 e.llm=async(prompt,options)=>{
  if(options.task==='voice-targets')return {targets:[{name:'林晚',gender:'f',age:'young'},{name:'周叔',gender:'m',age:'middle'}]};
  const {roles,voices}=matchFrom(prompt);assert.equal(roles.length,1);seen.push(voices.map(v=>v.id));
  return {matches:[{name:roles[0].name,voiceId:'catalog-sentinel-6'},{name:'林晚',voiceId:'catalog-sentinel-1'}]};
 };
 await e.matchCharacters(b.id,['林晚','周叔']);assert.deepEqual(seen,[['catalog-sentinel-1'],['catalog-sentinel-6']]);assert.equal(b.characters[1].voice,'catalog-sentinel-1');assert.equal(b.characters[2].voice,'catalog-sentinel-6');
});
test('unknown dimensions relax only that dimension and empty results never fall back to the full library',async()=>{
 const {e,b}=await fixture(),seen=[];
 e.llm=async(prompt,options)=>{if(options.task==='voice-targets')return {targets:[{name:'林晚',gender:'f',age:'unknown'}]};seen.push(matchFrom(prompt).voices.map(v=>v.id));return {matches:[]};};
 await e.matchCharacters(b.id,['林晚']);assert.deepEqual(seen,[['catalog-sentinel-0','catalog-sentinel-1','catalog-sentinel-2','catalog-sentinel-3']]);
 e.state.voices=e.state.voices.filter(v=>v.id==='catalog-sentinel-1');
 e.llm=async(_,options)=>{assert.equal(options.task,'voice-targets');return {targets:[{name:'林晚',gender:'f',age:'old'}]};};
 await e.matchCharacters(b.id,['林晚']);assert.equal(b.characters[1].voice,null);
});
test('a returned voice outside the filtered age range cannot bypass the candidate list',async()=>{
 const {e,b}=await fixture();e.llm=async(_,options)=>options.task==='voice-targets'?{targets:[{name:'林晚',gender:'f',age:'young'}]}:{matches:[{name:'林晚',voiceId:'catalog-sentinel-2'}]};
 await e.matchCharacters(b.id,['林晚']);assert.equal(b.characters[1].voice,null);
});
test('an empty filtered catalog continues into automatic design and production',async()=>{
 const {e,b}=await fixture(),c=b.chapters[0];e.state.voices=e.state.voices.filter(v=>v.id==='catalog-sentinel-2');
 c.segments=[{id:0,text:'“你好。”',speaker:'林晚',confidence:1,emotion:'自然'}];e.llm=async(_,options)=>{assert.equal(options.task,'voice-targets');return {targets:[{name:'林晚',gender:'f',age:'young'}]};};
 let designs=0;e.design=async description=>{designs++;return {id:'new-design',description,sample:'new-reference.wav',enabled:true};};e.synthesize=async(_,id)=>{assert.equal(id,'new-design');return {id:'finished-line.wav'};};e.io.mergeAudio=async()=>({id:'finished-chapter.wav'});
 await e.enqueue(b.id,[c.id]);assert.equal(designs,1);assert.equal(b.characters[1].voice,'new-design');assert.equal(e.state.tasks[0].status,'done');assert.equal(c.audio,'finished-chapter.wav');
});
for(const [age,label,preset] of [['young','青年','冰糖'],['middle','中年','茉莉']])test('filtered presets obey demographics and usePresets policy: '+preset,async()=>{
 const {e,b}=await fixture([{name:'林晚',description:label+'女性'}]);e.state.voices=[];e.state.settings.usePresets=true;let matches=0;
 e.llm=async(prompt,options)=>{if(options.task==='voice-targets')return {targets:[{name:'林晚',gender:'f',age}]};matches++;assert.deepEqual(matchFrom(prompt).voices.map(v=>v.id),['preset:'+preset]);return {matches:[{name:'林晚',voiceId:'preset:'+preset}]};};
 await e.matchCharacters(b.id,['林晚']);assert.equal(b.characters[1].voice,'preset:'+preset);assert.equal(matches,1);
 b.characters[1].voice=null;e.state.settings.usePresets=false;e.llm=async()=>{throw Error('empty library must not call LLM');};await e.matchCharacters(b.id,['林晚']);
});
for(const [name,reply] of [
 ['missing role',{targets:[]}],['invalid gender',{targets:[{name:'林晚',gender:'other',age:'young'}]}],
 ['invalid age',{targets:[{name:'林晚',gender:'f',age:'adult'}]}],['duplicate role',{targets:[{name:'林晚',gender:'f',age:'young'},{name:'林晚',gender:'f',age:'young'}]}],
 ['hallucinated role',{targets:[{name:'别人',gender:'f',age:'young'}]}],['missing targets',{matches:[]}]
])test('invalid target response fails without exposing the catalog: '+name,async()=>{
 const {e,b}=await fixture();let calls=0;e.llm=async(prompt,options)=>{calls++;assert.equal(options.task,'voice-targets');assert(!prompt.includes('catalog-sentinel'));return reply;};
 await assert.rejects(e.matchCharacters(b.id,['林晚']),LlmOutputError);assert.equal(calls,1);assert.equal(b.characters[1].voice,null);
});
for(const stage of ['voice-targets','voice-match'])test('manual bindings during '+stage+' take precedence',async()=>{
 const {e,b}=await fixture();e.llm=async(_,options)=>{if(options.task===stage)b.characters[1].voice='manual';return options.task==='voice-targets'?{targets:[{name:'林晚',gender:'f',age:'young'}]}:{matches:[{name:'林晚',voiceId:'catalog-sentinel-1'}]};};
 await e.matchCharacters(b.id,['林晚']);assert.equal(b.characters[1].voice,'manual');
});
for(const change of ['disabled','deleted','description','role','sample'])test('matching discards stale changes: '+change,async()=>{
 const {e,b}=await fixture();e.llm=async(_,options)=>{
  if(options.task==='voice-targets')return {targets:[{name:'林晚',gender:'f',age:'young'}]};
  if(change==='disabled')e.state.voices[1].enabled=false;if(change==='deleted')e.state.voices.splice(1,1);if(change==='description')e.state.voices[1].description='七十岁女性';if(change==='role')b.characters[1].description='中年女性';if(change==='sample')e.state.voices[1].sample='replacement.wav';
  return {matches:[{name:'林晚',voiceId:'catalog-sentinel-1'}]};
 };await e.matchCharacters(b.id,['林晚']);assert.equal(b.characters[1].voice,null);
});
test('manual confirmation policy still saves a suggestion after filtering',async()=>{
 const {e,b}=await fixture();e.state.settings.mode='manual';e.llm=async(_,options)=>options.task==='voice-targets'?{targets:[{name:'林晚',gender:'f',age:'young'}]}:{matches:[{name:'林晚',voiceId:'catalog-sentinel-1'}]};
 await e.matchCharacters(b.id,['林晚']);assert.equal(b.characters[1].voice,null);assert.equal(b.characters[1].suggestedVoice,'catalog-sentinel-1');
 assert.match(ModelPrompts.voiceMatch([],[]),/目标性别和年龄筛选/);
});

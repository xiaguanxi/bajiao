const {test}=require('node:test'),assert=require('node:assert/strict');
const {Engine,ModelPrompts}=require('../app/src/main/assets/core.js');
async function fixture(){const e=new Engine({saveState:async()=>{}}),b=await e.addBook('资料测试','林晚是医馆的学徒。她望向师父，轻声说：“我去取药。”');const c=b.chapters[0],r={name:'林晚',description:'自然清晰的声音',aliases:[],voice:'preset:冰糖'};b.characters.push(r);return {e,b,c,r};}
const profile={name:'林晚',background:'医馆的学徒，与师父一同照看医馆。',description:'年轻女声，音色清亮柔和，吐字轻巧。',evidence:'林晚是医馆的学徒。'};

test('later annotation batches enrich placeholder roles while preserving voices and completed audio',async()=>{
 const {e,b,c,r}=await fixture();c.text=Array.from({length:28},()=> '林晚说：“我去取药。”').join('\n');let calls=0;
 e.llm=async p=>{calls++;const batch=JSON.parse(p.split('本批片段：')[1]);return {characters:calls===1?[]:[profile],lines:batch.map(s=>({id:s.id,speaker:s.text.startsWith('“')?'林晚':'旁白',emotion:'平静',confidence:1,scene:'医馆',delivery:'轻声说完，句尾收住。'}))};};
 await e.analyze(b.id,c.id);assert(calls>1);assert.equal(r.description,profile.description);assert.equal(r.background,profile.background);assert.equal(r.voice,'preset:冰糖');
});

test('existing roles repair from source evidence without any annotation, TTS or audio mutation',async()=>{
 const {e,b,c,r}=await fixture();c.audio='whole.wav';c.segments=[{id:0,text:c.text,speaker:'林晚',audio:'clip.wav'}];const audio=JSON.stringify(c);let requests=0;
 e.llm=async(p,o)=>{requests++;assert.equal(o.task,'character-profile');assert(p.includes(c.text));return {characters:[profile]};};
 assert.equal(await e.ensureCharacterProfiles(b.id),1);assert.equal(requests,1);assert.equal(r.background,profile.background);assert.equal(r.description,profile.description);assert.equal(r.voice,'preset:冰糖');assert.equal(JSON.stringify(c),audio);
 assert.equal(await e.ensureCharacterProfiles(b.id),0);assert.equal(requests,1);
});

test('background repair preserves a detailed voice and deduplicates overlapping page requests',async()=>{
 const {e,b,r}=await fixture();r.description='女声，低音区温润，略带沙哑，不尖细。';const original=r.description;let release,entered;const started=new Promise(r=>entered=r);let calls=0;
 e.llm=async()=>{calls++;entered();await new Promise(r=>release=r);return {characters:[profile]};};
 const a=e.ensureCharacterProfiles(b.id);await started;const second=e.ensureCharacterProfiles(b.id);release();await Promise.all([a,second]);
 assert.equal(calls,1);assert.equal(r.description,original);assert.equal(r.background,profile.background);
});

test('unsupported evidence and concurrent manual edits are never overwritten by profile repair',async()=>{
 for(const mode of ['evidence','edit','removed']){const {e,b,r}=await fixture();e.llm=async()=>{if(mode==='edit')r.description='人工指定的男声';if(mode==='removed')b.characters=b.characters.filter(x=>x!==r);return {characters:[{...profile,evidence:mode==='evidence'?'她是失落帝国的女王。':profile.evidence}]};};
 assert.equal(await e.ensureCharacterProfiles(b.id),0);assert.equal(r.background,undefined);assert.equal(r.description,mode==='edit'?'人工指定的男声':'自然清晰的声音');}
});

test('both LLM annotation and director repair require internally consistent restrained narration',()=>{
 assert.match(ModelPrompts.annotationRules,/旁白的 emotion 与 delivery 必须从生成时就采用克制/);
 assert.match(ModelPrompts.direction({batch:[],context:[]}),/不能先要求尖叫、哭喊、夸张表演再追加克制要求/);
});

test('verified insufficient background stays explicit and does not trigger repeated model requests',async()=>{
 const {e,b,r}=await fixture();let calls=0;
 e.llm=async()=>{calls++;return {characters:[{...profile,background:'',description:'原文仅有轻声台词，具体年龄、音质和口音尚不明确。'}]};};
 await e.ensureCharacterProfiles(b.id);assert.equal(r.background,undefined);assert(r.profileChecked);
 await e.ensureCharacterProfiles(b.id);assert.equal(calls,1);
});

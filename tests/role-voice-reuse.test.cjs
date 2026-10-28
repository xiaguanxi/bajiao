const {test}=require('node:test'),assert=require('node:assert/strict');
const {Engine,ModelPrompts,VOICE_REUSE_MAX_CHAPTERS,VOICE_REUSE_RECENT_CHAPTERS}=require('../app/src/main/assets/core.js');
const description='青年男性，声线清亮，不沙哑，普通话。';
const line=(speaker,extra={})=>({id:0,text:'“请进。”',speaker,confidence:1,annotationStatus:'complete',...extra});
async function fixture(){
 const e=new Engine({saveState:async()=>{}}),b=await e.addBook('复用规则','正文。');
 const donor={name:'周明',description,voice:'old',bitPart:false},target={name:'韩青',description,voice:null,bitPart:true,bitPartSource:'llm'};
 b.characters.push(donor,target);
 e.state.voices=[{id:'old',description,sample:'old.wav',enabled:true}];
 b.chapters=Array.from({length:12},(_,i)=>({id:'c'+(i+1),title:'第'+(i+1)+'章',text:'“请进。”',status:'annotated',segments:[line('旁白')]}));
 b.chapters[3].segments.push(line(donor.name));b.chapters[11].segments.push(line(target.name));
 return {e,b,donor,target};
}
function place(b,name,chapters){for(const c of b.chapters)c.segments=c.segments.filter(s=>s.speaker!==name);for(const n of chapters)b.chapters[n-1].segments.push(line(name));}

test('reuse limits are three total appearances and five recent annotated chapters',()=>{
 assert.equal(VOICE_REUSE_MAX_CHAPTERS,3);assert.equal(VOICE_REUSE_RECENT_CHAPTERS,5);
});

for(const chapters of [[4],[4,5],[4,5,6],[4,5,6,7]])test(`donor chapter threshold ${chapters.length}, independent of its LLM classification`,async()=>{
 const {e,b,donor,target}=await fixture();place(b,donor.name,chapters);
 const allowed=chapters.length<=3;assert.equal(e.characterAppearances(b).get(donor.name).canLendVoice,allowed);
 assert.equal(e.autoVoiceFor(b.id,target.name),allowed?'old':null);
 donor.bitPart=true;assert.equal(e.autoVoiceFor(b.id,target.name),allowed?'old':null);
});

test('a named LLM extra may borrow, while a named or generic non-extra cannot',async()=>{
 const {e,b,target}=await fixture();assert.equal(e.autoVoiceFor(b.id,target.name),'old');
 target.bitPart=false;assert.equal(e.autoVoiceFor(b.id,target.name),null);
 target.name='路人甲';assert.equal(e.autoVoiceFor(b.id,target.name),null);
});

test('legacy name-based extra flags cannot replace an LLM judgment',async()=>{
 const {e,b,target}=await fixture();delete target.bitPartSource;
 assert.equal(e.autoVoiceFor(b.id,target.name),null);
 target.bitPartSource='llm';assert.equal(e.autoVoiceFor(b.id,target.name),'old');
});

for(const n of [1,2,3,4,5,6])test(`rolling window naturally prevents early reuse until annotated chapter six, count=${n}`,async()=>{
 const {e,b,donor,target}=await fixture();b.chapters=b.chapters.slice(0,n);place(b,donor.name,[1]);place(b,target.name,[n]);
 assert.equal(e.autoVoiceFor(b.id,target.name),n<=5?null:'old');
});

test('early characters may lend after leaving the window, with no fixed chapter protection',async()=>{
 const {e,b,donor,target}=await fixture();place(b,donor.name,[1]);
 assert.equal(e.autoVoiceFor(b.id,target.name),'old');
});

test('recency uses the five most recent annotated chapters, including the current chapter',async()=>{
 const {e,b,donor,target}=await fixture();
 place(b,donor.name,[7]);assert.equal(e.autoVoiceFor(b.id,target.name),'old');
 for(const n of [8,9,10,11,12]){place(b,donor.name,[n]);assert.equal(e.autoVoiceFor(b.id,target.name),null);}
 place(b,donor.name,[4]);for(const c of b.chapters.slice(4,11)){c.status='raw';c.segments=[];}
 assert.equal(e.autoVoiceFor(b.id,target.name),null,'raw chapters do not age out a donor');
});

test('same-chapter repetition and aliases count once; invalid and skipped annotations never count',async()=>{
 const {e,b,donor}=await fixture();donor.aliases=['周掌柜'];
 b.chapters[3].segments.push(line(donor.name),line('周掌柜'));
 b.chapters[0].segments.push(...['pending','failed','fallback'].map(annotationStatus=>line(donor.name,{annotationStatus})),line(donor.name,{skip:true}),line(donor.name,{isAd:true}),line(donor.name,{text:'……'}));
 const stats=e.characterAppearances(b).get(donor.name);assert.equal(stats.chapterCount,1);assert.equal(stats.firstChapter,4);assert.equal(stats.lastChapter,4);
 b.chapters[11].segments.push(line('周掌柜'));assert.equal(e.characterAppearances(b).get(donor.name).recentlySeen,true);
});

test('one recent holder blocks every alias of a shared audio sample',async()=>{
 const {e,b,donor,target}=await fixture();e.state.voices.push({id:'alias',sample:'old.wav',description,enabled:true});
 const holder={name:'刘伯',voice:'alias',description,bitPart:true};b.characters.push(holder);b.chapters[11].segments.push(line(holder.name));
 assert(e.characterAppearances(b).get(donor.name).canLendVoice);
 assert.equal(e.voiceAvailable(b,target,'old'),false);assert.equal(e.autoVoiceFor(b.id,target.name),null);
 place(b,holder.name,[5]);assert.equal(e.autoVoiceFor(b.id,target.name),'old');
});

test('pending design and suggested voices remain reserved even for an inactive role',async()=>{
 const {e,b,donor,target}=await fixture();donor.voice=null;donor.suggestedVoice='old';
 assert.equal(e.voiceAvailable(b,target,'old'),false);delete donor.suggestedVoice;donor.candidate={id:'candidate',sample:'old.wav'};
 assert.equal(e.voiceAvailable(b,target,'old'),false);
});

test('borrowing a voice reserves it against a second extra who is currently present',async()=>{
 const {e,b,target}=await fixture(),other={name:'郑青',description,bitPart:true,bitPartSource:'llm',voice:null};b.characters.push(other);b.chapters[11].segments.push(line(other.name));
 e.llm=async()=>{throw Error('no voice should remain available for the second extra');};
 await e.matchCharacters(b.id,[target.name,other.name]);assert.equal(target.voice,'old');assert.equal(other.voice,null);
});

test('LLM requests include lending stats and cannot bypass the allowed voice list',async()=>{
 const {e,b,donor,target}=await fixture();place(b,donor.name,[12]);e.state.voices.push({id:'free',sample:'free.wav',description,enabled:true});
 e.llm=async (prompt,options)=>{
  if(options?.task==='voice-targets')return {targets:[{name:target.name,gender:'m',age:'young'}]};
  const roles=JSON.parse(prompt.split('角色：')[1].split('\n音色：')[0]);assert.equal(roles[0].bitPart,true);assert.deepEqual(roles[0].availableVoiceIds,['free']);
  return {matches:[{name:target.name,voiceId:'old'}]};
 };
 await e.matchCharacters(b.id,[target.name]);assert.equal(target.voice,null);
});

test('a donor reappearing during LLM matching invalidates the in-flight reuse',async()=>{
 const {e,b,donor,target}=await fixture();target.description='青年男性，声音清亮，略带气声。';
 e.llm=async (prompt,options)=>{if(options?.task==='voice-targets')return {targets:[{name:target.name,gender:'m',age:'young'}]};assert.match(prompt,/"canLendVoice":true/);b.chapters[11].segments.push(line(donor.name));return {matches:[{name:target.name,voiceId:'old'}]};};
 await e.matchCharacters(b.id,[target.name]);assert.equal(target.voice,null);
});

test('historical metadata is backfilled once without loading whole chapters into the library',async()=>{
 const {e,b,target}=await fixture();const full=new Map(b.chapters.map(c=>[c.id,structuredClone(c)]));
 b.chapters=b.chapters.map(c=>({id:c.id,title:c.title,status:c.status,segmentCount:c.segments.length,unloaded:true,segments:[]}));
 let reads=0,saved;e.dirtyChapters=new Set();e.io.loadChapter=async id=>{reads++;return structuredClone(full.get(id));};e.io.saveSnapshot=async(header,dirty)=>{saved=JSON.parse(header);assert.deepEqual(JSON.parse(dirty),[]);};
 assert.equal(e.autoVoiceFor(b.id,target.name),null,'incomplete historical stats must fail closed');
 await Promise.all([e.ensureCharacterAppearances(b.id),e.ensureCharacterAppearances(b.id)]);assert.equal(reads,12);assert(b.chapters.every(c=>c.unloaded&&c.segments.length===0));
 assert.equal(e.autoVoiceFor(b.id,target.name),'old');await e.ensureCharacterAppearances(b.id);assert.equal(reads,12);
 const reloaded=new Engine({saveState:async()=>{},loadChapter:async()=>{throw Error('metadata should suffice');}},saved);
 await reloaded.ensureCharacterAppearances(b.id);assert.equal(reloaded.autoVoiceFor(b.id,target.name),'old');
});

test('legacy lazy headers without an unloaded flag still backfill appearances',async()=>{
 const {e,b,target}=await fixture(),full=new Map(b.chapters.map(c=>[c.id,structuredClone(c)]));
 b.chapters=b.chapters.map(c=>({id:c.id,title:c.title,status:c.status,segmentCount:c.segments.length,segments:[]}));
 e.io.loadChapter=async id=>structuredClone(full.get(id));
 assert.equal(e.autoVoiceFor(b.id,target.name),null);await e.ensureCharacterAppearances(b.id);
 assert.equal(e.autoVoiceFor(b.id,target.name),'old');assert(b.chapters.every(c=>c.text===undefined));
});

test('more appearances stop future loans and preserve existing bindings and completed audio',async()=>{
 const {e,b,donor,target}=await fixture();b.chapters[3].audio='chapter.wav';b.chapters[3].segments[1].audio='line.wav';
 place(b,donor.name,[4,5,6,7]);b.chapters[3].audio='chapter.wav';b.chapters[3].segments.find(s=>s.speaker===donor.name).audio='line.wav';
 assert.equal(e.autoVoiceFor(b.id,target.name),null);assert.equal(donor.voice,'old');assert.equal(b.chapters[3].audio,'chapter.wav');assert.equal(b.chapters[3].segments.find(s=>s.speaker===donor.name).audio,'line.wav');
});

for(const mode of ['fast','director'])for(const bitPart of [true,false,undefined])test(`LLM classification controls generic names in ${mode} mode, bitPart=${bitPart}`,async()=>{
 const e=new Engine({saveState:async()=>{}});e.state.settings.promptMode=mode;
 const b=await e.addBook('模型判断','路人甲说：“请进。”');
 e.llm=async prompt=>{
  assert.match(prompt,/不能仅凭姓名、职业代称/);const batch=JSON.parse(prompt.split('本批片段：')[1]);
  return {characters:[{name:'路人甲',description,bitPart}],lines:batch.map(s=>({id:s.id,speaker:s.text.startsWith('“')?'路人甲':'旁白',emotion:'平静',confidence:1,scene:'门前交流',delivery:'以清楚自然的语气说完，句末收住。'}))};
 };
 await e.analyze(b.id,b.chapters[0].id);assert.equal(b.characters.find(r=>r.name==='路人甲').bitPart,bitPart===true);
 assert(ModelPrompts.voiceMatch([],[]).includes('最近 5 个已标注章节未出现'));
});

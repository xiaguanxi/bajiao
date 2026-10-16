const {test}=require('node:test'),assert=require('node:assert/strict');
const {Engine}=require('../app/src/main/assets/core.js');
function io(){return {saveState:async()=>{},request:async()=>{throw Error('Unexpected request')},mergeAudio:async ids=>({id:'merged.wav',duration:ids.length}),saveAudio:async()=>({id:'sample.wav'}),readAudio:async()=>({base64:'AA=='})};}

function twoChapters(){return ['第1章','黑衣人说。','第2章','沈砚就是黑衣人。'].join('\n');}

test('auto mode merges revealed identity and reuses voice with alias spans',async()=>{
  const e=new Engine(io()),b=await e.addBook('t',twoChapters());
  e.state.settings.mode='auto';
  b.characters.push({name:'黑衣人',description:'青年男声',aliases:[],voice:'v-old'});
  const c1=b.chapters[0];c1.segments=[{id:0,text:'x',speaker:'黑衣人',emotion:'平静',confidence:1,audio:'a0'}];
  const c2=b.chapters[1];
  e.llm=async()=>({characters:[{name:'沈砚',description:'青年男声',aliases:['黑衣人']}],lines:[]});
  // lines 为空会触发数量校验，改直接调 mergeRoles 路径：先手动放行再验 analyze 流程
  e.llm=async()=>({characters:[{name:'沈砚',description:'青年男声',aliases:['黑衣人']}],lines:(await (async()=>{const {units}=require('../app/src/main/assets/core.js');return units(c2.text).map(x=>({id:x.id,speaker:'旁白',emotion:'平静',confidence:1}));})())});
  await e.analyze(b.id,c2.id);
  assert(!b.characters.some(r=>r.name==='黑衣人'));
  const shen=b.characters.find(r=>r.name==='沈砚');
  assert(shen&&shen.aliases.includes('黑衣人'));
  assert.equal(shen.voice,'v-old');
  assert.deepEqual(shen.aliasSpans['黑衣人'],[c1.id]);
  assert.equal(c1.segments[0].speaker,'沈砚');
});

test('manual mode queues merge suggestion instead of merging',async()=>{
  const e=new Engine(io()),b=await e.addBook('t',twoChapters());
  e.state.settings.mode='manual';
  b.characters.push({name:'黑衣人',description:'青年男声',aliases:[],voice:'v-old'});
  const c2=b.chapters[1];
  e.llm=async()=>{const {units}=require('../app/src/main/assets/core.js');return {characters:[{name:'沈砚',description:'青年男声',aliases:['黑衣人']}],lines:units(c2.text).map(x=>({id:x.id,speaker:'旁白',emotion:'平静',confidence:1}))};};
  await e.analyze(b.id,c2.id);
  assert(b.characters.some(r=>r.name==='黑衣人'));
  assert.equal(b.mergeSuggestions.length,1);
  assert.equal(b.mergeSuggestions[0].from,'黑衣人');
  await e.mergeRoles(b.id,'沈砚','黑衣人');
  assert(!b.characters.some(r=>r.name==='黑衣人'));
  assert.equal(b.characters.find(r=>r.name==='沈砚').voice,'v-old');
});

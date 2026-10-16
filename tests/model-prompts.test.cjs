const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {Engine,LlmOutputError,ModelPrompts}=require('../app/src/main/assets/core.js');
const make=()=>new Engine({saveState:async()=>{}});
test('known MiMo capabilities are explicit; generic and Anthropic requests stay compatible',async()=>{
 const e=make(),sent=[];e.io.request=async(_,b)=>{sent.push(b);return b.system?{content:[{type:'text',text:'{"ok":true}'}]}:{choices:[{message:{content:'{"ok":true}'},finish_reason:'stop'}]};};
 e.state.settings.llmModel='mimo-v2.6-flash';await e.llm('json',{maxTokens:3000});assert.deepEqual(sent[0].response_format,{type:'json_object'});assert.deepEqual(sent[0].thinking,{type:'disabled'});assert.equal(sent[0].max_completion_tokens,3000);assert.equal(sent[0].max_tokens,undefined);
 e.state.settings.llmModel='custom';await e.llm('json');assert.equal(sent[1].thinking,undefined);assert.equal(sent[1].response_format,undefined);assert.equal(sent[1].max_tokens,12000);
 e.state.settings.llmProtocol='anthropic';await e.llm('json');assert.equal(sent[2].system,ModelPrompts.system);
 e.io.request=async()=>({stop_reason:'max_tokens',content:[]});await assert.rejects(e.llm('json'),e=>e instanceof LlmOutputError&&e.kind==='truncated');
});
test('batching reduces real novel prompt input and preserves old checkpoint sizing',async()=>{
 const text=new TextDecoder('gb18030').decode(fs.readFileSync('books/'+fs.readdirSync('books').find(f=>f.endsWith('.txt'))));const e=new Engine({saveState:async()=>{},features:{batching:true,direction:false}}),b=await e.addBook('measure',text),c=b.chapters.find(c=>c.title.includes('0001'));let chars=0,calls=0;
 e.llm=async p=>{chars+=p.length;calls++;const batch=JSON.parse(p.split('本批片段：')[1]);return {lines:batch.map(s=>({...s,speaker:'旁白',emotion:'自然',confidence:1})),summary:'累积摘要'};};await e.analyze(b.id,c.id);assert.equal(calls,2);assert(chars<18504,`input chars ${chars}`);
 const legacy=make(),book=await legacy.addBook('legacy','甲。'.repeat(95));book.chapters[0].analysisDraft={version:2,next:0,batchSize:45};await legacy.prepareAnnotations(book.id,book.chapters[0].id);assert.equal(book.chapters[0].analysisDraft.batchSize,45);
});
test('scene direction is gated, custom prompts win and staged edits invalidate identity',()=>{
 const e=make(),s={directionVersion:1,emotion:'没有生气',scene:'重逢',delivery:'担忧而克制'},role={voice:'preset:白桦',description:'低沉男声'};
 e.features.direction=false;const old=e.speechDirection(role.voice,s.emotion,role.description,undefined,s);assert(!old.includes('重逢'));e.features.direction=true;
 const prompt=e.speechDirection(role.voice,s.emotion,role.description,undefined,s);assert(prompt.includes('重逢'));assert(prompt.includes('担忧而克制'));assert.equal(e.speechDirection(role.voice,s.emotion,role.description,' 精确自定义 ',s),' 精确自定义 ');
 const key=JSON.stringify(e.speechIdentity(s,role));s.delivery='温柔';assert.notEqual(JSON.stringify(e.speechIdentity(s,role)),key);
});

test('director mode defaults on with 24-line batches; pipeline and clone concurrency stay unchanged',async()=>{const e=make(),b=await e.addBook('gates','甲。'.repeat(95)),c=b.chapters[0];await e.prepareAnnotations(b.id,c.id);assert.equal(c.analysisDraft.batchSize,24);assert.equal(e.features.direction,true);assert.equal(e.features.batching,false);assert.equal(e.features.pipeline,false);assert.equal(e.features.cloneConcurrency,1);});

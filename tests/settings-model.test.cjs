const {test}=require('node:test'),assert=require('node:assert/strict');
const S=require('../app/src/main/assets/settings-model.js'),V=require('../app/src/main/assets/core.js');
const io=()=>({saveState:async()=>{},features:{direction:false},mergeAudio:async()=>({id:'merged.wav',duration:2})});

test('legacy model configuration migrates into an independent model list',()=>{
 const settings=S.normalize({llmBase:'https://proxy.example/v1',llmProtocol:'anthropic',llmModel:'legacy-model'});
 assert.equal(settings.llmProvider,'other');assert.equal(settings.llmBase,'https://proxy.example/v1');assert.equal(settings.llmProtocol,'anthropic');assert.deepEqual(settings.llmModels,['legacy-model']);
 assert.deepEqual(S.normalize({...settings,llmModels:[' one ','one',null,'two']}).llmModels,['one','two','legacy-model']);
 const next=S.normalize();settings.llmModels.push('custom');assert.deepEqual(next.llmModels,[]);
});
test('header credentials stay outside snapshots, participate in dirty checks and preserve key changes',()=>{
 const settings=S.normalize(),headers=[{name:'x-token',value:'private-header'}],draft=new S.Draft('llm',settings,headers);
 assert(!draft.dirty);draft.setHeaders([{name:'Authorization',value:'Bearer another-private-header'}]);assert(draft.dirty);
 draft.setCredential('replace','private-key');assert.equal(draft.credential.headers[0].name,'Authorization');
 assert(!JSON.stringify(draft.changes()).includes('private'));assert(!JSON.stringify(settings).includes('private'));
 draft.setHeaders(headers);draft.setCredential('keep');assert(!draft.dirty);
});
test('headers validate duplicate names, injection and restricted transport fields',()=>{
 assert.equal(S.validateHeaders([{name:'Authorization',value:'Bearer gateway'},{name:'anthropic-version',value:'2023-06-01'}]),'');
 for(const headers of [[{name:'',value:'x'}],[{name:'X-Token',value:'a'},{name:'x-token',value:'b'}],[{name:'X-Token',value:'a\r\nInjected: yes'}],[{name:'Host',value:'other'}],[{name:'Content-Length',value:'0'}],[{name:'X',value:'中文'}]])assert(S.validateHeaders(headers));
});
test('model discovery does not require a model, and selected model is included when saving',()=>{
 const settings=S.normalize({llmBase:'https://proxy.example/v1',llmProtocol:'responses'});
 assert(!S.validate('llm',settings).valid);assert(S.validate('llm',settings,[],{requireModel:false}).valid);
 const checked=S.validate('llm',{...settings,llmModel:' chosen ',llmModels:['first','first']});assert(checked.valid);assert.deepEqual(checked.value.llmModels,['first','chosen']);
});
test('Responses uses its own request schema and reads message output after reasoning',async()=>{
 let sent;const e=new V.Engine({...io(),request:async(provider,body)=>{sent={provider,body};return {status:'completed',output:[{type:'reasoning',summary:[]},{type:'message',content:[{type:'output_text',text:'{"ok":true}'}]}]};}});
 Object.assign(e.state.settings,{llmProtocol:'responses',llmModel:'test-model'});assert.deepEqual(await e.llm('Return JSON',{maxTokens:512}),{ok:true});
 assert.equal(sent.provider,'llm');assert.equal(sent.body.model,'test-model');assert.equal(sent.body.input,'Return JSON');assert.equal(sent.body.max_output_tokens,512);assert.equal(sent.body.store,false);assert(!sent.body.messages);assert(!sent.body.max_tokens);
});
test('Responses refuses incomplete, filtered and refused output',async()=>{
 for(const result of [{status:'incomplete',incomplete_details:{reason:'max_output_tokens'}},{status:'incomplete',incomplete_details:{reason:'content_filter'}},{status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'Denied'}]}]},{status:'failed',error:{message:'failure'}}]){
  const e=new V.Engine({...io(),request:async()=>result});e.state.settings.llmProtocol='responses';await assert.rejects(e.llm('test'));
 }
});

test('TTS refusal policy defaults to confirmation and persists independently of retry counts',()=>{
 for(const saved of [{},{mode:'auto'},{ttsContentRejectedMode:'invalid'},{ttsContentRejectedMode:null}])assert.equal(S.normalize(saved).ttsContentRejectedMode,'review');
 const settings=S.normalize({ttsContentRejectedMode:'skip',ttsRetries:7}),draft=new S.Draft('quality',settings);
 assert.equal(S.normalize(JSON.parse(JSON.stringify(settings))).ttsContentRejectedMode,'skip');assert.equal(settings.ttsRetries,7);
 draft.set('ttsContentRejectedMode','review');assert.deepEqual(draft.changes(),{ttsContentRejectedMode:'review'});assert(S.validate('quality',draft.value).valid);
 draft.set('ttsContentRejectedMode','other');assert(!S.validate('quality',draft.value).valid);draft.reset();assert.equal(draft.value.ttsContentRejectedMode,'review');
});

test('legacy automatic/manual choices migrate once into independent policies',()=>{
 for(const mode of ['auto','manual']){
  const s=S.normalize({mode,retries:11,speakerThreshold:.65,ttsParallel:4,keepRecentCount:0});
  assert.equal(s.voiceAdoptionMode,mode==='auto'?'auto':'review');assert.equal(s.speakerUncertaintyMode,mode==='auto'?'narrator':'review');assert.equal(s.roleMergeMode,mode==='auto'?'auto':'review');
  s.voiceAdoptionMode='review';const reloaded=S.normalize(JSON.parse(JSON.stringify(s)));assert.equal(reloaded.speakerUncertaintyMode,s.speakerUncertaintyMode);assert.equal(reloaded.roleMergeMode,s.roleMergeMode);
  assert.equal(s.retries,11);assert.equal(s.keepRecentCount,0);assert.equal(s.speakerThreshold,.65);assert.equal(s.ttsParallel,4);assert(!JSON.stringify(s).includes('"mode"'));
 }
});
test('legacy playback speed migrates to the sole persisted settings field',()=>{
 const state=V.makeState();state.playbackSpeed=1.75;state.settings.playbackSpeed=1;const e=new V.Engine(io(),state);
 assert.equal(e.state.settings.playbackSpeed,1.75);assert(!Object.hasOwn(e.state,'playbackSpeed'));assert.equal(new V.Engine(io(),JSON.parse(JSON.stringify(e.state))).state.settings.playbackSpeed,1.75);
});
test('director defaults preserve saved mode choices and replace invalid modes',()=>{
 for(const saved of [{},{promptMode:null},{promptMode:'invalid'}])assert.equal(S.normalize(saved).promptMode,'director');
 for(const promptMode of ['fast','director'])assert.equal(S.normalize({promptMode}).promptMode,promptMode);
 const draft=new S.Draft('productionmode',S.normalize({promptMode:'fast'}));draft.reset();assert.equal(draft.value.promptMode,'director');
});

test('normalization preserves unknown settings and does not share nested defaults',()=>{
 const first=S.normalize({futureSetting:{enabled:true}}),second=S.normalize();first.defaultVoices.narrator='mine';assert.equal(second.defaultVoices.narrator,'preset:白桦');assert.equal(S.DEFAULT_VOICES.narrator,'preset:白桦');assert.deepEqual(first.futureSetting,{enabled:true});
});
test('drafts preserve isolation, true dirty comparison, page patches and reset',()=>{
 const settings=S.normalize(),d=new S.Draft('productionpolicy',settings);d.set('connectTimeoutSeconds','60');assert(d.dirty);assert.deepEqual(d.changes(),{connectTimeoutSeconds:60});d.set('connectTimeoutSeconds','30');assert(!d.dirty);
 d.set('ttsParallel',4);d.reset();assert(!d.dirty);const v=new S.Draft('voicepolicy',settings);v.set('defaultVoices.maleLead',null);assert.equal(settings.defaultVoices.maleLead,'preset:苏打');assert.deepEqual(Object.keys(v.changes()),['defaultVoices']);
});
test('credentials are draft-only and absent from settings patches',()=>{
 const d=new S.Draft('llm',S.normalize());d.setCredential('replace','temporary-test-key');assert(d.dirty);assert.deepEqual(d.changes(),{});assert(!JSON.stringify(d.value).includes('temporary-test-key'));d.setCredential('keep');assert(!d.dirty);d.setCredential('clear');assert(d.dirty);
});
test('timeouts enforce integer ranges and extend bridge wait beyond native limits',()=>{
 for(const [key,min,max] of [['connectTimeoutSeconds',5,120],['responseTimeoutSeconds',30,600]])for(const bad of ['',-1,'3.5','1e2','abc',min-1,max+1])assert(!S.validate('productionpolicy',{...S.normalize(),[key]:bad}).valid,key+' '+bad);
 const settings={...S.normalize(),connectTimeoutSeconds:120,responseTimeoutSeconds:600};assert(S.validate('productionpolicy',settings).valid);assert.equal(S.requestTimeoutMs(settings),750000);
});
test('retry validation retains zero and values above three; invalid forms stay invalid',()=>{
 for(const key of ['llmRetries','ttsRetries'])for(const n of [0,3,17,Number.MAX_SAFE_INTEGER])assert(S.validate('quality',{...S.normalize(),[key]:String(n)}).valid);
 for(const key of ['llmRetries','ttsRetries'])for(const n of ['',-1,'1.0','1e2','abc',Number.MAX_SAFE_INTEGER+1])assert(!S.validate('quality',{...S.normalize(),[key]:n}).valid);
});
test('default choices reject missing voices and shared samples but allow explicit disabled voices',()=>{
 const settings=S.normalize(),voices=[{id:'one',sample:'same.wav',enabled:false},{id:'alias',sample:'same.wav'}];settings.defaultVoices.maleLead='one';assert(S.validate('voicepolicy',settings,voices).valid);settings.defaultVoices.femaleLead='alias';assert(!S.validate('voicepolicy',settings,voices).valid);settings.defaultVoices.femaleLead=null;assert(S.validate('voicepolicy',settings,voices).valid);settings.defaultVoices.maleLead='missing';assert(!S.validate('voicepolicy',settings,voices).valid);settings.defaultVoices.maleLead='preset:invented';assert(!S.validate('voicepolicy',settings,voices).valid);
});
test('new-book snapshots survive global changes, reload and reference deletion',async()=>{
 const e=new V.Engine(io());e.state.voices.push({id:'custom',sample:'reference.wav',name:'自定义',description:'青年男声',enabled:false});e.state.settings.defaultVoices.maleLead='custom';
 const b=await e.addBook('第一本','第一章\n正文。');b.presetLeadVoices.maleLead='沈砚';const role={name:'沈砚',voice:null};b.characters.push(role);assert.equal(e.defaultLeadVoice(b,role),'custom');e.state.settings.defaultVoices.maleLead=null;assert.equal(e.defaultLeadVoice(b,role),'custom');
 const next=await e.addBook('第二本','正文。');assert.equal(next.voiceDefaults.maleLead,null);assert.equal(b.voiceDefaults.maleLead,'custom');const reloaded=new V.Engine(io(),JSON.parse(JSON.stringify(e.state)));assert.equal(reloaded.book(b.id).voiceDefaults.maleLead,'custom');
 b.chapters[0].audio='finished.wav';await e.deleteVoice('custom');assert.equal(e.defaultLeadVoice(b,role),null);assert.equal(b.voiceDefaults.maleLead,'custom');assert.equal(b.chapters[0].audio,'finished.wav');assert.equal(e.resolveDefaultVoice('missing',true),'preset:白桦');
});
test('legacy book migration preserves lazy chapters and lead eligibility',()=>{
 const state=V.makeState();state.books=[{id:'old',name:'老书',characters:[{name:'旁白',voice:'preset:茉莉'}],chapters:[{id:'lazy',unloaded:true,segmentCount:3}],presetLeadVoices:{version:1,maleLead:'沈砚'}},{id:'older',name:'更老的书',characters:[],chapters:[]}];
 const e=new V.Engine({...io(),loadChapter:()=>{throw Error('must stay lazy');}},state);assert.deepEqual(e.book('old').voiceDefaults,S.DEFAULT_VOICES);assert.equal(e.book('old').characters[0].voice,'preset:茉莉');assert(e.book('old').chapters[0].unloaded);assert.equal(e.book('older').voiceDefaults,undefined);assert.equal(e.defaultLeadVoice(e.book('older'),{name:'沈砚'}),null);
});
for(const voice of ['auto','review'])for(const speaker of ['narrator','review'])for(const merge of ['auto','review'])test(`independent policies: voice=${voice}, speaker=${speaker}, merge=${merge}`,async()=>{
 const e=new V.Engine(io());Object.assign(e.state.settings,{voiceAdoptionMode:voice,speakerUncertaintyMode:speaker,roleMergeMode:merge});
 const fallback=e.annotationFallback({id:0,text:'“你好。”',speaker:'未知角色',confidence:.1},'不确定');assert.equal(fallback.annotationStatus,speaker==='narrator'?'fallback':'failed');
 const b=await e.addBook('匹配','“你好。”');b.characters.push({name:'林晚',description:'青年女性，清亮自然',voice:null});e.state.voices.push({id:'mine',sample:'mine.wav',description:'青年女性，清亮自然',enabled:true});e.llm=async(_,options)=>options?.task==='voice-targets'?{targets:[{name:'林晚',gender:'f',age:'young'}]}:{matches:[{name:'林晚',voiceId:'mine'}]};await e.matchCharacters(b.id,['林晚']);assert.equal(b.characters[1][voice==='auto'?'voice':'suggestedVoice'],'mine');
 const aliases=await e.addBook('身份','第1章\n黑衣人说。\n第2章\n沈砚就是黑衣人。');aliases.characters.push({name:'黑衣人',description:'青年男声',aliases:[],voice:'known'});aliases.chapters[0].segments=[{id:0,text:'黑衣人说。',speaker:'黑衣人',confidence:1,audio:'old.wav'}];
 e.llm=async()=>({characters:[{name:'沈砚',description:'青年男声',aliases:['黑衣人']}],lines:V.units(aliases.chapters[1].text).map(x=>({id:x.id,speaker:'旁白',confidence:1,emotion:''}))});await e.analyze(aliases.id,aliases.chapters[1].id);
 assert.equal(aliases.characters.some(r=>r.name==='黑衣人'),merge==='review');assert.equal(aliases.mergeSuggestions.length,merge==='review'?1:0);assert.equal(e.state.settings.voiceAdoptionMode,voice);assert.equal(e.state.settings.speakerUncertaintyMode,speaker);
});
test('model saves serialize with snapshots and failure does not apply a partial public patch',async()=>{
 const events=[],adapter=io();adapter.saveModelConfiguration=async(provider,patch,credential)=>{events.push({provider,patch,credential});if(credential.key==='fail')throw Error('模拟凭据保存失败');return {llmConfigured:true};};const e=new V.Engine(adapter);
 await assert.rejects(e.commitModelConfiguration('llm',{llmModel:'failed'},{operation:'replace',key:'fail'}));assert.equal(e.state.settings.llmModel,'');
 await e.commitModelConfiguration('llm',{llmModel:'saved'},{operation:'replace',key:'success'});assert.equal(e.state.settings.llmModel,'saved');assert.equal(events.length,2);assert(!JSON.stringify(e.state).includes('success'));
});

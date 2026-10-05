const {test}=require('node:test'),assert=require('node:assert/strict');
const {Engine,units,splitBook,parseJson,normalize}=require('../app/src/main/assets/core.js');
function io(){return {saveState:async()=>{},request:async()=>{throw Error('Unexpected request')},mergeAudio:async ids=>({id:'merged.wav',duration:ids.length}),saveAudio:async()=>({id:'sample.wav'}),readAudio:async()=>({base64:'AA=='})};}
test('sentence segmentation preserves every non-whitespace character including quotes',()=>{for(const t of ['甲说：“别走！”她停下。\n门开了。','"Hello." John said.','“未闭合的对白','a'.repeat(600),'甲「你好。」乙『再见！』'])assert.equal(normalize(units(t).map(x=>x.text).join('')),normalize(t));});
test('chapter headings and large chapters are safely split',()=>{assert.equal(splitBook('第一章 开始\n正文\n第二章 结束\n结尾').length,2);assert.equal(splitBook('a'.repeat(30000)).length,3);assert.throws(()=>splitBook('  '));});
test('MiniMax thinking and code fence JSON are removed',()=>{assert.deepEqual(parseJson('<think>reason</think>```json\n{"ok":true}\n```'),{ok:true});assert.throws(()=>parseJson('hello'));});
test('LLM duplicate identifiers cannot replace original text',async()=>{const e=new Engine(io()),b=await e.addBook('test','甲。乙。');e.llm=async()=>({characters:[],lines:[{id:0,speaker:'旁白',emotion:'平静',confidence:1},{id:0,speaker:'旁白',emotion:'平静',confidence:1}]});await assert.rejects(e.analyze(b.id,b.chapters[0].id),/数量不匹配|重复/);assert.equal(b.chapters[0].segments.length,0);});
test('invalid voice ids returned by LLM are rejected',async()=>{const e=new Engine(io()),b=await e.addBook('test','甲。');b.characters.push({name:'甲',description:'男声',voice:null});e.state.voices.push({id:'real',description:'男声',enabled:true});e.llm=async()=>({matches:[{name:'甲',voiceId:'hallucinated'}]});await e.matchCharacters(b.id,['甲']);assert.equal(b.characters[1].voice,null);});
test('manual design pauses only blocked role and preserves completed narrator audio',async()=>{const e=new Engine(io()),b=await e.addBook('t','甲。乙。'),c=b.chapters[0];c.segments=[{id:0,text:'甲。',speaker:'旁白',emotion:'平静',confidence:1,audio:null},{id:1,text:'乙。',speaker:'乙',emotion:'平静',confidence:1,audio:null}];b.characters.push({name:'乙',description:'少年',voice:null});e.design=async()=>({id:'new',sample:'reference.wav',description:'少年',enabled:true});let calls=0;e.synthesize=async()=>({id:'audio-'+(++calls)});await e.enqueue(b.id,[c.id]);assert.equal(e.state.tasks[0].status,'waiting');assert.equal(calls,1);assert(c.segments[0].audio);await e.accept(b.id,'乙');assert.equal(e.state.tasks[0].status,'done');assert.equal(calls,2);assert.equal(e.state.voices.length,1);});
test('auto design saves reference and completes without confirmation',async()=>{const e=new Engine(io()),b=await e.addBook('t','甲。'),c=b.chapters[0];e.state.settings.mode='auto';b.characters.push({name:'甲',voice:null,description:'少年'});c.segments=[{id:0,text:'甲。',speaker:'甲',emotion:'平静',confidence:1}];e.design=async()=>({id:'voice',sample:'ref.wav'});e.synthesize=async()=>({id:'out.wav'});await e.enqueue(b.id,[c.id]);assert.equal(e.state.tasks[0].status,'done');assert.equal(b.characters[1].voice,'voice');assert.equal(e.state.voices.length,1);});
test('failed segment retries without resynthesizing finished segments',async()=>{const e=new Engine(io()),b=await e.addBook('t','甲。乙。'),c=b.chapters[0];c.segments=units(c.text).map(x=>({...x,speaker:'旁白',confidence:1,emotion:'平静'}));let calls=[];e.synthesize=async text=>{calls.push(text);if(text==='乙。'&&calls.length===2)throw Error('timeout');return {id:text};};await e.enqueue(b.id,[c.id]);assert.equal(e.state.tasks[0].status,'failed');await e.resume(e.state.tasks[0].id);assert.equal(e.state.tasks[0].status,'done');assert.deepEqual(calls,['甲。','乙。','乙。']);});
test('process interruption becomes paused on reload',()=>{const e=new Engine(io());e.state.tasks.push({status:'running'});const other=new Engine(io(),JSON.parse(JSON.stringify(e.state)));assert.equal(other.state.tasks[0].status,'paused');});
test('uncertain attribution requires correction even with an existing voice',async()=>{const e=new Engine(io()),b=await e.addBook('t','甲。'),c=b.chapters[0];c.segments=[{id:0,text:'甲。',speaker:'旁白',confidence:.4,emotion:'平静'}];e.synthesize=async()=>{throw Error('must not synthesize')};await e.enqueue(b.id,[c.id]);assert.equal(e.state.tasks[0].status,'waiting');});
test('correcting a completed segment invalidates chapter output only',async()=>{const e=new Engine(io()),b=await e.addBook('t','甲。乙。'),c=b.chapters[0];c.audio='old.wav';c.segments=units(c.text).map(x=>({...x,speaker:'旁白',confidence:1,emotion:'平静',audio:'a'+x.id}));await e.correct(b.id,c.id,1,'旁白','紧张');assert.equal(c.audio,null);assert.equal(c.segments[0].audio,'a0');assert.equal(c.segments[1].audio,null);});
test('sample import derives description without suffix and rejects unsupported formats',async()=>{const e=new Engine(io());const v=await e.importVoice({name:'低沉.温润.wav',id:'x',format:'wav',size:100});assert.equal(v.description,'低沉.温润');await assert.rejects(e.importVoice({format:'m4a'}));await assert.rejects(e.importVoice({format:'wav',size:8000000}));});
test('persist serializes snapshots to prevent stale overwrite',async()=>{const seen=[];const e=new Engine({...io(),saveState:async text=>{await new Promise(r=>setTimeout(r,5));seen.push(JSON.parse(text).settings.mode);}});e.state.settings.mode='manual';const a=e.persist();e.state.settings.mode='auto';const b=e.persist();await Promise.all([a,b]);assert.deepEqual(seen,['manual','auto']);});
test('nonstandard numeric heading without chapter suffix is recognized',()=>{const {chapterWarnings}=require('../app/src/main/assets/core');const c=splitBook('第0055章 前章\n甲\n第0056 云腾致雨\n乙\n第0057章 后章\n丙');assert.equal(c.length,3);assert.equal(c[1].text,'乙');assert.deepEqual(chapterWarnings(c),[]);assert.equal(chapterWarnings([...c,c[1]]).length,1);});
test('narrative cannot be attributed to a character even when the model does so',async()=>{const e=new Engine(io()),b=await e.addBook('t','陆涯心想，还是回家吧。\n“走了。”');e.llm=async()=>({characters:[{name:'陆涯',description:'青年男声'}],lines:[{id:0,speaker:'陆涯',emotion:'平静',confidence:.99},{id:1,speaker:'陆涯',emotion:'平静',confidence:.99}]});await e.analyze(b.id,b.chapters[0].id);assert.equal(b.chapters[0].segments[0].speaker,'旁白');assert.equal(b.chapters[0].segments[1].speaker,'陆涯');});
test('incremental persistence writes only changed chapter and retries failed snapshots',async()=>{const writes=[];let failure=false;const e=new Engine({...io(),saveSnapshot:async(header,chapters)=>{if(failure){failure=false;throw Error('disk failure');}writes.push({header:JSON.parse(header),chapters:JSON.parse(chapters)});}}),b=await e.addBook('t','第一章\n甲。\n第二章\n乙。');assert.equal(writes[0].chapters.length,2);await e.persist();assert.equal(writes[1].chapters.length,0);b.chapters[1].summary='changed';e.touch(b.chapters[1]);failure=true;await assert.rejects(e.persist());await e.persist();assert.equal(writes.at(-1).chapters.length,1);assert.equal(writes.at(-1).chapters[0].summary,'changed');assert.deepEqual(writes.at(-1).header.books[0].chapters.map(c=>c.id),[b.chapters[0].id,b.chapters[1].id]);});
test('invented role names are not accepted even with high model confidence',async()=>{const e=new Engine(io()),b=await e.addBook('t','双胞胎女娃来了。\n“你好。”');e.llm=async()=>({characters:[{name:'双胞胎女娃A',description:'女孩'}],lines:[{id:0,speaker:'旁白',emotion:'平静',confidence:1},{id:1,speaker:'双胞胎女娃A',emotion:'平静',confidence:1}]});await e.analyze(b.id,b.chapters[0].id);assert(!b.characters.some(c=>c.name==='双胞胎女娃A'));assert.equal(b.chapters[0].segments[1].speaker,'未知角色');assert.equal(b.chapters[0].segments[1].confidence,0);});
test('pause between analysis batches resumes from saved draft without repeating calls',async()=>{const e=new Engine(io()),b=await e.addBook('t','一句话。'.repeat(95));let paused=false,calls=[];e.llm=async prompt=>{const lines=JSON.parse(prompt.split('本批片段：')[1]);calls.push(lines[0].id);paused=true;return {characters:[],lines:lines.map(x=>({id:x.id,speaker:'旁白',emotion:'自然',confidence:1}))};};await e.analyze(b.id,b.chapters[0].id,()=>paused);assert.equal(b.chapters[0].segments.length,0);assert.equal(b.chapters[0].analysisDraft.next,45);await e.analyze(b.id,b.chapters[0].id);assert.deepEqual(calls,[0,45,90]);assert.equal(b.chapters[0].segments.length,95);assert.equal(b.chapters[0].analysisDraft,undefined);});
test('editing during synthesis discards stale audio and permits a clean retry',async()=>{const e=new Engine(io()),b=await e.addBook('t','甲。'),c=b.chapters[0];c.segments=[{id:0,text:'甲。',speaker:'旁白',emotion:'旧情绪',confidence:1}];e.synthesize=async()=>{await e.correct(b.id,c.id,0,'旁白','新情绪');return {id:'stale.wav'};};await e.enqueue(b.id,[c.id]);assert.equal(e.state.tasks[0].status,'waiting');assert.equal(c.segments[0].audio,null);e.synthesize=async()=>({id:'fresh.wav'});await e.resume(e.state.tasks[0].id);assert.equal(c.segments[0].audio,'fresh.wav');assert.equal(e.state.tasks[0].status,'done');});
test('changing a bound voice invalidates that role across chapters only',async()=>{const e=new Engine(io()),b=await e.addBook('t','第一章\n甲。\n第二章\n乙。');b.characters.push({name:'角色',voice:'preset:白桦'});for(const c of b.chapters){c.audio='chapter.wav';c.segments=[{id:0,speaker:'角色',audio:'role.wav'},{id:1,speaker:'旁白',audio:'narrator.wav'}];e.state.tasks.push({id:c.id,bookId:b.id,chapterId:c.id,status:'done',done:2});}await e.bind(b.id,'角色','preset:茉莉');for(const c of b.chapters){assert.equal(c.audio,null);assert.equal(c.segments[0].audio,null);assert.equal(c.segments[1].audio,'narrator.wav');}assert(e.state.tasks.every(t=>t.status==='paused'&&t.done===1));});
test('malformed batch is retried with fewer lines without corrupting source',async()=>{const e=new Engine(io()),b=await e.addBook('t','一句话。'.repeat(50));let calls=[];e.llm=async prompt=>{const lines=JSON.parse(prompt.split('本批片段：')[1]);calls.push(lines.length);return {characters:[],lines:(calls.length===1?lines.slice(1):lines).map(x=>({id:x.id,speaker:'旁白',emotion:'自然',confidence:1}))};};await e.analyze(b.id,b.chapters[0].id);assert.deepEqual(calls,[45,22,22,6]);assert.equal(b.chapters[0].segments.length,50);assert.equal(b.chapters[0].analysisIssues.length,1);});
test('lazy chapter metadata saves without overwriting body and shared loads deduplicate',async()=>{const e=new Engine(io()),b=await e.addBook('t','甲。');const original=JSON.parse(JSON.stringify(b.chapters[0]));b.chapters[0]={id:original.id,title:original.title,textLength:2,segmentCount:0,unloaded:true,segments:[]};let reads=0,writes=[];const lazy=new Engine({...io(),loadChapter:async()=>{reads++;return original;},saveSnapshot:async(h,c)=>writes.push(JSON.parse(c))},e.state);await lazy.persist();assert.equal(writes[0].length,0);await Promise.all([lazy.ensureChapter(b.id,original.id),lazy.ensureChapter(b.id,original.id)]);assert.equal(reads,1);assert.equal(lazy.chapter(b.id,original.id).text,'甲。');assert.equal(lazy.chapter(b.id,original.id).unloaded,undefined);});
test('explicit speech cue beats collective attribution; weaker conflicting context needs review',async()=>{const e=new Engine(io()),b=await e.addBook('t','暮雨神色慌张。\n“喂。”\n霏霏说道：\n“你好。”');b.characters.push({name:'双胞胎女娃',aliases:[]});e.llm=async()=>({characters:[{name:'暮雨',description:'女孩'},{name:'霏霏',description:'女孩'}],lines:units(b.chapters[0].text).map(x=>({id:x.id,speaker:x.id%2?'双胞胎女娃':'旁白',emotion:'自然',confidence:.99}))});await e.analyze(b.id,b.chapters[0].id);assert.equal(b.chapters[0].segments[1].speaker,'未知角色');assert.equal(b.chapters[0].segments[3].speaker,'霏霏');});

test('deleteBook removes book, cleans tasks, and deletes audio files', async () => {
 const adapter = io(), e = new Engine(adapter);
 const deletedAudio = [];
 adapter.deleteAudio = async (ids) => { deletedAudio.push(...ids); return { count: ids.length, freedBytes: 1000 }; };
 const b = await e.addBook('测试书', ['第1章 序', '内容'].join('\n'));
 b.chapters[0].audio = 'ch1_audio.wav';
 b.chapters[0].segments = [{ id: 0, text: '内容', speaker: '旁白', audio: 'seg1_audio.wav' }];
 e.state.tasks.push({ id: 'task1', bookId: b.id, chapterId: b.chapters[0].id, status: 'done' });
 await e.deleteBook(b.id);
 assert.equal(e.state.books.length, 0);
 assert.equal(e.state.tasks.length, 0);
 assert(deletedAudio.includes('ch1_audio.wav'));
 assert(deletedAudio.includes('seg1_audio.wav'));
});

test('clearBookAudio and clearChapterAudio release audio files while keeping text and status', async () => {
 const adapter = io(), e = new Engine(adapter);
 const deletedAudio = [];
 adapter.deleteAudio = async (ids) => { deletedAudio.push(...ids); return { count: ids.length, freedBytes: 500 }; };
 const b = await e.addBook('测试小说', ['第001章 序章', '这是第一章正文内容。', '第002章 出发', '这是第二章正文内容。'].join('\n'));
 assert.equal(b.chapters.length, 2);
 b.chapters[0].audio = 'audio1.wav';
 b.chapters[0].listened = true;
 b.chapters[1].audio = 'audio2.wav';
 b.chapters[1].listened = false;
 const res = await e.clearBookAudio(b.id, { onlyListened: true });
 assert.equal(res.clearedCount, 1);
 assert.equal(b.chapters[0].audio, null);
 assert.equal(b.chapters[0].audioCleared, true);
 assert.equal(b.chapters[1].audio, 'audio2.wav');
 assert.equal(deletedAudio.includes('audio1.wav'), true);
 assert.equal(deletedAudio.includes('audio2.wav'), false);
 await e.clearChapterAudio(b.id, b.chapters[1].id);
 assert.equal(b.chapters[1].audio, null);
 assert.equal(b.chapters[1].audioCleared, true);
 assert.equal(deletedAudio.includes('audio2.wav'), true);
});

test('updatePlaybackProgress saves position, detects completion, and triggers autoDeletePlayed', async () => {
 const adapter = io(), e = new Engine(adapter);
 const deletedAudio = [];
 adapter.deleteAudio = async (ids) => { deletedAudio.push(...ids); return { count: ids.length, freedBytes: 200 }; };
 e.state.settings.autoDeletePlayed = true;
 const b = await e.addBook('长篇故事', ['第1章 序', '正文'].join('\n'));
 const c = b.chapters[0];
 c.audio = 'ch1_finish.wav';
 c.duration = 100;
 let res = await e.updatePlaybackProgress(b.id, c.id, 50000, 100000);
 assert.equal(res.listened, false);
 assert.equal(b.lastPlayedChapterId, c.id);
 assert.equal(b.lastPlayedPosition, 50000);
 assert.equal(c.audio, 'ch1_finish.wav');
 res = await e.updatePlaybackProgress(b.id, c.id, 99000, 100000);
 assert.equal(res.listened, true);
 assert.equal(res.newlyFinished, true);
 assert.equal(c.audio, null);
 assert.equal(c.audioCleared, true);
 assert(deletedAudio.includes('ch1_finish.wav'));
});

test('garbageCollectAudio collects unreferenced audio files and removes them', async () => {
 const adapter = io(), e = new Engine(adapter);
 let cleanedKeep = null;
 adapter.cleanupAudio = async (keepIds) => { cleanedKeep = keepIds; return { deletedCount: 3, freedBytes: 3000, freedMb: 2.9 }; };
 const b = await e.addBook('书1', ['第1章 序', '段落'].join('\n'));
 b.chapters[0].audio = 'active_audio.wav';
 e.state.voices.push({ id: 'v1', sample: 'sample1.wav' });
 const res = await e.garbageCollectAudio();
 assert.equal(res.deletedCount, 3);
 assert(cleanedKeep.includes('active_audio.wav'));
 assert(cleanedKeep.includes('sample1.wav'));
});

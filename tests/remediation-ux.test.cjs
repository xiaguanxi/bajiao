const {test}=require('node:test'),assert=require('node:assert/strict');
const V=require('../app/src/main/assets/core.js'),UX=require('../app/src/main/assets/ux.js');
const io=()=>({saveState:async()=>{},deleteAudio:async ids=>({count:ids.length,freedBytes:ids.length*100})});
for(const keep of [0,1,2,3])test('completed cleanup retains exactly '+keep+' completed chapters, protecting an active chapter',async()=>{
 const e=new V.Engine(io()),b=await e.addBook('test',Array.from({length:4},(_,i)=>`第${i+1}章 标题\n正文。`).join('\n'));
 b.chapters.forEach((c,i)=>Object.assign(c,{audio:'audio'+i,listened:true,lastCompletedAt:i+1,status:'ready'}));
 Object.assign(e.state.settings,{autoDeletePlayed:true,keepRecentCount:keep});
 await e.performAutoCleanup(b.id,b.chapters[3].id,false);assert(b.chapters[3].audio,'active audio must survive');
 await e.performAutoCleanup(b.id,b.chapters[3].id,true);assert.equal(b.chapters.filter(c=>c.audio).length,keep);
});
test('shared audio survives a scoped clear and is freed only after the final reference is removed',async()=>{
 const removed=[],e=new V.Engine({...io(),deleteAudio:async ids=>{removed.push(...ids);return {count:ids.length};}}),b=await e.addBook('test','第一章 起\n甲。\n第二章 后\n乙。');
 b.chapters.forEach(c=>{c.audio='shared.wav';c.segments=[{id:0,audio:'shared-sentence.wav'}];});
 await e.clearChapterAudio(b.id,b.chapters[0].id);assert.deepEqual(removed,[]);assert.equal(b.chapters[1].audio,'shared.wav');
 await e.clearChapterAudio(b.id,b.chapters[1].id);assert.deepEqual(new Set(removed),new Set(['shared.wav','shared-sentence.wav']));
});
test('replaying a previously listened chapter makes it the most recently completed chapter',async()=>{
 const e=new V.Engine(io()),b=await e.addBook('test','第一章 起\n甲。\n第二章 后\n乙。');b.chapters.forEach((c,i)=>Object.assign(c,{audio:'audio'+i,listened:true,lastCompletedAt:i+1,duration:10}));Object.assign(e.state.settings,{autoDeletePlayed:true,keepRecentCount:1});
 await e.updatePlaybackProgress(b.id,b.chapters[0].id,10000,10000,true);assert.equal(b.chapters[0].audio,'audio0');assert.equal(b.chapters[1].audio,null);
});
test('chapter delete undo protects pending draft files and survives persistence',async()=>{
 let saved;const e=new V.Engine({...io(),saveState:async text=>saved=text}),b=await e.addBook('test','第一章 起\n甲。\n第二章 后\n乙。'),c=b.chapters[0];
 c.segments=[{id:0,speechDraft:{files:[{id:'processed',rawAudioIds:['raw']}],pendingRaw:{file:{id:'pending'}}}}];
 await e.deleteChapter(b.id,c.id);for(const id of ['processed','raw','pending'])assert(e.collectReferencedAudio().includes(id));
 const restored=new V.Engine(io(),JSON.parse(saved));await restored.undoChapter();assert.equal(restored.book(b.id).chapters[0].id,c.id);
});
test('single chapter restore preserves other chapter text, audio and role bindings',async()=>{
 const e=new V.Engine(io()),b=await e.addBook('test','第一章 起\n甲。\n第二章 后\n乙。');b.chapters[0].audio='old-first';b.chapters[1].audio='old-second';const other=JSON.stringify(b.chapters[1]),roles=JSON.stringify(b.characters);
 await e.restoreChapter(b.id,b.chapters[0].id,{text:'恢复后的全文。'});assert.equal(b.chapters[0].audio,'old-first');assert.equal(JSON.stringify(b.chapters[1]),other);assert.equal(JSON.stringify(b.characters),roles);
});
test('automatic confirmation reports quality blocks and never approves rejected audio',async()=>{
 const e=new V.Engine(io()),b=await e.addBook('test','正文。'),c=b.chapters[0];c.segments=[{id:0,text:'正文。',speaker:'旁白',confidence:1,qualityStatus:'pending',audio:null}];e.state.tasks=[{id:'t',bookId:b.id,chapterId:c.id,status:'waiting'}];e.resumeTasks=async()=>{};
 const r=await e.confirmWaiting();assert.equal(r.resumed,0);assert.equal(r.blocked.length,1);assert.equal(c.segments[0].qualityStatus,'pending');
});
test('numeric search understands padded, full-width and Chinese chapter numbers',()=>{
 assert.equal(UX.chapterOrdinal('===第0025章 清晨==='),25);assert.equal(UX.chapterOrdinal('第二十五章 清晨'),25);assert.equal(UX.chapterOrdinal('第０２５章 清晨'),25);assert.equal(UX.chapterOrdinal('Chapter 25 Morning'),25);
});
test('full-text probe validation rejects partial and malformed patterns',()=>{
 const text=Array.from({length:24},(_,i)=>`===第${i+1}章 标题===\n正文。`).join('\n');assert.equal(UX.validateProbe(text,'===第*章 标题===').report.count,24);assert.throws(()=>UX.validateProbe(text,'不存在*章'));assert.throws(()=>UX.validateProbe(text,'['));
});
test('legacy book filename author migration retains original source filename',()=>{
 const b=V.normalizeBookMetadata({name:'女大三千位列仙班by打死不鸽'});assert.equal(b.name,'女大三千位列仙班');assert.equal(b.author,'打死不鸽');assert.equal(b.sourceFile,'女大三千位列仙班by打死不鸽');
});

test('automatic candidate acceptance cannot erase pending quality in this or another waiting chapter',async()=>{
 const e=new V.Engine(io()),b=await e.addBook('test','第一章 甲\n甲。\n第二章 乙\n乙。\n第三章 丙\n丙。');b.characters.push({name:'甲',voice:null,candidate:{id:'candidate',sample:'candidate.wav',description:'青年男性'}});
 b.chapters[0].segments=[{id:0,text:'甲。',speaker:'甲',confidence:1,audio:null,qualityStatus:'pending',speechDraft:{pendingRaw:{file:{id:'rejected.wav'}}}}];b.chapters[1].segments=[{id:0,text:'乙。',speaker:'甲',confidence:1,audio:null}];b.chapters[2].segments=[{id:0,text:'丙。',speaker:'旁白',confidence:1,audio:null}];
 e.state.tasks=b.chapters.map((c,i)=>({id:'t'+i,bookId:b.id,chapterId:c.id,status:'waiting'}));let resumed;e.resumeTasks=async ids=>{resumed=ids;};
 const before=JSON.stringify(b.chapters[0].segments[0]),r=await e.confirmWaiting();assert.equal(r.resumed,1);assert.equal(r.blocked.length,2);assert.deepEqual(resumed,['t2']);assert.equal(r.roles,0);assert.equal(JSON.stringify(b.chapters[0].segments[0]),before);assert.equal(b.characters.at(-1).voice,null);assert(b.characters.at(-1).candidate);
});

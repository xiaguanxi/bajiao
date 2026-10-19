const {test}=require('node:test'),assert=require('node:assert/strict');
const {Engine}=require('../app/src/main/assets/core.js');
async function fixture(io={}){const e=new Engine({saveState:async()=>{},...io}),b=await e.addBook('断点测试','第一章 开始\n甲。\n第二章 继续\n乙。');return {e,b,c:b.chapters[0]};}

test('native checkpoint survives lazy chapter loading and the next snapshot/reload',async()=>{
 let header,changes;const {e,b,c}=await fixture({saveSnapshot:async(h,s)=>{header=JSON.parse(h);changes=JSON.parse(s);}});
 const full={...c,lastPlayedPosition:0};c.unloaded=true;c.segments=[];e.io.loadChapter=async()=>full;
 assert(e.restorePlaybackCheckpoint({bookId:b.id,chapterId:c.id,position:37125,offsetMs:1125,audioId:'clip.wav',segmentId:17,at:Date.now()}));
 await e.ensureChapter(b.id,c.id);assert.equal(c.lastPlayedPosition,37125);assert.equal(c.playbackResume.segmentId,17);
 e.touch(c);await e.persist();assert.equal(header.books[0].chapters[0].lastPlayedPosition,37125);assert.equal(changes[0].lastPlayedPosition,37125);
 const state={...header,books:header.books.map(b=>({...b,chapters:b.chapters.map(c=>({...c,unloaded:true,segments:[]}))}))};
 const restored=new Engine({saveState:async()=>{},loadChapter:async()=>full},state);await restored.ensureChapter(b.id,c.id);
 assert.equal(restored.playbackResumePosition(restored.chapter(b.id,c.id)),37125);
});

test('a listened marker near the end does not restart until actual chapter completion',async()=>{
 const {e,b,c}=await fixture();await e.updatePlaybackProgress(b.id,c.id,98500,100000,false);
 assert(c.listened);assert.equal(e.playbackResumePosition(c),98500);
 await e.updatePlaybackProgress(b.id,c.id,100000,100000,true);assert.equal(e.playbackResumePosition(c),0);
 await e.updatePlaybackProgress(b.id,c.id,12000,100000,false);assert.equal(e.playbackResumePosition(c),12000);
});

test('streaming resume anchor maps to the measured merged chapter including inserted pauses',async()=>{
 const {e,b,c}=await fixture();c.audio='whole.wav';c.duration=4.35;c.segments=[{id:0,audio:'a.wav',durMs:1000},{id:1,audio:'b.wav',durMs:3000}];
 c.audioTimeline={version:1,audio:c.audio,parts:[{id:0,audio:'a.wav',startMs:0,endMs:1000},{id:1,audio:'b.wav',startMs:1350,endMs:4350}]};
 await e.updatePlaybackProgress(b.id,c.id,2125,0,false,{audioId:'b.wav',segmentId:1,offsetMs:1125});
 assert.equal(e.playbackResumePosition(c),2475);
 c.segments[1].audio='replacement.wav';assert.equal(e.playbackResumePosition(c),2125,'old source cannot map to a replaced clip');
});

test('stale, removed and malformed checkpoints cannot replace newer user progress',async()=>{
 const {e,b,c}=await fixture();await e.updatePlaybackProgress(b.id,c.id,9000,20000);
 const at=e.state.lastPlayback.at,base={bookId:b.id,chapterId:c.id,position:1000,at:at-1};
 for(const record of [base,{...base,at:at+1,chapterId:'removed'},{...base,at:at+1,position:-5},{...base,at:NaN},null])assert.equal(e.restorePlaybackCheckpoint(record),false);
 assert.equal(c.lastPlayedPosition,9000);
});

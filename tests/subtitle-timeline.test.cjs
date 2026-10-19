const {test}=require('node:test'),assert=require('node:assert/strict');
const {Engine,computeSegmentTimestamps,pausesFor}=require('../app/src/main/assets/core.js');
function fixture(io={}){const e=new Engine({saveState:async()=>{},...io}),segments=[{id:0,text:'甲。',audio:'a',durMs:1000},{id:1,text:'广告',audio:'skip',skip:true},{id:2,text:'乙。',audio:'b',durMs:3000}];const c={id:'c',audio:'merged',duration:4.35,pacingVersion:1,segments};e.state.books.push({id:'b',characters:[],chapters:[c]});const result={id:'merged',duration:4.35,parts:[{audio:'a',startMs:0,endMs:1000},{audio:'b',startMs:1350,endMs:4350}]};return {e,c,result};}
test('existing complete durations still calibrate actual merged boundaries and persist once',async()=>{
 let calls=0,writes=0;const {e,c,result}=fixture({saveState:async()=>writes++,audioTimeline:async(id,ids,pauses)=>{calls++;assert.equal(id,'merged');assert.deepEqual(ids,['a','b']);assert.deepEqual(pauses,pausesFor(['甲。','乙。']));return result;}});
 assert.equal(await e.calibrateDurations('b','c'),1);assert.equal(writes,1);assert.equal(calls,1);
 const ts=e.computeSegmentTimestamps(c.segments,c.duration,c.audioTimeline,c.audio);assert.deepEqual(ts.map(s=>[s.startMs,s.endMs]),[[0,1000],[1000,1000],[1350,4350]]);
 assert.equal(await e.calibrateDurations('b','c'),0);assert.equal(calls,1);
 const reloaded=new Engine({saveState:async()=>{}},JSON.parse(JSON.stringify(e.state))).chapter('b','c');assert.deepEqual(computeSegmentTimestamps(reloaded.segments,reloaded.duration,reloaded.audioTimeline,reloaded.audio),ts);
});
test('migration deduplicates concurrent reads and discards result after a source changes',async()=>{
 let finish,calls=0;const {e,c,result}=fixture({audioTimeline:async()=>{calls++;return new Promise(r=>finish=r);}});const a=e.calibrateDurations('b','c'),b=e.calibrateDurations('b','c');await new Promise(r=>setImmediate(r));assert.equal(calls,1);c.segments[0].audio='replacement';finish(result);assert.deepEqual(await Promise.all([a,b]),[0,0]);assert.equal(c.audioTimeline,undefined);
});
test('mismatched, unsupported and stale chapters cannot adopt incorrect timing',async()=>{
 for(const mode of ['mismatch','unsupported','stale','changed-merged','removed']){
  const {e,c,result}=fixture({audioTimeline:async()=>{if(mode==='unsupported')return true;if(mode==='mismatch')return {...result,parts:[...result.parts].reverse()};if(mode==='changed-merged')c.audio='other';if(mode==='removed')e.state.books=[];return result;}});if(mode==='stale')c.audioStale=true;
  assert.equal(await e.calibrateDurations('b','c'),0,mode);assert.equal(c.audioTimeline,undefined,mode);
 }
});
test('timelines are bound to ordered sources and merged audio identity',async()=>{
 const {e,c,result}=fixture({audioTimeline:async()=>result});await e.calibrateDurations('b','c');
 const exact=computeSegmentTimestamps(c.segments,c.duration,c.audioTimeline,c.audio);assert.equal(exact[2].startMs,1350);
 for(const segments of [[...c.segments].reverse(),c.segments.map(s=>({...s,audio:s.id===2?'replacement':s.audio}))])assert.notDeepEqual(computeSegmentTimestamps(segments,c.duration,c.audioTimeline,c.audio).map(s=>s.startMs),exact.map(s=>s.startMs));
 assert.notEqual(computeSegmentTimestamps(c.segments,c.duration,c.audioTimeline,'other')[2].startMs,1350);
});
test('new chapter merges and single-line regeneration replace the timeline together with audio',async()=>{
 const {e,c,result}=fixture();const t={id:'task',bookId:'b',chapterId:'c',status:'running'};e.state.tasks.push(t);e.io.mergeAudio=async()=>result;
 await e.workSynth(t);assert.equal(t.status,'done');assert.equal(c.audioTimeline.audio,c.audio);assert.equal(c.audioTimeline.parts[1].startMs,1350);
 c.text='甲。广告乙。';e.book('b').characters=[{name:'旁白',voice:'preset:白桦'}];for(const s of c.segments)s.speaker='旁白';e.synthesize=async()=>({id:'replacement',duration:1});
 e.io.mergeAudio=async()=>({...result,id:'remade',parts:result.parts.map((p,i)=>i===0?{...p,audio:'replacement'}:p)});
 assert.equal(await e.regenerateSegment('b','c',0),true);assert.equal(c.audio,'remade');assert.equal(c.audioTimeline.audio,'remade');assert.equal(c.audioTimeline.parts[0].audio,'replacement');
});
test('native reconstruction agrees with merge offsets across PCM formats',()=>{
 const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),jdk=path.resolve('.tools/jdk-17.0.18+8'),out=path.resolve('artifacts/subtitle-timeline/java');fs.mkdirSync(out,{recursive:true});
 execFileSync(path.join(jdk,'bin/javac.exe'),['-encoding','UTF-8','-cp','.tools/json.jar','-d',out,'app/src/main/java/com/vocast/app/AudioFiles.java','tests/AudioPacingTest.java','tests/AudioTimelineTest.java']);
 assert.match(execFileSync(path.join(jdk,'bin/java.exe'),['-Xmx64m','-cp',out+path.delimiter+path.resolve('.tools/json.jar'),'com.vocast.app.AudioTimelineTest'],{encoding:'utf8'}),/PASS native timeline/);
});

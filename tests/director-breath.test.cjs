const {test}=require('node:test'),assert=require('node:assert/strict');
const {Engine,FAST_SPEECH_PROMPT,ModelPrompts,segmentPauseAfter,segmentPausesFor,pausesFor,SEGMENT_PACING_VERSION}=require('../app/src/main/assets/core.js');

test('director narration ignores returned acting and never requests direction repair',async()=>{
 const e=new Engine({saveState:async()=>{}}),b=await e.addBook('旁白固定','他撕心裂肺地大吼。\n“别走。”'),c=b.chapters[0],tasks=[];
 e.state.settings.promptMode='director';b.characters.push({name:'林晚',voice:'preset:茉莉'});
 e.llm=async(p,o)=>{tasks.push(o.task);assert(p.includes('旁白仅标注说话人和置信度'));
  return {lines:[{id:0,speaker:'旁白',confidence:1,emotion:'尖叫',scene:'场景',delivery:'大吼并放慢'},
   {id:1,speaker:'林晚',confidence:1,emotion:'挽留',scene:'门口',delivery:'轻声挽留，重音落在别走'}]};};
 await e.analyze(b.id,c.id);assert.deepEqual(tasks,['annotation']);
 const [narrator,dialogue]=c.segments;
 assert.equal(narrator.emotion,'');assert.equal(narrator.delivery,undefined);assert.equal(narrator.directionStatus,undefined);
 for(const voice of ['preset:白桦','imported-reference'])assert.equal(e.speechDirection(voice,'尖叫','',undefined,narrator),FAST_SPEECH_PROMPT);
 assert.equal(e.speechDirection('preset:白桦','','','自己编辑的提示词',narrator),'自己编辑的提示词');
 assert.match(e.speechDirection('preset:茉莉','','',undefined,dialogue),/场景：门口\n指导：轻声挽留/);
});

test('old narrator direction repair checkpoints resume without a model request',async()=>{
 const e=new Engine({saveState:async()=>{}}),b=await e.addBook('恢复旁白','他走进屋。'),c=b.chapters[0];
 c.promptMode='director';c.segments=[{id:0,text:c.text,speaker:'旁白',emotion:'紧张',confidence:1,annotationStatus:'complete',directionStatus:'pending'}];
 const target={id:0,text:c.text,speaker:'旁白',emotion:'紧张'};
 c.analysisDraft={version:2,next:1,batchSize:24,pending:[{kind:'direction',ids:[0],targets:[target]}]};
 e.llm=async()=>{throw Error('旁白不应调用模型补写指导');};await e.analyze(b.id,c.id);
 assert.equal(c.analysisDraft,undefined);assert.equal(c.segments[0].directionStatus,undefined);assert.equal(c.segments[0].emotion,'');
});

test('all segment boundaries breathe while internal sentence splitting keeps punctuation pauses',()=>{
 assert.deepEqual(segmentPausesFor(['没有标点','逗号，','冒号：','分号；','句号。','省略……','最后']),[300,300,300,300,350,450,0]);
 assert.deepEqual(segmentPausesFor(['独立一段']),[0]);assert.deepEqual(segmentPausesFor([]),[]);
 assert.equal(segmentPauseAfter('“好！”'),350);
 assert.deepEqual(pausesFor(['逗号，','冒号：','结束。']),[120,180,0]);
});

test('chapter generation and single-segment remake merge with breathing gaps and exact timelines',async()=>{
 const e=new Engine({saveState:async()=>{}}),b=await e.addBook('换气','甲，乙。'),c=b.chapters[0],seen=[];
 c.segments=[{id:0,text:'甲，',speaker:'旁白',audio:'a',durMs:1000,confidence:1},{id:1,text:'广告',skip:true,audio:'skip'},
  {id:2,text:'乙。',speaker:'旁白',audio:'b',durMs:1000,confidence:1}];
 e.io.mergeAudio=async(ids,pauses)=>{seen.push({ids,pauses});return {id:'merged'+seen.length,duration:2.3,parts:[{audio:ids[0],startMs:0,endMs:1000},{audio:ids[1],startMs:1300,endMs:2300}]};};
 const task={bookId:b.id,chapterId:c.id,status:'running'};e.state.tasks.push(task);await e.workSynth(task);
 assert.equal(task.status,'done');assert.equal(c.pacingVersion,SEGMENT_PACING_VERSION);assert.deepEqual(seen[0],{ids:['a','b'],pauses:[300,0]});
 assert.equal(e.computeSegmentTimestamps(c.segments,c.duration,c.audioTimeline,c.audio)[2].startMs,1300);
 e.synthesize=async()=>({id:'replacement',duration:1});assert.equal(await e.regenerateSegment(b.id,c.id,0),true);
 assert.deepEqual(seen[1],{ids:['replacement','b'],pauses:[300,0]});assert.equal(c.audioTimeline.parts[1].startMs,1300);
});

test('timeline reconstruction uses the chapter pacing version for both old and new audio',async()=>{
 for(const [version,expected] of [[0,[]],[1,[120,0]],[2,[300,0]]]){
  const e=new Engine({saveState:async()=>{},audioTimeline:async(id,ids,pauses)=>{assert.deepEqual(pauses,expected);return true;}});
  e.state.books=[{id:'b',chapters:[{id:'c',audio:'merged',pacingVersion:version,segments:[{id:0,text:'甲，',audio:'a',durMs:1000},{id:1,text:'乙。',audio:'b',durMs:1000}]}]}];
  await e.calibrateDurations('b','c');
 }
 assert(!ModelPrompts.annotationRules.includes('每个可朗读片段（包括旁白）'));
});

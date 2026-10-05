const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {run}=require('./device-harness.cjs'),{waveInfo,mergeWave}=require('./node-io.cjs'),{pausesFor,speechParts}=require('../app/src/main/assets/core');
const dir=path.resolve('artifacts/pacing'),audioDir=path.join(dir,'audio');fs.mkdirSync(audioDir,{recursive:true});
const header=JSON.parse(run(['exec-out','run-as','com.vocast.app','cat','files/library.json'])),book=header.books.find(b=>b.id==='musfdzb438zhl9n');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function quiet(pcm,rate,leading){let n=0;for(let j=0;j<pcm.length/2;j++){const offset=leading?j*2:pcm.length-2-j*2;if(Math.abs(pcm.readInt16LE(offset))>100)break;n++;}return n/rate*1000;}
const chapters=[];let changedSegments=0,shortBefore=0,shortAfter=0;
for(const meta of book.chapters.filter(c=>/^第000[1-5]章/.test(c.title))){
 const c=JSON.parse(run(['exec-out','run-as','com.vocast.app','cat','files/chapters/'+meta.storageRef+'.json'])),old=JSON.parse(fs.readFileSync(path.join(dir,c.id+'.json')));
 assert.equal(c.text,old.text);assert.equal(c.title,old.title);assert.equal(c.pacingVersion,1);assert.equal(c.segments.length,old.segments.length);
 let changed=0;for(let i=0;i<c.segments.length;i++){
  const s=c.segments[i],o=old.segments[i];for(const key of ['text','speaker','emotion','skip','isAd','confidence'])assert.deepEqual(s[key],o[key]);
  if(s.audio!==o.audio){assert(speechParts(s.text).length>1,'Only multi-sentence speech may change');assert.equal(s.pacingVersion,1);changed++;}
 }
 const audible=c.segments.filter(s=>s.audio&&s.audio!=='skip'&&!s.skip&&!s.isAd),buffers=[];
 for(const s of audible){const file=path.join(dir,s.audio);if(!fs.existsSync(file))fs.writeFileSync(file,run(['exec-out','run-as','com.vocast.app','cat','files/audio/'+s.audio]));const bytes=fs.readFileSync(file);assert.equal(sha(bytes)+'.wav',s.audio);buffers.push(bytes);}
 const pauses=pausesFor(audible.map(s=>s.text)),expected=mergeWave(buffers,pauses),actual=run(['exec-out','run-as','com.vocast.app','cat','files/audio/'+c.audio]);
 assert(expected.equals(actual),'Native output matches independent minimum-gap merge with every speech sample preserved');assert.equal(sha(actual)+'.wav',c.audio);
 const info=waveInfo(actual),number=Number(c.title.match(/^第(\d+)章/)[1]),file='chapter-'+String(number).padStart(4,'0')+'.wav';fs.writeFileSync(path.join(audioDir,file),actual);
 const points=[];let seconds=0,addedMs=0;
 for(let i=0;i<buffers.length;i++){
  const w=waveInfo(buffers[i]),rate=w.fmt.readUInt32LE(4);assert.equal(w.fmt.readUInt16LE(2),1);assert.equal(w.fmt.readUInt16LE(14),16);
  if(i){
   const prev=waveInfo(buffers[i-1]),existingMs=quiet(prev.pcm,rate,false)+quiet(w.pcm,rate,true),added=Math.max(0,Math.ceil(pauses[i-1]*rate/1000)-Math.round(existingMs*rate/1000))/rate*1000;
   if(pauses[i-1]){assert(existingMs+added>=pauses[i-1]-.01);if(existingMs<pauses[i-1]-.01)shortBefore++;if(existingMs+added<pauses[i-1]-.01)shortAfter++;}
   points.push({after:audible[i-1].id,text:audible[i-1].text,requiredMs:pauses[i-1],existingMs,addedMs:added,resultMs:existingMs+added,atSeconds:seconds});seconds+=added/1000;addedMs+=added;
  }
  seconds+=w.duration;
 }
 assert(Math.abs(seconds-info.duration)<.001);assert(Math.abs(info.duration-c.duration)<.001);
 changedSegments+=changed;chapters.push({number,title:c.title,audio:c.audio,duration:info.duration,previousDuration:old.duration,addedBoundaryPauseMs:addedMs,multiSentenceSegmentsRegenerated:changed,boundaries:points,file});
 console.log('PASS preserved source and PCM, minimum gaps',c.title,'added',Math.round(addedMs),'ms',info.duration,'seconds');
}
assert.equal(changedSegments,5);assert.equal(shortAfter,0);assert(shortBefore>0);
const report={pass:true,version:'0.1.3',minimumSentenceGapMs:350,changedSegments,shortBoundariesCorrected:shortBefore,shortBoundariesRemaining:shortAfter,chapters};fs.writeFileSync(path.join(dir,'verification.json'),JSON.stringify(report,null,2));
// A short comparable excerpt starts at the beginning and uses the same first three sentence recordings.
function excerpt(file,duration,out){const w=waveInfo(fs.readFileSync(file));const n=Math.round(duration*w.fmt.readUInt32LE(4))*w.fmt.readUInt16LE(12),pcm=w.pcm.subarray(0,n),head=Buffer.alloc(44);head.write('RIFF');head.writeUInt32LE(36+pcm.length,4);head.write('WAVEfmt ',8);head.writeUInt32LE(16,16);w.fmt.copy(head,20,0,16);head.write('data',36);head.writeUInt32LE(pcm.length,40);fs.writeFileSync(out,Buffer.concat([head,pcm]));}
excerpt(path.join(dir,'before-audio','chapter-0001.wav'),22.4,path.join(dir,'before-sample.wav'));
excerpt(path.join(audioDir,'chapter-0001.wav'),22.4+chapters[0].boundaries.slice(0,2).reduce((n,b)=>n+b.addedMs/1000,0),path.join(dir,'after-sample.wav'));
console.log('PASS '+shortBefore+' insufficient boundary pauses repaired; 5 multi-sentence dialogues regenerated');

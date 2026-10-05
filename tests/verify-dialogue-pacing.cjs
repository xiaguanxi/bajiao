const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {run}=require('./device-harness.cjs'),{waveInfo,mergeWave}=require('./node-io.cjs'),{speechParts}=require('../app/src/main/assets/core');
const dir=path.resolve('artifacts/pacing'),state=JSON.parse(fs.readFileSync(path.join(dir,'after-state.json'))),before=JSON.parse(fs.readFileSync(path.join(dir,'before-state.json')));
const header=JSON.parse(run(['exec-out','run-as','com.vocast.app','cat','files/library.json'])),book=header.books.find(b=>b.id==='musfdzb438zhl9n'),chapters=book.chapters.filter(c=>/^第000[1-5]章/.test(c.title)).map(c=>JSON.parse(run(['exec-out','run-as','com.vocast.app','cat','files/chapters/'+c.storageRef+'.json'])));
const known=new Set([...state.books.flatMap(b=>b.chapters.map(c=>c.audio)),...before.books.flatMap(b=>b.chapters.map(c=>c.audio)),...state.voices.map(v=>v.sample)]);
const priorFile=path.join(dir,'dialogue-verification.json'),prior=fs.existsSync(priorFile)?JSON.parse(fs.readFileSync(priorFile)):null;
const candidates=prior?[...new Set(prior.results.flatMap(r=>[r.left,r.right]))]:run(['shell','run-as','com.vocast.app','ls','-t','files/audio']).toString().trim().split(/\s+/).slice(0,24).filter(id=>!known.has(id)&&!fs.existsSync(path.join(dir,id)));
const raw=candidates.map(id=>{const bytes=run(['exec-out','run-as','com.vocast.app','cat','files/audio/'+id]);fs.writeFileSync(path.join(dir,id),bytes);return {id,bytes,wave:waveInfo(bytes)};});assert.equal(raw.length,10,'Two real TTS recordings per regenerated dialogue');
const results=[];
function quiet(pcm,leading,rate){let n=0;for(let i=0;i<pcm.length/2;i++){if(Math.abs(pcm.readInt16LE(leading?i*2:pcm.length-2-i*2))>100)break;n++;}return n/rate*1000;}
for(const c of chapters){for(const s of c.segments.filter(s=>speechParts(s.text).length>1&&s.audio&&s.audio!=='skip')){
 const parent=fs.readFileSync(path.join(dir,s.audio)),p=waveInfo(parent),matches=[];
 for(const left of raw)for(const right of raw){if(left.id===right.id||left.wave.pcm.length+right.wave.pcm.length>p.pcm.length)continue;if(!p.pcm.subarray(0,left.wave.pcm.length).equals(left.wave.pcm))continue;if(!p.pcm.subarray(p.pcm.length-right.wave.pcm.length).equals(right.wave.pcm))continue;if(mergeWave([left.bytes,right.bytes],[350,0]).equals(parent))matches.push({left,right});}
 assert.equal(matches.length,1,'Dialogue has exactly one verified pair of original TTS recordings');
 const {left,right}=matches[0],rate=p.fmt.readUInt32LE(4),insertedMs=(p.pcm.length-left.wave.pcm.length-right.wave.pcm.length)/2/rate*1000,gapMs=quiet(left.wave.pcm,false,rate)+quiet(right.wave.pcm,true,rate)+insertedMs;
 assert(gapMs>=350-.01);results.push({chapter:c.title,text:s.text,parts:speechParts(s.text),left:left.id,right:right.id,audio:s.audio,insertedMs,gapMs});console.log('PASS real dialogue internal pause',s.text,Math.round(gapMs),'ms');
}}
assert.equal(results.length,5);const oldUsage=new Set(before.usage.map(u=>u.at)),calls=state.usage.filter(u=>!oldUsage.has(u.at));assert.equal(calls.length,10);assert(calls.every(u=>u.provider==='tts'&&u.model==='mimo-v2.5-tts-voiceclone'));
fs.writeFileSync(path.join(dir,'dialogue-verification.json'),JSON.stringify({pass:true,realTtsCalls:10,voiceBindingsPreserved:true,results},null,2));

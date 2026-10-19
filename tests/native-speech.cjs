const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {Engine}=require('../app/src/main/assets/core.js');
const {makeIO}=require('./node-io.cjs');
const root=path.resolve(__dirname,'..');
// Node runs test files in separate processes. Compiling into a shared directory
// can expose half-written Java classes to another file's native assertions.
const classes=path.join(root,'artifacts/silence-v083/test-classes','node-'+process.pid);
const jdk=path.join(root,'.tools/jdk-17.0.18+8/bin');
const json=path.join(root,'.tools/json.jar');
let compiled=false;
function run(executable,args){
 const result=spawnSync(path.join(jdk,executable+(process.platform==='win32'?'.exe':'')),args,{cwd:root,encoding:'utf8',timeout:60000,maxBuffer:1024*1024,windowsHide:true});
 if(result.error)throw result.error;
 if(result.status!==0)throw Error(`${executable} exited ${result.status}: ${result.stderr}\n${result.stdout}`);
 return result.stdout.trim();
}
function compile(){
 if(compiled)return;
 fs.mkdirSync(classes,{recursive:true});
 run('javac',['-encoding','UTF-8','-cp',json,'-d',classes,path.join(root,'app/src/main/java/com/vocast/app/AudioFiles.java'),path.join(root,'tests/AudioSilenceTest.java'),path.join(root,'tests/AudioRepetitionTest.java')]);
 compiled=true;
}
function processNative(dir,id){
 compile();
 return JSON.parse(run('java',['-Dfile.encoding=UTF-8','-cp',[classes,json].join(path.delimiter),'com.vocast.app.AudioSilenceTest','--process',dir,id]));
}
function truncateNative(dir,id,evidence){compile();return JSON.parse(run('java',['-Dfile.encoding=UTF-8','-cp',[classes,json].join(path.delimiter),'com.vocast.app.AudioRepetitionTest','--truncate',dir,id,JSON.stringify(evidence)]));}
// Small deterministic PCM fixtures, independent of any module registering tests.
function wav(sequences,{rate=8000,channels=1}={}){
 const chunks=[];
 for(const {seconds=2,seed=1,gain=1,silence=false,noise=0,fade=false} of sequences){
  const frames=Math.round(seconds*rate),pcm=Buffer.alloc(frames*channels*2);
  for(let i=0;i<frames;i++){
   const t=i/rate,syllable=Math.floor(t/.13),freq=170+(syllable*seed*113%1400),env=Math.sin(Math.PI*(t%.13)/.13)**2;
   const value=silence?(i%2?noise:-noise):Math.round(gain*(fade?1-.98*i/frames:1)*env*(Math.sin(2*Math.PI*freq*t)+.4*Math.sin(2*Math.PI*freq*2.73*t))*7000);
   for(let ch=0;ch<channels;ch++)pcm.writeInt16LE(value,(i*channels+ch)*2);
  }
  chunks.push(pcm);
 }
 const pcm=Buffer.concat(chunks),header=Buffer.alloc(44),align=channels*2;
 header.write('RIFF');header.writeUInt32LE(pcm.length+36,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(channels,22);header.writeUInt32LE(rate,24);header.writeUInt32LE(rate*align,28);header.writeUInt16LE(align,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);
 return Buffer.concat([header,pcm]);
}
const audioReply=(bytes,finish_reason='stop')=>({choices:[{finish_reason,message:{audio:{data:bytes.toString('base64')}}}]});
function fixture(t,handler){
 const tempRoot=fs.realpathSync(os.tmpdir()),dir=fs.mkdtempSync(path.join(tempRoot,'bajiao-native-speech-'));
 t.after(()=>{
  const target=fs.realpathSync(dir);
  if(path.dirname(target)!==tempRoot||!path.basename(target).startsWith('bajiao-native-speech-'))throw Error('Unexpected native test cleanup path');
  fs.rmSync(target,{recursive:true,force:true});
 });
 const io=makeIO(dir),calls=[],events=[],processed=[],reads=[],snapshots=[];
 io.request=async(provider,body)=>{calls.push({provider,body});return handler(provider,body,calls);};
 io.sleep=async()=>{};
 const saveRaw=io.saveRawAudio;
 io.saveRawAudio=async(...args)=>{const file=await saveRaw(...args);events.push({type:'archive',id:file.id});return file;};
 io.processSpeechAudio=async id=>{events.push({type:'process',id});const file=processNative(dir,id);processed.push({rawId:id,file});return file;};
 io.truncateRepeatedSpeech=async(id,evidence)=>{events.push({type:'truncate',id,requests:calls.length});return truncateNative(dir,id,evidence);};
 const read=io.readAudio;
 io.readAudio=async id=>{reads.push(id);return read(id);};
 const saveState=io.saveState;
 io.saveState=async data=>{snapshots.push(JSON.parse(data));return saveState(data);};
 const e=new Engine(io);e.state.settings.retries=0;e.state.settings.ttsParallel=1;
 return {e,io,dir,calls,events,processed,reads,snapshots,bytes:id=>fs.readFileSync(path.join(dir,id))};
}
async function chapter(e,texts){
 const b=await e.addBook('Native silence regression',texts.join('')),c=b.chapters[0];
 c.segments=texts.map((text,id)=>({id,text,speaker:'旁白',confidence:1}));
 return {b,c};
}
module.exports={fixture,wav,audioReply,chapter,processNative,truncateNative};

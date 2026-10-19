// Six real annotation + same-reference TTS pairs, isolated from application data.
// Run with scripts/with-env.ps1 -Script tests/director-live.cjs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {Engine,normalize}=require('../app/src/main/assets/core.js');
const {makeIO,waveInfo}=require('./node-io.cjs');
const cases=[
 {name:'挽留',context:'对方转身要走，沈砚赶上一步，急忙说道：',text:'“别走。我没有怪你，只是想把话说清楚。”'},
 {name:'压抑愤怒',context:'沈砚攥紧拳头，努力压住怒火，不愿惊动隔壁熟睡的孩子。他压低声音说道：',text:'“这件事到此为止。不要让我再说第二遍。”'},
 {name:'反讽',context:'大家等了足足一个小时，对方才姗姗来迟。沈砚冷冷地看着他，讽刺道：',text:'“你可真准时，让大家等了这么久。”'},
 {name:'惊恐',context:'门锁忽然自己转动起来。沈砚惊恐地向后退，声音发颤，对同伴说道：',text:'“别开门！那个人刚才明明已经走了。”'},
 {name:'释然',context:'得知孩子平安归来，沈砚紧绷的肩膀终于松下来，轻声说道：',text:'“回来就好。其他的事，明天再说吧。”'},
 {name:'悬念旁白',context:'',text:'走廊尽头的灯忽然灭了，门后传来第三次敲门声。'}
];
const oldDirection=(emotion,description)=>'以自然连贯的有声书方式忠实朗读原文，按语义与标点自然停顿，保留自然的气息和尾音，不增删台词。参考样本确定声线；单句语气可随剧情适度变化。\n稳定声音基准（参考样本优先）：'+description+'\n本句演绎指令（保留否定和复合情绪）：'+emotion;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
(async()=>{
 const out=path.resolve(process.env.BAJIAO_DIRECTOR_OUT||'artifacts/director-live-'+Date.now());
 fs.mkdirSync(out,{recursive:true});
 const reportPath=path.join(out,'report.json'),report=fs.existsSync(reportPath)?JSON.parse(fs.readFileSync(reportPath)): {started:new Date().toISOString(),pairs:[],requests:[],listeningAssessment:'待人工对照试听；链路成功不代表听感通过。',scope:'Node production engine and real APIs; Android native silence processing is covered separately by local tests.'};
 const io=makeIO(out),request=io.request;let llmCount=0,ttsCount=0;
 io.request=async(provider,body,settings)=>{
  if(provider==='tts'&&++ttsCount>12||provider==='llm'&&++llmCount>18)throw Error('本次验收请求预算已达上限');
  const record={provider,model:body.model,messages:body.messages,at:new Date().toISOString()};report.requests.push(record);save();
  try{const response=await request(provider,body,settings);Object.assign(record,io.calls.at(-1));save();return response;}catch(e){record.error=e.message;save();throw e;}
 };
 const e=new Engine(io);Object.assign(e.state.settings,{llmBase:process.env.BAJIAO_LLM_BASE||'https://api.minimax.cn/v1',llmModel:process.env.BAJIAO_LLM_MODEL||'MiniMax-M3',retries:0,qualityAutoRetry:false,autoProduceUpcoming:false});
 const source=path.resolve(process.env.BAJIAO_DIRECTOR_REFERENCE||'artifacts/probe-mimo.wav'),reference=fs.readFileSync(source);waveInfo(reference);
 const referenceHash=crypto.createHash('sha256').update(reference).digest('hex');if(report.referenceHash&&report.referenceHash!==referenceHash)throw Error('Reference changed during resumed evaluation');
 fs.copyFileSync(source,path.join(out,'reference.wav'));report.referenceHash=referenceHash;
 const voice={id:'evaluation-reference',sample:'reference.wav',format:'wav',description:'成年男声，音色温润，普通话，吐字清楚。',enabled:true};e.state.voices.push(voice);
 function save(){fs.writeFileSync(reportPath,JSON.stringify(report,null,2));}
 function listening(){
  fs.writeFileSync(path.join(out,'listening.html'),'<!doctype html><meta charset="utf-8"><title>场景与导演指导对照试听</title><style>body{max-width:900px;margin:32px auto;padding:0 20px;font:16px system-ui;line-height:1.7}section{padding:16px 0;border-top:1px solid #ccc}audio{width:100%}pre{white-space:pre-wrap}</style><h1>六组同文同参考音色对照</h1><p>'+esc(report.listeningAssessment)+'</p><p>检查情绪准确、表演可辨、声线稳定、无新增台词。基线为改造前模板；新方案采用真实 LLM 标注。两边共用同一 emotion 与参考音频。</p>'+report.pairs.map(row=>'<section><h2>'+esc(row.name)+'</h2><p>'+esc(row.context)+'</p><p>'+esc(row.text)+'</p>'+['old','new'].map(kind=>row[kind]?'<p>'+(kind==='old'?'旧模板':'场景与导演指导')+'</p><audio controls preload="none" src="'+esc(row[kind].id)+'"></audio><details><summary>实际提示词</summary><pre>'+esc(row[kind].speechPrompt)+'</pre></details>':'').join('')+(row.error?'<p>'+esc(row.error)+'</p>':'')+'</section>').join(''));
 }
 for(let i=0;i<cases.length;i++){
  const item=cases[i];let row=report.pairs.find(r=>r.name===item.name);if(!row){row={...item};report.pairs.push(row);}delete row.error;
  try{
   if(!row.annotation){
    const b=await e.addBook(item.name,item.context+'\n'+item.text),c=b.chapters[0];b.characters.push({name:'沈砚',description:voice.description,voice:voice.id});
    await e.analyze(b.id,c.id);const target=c.segments.filter(s=>item.context?s.text===item.text:!s.skip&&!s.isAd);
    assert(target.length);assert(target.every(s=>s.directionVersion===1));assert.equal(normalize(target.map(s=>s.text).join('')),normalize(item.text));row.annotation=target;save();
   }
   const emotion=row.annotation.map(s=>s.emotion).filter(Boolean).join('；');
   if(!row.old){const prompt=oldDirection(emotion,voice.description);const file=await e.synthesize(item.text,voice.id,emotion,{prompt});fs.copyFileSync(path.join(out,file.id),path.join(out,(i+1)+'-old.wav'));row.old={...file,id:(i+1)+'-old.wav',speechPrompt:prompt};save();}
   if(!row.new){
    const files=[];for(const s of row.annotation){const file=await e.synthesize(s.text,voice.id,s.emotion,{scene:s.scene,delivery:s.delivery,directionVersion:s.directionVersion});files.push(file);}
    const file=files.length===1?files[0]:await io.mergeAudio(files.map(f=>f.id),files.map((_,i)=>i===files.length-1?0:350));fs.copyFileSync(path.join(out,file.id),path.join(out,(i+1)+'-new.wav'));
    row.new={...file,id:(i+1)+'-new.wav',speechPrompt:files.map(f=>f.speechPrompt).join('\n\n'),parts:files.map(f=>({id:f.id,speechPrompt:f.speechPrompt}))};save();
   }
   console.log('PASS real APIs:',item.name);
  }catch(e){row.error=e.message;console.log('INCOMPLETE',item.name,e.message);save();}
  listening();
 }
 report.completed=new Date().toISOString();report.complete=report.pairs.length===6&&report.pairs.every(r=>r.old&&r.new&&!r.error);save();listening();console.log('REPORT',reportPath);if(!report.complete)process.exitCode=1;
})().catch(e=>{console.error(e.message);process.exitCode=1;});

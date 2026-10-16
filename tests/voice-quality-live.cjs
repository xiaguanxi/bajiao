// Opt-in paid API validation. Writes only to a fresh, isolated artifact directory.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Engine,buildSpeechDirection}=require('../app/src/main/assets/core.js');
const {makeIO,waveInfo,mergeWave}=require('./node-io.cjs');
const roles=[
 ['儿童','儿童女声，清亮轻盈，发声自然，普通话，天真好奇但不尖叫。'],
 ['青年','青年男声，清亮、不沙哑，胸声适中，普通话，自然舒展而克制。'],
 ['老年','老年男声，中低音略有岁月感，吐字清楚，普通话，评书先生的从容节奏，不夸张拖腔。'],
 ['气声','成年女性，温暖柔和，略带气声，贴近耳边的亲切感，普通话，尾音完整，不刻意低音量。'],
 ['粗粝','成年男声，粗粝沙哑，结实胸声，普通话，沉稳但不凶狠，自然朗读。'],
 ['口音','成年女性，明亮自然，轻微四川话口音，舒展节奏，温暖亲切的日常讲话。']
];
const text='别着急，我没有生气。等雨停了，我们就一起回家。';
const style='没有生气，略带担忧但温柔克制，最后一句自然放松。';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
(async()=>{
 const dir=path.resolve(process.argv[2]||'artifacts/voice-quality/live-'+Date.now());fs.mkdirSync(dir,{recursive:true});
 const io=makeIO(dir),e=new Engine(io,fs.existsSync(path.join(dir,'state.json'))?JSON.parse(fs.readFileSync(path.join(dir,'state.json'))):undefined);e.state.settings.retries=1;
 let report={started:new Date().toISOString(),generationVersion:2,roles:[],checks:[],listeningAssessment:'待人工对照试听，接口成功不能证明主观听感。'};
 if(fs.existsSync(path.join(dir,'report.json')))report=JSON.parse(fs.readFileSync(path.join(dir,'report.json')));const priorCalls=report.calls||[];
 function write(){fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify({...report,calls:[...priorCalls,...io.calls]},null,2));
  const audio=(id,label)=>id?`<p>${escape(label)}</p><audio controls preload="none" src="${escape(id)}"></audio>`:'';
  fs.writeFileSync(path.join(dir,'listening.html'),`<!doctype html><meta charset="utf-8"><title>Vocast 声音质感对照试听</title><style>body{font:16px system-ui;max-width:920px;margin:32px auto;padding:0 20px;line-height:1.65}section{border-top:1px solid #ccc;padding:16px 0}audio{width:100%}p{margin:8px 0}</style><h1>声音质感对照试听</h1><p>独立测试产物。旧方案使用固定试听句、280 字/分钟及关键词标签；新方案使用适配试听文本与完整演绎指令。</p><p>台词：${escape(text)}</p><p>重点听：声线一致、自然节奏、情绪适度、尾音完整和角色切换。主观验收待人工试听。</p>${report.roles.map(r=>`<section><h2>${escape(r.name)}</h2><p>${escape(r.description)}</p>${audio(r.oldSample,'旧方案固定试听样本')}${audio(r.sample,'新方案适配试听样本：'+(r.previewText||''))}${audio(r.oldClone,'旧方案克隆台词')}${audio(r.clone,'新方案克隆台词')}${r.error?'<p>'+escape(r.error)+'</p>':''}</section>`).join('')}${audio(report.chapter,'新方案角色串联')}`);
 }
 for(const [name,description] of roles){let row=report.roles.find(r=>r.name===name);if(!row){row={name,description};report.roles.push(row);}if(row.clone)continue;delete row.error;write();
  try{
   if(!row.oldSample){const old=await e.request('tts',{model:'mimo-v2.5-tts-voicedesign',messages:[{role:'user',content:description},{role:'assistant',content:'你好，这是我的声音，希望你会喜欢。'}],audio:{format:'wav',optimize_text_preview:false}});
   row.oldSample=(await io.saveAudio(old.choices[0].message.audio.data,'wav')).id;write();}
   let designed=e.state.voices.find(v=>v.sample===row.sample);if(!designed){designed=await e.design(description);await e.saveVoice(designed);}row.sample=designed.sample;row.previewText=designed.previewText;assert(row.previewText,'MiMo adaptive preview text missing');write();
   if(!row.oldClone){const oldRef=(await io.readAudio(row.oldSample)).base64;
   const baseline=await e.request('tts',{model:'mimo-v2.5-tts-voiceclone',messages:[{role:'user',content:'自然流畅朗读，语速约280字/分钟，不增删原文。'},{role:'assistant',content:'(Angry)'+text}],audio:{format:'wav',voice:'data:audio/wav;base64,'+oldRef}});
   row.oldClone=(await io.saveAudio(baseline.choices[0].message.audio.data,'wav')).id;write();}
   const clone=await e.synthesize(text,designed.id,style);row.clone=clone.id;row.qualityStatus=clone.qualityStatus;row.rawAudioIds=clone.rawAudioIds;row.duration=clone.duration;write();
   console.log('PASS live role',name,'duration',clone.duration.toFixed(2));
  }catch(err){row.error=err.message;write();console.log('LIVE role pending',name,err.message);}
 }
 const complete=report.roles.filter(r=>r.clone);
 if(complete.length){report.chapter=(await io.mergeAudio(complete.map(r=>r.clone),complete.map(()=>350))).id;write();
  const first=complete[0],raw=(await io.readAudio(first.clone)).base64;
  const doubled=mergeWave([Buffer.from(raw,'base64'),Buffer.from(raw,'base64')],[350,0]);
  const checked=await e.saveSpeechAudio(doubled.toString('base64'),text);
  assert.equal(checked.duration,waveInfo(doubled).duration);
  report.checks.push({name:'本地重复诊断保留完整原音频',passed:true,status:checked.qualityStatus,duration:checked.duration});

 }
 report.completed=new Date().toISOString();report.pass=complete.length===roles.length&&report.checks.some(x=>x.name==='本地重复诊断保留完整原音频'&&x.passed);write();
 console.log('LIVE REPORT',path.join(dir,'listening.html'),'complete roles',complete.length);if(!report.pass)process.exitCode=1;
})().catch(err=>{console.error(err.message);process.exitCode=1;});

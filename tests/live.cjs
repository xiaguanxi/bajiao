const fs=require('node:fs'),assert=require('node:assert/strict');
const {Engine}=require('../app/src/main/assets/core.js'),{makeIO,waveInfo}=require('./node-io.cjs');
(async()=>{
 const io=makeIO('artifacts/live'),engine=new Engine(io);let report={started:new Date().toISOString(),tests:[]};
 const pass=(name,details={})=>{report.tests.push({name,pass:true,...details});console.log('PASS',name);fs.writeFileSync('artifacts/live/report.json',JSON.stringify({...report,calls:io.calls},null,2));};
 const b=await engine.addBook('真实接口验证','第一章 山中来信\n雨停了，青年男子沈砚推开木门。\n“你终于来了。”沈砚用低沉温润的声音轻声说。\n年轻女子林晚看着他，用清亮自然的声音问：“这封信是谁寄来的？”');
 const c=b.chapters[0];await engine.analyze(b.id,c.id);assert.equal(c.segments.map(x=>x.text).join('').replace(/\s/g,''),c.text.replace(/\s/g,''));assert(c.segments.some(s=>s.speaker==='沈砚'));assert(c.segments.some(s=>s.speaker==='林晚'));assert(c.segments.some(s=>s.speaker==='旁白'));pass('MiniMax CN 真实角色标注与原文完整性',{segments:c.segments.length,roles:b.characters.map(r=>r.name)});
 const preset=await engine.synthesize('山里的雾散了，新的故事开始了。','preset:白桦');assert(preset.duration>1);pass('MiMo 预设 WAV 可解码',{duration:preset.duration});
 const candidate=await engine.design('青年男声，低沉温润，情绪克制，普通话。','别担心，天亮之前，我一定会回来。');await engine.saveVoice(candidate);pass('MiMo 音色设计返回真实参考样本');
 const cloned=await engine.synthesize('这是用参考样本朗读的一段全新台词。',candidate.id);assert(cloned.duration>1);pass('MiMo 设计样本克隆合成',{duration:cloned.duration});
 const female=await engine.synthesize('清晨的风穿过树林，远方的故事刚刚开始。','preset:茉莉');const imported=await engine.importVoice({name:'年轻女声，清亮自然，普通话.wav',format:'wav',id:female.id,size:female.size});assert.equal(imported.description,'年轻女声，清亮自然，普通话');const importedAudio=await engine.synthesize('音频内容不需要和新的台词相同。',imported.id);assert(importedAudio.duration>1);pass('用户样本导入与直接克隆',{duration:importedAudio.duration});
 await engine.matchCharacters(b.id,['沈砚','林晚']);assert(b.characters.find(r=>r.name==='沈砚').voice);assert(b.characters.find(r=>r.name==='林晚').voice);pass('MiniMax 根据我的音色描述自动匹配');
 await engine.enqueue(b.id,[c.id]);const task=engine.state.tasks[0];assert.equal(task.status,'done',JSON.stringify(task));assert(c.audio);assert(c.duration>3);const assembled=fs.readFileSync('artifacts/live/'+c.audio);waveInfo(assembled);fs.copyFileSync('artifacts/live/'+c.audio,'artifacts/live/completed-chapter.wav');pass('端到端真实多角色章节配音与合并',{duration:c.duration,bytes:assembled.length});
 const count=io.calls.length;await engine.enqueue(b.id,[c.id]);assert.equal(io.calls.length,count);pass('已完成章节去重，不重复调用');
 const reloaded=new Engine(io,JSON.parse(fs.readFileSync('artifacts/live/state.json')));assert.equal(reloaded.book(b.id).chapters[0].audio,c.audio);pass('制作状态与音色库持久化恢复');
 report.completed=new Date().toISOString();report.calls=io.calls;report.pass=true;fs.writeFileSync('artifacts/live/report.json',JSON.stringify(report,null,2));console.log('LIVE E2E PASSED; calls:',io.calls.length);
})().catch(e=>{console.error('LIVE FAIL',e.message);process.exitCode=1});

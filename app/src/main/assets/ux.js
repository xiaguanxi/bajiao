(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./core.js'):root.Bajiao);if(typeof module==='object'&&module.exports)module.exports=api;else root.BajiaoUX=api;})(typeof globalThis!=='undefined'?globalThis:this,function(V){
'use strict';
const copy=value=>JSON.parse(JSON.stringify(value)),uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,9);
function friendlyError(error){
 const message=String(error?.message||error||'操作失败');
 if(V.isContentRejected(error)){
  const service=error?.provider==='llm'?'语言模型':error?.provider==='tts'?'语音服务':'服务商';
  const location=error?.stage?'（'+error.stage+(error.batchStart?'，请求批次第 '+error.batchStart+'–'+error.batchEnd+' 段，含上下文':'')+'）':'';
  return service+'内容审核未通过'+location+'。已保留原文和完成进度，请检查相关内容或联系服务商确认后再重试。';
 }
 if(/model.*(?:not found|not exist|invalid|unknown)|invalid.*model/i.test(message))return '模型 ID 不可用，请到模型配置检查名称并保存后测试。';
 if(/(?:number|count|length).*mismatch|返回.*(?:数量|条数)|标注.*(?:数量|条数)/i.test(message))return '模型返回的标注数量与原文不一致。已保留原文和完成片段，请重试或更换模型。';
 if(/prepare failed|status=0x|invalid.*mp3|unsupported.*audio/i.test(message))return '无法解码该音频，请换用有效的 MP3 或 PCM WAV 文件。';
 if(/Invalid regular expression|Unterminated|Nothing to repeat/i.test(message))return '标题规则格式无效，请检查括号或使用“第*章”这样的模板。';
 if(/401|unauthorized|authentication|invalid.*(?:api.?key|token)/i.test(message))return '密钥验证失败，请检查服务区域、地址和 API Key，然后保存并测试。';
 if(/429|rate.limit|too many requests/i.test(message))return '服务请求过多，请稍后重试，或在制作设置降低并发数。';
 if(/insufficient|quota|balance/i.test(message))return '服务额度不足，请检查对应账户的可用额度。';
 return message.replace(/\/data\/[^:\s]*/g,'[应用数据文件]').replace(/open failed:\s*ENOENT\s*(\([^)]*\))?/gi,'文件缺失').trim();
}
function isStorageError(error){return /^CHAPTER_/.test(error?.code||'')||/文本缺失|数据.*损坏|数据文件.*(?:缺失|丢失)|文件缺失|索引损坏|索引不匹配|ENOENT|open failed/i.test(String(error?.message||error||''));}
function chapterOrdinal(title){const raw=String(title).replace(/[０-９]/g,c=>String(c.charCodeAt(0)-0xff10)).match(/第\s*([零〇一二三四五六七八九十百千万两\d]+)\s*[章节回卷部]|Chapter\s+(\d+)/i);if(!raw)return null;const text=raw[1]||raw[2];if(/^\d+$/.test(text))return Number(text);const digits={零:0,〇:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9},units={十:10,百:100,千:1000,万:10000};let total=0,part=0,digit=0;for(const c of text){if(c in digits)digit=digits[c];else if(c==='万'){total+=(part+digit)*10000;part=0;digit=0;}else{part+=(digit||1)*units[c];digit=0;}}return total+part+digit;}
function probeWindows(text){const lines=text.split('\n'),points=[0,Math.floor(lines.length/4),Math.floor(lines.length/2),Math.floor(lines.length*3/4),Math.max(0,lines.length-60)],seen=new Set();return points.filter(p=>!seen.has(p)&&seen.add(p)).map(p=>'【第 '+(p+1)+' 行附近】\n'+lines.slice(p,p+60).join('\n')).join('\n\n');}
function validateProbe(text,template){const result=V.splitChapters(text,{ruleId:'custom',customPattern:template}),automatic=V.splitChapters(text);if(!result.report.count)throw Error('这个模板没有匹配到标题，保留原有预览。请重试或修改规则。');if(result.report.sourceCoverage!==1)throw Error('模板未能完整保留原文，保留原有预览。');if(automatic.report.count>result.report.count*1.15)throw Error('这个模板只识别 '+result.report.count+' 个标题，自动规则识别 '+automatic.report.count+' 个，可能漏章。已保留原有预览。');return result;}
V.Engine.prototype.appendChapters=async function(bid,result){const b=this.book(bid);if(!result?.chapters?.length)throw Error('没有可追加的章节');const added=result.chapters.map(c=>({...copy(c),id:uid()}));for(const c of added)this.touch(c);b.chapters.push(...added);await this.persist();return added;};
V.Engine.prototype.restoreChapter=async function(bid,cid,source){const b=this.book(bid),c=this.chapter(bid,cid);if(typeof source.text!=='string')throw Error('恢复文本缺失');if(this.state.tasks.some(t=>t.bookId===bid&&t.chapterId===cid&&t.status==='running'))throw Error('请先暂停本章任务');Object.assign(c,{text:source.text,title:c.title||source.title,segments:[],audioStale:!!c.audio,status:c.audio?'annotated':'raw',recoveredAt:Date.now()});delete c.unloaded;delete c.storageRef;delete c.analysisDraft;this.touch(c);for(const t of this.state.tasks.filter(t=>t.bookId===bid&&t.chapterId===cid)){t.status='paused';t.phase='本章已恢复，可继续制作';t.message='';t.error=null;t.done=0;t.total=0;}await this.persist();return c;};
V.Engine.prototype.deleteChapter=async function(bid,cid){const b=this.book(bid);await this.ensureChapter(bid,cid);const index=b.chapters.findIndex(c=>c.id===cid);if(b.chapters.length<=1)throw Error('至少保留一章；整本移除请使用删除书籍');for(const t of this.state.tasks.filter(t=>t.bookId===bid&&t.chapterId===cid))await this.cancel(t.id);this.state.chapterUndo={bookId:bid,index,chapter:copy(b.chapters[index]),until:Date.now()+86400000};b.chapters.splice(index,1);this.state.tasks=this.state.tasks.filter(t=>!(t.bookId===bid&&t.chapterId===cid));if(b.readProgress?.chapterId===cid)delete b.readProgress;await this.persist();};
V.Engine.prototype.undoChapter=async function(){const undo=this.state.chapterUndo;if(!undo||undo.until<Date.now())throw Error('撤销已过期');const b=this.book(undo.bookId);if(!b.chapters.some(c=>c.id===undo.chapter.id)){b.chapters.splice(Math.min(undo.index,b.chapters.length),0,undo.chapter);this.touch(undo.chapter);}delete this.state.chapterUndo;await this.persist();return undo.chapter;};
const collect=V.Engine.prototype.collectReferencedAudio;
V.Engine.prototype.collectReferencedAudio=function(){const ids=collect.call(this),undo=this.state.chapterUndo;if(undo?.until>Date.now()){const c=undo.chapter;ids.push(c.audio,c.originalAudio);for(const s of c.segments||[])ids.push(...V.segmentAudioIds(s));}return [...new Set(ids.filter(id=>id&&id!=='skip'))];};
V.Engine.prototype.audioImpact=async function(targets){const files=new Set(),chapters=[];for(const {bookId,chapterId} of targets){let c=this.chapter(bookId,chapterId);if(c.unloaded&&c.segmentCount){try{c=await this.ensureChapter(bookId,chapterId);}catch(e){if(!isStorageError(e))throw e;}}const ids=[c.audio,c.originalAudio];for(const s of c.segments||[])ids.push(s.audio,s.originalAudio,...(s.rawAudioIds||[]),...(s.speechDraft?.files||[]).map(f=>f.id),s.speechDraft?.pendingRaw?.file?.id);if(ids.some(id=>id&&id!=='skip'))chapters.push(c);ids.forEach(id=>{if(id&&id!=='skip')files.add(id);});}const stats=this.io.audioStats?await this.io.audioStats():null;return {books:new Set(targets.map(t=>t.bookId)).size,chapters:targets.length,audioChapters:chapters.length,files:files.size,bytes:[...files].reduce((n,id)=>n+(stats?.fileSizes?.[id]||0),0),stats};};
V.Engine.prototype.confirmWaiting=async function(){
 const tasks=this.state.tasks.filter(t=>t.status==='waiting'),prepared=[],resumed=[],blocked=[],protectedRoles=new Map();let roles=0,speakers=0;
 // Inspect all waiting chapters before binding a voice: binding can invalidate other chapters.
 for(const t of tasks){
  try{const b=this.book(t.bookId),c=await this.ensureChapter(b.id,t.chapterId),pending=c.segments.filter(s=>s.qualityStatus==='pending'&&!s.audio);
   prepared.push({t,b,c,pending});if(!protectedRoles.has(b.id))protectedRoles.set(b.id,new Set());for(const s of pending)protectedRoles.get(b.id).add(s.speaker);
  }catch(e){blocked.push({taskId:t.id,reason:friendlyError(e)});}
 }
 for(const {t,b,c,pending} of prepared){
  if(pending.length){blocked.push({taskId:t.id,reason:pending.length+' 句音频需试听或重新合成，不能自动放行'});continue;}
  const names=new Set(c.segments.filter(s=>!s.skip&&!s.isAd&&s.speaker!=='广告').map(s=>s.speaker));
  const unbound=b.characters.filter(r=>names.has(r.name)&&!r.voice),protectedNames=unbound.filter(r=>protectedRoles.get(b.id).has(r.name));
  if(protectedNames.length){blocked.push({taskId:t.id,reason:'角色 '+protectedNames.map(r=>r.name).join('、')+' 在其他待确认章节还有音频需处理，请先处理后再确认声线'});continue;}
  for(const r of unbound){if(r.candidate){await this.accept(b.id,r.name,false);roles++;}else if(r.suggestedVoice){await this.bind(b.id,r.name,r.suggestedVoice,false);roles++;}else{r.autoDesign=true;roles++;}}
  for(const s of c.segments){if(s.skip||s.isAd||s.speaker==='广告')continue;if(s.annotationStatus==='pending'&&!s.annotationError)continue;if(s.annotationError||s.confidence<this.spkThr()||!b.characters.some(r=>r.name===s.speaker)){if(!b.characters.some(r=>r.name===s.speaker))s.speaker='旁白';s.confidence=1;s.annotationStatus='resolved';delete s.annotationError;speakers++;}}
  this.touch(c);resumed.push(t.id);
 }
 await this.persist();this.resumeTasks(resumed).catch(()=>{});return {roles,speakers,resumed:resumed.length,blocked};
};
return {friendlyError,isStorageError,chapterOrdinal,probeWindows,validateProbe};
});

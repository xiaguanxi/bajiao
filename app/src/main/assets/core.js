(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.Vocast=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const AudioQuality=typeof module==='object'&&module.exports?require('./audio-quality.js'):globalThis.VocastAudioQuality;
const ModelPrompts=typeof module==='object'&&module.exports?require('./model-prompts.js'):globalThis.VocastModelPrompts;
const {Scheduler}=typeof module==='object'&&module.exports?require('./model-scheduler.js'):globalThis.VocastModelScheduler;
const FEATURES={batching:false,direction:true,pipeline:false,cloneConcurrency:1};
const PROMPT_VERSION=3;
const DIRECTION_VERSION=1;
const ANNOTATION_BATCH_LIMIT=24;
const GENERATION_VERSION=3;
const SILENCE_PROCESSING_VERSION=1;
const PAUSE_POLICY={sentence:350,ellipsis:450,semicolon:220,colon:180,comma:120};
const PRESETS=['默认嗓音','冰糖','茉莉','苏打','白桦','Mia','Chloe','Milo','Dean'];
const DEFAULTS={wifiOnlyProduction:false,llmBase:'',llmModel:'',llmProtocol:'openai',mode:'auto',usePresets:false,retries:2,qualityAutoRetry:true,qualityConfirmRetry:false,speakerThreshold:0.5,autoDeletePlayed:false,keepRecentCount:2,autoProduceCount:2,playbackSpeed:1.0,sleepTimer:0,autoProduceUpcoming:true,readerFontSize:16,readerLineHeight:1.6,taskParallel:1,ttsParallel:2,splitRule:'auto',splitCustom:''};
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,9);
const normalize=s=>String(s).replace(/\s/g,'');
class QualityError extends Error{constructor(message,retryQuality=false){super(message);this.qualityPending=true;this.retryQuality=retryQuality;}}
function segmentAudioIds(segment){
 return [...new Set([segment.audio,segment.originalAudio,...(segment.rawAudioIds||[]),...(segment.speechDraft?.rawAudioIds||[]),segment.speechDraft?.pendingRaw?.file?.id,segment.speechDraft?.pendingRaw?.processedFile?.id,...(segment.speechDraft?.files||[]).flatMap(f=>[f.id,...(f.rawAudioIds||[])]),...(segment.retryDraft?.rawAudioIds||[]),segment.retryDraft?.pendingRaw?.file?.id,segment.retryDraft?.pendingRaw?.processedFile?.id,...(segment.retryDraft?.files||[]).flatMap(f=>[f.id,...(f.rawAudioIds||[])])].filter(id=>id&&id!=='skip'))];
}
function buildSpeechDirection(style,description=''){
 return typeof style==='string'?style.trim():'';
}
function directionIssue(value){
 if(typeof value?.scene!=='string')return '场景字段缺失或格式错误';
 if(Array.from(value.scene.trim()).length>60)return '场景超过60字';
 if(typeof value.delivery!=='string'||!value.delivery.trim())return '导演指导缺失或格式错误';
 if(Array.from(value.delivery.trim()).length>120)return '导演指导超过120字';
 return '';
}
function clearDirection(segment){for(const key of ['scene','delivery','directionVersion','directionStatus','directionError'])delete segment[key];}
function applyDirection(segment,value){
 clearDirection(segment);
 if(segment.skip||segment.isAd||segment.speaker==='广告'||isPunctOnly(segment.text))return;
 const error=directionIssue(value);
 if(error){segment.directionStatus='pending';segment.directionError=error;return;}
 Object.assign(segment,{scene:value.scene.trim(),delivery:value.delivery.trim(),directionVersion:DIRECTION_VERSION,directionStatus:'ready'});
}
function nearbyContext(input,ids){
 const selected=new Set();for(const id of ids)for(let i=Math.max(0,id-2);i<=Math.min(input.length-1,id+2);i++)selected.add(i);
 return [...selected].sort((a,b)=>a-b).map(i=>input[i]);
}
function isTextLengthError(error){return /text[^\w]*too[^\w]*long|文本超长|too long|maximum.*(?:length|token)|context.*length/i.test(String(error?.message||''))&&!/[音声]频/.test(String(error?.message||''));}
function boundedSpeechParts(text,limit=600){
 const out=[];for(const sentence of speechParts(text)){
  let chars=Array.from(sentence);
  while(chars.length>limit){let at=limit;for(let i=limit-1;i>limit/2;i--)if(/[，,；;：:\s]/.test(chars[i])){at=i+1;break;}out.push(chars.slice(0,at).join(''));chars=chars.slice(at);}
  if(chars.length)out.push(chars.join(''));
 }
 return out;
}
function voiceConflict(a,b){
 const ga=genderOf(a),gb=genderOf(b);if(ga&&gb&&ga!==gb)return true;
 const englishTraits={hoarse:'沙哑',raspy:'沙哑',breathy:'气声',nasal:'鼻音',clear:'清晰',bright:'清亮',warm:'温暖',rough:'粗粝'};
 const polarity=s=>{const traits=new Map();for(const clause of String(s||'').split(/[，,。；;、]|\bbut\b|但是|而是|但/i)){for(const match of clause.matchAll(new RegExp(VOICE_WORDS.source+'|\\b(?:'+Object.keys(englishTraits).join('|')+')\\b','gi'))){const prefix=clause.slice(0,match.index),trait=englishTraits[match[0].toLowerCase()]||match[0];traits.set(trait,/(?:不|没有|无)\s*[^，,。；;、]{0,5}$|\b(?:not(?:\s+at\s+all)?|without|no)\s*$/i.test(prefix)?-1:1);}}return traits;};
 const A=polarity(a),B=polarity(b);for(const [trait,value] of A)if(B.has(trait)&&B.get(trait)!==value)return true;
 const accents=s=>[...new Set(String(s||'').match(/粤语|四川话|东北话|上海话|台湾腔|北京口音|湖南口音|河南口音|美式口音|英式口音|Cantonese|American accent|British accent/gi)||[])].map(x=>x.toLowerCase());
 const aa=accents(a),ab=accents(b);return aa.length>0&&ab.length>0&&!aa.some(x=>ab.includes(x));
}
const safeAliases=aliases=>(Array.isArray(aliases)?aliases:[]).filter(x=>typeof x==='string'&&x.length>=2&&x.length<=20&&!/^(青年|少年|少女|男子|女子|男人|女人|男孩|女孩|老人|孩子|女娃|两女娃)$/.test(x)).slice(0,12);
class LlmOutputError extends Error{constructor(message,kind='structure'){super(message);this.kind=kind;}}
class ApiError extends Error{constructor(message,status=0,retryable=false){super(message);this.status=status;this.retryable=retryable;}}
function isContentRejected(error){return /^(1026|1027)$/.test(String(error?.code||error?.status||''))||/\b(?:input|output)[ _]+(?:new_)?sensitive\b|内容(?:涉敏|审核未通过)|[（(]102[67][）)]/i.test(String(error?.message||error||''));}
function isNetworkRetryable(e){
 if(isContentRejected(e))return false;
 if(e?.retryable===true)return true;
 const s=String(e?.message||e?.detail||e?.code||e||'');
 return /网络|超时|timeout|timed out|fetch failed|network|ECONN|ENOTFOUND|EAI_AGAIN|EPIPE|socket|HTTP (429|5\d\d|408)\b/i.test(s)||e?.status===429||e?.status===408||(e?.status>=500&&e?.status<600);
}
// 自动重试策略：指数退避 30s 起，2^x 上限 10 分钟，最多 10 次。
const NET_RETRY_BASE_MS=30000, NET_RETRY_MAX_MS=600000, NET_RETRY_LIMIT=10;
function nextRetryDelay(retryCount){return Math.min(NET_RETRY_MAX_MS,NET_RETRY_BASE_MS*Math.pow(2,Math.max(0,retryCount||0)));}
function parseJson(text){
  const raw=String(text||'').replace(/<think>[\s\S]*?<\/think>/gi,'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
  const start=raw.indexOf('{'),end=raw.lastIndexOf('}');
  if(start<0||end<start)throw new Error('语言模型未返回有效 JSON，请重试或更换模型');
  const clean=raw.slice(start,end+1);
  try{
    return JSON.parse(clean);
  }catch(e0){
    let repaired=clean
      .replace(/\/\/[^\n]*/g,'')
      .replace(/\/\*[\s\S]*?\*\//g,'')
      .replace(/,\s*([}\]])/g,'$1')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]+/g,' ');
    repaired=repaired.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g,(m,content)=>{
      return '"'+content.replace(/\n/g,'\\n').replace(/\r/g,'\\r').replace(/\t/g,'\\t')+'"';
    });
    try{
      return JSON.parse(repaired);
    }catch(e1){
      const lines=[];
      // Recover complete leaf objects without crossing JSON strings or adjacent rows.
      const objects=clean.match(/\{(?:[^{}"\\]|"(?:\\.|[^"\\])*")*\}/g)||[];
      for(const object of objects){
        let value;
        try{value=JSON.parse(object);}catch(_){
          const id=object.match(/["']?id["']?\s*:\s*(\d+)/);
          if(!id)continue;
          value={id:Number(id[1])};
          for(const key of ['speaker','emotion','scene','delivery']){
            const field=object.match(new RegExp('["\']?'+key+'["\']?\\s*:\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"'));
            if(field){try{value[key]=JSON.parse('"'+field[1]+'"');}catch(_){}}
          }
          const confidence=object.match(/["']?confidence["']?\s*:\s*([0-9.]+)/);
          if(confidence)value.confidence=Number(confidence[1]);
        }
        if(Number.isInteger(value?.id))lines.push(value);
      }
      if(lines.length>0){
        const characters=[];
        const charItemRegex=/\{\s*["']?name["']?\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"[\s\S]*?["']?description["']?\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"(?:[\s\S]*?["']?aliases["']?\s*:\s*(\[[^\]]*\]))?[\s\S]*?\}/g;
        let cm;
        while((cm=charItemRegex.exec(clean))!==null){
          let aliases=[];
          if(cm[3]){try{aliases=JSON.parse(cm[3]);}catch(_){}}
          characters.push({name:cm[1].replace(/\\"/g,'"'),description:cm[2].replace(/\\"/g,'"'),aliases});
        }
        let summary='';
        const sumMatch=clean.match(/["']?summary["']?\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
        if(sumMatch)summary=sumMatch[1].replace(/\\"/g,'"');
        return {characters,lines,summary};
      }
      const matches=[];
      const matchItemRegex=/\{\s*["']?name["']?\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"[\s\S]*?["']?voiceId["']?\s*:\s*(?:"([^"\\]*(?:\\.[^"\\]*)*)"|(null))[\s\S]*?["']?reason["']?\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"[\s\S]*?\}/g;
      let mm;
      while((mm=matchItemRegex.exec(clean))!==null){
        matches.push({
          name:mm[1].replace(/\\"/g,'"'),
          voiceId:mm[3]==='null'?null:(mm[2]?mm[2].replace(/\\"/g,'"'):null),
          reason:mm[4]?mm[4].replace(/\\"/g,'"'):''
        });
      }
      if(matches.length>0)return {matches};
      throw new Error('解析语言模型输出失败：'+e0.message);
    }
  }
}
function units(text){if(typeof text!=='string')throw Error('章节文本缺失，请重新导入书籍');const out=[];let buf='',quote='';const close={'“':'”','「':'」','『':'』','"':'"'};const flush=()=>{if(buf.trim())out.push(buf.trim());buf='';};for(const c of text){if(!quote&&close[c]){flush();quote=close[c];buf=c;continue;}buf+=c;if(quote&&c===quote){quote='';flush();}else if(!quote&&(/[。！？!?\n；;]/.test(c)||buf.length>=240))flush();}flush();if(normalize(out.join(''))!==normalize(text))throw Error('文本分句校验失败');return out.map((text,id)=>({id,text}));}
// Split speech within a labelled dialogue without changing its speaker or source text.
function speechParts(text){const parts=[];let start=0;for(let i=0;i<text.length;i++){if(!/[。！？!?]/.test(text[i]))continue;while(i+1<text.length&&/[。！？!?”」』"\s]/.test(text[i+1]))i++;if(text.slice(i+1).replace(/[”」』"\s]/g,'')){parts.push(text.slice(start,i+1));start=i+1;}}if(start<text.length)parts.push(text.slice(start));return parts;}
function pauseAfter(text){const end=String(text).trim().replace(/[”」』"）)\]]+$/g,'');if(/[。！？!?]$/.test(end))return PAUSE_POLICY.sentence;if(/(?:……|\.\.\.)$/.test(end))return PAUSE_POLICY.ellipsis;if(/[；;]$/.test(end))return PAUSE_POLICY.semicolon;if(/[：:]$/.test(end))return PAUSE_POLICY.colon;if(/[，,]$/.test(end))return PAUSE_POLICY.comma;return 0;}
// 整句只有标点没有正文（如"……"）：不走 TTS，直接静默合理时长
function friendlyTtsError(msg){const m=String(msg||'');if(/param[^\w]*incorrect/i.test(m))return '合成参数被拒绝（Param Incorrect）：该句文本含特殊符号或过长，待处理，其余句子继续制作';if(/text[^\w]*too[^\w]*long/i.test(m))return '该句文本超长被拒绝，待处理，其余句子继续制作';if(/unsupported[^\w]*voice/i.test(m))return '音色参数不被支持，该句待处理';return m;}
function isPunctOnly(text){const t=String(text||'').trim();return t.length>0&&/^[\s，。！？、；：「」『』（）…—·,.!?;:'"()\[\]…\-\u2014\u2013\/\\|~～·×÷+=<>《》〈〉“”‘’]+$/.test(t);}
function punctSilenceMs(text){const t=String(text||'').trim();if(/(?:…|\.\.\.|。{3,}|—{2,}|——)$/.test(t))return 800;if(/[？！?!]$/.test(t))return 500;return 300;}
function pausesFor(texts){return texts.map((text,i)=>i===texts.length-1?0:pauseAfter(text));}
// Duration is a diagnostic estimate; anomalies require content verification.
function expectedSpeechSec(text){const n=String(text||'').replace(/\s/g,'').length;return Math.max(1,n/280*60);}
function isAudioTooLong(text,durationSec){if(!(durationSec>0))return false;const exp=expectedSpeechSec(text);return durationSec>Math.max(8,exp*3+5);}
// Keep free-form direction in the user message, never infer tags from substrings.
function styleTagOf(){return '';}
function tagTextOf(text){return text;}
function splitBook(text,opts){return splitChapters(text,opts).chapters;}
const CHAPTER_RULES=[
 {id:'chapter_cn',re:/^\s*\u3000{0,2}(\u7b2c[\u96f6\u3007\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u5343\u4e07\u4ebf\d\uFF10-\uFF19\s\u00b7\uFF61\uFF0C,\u3001-]{1,12}[\u7ae0\u56de\u8282\u96c6\u5377\u90e8\u7bc7\u62db\u5e55\u6bb5])([ \t\u3000:\uFF1A\u2014\u2013\-\.\uFF61]{0,3}[^\n]{0,40})?$/},
 {id:'volume_cn',re:/^\s*(\u7b2c[\u96f6\u3007\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u5343\u4e07\u4ebf\d\uFF10-\uFF19]{1,8}[\u5377\u7bc7\u90e8])([ \t\u3000:\uFF1A\u2014\u2013\-\.\uFF61]{0,3}[^\n]{0,40})?$/},
 {id:'special_cn',re:/^\s*[#*\u3000 ]{0,3}(\u5e8f\u7ae0|\u5e8f\u8a00|\u5e8f\u5e55|\u6954\u5b50|\u5f15\u5b50|\u524d\u8a00|\u5f00\u7bc7|\u756a\u5916(?:\u7bc7)?|\u5916\u4f20|\u540e\u8bb0|\u9644\u5f55|\u7ec8\u7ae0|\u81f4\u8c22|\u7ed3\u8bed|\u81f4\u8bfb\u8005|\u4ee3\u5e8f|\u5377\u9996\u8bed|\u5185\u5bb9\u7b80\u4ecb)([ \t\u3000:\uFF1A\u2014\u2013\-\.\uFF61]{0,3}[^\n]{0,40})?$/},
 {id:'chapter_en',re:/^\s*(chapter|section|part|prologue|epilogue|volume|book)\s+[ivxlcdm\d]+([:\-\.\s].{0,40})?$/i},
 {id:'number_dot',re:/^\s*\d{1,4}[\u3001.\uFF61:\uFF1A\s][^\n]{1,40}$/},
 {id:'num_chapter',re:/^\s*\u7b2c[\d\uFF10-\uFF19]{1,5}[ \t\u3000]+[^\n]{1,40}$/},
 {id:'paren_num',re:/^\s*[\(\[\{\uFF08\u3010]\s*\d{1,4}\s*[\)\]\}\uFF09\u3011][^\n]{0,40}$/},
 {id:'bare_num',re:/^[\s\u3000]*[\d\uFF10-\uFF19]{1,4}[\s\u3000]*$/},
 {id:'bare_cn_num',re:/^[\s\u3000]*[\u96f6\u3007\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u5343]{1,6}[\s\u3000]*$/}
];
// Each heading is keyed by its source line, never by its (possibly repeated) title.
function buildChapters(text,titles){
 const lines=text.split('\n'),byLine=new Map(titles.map(t=>[t.index,t])),chapters=[];
 let title='正文',sourceHeading=false,buf=[];
 const push=()=>{const body=buf.join('\n').trim();if(body||sourceHeading)chapters.push({id:uid(),title,text:body,sourceHeading,status:'raw',segments:[]});buf=[];};
 lines.forEach((line,index)=>{const hit=byLine.get(index);if(hit){push();title=hit.title;sourceHeading=true;}else buf.push(line);});push();return chapters;
}
function headingText(line){return line.trim().replace(/^(?:#{1,6}\s*|={2,}\s*|【\s*|\[\s*)/,'').replace(/(?:\s*={2,}|\s*】|\s*\])$/,'').trim();}
function titleCandidates(text,rule){
 return text.split('\n').flatMap((line,index)=>{
  const title=rule.id==='custom'?line.trim():headingText(line);rule.re.lastIndex=0;if(!rule.re.test(title)||title.length>60)return [];
  if(rule.id!=='custom'&&/[，。；;]$/.test(title))return [];
  if(['chapter_cn','volume_cn','special_cn'].includes(rule.id)){
   const boundary=rule.id==='special_cn'?/^(?:序章|序言|序幕|楔子|引子|前言|开篇|番外(?:篇)?|外传|后记|附录|终章|致谢|结语|致读者|代序|卷首语|内容简介)/:/^第[^章回节集卷部篇招幕段]{1,12}[章回节集卷部篇招幕段]/;
   const m=title.match(boundary);if(!m)return [];const tail=title.slice(m[0].length);
   // Padded Arabic chapter numbers also delimit titles without a separating space.
   const padded=/^第[0０][\d\uFF10-\uFF19]{2,}[章回节集卷部篇招幕段]/.test(m[0]);
   if(tail&&!/^[\s:：—–\-.｡]/.test(tail)&&!padded)return [];
  }
  return [{line,index,title:line.trim()}];
 });
}
function scoreSplit(titles,text){if(!titles.length)return -1e9;const lines=text.split('\n');const lengths=titles.map((t,i)=>(titles[i+1]?.index??lines.length)-t.index-1);return lengths.filter(n=>n>0).length/titles.length;}
function filterTitleLines(cands){return cands;}
function splitChapters(text,opts={}){
 text=String(text).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');if(!text.trim())throw Error('书籍内容为空');
 let titles=[],ruleId='none',candidates=[];const forced=opts.ruleId&&opts.ruleId!=='auto';
 if(forced){const rule=opts.ruleId==='custom'&&opts.customPattern?{id:'custom',re:safeTitleRegex(opts.customPattern)}:CHAPTER_RULES.find(r=>r.id===opts.ruleId);if(!rule)throw Error('切章规则不存在');titles=titleCandidates(text,rule);ruleId=rule.id;}
 else{
  const strong=['wrapped','chapter_cn','volume_cn','special_cn','chapter_en','num_chapter'];
  candidates=CHAPTER_RULES.map(rule=>({ruleId:rule.id,titles:titleCandidates(text,rule)}));
  candidates.unshift({ruleId:'wrapped',titles:text.split('\n').flatMap((line,index)=>/^\s*={2,}\s*\S.{0,120}={2,}\s*$/.test(line)?[{line,index,title:line.trim()}]:[])});
  const wrapped=candidates.find(x=>x.ruleId==='wrapped');
  const primary=wrapped.titles.length>=2?[wrapped]:candidates.filter(x=>strong.includes(x.ruleId)&&x.titles.length);
  if(primary.length){const hits=new Map();for(const item of primary)for(const t of item.titles)hits.set(t.index,t);titles=[...hits.values()].sort((a,b)=>a.index-b.index);ruleId=primary[0].ruleId+(primary.length>1?'+mixed':'');}
  else{
   // Numbered lists cannot silently become chapters. Weak formats need substantial bodies
   // and a blank line boundary; explicitly selected numeric rules remain available.
   const lines=text.split('\n');const weak=candidates.filter(x=>x.titles.length>=2&&text.length/x.titles.length>=120&&x.titles.every(t=>t.index===0||!lines[t.index-1].trim())).sort((a,b)=>b.titles.length-a.titles.length);
   if(weak.length){titles=weak[0].titles;ruleId=weak[0].ruleId;}
  }
 }
 const chapters=buildChapters(text,titles),recovered=chapters.map(c=>(c.sourceHeading?c.title+'\n':'')+c.text).join('\n');
 const complete=normalize(recovered)===normalize(text);
 if(!complete)throw Error('切章校验失败：原文未完整保留，请更换规则');
 return {chapters,report:{ruleId,count:titles.length,auto:!forced,failed:!titles.length,singleChapter:!forced&&!titles.length,sourceCharacters:normalize(text).length,preservedCharacters:normalize(recovered).length,sourceCoverage:1,emptyChapters:chapters.filter(c=>!c.text.trim()).length,candidates:candidates.map(x=>({ruleId:x.ruleId,count:x.titles.length,score:scoreSplit(x.titles,text)}))}};
}
function safeTitleRegex(src){let s=String(src||"").trim();if(!s)throw Error("\u81ea\u5b9a\u4e49\u89c4\u5219\u4e3a\u7a7a");if(s.indexOf("*")>=0){const parts=s.split("*").map(p=>p.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"));const NUM="[\u96f6\u3007\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u5343\u4e07\\d\uFF10-\uFF19\\s\u00b7\uFF61\uFF0C,\u3001-]{1,12}";s=parts.join(NUM);}if(s.length>300)throw Error("\u81ea\u5b9a\u4e49\u89c4\u5219\u8fc7\u957f");try{return new RegExp("^\\s*"+s+"([^\\n]{0,40})?$");}catch(e){throw Error("标题规则无效，请检查括号或使用第*章这样的模板");}}
const SPLIT_PROBE_PROMPT=ModelPrompts.split;

function isBitPart(name,bookChars){
  const s=String(name||'').trim();
  if(!s||s==='旁白'||s==='广告'||s==='未知角色'||s==='未识别角色')return false;
  if(bookChars&&bookChars.some(r=>r.name===s&&!r.bitPart))return false;
  if(/^某[\u4e00-\u9fa5a-zA-Z]$/.test(s))return true;
  if(/^(路人|群众|群演|龙套|围观|看客|人群|众人|大家|百姓|村民|士兵|侍卫|家丁|丫鬟|宫女|太监|喽啰|店小二|伙计|小厮|船夫|车夫|无名|佚名)([甲乙丙丁一二三四五六七八九十\dABab]*号?)?$/.test(s))return true;
  // 组织/帮派类集体名：黑莲十一人、青城七子、丐帮众人等，按集体建档
  if(/^[\u4e00-\u9fa5]{2,}(十一人|七子|八仙|十八罗汉|众人|诸人|等人|一行人|一伙人)$/.test(s))return true;
  if(/^(路人|群众|群演|龙套)[\u4e00-\u9fa5]{1,3}$/.test(s))return true;
  if(/^(路人|群众|群演|龙套)[甲乙丙丁ABab\d号]+$/.test(s))return true;
  return false;
}
function bitPartVoiceDesc(name){
  const s=String(name||'');
  const old=/老|爷爷|奶奶|婆婆|大爷|大妈|伯/.test(s);
  const female=/婶|妈|婆|奶奶|妪|姑|嫂|姐|妹|姑娘|小姐|女孩|女生|夫人|公主|宫女|丫鬟/.test(s);
  const male=/叔|爷|伯|公子|少爷|兄弟|哥哥|弟弟|先生|大哥|小哥|小伙|汉|和尚|道士|店小二|伙计|小厮|船夫|车夫|士兵|侍卫|家丁/.test(s);
  const child=/小孩|孩子|小娃|童|少年宫|小女孩|小男孩/.test(s);
  if(child)return female||/女孩/.test(s)?'六七岁的小女孩，说话奶声奶气':'七八岁的小男孩，说话清脆稚嫩';
  if(female)return old?'五十多岁的妇人，嗓音温和略带沙哑':'三十多岁的女子，声音亲切自然';
  if(male)return old?'六十多岁的老汉，嗓音苍老粗粝，中气十足':'三十多岁的男子，声音沉稳自然';
  return '声音自然清晰';
}
function splitEnsemble(name){
  const s=String(name||'').trim();
  if(!s||s==='旁白'||s==='广告'||s==='未知角色'||s==='未识别角色')return null;
  const t=s.replace(/(齐声(说道|说|道)?|异口同声(地)?(说|道)?|一起(说|道|说道|喊道)?|同时(说|道)?|[两二]人)$/,'').trim();
  if(!t||isBitPart(t))return null;
  let parts=t.split(/[、，,/\s+＋&×＼|｜]/).map(x=>x.trim()).filter(x=>x&&x!=='旁白'&&x!=='广告'&&x!=='未知角色'&&x!=='未识别角色');
  if(parts.length<2)parts=t.split(/(?:和|与|跟|同|及|以及|\+)/).map(x=>x.trim()).filter(x=>x&&x!=='旁白'&&x!=='广告'&&x!=='未知角色'&&x!=='未识别角色');
  if(parts.length<2||parts.some(p=>isBitPart(p)))return null;
  return parts;
}
function chapterWarnings(chapters){const seen=new Set(),duplicates=new Set();for(const c of chapters){const n=c.title.match(/^第(\d+)(?:章|[ \t])/);if(!n)continue;const key=Number(n[1]);if(seen.has(key))duplicates.add(key);seen.add(key);}const warnings=[];if(duplicates.size)warnings.push('原文含重复章节编号：'+[...duplicates].join('、')+'；已按文件顺序保留。');if(seen.size>1){const max=Math.max(...seen),min=Math.min(...seen),missing=[];if(max-min<10000)for(let i=min;i<=max;i++)if(!seen.has(i))missing.push(i);if(missing.length)warnings.push('原文章节编号不连续，缺少：'+missing.slice(0,20).join('、')+(missing.length>20?'等':'')+'；请核对来源文件。');}return warnings;}
function makeState(){return {version:1,books:[],voices:[],tasks:[],settings:{...DEFAULTS},read:{},usage:[]};}
const CN_DIGIT={'零':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
function cnAgeNum(desc){const s=String(desc||'');const m=s.match(/[零一二两三四五六七八九十百\d]+(?=(?:多|余|几)?\s*岁)/);if(!m)return null;const t=m[0];if(/^\d+$/.test(t))return parseInt(t,10);if(t.includes('百'))return null;if(t.includes('十')){const parts=t.split('十');const tens=parts[0]===''||parts[0]==='一'?1:CN_DIGIT[parts[0]];const ones=parts[1]?CN_DIGIT[parts[1]]:0;if(tens==null||ones==null)return null;return tens*10+ones;}if(t.length>2)return null;if(t.length===2)return CN_DIGIT[t[0]]??null;return CN_DIGIT[t]??null;}
function genderOf(desc){const s=String(desc||'');if(/女|姑娘|女孩|小姐|夫人|妻子|母亲|娘|姐|妹|公主|女王|婆|奶奶|师太|姑姑|嫂|\b(?:female|woman|girl)\b/i.test(s))return 'f';if(/男|汉|小伙|青年|少年|老者|父亲|丈夫|兄弟|哥哥|弟弟|王子|国王|爷爷|大爷|老爷|公子|少爷|和尚|道士|\b(?:male|man|boy)\b/i.test(s))return 'm';return null;}
function featSim(a,b){const clean=s=>String(s||'').replace(/[的了着呢吗是候很非常十分比较有点儿之与和及或、，。；：,.!？?「」『』“”''""（）()…—·\s]/g,'');const grams=s=>{const set=new Set();const t=clean(s);for(let i=0;i+1<t.length;i++)set.add(t.slice(i,i+2));return set;};const A=grams(a),Bs=grams(b);if(!A.size||!Bs.size)return 0;let inter=0;for(const g of A)if(Bs.has(g))inter++;return inter/Math.min(A.size,Bs.size);}
function presetDesc(id){if(id==='默认嗓音')return '随服务集群选择默认嗓音';if(['冰糖','茉莉'].includes(id))return '中文女声';if(['苏打','白桦'].includes(id))return '中文男声';return ['Mia','Chloe'].includes(id)?'英文女声':'英文男声';}
// Acoustic vocabulary is used only to derive a short display name.
const VOICE_WORDS=/奶声奶气|中气十足|颗粒感|气泡音|气声|鼻音|胸腔共鸣|磁性|开朗|清朗|清亮|清脆|清晰|低沉|温润|温柔|温和|亲切|自然|沉稳|稳重|沙哑|嘶哑|粗粝|粗犷|苍老|稚嫩|甜美|甜软|柔软|柔和|柔媚|娇柔|浑厚|醇厚|洪亮|有力|细腻|明亮|尖细|尖锐|轻柔|轻盈|轻细|干净|清冷|冷淡|冷峻|平静|活泼|俏皮|爽朗|慵懒|干练|利落|严肃|慈祥|随性|热情|清越|空灵|通透|圆润|饱满|清澈|轻快|舒缓|缓慢|急促|紧凑|流畅|连贯|铿锵|低哑|中低音|中高音|低音|中音|高音|轻声|重音|气息感|气息充足|咬字清楚|吐字清晰|尾音上扬|尾音下沉|语速适中|语速较快|语速较慢|普通话|粤语|四川话|东北话|上海话|台湾腔|北京口音|英语|英文|中文|美式口音|英式口音/;
const VOICE_TRAITS=new RegExp('(?:(?:略带|略显|稍带|稍显|有些|有点|轻微|明显|较为|略|稍|偏|微|很|少量|不太|不够|没有|不|无))?(?:'+VOICE_WORDS.source+')','g');
function cleanVoiceDescription(description){
 return String(description||'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim();
}
function shortVoiceName(description){
 const s=cleanVoiceDescription(description),age=cnAgeNum(s),stage=age!=null?(age<13?'儿童':age<18?'少年':age<40?'青年':age<60?'中年':'老年'):(s.match(/儿童|少年|青年|中年|老年/)?.[0]||''),gender=genderOf(s);
 const trait=((s.match(VOICE_TRAITS)||[]).find(x=>!['中文','英文','英语','普通话'].includes(x)&&!/^(不|无|没有)/.test(x))||'自然').match(VOICE_WORDS)?.[0]||'自然';
 return trait+stage+(gender==='f'?'女性':gender==='m'?'男性':'声音');
}
function normalizeBookMetadata(b){if(!b.sourceFile)b.sourceFile=b.name;if(b.author==null){const name=String(b.name||'');const match=name.match(/^(.+?)\s+by\s+(.{1,40})$/i)||name.match(/^(.+?)by([\u3400-\u9fff·]{1,40})$/i);if(match){b.name=match[1].trim();b.author=match[2].trim();}}return b;}
function normalizeVoice(v){v.description=cleanVoiceDescription(v.description);if(!v.name)v.name=shortVoiceName(v.description);return v;}
class Engine{
 constructor(io,state){this.io=io;this.features={...FEATURES,...io.features};this.state=state||makeState();for(const t of (this.state.tasks||[])){if(t.status==='running'){t.status='paused';t.phase='已暂停';t.pauseRequested=false;}}
 const savedSettings=this.state.settings||{};if(savedSettings.autoDeletePlayed==null&&typeof this.state.autoDeletePlayed==='boolean')savedSettings.autoDeletePlayed=this.state.autoDeletePlayed;delete this.state.autoDeletePlayed;this.state.settings={...DEFAULTS,...savedSettings};if(this.state.settings.keepRecentCount==null)this.state.settings.keepRecentCount=2;delete this.state.settings.keepRecentTwoChapters;if(!(this.state.settings.autoProduceCount>=1))this.state.settings.autoProduceCount=2;if(!(this.state.settings.speakerThreshold>=0&&this.state.settings.speakerThreshold<=1))this.state.settings.speakerThreshold=0.5;if(![1,2,3].includes(Number(this.state.settings.taskParallel)))this.state.settings.taskParallel=1;if(![1,2,3,4].includes(Number(this.state.settings.ttsParallel)))this.state.settings.ttsParallel=2;for(const t of this.state.tasks)if(t.prio==null)t.prio=0;this.running=false;this.listeners=[];this._ttsActive=0;this._ttsQueue=[];this._synthRunning=0;this._frontActive=new Set();this.saveChain=Promise.resolve();for(const b of this.state.books){normalizeBookMetadata(b);for(const r of b.characters){r.description=cleanVoiceDescription(r.description);if(r.candidate)normalizeVoice(r.candidate);r.aliases=safeAliases(r.aliases);if(r.aliasSpans==null)r.aliasSpans={};}if(!Array.isArray(b.mergeSuggestions))b.mergeSuggestions=[];}for(const v of this.state.voices)normalizeVoice(v);for(const t of this.state.tasks){if(t.status==='queued'&&isContentRejected(t.error||t.message)){t.status='failed';t.phase='内容审核未通过';}delete t._waiters;delete t.frontError;t.frontPreparing=false;t.synthQueued=false;t.synthActive=false;t.resumeRequested=false;if(t.status==='running'){t.status='paused';t.message='上次制作中断，点击继续可从已保存片段恢复';}}}
 onChange(fn){this.listeners.push(fn);}
 touch(chapter){if(!chapter||typeof chapter.id!=='string')return;if(chapter.unloaded)return;if(typeof chapter.text!=='string'||!Array.isArray(chapter.segments))return;if(!this.dirtyChapters)this.dirtyChapters=new Set();this.dirtyChapters.add(chapter);}
 async persist(){let write;if(this.io.saveSnapshot){if(!this.snapshotStarted){this.snapshotStarted=true;for(const b of this.state.books)for(const c of b.chapters)if(!c.unloaded)this.touch(c);}const dirty=[...(this.dirtyChapters||[])];const header=JSON.stringify({...this.state,books:this.state.books.map(b=>{const { _rawText, ...rest }=b;return {...rest,chapters:b.chapters.map(c=>({id:c.id,title:c.title,status:c.status,audio:c.audio||null,originalAudio:c.originalAudio||null,duration:c.duration||0,pacingVersion:c.pacingVersion||0,summary:c.summary||'',textLength:c.unloaded?(c.textLength||0):(typeof c.text==='string'?c.text.length:(c.textLength||0)),segmentCount:c.unloaded?(c.segmentCount||0):(Array.isArray(c.segments)?c.segments.length:(c.segmentCount||0)),listened:!!c.listened,audioCleared:!!c.audioCleared,audioStale:!!c.audioStale,sourceHeading:!!c.sourceHeading,lastCompletedAt:c.lastCompletedAt||0,lastPlayedPosition:c.lastPlayedPosition||0}))};})});const chapters=JSON.stringify(dirty);this.dirtyChapters=new Set();write=()=>this.io.saveSnapshot(header,chapters).catch(e=>{for(const c of dirty)this.touch(c);throw e;});}else{const snapshot=JSON.stringify({...this.state,books:this.state.books.map(b=>{const { _rawText, ...rest }=b;return rest;})});write=()=>this.io.saveState(snapshot);}this.saveChain=this.saveChain.catch(()=>{}).then(write);await this.saveChain;this.listeners.forEach(fn=>fn());}
 book(id){const b=this.state.books.find(b=>b.id===id);if(!b)throw Error('书籍不存在');return b;}
 chapter(bid,cid){const c=this.book(bid).chapters.find(c=>c.id===cid);if(!c)throw Error('章节不存在');return c;}
 async ensureChapter(bid,cid){const c=this.chapter(bid,cid);if(c.unloaded||typeof c.text!=='string'||!Array.isArray(c.segments)){if(!this.io.loadChapter)throw Error('章节读取接口不可用');if(!this.loadingChapters)this.loadingChapters=new Map();if(!this.loadingChapters.has(cid))this.loadingChapters.set(cid,this.io.loadChapter(cid).then(full=>{if(full.id!==cid)throw Error('章节索引不匹配');if(typeof full.text!=='string'||!Array.isArray(full.segments))throw Error('章节文本缺失，请重新导入书籍');Object.assign(c,full);delete c.unloaded;delete c.textLength;delete c.segmentCount;if(!c.audio&&c.segments.length&&c.segments.every(s=>s.skip||s.isAd||s.audio==='skip')){c.status='skipped';for(const t of this.state.tasks.filter(t=>t.bookId===bid&&t.chapterId===cid&&t.status==='done')){t.phase='全部跳过';t.skipped=c.segments.length;t.done=0;t.total=c.segments.length;t.message='本章 '+c.segments.length+' 段全部跳过，未生成音频。可检查原文并取消跳过。';}this.touch(c);}return c;}).finally(()=>this.loadingChapters.delete(cid)));return this.loadingChapters.get(cid);}return c;}
  async deleteBook(id){
  const idx=this.state.books.findIndex(b=>b.id===id);if(idx<0)throw Error('书籍不存在');
  const b=this.state.books[idx];const audioIds=[];
  for(const prompt of Object.values(b.playbackPrompts||{}))audioIds.push(prompt.file?.id,...(prompt.file?.rawAudioIds||[]));
  for(const t of this.state.tasks.filter(t=>t.bookId===id&&['running','queued'].includes(t.status)))await this.cancel(t.id);
  for(const c of b.chapters)if(c.unloaded&&c.segmentCount)await this.ensureChapter(id,c.id);
  for(const c of b.chapters){if(c.audio)audioIds.push(c.audio);if(c.originalAudio)audioIds.push(c.originalAudio);for(const s of (c.segments||[]))audioIds.push(...segmentAudioIds(s));}
  if(this.state.chapterUndo?.bookId===id){const c=this.state.chapterUndo.chapter;audioIds.push(c.audio,c.originalAudio,...(c.segments||[]).flatMap(segmentAudioIds));delete this.state.chapterUndo;}
  this.state.tasks=this.state.tasks.filter(t=>t.bookId!==id);
  this.state.books.splice(idx,1);
  if(audioIds.length&&this.io.deleteAudio){try{await this.deleteUnusedAudio(audioIds);}catch(ignored){}}
  await this.persist();
 }
 async deleteUnusedAudio(ids){
  if(!this.io.deleteAudio)return {count:0,freedBytes:0,freedMb:0};
  for(const b of this.state.books)for(const c of b.chapters)if(c.unloaded&&c.segmentCount)await this.ensureChapter(b.id,c.id);
  const keep=new Set(this.collectReferencedAudio()),unused=[...new Set(ids)].filter(id=>id&&id!=='skip'&&!keep.has(id));
  return unused.length?this.io.deleteAudio(unused):{count:0,freedBytes:0,freedMb:0};
 }
 async clearBookAudio(bid,options={onlyListened:false}){
  const b=this.book(bid);const audioIds=[];let clearedCount=0;
  if(!options.onlyListened){for(const prompt of Object.values(b.playbackPrompts||{}))audioIds.push(prompt.file?.id,...(prompt.file?.rawAudioIds||[]));delete b.playbackPrompts;}
  for(const c of b.chapters){
    if(options.onlyListened&&!c.listened)continue;
    if(c.unloaded){if(!c.audio&&!c.originalAudio&&!c.segmentCount)continue;await this.ensureChapter(bid,c.id);}
    if(c.originalAudio){audioIds.push(c.originalAudio);delete c.originalAudio;}if(c.audio){audioIds.push(c.audio);c.audio=null;c.audioCleared=true;clearedCount++;}
    {for(const s of (c.segments||[])){audioIds.push(...segmentAudioIds(s));s.audio=null;delete s.originalAudio;delete s.rawAudioIds;delete s.speechDraft;delete s.retryDraft;delete s.retryError;delete s.qualityIssues;delete s.qualityAttempts;delete s.qualityStatus;delete s.generationVersion;delete s.silenceProcessing;delete s.failReason;}if(c.status==='ready')c.status=(c.segments&&c.segments.length?'annotated':'raw');}
    this.touch(c);
  }
  let freedRes={count:0,freedBytes:0,freedMb:0};
  if(audioIds.length&&this.io.deleteAudio){
    try{
      const res=await this.deleteUnusedAudio(audioIds);
      if(typeof res==='object'&&res!==null)freedRes=res;
      else if(typeof res==='number')freedRes={count:res,freedBytes:0,freedMb:0};
    }catch(ignored){}
  }
  await this.persist();return {clearedCount,audioCount:audioIds.length,freedBytes:freedRes.freedBytes||0,freedMb:freedRes.freedMb||0};
 }
 async clearChapterAudio(bid,cid){
  this.invalidateReferences();
  const c=this.chapter(bid,cid);const audioIds=[];
  if(c.unloaded){try{await this.ensureChapter(bid,cid);}catch(e){return {count:0,freedBytes:0,freedMb:0};}}
  if(c.originalAudio){audioIds.push(c.originalAudio);delete c.originalAudio;}if(c.audio){audioIds.push(c.audio);c.audio=null;c.audioCleared=true;}
  for(const s of (c.segments||[])){audioIds.push(...segmentAudioIds(s));s.audio=null;delete s.originalAudio;delete s.rawAudioIds;delete s.speechDraft;delete s.retryDraft;delete s.retryError;delete s.qualityIssues;delete s.qualityAttempts;delete s.qualityStatus;delete s.generationVersion;delete s.silenceProcessing;delete s.failReason;}
  if(c.status==='ready')c.status=(c.segments&&c.segments.length?'annotated':'raw');
  this.touch(c);
  let freedRes={count:0,freedBytes:0,freedMb:0};
  if(audioIds.length&&this.io.deleteAudio){
    try{
      const res=await this.deleteUnusedAudio(audioIds);
      if(typeof res==='object'&&res!==null)freedRes=res;
      else if(typeof res==='number')freedRes={count:res,freedBytes:0,freedMb:0};
    }catch(ignored){}
  }
  await this.persist();
  return freedRes;
 }
 async resetChapters(bid,cids){
  const b=this.book(bid);const set=new Set(Array.isArray(cids)?cids:[cids]);const audioIds=[];let n=0;
  for(const c of b.chapters.filter(c=>set.has(c.id))){
    if(c.unloaded){try{await this.ensureChapter(bid,c.id);}catch(e){continue;}}
    if(c.originalAudio){audioIds.push(c.originalAudio);delete c.originalAudio;}
    if(c.audio)audioIds.push(c.audio);
    for(const s of (c.segments||[]))audioIds.push(...segmentAudioIds(s));
    c.segments=[];c.audio=null;c.duration=0;c.pacingVersion=0;c.status='raw';c.audioCleared=false;delete c.analysisDraft;n++;
    this.touch(c);
  }
  this.state.tasks=this.state.tasks.filter(t=>!(t.bookId===bid&&set.has(t.chapterId)));
  this._wakeTtsWaiters();
  if(audioIds.length&&this.io.deleteAudio){try{await this.deleteUnusedAudio(audioIds);}catch(ignored){}}
  await this.persist();return n;
 }
 collectReferencedAudio(){
  const set=new Set(this.pendingAudioRefs||[]);
  for(const file of Object.values(this.state.presetPreviews||{})){if(file?.id)set.add(file.id);for(const id of file?.rawAudioIds||[])set.add(id);}
  for(const b of this.state.books){
   for(const prompt of Object.values(b.playbackPrompts||{})){if(prompt.file?.id)set.add(prompt.file.id);for(const id of prompt.file?.rawAudioIds||[])set.add(id);}
   for(const c of b.chapters){if(c.audio)set.add(c.audio);if(c.originalAudio)set.add(c.originalAudio);for(const s of c.segments||[])for(const id of segmentAudioIds(s))set.add(id);}
   for(const role of b.characters||[])if(role.candidate?.sample)set.add(role.candidate.sample);
  }
  for(const v of this.state.voices)if(v.sample)set.add(v.sample);
  return [...set];
 }
 async garbageCollectAudio(){
  this.invalidateReferences();
  if(this._ttsActive||this.roleDesignJobs?.size||this.presetPreviewJobs?.size)throw Error("正在生成音频，请在制作暂停后清理资源");
  for(const b of this.state.books)for(const c of b.chapters)if(c.unloaded&&c.segmentCount)await this.ensureChapter(b.id,c.id);
  const keepIds=this.collectReferencedAudio();
  if(this.io.cleanupAudio)return await this.io.cleanupAudio(keepIds);
  return {deletedCount:0,freedBytes:0,freedMb:0};
 }
 async performAutoCleanup(bid,currentCid,completed=false){
  if(!this.state.settings.autoDeletePlayed)return {clearedCount:0,freedBytes:0,freedMb:0};
  const b=this.book(bid),keepN=Math.max(0,Math.min(3,Number(this.state.settings.keepRecentCount)||0));
  const listened=b.chapters.filter(c=>c.listened).sort((a,d)=>(d.lastCompletedAt||b.chapters.indexOf(d))-(a.lastCompletedAt||b.chapters.indexOf(a)));
  const keep=new Set(listened.slice(0,keepN).map(c=>c.id));const toClean=b.chapters.filter(c=>c.audio&&c.listened&&!keep.has(c.id)&&(completed||c.id!==currentCid));
  let freedBytes=0;for(const c of toClean){const result=await this.clearChapterAudio(bid,c.id);freedBytes+=result?.freedBytes||0;}
  return {clearedCount:toClean.length,freedBytes,freedMb:Math.round(freedBytes/1048576*10)/10,clearedTitles:toClean.map(c=>c.title)};
 }
 async updatePlaybackProgress(bid,cid,posMs,durMs,completed=false){
  const b=this.state.books.find(x=>x.id===bid);if(!b)return {listened:false};
  const c=b.chapters.find(x=>x.id===cid);if(!c)return {listened:false};
  if(c.unloaded){try{await this.ensureChapter(bid,cid);}catch(e){}}
  b.lastPlayedChapterId=cid;b.lastPlayedPosition=posMs;b.lastPlayedAt=Date.now();
  this.state.lastPlayback={bookId:bid,chapterId:cid,position:posMs,at:Date.now()};
  c.lastPlayedPosition=posMs;
  let newlyFinished=false;
  let audioCleared=false;
  let freedBytes=0,freedMb=0,clearedCount=0;
  if(!c.listened&&(completed||(durMs>0&&(posMs>=durMs*0.98||posMs>=durMs-3000)))){
    c.listened=true;newlyFinished=true;
    c.lastCompletedAt=Date.now();
  }
  if(completed)c.lastCompletedAt=Date.now();
  if(completed&&this.state.settings.autoDeletePlayed){const result=await this.performAutoCleanup(bid,cid,true);clearedCount=result.clearedCount;freedBytes=result.freedBytes;freedMb=result.freedMb;audioCleared=!!c.audioCleared;}
  this.touch(c);
  const __now=Date.now();
  if(newlyFinished||completed||!this.__lastProgPersist||__now-this.__lastProgPersist>8000){this.__lastProgPersist=__now;await this.persist();}
  return {listened:!!c.listened,newlyFinished,audioCleared:!!c.audioCleared,freedBytes,freedMb,clearedCount};
 }
 async clearAllListened(){
  let totalCleared=0,totalFreedBytes=0;
  for(const b of this.state.books){
    const res=await this.clearBookAudio(b.id,{onlyListened:true});
    totalCleared+=res.clearedCount||0;
    totalFreedBytes+=res.freedBytes||0;
  }
  const freedMb=Math.round(totalFreedBytes/1024/1024*10)/10;
  return {clearedCount:totalCleared,freedBytes:totalFreedBytes,freedMb};
 }
 async clearExpiredAudio(days=7){
  const cutoff=Date.now()-(days*24*3600*1000);
  let totalCleared=0,totalFreedBytes=0;
  for(const b of this.state.books){
    for(const c of b.chapters){
      if(!c.audio||c.listened)continue;
      const t=c.producedAt||c.lastModified||b.created||0;
      if(t<cutoff){
        const res=await this.clearChapterAudio(b.id,c.id);
        totalCleared++;
        totalFreedBytes+=res?.freedBytes||0;
      }
    }
  }
  const freedMb=Math.round(totalFreedBytes/1024/1024*10)/10;
  return {clearedCount:totalCleared,freedBytes:totalFreedBytes,freedMb};
 }
 async keepOnlyCurrentBook(currentBookId){
  let curId=currentBookId;
  if(!curId){
    const sorted=this.state.books.filter(b=>b.lastPlayedAt>0).sort((a,b)=>(b.lastPlayedAt||0)-(a.lastPlayedAt||0));
    curId=sorted[0]?.id;
  }
  if(!curId||!this.state.books.some(b=>b.id===curId))throw Error('没有当前播放书籍，请先播放一本书');
  let totalCleared=0,totalFreedBytes=0;
  for(const b of this.state.books){
    if(b.id===curId)continue;
    const res=await this.clearBookAudio(b.id);
    totalCleared+=res.clearedCount||0;
    totalFreedBytes+=res.freedBytes||0;
  }
  const freedMb=Math.round(totalFreedBytes/1024/1024*10)/10;
  return {currentBookId:curId,clearedCount:totalCleared,freedBytes:totalFreedBytes,freedMb};
 }
 async archiveBook(bid){
  const b=this.state.books.find(x=>x.id===bid);
  if(!b)return {freedBytes:0,clearedCount:0,archived:false};
  b.archived=!b.archived;
  let freed={freedBytes:0,clearedCount:0};
  if(b.archived){
    freed=await this.clearBookAudio(bid);
  }
  await this.persist();
  return {archived:b.archived,...freed};
 }
 async batchEnqueue(bid,startIdx,endIdx){
  const b=this.state.books.find(x=>x.id===bid);
  if(!b)return [];
  const s=Math.max(0,Math.min(startIdx,endIdx));
  const e=Math.min(b.chapters.length-1,Math.max(startIdx,endIdx));
  const added=[];
  for(let i=s;i<=e;i++){
    const c=b.chapters[i];
    if(c.audio)continue;
    if(!this.state.tasks.some(t=>t.bookId===bid&&t.chapterId===c.id)){
      this.state.tasks.push({
        bookId:bid,
        chapterId:c.id,
        status:'queued',
        prio:0,
        retries:0,
        createdAt:Date.now()
      });
      added.push(c);
    }
  }
  await this.persist();
  this.run();
  return added;
 }
 async addBook(name,text,splitOpts){const r=splitChapters(text,splitOpts);const b={id:uid(),name:name.replace(/\.(txt|epub)$/i,''),sourceFile:name,chapters:r.chapters,characters:[{name:'旁白',description:'声音清晰自然',aliases:[],voice:'preset:白桦'}],created:Date.now(),policy:null,mergeSuggestions:[],splitReport:r.report,splitRule:(splitOpts&&splitOpts.ruleId)||'auto',splitCustom:(splitOpts&&splitOpts.customPattern)||'',_rawText:String(text)};normalizeBookMetadata(b);b.importWarnings=chapterWarnings(b.chapters);this.state.books.push(b);for(const c of b.chapters)this.touch(c);await this.persist();return b;}
  async resplitBook(bid,splitOpts){const b=this.book(bid);const made=b.chapters.some(c=>(c.segments||[]).length||c.audio);if(made)throw Error('已有标注或音频的书不能重切，请删书重导');const r=splitChapters(b._rawText||b.chapters.map(c=>c.title+'\n'+(c.text||'')).join('\n'),splitOpts);b.chapters=r.chapters;b.splitReport=r.report;b.splitRule=(splitOpts&&splitOpts.ruleId)||'auto';b.splitCustom=(splitOpts&&splitOpts.customPattern)||'';b.characters=b.characters.filter(x=>x.name==='旁白');b.importWarnings=chapterWarnings(b.chapters);for(const c of b.chapters)this.touch(c);await this.persist();return b;}
 async importVoice(file){if(!['wav','mp3'].includes(file.format))throw Error('仅支持 WAV / MP3 参考样本');if(Math.ceil(file.size/3)*4+32>10000000)throw Error('样本编码后超过 10 MB，请先压缩或截取');const d=cleanVoiceDescription(file.description||file.name.replace(/\.[^.]+$/,''));const v={id:uid(),name:shortVoiceName(d),description:d,sample:file.id,format:file.format,source:'import',enabled:true,tested:false};this.state.voices.push(v);await this.persist();return v;}
 taskPriority(t){const playing=this.state.lastPlayback;return playing?.bookId===t.bookId&&playing?.chapterId===t.chapterId?80:t.source==='auto'?20:40;}
 modelLimit(model){const s=this.state.modelLimits?.[model];if(s?.limited)return (this.io.now?.()??Date.now())<s.until?0:1;return model==='mimo-v2.5-tts-voiceclone'?this.features.cloneConcurrency:this.ttsLimit();}
 requestScheduler(){if(!this._requestScheduler)this._requestScheduler=new Scheduler(()=>this.ttsLimit(),model=>this.modelLimit(model));return this._requestScheduler;}
 recordMetric(metric){try{this.io.requestMetric?.(metric);}catch(_){} }
 async referenceAudio(id){
  this._sampleCache=this._sampleCache||new Map();this._sampleJobs=this._sampleJobs||new Map();
  if(this._sampleCache.has(id)){const hit=this._sampleCache.get(id);this._sampleCache.delete(id);this._sampleCache.set(id,hit);this.recordMetric({provider:'sample',cacheHit:true,id});return hit;}
  if(this._sampleJobs.has(id)){this.recordMetric({provider:'sample',cacheShared:true,id});return this._sampleJobs.get(id);}this.recordMetric({provider:'sample',cacheHit:false,id});
  const generation=this._sampleGeneration||0;
  const job=this.io.readAudio(id).then(sample=>{const bytes=(sample.base64?.length||0)*2;if(generation===(this._sampleGeneration||0)&&bytes<=12*1024*1024){this._sampleCache.set(id,sample);while(this._sampleCache.size>2||[...this._sampleCache.values()].reduce((n,v)=>n+v.base64.length*2,0)>12*1024*1024)this._sampleCache.delete(this._sampleCache.keys().next().value);}return sample;}).finally(()=>{if(this._sampleJobs.get(id)===job)this._sampleJobs.delete(id);});this._sampleJobs.set(id,job);return job;
 }
 invalidateReferences(){this._sampleGeneration=(this._sampleGeneration||0)+1;this._sampleCache?.clear();this._sampleJobs?.clear();}
 async request(provider,body,shouldPause,options={}){
  if(!['tts','llm'].includes(provider))throw Error('无效模型类型');
  return this.performRequest(provider,body,{...options,shouldPause});
 }
 async performRequest(provider,body,options={}){
  const settings={...this.state.settings};let last;
  for(let n=0;n<=Number(settings.retries);n++){
   let slot;const started=Date.now();
   try{
    if(options.shouldPause?.())throw Error('任务已暂停');
    if(provider==='tts')slot=await this.requestScheduler().acquire(body.model,options.priority??100,options.shouldPause);
    const r=await this.io.request(provider,body,settings);
    const failure=r.error||(r.base_resp&&Number(r.base_resp.status_code)!==0?{message:r.base_resp.status_msg,code:r.base_resp.status_code}:null);
    if(failure){const message=failure.message||'服务商拒绝请求',e=new ApiError(provider==='tts'?friendlyTtsError(message):message,failure.code,false);e.code=failure.code||'';e.detail=message;throw e;}
    if(r.usage)this.state.usage.push({provider,model:body.model,at:Date.now(),...r.usage});this.state.usage=this.state.usage.slice(-100);
    const limited=this.state.modelLimits?.[body.model];if(provider==='tts'&&limited?.limited&&(this.io.now?.()??Date.now())>=limited.until){limited.successes++;if(limited.successes>=10){limited.limited=false;await this.persist();}}
    this.recordMetric({provider,model:body.model,attempt:n+1,queueMs:slot?.queueMs||0,elapsedMs:Date.now()-started,ok:true,usage:r.usage});return r;
   }catch(e){
    e.provider=provider;if(isContentRejected(e))e.retryable=false;last=e;
    const delay=Number.isFinite(e.retryAfterMs)&&e.retryAfterMs>=0?e.retryAfterMs:Math.min(60000,(e.status===429?10000:1000)*2**n);
    if(provider==='tts'&&e.status===429){this.state.modelLimits=this.state.modelLimits||{};this.state.modelLimits[body.model]={limited:true,until:(this.io.now?.()??Date.now())+delay,successes:0};await this.persist();}else if(provider==='tts'&&this.state.modelLimits?.[body.model]?.limited)this.state.modelLimits[body.model].successes=0;
    this.recordMetric({provider,model:body.model,attempt:n+1,queueMs:slot?.queueMs||0,elapsedMs:Date.now()-started,ok:false,status:e.status||0});
    if(!e.retryable||n===Number(settings.retries)||options.shouldPause?.())break;
    slot?.release();slot=null;
    await (this.io.sleep?this.io.sleep(delay):new Promise(r=>setTimeout(r,delay)));
   }finally{slot?.release();}
  }throw last;
 }
 async llm(prompt,options={}){
  const st=this.state.settings,isMiniMax=/MiniMax|M3/i.test(st.llmModel)||String(st.llmBase||'').includes('minimax');
  const isMiMo=/^mimo-v(?:2\.6-(?:flash|pro|pro-ultraspeed)|2\.5(?:-pro)?)$/.test(st.llmModel||'');
  const budget=Math.max(256,Math.min(12000,Number(options.maxTokens)||12000));
  let r,text,finish;
  if(st.llmProtocol==='anthropic'){
   r=await this.request('llm',{model:st.llmModel,max_tokens:budget,system:ModelPrompts.system,messages:[{role:'user',content:prompt}]});
   text=(r.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('');finish=r.stop_reason;
  }else{
   const body={model:st.llmModel,temperature:0.3,messages:[{role:'system',content:ModelPrompts.system},{role:'user',content:prompt}]};
   body[isMiMo?'max_completion_tokens':'max_tokens']=budget;
   if(isMiniMax||isMiMo)body.thinking={type:'disabled'};
   if(isMiMo&&options.json!==false)body.response_format={type:'json_object'};
   r=await this.request('llm',body);text=r.choices?.[0]?.message?.content;finish=r.choices?.[0]?.finish_reason;
  }
  if(finish==='length'||finish==='max_tokens')throw new LlmOutputError('语言模型输出被截断，请减少批次','truncated');
  if(['content_filter','refusal'].includes(finish)){const e=new ApiError('内容审核未通过',0,false);e.code='1027';throw e;}
  try{return parseJson(text);}catch(e){throw new LlmOutputError(e.message);}
 }
 async saveSpeechAudio(base64,text,options={}){
  options.budget=options.budget||{used:0,rawAudioIds:[]};
  if(options.silenceProcessingVersion===SILENCE_PROCESSING_VERSION){
   if(!this.io.processSpeechAudio||!this.io.saveRawAudio)throw Error('当前版本缺少音频处理能力，请更新应用');
   const raw=options.rawFile||await this.io.saveRawAudio(base64,'wav');
   const suspectedRepeat=options.pendingRaw?.suspectedRepeat??(!!base64&&!!AudioQuality.repetitionCandidate(base64,text).suspected);
   const pendingRaw={file:raw,text,finishReason:options.finishReason||'stop',playable:raw.playable!==false,silenceProcessingVersion:SILENCE_PROCESSING_VERSION,suspectedRepeat};
   options.budget.rawAudioIds=[...new Set([...options.budget.rawAudioIds,raw.id])];
   await options.onQuality?.({rawAudioIds:[...options.budget.rawAudioIds],qualityAttempts:options.budget.used,pendingRaw,qualityIssues:[],qualityStatus:'checking',generationVersion:GENERATION_VERSION});
   if(options.shouldPause?.())throw Error('任务已暂停');
   const processed=await this.io.processSpeechAudio(raw.id);
   const analysis=AudioQuality.analyzeProcessedSpeech(processed,text,options.finishReason,suspectedRepeat);
   pendingRaw.processedFile=processed;pendingRaw.playable=analysis.supported;
   const silenceProcessing={version:SILENCE_PROCESSING_VERSION,originalDuration:processed.originalDuration,duration:processed.duration,removedMs:processed.removedMs||0,trimRanges:processed.trimRanges||[]};
   await options.onQuality?.({pendingRaw,qualityIssues:analysis.issues,silenceProcessing});
   if(options.shouldPause?.())throw Error('任务已暂停');
   if(analysis.hardIssues.length)throw new QualityError('合成异常：'+analysis.hardIssues.join('、'),true);
   return {...processed,silenceProcessing,rawAudioIds:[...options.budget.rawAudioIds],generationVersion:GENERATION_VERSION,qualityStatus:processed.corrected?'corrected':analysis.issues.length?'passed_with_warnings':'passed',qualityIssues:analysis.issues,qualityAttempts:options.budget.used,speechChecked:true,repetitionRemoved:false};
  }
  const analysis=AudioQuality.analyzeSpeech(base64,text,options.finishReason);
  // The raw writer validates separately and archives invalid bytes as non-playable diagnostics.
  const raw=options.rawFile||(this.io.saveRawAudio?await this.io.saveRawAudio(base64,'wav'):analysis.supported?await this.io.saveAudio(base64,'wav'):null);
  const pendingRaw=raw?{file:raw,text,finishReason:options.finishReason||'stop',playable:analysis.supported}:null;
  if(raw)options.budget.rawAudioIds=[...new Set([...options.budget.rawAudioIds,raw.id])];
  await options.onQuality?.({rawAudioIds:[...options.budget.rawAudioIds],qualityAttempts:options.budget.used,pendingRaw,qualityIssues:analysis.issues,qualityStatus:'checking',generationVersion:GENERATION_VERSION});
  if(options.shouldPause?.())throw Error('任务已暂停');
  if(analysis.hardIssues.length)throw new QualityError('合成异常：'+analysis.hardIssues.join('、'),true);
  return {...raw,rawAudioIds:[...options.budget.rawAudioIds],generationVersion:GENERATION_VERSION,qualityStatus:analysis.issues.length?'passed_with_warnings':'passed',qualityIssues:analysis.issues,qualityAttempts:options.budget.used,speechChecked:true,repetitionRemoved:false};
 }
 // Legacy finished audio is immutable during upgrade, playback and task resume.
 async repairChapterAudio(){return 0;}
 segmentBusy(bid,cid,id){return this._activeSegments?.has(JSON.stringify([bid,cid,id]))||false;}
 speechDirection(voice,style='',description='',prompt,context={}){
  if(typeof prompt==='string'&&prompt.trim())return prompt;
  if(this.features.direction&&context.directionVersion===DIRECTION_VERSION&&!directionIssue(context))return [context.scene.trim()?'场景：'+context.scene.trim():'','指导：'+context.delivery.trim()].filter(Boolean).join('\n');
  return buildSpeechDirection(style);
 }
 speechIdentity(s,role){return {scene:s.scene||'',delivery:s.delivery||'',directionVersion:s.directionVersion||0,promptVersion:PROMPT_VERSION,effectiveDirection:this.speechDirection(role.voice,s.emotion,role.description,s.ttsPrompt,s)};}
 async regenerateSegment(bid,cid,id,options={}){
  await this.ensureChapter(bid,cid);
  const b=this.book(bid),c=this.chapter(bid,cid),s=c.segments.find(s=>String(s.id)===String(id));
  if(!s||s.skip||s.isAd||s.audio==='skip')throw Error('该句不能合成');
  const role=b.characters.find(r=>r.name===s.speaker);
  if(!role?.voice)throw Error('请先确认当前角色的音色');
  const lock=JSON.stringify([bid,cid,s.id]);this._activeSegments=this._activeSegments||new Set();
  if(this._activeSegments.has(lock))return false;
  if(Object.prototype.hasOwnProperty.call(options,'prompt')){
   if(options.prompt!==null&&(typeof options.prompt!=='string'||!options.prompt.trim()))throw Error('请填写合成提示词，或恢复默认提示词');
   if(options.prompt===null)delete s.ttsPrompt;else s.ttsPrompt=options.prompt;
  }
  this._activeSegments.add(lock);
  const source={text:s.text,speaker:s.speaker,emotion:s.emotion,...this.speechIdentity(s,role),voice:role.voice,description:role.description,prompt:s.ttsPrompt,audio:s.audio,skip:s.skip,isAd:s.isAd};
  const unchanged=()=>this.state.books.includes(b)&&b.chapters.includes(c)&&c.segments.includes(s)&&s.audio===source.audio&&s.skip===source.skip&&s.isAd===source.isAd&&s.text===source.text&&s.speaker===source.speaker&&s.emotion===source.emotion&&JSON.stringify(this.speechIdentity(s,role))===JSON.stringify(Object.fromEntries(Object.entries(source).filter(([k])=>['scene','delivery','directionVersion','promptVersion','effectiveDirection'].includes(k))))&&s.ttsPrompt===source.prompt&&role.voice===source.voice&&role.description===source.description&&b.characters.includes(role);
  const oldRefs=segmentAudioIds(s),oldDraft=s.speechDraft;
  let acquired=false;
  try{
   acquired=await this._acquireTtsSlot(()=>!unchanged(),100);if(!acquired)return false;
   s.retryDraft={key:JSON.stringify(source),manualRetry:true,qualityAttempts:s.qualityAttempts??oldDraft?.qualityAttempts??0,rawAudioIds:oldRefs,generationVersion:GENERATION_VERSION};
   this.touch(c);await this.persist();
   const update=async fields=>{if(unchanged()){s.retryDraft={...s.retryDraft,...fields};this.touch(c);await this.persist();}};
   const file=await this.synthesize(source.text,source.voice,source.emotion,{...s.retryDraft,scene:source.scene,delivery:source.delivery,directionVersion:source.directionVersion,prompt:source.prompt,voiceDescription:source.description,shouldPause:()=>!unchanged(),onQuality:update,onPart:files=>update({files:[...files],pendingRaw:null})});
   if(!unchanged())return false;
   const version=JSON.stringify(c.segments),audible=c.segments.filter(x=>!x.skip&&!x.isAd&&x.audio!=='skip');
   let merged=null;
   if(audible.every(x=>x===s||x.audio)){
    merged=await this.io.mergeAudio(audible.map(x=>x===s?file.id:x.audio),pausesFor(audible.map(x=>x.text)));
    if(!unchanged()||JSON.stringify(c.segments)!==version){s.retryError='章节在合并期间发生修改，请重新合成此句';return false;}
   }
   s.audio=file.id;s.durMs=Math.round(file.duration*1000);s.generationVersion=GENERATION_VERSION;
   s.rawAudioIds=[...new Set([...oldRefs,...(file.rawAudioIds||[])])];s.qualityStatus=file.qualityStatus;s.qualityIssues=file.qualityIssues||[];s.qualityAttempts=file.qualityAttempts||0;s.pacingVersion=1;
   if(file.silenceProcessing)s.silenceProcessing=file.silenceProcessing;else delete s.silenceProcessing;
   s.speechCheckedAudio=file.id;s.speechCheckedText=source.text;
   if(typeof file.speechPrompt==='string')s.lastSpeechRequest={promptVersion:PROMPT_VERSION,prompt:file.speechPrompt,text:source.text,voice:source.voice,audio:file.id};
   delete s.speechDraft;delete s.retryDraft;delete s.retryError;delete s.failReason;
   c.audio=merged?.id||null;if(merged){c.duration=merged.duration;c.status='ready';c.pacingVersion=1;c.audioStale=false;}
   else if(!this.state.tasks.some(t=>t.bookId===bid&&t.chapterId===cid&&t.status==='running'))c.status='waiting';
   for(const t of this.state.tasks.filter(t=>t.bookId===bid&&t.chapterId===cid&&!['cancelled'].includes(t.status))){t.done=c.segments.filter(x=>x.audio).length;if(merged&&!t.synthActive&&!this._frontActive.has(t)){t.status='done';t.phase='完成';t.message='';}}
   return true;
  }catch(e){
   if(unchanged()){
    s.retryError=e.message||'重新合成失败';
    if(!s.audio){s.qualityStatus='pending';s.failReason=s.retryError;s.speechDraft={...s.retryDraft,qualityStatus:'pending',qualityFailure:'local'};delete s.retryDraft;}
   }
   if(e.message!=='任务已暂停')throw e;
   return false;
  }finally{
   if(acquired)this._releaseTtsSlot();this._activeSegments.delete(lock);this.touch(c);await this.persist();
  }
 }
 async synthesizePart(text,model,ref,style,options){
  let pending=options.pendingRaw?.text===text?options.pendingRaw:null;
  while(true){
   if(options.shouldPause?.())throw Error('任务已暂停');
   let data,finishReason,silenceProcessingVersion;
   if(pending){
    silenceProcessingVersion=pending.silenceProcessingVersion;
    if(silenceProcessingVersion!==SILENCE_PROCESSING_VERSION)data=(await this.io.readAudio(pending.file.id)).base64;
    finishReason=pending.finishReason;
   }
   else{
    const messages=[...(options.speechPrompt?[{role:'user',content:options.speechPrompt}]:[]),{role:'assistant',content:text}];
    let r;try{r=await this.request('tts',{model,messages,audio:{format:'wav',voice:ref}},options.shouldPause,{priority:options.priority});}catch(e){if(isTextLengthError(e))e.ttsTextLength=true;throw e;}
    data=r.choices?.[0]?.message?.audio?.data;finishReason=r.choices?.[0]?.finish_reason;
    data=typeof data==='string'?data:'';
    silenceProcessingVersion=this.io.processSpeechAudio?SILENCE_PROCESSING_VERSION:undefined;
   }
   try{return {...await this.saveSpeechAudio(data,text,{...options,pendingRaw:pending,rawFile:pending?.file,finishReason,silenceProcessingVersion}),speechPrompt:options.speechPrompt};}
   catch(e){
    if(!e.qualityPending||!e.retryQuality||options.manualRetry||this.state.settings.qualityAutoRetry===false||this.state.settings.qualityConfirmRetry===true||options.budget.used>=1)throw e;
    options.budget.used++;pending=null;
    await options.onQuality?.({rawAudioIds:[...options.budget.rawAudioIds],qualityAttempts:options.budget.used,pendingRaw:null,silenceProcessing:null,qualityStatus:'checking'});
   }
  }
 }
 presetPreviewKey(name){return 'v1:'+name;}
 async presetPreview(name){
  if(!PRESETS.includes(name))throw Error('无效 MiMo 预设');
  if(!this.presetPreviewJobs)this.presetPreviewJobs=new Map();
  const key=this.presetPreviewKey(name);
  if(this.presetPreviewJobs.has(key))return this.presetPreviewJobs.get(key);
  const job=Promise.resolve().then(async()=>{
   if(!this.state.presetPreviews)this.state.presetPreviews={};
   const cached=this.state.presetPreviews[key];
   if(cached?.id){
    const durations=this.io.audioDurations?await this.io.audioDurations([cached.id]):null;
    if(!durations||Number(durations[cached.id])>0)return cached;
    // A removed/corrupt local file must not leave this preset permanently broken.
    delete this.state.presetPreviews[key];await this.persist();
   }
   const file=await this.synthesize('山里的风停了，故事才刚刚开始。','preset:'+name);
   this.state.presetPreviews[key]=file;await this.persist();return file;
  }).finally(()=>this.presetPreviewJobs.delete(key));
  this.presetPreviewJobs.set(key,job);return job;
 }
 async synthesize(text,voice,style='',options={}){
  if(!text.trim())throw Error('朗读文本为空');
  if(isPunctOnly(text)){
   if(!this.io.silence)throw Error('当前版本不支持静音合成，请更新应用');
   return this.io.silence(punctSilenceMs(text),options.silenceRef||null);
  }
  let model='mimo-v2.5-tts',ref='白桦',description=options.voiceDescription||'';
  if(voice.startsWith('preset:')){
   ref=voice.slice(7);if(!PRESETS.includes(ref))throw Error('无效 MiMo 预设');if(ref==='默认嗓音')ref='mimo_default';
  }else{
   const v=this.state.voices.find(v=>v.id===voice);if(!v)throw Error('角色音色未就绪');
   const sample=await this.referenceAudio(v.sample);if(!sample.base64||sample.base64.length+32>10000000)throw Error('参考样本缺失或超过大小限制');
   model='mimo-v2.5-tts-voiceclone';ref='data:audio/'+(v.format==='mp3'?'mpeg':'wav')+';base64,'+sample.base64;description=description||v.description;
  }
  const budget={used:options.qualityAttempts||0,rawAudioIds:[...(options.rawAudioIds||[])]};
  const partOptions={...options,budget,voiceDescription:description,speechPrompt:this.speechDirection(voice,style,description,options.prompt,options)};
  if(!options.forceSplit&&text.length<=600&&!options.splitDraft){
   try{return await this.synthesizePart(text,model,ref,style,partOptions);}
   catch(e){if(options.shouldPause?.()||!e.ttsTextLength)throw e;}
  }
  const parts=options.legacySplit?speechParts(text):boundedSpeechParts(text),files=[...(options.files||[])];
  await options.onQuality?.({splitDraft:true});
  for(let i=files.length;i<parts.length;i++){
   const file=await this.synthesizePart(parts[i],model,ref,style,partOptions);files.push(file);
   partOptions.pendingRaw=null;
   await options.onPart?.(files);
  }
  if(options.shouldPause?.())throw Error('任务已暂停');
  if(files.length===1)return files[0];
  const merged=await this.io.mergeAudio(files.map(f=>f.id),pausesFor(parts));
  const processed=files.filter(f=>f.silenceProcessing);
  const silenceProcessing=processed.length?{version:SILENCE_PROCESSING_VERSION,originalDuration:merged.duration+processed.reduce((n,f)=>n+(f.silenceProcessing.removedMs||0)/1000,0),duration:merged.duration,removedMs:processed.reduce((n,f)=>n+(f.silenceProcessing.removedMs||0),0),parts:files.map(f=>({id:f.id,...f.silenceProcessing}))}:undefined;
  return {...merged,silenceProcessing,speechPrompt:partOptions.speechPrompt,rawAudioIds:[...new Set([...budget.rawAudioIds,...files.flatMap(f=>f.rawAudioIds||[])])],generationVersion:GENERATION_VERSION,qualityStatus:files.some(f=>f.qualityStatus==='corrected')?'corrected':files.some(f=>f.qualityStatus==='passed_with_warnings')?'passed_with_warnings':'passed',qualityIssues:[...new Set(files.flatMap(f=>f.qualityIssues||[]))],qualityAttempts:budget.used,speechChecked:files.every(f=>f.speechChecked)};
 }
 async design(description,text,options={}){
  description=cleanVoiceDescription(description);if(!description)throw Error('请填写音色描述');
  const custom=typeof text==='string'&&!!text.trim(),messages=[{role:'user',content:description}];
  if(custom)messages.push({role:'assistant',content:text});
  const r=await this.request('tts',{model:'mimo-v2.5-tts-voicedesign',messages,audio:{format:'wav',optimize_text_preview:!custom}},options.shouldPause,{priority:options.priority});
  const message=r.choices?.[0]?.message,data=message?.audio?.data;if(!data)throw Error('音色设计没有返回样本');
  if(data.length+32>10000000)throw Error('设计样本编码后超过 10 MB，请缩短试听文本后重新设计');
  const file=await this.io.saveAudio(data,'wav');
  return {id:uid(),name:shortVoiceName(description),description,sample:file.id,format:'wav',source:'design',enabled:true,tested:false,previewText:custom?text:(message.final_text_preview||''),previewCustomized:custom,generationVersion:GENERATION_VERSION};
 }
 async saveVoice(v){this.invalidateReferences();if(!v.sample)throw Error('请先生成样本');normalizeVoice(v);if(!this.state.voices.some(x=>x.id===v.id))this.state.voices.push(v);await this.persist();return v;}
 async deleteVoice(id){this.invalidateReferences();const i=this.state.voices.findIndex(x=>x.id===id);if(i<0)throw Error('音色不存在');const removed=this.state.voices.splice(i,1)[0];for(const b of this.state.books){for(const ch of b.characters){if(ch.voice===id)ch.voice=null;if(ch.candidate?.id===id)ch.candidate=null;if(ch.suggestedVoice===id)ch.suggestedVoice=null;}}await this.persist();return removed;}
 annotationFallback(line,reason){const auto=this.state.settings.mode==='auto',s={...line,annotationOriginal:line.annotationOriginal||line.modelAnnotation||{speaker:line.speaker||'未知角色',confidence:Number(line.confidence)||0,emotion:line.emotion||''},speaker:'旁白',emotion:'自然朗读',confidence:Number(line.confidence)||0,isAd:false,skip:false,audio:null,annotationStatus:auto?'fallback':'failed'};delete s.annotationError;clearDirection(s);s[auto?'annotationFallbackReason':'annotationError']=String(reason||'未能识别说话人');return s;}
 fallbackUncertain(c){
  if(this.state.settings.mode!=='auto')return false;let changed=false;const b=this.bookForChapter(c);
  for(const s of c.segments||[]){if(s.audio||s.skip||s.isAd||s.speaker==='广告'||['pending','fallback'].includes(s.annotationStatus))continue;
   if(s.annotationStatus==='failed'||s.confidence<this.spkThr()||!b?.characters.some(r=>r.name===s.speaker)){
    const fallback=this.annotationFallback(s,s.annotationError||'说话人无法确定');clearDirection(s);Object.assign(s,fallback);changed=true;
   }
  }return changed;
 }
 bookForChapter(c){return this.state.books.find(b=>b.chapters.includes(c));}
 async repairDirections(c,input,job,shouldPause){
  const batch=job.targets.filter(target=>{const s=c.segments.find(s=>s.id===target.id);return s&&s.directionStatus==='pending'&&!s.audio&&!s.skip&&!s.isAd&&s.text===target.text&&s.speaker===target.speaker&&s.emotion===target.emotion;});
  if(!batch.length)return true;
  let result,error='';
  try{
   try{result=await this.llm(ModelPrompts.direction({batch,context:job.targetOnly?batch:nearbyContext(input,batch.map(s=>s.id))}),{task:'direction',maxTokens:4000});}
   catch(e){
    if(!isContentRejected(e)||job.targetOnly)throw e;
    if(shouldPause?.())return false;
    job.targetOnly=true;this.touch(c);await this.persist();
    result=await this.llm(ModelPrompts.direction({batch,context:batch}),{task:'direction',maxTokens:4000});
   }
  }catch(e){
   if(shouldPause?.())return false;
   if(!['structure','truncated'].includes(e.kind)&&!isContentRejected(e)){e.stage='补写导演指导';throw e;}
   error=e.message||'导演指导生成失败';
  }
  if(shouldPause?.())return false;
  const rows=Array.isArray(result?.lines)?result.lines:[];
  for(const target of batch){
   const s=c.segments.find(s=>s.id===target.id);
   if(!s||s.directionStatus!=='pending'||s.audio||s.skip||s.isAd||s.text!==target.text||s.speaker!==target.speaker||s.emotion!==target.emotion)continue;
   const matches=rows.filter(x=>x?.id===target.id),value=matches[0];
   const reason=error||(matches.length!==1?'导演指导编号缺失或重复':directionIssue(value));
   if(reason){clearDirection(s);s.directionStatus='fallback';s.directionError=reason;}
   else applyDirection(s,value);
  }
  return true;
 }
 async prepareAnnotations(bid,cid){
  const c=await this.ensureChapter(bid,cid);if(c.analysisDraft?.version===2)return c;
  if(c.segments.length&&!c.analysisDraft)return c;
  if(c.audio&&!c.analysisDraft)return c;
  const input=units(c.text),draft=c.analysisDraft,existing=new Map([...(draft?.segments||[]),...c.segments].map(s=>[s.id,s]));
  c.segments=input.map(x=>existing.has(x.id)?existing.get(x.id):({...x,speaker:'旁白',emotion:'',confidence:0,isAd:false,skip:false,audio:null,annotationStatus:'pending'}));
  let next=Math.max(0,Math.min(input.length,Number(draft?.next)||0));
  const failed=this.state.tasks.find(t=>t.bookId===bid&&t.chapterId===cid&&t.status==='failed'&&(/标注|识别/.test(t.error?.stage||t.phase||'')||isContentRejected(t.error||t.message)&&!existing.size));
  let pending;
  if(failed){
   const start=Math.min(input.length,Math.max(next,Number(failed.error?.batchStart||next+1)-1)),end=Math.min(input.length,Number(failed.error?.batchEnd)||start+45);
   for(let i=start;i<end;i++)if(c.segments[i]?.annotationStatus==='pending')c.segments[i].annotationError=String(failed.error?.message||failed.message||'本批标注失败');
   pending=[];for(const [from,to,size,isolated] of [[next,start,45,false],[start,end,5,true],[end,input.length,45,false]])for(let i=from;i<to;i+=size)pending.push({ids:input.slice(i,Math.min(to,i+size)).map(s=>s.id),isolated});
  }
  c.analysisDraft={version:2,next,batchSize:this.features.direction?Math.min(ANNOTATION_BATCH_LIMIT,draft?.batchSize||ANNOTATION_BATCH_LIMIT):(draft?.batchSize||(this.features.batching?90:45)),...(pending?{pending}:{})};this.touch(c);await this.persist();return c;
 }
 async withBookLock(bid,fn){this._bookLocks=this._bookLocks||new Map();const prior=this._bookLocks.get(bid)||Promise.resolve();let release;const current=new Promise(r=>{release=r;});this._bookLocks.set(bid,current);await prior;try{return await fn();}finally{release();if(this._bookLocks.get(bid)===current)this._bookLocks.delete(bid);}}
 async analyze(bid,cid,shouldPause){
  this.analysisJobs=this.analysisJobs||new Map();const key=JSON.stringify([bid,cid]);
  if(!this.analysisJobs.has(key))this.analysisJobs.set(key,this.withBookLock(bid,()=>this.analyzeChapter(bid,cid,shouldPause)).finally(()=>this.analysisJobs.delete(key)));
  return this.analysisJobs.get(key);
 }
 async analyzeChapter(bid,cid,shouldPause){await this.prepareAnnotations(bid,cid);const b=this.book(bid),c=this.chapter(bid,cid);if(!c.analysisDraft){if(this.fallbackUncertain(c)){this.touch(c);await this.persist();}return c;}const input=units(c.text);for(const task of this.state.tasks)if(task.bookId===bid&&task.chapterId===cid&&task.status==='running')task.total=input.length;const all=c.segments,batchSize=this.features.direction?Math.min(ANNOTATION_BATCH_LIMIT,c.analysisDraft.batchSize||ANNOTATION_BATCH_LIMIT):(c.analysisDraft.batchSize||45);
 const queue=c.analysisDraft.pending?.flatMap(job=>{const size=job.kind==='direction'?5:batchSize;return Array.from({length:Math.ceil(job.ids.length/size)},(_,i)=>({...job,ids:job.ids.slice(i*size,(i+1)*size),...(job.targets?{targets:job.targets.filter(t=>job.ids.slice(i*size,(i+1)*size).includes(t.id))}:{})}));})||Array.from({length:Math.ceil((input.length-(c.analysisDraft.next||0))/batchSize)},(_,i)=>({ids:input.slice((c.analysisDraft.next||0)+i*batchSize,(c.analysisDraft.next||0)+(i+1)*batchSize).map(s=>s.id),isolated:false}));
 const covered=new Set(queue.flatMap(job=>job.ids)),missing=all.filter(s=>s.annotationStatus==='pending'&&!covered.has(s.id)).map(s=>s.id);
 for(let i=missing.length;i>0;i-=batchSize)queue.unshift({ids:missing.slice(Math.max(0,i-batchSize),i),isolated:true});
 while(queue.length){if(shouldPause?.())return null;const job=queue.shift();
 if(job.kind==='direction'){
  c.analysisDraft.pending=[job,...queue];this.touch(c);await this.persist();
  if(!await this.repairDirections(c,input,job,shouldPause))return null;
  c.analysisDraft.pending=queue;c.analysisDraft.batchSize=batchSize;this.touch(c);await this.persist();continue;
 }
 const batch=job.ids.map(id=>input[id]).filter(x=>x&&all[x.id]?.annotationStatus==='pending');if(!batch.length)continue;const offset=batch[0].id;const prev=b.chapters.slice(0,b.chapters.indexOf(c)).map(x=>x.summary||'').filter(Boolean).slice(-3).join('\n');
this.touch(c);c.analysisDraft.pending=[job,...queue].map(x=>({...x,ids:[...x.ids]}));await this.persist();
const promptText=ModelPrompts.annotation({text:c.text,characters:b.characters.map(({name,description,aliases})=>({name,description,aliases})),previous:prev,summary:c.summary,judged:all.slice(0,offset).filter(s=>s.annotationStatus!=='pending').slice(-8).map(s=>s.speaker+'：'+String(s.text||'').slice(0,60)).join('\n'),batch,threshold:this.spkThr(),isolated:job.isolated,context:job.targetOnly||!this.features.direction?batch:nearbyContext(input,job.ids)});
let result;
try{
  result=await this.llm(promptText,{task:'annotation',maxTokens:12000});
}catch(err){
  if(shouldPause?.())return null;
  if(this.features.direction&&isContentRejected(err)&&job.isolated&&!job.targetOnly){queue.unshift({...job,targetOnly:true});c.analysisDraft.pending=queue;this.touch(c);await this.persist();continue;}
  if(!['structure','truncated'].includes(err.kind)&&!isContentRejected(err)){err.stage='标注角色';err.batchStart=batch[0].id+1;err.batchEnd=batch[batch.length-1].id+1;throw err;}
  result={characters:[],lines:[],annotationError:String(err.message||err)};
}

 result=result&&typeof result==='object'?result:{};
 const byId=new Map(),duplicates=new Set(),invalid=new Map(),ids=new Set(batch.map(x=>x.id));
 for(const x of Array.isArray(result.lines)?result.lines:[]){if(!x||!ids.has(x.id))continue;if(byId.has(x.id)||invalid.has(x.id)){duplicates.add(x.id);continue;}if(typeof x.speaker!=='string'||!x.speaker.trim()||typeof x.emotion!=='string'||!Number.isFinite(x.confidence)){invalid.set(x.id,'本句标注格式不完整');continue;}byId.set(x.id,x);}
 const newlyAnnotated=[],issues=[];for(const x of batch){let reason=result.annotationError|| (duplicates.has(x.id)?'本句标注编号重复':invalid.get(x.id)||(!byId.has(x.id)?'模型未返回本句标注':''));if(reason){byId.set(x.id,{annotationError:reason});issues.push({id:x.id,reason});}}
 if(issues.length){c.analysisIssues=c.analysisIssues||[];c.analysisIssues.push({offset,expected:batch.length,received:Array.isArray(result.lines)?result.lines.length:0,issues});}
 result.characters=Array.isArray(result.characters)?result.characters.filter(x=>x&&typeof x==='object'):[];
 for(const x of result.characters||[])x.description=cleanVoiceDescription(x.description);for(const x of result.characters||[]){if(typeof x.name!=='string'||!x.name||x.name==='未知角色'||x.name==='未识别角色'||x.name==='广告'||splitEnsemble(x.name)||x.name.length>50||(!c.text.includes(x.name)&&!b.characters.some(y=>y.name===x.name)))continue;const old=b.characters.find(y=>y.name===x.name||(y.aliases||[]).includes(x.name));if(!old)b.characters.push({name:x.name,description:String(x.description||'自然清晰的声音'),aliases:safeAliases(x.aliases),voice:null,bitPart:isBitPart(x.name,b.characters)});else if(isBitPart(x.name,b.characters)&&!old.bitPart){old.bitPart=true;if(!old.description||old.description==='自然清晰的声音')old.description=bitPartVoiceDesc(x.name);}}
 for(const x of result.characters||[]){if(typeof x.name!=='string'||!x.name)continue;const __X=b.characters.find(r=>r.name===x.name);if(!__X)continue;for(const a of safeAliases(x.aliases)){if(a===x.name)continue;const __Y=b.characters.find(r=>r.name!==x.name&&(r.name===a||(r.aliases||[]).includes(a)));if(!__Y)continue;const __pair=__Y.name+'→'+__X.name;if((b.mergeDismissed||[]).includes(__pair))continue;if(this.state.settings.mode==='auto'){await this.mergeRoles(b.id,__X.name,__Y.name,true);for(const s of all)if(s.speaker===__Y.name)s.speaker=__X.name;}else{b.mergeSuggestions=b.mergeSuggestions||[];if(!b.mergeSuggestions.some(m=>m.from===__Y.name&&m.to===__X.name))b.mergeSuggestions.push({from:__Y.name,to:__X.name,chapterId:c.id,reason:'模型指出「'+__Y.name+'」即「'+__X.name+'」'});}}}for(const x of batch){if(all[x.id]?.annotationStatus!=='pending')continue;const a=byId.get(x.id);if(a.annotationError){if(batch.length===1)Object.assign(all[x.id],this.annotationFallback(x,a.annotationError));continue;}newlyAnnotated.push(all[x.id]);const isAd=a?.speaker==='广告'||a?.emotion==='跳过';let __spk=String(a.speaker||'未知角色');const __ens=!isAd&&splitEnsemble(__spk);if(__ens){for(const __nm of __ens){if(!__nm||__nm==='旁白'||__nm==='广告'||__nm==='未知角色'||__nm==='未识别角色'||isBitPart(__nm))continue;if(!b.characters.some(r=>r.name===__nm||(r.aliases||[]).includes(__nm)))b.characters.push({name:__nm,description:String((result.characters||[]).find(y=>y.name===__nm)?.description||'自然清晰的声音'),aliases:[],voice:null});}__spk=__ens.find(__nm=>b.characters.some(r=>r.name===__nm))||__ens[0];}if(!isAd&&isBitPart(__spk)){const __bp=b.characters.find(r=>r.name===__spk);if(!__bp)b.characters.push({name:__spk,description:bitPartVoiceDesc(__spk),aliases:[],voice:null,bitPart:true});Object.assign(all[x.id],{id:x.id,text:x.text,speaker:__spk,emotion:a.emotion.slice(0,150),confidence:Math.max(0,Math.min(1,a.confidence)),scene:'',delivery:'',isAd:false,skip:false,audio:null,annotationStatus:'complete'});delete all[x.id].annotationError;continue;}if(!isAd&&__spk!=='旁白'&&__spk!=='广告'&&__spk!=='未知角色'&&__spk!=='未识别角色'&&__spk.length<=50&&!splitEnsemble(__spk)&&!b.characters.some(r=>r.name===__spk||(r.aliases||[]).includes(__spk))&&c.text.includes(__spk)){const __md=(result.characters||[]).find(y=>y.name===__spk);b.characters.push({name:__spk,description:String(__md?.description||'自然清晰的声音'),aliases:safeAliases(__md?.aliases),voice:null,bitPart:isBitPart(__spk,b.characters)});}const exact=b.characters.filter(r=>r.name===__spk),matches=exact.length?exact:b.characters.filter(r=>(r.aliases||[]).includes(__spk)),known=matches.length===1?matches[0]:null;const prior=input[x.id-1]?.text||'',cues=b.characters.filter(r=>r.name!=='旁白'&&prior.startsWith(r.name)).sort((a,b)=>b.name.length-a.name.length),cue=cues[0],direct=cue&&/(?:道|说|问|喊|答|叫|回应|喝|笑|叹|骂|哭|吩咐|催促|呼|吼|嚷|斥|吟|喃喃)[：:]$/.test(prior);const quoted=/^[“「『"].*[”」』"]$/s.test(x.text);const speaker=isAd?'广告':(quoted?(direct?cue.name:(known?.name||'未知角色')):'旁白');Object.assign(all[x.id],{id:x.id,text:x.text,speaker,modelAnnotation:{speaker:a.speaker,confidence:a.confidence,emotion:a.emotion},emotion:isAd?'':a.emotion.slice(0,150),scene:'',delivery:'',confidence:isAd?1.0:(speaker==='未知角色'?0:direct?1:Math.max(0,Math.min(1,a.confidence))),isAd:!!isAd,skip:!!isAd,audio:isAd?'skip':null,annotationStatus:'complete'});delete all[x.id].annotationError;}if(result.summary)c.summary=String(result.summary).slice(0,1500);
 if(this.features.direction){
  const targets=[];
  for(const s of newlyAnnotated){
   const a=byId.get(s.id);applyDirection(s,s.speaker===a.speaker?a:{});
   if(s.directionStatus==='pending')targets.push({id:s.id,text:s.text,speaker:s.speaker,emotion:s.emotion});
  }
  const jobs=[];for(let i=0;i<targets.length;i+=5){const part=targets.slice(i,i+5);jobs.push({kind:'direction',ids:part.map(s=>s.id),targets:part,isolated:true});}queue.unshift(...jobs);
 }
 if(issues.length&&batch.length>1){const retry=issues.map(s=>s.id),size=batch.length>5?5:1,chunks=[];for(let i=0;i<retry.length;i+=size)chunks.push({ids:retry.slice(i,i+size),isolated:true});queue.unshift(...chunks);}
 const next=all.findIndex(s=>s.annotationStatus==='pending'),completed=all.filter(s=>s.annotationStatus!=='pending').length;
 for(const task of this.state.tasks)if(task.bookId===bid&&task.chapterId===cid&&task.status==='running')task.phase='标注角色（'+completed+'/'+input.length+'）';
 c.analysisDraft={version:2,next:next<0?input.length:next,batchSize,pending:queue.map(job=>({...job,ids:[...job.ids]}))};this.touch(c);await this.persist();}
 if(normalize(all.map(x=>x.text).join(''))!==normalize(c.text))throw Error('标注原文校验失败');c.segments=all;delete c.analysisDraft;this.fallbackUncertain(c);c.status='annotated';this.touch(c);await this.persist();return c;}

 async mergeRoles(bid,keepName,dropName,locked=false){if(!locked)return this.withBookLock(bid,()=>this.mergeRoles(bid,keepName,dropName,true));const b=this.book(bid);const keep=b.characters.find(r=>r.name===keepName),drop=b.characters.find(r=>r.name===dropName);if(!keep||!drop||keep===drop)throw Error('角色不存在');const __kv=keep.voice,__dv=drop.voice;if(!__kv&&__dv){keep.voice=__dv;keep.reason='合并「'+dropName+'」复用其音色';}if(!keep.candidate&&drop.candidate)keep.candidate=drop.candidate;if(!keep.description||keep.description==='自然清晰的声音')keep.description=drop.description||keep.description;const __same=!__kv||!__dv||__kv===__dv;keep.aliases=safeAliases([...(keep.aliases||[]),dropName,...(drop.aliases||[])].filter(a=>a!==keepName));keep.aliasSpans=keep.aliasSpans||{};drop.aliasSpans=drop.aliasSpans||{};const __seen=new Set();for(const ch of b.chapters){try{if(ch.unloaded)await this.ensureChapter(bid,ch.id);}catch(e){continue;}if((ch.segments||[]).some(s=>s.speaker===dropName))__seen.add(ch.id);}keep.aliasSpans[dropName]=[...__seen];for(const [a,ids] of Object.entries(drop.aliasSpans)){if(a===keepName)continue;keep.aliasSpans[a]=[...new Set([...(keep.aliasSpans[a]||[]),...(ids||[])])];}for(const ch of b.chapters){if(ch.unloaded||!ch.segments)continue;let __ch=false;for(const s of ch.segments){if(s.speaker===dropName){s.speaker=keepName;if(!__same)s.audio=null;__ch=true;}}if(__ch){ch.audio=null;if(ch.status==='ready')ch.status='annotated';this.touch(ch);}}b.characters=b.characters.filter(r=>r!==drop);if(b.mergeSuggestions)b.mergeSuggestions=b.mergeSuggestions.filter(m=>!(m.from===dropName&&m.to===keepName));if(b.mergeDismissed)b.mergeDismissed=b.mergeDismissed.filter(p=>p!==dropName+'→'+keepName);await this.persist();return keep;}
 voiceKey(id){const v=this.state.voices.find(v=>v.id===id);return v?.sample?'sample:'+v.sample:id;}
 voiceAvailable(b,role,id,sample){
  const key=sample?'sample:'+sample:this.voiceKey(id),bit=role.bitPart||isBitPart(role.name);
  return !b.characters.some(other=>{
   if(other===role)return false;
   if(bit&&(other.bitPart||isBitPart(other.name)))return false;
   return [other.voice,other.suggestedVoice,other.candidate?.id].filter(Boolean).some(used=>this.voiceKey(used)===key)||other.candidate?.sample&&'sample:'+other.candidate.sample===key;
  });
 }
 autoVoiceFor(bid,roleName){
  const b=this.book(bid),role=b.characters.find(r=>r.name===roleName);
  if(!role||role.voice||!(role.bitPart||isBitPart(roleName)))return null;
  const description=role.description||bitPartVoiceDesc(roleName);
  const sibling=b.characters.find(r=>r!==role&&(r.bitPart||isBitPart(r.name))&&r.voice&&this.voiceAvailable(b,role,r.voice)&&!voiceConflict(description,r.description)&&cleanVoiceDescription(r.description)===cleanVoiceDescription(description));
  return sibling?.voice||null;
 }
 async ensureDesignCandidate(b,role,options={}){
  if(role.candidate)return role.candidate;
  if(!this.roleDesignJobs)this.roleDesignJobs=new Map();
  const sourceDescription=role.description;
  const group=role.bitPart||isBitPart(role.name)?'bit:'+cleanVoiceDescription(role.description||bitPartVoiceDesc(role.name)):'role:'+role.name;
  const key=b.id+':'+group;
  if(!this.roleDesignJobs.has(key))this.roleDesignJobs.set(key,this.design(role.description||bitPartVoiceDesc(role.name),undefined,options).finally(()=>this.roleDesignJobs.delete(key)));
  const candidate=await this.roleDesignJobs.get(key);
  return this.withBookLock(b.id,async()=>{if(!this.state.books.includes(b)||!b.characters.includes(role)||role.description!==sourceDescription)return null;
  if(!role.voice){if(!this.voiceAvailable(b,role,candidate.id,candidate.sample))throw Error('新样本与本书已预留声线相同，请重新设计或手动选用');role.candidate=candidate;}
  return candidate;});
 }
 spkThr(){const v=Number(this.state.settings.speakerThreshold);return (v>=0&&v<=1)?v:0.5;}
 taskPar(){const v=Number(this.state.settings.taskParallel);return [1,2,3].includes(v)?v:1;}
 ttsPar(){const v=Number(this.state.settings.ttsParallel);return [1,2,3,4].includes(v)?v:2;}
 ttsLimit(){return (this.ttsConcurrency===1)?1:this.ttsPar();}
 async _acquireTtsSlot(shouldAbort,priority=20){while(true){if(shouldAbort&&shouldAbort())return false;if(priority>=80||this._ttsActive<this.ttsLimit()){this._ttsActive++;return true;}await new Promise(r=>{this._ttsQueue.push(r);setTimeout(r,120);});}}
 _releaseTtsSlot(){this._ttsActive=Math.max(0,this._ttsActive-1);this._wakeTtsWaiters();}
 _wakeTtsWaiters(){const q=this._ttsQueue.splice(0);q.forEach(w=>{try{w();}catch(e){}});}
 queueOrder(a,b){return ((b.prio||0)-(a.prio||0))||((a.created||a.createdAt||0)-(b.created||b.createdAt||0));}
 nextQueued(){
  if(this._frontActive.size>=this.taskPar())return null;
  const q=this.state.tasks.filter(t=>t.status==='queued'&&!this._frontActive.has(t)&&!t.synthActive);
  if(this.features.pipeline){
   if(this.state.tasks.filter(t=>t.status==='running'&&(t.synthActive||t.synthQueued)).length>=this.taskPar()+1)return null;
   return q.filter(t=>this.state.tasks.filter(x=>x.bookId===t.bookId&&x.status==='running').length<2&&!Array.from(this._frontActive).some(x=>x.bookId===t.bookId)&&!q.some(x=>x.bookId===t.bookId&&this.book(t.bookId).chapters.findIndex(c=>c.id===x.chapterId)<this.book(t.bookId).chapters.findIndex(c=>c.id===t.chapterId))).sort((a,b)=>this.queueOrder(a,b))[0]||null;
  }
  return q.sort((a,b)=>this.queueOrder(a,b))[0]||null;
 }
 pendingOrder(){return this.state.tasks.filter(t=>['queued','waiting','paused','failed'].includes(t.status)).sort((a,b)=>this.queueOrder(a,b));}
 async moveTask(id,dir){const list=this.pendingOrder();const i=list.findIndex(t=>t.id===id);if(i<0)throw Error('仅可调整未完成任务的顺序');if(dir==='top'){const st=list.splice(i,1)[0];list.unshift(st);}else{const j=dir==='up'?i-1:i+1;if(j<0||j>=list.length)return false;const st=list.splice(i,1)[0];list.splice(j,0,st);}list.forEach((t,idx)=>{t.prio=list.length-idx;});await this.persist();return true;}
 async matchCharacters(bid,names){
  if(!this.voiceMatchQueues)this.voiceMatchQueues=new Map();
  const previous=this.voiceMatchQueues.get(bid)||Promise.resolve();let release;const current=new Promise(r=>{release=r;});this.voiceMatchQueues.set(bid,current);
  await previous;try{return await this._matchCharacters(bid,names);}finally{release();if(this.voiceMatchQueues.get(bid)===current)this.voiceMatchQueues.delete(bid);}
 }
 async _matchCharacters(bid,names){
  const b=this.book(bid),policy=this.state.settings;
  const needed=b.characters.filter(r=>names.includes(r.name)&&!r.voice&&!r.candidate&&!r.suggestedVoice&&r.name!=='广告');
  const rest=[];
  for(const role of needed){const id=this.autoVoiceFor(bid,role.name);if(id){role.voice=id;role.reason='同类龙套复用相容声线';}else rest.push(role);}
  let voices=this.state.voices.filter(v=>v.enabled).map(v=>({id:v.id,description:v.description}));
  if(policy.usePresets)voices=voices.concat(PRESETS.map(id=>({id:'preset:'+id,description:presetDesc(id)})));
  voices=voices.filter(v=>rest.some(role=>this.voiceAvailable(b,role,v.id)&&!voiceConflict(role.description,v.description)));
  if(rest.length&&voices.length){
   const response=await this.llm(ModelPrompts.voiceMatch(rest.map(({name,description,bitPart})=>({name,description,bitPart:!!bitPart})),voices),{task:'voice-match',maxTokens:4000});
   await this.withBookLock(bid,async()=>{for(const match of response.matches||[]){
    const role=rest.find(r=>r.name===match.name),voice=voices.find(v=>v.id===match.voiceId);
    if(!role||!this.state.books.includes(b)||!b.characters.includes(role)||role.voice||role.candidate||role.suggestedVoice||!voice||voiceConflict(role.description,voice.description)||!this.voiceAvailable(b,role,voice.id))continue;
    if(policy.mode==='auto'||role.bitPart||isBitPart(role.name))role.voice=voice.id;else role.suggestedVoice=voice.id;
    role.reason=String(match.reason||'完整声音描述相容');
   }});
  }
  await this.persist();
 }
 async enqueue(bid,cids,options={}){const list=[...new Set(Array.isArray(cids)?cids:[cids])];for(const cid of list)this.chapter(bid,cid);for(const cid of list){if(this.state.tasks.some(t=>t.bookId===bid&&t.chapterId===cid&&!['done','cancelled'].includes(t.status)))continue;if(this.chapter(bid,cid).audio&&!this.chapter(bid,cid).audioStale)continue;this.state.tasks.push({id:uid(),bookId:bid,chapterId:cid,status:'queued',source:options.source||'explicit',prio:0,phase:'等待开始',message:'',created:Date.now(),done:0,total:0,pauseRequested:false});}await this.persist();return this.kick();}
 async run(){if(this.runActive)return;this.runActive=true;this.running=true;try{const n=this.taskPar();await Promise.all(Array.from({length:n},()=>this.pump()));}finally{this.runActive=false;this.running=false;this.listeners.forEach(fn=>fn());if(this.nextQueued())setTimeout(()=>this.run(),0);}}
 async kick(){for(let i=0;i<600;i++){await Promise.allSettled([this.run(),this.runSynth()]);const busy=this.runActive||this._synthRunning>0||this.state.tasks.some(t=>t.status==='queued'||t.synthQueued);if(!busy)break;await new Promise(r=>setTimeout(r,50));}}
 async runSynth(){
  if(!this.features.pipeline)return;
  if(this._synthDrain)return this._synthDrain;
  this._synthDrain=(async()=>{while(true){for(const t of this.state.tasks.filter(t=>t.status==='running'&&t.synthQueued&&!t.synthActive).sort((a,b)=>this.taskPriority(b)-this.taskPriority(a)||this.queueOrder(a,b)))this.launchSynth(t);const jobs=[...(this._synthJobs?.values()||[])];if(!jobs.length)break;await Promise.race(jobs);this.run().catch(()=>{});}})();
  try{await this._synthDrain;}finally{this._synthDrain=null;}
 }
 wakeChapter(t){const waiters=this._chapterWaiters?.get(t)||[];this._chapterWaiters?.delete(t);for(const w of waiters)w();}
 waitChapter(t){this._chapterWaiters=this._chapterWaiters||new WeakMap();return new Promise(resolve=>{const waiters=this._chapterWaiters.get(t)||[];waiters.push(resolve);this._chapterWaiters.set(t,waiters);});}
 async taskFailure(t,e){
  if(e.networkWait&&!t.pauseRequested&&t.status!=='cancelled'&&this.state.tasks.includes(t)){t.status='waiting';t.networkWaiting=true;t.phase='等待制作网络';t.message=this.productionNetworkMessage();}
  else if(t.pauseRequested||t.status==='cancelled'||!this.state.tasks.includes(t)){if(t.status==='running'){t.status='paused';t.phase='已暂停';}}
  else{const stage=e.stage||t.phase;t.status='failed';t.phase=isContentRejected(e)?'内容审核未通过':'制作失败';t.message=e.message||'任务失败';t.error={code:e.code||'',message:e.message,detail:e.detail||e.message,status:e.status||0,retryable:!!e.retryable,provider:e.provider||'',stage,batchStart:e.batchStart,batchEnd:e.batchEnd};}
  t.synthQueued=false;await this.persist();
 }
 launchSynth(t){
  if(t.synthActive||!t.synthQueued||t.pauseRequested||t.status!=='running'||this._synthRunning>=this.taskPar())return;
  this._synthJobs=this._synthJobs||new Map();t.synthQueued=false;t.synthActive=true;this._synthRunning++;
  const job=(async()=>{try{await this.workSynth(t);}catch(e){await this.taskFailure(t,e);}finally{t.synthActive=false;this._synthRunning--;this._synthJobs.delete(t.id);await this.finishTaskRun(t);this.run().catch(()=>{});}})();this._synthJobs.set(t.id,job);
 }
 async pumpPipeline(){while(true){const t=this.nextQueued();if(!t)return;this._frontActive.add(t);t.status='running';t.error=null;t.frontError=null;t.frontPreparing=true;t.pauseRequested=false;
  try{await this.persist();await this.work(t);}catch(e){t.frontError=e;if(!t.synthActive)await this.taskFailure(t,e);}
  finally{t.frontPreparing=false;this._frontActive.delete(t);this.wakeChapter(t);if(!t.frontError)this.launchSynth(t);await this.finishTaskRun(t);}
 }}
 async pump(){if(this.features.pipeline)return this.pumpPipeline();while(true){const t=this.nextQueued();if(!t)return;if(t.status!=='queued'||this._frontActive.has(t)||t.synthActive)continue;this._frontActive.add(t);t.status='running';t.error=null;t.message='';try{await this.persist();await this.work(t);if(t.synthQueued&&t.status==='running'&&!t.pauseRequested){t.synthQueued=false;t.synthActive=true;this._synthRunning++;try{await this.workSynth(t);}finally{t.synthActive=false;this._synthRunning--;}}}catch(e){if(e.networkWait&&!t.pauseRequested&&t.status!=='cancelled'&&this.state.tasks.includes(t)){t.status='waiting';t.networkWaiting=true;t.phase='等待制作网络';t.message=this.productionNetworkMessage();}else if(t.pauseRequested||t.status==='cancelled'||!this.state.tasks.includes(t)){if(t.status==='running'){t.status='paused';t.phase='已暂停';}}else{const stage=e.stage||t.phase;t.status='failed';t.phase=isContentRejected(e)?'内容审核未通过':'制作失败';t.message=e.message||'任务失败';t.error={code:e.code||'',message:e.message,detail:e.detail||e.message,status:e.status||0,retryable:!!e.retryable,provider:e.provider||'',stage,batchStart:e.batchStart,batchEnd:e.batchEnd};}await this.persist();}finally{this._frontActive.delete(t);await this.finishTaskRun(t);}}}
 async work(t){return this.workFront(t);}
 async workFront(t){
  const b=this.book(t.bookId),c=this.chapter(t.bookId,t.chapterId),policy=this.state.settings;
  if(c.audio&&!c.audioStale&&!t.repace){t.status='done';t.phase='完成';t.message='';await this.persist();return;}
  const stopped=()=>!this.state.tasks.includes(t)||t.status==='cancelled'||t.pauseRequested;
  const stop=async()=>{if(t.pauseRequested&&t.status!=='cancelled'){t.status='paused';t.phase='已暂停';}await this.persist();};
  t.phase='标注角色';await this.persist();await this.analyze(b.id,c.id,stopped);
  if(stopped()){await stop();return;}
  t.total=c.segments.length;t.phase='匹配音色';
  if(this.features.pipeline){t.synthQueued=true;this.launchSynth(t);}
  const activeSpeakers=[...new Set(c.segments.filter(s=>!s.skip&&!s.isAd&&s.speaker!=='旁白'&&s.speaker!=='广告').map(s=>s.speaker))];
  await this.matchCharacters(b.id,activeSpeakers);
  for(const character of b.characters.filter(r=>activeSpeakers.includes(r.name)&&!r.voice)){
   if(stopped()){await stop();return;}if(character.voice)continue;
   const bit=character.bitPart||isBitPart(character.name);
   if(bit){const reuse=this.autoVoiceFor(b.id,character.name);if(reuse){character.voice=reuse;character.candidate=null;character.reason='同类龙套复用已有音色';await this.persist();continue;}}
   if(character.suggestedVoice){
    if(bit||policy.mode==='auto'){character.voice=character.suggestedVoice;delete character.suggestedVoice;await this.persist();continue;}
    if(!character.autoDesign)continue;
   }
   if(!character.candidate){
    await this.ensureDesignCandidate(b,character,{shouldPause:stopped,priority:this.taskPriority(t)});
    // A manual binding or cancellation during the request takes precedence.
    if(character.voice||!b.characters.includes(character)||!character.candidate)continue;
    await this.persist();
   }
   if(stopped()){await stop();return;}
   if(bit||policy.mode==='auto'||character.autoDesign){
    const candidate=character.candidate;
    if(!this.voiceAvailable(b,character,candidate.id,candidate.sample))throw Error('该声线已被本书其他角色预留，请重新设计');
    await this.saveVoice(candidate);
    if(character.voice||!b.characters.includes(character))continue;
    character.voice=candidate.id;character.candidate=null;character.autoDesign=false;
    character.reason=bit?'龙套自动采用设计音色，无需确认':'采用独立设计声线';await this.persist();this.wakeChapter(t);
   }
  }
  if(policy.mode==='auto'){
   for(const segment of c.segments){if(segment.audio||segment.skip||segment.isAd)continue;const speaker=String(segment.speaker||'');if(speaker==='未知角色'||speaker==='未识别角色'||(speaker!=='旁白'&&speaker!=='广告'&&!b.characters.some(r=>r.name===speaker))){const fallback=this.annotationFallback(segment,'角色当前不可用，自动采用旁白');clearDirection(segment);Object.assign(segment,fallback);}}
   this.touch(c);await this.persist();
  }
  for(const segment of c.segments)if(segment.speaker==='广告'){segment.isAd=true;segment.skip=true;segment.confidence=1;segment.audio='skip';this.touch(c);}
  if(stopped()){await stop();return;}
  if(!t.synthActive)t.synthQueued=true;t.status='running';t.phase='等待合成';await this.persist();
 }
 async workSynth(t){
  const b=this.book(t.bookId),c=this.chapter(t.bookId,t.chapterId),policy=this.state.settings;
  if(!this.state.tasks.includes(t)||t.status==='cancelled')return;
  let blocked=false,offset=0,halt=false;const pending=[...c.segments],deferred=[];
  const take=async()=>{while(!aborted()){if(pending.length)return pending.shift();if(t.frontPreparing){await this.waitChapter(t);pending.push(...deferred.splice(0));continue;}return deferred.shift()||null;}return null;};
  const aborted=()=>halt||!!t.frontError||t.pauseRequested||!this.state.tasks.includes(t)||t.status==='cancelled';
  t.phase='合成对白';t.done=c.segments.filter(s=>s.audio).length;await this.persist();
  const worker=async()=>{while(!aborted()){
   const segment=this.features.pipeline?await take():c.segments[offset++];if(!segment)break;
   if(segment.audio&&!(t.repace&&segment.audio!=='skip'&&speechParts(segment.text).length>1&&segment.pacingVersion!==1))continue;
   if((segment.qualityStatus==='pending'&&(segment.generationVersion===GENERATION_VERSION||segment.speechDraft?.generationVersion===GENERATION_VERSION))||segment.retryDraft?.generationVersion===GENERATION_VERSION){blocked=true;continue;}
   if(segment.skip||segment.isAd||segment.speaker==='广告'){segment.audio='skip';this.touch(c);continue;}
   const role=b.characters.find(r=>r.name===segment.speaker);
   if((!role?.voice||segment.directionStatus==='pending')&&t.frontPreparing){deferred.push(segment);continue;}
   if(segment.annotationStatus==='pending'||segment.annotationStatus==='failed'||!role?.voice||(policy.mode!=='auto'&&segment.confidence<this.spkThr())){blocked=true;continue;}
   const lock=JSON.stringify([b.id,c.id,segment.id]);this._activeSegments=this._activeSegments||new Set();
   if(this._activeSegments.has(lock)){blocked=true;continue;}this._activeSegments.add(lock);
   if(!(await this._acquireTtsSlot(aborted,this.taskPriority(t)))){this._activeSegments.delete(lock);break;}
   try{
    if(aborted())break;
    const original={text:segment.text,speaker:segment.speaker,emotion:segment.emotion,...this.speechIdentity(segment,role),voice:role.voice,description:role.description,prompt:segment.ttsPrompt};
    const key=JSON.stringify(original),unchanged=()=>this.state.books.includes(b)&&b.chapters.includes(c)&&segment.text===original.text&&segment.speaker===original.speaker&&segment.emotion===original.emotion&&JSON.stringify(this.speechIdentity(segment,role))===JSON.stringify(Object.fromEntries(Object.entries(original).filter(([k])=>['scene','delivery','directionVersion','promptVersion','effectiveDirection'].includes(k))))&&segment.ttsPrompt===original.prompt&&role.voice===original.voice&&role.description===original.description&&b.characters.includes(role)&&c.segments.includes(segment);
    const draft=segment.speechDraft?.key===key?segment.speechDraft:{};
    const update=async fields=>{if(unchanged()){segment.speechDraft={...(segment.speechDraft?.key===key?segment.speechDraft:{}),key,...fields};this.touch(c);await this.persist();}};
    const file=await this.synthesize(original.text,original.voice,original.emotion,{
     rawAudioIds:segmentAudioIds(segment),...draft,priority:this.taskPriority(t),scene:original.scene,delivery:original.delivery,directionVersion:original.directionVersion,prompt:original.prompt,voiceDescription:original.description,silenceRef:c.segments.find(s=>s.audio&&s.audio!=='skip')?.audio||null,
     shouldPause:aborted,onQuality:update,onPart:files=>update({files:[...files],pendingRaw:null})
    });
    if(!unchanged()){blocked=true;continue;}
    segment.audio=file.id;if(file.duration>0)segment.durMs=Math.round(file.duration*1000);
    if(file.generationVersion){segment.generationVersion=file.generationVersion;segment.qualityStatus=file.qualityStatus;segment.rawAudioIds=file.rawAudioIds||[];segment.qualityIssues=file.qualityIssues||[];segment.qualityAttempts=file.qualityAttempts||0;}
    if(file.silenceProcessing)segment.silenceProcessing=file.silenceProcessing;else delete segment.silenceProcessing;
    if(file.speechChecked){segment.speechCheckedAudio=file.id;segment.speechCheckedText=original.text;}
    if(typeof file.speechPrompt==='string')segment.lastSpeechRequest={promptVersion:PROMPT_VERSION,prompt:file.speechPrompt,text:original.text,voice:original.voice,audio:file.id};
    delete segment.speechDraft;delete segment.failReason;segment.pacingVersion=1;
    this.touch(c);t.done=c.segments.filter(s=>s.audio).length;await this.persist();
   }catch(e){
    if(aborted()||e.message==='任务已暂停'){halt=true;throw e;}
    if(e.qualityPending||isContentRejected(e)||e.status===400||/Param Incorrect|参数被拒绝|超长被拒绝|音色参数不被支持/.test(e.message||'')){
     blocked=true;segment.generationVersion=GENERATION_VERSION;segment.qualityStatus='pending';segment.failReason=e.message||'音频待处理';if(segment.speechDraft){segment.speechDraft.qualityFailure='local';segment.qualityAttempts=segment.speechDraft.qualityAttempts||0;segment.qualityIssues=segment.speechDraft.qualityIssues||[];}
     this.touch(c);await this.persist();
    }else{halt=true;throw e;}
   }finally{this._releaseTtsSlot();this._activeSegments.delete(lock);}
  }};
  const outcomes=await Promise.allSettled(Array.from({length:Math.max(1,this.ttsLimit())},worker));
  if(!this.state.tasks.includes(t)||t.status==='cancelled')return;
  if(t.pauseRequested){t.status='paused';await this.persist();return;}
  if(t.frontError)throw t.frontError;
  const failure=outcomes.find(r=>r.status==='rejected');if(failure)throw failure.reason;
  if(blocked||c.segments.some(s=>!s.audio)){
   t.status='waiting';c.status='waiting';
   const pending=c.segments.filter(s=>s.qualityStatus==='pending'&&!s.audio),annotation=c.segments.filter(s=>s.annotationStatus==='failed'&&!s.skip&&!s.isAd);
   t.phase=annotation.length?'标注待处理':pending.length?'音频待处理':'等待确认';
   t.message=annotation.length?annotation.length+' 句标注待处理，请在标注页修改说话人或使用旁白；其他句子已继续制作'+(pending.length?'，另有 '+pending.length+' 句音频待处理':''):pending.length?pending.length+' 句音频待处理，请在标注页重新合成对应句子；其他片段已继续制作':'请确认角色音色或校对说话人后继续制作';
  }else{
   const audible=c.segments.filter(s=>s.audio&&s.audio!=='skip'&&!s.skip&&!s.isAd);
   if(!audible.length){c.audio=null;c.status='skipped';t.status='done';t.phase='全部跳过';t.skipped=c.segments.length;t.done=0;t.message='本章 '+c.segments.length+' 段全部跳过，未生成音频。请检查广告标注，可取消跳过后重新制作';}
   else{
    t.phase='合并章节';await this.persist();const version=JSON.stringify(c.segments);
    const result=await this.io.mergeAudio(audible.map(s=>s.audio),pausesFor(audible.map(s=>s.text)));
    if(!this.state.tasks.includes(t)||t.status==='cancelled')return;
    if(t.pauseRequested){t.status='paused';await this.persist();return;}
    if(JSON.stringify(c.segments)!==version){c.status='waiting';t.status='waiting';t.message='合并期间有片段修改，请继续制作';}
    else{c.audio=result.id;c.audioStale=false;c.duration=result.duration;c.pacingVersion=1;c.status='ready';t.status='done';t.phase='完成';t.message='';}
   }
  }
  this.touch(c);await this.persist();
 }
 async optimizePauses(bid,cid){await this.ensureChapter(bid,cid);const c=this.chapter(bid,cid);if(!c.audio||!c.segments.length||c.segments.some(s=>!s.audio))throw Error('请先完成本章制作');if(c.pacingVersion===1)return;if(this.state.tasks.some(t=>t.bookId===bid&&t.chapterId===cid&&['running','queued'].includes(t.status)))throw Error('本章正在制作');let t=this.state.tasks.slice().reverse().find(t=>t.bookId===bid&&t.chapterId===cid&&t.status!=='cancelled');if(!t){t={id:uid(),bookId:bid,chapterId:cid,created:Date.now(),prio:0};this.state.tasks.push(t);}Object.assign(t,{status:'queued',phase:'优化句末停顿',message:'',done:c.segments.length,total:c.segments.length,pauseRequested:false,repace:true});await this.persist();return this.kick();}
 async finishTaskRun(t){if(this._frontActive.has(t)||t.synthActive)return;if(t.resumeRequested&&this.state.tasks.includes(t)&&!['done','cancelled'].includes(t.status)){t.resumeRequested=false;t.pauseRequested=false;t.synthQueued=false;t.status='queued';t.phase='排队等待';await this.persist();}}
 async pause(id){const t=this.state.tasks.find(t=>t.id===id);if(!t||['done','cancelled'].includes(t.status))return;t.resumeRequested=false;t.synthQueued=false;t.pauseRequested=true;this.wakeChapter(t);if(!this._frontActive.has(t)&&!t.synthActive){t.status='paused';t.phase='已暂停';}else{t.phase='暂停中，当前请求结束后停止';}await this.persist();}
 async resume(id){return this.resumeTasks([id]);}
 async resumeTasks(ids,front=true){const tasks=ids.map(id=>this.state.tasks.find(t=>t.id===id)).filter(t=>t&&!['done','cancelled'].includes(t.status)&&!(t.status==='running'&&!t.pauseRequested));const mx=Math.max(0,...this.state.tasks.map(t=>t.prio||0));tasks.forEach((t,i)=>{if(front)t.prio=mx+tasks.length-i;if(this._frontActive.has(t)||t.synthActive){t.resumeRequested=true;t.phase='当前请求结束后继续';}else{t.resumeRequested=false;t.pauseRequested=false;t.synthQueued=false;t.status='queued';t.phase='排队等待';t.message='';t.error=null;}});await this.persist();await this.kick();}
 async cancel(id){const t=this.state.tasks.find(t=>t.id===id);if(!t||t.status==='done')return;t.resumeRequested=false;t.synthQueued=false;t.pauseRequested=true;this.wakeChapter(t);t.status='cancelled';t.phase='已取消';t.message='任务已取消';this._wakeTtsWaiters();try{const c=this.chapter(t.bookId,t.chapterId);if(c.status!=='ready'){c.status=(c.segments||[]).length?'annotated':'raw';this.touch(c);}}catch(e){}await this.persist();}
 async removeTask(id){const i=this.state.tasks.findIndex(t=>t.id===id);if(i>=0){const t=this.state.tasks[i];t.synthQueued=false;t.pauseRequested=true;this.state.tasks.splice(i,1);this._wakeTtsWaiters();this.wakeChapter(t);await this.persist();}}
 async accept(bid,name,resume=true){const ch=this.book(bid).characters.find(r=>r.name===name);if(!ch?.candidate)throw Error('没有可确认的样本');const candidate=ch.candidate;await this.saveVoice(candidate);await this.bind(bid,name,candidate.id,resume);}
 async bind(bid,name,voice,resume=true,locked=false){
  if(!locked){await this.withBookLock(bid,()=>this.bind(bid,name,voice,false,true));if(resume)await this.resumeWaiting(bid);return;}
  this.invalidateReferences();
  if(!voice.startsWith('preset:')&&!this.state.voices.some(v=>v.id===voice))throw Error('音色不存在');if(voice.startsWith('preset:')&&!PRESETS.includes(voice.slice(7)))throw Error('预设音色不存在');
  const ch=this.book(bid).characters.find(r=>r.name===name);if(!ch)throw Error('角色不存在');
  ch.voice=voice;ch.candidate=null;delete ch.suggestedVoice;for(const t of this.state.tasks)if(t.bookId===bid)this.wakeChapter(t);await this.persist();if(resume)await this.resumeWaiting(bid);
 }
 async correct(bid,cid,id,speaker,emotion){await this.ensureChapter(bid,cid);const c=this.chapter(bid,cid);if(!this.book(bid).characters.some(x=>x.name===speaker))throw Error('请先创建或选择角色');const seg=c.segments.find(s=>s.id===id);if(!seg)throw Error('片段不存在');if(seg.speaker!==speaker)clearDirection(seg);seg.speaker=speaker;seg.emotion=emotion;seg.confidence=1;seg.annotationStatus='resolved';delete seg.annotationError;if(seg.audio&&seg.audio!=='skip')seg.originalAudio=seg.originalAudio||seg.audio;seg.audio=null;delete seg.speechDraft;delete seg.retryDraft;delete seg.retryError;delete seg.qualityStatus;delete seg.qualityIssues;delete seg.qualityAttempts;if(c.audio)c.originalAudio=c.originalAudio||c.audio;c.audioStale=!!c.audio;c.status='annotated';for(const t of this.state.tasks.filter(t=>t.bookId===bid&&t.chapterId===cid)){t.done=c.segments.filter(s=>s.audio).length;if(t.status==='done'){t.status='paused';t.phase='标注已修改，等待重制';}}this.touch(c);await this.persist();}
 async resumeWaiting(bid,front=true){const tasks=this.state.tasks.filter(t=>t.bookId===bid&&t.status==='waiting');await this.resumeTasks(tasks.map(t=>t.id),front);}
 async calibrateDurations(bid,cid){try{await this.ensureChapter(bid,cid);}catch(e){/* 无正文也可用内存分句校准 */}const c=this.chapter(bid,cid);const missing=(c.segments||[]).filter(s=>s.audio&&s.audio!=='skip'&&!(s.durMs>0));if(!missing.length||!this.io.audioDurations)return 0;let res;try{res=await this.io.audioDurations(missing.map(s=>s.audio));}catch(e){return 0;}let n=0;for(const s of missing){const ms=Math.round(Number(res[s.audio]));if(ms>0){s.durMs=ms;n++;}}if(n){this.touch(c);await this.persist();}return n;}
 computeSegmentTimestamps(segments,totalDurationSec){return computeSegmentTimestamps(segments,totalDurationSec);}
}

function computeSegmentTimestamps(segments, totalDurationSec){
  if(!segments||!segments.length)return [];
  const audible=segments.filter(s=>!s.skip&&!s.isAd&&s.audio!=='skip');
  const durSec=Number(totalDurationSec)||0;
  if(!audible.length||durSec<=0){
    return segments.map((s,i)=>({
      ...s,
      startMs:i*2500,
      endMs:(i+1)*2500,
      isSkip:!!(s.skip||s.isAd||s.audio==='skip')
    }));
  }
  const totalMs=durSec*1000;
  let totalWeight=0;
  const weights=audible.map(s=>{
    const p=pauseAfter(s.text)||300;
    const w=s.durMs>0?s.durMs:Math.max(1,(s.text||'').length*220+p);
    totalWeight+=w;
    return w;
  });
  let curMs=0,aIdx=0;
  return segments.map(s=>{
    if(s.skip||s.isAd||s.audio==='skip'){
      return {...s,startMs:Math.round(curMs),endMs:Math.round(curMs),isSkip:true};
    }
    const w=weights[aIdx++];
    const segDur=(w/totalWeight)*totalMs;
    const startMs=Math.round(curMs);
    curMs+=segDur;
    const endMs=Math.round(curMs);
    return {...s,startMs,endMs,isSkip:false};
  });
}

return {FEATURES,PROMPT_VERSION,DIRECTION_VERSION,directionIssue,ModelPrompts,isNetworkRetryable,nextRetryDelay,NET_RETRY_BASE_MS,NET_RETRY_MAX_MS,NET_RETRY_LIMIT,isContentRejected,segmentAudioIds,normalizeBookMetadata,GENERATION_VERSION,PAUSE_POLICY,QualityError,buildSpeechDirection,boundedSpeechParts,voiceConflict,cleanVoiceDescription,shortVoiceName,Engine,DEFAULTS,PRESETS,ApiError,LlmOutputError,speechParts,pauseAfter,pausesFor,expectedSpeechSec,isAudioTooLong,isPunctOnly,punctSilenceMs,styleTagOf,tagTextOf,units,splitBook,splitChapters,safeTitleRegex,CHAPTER_RULES,SPLIT_PROBE_PROMPT,parseJson,makeState,normalize,chapterWarnings,computeSegmentTimestamps,genderOf,cnAgeNum,featSim,presetDesc,isBitPart,splitEnsemble,bitPartVoiceDesc};
});

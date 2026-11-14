(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BajiaoSettings=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const VERSION=4;
const PROTOCOLS=[['openai','OpenAI Chat Completions'],['responses','OpenAI Responses'],['anthropic','Anthropic Messages']];
const PROVIDERS=[{id:'other',name:'其他',base:'',protocol:'openai'},{id:'openai',name:'OpenAI',base:'https://api.openai.com/v1',protocol:'openai'},{id:'anthropic',name:'Anthropic',base:'https://api.anthropic.com/v1',protocol:'anthropic'},{id:'minimax',name:'MiniMax',base:'https://api.minimax.cn/v1',protocol:'openai'},{id:'mimo',name:'MiMo',base:'https://api.xiaomimimo.com/v1',protocol:'openai'}];
const PRESETS=Object.freeze(['默认嗓音','冰糖','茉莉','苏打','白桦','Mia','Chloe','Milo','Dean']);
const DEFAULT_VOICES=Object.freeze({narrator:'preset:白桦',maleLead:'preset:苏打',femaleLead:'preset:冰糖'});
const defaults={settingsVersion:VERSION,wifiOnlyProduction:false,llmBase:'',llmModel:'',llmProtocol:'openai',voiceAdoptionMode:'auto',speakerUncertaintyMode:'narrator',roleMergeMode:'auto',usePresets:false,llmRetries:3,ttsRetries:3,speakerThreshold:0.5,autoDeletePlayed:false,keepRecentCount:2,autoProduceCount:2,playbackSpeed:1,sleepTimer:0,autoProduceUpcoming:true,readerFontSize:16,readerLineHeight:1.6,taskParallel:1,ttsParallel:2,splitRule:'auto',splitCustom:'',promptMode:'director',connectTimeoutSeconds:30,responseTimeoutSeconds:240,defaultVoices:DEFAULT_VOICES};
defaults.autoCheckUpdates=true;
defaults.ttsContentRejectedMode='review';
Object.assign(defaults,{llmProvider:'other',llmProviderName:'',llmModels:[]});
Object.defineProperty(defaults,'retries',{get(){return this.llmRetries;}});
const DEFAULTS=Object.freeze(defaults);
const PAGE_KEYS=Object.freeze({
 llm:['llmProvider','llmProviderName','llmProtocol','llmBase','llmModel','llmModels'],mimo:[],
 productionmode:['promptMode','speakerUncertaintyMode','speakerThreshold','roleMergeMode'],
 voicepolicy:['voiceAdoptionMode','usePresets','defaultVoices'],
 productionpolicy:['wifiOnlyProduction','taskParallel','ttsParallel','connectTimeoutSeconds','responseTimeoutSeconds'],
 quality:['llmRetries','ttsRetries','ttsContentRejectedMode'],
 playbackpolicy:['playbackSpeed','autoProduceUpcoming','autoProduceCount'],
 readerpolicy:['readerFontSize','readerLineHeight'],importpolicy:['splitRule','splitCustom'],
 storagepolicy:['autoDeletePlayed','keepRecentCount']
});
const SPLIT_RULES=['auto','chapter_cn','volume_cn','special_cn','chapter_en','number_dot','paren_num','bare_num','bare_cn_num','num_chapter','custom'];
const clone=value=>JSON.parse(JSON.stringify(value));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function integer(value,min,max){if(typeof value!=='number'&&(typeof value!=='string'||!/^\d+$/.test(value.trim())))return null;const n=Number(value);return Number.isSafeInteger(n)&&n>=min&&n<=max?n:null;}
function normalize(saved={},legacySpeed){
 const s={...clone(DEFAULTS),...saved},manual=saved.mode==='manual';delete s.mode;
 s.autoCheckUpdates=typeof saved.autoCheckUpdates==='boolean'?saved.autoCheckUpdates:true;
 for(const [key,values,fallback] of [['voiceAdoptionMode',['auto','review'],manual?'review':'auto'],['speakerUncertaintyMode',['narrator','review'],manual?'review':'narrator'],['roleMergeMode',['auto','review'],manual?'review':'auto']])if(!values.includes(s[key])||saved[key]==null)s[key]=fallback;
 const legacyRetries=integer(saved.retries,0,Number.MAX_SAFE_INTEGER);
 for(const key of ['llmRetries','ttsRetries'])s[key]=integer(saved[key],0,Number.MAX_SAFE_INTEGER)??legacyRetries??DEFAULTS[key];
 delete s.retries;delete s.qualityAutoRetry;delete s.qualityConfirmRetry;
 Object.defineProperty(s,'retries',{configurable:true,get(){return this.llmRetries;},set(value){this.llmRetries=value;this.ttsRetries=value;}});
 for(const [key,min,max] of [['keepRecentCount',0,3],['autoProduceCount',1,3],['taskParallel',1,3],['ttsParallel',1,4],['connectTimeoutSeconds',5,120],['responseTimeoutSeconds',30,600]])s[key]=integer(s[key],min,max)??DEFAULTS[key];
 if(!Number.isFinite(Number(s.speakerThreshold))||s.speakerThreshold<0||s.speakerThreshold>1)s.speakerThreshold=0.5;else s.speakerThreshold=Number(s.speakerThreshold);
 const speed=Number(legacySpeed??s.playbackSpeed);s.playbackSpeed=Number.isFinite(speed)&&speed>=0.5&&speed<=3?speed:1;
 if(![16,18,20,22,24].includes(Number(s.readerFontSize)))s.readerFontSize=16;else s.readerFontSize=Number(s.readerFontSize);
 if(![1.6,1.9,2.2].includes(Number(s.readerLineHeight)))s.readerLineHeight=1.6;else s.readerLineHeight=Number(s.readerLineHeight);
 if(!['fast','director'].includes(s.promptMode))s.promptMode=DEFAULTS.promptMode;
 if(!PROTOCOLS.some(([id])=>id===s.llmProtocol))s.llmProtocol='openai';
 if(!PROVIDERS.some(p=>p.id===s.llmProvider))s.llmProvider='other';
 s.llmProviderName=typeof s.llmProviderName==='string'?s.llmProviderName:'';
 s.llmModels=[...new Set((Array.isArray(saved.llmModels)?saved.llmModels:[]).concat(s.llmModel||[]).filter(id=>typeof id==='string'&&id.trim()).map(id=>id.trim()))];
 if(!['review','skip'].includes(s.ttsContentRejectedMode))s.ttsContentRejectedMode=DEFAULTS.ttsContentRejectedMode;
 if(!SPLIT_RULES.includes(s.splitRule))s.splitRule='auto';
 s.defaultVoices={...DEFAULT_VOICES,...(saved.defaultVoices&&typeof saved.defaultVoices==='object'?saved.defaultVoices:{})};
 for(const key of Object.keys(DEFAULT_VOICES))if(!(typeof s.defaultVoices[key]==='string'&&s.defaultVoices[key])&&!(key!=='narrator'&&s.defaultVoices[key]===null))s.defaultVoices[key]=DEFAULT_VOICES[key];
 delete s.keepRecentTwoChapters;s.settingsVersion=VERSION;
 // Compatibility for old integrations assigning the former all-in-one policy.
 // Non-enumerable: new snapshots persist only the three independent policies.
 Object.defineProperty(s,'mode',{configurable:true,get(){return this.voiceAdoptionMode==='auto'?'auto':'manual';},set(v){this.voiceAdoptionMode=v==='auto'?'auto':'review';this.speakerUncertaintyMode=v==='auto'?'narrator':'review';this.roleMergeMode=v==='auto'?'auto':'review';}});
 return s;
}
function validateHeaders(headers){
 if(!Array.isArray(headers)||headers.length>64)return '自定义 Headers 最多添加 64 项。';
 const names=new Set();for(const row of headers){
  const name=String(row?.name||'').trim(),value=String(row?.value??'');
  if(!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name))return '请填写有效的 Header 名称。';
  if(['host','content-length','connection','transfer-encoding','upgrade','expect','trailer','te'].includes(name.toLowerCase()))return '不能自定义 Host、连接或请求长度相关的 Header。';
  if(names.has(name.toLowerCase()))return 'Header 名称不能重复（不区分大小写）。';names.add(name.toLowerCase());
  if(/[^\x20-\x7e\x80-\xff\t]/.test(value))return 'Header 值不能包含换行、控制字符或非 HTTP 字符。';
 }return '';
}
function validate(page,draft,voices=[],{requireModel=true}={}){
 const errors={},value=clone(draft),range=(key,min,max,label)=>{const n=integer(value[key],min,max);if(n===null)errors[key]=label;else value[key]=n;};
 if(page==='productionpolicy'){
  range('taskParallel',1,3,'请选择 1–3 章。');range('ttsParallel',1,4,'请选择 1–4 个请求。');
  range('connectTimeoutSeconds',5,120,'连接超时请输入 5–120 秒的整数。');range('responseTimeoutSeconds',30,600,'响应超时请输入 30–600 秒的整数。');
 }
 if(page==='productionmode'){
  const n=Number(value.speakerThreshold);if(String(value.speakerThreshold).trim()===''||!Number.isFinite(n)||n<0||n>1)errors.speakerThreshold='阈值请输入 0–1 之间的数值。';else value.speakerThreshold=n;
 }
 if(page==='quality'){
  for(const key of ['llmRetries','ttsRetries'])range(key,0,Number.MAX_SAFE_INTEGER,'重试次数请输入非负整数，0 表示不重试。');
  if(!['review','skip'].includes(value.ttsContentRejectedMode))errors.ttsContentRejectedMode='请选择有效选项。';
 }
 if(page==='playbackpolicy'){
  const n=Number(value.playbackSpeed);if(!Number.isFinite(n)||n<0.5||n>3)errors.playbackSpeed='倍速范围为 0.5–3。';else value.playbackSpeed=n;
  range('autoProduceCount',1,3,'提前制作章数请选择 1–3 章。');
 }
 if(page==='readerpolicy')for(const [key,allowed] of [['readerFontSize',[16,18,20,22,24]],['readerLineHeight',[1.6,1.9,2.2]]]){if(!allowed.includes(Number(value[key])))errors[key]='请选择有效选项。';else value[key]=Number(value[key]);}
 if(page==='storagepolicy')range('keepRecentCount',0,3,'保留章数请选择 0–3 章。');
 if(page==='importpolicy'){
  if(!SPLIT_RULES.includes(value.splitRule))errors.splitRule='请选择切章规则。';
  if(value.splitRule==='custom'&&!String(value.splitCustom||'').trim())errors.splitCustom='请填写自定义模板。';
 }
 if(page==='llm'){
  value.llmBase=String(value.llmBase||'').trim().replace(/\/+$/,'');value.llmModel=String(value.llmModel||'').trim();
  try{const url=new URL(value.llmBase);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error();}catch{errors.llmBase='请输入不含账号、查询参数和片段的 HTTPS 服务地址。';}
  if(requireModel&&!value.llmModel)errors.llmModel='请填写或选择模型 ID。';
  if(!PROTOCOLS.some(([id])=>id===value.llmProtocol))errors.llmProtocol='请选择 API 格式。';
  if(!PROVIDERS.some(p=>p.id===value.llmProvider))errors.llmProvider='请选择提供商。';
  value.llmProviderName=String(value.llmProviderName||'').trim();
  if(value.llmProvider==='other'&&!value.llmProviderName)value.llmProviderName='其他';
  value.llmModels=[...new Set((Array.isArray(value.llmModels)?value.llmModels:[]).concat(value.llmModel||[]).filter(id=>typeof id==='string'&&id.trim()).map(id=>id.trim()))];
 }
 if(page==='voicepolicy'){
  const keys=new Map();for(const key of Object.keys(DEFAULT_VOICES)){
   const id=value.defaultVoices?.[key];if(id===null&&key!=='narrator')continue;
   const v=voices.find(v=>v.id===id),valid=typeof id==='string'&&(id.startsWith('preset:')?PRESETS.includes(id.slice(7)):!!v?.sample);
   if(!valid){errors['defaultVoices.'+key]='音色已删除或缺少样本，请重新选择。';continue;}
   const identity=v?.sample?'sample:'+v.sample:id;
   if(keys.has(identity)){errors['defaultVoices.'+key]='默认角色请使用不同声线，或选择按通用规则匹配。';}else keys.set(identity,key);
  }
 }
 for(const [key,allowed] of [['voiceAdoptionMode',['auto','review']],['speakerUncertaintyMode',['narrator','review']],['roleMergeMode',['auto','review']],['promptMode',['fast','director']]])if((PAGE_KEYS[page]||[]).includes(key)&&!allowed.includes(value[key]))errors[key]='请选择有效选项。';
 return {value,errors,valid:!Object.keys(errors).length};
}
class Draft{
 constructor(page,settings,headers=[]){this.page=page;this.base=clone(settings);this.value=clone(settings);this.baseHeaders=clone(headers);this.credential={operation:'keep',key:'',...(page==='llm'?{headers:clone(headers)}:{})};this.revision=0;this.error='';this.errors={};this.result=null;this.saving=false;this.testing=false;}
 set(key,value){const before=JSON.stringify(this.value);if(key.startsWith('defaultVoices.'))this.value.defaultVoices[key.split('.')[1]]=value;else this.value[key]=value;if(before!==JSON.stringify(this.value)){this.revision++;this.errors={};this.error='';}}
 setCredential(operation,key=''){if(this.credential.operation!==operation||this.credential.key!==key){this.credential={...this.credential,operation,key};this.revision++;this.error='';this.errors={};}}
 setHeaders(headers){if(!same(this.credential.headers,headers)){this.credential.headers=clone(headers);this.revision++;this.error='';this.errors={};}}
 changes(){const patch={};for(const key of PAGE_KEYS[this.page]||[]){let value=this.value[key];if(typeof this.base[key]==='number'&&typeof value==='string'&&(['speakerThreshold','playbackSpeed'].includes(key)?/^(?:\d+(?:\.\d*)?|\.\d+)$/:/^\d+$/).test(value.trim()))value=Number(value);if(!same(this.base[key],value))patch[key]=clone(value);}return patch;}
 get dirty(){return !!Object.keys(this.changes()).length||this.credential.operation!=='keep'||this.page==='llm'&&!same(this.baseHeaders,this.credential.headers);}
 reset(){for(const key of PAGE_KEYS[this.page]||[])this.value[key]=clone(DEFAULTS[key]);this.revision++;this.errors={};this.error='';}
}
function requestTimeoutMs(settings={}){return ((integer(settings.connectTimeoutSeconds,5,120)??30)+(integer(settings.responseTimeoutSeconds,30,600)??240)+30)*1000;}
return {VERSION,PROTOCOLS,PROVIDERS,PRESETS,DEFAULTS,DEFAULT_VOICES,PAGE_KEYS,SPLIT_RULES,clone,same,integer,normalize,validate,validateHeaders,Draft,requestTimeoutMs};
});

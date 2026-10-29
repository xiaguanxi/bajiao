/* Settings forms own drafts; none of their controls mutate the engine directly. */
(()=>{'use strict';
const S=BajiaoSettings,E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TITLES={llm:'语言模型',mimo:'语音引擎',productionmode:'制作模式与识别',voicepolicy:'音色分配',productionpolicy:'网络与并发',quality:'失败与重试',playbackpolicy:'播放设置',readerpolicy:'阅读显示',importpolicy:'新书导入',storagepolicy:'音频存储'};
const SPLITS=[['auto','自动识别'],['chapter_cn','第 X 章／节／回'],['volume_cn','第 X 卷'],['special_cn','楔子／番外／序章'],['chapter_en','Chapter N'],['number_dot','数字点标题'],['paren_num','括号序号'],['bare_num','纯数字行'],['bare_cn_num','纯汉字数字'],['num_chapter','第 N＋空格＋标题'],['custom','自定义模板']];
const CHOICES={promptMode:[['fast','快速模式'],['director','导演模式']],speakerUncertaintyMode:[['narrator','使用旁白继续'],['review','等待人工确认']],roleMergeMode:[['auto','自动合并'],['review','人工确认']],voiceAdoptionMode:[['auto','自动采用'],['review','先试听确认']],taskParallel:[1,2,3].map(n=>[n,n+' 章']),ttsParallel:[1,2,3,4].map(n=>[n,n+' 个请求']),autoProduceCount:[1,2,3].map(n=>[n,'提前 '+n+' 章']),keepRecentCount:[0,1,2,3].map(n=>[n,n?'保留 '+n+' 章':'不保留']),readerFontSize:[16,18,20,22,24].map(n=>[n,n+' px']),readerLineHeight:[[1.6,'紧凑'],[1.9,'适中'],[2.2,'宽松']],llmProtocol:[['openai','OpenAI 兼容'],['anthropic','Anthropic Messages']],splitRule:SPLITS,qualityMode:[['auto','自动重合成一次'],['review','人工处理']]};
const HELP={
 llm:['语言模型','服务地址填写 HTTPS Base URL，模型 ID 按服务商提供的名称填写。支持 OpenAI 兼容和 Anthropic Messages。测试只验证当前草稿；更换服务地址需要填写对应密钥。密钥由 Android Keystore 加密保存。'],
 mimo:['语音引擎','MiMo 按任务选择模型：预设朗读 mimo-v2.5-tts，音色设计 mimo-v2.5-tts-voicedesign，参考音频克隆 mimo-v2.5-tts-voiceclone。测试合成使用短句，会产生服务用量。'],
 productionmode:['制作与识别','快速模式使用简洁朗读指导；导演模式为角色对白补充演绎指导。已标注章节保持原模式，新的标注使用保存后的模式。不确定说话人可以回退旁白并保留原判断，或等待校对。别名合并只决定如何处理模型提出的角色合并建议。'],
 voicepolicy:['音色分配','已有角色绑定优先。指定的默认音色直接使用；普通角色的库内匹配和新设计按确认策略启用。符合条件的龙套沿用现有自动复用规则：原角色累计出场不超过 3 章，且最近 5 个已标注章节未出现。没有匹配音色时再设计。新书导入时保存默认旁白和主角方案，旧书继续沿用原方案；角色归属仍需原文证据。'],
 productionpolicy:['网络与并发','仅 Wi-Fi 策略适用于章节制作、继续制作和片段重做。离开 Wi-Fi 后当前请求完成再等待，保留进度。语音请求并发是所有任务共用的上限，克隆合成仍受模型串行和服务限流约束。连接和响应超时适用于模型请求，保存后从下一次请求开始使用。'],
 quality:['失败与重试','请求重试处理网络错误、超时和服务限流；鉴权、额度和内容拒绝不会反复重试。首次请求不计入追加次数。音频检查发现截断、损坏、空音频或全静音时，可额外重合成一次。两类重试独立计数；重合成请求同样受请求重试上限约束。疑似重复先重试，再在证据充分时尝试裁剪；原始音频保留，不使用 ASR。'],
 playbackpolicy:['播放设置','自动预制作在听书时准备后续章节。关闭后停止自动追加，已在制作的请求与手动队列仍按原规则处理。播放倍速和睡眠定时属于播放控制，可在听书页直接操作；睡眠计时不会随应用重启自动开启。'],
 readerpolicy:['阅读显示','字号和行距同时用于原文和标注页。编辑时只更新样本文字，保存后应用到正文。'],
 importpolicy:['新书导入','默认切章规则只影响后续导入。自定义模板中 * 代表章号，例如「第*章」。导入时仍可选择编码、查看章节预览和调整规则。已有标注或音频的书籍不能直接重新切章。'],
 storagepolicy:['音频存储','自动释放在完播或切章时执行，保留最近指定数量的已完播章节和未播完的当前章节。释放只删除音频，原文和标注保留；再次收听需要重新制作。存储统计的文件数包括章节成品、分句、原始返回和音色样本。手动清理在管理音频页面执行，并先确认影响范围。']
};
function create(ctx){
 let draft=null,overlay=null,overlayClose=null,showKey=false,helpTopic=null;const expanded=new Set();
 const engine=()=>ctx.engine(),isPage=p=>Object.hasOwn(TITLES,p),get=p=>{if(!draft||draft.page!==p){draft=new S.Draft(p,engine().state.settings);showKey=false;expanded.clear();}return draft;};
 const fieldId=key=>({retries:'productionRetries',wifiOnlyProduction:'productionWifiOnly',usePresets:'productionPresets',splitCustom:'productionSplitCustom'}[key]||'setting-'+key.replace('.','-'));
 const read=key=>key.startsWith('defaultVoices.')?draft.value.defaultVoices[key.split('.')[1]]:draft.value[key];
 const voiceLabel=id=>id===null?'按通用规则匹配':id?.startsWith('preset:')?id.slice(7):engine().state.voices.find(v=>v.id===id)?.name||'音色已失效 · 请重新选择';
 const choiceLabel=key=>key.startsWith('defaultVoices.')?voiceLabel(read(key)):(CHOICES[key]||[]).find(([id])=>String(id)===String(read(key)))?.[1]??String(read(key));
 function error(key){return `<small class="settings-field-error" id="error-${E(fieldId(key))}" role="alert">${E(draft.errors[key]||'')}</small>`;}
 function pick(key,label,help='') {return `<div class="settings-field"><button type="button" class="settings-choice" id="${E(fieldId(key))}" data-act="settingspick:${E(key)}" aria-haspopup="dialog" aria-describedby="error-${E(fieldId(key))}"><span><strong>${E(label)}</strong>${help?`<small>${E(help)}</small>`:''}</span><span class="settings-current">${E(choiceLabel(key))}${ctx.icon('chevron-right')}</span></button>${error(key)}</div>`;}
 function toggle(key,label,help=''){return `<div class="settings-field"><label class="settings-choice" for="${fieldId(key)}"><span><strong>${E(label)}</strong>${help?`<small>${E(help)}</small>`:''}</span><input type="checkbox" class="production-switch settings-switch" id="${fieldId(key)}" data-setting="${key}" ${read(key)?'checked':''}></label></div>`;}
 function input(key,label,{numeric=false,help='',placeholder=''}={}){const id=key.startsWith('llm')?key:fieldId(key);return `<div class="settings-field settings-input"><label for="${id}">${E(label)}</label><input id="${id}" data-setting="${key}" type="text" ${numeric?'inputmode="decimal"':''} value="${E(read(key))}" placeholder="${E(placeholder)}" autocomplete="off" aria-describedby="error-${fieldId(key)}" ${draft.errors[key]?'aria-invalid="true"':''}>${help?`<small>${E(help)}</small>`:''}${error(key)}</div>`;}
 function group(title,html){return `<section class="settings-section">${title?`<h3>${E(title)}</h3>`:''}<div class="settings-card">${html}</div></section>`;}
 function advanced(html){return `<details class="settings-advanced" data-settings-details="advanced" ${expanded.has('advanced')?'open':''}><summary>高级设置</summary>${html}</details>`;}
 function credentials(p){const configured=p==='llm'?ctx.configured().llmConfigured:ctx.configured().ttsConfigured,id=p==='llm'?'llmKey':'ttsKey',op=draft.credential.operation;return `<div class="settings-field settings-input"><label for="${id}">API Key <span class="settings-key-status">${op==='clear'?'保存后清除':configured?'已配置':'未配置'}</span></label><div class="settings-key-input"><input id="${id}" data-credential="true" type="${showKey?'text':'password'}" value="${E(draft.credential.key)}" placeholder="${configured?'留空保留已保存的密钥':'填写 API Key'}" autocomplete="off" spellcheck="false"><button type="button" class="vc-icon" data-act="settingskeyvisibility" aria-label="${showKey?'隐藏':'显示'}密钥">${ctx.icon(showKey?'eye-off':'eye')}</button></div><button type="button" class="settings-text-button" data-act="settingskeyclear">${op==='clear'?'撤销清除':'清除已保存的密钥'}</button>${error('credential')}</div>`;}
 function preview(){const s=draft.value;return `<div class="settings-reader-preview" style="font-size:${s.readerFontSize}px;line-height:${s.readerLineHeight}"><small>阅读预览</small><p>雨停了，山雾渐散。翻过一页，故事仍在继续。</p></div>`;}
 function render(p){
  get(p);let body='';
  if(p==='llm')body=group('',pick('llmProtocol','接口协议')+input('llmBase','服务地址',{placeholder:'https://api.example.com/v1'})+input('llmModel','模型 ID',{placeholder:'服务商提供的模型名称'})+credentials(p));
  if(p==='mimo')body=group('',credentials(p));
  if(p==='productionmode')body=group('',pick('promptMode','制作模式','新的章节标注使用此模式。')+pick('speakerUncertaintyMode','说话人不确定时'))+advanced(group('',input('speakerThreshold','说话人置信度阈值',{numeric:true,help:'0–1，越高越严格。'})+pick('roleMergeMode','角色别名合并')));
  if(p==='voicepolicy')body=group('',pick('voiceAdoptionMode','匹配与设计音色确认')+toggle('usePresets','允许自动匹配 MiMo 预设'))+group('新书默认音色',pick('defaultVoices.narrator','旁白')+pick('defaultVoices.maleLead','男主')+pick('defaultVoices.femaleLead','女主'))+'<p class="settings-note">只影响之后导入的新书。</p>';
  if(p==='productionpolicy')body=group('',toggle('wifiOnlyProduction','仅 Wi-Fi 下制作')+pick('taskParallel','同时制作章节')+pick('ttsParallel','语音请求总并发'))+advanced(group('',input('connectTimeoutSeconds','连接超时（秒）',{numeric:true,help:'5–120 秒。'})+input('responseTimeoutSeconds','响应超时（秒）',{numeric:true,help:'30–600 秒。'})));
  if(p==='quality'){const mode=draft.value.qualityAutoRetry!==false&&draft.value.qualityConfirmRetry!==true?'auto':'review';body=group('',input('retries','每个请求最多追加重试',{numeric:true,help:'首次请求不计入；0 表示不重试。'})+`<div class="settings-field"><button type="button" class="settings-choice" data-act="settingspick:qualityMode" aria-haspopup="dialog"><strong>音频异常处理</strong><span class="settings-current">${mode==='auto'?'自动重合成一次':'人工处理'}${ctx.icon('chevron-right')}</span></button></div>`);}
  if(p==='playbackpolicy')body=group('',input('playbackSpeed','播放倍速',{numeric:true,help:'0.5–3 倍。'})+toggle('autoProduceUpcoming','听书时自动预制作')+pick('autoProduceCount','提前制作章数'));
  if(p==='readerpolicy')body=group('',pick('readerFontSize','字号')+pick('readerLineHeight','行距'))+preview();
  if(p==='importpolicy')body=group('',pick('splitRule','默认切章规则')+(draft.value.splitRule==='custom'?input('splitCustom','自定义模板',{help:'* 代表章号，例如：第*章。'}):''));
  if(p==='storagepolicy')body=group('',toggle('autoDeletePlayed','完播自动释放音频','释放后再次收听需要重新制作。')+pick('keepRecentCount','保留已完播章节'))+`<button class="settings-choice settings-management" data-act="go:storage"><strong>管理音频</strong>${ctx.icon('chevron-right')}</button>`;
  const result=draft.result&&draft.result.revision===draft.revision?`<div class="settings-test-result${draft.result.ok?'':' is-error'}" role="status"><strong>${draft.result.ok?'测试成功':'测试失败'}</strong>${draft.result.error?`<p>${E(draft.result.error)}</p>`:''}${draft.result.audioId?'<button class="settings-text-button" data-act="settingstestplay">试听测试音频</button>':''}</div>`:draft.result?'<p class="settings-note" role="status">配置已修改，请重新测试。</p>':'';
  const test=['llm','mimo'].includes(p)?`<div class="settings-test"><button type="button" class="vc-btn secondary" data-act="settingstest" ${draft.testing?'disabled':''}>${draft.testing?'正在测试…':p==='llm'?'测试连接':'测试合成'}</button><small>会调用服务并产生用量。</small></div>${result}`:'';
  return `<div class="settings-editor"><header class="settings-header"><button class="vc-icon" data-act="back" aria-label="返回">${ctx.icon('arrow-left')}</button><h2>${E(TITLES[p])}</h2><button class="vc-icon" data-act="settingshelp:${p}" aria-label="${E(TITLES[p])}帮助">${ctx.icon('circle-help')}</button></header><fieldset class="settings-fields" ${draft.saving?'disabled':''}>${body}${test}<p class="settings-page-error" id="production-setting-error" role="alert">${E(draft.error)}</p>${!['llm','mimo'].includes(p)?'<button type="button" class="settings-reset settings-text-button" data-act="settingsreset">恢复本页默认值</button>':''}</fieldset><footer class="settings-save production-save"><span role="status">${draft.dirty?'有未保存的修改':''}</span><button type="button" class="vc-btn" data-act="settingssave" ${!draft.dirty||draft.saving?'disabled':''}>${draft.saving?'正在保存…':'保存设置'}</button></footer></div>`;
 }
 function home(){const s=engine().state.settings,c=ctx.configured(),row=(p,icon,summary)=>`<button type="button" class="settings-home-row vc-menu" data-act="go:${p}">${ctx.icon(icon)}<span><strong>${E(TITLES[p])}</strong><small>${E(summary)}</small></span>${ctx.icon('chevron-right')}</button>`;
  return `<div class="settings-home"><h1>设置</h1>${group('模型服务',row('llm','brain-circuit',c.llmConfigured?'已配置 · '+(s.llmModel||'语言模型'):'未配置')+row('mimo','audio-lines','MiMo · '+(c.ttsConfigured?'已配置':'未配置')))}${group('制作',row('productionmode','clapperboard',(s.promptMode==='fast'?'快速模式':'导演模式')+' · '+(s.speakerUncertaintyMode==='narrator'?'不确定时使用旁白':'说话人待确认'))+row('voicepolicy','workflow',(s.voiceAdoptionMode==='auto'?'自动采用':'先试听确认')+' · '+(s.usePresets?'可匹配预设':'我的音色优先'))+row('productionpolicy','wifi',(s.wifiOnlyProduction?'仅 Wi-Fi':'不限网络')+' · 同时制作 '+s.taskParallel+' 章')+row('quality','refresh-cw','请求重试 '+s.retries+' 次 · '+(s.qualityAutoRetry&&!s.qualityConfirmRetry?'异常自动重合成':'异常人工处理')))}${group('阅读与播放',row('playbackpolicy','headphones',s.playbackSpeed+' 倍 · '+(s.autoProduceUpcoming?'提前制作 '+s.autoProduceCount+' 章':'自动预制作关闭'))+row('readerpolicy','type',s.readerFontSize+' px · '+(CHOICES.readerLineHeight.find(([n])=>n===s.readerLineHeight)?.[1]||s.readerLineHeight)+'行距'))}${group('导入与存储',row('importpolicy','book-open',SPLITS.find(([id])=>id===s.splitRule)?.[1]||'自动识别')+row('storagepolicy','hard-drive',s.autoDeletePlayed?'自动释放 · 保留 '+s.keepRecentCount+' 章':'自动释放关闭'))}<button class="settings-about-link" data-act="settingshelp:all">帮助与关于${ctx.icon('chevron-right')}</button></div>`;
 }
 function help(){const topics=helpTopic&&HELP[helpTopic]?[[helpTopic,HELP[helpTopic]]]:Object.entries(HELP);return `<div class="settings-help"><header class="settings-header"><button class="vc-icon" data-act="back" aria-label="返回">${ctx.icon('arrow-left')}</button><h2>帮助与关于</h2><span></span></header>${topics.map(([id,[title,copy]])=>`<section class="settings-help-topic"><h3>${E(title)}</h3><p>${E(copy)}</p></section>`).join('')}<p class="settings-version">芭蕉 ${E(ctx.configured().version||'开发版')}</p></div>`;}
 function update(){if(!draft)return;document.querySelectorAll('[data-act="settingssave"]').forEach(el=>{el.disabled=!draft.dirty||draft.saving;});document.querySelectorAll('.settings-save [role=status]').forEach(el=>el.textContent=draft.dirty?'有未保存的修改':'');document.querySelectorAll('.settings-field-error').forEach(el=>el.textContent='');const err=document.querySelector('.settings-page-error');if(err)err.textContent=draft.error;const result=document.querySelector('.settings-test-result');if(result&&draft.result?.revision!==draft.revision){result.className='settings-test-result';result.textContent='配置已修改，请重新测试。';}}
 function changed(event){const el=event.target;if(!draft)return;if(el.dataset.credential){draft.setCredential(el.value?'replace':'keep',el.value);update();return;}const key=el.dataset.setting;if(!key)return;draft.set(key,el.type==='checkbox'?el.checked:el.value);el.removeAttribute('aria-invalid');update();}
 function closeOverlay(){if(!overlayClose)return false;overlayClose();return true;}
 function openPicker(key){
  const focus=document.activeElement;let choices=CHOICES[key]||[],label=focus?.querySelector('strong')?.textContent||'选择';
  if(key.startsWith('defaultVoices.'))choices=(key.endsWith('.narrator')?[]:[[null,'按通用规则匹配']]).concat(Bajiao.PRESETS.map(name=>['preset:'+name,name]),engine().state.voices.filter(v=>v.sample).map(v=>[v.id,v.name]));
  const current=key==='qualityMode'?draft.value.qualityAutoRetry!==false&&!draft.value.qualityConfirmRetry?'auto':'review':read(key);
  const el=document.createElement('div');el.className='vc-modal-overlay settings-picker-overlay';el.innerHTML=`<section class="vc-dialog settings-picker" role="dialog" aria-modal="true" aria-labelledby="settings-picker-title"><header><h3 id="settings-picker-title">${E(label)}</h3><button type="button" class="vc-icon" data-close aria-label="关闭">${ctx.icon('x')}</button></header><div class="settings-picker-options">${choices.map(([id,text],index)=>`<div class="settings-picker-row"><button type="button" data-choice="${index}" class="settings-picker-option${id===current?' selected':''}" aria-pressed="${id===current}"><span>${E(text)}</span>${id===current?ctx.icon('check'):''}</button>${key.startsWith('defaultVoices.')&&id!==null?`<button class="vc-icon" type="button" data-preview="${index}" aria-label="试听${E(text)}">${ctx.icon('play')}</button>`:''}</div>`).join('')}</div></section>`;
  const onKey=e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closeOverlay();}if(e.key==='Tab'){const bs=[...el.querySelectorAll('button')];if(e.shiftKey&&document.activeElement===bs[0]){e.preventDefault();bs.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===bs.at(-1)){e.preventDefault();bs[0].focus();}}};
  overlay=el;overlayClose=()=>{document.removeEventListener('keydown',onKey,true);el.remove();overlay=null;overlayClose=null;const button=document.getElementById(focus?.id);if(button)button.focus({preventScroll:true});};
  document.addEventListener('keydown',onKey,true);el.addEventListener('click',async e=>{if(e.target===el||e.target.closest('[data-close]')){closeOverlay();return;}const preview=e.target.closest('[data-preview]');if(preview){preview.disabled=true;try{await ctx.previewVoice(choices[Number(preview.dataset.preview)][0]);}catch(err){ctx.toast(err.message);}finally{preview.disabled=false;}return;}const b=e.target.closest('[data-choice]');if(b){const value=choices[Number(b.dataset.choice)][0];if(key==='qualityMode'){draft.set('qualityAutoRetry',value==='auto');draft.set('qualityConfirmRetry',value!=='auto');}else draft.set(key,value);closeOverlay();ctx.render();document.getElementById(focus?.id)?.focus({preventScroll:true});}});
  document.getElementById('app').appendChild(el);ctx.icons();el.querySelector('button').focus();
 }
 async function save(){
  if(!draft||draft.saving)return false;const current=draft,checked=S.validate(current.page,current.value,engine().state.voices);current.errors=checked.errors;
  if(['llm','mimo'].includes(current.page)){
   if(current.credential.operation==='replace'&&!current.credential.key.trim())current.errors.credential='请填写 API Key。';
   if(current.page==='llm'&&checked.value.llmBase!==current.base.llmBase&&current.credential.operation!=='replace')current.errors.credential='服务地址已改变，请填写对应密钥。';
  }
  if(Object.keys(current.errors).length){ctx.render();const key=Object.keys(current.errors)[0];document.getElementById(key.startsWith('llm')?key:key==='credential'?current.page==='llm'?'llmKey':'ttsKey':fieldId(key))?.focus();return false;}
  if(current.page==='storagepolicy'&&checked.value.autoDeletePlayed&&(!engine().state.settings.autoDeletePlayed||checked.value.keepRecentCount<engine().state.settings.keepRecentCount)){
   const answer=await ctx.dialog('开启或扩大自动释放？',`<p>完播或切章时将释放保留范围外的已听音频，保留最近 ${checked.value.keepRecentCount} 章。原文与标注保留，再次收听需要重新制作。</p>`,[{id:'save',label:'确认并保存',primary:true},{id:'cancel',label:'继续编辑'}]);if(answer!=='save')return false;
  }
  current.value=checked.value;current.saving=true;ctx.render();
  try{await ctx.commit(current.page,current.changes(),current.credential);if(draft===current){draft=new S.Draft(current.page,engine().state.settings);draft.result=current.result?.revision===current.revision?{...current.result,revision:0}:null;}ctx.toast('设置已保存');return true;}
  catch(err){current.error=err.message||'保存失败，请重试。';return false;}
  finally{current.saving=false;ctx.render();}
 }
 async function test(){
  const current=draft;if(!current||current.testing)return;const checked=S.validate(current.page,current.value,engine().state.voices);current.errors=checked.errors;
  if(current.credential.operation==='clear')current.errors.credential='清除密钥的草稿无法测试，请填写密钥或撤销清除。';
  if(current.page==='llm'&&checked.value.llmBase!==current.base.llmBase&&current.credential.operation!=='replace')current.errors.credential='服务地址已改变，请填写对应密钥。';
  if(Object.keys(current.errors).length){ctx.render();return;}const revision=current.revision;current.testing=true;ctx.render();
  try{const result=await ctx.test(current.page,checked.value,{...current.credential});current.result={ok:true,revision,...result};}
  catch(err){current.result={ok:false,revision,error:err.message||'测试失败'};}
  finally{current.testing=false;if(draft===current)ctx.render();}
 }
 async function action(a,x){
  if(a==='settingshelp'){if(draft&&HELP[x]){await ctx.dialog(HELP[x][0],'<p>'+E(HELP[x][1])+'</p>',[{id:'close',label:'关闭',primary:true}]);}else{helpTopic=x==='all'?null:x;ctx.go('settingshelp');}return;}
  if(a==='settingspick')openPicker(x);
  if(a==='settingssave')await save();
  if(a==='settingsreset'){draft.reset();ctx.render();}
  if(a==='settingskeyvisibility'){showKey=!showKey;const input=document.getElementById(draft.page==='llm'?'llmKey':'ttsKey');if(input){input.type=showKey?'text':'password';input.focus({preventScroll:true});}const button=document.querySelector('[data-act="settingskeyvisibility"]');if(button){button.setAttribute('aria-label',showKey?'隐藏密钥':'显示密钥');button.innerHTML=ctx.icon(showKey?'eye-off':'eye');ctx.icons();}}
  if(a==='settingskeyclear'){draft.setCredential(draft.credential.operation==='clear'?'keep':'clear');ctx.render();}
  if(a==='settingstest')await test();
  if(a==='settingstestplay'&&draft.result?.audioId)await ctx.previewAudio(draft.result.audioId);
 }
 function leave(continuation){if(draft?.saving){ctx.toast('正在保存，请稍候');return true;}if(!draft?.dirty)return false;ctx.dialog('配置尚未保存','<p>保存后此页修改才会生效。</p>',[{id:'save',label:'保存并离开',primary:true},{id:'discard',label:'放弃修改'},{id:'cancel',label:'继续编辑'}]).then(async result=>{if(result==='save'){if(await save()){draft=null;continuation();}}else if(result==='discard'){draft=null;continuation();}});return true;}
 function captureDetails(event){const el=event.target;if(el.matches?.('[data-settings-details]')){if(el.open)expanded.add(el.dataset.settingsDetails);else expanded.delete(el.dataset.settingsDetails);}}
 function revealFocused(){requestAnimationFrame(()=>{if(!draft)return;const input=document.activeElement;if(!input?.matches('.settings-fields input:not([type=checkbox])'))return;const footer=document.querySelector('.settings-save');if(!footer)return;const box=input.getBoundingClientRect(),bottom=footer.getBoundingClientRect().top-12;if(box.bottom>bottom)window.scrollBy(0,Math.ceil(box.bottom-bottom));else if(box.top<12)window.scrollBy(0,Math.floor(box.top-12));});}
 document.addEventListener('toggle',captureDetails,true);
 document.addEventListener('focusin',revealFocused);window.addEventListener('resize',revealFocused);
 return {isPage,render,home,help,get,changed,update,action,save,leave,closeOverlay,hasOverlay:()=>!!overlay,hasAction:a=>a.startsWith('settings'),clear:()=>{closeOverlay();draft=null;},get draft(){return draft;}};
}
window.BajiaoSettingsUI={create};
})();

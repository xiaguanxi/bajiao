(()=>{'use strict';
let engine,configured={},page='shelf',bookId=null,shelfMulti=false,shelfSelected=[],deleteConfirmShelf=null,chapterId=null,voiceId=null,roleName=null,selected=[],multi=false,voiceTab='mine',taskTab='active',candidate=null,imports=[],editSegment=null,pendingSeg=null,history=[],playingId=null,playingBookId=null,playingChapterId=null,designDirty=false,chapterPage=0,episodeModalOpen=false,playerCatalogOpen=false,deleteConfirmBookId=null,batchModalBookId=null,openDropdown=null,dropdownSel={},speedModalOpen=false,listenSettingsOpen=false,bookInfoOpen=false,sleepModalOpen=false,sleepCustomOpen=false,sleepRemainingMs=0,storageStats=null,miniPlayingState=null,lastSeekTime=0,lastSeekPos=0,lastActiveStart='',listenUserHoldUntil=0,listenProgScrollUntil=0,importDraft=null,unmadeChoiceChapterId=null,streamState=null;
let uxDialog=null,recoveryError=null,editorReturn=null,configDirty=false,connectionResult=null,ttsConnectionResult=null,confirmationResult=null,designJob=null,preview=null,storageLoadPending=false,storageError='',lastReadingSave=0,pendingCoverColor=null;

// Each settings page edits an isolated draft; save is explicit.
const productionPages=['voicepolicy','productionpolicy','importpolicy','quality'];
let productionDraft=null,productionDraftPage=null,productionDirty=false,productionDialogClose=null;
function productionDraftFor(p){if(productionDraftPage!==p||!productionDraft){productionDraft={...engine.state.settings};productionDraftPage=p;productionDirty=false;for(const k of ['policyMode','retries','speakerThreshold','taskParallel','ttsParallel','splitRule','promptMode'])delete dropdownSel[k];}return productionDraft;}
function networkLabel(){return {wifi:'已连接 Wi-Fi',other:'当前不是 Wi-Fi',offline:'当前无网络',unknown:'无法确认网络类型'}[engine.productionNetworkState()];}
function settingSwitch(id,label,help,checked){return `<label class="production-setting od-row"><span class="od-field od-fill"><strong>${label}</strong><small>${help}</small></span><input class="production-switch od-fixed" type="checkbox" id="${id}" ${checked?'checked':''}></label>`;}
function productionSettingsHtml(p){const st=productionDraftFor(p);let h='';
if(p==='voicepolicy'){h=top('音色分配')+`<section class="production-section od-stack"><h2>优先沿用已有声音</h2><p class="vc-sub">新小说默认旁白用白桦，男主用苏打，女主用冰糖；其他角色按下方规则分配。</p><ol class="production-flow"><li>保留角色已绑定的音色</li><li>按角色描述匹配我的音色</li><li>没有合适音色时设计新声音</li></ol><p class="vc-sub">更改设置不会替换已有角色绑定。</p>${settingSwitch('productionPresets','允许使用 MiMo 预设','我的音色不合适时，也可匹配预设声音。',st.usePresets)}</section><section class="production-section od-stack"><h2>新声音如何启用</h2><div class="production-options od-stack" role="radiogroup" aria-label="新设计音色确认方式">${[['auto','自动采用（默认）','自动选择新声音，仅异常时需要处理。'],['manual','先试听确认','新设计样本由你确认后使用。']].map(([v,label,help])=>`<button type="button" class="production-choice od-row" role="radio" aria-checked="${(st.mode||'auto')===v}" data-act="settingchoice:${v}"><span class="production-radio" aria-hidden="true"></span><span class="od-field od-fill"><strong>${label}</strong><small>${help}</small></span></button>`).join('')}</div></section><details class="production-section"><summary>高级：说话人确认</summary><p class="vc-sub">自动采用时，低于阈值的说话人以旁白兜底并保留原判断；先试听确认模式下，低于阈值的判断需要人工确认。</p>${dd('speakerThreshold','说话人确认阈值',[['0.3','宽松 · 0.3'],['0.5','适中 · 0.5'],['0.65','严格 · 0.65'],['0.8','很严格 · 0.8']],String(st.speakerThreshold??0.5))}</details>`;}
if(p==='productionpolicy'){h=top('网络与制作')+`<section class="production-section od-stack"><h2>制作模式</h2><p class="vc-sub">可在快速模式与导演模式之间切换。已生成的章节不变，只对新生成章节生效。</p><div class="production-options od-stack" role="radiogroup" aria-label="制作模式">${[['fast','快速模式（默认）','LLM 无需分析情感与生成指导，使用写死提示词（流利，吐字清晰），制作更快。'],['director','导演模式','由 LLM 生成细致的场景和有声书导演指导提示词，演绎更丰富。']].map(([v,label,help])=>`<button type="button" class="production-choice od-row" role="radio" aria-checked="${(st.promptMode||'fast')===v}" data-act="promptmodechoice:${v}"><span class="production-radio" aria-hidden="true"></span><span class="od-field od-fill"><strong>${label}</strong><small>${help}</small></span></button>`).join('')}</div></section><section class="production-section od-stack"><h2>制作网络</h2><p class="production-network-state" role="status">${E(networkLabel())}</p>${settingSwitch('productionWifiOnly','仅 Wi-Fi 下制作','限制章节制作及重新合成；已下载音频仍可播放。',st.wifiOnlyProduction)}<p class="vc-sub">离开 Wi-Fi 后，当前请求完成再等待，已完成进度会保留。无法确认网络时会先提醒。</p></section><section class="production-section od-stack"><h2>制作速度</h2>${dd('taskParallel','同时制作章节',[['1','1 章 · 稳定优先'],['2','2 章'],['3','3 章']],String(st.taskParallel??1))}<details><summary>高级：句子并发</summary><p class="vc-sub">并发越高，请求越密集，也更容易触发服务限流。</p>${dd('ttsParallel','同时合成句数',[['1','1 句 · 最稳'],['2','2 句 · 推荐'],['3','3 句'],['4','4 句 · 易限流']],String(st.ttsParallel??2))}</details></section>`;}
if(p==='importpolicy'){h=top('新书导入')+`<section class="production-section od-stack"><h2>默认切章规则</h2><p class="vc-sub">只影响之后导入的新书。已有书的重新切章仍在书籍详情中操作。</p>${dd('splitRule','标题识别方式',[['auto','自动识别（推荐）'],['chapter_cn','第X章/节/回'],['volume_cn','第X卷'],['special_cn','楔子/番外/序章'],['chapter_en','Chapter N'],['number_dot','数字点标题'],['paren_num','括号序号'],['bare_num','纯数字行'],['bare_cn_num','纯汉字数字'],['num_chapter','第N+空格+标题'],['custom','自定义模板']],st.splitRule||'auto')}${st.splitRule==='custom'?field('自定义模板（* 代表章号）','productionSplitCustom',st.splitCustom||''):''}</section>`;}
if(p==='quality'){const auto=st.qualityAutoRetry!==false&&st.qualityConfirmRetry!==true;h=top('合成异常处理')+`<p class="vc-sub">请求没成功，与音频生成后有问题，是两种不同的重试。</p><section class="production-section od-stack"><h2>请求失败重试</h2><p class="vc-sub">还没取得有效结果时，重新发送同一个请求。适用于文本分析、音色设计和语音合成。</p>${dd('retries','每个请求最多追加重试',[['0','不追加重试'],['1','追加 1 次'],['2','追加 2 次'],['3','追加 3 次']],String(st.retries??2))}<p class="vc-sub">首次请求不计入重试。当前最多尝试 ${1+Number(st.retries??2)} 次；成功即停止。</p><p class="vc-sub">仅处理可恢复的网络错误、超时或服务限流；鉴权失败、额度不足及内容审核拒绝不反复重试。达到上限后显示失败，保留已有进度。</p></section><section class="production-section od-stack"><h2>音频异常重合成</h2><p class="vc-sub">请求已经返回音频，但本地检查发现明确截断、损坏、空音频或全静音时，是否为该片段再合成一次。</p><div class="production-options od-stack" role="radiogroup" aria-label="音频异常处理方式">${[['auto','自动重合成一次','损坏、截断等异常最多追加一次；重复无法修复时保留原音频继续。'],['manual','需要确认','损坏、截断等异常由你重做；重复先重试和尝试截断，仍有问题则等待你确认。']].map(([v,label,help])=>`<button type="button" class="production-choice od-row" role="radio" aria-checked="${auto===(v==='auto')}" data-act="qualitychoice:${v}"><span class="production-radio" aria-hidden="true"></span><span class="od-field od-fill"><strong>${label}</strong><small>${help}</small></span></button>`).join('')}</div><p class="vc-sub">重合成会产生额外合成用量。手动重新合成失败时不会再自动追加一次。</p></section><section class="production-section od-stack"><h2>重复朗读处理</h2><p class="vc-sub">长停顿和时长偏离保留本地提示。疑似重复先重合成一次，仍异常时，仅在中间长静音、前后整段声学高度相似且原文没有对应重复的情况下尝试截断；原始返回始终保留。不使用 ASR。</p></section><p class="footer-note">两种重试独立计数：音频重合成发出的请求，也遵守上方的请求失败重试上限。重发请求可能增加服务用量；保存设置不会立即开始重试。</p>`;}
return h+`<footer class="production-save od-stack"><p id="production-setting-error" role="alert"></p><p class="vc-sub" role="status">${productionDirty?'有未保存的修改':'设置已保存；保存不会启动制作'}</p><button type="button" class="vc-btn full" data-act="saveproductionsettings">保存设置</button></footer>`;
}
function productionDialog(title,body,options){if(productionDialogClose)return Promise.resolve('cancel');const focus=document.activeElement;return new Promise(resolve=>{const overlay=document.createElement('div');overlay.className='vc-modal-overlay production-dialog-overlay';overlay.innerHTML=`<section class="vc-dialog production-dialog od-stack" role="dialog" aria-modal="true" aria-labelledby="production-dialog-title" data-theme="light"><header class="od-row"><h2 class="od-fill" id="production-dialog-title">${E(title)}</h2><button type="button" class="vc-icon od-touch" aria-label="关闭">×</button></header><div class="production-dialog-copy">${body}</div><div class="od-stack">${options.map(o=>`<button type="button" class="vc-btn ${o.primary?'':'secondary'}" data-result="${o.id}" ${o.disabled?'disabled':''}>${o.label}</button>`).join('')}</div></section>`;const close=value=>{document.removeEventListener('keydown',keys,true);overlay.remove();productionDialogClose=null;if(focus?.isConnected)focus.focus({preventScroll:true});resolve(value);};productionDialogClose=close;const keys=event=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close('cancel');}if(event.key==='Tab'){const buttons=[...overlay.querySelectorAll('button:not(:disabled)')];if(event.shiftKey&&document.activeElement===buttons[0]){event.preventDefault();buttons.at(-1).focus();}else if(!event.shiftKey&&document.activeElement===buttons.at(-1)){event.preventDefault();buttons[0].focus();}}};document.addEventListener('keydown',keys,true);overlay.addEventListener('click',event=>{if(event.target===overlay||event.target.closest('[aria-label="关闭"]'))close('cancel');const b=event.target.closest('[data-result]');if(b&&!b.disabled)close(b.dataset.result);});document.getElementById('app').appendChild(overlay);overlay.querySelector('button').focus();});}
function productionLeave(continuation){if(!productionPages.includes(page)||!productionDirty)return false;productionDialog('放弃未保存的修改？','<p>此页的修改尚未生效。</p>',[{id:'cancel',label:'继续编辑',primary:true},{id:'discard',label:'放弃修改'}]).then(result=>{if(result==='discard'){productionDirty=false;productionDraft=null;productionDraftPage=null;continuation();}});return true;}
async function authorizeProduction(items){const n=engine.productionNetworkState();if(n!=='offline'&&(!engine.state.settings.wifiOnlyProduction||n==='wifi'))return true;const names=items.map(x=>{try{return engine.chapter(x.bookId,x.chapterId).title;}catch{return '';}});const body=`<p>${E(networkLabel())}。${n==='offline'?'请先连接网络，再重试制作。':'制作会上传文本并下载音频，可能消耗移动流量。'}</p><p>${items.length>1?'所选 '+items.length+' 章：':''}${E(names.slice(0,2).join('、'))}${names.length>2?' 等':''}</p><p>仅本次允许只适用于以上章节，不包括自动接续的新章节。</p>`;const result=await productionDialog('制作网络提醒',body,[{id:'cancel',label:'暂不制作',primary:true},{id:'once',label:'仅本次允许',disabled:n==='offline'},{id:'off',label:'关闭限制并继续',disabled:n==='offline'},{id:'retry',label:'重新检查网络'}]);if(result==='retry')return authorizeProduction(items);if(result==='cancel')return false;if(engine.productionNetworkState()==='offline'){toast('当前无网络，请连接后重试');return false;}if(result==='off'){engine.state.settings.wifiOnlyProduction=false;if(productionDraft)productionDraft.wifiOnlyProduction=false;await engine.persist();engine.refreshProductionNetwork().catch(()=>{});}else if(result==='once')engine.grantProductionScope(items);return true;}
const productionReplay=new WeakSet();
function productionActionScope(a,x){const tasks=engine.state.tasks,task=t=>({bookId:t.bookId,chapterId:t.chapterId});if(a==='enqueue')return selected.map(cid=>({bookId,chapterId:cid}));if(['producechapter','resumechapter'].includes(a)){const c=book()?.chapters.find(c=>c.id===x);if(c?.audio&&!c.audioStale)return [];return [{bookId,chapterId:x}];}if(a==='makeandlisten'){const cid=unmadeChoiceChapterId||x,t=chapterTask(bookId,cid);return isChapterProducing(t)?[]:[{bookId,chapterId:cid}];}if(['resume','remake'].includes(a)){const t=tasks.find(t=>t.id===x);return t?[task(t)]:[];}if(a==='resumeall')return tasks.filter(t=>['paused','failed'].includes(t.status)||t.status==='running'&&t.pauseRequested).map(task);if(a==='retryfailed')return tasks.filter(t=>t.status==='failed').map(task);if(['regenerateseg','regenerateprompt'].includes(a))return [{bookId,chapterId}];if(['ignorerole','ignorespeaker','ignoreall','acceptrole','acceptsuggested'].includes(a))return tasks.filter(t=>t.bookId===bookId&&t.status==='waiting').map(task);return [];}
window.addEventListener('click',async event=>{if(!engine||productionReplay.has(event))return;const el=event.target.closest('[data-act]');if(!el||el.disabled)return;const act=el.dataset.act,i=act.indexOf(':'),a=i<0?act:act.slice(0,i),x=i<0?'':act.slice(i+1);
if(a==='qualitychoice'&&page==='quality'){event.preventDefault();event.stopImmediatePropagation();const st=productionDraftFor(page);st.qualityAutoRetry=x==='auto';st.qualityConfirmRetry=x!=='auto';productionDirty=true;render();return;}
if(a==='promptmodechoice'){event.preventDefault();event.stopImmediatePropagation();productionDraftFor(page).promptMode=x;productionDirty=true;render();return;}
if(a==='settingchoice'){event.preventDefault();event.stopImmediatePropagation();productionDraftFor(page).mode=x;productionDirty=true;render();return;}
if(a==='pickopt'&&productionPages.includes(page)){const [id,v]=x.split('|'),map={policyMode:'mode',speakerThreshold:'speakerThreshold',taskParallel:'taskParallel',ttsParallel:'ttsParallel',retries:'retries',splitRule:'splitRule'};if(map[id]){productionDraftFor(page)[map[id]]=['speakerThreshold','taskParallel','ttsParallel','retries'].includes(id)?Number(v):v;productionDirty=true;}}
if(a==='saveproductionsettings'){event.preventDefault();event.stopImmediatePropagation();const st=productionDraftFor(page),keys=page==='voicepolicy'?['mode','usePresets','speakerThreshold']:page==='productionpolicy'?['wifiOnlyProduction','taskParallel','ttsParallel','promptMode']:page==='quality'?['retries','qualityAutoRetry','qualityConfirmRetry']:['splitRule','splitCustom'];if(st.splitRule==='custom'&&page==='importpolicy'&&!String(st.splitCustom||'').trim()){document.getElementById('production-setting-error').textContent='请填写自定义模板，或选择自动识别。';document.getElementById('productionSplitCustom')?.focus();return;}const before={...engine.state.settings};for(const k of keys)if(st[k]!==undefined)engine.state.settings[k]=st[k];try{await engine.persist();productionDirty=false;toast('设置已保存');engine.refreshProductionNetwork().catch(()=>{});render();}catch(error){Object.assign(engine.state.settings,before);document.getElementById('production-setting-error').textContent='保存失败，请重试。';}return;}
if(a==='productionnetworksettings'){event.preventDefault();event.stopImmediatePropagation();go('productionpolicy');return;}
const items=productionActionScope(a,x);if(!items.length)return;const n=engine.productionNetworkState();if(n!=='offline'&&(!engine.state.settings.wifiOnlyProduction||n==='wifi'))return;event.preventDefault();event.stopImmediatePropagation();try{if(await authorizeProduction(items)){const current=[...document.querySelectorAll('[data-act]')].find(b=>b.dataset.act===act&&!b.disabled);if(current){const replay=new MouseEvent('click',{bubbles:true,cancelable:true});productionReplay.add(replay);current.dispatchEvent(replay);}}}catch(error){toast('未能开始制作：'+cleanErr(error));}
},true);
document.addEventListener('change',event=>{if(!productionPages.includes(page))return;const map={productionPresets:'usePresets',productionWifiOnly:'wifiOnlyProduction'};if(map[event.target.id]){productionDraftFor(page)[map[event.target.id]]=event.target.checked;productionDirty=true;const note=document.querySelector('.production-save [role=status]');if(note)note.textContent='有未保存的修改';}});
document.addEventListener('input',event=>{if(event.target.id==='productionSplitCustom'){productionDraftFor(page).splitCustom=event.target.value;productionDirty=true;const note=document.querySelector('.production-save [role=status]');if(note)note.textContent='有未保存的修改';}});
window.addEventListener('productionnetworkchange',()=>{if(engine&&['productionpolicy','policy','tasks','task'].includes(page))render();});

let playbackPrompts=null;
const segmentAdvancedOpen=new Set();
let segmentPanel=null;
const segmentPromptDrafts=new Map();
function appliedSegmentPrompt(b,s){
 const role=b.characters.find(r=>r.name===s.speaker);
 return engine.speechDirection(role?.voice,s.emotion,role?.description,s.ttsPrompt,s);
}
function segmentPromptValue(b,c,s){const key=segmentAdvancedKey(b,c,s);return segmentPromptDrafts.has(key)?segmentPromptDrafts.get(key):appliedSegmentPrompt(b,s);}
function segmentSubmitLabel(b,c,s){return engine.segmentBusy(b.id,c.id,s.id)?'正在合成…':segmentPromptValue(b,c,s)!==appliedSegmentPrompt(b,s)?(s.audio&&s.audio!=='skip'?'应用修改并重新合成':'应用提示词并合成'):s.audio&&s.audio!=='skip'?'重新合成本段':'合成本段';}
function syncSegmentPromptDraft(){
 const s=panelSegment();if(!s)return;
 const changed=segmentPromptValue(book(),chapter(),s)!==appliedSegmentPrompt(book(),s),status=document.getElementById('segment-prompt-status'),submit=document.querySelector('.vc-segment-footer [data-act^="regenerateprompt:"]');
 if(status){status.textContent=changed?'已修改，合成后生效':'编辑后合成生效';status.classList.toggle('is-dirty',changed);}
 if(submit)submit.textContent=segmentSubmitLabel(book(),chapter(),s);
}
function panelSegment(){if(!segmentPanel||page!=='annotated'||segmentPanel.bookId!==bookId||segmentPanel.chapterId!==chapterId)return null;return chapter().segments?.find(s=>String(s.id)===segmentPanel.id)||null;}
function segmentPanelHtml(){
 const s=panelSegment();if(!s)return '';
 const b=book(),c=chapter(),index=c.segments.indexOf(s)+1,busy=engine.segmentBusy(b.id,c.id,s.id),skipped=s.skip||s.isAd||s.audio==='skip',role=b.characters.find(r=>r.name===s.speaker),audio=s.audio&&s.audio!=='skip'?s.audio:null;
 const state=busy?'正在合成':skipped?'已跳过':s.retryError?'重做失败':audio?'已合成':s.qualityStatus==='pending'?'待处理':'待合成';
 const row=(icon,label,help,act,disabled=false)=>`<button type="button" class="vc-segment-action od-row" data-act="${E(act)}" ${disabled?'disabled':''}>${I(icon)}<span class="od-field od-fill"><strong>${E(label)}</strong><small>${E(help)}</small></span></button>`;
 return `<div class="vc-modal-overlay vc-segment-overlay" data-act="closesegment">
 <section class="vc-dialog vc-segment-sheet" data-theme="light">
 <header class="vc-segment-heading od-row"><div class="od-field od-fill"><small>第 ${index} 段 · ${E(s.speaker)}</small><h3>朗读设置</h3></div><button type="button" class="vc-icon od-touch" data-act="closesegment" aria-label="关闭朗读设置">${I('x')}</button></header>
 <div class="vc-segment-body od-scroll" id="segment-panel-scroll">
 <section class="vc-segment-context od-stack"><div class="od-row"><strong class="od-fill">朗读原文</strong><span class="vc-segment-state">${state}</span></div><p>${E(s.text)}</p><small>音色 · ${E(role?.voice?voiceLabel(role.voice):'尚未分配')}</small></section>
 <section class="vc-segment-audition">${row('play','试听本段',audio?'播放当前音频'+(s.durMs?' · '+fmt(s.durMs/1000):''):'合成音频后可试听','segmentpreview:'+s.id,!audio)}${segmentPanel.playError?`<p class="vc-segment-error" role="alert">${E(segmentPanel.playError)}</p>`:''}</section>
 ${segmentAdvancedOptions(b,c,s)}
 <section class="vc-segment-feedback">${segmentQualityControls(b,c,s,false)}${s.failReason&&!s.retryError?`<p class="vc-segment-error" role="status">${E(s.failReason)}</p>`:''}${s.speechDraft?.pendingRaw?.file?.id&&s.speechDraft.pendingRaw.playable!==false?row('headphones','试听原始返回','核对未通过检查的音频','play:'+s.speechDraft.pendingRaw.file.id):''}${segmentPanel.result?`<p class="vc-segment-result" role="status">${E(segmentPanel.result)}</p>`:''}</section>
 </div><footer class="vc-segment-footer"><p class="vc-segment-notice">${busy?'正在合成本段，可关闭面板等待。':skipped?'此段不参与朗读，无法合成。':!role?.voice?'请先在角色与音色中分配音色。':'仅更新本段，失败保留原音频。合成会使用服务用量。'}</p><button type="button" class="vc-btn full" data-act="regenerateprompt:${s.id}" ${busy||skipped||!role?.voice?'disabled':''}>${segmentSubmitLabel(b,c,s)}</button></footer>
 </section></div>`;
}
document.addEventListener('input',event=>{const field=event.target;if(field.matches('[data-tts-prompt]')&&panelSegment()){segmentPromptDrafts.set(segmentAdvancedKey(book(),chapter(),panelSegment()),field.value);syncSegmentPromptDraft();}});
let renderedListenSignature='';
function listenSignature(){if(page!=='listen')return '';const c=chapter(),t=engine.state.tasks.find(t=>t.bookId===bookId&&t.chapterId===chapterId&&!['done','cancelled'].includes(t.status));return chapterId+'|'+c.audio+'|'+(c.audioTimeline?.audio||'')+'|'+(c.segments||[]).map(s=>s.audio+':'+s.qualityStatus+':'+s.skip).join(',')+'|'+t?.status+'|'+t?.done;}
function roleVoiceStatus(b,r){if(r.voice)return '已绑定';if(r.candidate)return '候选待确认';if(designJob?.running&&designJob.bookId===b.id&&designJob.roleName===r.name||engine.roleDesignJobs?.has(b.id+':role:'+r.name))return '设计中';if(r.suggestedVoice)return '匹配待确认';if(engine.state.tasks.some(t=>t.bookId===b.id&&t.status==='running'&&/匹配/.test(t.phase||'')))return '匹配中';return '未分配';}
let voiceSearch='',voiceGender='all',voiceAge='all',voiceSource='all',readerOptionsOpen=false;
let chooseTab='mine';
let catalogWindow=null,catalogKey='',catalogProgressId=null,catalogRequestId=null,catalogAlignId=null,catalogReady=false,catalogFrame=0,catalogLastScroll=0,catalogScrollDirection=0,catalogRenderToken=0;
let catalogSheet=null,catalogSheetState={progress:0},catalogRenderPending=false;
function syncCatalogSheet(entering){
 const main=page==='detail'?document.querySelector('.vc-main'):null;
 if(catalogSheet?.main===main&&!entering)return;
 catalogSheet?.destroy();catalogSheet=null;catalogRenderPending=false;
 if(entering)catalogSheetState={progress:0};
 if(main?.querySelector('.vc-catalog-handle'))catalogSheet=new BajiaoCatalogSheet(main,catalogSheetState,{
  blocked:()=>page!=='detail'||hasModal()||!!productionDialogClose,
  onIdle:()=>{if(catalogRenderPending){catalogRenderPending=false;setTimeout(render,0);}},
  onResize:()=>sizeCatalogTail(),
  beforeScroll:delta=>{while(delta<0&&catalogWindow?.start>0&&document.getElementById('catalog-scroll').scrollTop < -delta)extendCatalog(-1);}
 });
}
function catalogRow(id){return Array.from(document.querySelectorAll('#chapter-list [data-chapter-id]')).find(el=>el.dataset.chapterId===id);}
function prepareCatalog(b,chapters,entering){
 catalogProgressId=BajiaoCatalog.progressChapter(b,engine.state.lastPlayback,{bookId:playingBookId,chapterId:playingChapterId,playing:miniPlayingState?.playing});
 const key=JSON.stringify([b.id,chapters.map(c=>c.id)]);
 if(entering||catalogKey!==key||catalogRequestId||!catalogWindow){
  const target=catalogRequestId||(entering?catalogProgressId:chapters[0]?.id);
  catalogWindow=new BajiaoCatalog.ChapterWindow(chapters,target,innerHeight);catalogKey=key;
  chapterPage=Math.floor(Math.max(0,chapters.findIndex(c=>c.id===target))/50);
  catalogAlignId=catalogRequestId||(entering?catalogProgressId:null);catalogRequestId=null;
 }else catalogWindow.chapters=chapters;
}
function captureCatalogAnchor(){
 const top=Math.max(0,document.getElementById('catalog-heading')?.getBoundingClientRect().bottom||0);
 const rows=document.getElementById('chapter-list')?.children;if(!rows?.length)return null;
 // Rows are ordered vertically; avoid laying out every earlier chapter on
 // every scroll frame after browsing a long novel.
 let low=0,high=rows.length;
 while(low<high){const mid=(low+high)>>>1;if(rows[mid].getBoundingClientRect().bottom<=top+1)low=mid+1;else high=mid;}
 const row=rows[low],rect=row?.getBoundingClientRect();
 return rect&&rect.top<innerHeight?{id:row.dataset.chapterId,top:rect.top,index:low}:null;
}
function sizeCatalogTail(){
 const tail=document.getElementById('catalog-tail'),list=document.getElementById('chapter-list');if(!tail||!list)return;
 const viewport=document.getElementById('catalog-scroll');
 tail.style.height=catalogWindow.end===catalogWindow.chapters.length&&list.lastElementChild?Math.max(0,(viewport?.clientHeight||0)-list.lastElementChild.offsetHeight)+'px':'0px';
}
function syncCatalogViewport(anchor){
 const token=++catalogRenderToken;catalogReady=false;if(page!=='detail')return;
 sizeCatalogTail();
 requestAnimationFrame(()=>{
  if(page!=='detail'||token!==catalogRenderToken)return;
  const target=catalogAlignId&&catalogRow(catalogAlignId);
  const viewport=document.getElementById('catalog-scroll');if(!viewport)return;
  if(target){window.scrollTo(0,0);viewport.scrollTop+=Math.ceil(target.getBoundingClientRect().top-viewport.getBoundingClientRect().top);}
  else if(anchor){const row=catalogRow(anchor.id);if(row)viewport.scrollTop+=row.getBoundingClientRect().top-anchor.top;}
  catalogAlignId=null;catalogLastScroll=viewport.scrollTop;catalogReady=true;
 });
}
function extendCatalog(direction){
 const list=document.getElementById('chapter-list');if(!list||!catalogWindow||!direction)return;
 const anchor=direction<0?captureCatalogAnchor():null,rows=catalogWindow.grow(direction,innerHeight,list.firstElementChild?.offsetHeight||72);
 if(!rows.length)return;
 const fragment=document.createRange().createContextualFragment(rows.map(c=>catalogChapterRow(book(),c)).join(''));
 lucide.createIcons({root:fragment,attrs:{width:20,height:20}});
 list.insertBefore(fragment,direction<0?list.firstChild:null);sizeCatalogTail();
 const viewport=document.getElementById('catalog-scroll');
 if(direction<0&&anchor){const row=catalogRow(anchor.id);if(row&&viewport)viewport.scrollTop+=row.getBoundingClientRect().top-anchor.top;}
 catalogLastScroll=viewport?.scrollTop||0;
}
document.addEventListener('scroll',event=>{
 if(event.target.id!=='catalog-scroll')return;
 const direction=Math.sign(event.target.scrollTop-catalogLastScroll);catalogLastScroll=event.target.scrollTop;
 if(page!=='detail'||!catalogReady||hasModal()||!direction)return;
 catalogScrollDirection=direction;if(catalogFrame)return;
 catalogFrame=requestAnimationFrame(()=>{
  catalogFrame=0;if(page!=='detail'||!catalogReady||hasModal())return;
  const list=document.getElementById('chapter-list');if(!list?.firstElementChild)return;
  const row=captureCatalogAnchor();if(row)chapterPage=Math.floor((catalogWindow.start+row.index)/50);
  if(catalogScrollDirection<0&&list.firstElementChild.getBoundingClientRect().top>-innerHeight)extendCatalog(-1);
  if(catalogScrollDirection>0&&list.lastElementChild.getBoundingClientRect().bottom<innerHeight*2)extendCatalog(1);
 });
},{passive:true,capture:true});
function chapterTask(bid,cid){return engine.state.tasks.find(t=>t.bookId===bid&&t.chapterId===cid&&!['done','cancelled'].includes(t.status));}
function isChapterProducing(task){return !!task&&['queued','running'].includes(task.status);}
function catalogChapterRow(b,c,player=false){
 const globalIndex=b.chapters.indexOf(c)+1,current=c.id===(player?chapterId:catalogProgressId),managing=multi&&!player;
 const task=chapterTask(b.id,c.id),producing=isChapterProducing(task),waiting=task?.status==='waiting'||!task&&c.status==='waiting';
 const action=c.audio?'resumechapter:'+c.id:waiting?'confirm:'+c.id:task&&['paused','failed'].includes(task.status)?'resume:'+task.id:'producechapter:'+c.id;
 const caption=producing?'制作中':c.listened||c.audioCleared&&!c.audio?'已听完':'';
 const metadata=c.audio?`${I('clock')}<span>${fmt(c.duration||0)}</span>`:`${textLen(c)} 字`;
 const control=`<div class="vc-chapter-action${caption?' has-caption':''}"><button type="button" class="vc-icon ${c.audio?'vc-chapter-play':'vc-chapter-produce'}" data-act="${E(action)}" aria-label="${c.audio?'播放':'制作'}${E(c.title)}">${I(c.audio?'play':'wand-sparkles')}</button>${caption?`<small class="vc-chapter-caption">${caption}</small>`:''}</div>`;
 return `<div role="listitem" data-chapter-id="${E(c.id)}" aria-posinset="${globalIndex}" aria-setsize="${b.chapters.length}" ${current?'aria-current="location"':''} class="vc-chapter ${current?'vc-chapter-current':''}">${managing?`<input type="checkbox" data-check="${E(c.id)}" ${selected.includes(c.id)?'checked':''} aria-label="选择${E(c.title)}">`:`<span class="vc-num">${globalIndex}</span>`}<button type="button" class="vc-chapter-title" data-act="${E(managing?'togglechapter:'+c.id:player?'listenpick:'+c.id:waiting?'confirm:'+c.id:'read:'+c.id)}"><span class="vc-chapter-name">${E(c.title)}</span><small class="vc-chapter-meta" ${c.audio?'aria-label="音频时长"':''}>${metadata}</small></button>${managing?'':control}</div>`;
}

function errorMarkup(message){if(!message)return '';const original=String(message?.detail||message?.message||message),friendly=cleanErr(message);return `${E(friendly)}${friendly!==original?`<details class="vc-error-detail"><summary>诊断详情</summary><code>${E(original)}</code></details>`:''}`;}
function needsSpeakerConfirmation(s){
 return engine.state.settings.mode!=='auto'&&!s.skip&&!s.isAd&&s.speaker!=='广告'&&(s.annotationStatus!=='pending'||s.annotationError)&&s.annotationStatus!=='fallback'&&!!(s.annotationError||s.confidence<engine.spkThr()||!book().characters.some(r=>r.name===s.speaker));
}
function needsVoiceConfirmation(s){return engine.state.settings.mode!=='auto'&&!s.skip&&!s.isAd&&!['广告','旁白'].includes(s.speaker)&&book().characters.some(r=>r.name===s.speaker&&!r.voice&&!['匹配中','设计中'].includes(roleVoiceStatus(book(),r)));}
function needsProductionResume(s){return !s.audio&&!s.skip&&!s.isAd&&s.speaker!=='广告'&&engine.state.tasks.some(t=>t.bookId===bookId&&t.chapterId===chapterId&&t.status==='waiting'&&!t.networkWaiting);}
function productionIssueHtml(s){
 if(!needsProductionResume(s)||s.qualityStatus==='pending'||s.retryError||needsSpeakerConfirmation(s)||needsVoiceConfirmation(s))return '';
 const t=engine.state.tasks.find(t=>t.bookId===bookId&&t.chapterId===chapterId&&t.status==='waiting'),role=book().characters.find(r=>r.name===s.speaker);
 const action=s.annotationStatus==='failed'||!role?L('修改说话人','editseg:'+s.id):!role.voice?L('分配角色音色','chooserole:'+s.speaker):L('继续制作本章','resume:'+t.id);
 const reason=s.annotationStatus==='failed'?'本句标注未完成':!role?'本句角色不可用':!role.voice?'本角色尚未分配音色':'本句尚未合成，继续制作会保留已完成音频';
 return `<div class="vc-production-issue-detail"><p class="vc-sub">${E(reason)}</p><div class="vc-issue-actions">${action}</div></div>`;
}
function readingIssues(){return (chapter().segments||[]).filter(s=>!s.skip&&!s.isAd&&s.speaker!=='广告'&&(s.retryError||s.qualityStatus==='pending'&&!s.audio||needsSpeakerConfirmation(s)||needsVoiceConfirmation(s)||needsProductionResume(s)));}
function readerSettingsHtml(){
 const s=engine.state.settings,font=Number(s.readerFontSize)||16,line=Number(s.readerLineHeight)||1.6;
 const option=(label,action,active)=>`<button type="button" class="vc-reading-option${active?' selected':''}" data-act="${action}" aria-pressed="${active}">${label}</button>`;
 return `<div class="vc-reading-settings"><p class="vc-reading-intro">先预览字号与行距，完成后应用到正文。</p><section><h4>字号 <span id="reader-font-value">${font} px</span></h4><div class="vc-reading-options font-options">${[16,18,20,22,24].map(n=>option(n,'readerfont:'+n,font===n)).join('')}</div></section><section><h4>行距</h4><div class="vc-reading-options">${[[1.6,'紧凑'],[1.9,'适中'],[2.2,'宽松']].map(([n,label])=>option(label,'readerline:'+n,line===n)).join('')}</div></section><div class="vc-reading-preview" style="--sample-font:${font}px;--sample-line:${line}"><small>阅读示例</small><p>雨停了，山雾渐散。翻过一页，故事仍在继续。</p></div></div>`;
}
function syncReadingSettings(){
 const root=document.querySelector('.vc-reading-settings');if(!root)return;
 const font=Number(engine.state.settings.readerFontSize)||16,line=Number(engine.state.settings.readerLineHeight)||1.6;
 root.querySelector('#reader-font-value').textContent=font+' px';
 root.querySelector('.vc-reading-preview').style.setProperty('--sample-font',font+'px');
 root.querySelector('.vc-reading-preview').style.setProperty('--sample-line',line);
 for(const button of root.querySelectorAll('[data-act]')){const [action,value]=button.dataset.act.split(':'),selected=Number(value)===(action==='readerfont'?font:line);button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));}
}
function focusReadingSegment(id){
 const row=Array.from(document.querySelectorAll('[data-seg]')).find(el=>el.dataset.seg===String(id));if(!row)return false;
 row.scrollIntoView({block:'center',behavior:'instant'});
 __slimContext=page+'|'+bookId+'|'+chapterId;__slimLastY=window.scrollY;__slimOffset=0;
 document.getElementById('app').style.setProperty('--reader-header-offset','0px');const header=document.querySelector('.vc-slim-top');if(header)header.inert=false;
 row.classList.remove('vc-flash');requestAnimationFrame(()=>row.classList.add('vc-flash'));row.setAttribute('tabindex','-1');row.focus({preventScroll:true});setTimeout(()=>row.classList.remove('vc-flash'),1800);return true;
}
function staleNoticeKey(){const c=chapter();return JSON.stringify([bookId,chapterId,c.audio||c.originalAudio||'']);}
function askLeave(next){uxDialog={title:'配置尚未保存',html:'<p>当前页面有未保存的配置。可以先取消并保存，或放弃这些修改。</p>',confirmLabel:'放弃修改并离开',confirm:async()=>{configDirty=false;next();}};render();}
function rememberReading(){if(!engine||!['raw','annotated'].includes(page)||!bookId||!chapterId)return;const b=book();b.readProgress={chapterId,mode:page,scroll:window.scrollY,at:Date.now()};if(Date.now()-lastReadingSave>3000){lastReadingSave=Date.now();engine.persist().catch(()=>{});}}
function restoreEditorPosition(){if(!editorReturn)return;requestAnimationFrame(()=>{const row=document.querySelector('[data-seg="'+editorReturn.segmentId+'"]');if(row){row.scrollIntoView({block:'center'});row.classList.add('vc-flash');}else window.scrollTo(0,editorReturn.scroll);});}
async function refreshStorage(showToast=false){if(storageLoadPending)return;storageLoadPending=true;storageError='';try{storageStats=await device.call('audioStats');if(showToast)toast('已刷新存储统计');}catch(e){storageError=cleanErr(e);}finally{storageLoadPending=false;if(page==='storage')render();}}
async function saveLLMForm(){const base=value('llmBase').trim().replace(/\/$/,''),model=value('llmModel').trim(),key=value('llmKey');if(!base||!model)throw Error('请填写 Base URL 和模型 ID');let parsed;try{parsed=new URL(base);}catch(e){throw Error('请填写完整服务地址');}if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash)throw Error('请填写不含账号、查询参数和片段的 HTTPS Base URL');await device.call('saveCredentials',{llmKey:key,llmBase:base});Object.assign(engine.state.settings,{llmBase:base,llmModel:model,llmUserConfigured:true,llmProtocol:dropdownSel.llmProtocol||engine.state.settings.llmProtocol});configDirty=false;await engine.persist();configured=await device.call('load');const input=$('#llmKey');if(input)input.value='';}
async function saveTTSForm(){await device.call('saveCredentials',{ttsKey:value('ttsKey')});configDirty=false;configured=await device.call('load');const input=$('#ttsKey');if(input)input.value='';}
function voiceFilters(){return `<div class="vc-voice-search">${field('搜索音色名称、描述或编号','voiceSearch',voiceSearch)}<div class="vc-filter-row">${[['voiceGender','性别',voiceGender,[['all','全部性别'],['f','女性'],['m','男性'],['unknown','未注明']]],['voiceAge','年龄',voiceAge,[['all','全部年龄'],['child','儿童'],['young','少年 / 青年'],['middle','中年'],['old','老年']]],['voiceSource','来源',voiceSource,[['all','全部来源'],['import','导入'],['design','设计'],...(page==='choose'?[['preset','MiMo 预设']]:[])]]].map(([id,label,current,opts])=>`<label>${label}<select id="${id}">${opts.map(([id,text])=>`<option value="${id}" ${current===id?'selected':''}>${text}</option>`).join('')}</select></label>`).join('')}</div></div>`;}
function filteredVoices(includePresets=false){const bound=page==='choose'?book().characters.find(r=>r.name===roleName)?.voice:null;const voices=includePresets?engine.state.voices.concat(Bajiao.PRESETS.map(name=>({id:'preset:'+name,name,description:Bajiao.presetDesc(name),source:'preset'}))):engine.state.voices;return voices.filter(v=>{if(page==='voices')return true;const desc=v.description||'',gender=Bajiao.genderOf(desc)||'unknown',n=Bajiao.cnAgeNum(desc),age=n==null?(/儿童/.test(desc)?'child':/少年|青年/.test(desc)?'young':/中年/.test(desc)?'middle':/老年/.test(desc)?'old':'unknown'):n<13?'child':n<40?'young':n<60?'middle':'old';return (!voiceSearch||(v.name+' '+desc+' '+v.id).toLowerCase().includes(voiceSearch.toLowerCase()))&&(voiceGender==='all'||voiceGender===gender)&&(voiceAge==='all'||voiceAge===age)&&(voiceSource==='all'||voiceSource===v.source);}).sort((a,b)=>(b.id===bound)-(a.id===bound)||(b.lastUsedAt||0)-(a.lastUsedAt||0));}
let voiceEditor=null,voiceLeaveNext=null;
function voiceDraft(){const v=voice();if(!voiceEditor||voiceEditor.id!==v.id)voiceEditor={id:v.id,name:v.name,description:v.description||'',enabled:!!v.enabled,text:'山里的风停了，故事才刚刚开始。',trialOpen:false,infoOpen:false,status:'',error:'',working:false,candidate:null,candidateDescription:'',trial:null};return voiceEditor;}
function captureVoiceDraft(){if(page!=='voicedetail'||!voiceEditor)return;for(const [id,key] of [['vname','name'],['vdescription','description'],['trialText','text']]){const el=document.getElementById(id);if(el)voiceEditor[key]=el.value;}const enabled=document.getElementById('venabled');if(enabled)voiceEditor.enabled=enabled.checked;for(const [id,key] of [['ved-trial','trialOpen'],['ved-info','infoOpen']]){const el=document.getElementById(id);if(el)voiceEditor[key]=el.open;}}
function voiceDirty(){if(page!=='voicedetail'||!voiceEditor)return false;captureVoiceDraft();const v=voice();return !!voiceEditor.candidate||voiceEditor.name!==v.name||voiceEditor.description!==(v.description||'')||voiceEditor.enabled!==!!v.enabled;}
function askVoiceLeave(next){voiceLeaveNext=next;uxDialog={voiceLeave:true,title:'保存音色修改？',html:'<p>离开前，可以保存或放弃本次修改。</p>',confirmLabel:'放弃修改',confirm:async()=>{voiceEditor=null;voiceLeaveNext=null;next();}};render();}
async function saveVoiceEditor(next){
 captureVoiceDraft();const d=voiceDraft();if(d.working)return;
 if(!d.name.trim()||!d.description.trim()){d.error='请填写音色名称和声音描述。';render();return;}
 const description=Bajiao.cleanVoiceDescription(d.description.trim());
 if(d.candidate&&description!==d.candidateDescription){d.error='描述已修改，请重新生成方案，或放弃新方案后保存资料。';render();return;}
 const v=voice(),old={...v},replacing=!!d.candidate;d.working=true;d.error='';d.status='正在保存…';render();
 try{
  Object.assign(v,d.candidate?{...d.candidate,id:v.id,lastTrial:null,tested:false}:{},{id:old.id,name:d.name.trim(),description,enabled:d.enabled});
  await engine.saveVoice(v);voiceEditor=null;voiceLeaveNext=null;uxDialog=null;toast(replacing?'已替换音色，角色绑定保持不变':'音色资料已保存');if(next)next();else go('voices',true);
 }catch(err){for(const key of Object.keys(v))delete v[key];Object.assign(v,old);d.error='保存失败：'+cleanErr(err);d.status='';}
 finally{d.working=false;render();}
}
function vedAudio(label,note,action,disabled){
 return '<div class="ved-audio od-row"><div class="od-field od-fill"><strong>'+E(label)+'</strong>'+(note?'<small>'+E(note)+'</small>':'')+'</div><button class="vc-btn secondary od-fixed" data-act="'+action+'" '+(disabled?'disabled':'')+'>'+I('play')+' 试听</button></div>';
}
function voiceEditorHtml(){
 captureVoiceDraft();const v=voice(),d=voiceDraft(),stale=d.candidate&&Bajiao.cleanVoiceDescription(d.description.trim())!==d.candidateDescription,trial=d.trial&&d.trial.text===d.text?d.trial:null;
 return top('编辑音色')+
 '<section class="ved-intro"><small>当前音色</small><div class="ved-name-row"><h1>'+E(v.name)+'</h1><button class="vc-btn secondary" data-act="vedsample" '+(d.working?'disabled':'')+' aria-label="试听当前音色">'+I('play')+' 试听</button></div><small class="ved-demo">试听当前参考样本；生成试音或重新设计会调用 MiMo。</small></section>'+
 '<section class="ved-edit"><label class="ved-match"><span><strong>自动推荐给角色</strong><small>根据声音描述推荐；关闭后仍可手动选择。</small></span><input type="checkbox" id="venabled" '+(d.enabled?'checked':'')+' '+(d.working?'disabled':'')+'></label><h3>编辑与重新设计</h3><fieldset class="ved-fields" '+(d.working?'disabled':'')+'>'+field('音色名称','vname',d.name)+area('声音描述','vdescription',d.description)+
 '<p class="ved-help">描述想要的性别、年龄感、音质和口音，再生成新的声线方案。</p><button class="vc-btn secondary full" data-act="vedredesign">'+I('refresh-cw')+' '+(d.candidate?'重新生成方案':'根据描述重新设计')+'</button>'+
 (d.candidate?'<section class="ved-candidate od-stack" aria-label="新音色方案"><h3>新方案 · 尚未保存</h3>'+(stale?'<p class="ved-error">描述已变化，请重新生成。</p>':'')+vedAudio('原音色','','vedcompareold',d.working)+vedAudio('新音色','','vedcomparenew',d.working)+'</section>':'')+
 '</fieldset>'+
 '<p class="ved-feedback" role="status" aria-live="polite">'+E(d.status)+'</p>'+(d.working&&d.status?'<progress class="ved-progress" aria-label="正在处理"></progress>':'')+(d.error?'<p class="ved-error" role="alert">'+E(d.error)+'</p>':'')+
 (d.candidate?'<div class="ved-choice-actions"><button class="vc-btn secondary" data-act="veddiscard" '+(d.working?'disabled':'')+'>保留原音色</button><button class="vc-btn primary" data-act="vedsave" '+(d.working||stale?'disabled':'')+'>使用新音色</button></div>':'<button class="vc-btn primary full" data-act="vedsave" '+(d.working?'disabled':'')+'>'+(d.working?'处理中…':'保存资料')+'</button>')+'</section>'+
 '<details id="ved-trial" class="ved-disclosure" '+(d.trialOpen?'open':'')+'><summary>用一段文字试试</summary><p class="ved-help">使用当前已保存的音色朗读。新方案请在上方对比试听。</p><fieldset class="ved-fields" '+(d.working?'disabled':'')+'>'+area('试听文本','trialText',d.text)+
 '<div class="ved-audio od-row"><div class="od-field od-fill"><strong>'+(trial?'试音已生成':'生成一段试音')+'</strong><small>'+(trial?'可重播或重新生成':'填写文本后生成并播放')+'</small></div><button class="vc-btn secondary od-fixed" data-act="'+(trial?'vedreplay':'vedtrial')+'">'+I('play')+' '+(trial?'重播':'生成试音')+'</button></div>'+(trial?'<button class="vc-link ved-regenerate" data-act="vedtrial">重新生成试音</button>':'')+'</fieldset></details>'+
 '<details id="ved-info" class="ved-disclosure" '+(d.infoOpen?'open':'')+'><summary>音色资料</summary><dl class="ved-metadata"><div><dt>来源</dt><dd>'+(v.source==='import'?'用户导入':'AI 设计')+'</dd></div><div><dt>音频格式</dt><dd>'+E((v.format||'wav').toUpperCase())+'</dd></div><div><dt>音色编号</dt><dd>'+E(v.id)+'</dd></div><div><dt>试音状态</dt><dd>'+(v.tested?'已试音':'未试音')+'</dd></div>'+(v.previewText?'<div><dt>参考样本文本</dt><dd>'+E(v.previewText)+'</dd></div>':'')+'</dl></details>'+
 '<section class="ved-delete"><button class="vc-link" data-act="deletevoice:'+E(v.id)+'">删除此音色</button><p>已完成的音频保留，绑定的角色需重新选择音色。</p></section>';
}
document.addEventListener('input',()=>{if(page==='voicedetail')captureVoiceDraft();});
document.addEventListener('change',()=>{if(page==='voicedetail')captureVoiceDraft();});
document.addEventListener('toggle',event=>{if(page==='voicedetail'&&['ved-trial','ved-info'].includes(event.target.id))captureVoiceDraft();},true);
function voiceRowCopy(v,preset=false){
 const description=String(v.description||'').trim(),source=v.source==='import'?'导入音频':'AI 设计';
 return `<span class="od-fill voice-library-copy"><span>${E(v.name)}</span>${preset?`<small>${E(Bajiao.presetDesc(v.name))}</small>`:`<small title="${E(description)}">${E(source)}${description?' · '+E(description):''}</small>`}</span>`;
}
function compactVoiceRow(v,preset=false){
 return `<div class="vc-preset-row" ${preset?'':`data-act="voice:${E(v.id)}" role="button" tabindex="0" aria-label="编辑音色：${E(v.name)}"`}><div class="vc-preset-title">${I('volume-2')}${voiceRowCopy(v,preset)}</div><button class="vc-preset-btn" data-act="${preset?'preset:'+E(v.name):'trialvoice:'+E(v.id)}" aria-label="试听音色：${E(v.name)}">${I('play')} 试听</button></div>`;
}
function voiceCards(choosing=false){
 const voices=filteredVoices(choosing),bound=choosing?book().characters.find(r=>r.name===roleName)?.voice:null;
 if(!choosing)return voices.length?voices.map(v=>compactVoiceRow(v)).join(''):'<div class="empty"><p>还没有自己的音色，可导入音频或设计新音色。</p></div>';
 return voices.length?voices.map(v=>{const preset=v.source==='preset';return `<section class="vc-panel vc-voice-card ${choosing?'':'vc-card-clickable'}" ${choosing?'':'data-act="voice:'+v.id+'" aria-label="管理音色'+E(v.name)+'"'}><div class="vc-row"><div class="vc-avatar">${I(preset?'volume-2':v.source==='import'?'mic':'sparkles')}</div><div class="vc-grow"><h3 class="voice-name">${E(v.name)}</h3><small>${v.id===bound?'当前绑定 · ':''}${preset?'MiMo 预设':(v.source==='import'?'导入':'设计')+' · '+E((v.format||'wav').toUpperCase())+' · #'+E(v.id.slice(-6))}</small></div>${B('试听',preset?'preset:'+v.name:'play:'+v.sample,true)}</div><p class="vc-sub">${E(v.description)}</p><div class="vc-row">${choosing?B(v.id===bound?'已选用':'选用','bind:'+v.id,true,v.id===bound):L('管理音色','voice:'+v.id)}${!choosing?L('删除','deletevoice:'+v.id):''}</div></section>`;}).join(''):(choosing?'<div class="empty"><p>没有符合条件的音色</p>'+B('清空筛选','clearvoicefilters',true)+'</div>':'<div class="empty"><p>还没有自己的音色，可导入音频或设计新音色。</p></div>');
}
let voiceBatch=false,voiceBatchIds=[];
function voiceLibraryHtml(state){
 const mine=voiceTab==='mine',ids=state.voices.map(v=>v.id);
 voiceBatchIds=voiceBatchIds.filter(id=>ids.includes(id));
 const editing=mine&&voiceBatch;
 const tabs=voiceTabs('voicetab',mine,ids.length);
 let h=title(editing?'批量管理':'声音档案','音色库',mine?`<button type="button" class="voice-library-edit" data-act="voicebatchedit" ${!ids.length?'disabled':''}>${editing?'完成':I('list-checks')+'<span>编辑</span>'}</button>`:'')+tabs;
 if(!mine)return h+Bajiao.PRESETS.map(name=>compactVoiceRow({name},true)).join('');
 if(!editing)return h+'<div class="vc-split">'+B('导入音频','importvoices')+B('设计新音色','newdesign',true)+'</div>'+voiceCards();
 h+='<section class="voice-batch-mode" aria-label="批量管理音色"><div class="voice-batch-tools"><span>共 '+ids.length+' 个音色</span><button type="button" data-act="voicebatchall">'+(voiceBatchIds.length===ids.length?'取消全选':'全选')+'</button></div><div class="voice-batch-list">';
 h+=state.voices.map(v=>{
  const checked=voiceBatchIds.includes(v.id),source=v.source==='import'?'导入音频':'AI 设计';
  const description=String(v.description||'').trim();
  return `<button type="button" class="voice-batch-row" data-act="voicebatchtoggle:${E(v.id)}" aria-pressed="${checked}" aria-label="选择音色：${E(v.name)}"><span class="voice-batch-check" aria-hidden="true">${I('check')}</span><span class="voice-batch-copy"><strong>${E(v.name)}</strong><small>${E(source)}${description&&description!==v.name?' · '+E(description):''}</small></span></button>`;
 }).join('');
 return h+`</div><footer class="voice-batch-footer"><p role="status" aria-live="polite">已选 <strong>${voiceBatchIds.length}</strong> 项</p><button type="button" class="voice-batch-delete" data-act="voicebatchdelete" ${!voiceBatchIds.length?'disabled':''}>${I('trash-2')}<span>删除所选${voiceBatchIds.length?'（'+voiceBatchIds.length+'）':''}</span></button></footer></section>`;
}
const voiceLabel=id=>id?.startsWith('preset:')?id.slice(7):(engine.state.voices.find(v=>v.id===id)?.name||'该音色');
const voiceTabBtn=(label,act,active,marked=false)=>`<button class="${active?'active':''}" aria-pressed="${active}" data-act="${act}">${E(label)}${marked?'<span class="voice-tab-mark" aria-hidden="true"></span>':''}</button>`;
function voiceTabs(action,mine,count,mineMarked=false,presetMarked=false){return '<div class="vc-tabs vc-voice-tabs" data-selected="'+(mine?'mine':'preset')+'"><span class="vc-tab-indicator" aria-hidden="true"></span>'+voiceTabBtn('我的音色 · '+count,action+':mine',mine,mineMarked)+voiceTabBtn('MiMo 预设',action+':preset',!mine,presetMarked)+'</div>';}
const previousVoiceTabs=new Map();
function animateVoiceTabs(){
 const tabs=$('.vc-voice-tabs');if(!tabs)return;
 const selected=tabs.dataset.selected,previous=previousVoiceTabs.get(page);previousVoiceTabs.set(page,selected);
 if(!previous||previous===selected||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const indicator=tabs.querySelector('.vc-tab-indicator'),position=value=>value==='mine'?'translateX(0)':'translateX(calc(100% + 4px))';
 if(indicator.animate)indicator.animate([{transform:position(previous)},{transform:position(selected)}],{duration:240,easing:'cubic-bezier(.2,.8,.2,1)'});
}
function voiceAuditionAction(id){return id.startsWith('preset:')?'preset:'+E(id.slice(7)):'trialvoice:'+E(id);}
function chooseVoiceRow(id,name,selected){
 const trial=voiceAuditionAction(id);
 const v=id.startsWith('preset:')?{name}:engine.state.voices.find(v=>v.id===id)||{name};
 return `<div class="vc-preset-row voice-choose-row" role="button" tabindex="0" aria-pressed="${selected}" aria-label="${selected?'正在使用音色：':'改用音色：'}${E(name)}" data-act="choosevoice:${E(id)}"><div class="vc-preset-title">${I(selected?'circle-check':'volume-2')}${voiceRowCopy(v,id.startsWith('preset:'))}${selected?'<span class="voice-choose-tag">使用中</span>':''}</div><button class="vc-preset-btn" data-act="${trial}" aria-label="试听音色：${E(name)}">${I('play')} 试听</button></div>`;
}
function chooseVoiceHtml(state){
 const role=book().characters.find(r=>r.name===roleName),bound=role?.voice||null;
 const sel=bound;
 const mine=chooseTab==='mine',ids=state.voices.map(v=>v.id);
 const inMine=!!bound&&!bound.startsWith('preset:');
 const tabs=voiceTabs('choosetab',mine,ids.length,inMine,!!bound&&!inMine);
 const rows=mine?(ids.length?ids.map(id=>chooseVoiceRow(id,state.voices.find(v=>v.id===id).name,sel===id)).join(''):'<div class="empty"><p>还没有自己的音色。</p><small>可先在音色库导入音频或设计新音色。</small></div>'):Bajiao.PRESETS.map(name=>chooseVoiceRow('preset:'+name,name,sel==='preset:'+name)).join('');
 return top('为'+roleName+'选音色')+tabs+'<div class="voice-choose-list">'+rows+'</div><p class="voice-choose-note">点击任意音色即可改用。已有音频保留，后续合成使用新音色。</p>';
}
function enhancePage(h,state){
 if(page==='voices')h=voiceLibraryHtml(state);
 if(page==='voicedetail')h=voiceEditorHtml();
 if(page==='choose')h=chooseVoiceHtml(state);
 if(page==='recovery'){const c=chapter();h=top('恢复本章')+`<div class="vc-panel"><h3>${E(c.title)}</h3><p>${errorMarkup(recoveryError||'本章数据暂时无法读取')}</p><p>其他章节、角色和已生成音频会保留。重新选择原文件后，仅替换本章文本。</p>${(!/^CHAPTER_/.test(recoveryError?.code||'')?B('重新读取本章','reloadchapter'):'')}${B('从原文件恢复本章','restorefromfile',true)}${c.audio?B('先听已生成音频','listenexisting',true):''}${B('返回目录','go:detail',true)}</div>`;}
 if(page==='chapteredit'){const c=chapter();h=top('章节信息')+field('章节标题','chapterTitle',c.title)+B('保存标题','savechaptertitle')+'<hr>'+B('从文件追加章节','appendchapter',true)+B('删除这一章','deletechapter:'+c.id,true);}
 if(page==='storage'){
  if(!storageStats&&!storageLoadPending&&!storageError)queueMicrotask(()=>refreshStorage());
  if(!storageStats){h=h.replace(/0\.0 MB/g,'正在读取…').replace(/\d+ 个音频文件/g,'正在读取文件数量…');h=top('存储与有声书管理')+`<div class="vc-panel" role="status" aria-busy="${storageLoadPending}">${storageError?errorMarkup(storageError):'正在读取设备真实存储数据…'}${storageError?B('重新读取','refreshstorage',true):''}</div>`+h.substring(h.indexOf('<div class="vc-panel">'));}
  if(storageStats)h+='<p class="vc-sub">统计口径：章节数按目录中的成品计算；文件数包括成品、句子、原始返回和音色样本。</p>';
 }
 if(page==='llm'||page==='mimo'){const result=page==='llm'?connectionResult:ttsConnectionResult;h+='<p class="vc-config-status" role="status">'+(configDirty?'有未保存的修改':(page==='llm'?configured.llmConfigured:configured.ttsConfigured)?'已保存密钥；留空会保留':'尚未保存密钥')+'</p>';if(result)h+=`<div class="vc-panel" role="status"><strong>${result.ok?'测试成功':'测试失败'}</strong><p>${result.base?E(result.model+' · '+result.protocol)+'<br>'+E(result.base):'MiMo TTS'}</p>${result.error?errorMarkup(result.error):''}<small>${new Date(result.at).toLocaleString()}</small></div>`;}
 if(page==='tasks'&&confirmationResult)h+=`<div class="vc-panel"><h3>自动确认结果</h3><p>${confirmationResult.resumed} 个任务已继续；${confirmationResult.blocked.length} 个任务仍需处理。</p>${confirmationResult.blocked.map(x=>`<p>${E(x.reason)} ${L('处理此任务','task:'+x.taskId)}</p>`).join('')}</div>`;
 if(page==='splitpreview'&&importDraft?.probeCandidate){const c=importDraft.probeCandidate;h+=`<div class="vc-panel"><h3>新识别方案</h3><p>${E(c.template)} · ${c.result.chapters.length} 章；原方案 ${importDraft.result?.chapters.length||0} 章。</p>${B('采用新方案','acceptprobe',true)}${B('保留原方案','discardprobe',true)}</div>`;}
 if(page==='design'&&designJob){h+=`<div class="vc-panel" role="status"><h3>${E(designJob.status)}</h3><p>${designJob.error?errorMarkup(designJob.error):'可以离开此页，任务会继续。返回后草稿仍在。'}</p>${designJob.running?B('取消接收本次结果','canceldesign',true):''}</div>`;}
 else if(designJob?.running&&page!=='annotated')h='<div class="vc-job-banner" role="status">音色设计进行中 '+L('查看','viewdesignjob')+'</div>'+h;
 if(['tasks','task','detail','listen'].includes(page)){const waiting=state.tasks.filter(t=>t.networkWaiting&&t.status==='waiting'&&!t.pauseRequested);if(waiting.length)h=`<aside class="production-wait od-stack" role="status"><strong>${waiting.length} 个任务等待制作网络</strong><p>${E(engine.productionNetworkMessage())}。已完成进度保留。</p><div class="od-cluster"><button class="vc-btn secondary" data-act="productionnetworksettings">网络设置</button><button class="vc-btn secondary" data-act="resume:${E(waiting[0].id)}">继续本章</button></div></aside>`+h;}
 return h;
}
function enhanceRendered(){
 document.body.classList.toggle('vc-catalog-open',page==='detail');
 const main=$('.vc-main');if(main){main.dataset.page=page;main.dataset.theme='light';main.classList.toggle('vc-voice-editing',page==='voices'&&voiceTab==='mine'&&voiceBatch);main.style.setProperty('--reader-font',(Number(engine.state.settings.readerFontSize)||16)+'px');main.style.setProperty('--reader-leading',Number(engine.state.settings.readerLineHeight)||1.6);}
 document.querySelectorAll('button').forEach(button=>{if(!button.getAttribute('aria-label')){const text=button.textContent.trim(),title=button.getAttribute('title'),act=button.dataset.act||'';button.setAttribute('aria-label',title||text||({importbook:'导入小说',importvoices:'导入音色',playchapter:'播放',miniplaypause:'播放或暂停'}[act])||'打开操作');}});
 document.querySelectorAll('[data-act].vc-card-clickable,[data-act].vc-transcript-line').forEach(el=>{el.tabIndex=0;el.setAttribute('role','button');});

 if(page==='design'&&designJob&&designJob.bookId===bookId&&designJob.roleName===roleName){if(!candidate){const desc=$('#designDescription'),text=$('#designText');if(desc&&!desc.value)desc.value=designJob.description;if(text&&!text.value)text.value=designJob.text;}const button=$('[data-act="designsample"]');if(button)button.disabled=!!designJob.running;}
 updateSleep(miniPlayingState||{});if(speedModalOpen)syncSpeedUI(engine.state.playbackSpeed||1);updatePreview(miniPlayingState||{});animateVoiceTabs();
}
async function startPreview(id,title){auditionIntent++;playbackPrompts?.cancel();waitingForNextChapterId=null;if(preview?.id===id){miniPlayingState=await device.call('playbackState');if(miniPlayingState.id===id){await device.call('playback',{op:miniPlayingState.playing?'pause':'resume'});miniPlayingState=await device.call('playbackState');updatePreview(miniPlayingState);return;}}const previous=[preview,playingId,playingBookId,playingChapterId,streamState];streamState=null;preview={id,title};playingId=id;playingBookId=null;playingChapterId=null;try{await device.call('play',{id,title,bookTitle:'样本试听',hasPrev:false,hasNext:false});}catch(error){[preview,playingId,playingBookId,playingChapterId,streamState]=previous;render();throw error;}miniPlayingState=await device.call('playbackState');render();}
const auditionJobs=new Map(),auditionFiles=new Map(),auditionButtonOriginals=new WeakMap();
let auditionIntent=0;
async function runAudition(action,produce,title){
 if(auditionJobs.has(action))return;
 const token=++auditionIntent;
 auditionJobs.set(action,true);updatePreview(miniPlayingState||{});
 try{const file=await produce();auditionFiles.set(action,file.id);if(token===auditionIntent)await startPreview(file.id,title);}
 finally{auditionJobs.delete(action);updatePreview(miniPlayingState||{});}
}
function auditionFile(action){
 const separator=action.indexOf(':'),kind=separator<0?action:action.slice(0,separator),id=action.slice(separator+1);
 if(kind==='preset')return engine?.state.presetPreviews?.[engine.presetPreviewKey(id)]?.id;
 if(kind==='trialvoice')return engine?.state.voices.find(v=>v.id===id)?.sample||auditionFiles.get(action);
 if(kind==='play')return id;
 if(kind==='segmentpreview')return panelSegment()?.audio;
 if(page==='voicedetail'){
  if(kind==='vedsample'||kind==='vedcompareold')return voice().sample;
  if(kind==='vedcomparenew')return voiceDraft().candidate?.sample;
  if(kind==='vedreplay')return voiceDraft().trial?.id;
 }
 return auditionFiles.get(action);
}
function updatePreview(p){
 let changed=false;
 document.querySelectorAll('button[data-act]').forEach(button=>{
  const action=button.dataset.act,loading=auditionJobs.has(action),file=auditionFile(action);
  if(!loading&&!file&&!auditionButtonOriginals.has(button))return;
  if(!auditionButtonOriginals.has(button))auditionButtonOriginals.set(button,{html:button.innerHTML,label:button.getAttribute('aria-label'),disabled:button.disabled});
  const original=auditionButtonOriginals.get(button),active=!!file&&preview?.id===file&&p.id===file,playing=active&&p.playing;
  const paused=active&&!p.playing&&(p.position||0)>0&&(p.position||0)<(p.duration||0);
  const state=loading?'loading':playing?'playing':paused?'paused':'idle';
  if(button.dataset.auditionState===state)return;
  changed=true;
  button.dataset.auditionState=state;button.disabled=loading||original.disabled;button.setAttribute('aria-busy',String(loading));button.classList.toggle('vc-audition-loading',loading);
  if(state==='idle'){button.innerHTML=original.html;if(original.label)button.setAttribute('aria-label',original.label);else button.removeAttribute('aria-label');return;}
  const label=loading?'合成中…':playing?'暂停':'继续',icon=loading?'<span class="vc-audition-spinner" aria-hidden="true"></span>':I(playing?'pause':'play');
  // Sentence controls retain their description and row layout.
  const heading=button.querySelector('.od-field strong');
  if(heading){heading.textContent=label+'试听';const old=button.firstElementChild;if(old)old.outerHTML=icon;}
  else button.innerHTML=icon+' '+label;
  button.setAttribute('aria-label',(loading?'正在合成试听':label+'试听')+' · '+(original.label||original.html.replace(/<[^>]*>/g,'').trim()));
 });
 if(changed)lucide.createIcons({attrs:{width:20,height:20}});
}
function sleepStatus(){const plan=engine?.state.sleepChapterPlan;return plan?.remaining>0?(plan.remaining===1?'本章后停止':plan.remaining+'章后停止'):sleepRemainingMs>0?fmt(sleepRemainingMs/1000):'';}
function updateSleep(p){if(Number.isFinite(Number(p?.sleepRemainingMs)))sleepRemainingMs=Math.max(0,Number(p.sleepRemainingMs));const label=sleepStatus();document.querySelectorAll('[data-sleep-status]').forEach(el=>el.textContent=label);document.querySelectorAll('[data-act="sleepmenu"]').forEach(el=>{el.classList.toggle('active',!!label);el.setAttribute('aria-label',label?'定时：'+label:'睡眠定时');});const toggle=$('[data-act="togglesleep"]');if(toggle){toggle.setAttribute('aria-checked',String(!!label));const heading=toggle.closest('.vc-dialog')?.querySelector('h3');if(heading)heading.textContent=label?'定时已开启':'定时关闭';}document.querySelectorAll('[data-sleep-choice]').forEach(el=>{const chosen=!!label&&el.dataset.sleepChoice===String(engine?.state.settings.sleepTimer);el.classList.toggle('active',chosen);el.setAttribute('aria-pressed',String(chosen));});}
async function setSleep(choice){
 const match=String(choice).match(/^chapters?:([123])$/),count=choice==='chapter'?1:match?Number(match[1]):0,minutes=count?0:Number(choice);
 if(!count&&(!Number.isFinite(minutes)||minutes<0||minutes>720)){toast('请输入 1–720 分钟');return;}
 if(miniPlayingState?.id)await restorePlayingChapter();
 const targetBook=playingBookId||bookId;if(count&&!targetBook){toast('请先选择要收听的书籍');return;}
 await device.call('playback',{op:'sleep',value:minutes});
 engine.state.sleepChapterPlan=count?{bookId:targetBook,remaining:count,lastChapterId:null}:null;
 const value=count?'chapters:'+count:minutes;engine.state.settings.sleepTimer=value;if(count||minutes>0)engine.state.settings.lastSleepChoice=value;
 sleepRemainingMs=minutes*60000;miniPlayingState={...(miniPlayingState||{}),sleepRemainingMs};await engine.persist();render();updateSleep({sleepRemainingMs});
}
function syncSpeedUI(speed,previewOnly=false){
 const value=Math.max(.5,Math.min(3,Number(speed)||1)),ratio=(value-.5)/2.5,label=String(Number(value.toFixed(2)))+'x';
 if(!previewOnly){const button=$('#speedBtnVal');if(button)button.textContent=label;const range=$('#speedRange');if(range)range.value=value;}
 for(const id of ['speedVal','speedBubble']){const el=$('#'+id);if(el)el.textContent=label;}
 const rail=$('.vc-speed-slider');if(rail){rail.style.setProperty('--speed-percent',(ratio*100)+'%');rail.style.setProperty('--speed-position','calc('+(ratio*100)+'% + '+(24-48*ratio)+'px)');}
 const range=$('#speedRange');if(range)range.setAttribute('aria-valuetext',label+' 倍速');
 document.querySelectorAll('.vc-speed-ticks [data-act]').forEach(el=>{const active=Math.abs(Number(el.dataset.act.split(':')[1])-value)<.01;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));});
}

function startDesignJob(){if(designJob?.running)return;const description=value('designDescription').trim(),text=value('designText');if(!description){toast('请填写完整声音描述');return;}const job={token:Date.now()+Math.random(),bookId,roleName,description,text,running:true,status:'正在请求 MiMo 生成试听样本'};designJob=job;render();engine.design(description,text).then(async result=>{if(designJob!==job||job.cancelled)return;job.running=false;job.status='样本已完成，等待确认';job.result=result;if(job.roleName){const b=engine.state.books.find(b=>b.id===job.bookId),r=b?.characters.find(r=>r.name===job.roleName);if(r){r.candidate=result;await engine.persist();}}if(page==='design'&&bookId===job.bookId&&roleName===job.roleName){candidate=result;designDirty=value('designDescription').trim()!==job.description||value('designText')!==job.text;}render();}).catch(e=>{if(designJob!==job||job.cancelled)return;job.running=false;job.status='设计失败，可保留草稿重试';job.error=cleanErr(e);render();});}
const dangerousActions=new Set(['deletevoice','clearchapters','resetchapters','cleargc','clearalllistened','clearexpired','keeponlycurrent','clearallaudio','clearbooklistened','clearbookaudio','archivebook']);
async function confirmDestructive(a,x,el,e){
 if(a==='keeponlycurrent'&&!playingBookId){toast('当前没有正在收听的书籍，请先打开并播放一本书');return;}
 resetModalFlags();uxDialog={title:'确认操作范围',html:'<p role="status">正在计算影响范围…</p>',loading:true};render();
 let targets=[],extra='',title='释放音频';
 if(a==='deletevoice'){title='删除音色';const v=engine.state.voices.find(v=>v.id===(x||voiceId));if(!v)throw Error('音色不存在');const bindings=engine.state.books.flatMap(b=>b.characters.filter(r=>r.voice===v.id).map(r=>'《'+b.name+'》的 '+r.name));extra=`<p>音色：${E(v.name)}</p><p>${bindings.length?'影响 '+bindings.length+' 个绑定：'+E(bindings.join('；')):'没有角色绑定此音色。'}</p><p>角色将变为未分配。已完成音频保留，新制作前需重新绑定。</p>`;}
 else{
  for(const b of engine.state.books)for(const c of b.chapters){let include=false;if(a==='clearchapters'||a==='resetchapters')include=b.id===bookId&&selected.includes(c.id);else if(a==='clearalllistened'||a==='clearbooklistened')include=c.listened&&(a==='clearalllistened'||b.id===x);else if(a==='clearexpired')include=!!c.audio&&!c.listened&&(c.generated||c.created||b.created||0)<Date.now()-7*86400000;else if(a==='keeponlycurrent')include=b.id!==playingBookId;else if(a==='clearbookaudio'||a==='archivebook')include=b.id===x;else if(a==='clearallaudio')include=true;if(include)targets.push({bookId:b.id,chapterId:c.id});}
  const impact=await engine.audioImpact(targets);if(!uxDialog)return;
  if(a==='resetchapters'){title='重置标注与配音';extra='<p>将清除这些章节的角色标注、音频和任务记录。原文保留，需要重新标注与合成。</p>';}
  else extra='<p>原文与标注保留。重新生成音频会再次调用服务。</p>';
  if(a==='cleargc'){title='清理未引用音频';for(const b of engine.state.books)for(const c of b.chapters)if(c.unloaded&&c.segmentCount)await engine.ensureChapter(b.id,c.id);const stats=await device.call('audioStats'),keep=new Set(engine.collectReferencedAudio()),files=Object.entries(stats.fileSizes||{}).filter(([id])=>!keep.has(id));extra=`<p>将释放 ${files.length} 个未引用文件，共 ${(files.reduce((n,[id,bytes])=>n+bytes,0)/1048576).toFixed(2)} MB。</p><p>当前书籍、音色、候选样本和可撤销章节所引用的文件保留。</p>`;}
  else extra=`<p>${impact.books} 本书 · ${impact.chapters} 个章节，其中 ${impact.audioChapters} 章有音频。</p><p>${impact.files} 个音频文件 · ${(impact.bytes/1048576).toFixed(2)} MB</p>`+extra;
  if(a==='keeponlycurrent')extra='<p>保留《'+E(engine.book(playingBookId).name)+'》。</p>'+extra;
 }
 if(!uxDialog)return;uxDialog={title,html:extra,confirmLabel:a==='resetchapters'?'确认重置':a==='deletevoice'?'确认删除':'确认释放',confirm:async()=>{await handleAction(el,e,true);}};render();
}
async function pickImport(mode){const files=await device.call('pick',{kind:'book'});if(!files?.length)return;const draft=BajiaoImport.createDraft(files[0],engine.state.settings);draft.mode=mode;draft.targetBookId=bookId;draft.targetChapterId=chapterId;if(draft.text.trim())BajiaoImport.splitDraft(draft,Bajiao.splitChapters);if(mode==='restore')draft.restoreCandidates=Bajiao.splitChapters(draft.text).chapters;enterImport(draft);}
async function handleUXAction(a,x,el,e,approved){
 if(!approved&&dangerousActions.has(a)){await confirmDestructive(a,x,el,e);return true;}
 if(a==='uxcancel'){uxDialog=null;render();return true;}
 if(a==='uxconfirm'){const dialog=uxDialog;if(!dialog?.confirm||dialog.loading)return true;dialog.loading=true;render();try{await dialog.confirm();}finally{if(uxDialog===dialog)uxDialog=null;render();}return true;}
 if(a==='continuereading'){const progress=book().readProgress;chapterId=book().chapters.some(c=>c.id===progress?.chapterId)?progress.chapterId:book().chapters[0].id;try{await engine.ensureChapter(bookId,chapterId);}catch(e){recoveryError=e;page='recovery';render();return true;}page=progress?.mode==='annotated'?'annotated':'raw';render();requestAnimationFrame(()=>window.scrollTo(0,progress?.scroll||0));return true;}
 
 if(a==='editchapter'){uxDialog=null;go('chapteredit');return true;}
 if(a==='savechaptertitle'){const name=value('chapterTitle').trim();if(!name)throw Error('章节标题不能为空');const c=await engine.ensureChapter(bookId,chapterId);c.title=name;engine.touch(c);await engine.persist();toast('标题已保存');catalogRequestId=chapterId;go('detail');return true;}
 if(a==='deletechapter'){const c=chapter();resetModalFlags();uxDialog={title:'删除本章？',html:'<p>'+E(c.title)+'</p><p>将从目录移除此章。其他章节保留；24 小时内可在书籍详情撤销，期间音频仍保留。</p>',confirmLabel:'删除本章',confirm:async()=>{await engine.deleteChapter(bookId,chapterId);selected=selected.filter(id=>id!==chapterId);chapterId=book().chapters[0].id;go('detail');}};render();return true;}
 if(a==='undochapter'){await engine.undoChapter();render();toast('章节已恢复');return true;}
 if(a==='appendchapter'||a==='restorefromfile'){resetModalFlags();render();await pickImport(a==='appendchapter'?'append':'restore');return true;}
 if(a==='confirmsplit'&&importDraft?.mode){const d=importDraft;if(!BajiaoImport.canImport(d))return true;if(d.mode==='append'){const added=await engine.appendChapters(d.targetBookId,d.result);bookId=d.targetBookId;chapterId=added[0].id;catalogRequestId=added[0].id;leaveImport();go('detail');toast('已追加 '+added.length+' 章');}
  else{bookId=d.targetBookId;chapterId=d.targetChapterId;const original=chapter(),index=book().chapters.indexOf(original),match=d.result.chapters.find(c=>c.title===original.title);const choices=d.result.chapters;uxDialog={title:'确认恢复本章',html:'<p>目标：'+E(original.title)+'</p><label class="vc-field">选择原文件中的对应章节<select id="restoreChapterChoice">'+choices.map((c,i)=>'<option value="'+i+'" '+(c===match||!match&&i===index?'selected':'')+'>'+E(c.title)+' · '+c.text.length+' 字</option>').join('')+'</select></label><p>仅恢复这一章的原文，其他章节与音频保留。</p>',confirm:async()=>{const source=choices[Number(value('restoreChapterChoice'))||0];await engine.restoreChapter(bookId,chapterId,source);importDraft=null;page='detail';render();toast('本章已恢复');}};render();}return true;}
 if(a==='reloadchapter'){try{await engine.ensureChapter(bookId,chapterId);go('raw');}catch(e){recoveryError=e;render();}return true;}
 if(a==='listenexisting'){page='listen';render();const c=chapter();await device.call('play',{id:c.audio,title:c.title,bookTitle:book().name,duration:Math.round((c.duration||0)*1000)});playingBookId=bookId;playingChapterId=chapterId;return true;}
 if(a==='recovertask'){const t=engine.state.tasks.find(t=>t.id===x);bookId=t.bookId;chapterId=t.chapterId;recoveryError={message:t.message,code:t.error?.code};go('recovery');return true;}
 if(a==='encoding'){const d=importDraft;if(!d?.token)return true;const result=await device.call('decodeBook',{token:d.token,encoding:x});Object.assign(d,result);BajiaoImport.splitDraft(d,Bajiao.splitChapters);render();return true;}
 if(a==='acceptprobe'){const d=importDraft,c=d.probeCandidate;if(c){d.ruleId='custom';d.customPattern=c.template;d.result=c.result;d.probeCandidate=null;delete dropdownSel.splitRule;render();}return true;}
 if(a==='discardprobe'){importDraft.probeCandidate=null;render();return true;}
 if(a==='clearvoicefilters'){voiceSearch='';voiceGender=voiceAge=voiceSource='all';render();return true;}
 if(a==='retryfailed'){const ids=engine.state.tasks.filter(t=>t.status==='failed').map(t=>t.id);taskTab='active';go('tasks');engine.resumeTasks(ids).catch(e=>toast(cleanErr(e)));return true;}
 if(a==='previewpause'){await device.call('playback',{op:miniPlayingState?.playing?'pause':'resume'});updatePreview(await device.call('playbackState'));return true;}
 if(a==='previewstop'){await device.call('playback',{op:'stop'});preview=null;playingId=null;render();return true;}
 if(a==='seekback'||a==='seekforward'){await seekDisplayedChapter('seek',0,a==='seekback'?-15000:15000);return true;}
 if(a==='sleepmenu'){const playback=await device.call('playbackState');miniPlayingState=playback;updateSleep(playback);resetModalFlags();sleepModalOpen=true;render();return true;}
 if(a==='closesleep'){sleepModalOpen=false;sleepCustomOpen=false;render();return true;}
 if(a==='togglesleep'){await setSleep(sleepStatus()?0:(engine.state.settings.lastSleepChoice||30));return true;}
 if(a==='sleepcustom'){sleepCustomOpen=!sleepCustomOpen;render();if(sleepCustomOpen)$('#sleepMinutes')?.focus();return true;}
 if(a==='setsleepcustom'){const minutes=Number(value('sleepMinutes'));if(!Number.isInteger(minutes)||minutes<1||minutes>720){toast('请输入 1–720 的整数分钟数');return true;}await setSleep(minutes);return true;}
 if(a==='setsleep'){await setSleep(x);return true;}

 if(a==='readersettings'){resetModalFlags();uxDialog={title:'阅读设置',html:readerSettingsHtml()};render();return true;}
 if(a==='readerfont'||a==='readerline'){if(uxDialog?.title!=='阅读设置')return true;const allowed=a==='readerfont'?[16,18,20,22,24]:[1.6,1.9,2.2];if(!allowed.includes(Number(x)))return true;engine.state.settings[a==='readerfont'?'readerFontSize':'readerLineHeight']=Number(x);uxDialog.html=readerSettingsHtml();syncReadingSettings();await engine.persist();return true;}
 if(a==='canceldesign'){designJob.cancelled=true;designJob.running=false;designJob.status='已取消接收结果；已发出的服务请求可能仍计费';render();return true;}
 if(a==='viewdesignjob'){if(designJob){bookId=designJob.bookId;roleName=designJob.roleName;candidate=designJob.result||null;go('design');}return true;}
 if(a==='nextchapter'||a==='prevchapter'){await window.onNativePlaybackAction(a==='nextchapter'?'next':'prev');return true;}
 if(a==='streamsegment'){listenUserHoldUntil=0;const c=chapter(),s=c.segments.find(s=>s.id===Number(x)),prefix=streamPrefix(c),index=prefix.indexOf(s);if(index<0){toast(s?.audio?'前面的句子尚未完成，暂不能连续播放到这里':'这一句尚未合成，请稍候');return true;}await playStreamSeg(bookId,chapterId,index);return true;}
 if(a==='toggleskip'){const c=chapter(),s=c.segments.find(s=>s.id===Number(x));if(!s)throw Error('片段不存在');const skipping=!(s.skip||s.isAd);if(s.audio&&s.audio!=='skip')s.originalAudio=s.originalAudio||s.audio;s.skip=skipping;s.isAd=false;if(s.speaker==='广告'&&!skipping){s.speaker='旁白';s.confidence=1;}s.audio=skipping?'skip':null;if(c.audio)c.originalAudio=c.originalAudio||c.audio;c.audioStale=!!c.audio;c.status='annotated';engine.touch(c);await engine.persist();toast(skipping?'已跳过这段':'已取消跳过，可重新制作');render();return true;}
 return false;
}
document.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)&&e.target.matches('[role="button"][data-act]:not(button)')){e.preventDefault();e.target.click();}});
document.addEventListener('input',e=>{
 const id=e.target.id;if(['llmBase','llmModel','llmKey','ttsKey'].includes(id)){configDirty=true;const status=$('.vc-config-status');if(status)status.textContent='有未保存的修改';}
 if(id==='voiceSearch'){voiceSearch=e.target.value;clearTimeout(handleUXAction.searchTimer);handleUXAction.searchTimer=setTimeout(()=>render(),300);}
 if(id==='biName'){document.querySelectorAll('#bookInfoDialog .vc-cover-mini b').forEach(el=>el.textContent=e.target.value||'书名');}
 if(id==='biAuthor'){document.querySelectorAll('#bookInfoDialog .vc-cover-mini small').forEach(el=>el.textContent=e.target.value||'有声书');}
});
document.addEventListener('change',e=>{const id=e.target.id;if(['voiceGender','voiceAge','voiceSource'].includes(id)){if(id==='voiceGender')voiceGender=e.target.value;if(id==='voiceAge')voiceAge=e.target.value;if(id==='voiceSource')voiceSource=e.target.value;render();}});
window.addEventListener('scroll',()=>{if(['raw','annotated'].includes(page)){clearTimeout(rememberReading.timer);rememberReading.timer=setTimeout(rememberReading,500);}});

const $=s=>document.querySelector(s),E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),I=n=>`<i data-lucide="${n}" aria-hidden="true"></i>`;
const B=(text,act,secondary=false,disabled=false)=>`<button class="vc-btn ${secondary?'secondary':''}" data-act="${E(act)}" ${disabled?'disabled':''}>${text}</button>`,L=(text,act)=>`<button class="vc-link" data-act="${E(act)}">${text}</button>`,T=(text,w=false)=>{const extraCls=w==='listened'?'vc-status-badge listened':w==='cleared'?'vc-status-badge cleared':'';const cls=w==='warn'||w===true?'warn':w==='running'?'running':'';return `<span class="vc-tag ${cls} ${extraCls}">${E(text)}</span>`;};
function shelfHeader(state){
 const count=state.books.length,selectedCount=shelfSelected.filter(id=>state.books.some(b=>b.id===id)).length,allSelected=count>0&&selectedCount===count;
 return `<header class="vc-shelf-header${shelfMulti?' is-editing':''}"><div class="vc-shelf-titlebar"><div class="od-field vc-shelf-heading"><div class="vc-kicker">芭蕉 · 让故事有声</div><h1>${shelfMulti?'管理书架':'我的书架'}</h1></div><div class="vc-shelf-actions od-row">${shelfMulti?`<button type="button" class="vc-shelf-control vc-shelf-done" data-act="shelfmulti">完成</button>`:`<button type="button" class="vc-shelf-control" data-act="shelfmulti" aria-label="编辑书架" ${count?'':'disabled'}>${I('list-checks')}<span>编辑</span></button><button type="button" class="vc-shelf-import od-touch" data-act="importbook" aria-label="导入小说">${I('plus')}</button>`}</div></div>${shelfMulti?`<div class="vc-shelf-selection od-row"><p class="od-fill" role="status" aria-live="polite">已选 <strong>${selectedCount}</strong> 本<span class="vc-shelf-total"> / 共 ${count} 本</span></p><button type="button" class="vc-shelf-selectall" data-act="${allSelected?'shelfselectnone':'shelfselectall'}" ${count?'':'disabled'}>${allSelected?'取消全选':'全选'}</button><button type="button" class="vc-shelf-delete-top" data-act="shelfdeletebooks" ${selectedCount?'':'disabled'} aria-label="删除所选的 ${selectedCount} 本书">删除所选</button></div>`:''}</header>`;
}
const title=(k,t,right='')=>`<div class="vc-top"><div><div class="vc-kicker">${k}</div><h1>${t}</h1></div>${right}</div>`;
function annotationHeaderAction(){
 const issues=readingIssues().length;
 return `<button class="vc-next-issue-entry" data-act="${issues?'nextissue':'go:roles'}">${I(issues?'scan-line':'users')}<span>${issues?'定位待确认':'角色与音色'}</span></button>`;
}
const top=t=>`<div class="vc-top"><button class="vc-icon" data-act="back" aria-label="返回">${I('arrow-left')}</button><h2 class="vc-marquee"><span>${E(t)}</span></h2>${page==='raw'?`<button class="vc-icon vc-reader-settings-entry" data-act="readersettings" aria-label="阅读设置">${I('sliders-horizontal')}</button>`:page==='annotated'?annotationHeaderAction():page==='detail'?`<button class="vc-info-entry" data-act="editbookinfo" aria-label="编辑书籍信息">${I('square-pen')}<span>编辑信息</span></button>`:'<span class="od-spacer" style="display:block;width:44px"></span>'}</div>`;
// 阅读三页（原文/标注/听书）slim 头：sticky 置顶，向上滑展开（返回+书名/章名），向下滑收起只留细条
const slimTop=(bname,ctitle)=>`<div class="vc-top vc-slim-top"><button class="vc-icon" data-act="back" aria-label="返回">${I('arrow-left')}</button><div class="vc-slim-titles"><h2 class="vc-marquee"><span>${E(bname)}</span></h2><small class="vc-marquee"><span>${E(ctitle)}</span></small></div>${page==='raw'?`<button class="vc-icon vc-reader-settings-entry" data-act="readersettings" aria-label="阅读设置">${I('sliders-horizontal')}</button>`:page==='annotated'?annotationHeaderAction():'<span class="od-spacer" style="display:block;width:44px"></span>'}</div>`;
const menu=(icon,text,sub,act)=>`<button class="vc-menu" data-act="${act}">${I(icon)}<span>${text}<br><small>${sub}</small></span>${I('chevron-right')}</button>`;
const field=(label,id,value,type='text')=>`<label class="vc-field">${label}<input id="${id}" type="${type}" value="${E(value)}" ${type==='password'?'autocomplete="off" placeholder="留空保留已保存密钥"':''}></label>`;
const area=(label,id,value)=>`<label class="vc-field">${label}<textarea class="vc-form" id="${id}">${E(value)}</textarea></label>`;
const COVER_STYLES=Bajiao.COVER_STYLES;
const coverEl=(b,cls='')=>{const color=/^#[a-f0-9]{6}$/i.test(b?.coverColor||'')?b.coverColor:COVER_STYLES[0].color;return `<div class="vc-cover ${cls}" ${color?`style="background:${color}"`:''}><small>芭蕉</small><b>${E(b?.name||'')}</b><small>${E(b?.author||'有声书')}</small></div>`;};
const cover=(name,cls='')=>coverEl(engine?.state.books.find(b=>b.name===name),cls);
const dd=(id,label,options,current)=>{const cur=dropdownSel[id]!==undefined?dropdownSel[id]:current;dropdownSel[id]=cur;const txt=((options.find(o=>String(o[0])===String(cur)))||[null,cur])[1];return `<div class="vc-field"><span class="vc-field-label">${label}</span><button class="vc-dropdown" aria-label="${E(label)}" aria-haspopup="dialog" aria-expanded="${openDropdown===id}" data-act="dropdown:${id}"><span>${E(txt)}</span>${I('chevron-down')}</button></div>`;};
const book=()=>engine.book(bookId),chapter=()=>engine.chapter(bookId,chapterId),voice=()=>engine.state.voices.find(v=>v.id===voiceId),bookInfoTarget=()=>engine?.state?.books?.find(b=>b.id===bookId)||null;
const voiceName=id=>id?.startsWith('preset:')?'MiMo · '+id.slice(7):engine.state.voices.find(v=>v.id===id)?.name||'尚未分配';
const textLen=c=>c.unloaded?(c.textLength||0):(typeof c.text==='string'?c.text.length:(c.textLength||0));
const segCount=c=>c.unloaded?(c.segmentCount||0):(Array.isArray(c.segments)?c.segments.length:(c.segmentCount||0));
const pendingConfirm=()=>{if(!engine)return 0;return engine.state.tasks.filter(t=>t.status==='waiting'||t.status==='failed').length;};
const cleanErrRaw=s=>String(s||'').replace(/\/data\/[^:\s]*/g,'[应用数据文件]').replace(/[\w.-]+\.json:\s*open failed:\s*/gi,'').replace(/open failed:\s*ENOENT\s*(\([^)]*\))?/gi,'文件缺失').replace(/ENOENT\s*(\([^)]*\))?/gi,'文件缺失').trim();
const cleanErr=s=>BajiaoUX.friendlyError(s);
const isMissingData=s=>BajiaoUX.isStorageError(s);
const fmt=seconds=>Math.floor(seconds/60).toString().padStart(2,'0')+':'+Math.floor(seconds%60).toString().padStart(2,'0');
const status=t=>({queued:'排队中',running:'制作中',paused:'已暂停',waiting:'待确认',failed:'失败',done:'已完成',cancelled:'已取消'}[t]||t);
function toast(message){const t=$('#toast');if(!t)return;clearTimeout(toast.timer);clearTimeout(hideToast._t);t.classList.remove('vc-toast-hide');t.textContent=message;toast.timer=setTimeout(()=>hideToast(),5000);}
function hideToast(){const t=$('#toast');if(!t||!t.textContent)return;clearTimeout(toast.timer);t.classList.add('vc-toast-hide');clearTimeout(hideToast._t);hideToast._t=setTimeout(()=>{t.textContent='';t.classList.remove('vc-toast-hide');},380);}
document.addEventListener('click',()=>{try{hideToast();}catch(e){}},true);
async function busy(fn,label='正在处理…'){if(!$('#busy').hidden)return;$('#busy').hidden=false;$('#busy div').textContent=label;try{return await fn();}catch(e){toast(cleanErr(e));}finally{$('#busy').hidden=true;render();}}
function go(p,allowLeave=false){if(p==='policy'||p==='models')p='settings';if(p!==page&&productionLeave(()=>go(p,allowLeave)))return;if(p!==page&&productionPages.includes(page)){productionDraft=null;productionDraftPage=null;}if(!allowLeave&&page==='voicedetail'&&p!==page&&voiceDirty()){askVoiceLeave(()=>go(p,true));return;}if(p!=='choose'&&voiceSource==='preset')voiceSource='all';if(!allowLeave&&configDirty&&['llm','mimo'].includes(page)&&p!==page){askLeave(()=>go(p,true));return;}rememberReading();const open=()=>{const returnContext=p==='roles'&&page==='annotated'?{scroll:window.scrollY,fromTasks:!!window.fromTasks}:{};resetModalFlags();if(p!=='annotated')window.fromTasks=false;const isTabSwitch=['raw','annotated','listen'].includes(page)&&['raw','annotated','listen'].includes(p);if(!isTabSwitch){history.push({page,bookId,chapterId,voiceId,roleName,...returnContext});}// 从听书切到原文/标注：跳到当前播放对应行（同书同章且有进度时）
if(page==='listen'&&(p==='raw'||p==='annotated')){try{const bp=(typeof miniPlayingState!=='undefined'&&miniPlayingState?.position)||0;const __same=(playingBookId===bookId&&playingChapterId===chapterId)||(typeof miniPlayingState!=='undefined'&&miniPlayingState?.id&&chapter()?.audio===miniPlayingState.id);if(bp>0&&__same)window.__jumpToPos=bp;}catch(e){}}const hasSentenceTarget=p==='annotated'&&pendingSeg!=null;page=p;render();if(window.__jumpToPos==null&&!hasSentenceTarget)window.scrollTo(0,0);};if(['raw','annotated','listen','editseg','task'].includes(p)){let __need=false;try{const __c=chapter();__need=!!(__c.unloaded||typeof __c.text!=='string'||!Array.isArray(__c.segments)||p==='annotated'&&(!__c.segments.length||__c.analysisDraft&&__c.analysisDraft.version!==2));}catch(e){}if(__need){busy(async()=>{try{if(p==='annotated')await engine.prepareAnnotations(bookId,chapterId);else await engine.ensureChapter(bookId,chapterId);}catch(e){toast('章节读取失败：'+(e.message||e));recoveryError=e;page='recovery';render();return;}open();},'读取章节…');}else open();}else open();}
function getChapterTarget(c){if(!c)return 'raw';if(c.audio){return 'listen';}const hasAnnotation=c.unloaded?((c.segmentCount||0)>0):(c.segments&&c.segments.length>0);if(hasAnnotation||c.status==='annotated'||c.status==='waiting'){return 'annotated';}return 'raw';}
function leaveImport(){
  importDraft=null;delete dropdownSel.splitRule;resetModalFlags();
  history=history.filter(entry=>entry.page!=='splitpreview');page='shelf';render();window.scrollTo(0,0);
}
function enterImport(draft){
  importDraft=draft;delete dropdownSel.splitRule;resetModalFlags();
  page='splitpreview';render();window.scrollTo(0,0);
}
function markImportRuleDirty(){
  if(!importDraft||page!=='splitpreview')return;
  importDraft.ruleDirty=true;importDraft.error='';
  importDraft.manualOpen=true;
  const confirm=$('[data-act="confirmsplit"]');if(confirm)confirm.disabled=true;
  const result=$('.vc-import-results');if(result)result.hidden=true;
  const message=$('#import-rule-status');if(message)message.textContent='规则已修改，请应用规则并预览。';
}
async function probeImport(){
  const draft=importDraft;if(!draft||draft.probing||draft.importing||!draft.text.trim())return;
  draft.probing=true;draft.error='';render();
  try{
    const head=BajiaoUX.probeWindows(draft.text);
    const response=await engine.llm(Bajiao.SPLIT_PROBE_PROMPT+'\n'+head,{task:'chapter-split',maxTokens:2000});
    if(importDraft!==draft)return;
    const template=String(response.template||'').trim();
    if(!template.includes('*'))throw Error('LLM 没有返回可用的标题模板。请重新识别，或手动选择规则。');
    const result=BajiaoUX.validateProbe(draft.text,template);draft.probeCandidate={template,result};draft.error='';
    if(!draft.result){draft.ruleId='custom';draft.customPattern=template;draft.result=result;dropdownSel.splitRule='custom';draft.probeCandidate=null;}
    draft.probeNote='已用全文验证模板：'+template+'，共 '+result.report.count+' 个标题。';
  }catch(error){if(importDraft===draft)draft.error=cleanErr(error);}
  finally{if(importDraft===draft){draft.probing=false;render();}}
}
window.appBack=()=>{if(productionDialogClose){productionDialogClose('cancel');return;}if(productionLeave(()=>window.appBack()))return;if(productionPages.includes(page)){productionDraft=null;productionDraftPage=null;}if(closeActiveModal())return;if(page==='voicedetail'&&voiceDirty()){askVoiceLeave(()=>{voiceEditor=null;appBack();});return;}if(configDirty&&['llm','mimo'].includes(page)){askLeave(()=>{configDirty=false;appBack();});return;}if(page==='editseg'){page='annotated';history=history.filter(h=>h.page!=='editseg');render();restoreEditorPosition();return;}rememberReading();if(page==='splitpreview'){if(!importDraft?.importing)leaveImport();return;}if(['annotated','raw'].includes(page)&&window.fromTasks){window.fromTasks=false;page='tasks';render();window.scrollTo(0,0);return;}if(['raw','annotated','listen','editseg'].includes(page)){while(history.length&&['raw','annotated','listen','editseg'].includes(history[history.length-1].page)){history.pop();}if(history.length&&history[history.length-1].page==='detail'&&history[history.length-1].bookId===bookId){const previous=history.pop();({page,bookId,chapterId,voiceId,roleName}=previous);}else{page='detail';}render();window.scrollTo(0,0);return;}const previous=history.pop();if(previous){({page,bookId,chapterId,voiceId,roleName}=previous);if(page==='annotated'&&previous.fromTasks!=null)window.fromTasks=previous.fromTasks;}else page='shelf';render();window.scrollTo(0,previous?.scroll||0);};
let lastProdStatus = null;
let waitingForNextChapterId = null;
let waitingForNextChapterPaused = false;
let productionPlaybackSession = {catchUps:0,paused:false,stoppedForSlowProduction:false};
const slowProductionMessage = '当前制作进度较慢，已停止播放。建议整章制作完成后手动播放。';
function startPlaybackSession(options={}){
  if(!options.continueSession)productionPlaybackSession={catchUps:0,paused:!!options.startPaused,stoppedForSlowProduction:false};
  return productionPlaybackSession;
}
async function waitForProduction(message,bid,cid){
  const session=productionPlaybackSession,audioId=playingId;
  if(session.paused)return;
  const stopped=++session.catchUps>=2;
  if(stopped){session.stoppedForSlowProduction=true;setProductionWaitPaused(true);playbackPrompts?.cancel();}
  // Remember the completed file even when this wait is immediately paused, so
  // an explicit resume waits for new content instead of replaying the last line.
  await device.call('playback',{op:'wait',expectedAudioId:audioId});
  if(session!==productionPlaybackSession||playingId!==audioId)return;
  if(stopped){
    await device.call('playback',{op:'pause'});
    if(session!==productionPlaybackSession||playingId!==audioId)return;
    toast(slowProductionMessage);
  }else if(!session.paused){
    toast(message);playbackPrompts?.schedule('waiting',bid,cid,audioId);
  }
  render();
}
window.checkAutoProduceUpcoming = checkAutoProduceUpcoming;
async function checkAutoProduceUpcoming(bid, cid){
  if(!engine || engine.state?.settings?.autoProduceUpcoming === false) return;
  const b = engine.state.books.find(x => x.id === bid);
  if(!b) return;
  const currIdx = b.chapters.findIndex(x => x.id === cid);
  if(currIdx < 0) return;
  const nPro = Math.min(3, Math.max(1, Number(engine.state.settings.autoProduceCount || 2)));const upcomingChapters = b.chapters.slice(currIdx + 1, currIdx + 1 + nPro);
  for(const upcoming of upcomingChapters){
    if(!upcoming.audio){
      const alreadyInQueue = engine.state.tasks.some(t => t.bookId === b.id && t.chapterId === upcoming.id && (t.status === "running" || t.status === "queued"));
      if(!alreadyInQueue){
        engine.enqueue(b.id, [upcoming.id],{source:'auto'}).catch(e => { console.warn("Auto enqueue failed", e); });
      }
    }
  }
}
function taskProductionMetrics(t, chapter){
  const segs = Array.isArray(chapter?.segments) ? chapter.segments : null;
  const segTotal = segs ? segs.length : 0;
  const segDone = segs ? segs.filter(s => s.audio).length : 0;
  const total = Math.max(0, Number(t?.total) || segTotal || Number(chapter?.segmentCount) || 0);
  const rawDone = Math.max(Number(t?.done) || 0, segDone);
  const done = total > 0 ? Math.min(total, rawDone) : rawDone;
  const pct = total > 0 ? Math.min(100, Math.max(0, Math.round((done / total) * 100))) : 0;
  return { done, total, pct };
}
async function syncProductionStatus(){
  if(!engine || !window.device?.productionStatus) return;
  const activeTasks = engine.state.tasks.filter(t => t.status === "running" || t.status === "queued");
  if(activeTasks.length > 0){
    const running = activeTasks.find(t => t.status === "running") || activeTasks[0];
    const b = engine.state.books.find(x => x.id === running.bookId);
    const c = b?.chapters.find(x => x.id === running.chapterId);
    const { done: doneSegs, total: totalSegs } = taskProductionMetrics(running, c);
    const queuedCount = activeTasks.length - 1;
    const title = b ? "后台制作中 · " + b.name : "芭蕉 正在后台制作";
    const queueText = queuedCount > 0 ? " (后排队 " + queuedCount + " 章)" : "";
    const message = (running.retryWaiting||running.networkWaiting ? running.phase+" · " : "") + (c ? c.title + " (" + doneSegs + "/" + (totalSegs || "...") + ")" + queueText : "正在合成有声书章节...");
    const key = running.id + ":" + running.phase + ":" + doneSegs + "/" + totalSegs + ":" + queuedCount;
    if(key !== lastProdStatus){
      lastProdStatus = key;
      device.productionStatus({active: true, title, message, progress: doneSegs, total: totalSegs}).catch(()=>{});
    }
  } else {
    if(lastProdStatus !== null){
      lastProdStatus = null;
      device.productionStatus({active: false}).catch(()=>{});
    }
  }
}
window.appBackground = () => { if(engine){ rememberReading();saveCurrentPlayback().then(()=>engine.persist()).catch(()=>{}); syncProductionStatus().catch(()=>{}); } };
const roleProfileAttempts=new Set(),roleProfileMessages=new Map();
function roleProfileNotice(b){
 const message=roleProfileMessages.get(b.id),missing=b.characters.some(r=>engine.characterProfileMissing(r));
 return message||missing?`<div class="vc-note" role="status">${E(message||'部分角色资料待补全，将根据原文补全角色背景与声音描写。')}${missing&&!engine.profileJobs?.has(b.id)?B('补全缺失资料','fillroleprofiles',true):''}</div>`:'';
}
function loadRoleProfiles(force=false){
 const bid=bookId,b=engine?.state.books.find(b=>b.id===bid);
 if(!b||engine.profileJobs?.has(bid)||!b.characters.some(r=>engine.characterProfileMissing(r))||!force&&(roleProfileAttempts.has(bid)||!configured.llmConfigured))return;
 roleProfileAttempts.add(bid);roleProfileMessages.set(bid,'正在根据原文补全角色资料…');
 engine.ensureCharacterProfiles(bid).then(count=>roleProfileMessages.set(bid,count?'已根据原文补全 '+count+' 个角色的资料。':'现有原文证据不足，暂未补全更多资料。')).catch(e=>roleProfileMessages.set(bid,'资料补全未完成：'+cleanErr(e)+'。可重试。')).finally(()=>{if(page==='roles'&&bookId===bid)render();});
 queueMicrotask(()=>{if(page==='roles'&&bookId===bid)render();});
}
function nav(){const pend=pendingConfirm();const active=['shelf','detail','splitpreview','roles','choose','make','editseg'].includes(page)?'shelf':['voices','voiceimport','voicedetail','design'].includes(page)?'voices':['tasks','task'].includes(page)?'tasks':'settings';return `<nav class="vc-nav" aria-label="主导航">${[['shelf','library','书架'],['voices','audio-lines','音色'],['tasks','list-checks','制作'],['settings','user-round','我的']].map(([p,i,t])=>`<button class="${active===p?'active':''}" ${active===p?'aria-current="true"':''} data-act="go:${p}">${I(i)}${t}${p==='tasks'&&pend>0?`<span class="vc-nav-badge">${pend>99?'99+':pend}</span>`:''}</button>`).join('')}</nav>`;}
function modebar(){return `<nav class="vc-nav vc-modebar" aria-label="阅读模式">${[['raw','原文'],['annotated','标注'],['listen','听书']].map(([p,n])=>`<button class="${page===p?'active':''}" data-act="go:${p}">${n}</button>`).join('')}</nav>`;}
function fitMarquee(){try{document.querySelectorAll('.vc-marquee').forEach(el=>{const over=el.scrollWidth>el.clientWidth+4;el.classList.toggle('scroll',over);if(over)el.style.setProperty('--mq',(-(el.scrollWidth-el.clientWidth))+'px');});}catch(e){}}
let footerObserver=null,lastRenderedContext='',modalSession=null;
let renderedModalMarkup='',renderedModalContext='';
let renderedContentMarkup='',renderedContentContext='';
let seekDragging=false,seekRenderPending=false,seekCommitting=false,seekRequest=0;
// Retain subtitle nodes during background production so highlighting and gestures survive.
function retainTranscript(previous,next){
 const rows=new Map(Array.from(previous.children).map(row=>[row.dataset.segstream,row]));
 for(const incoming of Array.from(next.children)){
  const row=rows.get(incoming.dataset.segstream);if(!row)continue;
  for(const key of ['act','start','end']){if(incoming.dataset[key]!=null)row.dataset[key]=incoming.dataset[key];else delete row.dataset[key];}
  for(const name of ['is-dialogue','is-skip'])row.classList.toggle(name,incoming.classList.contains(name));
  for(const selector of ['.vc-transcript-speaker','.vc-transcript-text','small']){
   const old=row.querySelector(selector),fresh=incoming.querySelector(selector);
   if(old&&fresh){if(old.textContent!==fresh.textContent)old.textContent=fresh.textContent;}
   else if(old)old.remove();else if(fresh)row.append(fresh.cloneNode(true));
  }
  incoming.replaceWith(row);
 }
 previous.replaceChildren(...next.children);return previous;
}
function updateScreen(markup,context){
  const active=document.activeElement;
  const importFocus=context===renderedModalContext&&active?.id&&active.matches('input,textarea,select')
    ?{id:active.id,start:active.selectionStart,end:active.selectionEnd}:null;
  const template=document.createElement('template');template.innerHTML=markup;
  const overlays=Array.from(template.content.querySelectorAll('.vc-modal-overlay'));
  const modalMarkup=overlays.map(el=>el.outerHTML).join('');
  for(const overlay of overlays)overlay.remove();
  let content=$('#screen-content'),modals=$('#modal-root');
  if(!content||!modals){
    content=document.createElement('div');content.id='screen-content';
    modals=document.createElement('div');modals.id='modal-root';
    $('#screen').replaceChildren(content,modals);
  }
  const contentMarkup=template.innerHTML;
  if(contentMarkup!==renderedContentMarkup||context!==renderedContentContext){
    const sameContext=context===renderedContentContext;
    if(!sameContext){document.getElementById('app').style.setProperty('--reader-header-offset','0px');__slimContext='';__slimOffset=0;__slimLastY=0;}
    const scrollY=window.scrollY;
    const collapsed=sameContext&&content.querySelector('.vc-slim-top')?.classList.contains('vc-collapsed');
    if(collapsed)template.content.querySelector('.vc-slim-top')?.classList.add('vc-collapsed');
    if(sameContext&&page==='listen'){
      const previous=content.querySelector('#transcriptPanel'),next=template.content.querySelector('#transcriptPanel');
      if(previous&&next)next.replaceWith(retainTranscript(previous,next));
    }
    content.replaceChildren(template.content);
    renderedContentMarkup=contentMarkup;renderedContentContext=context;
    if(sameContext)window.scrollTo({top:scrollY,behavior:'instant'});
  }
  if(importFocus){const input=document.getElementById(importFocus.id);if(input){input.focus({preventScroll:true});if(typeof input.setSelectionRange==='function'&&importFocus.start!=null)try{input.setSelectionRange(importFocus.start,importFocus.end);}catch(e){}}}
  // Keep open dialogs attached: replacing them restarts entrance animations and
  // loses focus/scroll on every background synthesis checkpoint.
  if(modalMarkup!==renderedModalMarkup||context!==renderedModalContext){
    if(context===renderedModalContext&&modals.querySelector('.vc-segment-sheet')){
      for(const overlay of overlays){if(overlay.querySelector('.vc-segment-sheet')){overlay.style.animation='none';overlay.querySelector('.vc-segment-sheet').style.animation='none';}}
    }
    modals.replaceChildren(...overlays);
    renderedModalMarkup=modalMarkup;renderedModalContext=context;
  }
}
const listenChapterLoads=new Set();
function loadListenTranscript(){
  if(page!=='listen'||!bookId||!chapterId)return;
  const c=chapter();
  if(!c.unloaded&&typeof c.text==='string'&&Array.isArray(c.segments))return;
  const bid=bookId,cid=chapterId,key=bid+':'+cid;
  if(listenChapterLoads.has(key))return;
  listenChapterLoads.add(key);
  // 读取正文不会触发 onChange；所有听书入口都要在分句加载后刷新。
  engine.ensureChapter(bid,cid).then(()=>{
    if(page==='listen'&&bookId===bid&&chapterId===cid)render();
  }).catch(e=>{
    if(page==='listen'&&bookId===bid&&chapterId===cid)toast('章节读取失败：'+(e.message||e));
  }).finally(()=>listenChapterLoads.delete(key));
}
const hasModal=()=>!!(segmentPanel||uxDialog||playerCatalogOpen||episodeModalOpen||deleteConfirmBookId||deleteConfirmShelf||batchModalBookId||openDropdown||speedModalOpen||sleepModalOpen||listenSettingsOpen||bookInfoOpen||unmadeChoiceChapterId);
function resetModalFlags(){segmentPanel=null;playerCatalogOpen=false;uxDialog=null;episodeModalOpen=false;deleteConfirmBookId=null;deleteConfirmShelf=null;batchModalBookId=null;openDropdown=null;speedModalOpen=false;sleepModalOpen=false;sleepCustomOpen=false;listenSettingsOpen=false;bookInfoOpen=false;unmadeChoiceChapterId=null;}
function closeActiveModal(){if(productionDialogClose){productionDialogClose('cancel');return true;}if(!hasModal())return false;resetModalFlags();render();return true;}
function syncFooterLayout(){
  if(footerObserver)footerObserver.disconnect();
  const root=$('#app'),entries=[['.vc-nav','--vc-nav-height'],['.vc-dock','--vc-dock-height'],['.vc-mini-player','--vc-mini-height']];
  const update=()=>{for(const [selector,property] of entries){const el=$(selector);const next=Math.ceil(el?.getBoundingClientRect().height||0)+'px';if(root.style.getPropertyValue(property)!==next)root.style.setProperty(property,next);}fitMarquee();};
  update();
  if(window.ResizeObserver){footerObserver=new ResizeObserver(update);for(const [selector] of entries){const el=$(selector);if(el)footerObserver.observe(el);}}
}
let lastViewportWidth=innerWidth,lastViewportHeight=innerHeight;
window.addEventListener('resize',()=>{const keyboardClosed=Math.abs(innerWidth-lastViewportWidth)<2&&innerHeight-lastViewportHeight>100;lastViewportWidth=innerWidth;lastViewportHeight=innerHeight;if(keyboardClosed&&document.activeElement?.matches('input,textarea,select'))document.activeElement.blur();syncFooterLayout();});
function syncModalUI(){
  const overlay=$('.vc-modal-overlay');
  $('#screen-content').inert=!!overlay;
  if(!overlay){
    if(modalSession){
      document.body.style.overflow=modalSession.bodyOverflow;document.documentElement.style.overflow=modalSession.rootOverflow;
      const act=modalSession.returnAct;modalSession=null;
      const target=Array.from(document.querySelectorAll('[data-act]')).find(el=>el.dataset.act===act);
      if(target)target.focus({preventScroll:true});
    }
    return;
  }
  const dialog=overlay.querySelector('.vc-dialog,.vc-modal-content');if(!dialog)return;
  const isNew=!dialog.hasAttribute('role');
  if(!modalSession){modalSession={returnAct:modalOpener,bodyOverflow:document.body.style.overflow,rootOverflow:document.documentElement.style.overflow};}
  document.body.style.overflow='hidden';document.documentElement.style.overflow='hidden';
  // All overlays, including the chapter picker, live beside the inert content.
  dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.tabIndex=-1;
  const heading=dialog.querySelector('h3');if(heading){heading.id='vc-dialog-title';dialog.setAttribute('aria-labelledby',heading.id);}
  if(!dialog.querySelector('[data-act="'+overlay.dataset.act+'"]')){
    let header=dialog.querySelector('.vc-modal-header');if(!header){header=document.createElement('div');header.className='vc-modal-header';dialog.prepend(header);if(heading)header.appendChild(heading);}
    const close=document.createElement('button');close.className='vc-icon';close.type='button';close.dataset.act=overlay.dataset.act;close.setAttribute('aria-label','关闭');close.textContent='×';header.appendChild(close);
  }
  if(isNew&&!dialog.contains(document.activeElement))dialog.focus({preventScroll:true});
}
let modalOpener=null;
$('#screen').addEventListener('click',e=>{const trigger=e.target.closest('[data-act]');if(trigger&&!hasModal())modalOpener=trigger.dataset.act;},true);
document.addEventListener('keydown',e=>{
  const dialog=$('.vc-modal-overlay .vc-dialog,.vc-modal-overlay .vc-modal-content');if(!dialog)return;
  if(e.key==='Escape'){e.preventDefault();closeActiveModal();return;}
  if(e.key==='Tab'){const items=Array.from(dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),[tabindex="0"],summary,select:not(:disabled)')).filter(el=>el.getClientRects().length);if(!items.length){e.preventDefault();dialog.focus();return;}const first=items[0],last=items[items.length-1];if(e.shiftKey&&(document.activeElement===first||!dialog.contains(document.activeElement)||document.activeElement===dialog)){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||!dialog.contains(document.activeElement)||document.activeElement===dialog)){e.preventDefault();first.focus();}}
});
function segmentAdvancedKey(b,c,s){return JSON.stringify([b.id,c.id,String(s.id)]);}
function segmentAdvancedOptions(b,c,s){
 const prompt=segmentPromptValue(b,c,s),busy=engine.segmentBusy(b.id,c.id,s.id),previous=s.lastSpeechRequest,changed=prompt!==appliedSegmentPrompt(b,s);
 const note=Bajiao.isPunctOnly(s.text)?'此段仅含符号，将跳过标注与朗读。':s.audio&&s.audio!=='skip'&&!previous?'旧音频未记录提示词，以下为下次合成将使用的指导。':'以下为下次合成将发送的指导，可调整场景、语气与节奏。';
 return `<section class="vc-segment-advanced" data-advanced-seg="${E(String(s.id))}"><div class="vc-prompt-heading"><label for="ttsPrompt-${s.id}">朗读提示词</label><button type="button" class="vc-link" data-act="resetsegprompt:${s.id}" ${busy?'disabled':''}>${c?.promptMode==='fast'?'恢复默认提示词':'使用标注指导'}</button></div><p class="vc-sub">${note}</p>${s.directionError&&!s.ttsPrompt?'<p class="vc-sub" role="status">导演指导未生成，本次使用情绪标注</p>':''}<textarea id="ttsPrompt-${s.id}" data-tts-prompt="true" rows="5" spellcheck="false" ${busy?'readonly':''}>${E(prompt)}</textarea><small id="segment-prompt-status" class="vc-prompt-status${changed?' is-dirty':''}" role="status">${changed?'已修改，合成后生效':'编辑后合成生效'}</small>${previous?`<details class="vc-last-prompt"><summary>上次合成记录</summary><small>提示词</small><pre>${E(previous.prompt)}</pre><small>朗读原文</small><pre>${E(previous.text)}</pre></details>`:''}</section>`;
}
function segmentQualityControls(b,c,s,showControls=true){
 if(s.skip||s.isAd||s.audio==='skip')return '';
 const busy=engine.segmentBusy(b.id,c.id,s.id),draft=s.retryDraft||s.speechDraft;
 const issues=s.qualityIssues||draft?.qualityIssues||[];
 const pending=s.qualityStatus==='pending'&&!s.audio;
 const contentRejected=pending&&Bajiao.isContentRejected(s.failReason);
 const controls=showControls&&(pending||s.audio||s.retryError||busy)?'<div class="vc-issue-actions"><button class="vc-btn secondary" data-act="regenerateseg:'+s.id+'" '+(busy?'disabled':'')+'>'+(busy?'正在合成此句…':'重新合成此句')+'</button><small>会产生合成费用</small></div>':'';
 return (s.silenceProcessing?.removedMs>0?'<p class="vc-sub">已自动裁剪 '+(s.silenceProcessing.removedMs/1000).toFixed(2)+' 秒空白，原始返回已保留。</p>':'')+
  (s.repetitionCorrection?'<p class="vc-sub">重试后已自动截去重复朗读，原始音频已保留。</p>':'')+
  (s.repetitionUnresolved?'<p class="vc-sub">'+(s.repetitionConfirmed?'已确认保留原音频。':'重试后仍疑似重复，未找到安全截断位置，已保留原音频继续。')+'</p>':'')+
  (pending&&draft?.pendingRaw?.confirmationRequired?'<p class="vc-sub">无法安全截断，请试听原始返回后决定。</p><button type="button" class="vc-btn secondary" data-act="confirmrepetition:'+s.id+'" '+(busy?'disabled':'')+'>确认保留原音频继续</button>':'')+
  (issues.length?'<p class="vc-sub">本地检查提示：'+E(issues.join('、'))+'；请试听判断。</p>':'')+
  (contentRejected?'':pending?'<p class="vc-sub">已自动重试 '+Number(s.qualityAttempts??draft?.qualityAttempts??0)+' / 1 次</p>':'')+
  (s.retryError?'<p class="vc-sub">重新合成失败：'+E(s.retryError)+'</p>':'')+controls;
}
function render(){if(!engine||taskDrag)return;if(page==='listen'&&seekDragging){seekRenderPending=true;return;}if(uxDialog?.title==='阅读设置'&&document.querySelector('.vc-reading-settings')){syncReadingSettings();return;}if(page==='detail'&&catalogSheet?.interacting&&!hasModal()&&!productionDialogClose){catalogRenderPending=true;return;}const panelScroll=document.getElementById('segment-panel-scroll');if(panelScroll&&segmentPanel)segmentPanel.scroll=panelScroll.scrollTop;const context=page==='detail'?['detail',bookId].join('|'):[page,bookId,chapterId,voiceId,roleName].join('|');const keepForm=lastRenderedContext===context;const catalogAnchor=keepForm&&page==='detail'?captureCatalogAnchor():null;const enteringCatalog=page==='detail'&&!keepForm;const formDraft=keepForm?Array.from(document.querySelectorAll('#screen input[id]:not([type=range]):not([type=hidden]), #screen textarea[id]')).map(el=>({id:el.id,value:el.value,preserveValue:!el.hasAttribute('data-tts-prompt')||el.value!==el.defaultValue,checked:el.checked,focused:el===document.activeElement,start:el.selectionStart,end:el.selectionEnd})):[];lastRenderedContext=context;const state=engine.state;if(bookId){const b=state.books.find(b=>b.id===bookId);selected=b?selected.filter(id=>b.chapters.some(c=>c.id===id)):[];}const autoMode=state.settings?.mode==='auto';let h='';
if(page==='design'&&designJob?.result&&designJob.bookId===bookId&&designJob.roleName===roleName&&!candidate)candidate=designJob.result;
switch(page){
case 'shelf':{let resumeBanner='';if(engine?.state?.lastPlayback){const lp=engine.state.lastPlayback;const rb=engine.state.books.find(b=>b.id===lp.bookId);const rc=rb?.chapters.find(c=>c.id===lp.chapterId&&(c.audio||c.segmentCount||(c.segments||[]).some(s=>s.audio&&s.audio!=='skip')));if(rb&&rc){resumeBanner=`<div class="vc-resume-banner"><div class="vc-resume-info"><small>上次听至 · ${E(rb.name)}</small><strong>${E(rc.title)}</strong></div><button class="vc-btn primary" data-act="resumebook:${rb.id}:${rc.id}">${I('play')} 继续收听</button></div>`;}}h=shelfHeader(state)+(!configured.llmConfigured||!configured.ttsConfigured?`<div class="vc-note">开始制作前，先配置语言模型与 MiMo TTS。${L('配置模型 →','go:models')}</div>`:'')+resumeBanner+(state.books.length?`<div class="vc-covers">${state.books.map(b=>shelfMulti?`<button class="vc-book vc-book-select ${shelfSelected.includes(b.id)?'is-selected':''}" data-act="book:${b.id}" aria-pressed="${shelfSelected.includes(b.id)}" aria-label="选择${E(b.name)}">${cover(b.name)}<span class="vc-book-check" aria-hidden="true">${shelfSelected.includes(b.id)?I('check'):''}</span><h3>${E(b.name)}</h3><small>${b.chapters.length} 章 · ${b.chapters.filter(c=>c.audio).length} 章可听</small></button>`:`<button class="vc-book" data-act="book:${b.id}">${cover(b.name)}<h3>${E(b.name)}</h3><small>${b.chapters.length} 章 · ${b.chapters.filter(c=>c.audio).length} 章可听</small></button>`).join('')}</div>`:`<div class="empty">${I('book-open')}<h3>你的第一本有声书</h3><p class="vc-sub">导入 TXT / EPUB，或先体验示例小说。</p>${B('导入小说','importbook')}<p>${L('添加示例文本','samplebook')}</p></div>`);break;}
case 'detail':{
  const b=book();
  if(!b){go('shelf');break;}
  if(b.importWarnings&&b.importWarnings.length&&!b._warnNotified){
    b._warnNotified=true;
    device.call('notify',{
      channel:'notice',
      title:'书籍导入提示 · '+b.name,
      message:b.importWarnings.join('\n'),
      type:'info'
    }).catch(()=>{});
  }
  const totalChapters=b.chapters.length;
  const visibleChapters=b.chapters;const totalPages=Math.ceil(visibleChapters.length/50)||1;
  prepareCatalog(b,visibleChapters,enteringCatalog);
  const currentChapters=catalogWindow.visible;
  const pendingRoles=b.characters.filter(r=>r.name!=='旁白'&&r.name!=='广告'&&!r.voice).length;

  const headingHtml = multi ? `
    <div class="vc-chapter-management od-stack">
      <div class="vc-chapter-selection od-row"><p class="od-fill" role="status" aria-live="polite">已选 <strong>${selected.length}</strong> / ${totalChapters} 章</p><button type="button" class="vc-catalog-text-action" data-act="openepisodes" aria-label="选择章节组" aria-haspopup="dialog">选集</button></div>
      <div class="vc-chapter-batch-actions"><button class="vc-btn primary" data-act="go:make" ${!selected.length?'disabled':''}>制作音频</button><button class="vc-btn secondary" data-act="clearchapters" ${!selected.length?'disabled':''}>释放音频</button><button class="vc-btn secondary vc-chapter-reset" data-act="resetchapters" ${!selected.length?'disabled':''}>重置标注</button></div>
    </div>
  ` : `
    <div class="vc-list-heading"><div class="vc-chapter-title-wrap"><h3>章节目录</h3><small class="vc-sub-count">共 ${totalChapters} 章</small></div><div class="vc-heading-actions">${totalPages>1?`<button type="button" class="vc-catalog-text-action" data-act="openepisodes" aria-label="选择章节组" aria-haspopup="dialog">选集</button>`:''}<button type="button" class="vc-manage-chapters vc-catalog-text-action" data-act="multiselect" aria-label="编辑章节">编辑</button></div></div>
  `;

  const episodeModalHtml = episodeModalOpen ? `
    <div class="vc-modal-overlay" data-act="closeepisodes">
      <div class="vc-modal-content">
        <div class="vc-modal-header">
          <h3>选择集数</h3>
          <button class="vc-icon" data-act="closeepisodes" aria-label="关闭">${I('x')}</button>
        </div>
        <p class="vc-sub">共 ${totalChapters} 章 · 每组 50 章</p>
        <div class="vc-episode-grid">
          ${Array.from({length:totalPages},(_,idx)=>{
            const s=idx*50+1;
            const e=Math.min((idx+1)*50,visibleChapters.length);
            return `<button class="vc-episode-btn ${idx===chapterPage?'active':''}" data-act="setchpage:${idx}">${s}-${e}</button>`;
          }).join('')}
        </div>
      </div>
    </div>
  ` : '';

  h=(multi?`<header class="vc-chapter-manage-header od-row"><h2 class="od-fill">编辑章节</h2><button type="button" class="vc-btn" data-act="multiselect">完成</button></header>`:top('书籍详情'))+`
    <section class="vc-detail-overview" ${multi?'hidden':''}><div class="vc-detail-overview-content">
    <div class="vc-row vc-book-summary">${coverEl(b,'vc-detail-cover')}<div class="vc-book-info" style="flex:1"><h3>${E(b.name)}</h3><p class="vc-sub">${b.author?E(b.author):'佚名'} · ${totalChapters} 章</p>${T(b.chapters.filter(c=>c.audio).length+' 章已有声')}</div></div>
    <div class="vc-split vc-bottom vc-detail-actions"><button class="vc-btn secondary vc-role-action" data-act="go:roles" aria-label="角色与音色${!autoMode&&pendingRoles?'，'+pendingRoles+'个待确认':''}">角色与音色${!autoMode&&pendingRoles?`<span class="vc-role-count">${pendingRoles>99?'99+':pendingRoles}</span>`:''}</button>${B('继续播放','continuebook')}</div>
    ${engine.state.chapterUndo?.bookId===b.id?'<div class="vc-detail-tools">'+B('撤销删除章节','undochapter',true)+'</div>':''}
    </div></section>
    <section class="vc-catalog-sheet" aria-label="章节面板">
    ${multi?'':'<button type="button" class="vc-catalog-handle" aria-label="上推展开章节目录" aria-expanded="false" aria-controls="catalog-scroll"><span aria-hidden="true"></span></button>'}
    <div class="vc-catalog-heading${multi?' is-managing':''}" id="catalog-heading">${headingHtml}</div>
    <div id="catalog-scroll" class="vc-catalog-scroll od-scroll" role="region" aria-label="章节目录滚动区域" tabindex="0">
    <div id="chapter-list" class="vc-chapter-list" role="list" aria-label="章节目录">${currentChapters.map(c=>catalogChapterRow(b,c)).join('')}</div>
    <div id="catalog-tail" aria-hidden="true"></div>
    </div>
    </section>
    ${episodeModalHtml}
  `;
  break;
}
case 'raw':case 'annotated':case 'listen':{const b=book(),c=chapter();h=page==='listen'?slimTop(c.title,b.name):slimTop(b.name,c.title);
if(c.audioStale&&!(engine.state.settings.dismissedStaleNotices||[]).includes(staleNoticeKey()))h+=`<aside class="vc-note vc-stale-notice"><span>正在听旧版成品；标注已改变，可重新制作。旧版会保留到新音频完成。</span><button type="button" class="vc-icon" data-act="dismissstalenotice" aria-label="关闭旧版成品提示">${I('x')}</button></aside>`;if(page==='raw')h+=typeof c.text==='string'?(()=>{let __units=[];try{__units=Bajiao.units?Bajiao.units(c.text):[{id:0,text:c.text}];}catch(e){__units=[{id:0,text:c.text}];}return `<article class="reader" id="rawArticle">${__units.map(u=>{const __t=String(u.text??'');const __paras=__t.split('\n');return `<p>${__paras.map(__p=>`<span class="vc-raw-seg" data-rawseg="${u.id}">${E(__p)}</span>`).join('<br>')}</p>`;}).join('')}</article>`;})():`<div class="empty"><p>章节文本缺失，无法显示原文。</p><small>可以重读本章，或从原文件恢复本章。</small></div>`;
if(page==='annotated'){
  if((c.segments||[]).length){
    const firstPending=(c.segments||[]).find(s=>s.annotationStatus==='pending');
    h+=`<p class="vc-annotated-count">共 ${segCount(c)} 个段落</p>`+(c.segments||[]).map(s=>{const isProblem=needsSpeakerConfirmation(s),voiceProblem=needsVoiceConfirmation(s);return `<div class="vc-quote ${needsProductionResume(s)?'vc-production-issue ':''}${isProblem||voiceProblem?'vc-issue-card uncertain':s.speaker==='旁白'?'':'speaker'}" data-seg="${s.id}"><div class="vc-row">${L(E(s.speaker)+' '+I('pencil'),'editseg:'+s.id)}<small>${E(s.emotion)}</small>${s.annotationStatus==='pending'?'':s.qualityStatus==='pending'&&!s.audio?'<span class="vc-tag warn" title="'+E(s.failReason||'音频待核验')+'">音频待处理</span>':s.audio&&s.audio!=='skip'?(s.qualityStatus==='passed_with_warnings'?'<span class="vc-tag warn">已合成·建议试听</span>':'<span class="vc-tag">已合成</span>'):s.audio==='skip'?(s.failReason?'<span class="vc-tag warn" title="'+E(s.failReason)+'">跳过·合成失败</span>':'<span class="vc-tag">已跳过</span>'):'<span class="vc-tag" style="opacity:.55">待合成</span>'}${s.annotationStatus==='pending'&&!s.annotationError?'<span class="vc-tag">待标注</span>':s.annotationStatus==='fallback'?'<span class="vc-tag" title="'+E(s.annotationFallbackReason||'说话人无法确定')+'">旁白兜底</span>':''}${voiceProblem&&!isProblem?'<span class="vc-issue-badge">待确认音色</span>':''}${isProblem?`<span class="vc-issue-badge">${I('alert-circle')} ${s.annotationError?'标注待处理':'待确认说话人'}</span>`:''}<button type="button" class="vc-segment-trigger od-touch" data-act="opensegment:${s.id}" aria-label="第${c.segments.indexOf(s)+1}段操作" aria-haspopup="dialog" aria-expanded="${!!segmentPanel&&segmentPanel.id===String(s.id)}">${I('ellipsis')}</button></div><p class="vc-quote-text">${E(s.text)}</p>${isProblem&&s.annotationError?`<p class="vc-sub">本句自动标注未完成，可修改说话人或使用旁白；其余句子的结果已保留。</p><details class="vc-error-detail"><summary>失败详情</summary><code>${E(String(s.annotationError))}</code></details>`:''}${isProblem?`<div class="vc-issue-actions">${L(I('pencil')+'修改说话人','editseg:'+s.id)}<button class="vc-btn-ignore" data-act="ignorespeaker:${s.id}">${I('fast-forward')} ${s.annotationError?'使用旁白':'忽略（沿用识别）'}</button></div>`:''}${voiceProblem?`<div class="vc-issue-actions">${L('为本角色分配音色','chooserole:'+s.speaker)}</div>`:''}${c.analysisDraft&&s===firstPending?`<div class="vc-issue-actions">${B('继续 AI 标注','analyze',true,engine.state.tasks.some(t=>t.bookId===b.id&&t.chapterId===c.id&&t.status==='running'))}</div>`:''}${s.retryError||s.qualityStatus==='pending'&&!s.audio?`<div class="vc-issue-actions">${L('核对朗读并重新合成','opensegment:'+s.id)}</div>`:''}${productionIssueHtml(s)}${s.qualityStatus==='pending'&&!s.audio?`<div class="vc-sub">${errorMarkup({message:s.failReason||'请核对音频后重试。',provider:'tts'})}</div>${s.speechDraft?.pendingRaw?.file?.id&&s.speechDraft.pendingRaw.playable!==false?L(I('play')+'试听原始返回','play:'+s.speechDraft.pendingRaw.file.id):''}`:''}</div>`;}).join('');
  }else{
    h+=`<div class="empty"><p>还没有标注结果。</p>${B('AI 识别角色','analyze')}</div>`;
  }
}
if(page==='raw'||page==='annotated'){
 const chapterIndex=b.chapters.findIndex(item=>item.id===c.id),next=chapterIndex>=0?b.chapters[chapterIndex+1]:null;
 h+=`<footer class="vc-reading-next">${next?`<p class="vc-reading-end">本章已读完</p><button type="button" class="vc-btn primary vc-next-chapter" data-act="readnext:${E(next.id)}"><span>下一章</span>${I('arrow-right')}</button><p class="vc-reading-next-title">${E(next.title)}</p>`:'<p class="vc-reading-end" role="status">已读至末章</p>'}</footer>`;
}
if(page==='listen'){
  const chapters=b.chapters||[];
  const chIdx=chapters.findIndex(ch=>ch.id===c.id);
  const prevCh=chIdx>0?chapters[chIdx-1]:null;
  const nextCh=chIdx>=0&&chIdx<chapters.length-1?chapters[chIdx+1]:null;
  const hasPrev=!!(prevCh&&playablePrefix(prevCh).length);
  const hasNext=!!(nextCh&&playablePrefix(nextCh).length);
  const curSpeed=engine?.state?.playbackSpeed||1;

  const activeProdTask = engine?.state.tasks.find(t => t.status === "running");
  let prodBanner = "";
  if (activeProdTask) {
    const tb = engine.state.books.find(x => x.id === activeProdTask.bookId);
    const tc = tb?.chapters.find(x => x.id === activeProdTask.chapterId);
    const { pct } = taskProductionMetrics(activeProdTask, tc);
    prodBanner = '<button class="vc-listening-prod-banner" data-act="gotasksactive"><span class="vc-pulse-dot"></span><span>正在制作 ' + E(tc?.title || '下一章') + ' ' + pct + '%，点此查看 →</span></button>';
  }
  h += prodBanner;
  if(productionPlaybackSession.stoppedForSlowProduction&&playingBookId===b.id&&playingChapterId===c.id)h+='<aside class="vc-note" role="status" data-production-wait-stop>'+E(slowProductionMessage)+'</aside>';
  h += '<div class="vc-player">';
  h += c.audio?(()=>{ const segs = engine?.computeSegmentTimestamps ? engine.computeSegmentTimestamps(c.segments || [], c.duration || 0, c.audioStale?null:c.audioTimeline, c.audio) : (c.segments || []); if (!segs || !segs.length) { return '<div class="vc-center"><small>时长 ' + fmt(c.duration || 0) + ' · 多角色演绎</small></div>'; } return '<div class="vc-lyric vc-transcript-panel" id="transcriptPanel" role="region" aria-label="逐句字幕跟读">' + segs.map((s, idx) => { return '<div class="vc-transcript-line' + (s.speaker && s.speaker !== '旁白' ? ' is-dialogue' : '') + '" data-act="seekseg:' + Math.round(s.startMs || 0) + '" data-segstream="' + E(String(s.id)) + '" data-start="' + Math.round(s.startMs || 0) + '" data-end="' + Math.round(s.endMs || 0) + '">' + '<span class="vc-transcript-speaker">' + E(s.speaker || '旁白') + '</span>' + '<span class="vc-transcript-text">' + E(s.text || '') + '</span>' + '</div>'; }).join('') + '</div>'; })():streamHtml(b,c);
  const streamReady=streamPrefix(c).length>0||engine?.state.tasks.some(t=>t.bookId===b.id&&t.chapterId===c.id&&!['done','cancelled'].includes(t.status));
  if(c.audio||streamState||streamReady){
const isStream = isChapterStreaming(c);
  const totalUnits = isStream ? chapterSentenceCount(c) : listenSeekDuration(c);
  const durationLabel = isStream ? (totalUnits + ' 句') : fmt(totalUnits / 1000);
  const curLabel = isStream ? '0 句' : '00:00';
  h += '<div class="vc-dock"><div class="vc-player-tools"><button class="vc-timer-button" data-act="sleepmenu" aria-label="睡眠定时">' + I('timer') + '<span>定时</span><span data-sleep-status></span></button><button class="vc-tool-toggle' + (engine.state.settings?.autoProduceUpcoming!==false?' is-on':'') + '" aria-pressed="' + (engine.state.settings?.autoProduceUpcoming!==false) + '" data-act="autoproducesettings" aria-haspopup="dialog">自动制作后续章节</button><button class="vc-tool-toggle' + (engine.state.settings?.autoDeletePlayed?' is-on':'') + '" aria-pressed="' + (!!engine.state.settings?.autoDeletePlayed) + '" data-act="listensettings" aria-haspopup="dialog">完播自动释放</button></div><div class="vc-player-progress"><button class="vc-seek-step" data-act="seekback" aria-label="快退15秒">' + I('rotate-ccw') + '<span>15</span></button><div class="vc-seek-track"><input type="range" id="seek" class="big-progress" min="0" max="' + totalUnits + '" value="0" aria-label="播放进度"><div class="vc-seek-times"><small class="vc-seek-bubble"><span id="playtime">' + curLabel + '</span><span aria-hidden="true">/</span><span id="playduration">' + durationLabel + '</span></small></div></div><button class="vc-seek-step" data-act="seekforward" aria-label="快进15秒">' + I('rotate-cw') + '<span>15</span></button></div>';
    h += '<div class="vc-ctlbar"><button class="vc-ctl vc-ctl-speed" data-act="speedmodal" title="倍速">' + I('gauge') + '<span class="vc-spd-val" id="speedBtnVal">' + curSpeed + 'x</span></button><button class="vc-ctl' + (hasPrev?'':' disabled') + '" data-act="prevchapter" title="上一章"' + (hasPrev?'':' disabled') + '>' + I('skip-back') + '</button><button class="vc-ctl primary" data-act="playchapter" id="playBtn" aria-label="播放">' + I('play') + '</button><button class="vc-ctl' + (hasNext?'':' disabled') + '" data-act="nextchapter" title="下一章"' + (hasNext?'':' disabled') + '>' + I('skip-forward') + '</button><button class="vc-ctl" data-act="playercatalog" title="章节目录" aria-label="章节目录">' + I('list') + '</button></div></div>';

    

  }
  h += '</div>';
}
break;}case 'editseg':{const c=chapter(),seg=c.segments.find(x=>x.id===editSegment);h=top('修正说话人')+`<section class="vc-speaker-editor"><div class="vc-speaker-context"><small>当前角色 · ${E(seg.speaker)}</small><p>${E(seg.text)}</p></div><section class="vc-speaker-replace"><h3>替换为其他角色</h3>${dd('segSpeaker','选择角色',book().characters.map(r=>[r.name,r.name]),seg.speaker)}${B('保存角色替换','saveseg')}<p class="vc-sub">仅修正本段角色，保存后可重新合成本段。</p></section><details class="vc-speaker-create"><summary>新增角色</summary>${field('角色名称','newRole','')}${field('音色描述','newRoleDescription','')}${B('添加并选中','addrole',true)}</details></section>`;break;}
case 'voices':h=title('VOICE LIBRARY · 声音档案','音色库',B(I('plus'),'importvoices',true))+`<div class="vc-tabs"><button class="${voiceTab==='mine'?'active':''}" data-act="voicetab:mine">我的音色 · ${state.voices.length}</button><button class="${voiceTab==='preset'?'active':''}" data-act="voicetab:preset">MiMo 预设</button></div>`+(voiceTab==='mine'?`<div class="vc-note">导入和设计统一保存，AI 根据描述匹配可用音色。</div><div class="vc-split">${B('导入音频','importvoices')}${B('设计新音色','newdesign',true)}</div>${state.voices.length?state.voices.map(v=>`<div class="vc-panel vc-card-clickable" data-act="voice:${v.id}"><div class="vc-row"><div class="vc-avatar">${I(v.source==='import'?'mic':'sparkles')}</div><div style="flex:1"><h3 class="voice-name">${E(v.name)}</h3><small>${v.source==='import'?'用户导入':'AI 设计'} · ${v.format.toUpperCase()}${v.tested?' · 已试音':''}</small></div>${v.sample?`<button class="vc-preset-btn" data-act="play:${v.sample}">${I('play')} 试听</button>`:T(v.tested?'已试音':'可使用')}</div><p class="vc-sub">${E(v.description)}</p><div class="vc-row"><small>${v.enabled?'参与 AI 匹配':'仅手动选用'}</small><div style="display:flex;align-items:center;gap:14px"><span class="vc-link-text">管理 →</span>${L(I('trash-2')+'删除','deletevoice:'+v.id)}</div></div></div>`).join(''):'<div class="empty"><p>还没有自己的音色。</p><small>根据声音特征命名，朗读内容不限。</small></div>'}`:Bajiao.PRESETS.map(v=>`<div class="vc-preset-row"><div class="vc-preset-title">${I('volume-2')}${E(v)}</div><button class="vc-preset-btn" data-act="preset:${E(v)}">${I('play')} 试听</button></div>`).join(''));break;
case 'splitpreview':{h=BajiaoImport.renderDraft(importDraft,{E,I,B,top,dd,field,llmConfigured:configured.llmConfigured});break;}
case 'voiceimport':h=top('导入样本')+`<h1 class="vc-title">一段朗读，就是一种声音。</h1><p class="vc-sub">填写容易辨认的名称，以及性别、年龄、音质、口音等完整声音描述。MP3 / WAV；编码后不超过 10 MB。</p>${imports.map((f,i)=>`<div class="vc-panel"><p class="vc-filename">${E(f.name)}</p>${field('音色名称','import-name-'+i,f.name.replace(/\.[^.]+$/,''))}${field('音色描述','import-'+i,f.description||'')}<div class="vc-row"><small>${f.format.toUpperCase()} · ${(f.size/1000000).toFixed(2)} MB</small>${L('播放样本','play:'+f.id)}</div></div>`).join('')}<button class="vc-btn full" data-act="saveimports">保存 ${imports.length} 个样本</button><p class="footer-note">可直接用于克隆合成，不必先设计或创建声音 ID。</p>`;break;
case 'voicedetail':{const v=voice();h=top('我的音色')+`${field('音色名称','vname',v.name)}`+area('音色描述 · 音质、发声、口音、节奏与声音气质','vdescription',v.description)+`<label class="vc-label"><span>参与 AI 自动匹配</span><input type="checkbox" id="venabled" ${v.enabled?'checked':''}></label><div class="vc-split">${B('播放参考样本','play:'+v.sample,true)}${B('保存描述','savevoice')}</div><div class="vc-panel"><h3>克隆试音</h3>${area('用此声线朗读新文本','trialText','山里的风停了，故事才刚刚开始。')}${B('生成并播放试音','trial')}</div><div class="vc-danger-zone"><button class="vc-btn danger full" data-act="deletevoice:${v.id}">${I('trash-2')} 删除此音色</button></div><p class="footer-note">删除后，该音色将从音色库移除，已绑定此音色的角色将恢复为未分配状态。</p>`;break;}
case 'design':h=top(roleName?'确认新角色音色':'设计新音色')+`<div class="vc-note">音色名根据声音特征自动生成，如「开朗青年男性」。${candidate?`当前名称：${E(candidate.name)}`:''}</div>${area('音色描述（保留完整声音细节，可参考评书先生、纪录片旁白等声音风格）','designDescription',candidate?.description||(roleName?book().characters.find(r=>r.name===roleName)?.description:'')||'')}${area('样本朗读内容（留空自动生成适配文本）','designText',candidate?.previewCustomized===false?'':candidate?.previewText||'')}${candidate?.previewCustomized===false&&candidate.previewText?`<p class="vc-sub">适配试听文本：${E(candidate.previewText)}</p>`:''}<div class="vc-split">${B(candidate?'重新生成样本':'生成试听样本','designsample')}${candidate?B('试听样本','play:'+candidate.sample,true):''}</div>${candidate?`<div class="vc-note">候选样本已返回，确认后可复用。</div><button class="vc-btn full" data-act="acceptsample">${roleName?'采用样本并继续配音':'保存到我的音色'}</button>`:''}`;break;
case 'roles':{const b=book();const __sugs=(b.mergeSuggestions||[]);const __chTitle=id=>{try{return engine.chapter(b.id,id)?.title||id;}catch(e){return id;}};const __aliasHtml=r=>{const spans=r.aliasSpans||{};const items=(r.aliases||[]).map(a=>{const ids=spans[a]||[];const label=ids.length>1?`${__chTitle(ids[0])} 等 ${ids.length} 章`:ids.length?__chTitle(ids[0]):'未标注';const list=ids.length>1?`<details class="vc-alias-list"><summary>查看 ${ids.length} 章</summary><p class="vc-sub">${ids.map(__chTitle).map(E).join('、')}</p></details>`:'';return `<div class="vc-alias-row"><span>${E(a)}</span><small>${E(label)}</small></div>${list}`;}).join('');return items?`<div class="vc-alias-block"><div class="vc-alias-head">曾用名 / 别名 · 音色共用</div>${items}</div>`:'';};h=top('角色与音色')+`<h1 class="vc-title">角色绑定，全书一致。</h1><p class="vc-sub">${E(b.name)}${autoMode?' · 全自动模式：新音色自动采用，无需确认。':' · 已有音色直接复用，仅新设计等待确认。'}</p>`+(__sugs.length&&!autoMode?`<div class="vc-panel vc-issue-card"><div class="vc-row"><b class="vc-nowrap">疑似同一人 · 待合并确认</b></div>${__sugs.map((m,i)=>`<div class="vc-alias-row"><span>「${E(m.from)}」→「${E(m.to)}」</span><small>${E(m.reason||'')}</small></div><div class="vc-issue-actions"><button class="vc-btn secondary" data-act="mergeroles:${i}">${I('check')} 确认合并</button><button class="vc-btn-ignore" data-act="ignoremerge:${i}">${I('x')} 不是同一人</button></div>`).join('')}</div>`:'')+roleProfileNotice(b)+`${b.characters.map(r=>{const isProblem=!r.voice&&!autoMode&&!['匹配中','设计中'].includes(roleVoiceStatus(b,r));const __tp=r.voice?voiceAuditionAction(r.voice):(r.candidate?('play:'+E(r.candidate.sample)):null);return `<div class="vc-panel ${isProblem?'vc-issue-card':''}"><div class="vc-row"><div class="vc-avatar ${isProblem?'warn':''}">${E(r.name[0])}</div><div style="flex:1"><h3 class="${isProblem?'vc-issue-speaker':''}">${E(r.name)}</h3><small>${E(voiceName(r.voice))}</small></div>${isProblem?`<span class="vc-issue-badge">${I('alert-circle')} 待确认音色</span>`:__tp?`<button class="vc-btn secondary" data-act="${__tp}">${I('play')} 试听</button>`:T(roleVoiceStatus(b,r),!r.voice)}</div><p class="vc-sub vc-role-background"><b>角色背景：</b>${E(r.background||(r.name==='旁白'?'以叙述者视角讲述原文。':r.profileChecked?'原文未提供可确认的背景信息。':'原文资料待补全'))}</p><p class="vc-sub vc-role-description"><b>声音描写：</b>${E(r.description||'声线资料待补全')}</p>${__aliasHtml(r)}${r.reason?`<p class="mini">${E(r.reason)}</p>`:''}<div class="${isProblem?'vc-issue-actions':'vc-row'}">${L('从已有音色中选择','chooserole:'+r.name)}${r.suggestedVoice&&!r.voice?B('采用匹配音色','acceptsuggested:'+r.name,true):''}${r.candidate?L('试听并确认新设计','candidate:'+r.name):B('制作新音色','candidate:'+r.name,true)}${isProblem?`<button class="vc-btn-ignore" data-act="ignorerole:${E(r.name)}">${I('fast-forward')} 忽略（自动设计）</button>`:''}</div></div>`;}).join('')}${menu('workflow','音色分配','优先复用我的音色','go:voicepolicy')}`;break;}
case 'choose':h=top('为'+roleName+'选音色')+`<div class="vc-note">先试听再选用。更换音色后，已有音频保留，后续合成使用新音色。</div><h3>我的音色</h3>${state.voices.map(v=>`<div class="vc-panel"><div class="vc-row"><div style="flex:1"><h3>${E(v.name)}</h3><small>${E(v.description)}</small></div><button class="vc-preset-btn" data-act="trialvoice:${v.id}">${I('play')} 试听</button></div><div class="vc-row" style="margin-top:8px"><span></span>${B('选用','bind:'+v.id,true)}</div></div>`).join('')||'<div class="empty"><p>还没有自己的音色。</p></div>'}<h3 style="margin-top:22px">MiMo 预设</h3>${Bajiao.PRESETS.map(v=>`<div class="vc-preset-row"><div class="vc-preset-title">${I('volume-2')}${E(v)}</div><div style="display:flex;gap:8px"><button class="vc-preset-btn" data-act="preset:${E(v)}">${I('play')} 试听</button><button class="vc-btn secondary" data-act="bind:preset:${E(v)}">选用</button></div></div>`).join('')}`;break;
case 'voicepolicy':case 'productionpolicy':case 'importpolicy':case 'quality':h=productionSettingsHtml(page);break;
case 'make':h=top('批量制作')+`<h1 class="vc-title">制作 ${selected.length} 个章节</h1><div class="vc-panel"><h3>${E(book().name)}</h3><p class="vc-sub">${book().chapters.filter(c=>selected.includes(c.id)).slice(0,3).map(c=>E(c.title)).join('、')}${selected.length>3?' 等 '+selected.length+' 章':''}</p>${selected.length>3?`<details><summary>查看全部所选章节</summary><p class="vc-sub">${book().chapters.filter(c=>selected.includes(c.id)).map(c=>E(c.title)).join('、')}</p></details>`:''}</div>${menu('clapperboard','制作模式',state.settings.promptMode==='director'?'导演模式 · 细致场景与指导':'快速模式 · 流利吐字清晰（默认）','go:productionpolicy')}${menu('brain-circuit','语言模型',E(state.settings.llmModel),'go:llm')}${menu('audio-lines','MiMo TTS','预设 / 参考音频克隆自动选择','go:mimo')}${(()=>{const pendRoles=book().characters.filter(r=>r.name!=='旁白'&&r.name!=='广告'&&!r.voice).length;return (state.settings.mode!=='auto'&&pendRoles)?`<div class="vc-note warn">有 ${pendRoles} 个角色音色待确认，先去角色页确认后再制作，未分配音色的角色将等待确认。<br>${L('去角色与音色确认 →','go:roles')}</div>`:'';})()}${menu('workflow','新角色音色策略',state.settings.mode==='auto'?'全自动，失败后处理':'新设计候选样本等待确认','go:voicepolicy')}<button class="vc-btn full vc-bottom" data-act="enqueue">加入队列并开始制作</button><p class="footer-note">制作使用前台服务在后台继续，系统通知显示进度。你可以主动暂停；被系统终止后可从保存片段继续。</p>`;break;
case 'tasks':{const isMaking=t=>['running','queued','waiting','paused','failed'].includes(t.status);const isFinished=t=>['done','cancelled'].includes(t.status);const isActive=t=>['running','queued','paused'].includes(t.status);const isAttention=t=>t.status==='waiting';const hasProducing=state.tasks.some(t=>['queued','running'].includes(t.status)&&!t.pauseRequested);const hasPausedTasks=state.tasks.some(t=>['paused','failed'].includes(t.status)||t.status==='running'&&t.pauseRequested);const ord=(a,b)=>engine.queueOrder(a,b);const makingList=state.tasks.filter(isMaking).sort(ord);const finishedList=state.tasks.filter(isFinished).sort((a,b)=>(b.created||0)-(a.created||0));const activeList=state.tasks.filter(isActive).sort(ord);const attentionList=state.tasks.filter(isAttention).sort(ord);const failedList=state.tasks.filter(t=>t.status==='failed').sort(ord);const cardHeader=(t,draggable=false)=>`<div class="vc-row vc-task-card-header">${draggable?`<button type="button" class="vc-task-drag" data-task-drag="${E(t.id)}" aria-label="拖动调整制作优先级">${I('grip-vertical')}</button>`:''}${T(t.retryWaiting?'自动重试':t.networkWaiting?'等待网络':status(t.status),['failed','waiting'].includes(t.status)?'warn':t.status==='running'?'running':'')}${isFinished(t)?L(I('x')+'清除','removetask:'+t.id):`<small>${E(t.phase||'')}</small>`}</div>`;const card=t=>{const missingData=isMissingData(t.message);let b=null,c=null;try{b=engine.book(t.bookId);c=engine.chapter(t.bookId,t.chapterId);}catch(e){b=null;c=null;}const { done, total, pct } = taskProductionMetrics(t, c);if(!b||!c){return `<div class="vc-panel">${cardHeader(t)}<h3 style="margin-top:14px">关联内容已移除</h3><p>该任务对应的书籍或章节已不存在，可安全移除此条记录，不影响其他任务。</p><div class="vc-meter"><span style="width:${pct}%"></span></div><p class="vc-sub">${t.skipped?'全部跳过 '+t.skipped+' 段，未生成音频':done+' / '+(total||'—')+' 句'}${missingData?'<br><small>可恢复本章，其他章节和音频会保留</small>':''}</p>${t.message?'<div class="vc-sub vc-task-error" role="status">'+errorMarkup(t.error||t.message)+'</div>':''}${isFinished(t)?'':`<div class="vc-row"><span></span>${L(I('x')+'清除','removetask:'+t.id)}</div>`}</div>`;}let acts='';const pendOrder=!['done','cancelled'].includes(t.status);if(pendOrder){const sibs=engine.pendingOrder();const si=sibs.findIndex(o=>o.id===t.id);if(si>0)acts+=`<button class="vc-link" data-act="tasktop:${t.id}" aria-label="优先级置顶" title="置顶">${I('chevrons-up')}</button>`;}
if(t.status==='waiting')acts+=L('去标注页确认','task:'+t.id);else if(missingData&&(t.status==='paused'||t.status==='failed')){acts+=L('恢复本章','recovertask:'+t.id)+L('移除任务','removetask:'+t.id);}else if(['paused','failed'].includes(t.status)){acts+=L('处理标注','task:'+t.id);acts+=L('继续 / 重试','resume:'+t.id);}else if(t.status==='running')acts+=t.resumeRequested?T('正在接续'):t.pauseRequested?L('继续','resume:'+t.id):L('暂停','pause:'+t.id);else if(t.status==='queued')acts+=L(t.retryWaiting?'立即重试':'开始','resume:'+t.id)+L('暂停','pause:'+t.id);else if(t.status==='done'){let canListen=false;try{canListen=!!engine.chapter(t.bookId,t.chapterId).audio;}catch(e){}if(canListen)acts+=`<button class="vc-btn primary" data-act="listentask:${t.id}">开始听书</button>`;acts+=L('重新制作','remake:'+t.id);}else if(t.status==='cancelled')acts+=L('重新制作','remake:'+t.id);if(!['done','cancelled'].includes(t.status))acts+=L(I('x')+'取消','cancel:'+t.id);return `<div class="vc-panel vc-card-clickable vc-task-card" data-task-id="${E(t.id)}" data-act="task:${t.id}">${cardHeader(t,pendOrder)}<h3 class="vc-task-title">${E(c.title)}</h3><p class="vc-task-book">${E(b.name)}</p><div class="vc-meter"><span style="width:${pct}%"></span></div><p class="vc-sub">${t.skipped?'全部跳过 '+t.skipped+' 段，未生成音频':done+' / '+(total||'—')+' 句'}${missingData?'<br><small>可恢复本章，其他章节和音频会保留</small>':''}</p>${t.message?'<div class="vc-sub vc-task-error" role="status">'+errorMarkup(t.error||t.message)+'</div>':''}<div class="vc-task-card-actions">${acts}</div></div>`;};
const tabBtn=(id,label,n)=>`<button class="${taskTab===id?'active':''}" data-act="tasktab:${id}">${label} · ${n}</button>`;
const tabList=taskTab==='active'?activeList:taskTab==='attention'?attentionList:taskTab==='failed'?failedList:finishedList;
let topBtn='';if(taskTab==='attention'){const waitN=attentionList.filter(t=>t.status==='waiting').length;topBtn=B('全部自动确认','autoconfirmall',true,!waitN);}else if(taskTab==='done'){topBtn=B('全部清除','clearfinished',true,!finishedList.length);}else if(hasProducing)topBtn=B('全部暂停','pauseall',true);else if(taskTab==='failed')topBtn=B('重试失败任务','retryfailed',true,!failedList.length);else if(hasPausedTasks)topBtn=B('继续制作','resumeall',true);
h=title('PRODUCTION STUDIO','制作任务',topBtn)+`<div class="vc-tabs">${tabBtn('active','制作中',activeList.length)}${tabBtn('attention','待确认',attentionList.length)}${tabBtn('failed','失败',failedList.length)}${tabBtn('done','已完成',finishedList.length)}</div>${taskTab!=='done'?'<p class="vc-task-order-note">上方优先制作 · 拖动左侧手柄调整顺序</p>':''}`+(state.tasks.length?(tabList.length?tabList.map(card).join(''):'<div class="empty"><p>'+(taskTab==='active'?'暂无制作中的任务':taskTab==='attention'?'暂无待确认的任务':'暂无已完成的任务')+'</p></div>'):'<div class="empty"><p>暂无制作任务</p>'+B('从书架选择章节','go:shelf')+'</div>');break;}
case 'task':{const __t=state.tasks.find(t=>t.id===window.currentTask);if(__t){bookId=__t.bookId;chapterId=__t.chapterId;go('annotated');}else{go('tasks');}break;}
case 'llm':h=top('语言模型')+`${dd('llmProtocol','接口协议',[['openai','OpenAI 兼容'],['anthropic','Anthropic Messages']],state.settings.llmProtocol)}${field('Base URL','llmBase',state.settings.llmBase||'')}<p class="llm-field-example">例如：https://api.deepseek.com</p>${''}${field('模型 ID','llmModel',state.settings.llmModel||'')}<p class="llm-field-example">例如：deepseek-flash</p>${''}${field('API Key','llmKey','','password')}<div class="vc-split">${B('保存配置','savellm')}${B('测试连接','testllm',true)}</div><p class="footer-note">密钥使用 Android Keystore 加密保存。测试连接会调用当前填写的模型。</p>`;break;
case 'mimo':h=top('MiMo TTS')+field('API Key','ttsKey','','password')+`<div class="vc-panel"><h3>按任务自动使用</h3><p>预设音色</p><div class="vc-model-id">mimo-v2.5-tts</div><p>样本设计</p><div class="vc-model-id">mimo-v2.5-tts-voicedesign</div><p>样本克隆合成</p><div class="vc-model-id">mimo-v2.5-tts-voiceclone</div></div><div class="vc-split">${B('保存配置','savemimo')}${B('测试合成','testmimo',true)}</div><p class="footer-note">密钥使用 Android Keystore 加密保存。测试合成会调用 MiMo 并生成可试听音频。</p>`;break;
case 'storage':{
  const totalAudioCount = engine.state.books.reduce((sum, b) => sum + b.chapters.filter(c => c.audio).length, 0);
  const totalListenedCount = engine.state.books.reduce((sum, b) => sum + b.chapters.filter(c => c.audio && c.listened).length, 0);
  const totalUnlistenedCount = totalAudioCount - totalListenedCount;
  const totalBytes = storageStats ? storageStats.totalBytes : 0;
  const statsMb = storageStats ? (storageStats.totalBytes / (1024 * 1024)).toFixed(1) : '--';
  const fileSizes = storageStats?.fileSizes || {};
  let listenedBytes = 0, unlistenedBytes = 0;
  for (const b of engine.state.books) {
    for (const c of b.chapters) {
      if (c.audio) {
        const sz = fileSizes[c.audio] || 0;
        if (c.listened) listenedBytes += sz;
        else unlistenedBytes += sz;
      }
    }
  }
  const listenedMb = (listenedBytes / (1024 * 1024)).toFixed(1);
  const unlistenedMb = (unlistenedBytes / (1024 * 1024)).toFixed(1);
  const listPct = totalBytes > 0 ? Math.round((listenedBytes / totalBytes) * 100) : 0;
  const unlistPct = totalBytes > 0 ? Math.round((unlistenedBytes / totalBytes) * 100) : 0;
  const otherPct = Math.max(0, 100 - listPct - unlistPct);
  h = top('存储与有声书管理') + `
    <div class="vc-panel">
      <div class="vc-row" style="margin-bottom: 8px;">
        <span class="vc-kicker">STORAGE DASHBOARD</span>
        <button class="vc-btn secondary" style="padding: 4px 10px; font-size: 0.8rem;" data-act="refreshstorage">${I('refresh-cw')} 刷新空间</button>
      </div>
      <div class="vc-storage-ratio-card">
        <div class="vc-storage-ratio-header">
          <strong>占用存储空间：${statsMb} MB</strong>
          <small style="color:var(--vc-sub);">${storageStats ? storageStats.fileCount : totalAudioCount} 个音频文件</small>
        </div>
        <div class="vc-storage-bar">
          <div class="vc-bar-segment listened" style="width:${listPct}%;" title="已听完缓存: ${listenedMb}MB"></div>
          <div class="vc-bar-segment unlistened" style="width:${unlistPct}%;" title="待听音频: ${unlistenedMb}MB"></div>
          <div class="vc-bar-segment other" style="width:${otherPct}%;" title="其他/底模数据"></div>
        </div>
        <div class="vc-storage-legend">
          <span><span class="vc-dot listened"></span>已听完缓存 (${listenedMb}MB · ${totalListenedCount}章)</span>
          <span><span class="vc-dot unlistened"></span>待听音频 (${unlistenedMb}MB · ${totalUnlistenedCount}章)</span>
          <span><span class="vc-dot other"></span>核心/其他数据</span>
        </div>
      </div>
      <div class="vc-action-item">
        <div class="vc-action-info">
          <strong>完播自动释放音频</strong>
          <small style="color:var(--vc-sub);">单章听完后自动释放对应音频文件，保留文本与角色设计</small>
        </div>
        <button class="vc-switch${engine.state.settings.autoDeletePlayed ? ' on' : ''}" role="switch" aria-checked="${engine.state.settings.autoDeletePlayed ? 'true' : 'false'}" aria-label="完播自动释放音频" data-act="toggleautodelete"><span class="vc-switch-knob"></span></button>
      </div>
      <div class="vc-action-item">
        <div class="vc-action-info">
          <strong>完播自动释放音频时保留章节</strong>
          <small style="color:var(--vc-sub);">完播或切章自删时，保留最近听过的章节缓存供回听</small>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;width:100%">${(()=>{const kn=Math.max(0,Number(engine.state.settings.keepRecentCount ?? 2)||0);return [0,1,2,3].map(n=>`<button class="vc-link-tag${kn===n?' active':''}" style="justify-content:center" data-act="setkeepcount:${n}">${n===0?'不保留':'保留'+n+'章'}</button>`).join('');})()}</div>
      </div>
      <div class="vc-action-item">
        <div class="vc-action-info">
          <strong>听书时自动预制作（边听边做）</strong>
          <small style="color:var(--vc-sub);">播放当前章节时，后台自动预先制作后续 1~2 章，享受无缝连听</small>
        </div>
        <button class="vc-switch${engine.state.settings?.autoProduceUpcoming !== false ? ' on' : ''}" role="switch" aria-checked="${engine.state.settings?.autoProduceUpcoming !== false ? 'true' : 'false'}" aria-label="听书时自动预制作" data-act="toggleautoproduce"><span class="vc-switch-knob"></span></button>
      </div>
    </div>
    <div class="vc-panel">
      <span class="vc-kicker">ONE-TAP CLEANUP</span>
      <div class="vc-action-item">
        <div class="vc-action-info">
          <strong>释放全部已听完章节音频</strong>
          <small style="color:var(--vc-sub);">一键释放所有书籍已听完章节，安全不影响后续阅读</small>
        </div>
        <button class="vc-btn secondary" data-act="clearalllistened" ${totalListenedCount===0?'disabled':''}>一键释放已听</button>
      </div>
      <div class="vc-action-item">
        <div class="vc-action-info">
          <strong>清理 7 天前未听音频</strong>
          <small style="color:var(--vc-sub);">自动扫描释放超过 7 天未听的历史生成章节音频</small>
        </div>
        <button class="vc-btn secondary" data-act="clearexpired">清理7天前未听</button>
      </div>
      <div class="vc-action-item">
        <div class="vc-action-info">
          <strong>仅保留当前播放书目</strong>
          <small style="color:var(--vc-sub);">仅保留当前正在听的有声书音频，其他在追书籍转为文本档</small>
        </div>
        <button class="vc-btn secondary" data-act="keeponlycurrent">仅留当前书籍</button>
      </div>
      <div class="vc-action-item">
        <div class="vc-action-info">
          <strong>清理无引用孤儿音频</strong>
          <small style="color:var(--vc-sub);">扫描清理已删除章节遗留的废弃音频缓存</small>
        </div>
        <button class="vc-btn secondary" data-act="cleargc">扫描孤儿文件</button>
      </div>
      <div class="vc-action-item">
        <div class="vc-action-info">
          <strong>清空全部有声书音频</strong>
          <small style="color:var(--vc-sub);">释放所有音频文件，保留所有书籍分句与角色配置</small>
        </div>
        <button class="vc-btn secondary danger" data-act="clearallaudio" ${totalAudioCount===0?'disabled':''}>清空音频</button>
      </div>
    </div>
  `;
  break;
}
case 'policy':case 'models':case 'settings':h=title('YOUR READING SPACE','我的')
+`<section class="vc-settings-group od-stack" aria-labelledby="settings-voice"><h2 id="settings-voice">模型与声音</h2>`
+menu('sliders-horizontal','语言模型',configured.llmConfigured?'已配置 · 理解文本与识别角色':'配置文本理解与角色识别服务','go:llm')
+menu('audio-lines','语音引擎',configured.ttsConfigured?'MiMo TTS · 已配置':'MiMo TTS · 配置语音服务','go:mimo')
+menu('workflow','音色分配',state.settings.mode==='auto'?'复用已有音色，自动采用新声音':'复用已有音色，新声音先试听确认','go:voicepolicy')
+`</section><section class="vc-settings-group od-stack" aria-labelledby="settings-production"><h2 id="settings-production">制作</h2>`
+menu('clapperboard','制作模式',state.settings.promptMode==='director'?'导演模式 · LLM生成场景与指导':'快速模式 · 流利吐字清晰（默认）','go:productionpolicy')
+menu('wifi','网络与速度',state.settings.wifiOnlyProduction?'仅 Wi-Fi 下制作 · 制作速度':'不限网络 · 制作速度','go:productionpolicy')
+menu('refresh-cw','合成异常处理','请求失败重试与音频异常重合成','go:quality')
+`</section><section class="vc-settings-group od-stack" aria-labelledby="settings-library"><h2 id="settings-library">导入与存储</h2>`
+menu('book-open','新书导入','默认切章规则与自定义模板','go:importpolicy')
+menu('hard-drive','存储与有声书资源','资源回收与完播自动释放','go:storage')
+`</section>`;break;
}
h=enhancePage(h,state);let miniHtml = '';
if (page !== 'listen' && page !== 'splitpreview' && playingBookId && playingChapterId) {
  const mBook = engine?.state.books.find(b => b.id === playingBookId);
  const mChap = mBook?.chapters.find(c => c.id === playingChapterId);
  if (mBook && mChap && (mChap.audio||streamState)) {
    const isStream = isChapterStreaming(mChap);
    let pct = 0;
    if(isStream){
      const tot = chapterSentenceCount(mChap);
      const segs = mChap.segments || [];
      const curIdx = streamState ? segs.findIndex(s => s.id === streamState.segId) : (mChap.playbackCompleted ? tot : (mChap.playbackResume?.segmentId >= 0 ? segs.findIndex(s => s.id === mChap.playbackResume.segmentId) : 0));
      const played = curIdx >= 0 ? curIdx : 0;
      pct = tot > 0 ? Math.min(100, Math.round((played / tot) * 100)) : 0;
    }else{
      const pos = miniPlayingState?.position || 0;
      const dur = (mChap.duration || 0) * 1000;
      pct = dur > 0 ? Math.min(100, Math.round((pos / dur) * 100)) : 0;
    }
    const isPlaying = playbackIsActive(miniPlayingState);
    miniHtml = `<div class="vc-mini-player" data-act="minigolisten">
      <div class="vc-mini-progress"><div class="vc-mini-progress-bar" style="width:${pct}%"></div></div>
      <div class="vc-mini-cover" aria-hidden="true">${E((mBook.name || 'V').slice(0,1))}</div>
      <div class="vc-mini-info">
        <div class="vc-mini-title">${E(mChap.title)}</div>
        <div class="vc-mini-sub">${E(mBook.name)}</div>
      </div>
      <div class="vc-mini-ctrls">
        <button class="vc-mini-btn" data-act="miniprev" title="上一章" aria-label="上一章">${I('skip-back')}</button>
        <button class="vc-mini-btn primary" data-act="miniplaypause" title="${isPlaying?'暂停':'播放'}">${I(isPlaying?'pause':'play')}</button>
        <button class="vc-mini-btn" data-act="mininext" title="下一章" aria-label="下一章">${I('skip-forward')}</button>
      </div>
    </div>`;
  }
}
let modalHtml = uxDialog?`<div class="vc-modal-overlay" data-act="uxcancel"><div class="vc-dialog${uxDialog.voiceLeave?' ved-leave-dialog':''}"><h3>${E(uxDialog.title)}</h3>${uxDialog.html||''}${uxDialog.voiceLeave?'<div class="ved-leave-actions"><button class="vc-btn" data-act="vedsaveleave">保存并离开</button><button class="vc-btn secondary" data-act="uxconfirm">放弃修改</button><button class="ved-leave-cancel" data-act="uxcancel">继续编辑</button></div><div>':'<div class="vc-split">'}${uxDialog.voiceLeave?'':B(uxDialog.title==='阅读设置'?'完成':'取消','uxcancel',true)}${!uxDialog.voiceLeave&&uxDialog.confirm?B(uxDialog.confirmLabel||'确认','uxconfirm',false,!!uxDialog.loading):''}</div></div></div>`:'';
if(unmadeChoiceChapterId){const __uc=book()?.chapters?.find(ch=>ch.id===unmadeChoiceChapterId),__task=chapterTask(bookId,unmadeChoiceChapterId),__producing=isChapterProducing(__task);
  modalHtml+=`<div class="vc-modal-overlay" data-act="closeunmade"><div class="vc-dialog"><h3>${E(__uc?.title||'未制作章节')}</h3><p class="vc-sub">${__producing?'当前章节正在制作中'+(__task.status==='queued'?'，正在排队等待。':'。')+'你可以阅读原文，或边做边听。':'本章还没有音频，你想怎么开始？'}</p><div class="vc-stack" style="margin-top:12px">${B(I('book-open')+' 阅读原文','readraw')}${__producing?'':B(I('wand-sparkles')+' 制作有声书','makechapter')}${B(I('headphones')+' 边做边听','makeandlisten',true)}</div></div></div>`;
}
if(speedModalOpen){
 const spd=engine.state.playbackSpeed||1,ticks=[.5,1,1.5,2,2.5,3];
 modalHtml+=`<div class="vc-modal-overlay vc-player-sheet-overlay" data-act="closespeed"><div class="vc-dialog vc-player-sheet vc-speed-sheet" data-theme="light"><div class="vc-sheet-heading"><button class="vc-icon vc-sheet-close" data-act="closespeed" aria-label="关闭语速设置">${I('x')}</button><h3>语速 <span id="speedVal">${spd}x</span></h3></div><div class="vc-speed-slider"><input type="range" id="speedRange" class="vc-speed-range" min="0.5" max="3" step="0.05" value="${spd}" aria-label="播放语速"><span class="vc-speed-bubble" id="speedBubble" aria-hidden="true">${spd}x</span></div><div class="vc-speed-ticks">${ticks.map(t=>`<button class="vc-tick" data-act="setspeed:${t}">${t}x</button>`).join('')}</div><div class="vc-speed-directions"><span>慢</span><span>快</span></div></div></div>`;
}
if(sleepModalOpen){
 const active=!!sleepStatus(),presets=[10,30,45,60,90],current=engine.state.settings.sleepTimer,custom=Number(current)>0&&!presets.includes(Number(current));
 modalHtml+=`<div class="vc-modal-overlay vc-player-sheet-overlay" data-act="closesleep"><div class="vc-dialog vc-player-sheet vc-sleep-sheet" data-theme="light"><div class="vc-sheet-heading vc-sleep-heading"><h3 id="sleepTitle">${active?'定时已开启':'定时关闭'}</h3><button class="vc-switch" role="switch" aria-label="睡眠定时开关" aria-checked="${active}" data-act="togglesleep"><span></span></button><button class="vc-icon" data-act="closesleep" aria-label="关闭定时设置">${I('x')}</button></div><div class="vc-sleep-options"><h4>按章数</h4><div class="vc-sleep-chapters">${[1,2,3].map(n=>`<button data-act="setsleep:chapters:${n}" data-sleep-choice="chapters:${n}" aria-pressed="false">${n===1?'播完当前章':'播完'+n+'章'}</button>`).join('')}</div><h4>按时间 <small>分钟</small></h4><div class="vc-sleep-minutes">${presets.map(n=>`<button data-act="setsleep:${n}" data-sleep-choice="${n}" aria-label="${n}分钟" aria-pressed="false">${n}</button>`).join('')}</div><button class="vc-sleep-custom${custom&&active?' active':''}" data-act="sleepcustom" aria-expanded="${sleepCustomOpen}">自定义${custom&&active?' · '+Number(current)+' 分钟':''}</button>${sleepCustomOpen?`<div class="vc-sleep-custom-form"><label for="sleepMinutes">时长（1–720 分钟）</label><div><input class="vc-input" type="number" inputmode="numeric" min="1" max="720" step="1" id="sleepMinutes" value="${custom?Number(current):30}">${B('开始定时','setsleepcustom',false)}</div></div>`:''}</div><p class="vc-sleep-summary" data-sleep-status>${E(sleepStatus())}</p></div></div>`;
}
if(playerCatalogOpen&&book()){
 const b=book();
 modalHtml+=`<div class="vc-modal-overlay vc-player-sheet-overlay" data-act="closeplayercatalog"><section class="vc-dialog vc-player-sheet vc-player-catalog" data-theme="light" role="dialog" aria-modal="true" aria-label="章节目录"><div class="vc-sheet-heading"><button class="vc-icon" data-act="closeplayercatalog" aria-label="关闭目录">${I('x')}</button><h3>目录</h3><span class="od-spacer od-touch"></span></div><div class="vc-catalog-summary"><span>共 ${b.chapters.length} 章</span><button class="vc-link-tag" data-act="catalogcurrent">${I('locate-fixed')}当前章节</button></div><div class="vc-player-catalog-scroll" id="player-catalog-scroll"><div class="vc-chapter-list" role="list" aria-label="章节列表">${b.chapters.map(c=>catalogChapterRow(b,c,true)).join('')}</div></div></section></div>`;
}
if(listenSettingsOpen&&!uxDialog){
  const production=listenSettingsOpen==='produce';
  const title=production?'自动制作后续章节':'完播自动释放';
  const enabled=production?engine.state.settings.autoProduceUpcoming!==false:!!engine.state.settings.autoDeletePlayed;
  const keepN=Math.max(0,Number(engine?.state?.settings?.keepRecentCount ?? 2)||0);
  const prodN=Math.min(3,Math.max(1,Number(engine?.state?.settings?.autoProduceCount ?? 2)||2));
  const options=production?`<p class="vc-set-label">提前制作章节数</p><div class="vc-chip-row">${[1,2,3].map(n=>`<button class="vc-link-tag${prodN===n?' active':''}" aria-pressed="${prodN===n}" data-act="setproducecount:${n}">提前${n}章</button>`).join('')}</div>`:`<p class="vc-set-label">完播自动释放音频时保留章节</p><div class="vc-chip-row">${[0,1,2,3].map(n=>`<button class="vc-link-tag${keepN===n?' active':''}" aria-pressed="${keepN===n}" data-act="setkeepcount:${n}">${n===0?'不保留':'保留'+n+'章'}</button>`).join('')}</div>`;
  modalHtml+=`<div class="vc-modal-overlay vc-player-sheet-overlay" data-act="closesettings"><section class="vc-dialog vc-player-sheet vc-listen-settings-sheet" data-theme="light" role="dialog" aria-modal="true" aria-label="${title}"><div class="vc-sheet-heading vc-sleep-heading"><h3>${title}</h3><button class="vc-switch" role="switch" aria-checked="${enabled}" aria-label="${title}" data-act="${production?'toggleautoproduce':'toggleautodelete'}"><span></span></button><button class="vc-icon" data-act="closesettings" aria-label="关闭">${I('x')}</button></div>${options}<p class="vc-sub">${production?'听书时自动准备后续章节音频；关闭后暂停自动预制，提前章节数仍会保留。':'释放已完播音频，保留原文与标注；未播完的当前章节始终保留，释放的音频需要重新制作才能播放。'}</p></section></div>`;
}
if(bookInfoOpen&&!uxDialog&&bookInfoTarget()){
  const bi=bookInfoTarget(),curColor=/^#[a-f0-9]{6}$/i.test(bi.coverColor||'')?bi.coverColor:COVER_STYLES[0].color;
  modalHtml+=`<div class="vc-modal-overlay" data-act="closebookinfo"><section class="vc-dialog vc-bookinfo-dialog" id="bookInfoDialog" role="dialog" aria-modal="true" aria-label="编辑书籍信息"><h3>编辑书籍信息</h3><div class="vc-field"><span class="vc-field-label">书名</span><input id="biName" type="text" maxlength="40" autocomplete="off" value="${E(bi.name)}"></div><div class="vc-field"><span class="vc-field-label">作者</span><input id="biAuthor" type="text" maxlength="40" autocomplete="off" value="${E(bi.author||'')}"></div><p class="vc-bookinfo-label">书封皮背景</p><div class="vc-cover-picker" role="radiogroup" aria-label="书封皮背景">${COVER_STYLES.map(s=>`<button class="vc-cover-opt${s.color===curColor?' is-on':''}" data-act="pickcover:${s.color}" role="radio" aria-checked="${s.color===curColor}" aria-label="${s.name}"><span class="vc-cover-mini" style="background:${s.color}"><b>${E(bi.name)}</b><small>${E(bi.author||'有声书')}</small></span><span class="vc-cover-name">${s.name}</span></button>`).join('')}</div><div class="vc-split vc-bottom">${B('取消','closebookinfo',true)}${B('保存','savebookinfo')}</div></section></div>`;
}
if(openDropdown){
  let ddTitle='选择',ddOpts=[];
  if(openDropdown==='segSpeaker'){ddTitle='选择说话人';try{ddOpts=book().characters.map(r=>[r.name,r.name]);}catch(e){ddOpts=[];}}
  else if(openDropdown==='policyMode'){ddTitle='新设计确认方式';ddOpts=[['manual','确认样本后使用（默认）'],['auto','全自动，仅失败时处理']];}
  else if(openDropdown==='retries'){ddTitle='可恢复错误重试';ddOpts=[['0','0'],['1','1'],['2','2'],['3','3']];}
  else if(openDropdown==='speakerThreshold'){ddTitle='说话人确认阈值';ddOpts=[['0.3','0.3 · 宽松（更少打扰）'],['0.5','0.5 · 适中（默认）'],['0.65','0.65 · 严格（旧版）'],['0.8','0.8 · 很严格']];}
  else if(openDropdown==='taskParallel'){ddTitle='同时制作任务数';ddOpts=[['1','1 · 一次一章（默认，最稳）'],['2','2 · 同时做两章'],['3','3 · 同时做三章']];}
  else if(openDropdown==='ttsParallel'){ddTitle='TTS 总并发句数（全部任务共用）';ddOpts=[['1','1 · 逐句合成（最稳）'],['2','2 · 默认'],['3','3 · 更快'],['4','4 · 最快（易被限流）']];}
  else if(openDropdown==='llmProtocol'){ddTitle='接口协议';ddOpts=[['openai','OpenAI 兼容'],['anthropic','Anthropic Messages']];}
  else if(openDropdown==='splitRule'){ddTitle='切章规则';ddOpts=[['auto','自动识别（推荐）'],['chapter_cn','第X章/节/回'],['volume_cn','第X卷'],['special_cn','楔子/番外/序章'],['chapter_en','Chapter N'],['number_dot','数字点标题'],['paren_num','括号序号'],['bare_num','纯数字行'],['bare_cn_num','纯汉字数字'],['num_chapter','第N+空格+标题'],['custom','自定义模板']];}
  const ddCur=dropdownSel[openDropdown];
  modalHtml+=`<div class="vc-modal-overlay" data-act="closedropdown"><div class="vc-dialog"><h3>${E(ddTitle)}</h3><div style="margin-top:8px">${ddOpts.map(o=>`<button class="vc-opt${String(o[0])===String(ddCur)?' selected':''}" data-act="pickopt:${openDropdown}|${E(o[0])}"><span>${E(o[1])}</span>${String(o[0])===String(ddCur)?I('check'):''}</button>`).join('')}</div></div></div>`;
}
if (batchModalBookId) {
  const bTarget = engine?.state.books.find(b => b.id === batchModalBookId);
  const totalCh = bTarget?.chapters?.length || 0;
  modalHtml += `<div class="vc-modal-overlay" data-act="closebatchmodal">
    <div class="vc-dialog">
      <h3>区间批量预制作</h3>
      <p>为书籍《${E(bTarget?.name || '')}》批量入队制作（共 ${totalCh} 章）</p>
      <div class="vc-field" style="margin:12px 0;">
        <label>起始章 (1 ~ ${totalCh})</label>
        <input type="number" id="batchStartCh" min="1" max="${totalCh}" value="1" class="vc-input" style="width:100%;">
      </div>
      <div class="vc-field" style="margin:12px 0;">
        <label>结束章 (1 ~ ${totalCh})</label>
        <input type="number" id="batchEndCh" min="1" max="${totalCh}" value="${Math.min(5, totalCh)}" class="vc-input" style="width:100%;">
      </div>
      <div class="vc-dialog-actions">
        <button class="vc-btn secondary" data-act="closebatchmodal">取消</button>
        <button class="vc-btn primary" data-act="executebatchmodal:${batchModalBookId}">开始批量制作</button>
      </div>
    </div>
  </div>`;
}
if(deleteConfirmShelf?.length){
  modalHtml+=`<div class="vc-modal-overlay" data-act="closeshelfdelete">
    <div class="vc-dialog">
      <h3>确认删除所选整书？</h3>
      <p>将彻底删除所选 ${deleteConfirmShelf.length} 本书及全部音频、分句和任务，不可撤销。</p>
      <div class="vc-dialog-actions">
        <button class="vc-btn secondary" data-act="closeshelfdelete">取消</button>
        <button class="vc-btn danger" data-act="executeshelfdelete">彻底删除</button>
      </div>
    </div>
  </div>`;
}
if (deleteConfirmBookId) {
  const targetBook = engine?.state.books.find(b => b.id === deleteConfirmBookId);
  modalHtml += `<div class="vc-modal-overlay" data-act="closedeleteconfirm">
    <div class="vc-dialog">
      <h3>确认彻底删除？</h3>
      <p>将彻底删除书籍《${E(targetBook?.name || '')}》以及所有生成音频、分句和任务，该操作不可撤销。</p>
      <div class="vc-dialog-actions">
        <button class="vc-btn secondary" data-act="closedeleteconfirm">取消</button>
        <button class="vc-btn danger" data-act="executedeletebook:${deleteConfirmBookId}">彻底删除</button>
      </div>
    </div>
  </div>`;

}
modalHtml+=segmentPanelHtml();
let __keepTop=null;try{const __p=document.getElementById('transcriptPanel');if(page==='listen'&&__p)__keepTop=__p.scrollTop;}catch(__e){}
updateScreen(`<main data-page="${E(page)}" data-theme="light" class="vc-main ${miniHtml ? 'with-mini-player' : ''}${page==='listen' ? ' vc-main-listen' : ''}">${h}</main>${miniHtml}${page==='splitpreview'?'':['raw','annotated','listen','editseg'].includes(page)?modebar():nav()}${modalHtml}`,context);for(const f of formDraft){const el=document.getElementById(f.id);if(el){if(f.preserveValue)el.value=f.value;if(el.type==='checkbox')el.checked=f.checked;if(f.focused){el.focus({preventScroll:true});if(f.start!=null&&el.setSelectionRange)try{el.setSelectionRange(f.start,f.end);}catch(e){}}}}syncModalUI();const panelBody=document.getElementById('segment-panel-scroll');if(panelBody&&segmentPanel)panelBody.scrollTop=segmentPanel.scroll||0;syncFooterLayout();enhanceRendered();lucide.createIcons({attrs:{width:20,height:20}});try{fitMarquee();}catch(e){}
try{if(pendingSeg!=null){const target=pendingSeg;pendingSeg=null;focusReadingSegment(target);}}catch(__e){}
// 从听书切入原文/标注：按播放进度跳到对应行（等布局完再滚）
try{if(window.__jumpToPos!=null&&(page==='raw'||page==='annotated')&&bookId&&chapterId){const __pos=window.__jumpToPos;window.__jumpToPos=null;
requestAnimationFrame(()=>{try{const __c=chapter();let __el=null;let __segId=null;try{if(typeof streamState!=='undefined'&&streamState&&streamState.bid===bookId&&streamState.cid===chapterId&&streamState.segId!=null){__segId=streamState.segId;}}catch(__e2){}
try{if(__segId==null&&typeof miniPlayingState!=='undefined'&&miniPlayingState&&miniPlayingState.id&&__c&&__c.segments&&__c.segments.length){const __m=__c.segments.find(s=>s.audio&&s.audio===miniPlayingState.id);if(__m)__segId=__m.id;}}catch(__e3){}
if(__segId==null&&__c&&__c.segments&&__c.segments.length&&__c.audio){try{const __segs=engine.computeSegmentTimestamps(__c.segments||[],__c.duration||0,__c.audioStale?null:__c.audioTimeline,__c.audio)||[];for(const s of __segs){if((s.startMs||0)<=__pos&&(s.endMs||0)>__pos){__segId=s.id;break;}}if(__segId==null&&__segs.length){let __best=__segs[0];for(const s of __segs){if((s.startMs||0)<=__pos)__best=s;else break;}__segId=__best.id;}}catch(e){}}
if(page==='annotated'&&__segId!=null){__el=document.querySelector('[data-seg="'+__segId+'"]');}
if(page==='raw'&&__segId!=null){__el=document.querySelector('[data-rawseg="'+__segId+'"]');}
if(!__el&&page==='annotated'&&__c&&__c.segments&&__c.audio){try{const __segs=engine.computeSegmentTimestamps(__c.segments||[],__c.duration||0,__c.audioStale?null:__c.audioTimeline,__c.audio)||[];for(const s of __segs){if((s.startMs||0)<=__pos&&(s.endMs||0)>__pos){__el=document.querySelector('[data-seg="'+s.id+'"]');break;}}if(!__el&&__segs.length){let __best=__segs[0];for(const s of __segs){if((s.startMs||0)<=__pos)__best=s;else break;}__el=document.querySelector('[data-seg="'+__best.id+'"]');}}catch(e){}}
if(page==='raw'&&__c&&typeof __c.text==='string'&&!__el){try{const __us=Bajiao.units(__c.text);const __total=__us.map(u=>(u.text||'').length).reduce((a,b)=>a+b,0)||1;let __acc=0,__target=0;const __frac=__c.duration>0?(__pos/1000)/__c.duration:0;for(let i=0;i<__us.length;i++){__acc+=((__us[i].text||'').length)/__total;if(__acc>=__frac){__target=__us[i].id;break;}}__el=document.querySelector('[data-rawseg="'+__target+'"]');}catch(e){}}
if(__el){__el.scrollIntoView({block:'center'});__el.classList.add('vc-flash');setTimeout(()=>{try{__el.classList.remove('vc-flash');}catch(e){}},1800);}}catch(e){}});}}catch(__e){window.__jumpToPos=null;}
try{if(page==='listen'&&__keepTop!==null&&__keepTop!==undefined){const __n=document.getElementById('transcriptPanel');if(__n)__n.scrollTop=__keepTop;}}catch(__e){}
if(page==='listen'){renderedListenSignature=listenSignature();if(miniPlayingState)syncDisplayedPlayback(miniPlayingState);}
syncCatalogSheet(enteringCatalog);
syncCatalogViewport(catalogAnchor);
loadListenTranscript();
if(page==='roles')loadRoleProfiles();
try{if(page==='listen'&&bookId&&chapterId){const __ck=bookId+':'+chapterId+':'+chapter().audio;if(window.__calibKey!==__ck){window.__calibKey=__ck;engine.calibrateDurations(bookId,chapterId).then(n=>{if(n>0&&page==='listen')render();}).catch(()=>{});}}}catch(__e){}
}
const value=id=>$('#'+id)?.value||'';
// A dedicated handle supports both touch and mouse without blocking list scrolling.
let taskDrag=null,playbackRevision=0;
$('#screen').addEventListener('pointerdown',event=>{
 const handle=event.target.closest('[data-task-drag]');if(!handle||event.button!==0)return;
 const row=handle.closest('[data-task-id]');if(!row)return;
 event.preventDefault();$('#screen').setPointerCapture(event.pointerId);
 taskDrag={id:handle.dataset.taskDrag,handle,row,pointerId:event.pointerId,y:event.clientY,moved:false,frame:0};
 row.classList.add('is-dragging');
 const scroll=()=>{if(!taskDrag)return;const edge=90,dy=taskDrag.y<edge?-12:taskDrag.y>innerHeight-edge?12:0;if(dy)window.scrollBy(0,dy);taskDrag.frame=requestAnimationFrame(scroll);};scroll();
});
$('#screen').addEventListener('pointermove',event=>{
 const drag=taskDrag;if(!drag||event.pointerId!==drag.pointerId)return;
 event.preventDefault();drag.y=event.clientY;
 const target=document.elementsFromPoint(event.clientX,event.clientY).map(el=>el.closest('[data-task-id]')).find(row=>row&&row!==drag.row&&row.querySelector('[data-task-drag]'));
 if(!target)return;
 const rect=target.getBoundingClientRect();target.parentNode.insertBefore(drag.row,event.clientY<rect.top+rect.height/2?target:target.nextSibling);drag.moved=true;
});
async function finishTaskDrag(event){
 const drag=taskDrag;if(!drag||event.pointerId!==drag.pointerId)return;
 cancelAnimationFrame(drag.frame);taskDrag=null;drag.row.classList.remove('is-dragging');
 if(event.type==='pointerup'&&drag.moved){
  const rows=Array.from(document.querySelectorAll('[data-task-id]')),next=rows[rows.indexOf(drag.row)+1];
  try{await engine.reorderTask(drag.id,next?.dataset.taskId||null);}catch(e){toast(e.message);}
 }
 render();
}
$('#screen').addEventListener('pointerup',finishTaskDrag);
$('#screen').addEventListener('pointercancel',finishTaskDrag);
$('#screen').addEventListener('lostpointercapture',finishTaskDrag);
window.addEventListener('blur',()=>{if(taskDrag)finishTaskDrag({pointerId:taskDrag.pointerId,type:'pointercancel'});});
// 边做边听：分句流播控制器。整章 c.audio 未合并前，把"从头连续已完成分句"逐句接起来播。
// 播放中的分句始终逐句播完；整章合并不打断当前句，也不重新启动本章。
function playablePrefix(c){return c.audio?[{audio:c.audio,whole:true}]:streamPrefix(c);}
function streamAudible(c){return (c.segments||[]).filter(s=>s.audio&&s.audio!=='skip'&&!s.skip&&!s.isAd&&s.speaker!=='广告');}
function streamPrefix(c){const out=[];for(const s of (c.segments||[])){if(s.skip||s.isAd||s.speaker==='广告'||s.audio==='skip')continue;if(s.generationVersion&&s.qualityStatus&&!['passed','corrected','passed_with_warnings'].includes(s.qualityStatus))break;if(s.audio)out.push(s);else if((s.text||'').trim())break;}return out;}
function isChapterStreaming(c){
  if(!c)return false;
  if(!c.audio)return true;
  if(streamState&&streamState.bid===bookId&&streamState.cid===c.id)return true;
  return false;
}
function chapterSentenceCount(c, task){
  if(task&&task.total>0)return task.total;
  if(Array.isArray(c?.segments)&&c.segments.length>0)return c.segments.length;
  if(c?.segmentCount>0)return c.segmentCount;
  return 0;
}
function streamHtml(b,c){
  const task=engine?.state.tasks.find(t=>t.bookId===b.id&&t.chapterId===c.id&&!['done','cancelled'].includes(t.status));
  const ready=streamPrefix(c);
  if(!task&&!ready.length)return '<div class="empty"><p>本章尚未生成完整音频。</p>'+B('制作本章','makeone')+'</div>';
  const { done, total } = taskProductionMetrics(task, c);
  const lines=(c.segments||[]).map(s=>{
    const ok=!!(s.audio&&s.audio!=='skip'),skipped=!!(s.skip||s.isAd||s.speaker==='广告'||s.audio==='skip');
    return '<div class="vc-transcript-line'+(s.speaker&&s.speaker!=='旁白'?' is-dialogue':'')+(skipped?' is-skip':'')+'" data-act="streamsegment:'+s.id+'" data-segstream="'+s.id+'"><span class="vc-transcript-speaker">'+E(s.speaker||'旁白')+'</span><span class="vc-transcript-text">'+E(s.text||'')+'</span><small>'+(ok?(ready.includes(s)?'连续可播':'已生成，等待前句'):skipped?'跳过':'制作中')+'</small></div>';
  }).join('');
  return '<div class="vc-note">边做边听 · 已完成 '+done+' / '+total+' 句，开头连续可播 '+ready.length+' 句'+(task?'（'+(status(task.status)||task.phase||'制作中')+'）':'')+'</div><div class="vc-lyric vc-transcript-panel" id="transcriptPanel" role="region" aria-label="边做边听">'+lines+'</div>';
}
function listenSeekDuration(c){
 if(!c)return 0;
 if(isChapterStreaming(c))return chapterSentenceCount(c);
 return Math.round((c.duration||0)*1000);
}
function syncSeekDisplay(position,duration,isStream){
 const seek=$('#seek');if(!seek)return;
 if(isStream==null)isStream=isChapterStreaming(chapter());
 const total=Math.max(0,Number(duration)||0),current=Math.max(0,Math.min(total,Number(position)||0));
 seek.max=total;seek.value=current;
 const time=$('#playtime'),end=$('#playduration');
 if(isStream){
   const timeText=current+' 句',endText=total+' 句';
   if(time)time.textContent=timeText;if(end)end.textContent=endText;
   seek.setAttribute('aria-valuetext',timeText+' / '+endText);
 }else{
   const timeText=fmt(current/1000),endText=fmt(total/1000);
   if(time)time.textContent=timeText;if(end)end.textContent=endText;
   seek.setAttribute('aria-valuetext',timeText+' / '+endText);
 }
 const track=seek.closest('.vc-seek-track'),label=track?.querySelector('.vc-seek-times');if(!track)return;
 const fraction=total>0?current/total:0;
 // The range thumb is 12px wide, so its centre travels between 6px and width - 6px.
 track.style.setProperty('--seek-position',(fraction*100)+'%');
 track.style.setProperty('--seek-thumb-position',`calc(${fraction*100}% + ${6-12*fraction}px)`);
 if(label)track.style.setProperty('--seek-label-half',(label.getBoundingClientRect().width/2)+'px');
}
async function saveCurrentPlayback(state){
 if(!engine||!playingBookId||!playingChapterId)return;
 const p=state||await device.call('playbackState'),c=engine.chapter(playingBookId,playingChapterId);
 if(streamState&&p.id===streamState.audioId){
  await engine.updatePlaybackProgress(playingBookId,playingChapterId,streamState.posBefore+(p.position||0),0,false,{audioId:p.id,segmentId:streamState.segId,offsetMs:p.position||0});
 }else if(c.audio===p.id){
  if(c.playbackCompleted&&(p.position||0)>=(c.duration||0)*1000-100)return;
  await engine.updatePlaybackProgress(playingBookId,playingChapterId,p.position||0,(c.duration||0)*1000,false,{audioId:p.id,segmentId:-1,offsetMs:p.position||0});
 }
}
async function resumeStreamChapter(bid,cid,position=null,options={}){
 const c=engine.chapter(bid,cid),prefix=streamPrefix(c),anchor=c.playbackResume;
 if(position===null&&!c.playbackCompleted&&anchor?.segmentId>=0){
  const index=prefix.findIndex(s=>s.id===anchor.segmentId&&s.audio===anchor.audioId);
  if(index>=0)return playStreamSeg(bid,cid,index,anchor.offsetMs||0,options);
 }
 let remaining=position===null?engine.playbackResumePosition(c):position;
 for(let i=0;i<prefix.length;i++){
  const duration=Math.max(0,prefix[i].durMs||0);
  if(remaining<duration||i===prefix.length-1)return playStreamSeg(bid,cid,i,remaining,options);
  remaining-=duration;
 }
}
async function playStreamSeg(bid,cid,segIdx,offsetMs=0,options={}){
  const session=startPlaybackSession(options);
  if(session.paused&&!options.startPaused)return;
  playbackPrompts?.cancel();waitingForNextChapterId=null;
  const b=engine?.state.books.find(b=>b.id===bid),c=b?.chapters.find(c=>c.id===cid);
  if(!b||!c)throw Error('章节不存在');
  const prefix=streamPrefix(c);
  if(!prefix.length)throw Error('还没有合成好的句子，稍等片刻');
  const seg=prefix[Math.max(0,Math.min(segIdx,prefix.length-1))];
  const position=Math.max(0,Math.min(offsetMs,Math.max(0,(seg.durMs||0)-1))),playing=!options.startPaused;
  const doneBefore=prefix.slice(0,prefix.indexOf(seg)).reduce((a,s)=>a+(s.durMs>0?s.durMs:0),0);
  streamState={bid,cid,segId:seg.id,posBefore:doneBefore,audioId:seg.audio};
  const idx=b.chapters.indexOf(c);
  playbackRevision++;lastSeekTime=0;miniPlayingState={id:seg.audio,position,playing:false};
  if(page==='listen'&&bookId===bid&&chapterId===cid){render();syncDisplayedPlayback(miniPlayingState,true);}
  await device.call('play',{bookId:bid,chapterId:cid,segmentId:seg.id,positionBase:doneBefore,id:seg.audio,title:c.title+'（边做边听 · 第'+(prefix.indexOf(seg)+1)+'句）',bookTitle:b.name,artist:(b.author?b.author+' 著 · ':'')+'边做边听 · 芭蕉',duration:Math.round((seg.durMs||0)),position,startPaused:!playing,speed:engine?.state?.playbackSpeed||1.0,hasPrev:!!b.chapters[idx-1]?.audio,hasNext:false,coverPath:b.cover||''});
  playingId=seg.audio;playingBookId=bid;playingChapterId=cid;
  if(playing)playbackPrompts?.warm(bid,['waiting',...(idx===b.chapters.length-1?['finished']:[])]);
  engine?.updatePlaybackProgress(bid,cid,doneBefore+position,0,false,{audioId:seg.audio,segmentId:seg.id,offsetMs:position}).catch(()=>{});
  miniPlayingState={id:seg.audio,position,playing};
  if(position>0){lastSeekPos=position;lastSeekTime=Date.now();}
  if(page==='listen'&&bookId===bid&&chapterId===cid)syncDisplayedPlayback(miniPlayingState,true);
  if(playing)checkAutoProduceUpcoming(bid,cid).catch(()=>{});
}
async function advanceStream(){
  if(!streamState)return false;
  if(productionPlaybackSession.paused||streamState.autoResumePaused)return true;
  const {bid,cid}=streamState;
  const b=engine?.state.books.find(b=>b.id===bid),c=b?.chapters.find(c=>c.id===cid);
  if(!b||!c){streamState=null;return false;}
  const prefix=streamPrefix(c);
  const curIdx=prefix.findIndex(s=>s.id===streamState.segId);
  if(curIdx<0){streamState=null;render();return false;} // 当前句被改/重制：停播等用户操作
  if(curIdx+1<prefix.length){await playStreamSeg(bid,cid,curIdx+1,0,{continueSession:true});return true;}
  const task=engine.state.tasks.find(t=>t.bookId===bid&&t.chapterId===cid&&!['done','cancelled'].includes(t.status));
  if(task&&['running','queued'].includes(task.status)||prefix.length<(c.segments||[]).filter(s=>(s.text||'').trim()&&!s.skip&&!s.isAd&&s.speaker!=='广告'&&s.audio!=='skip').length){
    const wasWaiting=streamState.waiting;
    streamState.waiting=true;
    if(!wasWaiting){
      await waitForProduction('已追上制作进度，稍等新句子…',bid,cid);
    }
    render();return true;
  }
  streamState=null;return false; // 交给唯一的 completion 处理器完成本章并推进下一章
}
async function refreshListenNav(){if(page!=="listen")return;try{var b=book(),c=chapter(),chs=b.chapters||[],i=chs.findIndex(function(x){return x.id===c.id;});var hasPrev=!!(i>0&&chs[i-1]&&playablePrefix(chs[i-1]).length),hasNext=!!(i>=0&&i<chs.length-1&&chs[i+1]&&playablePrefix(chs[i+1]).length);var prev=document.querySelector('[data-act="prevchapter"]'),next=document.querySelector('[data-act="nextchapter"]');if(prev){prev.classList.toggle("disabled",!hasPrev);if(hasPrev)prev.removeAttribute("disabled");else prev.setAttribute("disabled","");}if(next){next.classList.toggle("disabled",!hasNext);if(hasNext)next.removeAttribute("disabled");else next.setAttribute("disabled","");}}catch(e){}}
let chapterPlayRequest=0;
async function playCurrentChapter(bid=bookId,cid=chapterId,resumePos=null,options={}){
  const session=startPlaybackSession(options);
  playbackPrompts?.cancel();
  if(!options.continueSession)waitingForNextChapterId=null;
  const request=++chapterPlayRequest;
  const beforeLoad=engine.chapter(bid,cid);
  const needsTranscript=beforeLoad.unloaded||typeof beforeLoad.text!=='string'||!Array.isArray(beforeLoad.segments);
  await engine.ensureChapter(bid,cid);
  if(request!==chapterPlayRequest||session!==productionPlaybackSession||session.paused&&!options.startPaused)return;
  await engine.calibrateDurations(bid,cid);
  if(request!==chapterPlayRequest||session!==productionPlaybackSession||session.paused&&!options.startPaused)return;
  waitingForNextChapterId=null;
  if(needsTranscript&&page==='listen'&&bookId===bid&&chapterId===cid)render();
  streamState=null;
  const b=engine?.state.books.find(b=>b.id===bid),c=b?.chapters.find(c=>c.id===cid);
  if(!c?.audio){if(streamPrefix(c).length){chapterId=cid;page='listen';render();await resumeStreamChapter(bid,cid,resumePos,{...options,continueSession:true});return;}return;}
  const idx=b.chapters.indexOf(c),roleCount=b.characters.length;
  const pos = resumePos !== null ? resumePos : engine.playbackResumePosition(c);
  playbackRevision++;lastSeekTime=0;syncDisplayedPlayback({id:c.audio,position:pos,playing:false},true);
  await device.call('play',{
    bookId:bid,chapterId:cid,
    id: c.audio,
    title: c.title,
    bookTitle: b.name,
    artist: (b.author?b.author+' 著 · ':'')+(roleCount+'角色全景演绎')+' · 芭蕉',
    duration: Math.round((c.duration||0)*1000),
    position: pos,
    startPaused:!!options.startPaused,
    speed: engine?.state?.playbackSpeed || 1.0,
    hasPrev: !!(b.chapters[idx-1]&&playablePrefix(b.chapters[idx-1]).length),
    hasNext: !!(b.chapters[idx+1]&&playablePrefix(b.chapters[idx+1]).length),
    coverPath: b.cover||''
  });
  playingId=c.audio;playingBookId=bid;playingChapterId=cid;
  lastSeekTime=0;miniPlayingState={id:c.audio,position:pos,playing:!options.startPaused};syncDisplayedPlayback(miniPlayingState,true);
  if(!options.startPaused)playbackPrompts?.warm(bid,idx===b.chapters.length-1?['finished']:playablePrefix(b.chapters[idx+1]).length?[]:['waiting']);
  if(!options.startPaused)checkAutoProduceUpcoming(bid, cid).catch(()=>{});
}
async function restorePlayingChapter(){
  if(!engine)return;
  const p=await device.call('playbackState');
  for(const b of engine.state.books){const c=b.chapters.find(c=>c.audio&&c.audio===p.id);if(c){playingId=p.id;playingBookId=b.id;playingChapterId=c.id;return;}}
}
function playbackIsActive(p){
  if(p?.id&&p.id===playingId){
    if(streamState?.waiting)return !streamState.autoResumePaused;
    if(waitingForNextChapterId)return !waitingForNextChapterPaused;
  }
  return !!p?.playing;
}
function setProductionWaitPaused(paused){
  const clearSlowNotice=!paused&&productionPlaybackSession.stoppedForSlowProduction;
  if(!paused&&productionPlaybackSession.paused)startPlaybackSession();
  productionPlaybackSession.paused=paused;
  if(streamState?.waiting)streamState.autoResumePaused=paused;
  if(waitingForNextChapterId)waitingForNextChapterPaused=paused;
  if(clearSlowNotice)render();
}
async function togglePlayback(p){
  const paused=playbackIsActive(p);
  if(p.id===playingId)setProductionWaitPaused(paused);
  await device.call('playback',{op:paused?'pause':'resume'});
  miniPlayingState=await device.call('playbackState');
  syncDisplayedPlayback(miniPlayingState);
  if(!paused)continueProductionPlayback();
}
function syncDisplayedPlayback(p,forceFollow=false){
  if(page!=='listen')return;
  if(forceFollow)lastActiveStart='';
  const syncKey=bookId+':'+chapterId;
  if(syncKey!==window.__syncListenKey){window.__syncListenKey=syncKey;lastActiveStart='';listenUserHoldUntil=0;}
  let pos = p.position || 0;
  if (lastSeekTime && Date.now() - lastSeekTime < 1500) {
    const expected=lastSeekPos+(p.playing?(Date.now()-lastSeekTime)*(engine?.state?.playbackSpeed||1):0);
    // Ignore an obsolete native position only until the seek is acknowledged;
    // short sentences must keep advancing immediately after a seek.
    if(Math.abs(pos-expected)>500)pos=lastSeekPos;else lastSeekTime=0;
  }
  const ch = chapter();
  const streamActive = !!(streamState&&p.id===streamState.audioId&&streamState.bid===bookId&&streamState.cid===chapterId);
  const active = (!!ch?.audio&&p.id===ch.audio)||streamActive;
  const isStream = isChapterStreaming(ch);
  let position = 0, duration = 0;
  if(isStream){
    duration = chapterSentenceCount(ch);
    const segs = ch?.segments || [];
    if(streamActive){
      const curIdx = segs.findIndex(s => s.id === streamState.segId);
      position = curIdx >= 0 ? curIdx : 0;
    }else if(ch?.playbackCompleted){
      position = duration;
    }else if(ch?.playbackResume?.segmentId >= 0){
      const resumeIdx = segs.findIndex(s => s.id === ch.playbackResume.segmentId);
      position = resumeIdx >= 0 ? resumeIdx : 0;
    }else{
      position = 0;
    }
  }else{
    duration = Math.round((ch?.duration || 0) * 1000);
    position = active ? pos : engine.playbackResumePosition(ch);
  }
  if(!seekDragging){
    syncSeekDisplay(position, duration, isStream);
  }
  const btn=$('#playBtn'),isPlay=active&&playbackIsActive(p);if(btn)btn.setAttribute('aria-label',isPlay?'暂停':'播放');
  if(btn&&btn.dataset.playing!==String(isPlay)){btn.dataset.playing=String(isPlay);btn.innerHTML=`${I(isPlay?'pause':'play')}`;lucide.createIcons({attrs:{width:20,height:20}});}
  const curSpeed = engine?.state?.playbackSpeed || 1;
  if(document.activeElement!==$('#speedRange'))syncSpeedUI(curSpeed);
  const panel = document.getElementById('transcriptPanel');
  if (panel) {
    const space=Math.max(0,Math.floor(panel.clientHeight/2)-30)+'px';
    if(panel.style.paddingTop!==space){listenProgScrollUntil=Date.now()+800;panel.style.paddingTop=space;panel.style.paddingBottom=space;}
    const lines = Array.from(panel.querySelectorAll('.vc-transcript-line'));
    const holding=Date.now()<listenUserHoldUntil;
    let best = null;
    if (streamActive && lines.length) {
      best = panel.querySelector('[data-segstream="'+streamState.segId+'"]');
    }
    if (active && lines.length && !best) {
      for (const line of lines) {
        const st = parseInt(line.dataset.start || '0', 10);
        const en = parseInt(line.dataset.end || '0', 10);
        if (en > st && position >= st && position < en) { best = line; break; }
      }
      if (!best) {
        const audible = lines.filter(l => parseInt(l.dataset.end || '0', 10) > parseInt(l.dataset.start || '0', 10));
        const pool = audible.length ? audible : lines;
        best = pool[0];
        for (const l of pool) {
          if (parseInt(l.dataset.start || '0', 10) <= position) best = l;
          else break;
        }
      }
    }
    if(holding)best=lines.find(line=>line.classList.contains('active'))||null;
    else for(const line of lines){const selected=line===best;if(line.classList.contains('active')!==selected)line.classList.toggle('active',selected);}
    const key = best ? (streamActive?'segment:'+streamState.segId:'time:'+best.dataset.start) : '';
    const nowMs = Date.now();
    const centerBest = () => {
      try {
        const pr = panel.getBoundingClientRect(), br = best.getBoundingClientRect();
        const want = panel.scrollTop + (br.top - pr.top) - (panel.clientHeight / 2) + (br.height / 2);
        if (Math.abs(want - panel.scrollTop) > 2) {
          listenProgScrollUntil = Date.now() + 800;
          panel.scrollTop = want;
        }
      } catch (e2) {}
    };
    if (best && key !== String(lastActiveStart)) {
      lastActiveStart = key;
      if (nowMs >= listenUserHoldUntil) centerBest();
    } else if (best && nowMs >= listenUserHoldUntil) {
      // 同一行但位置偏离正中（用户滑走后hold过期）：拉回正中
      try {
        const pr = panel.getBoundingClientRect(), br = best.getBoundingClientRect();
        const off = (br.top - pr.top) - (panel.clientHeight / 2) + (br.height / 2);
        if (Math.abs(off) > 4) centerBest();
      } catch (e2) {}
    } else if (!best) {
      lastActiveStart = '';
    }
  }
  try{
    const runningTask = engine?.state?.tasks.find(t=>t.status==='running');
    const existingBanner = document.querySelector('.vc-listening-prod-banner');
    if(runningTask){
      const tb=engine.state.books.find(x=>x.id===runningTask.bookId);
      const tc=tb?.chapters.find(x=>x.id===runningTask.chapterId);
      const { pct } = taskProductionMetrics(runningTask, tc);
      const txt='正在制作 '+(tc?.title||'下一章')+' '+pct+'%，点此查看 →';
      if(existingBanner){
        if(existingBanner.__txt!==txt){existingBanner.__txt=txt;const label=existingBanner.querySelector('span:last-child');if(label)label.textContent=txt;}
      }else{
        const d=document.createElement('button');d.className='vc-listening-prod-banner';d.__txt=txt;d.setAttribute('data-act','gotasksactive');
        const dot=document.createElement('span');dot.className='vc-pulse-dot';
        const label=document.createElement('span');label.textContent=txt;
        d.appendChild(dot);d.appendChild(label);
        d.addEventListener('click',()=>{try{taskTab='active';go('tasks');}catch(e){}});
        const playerEl=document.querySelector('.vc-player');
        if(playerEl&&playerEl.parentNode)playerEl.parentNode.insertBefore(d,playerEl);
      }
    }else if(existingBanner){existingBanner.remove();}
  }catch(bannerErr){}
}
async function applySpeed(sp){if(!Number.isFinite(sp)||sp<.5||sp>3){toast('语速范围为 0.5–3 倍');return;}engine.state.playbackSpeed=sp;await engine.persist();await device.call('playback',{op:'speed',value:sp});syncSpeedUI(sp);toast('已设置 '+sp+'x 倍速');}
async function seekDisplayedChapter(op,value,delta=null){
  const bid=bookId,cid=chapterId,request=++seekRequest;
  const p=await device.call('playbackState');
  if(request!==seekRequest||page!=='listen'||bid!==bookId||cid!==chapterId)return;
  listenUserHoldUntil=0;
  const c=chapter(),streaming=streamState&&streamState.bid===bid&&streamState.cid===cid;
  if(streaming||!c.audio){
    const prefix=streamPrefix(c);
    if(!prefix.length){toast('还没有连续可播的音频');return;}
    const totalSentences = chapterSentenceCount(c);
    if(delta===null){
      let targetIdx = Math.max(0, Math.min(Math.max(0, totalSentences - 1), Math.round(value)));
      if(targetIdx < prefix.length){
        await playStreamSeg(bid, cid, targetIdx, 0, { continueSession:true, startPaused: !(streaming && p.id === streamState.audioId && playbackIsActive(p)) });
      }else{
        await playStreamSeg(bid, cid, prefix.length - 1, 0, { continueSession:true, startPaused: !(streaming && p.id === streamState.audioId && playbackIsActive(p)) });
        toast('已跳至最新已生成句子（第 ' + prefix.length + ' 句）');
      }
      return;
    }
    const duration=prefix.reduce((sum,s)=>sum+Math.max(0,s.durMs||0),0);
    const currentMs=streaming?streamState.posBefore+(p.id===streamState.audioId?p.position||0:0):0;
    const targetMs=Math.max(0,Math.min(duration-1,currentMs+delta));
    let acc=0;
    for(let i=0;i<prefix.length;i++){
      const seg=prefix[i],end=acc+Math.max(0,seg.durMs||0);
      if(targetMs<end){
        const offset=targetMs-acc;
        if(streaming&&p.id===seg.audio&&streamState.segId===seg.id){
          streamState.waiting=false;playbackRevision++;lastSeekTime=0;
          miniPlayingState={...p,position:offset};syncDisplayedPlayback(miniPlayingState,true);
          lastSeekPos=offset;lastSeekTime=Date.now();await device.call('playback',{op:'seek',value:offset});
        }else await playStreamSeg(bid,cid,i,offset,{continueSession:true,startPaused:!(streaming&&p.id===streamState.audioId&&playbackIsActive(p))});
        return;
      }
      acc=end;
    }
    return;
  }
  const target=Math.max(0,Math.min(Math.max(0,listenSeekDuration(c)-1),delta===null?value:(p.id===c.audio?p.position||0:0)+delta));
  if(p.id!==c.audio){await playCurrentChapter(bid,cid,target,{startPaused:true});return;}
  playbackRevision++;lastSeekTime=0;
  miniPlayingState={...p,position:target};syncDisplayedPlayback(miniPlayingState,true);
  lastSeekPos=target;lastSeekTime=Date.now();
  await device.call('playback',{op:'seek',value:target});
}
function finishSeekGesture(){
 if(seekCommitting)return;
 seekDragging=false;
 if(seekRenderPending){seekRenderPending=false;render();}
 if(miniPlayingState)syncDisplayedPlayback(miniPlayingState);
}

let playbackNavigationBusy=false;
window.onNativePlaybackAction=async(act,val,sourceAudioId)=>{
  if(['play','pause','stop','completion'].includes(act)&&sourceAudioId&&playingId&&sourceAudioId!==playingId)return;
  if(['pause','stop'].includes(act))saveCurrentPlayback().then(()=>engine.persist()).catch(()=>{});
  if(['play','pause','stop','seek','next','prev'].includes(act))playbackPrompts?.cancel();
  if(act==='play'){setProductionWaitPaused(false);continueProductionPlayback();}
  if(['pause','stop'].includes(act))setProductionWaitPaused(true);
  const navigation=['completion','next','prev'].includes(act);
  if(navigation&&playbackNavigationBusy)return;
  if(navigation)playbackNavigationBusy=true;
  try{
    if(act==='completion'){
      if(productionPlaybackSession.paused){
        if(streamState&&!streamState.waiting){
          streamState.waiting=true;streamState.autoResumePaused=true;
          await device.call('playback',{op:'wait',expectedAudioId:playingId});
        }
        return;
      }
      if(waitingForNextChapterId)return;
      const session=productionPlaybackSession;
      if(streamState){const wasStream=streamState;try{if(await advanceStream())return;}catch(e){toast(e.message||'流播失败');return;}const completed=engine?.state.books.find(b=>b.id===wasStream.bid)?.chapters.find(c=>c.id===wasStream.cid);val=(completed?.duration||0)*1000;}
      if(!playingBookId)await restorePlayingChapter();
      const b=engine?.state.books.find(b=>b.id===playingBookId);
      const c=b?.chapters.find(c=>c.id===playingChapterId);
      if(b&&c&&engine){
        await engine.updatePlaybackProgress(b.id,c.id,val||c.duration*1000||0,c.duration*1000||0,true);
      }
      const sleepPlan=engine?.state.sleepChapterPlan;
      if(sleepPlan&&b&&c&&sleepPlan.bookId===b.id&&sleepPlan.lastChapterId!==c.id){
        sleepPlan.lastChapterId=c.id;sleepPlan.remaining=Math.max(0,sleepPlan.remaining-1);
        if(!sleepPlan.remaining){engine.state.sleepChapterPlan=null;engine.state.settings.sleepTimer=0;await device.call('playback',{op:'pause'});await engine.persist();toast('已播完设定章数，定时停止');render();return;}
        await engine.persist();updateSleep({sleepRemainingMs:0});
      }
      // 正常播完：自动连播下一章（与睡眠定时无关）
      {
      if(session!==productionPlaybackSession||session.paused)return;
      const chIdx = b?.chapters.findIndex(ch => ch.id === playingChapterId) ?? -1;
      const nextCh = (chIdx >= 0 && chIdx + 1 < (b?.chapters.length || 0)) ? b.chapters[chIdx + 1] : null;
      if(nextCh){
        if(playablePrefix(nextCh).length){
          if(page === "listen" && bookId === playingBookId){
            await engine.ensureChapter(b.id, nextCh.id);
            if(session!==productionPlaybackSession||session.paused)return;
            chapterId = nextCh.id;
            render();
          }
          await playCurrentChapter(b.id,nextCh.id,null,{continueSession:true});
        } else {
          const isProducing = engine.state.tasks.some(t => t.bookId === b.id && t.chapterId === nextCh.id && (t.status === "running" || t.status === "queued"));
          if(isProducing){
            waitingForNextChapterId = nextCh.id;
            waitingForNextChapterPaused = false;
            await waitForProduction('下一章正在后台制作中，完成后自动播放…',b.id,c.id);
          } else if(engine.state.settings?.autoProduceUpcoming !== false){
            waitingForNextChapterId = nextCh.id;
            waitingForNextChapterPaused = false;
            await waitForProduction('正在为你自动制作下一章，请稍候…',b.id,c.id);
            await engine.enqueue(b.id, nextCh.id,{source:'auto'});
          } else {
            toast("下一章尚未制作");
          }
        }
      }else if(b&&c&&chIdx===b.chapters.length-1){
        playbackPrompts?.schedule('finished',b.id,c.id,playingId);
      }
      return;
      }
      return;
    }
    if(act==='next'||act==='prev'){
      if(!playingBookId)await restorePlayingChapter();
      const b=engine?.state.books.find(b=>b.id===playingBookId);
      const idx=b?.chapters.findIndex(c=>c.id===playingChapterId)??-1;
      const target=idx<0?null:b.chapters[idx+(act==='next'?1:-1)];
      if(!target||!playablePrefix(target).length)return;
      const cleanRes=await engine.performAutoCleanup(b.id,target.id);
      if(page==='listen'&&bookId===playingBookId){
        await engine.ensureChapter(b.id,target.id);chapterId=target.id;render();
      }
      await playCurrentChapter(b.id,target.id);
      if(cleanRes&&cleanRes.clearedCount>0&&cleanRes.freedMb>0){toast('已自动释放前章缓存('+cleanRes.freedMb+'MB)');}
    }else if((act==='play'||act==='pause')&&page==='listen'){
      syncDisplayedPlayback(await device.call('playbackState'));
    }else if(act==='seek'&&page==='listen'){
      playbackRevision++;lastSeekTime=0;
      const base = await device.call('playbackState');
      syncDisplayedPlayback({...base, position: val || 0},true);
      lastSeekPos = val || 0;
      lastSeekTime = Date.now();
    }
  }catch(e){toast(e.message||'播放控制失败');}finally{if(navigation){playbackNavigationBusy=false;continueProductionPlayback();}}
};
async function handleAction(el,e,approved=false){if(!el||el.disabled)return;if(el.classList.contains('vc-modal-overlay')&&e.target!==el)return;const [a,...rest]=el.dataset.act.split(':'),x=rest.join(':');
try{
if(a==='opensegment'){if(page!=='annotated')return;resetModalFlags();segmentPanel={bookId,chapterId,id:String(x),scroll:0,result:''};render();return;}
if(a==='closesegment'){segmentPanel=null;render();return;}
if(a==='segmentpreview'){const s=panelSegment();if(!s||String(s.id)!==x||!s.audio||s.audio==='skip')return;const panel=segmentPanel;panel.playError='';try{await startPreview(s.audio,'第 '+(chapter().segments.indexOf(s)+1)+' 段 · '+s.speaker);panel.result='可再次点击本句试听按钮暂停或继续。';}catch(error){panel.playError='试听失败：'+cleanErr(error);}render();return;}
if(a.startsWith('voicebatch')){
 if(page!=='voices'||voiceTab!=='mine')return;
 if(a==='voicebatchedit'){voiceBatch=!voiceBatch;voiceBatchIds=[];}
 if(a==='voicebatchtoggle'&&voiceBatch&&engine.state.voices.some(v=>v.id===x)){voiceBatchIds=voiceBatchIds.includes(x)?voiceBatchIds.filter(id=>id!==x):[...voiceBatchIds,x];}
 if(a==='voicebatchall'&&voiceBatch){voiceBatchIds=voiceBatchIds.length===engine.state.voices.length?[]:engine.state.voices.map(v=>v.id);}
 if(a==='voicebatchdelete'&&voiceBatch){
  const targets=engine.state.voices.filter(v=>voiceBatchIds.includes(v.id));if(!targets.length)return;
  const bindings=engine.state.books.flatMap(b=>b.characters.filter(r=>targets.some(v=>v.id===r.voice)));
  uxDialog={title:'删除所选音色？',html:'<p>将删除 '+targets.length+' 个音色：</p><p>'+targets.map(v=>E(v.name)).join('、')+'</p><p>'+bindings.length+' 个角色绑定将解除。已完成的音频保留，此操作无法撤销。</p>',confirmLabel:'确认删除',confirm:async()=>{
   try{for(const v of targets){await engine.deleteVoice(v.id);voiceBatchIds=voiceBatchIds.filter(id=>id!==v.id);}voiceBatch=false;toast('已删除 '+targets.length+' 个音色');}
   catch(err){toast('删除未全部完成：'+cleanErr(err)+'，可重新选择后重试');}
  }};
 }
 render();if(!hasModal())Array.from(document.querySelectorAll('button[data-act]')).find(button=>button.dataset.act===el.dataset.act)?.focus({preventScroll:true});return;
}
if(a==='deletevoice'&&approved&&page==='voicedetail'){voiceEditor=null;voiceLeaveNext=null;}
if(a==='vedsave'||a==='vedsaveleave'){await saveVoiceEditor(a==='vedsaveleave'?voiceLeaveNext:null);return;}
if(['vedredesign','vedcompareold','vedcomparenew','veddiscard','vedreplay'].includes(a)){
 captureVoiceDraft();const d=voiceDraft();if(d.working)return;
 if(a==='veddiscard'){d.candidate=null;d.candidateDescription='';d.error='';d.status='已放弃新方案，原音色未改变。';render();return;}
 if(a==='vedredesign'){
  const description=Bajiao.cleanVoiceDescription(d.description.trim());
  if(!description){d.error='请先填写声音描述。';render();document.getElementById('vdescription')?.focus();return;}
  d.working=true;d.error='';d.status='正在根据描述设计新音色，请稍候…';render();
  try{d.candidate=await engine.design(description,d.text.trim()||'山里的风停了，故事才刚刚开始。');d.candidateDescription=description;d.status='新方案已生成。';}
  catch(err){d.error='设计失败：'+cleanErr(err)+'，请重试。';d.status='';}
  finally{d.working=false;render();}return;
 }
 const id=a==='vedcompareold'?voice().sample:a==='vedcomparenew'?d.candidate?.sample:d.trial?.id;
 if(!id){d.error='暂无样本，请先生成。';render();return;}
 try{await startPreview(id,voice().name+(a==='vedcomparenew'?' · 新方案':a==='vedreplay'?' · 文字试音':' · 原音色'));d.error='';d.status='';}
 catch(err){d.error='播放失败：'+cleanErr(err)+'，请重试。';}
 render();return;
}
if(a==='vedsample'||a==='vedtrial'){
 captureVoiceDraft();const d=voiceDraft();if(d.working)return;
 if(a==='vedtrial'&&!d.text.trim()){d.error='请先填写要试听的文本。';d.trialOpen=true;render();return;}
 d.working=true;d.error='';d.status=a==='vedsample'?'':'正在生成试音，请稍候…';render();
 try{if(a==='vedsample'){await startPreview(voice().sample,voice().name+' · 参考样本');d.status='';}else{const file=await engine.synthesize(d.text,voiceId);d.trial={id:file.id,text:d.text};voice().tested=true;voice().lastTrial=file.id;await engine.persist();await startPreview(file.id,voice().name+' · 文字试音');d.status='';}}
 catch(err){d.status='';d.error='试听失败：'+cleanErr(err)+'，请重试。';}finally{d.working=false;render();}return;
}
if(['playchapter','miniplaypause','mininext','miniprev','nextchapter','prevchapter','streamsegment','seekseg','play','previewstop'].includes(a))auditionIntent++;
if(['playchapter','miniplaypause','nextchapter','prevchapter','streamsegment','seekseg','seekback','seekforward','play','previewpause','previewstop'].includes(a))playbackPrompts?.cancel();
if(await handleUXAction(a,x,el,e,approved))return;
if(a==='readnext'){
 if(!['raw','annotated'].includes(page))return;
 const mode=page,bid=bookId,fromId=chapterId,chapters=book().chapters,index=chapters.findIndex(item=>item.id===fromId),next=index>=0?chapters[index+1]:null;
 if(!next||next.id!==x)return;
 rememberReading();
 await busy(async()=>{
  if(mode==='annotated')await engine.prepareAnnotations(bid,next.id);else await engine.ensureChapter(bid,next.id);
  if(page!==mode||bookId!==bid||chapterId!==fromId)return;
  chapterId=next.id;selected=[];pendingSeg=null;resetModalFlags();delete window.__jumpToPos;
  render();window.scrollTo({top:0,behavior:'instant'});rememberReading();
 },'读取下一章…');return;
}
if(a==='reload'){location.reload();return;}
if(a==='go'){for(const k of['segSpeaker','policyMode','retries','speakerThreshold','taskParallel','ttsParallel','llmProtocol'])delete dropdownSel[k];openDropdown=null;if(x==='tasks'&&e.target.closest('.vc-nav-badge'))taskTab='attention';go(x);return;}if(a==='back'){if(closeActiveModal())return;for(const k of['segSpeaker','policyMode','retries','speakerThreshold','taskParallel','ttsParallel','llmProtocol'])delete dropdownSel[k];openDropdown=null;appBack();return;}

if(a==='continuebook'){const b=book(),lp=engine.state.lastPlayback;const ids=[lp?.bookId===b.id?lp.chapterId:null,b.lastPlayedChapterId,b.readProgress?.chapterId];const c=ids.map(id=>b.chapters.find(ch=>ch.id===id&&(ch.audio||ch.segmentCount||(ch.segments||[]).some(s=>s.audio&&s.audio!=='skip')))).find(Boolean)||b.chapters.find(ch=>ch.audio);if(!c){toast('暂无可播放音频，请先制作章节');return;}chapterId=c.id;page='listen';render();await playCurrentChapter(b.id,c.id);return;}
if(a==='resumebook'){const [bid,cid]=x.split(':');bookId=bid;chapterId=cid;page='listen';render();await playCurrentChapter(bid,cid);return;}
if(a==='resumechapter'){playerCatalogOpen=false;const c=book()?.chapters?.find(ch=>ch.id===x);if(c?.audio){chapterId=x;page='listen';render();await playCurrentChapter(bookId,x);return;}const existing=engine.state.tasks.find(t=>t.bookId===bookId&&t.chapterId===x&&!['done','cancelled'].includes(t.status));const job=existing?engine.resume(existing.id):engine.enqueue(bookId,[x]);job.catch(e=>toast(e.message));toast('已开始制作');go('detail');return;}
if(a==='setspeed'){await applySpeed(parseFloat(x));return;}

if(a==="toggleautoproduce"){
if(!engine.state.settings)engine.state.settings={};
engine.state.settings.autoProduceUpcoming=engine.state.settings.autoProduceUpcoming===false?true:false;
await engine.persist();
toast("听书自动预制: "+(engine.state.settings.autoProduceUpcoming?"已开启":"已关闭"));
render();return;}
if(a==='toggleautodelete'){if(engine.state.settings.autoDeletePlayed){engine.state.settings.autoDeletePlayed=false;await engine.persist();render();}else{uxDialog={title:'开启完播自动释放？',html:'<p>完播或切换章节时，将删除保留范围外的已听音频。原文与标注保留，但重制会重新请求服务。</p><p>当前保留 '+engine.state.settings.keepRecentCount+' 个已完播章节。</p>',confirm:async()=>{engine.state.settings.autoDeletePlayed=true;await engine.persist();}};render();}return;}

if(a==='seekseg'){
  const targetMs=parseInt(x,10)||0;
  await seekDisplayedChapter('seek',targetMs);
  return;
}
if(a==='refreshstorage'){storageStats=await device.call('audioStats');toast('已刷新存储统计');render();return;}
if(a==='cleargc'){const res=await engine.garbageCollectAudio();storageStats=await device.call('audioStats');toast('清理完成，释放 '+res.deletedCount+' 个孤儿音频');render();return;}
if(a==='clearalllistened'){
  const res = await engine.clearAllListened();
  storageStats = await device.call('audioStats');
  toast('已释放 ' + res.clearedCount + ' 章已听音频 (' + res.freedMb + 'MB)');
  render();return;
}
if(a==='clearexpired'){
  const res = await engine.clearExpiredAudio(7);
  storageStats = await device.call('audioStats');
  toast('已清理 7 天前未听音频 ' + res.clearedCount + ' 章 (' + res.freedMb + 'MB)');
  render();return;
}
if(a==='keeponlycurrent'){
  const res = await engine.keepOnlyCurrentBook(playingBookId || bookId);
  storageStats = await device.call('audioStats');
  toast('已清理其他书籍音频 ' + res.clearedCount + ' 章 (' + res.freedMb + 'MB)');
  render();return;
}
if(a==='archivebook'){
  const res = await engine.archiveBook(x);
  storageStats = await device.call('audioStats');
  toast(res.archived ? ('书籍已归档，释放 ' + res.clearedCount + ' 章音频') : '已取消归档');
  render();return;
}
if(a==='openbatchmodal'){
  batchModalBookId = x;
  render();return;
}
if(a==='closebatchmodal'){
  batchModalBookId = null;
  render();return;
}
if(a==='executebatchmodal'){
  const sVal = parseInt(value('batchStartCh') || '1', 10) - 1;
  const eVal = parseInt(value('batchEndCh') || '1', 10) - 1;
  batchModalBookId = null;
  const tasks = await engine.batchEnqueue(x, sVal, eVal);
  toast('已添加 ' + tasks.length + ' 个章节到制作队列');
  render();return;
}
if(a==='clearallaudio'){for(const b of engine.state.books){await engine.clearBookAudio(b.id);}storageStats=await device.call('audioStats');toast('已清空全部有声书音频');render();return;}
if(a==='clearbooklistened'){const b=engine.state.books.find(bk=>bk.id===x);if(b){let cCount=0;for(const c of b.chapters){if(c.audio&&c.listened){await engine.clearChapterAudio(b.id,c.id);cCount++;}}storageStats=await device.call('audioStats');toast('已释放《'+b.name+'》'+cCount+' 个章节音频');render();}return;}
if(a==='clearbookaudio'){const b=engine.state.books.find(bk=>bk.id===x);if(b){await engine.clearBookAudio(b.id);storageStats=await device.call('audioStats');toast('已释放《'+b.name+'》全部音频');render();}return;}
if(a==='deletebookconfirm'){deleteConfirmBookId=x;render();return;}
if(a==='closedeleteconfirm'){deleteConfirmBookId=null;render();return;}
if(a==='executedeletebook'){if(deleteConfirmBookId){const removedBookId=deleteConfirmBookId;const b=engine.state.books.find(bk=>bk.id===deleteConfirmBookId);const bName=b?.name||'书籍';await engine.deleteBook(deleteConfirmBookId);deleteConfirmBookId=null;storageStats=await device.call('audioStats');toast('已彻底删除《'+bName+'》');if(bookId===removedBookId){bookId=null;chapterId=null;go('shelf');}else{render();}}return;}
if(a==='minigolisten'){if(playingBookId&&playingChapterId){bookId=playingBookId;chapterId=playingChapterId;go('listen');}return;}
if(a==='miniplaypause'){await togglePlayback(await device.call('playbackState'));return;}
if(a==='mininext'){await window.onNativePlaybackAction('next',0);return;}
if(a==='miniprev'){await window.onNativePlaybackAction('prev',0);return;}
if(a==='shelfmulti'){shelfMulti=!shelfMulti;if(!shelfMulti)shelfSelected=[];render();return;}
if(a==='shelfselectall'){shelfSelected=engine.state.books.map(b=>b.id);render();return;}
if(a==='shelfselectnone'){shelfSelected=[];render();return;}
if(a==='shelfdeletebooks'){if(!shelfSelected.length)return;deleteConfirmShelf=[...shelfSelected];render();return;}
if(a==='closeshelfdelete'){deleteConfirmShelf=null;render();return;}
if(a==='executeshelfdelete'){if(deleteConfirmShelf?.length){const ids=[...deleteConfirmShelf];for(const bid of ids){try{await engine.deleteBook(bid);}catch(e){}}deleteConfirmShelf=null;shelfSelected=[];shelfMulti=false;if(ids.includes(bookId)){bookId=null;chapterId=null;}try{storageStats=await device.call('audioStats');}catch(e){}toast('已删除 '+ids.length+' 本书');if(page!=='shelf')go('shelf');else render();}return;}
if(a==='book'){if(shelfMulti){const scroll=window.scrollY;shelfSelected=shelfSelected.includes(x)?shelfSelected.filter(id=>id!==x):[...shelfSelected,x];render();window.scrollTo(0,scroll);requestAnimationFrame(()=>Array.from(document.querySelectorAll('.vc-book-select')).find(el=>el.dataset.act==='book:'+x)?.focus({preventScroll:true}));return;}shelfMulti=false;shelfSelected=[];bookId=x;chapterId=book().chapters[0].id;multi=false;selected=[];chapterPage=0;episodeModalOpen=false;go('detail');return;}
if(a==='producechapter'){const c=book()?.chapters?.find(ch=>ch.id===x);if(!c)return;const existing=chapterTask(bookId,x);if(isChapterProducing(existing)){chapterId=x;unmadeChoiceChapterId=x;render();return;}if(existing){toast('本章已有制作任务，请在制作页处理');return;}if(c.audio&&!c.audioStale){toast('本章已有音频，可以直接播放');return;}if(!configured.llmConfigured||!configured.ttsConfigured){toast('请先配置语言模型和 MiMo 密钥');go('models');return;}engine.enqueue(bookId,[x]).catch(e=>toast(e.message));toast('已加入制作任务');render();return;}
if(a==='read'){chapterId=x;const c=book()?.chapters?.find(ch=>ch.id===x);if(isChapterProducing(chapterTask(bookId,x))||c&&!c.audio&&!(c.unloaded?((c.segmentCount||0)>0):((c.segments||[]).length>0))){unmadeChoiceChapterId=x;render();return;}go(getChapterTarget(c));return;}
if(a==='closeunmade'){unmadeChoiceChapterId=null;render();return;}
if(a==='readraw'){const cid=unmadeChoiceChapterId||x;chapterId=cid;go('raw');return;}
if(a==='makechapter'){const cid=unmadeChoiceChapterId||x;if(isChapterProducing(chapterTask(bookId,cid))){unmadeChoiceChapterId=cid;render();return;}unmadeChoiceChapterId=null;chapterId=cid;selected=[cid];go('make');return;}
if(a==='makeandlisten'){const cid=unmadeChoiceChapterId||x,existing=chapterTask(bookId,cid),c=book()?.chapters?.find(ch=>ch.id===cid);if(!c)return;const needsStart=!isChapterProducing(existing)&&(!c.audio||c.audioStale);if(needsStart&&(!configured.llmConfigured||!configured.ttsConfigured)){toast('请先配置语言模型和 MiMo 密钥');go('models');return;}chapterId=cid;if(needsStart){const job=existing?engine.resume(existing.id):engine.enqueue(bookId,[cid]);job.catch(e=>toast(e.message));}toast(needsStart?'已开始制作，边做边听':'已进入边做边听');taskTab='active';go('listen');return;}
if(a==='confirm'){chapterId=x;pendingSeg=null;await busy(async()=>{await engine.prepareAnnotations(bookId,x);pendingSeg=readingIssues()[0]?.id??null;go('annotated');},'定位待处理句子…');return;}
if(a==='tasktab'){taskTab=x;render();return;}
if(a==='gotasksactive'){taskTab='active';go('tasks');return;}
if(a==='mergeroles'){const b=book();const m=(b.mergeSuggestions||[])[Number(x)];if(m){await engine.mergeRoles(b.id,m.to,m.from);toast('已合并「'+m.from+'」→「'+m.to+'」，音色共用');}go('roles');return;}
if(a==='ignoremerge'){const b=book();const m=(b.mergeSuggestions||[]).splice(Number(x),1)[0];if(m){b.mergeDismissed=b.mergeDismissed||[];b.mergeDismissed.push(m.from+'→'+m.to);}await engine.persist();go('roles');return;}
if(a==='ignorerole'){const b=book();const ch=b.characters.find(r=>r.name===x);if(ch){const reuse=engine.autoVoiceFor(bookId,x);if(reuse){ch.voice=reuse;ch.candidate=null;ch.reason='性别年龄与声音特征相近，自动复用已有音色';await engine.persist();toast('角色「'+ch.name+'」已自动复用已有音色');}else{ch.autoDesign=true;await engine.persist();toast('角色「'+ch.name+'」稍后后台自动设计');}engine.resumeWaiting(bookId).catch(e=>toast(e.message));}taskTab='active';go('tasks');return;}
if(a==='ignorespeaker'){const b=book(),c=chapter();const seg=c.segments.find(s=>s.id===Number(x));if(seg){const sp=String(seg.speaker||'');if(sp==='未知角色'||sp==='未识别角色'||!sp||!b.characters.some(r=>r.name===sp)){for(const key of ['scene','delivery','directionVersion','directionStatus','directionError'])delete seg[key];seg.speaker='旁白';seg.emotion='自然朗读';toast('未知说话人已设为旁白');}else{const ch=b.characters.find(r=>r.name===sp);if(ch&&!ch.voice){const reuse=engine.autoVoiceFor(bookId,sp);if(reuse){ch.voice=reuse;ch.candidate=null;ch.reason='性别年龄与声音特征相近，自动复用已有音色';}else{ch.autoDesign=true;}}toast('已沿用LLM识别：'+sp+'，音色稍后自动处理');}seg.confidence=1;seg.annotationStatus='resolved';delete seg.annotationError;seg.audio=null;c.audio=null;c.status='annotated';engine.touch(c);for(const t of engine.state.tasks.filter(t=>t.bookId===bookId&&t.chapterId===chapterId)){t.done=c.segments.filter(s=>s.audio).length;if(t.status==='done')t.status='paused';}await engine.persist();engine.resumeWaiting(bookId).catch(e=>toast(e.message));taskTab='active';go('tasks');}return;}
if(a==='ignoreall'){const b=book(),c=chapter();const activeSpeakers=[...new Set(c.segments.filter(s=>!s.skip&&!s.isAd&&s.speaker!=='旁白'&&s.speaker!=='广告').map(s=>s.speaker))];const rolesToFix=b.characters.filter(r=>(activeSpeakers.includes(r.name)||r.candidate)&&!r.voice);for(const ch of rolesToFix){const reuse=engine.autoVoiceFor(bookId,ch.name);if(reuse){ch.voice=reuse;ch.candidate=null;ch.reason='性别年龄与声音特征相近，自动复用已有音色';continue;}ch.autoDesign=true;}for(const seg of c.segments){if(!seg.skip&&!seg.isAd&&seg.speaker!=='广告'&&(seg.annotationStatus!=='pending'||seg.annotationError)&&(seg.annotationError||seg.confidence<engine.spkThr()||!b.characters.some(r=>r.name===seg.speaker))){const sp=String(seg.speaker||'');if(sp==='未知角色'||sp==='未识别角色'||!sp||!b.characters.some(r=>r.name===sp)){for(const key of ['scene','delivery','directionVersion','directionStatus','directionError'])delete seg[key];seg.speaker='旁白';seg.emotion='自然朗读';}seg.confidence=1;seg.annotationStatus='resolved';delete seg.annotationError;seg.audio=null;}}c.audio=null;c.status='annotated';engine.touch(c);for(const t of engine.state.tasks.filter(t=>t.bookId===bookId&&t.chapterId===chapterId)){t.done=c.segments.filter(s=>s.audio).length;}await engine.persist();engine.resumeWaiting(bookId).catch(e=>toast(e.message));toast('已记录选择，后台继续制作');taskTab='active';go('tasks');return;}
if(a==='acceptrole'){const bid=bookId;await busy(async()=>{await engine.accept(bid,x,false);toast('已采用角色「'+x+'」专属音色');},'正在保存音色…');engine.resumeWaiting(bid).catch(e=>toast(e.message));taskTab='active';go('tasks');return;}
if(a==='acceptsuggested'){const ch=book().characters.find(r=>r.name===x);if(ch&&ch.suggestedVoice){await engine.bind(bookId,x,ch.suggestedVoice,false);toast('已为角色「'+x+'」绑定音色');engine.resumeWaiting(bookId).catch(e=>toast(e.message));taskTab='active';go('tasks');}return;}
if(a==='resumechapter'){playerCatalogOpen=false;const existing=engine.state.tasks.find(t=>t.bookId===bookId&&t.chapterId===x&&!['done','cancelled'].includes(t.status));const job=existing?engine.resume(existing.id):engine.enqueue(bookId,[x]);job.catch(e=>toast(e.message));toast('已开始制作');go('detail');return;}
if(a==='samplebook'){await busy(async()=>{const b=await engine.addBook('雾山来信 · 示例文本','第一章 山中来信\n雨停了，青年男子沈砚推开木门。\n“你终于来了。”沈砚用低沉温润的声音说。\n年轻女子林晚抬起头，用清亮的声音问：“这封信是谁寄来的？”\n第二章 天亮之前\n清晨，沈砚走出邮局。\n“别担心，我会回来。”他轻声说。');bookId=b.id;chapterId=b.chapters[0].id;chapterPage=0;episodeModalOpen=false;go('detail');});return;}
if(a==='importbook'){
  try{
    const files=await device.call('pick',{kind:'book'});if(!files?.length)return;
    const draft=BajiaoImport.createDraft(files[0],engine.state.settings);
    if(!draft.error)BajiaoImport.splitDraft(draft,Bajiao.splitChapters);enterImport(draft);
  }catch(error){const draft=BajiaoImport.createDraft({});draft.error=cleanErr(error.message||error);enterImport(draft);}
  return;
}
if(a==='multiselect'){multi=!multi;selected=[];render();const target=document.querySelector(multi?'.vc-chapter-manage-header button':'.vc-manage-chapters');target?.focus({preventScroll:true});return;}
if(a==='togglechapter'){if(page!=='detail'||!multi)return;selected=selected.includes(x)?selected.filter(id=>id!==x):[...selected,x];render();Array.from(document.querySelectorAll('[data-act]')).find(el=>el.dataset.act==='togglechapter:'+x)?.focus({preventScroll:true});return;}
if(a==='dismissstalenotice'){const dismissed=engine.state.settings.dismissedStaleNotices||[];engine.state.settings.dismissedStaleNotices=[...dismissed.filter(key=>key!==staleNoticeKey()),staleNoticeKey()].slice(-100);render();await engine.persist();return;}
if(a==='nextissue'){const ids=readingIssues().map(s=>String(s.id)),context=bookId+'|'+chapterId,previous=window.__lastReadingIssue,position=previous?.context===context?ids.indexOf(previous.id):-1,id=ids[(position+1)%ids.length];if(id!=null&&focusReadingSegment(id))window.__lastReadingIssue={context,id};else toast('没有待确认内容');return;}
if(a==='selectunfinished'){selected=book().chapters.filter(c=>!c.audio).map(c=>c.id);render();return;}
if(a==='selectpage'){const b=book();const cur=b.chapters.slice(chapterPage*50,(chapterPage+1)*50).map(c=>c.id);selected=[...new Set([...selected,...cur])];render();return;}
if(a==='selectnone'){selected=[];render();return;}
if(a==='selectall'){selected=book().chapters.map(c=>c.id);render();return;}
if(a==='clearchapters'){await busy(async()=>{const ids=[...selected];for(const t of engine.state.tasks.filter(t=>t.bookId===bookId&&ids.includes(t.chapterId)&&['running','queued'].includes(t.status)))await engine.cancel(t.id);let n=0;for(const cid of ids){const cc=engine.chapter(bookId,cid);if(cc?.audio){await engine.clearChapterAudio(bookId,cid);n++;}}selected=[];multi=false;try{storageStats=await device.call('audioStats');}catch(e){}toast('已释放 '+n+' 章音频，标注保留，可直接重听时重合');},'正在释放所选章节音频…');return;}
if(a==='resetchapters'){await busy(async()=>{const ids=[...selected];for(const t of engine.state.tasks.filter(t=>t.bookId===bookId&&ids.includes(t.chapterId)&&['running','queued'].includes(t.status)))await engine.cancel(t.id);const n=await engine.resetChapters(bookId,ids);selected=[];multi=false;try{storageStats=await device.call('audioStats');}catch(e){}toast('已清除 '+n+' 章的标注与音频，原文保留，可重新制作');},'正在清除所选章节的标注与音频…');return;}
if(a==='playercatalog'){playerCatalogOpen=true;render();requestAnimationFrame(()=>{const list=document.getElementById('player-catalog-scroll'),row=list?.querySelector('.vc-chapter-current');if(list&&row)list.scrollTop=row.getBoundingClientRect().top-list.getBoundingClientRect().top+list.scrollTop;});return;}
if(a==='closeplayercatalog'){playerCatalogOpen=false;render();return;}
if(a==='catalogcurrent'){const list=document.getElementById('player-catalog-scroll'),row=list?.querySelector('.vc-chapter-current');if(list&&row)list.scrollTop+=row.getBoundingClientRect().top-list.getBoundingClientRect().top;return;}
if(a==='listenpick'){playerCatalogOpen=false;chapterId=x;page='listen';render();await playCurrentChapter(bookId,x);return;}
if(a==='openepisodes'){episodeModalOpen=true;render();return;}
if(a==='dropdown'){openDropdown=x;render();return;}
if(a==='closedropdown'){openDropdown=null;render();return;}
if(a==='pickopt'){if(openDropdown==='llmProtocol')configDirty=true;const pi=x.indexOf('|');const pid=x.slice(0,pi),pval=x.slice(pi+1);dropdownSel[pid]=pval;openDropdown=null;if(importDraft&&page==='splitpreview'&&pid==='splitRule'&&importDraft.ruleId!==pval){importDraft.ruleId=pval;markImportRuleDirty();}render();return;}
if(a==='resplit'){if(!importDraft||importDraft.probing||importDraft.importing)return;BajiaoImport.splitDraft(importDraft,Bajiao.splitChapters);importDraft.probeNote='';render();return;}
if(a==='splitprobe'){if(!configured.llmConfigured)return;await probeImport();return;}
if(a==='importllm'){if(importDraft){importDraft.configuring=true;go('llm');}return;}
if(a==='confirmsplit'){
  if(!BajiaoImport.canImport(importDraft))return;
  const draft=importDraft;draft.importing=true;render();
  try{
    const b=await engine.addBook(draft.name,draft.text,{ruleId:draft.ruleId,customPattern:draft.customPattern});
    bookId=b.id;chapterId=b.chapters[0].id;chapterPage=0;selected=[];multi=false;importDraft=null;delete dropdownSel.splitRule;
    history=history.filter(entry=>entry.page!=='splitpreview');page='shelf';go('detail');
  }catch(error){draft.importing=false;draft.error='保存导入结果失败：'+cleanErr(error.message||error);render();}
  return;
}
if(a==='cancelsplit'){if(!importDraft?.importing)leaveImport();return;}
if(a==='speedmodal'){resetModalFlags();speedModalOpen=true;render();return;}
if(a==='closespeed'){speedModalOpen=false;render();return;}
if(a==='autoproducesettings'){resetModalFlags();listenSettingsOpen='produce';render();return;}
if(a==='listensettings'){resetModalFlags();listenSettingsOpen='release';render();return;}
if(a==='closesettings'){listenSettingsOpen=false;render();return;}
if(a==='setkeepcount'){const n=Math.max(0,Math.min(3,parseInt(x,10)));if(!isNaN(n)){engine.state.settings.keepRecentCount=n;await engine.persist();}render();return;}
if(a==='setproducecount'){const n=Math.min(3,Math.max(1,parseInt(x,10)));if(!isNaN(n)){engine.state.settings.autoProduceCount=n;await engine.persist();}render();return;}
if(a==='editbookinfo'){resetModalFlags();pendingCoverColor=null;bookInfoOpen=true;render();return;}
if(a==='closebookinfo'){bookInfoOpen=false;render();return;}
if(a==='pickcover'){
  if(!/^#[a-f0-9]{6}$/i.test(x))return;
  pendingCoverColor=x;
  document.querySelectorAll('#bookInfoDialog .vc-cover-opt').forEach(el=>{const on=el.dataset.act==='pickcover:'+x;el.classList.toggle('is-on',on);el.setAttribute('aria-checked',String(on));});
  return;
}
if(a==='savebookinfo'){
  const bi=bookInfoTarget();if(!bi)return;
  const nameInput=document.getElementById('biName'),authorInput=document.getElementById('biAuthor');
  const nextName=(nameInput?.value||'').trim(),nextAuthor=(authorInput?.value||'').trim();
  if(!nextName){toast('书名不能为空');nameInput?.focus();return;}
  const dup=engine.state.books.find(b=>b.id!==bi.id&&b.name===nextName);
  if(dup){toast('书架里已有同名书籍');nameInput?.focus();return;}
  if(pendingCoverColor)bi.coverColor=pendingCoverColor;
  bi.name=nextName;bi.author=nextAuthor;bi.sourceFile=bi.sourceFile||nextName;
  await engine.persist();bookInfoOpen=false;render();toast('书籍信息已更新');return;
}
if(a==='closeepisodes'){episodeModalOpen=false;render();return;}
if(a==='setchpage'){chapterPage=Number(x)||0;catalogRequestId=book().chapters[chapterPage*50]?.id;episodeModalOpen=false;render();return;}
if(a==='fillroleprofiles'){loadRoleProfiles(true);return;}
if(a==='analyze'){await busy(()=>engine.analyze(bookId,chapterId),'正在实际调用语言模型，识别角色…');return;}
if(a==='makeone'){selected=[chapterId];go('make');return;}
if(a==='enqueue'){if(!configured.llmConfigured||!configured.ttsConfigured){toast('请先配置语言模型和 MiMo 密钥');go('models');return;}const ids=[...selected];go('tasks');engine.enqueue(bookId,ids).catch(e=>toast(e.message));return;}
if(a==='task'||a==='taskroles'){const t=engine.state.tasks.find(t=>t.id===x);if(!t){toast('任务不存在');return;}window.currentTask=t.id;bookId=t.bookId;chapterId=t.chapterId;pendingSeg=null;window.fromTasks=true;const cc=book().chapters.find(ch=>ch.id===t.chapterId);if(a==='task'){const prepared=await busy(()=>engine.prepareAnnotations(bookId,t.chapterId),'读取标注…');if(!prepared)return;pendingSeg=readingIssues()[0]?.id??null;go('annotated');window.fromTasks=true;}else{if(cc&&cc.unloaded)await busy(()=>engine.ensureChapter(bookId,t.chapterId),'读取章节…');go('roles');}return;}
if(a==='pause'){await engine.pause(x);toast('将在当前请求完成后暂停');return;}
if(a==='tasktop'){await engine.moveTask(x,'top');render();return;}
if(a==='resume'){const __rt=engine.state.tasks.find(t=>t.id===x);if(__rt&&isMissingData(__rt.error||__rt.message)){bookId=__rt.bookId;chapterId=__rt.chapterId;recoveryError=__rt.message;go('recovery');return;}taskTab='active';go('tasks');engine.resume(x).catch(e=>toast(cleanErr(e.message)||String(e)));return;}
if(a==='cancel'){await engine.cancel(x);toast('任务已取消');render();return;}
if(a==='pauseall'){const active=engine.state.tasks.filter(t=>['queued','running'].includes(t.status));for(const t of active)await engine.pause(t.id);toast(active.length?`已暂停 ${active.length} 个任务，当前句子完成后停止`:'没有正在制作的任务');render();return;}
if(a==='autoconfirmall'){const result=await engine.confirmWaiting();confirmationResult=result;taskTab=result.blocked.length?'attention':'active';toast('已处理 '+result.roles+' 个角色、'+result.speakers+' 处说话人；'+result.resumed+' 个任务可继续，'+result.blocked.length+' 个仍需处理');render();return;}
if(a==='clearfinished'){const gone=engine.state.tasks.filter(t=>['done','cancelled'].includes(t.status));for(const t of gone)await engine.removeTask(t.id);toast(gone.length?`已清除 ${gone.length} 条已完成记录`:'没有可清除的记录');render();return;}
if(a==='resumeall'){const paused=engine.state.tasks.filter(t=>['paused','failed'].includes(t.status)||t.status==='running'&&t.pauseRequested).sort((a,b)=>engine.queueOrder(a,b));engine.resumeTasks(paused.map(t=>t.id)).catch(e=>toast(e.message));toast(paused.length?`已继续制作 ${paused.length} 个任务`:'没有可继续的任务');render();return;}
if(a==='listentask'){const t=engine.state.tasks.find(t=>t.id===x);if(!t)throw Error('任务不存在');bookId=t.bookId;chapterId=t.chapterId;page='listen';render();await playCurrentChapter(t.bookId,t.chapterId);return;}
if(a==='removetask'){await engine.removeTask(x);toast('已清除任务记录，音频资源保留');if(page==='task')go('tasks');else render();return;}
if(a==='remake'){const t=engine.state.tasks.find(t=>t.id===x);if(t){const bid=t.bookId,cid=t.chapterId;await engine.removeTask(x);engine.enqueue(bid,[cid]).catch(e=>toast(e.message));toast('已重新加入制作队列');go('tasks');}return;}
if(a==='importvoices'){await busy(async()=>{const files=await device.call('pick',{kind:'voice'});if(!files?.length)return;imports=files;go('voiceimport');},'选择参考样本…');return;}
if(a==='saveimports'){await busy(async()=>{for(let i=0;i<imports.length;i++){const description=value('import-'+i).trim();if(!description)throw Error('请填写所有音色描述');imports[i].description=description;imports[i].displayName=value('import-name-'+i).trim();}for(const f of imports){const v=await engine.importVoice(f);if(f.displayName)v.name=f.displayName;}await engine.persist();imports=[];go('voices');});return;}
if(a==='voicetab'){voiceTab=x;voiceBatch=false;voiceBatchIds=[];render();return;}
if(a==='voice'){voiceId=x;go('voicedetail');return;}
if(a==='savevoice'){if(!value('vdescription').trim())throw Error('请填写音色描述');voice().name=value('vname').trim()||voice().name;voice().description=Bajiao.cleanVoiceDescription(value('vdescription').trim());voice().enabled=$('#venabled').checked;await engine.saveVoice(voice());toast('音色描述与名称已保存');render();return;}
if(a==='deletevoice'){const targetId=x||voiceId;const targetVoice=engine.state.voices.find(v=>v.id===targetId);const name=targetVoice?.name||'该音色';await busy(async()=>{await engine.deleteVoice(targetId);toast(`已删除音色「${name}」`);go('voices');},'正在删除音色…');return;}
if(a==='newdesign'){candidate=null;roleName=null;designDirty=false;go('design');return;}
if(a==='designsample'){startDesignJob();return;}
if(a==='acceptsample'){if(designJob?.running)throw Error('请等待当前样本生成完成');if(designDirty)throw Error('描述或文本已修改，请重新生成样本');await busy(async()=>{if(roleName){engine.accept(bookId,roleName).catch(e=>toast(e.message));go('roles');}else{await engine.saveVoice(candidate);go('voices');}},'保存样本…');return;}
if(a==='candidate'){roleName=x;candidate=book().characters.find(r=>r.name===x).candidate;designDirty=false;go('design');return;}
if(a==='chooserole'){roleName=x;chooseTab=(book().characters.find(r=>r.name===x)?.voice||'').startsWith('preset:')?'preset':'mine';go('choose');return;}
if(a==='choosetab'){chooseTab=x;render();return;}
if(a==='choosevoice'){const r=book().characters.find(c=>c.name===roleName);if(!r)return;if(r.voice===x){toast('「'+roleName+'」正在使用该音色');render();return;}engine.bind(bookId,roleName,x).then(()=>{toast('已为「'+roleName+'」改用「'+voiceLabel(x)+'」');render();}).catch(e=>{toast(e.message);render();});return;}
if(a==='acceptsuggested'){const r=book().characters.find(r=>r.name===x);if(!r?.suggestedVoice)throw Error('没有可采用的匹配音色');engine.bind(bookId,x,r.suggestedVoice).catch(e=>toast(e.message));go('roles');return;}
if(a==='bind'){engine.bind(bookId,roleName,x).catch(e=>toast(e.message));go('roles');return;}
if(a==='trial'){const text=value('trialText');const v=voice();await runAudition('trial',async()=>{const file=await engine.synthesize(text,v.id);v.tested=true;v.lastTrial=file.id;await engine.persist();return file;},'音色试音');return;}
if(a==='preset'){await runAudition('preset:'+x,()=>engine.presetPreview(x),'MiMo · '+x);return;}
if(a==='trialvoice'){const v=engine.state.voices.find(v=>v.id===x);if(!v){toast('音色不存在');return;}if(!v.sample){toast('该音色缺少参考样本，请重新导入或设计音色');return;}await startPreview(v.sample,'试听 · '+v.name);return;}
if(a==='play'){const cardName=el.closest('.vc-voice-card')?.querySelector('h3')?.textContent;const v=engine.state.voices.find(v=>v.sample===x);const r=bookId?engine.state.books.find(b=>b.id===bookId)?.characters.find(r=>r.candidate?.sample===x):null;await startPreview(x,(cardName||v?.name||r?.name||'音频')+' · 试听');return;}
if(a==='repacecur'){if(chapter().pacingVersion===1){toast('本章已按当前规则优化停顿');return;}taskTab='active';engine.optimizePauses(bookId,chapterId).catch(e=>toast(e.message));toast('已开始优化句末停顿');go('tasks');return;}
if(a==='playchapter'){const ch=chapter(),p=await device.call('playbackState');if(playingBookId===bookId&&playingChapterId===chapterId&&p.id===playingId&&(streamState||waitingForNextChapterId)){await togglePlayback(p);return;}if(!ch?.audio){await playCurrentChapter();return;}if(p.id!==ch.audio)await playCurrentChapter();else{if(!p.playing){await engine.calibrateDurations(bookId,chapterId);syncDisplayedPlayback(p,true);}await togglePlayback(p);}syncDisplayedPlayback(await device.call('playbackState'));return;}
if(a==='qualitypending'){const s=chapter().segments.find(s=>s.qualityStatus==='pending'&&!s.audio);if(s){pendingSeg=s.id;render();}return;}
if(a==='confirmrepetition'){try{await engine.regenerateSegment(bookId,chapterId,x,{acceptRepeated:true});if(segmentPanel)segmentPanel.result='已确认保留原始返回。';render();}catch(e){toast(e.message);}return;}
if(a==='resetsegprompt'){const s=chapter().segments.find(s=>String(s.id)===String(x)),role=book().characters.find(r=>r.name===s?.speaker),field=document.getElementById('ttsPrompt-'+x);if(field&&!engine.segmentBusy(bookId,chapterId,x)){field.value=engine.speechDirection(role?.voice,s.emotion,role?.description,undefined,s);segmentPromptDrafts.set(segmentAdvancedKey(book(),chapter(),s),field.value);syncSegmentPromptDraft();toast('已使用标注指导，合成后生效');}return;}
if(a==='regenerateseg'||a==='regenerateprompt'){const bid=bookId,cid=chapterId,target=chapter().segments.find(s=>String(s.id)===String(x)),panel=segmentPanel;if(!target||engine.segmentBusy(bid,cid,x)||target.skip||target.isAd||target.audio==='skip'||!book().characters.find(r=>r.name===target.speaker)?.voice)return;if(panel)panel.result='';let options={};if(a==='regenerateprompt'){const s=chapter().segments.find(s=>String(s.id)===String(x)),role=book().characters.find(r=>r.name===s?.speaker),prompt=value('ttsPrompt-'+x);options.prompt=prompt===engine.speechDirection(role?.voice,s.emotion,role?.description,undefined,s)?null:prompt;}const promise=engine.regenerateSegment(bid,cid,x,options);render();promise.then(ok=>{if(ok){toast('此句已重新合成');if(panel)panel.result='合成完成，已更新本句音频。';}}).catch(e=>{toast(e.message);if(panel)panel.result='合成失败：'+cleanErr(e)+'。可重试，原音频保留。';}).finally(()=>render());return;}
if(a==='globalpolicy'){for(const k of['segSpeaker','policyMode','retries','speakerThreshold','taskParallel','ttsParallel','llmProtocol'])delete dropdownSel[k];openDropdown=null;go('policy');bookId=null;render();return;}
if(a==='savepolicy'){const __pst=engine.state.settings;const p={mode:dropdownSel.policyMode||__pst.mode||'manual',usePresets:$('#usePresets').checked};engine.state.settings.retries=Number(dropdownSel.retries!==undefined?dropdownSel.retries:engine.state.settings.retries);const __thr=Number(dropdownSel.speakerThreshold);engine.state.settings.speakerThreshold=(dropdownSel.speakerThreshold===undefined)?(Number(__pst.speakerThreshold)>=0&&Number(__pst.speakerThreshold)<=1?Number(__pst.speakerThreshold):0.5):((__thr>=0&&__thr<=1)?__thr:0.5);const __tp=Number(dropdownSel.taskParallel);engine.state.settings.taskParallel=(dropdownSel.taskParallel===undefined)?([1,2,3].includes(Number(__pst.taskParallel))?Number(__pst.taskParallel):1):([1,2,3].includes(__tp)?__tp:1);const __np=Number(dropdownSel.ttsParallel);engine.state.settings.ttsParallel=(dropdownSel.ttsParallel===undefined)?([1,2,3,4].includes(Number(__pst.ttsParallel))?Number(__pst.ttsParallel):2):([1,2,3,4].includes(__np)?__np:2);if(dropdownSel.splitRule!==undefined)engine.state.settings.splitRule=dropdownSel.splitRule;engine.state.settings.splitCustom=$('#splitCustom')?value('splitCustom'):engine.state.settings.splitCustom||'';Object.assign(engine.state.settings,p);await engine.persist();toast('策略已保存');return;}
if(a==='savellm'){await saveLLMForm();toast('配置已保存');render();return;}
if(a==='savemimo'){await saveTTSForm();toast('密钥已保存');render();return;}
if(a==='testllm'){await busy(async()=>{await saveLLMForm();const config={base:engine.state.settings.llmBase,model:engine.state.settings.llmModel,protocol:engine.state.settings.llmProtocol};try{const result=await engine.llm('只输出 JSON：{"ok":true}');if(result.ok!==true)throw Error('模型测试返回格式不符合预期');connectionResult={...config,ok:true,at:Date.now()};toast('当前配置调用成功');}catch(e){connectionResult={...config,ok:false,error:e.message||String(e),at:Date.now()};throw e;}},'保存当前配置并实际测试…');return;}
if(a==='testmimo'){await busy(async()=>{await saveTTSForm();try{const f=await engine.synthesize('连接成功，现在可以开始制作有声书。','preset:白桦');ttsConnectionResult={ok:true,at:Date.now()};await startPreview(f.id,'MiMo 连接测试');}catch(e){ttsConnectionResult={ok:false,error:cleanErr(e),at:Date.now()};throw e;}},'保存当前密钥并实际合成…');return;}

if(a==='editseg'){editorReturn={bookId,chapterId,segmentId:Number(x),scroll:window.scrollY};editSegment=Number(x);delete dropdownSel.segSpeaker;openDropdown=null;go('editseg');return;}
if(a==='saveseg'){const seg=chapter().segments.find(s=>s.id===editSegment);await engine.correct(bookId,chapterId,editSegment,dropdownSel.segSpeaker||seg.speaker,seg.emotion);page='annotated';render();restoreEditorPosition();toast('角色已替换；本段待重新合成');return;}
if(a==='addrole'){const name=value('newRole').trim(),description=value('newRoleDescription').trim();if(!name||!description)throw Error('请填写姓名和音色描述');if(book().characters.some(r=>r.name===name))throw Error('角色已存在');book().characters.push({name,description:Bajiao.cleanVoiceDescription(description),aliases:[],voice:null});await engine.persist();dropdownSel.segSpeaker=name;render();toast('已添加并选中「'+name+'」');return;}
}catch(e){toast(cleanErr(e));}}
$('#screen').addEventListener('click',e=>{const el=e.target.closest('[data-act]');if(e.target.closest('.vc-error-detail')&&el?.classList.contains('vc-card-clickable'))return;if(e.target.closest('[data-task-drag]'))return;if(el)handleAction(el,e);});
$('#screen').addEventListener('toggle',e=>{if(e.target.hasAttribute('data-advanced-seg')&&e.target.isConnected&&page==='annotated'){const key=JSON.stringify([bookId,chapterId,e.target.dataset.advancedSeg]);if(e.target.open)segmentAdvancedOpen.add(key);else segmentAdvancedOpen.delete(key);}if(e.target.id==='import-catalog'&&importDraft)importDraft.catalogOpen=e.target.open;if(e.target.id==='import-manual'&&e.target.isConnected&&importDraft&&page==='splitpreview')importDraft.manualOpen=e.target.open;},true);
$('#screen').addEventListener('change',e=>{if(e.target.id==='chapterSelectionRange'){const action=e.target.value;if(page!=='detail'||!multi||!action)return;handleAction({dataset:{act:action}},e);return;}if(e.target.dataset.shelfcheck){const id=e.target.dataset.shelfcheck;shelfSelected=e.target.checked?[...new Set([...shelfSelected,id])]:shelfSelected.filter(x=>x!==id);render();return;}if(e.target.dataset.check){const id=e.target.dataset.check;selected=e.target.checked?[...new Set([...selected,id])]:selected.filter(x=>x!==id);render();}if(e.target.id==='speedRange'){applySpeed(parseFloat(e.target.value));return;}if(e.target.id==='seek'){seekDragging=true;seekCommitting=true;seekDisplayedChapter('seek',Number(e.target.value)).catch(e=>toast(e.message)).finally(()=>{seekCommitting=false;finishSeekGesture();});}});
$('#screen').addEventListener('input',e=>{if(e.target.id==='seek'){seekDragging=true;syncSeekDisplay(Number(e.target.value),Number(e.target.max));}if(e.target.id==='splitCustom'&&page==='splitpreview'&&importDraft){importDraft.customPattern=e.target.value;markImportRuleDirty();}if(e.target.id==='speedRange')syncSpeedUI(parseFloat(e.target.value),true);if((candidate||designJob?.running)&&['designDescription','designText'].includes(e.target.id)){designDirty=true;const button=$('[data-act="acceptsample"]');if(button){button.disabled=true;button.textContent='内容已修改，请重新生成样本';}}});
for(const eventName of ['wheel','touchstart','touchmove','touchend','touchcancel','pointerdown','pointermove','pointerup','keydown'])$('#screen').addEventListener(eventName,event=>{
 if(event.target.closest?.('#transcriptPanel')&&(eventName!=='pointermove'||event.buttons))listenUserHoldUntil=Date.now()+5000;
 if(event.target.id==='seek'&&['pointerdown','touchstart'].includes(eventName))seekDragging=true;
},{passive:true});
window.addEventListener('pointerup',()=>{if(seekDragging)setTimeout(()=>{if(seekDragging&&!document.querySelector('#seek:active'))finishSeekGesture();},0);});
window.addEventListener('pointercancel',finishSeekGesture);
window.addEventListener('blur',()=>{if(seekDragging)finishSeekGesture();});
let __slimLastY=0,__slimContext='',__slimOffset=0;
window.addEventListener('scroll',event=>{try{
 if(event.target!==document&&event.target!==window)return;
 if(!['raw','annotated','listen'].includes(page)||hasModal())return;
 const top=document.querySelector('.vc-slim-top');if(!top)return;
 const y=Math.max(0,window.scrollY||document.documentElement.scrollTop||0);
 const context=page+'|'+bookId+'|'+chapterId;
 if(context!==__slimContext){__slimContext=context;__slimLastY=0;__slimOffset=0;}
 const dy=y-__slimLastY;__slimLastY=y;
 if(page==='listen'){if(y<40)top.classList.remove('vc-collapsed');else if(dy>6)top.classList.add('vc-collapsed');else if(dy<-6)top.classList.remove('vc-collapsed');return;}
 const height=top.offsetHeight;
 __slimOffset=y<16?0:Math.max(0,Math.min(height,__slimOffset+dy));
 document.getElementById('app').style.setProperty('--reader-header-offset',-__slimOffset+'px');
 top.inert=__slimOffset>=height;
}catch(e){}},{passive:true});
let playbackPollBusy=false,lastPlaybackPollAt=0,lastProgressSavedAt=0;
setInterval(async()=>{
  if(playbackPollBusy||Date.now()-lastPlaybackPollAt<(page==='listen'?90:950))return;
  playbackPollBusy=true;lastPlaybackPollAt=Date.now();
  try{
    const revision=playbackRevision;
    const p=await device.call('playbackState');
    if(revision!==playbackRevision)return;
    miniPlayingState=p;updatePreview(p);updateSleep(p);
    if(p?.playing&&Date.now()-lastProgressSavedAt>=1000){
      lastProgressSavedAt=Date.now();saveCurrentPlayback(p).catch(()=>{});
    }
    if(page==='listen'){
      syncDisplayedPlayback(p);
    }else{
      const miniProgress=$('.vc-mini-progress-bar');
      if(miniProgress&&playingBookId&&playingChapterId){
        const b=engine?.state.books.find(b=>b.id===playingBookId);
        const c=b?.chapters.find(c=>c.id===playingChapterId);
        const isStream = isChapterStreaming(c);
        let pct = 0;
        if(isStream){
          const tot = chapterSentenceCount(c);
          const segs = c?.segments || [];
          const curIdx = streamState ? segs.findIndex(s => s.id === streamState.segId) : (c?.playbackCompleted ? tot : (c?.playbackResume?.segmentId >= 0 ? segs.findIndex(s => s.id === c.playbackResume.segmentId) : 0));
          const played = curIdx >= 0 ? curIdx : 0;
          pct = tot > 0 ? Math.min(100, (played / tot) * 100) : 0;
        }else{
          const dur=(c?.duration||0)*1000;
          pct=dur>0?Math.min(100,(p.position/dur)*100):0;
        }
        miniProgress.style.width=pct+'%';
      }
      const miniBtn=$('[data-act="miniplaypause"]');
      if(miniBtn){
        const isPlay=playbackIsActive(p);
        miniBtn.title=isPlay?'暂停':'播放';
        miniBtn.setAttribute('aria-label',isPlay?'暂停':'播放');
        miniBtn.innerHTML=I(isPlay?'pause':'play');
        lucide.createIcons({attrs:{width:20,height:20}});
      }
    }
  }catch(ignored){}finally{playbackPollBusy=false;}
},100);
let productionPlaybackBusy=false;
async function continueProductionPlayback(){
  // 只在当前句已播完且等待新内容时续播；合并完成不能抢占正在播放的句子。
  if(productionPlaybackBusy||productionPlaybackSession.paused)return;
  productionPlaybackBusy=true;
  const session=productionPlaybackSession;
  try{
    if(streamState){
      const sb=engine.state.books.find(b=>b.id===streamState.bid),sc=sb?.chapters.find(c=>c.id===streamState.cid);
      if(streamState.waiting&&!streamState.autoResumePaused){
        const pre=streamPrefix(sc||{segments:[]});
        if(sc?.audio||pre.findIndex(s=>s.id===streamState.segId)+1<pre.length){await window.onNativePlaybackAction('completion',0,streamState.audioId);}
        else if(page==='listen'&&bookId===streamState.bid&&chapterId===streamState.cid)render();
      }
    }
    if(session!==productionPlaybackSession||session.paused)return;
    if(waitingForNextChapterId&&!waitingForNextChapterPaused){
      const targetTask=engine.state.tasks.find(t=>t.bookId===playingBookId&&t.chapterId===waitingForNextChapterId);
      if(targetTask?.status==='done'){
        const tBookId=targetTask.bookId,tChapId=targetTask.chapterId;
        if(page==='listen'&&bookId===tBookId)await engine.ensureChapter(tBookId,tChapId);
        if(session!==productionPlaybackSession||session.paused||waitingForNextChapterId!==tChapId)return;
        toast('下一章制作完成，自动开始播放！');
        if(page==='listen'&&bookId===tBookId){chapterId=tChapId;render();}
        await playCurrentChapter(tBookId,tChapId,null,{continueSession:true});
      }else if(targetTask?.status==='failed'){
        waitingForNextChapterId=null;
        playbackPrompts?.cancel();setProductionWaitPaused(true);
        await device.call('playback',{op:'pause'});
        toast('下一章制作失败，已停止自动播放');
      }
    }
  }catch(e){}finally{productionPlaybackBusy=false;}
}
device.call('load').then(result=>{configured=result;engine=new Bajiao.Engine(device,result.state);engine.restorePlaybackCheckpoint(result.playbackCheckpoint);window.bajiaoEngine=engine;queueMicrotask(()=>engine.refreshProductionNetwork().catch(()=>{}));window.renderApp=render;playbackPrompts=new BajiaoPlaybackPrompts.Controller({engine,call:(...args)=>device.call(...args),canSynthesize:()=>!!configured.ttsConfigured,isCurrent:item=>playingBookId===item.bid&&playingChapterId===item.cid&&playingId===item.audioId&&(item.kind==='waiting'?(!!streamState?.waiting&&!streamState.autoResumePaused||!!waitingForNextChapterId&&!waitingForNextChapterPaused):!streamState&&!waitingForNextChapterId&&engine.state.books.find(b=>b.id===item.bid)?.chapters.at(-1)?.id===item.cid)});window.__applyInitialNav=(nav)=>{try{if(nav!=='tasks_attention'||!engine)return;const hasPend=engine.state.tasks.some(t=>t.status==='waiting'||t.status==='failed');taskTab=engine.state.tasks.some(t=>t.status==='waiting')?'attention':engine.state.tasks.some(t=>t.status==='failed')?'failed':'active';if(page==='tasks')render();else go('tasks');}catch(__e){}};if(result&&result.initialNav)window.__applyInitialNav(result.initialNav);const lastStatus=new Map(engine.state.tasks.map(t=>[t.id,t.status]));
// 恢复中断与网络重试的检查点，用户暂停保持不变。
engine.recoverProduction().catch(()=>{});

engine.onChange(()=>{
  playbackPrompts?.reconcile();
  syncProductionStatus().catch(()=>{});
  continueProductionPlayback();
  for(const t of engine.state.tasks){if(['failed','waiting'].includes(t.status)&&lastStatus.get(t.id)!==t.status){const isFail=t.status==='failed';let bName='书籍',cTitle='';try{bName=engine.book(t.bookId)?.name||'书籍';}catch(e){}try{cTitle=engine.chapter(t.bookId,t.chapterId)?.title||'';}catch(e){}if(isFail&&page==='tasks'&&taskTab==='active')taskTab='failed';const title=isFail?'芭蕉 · 制作失败':'芭蕉 · 制作待确认';const msg=bName+' · '+cTitle+'：'+(t.message||(isFail?'遇到问题':'需要处理确认'));toast(cleanErr(t.message)||title);device.call('notify',{channel:'production',title,message:cleanErr(msg),type:isFail?'error':'info'}).catch(()=>{});}lastStatus.set(t.id,t.status);}if(page==='listen'){try{if(renderedListenSignature!==listenSignature())render();refreshListenNav();}catch(e){}}
else if(!['llm','mimo','design','voicedetail','editseg','voiceimport','policy','voicepolicy','productionpolicy','importpolicy','quality'].includes(page)){try{render();}catch(err){page='shelf';try{render();}catch(e2){toast(err.message||'页面渲染失败');}}}});try{render();}catch(err){page='shelf';try{render();}catch(e2){toast(err.message||'页面渲染失败');}}}).catch(e=>{$('#screen').innerHTML=`<main class="vc-main"><h1>无法读取书库</h1><p>${E(e.message)}</p><p style="margin-top:12px"><button class="vc-btn primary" data-act="reload">重新加载</button></p></main>`;});
})();





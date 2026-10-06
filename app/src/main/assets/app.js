(()=>{'use strict';
let engine,configured={},page='shelf',bookId=null,chapterId=null,voiceId=null,roleName=null,selected=[],multi=false,voiceTab='mine',taskTab='active',candidate=null,imports=[],editSegment=null,pendingSeg=null,history=[],playingId=null,playingBookId=null,playingChapterId=null,designDirty=false,chapterPage=0,episodeModalOpen=false,deleteConfirmBookId=null,batchModalBookId=null,openDropdown=null,dropdownSel={},speedModalOpen=false,listenSettingsOpen=false,stopAfterChapter=false,storageStats=null,miniPlayingState=null,lastSeekTime=0,lastSeekPos=0,lastActiveStart='',listenUserHoldUntil=0,listenProgScrollUntil=0;
const $=s=>document.querySelector(s),E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),I=n=>`<i data-lucide="${n}" aria-hidden="true"></i>`;
const B=(text,act,secondary=false,disabled=false)=>`<button class="vc-btn ${secondary?'secondary':''}" data-act="${E(act)}" ${disabled?'disabled':''}>${text}</button>`,L=(text,act)=>`<button class="vc-link" data-act="${E(act)}">${text}</button>`,T=(text,w=false)=>{const extraCls=w==='listened'?'vc-status-badge listened':w==='cleared'?'vc-status-badge cleared':'';const cls=w==='warn'||w===true?'warn':w==='running'?'running':'';return `<span class="vc-tag ${cls} ${extraCls}">${E(text)}</span>`;};
const title=(k,t,right='')=>`<div class="vc-top"><div><div class="vc-kicker">${k}</div><h1>${t}</h1></div>${right}</div>`;
const top=t=>`<div class="vc-top"><button class="vc-icon" data-act="back" aria-label="返回">${I('arrow-left')}</button><h2 class="vc-marquee"><span>${E(t)}</span></h2><span style="width:44px"></span></div>`;
const menu=(icon,text,sub,act)=>`<button class="vc-menu" data-act="${act}">${I(icon)}<span>${text}<br><small>${sub}</small></span>${I('chevron-right')}</button>`;
const field=(label,id,value,type='text')=>`<label class="vc-field">${label}<input id="${id}" type="${type}" value="${E(value)}" ${type==='password'?'autocomplete="off" placeholder="留空保留已保存密钥"':''}></label>`;
const area=(label,id,value)=>`<label class="vc-field">${label}<textarea class="vc-form" id="${id}">${E(value)}</textarea></label>`;
const cover=(name,cls='')=>`<div class="vc-cover ${cls}"><small>VOCAST / AUDIOBOOK</small><b>${E(name.slice(0,12))}</b><small>让故事有声</small></div>`;
const dd=(id,label,options,current)=>{const cur=dropdownSel[id]!==undefined?dropdownSel[id]:current;const txt=((options.find(o=>String(o[0])===String(cur)))||[null,cur])[1];return `<div class="vc-field"><span class="vc-field-label">${label}</span><button class="vc-dropdown" data-act="dropdown:${id}"><span>${E(txt)}</span>${I('chevron-down')}</button></div>`;};
const book=()=>engine.book(bookId),chapter=()=>engine.chapter(bookId,chapterId),voice=()=>engine.state.voices.find(v=>v.id===voiceId);
const voiceName=id=>id?.startsWith('preset:')?'MiMo · '+id.slice(7):engine.state.voices.find(v=>v.id===id)?.name||'尚未分配';
const textLen=c=>c.unloaded?(c.textLength||0):(typeof c.text==='string'?c.text.length:(c.textLength||0));
const segCount=c=>c.unloaded?(c.segmentCount||0):(Array.isArray(c.segments)?c.segments.length:(c.segmentCount||0));
const pendingConfirm=()=>{if(!engine)return 0;return engine.state.tasks.filter(t=>t.status==='waiting'||t.status==='failed').length;};
const cleanErr=s=>String(s||'').replace(/\/data\/[^:\s]*/g,'[应用数据文件]').replace(/[\w.-]+\.json:\s*open failed:\s*/gi,'').replace(/open failed:\s*ENOENT\s*(\([^)]*\))?/gi,'文件缺失').replace(/ENOENT\s*(\([^)]*\))?/gi,'文件缺失').trim();
const isMissingData=s=>/文本缺失|数据文件缺失|文件缺失|索引损坏|索引不匹配|重新导入|ENOENT|open failed|\/data\//i.test(String(s||''));
const fmt=seconds=>Math.floor(seconds/60).toString().padStart(2,'0')+':'+Math.floor(seconds%60).toString().padStart(2,'0');
const status=t=>({queued:'排队中',running:'制作中',paused:'已暂停',waiting:'待确认',failed:'失败',done:'已完成',cancelled:'已取消'}[t]||t);
function toast(message){const t=$('#toast');if(!t)return;clearTimeout(toast.timer);clearTimeout(hideToast._t);t.classList.remove('vc-toast-hide');t.textContent=message;toast.timer=setTimeout(()=>hideToast(),5000);}
function hideToast(){const t=$('#toast');if(!t||!t.textContent)return;clearTimeout(toast.timer);t.classList.add('vc-toast-hide');clearTimeout(hideToast._t);hideToast._t=setTimeout(()=>{t.textContent='';t.classList.remove('vc-toast-hide');},380);}
document.addEventListener('click',()=>{try{hideToast();}catch(e){}},true);
async function busy(fn,label='正在处理…'){if(!$('#busy').hidden)return;$('#busy').hidden=false;$('#busy div').textContent=label;try{return await fn();}catch(e){toast(e.message||String(e));}finally{$('#busy').hidden=true;render();}}
function go(p){const open=()=>{const isTabSwitch=['raw','annotated','listen'].includes(page)&&['raw','annotated','listen'].includes(p);if(!isTabSwitch){history.push({page,bookId,chapterId,voiceId,roleName});}page=p;render();window.scrollTo(0,0);};if(['raw','annotated','listen','editseg','task'].includes(p)&&chapter().unloaded){busy(async()=>{await engine.ensureChapter(bookId,chapterId);open();},'读取章节…');}else open();}
function getChapterTarget(c){if(!c)return 'raw';if(c.audio){return 'listen';}const hasAnnotation=c.unloaded?((c.segmentCount||0)>0):(c.segments&&c.segments.length>0);if(hasAnnotation||c.status==='annotated'||c.status==='waiting'){return 'annotated';}return 'raw';}
window.appBack=()=>{if(['raw','annotated','listen','editseg'].includes(page)){while(history.length&&['raw','annotated','listen','editseg'].includes(history[history.length-1].page)){history.pop();}if(history.length&&history[history.length-1].page==='detail'&&history[history.length-1].bookId===bookId){const previous=history.pop();({page,bookId,chapterId,voiceId,roleName}=previous);}else{page='detail';}render();window.scrollTo(0,0);return;}const previous=history.pop();if(previous){({page,bookId,chapterId,voiceId,roleName}=previous);}else page='shelf';render();window.scrollTo(0,0);};
let lastProdStatus = null;
let waitingForNextChapterId = null;
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
        engine.enqueue(b.id, [upcoming.id]).catch(e => { console.warn("Auto enqueue failed", e); });
      }
    }
  }
}
async function syncProductionStatus(){
  if(!engine || !window.device?.productionStatus) return;
  const activeTasks = engine.state.tasks.filter(t => t.status === "running" || t.status === "queued");
  if(activeTasks.length > 0){
    const running = activeTasks.find(t => t.status === "running") || activeTasks[0];
    const b = engine.state.books.find(x => x.id === running.bookId);
    const c = b?.chapters.find(x => x.id === running.chapterId);
    const totalSegs = c?.segments?.length || 0;
    const doneSegs = c?.segments?.filter(s => s.audio).length || 0;
    const queuedCount = activeTasks.length - 1;
    const title = b ? "后台制作中 · " + b.name : "Vocast 正在后台制作";
    const queueText = queuedCount > 0 ? " (后排队 " + queuedCount + " 章)" : "";
    const message = c ? c.title + " (" + doneSegs + "/" + (totalSegs || "...") + ")" + queueText : "正在合成有声书章节...";
    const key = running.id + ":" + doneSegs + "/" + totalSegs + ":" + queuedCount;
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
window.appBackground = () => { if(engine){ engine.persist().catch(()=>{}); syncProductionStatus().catch(()=>{}); } };
function nav(){const pend=pendingConfirm();return `<nav class="vc-nav" aria-label="主导航">${[['shelf','library','书架'],['voices','audio-lines','音色'],['tasks','list-checks','制作'],['settings','user-round','我的']].map(([p,i,t])=>`<button class="${page===p?'active':''}" data-act="go:${p}">${I(i)}${t}${p==='tasks'&&pend>0?`<span class="vc-nav-badge">${pend>99?'99+':pend}</span>`:''}</button>`).join('')}</nav>`;}
function modebar(){return `<nav class="vc-nav vc-modebar" aria-label="阅读模式">${[['raw','原文'],['annotated','标注'],['listen','听书']].map(([p,n])=>`<button class="${page===p?'active':''}" data-act="go:${p}">${n}</button>`).join('')}</nav>`;}
function fitMarquee(){try{document.querySelectorAll('.vc-marquee').forEach(el=>{const over=el.scrollWidth>el.clientWidth+4;el.classList.toggle('scroll',over);if(over)el.style.setProperty('--mq',(-(el.scrollWidth-el.clientWidth))+'px');});}catch(e){}}
function render(){if(!engine)return;const state=engine.state;let h='';
switch(page){
case 'shelf':{let resumeBanner='';if(engine?.state?.lastPlayback){const lp=engine.state.lastPlayback;const rb=engine.state.books.find(b=>b.id===lp.bookId);const rc=rb?.chapters.find(c=>c.id===lp.chapterId&&c.audio);if(rb&&rc){resumeBanner=`<div class="vc-resume-banner"><div class="vc-resume-info"><small>上次听至 · ${E(rb.name)}</small><strong>${E(rc.title)}</strong></div><button class="vc-btn primary" data-act="resumebook:${rb.id}:${rc.id}">${I('play')} 继续收听</button></div>`;}}h=title('VOCAST · 让故事有声','我的书架',B(I('plus'),'importbook',true))+(!configured.llmConfigured||!configured.ttsConfigured?`<div class="vc-note">开始制作前，先配置语言模型与 MiMo TTS。${L('配置模型 →','go:models')}</div>`:'')+resumeBanner+(state.books.length?`<div class="vc-covers">${state.books.map(b=>`<button class="vc-book" data-act="book:${b.id}">${cover(b.name)}<h3>${E(b.name)}</h3><small>${b.chapters.length} 章 · ${b.chapters.filter(c=>c.audio).length} 章可听</small></button>`).join('')}</div>`:`<div class="empty">${I('book-open')}<h3>你的第一本有声书</h3><p class="vc-sub">导入 TXT / EPUB，或先体验示例小说。</p>${B('导入小说','importbook')}<p>${L('添加示例文本','samplebook')}</p></div>`)+menu('audio-lines','你的声音档案','导入或设计音色，多本小说复用','go:voices');break;}
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
  const totalPages=Math.ceil(totalChapters/50)||1;
  if(chapterPage>=totalPages)chapterPage=0;
  const pageStart=chapterPage*50;
  const pageEnd=Math.min(pageStart+50,totalChapters);
  const currentChapters=b.chapters.slice(pageStart,pageEnd);
  const pendingRoles=b.characters.filter(r=>r.name!=='旁白'&&r.name!=='广告'&&!r.voice).length;

  const headingHtml = multi ? `
    <div class="vc-batch-header">
      <div class="vc-batch-left">
        <h3>批量选择</h3>
      </div>
      <div class="vc-batch-right">
        <button class="vc-btn primary vc-top-make-btn" data-act="go:make" ${!selected.length?'disabled':''}>制作所选（${selected.length}）</button>
        <button class="vc-btn danger" data-act="resetchapters" ${!selected.length?'disabled':''}>删除所选（${selected.length}）</button>
        ${L('完成','multiselect')}
      </div>
    </div>
    <div class="vc-batch-toolbar">
      <div class="vc-batch-tools">
        ${L('全选本页','selectpage')}
        ${L('全选整书','selectall')}
        ${L('全选未完成','selectunfinished')}
        ${L('清空','selectnone')}
      </div>
      ${totalPages>1?`<button class="vc-btn-sub" data-act="openepisodes">选集 ${pageStart+1}-${pageEnd} ▾</button>`:''}
    </div>
  ` : `
    <div class="vc-list-heading">
      <div class="vc-chapter-title-wrap">
        <h3>章节目录</h3>
        <small class="vc-sub-count">共 ${totalChapters} 章</small>
      </div>
      <div class="vc-heading-actions">
        ${totalPages>1?`<button class="vc-btn-sub" data-act="openepisodes">选集 ${pageStart+1}-${pageEnd} ▾</button>`:''}
        ${L('编辑','multiselect')}
      </div>
    </div>
  `;

  const episodeModalHtml = episodeModalOpen ? `
    <div class="vc-modal-overlay" data-act="closeepisodes">
      <div class="vc-modal-content" onclick="event.stopPropagation()">
        <div class="vc-modal-header">
          <h3>选择集数</h3>
          <button class="vc-icon" data-act="closeepisodes" aria-label="关闭">${I('x')}</button>
        </div>
        <p class="vc-sub">共 ${totalChapters} 章 · 每组 50 章</p>
        <div class="vc-episode-grid">
          ${Array.from({length:totalPages},(_,idx)=>{
            const s=idx*50+1;
            const e=Math.min((idx+1)*50,totalChapters);
            return `<button class="vc-episode-btn ${idx===chapterPage?'active':''}" data-act="setchpage:${idx}">${s}-${e}</button>`;
          }).join('')}
        </div>
      </div>
    </div>
  ` : '';

  let resumeChapBanner='';if(b.chapters.some(c=>c.audio)){const lp=engine.state.lastPlayback?.bookId===b.id?engine.state.lastPlayback:null;const rc=lp?b.chapters.find(c=>c.id===lp.chapterId&&c.audio):b.chapters.find(c=>c.audio&&c.playbackProgress?.position>0);if(rc){const posSec=Math.round((rc.playbackProgress?.position||lp?.position||0)/1000);resumeChapBanner=`<div class="vc-resume-banner"><div class="vc-resume-info"><small>上次收听进度</small><strong>${E(rc.title)} · 已收听 ${posSec}秒</strong></div><button class="vc-btn primary" data-act="resumechapter:${rc.id}">${I('play')} 继续收听</button></div>`;}}
  h=top('书籍详情')+resumeChapBanner+`
    <div class="vc-row">${cover(b.name,'vc-detail-cover')}<div style="flex:1"><h3>${E(b.name)}</h3><p class="vc-sub">${totalChapters} 章</p>${T(b.chapters.filter(c=>c.audio).length+' 章已有声')}</div></div>
    <div class="vc-split vc-bottom">${B('继续阅读','read:'+b.chapters[0].id,true)}${pendingRoles?`<button class="vc-btn vc-btn-attn" data-act="go:roles">${I('alert-circle')} 确认角色音色 · ${pendingRoles}待确认</button>`:B('角色与音色','go:roles')}</div>
    ${headingHtml}
    ${currentChapters.map((c,i)=>{
      const globalIndex=pageStart+i+1;
      const activeTask=engine.state.tasks.find(t=>t.bookId===b.id&&t.chapterId===c.id&&!['done','cancelled'].includes(t.status));
      let statusLabel='未制作';
      let statusKind='normal';
      if(activeTask){
        if(activeTask.status==='running'){
          statusLabel=activeTask.phase||'制作中';
          statusKind='running';
        }else if(activeTask.status==='queued'){
          statusLabel='排队中';
          statusKind='running';
        }else if(activeTask.status==='waiting'){
          statusLabel='待确认';
          statusKind='warn';
        }else if(activeTask.status==='failed'){
          statusLabel='失败';
          statusKind='warn';
        }else if(activeTask.status==='paused'){
          statusLabel='已暂停';
        }
      }else if(c.audio){
        statusLabel='可听';
      }else if(c.status==='waiting'){
        statusLabel='待确认';
        statusKind='warn';
      }else if(segCount(c)){
        statusLabel='已标注';
      }
      const isWaiting=statusLabel==='待确认';
      const badge=c.playbackProgress?.listened?T('已听完','listened'):(c.audioCleared?T('已释放','cleared'):'');
      return `<div class="vc-chapter ${isWaiting?'vc-chapter-waiting':''}">${multi?`<input type="checkbox" data-check="${c.id}" ${selected.includes(c.id)?'checked':''} aria-label="选择${E(c.title)}">`:`<span class="vc-num">${globalIndex}</span>`}<button data-act="${isWaiting?'confirm:'+c.id:'read:'+c.id}">${E(c.title)}<br><small>${textLen(c)} 字</small></button>${badge}${isWaiting?`<button class="vc-tag warn clickable" data-act="confirm:${c.id}">待确认</button>`:T(statusLabel,statusKind)}</div>`;
    }).join('')}
    ${episodeModalHtml}
  `;
  break;
}
case 'raw':case 'annotated':case 'listen':{const b=book(),c=chapter();h=top(b.name)+``+(page==='listen'?'':`<h3 class="vc-marquee"><span>${E(c.title)}</span></h3>`);
if(page==='raw')h+=typeof c.text==='string'?`<article class="reader">${E(c.text)}</article>`:`<div class="empty"><p>章节文本缺失，无法显示原文。</p><small>请删除本书后重新导入。</small></div>`;
if(page==='annotated'){
  if((c.segments||[]).length){
    const probCount=(c.segments||[]).filter(s=>!s.skip&&!s.isAd&&s.speaker!=='广告'&&(s.confidence<engine.spkThr()||!b.characters.some(r=>r.name===s.speaker))).length;
    const __actSpk=[...new Set((c.segments||[]).filter(s=>!s.skip&&!s.isAd&&s.speaker!=='旁白'&&s.speaker!=='广告').map(s=>s.speaker))];
    const __probRoles=b.characters.filter(r=>(__actSpk.includes(r.name)||r.candidate)&&!r.voice).length;
    h+=`<div class="vc-annotated-topbar"><div class="vc-annotated-summary"><span>共 ${segCount(c)} 个段落</span>${probCount?`<span class="vc-issue-badge">${I('alert-circle')} ${probCount} 处待确认</span>`:''}</div><div class="vc-annotated-actions">${c.audio?L('听书播放 →','go:listen'):B('制作本章音频','makeone',true)}${__probRoles?`<button class="vc-btn secondary" data-act="go:roles">${I('users')} 角色音色 · ${__probRoles}待确认</button>`:''}${probCount?`<button class="vc-btn secondary" data-act="ignoreall:${c.id}">${I('check-check')} 一键全部忽略并继续制作</button>`:''}</div></div>`+(c.segments||[]).map(s=>{const isProblem=!s.skip&&!s.isAd&&s.speaker!=='广告'&&(s.confidence<engine.spkThr()||!b.characters.some(r=>r.name===s.speaker));return `<div class="vc-quote ${isProblem?'vc-issue-card uncertain':s.speaker==='旁白'?'':'speaker'}" data-seg="${s.id}"><div class="vc-row">${L(E(s.speaker)+' '+I('pencil'),'editseg:'+s.id)}<small>${E(s.emotion)}</small>${isProblem?`<span class="vc-issue-badge">${I('alert-circle')} 待确认说话人</span>`:''}</div><p class="vc-quote-text">${E(s.text)}</p>${isProblem?`<div class="vc-issue-actions">${L(I('pencil')+'修改说话人','editseg:'+s.id)}<button class="vc-btn-ignore" data-act="ignorespeaker:${s.id}">${I('fast-forward')} 忽略（默认旁白）</button></div>`:''}${s.audio&&s.audio!=='skip'?L(I('play')+'试听此句','play:'+s.audio):''}</div>`;}).join('');
  }else{
    h+=`<div class="empty"><p>还没有标注结果。</p>${B('AI 识别角色','analyze')}</div>`;
  }
}
if(page==='listen'){
  const chapters=b.chapters||[];
  const chIdx=chapters.findIndex(ch=>ch.id===c.id);
  const prevCh=chIdx>0?chapters[chIdx-1]:null;
  const nextCh=chIdx>=0&&chIdx<chapters.length-1?chapters[chIdx+1]:null;
  const hasPrev=!!(prevCh&&prevCh.audio);
  const hasNext=!!(nextCh&&nextCh.audio);
  const curSpeed=engine?.state?.playbackSpeed||1;

  const activeProdTask = engine?.state.tasks.find(t => t.status === "running");
  let prodBanner = "";
  if (activeProdTask) {
    const tb = engine.state.books.find(x => x.id === activeProdTask.bookId);
    const tc = tb?.chapters.find(x => x.id === activeProdTask.chapterId);
    const doneSegs = tc?.segments?.filter(seg => seg.audio).length || 0;
    const totalSegs = tc?.segments?.length || 0;
    const pct = totalSegs > 0 ? Math.round((doneSegs / totalSegs) * 100) : 0;
    prodBanner = '<button class="vc-listening-prod-banner" data-act="gotasksactive"><span class="vc-pulse-dot"></span><span>正在制作 ' + E(tc?.title || '下一章') + ' ' + pct + '%，点此查看 →</span></button>';
  }
  h += prodBanner;
  h += '<div class="vc-player"><div class="vc-player-head"><h3 class="vc-marquee"><span>' + E(c.title) + '</span></h3></div>';
  h += c.audio?(()=>{ const segs = engine?.computeSegmentTimestamps ? engine.computeSegmentTimestamps(c.segments || [], c.duration || 0) : (c.segments || []); if (!segs || !segs.length) { return '<div class="vc-center"><small>时长 ' + fmt(c.duration || 0) + ' · 多角色演绎</small></div>'; } return '<div class="vc-lyric vc-transcript-panel" id="transcriptPanel" role="region" aria-label="逐句字幕跟读">' + segs.map((s, idx) => { return '<div class="vc-transcript-line' + (s.speaker && s.speaker !== '旁白' ? ' is-dialogue' : '') + '" data-act="seekseg:' + Math.round(s.startMs || 0) + '" data-start="' + Math.round(s.startMs || 0) + '" data-end="' + Math.round(s.endMs || 0) + '">' + '<span class="vc-transcript-speaker">' + E(s.speaker || '旁白') + '</span>' + '<span class="vc-transcript-text">' + E(s.text || '') + '</span>' + '</div>'; }).join('') + '</div>'; })():'<div class="empty"><p>本章尚未生成完整音频。</p>' + B('制作本章','makeone') + '</div>';
  if(c.audio){
h += '<div class="vc-dock"><div class="vc-player-tools"><button class="vc-link-tag' + (engine?.state?.autoDeletePlayed ? ' active' : '') + '" data-act="toggleautodelete">完播自删 · ' + (engine?.state?.autoDeletePlayed ? '开' : '关') + '</button><button class="vc-link-tag' + (engine?.state?.settings?.autoProduceUpcoming !== false ? ' active' : '') + '" data-act="toggleautoproduce">边听边做 · ' + (engine?.state?.settings?.autoProduceUpcoming !== false ? '开' : '关') + '</button><button class="vc-link-tag" data-act="listensettings">' + I('sliders-horizontal') + ' 设置</button></div><div class="vc-player-progress"><small id="playtime">00:00</small><input type="range" id="seek" class="big-progress" min="0" max="' + ((c.duration||0)*1000) + '" value="0" aria-label="播放进度"><small>' + fmt(c.duration||0) + '</small></div>';
    h += '<div class="vc-ctlbar"><button class="vc-ctl vc-ctl-speed" data-act="speedmodal" title="倍速">' + I('gauge') + '<span class="vc-spd-val" id="speedBtnVal">' + curSpeed + 'x</span></button><button class="vc-ctl' + (hasPrev?'':' disabled') + '" data-act="prevchapter" title="上一集"' + (hasPrev?'':' disabled') + '>' + I('skip-back') + '</button><button class="vc-ctl primary" data-act="playchapter" id="playBtn">' + I('play') + '</button><button class="vc-ctl' + (hasNext?'':' disabled') + '" data-act="nextchapter" title="下一集"' + (hasNext?'':' disabled') + '>' + I('skip-forward') + '</button><button class="vc-ctl" data-act="back" title="回到本书目录">' + I('list') + '</button></div></div>';

    

  }
  h += '</div>';
}
break;}case 'editseg':{const c=chapter(),seg=c.segments.find(x=>x.id===editSegment);h=top('修正说话人')+`<div class="vc-quote"><p>${E(seg.text)}</p></div>${dd('segSpeaker','角色',book().characters.map(r=>[r.name,r.name]),seg.speaker)}${field('本句演绎','segmentEmotion',seg.emotion)}${B('保存修正','saveseg')}<hr class="vc-sep">${field('如需新增角色','newRole','')}${field('角色音色描述（性别、年龄、声音听起来怎么样）','newRoleDescription','')}${B('添加角色','addrole',true)}<p class="footer-note">修正会将本句标记为待重生成，其他已完成片段保留。</p>`;break;}
case 'voices':h=title('VOICE LIBRARY · 声音档案','音色库',B(I('plus'),'importvoices',true))+`<div class="vc-tabs"><button class="${voiceTab==='mine'?'active':''}" data-act="voicetab:mine">我的音色 · ${state.voices.length}</button><button class="${voiceTab==='preset'?'active':''}" data-act="voicetab:preset">MiMo 预设</button></div>`+(voiceTab==='mine'?`<div class="vc-note">导入和设计统一保存，AI 根据描述匹配可用音色。</div><div class="vc-split">${B('导入音频','importvoices')}${B('设计新音色','newdesign',true)}</div>${state.voices.length?state.voices.map(v=>`<div class="vc-panel vc-card-clickable" data-act="voice:${v.id}"><div class="vc-row"><div class="vc-avatar">${I(v.source==='import'?'mic':'sparkles')}</div><div style="flex:1"><h3 class="voice-name">${E(v.name)}</h3><small>${v.source==='import'?'用户导入':'AI 设计'} · ${v.format.toUpperCase()}${v.tested?' · 已试音':''}</small></div>${v.sample?`<button class="vc-preset-btn" data-act="play:${v.sample}">${I('play')} 试听</button>`:T(v.tested?'已试音':'可使用')}</div><p class="vc-sub">${E(v.description)}</p><div class="vc-row"><small>${v.enabled?'参与 AI 匹配':'仅手动选用'}</small><div style="display:flex;align-items:center;gap:14px"><span class="vc-link-text">管理 →</span>${L(I('trash-2')+'删除','deletevoice:'+v.id)}</div></div></div>`).join(''):'<div class="empty"><p>还没有自己的音色。</p><small>导入文件名即描述，朗读内容不限。</small></div>'}`:Vocast.PRESETS.map(v=>`<div class="vc-preset-row"><div class="vc-preset-title">${I('volume-2')}${E(v)}</div><button class="vc-preset-btn" data-act="preset:${E(v)}">${I('play')} 试听</button></div>`).join(''));break;
case 'voiceimport':h=top('导入样本')+`<h1 class="vc-title">一段朗读，就是一种声音。</h1><p class="vc-sub">文件名自动成为音色描述，可修改。MP3 / WAV；编码后不超过 10 MB。</p>${imports.map((f,i)=>`<div class="vc-panel"><p class="vc-filename">${E(f.name)}</p>${field('音色描述','import-'+i,f.name.replace(/\.[^.]+$/,''))}<div class="vc-row"><small>${f.format.toUpperCase()} · ${(f.size/1000000).toFixed(2)} MB</small>${L('播放样本','play:'+f.id)}</div></div>`).join('')}<button class="vc-btn full" data-act="saveimports">保存 ${imports.length} 个样本</button><p class="footer-note">可直接用于克隆合成，不必先设计或创建声音 ID。</p>`;break;
case 'voicedetail':{const v=voice();h=top('我的音色')+field('音色名称','vname',v.name)+area('音色描述 · 匹配依据（性别、年龄、声音听起来怎么样）','vdescription',v.description)+`<label class="vc-label"><span>参与 AI 自动匹配</span><input type="checkbox" id="venabled" ${v.enabled?'checked':''}></label><div class="vc-split">${B('播放参考样本','play:'+v.sample,true)}${B('保存描述','savevoice')}</div><div class="vc-panel"><h3>克隆试音</h3>${area('用此声线朗读新文本','trialText','山里的风停了，故事才刚刚开始。')}${B('生成并播放试音','trial')}</div><div class="vc-danger-zone"><button class="vc-btn danger full" data-act="deletevoice:${v.id}">${I('trash-2')} 删除此音色</button></div><p class="footer-note">删除后，该音色将从音色库移除，已绑定此音色的角色将恢复为未分配状态。</p>`;break;}
case 'design':h=top(roleName?'确认新角色音色':'设计新音色')+`${roleName?`<div class="vc-note">音色名直接使用角色名「${E(roleName)}」，采用后存入我的音色并继续制作。</div>`:field('音色名称（直接使用角色名或简练特征）','designName',candidate?.name||'新音色')}${area('音色描述（仅描述声音：性别、年龄、声音听起来怎么样，如：六七岁的小女孩，说话奶声奶气）','designDescription',candidate?.description||(roleName?book().characters.find(r=>r.name===roleName)?.description:'')||'')}${area('样本朗读内容','designText',candidate?.previewText||'清晨的风穿过树林，远方的故事刚刚开始。')}<div class="vc-split">${B(candidate?'重新生成样本':'生成试听样本','designsample')}${candidate?B('试听样本','play:'+candidate.sample,true):''}</div>${candidate?`<div class="vc-note">候选样本已返回，确认后可复用。</div><button class="vc-btn full" data-act="acceptsample">${roleName?'采用样本并继续配音':'保存到我的音色'}</button>`:''}`;break;
case 'roles':{const b=book();h=top('角色与音色')+`<h1 class="vc-title">角色绑定，全书一致。</h1><p class="vc-sub">${E(b.name)} · 已有音色直接复用，仅新设计等待确认。</p>${b.characters.map(r=>{const isProblem=!r.voice;const __tp=r.voice?('trialrole:'+r.name):(r.candidate?('play:'+r.candidate.sample):null);return `<div class="vc-panel ${isProblem?'vc-issue-card':''}"><div class="vc-row"><div class="vc-avatar ${isProblem?'warn':''}">${E(r.name[0])}</div><div style="flex:1"><h3 class="${isProblem?'vc-issue-speaker':''}">${E(r.name)}</h3><small>${E(voiceName(r.voice))}</small></div>${isProblem?`<span class="vc-issue-badge">${I('alert-circle')} 待确认音色</span>`:__tp?`<button class="vc-btn secondary" data-act="${__tp}">${I('play')} 试听</button>`:T('已分配')}</div><p class="vc-sub">${E(r.description)}</p>${r.reason?`<p class="mini">${E(r.reason)}</p>`:''}<div class="${isProblem?'vc-issue-actions':'vc-row'}">${L('从已有音色中选择','chooserole:'+r.name)}${r.candidate?L('试听并确认新设计','candidate:'+r.name):B('制作新音色','candidate:'+r.name,true)}${isProblem?`<button class="vc-btn-ignore" data-act="ignorerole:${E(r.name)}">${I('fast-forward')} 忽略（自动设计）</button>`:''}</div></div>`;}).join('')}${menu('workflow','全局音色策略','优先复用我的音色','go:policy')}`;break;}
case 'choose':h=top('为'+roleName+'选音色')+`<div class="vc-note">先试听再选用。更换绑定后，本书已有的该角色片段将标记为待重制，其他角色保留。</div><h3>我的音色</h3>${state.voices.map(v=>`<div class="vc-panel"><div class="vc-row"><div style="flex:1"><h3>${E(v.name)}</h3><small>${E(v.description)}</small></div><button class="vc-preset-btn" data-act="trialvoice:${v.id}">${I('play')} 试听</button></div><div class="vc-row" style="margin-top:8px"><span></span>${B('选用此音色','bind:'+v.id,true)}</div></div>`).join('')||'<div class="empty"><p>还没有自己的音色。</p></div>'}<h3 style="margin-top:22px">MiMo 预设</h3>${Vocast.PRESETS.map(v=>`<div class="vc-preset-row"><div class="vc-preset-title">${I('volume-2')}${E(v)}</div><div style="display:flex;gap:8px"><button class="vc-preset-btn" data-act="preset:${E(v)}">${I('play')} 试听</button><button class="vc-btn secondary" data-act="bind:preset:${E(v)}">选用</button></div></div>`).join('')}`;break;
case 'policy':{const st=state.settings;h=top('全局音色策略')+`<div class="vc-flow"><div><b>1</b><span>沿用角色已有绑定</span></div><div><b>2</b><span>AI 按描述匹配我的音色</span></div><div><b>3</b><span>没有合适音色才新设计</span></div></div>${dd('policyMode','新设计确认方式',[['manual','确认样本后使用（默认）'],['auto','全自动，仅失败时处理']],st.mode)}<label class="vc-label"><span>允许匹配 MiMo 预设</span><input id="usePresets" type="checkbox" ${st.usePresets?'checked':''}></label>${dd('retries','可恢复错误重试',[['0','0'],['1','1'],['2','2'],['3','3']],String(state.settings.retries))}${dd('speakerThreshold','说话人确认阈值（低于此置信度需人工确认）',[['0.3','0.3 · 宽松（更少打扰）'],['0.5','0.5 · 适中（默认）'],['0.65','0.65 · 严格（旧版）'],['0.8','0.8 · 很严格']],String(st.speakerThreshold??0.5))}${dd('taskParallel','同时制作任务数（章节级并行）',[['1','1 · 一次一章（默认，最稳）'],['2','2 · 同时做两章'],['3','3 · 同时做三章']],String(st.taskParallel??1))}${dd('ttsParallel','TTS 总并发句数（全部任务共用）',[['1','1 · 逐句合成（最稳）'],['2','2 · 默认'],['3','3 · 更快'],['4','4 · 最快（易被限流）']],String(st.ttsParallel??2))}${B('保存策略','savepolicy')}<p class="footer-note">鉴权与额度错误不会持续重试。修改策略不会更换已有角色音色。</p>`;break;}
case 'make':h=top('批量制作')+`<h1 class="vc-title">制作 ${selected.length} 个章节</h1><div class="vc-panel"><h3>${E(book().name)}</h3><p class="vc-sub">${book().chapters.filter(c=>selected.includes(c.id)).slice(0,3).map(c=>E(c.title)).join('、')}${selected.length>3?' 等 '+selected.length+' 章':''}</p>${selected.length>3?`<details><summary>查看全部所选章节</summary><p class="vc-sub">${book().chapters.filter(c=>selected.includes(c.id)).map(c=>E(c.title)).join('、')}</p></details>`:''}</div>${menu('brain-circuit','语言模型',E(state.settings.llmModel),'go:llm')}${menu('audio-lines','MiMo TTS','预设 / 参考音频克隆自动选择','go:mimo')}${menu('workflow','新角色音色策略',state.settings.mode==='auto'?'全自动，失败后处理':'新设计候选样本等待确认','go:policy')}<button class="vc-btn full vc-bottom" data-act="enqueue">加入队列并开始制作</button><p class="footer-note">离开应用时在当前请求结束后暂停并保存。返回制作页可继续；已完成片段不重复调用。</p>`;break;
case 'tasks':{const isMaking=t=>['running','queued','waiting','paused','failed'].includes(t.status);const isFinished=t=>['done','cancelled'].includes(t.status);const isActive=t=>['running','queued'].includes(t.status);const isAttention=t=>['waiting','paused','failed'].includes(t.status);const hasProducing=state.tasks.some(t=>['queued','running'].includes(t.status));const hasPausedTasks=state.tasks.some(t=>['paused','failed'].includes(t.status));let topBtn='';if(hasProducing)topBtn=B('全部暂停','pauseall',true);else if(hasPausedTasks)topBtn=B('继续制作','resumeall',true);const rank=t=>t.status==='running'?0:t.status==='queued'?1:t.status==='waiting'?2:t.status==='paused'?3:t.status==='failed'?4:9;const ord=(a,b)=>rank(a)-rank(b)||((b.prio||0)-(a.prio||0))||((a.created||a.createdAt||0)-(b.created||b.createdAt||0));const makingList=state.tasks.filter(isMaking).sort(ord);const finishedList=state.tasks.filter(isFinished).sort((a,b)=>(b.created||0)-(a.created||0));const activeList=state.tasks.filter(isActive).sort(ord);const attentionList=state.tasks.filter(isAttention).sort(ord);const card=t=>{const missingData=isMissingData(t.message);let b=null,c=null;try{b=engine.book(t.bookId);c=engine.chapter(t.bookId,t.chapterId);}catch(e){b=null;c=null;}if(!b||!c){const pct0=t.total?Math.round(t.done/t.total*100):0;return `<div class="vc-panel"><div class="vc-row">${T(status(t.status),['failed','waiting'].includes(t.status)?'warn':t.status==='running'?'running':'')}<small>${E(t.phase||'')}</small></div><h3 style="margin-top:14px">关联内容已移除</h3><p>该任务对应的书籍或章节已不存在，可安全移除此条记录，不影响其他任务。</p><div class="vc-meter"><span style="width:${pct0}%"></span></div><p class="vc-sub">${t.done} / ${t.total||'—'} 句 ${E(cleanErr(t.message)||'')}${missingData?'<br><small>章节数据缺失，删除本书并重导后重新导入</small>':''}</p><div class="vc-row"><span></span>${L(I('trash-2')+'移除','removetask:'+t.id)}</div></div>`;}const pct=t.total?Math.round(t.done/t.total*100):0;let acts='';const pendOrder=['queued','waiting','paused','failed'].includes(t.status);if(pendOrder){const sibs=state.tasks.filter(o=>['queued','waiting','paused','failed'].includes(o.status)).sort((a,b)=>((b.prio||0)-(a.prio||0))||((a.created||a.createdAt||0)-(b.created||b.createdAt||0)));const si=sibs.findIndex(o=>o.id===t.id);if(si>0)acts+=L('↑ 上移','taskup:'+t.id);if(si>=0&&si<sibs.length-1)acts+=L('↓ 下移','taskdown:'+t.id);if(si>0)acts+=L('⤒ 置顶','tasktop:'+t.id);}
if(t.status==='waiting')acts+=L('去标注页确认','task:'+t.id);else if(missingData&&(t.status==='paused'||t.status==='failed')){acts+=L('移除任务','removetask:'+t.id)+`<button class="vc-btn danger" data-act="deletebookconfirm:${t.bookId}">删除本书并重导</button>`;}else if(['paused','failed'].includes(t.status))acts+=L('继续 / 重试','resume:'+t.id);else if(t.status==='running'||t.status==='queued')acts+=L('暂停','pause:'+t.id);else if(t.status==='done'){let canListen=false;try{canListen=!!engine.chapter(t.bookId,t.chapterId).audio;}catch(e){}if(canListen)acts+=`<button class="vc-btn primary" data-act="listentask:${t.id}">开始听书</button>`;}else if(t.status==='cancelled')acts+=L('重新制作','remake:'+t.id);if(!['done','cancelled'].includes(t.status))acts+=L(I('x')+'取消','cancel:'+t.id);else acts+=L(I('trash-2')+'移除','removetask:'+t.id);return `<div class="vc-panel vc-card-clickable" data-act="task:${t.id}"><div class="vc-row">${T(status(t.status),['failed','waiting'].includes(t.status)?'warn':t.status==='running'?'running':'')}<small>${E(t.phase)}</small></div><h3 style="margin-top:14px">${E(b.name)}</h3><p>${E(c.title)}</p><div class="vc-meter"><span style="width:${pct}%"></span></div><p class="vc-sub">${t.done} / ${t.total||'—'} 句 ${E(cleanErr(t.message)||'')}${missingData?'<br><small>章节数据缺失，删除本书并重导后重新导入</small>':''}</p><div class="vc-row"><span class="vc-sub">点卡片查看详情</span>${acts}</div></div>`;};
const tabBtn=(id,label,n)=>`<button class="${taskTab===id?'active':''}" data-act="tasktab:${id}">${label} · ${n}</button>`;
const tabList=taskTab==='active'?activeList:taskTab==='attention'?attentionList:finishedList;
h=title('PRODUCTION STUDIO','制作任务',topBtn)+`<div class="vc-tabs">${tabBtn('active','制作中',activeList.length)}${tabBtn('attention','待确认',attentionList.length)}${tabBtn('done','已完成',finishedList.length)}</div>`+(state.tasks.length?(tabList.length?tabList.map(card).join(''):'<div class="empty"><p>'+(taskTab==='active'?'暂无制作中的任务':taskTab==='attention'?'暂无待确认的任务':'暂无已完成的任务')+'</p></div>'):'<div class="empty"><p>暂无制作任务</p>'+B('从书架选择章节','go:shelf')+'</div>');break;}
case 'task':{const t=state.tasks.find(t=>t.id===window.currentTask);if(!t){h=top('制作详情')+`<div class="empty"><p>任务记录不存在或已被移除。</p>`+B('返回任务列表','go:tasks')+`</div>`;break;}let c=null;try{c=engine.chapter(t.bookId,t.chapterId);}catch(e){c=null;}if(!c){h=top('制作详情')+`<div class="vc-row">${T(status(t.status),['failed','waiting'].includes(t.status)?'warn':t.status==='running'?'running':'')}<small>${E(t.phase||'')}</small></div><h1 class="vc-title">关联内容已移除</h1><p class="vc-sub">${E(t.message||'该任务对应的书籍或章节已不存在。')}</p><div class="vc-bottom">`+B('移除任务记录','removetask:'+t.id,true)+B('返回任务列表','go:tasks',true)+`</div>`;break;}h=top('制作详情')+`<div class="vc-row">${T(status(t.status),['failed','waiting'].includes(t.status)?'warn':t.status==='running'?'running':'')}<small>${E(t.phase)}</small></div><h1 class="vc-title">${E(c.title)}</h1><div class="vc-task-actions">${t.status==='done'?B('返回任务列表','go:tasks',true):t.status==='running'?B('完成当前句后暂停','pause:'+t.id,true):t.status==='cancelled'?B('重新加入制作','remake:'+t.id):B('继续 / 重试任务','resume:'+t.id)}${!['done','cancelled'].includes(t.status)?B('取消此任务','cancel:'+t.id,true,false,'danger'):B('移除任务记录','removetask:'+t.id,true)}</div><p class="vc-sub">${E(cleanErr(t.message))}</p>${isMissingData(t.message)?'<p class="footer-note">章节数据缺失：请返回任务列表删除本书后重新导入，已生成的单句音频会保留。</p>':''}${t.status==='waiting'?`<div class="vc-panel vc-issue-card" style="margin:12px 0"><div class="vc-row"><b class="vc-nowrap">待确认事项</b>${B('去标注页处理确认','confirm:'+c.id)}</div></div>`:''}${menu('users-round','角色与音色','查看匹配结果及待确认的新样本','go:roles')}${menu('file-text','校对说话人','不确定的对白等待你校对','go:annotated')}${c.audio?menu('sparkles','优化句末停顿','保留配音，补足句末间隔','repacecur')+menu('download','导出本章 WAV','保存为 wav 文件','exportcur'):''}${c.segments?c.segments.map(s=>`<div class="task-row"><div class="vc-row"><span>${E(s.speaker)}</span>${T(s.audio?'已完成':s.confidence<engine.spkThr()?'待校对':'待合成',!s.audio)}</div><p class="vc-sub">${E(s.text)}</p>${s.confidence<engine.spkThr()?`<div class="vc-issue-actions" style="margin-top:6px"><button class="vc-btn-ignore" data-act="ignorespeaker:${s.id}">${I('fast-forward')} 忽略（设为旁白）</button></div>`:''}${s.audio&&s.audio!=='skip'?L('试听','play:'+s.audio):''}</div>`).join(''):''}`;break;}
case 'models':h=top('模型配置')+`<h1 class="vc-title">一个声音引擎，自选理解模型。</h1><div class="vc-panel"><div class="vc-row"><h3>MiMo TTS</h3>${T(configured.ttsConfigured?'已配置':'待配置',!configured.ttsConfigured)}</div><p class="vc-sub">预设合成、音色设计、参考样本克隆。</p>${L('配置连接 →','go:mimo')}</div><div class="vc-panel"><div class="vc-row"><h3>语言模型</h3>${T(configured.llmConfigured?'已配置':'待配置',!configured.llmConfigured)}</div><p class="vc-sub">${E(state.settings.llmModel)}</p><p class="vc-model-id">${E(state.settings.llmBase)}</p>${L('配置连接 →','go:llm')}</div>`;break;
case 'llm':h=top('语言模型')+`<div class="vc-note">默认 MiniMax 中国区 Token Plan。密钥与区域必须对应，不自动切换国际区。</div>${dd('llmProtocol','接口协议',[['openai','OpenAI 兼容'],['anthropic','Anthropic Messages']],state.settings.llmProtocol)}${field('Base URL','llmBase',state.settings.llmBase)}${field('模型 ID','llmModel',state.settings.llmModel)}${field('API Key','llmKey','','password')}<div class="vc-split">${B('保存配置','savellm')}${B('真实连接测试','testllm',true)}</div><p class="footer-note">测试使用已保存的配置，会实际调用一次语言模型。</p>`;break;
case 'mimo':h=top('MiMo TTS')+field('API Key','ttsKey','','password')+`<div class="vc-panel"><h3>按任务自动使用</h3><p>预设音色</p><div class="vc-model-id">mimo-v2.5-tts</div><p>样本设计</p><div class="vc-model-id">mimo-v2.5-tts-voicedesign</div><p>样本克隆合成</p><div class="vc-model-id">mimo-v2.5-tts-voiceclone</div></div><div class="vc-split">${B('保存配置','savemimo')}${B('真实合成测试','testmimo',true)}</div><p class="footer-note">测试使用已保存的配置并生成可播放音频。统一输出 WAV，章节合并保留原音质。</p>`;break;
case 'storage':{
  const totalAudioCount = engine.state.books.reduce((sum, b) => sum + b.chapters.filter(c => c.audio).length, 0);
  const totalListenedCount = engine.state.books.reduce((sum, b) => sum + b.chapters.filter(c => c.audio && c.playbackProgress?.listened).length, 0);
  const totalUnlistenedCount = totalAudioCount - totalListenedCount;
  const totalBytes = storageStats ? storageStats.totalBytes : 0;
  const statsMb = storageStats ? (storageStats.totalBytes / (1024 * 1024)).toFixed(1) : '--';
  const fileSizes = storageStats?.fileSizes || {};
  let listenedBytes = 0, unlistenedBytes = 0;
  for (const b of engine.state.books) {
    for (const c of b.chapters) {
      if (c.audio) {
        const sz = fileSizes[c.audio] || 0;
        if (c.playbackProgress?.listened) listenedBytes += sz;
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
        <button class="vc-btn ${engine.state.autoDeletePlayed ? 'primary' : 'secondary'}" data-act="toggleautodelete">
          ${engine.state.autoDeletePlayed ? '已开启' : '已关闭'}
        </button>
      </div>
      <div class="vc-action-item">
        <div class="vc-action-info">
          <strong>完播自动保留</strong>
          <small style="color:var(--vc-sub);">完播或切章自删时，保留最近听过的章节缓存供回听</small>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">${(()=>{const kn=Math.max(0,Number(engine.state.settings.keepRecentCount ?? 2)||0);return [0,1,2,3].map(n=>`<button class="vc-link-tag${kn===n?' active':''}" data-act="setkeepcount:${n}">${n===0?'不保留':'保留'+n+'章'}</button>`).join('');})()}</div>
      </div>
      <div class="vc-action-item">
        <div class="vc-action-info">
          <strong>听书时自动预制作（边听边做）</strong>
          <small style="color:var(--vc-sub);">播放当前章节时，后台自动预先制作后续 1~2 章，享受无缝连听</small>
        </div>
        <button class="vc-btn ${engine.state.settings?.autoProduceUpcoming !== false ? 'primary' : 'secondary'}" data-act="toggleautoproduce">
          ${engine.state.settings?.autoProduceUpcoming !== false ? '已开启' : '已关闭'}
        </button>
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
    <div class="vc-panel">
      <span class="vc-kicker">BOOK MANAGEMENT & ARCHIVE</span>
      ${engine.state.books.map(b => {
        const bAudio = b.chapters.filter(c => c.audio).length;
        const bListened = b.chapters.filter(c => c.audio && c.playbackProgress?.listened).length;
        const isArchived = !!b.archived;
        return `
          <div class="vc-card vc-storage-book-card ${isArchived ? 'is-archived' : ''}">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <div>
                <strong>${E(b.name)}</strong>
                ${isArchived ? '<span class="vc-badge-archive">已归档</span>' : ''}
              </div>
              <small style="color:var(--vc-sub);">已生成 ${bAudio}/${b.chapters.length} 章 · 已听完 ${bListened} 章</small>
            </div>
            <div class="vc-row" style="gap:6px; flex-wrap:wrap;">
              <button class="vc-btn secondary" style="font-size:0.75rem; padding:4px 8px;" data-act="clearbooklistened:${b.id}" ${bListened===0?'disabled':''}>释放已听</button>
              <button class="vc-btn secondary" style="font-size:0.75rem; padding:4px 8px;" data-act="clearbookaudio:${b.id}" ${bAudio===0?'disabled':''}>释放音频</button>
              <button class="vc-btn secondary" style="font-size:0.75rem; padding:4px 8px;" data-act="archivebook:${b.id}">${isArchived ? '取消归档' : '一键归档'}</button>
              <button class="vc-btn secondary" style="font-size:0.75rem; padding:4px 8px;" data-act="openbatchmodal:${b.id}">区间批量预制</button>
              <button class="vc-btn secondary danger" style="font-size:0.75rem; padding:4px 8px;" data-act="deletebookconfirm:${b.id}">删除整书</button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
  break;
}
case 'settings':h=title('YOUR READING SPACE','我的')+menu('sliders-horizontal','模型配置','MiMo TTS + 自选语言模型','go:models')+menu('workflow','全局音色策略','先复用，必要时设计','globalpolicy')+menu('audio-lines','我的音色','导入 / 设计样本统一管理','go:voices')+menu('hard-drive','存储与有声书资源','资源回收与完播自动释放','go:storage')+`<div class="vc-panel"><h3>本地保存，按需合成</h3><p class="vc-sub">密钥由 Android Keystore 加密。书籍、音色样本和完成音频保存在设备内。</p><p class="vc-sub">后台听书使用系统播放服务。制作在离开应用后暂停，回到任务列表可继续。</p></div><p class="footer-note">Vocast 0.1.2 · ${state.usage.length} 条最近 API 用量记录</p>`;break;
}
let miniHtml = '';
if (page !== 'listen' && playingBookId && playingChapterId) {
  const mBook = engine?.state.books.find(b => b.id === playingBookId);
  const mChap = mBook?.chapters.find(c => c.id === playingChapterId);
  if (mBook && mChap && mChap.audio) {
    const pos = miniPlayingState?.position || 0;
    const dur = (mChap.duration || 0) * 1000;
    const pct = dur > 0 ? Math.min(100, Math.round((pos / dur) * 100)) : 0;
    const isPlaying = !!miniPlayingState?.playing;
    miniHtml = `<div class="vc-mini-player" data-act="minigolisten">
      <div class="vc-mini-progress"><div class="vc-mini-progress-bar" style="width:${pct}%"></div></div>
      <div class="vc-mini-cover" aria-hidden="true">${E((mBook.name || 'V').slice(0,1))}</div>
      <div class="vc-mini-info">
        <div class="vc-mini-title">${E(mChap.title)}</div>
        <div class="vc-mini-sub">${E(mBook.name)}</div>
      </div>
      <div class="vc-mini-ctrls" onclick="event.stopPropagation()">
        <button class="vc-mini-btn" data-act="miniseekback" title="快退15秒">${I('rotate-ccw')}</button>
        <button class="vc-mini-btn primary" data-act="miniplaypause" title="${isPlaying?'暂停':'播放'}">${I(isPlaying?'pause':'play')}</button>
        <button class="vc-mini-btn" data-act="mininext" title="下一章">${I('skip-forward')}</button>
      </div>
    </div>`;
  }
}
let modalHtml = '';
if(speedModalOpen){
  const spd=engine?.state?.playbackSpeed||1;
  const ticks=[0.5,0.75,1,1.25,1.5,1.75,2];
  modalHtml+=`<div class="vc-modal-overlay" data-act="closespeed"><div class="vc-dialog" onclick="event.stopPropagation()"><h3>播放倍速</h3><div class="vc-speed-big"><span id="speedVal">${spd}x</span></div><input type="range" id="speedRange" class="vc-speed-range" min="0.5" max="2" step="0.05" value="${spd}"><div class="vc-speed-ticks">${ticks.map(t=>`<button class="vc-tick${Math.abs(t-spd)<0.01?' active':''}" data-act="setspeed:${t}">${t}x</button>`).join('')}</div></div></div>`;
}
if(listenSettingsOpen){
  const keepN=Math.max(0,Number(engine?.state?.settings?.keepRecentCount ?? 2)||0);
  const prodN=Math.min(3,Math.max(1,Number(engine?.state?.settings?.autoProduceCount ?? 2)||2));
  modalHtml+=`<div class="vc-modal-overlay" data-act="closesettings"><div class="vc-dialog" onclick="event.stopPropagation()"><h3>听书设置</h3><p class="vc-set-label">完播自动删除时保留</p><div class="vc-chip-row">${[0,1,2,3].map(n=>`<button class="vc-link-tag${keepN===n?' active':''}" data-act="setkeepcount:${n}">${n===0?'不保留':'保留'+n+'章'}</button>`).join('')}</div><p class="vc-set-label">边听边做最多提前</p><div class="vc-chip-row">${[1,2,3].map(n=>`<button class="vc-link-tag${prodN===n?' active':''}" data-act="setproducecount:${n}">提前${n}章</button>`).join('')}</div></div></div>`;
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
  const ddCur=dropdownSel[openDropdown];
  modalHtml+=`<div class="vc-modal-overlay" data-act="closedropdown"><div class="vc-dialog" onclick="event.stopPropagation()"><h3>${E(ddTitle)}</h3><div style="margin-top:8px">${ddOpts.map(o=>`<button class="vc-opt${String(o[0])===String(ddCur)?' selected':''}" data-act="pickopt:${openDropdown}|${E(o[0])}"><span>${E(o[1])}</span>${String(o[0])===String(ddCur)?I('check'):''}</button>`).join('')}</div></div></div>`;
}
if (batchModalBookId) {
  const bTarget = engine?.state.books.find(b => b.id === batchModalBookId);
  const totalCh = bTarget?.chapters?.length || 0;
  modalHtml += `<div class="vc-modal-overlay" data-act="closebatchmodal">
    <div class="vc-dialog" onclick="event.stopPropagation()">
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
if (deleteConfirmBookId) {
  const targetBook = engine?.state.books.find(b => b.id === deleteConfirmBookId);
  modalHtml += `<div class="vc-modal-overlay" data-act="closedeleteconfirm">
    <div class="vc-dialog" onclick="event.stopPropagation()">
      <h3>确认彻底删除？</h3>
      <p>将彻底删除书籍《${E(targetBook?.name || '')}》以及所有生成音频、分句和任务，该操作不可撤销。</p>
      <div class="vc-dialog-actions">
        <button class="vc-btn secondary" data-act="closedeleteconfirm">取消</button>
        <button class="vc-btn danger" data-act="executedeletebook:${deleteConfirmBookId}">彻底删除</button>
      </div>
    </div>
  </div>`;
}
let __keepTop=null;try{const __p=document.getElementById('transcriptPanel');if(page==='listen'&&__p)__keepTop=__p.scrollTop;}catch(__e){}
$('#screen').innerHTML=`<main class="vc-main ${miniHtml ? 'with-mini-player' : ''}${page==='listen' ? ' vc-main-listen' : ''}">${h}</main>${miniHtml}${['raw','annotated','listen'].includes(page)?modebar():nav()}${modalHtml}`;lucide.createIcons({attrs:{width:20,height:20}});try{fitMarquee();}catch(e){}
try{if(pendingSeg!=null){const __el=document.querySelector('[data-seg="'+pendingSeg+'"]')||document.getElementById('confirm-seg-'+pendingSeg);if(__el){__el.scrollIntoView({block:'center'});__el.classList.add('vc-flash');setTimeout(()=>{try{__el.classList.remove('vc-flash');}catch(e){}},1800);}pendingSeg=null;}}catch(__e){}
try{if(page==='listen'&&__keepTop!==null&&__keepTop!==undefined){const __n=document.getElementById('transcriptPanel');if(__n)__n.scrollTop=__keepTop;}}catch(__e){}
try{if(page==='listen'&&bookId&&chapterId){const __ck=bookId+':'+chapterId;if(window.__calibKey!==__ck){window.__calibKey=__ck;engine.calibrateDurations(bookId,chapterId).then(n=>{if(n>0&&page==='listen')render();}).catch(()=>{});}}}catch(__e){}
}
const value=id=>$('#'+id)?.value||'';
async function playCurrentChapter(bid=bookId,cid=chapterId,resumePos=null){
  const b=engine?.state.books.find(b=>b.id===bid),c=b?.chapters.find(c=>c.id===cid);
  if(!c?.audio)return;
  const idx=b.chapters.indexOf(c),roleCount=b.characters.length;
  const pos = resumePos !== null ? resumePos : (c.playbackProgress?.position && !c.playbackProgress?.listened ? c.playbackProgress.position : 0);
  await device.call('play',{
    id: c.audio,
    title: c.title,
    bookTitle: b.name,
    artist: (b.author?b.author+' 著 · ':'')+(roleCount+'角色全景演绎')+' · Vocast',
    duration: Math.round((c.duration||0)*1000),
    position: pos,
    speed: engine?.state?.playbackSpeed || 1.0,
    hasPrev: !!b.chapters[idx-1]?.audio,
    hasNext: !!b.chapters[idx+1]?.audio,
    coverPath: b.cover||''
  });
  playingId=c.audio;playingBookId=bid;playingChapterId=cid;
  checkAutoProduceUpcoming(bid, cid).catch(()=>{});
}
async function restorePlayingChapter(){
  if(!engine)return;
  const p=await device.call('playbackState');
  for(const b of engine.state.books){const c=b.chapters.find(c=>c.audio&&c.audio===p.id);if(c){playingId=p.id;playingBookId=b.id;playingChapterId=c.id;return;}}
}
function syncDisplayedPlayback(p){
  if(page!=='listen')return;
  const syncKey=bookId+':'+chapterId;
  if(syncKey!==window.__syncListenKey){window.__syncListenKey=syncKey;lastActiveStart='';listenUserHoldUntil=0;}
  let pos = p.position || 0;
  if (Date.now() - lastSeekTime < 1500) {
    pos = lastSeekPos;
  }
  const ch = chapter();
  const active = !!ch?.audio && p.id === ch.audio;
  const position = active ? pos : 0;
  if($('#playtime'))$('#playtime').textContent=fmt(position/1000);
  if($('#seek')&&(!active||document.activeElement!==$('#seek')))$('#seek').value=position;
  const btn=$('#playBtn'),isPlay=active&&!!p.playing;
  if(btn&&btn.dataset.playing!==String(isPlay)){btn.dataset.playing=String(isPlay);btn.innerHTML=`${I(isPlay?'pause':'play')}`;lucide.createIcons({attrs:{width:20,height:20}});}
  const curSpeed = engine?.state?.playbackSpeed || 1;
  const __sv2=$('#speedBtnVal');if(__sv2)__sv2.textContent=curSpeed+'x';const __sr2=$('#speedRange');if(__sr2&&document.activeElement!==__sr2)__sr2.value=curSpeed;const __sl2=$('#speedVal');if(__sl2&&document.activeElement!==__sr2)__sl2.textContent=curSpeed+'x';
  const panel = document.getElementById('transcriptPanel');
  if (panel) {
    const lines = Array.from(panel.querySelectorAll('.vc-transcript-line'));
    for (const line of lines) line.classList.remove('active');
    let best = null;
    if (active && lines.length) {
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
    if (best) best.classList.add('active');
    const key = best ? String(best.dataset.start) : '';
    if (best && key !== String(lastActiveStart) && Date.now() >= listenUserHoldUntil) {
      lastActiveStart = key;
      try {
        const pr = panel.getBoundingClientRect(), br = best.getBoundingClientRect();
        if (br.top < pr.top || br.bottom > pr.bottom) {
          listenProgScrollUntil = Date.now() + 800;
          panel.scrollTop += (br.top - pr.top) - (panel.clientHeight / 2) + (br.height / 2);
        }
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
      const segs=tc?.segments||[];
      const doneN=segs.filter(s=>s.audio).length,totalN=segs.length;
      const pct=totalN>0?Math.round(doneN/totalN*100):0;
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
async function applySpeed(sp){if(!(sp>0)){toast('无效的倍速');return;}engine.state.playbackSpeed=sp;await engine.persist();try{await device.call('playback',{op:'speed',value:sp});}catch(e){}toast('已设置 '+sp+'x 倍速');const __sv=$('#speedBtnVal');if(__sv)__sv.textContent=sp+'x';const __sr=$('#speedRange');if(__sr&&document.activeElement!==__sr)__sr.value=sp;const __sl=$('#speedVal');if(__sl)__sl.textContent=sp+'x';}
async function seekDisplayedChapter(op,value,delta=null){
  const bid=bookId,cid=chapterId;
  const p=await device.call('playbackState');
  if(page!=='listen'||bid!==bookId||cid!==chapterId)return;
  if(p.id!==chapter()?.audio){syncDisplayedPlayback(p);toast('请先播放当前章节');return;}
  const target=delta===null?value:Math.max(0,p.position+delta);
  lastSeekPos=target;lastSeekTime=Date.now();
  syncDisplayedPlayback({...p,position:target});
  await device.call('playback',{op,value:target});
}
window.onNativePlaybackAction=async(act,val)=>{
  try{
    if(act==='completion'){
      if(!playingBookId)await restorePlayingChapter();
      const b=engine?.state.books.find(b=>b.id===playingBookId);
      const c=b?.chapters.find(c=>c.id===playingChapterId);
      if(b&&c&&engine){
        await engine.updatePlaybackProgress(b.id,c.id,val||c.duration*1000||0,c.duration*1000||0,true);
      }
      if(stopAfterChapter){
        stopAfterChapter=false;
        await device.call('playback',{op:'pause'});
        toast('已播完本章，睡眠定时停止');
        render();
        const chIdx = b?.chapters.findIndex(ch => ch.id === playingChapterId) ?? -1;
      const nextCh = (chIdx >= 0 && chIdx + 1 < (b?.chapters.length || 0)) ? b.chapters[chIdx + 1] : null;
      if(nextCh){
        if(nextCh.audio){
          if(page === "listen" && bookId === playingBookId){
            await engine.ensureChapter(b.id, nextCh.id);
            chapterId = nextCh.id;
            render();
          }
          await playCurrentChapter(b.id, nextCh.id);
        } else {
          const isProducing = engine.state.tasks.some(t => t.bookId === b.id && t.chapterId === nextCh.id && (t.status === "running" || t.status === "queued"));
          if(isProducing){
            waitingForNextChapterId = nextCh.id;
            toast("下一章正在后台制作中，完成后自动播放...");
          } else if(engine.state.settings?.autoProduceUpcoming !== false){
            waitingForNextChapterId = nextCh.id;
            await engine.enqueue(b.id, nextCh.id);
            toast("正在为你自动制作下一章，请稍候...");
          } else {
            toast("下一章尚未制作");
          }
        }
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
      if(!target?.audio)return;
      const cleanRes=await engine.performAutoCleanup(b.id,target.id);
      if(page==='listen'&&bookId===playingBookId){
        await engine.ensureChapter(b.id,target.id);chapterId=target.id;render();
      }
      await playCurrentChapter(b.id,target.id);
      if(cleanRes&&cleanRes.clearedCount>0&&cleanRes.freedMb>0){toast('已自动释放前章缓存('+cleanRes.freedMb+'MB)');}
    }else if((act==='play'||act==='pause')&&page==='listen'){
      syncDisplayedPlayback(await device.call('playbackState'));
    }else if(act==='seek'&&page==='listen'){
      lastSeekPos = val || 0;
      lastSeekTime = Date.now();
      const base = await device.call('playbackState');
      syncDisplayedPlayback({...base, position: val || 0});
    }
  }catch(e){toast(e.message||'播放控制失败');}
};
$('#screen').addEventListener('click',async e=>{const el=e.target.closest('[data-act]');if(!el||el.disabled)return;const [a,...rest]=el.dataset.act.split(':'),x=rest.join(':');
try{
if(a==='go'){for(const k of['segSpeaker','policyMode','retries','speakerThreshold','taskParallel','ttsParallel','llmProtocol'])delete dropdownSel[k];openDropdown=null;if(x==='tasks'&&e.target.closest('.vc-nav-badge'))taskTab='attention';go(x);return;}if(a==='back'){for(const k of['segSpeaker','policyMode','retries','speakerThreshold','taskParallel','ttsParallel','llmProtocol'])delete dropdownSel[k];openDropdown=null;appBack();return;}

if(a==='resumebook'){const [bid,cid]=x.split(':');bookId=bid;chapterId=cid;page='listen';render();await playCurrentChapter(bid,cid);return;}
if(a==='resumechapter'){const c=book()?.chapters?.find(ch=>ch.id===x);if(c?.audio){chapterId=x;page='listen';render();await playCurrentChapter(bookId,x);return;}const existing=engine.state.tasks.find(t=>t.bookId===bookId&&t.chapterId===x&&!['done','cancelled'].includes(t.status));const job=existing?engine.resume(existing.id):engine.enqueue(bookId,[x]);job.catch(e=>toast(e.message));toast('已开始制作');go('detail');return;}
if(a==='setspeed'){await applySpeed(parseFloat(x));return;}

if(a==="toggleautoproduce"){
if(!engine.state.settings)engine.state.settings={};
engine.state.settings.autoProduceUpcoming=engine.state.settings.autoProduceUpcoming===false?true:false;
await engine.persist();
toast("听书自动预制: "+(engine.state.settings.autoProduceUpcoming?"已开启":"已关闭"));
if(page==="listen"){document.querySelectorAll('[data-act="toggleautoproduce"]').forEach(b=>{const on=engine.state.settings.autoProduceUpcoming!==false;b.classList.toggle("active",on);b.textContent="边听边做 · "+(on?"开":"关");});}else{render();}return;}
if(a==='toggleautodelete'){engine.state.autoDeletePlayed=!engine.state.autoDeletePlayed;await engine.persist();toast('完播自动释放: '+(engine.state.autoDeletePlayed?'已开启':'已关闭'));if(page==='listen'){document.querySelectorAll('[data-act="toggleautodelete"]').forEach(b=>{b.classList.toggle('active',!!engine.state.autoDeletePlayed);b.textContent='完播自删 · '+(engine.state.autoDeletePlayed?'开':'关');});}else{render();}return;}

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
if(a==='clearbooklistened'){const b=engine.state.books.find(bk=>bk.id===x);if(b){let cCount=0;for(const c of b.chapters){if(c.audio&&c.playbackProgress?.listened){await engine.clearChapterAudio(b.id,c.id);cCount++;}}storageStats=await device.call('audioStats');toast('已释放《'+b.name+'》'+cCount+' 个章节音频');render();}return;}
if(a==='clearbookaudio'){const b=engine.state.books.find(bk=>bk.id===x);if(b){await engine.clearBookAudio(b.id);storageStats=await device.call('audioStats');toast('已释放《'+b.name+'》全部音频');render();}return;}
if(a==='deletebookconfirm'){deleteConfirmBookId=x;render();return;}
if(a==='closedeleteconfirm'){deleteConfirmBookId=null;render();return;}
if(a==='executedeletebook'){if(deleteConfirmBookId){const b=engine.state.books.find(bk=>bk.id===deleteConfirmBookId);const bName=b?.name||'书籍';await engine.deleteBook(deleteConfirmBookId);deleteConfirmBookId=null;storageStats=await device.call('audioStats');toast('已彻底删除《'+bName+'》');if(bookId===deleteConfirmBookId){bookId=null;chapterId=null;go('shelf');}else{render();}}return;}
if(a==='minigolisten'){if(playingBookId&&playingChapterId){bookId=playingBookId;chapterId=playingChapterId;go('listen');}return;}
if(a==='miniseekback'){await device.call('playback',{op:'seek',value:Math.max(0,(miniPlayingState?.position||0)-15000)});return;}
if(a==='miniplaypause'){const isPlay=!!miniPlayingState?.playing;await device.call('playback',{op:isPlay?'pause':'resume'});return;}
if(a==='mininext'){await window.onNativePlaybackAction('next',0);return;}
if(a==='book'){bookId=x;chapterId=book().chapters[0].id;multi=false;selected=[];chapterPage=0;episodeModalOpen=false;go('detail');return;}
if(a==='read'){chapterId=x;const c=book()?.chapters?.find(ch=>ch.id===x);go(getChapterTarget(c));return;}
if(a==='confirm'){chapterId=x;pendingSeg=null;const cc=book()?.chapters?.find(ch=>ch.id===x);if(cc&&cc.unloaded){await busy(async()=>{await engine.ensureChapter(bookId,x);},'读取章节…');}go('annotated');return;}
if(a==='tasktab'){taskTab=x;render();return;}
if(a==='gotasksactive'){taskTab='active';go('tasks');return;}
if(a==='ignorerole'){const b=book();const ch=b.characters.find(r=>r.name===x);if(ch){const reuse=engine.autoVoiceFor(bookId,x);if(reuse){ch.voice=reuse;ch.candidate=null;ch.reason='性别年龄与声音特征相近，自动复用已有音色';await engine.persist();toast('角色「'+ch.name+'」已自动复用已有音色');}else{ch.autoDesign=true;await engine.persist();toast('角色「'+ch.name+'」稍后后台自动设计');}engine.resumeWaiting(bookId).catch(e=>toast(e.message));}taskTab='active';go('tasks');return;}
if(a==='ignorespeaker'){const c=chapter();const seg=c.segments.find(s=>s.id===Number(x));if(seg){seg.speaker='旁白';seg.confidence=1;seg.audio=null;seg.emotion='自然朗读';c.audio=null;c.status='annotated';engine.touch(c);for(const t of engine.state.tasks.filter(t=>t.bookId===bookId&&t.chapterId===chapterId)){t.done=c.segments.filter(s=>s.audio).length;if(t.status==='done')t.status='paused';}await engine.persist();engine.resumeWaiting(bookId).catch(e=>toast(e.message));toast('该句说话人已设为旁白');taskTab='active';go('tasks');}return;}
if(a==='ignoreall'){const b=book(),c=chapter();const activeSpeakers=[...new Set(c.segments.filter(s=>!s.skip&&!s.isAd&&s.speaker!=='旁白'&&s.speaker!=='广告').map(s=>s.speaker))];const rolesToFix=b.characters.filter(r=>(activeSpeakers.includes(r.name)||r.candidate)&&!r.voice);for(const ch of rolesToFix){const reuse=engine.autoVoiceFor(bookId,ch.name);if(reuse){ch.voice=reuse;ch.candidate=null;ch.reason='性别年龄与声音特征相近，自动复用已有音色';continue;}ch.autoDesign=true;}for(const seg of c.segments){if(!seg.skip&&!seg.isAd&&seg.speaker!=='广告'&&(seg.confidence<engine.spkThr()||!b.characters.some(r=>r.name===seg.speaker))){seg.speaker='旁白';seg.confidence=1;seg.audio=null;seg.emotion='自然朗读';}}c.audio=null;c.status='annotated';engine.touch(c);for(const t of engine.state.tasks.filter(t=>t.bookId===bookId&&t.chapterId===chapterId)){t.done=c.segments.filter(s=>s.audio).length;}await engine.persist();engine.resumeWaiting(bookId).catch(e=>toast(e.message));toast('已记录选择，后台继续制作');taskTab='active';go('tasks');return;}
if(a==='acceptrole'){const bid=bookId;await busy(async()=>{await engine.accept(bid,x,false);toast('已采用角色「'+x+'」专属音色');},'正在保存音色…');engine.resumeWaiting(bid).catch(e=>toast(e.message));taskTab='active';go('tasks');return;}
if(a==='acceptsuggested'){const ch=book().characters.find(r=>r.name===x);if(ch&&ch.suggestedVoice){ch.voice=ch.suggestedVoice;ch.candidate=null;await engine.persist();toast('已为角色「'+x+'」绑定音色');engine.resumeWaiting(bookId).catch(e=>toast(e.message));taskTab='active';go('tasks');}return;}
if(a==='resumechapter'){const existing=engine.state.tasks.find(t=>t.bookId===bookId&&t.chapterId===x&&!['done','cancelled'].includes(t.status));const job=existing?engine.resume(existing.id):engine.enqueue(bookId,[x]);job.catch(e=>toast(e.message));toast('已开始制作');go('detail');return;}
if(a==='samplebook'){await busy(async()=>{const b=await engine.addBook('雾山来信 · 示例文本','第一章 山中来信\n雨停了，青年男子沈砚推开木门。\n“你终于来了。”沈砚用低沉温润的声音说。\n年轻女子林晚抬起头，用清亮的声音问：“这封信是谁寄来的？”\n第二章 天亮之前\n清晨，沈砚走出邮局。\n“别担心，我会回来。”他轻声说。');bookId=b.id;chapterId=b.chapters[0].id;chapterPage=0;episodeModalOpen=false;go('detail');});return;}
if(a==='importbook'){await busy(async()=>{const files=await device.call('pick',{kind:'book'});for(const f of files){const b=await engine.addBook(f.name,f.text);bookId=b.id;chapterId=b.chapters[0].id;chapterPage=0;episodeModalOpen=false;if(b.importWarnings&&b.importWarnings.length){b._warnNotified=true;device.call('notify',{channel:'notice',title:'书籍导入提示 · '+b.name,message:b.importWarnings.join('\n'),type:'info'}).catch(()=>{});}}go('detail');},'选择并解析小说…');return;}
if(a==='multiselect'){multi=!multi;render();return;}
if(a==='selectunfinished'){selected=book().chapters.filter(c=>!c.audio).map(c=>c.id);render();return;}
if(a==='selectpage'){const b=book();const cur=b.chapters.slice(chapterPage*50,(chapterPage+1)*50).map(c=>c.id);selected=[...new Set([...selected,...cur])];render();return;}
if(a==='selectnone'){selected=[];render();return;}
if(a==='selectall'){selected=book().chapters.map(c=>c.id);render();return;}
if(a==='resetchapters'){await busy(async()=>{const ids=[...selected];for(const t of engine.state.tasks.filter(t=>t.bookId===bookId&&ids.includes(t.chapterId)&&['running','queued'].includes(t.status)))await engine.cancel(t.id);const n=await engine.resetChapters(bookId,ids);selected=[];multi=false;try{storageStats=await device.call('audioStats');}catch(e){}toast('已清除 '+n+' 章的标注与音频，原文保留，可重新制作');},'正在清除所选章节的标注与音频…');return;}
if(a==='openepisodes'){episodeModalOpen=true;render();return;}
if(a==='dropdown'){openDropdown=x;render();return;}
if(a==='closedropdown'){openDropdown=null;render();return;}
if(a==='pickopt'){const pi=x.indexOf('|');const pid=x.slice(0,pi),pval=x.slice(pi+1);dropdownSel[pid]=pval;openDropdown=null;render();return;}
if(a==='speedmodal'){speedModalOpen=true;render();return;}
if(a==='closespeed'){speedModalOpen=false;render();return;}
if(a==='listensettings'){listenSettingsOpen=true;render();return;}
if(a==='closesettings'){listenSettingsOpen=false;render();return;}
if(a==='setkeepcount'){const n=Math.max(0,Math.min(3,parseInt(x,10)));if(!isNaN(n)){engine.state.settings.keepRecentCount=n;await engine.persist();}render();return;}
if(a==='setproducecount'){const n=Math.min(3,Math.max(1,parseInt(x,10)));if(!isNaN(n)){engine.state.settings.autoProduceCount=n;await engine.persist();}render();return;}
if(a==='closeepisodes'){episodeModalOpen=false;render();return;}
if(a==='setchpage'){chapterPage=Number(x)||0;episodeModalOpen=false;render();return;}
if(a==='analyze'){await busy(()=>engine.analyze(bookId,chapterId),'正在实际调用语言模型，识别角色…');return;}
if(a==='makeone'){selected=[chapterId];go('make');return;}
if(a==='enqueue'){if(!configured.llmConfigured||!configured.ttsConfigured){toast('请先配置语言模型和 MiMo 密钥');go('models');return;}const ids=[...selected];go('tasks');engine.enqueue(bookId,ids).catch(e=>toast(e.message));return;}
if(a==='task'||a==='taskroles'){const t=engine.state.tasks.find(t=>t.id===x);if(a==='task'&&t.status==='waiting'){window.currentTask=t.id;bookId=t.bookId;chapterId=t.chapterId;pendingSeg=null;const cc=book().chapters.find(ch=>ch.id===t.chapterId);if(cc&&cc.unloaded){await busy(async()=>{await engine.ensureChapter(bookId,t.chapterId);},'读取章节…');}go('annotated');return;}window.currentTask=t.id;bookId=t.bookId;chapterId=t.chapterId;go(a==='task'?'task':'roles');return;}
if(a==='pause'){await engine.pause(x);toast('将在当前请求完成后暂停');return;}
if(a==='taskup'){await engine.moveTask(x,'up');render();return;}
if(a==='taskdown'){await engine.moveTask(x,'down');render();return;}
if(a==='tasktop'){await engine.moveTask(x,'top');render();return;}
if(a==='resume'){const __rt=engine.state.tasks.find(t=>t.id===x);if(__rt&&isMissingData(__rt.message)){toast('章节数据缺失，无法继续：请删除本书后重新导入');go('tasks');return;}engine.resume(x).catch(e=>toast(cleanErr(e.message)||String(e)));return;}
if(a==='cancel'){await engine.cancel(x);toast('任务已取消');render();return;}
if(a==='pauseall'){const active=engine.state.tasks.filter(t=>['queued','running'].includes(t.status));for(const t of active)await engine.pause(t.id);toast(active.length?`已暂停 ${active.length} 个任务，当前句子完成后停止`:'没有正在制作的任务');render();return;}
if(a==='resumeall'){const paused=engine.state.tasks.filter(t=>['paused','failed'].includes(t.status));const mx=paused.length?Math.max(0,...engine.state.tasks.map(t=>t.prio||0)):0;paused.sort((a,b)=>((b.prio||0)-(a.prio||0))||((a.created||a.createdAt||0)-(b.created||b.createdAt||0))).forEach((t,i)=>{t.pauseRequested=false;t.status='queued';t.phase='排队等待';t.prio=mx+paused.length-i;});await engine.persist();engine.run().catch(e=>toast(e.message));toast(paused.length?`已继续制作 ${paused.length} 个任务`:'没有可继续的任务');render();return;}
if(a==='listentask'){const t=engine.state.tasks.find(t=>t.id===x);if(!t)throw Error('任务不存在');bookId=t.bookId;chapterId=t.chapterId;page='listen';render();await playCurrentChapter(t.bookId,t.chapterId);return;}
if(a==='removetask'){await engine.removeTask(x);toast('已移除任务记录');if(page==='task')go('tasks');else render();return;}
if(a==='remake'){const t=engine.state.tasks.find(t=>t.id===x);if(t){const bid=t.bookId,cid=t.chapterId;await engine.removeTask(x);engine.enqueue(bid,[cid]).catch(e=>toast(e.message));toast('已重新加入制作队列');go('tasks');}return;}
if(a==='importvoices'){await busy(async()=>{imports=await device.call('pick',{kind:'voice'});go('voiceimport');},'选择参考样本…');return;}
if(a==='saveimports'){await busy(async()=>{for(let i=0;i<imports.length;i++){const description=value('import-'+i).trim();if(!description)throw Error('请填写所有音色描述');imports[i].description=description;}for(const f of imports){const v=await engine.importVoice(f);v.name=f.description;v.description=f.description;}await engine.persist();imports=[];go('voices');});return;}
if(a==='voicetab'){voiceTab=x;render();return;}
if(a==='voice'){voiceId=x;go('voicedetail');return;}
if(a==='savevoice'){if(!value('vname').trim()||!value('vdescription').trim())throw Error('请填写名称和音色描述');voice().name=value('vname').trim();voice().description=value('vdescription').trim();voice().enabled=$('#venabled').checked;await engine.persist();toast('音色描述已保存');return;}
if(a==='deletevoice'){const targetId=x||voiceId;const targetVoice=engine.state.voices.find(v=>v.id===targetId);const name=targetVoice?.name||'该音色';await busy(async()=>{await engine.deleteVoice(targetId);toast(`已删除音色「${name}」`);go('voices');},'正在删除音色…');return;}
if(a==='newdesign'){candidate=null;roleName=null;designDirty=false;go('design');return;}
if(a==='designsample'){const description=value('designDescription'),text=value('designText'),vname=roleName||value('designName')?.trim()||'';await busy(async()=>{const v=await engine.design(description,text,vname);candidate=v;candidate.name=vname||v.name;candidate.previewText=text;designDirty=false;if(roleName){book().characters.find(r=>r.name===roleName).candidate=v;await engine.persist();}},'MiMo 正在设计真实音色样本…');return;}
if(a==='acceptsample'){if(designDirty)throw Error('描述或文本已修改，请重新生成样本');await busy(async()=>{if(roleName){candidate.name=roleName;engine.accept(bookId,roleName).catch(e=>toast(e.message));go('roles');}else{candidate.name=value('designName')?.trim()||candidate.name||'自定义音色';await engine.saveVoice(candidate);go('voices');}},'保存样本…');return;}
if(a==='candidate'){roleName=x;candidate=book().characters.find(r=>r.name===x).candidate;designDirty=false;go('design');return;}
if(a==='chooserole'){roleName=x;go('choose');return;}
if(a==='bind'){engine.bind(bookId,roleName,x).catch(e=>toast(e.message));go('roles');return;}
if(a==='trialrole'){const b=book(),r=b.characters.find(v=>v.name===x);if(!r?.voice){toast('该角色尚未分配音色');return;}const c=chapter();const line=(c.segments||[]).find(s=>s.speaker===x&&!s.skip&&!s.isAd)||(c.segments||[]).find(s=>!s.skip&&!s.isAd&&s.speaker!=='广告');const text=line?line.text.slice(0,120):('大家好，我是'+x+'，这是我的声音。');await busy(async()=>{const file=await engine.synthesize(text,r.voice,'自然朗读，不能增删原文。');await device.call('play',{id:file.id,title:'试听 · '+x});},'正在合成试听…');return;}
if(a==='trial'){const text=value('trialText');await busy(async()=>{const file=await engine.synthesize(text,voiceId);voice().tested=true;voice().lastTrial=file.id;await engine.persist();await device.call('play',{id:file.id,title:'音色试音'});toast('克隆试音已生成并播放');},'MiMo 正在克隆合成试音…');return;}
if(a==='preset'){await busy(async()=>{const f=await engine.synthesize('山里的风停了，故事才刚刚开始。','preset:'+x);await device.call('play',{id:f.id,title:'MiMo · '+x});},'正在合成预设试听…');return;}
if(a==='trialvoice'){const v=engine.state.voices.find(v=>v.id===x);if(!v){toast('音色不存在');return;}if(v.sample){await device.call('play',{id:v.sample,title:'试听 · '+v.name});playingId=v.sample;playingBookId=null;playingChapterId=null;return;}await busy(async()=>{const f=await engine.synthesize('山里的风停了，故事才刚刚开始。',v.id);await device.call('play',{id:f.id,title:'试听 · '+v.name});},'正在合成试听…');return;}
if(a==='play'){await device.call('play',{id:x,title:'Vocast 试听'});playingId=x;playingBookId=null;playingChapterId=null;return;}
if(a==='repacecur'){const t=engine.state.tasks.find(t=>t.id===window.currentTask);if(!t){toast('任务不存在');return;}bookId=t.bookId;chapterId=t.chapterId;engine.optimizePauses(bookId,chapterId).catch(e=>toast(e.message));toast('已开始优化句末停顿');go('tasks');return;}
if(a==='playchapter'){const p=await device.call('playbackState');if(p.id!==chapter().audio){await playCurrentChapter();}else await device.call('playback',{op:p.playing?'pause':'resume'});return;}
if(a==='prevchapter'){
  const b=book();if(!b)return;const chapters=b.chapters||[];const idx=chapters.findIndex(ch=>ch.id===chapterId);
  if(idx>0&&chapters[idx-1].audio){
    const prevTarget=chapters[idx-1];
    const cleanRes=await engine.performAutoCleanup(b.id,prevTarget.id);
    chapterId=prevTarget.id;page='listen';render();await playCurrentChapter();
    if(cleanRes&&cleanRes.clearedCount>0&&cleanRes.freedMb>0){
      toast('已切换上一章，自动释放缓存('+cleanRes.freedMb+'MB)');
    }else{
      toast('正在播放：'+prevTarget.title);
    }
  }else toast('没有可播放的上一章');return;
}
if(a==='nextchapter'){
  const b=book();if(!b)return;const chapters=b.chapters||[];const idx=chapters.findIndex(ch=>ch.id===chapterId);
  if(idx>=0&&idx<chapters.length-1&&chapters[idx+1].audio){
    const nextTarget=chapters[idx+1];
    const cleanRes=await engine.performAutoCleanup(b.id,nextTarget.id);
    chapterId=nextTarget.id;page='listen';render();await playCurrentChapter();
    if(cleanRes&&cleanRes.clearedCount>0&&cleanRes.freedMb>0){
      toast('已切换下一章，自动释放前章缓存('+cleanRes.freedMb+'MB)');
    }else{
      toast('正在播放：'+nextTarget.title);
    }
  }else toast('没有可播放的下一章');return;
}

if(a==='exportcur'){const t=engine.state.tasks.find(t=>t.id===window.currentTask);let bb=null,cc=null;try{bb=engine.book(t.bookId);cc=engine.chapter(t.bookId,t.chapterId);}catch(e){}if(!cc?.audio){toast('暂无可导出的音频');return;}const nm='[Vocast有声书]《'+bb.name+'》-'+cc.title;await device.call('export',{id:cc.audio,name:nm});toast('已导出：'+nm+'.wav');return;}
if(a==='globalpolicy'){for(const k of['segSpeaker','policyMode','retries','speakerThreshold','taskParallel','ttsParallel','llmProtocol'])delete dropdownSel[k];openDropdown=null;go('policy');bookId=null;render();return;}
if(a==='savepolicy'){const __pst=engine.state.settings;const p={mode:dropdownSel.policyMode||__pst.mode||'manual',usePresets:$('#usePresets').checked};engine.state.settings.retries=Number(dropdownSel.retries!==undefined?dropdownSel.retries:engine.state.settings.retries);const __thr=Number(dropdownSel.speakerThreshold);engine.state.settings.speakerThreshold=(dropdownSel.speakerThreshold===undefined)?(Number(__pst.speakerThreshold)>=0&&Number(__pst.speakerThreshold)<=1?Number(__pst.speakerThreshold):0.5):((__thr>=0&&__thr<=1)?__thr:0.5);const __tp=Number(dropdownSel.taskParallel);engine.state.settings.taskParallel=(dropdownSel.taskParallel===undefined)?([1,2,3].includes(Number(__pst.taskParallel))?Number(__pst.taskParallel):1):([1,2,3].includes(__tp)?__tp:1);const __np=Number(dropdownSel.ttsParallel);engine.state.settings.ttsParallel=(dropdownSel.ttsParallel===undefined)?([1,2,3,4].includes(Number(__pst.ttsParallel))?Number(__pst.ttsParallel):2):([1,2,3,4].includes(__np)?__np:2);Object.assign(engine.state.settings,p);await engine.persist();const __wBids=[...new Set(engine.state.tasks.filter(t=>t.status==='waiting'&&(bookId?t.bookId===bookId:true)).map(t=>t.bookId))];for(const __bid of __wBids){await engine.resumeWaiting(__bid);}engine.run().catch(()=>{});toast('策略已保存');return;}
if(a==='savellm'){const base=value('llmBase').trim().replace(/\/$/,'');if(!/^https:\/\//.test(base)||!value('llmModel').trim())throw Error('请填写 HTTPS 地址和模型 ID');await device.call('saveCredentials',{llmKey:value('llmKey'),llmBase:base});Object.assign(engine.state.settings,{llmBase:base,llmModel:value('llmModel').trim(),llmProtocol:dropdownSel.llmProtocol||engine.state.settings.llmProtocol});await engine.persist();configured=await device.call('load');go('models');return;}
if(a==='savemimo'){await device.call('saveCredentials',{ttsKey:value('ttsKey')});configured=await device.call('load');go('models');return;}
if(a==='testllm'){await busy(async()=>{const result=await engine.llm('只输出 JSON：{"ok":true}');if(result.ok!==true)throw Error('模型测试返回格式不符合预期');await engine.persist();toast('真实语言模型调用成功');},'正在验证真实语言模型调用…');return;}
if(a==='testmimo'){await busy(async()=>{const f=await engine.synthesize('连接成功，现在可以开始制作有声书。','preset:白桦');await engine.persist();await device.call('play',{id:f.id,title:'MiMo 连接测试'});toast('真实合成成功，音频已播放');},'正在调用 MiMo 合成测试语音…');return;}
if(a==='editseg'){editSegment=Number(x);delete dropdownSel.segSpeaker;openDropdown=null;go('editseg');return;}
if(a==='saveseg'){const __seg=chapter().segments.find(s=>s.id===editSegment);await engine.correct(bookId,chapterId,editSegment,dropdownSel.segSpeaker||(__seg&&__seg.speaker),value('segmentEmotion'));const __b=book(),__c=chapter();const __act=[...new Set(__c.segments.filter(s=>!s.skip&&!s.isAd&&s.speaker!=='旁白'&&s.speaker!=='广告').map(s=>s.speaker))];const __ps=__c.segments.filter(s=>!s.skip&&!s.isAd&&s.speaker!=='广告'&&(s.confidence<engine.spkThr()||!__b.characters.some(r=>r.name===s.speaker)));const __pr=__b.characters.filter(r=>(__act.includes(r.name)||r.candidate)&&!r.voice);if(!__ps.length&&!__pr.length){engine.resumeWaiting(bookId).catch(e=>toast(e.message));taskTab='active';go('tasks');return;}go('annotated');return;}
if(a==='addrole'){const name=value('newRole').trim(),description=value('newRoleDescription').trim();if(!name||!description)throw Error('请填写姓名和音色描述');if(book().characters.some(r=>r.name===name))throw Error('角色已存在');const emotion=value('segmentEmotion');book().characters.push({name,description,aliases:[],voice:null});await engine.persist();dropdownSel.segSpeaker=name;render();const __se=$('#segmentEmotion');if(__se)__se.value=emotion;return;}
}catch(e){toast(e.message||String(e));}});
$('#screen').addEventListener('change',e=>{if(e.target.dataset.check){const id=e.target.dataset.check;selected=e.target.checked?[...new Set([...selected,id])]:selected.filter(x=>x!==id);render();}if(e.target.id==='speedRange'){applySpeed(parseFloat(e.target.value));return;}if(e.target.id==='seek')seekDisplayedChapter('seek',Number(e.target.value)).catch(e=>toast(e.message));});
$('#screen').addEventListener('input',e=>{if(e.target.id==='speedRange'){const __sl3=$('#speedVal');if(__sl3)__sl3.textContent=parseFloat(e.target.value)+'x';}if(candidate&&['designDescription','designText'].includes(e.target.id)){designDirty=true;const button=$('[data-act="acceptsample"]');if(button){button.disabled=true;button.textContent='内容已修改，请重新生成样本';}}});
if(document.getElementById('screen')){document.getElementById('screen').addEventListener('scroll',e=>{if(e&&e.target&&e.target.id==='transcriptPanel'){if(Date.now()<listenProgScrollUntil)return;listenUserHoldUntil=Date.now()+3000;}},true);}
setInterval(async()=>{
  try{
    const p=await device.call('playbackState');
    miniPlayingState=p;
    if(p?.playing&&playingBookId&&playingChapterId&&engine){
      const b=engine.state.books.find(b=>b.id===playingBookId);
      const c=b?.chapters.find(c=>c.id===playingChapterId);
      if(c&&c.audio===p.id){
        await engine.updatePlaybackProgress(playingBookId,playingChapterId,p.position||0,(c.duration||0)*1000,false);
      }
    }
    if(page==='listen'){
      syncDisplayedPlayback(p);
    }else{
      const miniProgress=$('.vc-mini-progress-bar');
      if(miniProgress&&playingBookId&&playingChapterId){
        const b=engine?.state.books.find(b=>b.id===playingBookId);
        const c=b?.chapters.find(c=>c.id===playingChapterId);
        const dur=(c?.duration||0)*1000;
        const pct=dur>0?Math.min(100,(p.position/dur)*100):0;
        miniProgress.style.width=pct+'%';
      }
      const miniBtn=$('[data-act="miniplaypause"]');
      if(miniBtn){
        const isPlay=!!p.playing;
        miniBtn.title=isPlay?'暂停':'播放';
        miniBtn.innerHTML=I(isPlay?'pause':'play');
        lucide.createIcons({attrs:{width:20,height:20}});
      }
    }
  }catch(ignored){}
},1000);
device.call('load').then(result=>{configured=result;engine=new Vocast.Engine(device,result.state);window.vocastEngine=engine;window.renderApp=render;window.__applyInitialNav=(nav)=>{try{if(nav!=='tasks_attention'||!engine)return;const hasPend=engine.state.tasks.some(t=>t.status==='waiting'||t.status==='failed');taskTab=hasPend?'attention':'active';if(page==='tasks')render();else go('tasks');}catch(__e){}};if(result&&result.initialNav)window.__applyInitialNav(result.initialNav);const lastStatus=new Map(engine.state.tasks.map(t=>[t.id,t.status]));engine.onChange(()=>{
  syncProductionStatus().catch(()=>{});
  if(waitingForNextChapterId){
    const targetTask = engine.state.tasks.find(t => t.chapterId === waitingForNextChapterId);
    if(targetTask && targetTask.status === "completed"){
      const tBookId = targetTask.bookId;
      const tChapId = targetTask.chapterId;
      waitingForNextChapterId = null;
      toast("下一章制作完成，自动开始播放！");
      if(page === "listen" && bookId === tBookId){
        engine.ensureChapter(tBookId, tChapId).then(()=>{
          chapterId = tChapId;
          render();
          playCurrentChapter(tBookId, tChapId);
        });
      } else {
        playCurrentChapter(tBookId, tChapId);
      }
    } else if(targetTask && targetTask.status === "failed"){
      waitingForNextChapterId = null;
      toast("下一章制作失败，已停止自动播放");
    }
  }
  for(const t of engine.state.tasks){if(['failed','waiting'].includes(t.status)&&lastStatus.get(t.id)!==t.status){const isFail=t.status==='failed';let bName='书籍',cTitle='';try{bName=engine.book(t.bookId)?.name||'书籍';}catch(e){}try{cTitle=engine.chapter(t.bookId,t.chapterId)?.title||'';}catch(e){}const title=isFail?'Vocast · 制作失败':'Vocast · 制作待确认';const msg=bName+' · '+cTitle+'：'+(t.message||(isFail?'遇到问题':'需要处理确认'));toast(cleanErr(t.message)||title);device.call('notify',{channel:'production',title,message:cleanErr(msg),type:isFail?'error':'info'}).catch(()=>{});}lastStatus.set(t.id,t.status);}if(!['llm','mimo','design','voicedetail','editseg','voiceimport','policy','listen'].includes(page)){try{render();}catch(err){page='shelf';try{render();}catch(e2){toast(err.message||'页面渲染失败');}}}});try{render();}catch(err){page='shelf';try{render();}catch(e2){toast(err.message||'页面渲染失败');}}}).catch(e=>{$('#screen').innerHTML=`<main class="vc-main"><h1>无法读取书库</h1><p>${E(e.message)}</p><p style="margin-top:12px"><button class="vc-btn primary" onclick="location.reload()">重新加载</button></p></main>`;});
})();

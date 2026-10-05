(()=>{'use strict';
let engine,configured={},page='shelf',bookId=null,chapterId=null,voiceId=null,roleName=null,selected=[],multi=false,voiceTab='mine',candidate=null,imports=[],editSegment=null,history=[],playingId=null,playingBookId=null,playingChapterId=null,designDirty=false,chapterPage=0,episodeModalOpen=false,deleteConfirmBookId=null,batchModalBookId=null,stopAfterChapter=false,storageStats=null,miniPlayingState=null,lastSeekTime=0,lastSeekPos=0,lastActiveStart='',listenUserHoldUntil=0,listenProgScrollUntil=0;
const $=s=>document.querySelector(s),E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),I=n=>`<i data-lucide="${n}" aria-hidden="true"></i>`;
const B=(text,act,secondary=false,disabled=false)=>`<button class="vc-btn ${secondary?'secondary':''}" data-act="${E(act)}" ${disabled?'disabled':''}>${text}</button>`,L=(text,act)=>`<button class="vc-link" data-act="${E(act)}">${text}</button>`,T=(text,w=false)=>{const extraCls=w==='listened'?'vc-status-badge listened':w==='cleared'?'vc-status-badge cleared':'';const cls=w==='warn'||w===true?'warn':w==='running'?'running':'';return `<span class="vc-tag ${cls} ${extraCls}">${E(text)}</span>`;};
const title=(k,t,right='')=>`<div class="vc-top"><div><div class="vc-kicker">${k}</div><h1>${t}</h1></div>${right}</div>`;
const top=t=>`<div class="vc-top"><button class="vc-icon" data-act="back" aria-label="返回">${I('arrow-left')}</button><h2>${E(t)}</h2><span style="width:44px"></span></div>`;
const menu=(icon,text,sub,act)=>`<button class="vc-menu" data-act="${act}">${I(icon)}<span>${text}<br><small>${sub}</small></span>${I('chevron-right')}</button>`;
const field=(label,id,value,type='text')=>`<label class="vc-field">${label}<input id="${id}" type="${type}" value="${E(value)}" ${type==='password'?'autocomplete="off" placeholder="留空保留已保存密钥"':''}></label>`;
const area=(label,id,value)=>`<label class="vc-field">${label}<textarea class="vc-form" id="${id}">${E(value)}</textarea></label>`;
const cover=(name,cls='')=>`<div class="vc-cover ${cls}"><small>VOCAST / AUDIOBOOK</small><b>${E(name.slice(0,12))}</b><small>让故事有声</small></div>`;
const book=()=>engine.book(bookId),chapter=()=>engine.chapter(bookId,chapterId),voice=()=>engine.state.voices.find(v=>v.id===voiceId);
const voiceName=id=>id?.startsWith('preset:')?'MiMo · '+id.slice(7):engine.state.voices.find(v=>v.id===id)?.name||'尚未分配';
const textLen=c=>c.unloaded?(c.textLength||0):(typeof c.text==='string'?c.text.length:(c.textLength||0));
const segCount=c=>c.unloaded?(c.segmentCount||0):(Array.isArray(c.segments)?c.segments.length:(c.segmentCount||0));
const fmt=seconds=>Math.floor(seconds/60).toString().padStart(2,'0')+':'+Math.floor(seconds%60).toString().padStart(2,'0');
const status=t=>({queued:'排队中',running:'制作中',paused:'已暂停',waiting:'待确认',failed:'失败',done:'已完成',cancelled:'已取消'}[t]||t);
function toast(message){$('#toast').textContent=message;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').textContent='',8000);}
async function busy(fn,label='正在处理…'){if(!$('#busy').hidden)return;$('#busy').hidden=false;$('#busy div').textContent=label;try{return await fn();}catch(e){toast(e.message||String(e));}finally{$('#busy').hidden=true;render();}}
function go(p){const open=()=>{const isTabSwitch=['raw','annotated','listen'].includes(page)&&['raw','annotated','listen'].includes(p);if(!isTabSwitch){history.push({page,bookId,chapterId,voiceId,roleName});}page=p;render();window.scrollTo(0,0);};if(['raw','annotated','listen','editseg','task','confirm'].includes(p)&&chapter().unloaded){busy(async()=>{await engine.ensureChapter(bookId,chapterId);open();},'读取章节…');}else open();}
function getChapterTarget(c){if(!c)return 'raw';const activeTask=engine?.state?.tasks?.slice()?.reverse()?.find(t=>t.bookId===bookId&&t.chapterId===c.id);if(c.status==='waiting'||(activeTask&&activeTask.status==='waiting')){return 'confirm';}if(c.audio){return 'listen';}const hasAnnotation=c.unloaded?((c.segmentCount||0)>0):(c.segments&&c.segments.length>0);if(hasAnnotation||c.status==='annotated'){return 'annotated';}return 'raw';}
window.appBack=()=>{if(['raw','annotated','listen','editseg','confirm'].includes(page)){while(history.length&&['raw','annotated','listen','editseg','confirm'].includes(history[history.length-1].page)){history.pop();}if(history.length&&history[history.length-1].page==='detail'&&history[history.length-1].bookId===bookId){const previous=history.pop();({page,bookId,chapterId,voiceId,roleName}=previous);}else{page='detail';}render();window.scrollTo(0,0);return;}const previous=history.pop();if(previous){({page,bookId,chapterId,voiceId,roleName}=previous);}else page='shelf';render();window.scrollTo(0,0);};
let lastProdStatus = null;
let waitingForNextChapterId = null;
window.checkAutoProduceUpcoming = checkAutoProduceUpcoming;
async function checkAutoProduceUpcoming(bid, cid){
  if(!engine || engine.state?.settings?.autoProduceUpcoming === false) return;
  const b = engine.state.books.find(x => x.id === bid);
  if(!b) return;
  const currIdx = b.chapters.findIndex(x => x.id === cid);
  if(currIdx < 0) return;
  const upcomingChapters = b.chapters.slice(currIdx + 1, currIdx + 3);
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
function nav(){return `<nav class="vc-nav" aria-label="主导航">${[['shelf','library','书架'],['voices','audio-lines','音色'],['tasks','list-checks','制作'],['settings','user-round','我的']].map(([p,i,t])=>`<button class="${page===p?'active':''}" data-act="go:${p}">${I(i)}${t}</button>`).join('')}</nav>`;}
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

  const headingHtml = multi ? `
    <div class="vc-batch-header">
      <div class="vc-batch-left">
        <h3>批量选择</h3>
      </div>
      <div class="vc-batch-right">
        <button class="vc-btn primary vc-top-make-btn" data-act="go:make" ${!selected.length?'disabled':''}>制作所选（${selected.length}）</button>
        ${L('完成','multiselect')}
      </div>
    </div>
    <div class="vc-batch-toolbar">
      <div class="vc-batch-tools">
        ${L('全选本页','selectpage')}
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
        ${L('批量制作','multiselect')}
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
    <div class="vc-split vc-bottom">${B('继续阅读','read:'+b.chapters[0].id,true)}${B('角色与音色','go:roles')}</div>
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
case 'raw':case 'annotated':case 'listen':{const b=book(),c=chapter();h=top(b.name)+`<div class="vc-tabs">${[['raw','原文'],['annotated','标注'],['listen','听书']].map(([p,n])=>`<button class="${page===p?'active':''}" data-act="go:${p}">${n}</button>`).join('')}</div>`+(page==='listen'?'':`<h3>${E(c.title)}</h3>`);
if(page==='raw')h+=typeof c.text==='string'?`<article class="reader">${E(c.text)}</article>`:`<div class="empty"><p>章节文本缺失，无法显示原文。</p><small>请删除本书后重新导入。</small></div>`;
if(page==='annotated'){
  if((c.segments||[]).length){
    const probCount=(c.segments||[]).filter(s=>!s.skip&&!s.isAd&&s.speaker!=='广告'&&(s.confidence<.65||!b.characters.some(r=>r.name===s.speaker))).length;
    h+=`<div class="vc-annotated-topbar"><div class="vc-annotated-summary"><span>共 ${segCount(c)} 个段落</span>${probCount?`<span class="vc-issue-badge">${I('alert-circle')} ${probCount} 处待确认</span>`:''}</div><div class="vc-annotated-actions">${c.audio?L('听书播放 →','go:listen'):B('制作本章音频','makeone',true)}</div></div>`+(c.segments||[]).map(s=>{const isProblem=!s.skip&&!s.isAd&&s.speaker!=='广告'&&(s.confidence<.65||!b.characters.some(r=>r.name===s.speaker));return `<div class="vc-quote ${isProblem?'vc-issue-card uncertain':s.speaker==='旁白'?'':'speaker'}"><div class="vc-row">${L(E(s.speaker)+' '+I('pencil'),'editseg:'+s.id)}<small>${E(s.emotion)}</small>${isProblem?`<span class="vc-issue-badge">${I('alert-circle')} 待确认说话人</span>`:''}</div><p class="vc-quote-text">${E(s.text)}</p>${isProblem?`<div class="vc-issue-actions">${L(I('pencil')+'修改说话人','editseg:'+s.id)}<button class="vc-btn-ignore" data-act="ignorespeaker:${s.id}">${I('fast-forward')} 忽略（默认旁白）</button></div>`:''}${s.audio&&s.audio!=='skip'?L(I('play')+'试听此句','play:'+s.audio):''}</div>`;}).join('');
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
  const speeds=[0.75,1,1.25,1.5,1.75,2];

  const activeProdTask = engine?.state.tasks.find(t => t.status === "running");
  let prodBanner = "";
  if (activeProdTask) {
    const tb = engine.state.books.find(x => x.id === activeProdTask.bookId);
    const tc = tb?.chapters.find(x => x.id === activeProdTask.chapterId);
    const doneSegs = tc?.segments?.filter(seg => seg.audio).length || 0;
    const totalSegs = tc?.segments?.length || 0;
    const pct = totalSegs > 0 ? Math.round((doneSegs / totalSegs) * 100) : 0;
    prodBanner = '<div class="vc-listening-prod-banner"><span class="vc-pulse-dot"></span><span>后台正在制作：' + E(tc?.title || '下一章') + ' (' + pct + '%)</span></div>';
  }
  h += prodBanner;
  h += '<div class="vc-player"><div class="vc-player-head"><div class="vc-kicker">' + E(b.name) + '</div><h3>' + E(c.title) + '</h3><small>' + E(b.characters.length + ' 角色演绎 · ' + fmt(c.duration||0)) + '</small></div>';
  h += c.audio?(()=>{ const segs = engine?.computeSegmentTimestamps ? engine.computeSegmentTimestamps(c.segments || [], c.duration || 0) : (c.segments || []); if (!segs || !segs.length) { return '<div class="vc-center"><small>时长 ' + fmt(c.duration || 0) + ' · 多角色演绎</small></div>'; } return '<div class="vc-lyric vc-transcript-panel" id="transcriptPanel" role="region" aria-label="逐句字幕跟读">' + segs.map((s, idx) => { return '<div class="vc-transcript-line' + (s.speaker && s.speaker !== '旁白' ? ' is-dialogue' : '') + '" data-act="seekseg:' + Math.round(s.startMs || 0) + '" data-start="' + Math.round(s.startMs || 0) + '" data-end="' + Math.round(s.endMs || 0) + '">' + '<span class="vc-transcript-speaker">' + E(s.speaker || '旁白') + '</span>' + '<span class="vc-transcript-text">' + E(s.text || '') + '</span>' + '</div>'; }).join('') + '</div>'; })():'<div class="empty"><p>本章尚未生成完整音频。</p>' + B('制作本章','makeone') + '</div>';
  if(c.audio){
    h += '<div class="vc-player-progress"><small id="playtime">00:00</small><input type="range" id="seek" class="big-progress" min="0" max="' + ((c.duration||0)*1000) + '" value="0" aria-label="播放进度"><small>' + fmt(c.duration||0) + '</small></div>';
    h += '<div class="vc-controls"><button class="vc-btn secondary icon' + (hasPrev?'':' disabled') + '" data-act="prevchapter" title="上一章"' + (hasPrev?'':' disabled') + '>' + I('skip-back') + '</button><button class="vc-btn secondary icon" data-act="seekback" title="快退15秒">' + I('rotate-ccw') + '</button><button class="vc-btn primary" data-act="playchapter" id="playBtn">' + I('play') + ' 播放</button><button class="vc-btn secondary icon" data-act="seeknext" title="快进15秒">' + I('rotate-cw') + '</button><button class="vc-btn secondary icon' + (hasNext?'':' disabled') + '" data-act="nextchapter" title="下一章"' + (hasNext?'':' disabled') + '>' + I('skip-forward') + '</button></div>';
    h += '<div class="vc-speed-row" role="group" aria-label="播放倍速"><span class="vc-speed-label">倍速</span>' + speeds.map(s => '<button class="vc-link-tag' + (Math.abs(s - curSpeed) < 0.01 ? ' active' : '') + '" data-act="setspeed:' + s + '">' + s + 'x</button>').join('') + '</div>';
    h += '<div class="vc-player-tools"><button class="vc-link-tag' + (engine?.state?.autoDeletePlayed ? ' active' : '') + '" data-act="toggleautodelete">完播自删 · ' + (engine?.state?.autoDeletePlayed ? '开' : '关') + '</button><button class="vc-link-tag' + (engine?.state?.settings?.keepRecentTwoChapters ? ' active' : '') + '" data-act="togglekeeprecent">保留前2章 · ' + (engine?.state?.settings?.keepRecentTwoChapters ? '开' : '关') + '</button><button class="vc-link-tag' + (engine?.state?.settings?.autoProduceUpcoming !== false ? ' active' : '') + '" data-act="toggleautoproduce">边听边做 · ' + (engine?.state?.settings?.autoProduceUpcoming !== false ? '开' : '关') + '</button><button class="vc-link-tag" data-act="export:' + c.audio + '">导出 WAV</button></div>';
    h += c.pacingVersion===1?'<p class="footer-note">已优化句末停顿</p>':(B('优化句末停顿','repace',true)+'<p class="footer-note">保留已有配音，补足句末间隔；多句对白会分句重生成。</p>');
  }
  h += '</div>';
}
break;}case 'editseg':{const c=chapter(),seg=c.segments.find(x=>x.id===editSegment);h=top('修正说话人')+`<div class="vc-quote"><p>${E(seg.text)}</p></div><label class="vc-field">角色<select id="segmentSpeaker">${book().characters.some(r=>r.name===seg.speaker)?'':'<option value="" disabled selected>请选择说话人</option>'}${book().characters.map(r=>`<option ${r.name===seg.speaker?'selected':''}>${E(r.name)}</option>`).join('')}</select></label>${field('本句演绎','segmentEmotion',seg.emotion)}${B('保存修正','saveseg')}<hr class="vc-sep">${field('如需新增角色','newRole','')}${field('角色音色描述（性别、年龄、声音听起来怎么样）','newRoleDescription','')}${B('添加角色','addrole',true)}<p class="footer-note">修正会将本句标记为待重生成，其他已完成片段保留。</p>`;break;}
case 'confirm':{
  const b=book(),c=chapter();
  const activeSpeakers=[...new Set(c.segments.filter(s=>!s.skip&&!s.isAd&&s.speaker!=='旁白'&&s.speaker!=='广告').map(s=>s.speaker))];
  const problemRoles=b.characters.filter(r=>(activeSpeakers.includes(r.name)||r.candidate)&&!r.voice);
  const problemSegments=c.segments.filter(s=>!s.skip&&!s.isAd&&s.speaker!=='广告'&&(s.confidence<.65||!b.characters.some(r=>r.name===s.speaker)));
  const hasProblems=problemRoles.length>0||problemSegments.length>0;

  h=top(c.title+' · 处理确认');

  if(hasProblems){
    const problemDesc=(problemRoles.length?problemRoles.length+' 个角色音色':'')+(problemRoles.length&&problemSegments.length?' · ':'')+(problemSegments.length?problemSegments.length+' 处说话人':'');
    h+=`
      <div class="vc-confirm-top-panel">
        <div class="vc-confirm-top-header">
          <div class="vc-confirm-top-title-wrap">
            <span class="vc-confirm-top-badge">${I('alert-circle')} 待确认处理</span>
            <span class="vc-confirm-top-count">${problemDesc}</span>
          </div>
          <p class="vc-sub">系统检测到待确认的角色音色或对白，可在下方逐项校对，或一键全部忽略直接进入制作。</p>
        </div>
        <div class="vc-confirm-top-actions">
          <button class="vc-btn primary full vc-btn-ignoreall-top" data-act="ignoreall:${c.id}">
            ${I('check-check')} 一键全部忽略并继续制作
          </button>
        </div>
      </div>
    `;
  }else{
    h+=`
      <div class="vc-note">
        <b>${E(b.name)}</b> · ${E(c.title)}
        <br><small>本章所有角色与说话人已就绪。</small>
      </div>
    `;
  }

  if(problemRoles.length){
    h+=`<div class="vc-issue-header">
      <h4>${I('users')} 待确认角色音色 (${problemRoles.length})</h4>
      <p class="vc-sub">检测到新角色或未配置音色，忽略则自动设计并采用专属音色</p>
    </div>`+problemRoles.map(r=>`
      <div class="vc-panel vc-issue-card">
        <div class="vc-row">
          <div class="vc-avatar warn">${E(r.name[0])}</div>
          <div style="flex:1">
            <h3 class="vc-issue-speaker">${E(r.name)}</h3>
            <small>${r.candidate?'AI 已设计候选样本':r.suggestedVoice?'AI 建议匹配已有音色':'等待设计或分配音色'}</small>
          </div>
          <span class="vc-issue-badge">${I('alert-circle')} 待确认音色</span>
        </div>
        <p class="vc-sub" style="margin-top:8px">${E(r.description||'无描述')}</p>
        ${r.candidate?`<div class="vc-row" style="margin:8px 0"><small>试听音色：「${E(r.candidate.name||r.name)}」</small>${L(I('play')+'试听样本','play:'+r.candidate.sample)}</div>`:''}
        <div class="vc-issue-actions">
          ${r.candidate?B('采用此音色','acceptrole:'+r.name):r.suggestedVoice?B('采用匹配音色','acceptsuggested:'+r.name):B('设计并试听','candidate:'+r.name,true)}
          ${L('手动选音色','chooserole:'+r.name)}
          <button class="vc-btn-ignore" data-act="ignorerole:${E(r.name)}">${I('fast-forward')} 忽略（自动设计）</button>
        </div>
      </div>
    `).join('');
  }

  if(problemSegments.length){
    h+=`<div class="vc-issue-header">
      <h4>${I('message-square-warning')} 待确认说话人 (${problemSegments.length})</h4>
      <p class="vc-sub">AI 识别置信度偏低或说话人归属存疑，忽略则默认归为「旁白」</p>
    </div>`+problemSegments.map(s=>`
      <div class="vc-quote vc-issue-card">
        <div class="vc-row">
          <span class="vc-issue-speaker">${E(s.speaker)}</span>
          <span class="vc-issue-badge">${I('alert-circle')} 待确认说话人</span>
        </div>
        <p class="vc-quote-text">${E(s.text)}</p>
        <div class="vc-issue-actions">
          ${L(I('pencil')+'修改说话人','editseg:'+s.id)}
          <button class="vc-btn-ignore" data-act="ignorespeaker:${s.id}">${I('fast-forward')} 忽略（默认旁白）</button>
        </div>
      </div>
    `).join('');
  }

  if(!hasProblems){
    h+=`<div class="vc-panel" style="text-align:center;padding:28px 16px">
      <div style="font-size:36px;color:var(--vc-accent);margin-bottom:10px">${I('check-circle')}</div>
      <h3>本章已无待确认问题</h3>
      <p class="vc-sub">角色音色与对白说话人均已就绪，可继续进行配音合成。</p>
      <div class="vc-split" style="margin-top:18px">
        ${B('继续制作本章','resumechapter:'+c.id)}
        ${B('返回章节目录','back',true)}
      </div>
    </div>`;
  }
  break;
}
case 'voices':h=title('VOICE LIBRARY · 声音档案','音色库',B(I('plus'),'importvoices',true))+`<div class="vc-tabs"><button class="${voiceTab==='mine'?'active':''}" data-act="voicetab:mine">我的音色 · ${state.voices.length}</button><button class="${voiceTab==='preset'?'active':''}" data-act="voicetab:preset">MiMo 预设</button></div>`+(voiceTab==='mine'?`<div class="vc-note">导入和设计统一保存，AI 根据描述匹配可用音色。</div><div class="vc-split">${B('导入音频','importvoices')}${B('设计新音色','newdesign',true)}</div>${state.voices.length?state.voices.map(v=>`<div class="vc-panel vc-card-clickable" data-act="voice:${v.id}"><div class="vc-row"><div class="vc-avatar">${I(v.source==='import'?'mic':'sparkles')}</div><div style="flex:1"><h3 class="voice-name">${E(v.name)}</h3><small>${v.source==='import'?'用户导入':'AI 设计'} · ${v.format.toUpperCase()}</small></div>${T(v.tested?'已试音':'可使用')}</div><p class="vc-sub">${E(v.description)}</p><div class="vc-row"><small>${v.enabled?'参与 AI 匹配':'仅手动选用'}</small><div style="display:flex;align-items:center;gap:14px"><span class="vc-link-text">管理 / 试听 →</span>${L(I('trash-2')+'删除','deletevoice:'+v.id)}</div></div></div>`).join(''):'<div class="empty"><p>还没有自己的音色。</p><small>导入文件名即描述，朗读内容不限。</small></div>'}`:Vocast.PRESETS.map(v=>`<div class="vc-preset-row"><div class="vc-preset-title">${I('volume-2')}${E(v)}</div><button class="vc-preset-btn" data-act="preset:${E(v)}">${I('play')} 试听</button></div>`).join(''));break;
case 'voiceimport':h=top('导入样本')+`<h1 class="vc-title">一段朗读，就是一种声音。</h1><p class="vc-sub">文件名自动成为音色描述，可修改。MP3 / WAV；编码后不超过 10 MB。</p>${imports.map((f,i)=>`<div class="vc-panel"><p class="vc-filename">${E(f.name)}</p>${field('音色描述','import-'+i,f.name.replace(/\.[^.]+$/,''))}<div class="vc-row"><small>${f.format.toUpperCase()} · ${(f.size/1000000).toFixed(2)} MB</small>${L('播放样本','play:'+f.id)}</div></div>`).join('')}<button class="vc-btn full" data-act="saveimports">保存 ${imports.length} 个样本</button><p class="footer-note">可直接用于克隆合成，不必先设计或创建声音 ID。</p>`;break;
case 'voicedetail':{const v=voice();h=top('我的音色')+field('音色名称','vname',v.name)+area('音色描述 · 匹配依据（性别、年龄、声音听起来怎么样）','vdescription',v.description)+`<label class="vc-label"><span>参与 AI 自动匹配</span><input type="checkbox" id="venabled" ${v.enabled?'checked':''}></label><div class="vc-split">${B('播放参考样本','play:'+v.sample,true)}${B('保存描述','savevoice')}</div><div class="vc-panel"><h3>克隆试音</h3>${area('用此声线朗读新文本','trialText','山里的风停了，故事才刚刚开始。')}${B('生成并播放试音','trial')}</div><div class="vc-danger-zone"><button class="vc-btn danger full" data-act="deletevoice:${v.id}">${I('trash-2')} 删除此音色</button></div><p class="footer-note">删除后，该音色将从音色库移除，已绑定此音色的角色将恢复为未分配状态。</p>`;break;}
case 'design':h=top(roleName?'确认新角色音色':'设计新音色')+`${roleName?`<div class="vc-note">音色名直接使用角色名「${E(roleName)}」，采用后存入我的音色并继续制作。</div>`:field('音色名称（直接使用角色名或简练特征）','designName',candidate?.name||'新音色')}${area('音色描述（仅描述声音：性别、年龄、声音听起来怎么样，如：六七岁的小女孩，说话奶声奶气）','designDescription',candidate?.description||(roleName?book().characters.find(r=>r.name===roleName)?.description:'')||'')}${area('样本朗读内容','designText',candidate?.previewText||'清晨的风穿过树林，远方的故事刚刚开始。')}<div class="vc-split">${B(candidate?'重新生成样本':'生成试听样本','designsample')}${candidate?B('试听样本','play:'+candidate.sample,true):''}</div>${candidate?`<div class="vc-note">候选样本已返回，确认后可复用。</div><button class="vc-btn full" data-act="acceptsample">${roleName?'采用样本并继续配音':'保存到我的音色'}</button>`:''}`;break;
case 'roles':{const b=book();h=top('角色与音色')+`<h1 class="vc-title">角色绑定，全书一致。</h1><p class="vc-sub">${E(b.name)} · 已有音色直接复用，仅新设计等待确认。</p>${b.characters.map(r=>{const isProblem=!r.voice;return `<div class="vc-panel ${isProblem?'vc-issue-card':''}"><div class="vc-row"><div class="vc-avatar ${isProblem?'warn':''}">${E(r.name[0])}</div><div style="flex:1"><h3 class="${isProblem?'vc-issue-speaker':''}">${E(r.name)}</h3><small>${E(voiceName(r.voice))}</small></div>${isProblem?`<span class="vc-issue-badge">${I('alert-circle')} 待确认音色</span>`:T('已分配')}</div><p class="vc-sub">${E(r.description)}</p>${r.reason?`<p class="mini">${E(r.reason)}</p>`:''}<div class="${isProblem?'vc-issue-actions':'vc-row'}">${L('手选音色','chooserole:'+r.name)}${r.candidate?L('试听并确认新设计','candidate:'+r.name):''}${isProblem?`<button class="vc-btn-ignore" data-act="ignorerole:${E(r.name)}">${I('fast-forward')} 忽略（自动设计）</button>`:''}</div></div>`;}).join('')}${menu('workflow','本书音色策略','优先复用我的音色','go:policy')}`;break;}
case 'choose':h=top('为'+roleName+'选音色')+`<div class="vc-note">更换绑定后，本书已有的该角色片段将标记为待重制，其他角色保留。</div><h3>我的音色</h3>${state.voices.map(v=>menu('audio-lines',E(v.name),E(v.description),'bind:'+v.id)).join('')}<h3 style="margin-top:22px">MiMo 预设</h3>${Vocast.PRESETS.map(v=>menu('volume-2',E(v),'直接合成','bind:preset:'+v)).join('')}`;break;
case 'policy':{const st=bookId?(book().policy||state.settings):state.settings;h=top(bookId?'本书音色策略':'全局音色策略')+`<div class="vc-flow"><div><b>1</b><span>沿用角色已有绑定</span></div><div><b>2</b><span>AI 按描述匹配我的音色</span></div><div><b>3</b><span>没有合适音色才新设计</span></div></div>${bookId?`<label class="vc-label"><span>跟随全局设置</span><input id="inherit" type="checkbox" ${book().policy?'':'checked'}></label>`:''}<label class="vc-field">新设计确认方式<select id="policyMode"><option value="manual" ${st.mode==='manual'?'selected':''}>确认样本后使用（默认）</option><option value="auto" ${st.mode==='auto'?'selected':''}>全自动，仅失败时处理</option></select></label><label class="vc-label"><span>允许匹配 MiMo 预设</span><input id="usePresets" type="checkbox" ${st.usePresets?'checked':''}></label><label class="vc-field">可恢复错误重试<select id="retries">${[0,1,2,3].map(n=>`<option ${n===Number(state.settings.retries)?'selected':''}>${n}</option>`).join('')}</select></label>${B('保存策略','savepolicy')}<p class="footer-note">鉴权与额度错误不会持续重试。修改策略不会更换已有角色音色。</p>`;break;}
case 'make':h=top('批量制作')+`<h1 class="vc-title">制作 ${selected.length} 个章节</h1><div class="vc-panel"><h3>${E(book().name)}</h3><p class="vc-sub">${book().chapters.filter(c=>selected.includes(c.id)).slice(0,3).map(c=>E(c.title)).join('、')}${selected.length>3?' 等 '+selected.length+' 章':''}</p>${selected.length>3?`<details><summary>查看全部所选章节</summary><p class="vc-sub">${book().chapters.filter(c=>selected.includes(c.id)).map(c=>E(c.title)).join('、')}</p></details>`:''}</div>${menu('brain-circuit','语言模型',E(state.settings.llmModel),'go:llm')}${menu('audio-lines','MiMo TTS','预设 / 参考音频克隆自动选择','go:mimo')}${menu('workflow','新角色音色策略',(book().policy||state.settings).mode==='auto'?'全自动，失败后处理':'新设计候选样本等待确认','go:policy')}<button class="vc-btn full vc-bottom" data-act="enqueue">加入队列并开始制作</button><p class="footer-note">离开应用时在当前请求结束后暂停并保存。返回制作页可继续；已完成片段不重复调用。</p>`;break;
case 'tasks':{const isMaking=t=>['running','queued','waiting','paused','failed'].includes(t.status);const isFinished=t=>['done','cancelled'].includes(t.status);const hasProducing=state.tasks.some(t=>['queued','running'].includes(t.status));const hasPausedTasks=state.tasks.some(t=>['paused','failed'].includes(t.status));let topBtn='';if(hasProducing)topBtn=B('全部暂停','pauseall',true);else if(hasPausedTasks)topBtn=B('继续制作','resumeall',true);const rank=t=>t.status==='running'?0:t.status==='queued'?1:t.status==='waiting'?2:t.status==='paused'?3:t.status==='failed'?4:9;const makingList=state.tasks.filter(isMaking).sort((a,b)=>rank(a)-rank(b)||(b.created||0)-(a.created||0));const finishedList=state.tasks.filter(isFinished).sort((a,b)=>(b.created||0)-(a.created||0));const card=t=>{let b=null,c=null;try{b=engine.book(t.bookId);c=engine.chapter(t.bookId,t.chapterId);}catch(e){b=null;c=null;}if(!b||!c){const pct0=t.total?Math.round(t.done/t.total*100):0;return `<div class="vc-panel"><div class="vc-row">${T(status(t.status),['failed','waiting'].includes(t.status)?'warn':t.status==='running'?'running':'')}<small>${E(t.phase||'')}</small></div><h3 style="margin-top:14px">关联内容已移除</h3><p>该任务对应的书籍或章节已不存在，可安全移除此条记录，不影响其他任务。</p><div class="vc-meter"><span style="width:${pct0}%"></span></div><p class="vc-sub">${t.done} / ${t.total||'—'} 句 ${E(t.message||'')}</p><div class="vc-row"><span class="vc-link-text">查看详情 →</span>${L(I('trash-2')+'移除','removetask:'+t.id)}</div></div>`;}const pct=t.total?Math.round(t.done/t.total*100):0;let acts='';if(t.status==='waiting')acts+=L('处理确认','task:'+t.id);else if(['paused','failed'].includes(t.status))acts+=L('继续 / 重试','resume:'+t.id);else if(t.status==='running'||t.status==='queued')acts+=L('暂停','pause:'+t.id);else if(t.status==='done'){let canListen=false;try{canListen=!!engine.chapter(t.bookId,t.chapterId).audio;}catch(e){}if(canListen)acts+=`<button class="vc-btn primary" data-act="listentask:${t.id}">开始听书</button>`;}else if(t.status==='cancelled')acts+=L('重新制作','remake:'+t.id);if(!['done','cancelled'].includes(t.status))acts+=L(I('x')+'取消','cancel:'+t.id);else acts+=L(I('trash-2')+'移除','removetask:'+t.id);return `<div class="vc-panel vc-card-clickable" data-act="task:${t.id}"><div class="vc-row">${T(status(t.status),['failed','waiting'].includes(t.status)?'warn':t.status==='running'?'running':'')}<small>${E(t.phase)}</small></div><h3 style="margin-top:14px">${E(b.name)}</h3><p>${E(c.title)}</p><div class="vc-meter"><span style="width:${pct}%"></span></div><p class="vc-sub">${t.done} / ${t.total||'—'} 句 ${E(t.message||'')}</p><div class="vc-row"><span class="vc-link-text">查看详情 →</span>${acts}</div></div>`;};h=title('PRODUCTION STUDIO','制作任务',topBtn)+(state.tasks.length?((makingList.length?`<h3 style="margin:14px 0 8px">制作中 · ${makingList.length}</h3>`+makingList.map(card).join(''):'')+(finishedList.length?`<h3 style="margin:18px 0 8px">制作完成 · ${finishedList.length}</h3>`+finishedList.map(card).join(''):'')):'<div class="empty"><p>暂无制作任务</p>'+B('从书架选择章节','go:shelf')+'</div>');break;}
case 'task':{const t=state.tasks.find(t=>t.id===window.currentTask);if(!t){h=top('制作详情')+`<div class="empty"><p>任务记录不存在或已被移除。</p>`+B('返回任务列表','go:tasks')+`</div>`;break;}let c=null;try{c=engine.chapter(t.bookId,t.chapterId);}catch(e){c=null;}if(!c){h=top('制作详情')+`<div class="vc-row">${T(status(t.status),['failed','waiting'].includes(t.status)?'warn':t.status==='running'?'running':'')}<small>${E(t.phase||'')}</small></div><h1 class="vc-title">关联内容已移除</h1><p class="vc-sub">${E(t.message||'该任务对应的书籍或章节已不存在。')}</p><div class="vc-bottom">`+B('移除任务记录','removetask:'+t.id,true)+B('返回任务列表','go:tasks',true)+`</div>`;break;}h=top('制作详情')+`<div class="vc-row">${T(status(t.status),['failed','waiting'].includes(t.status)?'warn':t.status==='running'?'running':'')}<small>${E(t.phase)}</small></div><h1 class="vc-title">${E(c.title)}</h1><p class="vc-sub">${E(t.message)}</p>${t.status==='waiting'?`<div class="vc-panel vc-issue-card" style="margin:12px 0"><div class="vc-row"><b>检测到待确认事项</b>${B('进入处理确认界面','confirm:'+c.id)}</div><p class="vc-sub" style="margin-top:6px">${E(t.message)}</p></div>`:''}${menu('users-round','角色与音色','查看匹配结果及待确认的新样本','go:roles')}${menu('file-text','校对说话人','不确定的对白等待你校对','go:annotated')}${c.segments?c.segments.map(s=>`<div class="task-row"><div class="vc-row"><span>${E(s.speaker)}</span>${T(s.audio?'已完成':s.confidence<.65?'待校对':'待合成',!s.audio)}</div><p class="vc-sub">${E(s.text)}</p>${s.confidence<.65?`<div class="vc-issue-actions" style="margin-top:6px"><button class="vc-btn-ignore" data-act="ignorespeaker:${s.id}">${I('fast-forward')} 忽略（设为旁白）</button></div>`:''}${s.audio&&s.audio!=='skip'?L('试听','play:'+s.audio):''}</div>`).join(''):''}<div class="vc-bottom">${t.status==='done'?B('返回任务列表','go:tasks',true):t.status==='running'?B('完成当前句后暂停','pause:'+t.id,true):t.status==='cancelled'?B('重新加入制作','remake:'+t.id):B('继续 / 重试任务','resume:'+t.id)}${!['done','cancelled'].includes(t.status)?B('取消此任务','cancel:'+t.id,true,false,'danger'):B('移除任务记录','removetask:'+t.id,true)}</div>`;break;}
case 'models':h=top('模型配置')+`<h1 class="vc-title">一个声音引擎，自选理解模型。</h1><div class="vc-panel"><div class="vc-row"><h3>MiMo TTS</h3>${T(configured.ttsConfigured?'已配置':'待配置',!configured.ttsConfigured)}</div><p class="vc-sub">预设合成、音色设计、参考样本克隆。</p>${L('配置连接 →','go:mimo')}</div><div class="vc-panel"><div class="vc-row"><h3>语言模型</h3>${T(configured.llmConfigured?'已配置':'待配置',!configured.llmConfigured)}</div><p class="vc-sub">${E(state.settings.llmModel)}</p><p class="vc-model-id">${E(state.settings.llmBase)}</p>${L('配置连接 →','go:llm')}</div>`;break;
case 'llm':h=top('语言模型')+`<div class="vc-note">默认 MiniMax 中国区 Token Plan。密钥与区域必须对应，不自动切换国际区。</div><label class="vc-field">接口协议<select id="llmProtocol"><option value="openai" ${state.settings.llmProtocol==='openai'?'selected':''}>OpenAI 兼容</option><option value="anthropic" ${state.settings.llmProtocol==='anthropic'?'selected':''}>Anthropic Messages</option></select></label>${field('Base URL','llmBase',state.settings.llmBase)}${field('模型 ID','llmModel',state.settings.llmModel)}${field('API Key','llmKey','','password')}<div class="vc-split">${B('保存配置','savellm')}${B('真实连接测试','testllm',true)}</div><p class="footer-note">测试使用已保存的配置，会实际调用一次语言模型。</p>`;break;
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
          <strong>滑动保留最近2章</strong>
          <small style="color:var(--vc-sub);">完播或切章自删时，额外保留当前正在听的前2章缓存供回听</small>
        </div>
        <button class="vc-btn ${engine.state.settings?.keepRecentTwoChapters ? 'primary' : 'secondary'}" data-act="togglekeeprecent">
          ${engine.state.settings?.keepRecentTwoChapters ? '已开启' : '已关闭'}
        </button>
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
$('#screen').innerHTML=`<main class="vc-main ${miniHtml ? 'with-mini-player' : ''}">${h}</main>${miniHtml}${nav()}${modalHtml}`;lucide.createIcons({attrs:{width:20,height:20}});
try{if(page==='listen'&&__keepTop!==null&&__keepTop!==undefined){const __n=document.getElementById('transcriptPanel');if(__n)__n.scrollTop=__keepTop;}}catch(__e){}
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
  if(btn&&btn.dataset.playing!==String(isPlay)){btn.dataset.playing=String(isPlay);btn.innerHTML=`${I(isPlay?'pause':'play')} ${isPlay?'暂停':'播放'}`;lucide.createIcons({attrs:{width:20,height:20}});}
  const curSpeed = engine?.state?.playbackSpeed || 1;
  document.querySelectorAll('[data-act^="setspeed:"]').forEach(b=>{const s=parseFloat(b.dataset.act.split(':')[1]);b.classList.toggle('active',Math.abs(s-curSpeed)<0.01);});
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
      const txt='后台正在制作：'+(tc?.title||'下一章')+' ('+pct+'%)';
      if(existingBanner){
        if(existingBanner.__txt!==txt){existingBanner.__txt=txt;const label=existingBanner.querySelector('span:last-child');if(label)label.textContent=txt;}
      }else{
        const d=document.createElement('div');d.className='vc-listening-prod-banner';d.__txt=txt;
        const dot=document.createElement('span');dot.className='vc-pulse-dot';
        const label=document.createElement('span');label.textContent=txt;
        d.appendChild(dot);d.appendChild(label);
        const playerEl=document.querySelector('.vc-player');
        if(playerEl&&playerEl.parentNode)playerEl.parentNode.insertBefore(d,playerEl);
      }
    }else if(existingBanner){existingBanner.remove();}
  }catch(bannerErr){}
}
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
if(a==='go'){go(x);return;}if(a==='back'){appBack();return;}

if(a==='resumebook'){const [bid,cid]=x.split(':');bookId=bid;chapterId=cid;page='listen';render();await playCurrentChapter(bid,cid);return;}
if(a==='resumechapter'){const c=book()?.chapters?.find(ch=>ch.id===x);if(c?.audio){chapterId=x;page='listen';render();await playCurrentChapter(bookId,x);return;}const existing=engine.state.tasks.find(t=>t.bookId===bookId&&t.chapterId===x&&!['done','cancelled'].includes(t.status));const job=existing?engine.resume(existing.id):engine.enqueue(bookId,[x]);job.catch(e=>toast(e.message));toast('已开始制作');go('detail');return;}
if(a==='setspeed'){const sp=parseFloat(x);if(!(sp>0)){toast('无效的倍速');return;}engine.state.playbackSpeed=sp;await engine.persist();try{await device.call('playback',{op:'speed',value:sp});}catch(e){}toast('已设置 '+sp+'x 倍速');if(page==='listen'){document.querySelectorAll('[data-act^="setspeed:"]').forEach(b=>{const s=parseFloat(b.dataset.act.split(':')[1]);b.classList.toggle('active',Math.abs(s-sp)<0.01);});}else{render();}return;}

if(a==="toggleautoproduce"){
if(!engine.state.settings)engine.state.settings={};
engine.state.settings.autoProduceUpcoming=engine.state.settings.autoProduceUpcoming===false?true:false;
await engine.persist();
toast("听书自动预制: "+(engine.state.settings.autoProduceUpcoming?"已开启":"已关闭"));
if(page==="listen"){document.querySelectorAll('[data-act="toggleautoproduce"]').forEach(b=>{const on=engine.state.settings.autoProduceUpcoming!==false;b.classList.toggle("active",on);b.textContent="边听边做 · "+(on?"开":"关");});}else{render();}return;}
if(a==='toggleautodelete'){engine.state.autoDeletePlayed=!engine.state.autoDeletePlayed;await engine.persist();toast('完播自动释放: '+(engine.state.autoDeletePlayed?'已开启':'已关闭'));if(page==='listen'){document.querySelectorAll('[data-act="toggleautodelete"]').forEach(b=>{b.classList.toggle('active',!!engine.state.autoDeletePlayed);b.textContent='完播自删 · '+(engine.state.autoDeletePlayed?'开':'关');});}else{render();}return;}
if(a==='togglekeeprecent'){
if(!engine.state.settings)engine.state.settings={};
engine.state.settings.keepRecentTwoChapters=!engine.state.settings.keepRecentTwoChapters;
await engine.persist();
toast('保留最近2章: '+(engine.state.settings.keepRecentTwoChapters?'已开启':'已关闭'));
if(page==='listen'){document.querySelectorAll('[data-act="togglekeeprecent"]').forEach(b=>{b.classList.toggle('active',!!engine.state.settings.keepRecentTwoChapters);b.textContent='保留前2章 · '+(engine.state.settings.keepRecentTwoChapters?'开':'关');});}else{render();}return;}
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
if(a==='confirm'){chapterId=x;go('confirm');return;}
if(a==='ignorerole'){await busy(async()=>{const b=book();const ch=b.characters.find(r=>r.name===x);if(ch){if(!ch.candidate){ch.candidate=await engine.design(ch.description||'清晰自然的人物声音','清晨的风穿过树林，远方的故事刚刚开始。',ch.name);}await engine.saveVoice(ch.candidate);ch.voice=ch.candidate.id;ch.candidate=null;await engine.persist();await engine.resumeWaiting(bookId);toast('角色「'+ch.name+'」已自动采用设计音色');}},'正在自动设计音色…');render();return;}
if(a==='ignorespeaker'){const c=chapter();const seg=c.segments.find(s=>s.id===Number(x));if(seg){seg.speaker='旁白';seg.confidence=1;seg.audio=null;seg.emotion='自然朗读';c.audio=null;c.status='annotated';engine.touch(c);for(const t of engine.state.tasks.filter(t=>t.bookId===bookId&&t.chapterId===chapterId)){t.done=c.segments.filter(s=>s.audio).length;if(t.status==='done')t.status='paused';}await engine.persist();await engine.resumeWaiting(bookId);toast('该句说话人已设为旁白');render();}return;}
if(a==='ignoreall'){await busy(async()=>{const b=book(),c=chapter();const activeSpeakers=[...new Set(c.segments.filter(s=>!s.skip&&!s.isAd&&s.speaker!=='旁白'&&s.speaker!=='广告').map(s=>s.speaker))];const rolesToFix=b.characters.filter(r=>(activeSpeakers.includes(r.name)||r.candidate)&&!r.voice);for(const ch of rolesToFix){if(!ch.candidate){ch.candidate=await engine.design(ch.description||'清晰自然的人物声音','清晨的风穿过树林，远方的故事刚刚开始。',ch.name);}await engine.saveVoice(ch.candidate);ch.voice=ch.candidate.id;ch.candidate=null;}for(const seg of c.segments){if(!seg.skip&&!seg.isAd&&seg.speaker!=='广告'&&(seg.confidence<.65||!b.characters.some(r=>r.name===seg.speaker))){seg.speaker='旁白';seg.confidence=1;seg.audio=null;seg.emotion='自然朗读';}}c.audio=null;c.status='annotated';engine.touch(c);for(const t of engine.state.tasks.filter(t=>t.bookId===bookId&&t.chapterId===chapterId)){t.done=c.segments.filter(s=>s.audio).length;}await engine.persist();await engine.resumeWaiting(bookId);toast('已全部忽略并继续制作');},'正在处理全部待确认项…');render();return;}
if(a==='acceptrole'){const bid=bookId;await busy(async()=>{await engine.accept(bid,x,false);toast('已采用角色「'+x+'」专属音色');},'正在保存音色…');engine.resumeWaiting(bid).catch(e=>toast(e.message));render();return;}
if(a==='acceptsuggested'){const ch=book().characters.find(r=>r.name===x);if(ch&&ch.suggestedVoice){await engine.bind(bookId,x,ch.suggestedVoice);toast('已为角色「'+x+'」绑定音色');render();}return;}
if(a==='resumechapter'){const existing=engine.state.tasks.find(t=>t.bookId===bookId&&t.chapterId===x&&!['done','cancelled'].includes(t.status));const job=existing?engine.resume(existing.id):engine.enqueue(bookId,[x]);job.catch(e=>toast(e.message));toast('已开始制作');go('detail');return;}
if(a==='samplebook'){await busy(async()=>{const b=await engine.addBook('雾山来信 · 示例文本','第一章 山中来信\n雨停了，青年男子沈砚推开木门。\n“你终于来了。”沈砚用低沉温润的声音说。\n年轻女子林晚抬起头，用清亮的声音问：“这封信是谁寄来的？”\n第二章 天亮之前\n清晨，沈砚走出邮局。\n“别担心，我会回来。”他轻声说。');bookId=b.id;chapterId=b.chapters[0].id;chapterPage=0;episodeModalOpen=false;go('detail');});return;}
if(a==='importbook'){await busy(async()=>{const files=await device.call('pick',{kind:'book'});for(const f of files){const b=await engine.addBook(f.name,f.text);bookId=b.id;chapterId=b.chapters[0].id;chapterPage=0;episodeModalOpen=false;if(b.importWarnings&&b.importWarnings.length){b._warnNotified=true;device.call('notify',{channel:'notice',title:'书籍导入提示 · '+b.name,message:b.importWarnings.join('\n'),type:'info'}).catch(()=>{});}}go('detail');},'选择并解析小说…');return;}
if(a==='multiselect'){multi=!multi;render();return;}
if(a==='selectunfinished'){selected=book().chapters.filter(c=>!c.audio).map(c=>c.id);render();return;}
if(a==='selectpage'){const b=book();const cur=b.chapters.slice(chapterPage*50,(chapterPage+1)*50).map(c=>c.id);selected=[...new Set([...selected,...cur])];render();return;}
if(a==='selectnone'){selected=[];render();return;}
if(a==='openepisodes'){episodeModalOpen=true;render();return;}
if(a==='closeepisodes'){episodeModalOpen=false;render();return;}
if(a==='setchpage'){chapterPage=Number(x)||0;episodeModalOpen=false;render();return;}
if(a==='analyze'){await busy(()=>engine.analyze(bookId,chapterId),'正在实际调用语言模型，识别角色…');return;}
if(a==='makeone'){selected=[chapterId];go('make');return;}
if(a==='enqueue'){if(!configured.llmConfigured||!configured.ttsConfigured){toast('请先配置语言模型和 MiMo 密钥');go('models');return;}const ids=[...selected];go('tasks');engine.enqueue(bookId,ids).catch(e=>toast(e.message));return;}
if(a==='task'||a==='taskroles'){const t=engine.state.tasks.find(t=>t.id===x);window.currentTask=t.id;bookId=t.bookId;chapterId=t.chapterId;go(a==='task'?'task':'roles');return;}
if(a==='pause'){await engine.pause(x);toast('将在当前请求完成后暂停');return;}
if(a==='resume'){engine.resume(x).catch(e=>toast(e.message));return;}
if(a==='cancel'){await engine.cancel(x);toast('任务已取消');render();return;}
if(a==='pauseall'){const active=engine.state.tasks.filter(t=>['queued','running'].includes(t.status));for(const t of active)await engine.pause(t.id);toast(active.length?`已暂停 ${active.length} 个任务，当前句子完成后停止`:'没有正在制作的任务');render();return;}
if(a==='resumeall'){const paused=engine.state.tasks.filter(t=>['paused','failed'].includes(t.status));for(const t of paused){t.pauseRequested=false;t.status='queued';}await engine.persist();engine.run().catch(e=>toast(e.message));toast(paused.length?`已继续制作 ${paused.length} 个任务`:'没有可继续的任务');render();return;}
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
if(a==='trial'){const text=value('trialText');await busy(async()=>{const file=await engine.synthesize(text,voiceId);voice().tested=true;voice().lastTrial=file.id;await engine.persist();await device.call('play',{id:file.id,title:'音色试音'});toast('克隆试音已生成并播放');},'MiMo 正在克隆合成试音…');return;}
if(a==='preset'){await busy(async()=>{const f=await engine.synthesize('山里的风停了，故事才刚刚开始。','preset:'+x);await device.call('play',{id:f.id,title:'MiMo · '+x});},'正在合成预设试听…');return;}
if(a==='play'){await device.call('play',{id:x,title:'Vocast 试听'});playingId=x;playingBookId=null;playingChapterId=null;return;}
if(a==='repace'){engine.optimizePauses(bookId,chapterId).catch(e=>toast(e.message));toast('已开始优化句末停顿，可在制作队列查看进度');go('tasks');return;}
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
if(a==='seekback'||a==='seeknext'){await seekDisplayedChapter('seek',null,a==='seekback'?-15000:15000);return;}
if(a==='export'){const exportName='[Vocast有声书]《'+book().name+'》-'+chapter().title;await device.call('export',{id:x,name:exportName});toast('已导出：'+exportName+'.wav');return;}
if(a==='globalpolicy'){go('policy');bookId=null;render();return;}
if(a==='savepolicy'){const p={mode:value('policyMode'),usePresets:$('#usePresets').checked};engine.state.settings.retries=Number(value('retries'));if(bookId)book().policy=$('#inherit').checked?null:p;else Object.assign(engine.state.settings,p);await engine.persist();toast('策略已保存');return;}
if(a==='savellm'){const base=value('llmBase').trim().replace(/\/$/,'');if(!/^https:\/\//.test(base)||!value('llmModel').trim())throw Error('请填写 HTTPS 地址和模型 ID');await device.call('saveCredentials',{llmKey:value('llmKey'),llmBase:base});Object.assign(engine.state.settings,{llmBase:base,llmModel:value('llmModel').trim(),llmProtocol:value('llmProtocol')});await engine.persist();configured=await device.call('load');go('models');return;}
if(a==='savemimo'){await device.call('saveCredentials',{ttsKey:value('ttsKey')});configured=await device.call('load');go('models');return;}
if(a==='testllm'){await busy(async()=>{const result=await engine.llm('只输出 JSON：{"ok":true}');if(result.ok!==true)throw Error('模型测试返回格式不符合预期');await engine.persist();toast('真实语言模型调用成功');},'正在验证真实语言模型调用…');return;}
if(a==='testmimo'){await busy(async()=>{const f=await engine.synthesize('连接成功，现在可以开始制作有声书。','preset:白桦');await engine.persist();await device.call('play',{id:f.id,title:'MiMo 连接测试'});toast('真实合成成功，音频已播放');},'正在调用 MiMo 合成测试语音…');return;}
if(a==='editseg'){editSegment=Number(x);go('editseg');return;}
if(a==='saveseg'){const reviewing=history.some(h=>h.page==='confirm'&&h.bookId===bookId&&h.chapterId===chapterId);await engine.correct(bookId,chapterId,editSegment,value('segmentSpeaker'),value('segmentEmotion'));go(reviewing?'confirm':'annotated');return;}
if(a==='addrole'){const name=value('newRole').trim(),description=value('newRoleDescription').trim();if(!name||!description)throw Error('请填写姓名和音色描述');if(book().characters.some(r=>r.name===name))throw Error('角色已存在');const emotion=value('segmentEmotion');book().characters.push({name,description,aliases:[],voice:null});await engine.persist();render();$('#segmentSpeaker').value=name;$('#segmentEmotion').value=emotion;return;}
}catch(e){toast(e.message||String(e));}});
$('#screen').addEventListener('change',e=>{if(e.target.dataset.check){const id=e.target.dataset.check;selected=e.target.checked?[...new Set([...selected,id])]:selected.filter(x=>x!==id);render();}if(e.target.id==='seek')seekDisplayedChapter('seek',Number(e.target.value)).catch(e=>toast(e.message));});
$('#screen').addEventListener('input',e=>{if(candidate&&['designDescription','designText'].includes(e.target.id)){designDirty=true;const button=$('[data-act="acceptsample"]');if(button){button.disabled=true;button.textContent='内容已修改，请重新生成样本';}}});
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
device.call('load').then(result=>{configured=result;engine=new Vocast.Engine(device,result.state);window.vocastEngine=engine;window.renderApp=render;const lastStatus=new Map(engine.state.tasks.map(t=>[t.id,t.status]));engine.onChange(()=>{
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
  for(const t of engine.state.tasks){if(['failed','waiting'].includes(t.status)&&lastStatus.get(t.id)!==t.status){const isFail=t.status==='failed';let bName='书籍',cTitle='';try{bName=engine.book(t.bookId)?.name||'书籍';}catch(e){}try{cTitle=engine.chapter(t.bookId,t.chapterId)?.title||'';}catch(e){}const title=isFail?'Vocast · 制作失败':'Vocast · 制作待确认';const msg=bName+' · '+cTitle+'：'+(t.message||(isFail?'遇到问题':'需要处理确认'));toast(t.message||title);device.call('notify',{channel:'production',title,message:msg,type:isFail?'error':'info'}).catch(()=>{});}lastStatus.set(t.id,t.status);}if(!['llm','mimo','design','voicedetail','editseg','voiceimport','policy','listen'].includes(page)){try{render();}catch(err){page='shelf';try{render();}catch(e2){toast(err.message||'页面渲染失败');}}}});try{render();}catch(err){page='shelf';try{render();}catch(e2){toast(err.message||'页面渲染失败');}}}).catch(e=>{$('#screen').innerHTML=`<main class="vc-main"><h1>无法读取书库</h1><p>${E(e.message)}</p><p style="margin-top:12px"><button class="vc-btn primary" onclick="location.reload()">重新加载</button></p></main>`;});
})();

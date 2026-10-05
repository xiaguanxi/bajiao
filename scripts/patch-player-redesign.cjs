// 一次性脚本:重做听书播放页 —— 无框字幕流跟随 / 速度单源联动 / 删除定时与设置弹窗
// 运行: node scripts/patch-player-redesign.cjs
// 说明: 文件为 CRLF 换行,补丁全部按 CRLF 书写;锚点均经实测,数量断言失败即停。
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const FILE = path.resolve('app/src/main/assets/app.js');
let app = fs.readFileSync(FILE, 'utf8');
assert(app.includes('\r\n'), '期望 CRLF 换行');
const NL = '\r\n';
const count = s => app.split(s).length - 1;
function once(needle, replacement, label) {
  assert.equal(count(needle), 1, label + ' 锚点数量!=1 (实际' + count(needle) + '): ' + needle.slice(0, 100));
  app = app.replace(needle, replacement);
  console.log('ok -', label);
}
function block(startNeedle, endInclusive, replacement, mustInclude, label) {
  assert.equal(count(startNeedle), 1, label + ' 起点数量!=1');
  const s = app.indexOf(startNeedle);
  const e = app.indexOf(endInclusive, s);
  assert(e >= s, label + ' 终点缺失');
  const end = e + endInclusive.length;
  assert(app.slice(s, end).includes(mustInclude), label + ' 区间校验失败');
  app = app.slice(0, s) + replacement + app.slice(end);
  console.log('ok -', label);
}

// ---------- P1: 状态变量:删掉三个弹窗 + 睡眠分钟/计时器,新增跟随状态 ----------
once(
  'episodeModalOpen=false,playerSettingsOpen=false,speedModalOpen=false,sleepModalOpen=false,deleteConfirmBookId=null,batchModalBookId=null,stopAfterChapter=false,storageStats=null,sleepMinutes=0,miniPlayingState=null,sleepTimerId=null,lastSeekTime=0,lastSeekPos=0;',
  'episodeModalOpen=false,deleteConfirmBookId=null,batchModalBookId=null,stopAfterChapter=false,storageStats=null,miniPlayingState=null,lastSeekTime=0,lastSeekPos=0,lastActiveStart=\'\',listenUserHoldUntil=0;',
  'P1 状态变量'
);

// ---------- P2: 整个 listen 分支重写(起点→editseg 之前) ----------
assert.equal(count("}" + NL + "if(page==='listen'){" + NL + '  const chapters=b.chapters||[];'), 1, 'P2 起点数量!=1');
{
  const s = app.indexOf("if(page==='listen'){", app.indexOf('还没有标注结果'));
  const e = app.indexOf("case 'editseg'", s);
  assert(e > s, 'P2 找不到 editseg');
  assert(app.slice(s, e).includes('vc-player-extra-bar'), 'P2 区间校验失败');
  const L = [
    "if(page==='listen'){",
    '  const chapters=b.chapters||[];',
    '  const chIdx=chapters.findIndex(ch=>ch.id===c.id);',
    '  const prevCh=chIdx>0?chapters[chIdx-1]:null;',
    '  const nextCh=chIdx>=0&&chIdx<chapters.length-1?chapters[chIdx+1]:null;',
    '  const hasPrev=!!(prevCh&&prevCh.audio);',
    '  const hasNext=!!(nextCh&&nextCh.audio);',
    '  const curSpeed=engine?.state?.playbackSpeed||1;',
    '  const speeds=[0.75,1,1.25,1.5,1.75,2];',
    '',
    '  const activeProdTask = engine?.state.tasks.find(t => t.status === "running");',
    '  let prodBanner = "";',
    '  if (activeProdTask) {',
    '    const tb = engine.state.books.find(x => x.id === activeProdTask.bookId);',
    '    const tc = tb?.chapters.find(x => x.id === activeProdTask.chapterId);',
    '    const doneSegs = tc?.segments?.filter(seg => seg.audio).length || 0;',
    '    const totalSegs = tc?.segments?.length || 0;',
    '    const pct = totalSegs > 0 ? Math.round((doneSegs / totalSegs) * 100) : 0;',
    "    prodBanner = '<div class=\"vc-listening-prod-banner\"><span class=\"vc-pulse-dot\"></span><span>后台正在制作：' + E(tc?.title || '下一章') + ' (' + pct + '%)</span></div>';",
    '  }',
    '  h += prodBanner;',
    "  h += '<div class=\"vc-player\"><div class=\"vc-player-head\"><div class=\"vc-kicker\">' + E(b.name) + '</div><h3>' + E(c.title) + '</h3><small>' + E(b.characters.length + ' 角色演绎 · ' + fmt(c.duration||0)) + '</small></div>';",
    "  h += c.audio?(()=>{ const segs = engine?.computeSegmentTimestamps ? engine.computeSegmentTimestamps(c.segments || [], c.duration || 0) : (c.segments || []); if (!segs || !segs.length) { return '<div class=\"vc-center\"><small>时长 ' + fmt(c.duration || 0) + ' · 多角色演绎</small></div>'; } return '<div class=\"vc-lyric vc-transcript-panel\" id=\"transcriptPanel\" role=\"region\" aria-label=\"逐句字幕跟读\">' + segs.map((s, idx) => { return '<div class=\"vc-transcript-line' + (s.speaker && s.speaker !== '旁白' ? ' is-dialogue' : '') + '\" data-act=\"seekseg:' + Math.round(s.startMs || 0) + '\" data-start=\"' + Math.round(s.startMs || 0) + '\" data-end=\"' + Math.round(s.endMs || 0) + '\">' + '<span class=\"vc-transcript-speaker\">' + E(s.speaker || '旁白') + '</span>' + '<span class=\"vc-transcript-text\">' + E(s.text || '') + '</span>' + '</div>'; }).join('') + '</div>'; })():'<div class=\"empty\"><p>本章尚未生成完整音频。</p>' + B('制作本章','makeone') + '</div>';",
    '  if(c.audio){',
    "    h += '<div class=\"vc-player-progress\"><small id=\"playtime\">00:00</small><input type=\"range\" id=\"seek\" class=\"big-progress\" min=\"0\" max=\"' + ((c.duration||0)*1000) + '\" value=\"0\" aria-label=\"播放进度\"><small>' + fmt(c.duration||0) + '</small></div>';",
    "    h += '<div class=\"vc-controls\"><button class=\"vc-btn secondary icon' + (hasPrev?'':' disabled') + '\" data-act=\"prevchapter\" title=\"上一章\"' + (hasPrev?'':' disabled') + '>' + I('skip-back') + '</button><button class=\"vc-btn secondary icon\" data-act=\"seekback\" title=\"快退15秒\">' + I('rotate-ccw') + '</button><button class=\"vc-btn primary\" data-act=\"playchapter\" id=\"playBtn\">' + I('play') + ' 播放</button><button class=\"vc-btn secondary icon\" data-act=\"seeknext\" title=\"快进15秒\">' + I('rotate-cw') + '</button><button class=\"vc-btn secondary icon' + (hasNext?'':' disabled') + '\" data-act=\"nextchapter\" title=\"下一章\"' + (hasNext?'':' disabled') + '>' + I('skip-forward') + '</button></div>';",
    "    h += '<div class=\"vc-speed-row\" role=\"group\" aria-label=\"播放倍速\"><span class=\"vc-speed-label\">倍速</span>' + speeds.map(s => '<button class=\"vc-link-tag' + (Math.abs(s - curSpeed) < 0.01 ? ' active' : '') + '\" data-act=\"setspeed:' + s + '\">' + s + 'x</button>').join('') + '</div>';",
    "    h += '<div class=\"vc-player-tools\"><button class=\"vc-link-tag' + (engine?.state?.autoDeletePlayed ? ' active' : '') + '\" data-act=\"toggleautodelete\">完播自删 · ' + (engine?.state?.autoDeletePlayed ? '开' : '关') + '</button><button class=\"vc-link-tag' + (engine?.state?.settings?.keepRecentTwoChapters ? ' active' : '') + '\" data-act=\"togglekeeprecent\">保留前2章 · ' + (engine?.state?.settings?.keepRecentTwoChapters ? '开' : '关') + '</button><button class=\"vc-link-tag' + (engine?.state?.settings?.autoProduceUpcoming !== false ? ' active' : '') + '\" data-act=\"toggleautoproduce\">边听边做 · ' + (engine?.state?.settings?.autoProduceUpcoming !== false ? '开' : '关') + '</button><button class=\"vc-link-tag\" data-act=\"export:' + c.audio + '\">导出 WAV</button></div>';",
    "    h += c.pacingVersion===1?'<p class=\"footer-note\">已优化句末停顿</p>':(B('优化句末停顿','repace',true)+'<p class=\"footer-note\">保留已有配音，补足句末间隔；多句对白会分句重生成。</p>');",
    '  }',
    "  h += '</div>';",
    '}',
    'break;}',
  ].join(NL);
  app = app.slice(0, s) + L + app.slice(e);
  console.log('ok - P2 listen 页面重写');
}

// ---------- P3: syncDisplayedPlayback 重写(高亮+居中跟随+倍速高亮同步) ----------
{
  assert.equal(count('function syncDisplayedPlayback(p){'), 1, 'P3 起点数量!=1');
  const s = app.indexOf('function syncDisplayedPlayback(p){');
  const e = app.indexOf('async function seekDisplayedChapter', s);
  assert(e > s, 'P3 找不到结尾');
  assert(app.slice(s, e).includes('transcriptPanel'), 'P3 区间校验失败');
  const L = [
    'function syncDisplayedPlayback(p){',
    "  if(page!=='listen')return;",
    '  let pos = p.position || 0;',
    '  if (Date.now() - lastSeekTime < 1500) {',
    '    pos = lastSeekPos;',
    '  }',
    '  const ch = chapter();',
    '  const active = !!ch?.audio && p.id === ch.audio;',
    '  const position = active ? pos : 0;',
    "  if($('#playtime'))$('#playtime').textContent=fmt(position/1000);",
    "  if($('#seek')&&(!active||document.activeElement!==$('#seek')))$('#seek').value=position;",
    "  const btn=$('#playBtn'),isPlay=active&&!!p.playing;",
    "  if(btn&&btn.dataset.playing!==String(isPlay)){btn.dataset.playing=String(isPlay);btn.innerHTML=`${I(isPlay?'pause':'play')} ${isPlay?'暂停':'播放'}`;lucide.createIcons({attrs:{width:20,height:20}});}",
    '  const curSpeed = engine?.state?.playbackSpeed || 1;',
    "  document.querySelectorAll('[data-act^=\"setspeed:\"]').forEach(b=>{const s=parseFloat(b.dataset.act.split(':')[1]);b.classList.toggle('active',Math.abs(s-curSpeed)<0.01);});",
    "  const panel = document.getElementById('transcriptPanel');",
    '  if (panel) {',
    "    const lines = Array.from(panel.querySelectorAll('.vc-transcript-line'));",
    '    for (const line of lines) line.classList.remove(\'active\');',
    '    let best = null;',
    '    if (active && lines.length) {',
    '      for (const line of lines) {',
    "        const st = parseInt(line.dataset.start || '0', 10);",
    "        const en = parseInt(line.dataset.end || '0', 10);",
    '        if (en > st && position >= st && position < en) { best = line; break; }',
    '      }',
    '      if (!best) {',
    "        const audible = lines.filter(l => parseInt(l.dataset.end || '0', 10) > parseInt(l.dataset.start || '0', 10));",
    '        const pool = audible.length ? audible : lines;',
    '        best = pool[0];',
    '        for (const l of pool) {',
    "          if (parseInt(l.dataset.start || '0', 10) <= position) best = l;",
    '          else break;',
    '        }',
    '      }',
    '    }',
    "    if (best) best.classList.add('active');",
    "    const key = best ? String(best.dataset.start) : '';",
    "    if (best && key !== String(lastActiveStart) && Date.now() >= listenUserHoldUntil) {",
    '      lastActiveStart = key;',
    "      try { best.scrollIntoView({ block: 'center', behavior: 'smooth' }); }",
    '      catch (e) { try { best.scrollIntoView(); } catch (e2) {} }',
    '    } else if (!best) {',
    "      lastActiveStart = '';",
    '    }',
    '  }',
    '}',
  ].join(NL);
  app = app.slice(0, s) + L + NL + app.slice(e);
  console.log('ok - P3 字幕跟随重写');
}

// ---------- P4: 删除播放设置 / 倍速 / 睡眠三个弹窗 ----------
block('if (playerSettingsOpen) {', 'if (batchModalBookId) {', 'if (batchModalBookId) {', 'batchModalBookId', 'P4 删除三弹窗');

// ---------- P5: handler ----------
once("if(a==='openplayersettings'){playerSettingsOpen=true;render();return;}" + NL, '', 'P5 删openplayersettings');
once("if(a==='closeplayersettings'){playerSettingsOpen=false;render();return;}" + NL, '', 'P5 删closeplayersettings');
once("if(a==='openspeed'){speedModalOpen=true;render();return;}" + NL, '', 'P5 删openspeed');
once("if(a==='closespeed'){speedModalOpen=false;render();return;}" + NL, '', 'P5 删closespeed');
once("if(a==='opensleep'){sleepModalOpen=true;render();return;}" + NL, '', 'P5 删opensleep');
once("if(a==='closesleep'){sleepModalOpen=false;render();return;}" + NL, '', 'P5 删closesleep');
block("if(a==='setsleep')", "toast('已关闭睡眠定时');}render();return;}", '', '已关闭睡眠定时', 'P5 删setsleep');
once("if(a==='speed'){await device.call('playback',{op:'speed',value:1.25});toast('已设置 1.25 倍速');return;}" + NL, '', 'P5 删旧speed');
once("if(a==='sleep'){await device.call('playback',{op:'sleep',value:15});toast('15 分钟后暂停播放');return;}" + NL, '', 'P5 删旧sleep');
once(
  "if(a==='setspeed'){const sp=parseFloat(x);engine.state.playbackSpeed=sp;await engine.persist();speedModalOpen=false;await device.call('playback',{op:'speed',value:sp});toast('已设置 '+sp.toFixed(2)+'x 倍速');render();return;}",
  "if(a==='setspeed'){const sp=parseFloat(x);if(!(sp>0)){toast('无效的倍速');return;}engine.state.playbackSpeed=sp;await engine.persist();try{await device.call('playback',{op:'speed',value:sp});}catch(e){}toast('已设置 '+sp+'x 倍速');if(page==='listen'){document.querySelectorAll('[data-act^=\"setspeed:\"]').forEach(b=>{const s=parseFloat(b.dataset.act.split(':')[1]);b.classList.toggle('active',Math.abs(s-sp)<0.01);});}else{render();}return;}",
  'P5 新setspeed联动'
);
once(
  "if(a==='toggleautodelete'){engine.state.autoDeletePlayed=!engine.state.autoDeletePlayed;await engine.persist();toast('完播自动释放: '+(engine.state.autoDeletePlayed?'已开启':'已关闭'));render();return;}",
  "if(a==='toggleautodelete'){engine.state.autoDeletePlayed=!engine.state.autoDeletePlayed;await engine.persist();toast('完播自动释放: '+(engine.state.autoDeletePlayed?'已开启':'已关闭'));if(page==='listen'){document.querySelectorAll('[data-act=\"toggleautodelete\"]').forEach(b=>{b.classList.toggle('active',!!engine.state.autoDeletePlayed);b.textContent='完播自删 · '+(engine.state.autoDeletePlayed?'开':'关');});}else{render();}return;}",
  'P5 toggleautodelete就地更新'
);
block(
  "if(a==='togglekeeprecent'){",
  'render();return;' + NL + '}',
  [
    "if(a==='togglekeeprecent'){",
    'if(!engine.state.settings)engine.state.settings={};',
    'engine.state.settings.keepRecentTwoChapters=!engine.state.settings.keepRecentTwoChapters;',
    'await engine.persist();',
    "toast('保留最近2章: '+(engine.state.settings.keepRecentTwoChapters?'已开启':'已关闭'));",
    "if(page==='listen'){document.querySelectorAll('[data-act=\"togglekeeprecent\"]').forEach(b=>{b.classList.toggle('active',!!engine.state.settings.keepRecentTwoChapters);b.textContent='保留前2章 · '+(engine.state.settings.keepRecentTwoChapters?'开':'关');});}else{render();}return;}",
  ].join(NL),
  'keepRecentTwoChapters',
  'P5 togglekeeprecent就地更新'
);
block(
  'if(a === "toggleautoproduce"){',
  'render();' + NL + '  return;' + NL + '}',
  [
    'if(a==="toggleautoproduce"){',
    'if(!engine.state.settings)engine.state.settings={};',
    'engine.state.settings.autoProduceUpcoming=engine.state.settings.autoProduceUpcoming===false?true:false;',
    'await engine.persist();',
    'toast("听书自动预制: "+(engine.state.settings.autoProduceUpcoming?"已开启":"已关闭"));',
    "if(page===\"listen\"){document.querySelectorAll('[data-act=\"toggleautoproduce\"]').forEach(b=>{const on=engine.state.settings.autoProduceUpcoming!==false;b.classList.toggle(\"active\",on);b.textContent=\"边听边做 · \"+(on?\"开\":\"关\");});}else{render();}return;}",
  ].join(NL),
  'autoProduceUpcoming',
  'P5 toggleautoproduce就地更新'
);

// ---------- P6: render() 保留字幕滚动位置;字幕区手动滚动时暂停跟随 ----------
once(
  "$('#screen').innerHTML=`<main class=\"vc-main ${miniHtml",
  "let __keepTop=null;try{const __p=document.getElementById('transcriptPanel');if(page==='listen'&&__p)__keepTop=__p.scrollTop;}catch(__e){}" + NL + "$('#screen').innerHTML=`<main class=\"vc-main ${miniHtml",
  'P6 render前记录滚动'
);
once(
  'nav()}${modalHtml}`;lucide.createIcons({attrs:{width:20,height:20}});' + NL + '}' + NL + "const value=id=>",
  'nav()}${modalHtml}`;lucide.createIcons({attrs:{width:20,height:20}});' + NL + "try{if(page==='listen'&&__keepTop!==null&&__keepTop!==undefined){const __n=document.getElementById('transcriptPanel');if(__n)__n.scrollTop=__keepTop;}}catch(__e){}" + NL + '}' + NL + "const value=id=>",
  'P6 render后恢复滚动'
);
once(
  'setInterval(async()=>{',
  "if(document.getElementById('screen')){document.getElementById('screen').addEventListener('scroll',e=>{if(e&&e.target&&e.target.id==='transcriptPanel'){listenUserHoldUntil=Date.now()+3000;}},true);}" + NL + 'setInterval(async()=>{',
  'P6 手动滚动暂停跟随'
);

// ---------- 最终校验 ----------
for (const s of ['playerSettingsOpen', 'speedModalOpen', 'sleepModalOpen', 'sleepMinutes', 'sleepTimerId', 'opensleep', 'closesleep', 'setsleep', 'openplayersettings', 'closeplayersettings', 'openspeed', 'closespeed', 'vc-player-extra-bar']) {
  assert(!app.includes(s), '残留: ' + s);
}
assert(!app.includes(",'speed')"), '残留旧speed按钮');
assert(!app.includes(",'sleep')"), '残留旧sleep按钮');
for (const s of ['vc-lyric vc-transcript-panel', 'vc-speed-row', 'setspeed:', 'data-act="export:', 'seekseg:', 'id="transcriptPanel"', 'id="playBtn"', 'id="seek"', 'id="playtime"', 'scrollIntoView', 'listenUserHoldUntil', 'toggleautodelete', 'togglekeeprecent', 'toggleautoproduce']) {
  assert(app.includes(s), '缺失: ' + s);
}
fs.writeFileSync(FILE, app);
console.log(NL + 'ALL PATCHES APPLIED');

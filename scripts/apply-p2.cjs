
const fs = require('fs');
let appJs = fs.readFileSync('app/src/main/assets/app.js', 'utf8');

// 1. syncDisplayedPlayback update
// Find:
// if(btn&&btn.dataset.playing!==String(isPlay)){btn.dataset.playing=String(isPlay);btn.innerHTML=`${I(isPlay?'pause':'play')} ${isPlay?'暂停':'播放'}`;lucide.createIcons({attrs:{width:20,height:20}});}
// Add segment highlighting & scroll right after that!

const syncOld = "if(btn&&btn.dataset.playing!==String(isPlay)){btn.dataset.playing=String(isPlay);btn.innerHTML=`${I(isPlay?'pause':'play')} ${isPlay?'暂停':'播放'}`;lucide.createIcons({attrs:{width:20,height:20}});}";

const syncNew = syncOld + "\n" +
  "  const panel = document.getElementById('transcriptPanel');\n" +
  "  if (panel) {\n" +
  "    const lines = panel.querySelectorAll('.vc-transcript-line');\n" +
  "    let curActive = null;\n" +
  "    lines.forEach(line => {\n" +
  "      const st = parseInt(line.dataset.start || '0', 10);\n" +
  "      const en = parseInt(line.dataset.end || '0', 10);\n" +
  "      if (position >= st && (position < en || en === 0)) {\n" +
  "        line.classList.add('active');\n" +
  "        curActive = line;\n" +
  "      } else {\n" +
  "        line.classList.remove('active');\n" +
  "      }\n" +
  "    });\n" +
  "    if (curActive && !panel.dataset.userScrolling) {\n" +
  "      const topOffset = curActive.offsetTop - panel.offsetTop - (panel.clientHeight / 2) + (curActive.clientHeight / 2);\n" +
  "      panel.scrollTo({ top: Math.max(0, topOffset), behavior: 'smooth' });\n" +
  "    }\n" +
  "  }";

console.log('syncOld in appJs?', appJs.includes(syncOld));
if (appJs.includes(syncOld)) {
  appJs = appJs.replace(syncOld, syncNew);
  console.log('syncDisplayedPlayback updated with subtitle highlight!');
}

// 2. Add seekseg and togglekeeprecent to click handler
// Find:
// if(a==='toggleautodelete'){engine.state.autoDeletePlayed=!engine.state.autoDeletePlayed;await engine.persist();toast('完播自动释放: '+(engine.state.autoDeletePlayed?'已开启':'已关闭'));render();return;}

const oldToggleAuto = "if(a==='toggleautodelete'){engine.state.autoDeletePlayed=!engine.state.autoDeletePlayed;await engine.persist();toast('完播自动释放: '+(engine.state.autoDeletePlayed?'已开启':'已关闭'));render();return;}";
const newToggleAuto = oldToggleAuto + "\n" +
  "if(a==='togglekeeprecent'){\n" +
  "  if(!engine.state.settings)engine.state.settings={};\n" +
  "  engine.state.settings.keepRecentTwoChapters=!engine.state.settings.keepRecentTwoChapters;\n" +
  "  await engine.persist();\n" +
  "  toast('保留最近2章: '+(engine.state.settings.keepRecentTwoChapters?'已开启':'已关闭'));\n" +
  "  render();return;\n" +
  "}\n" +
  "if(a==='seekseg'){\n" +
  "  const targetMs=parseInt(x,10)||0;\n" +
  "  await seekDisplayedChapter('seek',targetMs);\n" +
  "  return;\n" +
  "}";

console.log('oldToggleAuto in appJs?', appJs.includes(oldToggleAuto));
if (appJs.includes(oldToggleAuto)) {
  appJs = appJs.replace(oldToggleAuto, newToggleAuto);
  console.log('togglekeeprecent and seekseg click actions added!');
}

// 3. Chapter switching auto cleanup integration
// In nextchapter:
// if(a==='nextchapter'){const b=book();if(!b)return;const chapters=b.chapters||[];const idx=chapters.findIndex(ch=>ch.id===chapterId);if(idx>=0&&idx<chapters.length-1&&chapters[idx+1].audio){chapterId=chapters[idx+1].id;page='listen';render();await playCurrentChapter();toast('正在播放：'+chapters[idx+1].title);}else toast('没有可播放的下一章');return;}

const oldNextCh = "if(a==='nextchapter'){const b=book();if(!b)return;const chapters=b.chapters||[];const idx=chapters.findIndex(ch=>ch.id===chapterId);if(idx>=0&&idx<chapters.length-1&&chapters[idx+1].audio){chapterId=chapters[idx+1].id;page='listen';render();await playCurrentChapter();toast('正在播放：'+chapters[idx+1].title);}else toast('没有可播放的下一章');return;}";

const newNextCh = "if(a==='nextchapter'){\n" +
  "  const b=book();if(!b)return;const chapters=b.chapters||[];const idx=chapters.findIndex(ch=>ch.id===chapterId);\n" +
  "  if(idx>=0&&idx<chapters.length-1&&chapters[idx+1].audio){\n" +
  "    const nextTarget=chapters[idx+1];\n" +
  "    const cleanRes=await engine.performAutoCleanup(b.id,nextTarget.id);\n" +
  "    chapterId=nextTarget.id;page='listen';render();await playCurrentChapter();\n" +
  "    if(cleanRes&&cleanRes.clearedCount>0&&cleanRes.freedMb>0){\n" +
  "      toast('已切换下一章，自动释放前章缓存('+cleanRes.freedMb+'MB)');\n" +
  "    }else{\n" +
  "      toast('正在播放：'+nextTarget.title);\n" +
  "    }\n" +
  "  }else toast('没有可播放的下一章');return;\n" +
  "}";

console.log('oldNextCh in appJs?', appJs.includes(oldNextCh));
if (appJs.includes(oldNextCh)) {
  appJs = appJs.replace(oldNextCh, newNextCh);
  console.log('nextchapter updated with performAutoCleanup!');
}

// In prevchapter:
// if(a==='prevchapter'){const b=book();if(!b)return;const chapters=b.chapters||[];const idx=chapters.findIndex(ch=>ch.id===chapterId);if(idx>0&&chapters[idx-1].audio){chapterId=chapters[idx-1].id;page='listen';render();await playCurrentChapter();toast('正在播放：'+chapters[idx-1].title);}else toast('没有可播放的上一章');return;}

const oldPrevCh = "if(a==='prevchapter'){const b=book();if(!b)return;const chapters=b.chapters||[];const idx=chapters.findIndex(ch=>ch.id===chapterId);if(idx>0&&chapters[idx-1].audio){chapterId=chapters[idx-1].id;page='listen';render();await playCurrentChapter();toast('正在播放：'+chapters[idx-1].title);}else toast('没有可播放的上一章');return;}";

const newPrevCh = "if(a==='prevchapter'){\n" +
  "  const b=book();if(!b)return;const chapters=b.chapters||[];const idx=chapters.findIndex(ch=>ch.id===chapterId);\n" +
  "  if(idx>0&&chapters[idx-1].audio){\n" +
  "    const prevTarget=chapters[idx-1];\n" +
  "    const cleanRes=await engine.performAutoCleanup(b.id,prevTarget.id);\n" +
  "    chapterId=prevTarget.id;page='listen';render();await playCurrentChapter();\n" +
  "    if(cleanRes&&cleanRes.clearedCount>0&&cleanRes.freedMb>0){\n" +
  "      toast('已切换上一章，自动释放缓存('+cleanRes.freedMb+'MB)');\n" +
  "    }else{\n" +
  "      toast('正在播放：'+prevTarget.title);\n" +
  "    }\n" +
  "  }else toast('没有可播放的上一章');return;\n" +
  "}";

console.log('oldPrevCh in appJs?', appJs.includes(oldPrevCh));
if (appJs.includes(oldPrevCh)) {
  appJs = appJs.replace(oldPrevCh, newPrevCh);
  console.log('prevchapter updated with performAutoCleanup!');
}

// In onNativePlaybackAction:
// if(act==='next'||act==='prev'){
//   if(!playingBookId)await restorePlayingChapter();
//   const b=engine?.state.books.find(b=>b.id===playingBookId);
//   const idx=b?.chapters.findIndex(c=>c.id===playingChapterId)??-1;
//   const target=idx<0?null:b.chapters[idx+(act==='next'?1:-1)];
//   if(!target?.audio)return;
//   if(page==='listen'&&bookId===playingBookId){
//     await engine.ensureChapter(b.id,target.id);chapterId=target.id;render();
//   }
//   await playCurrentChapter(b.id,target.id);
// }

const oldNativeNextPrev = "if(act==='next'||act==='prev'){\n      if(!playingBookId)await restorePlayingChapter();\n      const b=engine?.state.books.find(b=>b.id===playingBookId);\n      const idx=b?.chapters.findIndex(c=>c.id===playingChapterId)??-1;\n      const target=idx<0?null:b.chapters[idx+(act==='next'?1:-1)];\n      if(!target?.audio)return;\n      if(page==='listen'&&bookId===playingBookId){\n        await engine.ensureChapter(b.id,target.id);chapterId=target.id;render();\n      }\n      await playCurrentChapter(b.id,target.id);\n    }";

const newNativeNextPrev = "if(act==='next'||act==='prev'){\n      if(!playingBookId)await restorePlayingChapter();\n      const b=engine?.state.books.find(b=>b.id===playingBookId);\n      const idx=b?.chapters.findIndex(c=>c.id===playingChapterId)??-1;\n      const target=idx<0?null:b.chapters[idx+(act==='next'?1:-1)];\n      if(!target?.audio)return;\n      const cleanRes=await engine.performAutoCleanup(b.id,target.id);\n      if(page==='listen'&&bookId===playingBookId){\n        await engine.ensureChapter(b.id,target.id);chapterId=target.id;render();\n      }\n      await playCurrentChapter(b.id,target.id);\n      if(cleanRes&&cleanRes.clearedCount>0&&cleanRes.freedMb>0){\n        toast('已自动释放前章缓存 ('+cleanRes.freedMb+'MB)');\n      }\n    }";

console.log('oldNativeNextPrev in appJs?', appJs.includes(oldNativeNextPrev));
if (appJs.includes(oldNativeNextPrev)) {
  appJs = appJs.replace(oldNativeNextPrev, newNativeNextPrev);
  console.log('onNativePlaybackAction next/prev updated with performAutoCleanup!');
}

fs.writeFileSync('app/src/main/assets/app.js', appJs, 'utf8');
console.log('apply-p2.cjs done');

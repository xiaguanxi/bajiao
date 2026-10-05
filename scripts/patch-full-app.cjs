const fs = require('fs');
let code = fs.readFileSync('app/src/main/assets/app.js', 'utf8');

// 1. Add state variables at top
const oldVars = "let engine,configured={},page='shelf',bookId=null,chapterId=null,voiceId=null,roleName=null,selected=[],multi=false,voiceTab='mine',candidate=null,imports=[],editSegment=null,history=[],playingId=null,playingBookId=null,playingChapterId=null,designDirty=false,chapterPage=0,episodeModalOpen=false;";
const newVars = "let engine,configured={},page='shelf',bookId=null,chapterId=null,voiceId=null,roleName=null,selected=[],multi=false,voiceTab='mine',candidate=null,imports=[],editSegment=null,history=[],playingId=null,playingBookId=null,playingChapterId=null,designDirty=false,chapterPage=0,episodeModalOpen=false,speedModalOpen=false,sleepModalOpen=false,deleteConfirmBookId=null,stopAfterChapter=false,storageStats=null,sleepMinutes=0,miniPlayingState=null;";
if (code.includes(oldVars)) {
  code = code.replace(oldVars, newVars);
  console.log('1. Variables updated');
}

// 2. Enhance T() helper
const oldT = "const cls=w==='warn'||w===true?'warn':w==='running'?'running':'';return `<span class=\"vc-tag ${cls}\">${E(text)}</span>`;";
const newT = "const extraCls=w==='listened'?'vc-status-badge listened':w==='cleared'?'vc-status-badge cleared':'';const cls=w==='warn'||w===true?'warn':w==='running'?'running':'';return `<span class=\"vc-tag ${cls} ${extraCls}\">${E(text)}</span>`;";
if (code.includes(oldT)) {
  code = code.replace(oldT, newT);
  console.log('2. T() helper updated');
}

fs.writeFileSync('app/src/main/assets/app.js', code, 'utf8');
console.log('Done initial step');

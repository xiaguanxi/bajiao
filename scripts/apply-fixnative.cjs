
const fs = require('fs');
let appJs = fs.readFileSync('app/src/main/assets/app.js', 'utf8');

const needle = "if(!target?.audio)return;";
const idx = appJs.indexOf("if(act==='next'||act==='prev')");
if (idx !== -1) {
  const targetAudioIdx = appJs.indexOf(needle, idx);
  if (targetAudioIdx !== -1 && targetAudioIdx - idx < 500) {
    const insertPos = targetAudioIdx + needle.length;
    const codeToInsert = "\n      const cleanRes=await engine.performAutoCleanup(b.id,target.id);";
    // Also find where playCurrentChapter is called in this block
    const playCall = "await playCurrentChapter(b.id,target.id);";
    const playIdx = appJs.indexOf(playCall, insertPos);
    if (playIdx !== -1) {
      const toastInsertPos = playIdx + playCall.length;
      appJs = appJs.slice(0, insertPos) + codeToInsert + appJs.slice(insertPos, toastInsertPos) +
        "\n      if(cleanRes&&cleanRes.clearedCount>0&&cleanRes.freedMb>0){toast('已自动释放前章缓存('+cleanRes.freedMb+'MB)');}" +
        appJs.slice(toastInsertPos);
      console.log('Successfully patched onNativePlaybackAction next/prev!');
    }
  }
}
fs.writeFileSync('app/src/main/assets/app.js', appJs, 'utf8');

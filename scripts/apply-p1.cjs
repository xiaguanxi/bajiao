
const fs = require('fs');
let appJs = fs.readFileSync('app/src/main/assets/app.js', 'utf8');

// 1. Transcript Panel
const oldCoverStr = "${cover(b.name,'vc-player-cover')}<div class=\"vc-center\"><small>时长 ${fmt(c.duration||0)} · 多角色演绎</small></div>";

const newTranscriptStr = "${(()=>{ " +
  "const segs = engine?.computeSegmentTimestamps ? engine.computeSegmentTimestamps(c.segments || [], c.duration || 0) : (c.segments || []); " +
  "if (!segs || !segs.length) { " +
    "return cover(b.name, 'vc-player-cover') + '<div class=\"vc-center\"><small>时长 ' + fmt(c.duration || 0) + ' · 多角色演绎</small></div>'; " +
  "} " +
  "return '<div class=\"vc-transcript-panel\" id=\"transcriptPanel\" role=\"region\" aria-label=\"逐句字幕跟读\">' + " +
    "segs.map((s, idx) => { " +
      "const isSpk = s.speaker && s.speaker !== '旁白'; " +
      "return '<div class=\"vc-transcript-line' + (isSpk ? ' is-dialogue' : '') + '\" data-act=\"seekseg:' + Math.round(s.startMs || 0) + '\" data-start=\"' + Math.round(s.startMs || 0) + '\" data-end=\"' + Math.round(s.endMs || 0) + '\">' + " +
        "'<span class=\"vc-transcript-speaker\">' + E(s.speaker || '旁白') + '</span>' + " +
        "'<span class=\"vc-transcript-text\">' + E(s.text || '') + '</span>' + " +
      "'</div>'; " +
    "}).join('') + " +
    "'</div>'; " +
"})()}";

console.log('oldCoverStr in appJs?', appJs.includes(oldCoverStr));
if (appJs.includes(oldCoverStr)) {
  appJs = appJs.replace(oldCoverStr, newTranscriptStr);
  console.log('1. Transcript panel replaced!');
}

// 2. togglekeeprecent
const oldAutoDel = "<button class=\"vc-link-tag ${engine?.state?.autoDeletePlayed?'active':''}\" data-act=\"toggleautodelete\">${I('trash-2')} 完播自删: ${engine?.state?.autoDeletePlayed?'开':'关'}</button>";
console.log('oldAutoDel in appJs?', appJs.includes(oldAutoDel));
const newAutoDel = oldAutoDel + "<button class=\"vc-link-tag ${engine?.state?.settings?.keepRecentTwoChapters?'active':''}\" data-act=\"togglekeeprecent\">${I('shield')} 留2章: ${engine?.state?.settings?.keepRecentTwoChapters?'开':'关'}</button>";
if (appJs.includes(oldAutoDel)) {
  appJs = appJs.replace(oldAutoDel, newAutoDel);
  console.log('2. togglekeeprecent added!');
}

// 3. Export
const oldExport = "if(a==='export'){await device.call('export',{id:x,name:book().name+'-'+chapter().title});toast('已导出 WAV');return;}";
console.log('oldExport in appJs?', appJs.includes(oldExport));
const newExport = "if(a==='export'){const exportName='[Vocast有声书]《'+book().name+'》-'+chapter().title;await device.call('export',{id:x,name:exportName});toast('已导出：'+exportName+'.wav');return;}";
if (appJs.includes(oldExport)) {
  appJs = appJs.replace(oldExport, newExport);
  console.log('3. export updated!');
}

fs.writeFileSync('app/src/main/assets/app.js', appJs, 'utf8');
console.log('Finished updating scripts/apply-p1.cjs');

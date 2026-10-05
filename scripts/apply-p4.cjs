
const fs = require('fs');
let appJs = fs.readFileSync('app/src/main/assets/app.js', 'utf8');

// 1. Add batch modal to modalHtml
const delBlock = "if (deleteConfirmBookId) {";
const delIdx = appJs.indexOf(delBlock);

if (delIdx !== -1) {
  const batchModalCode = "if (batchModalBookId) {\n" +
    "  const bTarget = engine?.state.books.find(b => b.id === batchModalBookId);\n" +
    "  const totalCh = bTarget?.chapters?.length || 0;\n" +
    "  modalHtml += `<div class=\"vc-modal-overlay\" data-act=\"closebatchmodal\">\n" +
    "    <div class=\"vc-dialog\" onclick=\"event.stopPropagation()\">\n" +
    "      <h3>区间批量预制作</h3>\n" +
    "      <p>为书籍《${E(bTarget?.name || '')}》批量入队制作（共 ${totalCh} 章）</p>\n" +
    "      <div class=\"vc-field\" style=\"margin:12px 0;\">\n" +
    "        <label>起始章 (1 ~ ${totalCh})</label>\n" +
    "        <input type=\"number\" id=\"batchStartCh\" min=\"1\" max=\"${totalCh}\" value=\"1\" class=\"vc-input\" style=\"width:100%;\">\n" +
    "      </div>\n" +
    "      <div class=\"vc-field\" style=\"margin:12px 0;\">\n" +
    "        <label>结束章 (1 ~ ${totalCh})</label>\n" +
    "        <input type=\"number\" id=\"batchEndCh\" min=\"1\" max=\"${totalCh}\" value=\"${Math.min(5, totalCh)}\" class=\"vc-input\" style=\"width:100%;\">\n" +
    "      </div>\n" +
    "      <div class=\"vc-dialog-actions\">\n" +
    "        <button class=\"vc-btn secondary\" data-act=\"closebatchmodal\">取消</button>\n" +
    "        <button class=\"vc-btn primary\" data-act=\"executebatchmodal:${batchModalBookId}\">开始批量制作</button>\n" +
    "      </div>\n" +
    "    </div>\n" +
    "  </div>`;\n" +
    "}\n";

  appJs = appJs.slice(0, delIdx) + batchModalCode + appJs.slice(delIdx);
  console.log('batch modal added to modalHtml!');
}

// 2. Add click actions: clearexpired, keeponlycurrent, archivebook, openbatchmodal, closebatchmodal, executebatchmodal
// Find:
// if(a==='clearalllistened'){let totalCleaned=0;for(const b of engine.state.books){for(const c of b.chapters){if(c.audio&&c.playbackProgress?.listened){await engine.clearChapterAudio(b.id,c.id);totalCleaned++;}}}storageStats=await device.call('audioStats');toast('已释放 '+totalCleaned+' 个已听完章节音频');render();return;}

const oldClearAll = "if(a==='clearalllistened'){let totalCleaned=0;for(const b of engine.state.books){for(const c of b.chapters){if(c.audio&&c.playbackProgress?.listened){await engine.clearChapterAudio(b.id,c.id);totalCleaned++;}}}storageStats=await device.call('audioStats');toast('已释放 '+totalCleaned+' 个已听完章节音频');render();return;}";

const newActions = "if(a==='clearalllistened'){\n" +
  "  const res = await engine.clearAllListened();\n" +
  "  storageStats = await device.call('audioStats');\n" +
  "  toast('已释放 ' + res.clearedCount + ' 章已听音频 (' + res.freedMb + 'MB)');\n" +
  "  render();return;\n" +
  "}\n" +
  "if(a==='clearexpired'){\n" +
  "  const res = await engine.clearExpiredAudio(7);\n" +
  "  storageStats = await device.call('audioStats');\n" +
  "  toast('已清理 7 天前未听音频 ' + res.clearedCount + ' 章 (' + res.freedMb + 'MB)');\n" +
  "  render();return;\n" +
  "}\n" +
  "if(a==='keeponlycurrent'){\n" +
  "  const res = await engine.keepOnlyCurrentBook(playingBookId || bookId);\n" +
  "  storageStats = await device.call('audioStats');\n" +
  "  toast('已清理其他书籍音频 ' + res.clearedCount + ' 章 (' + res.freedMb + 'MB)');\n" +
  "  render();return;\n" +
  "}\n" +
  "if(a==='archivebook'){\n" +
  "  const res = await engine.archiveBook(x);\n" +
  "  storageStats = await device.call('audioStats');\n" +
  "  toast(res.archived ? ('书籍已归档，释放 ' + res.clearedCount + ' 章音频') : '已取消归档');\n" +
  "  render();return;\n" +
  "}\n" +
  "if(a==='openbatchmodal'){\n" +
  "  batchModalBookId = x;\n" +
  "  render();return;\n" +
  "}\n" +
  "if(a==='closebatchmodal'){\n" +
  "  batchModalBookId = null;\n" +
  "  render();return;\n" +
  "}\n" +
  "if(a==='executebatchmodal'){\n" +
  "  const sVal = parseInt(value('batchStartCh') || '1', 10) - 1;\n" +
  "  const eVal = parseInt(value('batchEndCh') || '1', 10) - 1;\n" +
  "  batchModalBookId = null;\n" +
  "  const tasks = await engine.batchEnqueue(x, sVal, eVal);\n" +
  "  toast('已添加 ' + tasks.length + ' 个章节到制作队列');\n" +
  "  render();return;\n" +
  "}";

console.log('oldClearAll in appJs?', appJs.includes(oldClearAll));
if (appJs.includes(oldClearAll)) {
  appJs = appJs.replace(oldClearAll, newActions);
  console.log('Storage and batch actions successfully added!');
}

fs.writeFileSync('app/src/main/assets/app.js', appJs, 'utf8');

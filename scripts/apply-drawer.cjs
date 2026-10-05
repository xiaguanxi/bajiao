
const fs = require('fs');
let appJs = fs.readFileSync('app/src/main/assets/app.js', 'utf8');

// 1. Add player settings button to extra bar:
// Find:
// toggleautoproduce
const targetNeedle = "data-act=\"toggleautoproduce\">";
const idx = appJs.indexOf(targetNeedle);
if (idx !== -1 && !appJs.includes('openplayersettings')) {
  const btnCloseIdx = appJs.indexOf("</button>", idx);
  if (btnCloseIdx !== -1) {
    const insertPos = btnCloseIdx + 9;
    const btnHtml = "<button class=\"vc-link-tag ${playerSettingsOpen?'active':''}\" data-act=\"openplayersettings\">${I('settings')} 播放设置 ▾</button>";
    appJs = appJs.slice(0, insertPos) + btnHtml + appJs.slice(insertPos);
    console.log('2. openplayersettings button added!');
  }
}

// 2. Add player settings modal drawer to modalHtml
const speedBlock = "if (speedModalOpen) {";
const speedIdx = appJs.indexOf(speedBlock);

if (speedIdx !== -1 && !appJs.includes('closeplayersettings')) {
  const settingsModalCode = "if (playerSettingsOpen) {\n" +
    "  modalHtml += `<div class=\"vc-modal-overlay\" data-act=\"closeplayersettings\">\n" +
    "    <div class=\"vc-sheet\" onclick=\"event.stopPropagation()\">\n" +
    "      <div class=\"vc-sheet-header\">\n" +
    "        <h3>听书播放设置</h3>\n" +
    "        <button class=\"vc-icon\" data-act=\"closeplayersettings\">${I('x')}</button>\n" +
    "      </div>\n" +
    "      <div class=\"vc-sheet-content\" style=\"padding:8px 0;\">\n" +
    "        <div class=\"vc-action-item\">\n" +
    "          <div class=\"vc-action-info\">\n" +
    "            <strong>完播自动清理</strong>\n" +
    "            <small style=\"color:var(--vc-sub);\">听完当前章节后自动释放音频，节省手机空间</small>\n" +
    "          </div>\n" +
    "          <button class=\"vc-btn ${engine.state.autoDeletePlayed ? 'primary' : 'secondary'}\" data-act=\"toggleautodelete\">\n" +
    "            ${engine.state.autoDeletePlayed ? '已开启' : '已关闭'}\n" +
    "          </button>\n" +
    "        </div>\n" +
    "        <div class=\"vc-action-item\">\n" +
    "          <div class=\"vc-action-info\">\n" +
    "            <strong>滑动保留最近 2 章</strong>\n" +
    "            <small style=\"color:var(--vc-sub);\">完播或切章自删时，额外保留前 2 章缓存供回听</small>\n" +
    "          </div>\n" +
    "          <button class=\"vc-btn ${engine.state.settings?.keepRecentTwoChapters ? 'primary' : 'secondary'}\" data-act=\"togglekeeprecent\">\n" +
    "            ${engine.state.settings?.keepRecentTwoChapters ? '已开启' : '已关闭'}\n" +
    "          </button>\n" +
    "        </div>\n" +
    "        <div class=\"vc-action-item\">\n" +
    "          <div class=\"vc-action-info\">\n" +
    "            <strong>边听边做（自动预制）</strong>\n" +
    "            <small style=\"color:var(--vc-sub);\">播放当前章时自动在后台生成后 1~2 章，畅享无缝连听</small>\n" +
    "          </div>\n" +
    "          <button class=\"vc-btn ${engine.state.settings?.autoProduceUpcoming !== false ? 'primary' : 'secondary'}\" data-act=\"toggleautoproduce\">\n" +
    "            ${engine.state.settings?.autoProduceUpcoming !== false ? '已开启' : '已关闭'}\n" +
    "          </button>\n" +
    "        </div>\n" +
    "      </div>\n" +
    "    </div>\n" +
    "  </div>`;\n" +
    "}\n";

  appJs = appJs.slice(0, speedIdx) + settingsModalCode + appJs.slice(speedIdx);
  console.log('3. player settings drawer modal added!');
}

// 3. Add openplayersettings and closeplayersettings click handlers
const clickNeedle = "if(a==='openspeed'){speedModalOpen=true;render();return;}";
const newClick = "if(a==='openplayersettings'){playerSettingsOpen=true;render();return;}\n" +
  "if(a==='closeplayersettings'){playerSettingsOpen=false;render();return;}\n" +
  clickNeedle;

if (appJs.includes(clickNeedle) && !appJs.includes("if(a==='openplayersettings')")) {
  appJs = appJs.replace(clickNeedle, newClick);
  console.log('4. click handlers for player settings drawer added!');
}

fs.writeFileSync('app/src/main/assets/app.js', appJs, 'utf8');

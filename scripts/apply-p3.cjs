
const fs = require('fs');
let appJs = fs.readFileSync('app/src/main/assets/app.js', 'utf8');

// Replace case 'storage': ... break;
const stStart = appJs.indexOf("case 'storage':{");
const stEnd = appJs.indexOf("case 'settings':", stStart);

console.log('stStart:', stStart, 'stEnd:', stEnd);

if (stStart !== -1 && stEnd !== -1) {
  const newStorageCode = "case 'storage':{\n" +
    "  const totalAudioCount = engine.state.books.reduce((sum, b) => sum + b.chapters.filter(c => c.audio).length, 0);\n" +
    "  const totalListenedCount = engine.state.books.reduce((sum, b) => sum + b.chapters.filter(c => c.audio && c.playbackProgress?.listened).length, 0);\n" +
    "  const totalUnlistenedCount = totalAudioCount - totalListenedCount;\n" +
    "  const totalBytes = storageStats ? storageStats.totalBytes : 0;\n" +
    "  const statsMb = storageStats ? (storageStats.totalBytes / (1024 * 1024)).toFixed(1) : '--';\n" +
    "  const fileSizes = storageStats?.fileSizes || {};\n" +
    "  let listenedBytes = 0, unlistenedBytes = 0;\n" +
    "  for (const b of engine.state.books) {\n" +
    "    for (const c of b.chapters) {\n" +
    "      if (c.audio) {\n" +
    "        const sz = fileSizes[c.audio] || 0;\n" +
    "        if (c.playbackProgress?.listened) listenedBytes += sz;\n" +
    "        else unlistenedBytes += sz;\n" +
    "      }\n" +
    "    }\n" +
    "  }\n" +
    "  const listenedMb = (listenedBytes / (1024 * 1024)).toFixed(1);\n" +
    "  const unlistenedMb = (unlistenedBytes / (1024 * 1024)).toFixed(1);\n" +
    "  const listPct = totalBytes > 0 ? Math.round((listenedBytes / totalBytes) * 100) : 0;\n" +
    "  const unlistPct = totalBytes > 0 ? Math.round((unlistenedBytes / totalBytes) * 100) : 0;\n" +
    "  const otherPct = Math.max(0, 100 - listPct - unlistPct);\n" +
    "  h = top('存储与有声书管理') + `\n" +
    "    <div class=\"vc-panel\">\n" +
    "      <div class=\"vc-row\" style=\"margin-bottom: 8px;\">\n" +
    "        <span class=\"vc-kicker\">STORAGE DASHBOARD</span>\n" +
    "        <button class=\"vc-btn secondary\" style=\"padding: 4px 10px; font-size: 0.8rem;\" data-act=\"refreshstorage\">${I('refresh-cw')} 刷新空间</button>\n" +
    "      </div>\n" +
    "      <div class=\"vc-storage-ratio-card\">\n" +
    "        <div class=\"vc-storage-ratio-header\">\n" +
    "          <strong>占用存储空间：${statsMb} MB</strong>\n" +
    "          <small style=\"color:var(--vc-sub);\">${storageStats ? storageStats.fileCount : totalAudioCount} 个音频文件</small>\n" +
    "        </div>\n" +
    "        <div class=\"vc-storage-bar\">\n" +
    "          <div class=\"vc-bar-segment listened\" style=\"width:${listPct}%;\" title=\"已听完缓存: ${listenedMb}MB\"></div>\n" +
    "          <div class=\"vc-bar-segment unlistened\" style=\"width:${unlistPct}%;\" title=\"待听音频: ${unlistMb}MB\"></div>\n" +
    "          <div class=\"vc-bar-segment other\" style=\"width:${otherPct}%;\" title=\"其他/底模数据\"></div>\n" +
    "        </div>\n" +
    "        <div class=\"vc-storage-legend\">\n" +
    "          <span><span class=\"vc-dot listened\"></span>已听完缓存 (${listenedMb}MB · ${totalListenedCount}章)</span>\n" +
    "          <span><span class=\"vc-dot unlistened\"></span>待听音频 (${unlistMb}MB · ${totalUnlistenedCount}章)</span>\n" +
    "          <span><span class=\"vc-dot other\"></span>核心/其他数据</span>\n" +
    "        </div>\n" +
    "      </div>\n" +
    "      <div class=\"vc-action-item\">\n" +
    "        <div class=\"vc-action-info\">\n" +
    "          <strong>完播自动释放音频</strong>\n" +
    "          <small style=\"color:var(--vc-sub);\">单章听完后自动释放对应音频文件，保留文本与角色设计</small>\n" +
    "        </div>\n" +
    "        <button class=\"vc-btn ${engine.state.autoDeletePlayed ? 'primary' : 'secondary'}\" data-act=\"toggleautodelete\">\n" +
    "          ${engine.state.autoDeletePlayed ? '已开启' : '已关闭'}\n" +
    "        </button>\n" +
    "      </div>\n" +
    "      <div class=\"vc-action-item\">\n" +
    "        <div class=\"vc-action-info\">\n" +
    "          <strong>滑动保留最近2章</strong>\n" +
    "          <small style=\"color:var(--vc-sub);\">完播或切章自删时，额外保留当前正在听的前2章缓存供回听</small>\n" +
    "        </div>\n" +
    "        <button class=\"vc-btn ${engine.state.settings?.keepRecentTwoChapters ? 'primary' : 'secondary'}\" data-act=\"togglekeeprecent\">\n" +
    "          ${engine.state.settings?.keepRecentTwoChapters ? '已开启' : '已关闭'}\n" +
    "        </button>\n" +
    "      </div>\n" +
    "      <div class=\"vc-action-item\">\n" +
    "        <div class=\"vc-action-info\">\n" +
    "          <strong>听书时自动预制作（边听边做）</strong>\n" +
    "          <small style=\"color:var(--vc-sub);\">播放当前章节时，后台自动预先制作后续 1~2 章，享受无缝连听</small>\n" +
    "        </div>\n" +
    "        <button class=\"vc-btn ${engine.state.settings?.autoProduceUpcoming !== false ? 'primary' : 'secondary'}\" data-act=\"toggleautoproduce\">\n" +
    "          ${engine.state.settings?.autoProduceUpcoming !== false ? '已开启' : '已关闭'}\n" +
    "        </button>\n" +
    "      </div>\n" +
    "    </div>\n" +
    "    <div class=\"vc-panel\">\n" +
    "      <span class=\"vc-kicker\">ONE-TAP CLEANUP</span>\n" +
    "      <div class=\"vc-action-item\">\n" +
    "        <div class=\"vc-action-info\">\n" +
    "          <strong>释放全部已听完章节音频</strong>\n" +
    "          <small style=\"color:var(--vc-sub);\">一键释放所有书籍已听完章节，安全不影响后续阅读</small>\n" +
    "        </div>\n" +
    "        <button class=\"vc-btn secondary\" data-act=\"clearalllistened\" ${totalListenedCount===0?'disabled':''}>一键释放已听</button>\n" +
    "      </div>\n" +
    "      <div class=\"vc-action-item\">\n" +
    "        <div class=\"vc-action-info\">\n" +
    "          <strong>清理 7 天前未听音频</strong>\n" +
    "          <small style=\"color:var(--vc-sub);\">自动扫描释放超过 7 天未听的历史生成章节音频</small>\n" +
    "        </div>\n" +
    "        <button class=\"vc-btn secondary\" data-act=\"clearexpired\">清理7天前未听</button>\n" +
    "      </div>\n" +
    "      <div class=\"vc-action-item\">\n" +
    "        <div class=\"vc-action-info\">\n" +
    "          <strong>仅保留当前播放书目</strong>\n" +
    "          <small style=\"color:var(--vc-sub);\">仅保留当前正在听的有声书音频，其他在追书籍转为文本档</small>\n" +
    "        </div>\n" +
    "        <button class=\"vc-btn secondary\" data-act=\"keeponlycurrent\">仅留当前书籍</button>\n" +
    "      </div>\n" +
    "      <div class=\"vc-action-item\">\n" +
    "        <div class=\"vc-action-info\">\n" +
    "          <strong>清理无引用孤儿音频</strong>\n" +
    "          <small style=\"color:var(--vc-sub);\">扫描清理已删除章节遗留的废弃音频缓存</small>\n" +
    "        </div>\n" +
    "        <button class=\"vc-btn secondary\" data-act=\"cleargc\">扫描孤儿文件</button>\n" +
    "      </div>\n" +
    "      <div class=\"vc-action-item\">\n" +
    "        <div class=\"vc-action-info\">\n" +
    "          <strong>清空全部有声书音频</strong>\n" +
    "          <small style=\"color:var(--vc-sub);\">释放所有音频文件，保留所有书籍分句与角色配置</small>\n" +
    "        </div>\n" +
    "        <button class=\"vc-btn secondary danger\" data-act=\"clearallaudio\" ${totalAudioCount===0?'disabled':''}>清空音频</button>\n" +
    "      </div>\n" +
    "    </div>\n" +
    "    <div class=\"vc-panel\">\n" +
    "      <span class=\"vc-kicker\">BOOK MANAGEMENT & ARCHIVE</span>\n" +
    "      ${engine.state.books.map(b => {\n" +
    "        const bAudio = b.chapters.filter(c => c.audio).length;\n" +
    "        const bListened = b.chapters.filter(c => c.audio && c.playbackProgress?.listened).length;\n" +
    "        const isArchived = !!b.archived;\n" +
    "        return `\n" +
    "          <div class=\"vc-card vc-storage-book-card ${isArchived ? 'is-archived' : ''}\">\n" +
    "            <div style=\"display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;\">\n" +
    "              <div>\n" +
    "                <strong>${E(b.name)}</strong>\n" +
    "                ${isArchived ? '<span class=\"vc-badge-archive\">已归档</span>' : ''}\n" +
    "              </div>\n" +
    "              <small style=\"color:var(--vc-sub);\">已生成 ${bAudio}/${b.chapters.length} 章 · 已听完 ${bListened} 章</small>\n" +
    "            </div>\n" +
    "            <div class=\"vc-row\" style=\"gap:6px; flex-wrap:wrap;\">\n" +
    "              <button class=\"vc-btn secondary\" style=\"font-size:0.75rem; padding:4px 8px;\" data-act=\"clearbooklistened:${b.id}\" ${bListened===0?'disabled':''}>释放已听</button>\n" +
    "              <button class=\"vc-btn secondary\" style=\"font-size:0.75rem; padding:4px 8px;\" data-act=\"clearbookaudio:${b.id}\" ${bAudio===0?'disabled':''}>释放音频</button>\n" +
    "              <button class=\"vc-btn secondary\" style=\"font-size:0.75rem; padding:4px 8px;\" data-act=\"archivebook:${b.id}\">${isArchived ? '取消归档' : '一键归档'}</button>\n" +
    "              <button class=\"vc-btn secondary\" style=\"font-size:0.75rem; padding:4px 8px;\" data-act=\"openbatchmodal:${b.id}\">区间批量预制</button>\n" +
    "              <button class=\"vc-btn secondary danger\" style=\"font-size:0.75rem; padding:4px 8px;\" data-act=\"deletebookconfirm:${b.id}\">删除整书</button>\n" +
    "            </div>\n" +
    "          </div>\n" +
    "        `;\n" +
    "      }).join('')}\n" +
    "    </div>\n" +
    "  `;\n" +
    "  break;\n" +
    "}\n";

  appJs = appJs.slice(0, stStart) + newStorageCode + appJs.slice(stEnd);
  console.log('case storage successfully replaced!');
}

fs.writeFileSync('app/src/main/assets/app.js', appJs, 'utf8');

// 一次性脚本:播放页新 UI 样式 —— 无框字幕流 + 网易云式高亮 + 倍速行 + 工具行
// 运行: node scripts/patch-player-css.cjs
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const FILE = path.resolve('app/src/main/assets/app.css');
let css = fs.readFileSync(FILE, 'utf8');
assert(css.includes('#app .vc-transcript-panel {'), '找不到 transcript 样式锚点');
assert(!css.includes('vc-lyric'), 'vc-lyric 已存在,不要重复打');
const start = css.indexOf('/* ==========================================================================' + '\n   逐句字幕跟读面板 (Transcript Panel)');
assert(start >= 0, '找不到字幕样式块起点');
const endMarker = '/* ==========================================================================' + '\n   存储面板占比条与归档徽章 (Storage Ratio & Archive Badges)';
const end = css.indexOf(endMarker, start);
assert(end > start, '找不到字幕样式块终点');
const block = `/* ==========================================================================
   听书播放页 —— 无框字幕流 (网易云式跟随高亮)
   ========================================================================== */
#app .vc-player {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
#app .vc-player-head {
  padding: 6px 4px 10px;
}
#app .vc-player-head h3 {
  margin: 2px 0 4px;
  font-size: 1.2rem;
}
#app .vc-player-head small {
  font-size: 0.8rem;
  color: var(--vc-muted);
}
#app .vc-lyric.vc-transcript-panel,
#app .vc-lyric {
  max-height: 46vh;
  min-height: 220px;
  overflow-y: auto;
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  padding: 6px 4px 18px;
  margin: 0 0 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
}
#app .vc-transcript-line {
  padding: 9px 10px;
  border-radius: 10px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
  border-left: 0;
  background: transparent;
  opacity: 0.45;
  transform: none;
  transition: opacity 0.25s ease, background 0.25s ease;
}
#app .vc-transcript-line:hover {
  background: rgba(127, 127, 127, 0.08);
  opacity: 0.75;
}
#app .vc-transcript-line.active {
  background: transparent;
  border-left-color: transparent;
  transform: none;
  opacity: 1;
}
#app .vc-transcript-speaker {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--vc-sub);
  letter-spacing: 0.5px;
}
#app .vc-transcript-line.is-dialogue .vc-transcript-speaker {
  color: var(--vc-accent);
}
#app .vc-transcript-text {
  font-size: 1.02rem;
  line-height: 1.65;
  color: var(--vc-text);
}
#app .vc-transcript-line.active .vc-transcript-text {
  font-weight: 700;
  font-size: 1.1rem;
  color: var(--vc-accent);
}
#app .vc-player-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 6px 0 2px;
}
#app .vc-player-progress small {
  font-size: 0.75rem;
  color: var(--vc-muted);
  min-width: 44px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
#app .vc-player-progress .big-progress {
  flex: 1;
  min-width: 0;
}
#app .vc-speed-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 12px 0 4px;
}
#app .vc-speed-label {
  font-size: 0.8rem;
  color: var(--vc-muted);
  margin-right: 2px;
}
#app .vc-speed-row .vc-link-tag {
  min-width: 52px;
  justify-content: center;
  font-variant-numeric: tabular-nums;
}
#app .vc-player-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 10px 0 6px;
}
@media (prefers-color-scheme: dark) {
  #app .vc-transcript-line.active .vc-transcript-text {
    color: #d7e6d2;
  }
}

`;
css = css.slice(0, start) + block + css.slice(end);
fs.writeFileSync(FILE, css);
console.log('CSS PATCHED');

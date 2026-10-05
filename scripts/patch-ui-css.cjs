const fs = require('fs');
let css = fs.readFileSync('app/src/main/assets/app.css', 'utf8');
const additionalCss = 
/* 迷你播放器 (全局常驻) */
#app .vc-mini-player {
  position: fixed;
  bottom: 64px;
  left: 0;
  right: 0;
  height: 54px;
  background: var(--vc-paper);
  border-top: 1px solid var(--vc-line);
  box-shadow: 0 -2px 10px rgba(0,0,0,0.06);
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 12px;
  z-index: 99;
  cursor: pointer;
}
#app .vc-mini-progress {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: rgba(184, 91, 53, 0.2);
}
#app .vc-mini-progress-bar {
  height: 100%;
  background: var(--vc-accent);
  width: 0%;
  transition: width 0.3s linear;
}
#app .vc-mini-cover {
  width: 38px;
  height: 38px;
  border-radius: 6px;
  background: var(--vc-ink);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
}
#app .vc-mini-info {
  flex: 1;
  min-width: 0;
}
#app .vc-mini-title {
  font-size: 0.9rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 0;
}
#app .vc-mini-sub {
  font-size: 0.75rem;
  color: var(--vc-sub);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
#app .vc-mini-ctrls {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
#app .vc-mini-btn {
  background: none;
  border: none;
  padding: 6px;
  color: var(--vc-ink);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

/* 播放控制弹出抽屉面板 */
#app .vc-sheet-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  z-index: 110;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  animation: vcFadeIn 0.2s ease;
}
#app .vc-sheet-content {
  background: var(--vc-paper);
  border-radius: 16px 16px 0 0;
  padding: 20px 18px 30px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 -4px 20px rgba(0,0,0,0.15);
  animation: vcSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
#app .vc-sheet-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
#app .vc-sheet-header h3 {
  margin: 0;
  font-size: 1.15rem;
}
#app .vc-sheet-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-top: 12px;
}
#app .vc-sheet-opt {
  padding: 12px 8px;
  text-align: center;
  border: 1px solid var(--vc-line);
  background: var(--vc-card);
  border-radius: 8px;
  font-size: 0.95rem;
  cursor: pointer;
}
#app .vc-sheet-opt.active {
  background: var(--vc-accent);
  color: #fff;
  border-color: var(--vc-accent);
  font-weight: 600;
}

/* 存储卡片 */
#app .vc-stat-card {
  background: var(--vc-card);
  border: 1px solid var(--vc-line);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 14px;
}
#app .vc-stat-num {
  font-size: 1.8rem;
  font-weight: 700;
  color: var(--vc-accent);
  margin: 4px 0;
}
#app .vc-stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--vc-line);
}
#app .vc-stat-row:last-child {
  border-bottom: none;
}
;
if (!css.includes('.vc-mini-player')) {
  css += '\n' + additionalCss;
  fs.writeFileSync('app/src/main/assets/app.css', css, 'utf8');
  console.log('app.css updated');
} else {
  console.log('app.css already has mini-player');
}

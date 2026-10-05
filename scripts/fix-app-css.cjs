
const fs = require('fs');
let css = fs.readFileSync('app/src/main/assets/app.css', 'utf8');

// Remove trailing junk
const junkIdx = css.indexOf(';\r\nif (!css.includes');
if (junkIdx !== -1) {
  css = css.slice(0, junkIdx);
} else {
  const junkIdx2 = css.indexOf(';\nif (!css.includes');
  if (junkIdx2 !== -1) css = css.slice(0, junkIdx2);
}

// Add extra styles if needed
const extra = `
/* 适配常驻 mini 播放器的主界面留白 */
#app main.vc-main.with-mini-player {
  padding-bottom: 120px !important;
}

/* 听书界面额外操作栏与快捷药丸按钮 */
#app .vc-player-extra-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: center;
  margin: 14px 0 10px;
}
#app .vc-link-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: var(--vc-card);
  border: 1px solid var(--vc-line);
  color: var(--vc-ink);
  font-size: 0.82rem;
  padding: 6px 12px;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.15s ease;
}
#app .vc-link-tag.active {
  background: var(--vc-accent-subtle);
  border-color: var(--vc-accent);
  color: var(--vc-accent);
  font-weight: 600;
}

/* 书架与详情页断点续播卡片 */
#app .vc-resume-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--vc-card);
  border: 1px solid var(--vc-line);
  border-left: 4px solid var(--vc-accent);
  border-radius: 8px;
  padding: 10px 14px;
  margin: 12px 0 16px;
  gap: 12px;
}
#app .vc-resume-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
#app .vc-resume-info small {
  font-size: 0.72rem;
  color: var(--vc-sub);
}
#app .vc-resume-info strong {
  font-size: 0.9rem;
  color: var(--vc-ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
#app .vc-book-card-wrap {
  display: flex;
  flex-direction: column;
  position: relative;
}
#app .vc-book-resume-btn {
  margin-top: 6px;
  background: var(--vc-accent);
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 0.75rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-weight: 600;
}

/* 章节状态徽标 */
#app .vc-status-badge.listened {
  background: rgba(46, 125, 50, 0.12);
  color: #2e7d32;
  border: 1px solid rgba(46, 125, 50, 0.25);
}
#app .vc-status-badge.cleared {
  background: rgba(120, 144, 156, 0.12);
  color: #546e7a;
  border: 1px solid rgba(120, 144, 156, 0.25);
}

/* 存储管理页细节 */
#app .vc-storage-book-card {
  margin-bottom: 12px;
  padding: 14px;
}
#app .vc-action-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
}
#app .vc-action-info {
  display: flex;
  flex-direction: column;
  flex: 1;
}
#app .vc-action-info strong {
  font-size: 0.92rem;
  color: var(--vc-ink);
}
#app .vc-action-info small {
  font-size: 0.76rem;
  color: var(--vc-sub);
  margin-top: 2px;
}
#app .vc-sep {
  border: none;
  border-top: 1px solid var(--vc-line);
  margin: 10px 0;
}
#app .vc-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 120;
  padding: 20px;
}
#app .vc-modal-content {
  background: var(--vc-paper);
  border-radius: 14px;
  padding: 20px;
  width: 100%;
  max-width: 360px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.25);
}
#app .vc-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
#app .vc-modal-header h3 {
  margin: 0;
  font-size: 1.1rem;
}
`;

if (!css.includes('with-mini-player')) {
  css += '\n' + extra;
}

fs.writeFileSync('app/src/main/assets/app.css', css, 'utf8');
console.log('CLEANED_AND_UPDATED_CSS');


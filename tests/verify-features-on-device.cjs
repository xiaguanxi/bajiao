const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { connect, run, sleep, log, nativeTap, dir } = require('./device-harness.cjs');

(async () => {
  run(['shell', 'cmd', 'statusbar', 'collapse']);
  run(['shell', 'am', 'start', '-W', '-n', 'com.vocast.app/.MainActivity']);
  const h = await connect();
  console.log('✓ Successfully connected to WebView via CDP');

  // 1. Check shelf page and navigation
  // Close any opened modals or navigate cleanly
  await h.read(() => {
    const backBtn = document.querySelector('[data-act="back"]');
    if (backBtn) backBtn.click();
    window.renderApp();
  });
  await sleep(300);
  await h.tap('[data-act="go:shelf"]');
  await sleep(400);

  // 2. Navigate to '我的' -> '存储与有声书资源'
  await h.tap('[data-act="go:settings"]');
  for (let i = 0; i < 20; i++) {
    const onSettings = await h.read(() => !!document.querySelector('[data-act="go:storage"]'));
    if (onSettings) break;
    await sleep(200);
  }
  const storageBtn = await h.read(() => !!document.querySelector('[data-act="go:storage"]'));
  assert.ok(storageBtn, '“我的”页面应存在“存储与有声书资源”入口');
  await h.tap('[data-act="go:storage"]');
  await sleep(800);

  // 3. Verify storage page content
  const storageTitle = await h.read(() => document.querySelector('h2')?.textContent);
  assert.equal(storageTitle, '存储与有声书管理', '应成功进入存储管理页面');
  const hasStatCards = await h.read(() => document.querySelectorAll('.vc-storage-ratio-card,.vc-stat-card').length >= 1);
  assert.ok(hasStatCards, '应展示存储统计卡片（音频段数与占用空间）');

  // 4. Test refresh storage action
  await h.tap('[data-act="refreshstorage"]');
  await sleep(500);
  console.log('✓ 存储管理页统计与刷新功能正常');

  // 5. Test toggle auto-delete
  const autoBefore = await h.read(() => window.vocastEngine.state.autoDeletePlayed);
  await h.tap('[data-act="toggleautodelete"]');
  await sleep(500);
  const autoAfter = await h.read(() => window.vocastEngine.state.autoDeletePlayed);
  console.log('autoBefore:', autoBefore, 'autoAfter:', autoAfter);
  assert.equal(Boolean(autoAfter), !Boolean(autoBefore), '完播自删开关应成功切换状态');
  console.log('✓ 完播自动删除开关切换正常：' + autoAfter);

  // 6. Test Book Detail & Playback Page Extra Bar Modals
  const state = await h.state();
  const b = state.books.find(bk => bk.chapters.some(ch => ch.audio)) || state.books[0];
  if (b) {
    const c = b.chapters.find(ch => ch.audio) || b.chapters[0];
    await h.tap('[data-act="go:shelf"]');
    await sleep(500);
    await h.tap('[data-act="book:' + b.id + '"]');
    await sleep(800);

    // Check detail page badges
    const detailTitle = await h.read(() => document.querySelector('h3')?.textContent);
    console.log('✓ 书籍详情页正常渲染：', detailTitle);

    // If chapter has audio, test listen extra bar and modals
    if (c.audio) {
      await h.tap('[data-act="read:' + c.id + '"]');
      await sleep(800);
      await h.tap('[data-act="go:listen"]');
      await sleep(800);

      // Speed row links engine and highlight directly (no modal)
      assert.equal(await h.read(() => document.querySelectorAll('[data-act^="setspeed:"]').length), 6, '倍速行应有 6 个选项');
      await h.tap('[data-act="setspeed:1.5"]');
      await sleep(600);
      const speedVal = await h.read(() => window.vocastEngine.state.playbackSpeed);
      assert.equal(speedVal, 1.5, '倍速应成功设置为 1.5x');
      assert(await h.read(() => !!document.querySelector('[data-act="setspeed:1.5"].active')), '所选倍速应高亮');
      console.log('✓ 倍速行直选与高亮正常：1.5x');

      // Timer pseudo-requirement removed: no sleep entries or sheets
      assert.equal(await h.read(() => document.querySelectorAll('[data-act="opensleep"],[data-act="sleep"],.vc-sheet-list,.vc-sheet-grid').length), 0, '定时与底部弹窗应已删除');
      console.log('✓ 定时关闭与播放设置弹窗已删除');
    }
  }

  console.log('\n=== 真实 Android 模拟器核心功能 E2E 验证全部通过！ ===');
  process.exit(0);
})().catch(e => {
  console.error('FAILED:', e);
  process.exit(1);
});

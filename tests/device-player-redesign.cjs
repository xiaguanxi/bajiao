// 真机自动化点击测试:新播放页 —— 字幕跟随 / 倍速联动 / 定时删除 / 无框样式 / 设置弹窗删除
// 前置:模拟器中至少有一本含音频+分句的书(复用已验收的前 5 章 wav + 文本种子)。
// 全部点击走真实 Android 手指事件(h.tap),CDP 只做观察。
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { connect, run, sleep, dir } = require('./device-harness.cjs');
(async () => {
  run(['shell', 'cmd', 'statusbar', 'collapse']);
  run(['shell', 'am', 'start', '-W', '-n', 'com.vocast.app/.MainActivity']);
  const h = await connect();
  const checks = [];
  const reportFile = path.join(dir, 'player-redesign.json');
  const check = (name, details = {}) => { checks.push({ name, ...details, at: new Date().toISOString() }); fs.writeFileSync(reportFile, JSON.stringify({ pass: false, checks }, null, 2)); console.log('PASS', name); };
  const status = () => h.read(async () => await device.call('playbackState'));
  const followState = () => h.read(() => {
    const panel = document.querySelector('#transcriptPanel');
    if (!panel) return { idx: -1, visible: false };
    const lines = [...panel.querySelectorAll('.vc-transcript-line')];
    const idx = lines.findIndex(l => l.classList.contains('active'));
    if (idx < 0) return { idx, total: lines.length, visible: false };
    const pr = panel.getBoundingClientRect(), br = lines[idx].getBoundingClientRect();
    return { idx, total: lines.length, start: lines[idx].dataset.start, visible: br.top >= pr.top - 2 && br.bottom <= pr.bottom + 2 };
  });
  try {
    const s = await h.state();
    assert(s.books.length > 0, '设备上没有书,先播种至少一章');
    const b = s.books.find(bk => bk.chapters.some(c => c.audio)) || s.books[0];
    const c = b.chapters.find(cc => cc.audio);
    assert(c?.audio, '所选书没有可播章节');

    // 1. 进入听书页
    await h.tap('[data-act="go:shelf"]');
    await h.tap('[data-act="book:' + b.id + '"]');
    await h.tap('[data-act="read:' + c.id + '"]');
    for (let i = 0; i < 20; i++) {
      if (await h.read(() => !!document.querySelector('#transcriptPanel'))) break;
      await sleep(300);
    }
    assert(await h.read(() => !!document.querySelector('#transcriptPanel')), '听书页应渲染字幕流');
    check('enter listen page with subtitle stream', { book: b.name, chapter: c.title });

    // 2. 无框样式:容器背景透明、无边框
    const panelStyle = await h.read(() => {
      const el = document.querySelector('#transcriptPanel');
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, style: cs.borderTopStyle, width: cs.borderTopWidth };
    });
    assert(['rgba(0, 0, 0, 0)', 'transparent'].includes(panelStyle.bg), '字幕容器应无背景,实测 ' + panelStyle.bg);
    assert(panelStyle.style === 'none' && panelStyle.width === '0px', '字幕容器应无边框,实测 ' + panelStyle.width + '/' + panelStyle.style);
    check('subtitle stream has no frame', panelStyle);

    // 3. 定时/旧按钮/弹窗入口全部删除
    const gone = await h.read(() => ({
      sleep: document.querySelectorAll('[data-act="sleep"]').length,
      speed: document.querySelectorAll('[data-act="speed"]').length,
      opensleep: document.querySelectorAll('[data-act="opensleep"]').length,
      openspeed: document.querySelectorAll('[data-act="openspeed"]').length,
      settings: document.querySelectorAll('[data-act="openplayersettings"]').length,
      sheets: document.querySelectorAll('.vc-sheet-grid,.vc-sheet-list').length,
      text: document.body.innerText,
    }));
    assert.equal(gone.sleep, 0, '旧定时按钮应删除');
    assert.equal(gone.speed, 0, '旧倍速按钮应删除');
    assert.equal(gone.opensleep, 0, '睡眠弹窗入口应删除');
    assert.equal(gone.openspeed, 0, '倍速弹窗入口应删除');
    assert.equal(gone.settings, 0, '播放设置弹窗入口应删除');
    assert(!gone.text.includes('定时关闭') && !gone.text.includes('播放设置'), '页面不应再出现定时/播放设置文字');
    check('timer buttons and settings sheet removed');

    // 4. 倍速行:6 选项,直选联动 engine + 高亮,回切 1x 时 native 真实速度也回 1
    assert.equal(await h.read(() => document.querySelectorAll('[data-act^="setspeed:"]').length), 6, '倍速行应有 6 个选项');
    const speedBefore = await h.read(() => window.vocastEngine.state.playbackSpeed) || 1;
    await h.tap('[data-act="setspeed:1.5"]');
    await sleep(600);
    assert.equal(await h.read(() => window.vocastEngine.state.playbackSpeed), 1.5, 'engine 倍速应为 1.5');
    assert(await h.read(() => !!document.querySelector('[data-act="setspeed:1.5"].active')), '1.5x 应高亮');
    check('speed 1.5x links engine and highlight');
    await h.tap('[data-act="setspeed:1"]');
    await sleep(600);
    assert.equal(await h.read(() => window.vocastEngine.state.playbackSpeed), 1, 'engine 倍速应回到 1');
    assert(await h.read(() => !!document.querySelector('[data-act="setspeed:1"].active')), '1x 应高亮');
    assert.equal((await status()).speed ?? 1, 1, 'native 实际速度应为 1');
    check('speed 1x links engine, native and highlight', { restoredFrom: speedBefore });

    // 5. 播放:高亮行出现,且播放时钟在走
    await h.tap('[data-act="playchapter"]');
    await sleep(1500);
    let p = await status();
    if (!p.playing) { await h.tap('[data-act="playchapter"]'); await sleep(800); p = await status(); }
    assert.equal(p.playing, true, '应正在播放' + (p.error || ''));
    assert.equal(p.id, c.audio, '应播放当前章节音频');
    const posA = p.position;
    await sleep(1200);
    const posB = (await status()).position;
    assert(posB > posA, '播放时钟应在走,实测 ' + posA + ' -> ' + posB);
    let follow = null;
    for (let i = 0; i < 10; i++) {
      follow = await followState();
      if (follow.idx >= 0) break;
      await sleep(500);
    }
    assert(follow.idx >= 0, '应有高亮字幕行');
    check('playing with highlighted subtitle', { line: follow.idx, clock: posA + '->' + posB });
    await h.screenshot('player-redesign-playing');

    // 6. 真实手指点击偏后字幕行:应 seek 到该行,高亮跟过去且保持在可视区
    const starts = await h.read(() => [...document.querySelectorAll('#transcriptPanel .vc-transcript-line')].map(l => l.dataset.start));
    assert(starts.length >= 4, '字幕行不足,无法测试 seek');
    const targetIdx = Math.min(starts.length - 1, 3);
    const targetStart = starts[targetIdx];
    await h.page.evaluate(st => {
      const panel = document.querySelector('#transcriptPanel');
      const line = document.querySelector('[data-act="seekseg:' + st + '"]');
      if (panel && line) {
        const pr = panel.getBoundingClientRect(), br = line.getBoundingClientRect();
        panel.scrollTop += (br.top - pr.top) - (panel.clientHeight / 2) + (br.height / 2);
      }
    }, targetStart);
    await sleep(400);
    await h.tap('[data-act="seekseg:' + targetStart + '"]');
    let followed = null;
    for (let i = 0; i < 12; i++) {
      await sleep(500);
      p = await status();
      followed = await followState();
      if (followed.visible && Math.abs(p.position - Number(targetStart)) < 20000) break;
    }
    assert(Math.abs(p.position - Number(targetStart)) < 20000, '点击字幕应 seek 到该行附近,实测 ' + p.position + ' vs ' + targetStart);
    assert(followed.idx >= targetIdx - 1 && followed.idx <= targetIdx + 1, '高亮应跟到被点行附近(播期间会自然走字),实测 ' + JSON.stringify(followed));
    assert(followed.visible, '高亮行应在可视区 ' + JSON.stringify(followed));
    check('tapping subtitle seeks and highlight follows', { start: targetStart, position: p.position, line: followed.idx });
    await h.screenshot('player-redesign-followed');

    // 7. 暂停/恢复/快进回归
    await h.tap('[data-act="playchapter"]'); await sleep(400);
    assert.equal((await status()).playing, false, '暂停应停止时钟');
    await h.tap('[data-act="playchapter"]'); await sleep(400);
    assert.equal((await status()).playing, true, '恢复应继续播放');
    p = await status();
    await h.tap('[data-act="seeknext"]'); await sleep(400);
    assert((await status()).position > p.position + 10000, '快进 15 秒应生效');
    check('play/pause/seek regression ok');

    const crash = run(['logcat', '-d', '-b', 'crash']).toString();
    fs.writeFileSync(path.join(dir, 'player-redesign-crash.txt'), crash);
    assert(!crash.includes('Process: com.vocast.app'), 'APK 不应崩溃');
    fs.writeFileSync(reportFile, JSON.stringify({ pass: true, checks }, null, 2));
    console.log('\n=== 播放页重做真机自动化点击测试全部通过 ===');
  } finally { await h.browser.close(); }
})().catch(e => { console.error(e.stack); process.exitCode = 1; });

const fs = require('node:fs'), http = require('node:http'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/xiagu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const root = path.resolve('app/src/main/assets');
  const server = http.createServer((req, res) => {
    const f = path.join(root, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
    if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', f.endsWith('.js') ? 'application/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(fs.readFileSync(f));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => { errors.push(e.message); console.error('PAGE ERROR:', e.message); });
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    let state = null;
    let currentPosition = 12345;
    const playCalls = [];
    const playbackCalls = [];

    await page.exposeFunction('nativeCall', async (id, action, payload) => {
      let result = true;
      const p = payload ? JSON.parse(payload) : {};
      if (action === 'load') result = { state, llmConfigured: true, ttsConfigured: true };
      else if (action === 'saveState') state = JSON.parse(p.text);
      else if (action === 'saveSnapshot') {
        const previous = new Map((state?.books || []).flatMap(b => b.chapters).map(c => [c.id, c]));
        for (const c of JSON.parse(p.chapters)) previous.set(c.id, c);
        state = JSON.parse(p.header);
        for (const b of state.books) b.chapters = b.chapters.map(c => previous.get(c.id));
      } else if (action === 'playbackState') {
        result = { playing: true, position: currentPosition, id:playCalls.at(-1)?.id||'' };
      } else if (action === 'play') {
        playCalls.push(p);
        result = true;
      } else if (action === 'deleteAudio') { result = { count: 0, freedBytes: 0, freedMb: 0 }; }
      else if (action === 'playback') {
        playbackCalls.push(p); if (p.op === 'seek') currentPosition = p.value;
        result = true;
      }
      await page.evaluate(v => window.nativeResult(v), { id, result });
    });

    await page.addInitScript(() => {
      window.Native = { call: (...args) => window.nativeCall(...args) };
    });

    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.getByRole('heading', { name: '我的书架' }).waitFor();
    assert.equal(await page.evaluate(() => typeof window.onNativePlaybackAction), 'function', 'Native playback listener must exist immediately after activity reload');

    const click = async act => {
      await page.locator('[data-act="' + act + '"]').first().click();
    };

    // 1. 导入示例文本
    await click('samplebook');
    await page.getByRole('heading', { name: '章节目录' }).waitFor();
    console.log('✓ 示例文本已成功加载');

    // 2. 为前两章配置模拟音频以支持听书
    await page.evaluate(async () => {
      const engine = window.vocastEngine;
      const b = engine.state.books[0];
      b.chapters[0].audio = 'audio_ch_001';
      b.chapters[0].duration = 125; // 125秒
      b.chapters[0].status = 'ready';
      engine.touch(b.chapters[0]);

      b.chapters[1].audio = 'audio_ch_002';
      b.chapters[1].duration = 180; // 180秒
      b.chapters[1].status = 'ready';
      engine.touch(b.chapters[1]);

      await engine.persist();
      window.renderApp && window.renderApp();
    });

    const ch0Id = state.books[0].chapters[0].id;

    // 3. 点击第 1 章直接智能跳转至听书页面
    await click('read:' + ch0Id);
    await page.locator('.vc-ctlbar').waitFor();
    console.log('✓ 成功进入听书页面');

    await page.setViewportSize({width:393,height:736});
    await click('speedmodal');
    await page.locator('#speedRange').waitFor();
    await page.evaluate(() => { const r = document.querySelector('#speedRange'); r.value = '1.25'; r.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForTimeout(300);
    assert((await page.locator('#toast').textContent()).includes('1.25'));
    assert.equal(await page.locator('#speedBtnVal').textContent(),'1.25x','所选倍速应显示');
    assert.equal(await page.locator('[data-act="sleep"]').count(),0,'旧定时按钮已删除');
    assert.equal(await page.locator('[data-act="speed"]').count(),0,'旧倍速按钮已删除');
    await page.locator('.vc-dialog button[data-act="closespeed"]').click();
    console.log('✓ 倍速滑块选择联动 toast 与显示,定时伪需求按钮已删除');

    // 4. 验证新 5 键控制栏（倍速、上一集、播放/暂停、下一集、回目录）
    const speedBtn = page.locator('[data-act="speedmodal"]');
    const prevBtn = page.locator('[data-act="prevchapter"]');
    const playBtn = page.locator('[data-act="playchapter"]');
    const nextBtn = page.locator('[data-act="nextchapter"]');
    const catalogBtn = page.locator('.vc-ctlbar [data-act="playercatalog"]');

    assert.equal(await speedBtn.count(), 1, '应渲染倍速按钮');
    assert.equal(await prevBtn.count(), 1, '应渲染上一集按钮');
    assert.equal(await playBtn.count(), 1, '应渲染播放/暂停主按钮');
    assert.equal(await nextBtn.count(), 1, '应渲染下一集按钮');
    assert.equal(await catalogBtn.count(), 1, '应渲染回目录按钮');
    assert.equal(await page.locator('[data-act="seekback"]').count(), 1, '听书页应有后退15秒入口');
    assert.equal(await page.locator('[data-act="seekforward"]').count(), 1, '听书页应有快进15秒入口');

    // 第1章上一集应为 disabled，下一集有音频因此可用
    assert.ok(await prevBtn.getAttribute('disabled') !== null, '第1章上一集应被禁用');
    assert.ok(await nextBtn.getAttribute('disabled') === null, '第1章下一集可用');
    console.log('✓ 验证 1 成功：新 5 键听书控制栏正常渲染且边界状态正确');

    // 5. 点击播放按钮，验证传递给 Native 的系统媒体元数据
    await playBtn.click();
    await page.waitForTimeout(100);

    assert.ok(playCalls.length > 0, '应该向原生发送 play 指令');
    const lastPlay = playCalls[playCalls.length - 1];
    assert.equal(lastPlay.id, 'audio_ch_001', '音频 ID 正确');
    assert.equal(lastPlay.title, state.books[0].chapters[0].title, '章节标题正确');
    assert.equal(lastPlay.bookTitle, state.books[0].name, '小说书名正确');
    assert.ok(lastPlay.artist.includes('Vocast'), '副标题应包含 Vocast 与多角色演绎');
    assert.equal(lastPlay.duration, 125000, '时长应准确转换为毫秒');
    assert.equal(lastPlay.hasPrev, false, '第1章 hasPrev 应为 false');
    assert.equal(lastPlay.hasNext, true, '第1章 hasNext 应为 true');
    console.log('✓ 验证 2 成功：已向系统播放器注入完整的 MediaMetadata（书名、章节名、角色副标题、毫秒时长、切章标记）');

    // 6. 模拟系统控制中心/锁屏卡片点击“下一章” (window.onNativePlaybackAction('next'))
    await page.evaluate(() => window.onNativePlaybackAction('next', 0));
    await page.waitForTimeout(150);

    const headingText = await page.locator('.vc-slim-titles h2').textContent();
    assert.equal(headingText, state.books[0].chapters[1].title, `应切换到第2章，实际为: ${headingText}`);

    const playNext = playCalls[playCalls.length - 1];
    assert.equal(playNext.id, 'audio_ch_002', '切到第2章后应立即播放第2章音频');
    assert.equal(playNext.hasPrev, true, '第2章 hasPrev 应为 true');
    console.log('✓ 验证 3 成功：系统播放器锁屏/控制中心切章事件成功双向同步，自动切换章节并开始播放');

    // 7. 模拟系统控制中心进度条拖拽定位 (window.onNativePlaybackAction('seek', 45000))
    await page.evaluate(() => window.onNativePlaybackAction('seek', 45000));
    await page.waitForTimeout(50);

    const seekValue = await page.locator('#seek').inputValue();
    const playtimeText = await page.locator('#playtime').textContent();
    assert.equal(seekValue, '45000', '前端进度条进度应与系统 seekTo 保持同步');
    assert.equal(playtimeText, '00:45', '前端时间标签应同步为 00:45');
    console.log('✓ 验证 4 成功：系统媒体卡片进度拖拽（SeekTo）与前端界面双向同步');

    // 8. 模拟系统锁屏点击“上一章” (window.onNativePlaybackAction('prev'))
    await page.evaluate(() => window.onNativePlaybackAction('prev', 0));
    await page.waitForTimeout(150);

    const backHeading = await page.locator('.vc-slim-titles h2').textContent();
    assert.equal(backHeading, state.books[0].chapters[0].title, `应切换回第1章，实际为: ${backHeading}`);
    const playBack = playCalls[playCalls.length - 1];
    assert.equal(playBack.id, 'audio_ch_001', '应重新播放第1章音频');
    console.log('✓ 验证 5 成功：系统播放器上一章事件成功切回上一章');

    await click('back');
    await page.getByRole('heading', { name: '章节目录' }).waitFor();
    await click('back');
    await page.getByRole('heading', { name: '我的书架' }).waitFor({ timeout: 3000 });
    await click('go:settings');
    await click('go:voicepolicy');
    await page.evaluate(() => window.onNativePlaybackAction('next', 0));
    await page.waitForTimeout(150);
    assert.equal(playCalls.at(-1).id, 'audio_ch_002', 'System next uses playback book even after global settings clears the browsing book');
    assert.equal(await page.getByRole('heading', { name: '音色分配' }).count(), 1, 'Background media control keeps current settings page');

    if (errors.length) {
      throw new Error('页面执行中产生错误: ' + errors.join('; '));
    }

    console.log('\n=== 系统播放器接入与双向联动全流程自动化测试通过！ ===');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(e => {
  console.error(e);
  process.exit(1);
});

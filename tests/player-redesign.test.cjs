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

    let state = null;
    let currentPosition = 0;
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
        result = { playing: true, position: currentPosition, id: playCalls.at(-1)?.id || '', speed: playbackCalls.filter(c => c.op === 'speed').at(-1)?.value ?? 1 };
      } else if (action === 'play') { playCalls.push(p); result = true; }
      else if (action === 'deleteAudio') { result = { count: 0, freedBytes: 0, freedMb: 0 }; }
      else if (action === 'playback') { playbackCalls.push(p); if (p.op === 'seek') currentPosition = p.value; result = true; }
      await page.evaluate(v => window.nativeResult(v), { id, result });
    });
    await page.addInitScript(() => { window.Native = { call: (...args) => window.nativeCall(...args) }; });

    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.getByRole('heading', { name: '我的书架' }).waitFor();
    const click = async act => { await page.locator('[data-act="' + act + '"]').first().click(); };

    // 1. 导入示例文本,给两章配模拟音频 + 分句
    await click('samplebook');
    await page.getByRole('heading', { name: '章节目录' }).waitFor();
    await page.evaluate(async () => {
      const engine = window.vocastEngine;
      const b = engine.state.books[0];
      for (const [i, c] of b.chapters.entries()) {
        c.audio = 'audio_ch_' + i;
        c.duration = 60;
        c.status = 'ready';
        c.segments = [
          { id: 0, text: '第一句旁白。', speaker: '旁白', emotion: '平静', confidence: 1, audio: 's0' },
          { id: 1, text: '“你来了。”', speaker: '沈砚', emotion: '温润', confidence: 1, audio: 's1' },
          { id: 2, text: '“等你很久了。”', speaker: '林晚', emotion: '清亮', confidence: 1, audio: 's2' },
          { id: 3, text: '夜色渐深。', speaker: '旁白', emotion: '平静', confidence: 1, audio: 's3' },
        ];
        engine.touch(c);
      }
      if (!b.characters.some(r => r.name === '沈砚')) b.characters.push({ name: '沈砚', description: '男声', voice: 'preset:白桦' });
      if (!b.characters.some(r => r.name === '林晚')) b.characters.push({ name: '林晚', description: '女声', voice: 'preset:茉莉' });
      await engine.persist();
      window.renderApp && window.renderApp();
    });
    const ch0Id = state.books[0].chapters[0].id;

    // 2. 进入听书页:新 UI 结构
    await click('read:' + ch0Id);
    await page.locator('#transcriptPanel').waitFor();
    console.log('PASS listen renders subtitle stream');

    // 3. 字幕无框:容器背景透明、无边框
    const panelStyle = await page.locator('#transcriptPanel').evaluate(el => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, border: cs.borderTopWidth + '|' + cs.borderTopStyle, radius: cs.borderRadius };
    });
    console.log('panel style:', JSON.stringify(panelStyle));
    assert(['rgba(0, 0, 0, 0)', 'transparent'].includes(panelStyle.bg), '字幕容器应无背景框,实测 ' + panelStyle.bg);
    assert(panelStyle.border === '0px|none', '字幕容器应无边框,实测 ' + panelStyle.border);

    // 4. 定时/旧按钮已删除,播放设置弹窗入口已删除
    assert.equal(await page.locator('[data-act="sleep"]').count(), 0, '旧定时按钮应删除');
    assert.equal(await page.locator('[data-act="speed"]').count(), 0, '旧倍速按钮应删除');
    assert.equal(await page.locator('[data-act="opensleep"]').count(), 0, '睡眠弹窗入口应删除');
    assert.equal(await page.locator('[data-act="openspeed"]').count(), 0, '倍速弹窗入口应删除');
    assert.equal(await page.locator('[data-act="openplayersettings"]').count(), 0, '播放设置弹窗入口应删除');
    const bodyText = await page.locator('body').innerText();
    assert(!bodyText.includes('定时关闭') && !bodyText.includes('播放设置'), '页面不应再出现定时/播放设置文字');
    console.log('PASS timer buttons and settings sheet removed');

    // 5. 倍速:点控制栏倍速钮弹浮窗,拖带刻度滑块联动 engine + native
    await click('speedmodal');
    await page.locator('#speedRange').waitFor();
    assert.deepEqual(await page.locator('.vc-tick').allTextContents(), ['0.5x','1x','1.5x','2x','2.5x','3x'], '参考交互提供 0.5–3 倍速的六个快捷刻度');
    await page.evaluate(() => { const r = document.querySelector('#speedRange'); r.value = '1.5'; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => window.vocastEngine.state.playbackSpeed), 1.5, 'engine 倍速应为 1.5');
    assert.equal(playbackCalls.filter(c => c.op === 'speed').at(-1)?.value, 1.5, 'native 应收到 1.5');
    assert.equal(await page.locator('#speedBtnVal').textContent(), '1.5x', '控制栏倍速签应更新');
    console.log('PASS speed slider links engine and native');
    // 点刻度回 1x,确认回切联动(覆盖"选了1倍速上面还是1.25"类 bug)
    await click('setspeed:1');
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => window.vocastEngine.state.playbackSpeed), 1, 'engine 倍速应回到 1');
    assert.equal(playbackCalls.filter(c => c.op === 'speed').at(-1)?.value, 1, 'native 应收到 1');
    assert.equal(await page.locator('#speedBtnVal').textContent(), '1x', '控制栏倍速签应回到 1x');
    await page.locator('.vc-dialog button[data-act="closespeed"]').click();
    console.log('PASS speed switches back to 1x');

    // 6. 字幕跟随:播放第 0 句→高亮第1行;跳到第 3 句→高亮跟过去且滚动
    await page.locator('[data-act="playchapter"]').click();
    await page.waitForTimeout(200);
    currentPosition = 500;
    await page.evaluate(() => window.onNativePlaybackAction('seek', 500));
    await page.waitForTimeout(300);
    let activeIdx = await page.evaluate(() => [...document.querySelectorAll('#transcriptPanel .vc-transcript-line')].findIndex(l => l.classList.contains('active')));
    assert.equal(activeIdx, 0, 'position=500 应高亮第 1 行,实测 ' + activeIdx);
    currentPosition = 32000;
    await page.evaluate(() => window.onNativePlaybackAction('seek', 32000));
    await page.waitForTimeout(400);
    activeIdx = await page.evaluate(() => [...document.querySelectorAll('#transcriptPanel .vc-transcript-line')].findIndex(l => l.classList.contains('active')));
    assert.equal(activeIdx, 2, 'position=32000 应高亮第 3 行,实测 ' + activeIdx);
    const follow = await page.evaluate(() => {
      const panel = document.querySelector('#transcriptPanel');
      const best = [...panel.querySelectorAll('.vc-transcript-line')].find(l => l.classList.contains('active'));
      if (!best) return { scrolled: false, reason: 'no-active' };
      const pr = panel.getBoundingClientRect(), br = best.getBoundingClientRect();
      return { scrolled: true, panelTop: pr.top, panelBottom: pr.bottom, lineTop: br.top, lineBottom: br.bottom, visible: br.top >= pr.top - 2 && br.bottom <= pr.bottom + 2 };
    });
    assert(follow.scrolled && follow.visible, '跟随高亮行应滚动到可视区,实测 ' + JSON.stringify(follow));
    console.log('PASS subtitle highlight follows playback and auto-scrolls');

    // 7. 点击字幕行可 seek
    await page.locator('#transcriptPanel .vc-transcript-line').nth(3).click();
    await page.waitForTimeout(150);
    const seekCall = playbackCalls.filter(c => c.op === 'seek').at(-1);
    assert(seekCall && seekCall.value >= 30000, '点击第 4 行应 seek 到其起始位置,实测 ' + JSON.stringify(seekCall));
    console.log('PASS tapping subtitle seeks, value=' + seekCall.value);

    // 8. render 后(切倍速只做就地更新,此处用切章回听触发 render)字幕高亮不丢
    await page.evaluate(() => window.renderApp());
    await page.waitForTimeout(200);
    currentPosition = 32000;
    await page.evaluate(() => window.onNativePlaybackAction('seek', 32000));
    await page.waitForTimeout(300);
    activeIdx = await page.evaluate(() => [...document.querySelectorAll('#transcriptPanel .vc-transcript-line')].findIndex(l => l.classList.contains('active')));
    assert.equal(activeIdx, 2, 'render 后跟随应恢复,实测 ' + activeIdx);
    console.log('PASS highlight survives re-render');

    // 9. 播放设置弹窗 CSS 残留不影响:无 .vc-sheet 弹窗元素
    assert.equal(await page.locator('.vc-sheet-grid,.vc-sheet-list').count(), 0, '不应再渲染底部弹窗');
    console.log('PASS no bottom sheets rendered');

    assert.equal(errors.length, 0, '页面错误: ' + errors.join('; '));
    console.log('\n=== 播放页重做冒烟测试全部通过 ===');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(e => { console.error(e); process.exit(1); });

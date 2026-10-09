// Local WebView assets with a mock native bridge; no external API or device claims.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/xiagu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const root = path.resolve('app/src/main/assets');
  const out = path.resolve('artifacts/ui-v032');
  fs.mkdirSync(out, { recursive: true });
  const server = http.createServer((req, res) => {
    const file = path.resolve(root, '.' + (req.url === '/' ? '/index.html' : req.url.split('?')[0]));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return res.writeHead(404).end();
    res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const checks = [], errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', msg => { if (/Content Security Policy|ResizeObserver loop/.test(msg.text())) errors.push(msg.text()); });
    let state = null;
    await page.exposeFunction('nativeCall', async (id, action, payload) => {
      const p = JSON.parse(payload || '{}');
      let result = true;
      if (action === 'load') result = { state, llmConfigured: true, ttsConfigured: true };
      else if (action === 'saveSnapshot') {
        const chapters = new Map((state?.books || []).flatMap(b => b.chapters).map(c => [c.id, c]));
        for (const c of JSON.parse(p.chapters)) chapters.set(c.id, c);
        state = JSON.parse(p.header);
        for (const b of state.books) b.chapters = b.chapters.map(c => chapters.get(c.id) || c);
      } else if (action === 'saveState') state = JSON.parse(p.text);
      else if (action === 'playbackState') result = { playing: false, position: 0 };
      else if (action === 'audioStats') result = { totalBytes: 1048576, fileCount: 1, fileSizes: { 'demo.wav': 1048576 } };
      else if (action === 'request') throw Error('UI layout tests must not call external APIs');
      await page.evaluate(value => window.nativeResult(value), { id, result });
    });
    await page.addInitScript(() => { window.Native = { call: (...args) => window.nativeCall(...args) }; });
    await page.goto('http://127.0.0.1:' + server.address().port);
    const click = act => page.locator('[data-act="' + act + '"]').first().click();
    const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const checkBounds = async name => {
      await settle();
      const bad = await page.evaluate(() => Array.from(document.querySelectorAll('#screen button, #screen input:not([type=hidden]), #screen textarea, .vc-panel, .vc-tabs')).filter(el => {
        if (!el.getClientRects().length) return false;
        const r = el.getBoundingClientRect();
        return r.left < -1 || r.right > innerWidth + 1 || el.scrollWidth > el.clientWidth + 2;
      }).map(el => ({ action: el.dataset.act, tag: el.tagName, cls: el.className, width: el.clientWidth, scroll: el.scrollWidth })));
      assert.deepEqual(bad, [], name + ': overflowing controls');
      checks.push(name);
    };
    const shot = name => page.screenshot({ path: path.join(out, name + '.png') });
    await click('samplebook');
    const bid = state.books[0].id, cid = state.books[0].chapters[0].id;
    await page.evaluate(async () => {
      const e = window.vocastEngine, b = e.state.books[0], c = b.chapters[0];
      e.state.settings.autoProduceUpcoming = false;
      b.name = '雾山来信：这是一本用于检查超长书名的有声小说 LongBookTitleWithoutSpaces';
      b.characters.push({ name: '欧阳慕容雪落长角色名', description: '温柔清亮的年轻女声', voice: null });
      e.state.voices.push({ id: 'voice-long', name: 'VeryLongVoiceNameWithoutSpaces温柔女声', description: '多本小说复用的参考声音样本', sample: 'voice.wav', enabled: true, format: 'wav', source: 'import', tested: false });
      c.segments = Array.from({ length: 30 }, (_, i) => ({ id: i, text: '第' + (i + 1) + '句：用于验证字幕滚动与播放控件不会相互遮挡。', speaker: '旁白', confidence: 1, audio: 'part-' + i + '.wav', durationMs: 2000 }));
      c.audio = 'demo.wav'; c.duration = 60;
      e.state.tasks = [{ id: 'incomplete', bookId: b.id, chapterId: c.id, status: 'paused' }];
      e.touch(c); await e.persist(); window.renderApp();
    });
    for (const width of [320, 360, 412, 768]) {
      await page.setViewportSize({ width, height: 915 });
      await click('go:shelf'); await click('book:' + bid); await click('multiselect'); await click('selectall');
      await checkBounds('batch-' + width);
      const boxes = await page.locator('.vc-batch-right .vc-btn').evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom }; }));
      assert.ok(boxes[0].right <= boxes[1].x + 1 || boxes[0].bottom <= boxes[1].y + 1, 'batch actions overlap');
      await shot('batch-' + width);
      await click('go:tasks'); await click('tasktab:attention'); await checkBounds('tasks-' + width);
      assert.ok(!(await page.locator('main').innerText()).includes('undefined'));
      await click('go:voices'); await page.locator('.voice-name').waitFor(); await checkBounds('voices-' + width);
      await click('go:shelf'); await click('book:' + bid); await click('go:roles'); await page.getByRole('heading', {name:'角色绑定，全书一致。'}).waitFor(); await checkBounds('roles-' + width);
      await click('go:settings'); await click('go:storage'); await page.locator('.vc-storage-ratio-card').waitFor(); await checkBounds('storage-' + width);
      await click('go:shelf'); await click('shelfmulti'); await click('shelfselectall'); await click('shelfdeletebooks');
      await checkBounds('dialog-' + width);
      await page.locator('.vc-dialog h3').click();
      assert.equal(await page.locator('[role=dialog]').count(), 1, 'clicking dialog content must not dismiss it');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('[role=dialog]').count(), 0);
      assert.equal(await page.evaluate(() => document.activeElement.dataset.act), 'shelfdeletebooks');
      await click('go:shelf'); await click('book:' + bid); await click('read:' + cid);
      await checkBounds('listen-' + width);
      const layout = await page.evaluate(() => {
        const p = document.querySelector('#transcriptPanel'), d = document.querySelector('.vc-dock'), n = document.querySelector('.vc-nav');
        return { height: p.clientHeight, scroll: p.scrollHeight, bottom: p.getBoundingClientRect().bottom, dockTop: d.getBoundingClientRect().top, dockBottom: d.getBoundingClientRect().bottom, navTop: n.getBoundingClientRect().top };
      });
      assert.ok(layout.height > 120 && layout.scroll > layout.height, 'subtitle panel must remain scrollable');
      assert.ok(layout.bottom <= layout.dockTop + 1 && layout.dockBottom <= layout.navTop + 1, 'player controls overlap content');
      await shot('listen-' + width);
      await click('speedmodal'); await checkBounds('speed-' + width); await shot('speed-' + width);
      await page.locator('.vc-dialog [aria-label="关闭"]').click();
      await click('listensettings'); await checkBounds('playback-settings-' + width);
      await page.evaluate(() => window.appBack());
      assert.equal(await page.locator('[role=dialog]').count(), 0, 'Android back closes modal first');
      assert.equal(await page.locator('.vc-dock').count(), 1, 'Android back must keep listening page');
      await click('back');
    }
    await page.setViewportSize({ width: 412, height: 915 });
    await click('go:settings'); await click('go:models'); await click('go:llm');
    await page.locator('#llmBase').fill('https://example.invalid/v1');
    await page.locator('#llmKey').fill('test-only-not-a-real-key');
    await click('dropdown:llmProtocol');
    assert.equal(await page.locator('.vc-opt.selected').count(), 1, 'current dropdown selection must be shown');
    await click('pickopt:llmProtocol|anthropic');
    assert.equal(await page.locator('#llmBase').inputValue(), 'https://example.invalid/v1');
    assert.equal(await page.locator('#llmKey').inputValue(), 'test-only-not-a-real-key');
    assert.ok(!JSON.stringify(state).includes('test-only-not-a-real-key'), 'draft key must not be persisted');
    checks.push('dropdown preserves unsaved form only in memory');
    await click('go:shelf'); await click('book:' + bid); await click('multiselect'); await click('selectall');
    await page.setViewportSize({ width: 320, height: 915 });
    await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
    await checkBounds('large-font-batch'); await shot('large-font-batch');
    await click('multiselect'); await click('read:' + cid); await checkBounds('large-font-listen'); await shot('large-font-listen');
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    await page.setViewportSize({ width: 640, height: 360 });
    await checkBounds('landscape-listen');
    assert.ok(await page.locator('#transcriptPanel').evaluate(el => el.clientHeight >= 120));
    assert.equal(await page.locator('.vc-dock').evaluate(el => getComputedStyle(el).position), 'static');
    await page.locator('.vc-ctlbar').scrollIntoViewIfNeeded(); await shot('landscape-listen');
    await page.setViewportSize({ width: 412, height: 915 });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await checkBounds('dark-listen'); await shot('dark-listen');
    await click('playchapter'); await click('back');
    for (const width of [320, 412]) {
      await page.setViewportSize({ width, height: 915 }); await checkBounds('mini-player-' + width);
      const miniLayout = await page.evaluate(() => {
        const mini = document.querySelector('.vc-mini-player'), nav = document.querySelector('.vc-nav'), main = document.querySelector('main');
        return { miniBottom: mini.getBoundingClientRect().bottom, navTop: nav.getBoundingClientRect().top, reserved: parseFloat(getComputedStyle(main).paddingBottom), required: mini.offsetHeight + nav.offsetHeight };
      });
      assert.ok(miniLayout.miniBottom <= miniLayout.navTop + 1 && miniLayout.reserved >= miniLayout.required, 'mini player overlaps nav / final content: ' + JSON.stringify(miniLayout));
      await shot('mini-player-' + width);
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'layout-report.json'), JSON.stringify({ passed: true, checks, errors, scope: 'Edge, mock native bridge; no external API calls or Android device validation' }, null, 2));
    console.log('PASS: ' + checks.length + ' UI layout and interaction checks');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

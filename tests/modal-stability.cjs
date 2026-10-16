// Real UI assets, simulated native storage; no model or speech requests.
const fs = require('node:fs'), http = require('node:http'), path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/xiagu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const root = path.resolve('app/src/main/assets');
  const out = path.resolve('artifacts/modal-flicker');
  fs.mkdirSync(out, { recursive: true });
  const server = http.createServer((req, res) => {
    const file = path.resolve(root, '.' + (req.url === '/' ? '/index.html' : req.url.split('?')[0]));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return res.writeHead(404).end();
    res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 361, height: 500 } });
    const errors = [], checks = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.exposeFunction('nativeCall', async (id, action) => {
      let result = true;
      if (action === 'load') result = { state: null, llmConfigured: true, ttsConfigured: true };
      if (action === 'playbackState') result = { playing: false, position: 0 };
      if (action === 'pick') result = [{ name: '切章测试.txt', text: '第一章 初见\n清风拂面。\n第二章 远行\n故事继续。' }];
      assert.notEqual(action, 'request', 'regression must not call external models');
      await page.evaluate(value => window.nativeResult(value), { id, result });
    });
    await page.addInitScript(() => { window.Native = { call: (...args) => window.nativeCall(...args) }; });
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.waitForFunction(() => window.vocastEngine);
    const click = act => page.locator('[data-act="' + act + '"]').first().click();
    async function stable(label) {
      await page.waitForTimeout(300);
      const before = await page.locator('[role=dialog]').evaluate(dialog => {
        const scroller = dialog;
        scroller.scrollTop = 50;
        const focus = dialog.querySelector('button');
        focus.focus({ preventScroll: true });
        window.modalBaseline = { dialog, overlay: dialog.closest('.vc-modal-overlay'), scroller, top: scroller.scrollTop, focus };
        window.modalAnimationRestarts = 0;
        document.addEventListener('animationstart', event => {
          if (event.target.closest('.vc-modal-overlay')) window.modalAnimationRestarts++;
        });
        return { scrollTop: scroller.scrollTop };
      });
      assert(before.scrollTop > 0, label + ': fixture must exercise a scrolled dialog');
      // Same callback chain used when background synthesis saves each sentence.
      await page.evaluate(async () => {
        for (let i = 0; i < 12; i++) {
          await window.vocastEngine.persist();
          window.renderApp(); // also cover explicit UI refreshes on settings pages
          await new Promise(resolve => setTimeout(resolve, 35));
        }
      });
      assert.deepEqual(await page.evaluate(() => {
        const b = window.modalBaseline;
        return { sameDialog: document.querySelector('[role=dialog]') === b.dialog, sameOverlay: b.overlay.isConnected,
          focusKept: document.activeElement === b.focus, scrollTop: b.scroller.scrollTop, restarts: window.modalAnimationRestarts };
      }), { sameDialog: true, sameOverlay: true, focusKept: true, scrollTop: before.scrollTop, restarts: 0 }, label);
      checks.push(label);
    }
    await click('importbook');
    await page.locator('.vc-import-manual summary').click();
    await click('dropdown:splitRule');
    await stable('切章下拉框在后台连续保存时保留节点、焦点、滚动且不重播动画');
    await click('pickopt:splitRule|custom');
    await page.locator('#splitCustom').fill('第*章');
    await click('dropdown:splitRule');
    await stable('重复打开下拉框保持稳定');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#splitCustom').inputValue(), '第*章');
    assert.equal(await page.locator('[role=dialog]').count(), 0);
    assert.equal(await page.locator('[data-act="dropdown:splitRule"]').evaluate(el => el === document.activeElement), true);
    checks.push('关闭恢复焦点并保留未保存的表单');
    await click('cancelsplit');
    await page.evaluate(async () => {
      const text = Array.from({ length: 2001 }, (_, i) => '第' + (i + 1) + '章 测试\n正文。').join('\n');
      await window.vocastEngine.addBook('章节弹窗测试', text);
    });
    const bid = await page.evaluate(() => window.vocastEngine.state.books[0].id);
    await click('book:' + bid);
    await click('openepisodes');
    await stable('章节弹窗在后台连续保存时保留节点、焦点、滚动且不重播动画');
    await page.screenshot({ path: path.join(out, 'chapters-stable.png') });
    await click('setchpage:1');
    assert.equal(await page.locator('[role=dialog]').count(), 0);
    assert.match(await page.locator('[data-act="openepisodes"]').innerText(), /^选集/);assert(await page.locator('.vc-chapter').filter({hasText:'第51章 测试'}).count());
    await click('openepisodes');
    await page.evaluate(() => window.appBack());
    assert.equal(await page.locator('[role=dialog]').count(), 0);
    assert.equal(await page.locator('.vc-main').evaluate(el => el.closest('[inert]') === null), true);
    checks.push('选集切页和 Android 返回关闭后页面可操作');
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'ui-report.json'), JSON.stringify({ passed: true, nativeBridge: 'mock', checks, errors }, null, 2));
    console.log(JSON.stringify({ passed: true, checks }, null, 2));
  } finally {
    await browser.close(); server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

// Check the chapter that is actually visible after the player catalog has laid out.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/xiagu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { Engine } = require('../app/src/main/assets/core.js');

(async () => {
  const root = path.resolve('app/src/main/assets'), out = path.resolve('artifacts/player-catalog-position');
  fs.mkdirSync(out, { recursive: true });
  const seed = new Engine({ saveState: async () => {} });
  const book = await seed.addBook('目录定位回归', Array.from({ length: 300 }, (_, i) =>
    `第${i + 1}章 山间来信\n这是第${i + 1}章的正文。`).join('\n'));
  seed.state.settings.autoProduceUpcoming = false;
  for (const [i, chapter] of book.chapters.entries()) {
    Object.assign(chapter, { audio: `chapter-${i}.wav`, duration: 120, status: 'ready',
      segments: [{ id: 0, text: chapter.text, speaker: '旁白', confidence: 1, startMs: 0, durMs: 120000 }] });
    if (i % 7 === 2) chapter.title += '，藏着那些还没说出口的往事，穿过山海的来信终于抵达了故乡';
  }
  book.lastPlayedChapterId = book.chapters[149].id;
  book.lastPlayedAt = Date.now();
  const errors = [], report = [];
  const server = http.createServer((req, res) => {
    const file = path.resolve(root, '.' + (req.url === '/' ? '/index.html' : req.url.split('?')[0]));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return res.writeHead(404).end();
    res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 393, height: 873 } });
    page.setDefaultTimeout(7000); page.on('pageerror', error => errors.push(error.message));
    let playback = { id: '', playing: false, position: 0 };
    await page.exposeFunction('nativeCall', async (id, action, payload) => {
      const p = JSON.parse(payload || '{}'); let result = true;
      if (action === 'load') result = { state: seed.state, llmConfigured: true, ttsConfigured: true };
      else if (action === 'loadChapter') result = book.chapters.find(c => c.id === p.id);
      else if (action === 'networkState') result = 'wifi';
      else if (action === 'playbackState') result = playback;
      else if (action === 'play') playback = { id: p.id, playing: true, position: p.position || 0, duration: p.duration };
      await page.evaluate(value => window.nativeResult(value), { id, result });
    });
    await page.addInitScript(() => { window.Native = { call: (...args) => window.nativeCall(...args) }; });
    const click = action => page.locator(`button[data-act="${action}"]`).first().click();
    const metrics = () => page.locator('#player-catalog-scroll').evaluate(list => {
      const top = list.getBoundingClientRect().top + list.clientTop;
      const rows = [...list.querySelectorAll('[data-chapter-id]')];
      const current = list.querySelector('.vc-chapter-current');
      const first = rows.find(row => row.getBoundingClientRect().bottom > top + 1);
      return { top: list.scrollTop, current: current.dataset.chapterId, first: first?.dataset.chapterId,
        offset: current.getBoundingClientRect().top - top, height: list.clientHeight,
        rowHeight: current.getBoundingClientRect().height,
        pageScroll: window.scrollY, sheetScroll: list.closest('.vc-player-catalog').scrollTop };
    });
    const verify = async scenario => {
      await page.waitForTimeout(200);
      const value = await metrics(); report.push({ scenario, ...value });
      if (value.first !== value.current || Math.abs(value.offset) > 1 || value.sheetScroll !== 0)
        await page.screenshot({ path: path.join(out, 'failure.png'), animations: 'disabled' });
      assert.equal(value.first, value.current, scenario + ': current chapter is first visible');
      assert(Math.abs(value.offset) <= 1, scenario + ': current chapter aligns to the viewport top');
      assert.equal(value.pageScroll, 0, scenario + ': page stays fixed');
      assert.equal(value.sheetScroll, 0, scenario + ': sheet header stays fixed');
    };
    for (const viewport of [{ width: 393, height: 873 }, { width: 320, height: 740 },
      { width: 768, height: 1024 }, { width: 736, height: 393 }]) {
      await page.setViewportSize(viewport);
      for (const index of [149, 0, 36, 298, 299]) {
        book.lastPlayedChapterId = book.chapters[index].id;
        playback = { id: '', playing: false, position: 0 };
        await page.goto('http://127.0.0.1:' + server.address().port);
        await page.waitForFunction(() => window.bajiaoEngine);
        await click('book:' + book.id); await click('continuebook');
        await page.locator('main[data-page="listen"]').waitFor();
        const label = viewport.width + 'x' + viewport.height + ' chapter ' + (index + 1);
        await click('playercatalog'); await verify(label + ' open');
        if (index === 149) await page.screenshot({ path: path.join(out, viewport.width + '-opened.png'), animations: 'disabled' });
        // Locate again after browsing to the opposite end; content-visibility must settle too.
        await page.locator('#player-catalog-scroll').evaluate((list, last) => { list.scrollTop = last ? list.scrollHeight : 0; }, index === 0);
        await page.waitForTimeout(100);
        await click('catalogcurrent'); await verify(label + ' locate');
        await page.evaluate(() => window.renderApp());
        await verify(label + ' background render');
        await click('closeplayercatalog'); await click('playercatalog');
        await verify(label + ' reopen'); await click('closeplayercatalog');
        console.log('PASS ' + label + ': open, locate, background render, reopen');
      }
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ passed: true, report, errors }, null, 2));
    console.log('PASS player catalog current chapter placement');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

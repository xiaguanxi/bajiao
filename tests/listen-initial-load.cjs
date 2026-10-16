const fs = require('node:fs'), http = require('node:http'), path = require('node:path');
const { chromium, expect } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/xiagu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/test');
const assert = require('node:assert/strict');
const { makeState } = require('../app/src/main/assets/core.js');

(async () => {
  const root = path.resolve('app/src/main/assets');
  const out = path.resolve('artifacts/listen-initial-load');
  fs.mkdirSync(out, { recursive: true });
  const server = http.createServer((req, res) => {
    const file = path.join(root, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
    if (!file.startsWith(root) || !fs.existsSync(file)) return res.writeHead(404).end();
    res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
    const errors = [], loads = [], plays = [], checks = [];
    page.on('pageerror', error => errors.push(error.message));
    const chapters = [0, 1, 2].map(i => ({
      id: 'chapter-' + i, title: '第' + (i + 1) + '章 初次收听', status: 'ready',
      audio: 'chapter-' + i + '.wav', duration: 6, lastPlayedPosition: 1000,
      text: '清晨的风穿过树林。远方的故事刚刚开始。',
      segments: [
        { id: 0, text: '清晨的风穿过树林。', speaker: '旁白', confidence: 1, audio: 'line-' + i + '-0.wav', durMs: 3000, speechCheckedAudio: 'line-' + i + '-0.wav', speechCheckedText: '清晨的风穿过树林。' },
        { id: 1, text: '远方的故事刚刚开始。', speaker: '旁白', confidence: 1, audio: 'line-' + i + '-1.wav', durMs: 3000, speechCheckedAudio: 'line-' + i + '-1.wav', speechCheckedText: '远方的故事刚刚开始。' }
      ]
    }));
    const state = makeState();
    state.settings.autoProduceUpcoming = false;
    state.settings.autoDeletePlayed = false;
    state.books = [{ id: 'book', name: '初次收听测试书', characters: [{ name: '旁白', voice: 'preset:白桦' }], chapters: chapters.map(c => {
      const { text, segments, ...index } = c;
      return { ...index, unloaded: true, textLength: text.length, segmentCount: segments.length };
    }) }];
    state.lastPlayback = { bookId: 'book', chapterId: chapters[1].id, position: 1000 };
    state.tasks = [{ id: 'done-task', bookId: 'book', chapterId: chapters[1].id, status: 'done', done: 2, total: 2 }];
    await page.exposeFunction('nativeCall', async (id, action, payload) => {
      const p = JSON.parse(payload || '{}');
      let result = true;
      if (action === 'load') result = { state, llmConfigured: true, ttsConfigured: true };
      else if (action === 'loadChapter') {
        loads.push(p.id);
        await new Promise(resolve => setTimeout(resolve, 150));
        result = chapters.find(c => c.id === p.id);
      } else if (action === 'play') plays.push(p);
      else if (action === 'playbackState') result = { id: plays.at(-1)?.id || '', position: 1000, playing: plays.length > 0 };
      else if (action === 'audioDurations') result = Object.fromEntries(p.ids.map(id => [id, 3000]));
      else if (action === 'request') throw Error('Regression test must not call external APIs');
      await page.evaluate(value => window.nativeResult(value), { id, result });
    });
    await page.addInitScript(() => { window.Native = { call: (...args) => window.nativeCall(...args) }; });
    const url = 'http://127.0.0.1:' + server.address().port;
    const click = act => page.locator('[data-act="' + act + '"]').first().click();
    const reset = async () => { plays.length = 0; loads.length = 0; await page.goto(url); await page.getByRole('heading', { name: '我的书架' }).waitFor(); };
    const verify = async (index, autoPlay = true, expectedStarts = 1) => {
      await expect(page.locator('#transcriptPanel .vc-transcript-line')).toHaveCount(2);
      await expect(page.locator('.vc-slim-titles h2')).toHaveText(chapters[index].title);
      await expect(page.locator('.vc-slim-titles small')).toHaveText(state.books[0].name);
      await expect(page.locator('.vc-player-head')).toHaveCount(0);
      assert.equal(loads.filter(id => id === chapters[index].id).length, 1, 'lazy chapter should load once');
      if (autoPlay) {
        await expect.poll(() => plays.at(-1)?.id).toBe(chapters[index].audio);
        assert.equal(plays.filter(p => p.id === chapters[index].audio).length, expectedStarts, 'each entry must start playback once');
      }
    };
    await reset();
    await click('resumebook:book:chapter-1');
    await verify(1);
    checks.push('cold shelf resume renders subtitles without switching tabs');
    for (const width of [320, 412, 768]) {
      await page.setViewportSize({ width, height: 915 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const sizes = await page.locator('.vc-slim-titles').evaluate(el => ({
        chapter: parseFloat(getComputedStyle(el.querySelector('h2')).fontSize),
        book: parseFloat(getComputedStyle(el.querySelector('small')).fontSize)
      }));
      assert(sizes.chapter > sizes.book);
      await page.screenshot({ path: path.join(out, 'listen-' + width + '.png') });
    }
    checks.push('chapter above book in larger font; duplicate heading removed; 320/412/768 layout');
    await click('nextchapter');
    await verify(2);
    await click('prevchapter');
    await verify(1, true, 2);
    checks.push('chapter controls render newly loaded subtitles');
    await reset();
    await click('book:book');
    await click('resumechapter:chapter-1');
    await verify(1);
    checks.push('cold detail resume renders subtitles');
    await reset();
    await click('go:tasks');
    await click('tasktab:done');
    await click('listentask:done-task');
    await verify(1);
    checks.push('cold completed task entry renders subtitles');
    await reset();
    await click('book:book');
    await click('read:chapter-1');
    await verify(1, false);
    await click('go:raw');
    await expect(page.locator('.vc-slim-titles h2')).toHaveText(state.books[0].name);
    await click('go:annotated');
    await expect(page.locator('.vc-slim-titles h2')).toHaveText(state.books[0].name);
    await click('go:listen');
    await verify(1, false);
    checks.push('cold directory entry and reading tabs');
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ passed: true, nativeBridge: 'mock', checks, errors }, null, 2));
    console.log(JSON.stringify({ passed: true, checks }, null, 2));
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

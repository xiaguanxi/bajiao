// Local assets and a mock native bridge, including delayed chapter reads.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/xiagu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { makeState } = require('../app/src/main/assets/core.js');

(async () => {
  const root = path.resolve('app/src/main/assets');
  const server = http.createServer((req, res) => {
    const file = path.resolve(root, '.' + (req.url === '/' ? '/index.html' : req.url.split('?')[0]));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return res.writeHead(404).end();
    res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    const errors = [], plays = [], loads = [];
    page.on('pageerror', error => errors.push(error.message));
    const fullChapters = new Map([0, 1].map(i => ['chapter-' + i, {
      id: 'chapter-' + i, title: '第' + (i + 1) + '章 初次听书', status: 'ready',
      audio: 'whole-' + i, duration: 4, pacingVersion: 1, text: '开篇旁白。角色对白。',
      segments: [
        { id: 0, text: '开篇旁白。', speaker: '旁白', confidence: 1, audio: 'part-' + i + '-0', durMs: 2000, speechCheckedAudio: 'part-' + i + '-0', speechCheckedText: '开篇旁白。' },
        { id: 1, text: '角色对白。', speaker: '角色', confidence: 1, audio: 'part-' + i + '-1', durMs: 2000, speechCheckedAudio: 'part-' + i + '-1', speechCheckedText: '角色对白。' },
      ],
    }]));
    const index = c => ({ id: c.id, title: c.title, status: c.status, audio: c.audio, duration: c.duration, pacingVersion: 1, unloaded: true, textLength: c.text.length, segmentCount: c.segments.length });
    const state = makeState();
    Object.assign(state.settings, { autoProduceUpcoming: false, autoDeletePlayed: false });
    state.books = [{ id: 'book', name: '初次听书测试书名', author: '', characters: [], chapters: [...fullChapters.values()].map(index) }];
    state.lastPlayback = { bookId: 'book', chapterId: 'chapter-0', position: 500 };
    state.tasks = [{ id: 'done-task', bookId: 'book', chapterId: 'chapter-0', status: 'done', phase: '已完成', done: 2, total: 2 }];
    let releaseLoad = null;
    await page.exposeFunction('nativeCall', async (id, action, payload) => {
      const p = JSON.parse(payload || '{}');
      let result = true;
      if (action === 'load') result = { state, llmConfigured: true, ttsConfigured: true };
      else if (action === 'loadChapter') {
        loads.push(p.id);
        await new Promise(resolve => { releaseLoad = resolve; });
        result = fullChapters.get(p.id);
      } else if (action === 'play') plays.push(p);
      else if (action === 'playbackState') result = { id: plays.at(-1)?.id || '', playing: !!plays.length, position: 500 };
      else if (action === 'audioDurations') result = {};
      else if (action === 'deleteAudio') result = { count: 0, freedBytes: 0, freedMb: 0 };
      await page.evaluate(value => window.nativeResult(value), { id, result });
    });
    await page.addInitScript(() => { window.Native = { call: (...args) => window.nativeCall(...args) }; });
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.getByRole('heading', { name: '我的书架' }).waitFor();
    const click = act => page.locator('[data-act="' + act + '"]').first().click();
    const finishLoad = async () => {
      for (let i = 0; i < 100 && !releaseLoad; i++) await new Promise(resolve => setTimeout(resolve, 10));
      assert.ok(releaseLoad, 'chapter read must start');
      const release = releaseLoad; releaseLoad = null; release();
    };
    const checkTranscript = async cid => {
      await page.locator('#transcriptPanel .vc-transcript-line').nth(1).waitFor();
      assert.equal(await page.locator('#transcriptPanel .vc-transcript-text').allTextContents().then(text => text.join('')), '开篇旁白。角色对白。');
      assert.equal(await page.locator('.vc-slim-titles h2').textContent(), fullChapters.get(cid).title);
      assert.equal(await page.locator('.vc-slim-titles small').textContent(), state.books[0].name);
      assert.equal(await page.locator('.vc-player-head, .vc-player h3').count(), 0, 'chapter heading must not repeat below the header');
      const sizes = await page.locator('.vc-slim-titles').evaluate(el => ({ main: parseFloat(getComputedStyle(el.querySelector('h2')).fontSize), sub: parseFloat(getComputedStyle(el.querySelector('small')).fontSize) }));
      assert.ok(sizes.main > sizes.sub, 'chapter title must be larger than book title');
    };

    // Cold start: existing segment durations mean calibration does not save or notify.
    await click('resumebook:book:chapter-0');
    await finishLoad();
    await checkTranscript('chapter-0');
    await page.waitForFunction(() => document.querySelector('#playBtn')?.dataset.playing === 'true');
    assert.equal(plays.filter(p => p.id === 'whole-0').length, 1, 'loading must start playback once');
    assert.equal(loads.filter(id => id === 'chapter-0').length, 1, 'render, playback and calibration must share the chapter read');
    console.log('PASS cold resume displays subtitles without switching reading modes');

    await click('nextchapter');
    await finishLoad();
    await checkTranscript('chapter-1');
    await click('prevchapter');
    await checkTranscript('chapter-0');
    console.log('PASS chapter navigation displays subtitles');

    await click('go:raw');
    assert.equal(await page.locator('.vc-slim-titles h2').textContent(), state.books[0].name);
    await click('go:annotated');
    assert.equal(await page.locator('.vc-slim-titles h2').textContent(), state.books[0].name);
    await click('go:listen');
    await checkTranscript('chapter-0');
    console.log('PASS raw and annotation title layouts remain intact');

    await click('back');
    await click('go:tasks');
    await click('tasktab:done');
    await page.evaluate(chapterIndex => {
      const c = window.bajiaoEngine.state.books[0].chapters[0];
      delete c.text; delete c.segments; Object.assign(c, chapterIndex);
    }, index(fullChapters.get('chapter-0')));
    await click('listentask:done-task');
    await finishLoad();
    await checkTranscript('chapter-0');
    console.log('PASS task entry reloads subtitles even when calibration already ran');

    await click('back');
    await click('go:shelf');
    await page.evaluate(chapterIndex => {
      const c = window.bajiaoEngine.state.books[0].chapters[0];
      delete c.text; delete c.segments; Object.assign(c, chapterIndex);
    }, index(fullChapters.get('chapter-0')));
    await click('resumebook:book:chapter-0');
    await click('back');
    await page.getByRole('heading', { name: '章节目录' }).waitFor();
    await finishLoad();
    await page.waitForFunction(() => !window.bajiaoEngine.state.books[0].chapters[0].unloaded);
    assert.equal(await page.locator('#transcriptPanel').count(), 0, 'late reads must not reopen the listening page');
    await page.getByRole('heading', { name: '章节目录' }).waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS late chapter read respects navigation away from listening');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

// Real frontend with native completion and transport controls; no model calls.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/xiagu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { Engine } = require('../app/src/main/assets/core.js');

(async () => {
  const root = path.resolve('app/src/main/assets');
  const out = path.resolve('artifacts/production-wait');
  fs.mkdirSync(out, { recursive: true });
  const engine = new Engine({ saveState: async () => {} });
  const book = await engine.addBook('制作等待回归', '第一章 开始\n甲。乙。丙。丁。\n第二章 继续\n戊。');
  engine.state.settings.autoProduceUpcoming = false;
  book.chapters[0].segments = Array.from({ length: 4 }, (_, id) => ({
    id, text: ['甲。', '乙。', '丙。', '丁。'][id], speaker: '旁白', confidence: 1,
    audio: id === 0 ? 'line0.wav' : null, durMs: 5000
  }));
  book.chapters[0].status = 'annotated';
  engine.state.tasks = [{ id: 'making', bookId: book.id, chapterId: book.chapters[0].id,
    status: 'paused', pauseRequested: true, total: 4, done: 1 }];
  const original = JSON.parse(JSON.stringify(engine.state));
  const calls = [], errors = [], checks = [];
  let playback, page;
  const server = http.createServer((req, res) => {
    const file = path.resolve(root, '.' + (req.url === '/' ? '/index.html' : req.url.split('?')[0]));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return res.writeHead(404).end();
    res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    page = await browser.newPage({ viewport: { width: 393, height: 873 } });
    page.setDefaultTimeout(6000);
    page.on('pageerror', error => errors.push(error.message));
    await page.exposeFunction('nativeCall', async (id, action, payload) => {
      const p = JSON.parse(payload || '{}');
      calls.push({ action, ...p });
      let result = true;
      if (action === 'load') result = { state: JSON.parse(JSON.stringify(original)), llmConfigured: false, ttsConfigured: false };
      else if (action === 'playbackState') result = { ...playback };
      else if (action === 'play') playback = { id: p.id, position: p.position || 0, playing: !p.startPaused, waiting: false };
      else if (action === 'playback') {
        if (p.op === 'wait') playback.waiting = true;
        if (p.op === 'pause') playback.playing = false;
        if (p.op === 'resume') playback.playing = true;
      } else if (action === 'request') throw Error('Unexpected model request');
      await page.evaluate(value => window.nativeResult(value), { id, result });
    });
    await page.addInitScript(() => { window.Native = { call: (...args) => window.nativeCall(...args) }; });
    const click = act => page.locator('[data-act="' + act + '"]').first().click();
    const plays = () => calls.filter(call => call.action === 'play').length;
    const label = value => page.waitForFunction(value => document.querySelector('#playBtn')?.getAttribute('aria-label') === value, value);
    const complete = async () => {
      playback.playing = false;
      playback.position = 5000;
      await page.evaluate(id => window.onNativePlaybackAction('completion', 5000, id), playback.id);
    };
    const produce = async (index, merged = false) => {
      await page.evaluate(async ({ index, merged }) => {
        const e = window.bajiaoEngine, c = e.state.books[0].chapters[0];
        c.segments[index].audio = 'line' + index + '.wav';
        if (merged) {
          for (const s of c.segments) s.audio = 'line' + s.id + '.wav';
          c.audio = 'merged.wav'; c.duration = 20; c.status = 'ready'; e.state.tasks[0].status = 'done';
        }
        e.touch(c); await e.persist();
      }, { index, merged });
    };
    const start = async (whole = false) => {
      playback = { id: '', position: 0, playing: false, waiting: false };
      await page.goto('http://127.0.0.1:' + server.address().port);
      await page.waitForFunction(() => window.bajiaoEngine);
      await page.evaluate(() => {
        const e = window.bajiaoEngine; e.kick = async () => {};
        Object.assign(e.state.tasks[0], { status: 'running', pauseRequested: false });
      });
      if (whole) await page.evaluate(async () => {
        const e = window.bajiaoEngine, b = e.state.books[0], c = b.chapters[0];
        c.audio = 'merged.wav'; c.duration = 20; c.status = 'ready';
        for (const s of c.segments) s.audio = 'line' + s.id + '.wav';
        e.state.tasks[0].status = 'done';
        e.state.tasks.push({ id: 'next-making', bookId: b.id, chapterId: b.chapters[1].id, status: 'running' });
        e.touch(c); await e.persist();
      });
      await click('book:' + book.id); await click('read:' + book.chapters[0].id);
      if (!whole) await click('makeandlisten');
      await click('playchapter'); await label('暂停');
    };

    await start();
    await complete(); await label('暂停');
    const initialPlays = plays();
    await click('playchapter'); await label('播放');
    await produce(1, true);
    // A duplicate or delayed completion must not override the explicit pause.
    await page.evaluate(id => window.onNativePlaybackAction('completion', 5000, id), playback.id);
    await page.waitForTimeout(250);
    assert.equal(plays(), initialPlays, 'production and late completion respect manual pause');
    assert.equal(await page.locator('#playBtn').getAttribute('aria-label'), '播放');
    checks.push('first wait stays pausable; manual pause survives merge and delayed completion');

    await start(); await complete(); await label('暂停');
    await page.evaluate(async () => { await window.bajiaoEngine.persist(); await window.bajiaoEngine.persist(); });
    await complete(); await label('暂停');
    await produce(1);
    await page.waitForFunction(() => document.querySelector('.vc-transcript-line.active')?.dataset.segstream === '1');
    await page.evaluate(id => window.onNativePlaybackAction('play', 0, id), playback.id);
    const pausesBeforeSecondWait = calls.filter(call => call.action === 'playback' && call.op === 'pause').length;
    await complete();
    assert.equal(await page.locator('#playBtn').getAttribute('aria-label'), '播放', 'second catch-up stops the listening session');
    assert.equal(calls.filter(call => call.action === 'playback' && call.op === 'pause').length, pausesBeforeSecondWait + 1, 'second catch-up pauses the native player once');
    assert.equal(await page.evaluate(() => window.bajiaoEngine.state.tasks[0].status), 'running', 'stopping playback keeps production running');
    assert.match(await page.locator('#toast').textContent(), /当前制作进度较慢.*已停止播放.*整章制作完成后手动播放/);
    const stoppedPlays = plays();
    for (const width of [320, 393, 768]) {
      await page.setViewportSize({ width, height: 873 });
      assert.match(await page.locator('[data-production-wait-stop]').textContent(), /整章制作完成后手动播放/);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    await page.waitForFunction(() => !document.querySelector('#toast')?.textContent);
    assert.match(await page.locator('[data-production-wait-stop]').textContent(), /整章制作完成后手动播放/, 'the stopped notice remains after the toast disappears');
    await page.setViewportSize({ width: 393, height: 873 });
    await page.screenshot({ path: path.join(out, 'second-catch-up.png') });
    await click('back');
    await page.waitForFunction(() => document.querySelector('[data-act="miniplaypause"]')?.getAttribute('aria-label') === '播放');
    await produce(2, true); await page.waitForTimeout(250);
    assert.equal(plays(), stoppedPlays, 'second catch-up blocks automatic playback after chapter completion');
    await click('miniplaypause');
    await page.waitForFunction(() => document.querySelector('[data-act="miniplaypause"]')?.getAttribute('aria-label') === '暂停');
    assert.equal(playback.id, 'line2.wav', 'explicit play continues at the next unheard sentence');
    await click('minigolisten');
    assert.equal(await page.locator('[data-production-wait-stop]').count(), 0, 'explicit play dismisses the stopped notice');
    checks.push('second distinct wait stops once, explains why, and remains stopped after merge');

    // System pause/play starts a fresh listening session; its first wait remains resumable.
    await start(); await complete(); await label('暂停');
    playback.playing = false; await page.evaluate(id => window.onNativePlaybackAction('pause', 0, id), playback.id);
    await label('播放');
    const systemPausedPlays = plays(); await produce(1); await page.waitForTimeout(150);
    assert.equal(plays(), systemPausedPlays);
    playback.playing = true; await page.evaluate(id => window.onNativePlaybackAction('play', 0, id), playback.id);
    await page.waitForFunction(() => document.querySelector('.vc-transcript-line.active')?.dataset.segstream === '1');
    await complete(); await label('暂停');
    checks.push('system pause prevents auto resume; explicit play resets the catch-up count');

    // Completion can arrive just after pause, before any wait was registered.
    await start(); await click('playchapter'); await label('播放'); await complete();
    assert.equal(playback.waiting, true, 'late completion remembers that the paused sentence has ended');
    await produce(1); const latePausedPlays = plays();
    await click('playchapter');
    await page.waitForFunction(() => document.querySelector('.vc-transcript-line.active')?.dataset.segstream === '1');
    assert.equal(plays(), latePausedPlays + 1);
    assert.equal(playback.id, 'line1.wav', 'resuming after a pause/completion race skips the heard sentence');
    checks.push('pause immediately before completion resumes at the next unheard sentence');

    // Automatic chapter transitions belong to the same listening session.
    await start(true); await complete(); await label('暂停');
    await page.evaluate(async () => {
      const e = window.bajiaoEngine, b = e.state.books[0], c = b.chapters[1];
      c.audio = 'next.wav'; c.duration = 5; c.status = 'ready'; e.state.tasks[1].status = 'done';
      b.chapters.push({ id: 'third', title: '第三章 后续', text: '己。', segments: [], status: 'new' });
      e.state.tasks.push({ id: 'third-making', bookId: b.id, chapterId: 'third', status: 'running' });
      e.touch(c); await e.persist();
    });
    await page.waitForFunction(() => document.querySelector('.vc-slim-titles h2')?.textContent.includes('继续'));
    assert.equal(playback.id, 'next.wav');
    await complete(); await label('播放');
    assert.match(await page.locator('[data-production-wait-stop]').textContent(), /已停止播放/);
    const crossChapterPlays = plays();
    await page.evaluate(async () => {
      const e = window.bajiaoEngine, c = e.state.books[0].chapters[2];
      c.audio = 'third.wav'; c.duration = 5; c.status = 'ready'; e.state.tasks[2].status = 'done';
      e.touch(c); await e.persist();
    });
    await page.waitForTimeout(200); assert.equal(plays(), crossChapterPlays);
    checks.push('automatic chapter transitions preserve the catch-up count and second stop');

    // Pause while the next chapter is loading, before the asynchronous auto advance commits.
    for (const blockedStage of ['chapter', 'timing']) {
      await start(true);
      await complete(); await label('暂停');
      await page.evaluate(async blockedStage => {
        const e = window.bajiaoEngine, b = e.state.books[0], c = b.chapters[1];
        const method = blockedStage === 'chapter' ? 'ensureChapter' : 'calibrateDurations';
        const originalMethod = e[method].bind(e);
        const gate = new Promise(resolve => { window.finishChapterLoad = resolve; });
        e[method] = async (...args) => {
          if (args[1] === c.id) {
            window.nextChapterLoading = true;
            await gate;
          }
          return originalMethod(...args);
        };
        c.audio = 'next.wav'; c.duration = 5; c.status = 'ready'; e.state.tasks[1].status = 'done';
        e.touch(c); await e.persist();
      }, blockedStage);
      await page.waitForFunction(() => window.nextChapterLoading);
      const loadingPlays = plays();
      // Mini player controls the playing chapter even if the next chapter is already visible.
      await click('back'); await click('miniplaypause');
      await page.waitForFunction(() => document.querySelector('[data-act="miniplaypause"]')?.getAttribute('aria-label') === '播放');
      await page.evaluate(() => window.finishChapterLoad()); await page.waitForTimeout(250);
      assert.equal(plays(), loadingPlays, 'pause cancels an automatic next-chapter load already in flight');
      await click('miniplaypause');
      await page.waitForFunction(() => document.querySelector('[data-act="miniplaypause"]')?.getAttribute('aria-label') === '暂停');
      await page.waitForFunction(() => window.bajiaoEngine.state.lastPlayback?.chapterId === window.bajiaoEngine.state.books[0].chapters[1].id);
      assert.equal(playback.id, 'next.wav', 'explicit resume still reaches the pending next chapter');
      assert.equal(plays(), loadingPlays + 1, 'explicit resume starts the pending chapter once after ' + blockedStage);
    }
    checks.push('pause during either asynchronous next-chapter load cancels playback and preserves manual resume');

    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'ui-report.json'), JSON.stringify({ pass: true, checks, errors }, null, 2));
    console.log('PASS production waits: ' + checks.join('; '));
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

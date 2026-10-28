const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/xiagu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { Engine } = require('../app/src/main/assets/core.js');

(async () => {
  const root = path.resolve('app/src/main/assets'), out = path.resolve('artifacts/notification-progress');
  fs.mkdirSync(out, { recursive: true });
  const engine = new Engine({ saveState: async () => {} });
  const book = await engine.addBook('通知进度回归', '第一章 进度\n甲。乙。丙。');
  const chapter = book.chapters[0];
  chapter.status = 'annotated';
  chapter.segments = Array.from({ length: 8 }, (_, id) => ({ id: id * 3, text: '第' + id + '句。', speaker: '旁白',
    confidence: 1, audio: id === 0 || id === 2 ? 'line' + id + '.wav' : null, durMs: 5000 }));
  Object.assign(chapter.segments[1], { skip: true, audio: 'skip' });
  engine.state.settings.autoProduceUpcoming = false;
  engine.state.tasks = [{ id: 'making', bookId: book.id, chapterId: chapter.id, status: 'paused', pauseRequested: true, total: 8, done: 2 }];
  let playback = { id: '', playing: false, position: 0 };
  const calls = [], errors = [];
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
    await page.exposeFunction('nativeCall', async (id, action, payload) => {
      const p = JSON.parse(payload || '{}'); calls.push({ action, ...p }); let result = true;
      if (action === 'load') result = { state: engine.state, llmConfigured: false, ttsConfigured: false };
      else if (action === 'playbackState') result = { ...playback };
      else if (action === 'play') playback = { id: p.id, playing: !p.startPaused, position: p.position || 0 };
      else if (action === 'playback') {
        if (p.op === 'pause') playback.playing = false;
        if (p.op === 'resume') playback.playing = true;
        if (p.op === 'seek') playback.position = p.value;
      } else if (action === 'request') throw Error('Unexpected model request');
      await page.evaluate(value => window.nativeResult(value), { id, result });
    });
    await page.addInitScript(() => { window.Native = { call: (...args) => window.nativeCall(...args) }; });
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.waitForFunction(() => window.bajiaoEngine);
    await page.evaluate(() => {
      const e = window.bajiaoEngine; e.kick = async () => {};
      Object.assign(e.state.tasks[0], { status: 'running', pauseRequested: false });
    });
    const click = act => page.locator('[data-act="' + act + '"]').first().click();
    const plays = () => calls.filter(call => call.action === 'play');
    const complete = async () => {
      playback.playing = false;
      await page.evaluate(id => window.onNativePlaybackAction('completion', 5000, id), playback.id);
    };
    const systemSeek = (value, action = 'streamseek', audioId = playback.id) =>
      page.evaluate(({ value, action, audioId }) => window.onNativePlaybackAction(action, value, audioId), { value, action, audioId });

    await click('book:' + book.id); await click('read:' + chapter.id); await click('makeandlisten'); await click('playchapter');
    assert.equal(plays().at(-1).sentenceIndex, 0); assert.equal(plays().at(-1).sentenceCount, 8);
    assert(plays().at(-1).chapterDuration > plays().at(-1).duration);
    assert.equal(plays().at(-1).durationEstimated, true);
    await complete();
    assert.equal(playback.id, 'line2.wav');
    assert.equal(plays().at(-1).sentenceIndex, 2, 'sentence position must include skipped rows and non-contiguous segment IDs');
    assert.equal(Number(await page.locator('#seek').inputValue()), plays().at(-1).sentenceIndex);
    assert.equal(Number(await page.locator('#seek').getAttribute('max')), plays().at(-1).sentenceCount);
    const started = plays().length;
    await page.evaluate(async () => {
      const e = window.bajiaoEngine, c = e.state.books[0].chapters[0];
      c.segments[3].audio = 'line3.wav'; c.segments[4].audio = 'line4.wav';
      c.segments.push({ id: 24, text: '新增一句。', speaker: '旁白', durMs: 5000 }, { id: 27, text: '最后一句。', speaker: '旁白', durMs: 5000 });
      e.touch(c); await e.persist();
    });
    const update = calls.filter(call => call.action === 'playback' && call.op === 'streamprogress').at(-1);
    assert.equal(update.sentenceCount, 10); assert.equal(update.sentenceIndex, 2); assert.equal(update.expectedAudioId, 'line2.wav');
    assert.equal(plays().length, started, 'growing the chapter only refreshes metadata');
    await page.evaluate(async () => {
      const e = window.bajiaoEngine, c = e.state.books[0].chapters[0];
      c.audio = 'merged.wav'; c.duration = 60; c.status = 'ready'; e.state.tasks[0].status = 'done'; e.touch(c); await e.persist();
    });
    const merged = calls.filter(call => call.action === 'playback' && call.op === 'streamprogress').at(-1);
    assert.equal(merged.chapterDuration, 60000); assert.equal(merged.durationEstimated, false);
    assert.equal(plays().length, started, 'merging does not interrupt the current sentence');
    await systemSeek(4); assert.equal(playback.id, 'line4.wav');
    await click('playchapter'); assert.equal(playback.playing, false);
    await systemSeek(9); assert.equal(playback.id, 'line4.wav'); assert.equal(playback.playing, false);
    assert.match(await page.locator('#toast').textContent(), /最新已生成/);
    await click('back'); await click('go:settings');
    await systemSeek(3); assert.equal(playback.id, 'line3.wav'); assert.equal(playback.playing, false);
    assert.equal(await page.locator('main').getAttribute('data-page'), 'settings', 'system seek preserves the browsing page');
    const beforeStale = plays().length; await systemSeek(0, 'streamseek', 'obsolete.wav'); assert.equal(plays().length, beforeStale);
    playback.position = 1000;
    await systemSeek(15000, 'streamskip'); assert.equal(playback.id, 'line4.wav'); assert.equal(playback.position, 4999);
    await systemSeek(-15000, 'streamskip'); assert.equal(playback.id, 'line0.wav'); assert.equal(playback.position, 4999);
    await page.evaluate(async () => {
      const e = window.bajiaoEngine, c = e.state.books[0].chapters[0];
      for (const s of c.segments.slice(5)) Object.assign(s, { skip: true, audio: 'skip' });
      e.touch(c); await e.persist();
    });
    await systemSeek(9); assert.equal(playback.id, 'line4.wav');
    playback.playing = true;
    await page.evaluate(id => window.onNativePlaybackAction('play', 0, id), playback.id);
    await complete();
    const finished = calls.filter(call => call.action === 'playback' && call.op === 'streamprogress').at(-1);
    assert.equal(finished.sentenceIndex, 10); assert.equal(finished.sentenceCount, 10);
    assert.equal(finished.expectedAudioId, 'line4.wav');
    assert.equal(await page.evaluate(() => window.bajiaoEngine.state.books[0].chapters[0].playbackCompleted), true);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'ui-report.json'), JSON.stringify({ pass: true, checks: [
      'chapter fraction matches app, including skipped segments', 'growing chapters refresh metadata without restarting',
      'merge adopts actual duration', 'system seek targets chapter sentences and clamps to produced audio',
      'paused and background seeking preserve user intent', 'obsolete seek is ignored', 'relative seek crosses sentences with the right offset',
      'chapter completion reaches 100 percent including trailing skipped sentences'
    ], errors }, null, 2));
    console.log('PASS chapter notification progress, generation/merge updates, system seeking, background and pause behavior');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

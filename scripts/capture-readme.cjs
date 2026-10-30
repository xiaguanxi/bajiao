// Capture the shipped UI with original demo text and an in-memory native bridge.
// This script never connects to model providers or reads a device's library.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const V = require('../app/src/main/assets/core.js');

const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'app/src/main/assets');
const images = path.join(root, 'docs/images');
const screenshots = path.join(images, 'screenshots');
const version = fs.readFileSync(path.join(root, 'app/build.gradle'), 'utf8').match(/versionName '([^']+)'/)[1];
const story = [
  '雨落在旧书店的檐角，顾青推开门，带进一阵潮湿的风。',
  '“你终于来了。”',
  '沈知夏把一本泛黄的册子放到桌上。',
  '“信里说，这里有人记得那座灯塔。”',
  '顾青收好伞，目光落在书页间的一枚银杏叶上。',
  '“那就先听完这个故事吧。”',
  '窗外的雨声渐渐轻了，灯光给纸页镀上了一层暖色。',
  '“从第一页开始？”',
  '她笑着点头，翻开了那本没有署名的书。',
  '“故事总要有人记得，也总会有人继续讲下去。”',
  '远处传来一声悠长的汽笛，仿佛在回应一封迟到的来信。',
  '顾青坐下来，听见风从山的另一边吹过。',
];
const chapterTitles = ['雨中的来客', '旧信与灯塔', '山那边的风', '第七页的秘密', '落在窗边的光', '夜航的船', '书页里的远方', '等一场雨停', '没有署名的信', '重逢的季节', '回到旧书店', '故事仍在继续'];

async function demoState() {
  const engine = new V.Engine({ saveState: async () => {} });
  Object.assign(engine.state.settings, { autoProduceUpcoming: false, voiceAdoptionMode: 'review', readerTheme: 'light' });
  const books = [['山海来信', '林间'], ['雨巷书店', '南枝'], ['夜航笔记', '江屿'], ['风起南窗', '晚晴'], ['星河慢行', '知远'], ['山城旧事', '青禾']];
  for (const [name, author] of books) {
    const book = await engine.addBook(name, chapterTitles.map((title, i) => `第${i + 1}章 ${title}\n${story.join('\n')}`).join('\n'));
    book.author = author;
  }
  engine.state.voices = [
    { id: 'demo-narrator', name: '沉静叙述', description: '成年男性，声线温润沉稳，吐字清晰，适合娓娓道来的故事旁白。', source: 'design' },
    { id: 'demo-qing', name: '清朗青年', description: '青年男性，声音清亮自然，语气温和，带一点少年感。', source: 'import' },
    { id: 'demo-zhixia', name: '温柔女声', description: '青年女性，声线柔和细腻，表达自然，有亲切的故事感。', source: 'design' },
    { id: 'demo-elder', name: '醇厚长者', description: '老年男性，嗓音醇厚，带一点沙哑，节奏从容。', source: 'import' },
  ].map(voice => ({ ...voice, sample: voice.id + '.wav', format: 'wav', enabled: true, tested: true }));
  const book = engine.state.books[0];
  book.characters = [
    { name: '旁白', voice: 'demo-narrator', description: '沉静温润，以从容的语气讲述故事。', background: '以叙述者视角讲述原文。' },
    { name: '顾青', voice: 'demo-qing', description: '清朗的青年男声，温和，带着好奇与期待。', background: '循着一封旧信来到山城，寻找灯塔的往事。' },
    { name: '沈知夏', voice: 'demo-zhixia', description: '温柔自然的青年女声，细腻，语气亲切。', background: '旧书店的主人，替来往的人保存故事。' },
  ].map(role => ({ ...role, aliases: [], profileChecked: true, bitPart: false, bitPartSource: 'llm' }));
  book.chapters.forEach((chapter, index) => {
    if (index > 3) return;
    chapter.segments = V.units(chapter.text).map(unit => ({
      ...unit,
      speaker: /你终于来了|那就先听|故事总要/.test(unit.text) ? '沈知夏' : /信里说|从第一页/.test(unit.text) ? '顾青' : '旁白',
      confidence: 1, annotationStatus: 'complete', emotion: '自然', scene: '雨天的旧书店',
      delivery: '自然、连贯地讲述，保留原文的语气。', directionVersion: 1,
      audio: index < 3 || unit.id < 5 ? `demo-${index}-${unit.id}.wav` : null,
      durMs: 4200 + unit.text.length * 180, qualityStatus: 'passed',
    }));
    chapter.promptMode = 'director';
    chapter.status = index < 3 ? 'ready' : 'annotated';
    if (index < 3) {
      chapter.audio = `demo-chapter-${index}.wav`;
      chapter.duration = chapter.segments.reduce((total, segment) => total + segment.durMs, 0) / 1000;
    }
  });
  engine.state.lastPlayback = { bookId: book.id, chapterId: book.chapters[0].id, position: 28000, at: Date.now(), completed: false };
  return { state: JSON.parse(JSON.stringify(engine.state)), book };
}

async function main() {
  fs.mkdirSync(screenshots, { recursive: true });
  const { state, book } = await demoState();
  const errors = [], modelCalls = [], captures = [];
  const server = http.createServer((request, response) => {
    const file = path.resolve(assets, '.' + (request.url === '/' ? '/index.html' : request.url.split('?')[0]));
    if (!file.startsWith(assets + path.sep) || !fs.existsSync(file)) return response.writeHead(404).end();
    const mime = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.svg': 'image/svg+xml' };
    response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    response.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_BROWSER_CHANNEL ? { channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL } : process.platform === 'win32' ? { channel: 'msedge' } : {}) });
  try {
    for (const name of ['library', 'annotation', 'player', 'roles', 'voices', 'queue']) {
      const page = await browser.newPage({ viewport: { width: 393, height: 873 }, deviceScaleFactor: 2, locale: 'zh-CN' });
      page.setDefaultTimeout(8000);
      page.on('pageerror', error => errors.push(`${name}: ${error.message}`));
      await page.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
      let playback = name === 'player' ? { id: book.chapters[0].audio, playing: true, position: 28_000 } : { id: '', playing: false, position: 0 };
      await page.exposeFunction('readmeNative', async (id, action, raw) => {
        const payload = JSON.parse(raw || '{}');
        let result = true;
        if (action === 'load') result = { state: JSON.parse(JSON.stringify(state)), llmConfigured: true, ttsConfigured: true, version };
        else if (action === 'playbackState') result = { ...playback };
        else if (action === 'networkState') result = 'wifi';
        else if (action === 'audioDurations') result = {};
        else if (action === 'play') playback = { id: payload.id, playing: !payload.startPaused, position: payload.position || 0 };
        else if (action === 'loadChapter') result = state.books.flatMap(item => item.chapters).find(chapter => chapter.id === payload.chapterId);
        else if (['request', 'testModelConfiguration', 'testTtsConfiguration'].includes(action)) {
          modelCalls.push(action);
          throw new Error('Screenshot capture must not call model services');
        }
        if (!page.isClosed()) await page.evaluate(value => window.nativeResult(value), { id, result });
      });
      await page.addInitScript(() => { window.Native = { call: (...args) => window.readmeNative(...args) }; });
      await page.goto(origin);
      await page.waitForFunction(() => window.bajiaoEngine);
      const act = action => page.locator(`[data-act="${action}"]`).first().click();
      if (['annotation', 'player', 'roles'].includes(name)) await act('book:' + book.id);
      if (name === 'roles') await act('go:roles');
      if (name === 'annotation' || name === 'player') {
        await act('read:' + book.chapters[0].id);
        await act(name === 'annotation' ? 'go:annotated' : 'go:listen');
      }
      if (name === 'voices') await act('go:voices');
      if (name === 'queue') {
        await page.evaluate(({ bookId, chapterIds, total }) => {
          bajiaoEngine.state.tasks = [
            { id: 'demo-completed', bookId, chapterId: chapterIds[0], status: 'done', done: total, total, created: Date.now() - 10000 },
            { id: 'demo-producing', bookId, chapterId: chapterIds[3], status: 'running', phase: '正在合成语音', done: 5, total, created: Date.now() - 5000, prio: 1 },
            { id: 'demo-queued', bookId, chapterId: chapterIds[4], status: 'queued', phase: '等待制作', done: 0, total, created: Date.now(), prio: 0 },
          ];
          renderApp();
        }, { bookId: book.id, chapterIds: book.chapters.map(chapter => chapter.id), total: book.chapters[0].segments.length });
        await act('go:tasks');
      }
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(450);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: horizontal overflow`);
      await page.screenshot({ path: path.join(screenshots, name + '.png'), animations: 'disabled' });
      captures.push(name);
      await page.close();
    }

    const banner = await browser.newPage({ viewport: { width: 1440, height: 500 }, deviceScaleFactor: 1 });
    const logo = fs.readFileSync(path.join(root, 'assets/branding/bajiao-master.png')).toString('base64');
    await banner.setContent(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>
      *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;font-family:"Microsoft YaHei","PingFang SC",sans-serif}
      body{color:#f5f1e6;background:#143a36;overflow:hidden}.hero{height:100%;padding:54px 70px;position:relative;display:flex;align-items:center;justify-content:space-between;background:radial-gradient(ellipse at 30% 105%,#315d4f 0,transparent 64%),linear-gradient(115deg,#173e37,#102f32)}
      .rain{position:absolute;inset:0;background:repeating-linear-gradient(110deg,transparent 0,transparent 67px,#c8ddca0a 68px,#c8ddca0a 69px,transparent 70px);pointer-events:none}
      .copy{position:relative;z-index:1}.eyebrow{font-size:16px;letter-spacing:5px;color:#b8cdb7;margin:0 0 24px;font-weight:500}.headline{font-size:70px;line-height:1.24;letter-spacing:2px;font-weight:600;margin:0 0 26px}.headline span{color:#d9d8b1}.features{font-size:21px;letter-spacing:1px;color:#d0ddcd;margin:0}.features b{font-weight:400;color:#779b87;padding:0 14px}
      .art{width:354px;height:354px;position:relative;margin-right:8px;flex-shrink:0}.art:before{content:"";position:absolute;inset:-14px;border:1px solid #bfceb52d;border-radius:43px;transform:rotate(5deg)}.art img{width:100%;height:100%;border-radius:32px;position:relative;box-shadow:0 24px 60px #041c2470}.footer{position:absolute;bottom:25px;left:70px;color:#96b29c;font-size:11px;letter-spacing:3px}
      </style><div class="hero"><div class="rain"></div><div class="copy"><p class="eyebrow">BAJIAO / 芭蕉</p><p class="headline">把故事，<br><span>读给你听。</span></p><p class="features">TXT / EPUB<b>·</b>多角色有声书<b>·</b>Android</p></div><div class="art"><img src="data:image/png;base64,${logo}" alt="芭蕉雨景图标"></div><span class="footer">STORIES, READ TO YOU.</span></div></html>`);
    await banner.evaluate(() => document.fonts.ready);
    await banner.locator('img').evaluate(image => image.decode());
    await banner.screenshot({ path: path.join(images, 'banner.png') });
    await banner.close();
    assert.deepEqual(modelCalls, []);
    assert.deepEqual(errors, []);
    const reportDir = path.join(root, 'artifacts/readme-showcase');
    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(path.join(reportDir, 'capture-report.json'), JSON.stringify({ passed: true, version, captures, modelCalls: 0, errors, demoText: 'Original fictional text authored for the project screenshots.' }, null, 2));
    console.log(`Captured ${captures.length} app screens and the README banner; no model calls.`);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });

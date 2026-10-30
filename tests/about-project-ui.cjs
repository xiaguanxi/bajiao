// Verify the actual About page with a local native bridge; no model requests.
'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { Engine } = require('../app/src/main/assets/core.js');

(async () => {
  const root = path.resolve('app/src/main/assets'), out = path.resolve('artifacts/about-project');
  fs.mkdirSync(out, { recursive: true });
  const version = fs.readFileSync('app/build.gradle', 'utf8').match(/versionName '([^']+)'/)[1];
  const engine = new Engine({ saveState: async () => {} });
  engine.state.settings.autoProduceUpcoming = false;
  const settingsBefore = JSON.stringify(engine.state.settings), calls = [], errors = [], layouts = [];
  let failOpen = false;
  const server = http.createServer((request, response) => {
    const brand = request.url.split('?')[0] === '/brand-icon.png';
    const file = brand ? path.resolve('app/src/main/res/drawable-nodpi/bajiao_icon.png') : path.resolve(root, '.' + (request.url === '/' ? '/index.html' : request.url.split('?')[0]));
    if ((!brand && !file.startsWith(root + path.sep)) || !fs.existsSync(file)) return response.writeHead(404).end();
    response.setHeader('Content-Type', file.endsWith('.png') ? 'image/png' : file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    response.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 393, height: 873 }, deviceScaleFactor: 2 });
  page.setDefaultTimeout(8000);
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
  try {
    await page.exposeFunction('aboutNative', async (id, action, payload) => {
      calls.push(action);
      let result = true, error = null;
      if (action === 'load') result = { state: JSON.parse(JSON.stringify(engine.state)), llmConfigured: false, ttsConfigured: false, version };
      else if (action === 'networkState') result = 'offline';
      else if (action === 'playbackState') result = { id: '', playing: false, position: 0 };
      else if (action === 'audioDurations') result = {};
      else if (action === 'checkAppUpdate') result = { status: 'skipped' };
      else if (action === 'openProject') {
        assert.deepEqual(JSON.parse(payload), {});
        if (failOpen) error = { message: '无法打开项目地址，请确认已安装可用的浏览器。', retryable: false };
      } else if (['request', 'testModelConfiguration'].includes(action)) throw new Error('Unexpected model request');
      if (!page.isClosed()) await page.evaluate(value => window.nativeResult(value), { id, result: error ? null : result, error });
    });
    await page.addInitScript(() => { window.Native = { call: (...args) => window.aboutNative(...args) }; });
    await page.goto(origin);
    await page.waitForFunction(() => window.bajiaoEngine);
    const act = action => page.locator(`[data-act="${action}"]`).first().click();
    await act('go:settings');
    await act('settingshelp:all');
    assert.equal(await page.locator('.settings-header h2').innerText(), '帮助');
    assert.equal(await page.locator('.settings-project-link').count(), 0);
    assert.equal(await page.locator('[data-help-topic]').count(), 10);
    await page.locator('[data-help-topic="quality"] summary').click();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    await page.evaluate(() => bajiaoEngine.persist());
    await act('back');
    await act('go:about');
    const link = page.getByRole('link', { name: '打开 GitHub 项目地址' });
    const projectUrl=await link.getAttribute('href');
    assert.equal(projectUrl, 'https://github.com/xiaguanxi/bajiao');
    assert.match(await page.locator('.settings-version').innerText(), new RegExp(version.replaceAll('.', '\\.')));
    assert.equal(await page.locator('.settings-header h2').innerText(), '关于');
    assert.equal(await page.locator('[data-help-topic]').count(), 0);
    for (const [width, height] of [[320, 640], [393, 873], [768, 873], [873, 393]]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.evaluate(() => document.fonts.ready);
      await page.locator('.settings-about-icon img').evaluate(image => image.decode());
      await page.screenshot({ path: path.join(out, `about-${width}.png`), animations: 'disabled' });
      await link.evaluate(element => element.scrollIntoView({ block: 'center' }));
      const box = await link.boundingBox();
      assert(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= height, 'Project link must remain accessible');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow');
      layouts.push({ width, height });
    }
    await page.setViewportSize({ width: 393, height: 873 });
    await link.click();
    await page.waitForFunction(() => !document.querySelector('#toast').textContent.includes('无法打开'));
    await link.focus();
    await page.keyboard.press('Enter');
    failOpen = true;
    await link.click();
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('无法打开项目地址'));
    assert.equal(await page.locator('main').getAttribute('data-page'), 'about');
    assert.equal(await page.evaluate(() => JSON.stringify(bajiaoEngine.state.settings)), settingsBefore);
    assert.equal(calls.filter(action => action === 'openProject').length, 3);
    assert.equal(page.url(), origin + '/');
    await act('back');
    await act('settingshelp:all');
    assert.equal(await page.locator('[data-help-topic="quality"]').evaluate(element => element.open), true);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'ui-report.json'), JSON.stringify({ passed: true, version, layouts, projectUrl, projectOpenCalls: 3, keyboardActivation: true, helpExpansionPreserved: true, settingsPreserved: true, browserFailureHandled: true, modelCalls: 0, errors }, null, 2));
    console.log('PASS About project link: 4 layouts, native bridge, keyboard, failure feedback and preserved settings/help');
  } catch (error) {
    await page.screenshot({ path: path.join(out, 'failure.png') });
    throw error;
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

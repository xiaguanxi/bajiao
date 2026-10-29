const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/Users/xiagu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const V = require('../app/src/main/assets/core.js');

test('settings switches render as full pill switches without shrinking to dots or overflowing', async () => {
  const assets = path.resolve('app/src/main/assets');
  const engine = new V.Engine({ saveState: async () => {} });
  await engine.addBook('测试书目', '第一章\n正文内容。');
  const state = JSON.parse(JSON.stringify(engine.state));

  const server = http.createServer((req, res) => {
    let rel = req.url === '/' ? 'index.html' : req.url.split('?')[0].replace(/^\//, '');
    let filePath = path.join(assets, rel);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    const contentType = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json'
    }[ext] || 'text/plain';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(fs.readFileSync(filePath));
  });

  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });
  try {
  const page = await browser.newPage({ viewport: { width: 393, height: 873 } });

  await page.exposeFunction('nativeCall', async (id, action) => {
    const result = action === 'load'
      ? { state, llmConfigured: true, ttsConfigured: true }
      : action === 'playbackState'
      ? { playing: false, position: 0 }
      : action === 'audioStats'
      ? { totalBytes: 10485760, unlistenedBytes: 5242880, fileCount: 10 }
      : true;
    await page.evaluate(v => window.nativeResult(v), { id, result });
  });

  await page.addInitScript(() => {
    window.Native = { call: (...args) => window.nativeCall(...args) };
  });

  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.bajiaoEngine);

  // 1. Check productionpolicy switch
  await page.locator('[data-act="go:settings"]').click();
  await page.waitForTimeout(200);
  await page.locator('[data-act="go:productionpolicy"]').first().click();
  await page.waitForTimeout(200);

  const wifiSwitch = page.locator('#productionWifiOnly');
  const wifiBox = await wifiSwitch.boundingBox();
  assert.equal(wifiBox.width, 48, 'wifiSwitch width must be 48px');
  assert.equal(wifiBox.height, 28, 'wifiSwitch height must be 28px');

  // Toggle on
  await wifiSwitch.click();
  await page.waitForTimeout(200);
  const wifiChecked = await wifiSwitch.isChecked();
  assert.equal(wifiChecked, true, 'wifiSwitch should be checked');

  // 2. Check voicepolicy switch
  await page.locator('[data-act="back"]').click();
  await page.waitForTimeout(200);
  await page.locator('[data-result="discard"]').click();
  await page.waitForTimeout(200);
  await page.locator('[data-act="go:voicepolicy"]').click();
  await page.waitForTimeout(200);

  const presetSwitch = page.locator('#productionPresets');
  const presetBox = await presetSwitch.boundingBox();
  assert.equal(presetBox.width, 48, 'presetSwitch width must be 48px');
  assert.equal(presetBox.height, 28, 'presetSwitch height must be 28px');

  // 3. Check storage policy switch uses the same complete switch geometry.
  await page.locator('[data-act="back"]').click();
  await page.waitForTimeout(200);
  await page.locator('[data-act="go:storagepolicy"]').click();
  await page.waitForTimeout(200);

  const storageSwitch = page.locator('#setting-autoDeletePlayed');
  const btnBox = await storageSwitch.boundingBox();
  assert.equal(btnBox.width, 48);
  assert.equal(btnBox.height, 28);
  assert(btnBox.x >= 0 && btnBox.x + btnBox.width <= 393, 'switch remains inside viewport');
  } finally {
  await browser.close();
  server.close();
  }
});

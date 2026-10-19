// 直连 WebView 测试器 v2：Playwright connectOverCDP + adb 真实点击。
const cp = require('node:child_process'), path = require('node:path'), fs = require('node:fs');
const adb = path.resolve('.tools/android-sdk/platform-tools/adb.exe');
const run = (args, opts = {}) => cp.execFileSync(adb, args, { timeout: 60000, maxBuffer: 64 * 1024 * 1024, ...opts });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const { chromium } = require('C:/Users/xiagu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
async function connect() {
  const out = run(['shell', 'cat', '/proc/net/unix']).toString();
  const m = out.match(/@(webview_devtools_remote_\d+)/);
  if (!m) throw Error('no webview socket');
  run(['forward', 'tcp:9223', 'localabstract:' + m[1]]);
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const ctxs = browser.contexts();
  let page = null;
  for (const c of ctxs) for (const p of c.pages()) { const u = p.url(); if (u.includes('app.bajiao.local')) { page = p; break; } }
  if (!page) throw Error('APK WebView page not found');
  let ready = false;
  for (let i = 0; i < 40; i++) { try { if (await page.evaluate(() => Boolean(window.bajiaoEngine?.state))) { ready = true; break; } } catch (e) {} await sleep(300); }
  if (!ready) throw Error('APK library did not finish loading');
  const read = expr => page.evaluate(expr);
  const state = async () => JSON.parse(await page.evaluate(() => JSON.stringify(window.bajiaoEngine?.state)));
  async function tap(selector) {
    for (let i = 0; i < 25; i++) {
      const point = await page.evaluate(sel => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, top: r.top, bottom: r.bottom, h: innerHeight, w: innerWidth, disabled: el.disabled, text: el.textContent.slice(0, 60) }; }, selector);
      if (!point) { await sleep(300); continue; }
      if (point.disabled) throw Error('Disabled control: ' + selector);
      if (point.top < 10 || point.bottom > point.h - 75) {
        const w = await page.evaluate(() => ({ w: innerWidth, h: innerHeight, d: devicePixelRatio }));
        run(['shell', 'input', 'swipe', String(Math.round(w.w * w.d / 2)), String(Math.round(w.h * w.d * (point.top < 10 ? .3 : .7))), String(Math.round(w.w * w.d / 2)), String(Math.round(w.h * w.d / 2))]);
        await sleep(400); continue;
      }
      const w = await page.evaluate(() => ({ w: innerWidth, h: innerHeight, d: devicePixelRatio }));
      let yOff = 0;
      try { const frames = run(['shell', 'dumpsys', 'window', 'windows']).toString(); const sb = frames.match(/Window #\d+ Window\{[^}]*StatusBar\}:[\s\S]*?mFrame=\[0,0\]\[\d+,(\d+)\]/); if (sb) yOff = Number(sb[1]); } catch (e) {}
      run(['shell', 'CLASSPATH=/data/local/tmp/bajiao-touch.dex', 'app_process', '/system/bin', 'DeviceTouch', String(Math.round(point.x * w.d)), String(Math.round(point.y * w.d + yOff))]);
      await sleep(400); return;
    }
    throw Error('Could not scroll to control: ' + selector);
  }
  async function screenshot(name) { fs.mkdirSync('artifacts/device-e2e', { recursive: true }); fs.writeFileSync(path.join('artifacts/device-e2e', name + '.png'), run(['exec-out', 'screencap', '-p'])); }
  return { browser, page, read, state, tap, screenshot };
}
module.exports = { connect, run, sleep };
if (require.main === module) (async () => {
  const h = await connect();
  try {
    if (process.argv[2] === 'summary') console.log(JSON.stringify(await h.read(() => ({ books: bajiaoEngine.state.books.map(b => ({ name: b.name, count: b.chapters.length })), tasks: bajiaoEngine.state.tasks.length, busy: !document.querySelector('#busy').hidden })), null, 2));
    else { await h.screenshot(process.argv[2] || 'observe'); console.log((await h.read(() => document.body.innerText)).slice(0, 800)); }
  } finally { await h.browser.close(); }
})().catch(e => { console.error('FAIL:', e.message); process.exitCode = 1; });

// CDP is used for observation only. All interactions use Android input events.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const adb = path.resolve('.tools/android-sdk/platform-tools/adb.exe');
const dir = path.resolve('artifacts/device-e2e');
fs.mkdirSync(dir, { recursive: true });
function run(args, opts = {}) { return cp.execFileSync(adb, args, { timeout: 60000, maxBuffer: 64 * 1024 * 1024, ...opts }); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
function log(action) { fs.appendFileSync(path.join(dir, 'actions.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...action }) + '\n'); }
function finger(x, y) { run(['shell', 'CLASSPATH=/data/local/tmp/vocast-touch.dex', 'app_process', '/system/bin', 'DeviceTouch', String(x), String(y)]); }
async function connect() {
  const socket = run(['shell', 'cat', '/proc/net/unix']).toString().match(/@([^\s]*webview_devtools_remote[^\s]*)/)[1];
  run(['forward', 'tcp:9223', 'localabstract:' + socket]);
  const targets = await (await fetch('http://127.0.0.1:9223/json')).json();
  const target = targets.find(p => p.url.includes('app.vocast.local'));
  if (!target) throw Error('APK WebView unavailable');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let seq = 0;
  const pending = new Map();
  ws.addEventListener('close',()=>{for(const p of pending.values())p.reject(Error('APK WebView connection closed'));pending.clear();});
  ws.addEventListener('message', event => { const m = JSON.parse(event.data); if (m.id) { const p = pending.get(m.id); pending.delete(m.id); if (m.error) p?.reject(Error(m.error.message)); else p?.resolve(m.result); } else if (m.method === 'Runtime.exceptionThrown') log({ type: 'pageerror', message: m.params.exceptionDetails.text }); });
  const cdp = { send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); }); } };
  await cdp.send('Runtime.enable');
  const evaluate = async (fn, arg) => { const r = await cdp.send('Runtime.evaluate', { expression: '(' + fn.toString() + ')(' + (arg === undefined ? '' : JSON.stringify(arg)) + ')', awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const browser = { close: async () => ws.close() };
  const page = { evaluate };
  const read = expr => evaluate(expr);
  let ready=false;
  for(let i=0;i<40;i++){if(await read(()=>Boolean(window.vocastEngine?.state))){ready=true;break;}await sleep(250);}
  if(!ready){await browser.close();throw Error('APK library did not finish loading');}
  const state = () => read(() => JSON.parse(JSON.stringify(window.vocastEngine?.state)));
  async function tap(selector) {
    for (let i = 0; i < 25; i++) {
      const point = await page.evaluate(sel => {
        const el = document.querySelector(sel); if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, top: r.top, bottom: r.bottom, h: innerHeight, w: innerWidth, fixed: !!el.closest('nav'), disabled: el.disabled, text: el.textContent.slice(0, 120) };
      }, selector);
      if (!point) { await sleep(250); continue; }
      if (point.disabled) throw Error('Disabled control: ' + selector);
      if (!point.fixed && (point.top < 10 || point.bottom > point.h - 75)) {
        const { result } = await cdp.send('Runtime.evaluate', { expression: 'devicePixelRatio', returnByValue: true });
        const d = result.value;
        run(['shell', 'input', 'swipe', String(Math.round(point.w * d / 2)), String(Math.round(point.h * d * (point.top < 10 ? .3 : .7))), String(Math.round(point.w * d / 2)), String(Math.round(point.h * d * (point.top < 10 ? .7 : .3))), '300']);
        await sleep(400); continue;
      }
      const { result } = await cdp.send('Runtime.evaluate', { expression: 'devicePixelRatio', returnByValue: true });
      const d = result.value;
      const windowDump=run(['shell','dumpsys','window']).toString();
      if(!/mCurrentFocus=.*com\.vocast\.app/.test(windowDump))throw Error('APK is not the visible Android surface');
      const frames=run(['shell','dumpsys','window','windows']).toString();
      const statusBar=frames.match(/Window #\d+ Window\{[^\n]*StatusBar\}:[\s\S]*?mFrame=\[0,0\]\[\d+,(\d+)\]/);
      if(!statusBar)throw Error('Visible viewport inset unavailable');
      const yOffset=Number(statusBar[1]);
      const x = Math.round(point.x * d), y = Math.round(point.y * d + yOffset);
      finger(x, y);
      log({ type: 'tap', selector, x, y, text: point.text });
      await sleep(400); return;
    }
    throw Error('Could not scroll to control: ' + selector);
  }
  async function field(selector, value) {
    await tap(selector);
    const length = (await evaluate(sel => document.querySelector(sel)?.value, selector)).length;
    run(['shell', 'input', 'keyevent', 'KEYCODE_MOVE_END']);
    if (length) run(['shell', 'input', 'keyevent', ...Array(length).fill('KEYCODE_DEL')]);
    if(/[^\x20-\x7e]/.test(value)){
      run(['shell','CLASSPATH=/data/local/tmp/vocast-touch.dex','app_process','/system/bin','DeviceTouch','clipboard',Buffer.from(value,'utf8').toString('base64')]);
      run(['shell','input','keyevent','KEYCODE_PASTE']);
    }else run(['shell', 'input', 'text', value]);
    run(['shell', 'input', 'keyevent', '4']);
    log({ type: 'field', selector, value });
    await sleep(300);
    if (await evaluate(sel => document.querySelector(sel)?.value, selector) !== value) throw Error('Field input mismatch: ' + selector);
  }
  async function screenshot(name) { fs.writeFileSync(path.join(dir, name + '.png'), run(['exec-out', 'screencap', '-p'])); }
  return { browser, page, cdp, read, state, tap, field, screenshot };
}
function nodes() {
  run(['shell','rm','-f','/sdcard/vocast-e2e.xml']);
  const dump=run(['shell', 'uiautomator', 'dump', '/sdcard/vocast-e2e.xml']).toString();
  if(!dump.includes('dumped'))throw Error('Fresh Android UI hierarchy unavailable');
  const xml = run(['exec-out', 'cat', '/sdcard/vocast-e2e.xml']).toString();
  return [...xml.matchAll(/<node\s+([^>]+)>?/g)].map(m => Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(x => [x[1], x[2]])));
}
async function nativeTap(text) {
  const matches = nodes().filter(n => n.text === text || n['content-desc'] === text);
  if (matches.length !== 1) throw Error('Native control not unique: ' + text);
  const [x1, y1, x2, y2] = matches[0].bounds.match(/\d+/g).map(Number);
  finger(Math.round((x1 + x2) / 2), Math.round((y1 + y2) / 2));
  log({ type: 'nativeTap', text, bounds: matches[0].bounds });
  await sleep(700);
}
module.exports = { connect, run, sleep, log, nodes, nativeTap, finger, dir };
if (require.main === module) (async () => {
  if (process.argv[2] === 'native') { console.log(JSON.stringify(nodes().filter(n => n.text || n['content-desc']).map(n => ({ text: n.text, desc: n['content-desc'], bounds: n.bounds })), null, 2)); return; }
  if (process.argv[2] === 'nativeTap') return nativeTap(process.argv.slice(3).join(' '));
  const h = await connect();
  try {
    if (process.argv[2] === 'summary') { console.log(JSON.stringify(await h.read(() => ({ settings: vocastEngine.state.settings, books: vocastEngine.state.books.map(b => ({ id: b.id, name: b.name, count: b.chapters.length, chapters: b.chapters.slice(0, 6).map(c => ({ id: c.id, title: c.title, status: c.status, audio: c.audio, duration: c.duration, segments: c.segments.length })), roles: b.characters })), tasks: vocastEngine.state.tasks, usage: vocastEngine.state.usage.slice(-5), busy: !document.querySelector('#busy').hidden, toast: document.querySelector('#toast').textContent })), null, 2)); return; }
    if (process.argv[2] === 'tap') await h.tap(process.argv[3]);
    if (process.argv[2] === 'field') await h.field(process.argv[3], process.argv[4]);
    await h.screenshot(process.argv[2] || 'observe');
    console.log(JSON.stringify(await h.read(() => ({ text: document.body.innerText.slice(0, 1200), width: innerWidth, height: innerHeight, dpr: devicePixelRatio, controls: [...document.querySelectorAll('[data-act],input,select')].map(e => ({ act: e.dataset.act, id: e.id, text: e.textContent.slice(0, 100), value: e.type === 'password' ? '[hidden]' : e.value })).slice(0, 20) })), null, 2));
  } finally { await h.browser.close(); }
})().catch(e => { console.error(e.stack); process.exitCode = 1; });

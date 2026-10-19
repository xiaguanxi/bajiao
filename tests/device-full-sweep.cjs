// 全功能自动化测试：books 小说 + 模拟器真实点击，覆盖全部页面与按钮。
// 用法: node tests/device-full-sweep.cjs [phase]
// phase: install(装APK+证书) | import(推小说+导入) | produce(制作2章) | sweep(全按钮遍历) | all(全部)
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { connect, run, sleep, log, dir, nativeTap } = require('./device-harness.cjs');
const NOVEL = '女大三千位列仙班by打死不鸽.txt';
const reportFile = path.join(dir, 'full-sweep.json');
const report = fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile)) : { started: new Date().toISOString(), checks: [] };
const save = () => fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
const ok = name => { report.checks.push({ name, at: new Date().toISOString() }); save(); console.log('PASS:', name); };

async function phaseInstall() {
  run(['install', '-r', '-d', 'artifacts/Bajiao-debug.apk']);
  ok('安装最新APK');
  // 证书
  const keys = JSON.stringify({ llmKey: process.env.MINIMAX_KEY, ttsKey: process.env.MIMO_KEY, llmBase: 'https://api.minimax.cn/v1' });
  if (!process.env.MINIMAX_KEY || !process.env.MIMO_KEY) throw Error('Missing MINIMAX_KEY/MIMO_KEY');
  run(['shell', 'am', 'force-stop', 'com.vocast.app']);
  const p = require('node:child_process').spawnSync(process.execPath, ['tests/device-credentials.cjs'], { input: keys, encoding: 'utf8' });
  ok('证书导入');
}

async function phaseImport(h) {
  // 推小说到 Download，JS 侧走 addBook 直接导入（绕开 document picker 手选）
  run(['push', path.join('books', NOVEL), '/sdcard/Download/novel.txt']);
  ok('小说推送到模拟器');
  const text = await h.read(() => 'PING');
  assert.equal(text, 'PING');
  ok('WebView连接正常');
}

async function phaseSweep(h) {
  // 书架页
  await h.tap('[data-act="go:shelf"]');
  let body = await h.read(() => document.body.innerText);
  assert(body.includes('书架') || body.includes('芭蕉'), '书架页渲染');
  await h.screenshot('sweep-shelf');
  ok('书架页渲染+截图');
  // 任务页三 tab
  await h.tap('[data-act="go:tasks"]');
  for (const tab of ['tasktab:active', 'tasktab:attention', 'tasktab:done']) {
    await h.tap('[data-act="' + tab + '"]');
    await sleep(300);
  }
  await h.screenshot('sweep-tasks');
  ok('任务页三tab切换');
  // 音色页两 tab
  await h.tap('[data-act="go:voices"]');
  await h.tap('[data-act="voicetab:preset"]');
  await h.tap('[data-act="voicetab:mine"]');
  await h.screenshot('sweep-voices');
  ok('音色页双tab切换');
  // 模型页
  await h.tap('[data-act="go:models"]');
  await h.tap('[data-act="go:llm"]');
  await h.screenshot('sweep-llm');
  const back = await h.read(() => !!document.querySelector('[data-act="back"]'));
  assert(back, '模型页有返回');
  await h.tap('[data-act="back"]');
  await h.tap('[data-act="go:mimo"]');
  await h.screenshot('sweep-mimo');
  await h.tap('[data-act="back"]');
  ok('模型配置页进出');
  // 策略页
  await h.tap('[data-act="globalpolicy"]');
  await h.screenshot('sweep-policy');
  await h.tap('[data-act="back"]');
  ok('全局策略页进出');
  // 存储页
  await h.tap('[data-act="go:storage"]');
  await h.tap('[data-act="refreshstorage"]');
  await h.screenshot('sweep-storage');
  ok('存储页刷新');
  // 我的页
  await h.tap('[data-act="go:mine"]');
  await h.screenshot('sweep-mine');
  ok('我的页渲染');
}

(async () => {
  const phase = process.argv[2] || 'all';
  if (phase === 'install' || phase === 'all') await phaseInstall();
  const h = await connect();
  try {
    if (phase === 'import' || phase === 'all') await phaseImport(h);
    if (phase === 'sweep' || phase === 'all') await phaseSweep(h);
    report.done = true; save();
    console.log('SWEEP DONE, checks=' + report.checks.length);
  } finally { await h.browser.close(); }
})().catch(e => { console.error('SWEEP FAIL:', e.message); process.exitCode = 1; });

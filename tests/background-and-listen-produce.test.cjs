
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

test('app.js background and auto-produce upcoming logic', async (t) => {
  const appJs = fs.readFileSync('app/src/main/assets/app.js', 'utf8');

  // 1. 验证 window.appBackground 不再暂停任务
  assert.ok(appJs.includes('window.appBackground'), 'window.appBackground exists');
  assert.ok(!appJs.includes('t.pauseRequested=true'), 'window.appBackground does not force pause tasks');
  assert.ok(appJs.includes('syncProductionStatus'), 'window.appBackground calls syncProductionStatus');

  // 2. 验证 checkAutoProduceUpcoming 逻辑存在并被调用
  assert.ok(appJs.includes('async function checkAutoProduceUpcoming'), 'checkAutoProduceUpcoming defined');
  assert.ok(appJs.includes('checkAutoProduceUpcoming(bid, cid)'), 'checkAutoProduceUpcoming called in playCurrentChapter');

  // 3. 验证 syncProductionStatus 逻辑与 productionStatus 原生调用
  assert.ok(appJs.includes('async function syncProductionStatus'), 'syncProductionStatus defined');
  assert.ok(appJs.includes('device.productionStatus'), 'productionStatus IPC invoked');

  // 4. 验证 UI 开关与 Banner 渲染
  assert.ok(appJs.includes('vc-listening-prod-banner'), 'listening banner included in player');
  assert.ok(appJs.includes('toggleautoproduce'), 'toggleautoproduce action supported');
});

'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Controller } = require('../app/src/main/assets/app-updates.js');
const Settings = require('../app/src/main/assets/settings-model.js');
const available = { status: 'available', version: '0.8.37', downloadUrl: 'https://github.com/xiaguanxi/bajiao/releases/download/v0.8.37/Bajiao-0.8.37.apk' };

function setup(overrides = {}) {
  let enabled = true;
  const calls = [], notifications = [], changes = [];
  const controller = new Controller({
    getEnabled: () => enabled,
    saveEnabled: async value => { enabled = value; },
    call: async (action, payload) => { calls.push({ action, payload }); return { status: 'current' }; },
    onAvailable: value => notifications.push(value),
    onChange: value => changes.push({ ...value }),
    ...overrides,
  });
  return { controller, calls, notifications, changes };
}

test('automatic update preference migrates and preserves an explicit opt-out', () => {
  assert.equal(Settings.normalize({}).autoCheckUpdates, true);
  assert.equal(Settings.normalize({ autoCheckUpdates: false }).autoCheckUpdates, false);
  assert.equal(Settings.normalize({ autoCheckUpdates: 'false' }).autoCheckUpdates, true);
  assert.equal(Settings.normalize(JSON.parse(JSON.stringify(Settings.normalize({ autoCheckUpdates: false })))).autoCheckUpdates, false);
});

test('disabled automatic checks stay quiet while manual checking still works', async () => {
  const { controller, calls } = setup();
  await controller.setEnabled(false);
  assert.equal(await controller.check({ automatic: true }), null);
  assert.equal(calls.length, 0);
  await controller.check();
  assert.deepEqual(calls, [{ action: 'checkAppUpdate', payload: { automatic: false } }]);
  assert.equal(controller.state.status, 'current');
});

test('manual and automatic checks share an in-flight request', async () => {
  let finish;
  const calls = [];
  const { controller } = setup({ call: (...args) => { calls.push(args); return new Promise(resolve => finish = resolve); } });
  const first = controller.check({ automatic: true });
  const second = controller.check();
  assert.equal(first, second);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 1);
  assert.equal(controller.state.status, 'checking');
  finish({ status: 'current' });
  await first;
  assert.equal(controller.state.status, 'current');
});

test('automatic checks notify once per version and never download on their own', async () => {
  const calls = [], notices = [];
  const { controller } = setup({ call: async (...args) => { calls.push(args); return available; }, onAvailable: value => notices.push(value) });
  await controller.check({ automatic: true });
  await controller.check({ automatic: true });
  assert.equal(notices.length, 1);
  assert(calls.every(([action]) => action === 'checkAppUpdate'));
  await controller.download();
  assert.deepEqual(calls.at(-1), ['openAppUpdate', { url: available.downloadUrl }]);
});

test('opting out during an automatic request suppresses its late notice', async () => {
  let finish;
  const notices = [];
  const { controller } = setup({ call: () => new Promise(resolve => finish = resolve), onAvailable: value => notices.push(value) });
  const check = controller.check({ automatic: true });
  await new Promise(resolve => setImmediate(resolve));
  await controller.setEnabled(false);
  finish(available);
  await check;
  assert.equal(controller.enabled, false);
  assert.deepEqual(notices, []);
});

test('failed preference saves leave the original setting and clear the busy state', async () => {
  const { controller } = setup({ saveEnabled: async () => { throw Error('保存失败'); } });
  await assert.rejects(controller.setEnabled(false), /保存失败/);
  assert.equal(controller.enabled, true);
  assert.equal(controller.state.saving, false);
});

test('network errors and invalid responses permit a successful retry', async () => {
  let response = Promise.reject(Error('网络不可用'));
  response.catch(() => {});
  const { controller } = setup({ call: () => response });
  await assert.rejects(controller.check(), /网络不可用/);
  assert.equal(controller.state.status, 'error');
  response = Promise.resolve(true);
  await assert.rejects(controller.check(), /无效的信息/);
  response = Promise.resolve({ status: 'empty' });
  await controller.check();
  assert.equal(controller.state.status, 'empty');
  assert.equal(controller.state.error, '');
});

test('rate-limited automatic skips do not masquerade as a current version', async () => {
  const { controller } = setup({ call: async () => ({ status: 'skipped' }) });
  await controller.check({ automatic: true });
  assert.equal(controller.state.status, 'idle');
  assert.equal(controller.state.result, null);
});

test('invalid download results are rejected and download requires an available version', async () => {
  const { controller } = setup({ call: async () => ({ status: 'available', version: '0.8.37' }) });
  await assert.rejects(controller.download(), /先检查/);
  await assert.rejects(controller.check(), /缺少安装包/);
});

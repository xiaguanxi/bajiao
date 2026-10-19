const {test} = require('node:test'), assert = require('node:assert/strict');
const {isNetworkRetryable, nextRetryDelay, NET_RETRY_LIMIT} = require('../app/src/main/assets/core.js');

test('网络抖动判为可重试：retryable/超时/5xx/429/断连', () => {
  assert.equal(isNetworkRetryable({retryable: true, message: 'x'}), true);
  assert.equal(isNetworkRetryable({message: '请求超时，已完成音频会保留'}), true);
  assert.equal(isNetworkRetryable({message: '网络连接中断，已完成进度会保留'}), true);
  assert.equal(isNetworkRetryable({message: 'HTTP 500', status: 500}), true);
  assert.equal(isNetworkRetryable({message: 'HTTP 429', status: 429}), true);
  assert.equal(isNetworkRetryable({message: 'fetch failed'}), true);
  assert.equal(isNetworkRetryable({message: 'socket hang up'}), true);
});

test('非网络错误不重试：审核/401/业务错', () => {
  assert.equal(isNetworkRetryable({message: '内容审核未通过', code: 'CONTENT_REJECTED'}), false);
  assert.equal(isNetworkRetryable({message: 'input sensitive', code: '1026'}), false);
  assert.equal(isNetworkRetryable({message: '密钥验证失败', status: 401}), false);
  assert.equal(isNetworkRetryable({message: '音色不存在'}), false);
  // 内容审核优先于 retryable 标记
  assert.equal(isNetworkRetryable({retryable: true, message: 'output sensitive'}), false);
});

test('指数退避：30s起，2^x，上限10分钟', () => {
  assert.equal(nextRetryDelay(0), 30000);
  assert.equal(nextRetryDelay(1), 60000);
  assert.equal(nextRetryDelay(2), 120000);
  assert.equal(nextRetryDelay(10), 600000);
  assert.equal(nextRetryDelay(99), 600000);
  assert.equal(NET_RETRY_LIMIT, Infinity);
});

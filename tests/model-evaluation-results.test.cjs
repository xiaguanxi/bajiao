const {test} = require('node:test');
const assert = require('node:assert/strict');
const {annotationFailure, assertAnnotationComplete} = require('./model-evaluation-results.cjs');
test('evaluation rejects budget fallback fabricated by the captured baseline', () => {
  const value = {segments:[{speaker:'旁白',annotationFallbackReason:'验收请求预算已达上限'}]};
  assert.ok(annotationFailure(value));
  assert.throws(() => assertAnnotationComplete(value), e => e.code === 'EVALUATION_BUDGET' && e.partial === value);
});
test('evaluation rejects swallowed budget errors even when baseline omits fallback metadata', () => {
  const value = {segments:[{speaker:'旁白'}]};
  assert.equal(assertAnnotationComplete(value),value);
  assert.throws(() => assertAnnotationComplete(value, new Error('budget')), {code:'EVALUATION_BUDGET'});
});

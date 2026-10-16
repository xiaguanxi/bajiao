// The captured baseline may swallow transport/budget errors and fabricate fallback
// annotations. These are incomplete evaluation jobs, never valid accuracy data.
function annotationFailure(value) {
  return value?.segments?.find(s => /验收请求预算已达上限/.test(s.annotationFallbackReason || ''));
}
function assertAnnotationComplete(value, budgetError) {
  if (!budgetError && !annotationFailure(value)) return value;
  const error = new Error('LLM 验收预算耗尽，基线标注未完成，对照无效');
  error.code = 'EVALUATION_BUDGET';
  error.partial = value;
  throw error;
}
module.exports = {annotationFailure, assertAnnotationComplete};

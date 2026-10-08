const {test}=require('node:test'),assert=require('node:assert/strict');
const {splitBook,splitChapters,safeTitleRegex,CHAPTER_RULES,SPLIT_PROBE_PROMPT}=require('../app/src/main/assets/core.js');

test('chapter rules cover major heading formats',()=>{
  const ids=CHAPTER_RULES.map(r=>r.id);
  for(const id of ['chapter_cn','volume_cn','special_cn','chapter_en','number_dot','paren_num','bare_num','bare_cn_num','num_chapter'])assert(ids.includes(id),'missing rule '+id);
});

test('auto split handles mixed headings and legacy numeric form',()=>{
  assert.equal(splitBook('第0055章 前章\n甲\n第0056 云腾致雨\n乙\n第0057章 后章\n丙').length,3);
  const r=splitChapters('楔子\n开头\n第一章 起\n正文\n番外篇 后记\n尾声内容');
  assert.equal(r.chapters.length,3);
  assert(r.report.ruleId.includes('mixed'));
});

test('custom template and forced rule work',()=>{
  const out=splitChapters('卷一-第1章 开头\n正文\n卷一-第2章 继续\n正文二',{ruleId:'custom',customPattern:'卷一-第*章'});
  assert.equal(out.chapters.length,2);
  assert.equal(out.report.ruleId,'custom');
  const forced=splitChapters('楔子\n开头\n第一章 起\n正文',{ruleId:'special_cn'});
  assert.equal(forced.report.ruleId,'special_cn');
  assert.equal(forced.report.auto,false);
});

test('unmatched text reports failure for LLM fallback',()=>{
  const r=splitChapters('没有标题就是一堆正文 '.repeat(50));
  assert(r.report.failed);
  assert.equal(r.report.ruleId,'none');
});

test('custom template guards bad input',()=>{
  assert.throws(()=>safeTitleRegex(''),'');
  assert.throws(()=>safeTitleRegex('x'.repeat(400)),'');
  assert.doesNotThrow(()=>safeTitleRegex('卷一-第*章'));
});

test('probe prompt exists and asks for template JSON',()=>{
  assert(SPLIT_PROBE_PROMPT.includes('*'));
  assert(SPLIT_PROBE_PROMPT.includes('template'));
});

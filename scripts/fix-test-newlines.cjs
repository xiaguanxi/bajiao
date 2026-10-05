const fs = require('node:fs');
const file = 'tests/core.test.cjs';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(
  "const b = await e.addBook('测试小说', '第001章 序章\\n第一章正文\\n第002章 出发\\n第二章正文');",
  "const b = await e.addBook('测试小说', '第001章 序章\n第一章正文\n第002章 出发\n第二章正文');"
);
content = content.replace(
  "const b = await e.addBook('测试书', '第1章\\n内容');",
  "const b = await e.addBook('测试书', '第1章\n内容');"
);
content = content.replace(
  "const b = await e.addBook('长篇故事', '第1章\\n正文');",
  "const b = await e.addBook('长篇故事', '第1章\n正文');"
);
content = content.replace(
  "const b = await e.addBook('书1', '第1章\\n段落');",
  "const b = await e.addBook('书1', '第1章\n段落');"
);
fs.writeFileSync(file, content, 'utf8');


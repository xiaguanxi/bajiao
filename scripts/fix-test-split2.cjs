const fs = require('node:fs');
const file = 'tests/core.test.cjs';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(
  "const b = await e.addBook('测试小说', '第1章 第一\\n第一章正文\\n第2章 第二\\n第二章正文');",
  "const b = await e.addBook('测试小说', '第001章 序章\\n第一章正文\\n第002章 出发\\n第二章正文');"
);
fs.writeFileSync(file, content, 'utf8');


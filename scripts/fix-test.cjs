
const fs = require('fs');
let code = fs.readFileSync('tests/three-stages-full.test.cjs', 'utf8');
code = code.replace("require('./tests/novel-ui.cjs')", "require('./novel-ui.cjs')");
fs.writeFileSync('tests/three-stages-full.test.cjs', code, 'utf8');

const fs = require('fs');
const js = fs.readFileSync('app/src/main/assets/app.js', 'utf8');
const p1 = js.indexOf('if(act===\'seek\'');
console.log(js.slice(p1 - 100, p1 + 400));

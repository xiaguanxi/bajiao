const fs = require('fs');
const src = fs.readFileSync('app/src/main/assets/app.js', 'utf8');
const i = src.indexOf('vc-player-cover');
console.log(src.slice(i + 700, i + 1700));

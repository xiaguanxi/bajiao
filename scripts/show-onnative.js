const fs = require('fs');
const js = fs.readFileSync('app/src/main/assets/app.js', 'utf8');
const p1 = js.indexOf('window.onNativePlaybackAction');
const p2 = js.indexOf("$('#screen').addEventListener('click'", p1);
console.log(js.slice(p1, p2));

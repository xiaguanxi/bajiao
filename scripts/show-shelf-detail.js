const fs = require('fs');
const js = fs.readFileSync('app/src/main/assets/app.js', 'utf8');
const p1 = js.indexOf('resumebook');
console.log('resumeBanner definition:');
console.log(js.slice(p1 - 400, p1 + 100));
const p2 = js.indexOf('resumechapter');
console.log('resumechapter markup:');
console.log(js.slice(p2 - 400, p2 + 200));

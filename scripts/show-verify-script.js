const fs = require('fs');
const ps = fs.readFileSync('scripts/verify-device-apk.ps1', 'utf8');
console.log(ps);

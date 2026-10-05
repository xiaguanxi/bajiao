const fs = require('node:fs');
const file = 'app/src/main/java/com/vocast/app/AudioFiles.java';
let content = fs.readFileSync(file, 'utf8');
content = content.replace('!id.matches("[a-f0-9]{64}.(wav|mp3)")', '!id.matches("[a-f0-9]{64}\\.(wav|mp3)")');
content = content.replace('!id.matches("[a-f0-9]{64}\\.(wav|mp3)")', '!id.matches("[a-f0-9]{64}\\\\.(wav|mp3)")');
fs.writeFileSync(file, content, 'utf8');
console.log('Fixed regex in AudioFiles.java');


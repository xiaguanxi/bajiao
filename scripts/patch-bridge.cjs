const fs = require('node:fs');
const file = 'app/src/main/assets/bridge.js';
let content = fs.readFileSync(file, 'utf8');
if (!content.includes('deleteAudio:')) {
  const target = "mergeAudio:(ids,pauses=[])=>device.call('mergeAudio',{ids,pauses})";
  const addition = ",deleteAudio:ids=>device.call('deleteAudio',Array.isArray(ids)?{ids}:{id:ids}),audioStats:()=>device.call('audioStats'),cleanupAudio:keepIds=>device.call('cleanupAudio',{keepIds})";
  content = content.replace(target, target + addition);
  fs.writeFileSync(file, content, 'utf8');
  console.log('bridge.js patched');
}


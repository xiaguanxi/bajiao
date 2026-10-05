const fs = require('fs');

let appJs = fs.readFileSync('app/src/main/assets/app.js', 'utf8');
let appCss = fs.readFileSync('app/src/main/assets/app.css', 'utf8');

console.log('Original appJs length:', appJs.length);
console.log('Original appCss length:', appCss.length);

// 1. Add batchModalBookId to top vars in app.js
const oldVarLine = "deleteConfirmBookId=null,stopAfterChapter=false,storageStats=null,sleepMinutes=0,miniPlayingState=null,sleepTimerId=null,lastSeekTime=0,lastSeekPos=0;";
const newVarLine = "deleteConfirmBookId=null,batchModalBookId=null,stopAfterChapter=false,storageStats=null,sleepMinutes=0,miniPlayingState=null,sleepTimerId=null,lastSeekTime=0,lastSeekPos=0;";
if (appJs.includes(oldVarLine)) {
  appJs = appJs.replace(oldVarLine, newVarLine);
  console.log('1. batchModalBookId added');
} else {
  console.warn('1. Warning: oldVarLine not matched');
}

fs.writeFileSync('app/src/main/assets/app.js', appJs, 'utf8');
console.log('Saved preliminary appJs');

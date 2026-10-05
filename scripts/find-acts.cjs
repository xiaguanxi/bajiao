const fs = require('fs');
const js = fs.readFileSync('app/src/main/assets/app.js', 'utf8');
const needed = [
  'resumebook', 'resumechapter',
  'openspeed', 'closespeed', 'setspeed',
  'opensleep', 'closesleep', 'setsleep',
  'toggleautodelete', 'refreshstorage', 'cleargc', 'clearalllistened', 'clearallaudio',
  'clearbooklistened', 'clearbookaudio', 'deletebookconfirm', 'closedeleteconfirm', 'executedeletebook',
  'minigolisten', 'miniseekback', 'miniplaypause', 'mininext'
];
for (const act of needed) {
  const foundInClick = js.includes(\ a===\" + act + \"\);
  console.log(act + ': ' + (foundInClick ? 'HANDLED' : 'MISSING'));
}

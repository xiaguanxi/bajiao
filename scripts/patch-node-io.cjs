const fs = require('node:fs');
const file = 'tests/node-io.cjs';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('deleteAudio:')) {
  const target = "readAudio:async id=>({base64:fs.readFileSync(path.join(dir,path.basename(id))).toString('base64')}),";
  const addition = [
    "deleteAudio:async ids=>{",
    "  const arr=Array.isArray(ids)?ids:[ids];let count=0,freedBytes=0;",
    "  for(const id of arr){const p=path.join(dir,path.basename(id));if(fs.existsSync(p)){try{const s=fs.statSync(p);freedBytes+=s.size;fs.unlinkSync(p);count++;}catch(e){}}}",
    "  return {count,freedBytes,freedMb:Math.round(freedBytes/1024/1024*10)/10};",
    "},",
    "audioStats:async ()=>{",
    "  let count=0,totalBytes=0;if(fs.existsSync(dir)){for(const f of fs.readdirSync(dir)){if(f.endsWith('.wav')||f.endsWith('.mp3')){try{totalBytes+=fs.statSync(path.join(dir,f)).size;count++;}catch(e){}}}}",
    "  return {fileCount:count,totalBytes,totalMb:Math.round(totalBytes/1024/1024*10)/10};",
    "},",
    "cleanupAudio:async keepIds=>{",
    "  const set=new Set(keepIds||[]);let deleted=0,freed=0;if(fs.existsSync(dir)){for(const f of fs.readdirSync(dir)){if((f.endsWith('.wav')||f.endsWith('.mp3'))&&!set.has(f)){try{freed+=fs.statSync(path.join(dir,f)).size;fs.unlinkSync(path.join(dir,f));deleted++;}catch(e){}}}}",
    "  return {deletedCount:deleted,freedBytes:freed,freedMb:Math.round(freed/1024/1024*10)/10};",
    "},"
  ].join('');
  content = content.replace(target, target + addition);
  fs.writeFileSync(file, content, 'utf8');
  console.log('tests/node-io.cjs patched');
}


const fs=require('fs'),path=require('path'),cp=require('child_process');
const adb=path.resolve('.tools/android-sdk/platform-tools/adb.exe'),dir=path.resolve('artifacts/device');fs.mkdirSync(dir,{recursive:true});
const run=(args)=>cp.execFileSync(adb,args,{timeout:60000,maxBuffer:32*1024*1024});
const [op,...args]=process.argv.slice(2);const log={time:new Date().toISOString(),op,args};
if(op==='state'){const name=args[0]||'screen';run(['shell','rm','-f','/sdcard/bajiao-window.xml']);const dump=run(['shell','uiautomator','dump','/sdcard/bajiao-window.xml']).toString();if(!dump.includes('dumped'))throw Error('UI hierarchy unavailable; retry after screen settles');const xml=run(['exec-out','cat','/sdcard/bajiao-window.xml']).toString();fs.writeFileSync(path.join(dir,name+'.xml'),xml);fs.writeFileSync(path.join(dir,name+'.png'),run(['exec-out','screencap','-p']));const nodes=[...xml.matchAll(/<node\s+([^>]+)>?/g)].map(m=>Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(x=>[x[1],x[2]]))).filter(n=>n.bounds!=='[0,0][0,0]'&&(n.text||n['content-desc']||n.clickable==='true'||n.scrollable==='true'));console.log(JSON.stringify(nodes.map(n=>({text:n.text?.slice(0,180),desc:n['content-desc'],class:n.class,bounds:n.bounds,clickable:n.clickable,scrollable:n.scrollable}))));console.log('SCREENSHOT',path.join(dir,name+'.png'));}
else if(op==='finger')run(['shell','CLASSPATH=/data/local/tmp/bajiao-touch.dex','app_process','/system/bin','DeviceTouch',...args]);
else if(op==='tap'||op==='swipe')run(['shell','input',op,...args]);
else if(op==='back')run(['shell','input','keyevent','4']);
else if(op==='home')run(['shell','input','keyevent','3']);
else if(op==='text')run(['shell','input','text',...args]);
else throw Error('Unsupported operation');
fs.appendFileSync(path.join(dir,'actions.jsonl'),JSON.stringify(log)+'\n');

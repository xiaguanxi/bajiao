const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {connect,run,sleep,nodes,nativeTap,finger,log,dir}=require('./device-harness.cjs');
const {waveInfo}=require('./node-io.cjs');
(async()=>{const h=await connect();try{
 const s=await h.state(),b=s.books.find(b=>b.name==='vocast-novel');assert(b);
 const chapters=b.chapters.filter(c=>/^第000[1-5]章/.test(c.title));
 const file=path.join(dir,'exports.json'),report=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):[];
 fs.mkdirSync(path.join(dir,'audio'),{recursive:true});
 for(const c of chapters){
  const number=Number(c.title.match(/^第(\d+)章/)[1]);if(!c.audio||report.some(x=>x.number===number&&x.audio===c.audio))continue;
  const name='chapter-'+String(number).padStart(4,'0')+'.wav',nativeName=(process.argv[2]||'')+name;
  await h.tap('[data-act="go:shelf"]');await h.tap('[data-act="book:'+b.id+'"]');await h.tap('[data-act="read:'+c.id+'"]');
  const t=(await h.state()).tasks.find(t=>t.bookId===b.id&&t.chapterId===c.id);assert(t,'chapter task must exist for export');
  await h.tap('[data-act="go:tasks"]');await h.tap('[data-act="task:'+t.id+'"]');await h.tap('[data-act="exportcur"]');
  let n;for(let attempt=0;attempt<12;attempt++){try{n=nodes().find(n=>n.class==='android.widget.EditText'&&n['resource-id']==='android:id/title');}catch(e){if(!e.message.includes('Fresh Android UI hierarchy'))throw e;}if(n)break;await sleep(250);}assert(n,'Native export filename field');
  const [x1,y1,x2,y2]=n.bounds.match(/\d+/g).map(Number);finger(Math.round((x1+x2)/2),Math.round((y1+y2)/2));
  run(['shell','input','keyevent','KEYCODE_MOVE_END']);run(['shell','input','keyevent',...Array(n.text.length).fill('KEYCODE_DEL')]);run(['shell','input','text',nativeName]);run(['shell','input','keyevent','4']);log({type:'nativeField',id:n['resource-id'],value:nativeName});
  assert(nodes().some(n=>n.class==='android.widget.EditText'&&n.text===nativeName),'Filename changed through native input');
  await nativeTap('SAVE');await sleep(700);
  for(let i=0;i<30;i++){if((await h.read(()=>document.querySelector('#toast').textContent)).includes('已导出'))break;await sleep(250);}
  assert((await h.read(()=>document.querySelector('#toast').textContent)).includes('已导出'),'Export completion returned to APK');
  await h.screenshot('export-'+number+'-complete');
  const output=path.join(dir,'audio',name);run(['pull','/sdcard/Download/'+nativeName,output]);
  const buf=fs.readFileSync(output),sha=crypto.createHash('sha256').update(buf).digest('hex'),w=waveInfo(buf);
  assert.equal(c.audio,sha+'.wav');assert(Math.abs(w.duration-c.duration)<.01);assert(w.duration>60);assert(w.pcm.some(x=>x!==0),'PCM must contain audible samples');
  const entry={number,title:c.title,audio:c.audio,sha256:sha,bytes:buf.length,duration:w.duration,sampleRate:w.fmt.readUInt32LE(4),channels:w.fmt.readUInt16LE(2),bitsPerSample:w.fmt.readUInt16LE(14),nativeExport:true};
  const old=report.findIndex(x=>x.number===number);if(old>=0)report.splice(old,1);report.push(entry);report.sort((a,b)=>a.number-b.number);fs.writeFileSync(file,JSON.stringify(report,null,2));console.log('PASS Android WAV export',name,w.duration);
 }
}finally{await h.browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});

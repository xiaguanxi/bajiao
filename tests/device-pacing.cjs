const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {connect,run,sleep,dir}=require('./device-harness.cjs');
const pacingDir=path.resolve('artifacts/pacing');fs.mkdirSync(pacingDir,{recursive:true});
(async()=>{run(['shell','am','start','-W','-n','com.vocast.app/.MainActivity']);const h=await connect();try{
 const before=await h.state(),b=before.books.find(b=>b.id==='musfdzb438zhl9n');assert(b);const chapters=b.chapters.filter(c=>/^第000[1-5]章/.test(c.title));assert.equal(chapters.length,5);
 if(!fs.existsSync(path.join(pacingDir,'before-state.json')))fs.writeFileSync(path.join(pacingDir,'before-state.json'),JSON.stringify(before,null,2));
 for(const c of chapters){if(c.pacingVersion===1)continue;const t=(await h.state()).tasks.find(t=>t.bookId===b.id&&t.chapterId===c.id);assert(t,'task must exist for '+c.title);await h.tap('[data-act="go:tasks"]');await h.tap('[data-act="task:'+t.id+'"]');await h.tap('[data-act="repacecur"]');console.log('Actual Android tap: optimize',c.title);}
 for(let i=0;i<180;i++){
  const s=await h.state(),current=s.books.find(x=>x.id===b.id).chapters.filter(c=>chapters.some(x=>x.id===c.id)),tasks=s.tasks.filter(t=>t.bookId===b.id&&chapters.some(c=>c.id===t.chapterId));
  if(tasks.some(t=>t.status==='failed'||t.status==='waiting'))throw Error(JSON.stringify(tasks.filter(t=>t.status!=='done')));
  if(current.every(c=>c.pacingVersion===1)){assert(tasks.every(t=>t.status==='done'));fs.writeFileSync(path.join(pacingDir,'after-state.json'),JSON.stringify(s,null,2));console.log('PASS real-device five-chapter pacing repair');break;}
  if(i%3===0)console.log('Repair progress',current.map(c=>[c.title,c.pacingVersion||0]),tasks.map(t=>[t.status,t.phase]));
  if(i===179)throw Error('Repair timed out');await sleep(5000);
 }
 await h.tap('[data-act="go:shelf"]');await h.tap('[data-act="book:'+b.id+'"]');await h.tap('[data-act="read:'+chapters[0].id+'"]');
 const t0=(await h.state()).tasks.find(t=>t.bookId===b.id&&t.chapterId===chapters[0].id);assert(t0);await h.tap('[data-act="go:tasks"]');await h.tap('[data-act="task:'+t0.id+'"]');
 assert.equal(await h.read(()=>document.querySelector('[data-act="repacecur"]')===null),true);
 await h.tap('[data-act="playchapter"]');await sleep(3000);await h.screenshot('sentence-pauses-fixed');
 const crash=run(['logcat','-d','-b','crash']).toString();assert(!crash.includes('Process: com.vocast.app'));
 fs.writeFileSync(path.join(pacingDir,'device-test.json'),JSON.stringify({pass:true,chapters:5,actualAndroidTouches:true,crash:false},null,2));
}finally{await h.browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});

const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {connect,run,sleep,dir}=require('./device-harness.cjs');
(async()=>{const h=await connect();try{
 const s=await h.state(),b=s.books.find(b=>b.name==='bajiao-novel'),roles=b.characters.filter(r=>!r.voice&&r.candidate);
 const reportFile=path.join(dir,'role-confirmations.json');let report=fs.existsSync(reportFile)?JSON.parse(fs.readFileSync(reportFile)):[];
 await h.tap('[data-act="go:shelf"]');await h.tap('[data-act="book:'+b.id+'"]');await h.tap('[data-act="go:roles"]');
 for(const r of roles){
  await h.tap('[data-act="candidate:'+r.name+'"]');await h.tap('[data-act="play:'+r.candidate.sample+'"]');await sleep(700);
  const p=await h.read(async()=>await device.call('playbackState'));assert.equal(p.playing,true,p.error);assert.equal(p.id,r.candidate.sample);
  await h.screenshot('voice-'+r.name);
  await h.tap('[data-act="acceptsample"]');
  for(let n=0;n<30;n++){const st=await h.state();if(st.books.find(b=>b.name==='bajiao-novel').characters.find(x=>x.name===r.name).voice)break;await sleep(250);}
  assert.equal((await h.state()).books.find(x=>x.id===b.id).characters.find(x=>x.name===r.name).voice,r.candidate.id);
  report.push({at:new Date().toISOString(),name:r.name,sample:r.candidate.sample,voice:r.candidate.id,nativeAuditionPassed:true});fs.writeFileSync(reportFile,JSON.stringify(report,null,2));console.log('PASS real audition and manual adoption',r.name);
 }
}finally{await h.browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});

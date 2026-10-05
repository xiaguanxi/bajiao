const fs=require('node:fs'),assert=require('node:assert/strict');
const {connect,run,sleep,nativeTap,dir}=require('./device-harness.cjs');
(async()=>{const h=await connect();try{
 let s=await h.state(),b=s.books.find(b=>b.name==='vocast-novel'),c=b.chapters.find(c=>/^第0003章/.test(c.title));
 assert(s.tasks.find(t=>t.chapterId===c.id).status==='waiting','Wait until chapter 3 requests review');
 await h.tap('[data-act="go:shelf"]');await h.tap('[data-act="book:'+b.id+'"]');await h.tap('[data-act="confirm:'+c.id+'"]');
 const corrections=[];
 for(const id of [70,71,72,73,74,81,82,83,88,89,90,91]){
  await h.tap('[data-act="editseg:'+id+'"]');
  if(!(await h.state()).books.find(x=>x.id===b.id).characters.some(x=>x.name==='妇人们')){
   await h.field('#newRole','妇人们');await h.field('#newRoleDescription','中年女性，嗓音爽朗略低，说话泼辣直率，语速自然，普通话');await h.tap('[data-act="addrole"]');
  }
  await h.tap('#segmentSpeaker');await nativeTap('妇人们');await h.tap('[data-act="saveseg"]');
  run(['shell','input','keyevent','4']);await sleep(300);await h.tap('[data-act="confirm:'+c.id+'"]');
  corrections.push({id,speaker:'妇人们',basis:[81,82,83].includes(id)?'前文明确一个身材彪悍的妇女朝暮雨霏霏喊道':'前文明确妇人们聊天或回头偷笑',nativeDropdown:true});fs.writeFileSync(dir+'/chapter-3-corrections.json',JSON.stringify(corrections,null,2));console.log('Corrected villager dialogue',id);
 }
 await h.tap('[data-act="candidate:妇人们"]');await h.tap('[data-act="designsample"]');
 for(let i=0;i<240;i++){if(await h.read(()=>document.querySelector('#busy').hidden))break;await sleep(500);}
 s=await h.state();const role=s.books.find(x=>x.id===b.id).characters.find(x=>x.name==='妇人们');assert(role.candidate,'Real voice design returned');
 await h.tap('[data-act="play:'+role.candidate.sample+'"]');await sleep(700);const p=await h.read(async()=>await device.call('playbackState'));assert(p.playing);assert.equal(p.id,role.candidate.sample);await h.screenshot('villagers-audition');
 await h.tap('[data-act="acceptsample"]');await sleep(500);assert.equal((await h.state()).books.find(x=>x.id===b.id).characters.find(x=>x.name==='妇人们').voice,role.candidate.id);
 fs.writeFileSync(dir+'/villagers-voice.json',JSON.stringify({pass:true,role:'妇人们',voice:role.candidate.id,sample:role.candidate.sample,nativeAuditionPassed:true},null,2));console.log('PASS actual villager voice design and audition');
}finally{await h.browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});

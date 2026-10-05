const fs = require('node:fs');
const file = 'app/src/main/assets/core.js';
let content = fs.readFileSync(file, 'utf8');

// 1. DEFAULTS
content = content.replace(
  "const DEFAULTS={llmBase:'https://api.minimax.cn/v1',llmModel:'MiniMax-M3',llmProtocol:'openai',mode:'manual',usePresets:false,retries:2};",
  "const DEFAULTS={llmBase:'https://api.minimax.cn/v1',llmModel:'MiniMax-M3',llmProtocol:'openai',mode:'manual',usePresets:false,retries:2,autoDeletePlayed:false,playbackSpeed:1.0,sleepTimer:0};"
);

// 2. persist header chapter fields
if (!content.includes('listened:!!c.listened')) {
  content = content.replace(
    "segmentCount:c.unloaded?c.segmentCount:c.segments.length}))}))});",
    "segmentCount:c.unloaded?c.segmentCount:c.segments.length,listened:!!c.listened,audioCleared:!!c.audioCleared,lastPlayedPosition:c.lastPlayedPosition||0}))}))});"
  );
}

// 3. Methods on Engine
if (!content.includes('async deleteBook(')) {
  const methods = [
    " async deleteBook(id){",
    "  const idx=this.state.books.findIndex(b=>b.id===id);if(idx<0)throw Error('书籍不存在');",
    "  const b=this.state.books[idx];const audioIds=[];",
    "  for(const c of b.chapters){if(c.audio)audioIds.push(c.audio);for(const s of (c.segments||[])){if(s.audio&&s.audio!=='skip')audioIds.push(s.audio);}}",
    "  this.state.tasks=this.state.tasks.filter(t=>t.bookId!==id);",
    "  this.state.books.splice(idx,1);",
    "  if(audioIds.length&&this.io.deleteAudio){try{await this.io.deleteAudio([...new Set(audioIds)]);}catch(ignored){}}",
    "  await this.persist();",
    " }",
    " async clearBookAudio(bid,options={onlyListened:false}){",
    "  const b=this.book(bid);const audioIds=[];let clearedCount=0;",
    "  for(const c of b.chapters){",
    "    if(options.onlyListened&&!c.listened)continue;",
    "    if(c.audio){audioIds.push(c.audio);c.audio=null;c.audioCleared=true;clearedCount++;}",
    "    if(!options.onlyListened){for(const s of (c.segments||[])){if(s.audio&&s.audio!=='skip')audioIds.push(s.audio);s.audio=null;}if(c.status==='ready')c.status=(c.segments&&c.segments.length?'annotated':'raw');}",
    "    this.touch(c);",
    "  }",
    "  if(audioIds.length&&this.io.deleteAudio){try{await this.io.deleteAudio([...new Set(audioIds)]);}catch(ignored){}}",
    "  await this.persist();return {clearedCount,audioCount:audioIds.length};",
    " }",
    " async clearChapterAudio(bid,cid){",
    "  const c=this.chapter(bid,cid);const audioIds=[];",
    "  if(c.audio){audioIds.push(c.audio);c.audio=null;c.audioCleared=true;}",
    "  for(const s of (c.segments||[])){if(s.audio&&s.audio!=='skip')audioIds.push(s.audio);s.audio=null;}",
    "  if(c.status==='ready')c.status=(c.segments&&c.segments.length?'annotated':'raw');",
    "  this.touch(c);",
    "  if(audioIds.length&&this.io.deleteAudio){try{await this.io.deleteAudio([...new Set(audioIds)]);}catch(ignored){}}",
    "  await this.persist();",
    " }",
    " collectReferencedAudio(){",
    "  const set=new Set();",
    "  for(const b of this.state.books){for(const c of b.chapters){if(c.audio)set.add(c.audio);for(const s of (c.segments||[])){if(s.audio&&s.audio!=='skip')set.add(s.audio);}}}",
    "  for(const v of this.state.voices){if(v.sample)set.add(v.sample);}",
    "  return [...set];",
    " }",
    " async garbageCollectAudio(){",
    "  const keepIds=this.collectReferencedAudio();",
    "  if(this.io.cleanupAudio)return await this.io.cleanupAudio(keepIds);",
    "  return {deletedCount:0,freedBytes:0,freedMb:0};",
    " }",
    " async updatePlaybackProgress(bid,cid,posMs,durMs,completed=false){",
    "  const b=this.state.books.find(x=>x.id===bid);if(!b)return {listened:false};",
    "  const c=b.chapters.find(x=>x.id===cid);if(!c)return {listened:false};",
    "  b.lastPlayedChapterId=cid;b.lastPlayedPosition=posMs;b.lastPlayedAt=Date.now();",
    "  c.lastPlayedPosition=posMs;",
    "  let newlyFinished=false;",
    "  if(!c.listened&&(completed||(durMs>0&&(posMs>=durMs*0.98||posMs>=durMs-3000)))){",
    "    c.listened=true;newlyFinished=true;",
    "    if(this.state.settings.autoDeletePlayed){",
    "      try{await this.clearChapterAudio(bid,cid);}catch(ignored){}",
    "    }",
    "  }",
    "  this.touch(c);await this.persist();",
    "  return {listened:!!c.listened,newlyFinished,audioCleared:!!c.audioCleared};",
    " }"
  ].join('\n');
  const target = "async addBook(name,text){";
  content = content.replace(target, methods + '\n ' + target);
}

fs.writeFileSync(file, content, 'utf8');
console.log('core.js patched');


(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VocastPlaybackPrompts=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const TEXT={waiting:'您已听到当前制作进度，请稍候。新的内容制作完成后，会自动继续播放。',finished:'这本书已经播放完毕，感谢您的收听，愿您有个好心情。'};
class Controller{
 constructor({engine,call,canSynthesize=()=>true,isCurrent=()=>true}){this.engine=engine;this.call=call;this.canSynthesize=canSynthesize;this.isCurrent=isCurrent;this.jobs=new Map();this.failures=new Map();this.pending=null;this.sequence=0;}
 source(bid,kind){
  const b=this.engine.state.books.find(b=>b.id===bid);if(!b||!TEXT[kind])return null;
  const role=b.characters.find(r=>r.name==='旁白'),voice=role?.voice||'preset:白桦',v=this.engine.state.voices.find(v=>v.id===voice);
  return {b,voice,description:role?.description||v?.description||'',key:JSON.stringify([kind,TEXT[kind],voice,role?.description||v?.description||'',v?.sample||'',v?.format||''])};
 }
 async prepare(bid,kind){
  const source=this.source(bid,kind);if(!source)return null;
  const cached=source.b.playbackPrompts?.[kind];if(cached?.key===source.key&&cached.file?.id)return cached.file;
  if(!this.canSynthesize())return null;
  const key=bid+source.key;if(this.jobs.has(key))return this.jobs.get(key);
  if(Date.now()-(this.failures.get(key)||0)<60000)return null;
  const job=(async()=>{
   const stale=()=>this.source(bid,kind)?.key!==source.key;
   if(!await this.engine._acquireTtsSlot(stale))return null;
   try{
    const file=await this.engine.synthesize(TEXT[kind],source.voice,'温和亲切，语气自然，清晰简短地提示听众',{voiceDescription:source.description,shouldPause:stale});
    if(stale())return null;
    source.b.playbackPrompts={...source.b.playbackPrompts,[kind]:{key:source.key,file}};
    await this.engine.persist();return file;
   }finally{this.engine._releaseTtsSlot();}
  })();this.jobs.set(key,job);
  try{const file=await job;this.failures.delete(key);return file;}catch(e){this.failures.set(key,Date.now());throw e;}finally{this.jobs.delete(key);}
 }
 warm(bid,kinds){for(const kind of kinds)this.prepare(bid,kind).catch(()=>{});}
 reconcile(){const item=this.pending;if(item&&(this.source(item.bid,item.kind)?.key!==item.sourceKey||!this.isCurrent(item)))this.cancel();}
 cancel(){
  this.sequence++;const previous=this.pending;this.pending=null;
  if(previous)this.call('playbackPrompt',{op:'cancel',token:previous.token}).catch(()=>{});
 }
 schedule(kind,bid,cid,audioId){
  const episode=JSON.stringify([kind,bid,cid,audioId]);if(this.pending?.episode===episode)return;
  this.cancel();const source=this.source(bid,kind);if(!source||!audioId)return;
  const item={kind,bid,cid,audioId,episode,sourceKey:source.key,token:'prompt-'+Date.now()+'-'+(++this.sequence)};this.pending=item;
  const valid=()=>this.pending===item&&this.source(bid,kind)?.key===item.sourceKey&&this.isCurrent(item);
  // Android owns the quiet interval, so background WebView timer throttling cannot shorten it.
  item.ready=(async()=>{
   if(!valid())return;
   await this.call('playbackPrompt',{op:'schedule',token:item.token,expectedAudioId:audioId,delayMs:3000});
   const file=await this.prepare(bid,kind);
   if(!valid()){this.reconcile();return;}
   if(!file?.id){await this.call('playbackPrompt',{op:'cancel',token:item.token});return;}
   await this.call('playbackPrompt',{op:'ready',token:item.token,id:file.id});
  })().catch(()=>{if(this.pending===item)this.call('playbackPrompt',{op:'cancel',token:item.token}).catch(()=>{});});
 }
}
return {Controller,TEXT};
});

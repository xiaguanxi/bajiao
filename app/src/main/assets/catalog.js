(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BajiaoCatalog=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function progressChapter(book,lastPlayback,activePlayback){
 const exists=id=>book.chapters.some(c=>c.id===id);
 if(activePlayback?.playing&&activePlayback.bookId===book.id&&exists(activePlayback.chapterId))return activePlayback.chapterId;
 const candidates=[
  {id:book.readProgress?.chapterId,at:book.readProgress?.at||0},
  {id:book.lastPlayedChapterId,at:book.lastPlayedAt||0},
  ...(lastPlayback?.bookId===book.id?[{id:lastPlayback.chapterId,at:lastPlayback.at||0}]:[])
 ].filter(c=>exists(c.id)).sort((a,b)=>b.at-a.at);
 return candidates[0]?.id||null;
}
function screenSize(height,rowHeight=72){return Math.max(6,Math.ceil(height/Math.max(44,rowHeight)));}
class ChapterWindow{
 constructor(chapters,anchorId,height){
  this.chapters=chapters;this.batch=screenSize(height);
  const index=Math.max(0,chapters.findIndex(c=>c.id===anchorId));
  this.start=Math.max(0,index-this.batch);this.end=Math.min(chapters.length,index+this.batch*2);
 }
 grow(direction,height,rowHeight){
  this.batch=screenSize(height,rowHeight);
  const oldStart=this.start,oldEnd=this.end;
  if(direction<0)this.start=Math.max(0,this.start-this.batch);
  else this.end=Math.min(this.chapters.length,this.end+this.batch);
  return direction<0?this.chapters.slice(this.start,oldStart):this.chapters.slice(oldEnd,this.end);
 }
 get visible(){return this.chapters.slice(this.start,this.end);}
}
return {progressChapter,screenSize,ChapterWindow};
});

const {test}=require('node:test'),assert=require('node:assert/strict');
const {progressChapter,ChapterWindow}=require('../app/src/main/assets/catalog.js');
const chapters=Array.from({length:2001},(_,i)=>({id:'chapter-'+i}));
test('catalog follows the latest valid reading or listening progress for this book',()=>{
 const b={id:'book',chapters,readProgress:{chapterId:'chapter-80',at:100},lastPlayedChapterId:'chapter-120',lastPlayedAt:200};
 assert.equal(progressChapter(b,{bookId:'other',chapterId:'chapter-500',at:999}),'chapter-120');
 b.readProgress.at=300;assert.equal(progressChapter(b),'chapter-80');
 assert.equal(progressChapter(b,null,{playing:true,bookId:'book',chapterId:'chapter-150'}),'chapter-150');
 assert.equal(progressChapter(b,{bookId:'book',chapterId:'removed',at:999}),'chapter-80');
 assert.equal(progressChapter({id:'empty',chapters:[]}),null);
});
test('a middle chapter opens with a screen above it and grows beyond fifty in both directions',()=>{
 const w=new ChapterWindow(chapters,'chapter-1000',720);assert.equal(w.start,990);assert.equal(w.end,1020);
 const previousEnd=w.end;assert.deepEqual(w.grow(1,720,72),chapters.slice(previousEnd,previousEnd+10));
 for(let i=0;i<6;i++)w.grow(-1,720,72);
 assert(w.visible.length>50);assert(w.start<950);assert.equal(new Set(w.visible.map(c=>c.id)).size,w.visible.length);
 assert.deepEqual(w.visible,chapters.slice(w.start,w.end));
});
test('incremental windows reach both book boundaries without duplicates or gaps',()=>{
 const w=new ChapterWindow(chapters,'chapter-1000',720);
 for(let i=0;i<250;i++){w.grow(-1,720,72);w.grow(1,720,72);}
 assert.equal(w.start,0);assert.equal(w.end,chapters.length);assert.deepEqual(w.visible,chapters);assert.deepEqual(w.grow(-1,720,72),[]);assert.deepEqual(w.grow(1,720,72),[]);
});
test('missing progress, empty filters, and end-of-book anchors are bounded',()=>{
 const empty=new ChapterWindow([],null,720);assert.deepEqual(empty.visible,[]);assert.deepEqual(empty.grow(1,720,72),[]);
 const missing=new ChapterWindow(chapters,'removed',720);assert.equal(missing.start,0);assert.equal(missing.visible[0].id,'chapter-0');
 const last=new ChapterWindow(chapters,'chapter-2000',720);assert.equal(last.end,2001);assert(last.visible.some(c=>c.id==='chapter-2000'));
});

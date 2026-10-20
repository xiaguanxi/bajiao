const {test}=require('node:test'),assert=require('node:assert/strict');
const {Engine,COVER_STYLES}=require('../app/src/main/assets/core.js');
const make=()=>new Engine({saveState:async()=>{}});

test('concurrent book imports use every cover color before repeating',async()=>{
 const e=make(),colors=COVER_STYLES.map(s=>s.color);
 const books=await Promise.all(colors.map((_,i)=>e.addBook('书'+i,'正文。')));
 assert.equal(new Set(books.map(b=>b.coverColor)).size,colors.length);
 assert.deepEqual(new Set(books.map(b=>b.coverColor)),new Set(colors));
 for(let i=0;i<colors.length;i++)await e.addBook('续书'+i,'正文。');
 for(const color of colors)assert.equal(e.state.books.filter(b=>b.coverColor===color).length,2);
});

test('cover selection respects manual colors, case and legacy default covers without rewriting them',async()=>{
 const e=make(),legacy=await e.addBook('旧书','正文。');delete legacy.coverColor;
 const manual=await e.addBook('手选','正文。');manual.coverColor=COVER_STYLES[2].color.toUpperCase();
 const before=JSON.stringify(e.state.books),book=await e.addBook('新书','正文。');
 assert.equal(book.coverColor,COVER_STYLES[1].color);
 assert.equal(JSON.stringify(e.state.books.slice(0,2)),before);
});

test('a freed color is used before any repeat and custom colors do not exhaust the palette',async()=>{
 const e=make();for(const style of COVER_STYLES)await e.addBook(style.name,'正文。');
 const removed=e.state.books.splice(3,1)[0],replacement=await e.addBook('补位','正文。');
 assert.equal(replacement.coverColor,removed.coverColor);
 replacement.coverColor='#123456';
 assert.equal((await e.addBook('自定义封面之后','正文。')).coverColor,removed.coverColor);
});

test('snapshot reload keeps chosen colors and allocates the next unused color',async()=>{
 let header;const e=new Engine({saveSnapshot:async h=>{header=h;}});
 const first=await e.addBook('第一本','正文。'),restored=new Engine({saveState:async()=>{}},JSON.parse(header));
 assert.equal(restored.state.books[0].coverColor,first.coverColor);
 const second=await restored.addBook('第二本','正文。');assert.notEqual(second.coverColor,first.coverColor);
});

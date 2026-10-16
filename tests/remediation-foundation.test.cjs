const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {Engine,splitChapters,normalize,units}=require('../app/src/main/assets/core.js');
const Flow=require('../app/src/main/assets/import-flow.js');
const io=()=>({saveState:async()=>{},mergeAudio:async()=>({id:'new.wav',duration:1})});
test('source boundaries preserve headings, empty chapters, repeated titles and list entries',()=>{
 const source='序章\n第一章 开始\n第一章的正文。\n1. 感谢甲\n2. 感谢乙\n第一章 开始\n末段。';
 const r=splitChapters(source);assert.equal(r.chapters.length,3);assert.equal(r.chapters[0].text,'');
 assert(r.chapters[1].text.includes('1. 感谢甲'));assert.equal(normalize(r.chapters.map(c=>(c.sourceHeading?c.title:'')+c.text).join('')),normalize(source));assert.equal(r.report.sourceCoverage,1);
});
test('wrapped headings identify every chapter of the actual second novel',()=>{
 const file='artifacts/phone-ux-audit-20261014/full/Audit-second-UTF8.txt';if(!fs.existsSync(file))return;
 const text=fs.readFileSync(file,'utf8'),r=splitChapters(text);const expected=text.split('\n').filter(l=>/^===.+===$/.test(l.trim())).length;assert.equal(r.report.count,expected);assert.equal(r.report.sourceCoverage,1);
});
test('no-heading prose imports whole text as one chapter; explicit mismatches still require correction',()=>{
 let d=Flow.createDraft({name:'notes.txt',text:'完整正文。\n另一段。'});Flow.splitDraft(d,splitChapters);assert(Flow.canImport(d));assert.equal(d.result.chapters.length,1);
 d.ruleId='custom';d.customPattern='第*章';Flow.splitDraft(d,splitChapters);assert(!Flow.canImport(d));
});
test('invalid selection cannot enqueue any task from a partial batch',async()=>{
 const e=new Engine(io()),b=await e.addBook('a','正文。');await assert.rejects(e.enqueue(b.id,[b.chapters[0].id,'another-book-id']));assert.equal(e.state.tasks.length,0);
});
test('chapter permit covers synthesis even while the next chapter could be analysed',async()=>{
 const e=new Engine(io()),b=await e.addBook('b','第一章 起\n甲。\n第二章 后\n乙。');let entered,release;
 const enteredP=new Promise(r=>entered=r),releaseP=new Promise(r=>release=r),analysed=[];
 e.analyze=async(bid,cid)=>{analysed.push(cid);const c=e.chapter(bid,cid);c.segments=units(c.text).map(s=>({...s,speaker:'旁白',confidence:1}));};
 e.synthesize=async text=>{if(text==='甲。'){entered();await releaseP;}return {id:text,duration:1};};
 const running=e.enqueue(b.id,b.chapters.map(c=>c.id));await enteredP;assert.deepEqual(analysed,[b.chapters[0].id]);assert.equal(e.state.tasks[1].status,'queued');release();await running;assert(e.state.tasks.every(t=>t.status==='done'));
});
test('candidate acceptance changes the binding and preserves completed audio',async()=>{
 const e=new Engine(io()),b=await e.addBook('b','甲。乙。'),c=b.chapters[0];e.state.voices.push({id:'old',sample:'old-ref.wav'});
 b.characters.push({name:'甲',voice:'old',candidate:{id:'new',sample:'new-ref.wav',description:'男声'}});c.audio='previous.wav';c.segments=[{id:0,text:'甲。',speaker:'甲',audio:'a.wav'},{id:1,text:'乙。',speaker:'旁白',audio:'b.wav'}];
 const before=JSON.stringify(c);await e.accept(b.id,'甲',false);assert.equal(b.characters[1].voice,'new');assert.equal(b.characters[1].candidate,null);assert.equal(JSON.stringify(c),before);assert.equal(e.state.tasks.length,0);assert(e.collectReferencedAudio().includes('previous.wav'));
});
test('legacy cleanup preference migrates into its only authoritative settings field',()=>{
 const state={books:[],voices:[],tasks:[],settings:{},autoDeletePlayed:true};const e=new Engine(io(),state);assert.equal(e.state.settings.autoDeletePlayed,true);assert(!Object.hasOwn(e.state,'autoDeletePlayed'));
});

test('actual GB18030 novel preserves all 306 headings, punctuation titles and numbered lists',()=>{
 const text=new TextDecoder('gb18030').decode(fs.readFileSync('books/女大三千位列仙班by打死不鸽.txt'));const r=splitChapters(text);
 assert.equal(r.chapters.length,306);assert(r.chapters.some(c=>c.title==='第0016章 你喝甜茶还是咸茶？'));assert(r.chapters.some(c=>c.title==='第0019章富婆抱抱我'));
 const rebuilt=r.chapters.map(c=>(c.sourceHeading?c.title+'\n':'')+c.text).join('\n');assert.equal(normalize(rebuilt),normalize(text));
 assert.equal(r.report.sourceCoverage,1);assert(!r.chapters.some(c=>/^\d+[.、]/.test(c.title)));
});

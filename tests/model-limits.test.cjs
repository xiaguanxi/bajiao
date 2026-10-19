const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Engine,ApiError}=require('../app/src/main/assets/core.js'),{Budget}=require('./model-budget.cjs');
test('429 limits only its model, obeys cooldown and needs ten consecutive successes',async()=>{
 let now=0,calls=0;const waits=[],e=new Engine({features:{cloneConcurrency:2},now:()=>now,sleep:async ms=>{waits.push(ms);now+=ms;},saveState:async()=>{},request:async()=>{if(++calls===1){const err=new ApiError('rate limit',429,true);err.retryAfterMs=2300;throw err;}return {};}});
 await e.request('tts',{model:'mimo-v2.5-tts-voiceclone'});assert.deepEqual(waits,[2300]);assert.equal(e.modelLimit('mimo-v2.5-tts-voiceclone'),1);assert.equal(e.modelLimit('mimo-v2.5-tts'),2);
 for(let n=0;n<8;n++)await e.request('tts',{model:'mimo-v2.5-tts-voiceclone'});assert.equal(e.modelLimit('mimo-v2.5-tts-voiceclone'),1);await e.request('tts',{model:'mimo-v2.5-tts-voiceclone'});assert.equal(e.modelLimit('mimo-v2.5-tts-voiceclone'),2);
});
test('sample cache shares loads, bounds memory and does not refill after invalidation',async()=>{
 let reads=0,release;const e=new Engine({saveState:async()=>{},readAudio:async id=>{reads++;if(id==='held')await new Promise(r=>release=r);return {base64:'a'.repeat(3*1024*1024)};}});
 await Promise.all([e.referenceAudio('one'),e.referenceAudio('one')]);assert.equal(reads,1);await e.referenceAudio('two');await e.referenceAudio('three');assert.equal(e._sampleCache.size,2);assert(!e._sampleCache.has('one'));
 const held=e.referenceAudio('held');e.invalidateReferences();release();await held;assert.equal(e._sampleCache.size,0);await e.referenceAudio('one');assert.equal(reads,5);
});
test('evaluation budgets persist across restarts, failures and concurrent reservations',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bajiao-budget-'));try{const file=path.join(dir,'budget.json'),b=new Budget(file);for(let n=0;n<30;n++)b.finish(b.reserve('llm','annotation'),{status:503});assert.throws(()=>new Budget(file).reserve('llm','annotation'),/预算/);for(const [group,count]of Object.entries(b.data.groups))for(let n=0;n<count;n++)b.reserve('tts',group);assert.equal(b.data.attempts.length,130);assert.throws(()=>b.reserve('tts','reserve'),/预算/);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

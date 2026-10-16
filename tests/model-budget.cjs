const fs=require('node:fs'),path=require('node:path');
class Budget {
 constructor(file){this.file=file;fs.mkdirSync(path.dirname(file),{recursive:true});this.data=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)): {limits:{llm:30,tts:100},groups:{pairs:40,clone:24,pipeline:20,reserve:16},attempts:[]};}
 save(){const tmp=this.file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(this.data,null,2));fs.renameSync(tmp,this.file);}
 reserve(provider,group,details={}){const d=this.data;if(d.attempts.filter(x=>x.provider===provider).length>=d.limits[provider]||(provider==='tts'&&d.attempts.filter(x=>x.provider==='tts'&&x.group===group).length>=(d.groups[group]||0))){const e=Error('验收请求预算已达上限');e.code='EVALUATION_BUDGET';throw e;}const row={id:d.attempts.length+1,provider,group,at:new Date().toISOString(),...details,status:'sent'};d.attempts.push(row);this.save();return row;}
 finish(row,result){Object.assign(row,result);this.save();}
}
module.exports={Budget};

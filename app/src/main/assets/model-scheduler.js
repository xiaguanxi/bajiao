(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BajiaoModelScheduler=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
class Scheduler{
 constructor(limit,modelLimit){this.limit=limit;this.modelLimit=modelLimit;this.active=0;this.models=new Map();this.queue=[];this.sequence=0;}
 acquire(model,priority=20,abort=()=>false){abort=typeof abort==='function'?abort:()=>false;return new Promise((resolve,reject)=>{this.queue.push({model,priority,abort,resolve,reject,order:this.sequence++,queuedAt:Date.now()});this.wake();});}
 wake(){
  clearTimeout(this.timer);this.queue.sort((a,b)=>b.priority-a.priority||a.order-b.order);
  for(let i=0;i<this.queue.length;){const job=this.queue[i];
   if(job.abort()){this.queue.splice(i,1);job.reject(Error('任务已暂停'));continue;}
   if(this.active>=this.limit()||(this.models.get(job.model)||0)>=this.modelLimit(job.model)){i++;continue;}
   this.queue.splice(i,1);this.active++;this.models.set(job.model,(this.models.get(job.model)||0)+1);let released=false;
   job.resolve({queueMs:Date.now()-job.queuedAt,release:()=>{if(released)return;released=true;this.active--;this.models.set(job.model,this.models.get(job.model)-1);this.wake();}});
  }
  if(this.queue.length)this.timer=setTimeout(()=>this.wake(),120);
 }
}
return {Scheduler};
});

(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BajiaoAppUpdates=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
class Controller{
 constructor(options){this.options=options;this.state={status:'idle',result:null,error:'',saving:false};this.pending=null;this.notified=new Set();}
 get enabled(){return this.options.getEnabled()!==false;}
 changed(){this.options.onChange?.(this.state);}
 async setEnabled(value){
  if(this.state.saving)return;this.state.saving=true;this.changed();
  try{await this.options.saveEnabled(!!value);}
  finally{this.state.saving=false;this.changed();}
  if(value)this.check({automatic:true}).catch(()=>{});
 }
 check({automatic=false}={}){
  if(automatic&&!this.enabled)return Promise.resolve(null);
  if(this.pending)return this.pending;
  const previous={...this.state};this.state={...this.state,status:'checking',error:''};this.changed();
  this.pending=Promise.resolve().then(()=>this.options.call('checkAppUpdate',{automatic})).then(result=>{
   if(!result||!['available','current','empty','skipped'].includes(result.status))throw Error('更新服务返回了无效的信息，请稍后重试。');
   if(result.status==='available'&&(!result.version||!result.downloadUrl))throw Error('更新信息缺少安装包地址，请稍后重试。');
   if(result.status==='skipped'){this.state={...previous,saving:this.state.saving};return null;}
   this.state={...this.state,status:result.status,result,error:''};this.changed();
   if(automatic&&this.enabled&&result.status==='available'&&!this.notified.has(result.version)){
    this.notified.add(result.version);this.options.onAvailable?.(result);
   }
   return result;
  }).catch(error=>{this.state={...this.state,status:'error',error:error.message||'检查更新失败，请稍后重试。'};this.changed();throw error;})
   .finally(()=>{this.pending=null;if(this.state.status==='checking')this.state={...previous,saving:this.state.saving};this.changed();});
  return this.pending;
 }
 async download(){
  if(this.state.status!=='available'||!this.state.result?.downloadUrl)throw Error('请先检查可用的新版本。');
  return this.options.call('openAppUpdate',{url:this.state.result.downloadUrl});
 }
}
return {Controller};
});

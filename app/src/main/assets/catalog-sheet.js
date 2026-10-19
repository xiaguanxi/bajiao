/* Coordinate the detail sheet and its chapter list as one vertical gesture. */
(function(root){
'use strict';
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
root.BajiaoCatalogSheet=class {
 constructor(main,state,{blocked=()=>false,onIdle=()=>{},onResize=()=>{},beforeScroll=()=>{}}={}){
  this.main=main;this.state=state;this.blocked=blocked;this.onIdle=onIdle;this.beforeScroll=beforeScroll;
  this.overview=main.querySelector('.vc-detail-overview');
  this.content=main.querySelector('.vc-detail-overview-content');
  this.sheet=main.querySelector('.vc-catalog-sheet');
  this.list=main.querySelector('#catalog-scroll');
  this.handle=main.querySelector('.vc-catalog-handle');
  this.listeners=[];this.frame=0;this.wheelTimer=0;this.suppressUntil=0;
  if(!this.handle)return;
  this.measure();
  this.listen(this.sheet,'touchstart',e=>this.start(e),{passive:true});
  this.listen(this.sheet,'touchmove',e=>this.move(e),{passive:false});
  this.listen(this.sheet,'touchend',e=>this.end(e),{passive:false});
  this.listen(this.sheet,'touchcancel',()=>this.cancel(),{passive:true});
  this.listen(this.sheet,'wheel',e=>this.wheel(e),{passive:false});
  this.listen(this.sheet,'click',e=>{
   if(Date.now()<this.suppressUntil){e.preventDefault();e.stopImmediatePropagation();return;}
   if(e.target.closest('.vc-catalog-handle'))this.snap(this.offset<(this.minOffset+this.max)/2?this.max:0);
  },true);
  this.listen(this.handle,'pointerdown',e=>{
   if(e.pointerType!=='mouse'||e.button!==0||this.blocked())return;
   this.stop();this.mouse={y:e.clientY,start:e.clientY};this.handle.setPointerCapture(e.pointerId);
  });
  this.listen(this.handle,'pointermove',e=>{
   if(!this.mouse)return;
   this.setOffset(this.offset+this.mouse.y-e.clientY);this.mouse.y=e.clientY;
  });
  this.listen(this.handle,'pointerup',e=>{
   if(!this.mouse)return;
   const delta=this.mouse.start-e.clientY;this.mouse=null;
   if(Math.abs(delta)>6){this.suppressUntil=Date.now()+400;this.snap(delta>0?this.max:0);}
  });
  this.listen(this.handle,'lostpointercapture',()=>{if(this.mouse){this.mouse=null;this.snap();}});
  this.listen(this.handle,'keydown',e=>{
   if(!['ArrowUp','ArrowDown','Home','End'].includes(e.key)||this.blocked())return;
   e.preventDefault();this.snap(['ArrowUp','End'].includes(e.key)?this.max:0);
  });
  this.listen(this.list,'keydown',e=>{
   if(e.target!==this.list||this.blocked())return;
   const delta={ArrowDown:40,ArrowUp:-40,PageDown:this.list.clientHeight*.8,PageUp:-this.list.clientHeight*.8,' ':this.list.clientHeight*.8}[e.key];
   if(delta!==undefined){e.preventDefault();this.consume(e.shiftKey&&e.key===' '?-delta:delta);this.snap();}
  });
  if(root.ResizeObserver){this.observer=new ResizeObserver(()=>{this.measure();onResize();});this.observer.observe(this.content);this.observer.observe(this.list);}
  this.listen(root,'resize',()=>{this.measure();onResize();});
 }
 get interacting(){return !!(this.touch||this.mouse||this.frame||this.wheelTimer);}
 listen(el,type,fn,options){el.addEventListener(type,fn,options);this.listeners.push(()=>el.removeEventListener(type,fn,options));}
 measure(){
  const progress=this.state.progress||0,style=getComputedStyle(this.main);
  let room=this.main.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom);
  for(const child of this.main.children){
   if(child===this.overview||child===this.sheet)continue;
   const css=getComputedStyle(child);room-=child.getBoundingClientRect().height+parseFloat(css.marginTop)+parseFloat(css.marginBottom);
  }
  this.max=this.content.offsetHeight;
  // Keep the handle and at least one chapter accessible in a short viewport.
  const minimum=this.handle.offsetHeight+this.sheet.querySelector('#catalog-heading').offsetHeight+96;
  this.minOffset=clamp(this.max-Math.max(0,room-minimum),0,this.max);
  this.setOffset(this.minOffset+progress*(this.max-this.minOffset));
 }
 setOffset(value){
  this.offset=clamp(value,this.minOffset,this.max);this.state.progress=this.max>this.minOffset?(this.offset-this.minOffset)/(this.max-this.minOffset):1;
  this.overview.style.height=(this.max-this.offset)+'px';
  this.content.style.transform='translateY('+(-this.offset)+'px)';
  const expanded=this.offset>=this.max-1;
  this.overview.inert=expanded;
  this.handle.setAttribute('aria-expanded',String(expanded));
  this.handle.setAttribute('aria-label',expanded?'下拉收回章节目录，显示书籍信息':'上推展开章节目录');
 }
 // Positive delta moves up: expand the sheet first, then advance the list.
 // Negative delta rewinds the list first; only its real top can lower the sheet.
 consume(delta,handle=false){
  if(handle){this.setOffset(this.offset+delta);return;}
  this.beforeScroll(delta);
  if(delta>0){const used=Math.min(delta,this.max-this.offset);this.setOffset(this.offset+used);this.list.scrollTop+=delta-used;}
  else{const used=Math.min(-delta,this.list.scrollTop);this.list.scrollTop-=used;this.setOffset(this.offset+delta+used);}
 }
 stop(){cancelAnimationFrame(this.frame);this.frame=0;clearTimeout(this.wheelTimer);this.wheelTimer=0;}
 snap(target=this.offset>=(this.minOffset+this.max)/2?this.max:0){
  this.stop();const from=this.offset,to=clamp(target,this.minOffset,this.max);
  if(Math.abs(to-from)<1||root.matchMedia('(prefers-reduced-motion: reduce)').matches){this.setOffset(to);this.onIdle();return;}
  const start=performance.now();
  const step=now=>{
   if(this.blocked()){this.frame=0;this.onIdle();return;}
   const t=Math.min(1,(now-start)/220);this.setOffset(from+(to-from)*(1-Math.pow(1-t,3)));
   if(t<1)this.frame=requestAnimationFrame(step);else{this.frame=0;this.onIdle();}
  };this.frame=requestAnimationFrame(step);
 }
 start(e){
  if(e.touches.length!==1||this.blocked()){this.cancel();return;}
  const handle=!!e.target.closest('.vc-catalog-handle');
  if(!handle&&!this.list.contains(e.target))return;
  this.stop();const p=e.touches[0];
  this.touch={id:p.identifier,x:p.clientX,y:p.clientY,lastY:p.clientY,time:performance.now(),velocity:0,active:false,handle,startOffset:this.offset};
 }
 move(e){
  const t=this.touch;if(!t)return;
  if(e.touches.length!==1||this.blocked()){this.cancel();return;}
  const p=e.touches[0];if(p.identifier!==t.id)return;
  if(!t.active){
   const dx=p.clientX-t.x,dy=p.clientY-t.y;
   if(Math.max(Math.abs(dx),Math.abs(dy))<6)return;
   if(Math.abs(dx)>Math.abs(dy)){this.touch=null;this.onIdle();return;}
   t.active=true;
  }
  e.preventDefault();const now=performance.now(),delta=t.lastY-p.clientY;
  t.velocity=delta/Math.max(8,now-t.time);t.time=now;t.lastY=p.clientY;
  this.consume(delta,t.handle);
 }
 end(e){
  const t=this.touch;if(!t||e.touches.length)return;
  this.touch=null;
  if(!t.active){this.onIdle();return;}
  e.preventDefault();this.suppressUntil=Date.now()+400;
  const delta=t.y-t.lastY,velocity=performance.now()-t.time<100?t.velocity:0;
  if(this.offset>this.minOffset&&this.offset<this.max){
   const moved=this.offset-t.startOffset;
   this.snap(Math.abs(moved)>24||Math.abs(velocity)>.35?(moved>0?this.max:0):undefined);
  }else if(!t.handle&&Math.abs(velocity)>.15&&((delta>0&&this.offset===this.max)||(delta<0&&this.list.scrollTop>0))){
   this.coast(velocity);
  }else this.onIdle();
 }
 coast(velocity){
  let v=clamp(velocity,-2.5,2.5),last=performance.now();
  const step=now=>{
   if(this.blocked()){this.frame=0;this.onIdle();return;}
   const dt=clamp(now-last,0,32);last=now;
   const before=this.list.scrollTop,distance=v*dt;this.list.scrollTop+=distance;
   v=Math.sign(v)*Math.max(0,Math.abs(v)-.0045*dt);
   if(Math.abs(v)>.05&&(Math.abs(distance)<1||Math.abs(this.list.scrollTop-before)>.5))this.frame=requestAnimationFrame(step);
   else{this.frame=0;this.onIdle();}
  };this.frame=requestAnimationFrame(step);
 }
 cancel(){const active=this.touch?.active;this.touch=null;if(active)this.snap();else this.onIdle();}
 wheel(e){
  if(this.blocked()||e.ctrlKey||Math.abs(e.deltaX)>Math.abs(e.deltaY))return;
  if(!e.target.closest('.vc-catalog-handle')&&!this.list.contains(e.target))return;
  e.preventDefault();this.stop();
  const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?this.list.clientHeight:1);
  this.consume(delta,!!e.target.closest('.vc-catalog-handle'));
  this.wheelTimer=setTimeout(()=>{this.wheelTimer=0;this.snap();},140);
 }
 destroy(){this.stop();this.observer?.disconnect();this.listeners.forEach(off=>off());this.touch=null;this.mouse=null;}
};
})(window);

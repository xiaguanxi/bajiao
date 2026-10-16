// Older Android installations may retain their factory WebView after an APK update.
(()=>{
 'use strict';
 if(!('CSSLayerBlockRule' in window)){
  const layout=document.createElement('link');layout.rel='stylesheet';layout.href='layout-compat.css';
  document.head.insertBefore(layout,document.head.querySelector('link[rel=stylesheet]'));
 }
 if(!CSS.supports('selector(:focus-visible)')){
  const root=document.documentElement;root.classList.add('vc-no-focus-visible');
  document.addEventListener('keydown',event=>{if(event.key==='Tab')root.classList.add('vc-keyboard-navigation');},true);
  document.addEventListener('pointerdown',()=>root.classList.remove('vc-keyboard-navigation'),true);
 }
 for(const type of [Element,Document,DocumentFragment])if(!type.prototype.replaceChildren){
  Object.defineProperty(type.prototype,'replaceChildren',{configurable:true,writable:true,value:function(...children){
   const fragment=document.createDocumentFragment();for(const child of children)fragment.appendChild(child instanceof Node?child:document.createTextNode(String(child)));
   while(this.firstChild)this.removeChild(this.firstChild);this.appendChild(fragment);
  }});
 }
 if(!Array.prototype.at)Object.defineProperty(Array.prototype,'at',{configurable:true,writable:true,value:function(index){const n=Math.trunc(Number(index)||0);return this[n<0?this.length+n:n];}});
 const has=CSS.supports('selector(:has(body))');
 const gapProbe=document.createElement('div');gapProbe.style.cssText='position:absolute;visibility:hidden;display:flex;flex-direction:column;row-gap:1px';
 for(let i=0;i<2;i++){const child=document.createElement('div');child.style.height='1px';gapProbe.appendChild(child);}
 document.body.appendChild(gapProbe);if(gapProbe.scrollHeight!==3)document.documentElement.classList.add('vc-no-flex-gap');gapProbe.remove();
 if(!has)new MutationObserver(()=>{
  document.querySelectorAll('.vc-dialog').forEach(el=>el.classList.toggle('vc-reading-dialog',!!el.querySelector('.vc-reading-settings')));
  document.querySelectorAll('.vc-slim-top').forEach(el=>el.classList.toggle('vc-issue-header',!!el.querySelector('.vc-next-issue-entry')));
  document.querySelectorAll('.vc-chapter').forEach(el=>el.classList.toggle('vc-selected-chapter',!!el.querySelector('input:checked')));
  document.getElementById('app')?.classList.toggle('vc-has-player-sheet',!!document.querySelector('.vc-player-sheet'));
 }).observe(document.getElementById('screen'),{childList:true,subtree:true});
})();

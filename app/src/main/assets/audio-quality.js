(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VocastAudioQuality=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// Compare the complete acoustic sequences, not just duration or the speaker's timbre.
// Deliberate repetitions in the source text are exempt. Uncertain matches stay intact.
function intentionalRepeat(text){
 const t=String(text||'').replace(/[\s\p{P}\p{S}]/gu,'');
 for(let n=1;n<=t.length/2;n++)if(t.length%n===0&&t===t.slice(0,n).repeat(t.length/n))return true;
 return false;
}
function decode(base64){
 if(typeof Buffer!=='undefined')return new Uint8Array(Buffer.from(base64,'base64'));
 const raw=atob(base64),out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out;
}
function encode(bytes){
 if(typeof Buffer!=='undefined')return Buffer.from(bytes).toString('base64');
 let raw='';for(let i=0;i<bytes.length;i+=16384)raw+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(raw);
}
function wave(bytes){
 if(bytes.length<44)return null;
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),tag=at=>String.fromCharCode(...bytes.subarray(at,at+4));
 if(tag(0)!=='RIFF'||tag(8)!=='WAVE')return null;
 let fmt=null,data=null;
 for(let at=12;at+8<=bytes.length;){const n=v.getUint32(at+4,true);if(at+8+n>bytes.length)return null;if(tag(at)==='fmt '&&n>=16)fmt=at+8;if(tag(at)==='data')data={at:at+8,size:n};at+=8+n+(n%2);}
 if(fmt===null||!data||v.getUint16(fmt,true)!==1)return null;
 const channels=v.getUint16(fmt+2,true),rate=v.getUint32(fmt+4,true),align=v.getUint16(fmt+12,true),bits=v.getUint16(fmt+14,true);
 if(channels<1||channels>2||bits!==16||align!==channels*2||rate<8000||rate>96000||data.size%align)return null;
 return {v,fmt,data,channels,rate,align,frames:data.size/align,duration:data.size/align/rate};
}
const WINDOW=512,HOP=160,BANDS=24;
const hann=Float64Array.from({length:WINDOW},(_,i)=>.5-.5*Math.cos(2*Math.PI*i/(WINDOW-1)));
const bands=Array.from({length:BANDS},(_,i)=>[100*Math.pow(38,i/BANDS),100*Math.pow(38,(i+1)/BANDS)]);
function fft(re,im){
 for(let i=1,j=0;i<WINDOW;i++){let bit=WINDOW>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];}}
 for(let len=2;len<=WINDOW;len<<=1){const angle=-2*Math.PI/len,wr=Math.cos(angle),wi=Math.sin(angle);for(let i=0;i<WINDOW;i+=len){let ar=1,ai=0;for(let j=0;j<len/2;j++){const k=i+j,l=k+len/2,tr=re[l]*ar-im[l]*ai,ti=re[l]*ai+im[l]*ar;re[l]=re[k]-tr;im[l]=im[k]-ti;re[k]+=tr;im[k]+=ti;const nr=ar*wr-ai*wi;ai=ar*wi+ai*wr;ar=nr;}}}
}
function features(w){
 const size=Math.floor(w.frames*8000/w.rate),x=new Float64Array(size);
 for(let i=0;i<size;i++){const pos=i*w.rate/8000,a=Math.floor(pos),b=Math.min(w.frames-1,a+1),mix=pos-a;let value=0;for(let ch=0;ch<w.channels;ch++){const p=w.data.at+a*w.align+ch*2,q=w.data.at+b*w.align+ch*2;value+=w.v.getInt16(p,true)*(1-mix)+w.v.getInt16(q,true)*mix;}x[i]=value/w.channels;}
 const rows=[],rms=[],mean=new Float64Array(BANDS);
 for(let at=0;at+WINDOW<size;at+=HOP){const re=new Float64Array(WINDOW),im=new Float64Array(WINDOW);let energy=0;for(let k=0;k<WINDOW;k++){re[k]=x[at+k]*hann[k];energy+=x[at+k]**2;}rms.push(Math.sqrt(energy/WINDOW));fft(re,im);const f=new Float64Array(BANDS);let sum=0;for(let b=0;b<BANDS;b++){let power=0;for(let k=Math.ceil(bands[b][0]*WINDOW/8000);k<bands[b][1]*WINDOW/8000;k++)power+=re[k]**2+im[k]**2;f[b]=Math.log1p(power);sum+=f[b];}for(let b=0;b<BANDS;b++){f[b]-=sum/BANDS;mean[b]+=f[b];}rows.push(f);}
 for(const f of rows){let norm=0;for(let b=0;b<BANDS;b++){f[b]-=mean[b]/rows.length;norm+=f[b]**2;}norm=Math.sqrt(norm)||1;for(let b=0;b<BANDS;b++)f[b]/=norm;}
 const threshold=Math.max(80,Math.max(...rms)*.025),active=rms.map(r=>r>threshold);
 return {rows,active};
}
function distance(rows,a,z,b,y){
 const n=z-a,m=y-b;let prev=new Float64Array(m+1).fill(Infinity),steps=new Uint32Array(m+1);prev[0]=0;
 for(let i=1;i<=n;i++){const cur=new Float64Array(m+1).fill(Infinity),count=new Uint32Array(m+1);for(let j=Math.max(1,Math.floor((i-1)*m/n)-12);j<=Math.min(m,Math.floor(i*m/n)+12);j++){let cost=prev[j-1],num=steps[j-1];if(prev[j]+.1<cost){cost=prev[j]+.1;num=steps[j];}if(cur[j-1]+.1<cost){cost=cur[j-1]+.1;num=count[j-1];}let dot=0;for(let k=0;k<BANDS;k++)dot+=rows[a+i-1][k]*rows[b+j-1][k];cur[j]=cost+1-dot;count[j]=num+1;}prev=cur;steps=count;}
 return prev[m]/(steps[m]||1);
}
function cleanRepeatedSpeech(base64,text){
 const unchanged={base64,removed:false};
 const letters=String(text||'').replace(/[\s\p{P}\p{S}]/gu,'');
 if(letters.length<6||intentionalRepeat(text))return unchanged;
 const bytes=decode(base64),w=wave(bytes);
 // Bounded work on the phone; a long/unsupported file is never silently cropped.
 if(!w||w.duration<2||w.duration>90||w.duration<Math.max(1,letters.length/280*60)*1.6)return unchanged;
 const {rows,active}=features(w);let first=active.indexOf(true),last=active.lastIndexOf(true),gap=null,best=null;
 if(first<0)return unchanged;
 for(let i=first;i<=last;i++){
  if(!active[i]&&gap===null)gap=i;
  if(active[i]&&gap!==null){
   const start=gap,end=i;gap=null;if(end-start<8)continue;
   let left=start;while(left>first&&!active[left-1])left--;
   const n=left-first,m=last-end+1;
   if(n<40||m<40||n/m<.8||n/m>1.25)continue;
   const score=distance(rows,first,left,end,last+1);
   if(score<.30&&(!best||score<best.score))best={score,cutFrame:Math.round((start*HOP+WINDOW+800)*w.rate/8000)};
  }
 }
 if(!best)return unchanged;
 const keep=Math.min(w.frames,best.cutFrame)*w.align;
 // Retain the first complete rendition and a short quiet tail. Preserve fmt/PCM bytes.
 const fmtSize=w.v.getUint32(w.fmt-4,true),headSize=28+fmtSize+(fmtSize%2),out=new Uint8Array(headSize+keep),v=new DataView(out.buffer);
 out.set(bytes.subarray(0,12));out.set(bytes.subarray(w.fmt-8,w.fmt+fmtSize),12);
 out.set([100,97,116,97],headSize-8);v.setUint32(headSize-4,keep,true);out.set(bytes.subarray(w.data.at,w.data.at+keep),headSize);v.setUint32(4,out.length-8,true);
 return {base64:encode(out),removed:true,score:best.score,duration:keep/w.align/w.rate};
}
return {cleanRepeatedSpeech,intentionalRepeat};
});

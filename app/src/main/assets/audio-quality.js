(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BajiaoAudioQuality=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// Compare the complete acoustic sequences, not just duration or the speaker's timbre.
// Deliberate repetitions in the source text are exempt. Uncertain matches stay intact.
function intentionalRepeat(text){
 const t=String(text||'').replace(/[\s\p{P}\p{S}]/gu,'');
 for(let n=1;n<=t.length/2;n++)if(t.length%n===0&&t===t.slice(0,n).repeat(t.length/n))return true;
 const clauses=String(text||'').split(/[\p{P}\p{S}]+/u).map(s=>s.replace(/\s/g,'')).filter(Boolean);
 // Repeated source clauses are intentional even when followed by other words.
 for(let i=1;i<clauses.length;i++)if(clauses[i].length>=2&&clauses.slice(0,i).includes(clauses[i]))return true;
 return false;
}
const REPETITION_CHECK_VERSION=3;
function decode(base64){
 if(typeof Buffer!=='undefined')return new Uint8Array(Buffer.from(base64,'base64'));
 const raw=atob(base64),out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out;
}
function wave(bytes){
 if(bytes.length<44)return null;
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),tag=at=>String.fromCharCode(...bytes.subarray(at,at+4));
 if(tag(0)!=='RIFF'||tag(8)!=='WAVE')return null;
 let fmt=null,data=null;
 for(let at=12;at+8<=bytes.length;){const n=v.getUint32(at+4,true);if(at+8+n>bytes.length)return null;if(tag(at)==='fmt '&&n>=16)fmt=at+8;if(tag(at)==='data')data={at:at+8,size:n};at+=8+n+(n%2);}
 if(fmt===null||!data||v.getUint16(fmt,true)!==1)return null;
 const channels=v.getUint16(fmt+2,true),rate=v.getUint32(fmt+4,true),align=v.getUint16(fmt+12,true),bits=v.getUint16(fmt+14,true);
 if(channels<1||![8,16,24,32].includes(bits)||align!==channels*bits/8||rate<=0||rate>384000||v.getUint32(fmt+8,true)!==rate*align||!data.size||data.size%align)return null;
 return {v,fmt,data,channels,rate,align,bits,frames:data.size/align,duration:data.size/align/rate};
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
 const threshold=Math.max(80,Math.max(...rms)*.025),active=rms.map(r=>r>threshold);
 // Quiet frames must not change the speaker normalization or match score.
 mean.fill(0);let count=0;rows.forEach((f,i)=>{if(active[i]){count++;for(let b=0;b<BANDS;b++)mean[b]+=f[b];}});
 for(const f of rows){let norm=0;for(let b=0;b<BANDS;b++){f[b]-=mean[b]/(count||1);norm+=f[b]**2;}norm=Math.sqrt(norm)||1;for(let b=0;b<BANDS;b++)f[b]/=norm;}
 return {rows,active};
}
function distance(rows,a,z,b,y,details=false){
 const n=z-a,m=y-b;let prev=new Float64Array(m+1).fill(Infinity),steps=new Uint32Array(m+1);prev[0]=0;
 const trace=details?new Uint8Array((n+1)*(m+1)):null;
 for(let i=1;i<=n;i++){const cur=new Float64Array(m+1).fill(Infinity),count=new Uint32Array(m+1);for(let j=Math.max(1,Math.floor((i-1)*m/n)-12);j<=Math.min(m,Math.floor(i*m/n)+12);j++){let cost=prev[j-1],num=steps[j-1],dir=0;if(prev[j]+.1<cost){cost=prev[j]+.1;num=steps[j];dir=1;}if(cur[j-1]+.1<cost){cost=cur[j-1]+.1;num=count[j-1];dir=2;}let dot=0;for(let k=0;k<BANDS;k++)dot+=rows[a+i-1][k]*rows[b+j-1][k];cur[j]=cost+1-dot;count[j]=num+1;if(trace)trace[i*(m+1)+j]=dir;}prev=cur;steps=count;}
 const score=prev[m]/(steps[m]||1);if(!details)return score;
 const sums=[0,0,0,0],counts=[0,0,0,0];let i=n,j=m;
 while(i>0&&j>0){const bucket=Math.min(3,Math.floor((i-1)*4/n)),dir=trace[i*(m+1)+j];let dot=0;for(let k=0;k<BANDS;k++)dot+=rows[a+i-1][k]*rows[b+j-1][k];sums[bucket]+=1-dot+(dir?.1:0);counts[bucket]++;if(dir!==2)i--;if(dir!==1)j--;}
 return {score,blockScores:sums.map((s,k)=>counts[k]?s/counts[k]:Infinity)};
}
function repetitionCandidate(base64,text){
 const unchanged={base64,removed:false};
 const letters=String(text||'').replace(/[\s\p{P}\p{S}]/gu,'');
 if(!letters.length||intentionalRepeat(text))return unchanged;
 const bytes=decode(base64),w=wave(bytes);
 // Bounded work on the phone; a long/unsupported file is never silently cropped.
 if(!w||w.bits!==16||w.channels>2||w.rate<8000||w.rate>96000||w.duration<2||w.duration>90||w.duration<Math.max(1,letters.length/280*60)*1.6)return unchanged;
 const {rows,active}=features(w);let first=active.indexOf(true),last=active.lastIndexOf(true),gap=null,best=null;
 if(first<0)return unchanged;
 const compare=(left,right,threshold)=>{
  const n=left-first,m=last-right+1;
  const minimum=letters.length<6?10:40;
  if(n<minimum||m<minimum||n/m<.8||n/m>1.25)return;
  const match=distance(rows,first,left,right,last+1,true),score=match.score;
  if(score<threshold&&(!best||score<best.score))best={...match,leftEndMs:left*HOP/8,rightStartMs:right*HOP/8,firstMs:first*HOP/8,lastMs:Math.min(w.duration*1000,last*HOP/8+WINDOW/8)};
 };
 for(let i=first;i<=last;i++){
  if(!active[i]&&gap===null)gap=i;
  if(active[i]&&gap!==null){
   const start=gap,end=i;gap=null;if(end-start<8)continue;
   let left=start;while(left>first&&!active[left-1])left--;
   compare(left,end,.36);
  }
 }
 // Some models repeat without a silent break. Require stronger full-sequence
 // evidence here, rather than treating a long utterance as proof of repetition.
 if(!best&&letters.length>=6)for(let ratio=.44;ratio<=.561;ratio+=.02){const mid=first+Math.round((last-first+1)*ratio);compare(mid,mid,.16);}
 if(!best)return unchanged;
 return {...unchanged,suspected:true,...best,cropEligible:letters.length>=3&&best.rightStartMs-best.leftEndMs>=3000&&best.score<.34&&best.blockScores.every(score=>score<.5)};
}
function normalizeTranscript(text){return String(text||'').normalize('NFKC').replace(/[\s\p{P}]/gu,'');}
// Compatibility API: local evidence never authorizes a destructive crop.
function cleanRepeatedSpeech(base64){return {base64,removed:false};}
// Legacy checks preserve previously archived audio. New requests use native measurements.
function analyzeSpeech(base64,text,finishReason='stop'){
 let w=null;try{w=wave(decode(base64));}catch(_){}
 const issues=[],hardIssues=[];
 if(finishReason==='length')hardIssues.push('输出被截断');
 if(!w){hardIssues.push(base64?'音频结构损坏或无法解码':'空音频');return {issues:hardIssues,hardIssues,supported:false};}
 let zeros=0,longest=0,peak=0;
 for(let frame=0;frame<w.frames;frame++){
  let zero=true;for(let ch=0;ch<w.channels;ch++){const at=w.data.at+frame*w.align+ch*w.bits/8;for(let k=0;k<w.bits/8;k++)if(w.v.getUint8(at+k)!==(w.bits===8?128:0))zero=false;}
  if(!zero)peak=1;
  zeros=zero?zeros+1:0;longest=Math.max(longest,zeros);
 }
 const letters=normalizeTranscript(text).length,estimate=Math.max(1,letters/280*60);
 if(w.duration>Math.max(8,estimate*3+5))issues.push('时长异常');
 if(letters>=6&&w.duration<Math.max(.25,letters/900*60))issues.push('疑似漏读');
 if(longest/w.rate>3)issues.push('长静音');
 if(peak===0)hardIssues.push('全静音');
 const candidate=repetitionCandidate(base64,text);
 if(candidate.suspected)hardIssues.push('疑似重复');
 return {issues:[...hardIssues,...issues],hardIssues,supported:true,duration:w.duration};
}
function analyzeProcessedSpeech(file,text,finishReason='stop',suspectedRepeat=false){
 const issues=[],hardIssues=[];
 if(finishReason==='length')hardIssues.push('输出被截断');
 if(!file.supported||!(file.duration>0))hardIssues.push('音频结构损坏、空音频或无法解码');
 else{
  if(file.allSilent)hardIssues.push('全静音');
  else if(file.allNearSilent)hardIssues.push('全近静音');
  const letters=normalizeTranscript(text).length,estimate=Math.max(1,letters/280*60);
  if(file.duration>Math.max(8,estimate*3+5))hardIssues.push('处理后时长仍异常');
  if(letters>=6&&file.duration<Math.max(.25,letters/900*60))issues.push('疑似漏读');
  if(file.longestSilenceMs>3000)issues.push('长静音');
  if(suspectedRepeat)hardIssues.push('疑似重复');
 }
 return {issues:[...hardIssues,...issues],hardIssues,supported:!!file.supported,duration:file.duration||0};
}
return {REPETITION_CHECK_VERSION,cleanRepeatedSpeech,repetitionCandidate,analyzeSpeech,analyzeProcessedSpeech,normalizeTranscript,intentionalRepeat};
});

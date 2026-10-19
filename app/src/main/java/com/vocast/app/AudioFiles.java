package com.vocast.app;
import org.json.JSONObject;
import org.json.JSONArray;
import java.io.*;
import java.nio.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

final class AudioFiles {
    final File dir;
    AudioFiles(File dir){this.dir=dir;dir.mkdirs();}
    File getFileDirect(String id) {
            if(id==null||!id.matches("[a-f0-9]{64}\\.(wav|mp3|raw)"))return null;
            return new File(dir,id);
        }
        boolean delete(String id) {
            File f=getFileDirect(id);
            return f!=null&&f.exists()&&f.delete();
        }
        long deleteAndGetSize(String id) {
            File f=getFileDirect(id);
            if(f!=null&&f.exists()){
                long len=f.length();
                if(f.delete())return len;
            }
            return 0;
        }
        JSONObject getStats() {
            File[] files=dir.listFiles();
            long totalBytes=0;
            int count=0;
            if(files!=null){
                for(File f:files){
                    if(f.isFile()&&(f.getName().endsWith(".wav")||f.getName().endsWith(".mp3")||f.getName().endsWith(".raw"))){
                        totalBytes+=f.length();
                        count++;
                    }
                }
            }
            JSONObject filesMap=new JSONObject();
            if(files!=null){
                for(File f:files){
                    if(f.isFile()&&(f.getName().endsWith(".wav")||f.getName().endsWith(".mp3")||f.getName().endsWith(".raw"))){
                        try{filesMap.put(f.getName(),f.length());}catch(Exception ignored){}
                    }
                }
            }
            JSONObject obj=new JSONObject();
            try{
                obj.put("totalBytes",totalBytes);
                obj.put("fileCount",count);
                obj.put("totalMb",Math.round(totalBytes/1024.0/1024.0*10.0)/10.0);
                obj.put("fileSizes",filesMap);
            }catch(Exception ignored){}
            return obj;
        }
        JSONObject cleanup(Set<String> keepIds) {
            File[] files=dir.listFiles();
            long freed=0;
            int deleted=0;
            if(files!=null){
                for(File f:files){
                    if(f.isFile()&&(f.getName().endsWith(".wav")||f.getName().endsWith(".mp3")||f.getName().endsWith(".raw"))){
                        if(keepIds==null||!keepIds.contains(f.getName())){
                            freed+=f.length();
                            if(f.delete())deleted++;
                        }
                    }
                }
            }
            JSONObject obj=new JSONObject();
            try{obj.put("deletedCount",deleted);obj.put("freedBytes",freed);obj.put("freedMb",Math.round(freed/1024.0/1024.0*10.0)/10.0);}catch(Exception ignored){}
            return obj;
        }
        JSONObject durations(java.util.List<String> ids){JSONObject o=new JSONObject();for(String id:ids){long ms=-1;try{String key=String.valueOf(id);if(key.endsWith(".wav")&&key.length()==68){boolean hex=true;for(int k=0;k<64;k++){char ch=key.charAt(k);if(!((ch>=(char)48&&ch<=(char)57)||(ch>=(char)97&&ch<=(char)102))){hex=false;break;}}if(hex){java.io.File f=new java.io.File(dir,key);if(f.isFile()&&f.length()>44){byte[] head=new byte[44];int n=0;try(java.io.FileInputStream in=new java.io.FileInputStream(f)){int r;while(n<44&&(r=in.read(head,n,44-n))!=-1)n+=r;}if(n==44){java.nio.ByteBuffer b=java.nio.ByteBuffer.wrap(head).order(java.nio.ByteOrder.LITTLE_ENDIAN);int byteRate=b.getInt(28);long dataLen=f.length()-44;if(byteRate>0)ms=Math.round(dataLen/(double)byteRate*1000);}}}}o.put(String.valueOf(id),ms);}catch(Exception e){try{o.put(String.valueOf(id),-1);}catch(Exception ignored){}}}return o;}
        File get(String id) throws Exception {if(!id.matches("[a-f0-9]{64}\\.(wav|mp3)"))throw new Exception("无效音频引用");return getRaw(id);}
    File getRaw(String id) throws Exception {File f=getFileDirect(id);if(f==null)throw new Exception("无效音频引用");if(!f.isFile())throw new Exception("参考音频已丢失，请重新导入");return f;}
    JSONObject saveRaw(byte[] data,String format) throws Exception {
        if(!format.equals("wav"))throw new Exception("不支持的原始返回格式");
        boolean playable=true;double duration=0;
        try{duration=parse(data).duration();}catch(Exception invalid){playable=false;}
        return write(data,playable?"wav":"raw",duration).put("playable",playable);
    }
    JSONObject save(byte[] data,String format) throws Exception {
        if(!format.equals("wav")&&!format.equals("mp3"))throw new Exception("不支持的音频格式");
        double duration=0;
        if(format.equals("wav")){
            Wave w=parse(data);
            // Preserve reference samples and raw synthesis bytes. Content quality is
            // checked separately; quiet speech and deliberate pauses are valid PCM.
            duration=w.duration();
        }else if(data.length<3||!((data[0]=='I'&&data[1]=='D'&&data[2]=='3')||((data[0]&255)==255&&(data[1]&224)==224)))throw new Exception("MP3 文件头无效");
        return write(data,format,duration);
    }
    private JSONObject write(byte[] data,String format,double duration) throws Exception {
        StringBuilder id=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(data))id.append(String.format(Locale.ROOT,"%02x",b));id.append('.').append(format);
        File target=new File(dir,id.toString());
        if(!target.exists()) {
            File temp=File.createTempFile("audio-",".tmp",dir);
            try {
                try(FileOutputStream out=new FileOutputStream(temp)){out.write(data);out.getFD().sync();}
                // Identical concurrent workers may have already published the same hash.
                if(!temp.renameTo(target)&&!target.isFile())throw new IOException("音频保存失败");
            } finally {if(temp.exists())temp.delete();}
        }
        return new JSONObject().put("id",id.toString()).put("size",data.length).put("duration",duration).put("format",format);
    }
    static class Wave {byte[] fmt,pcm;double duration(){return pcm.length/(double)ByteBuffer.wrap(fmt).order(ByteOrder.LITTLE_ENDIAN).getInt(8);}}
    // Durations are seconds; removed intervals are [startMs,endMs) in the original PCM.
    // The raw archive is immutable: only a corrected derivative gets a new ID.
    JSONObject processSpeechAudio(String id) throws Exception {
        File source=getRaw(id);
        if(source.length()>64L*1024*1024)throw new IOException("文件超过允许大小");
        byte[] bytes=read(source,64*1024*1024);
        JSONObject result=new JSONObject().put("id",id).put("size",bytes.length)
            .put("duration",0).put("format",id.substring(id.lastIndexOf('.')+1))
            .put("supported",false).put("silenceProcessingVersion",1)
            .put("originalDuration",0).put("removedMs",0).put("trimRanges",new JSONArray())
            .put("allSilent",false).put("allNearSilent",false).put("longestSilenceMs",0)
            .put("corrected",false);
        Wave wave;
        try {
            validateSpeechContainer(bytes);
            wave=parse(bytes);
        } catch(Exception invalid) {
            // Unrecognized/corrupt synthesis results are diagnostics, not I/O failures.
            return result;
        }
        ByteBuffer fmt=ByteBuffer.wrap(wave.fmt).order(ByteOrder.LITTLE_ENDIAN);
        int rate=fmt.getInt(4),align=fmt.getShort(12)&65535;
        SilenceScan scan=scanSilence(wave);
        result.put("supported",true).put("duration",wave.duration())
            .put("originalDuration",wave.duration()).put("allSilent",scan.allSilent)
            .put("allNearSilent",scan.allNearSilent);
        List<int[]> cuts=new ArrayList<>();
        int frames=wave.pcm.length/align,removed=0,longest=0;
        boolean clearContext=scan.clearFrames*1000L>=60L*rate;
        for(int[] run:scan.quietRuns) {
            int length=run[1]-run[0],start=run[0],end=run[1];
            if(clearContext) {
                if(start==0&&length*1000L>1000L*rate) {
                    end-=framesForMs(rate,150);
                } else if(end==frames&&length*1000L>1000L*rate) {
                    start+=framesForMs(rate,250);
                } else if(start>0&&end<frames&&length*1000L>3000L*rate) {
                    start+=framesForMs(rate,225);
                    end-=framesForMs(rate,225);
                } else end=start;
            } else end=start;
            if(end>start) {
                cuts.add(new int[]{start,end});
                removed+=end-start;
            }
            // Keep the classified quiet frames in output coordinates, including
            // partial windows retained at cuts (e.g. exactly 450 ms internally).
            longest=Math.max(longest,length-Math.max(0,end-start));
        }
        result.put("longestSilenceMs",longest*1000.0/rate);
        if(cuts.isEmpty())return result; // Preserve every container byte and its ID.
        Wave corrected=new Wave();corrected.fmt=wave.fmt;
        corrected.pcm=new byte[(frames-removed)*align];
        JSONArray ranges=new JSONArray();int from=0,to=0;
        for(int[] cut:cuts) {
            int length=(cut[0]-from)*align;
            System.arraycopy(wave.pcm,from*align,corrected.pcm,to,length);
            to+=length;from=cut[1];
            ranges.put(new JSONObject().put("startMs",cut[0]*1000.0/rate)
                .put("endMs",cut[1]*1000.0/rate));
        }
        System.arraycopy(wave.pcm,from*align,corrected.pcm,to,wave.pcm.length-from*align);
        JSONObject saved=write(encode(corrected),"wav",corrected.duration());
        return result.put("id",saved.getString("id")).put("size",saved.getInt("size"))
            .put("duration",saved.getDouble("duration")).put("format","wav")
            .put("removedMs",removed*1000.0/rate).put("trimRanges",ranges).put("corrected",true);
    }
    private static int framesForMs(int rate,int ms) {
        return (int)((rate*(long)ms+999)/1000); // Never retain less than the requested context.
    }
    JSONObject truncateRepeatedSpeech(String id,JSONObject evidence) throws Exception {
        JSONObject unchanged=new JSONObject().put("applied",false);
        double score=evidence.optDouble("score",Double.NaN);
        if(evidence.optInt("version")!=3||!evidence.optBoolean("cropEligible")||!evidence.optBoolean("suspected")||!Double.isFinite(score)||score<-.00001||score>=.34)return unchanged;
        JSONArray blocks=evidence.optJSONArray("blockScores");
        if(blocks==null||blocks.length()!=4)return unchanged;
        for(int i=0;i<4;i++)if(!Double.isFinite(blocks.getDouble(i))||blocks.getDouble(i)>=.5)return unchanged;
        Wave source=parse(read(get(id),64*1024*1024));
        ByteBuffer fmt=ByteBuffer.wrap(source.fmt).order(ByteOrder.LITTLE_ENDIAN);
        int rate=fmt.getInt(4),align=fmt.getShort(12)&65535;
        double left=evidence.optDouble("leftEndMs",-1),right=evidence.optDouble("rightStartMs",-1);
        if(!Double.isFinite(left)||!Double.isFinite(right)||left<=0||right-left<3000)return unchanged;
        int frames=source.pcm.length/align;
        for(int[] run:scanSilence(source).quietRuns) {
            double start=run[0]*1000.0/rate,end=run[1]*1000.0/rate;
            if(run[0]<=0||run[1]>=frames||end-start<3000||Math.abs(start-left)>120||Math.abs(end-right)>120)continue;
            int cut=run[0]+framesForMs(rate,250);
            if(cut>run[1]-framesForMs(rate,150))continue;
            Wave kept=new Wave();kept.fmt=source.fmt;kept.pcm=Arrays.copyOf(source.pcm,cut*align);
            JSONObject file=write(encode(kept),"wav",kept.duration());
            return file.put("applied",true).put("sourceAudio",id).put("keptEndMs",cut*1000.0/rate)
                .put("removedMs",(frames-cut)*1000.0/rate).put("gapStartMs",start).put("gapEndMs",end);
        }
        return unchanged;
    }
    private static void validateSpeechContainer(byte[] bytes) throws Exception {
        if(bytes.length<44)throw new Exception("WAV 文件被截断");
        ByteBuffer b=ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN);
        if((b.getInt(4)&0xffffffffL)!=bytes.length-8L)throw new Exception("RIFF 长度无效");
        boolean fmt=false,data=false;
        for(int at=12;at<bytes.length;) {
            if(bytes.length-at<8)throw new Exception("WAV 块被截断");
            long size=b.getInt(at+4)&0xffffffffL;
            long next=at+8L+size+(size&1);
            if(next>bytes.length)throw new Exception("WAV 块被截断");
            String tag=new String(bytes,at,4,StandardCharsets.US_ASCII);
            if(tag.equals("fmt ")){if(fmt)throw new Exception("重复 fmt 块");fmt=true;}
            if(tag.equals("data")){if(data)throw new Exception("重复 data 块");data=true;}
            at=(int)next;
        }
    }
    private static class SilenceScan {
        final List<int[]> quietRuns=new ArrayList<>();
        boolean allSilent=true,allNearSilent=true;
        long clearFrames;
    }
    private static SilenceScan scanSilence(Wave wave) {
        ByteBuffer fmt=ByteBuffer.wrap(wave.fmt).order(ByteOrder.LITTLE_ENDIAN);
        int channels=fmt.getShort(2)&65535,bits=fmt.getShort(14)&65535;
        int rate=fmt.getInt(4),align=fmt.getShort(12)&65535,sampleBytes=bits/8;
        int frames=wave.pcm.length/align,runStart=-1;
        double scale=1.0/(1L<<(bits-1)),peakLimit=Math.pow(10,-72.0/20);
        double[] squares=new double[channels];
        SilenceScan scan=new SilenceScan();
        // Rational boundaries avoid drift at rates such as 11025 Hz. The last,
        // partial window also participates in both quality flags and context.
        for(int start=0,window=1;start<frames;window++) {
            int end=(int)Math.min(frames,Math.max(start+1L,window*(long)rate/50));
            Arrays.fill(squares,0);boolean quiet=true,clear=false;
            for(int frame=start;frame<end;frame++)for(int ch=0;ch<channels;ch++) {
                int at=frame*align+ch*sampleBytes;long value;
                if(bits==8)value=(wave.pcm[at]&255)-128;
                else {
                    value=0;
                    for(int k=0;k<sampleBytes;k++)value|=(long)(wave.pcm[at+k]&255)<<(8*k);
                    if((wave.pcm[at+sampleBytes-1]&128)!=0)value-=1L<<bits;
                }
                if(value!=0)scan.allSilent=false;
                double normalized=value*scale;
                squares[ch]+=normalized*normalized;
                if(Math.abs(normalized)>peakLimit)quiet=false;
            }
            for(int ch=0;ch<channels;ch++) {
                double rms=Math.sqrt(squares[ch]/(end-start));
                if(rms>1e-4)quiet=false;
                if(rms>=1e-3)clear=true;
            }
            if(clear)scan.clearFrames+=end-start;
            if(quiet){if(runStart<0)runStart=start;}
            else {
                scan.allNearSilent=false;
                if(runStart>=0){scan.quietRuns.add(new int[]{runStart,start});runStart=-1;}
            }
            start=end;
        }
        if(runStart>=0)scan.quietRuns.add(new int[]{runStart,frames});
        return scan;
    }
    // Wave 回写标准 WAV（含 fmt 扩展段与奇长 data pad）
    static byte[] encode(Wave w) throws Exception{
        int pad=w.fmt.length%2;
        int headLen=28+w.fmt.length+pad;
        byte[] out=new byte[headLen+w.pcm.length+(w.pcm.length%2)];
        ByteBuffer head=ByteBuffer.wrap(out,0,headLen).order(ByteOrder.LITTLE_ENDIAN);
        head.put("RIFF".getBytes(StandardCharsets.US_ASCII)).putInt(out.length-8).put("WAVEfmt ".getBytes(StandardCharsets.US_ASCII)).putInt(w.fmt.length).put(w.fmt);
        if(pad!=0)head.put((byte)0);
        head.put("data".getBytes(StandardCharsets.US_ASCII)).putInt(w.pcm.length);
        System.arraycopy(w.pcm,0,out,headLen,w.pcm.length);
        return out;
    }
    // 生成指定时长的静音 WAV：格式尽量与 ref 一致（合并不断链），无参考时用 24k 单声道 16bit
    JSONObject silence(int ms,String refId) throws Exception{
        if(ms<100||ms>5000)throw new Exception("静音时长越界");
        byte[] fmt=null;
        if(refId!=null&&!refId.isEmpty()){
            try{
                File rf=get(refId);
                Wave rw=parse(read(rf,64*1024*1024));
                fmt=rw.fmt;
            }catch(Exception ignored){}
        }
        if(fmt==null){
            ByteBuffer f=ByteBuffer.allocate(16).order(ByteOrder.LITTLE_ENDIAN);
            f.putShort((short)1).putShort((short)1).putInt(24000).putInt(24000*2).putShort((short)2).putShort((short)16);
            fmt=f.array();
        }
        ByteBuffer fb=ByteBuffer.wrap(fmt).order(ByteOrder.LITTLE_ENDIAN);
        int rate=fb.getInt(4),align=fb.getShort(12)&65535,bits=fb.getShort(14)&65535;
        if(rate<=0||rate>384000||align<=0)throw new Exception("参考音频格式无效");
        int frames=(int)(ms*(long)rate/1000);
        Wave w=new Wave();w.fmt=fmt;w.pcm=new byte[frames*align];
        if(bits==8)Arrays.fill(w.pcm,(byte)128);
        byte[] data=encode(w);
        StringBuilder id=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(data))id.append(String.format(Locale.ROOT,"%02x",b));id.append(".wav");
        File target=new File(dir,id.toString());if(!target.exists()){File temp=new File(dir,id+".tmp");try(FileOutputStream out=new FileOutputStream(temp)){out.write(data);out.getFD().sync();}if(!temp.renameTo(target))throw new IOException("音频保存失败");}
        return new JSONObject().put("id",id.toString()).put("size",data.length).put("duration",w.duration()).put("format","wav").put("silence",true);
    }
    static Wave parse(byte[] bytes) throws Exception {
        if(bytes.length<44||!new String(bytes,0,4,StandardCharsets.US_ASCII).equals("RIFF")||!new String(bytes,8,4,StandardCharsets.US_ASCII).equals("WAVE"))throw new Exception("返回的音频不是有效 WAV");
        Wave w=new Wave();ByteBuffer b=ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN);
        for(int i=12;i+8<=bytes.length;){String tag=new String(bytes,i,4,StandardCharsets.US_ASCII);int len=b.getInt(i+4);if(len<0||(long)i+8+len>bytes.length)throw new Exception("WAV 文件被截断");if(tag.equals("fmt "))w.fmt=Arrays.copyOfRange(bytes,i+8,i+8+len);if(tag.equals("data"))w.pcm=Arrays.copyOfRange(bytes,i+8,i+8+len);i+=8+len+(len%2);}
        if(w.fmt==null||w.fmt.length<16||w.pcm==null||w.pcm.length==0)throw new Exception("仅支持非空 PCM WAV");
        ByteBuffer f=ByteBuffer.wrap(w.fmt).order(ByteOrder.LITTLE_ENDIAN);
        int bits=f.getShort(14)&65535,channels=f.getShort(2)&65535,align=f.getShort(12)&65535,rate=f.getInt(4);
        if(f.getShort()!=1||channels<1||!(bits==8||bits==16||bits==24||bits==32)||align!=channels*bits/8||rate<=0||rate>384000||f.getInt(8)!=(long)rate*align||w.pcm.length%align!=0)throw new Exception("PCM 采样格式无效");return w;
    }
    JSONObject merge(List<String> ids) throws Exception {return merge(ids,null);}
    // Existing quiet samples count toward the requested gap; never trim speech.
    static int quietFrames(Wave wave,boolean leading,int limit) throws Exception {
        ByteBuffer fmt=ByteBuffer.wrap(wave.fmt).order(ByteOrder.LITTLE_ENDIAN);
        int channels=fmt.getShort(2)&65535,bits=fmt.getShort(14)&65535,align=fmt.getShort(12)&65535;
        int sampleBytes=bits/8;
        if(channels<1||!(bits==8||bits==16||bits==24||bits==32)||align!=channels*sampleBytes||wave.pcm.length%align!=0)throw new Exception("不支持的 PCM 采样格式");
        int frames=wave.pcm.length/align,count=0;
        long threshold=0; // Exact digital silence only; quiet speech is preserved.
        for(int j=0;j<Math.min(limit,frames);j++){
            int frame=leading?j:frames-1-j;
            for(int ch=0;ch<channels;ch++){
                int at=frame*align+ch*sampleBytes;long value;
                if(bits==8)value=(wave.pcm[at]&255)-128;
                else {value=0;for(int k=0;k<sampleBytes;k++)value|=(long)(wave.pcm[at+k]&255)<<(8*k);if((wave.pcm[at+sampleBytes-1]&128)!=0)value-=1L<<bits;}
                if(Math.abs(value)>threshold)return count;
            }
            count++;
        }
        return count;
    }
    JSONObject merge(List<String> ids,int[] pauses) throws Exception {
        if(ids.isEmpty())throw new Exception("没有可合并音频");
        if(pauses!=null){if(pauses.length!=ids.size())throw new Exception("停顿参数数量不匹配");for(int p:pauses)if(p<0||p>2000)throw new Exception("停顿参数越界");}
        File temp=File.createTempFile("merge-",".tmp",dir);byte[] fmt=null;long total=0,added=0;int pad=0,previousTail=0;JSONArray parts=new JSONArray();
        try{
            try(RandomAccessFile out=new RandomAccessFile(temp,"rw")){
                for(int i=0;i<ids.size();i++){
                    Wave w=parse(read(get(ids.get(i)),64*1024*1024));
                    if(fmt==null){
                        fmt=w.fmt;pad=fmt.length%2;
                        ByteBuffer head=ByteBuffer.allocate(28+fmt.length+pad).order(ByteOrder.LITTLE_ENDIAN);
                        head.put("RIFF".getBytes(StandardCharsets.US_ASCII)).putInt(0).put("WAVEfmt ".getBytes(StandardCharsets.US_ASCII)).putInt(fmt.length).put(fmt);
                        if(pad!=0)head.put((byte)0);head.put("data".getBytes(StandardCharsets.US_ASCII)).putInt(0);out.write(head.array());
                    }else if(!Arrays.equals(fmt,w.fmt))throw new Exception("章节片段采样格式不一致，请重新生成");
                    ByteBuffer format=ByteBuffer.wrap(fmt).order(ByteOrder.LITTLE_ENDIAN);
                    int rate=format.getInt(4),align=format.getShort(12)&65535;
                    if(rate<=0||rate>384000||align==0||format.getInt(8)!=(long)rate*align)throw new Exception("PCM 采样格式无效");
                    int required=i==0||pauses==null?0:(int)Math.ceil(pauses[i-1]*rate/1000.0);
                    int missing=required==0?0:Math.max(0,required-previousTail-quietFrames(w,true,required));
                    long gapBytes=(long)missing*align;
                    parts.put(new JSONObject().put("audio",ids.get(i)).put("startMs",(total+gapBytes)*1000.0/format.getInt(8)).put("endMs",(total+gapBytes+w.pcm.length)*1000.0/format.getInt(8)));
                    total+=gapBytes+w.pcm.length;
                    if(total>160L*1024*1024)throw new Exception("章节音频过大，请分章制作");
                    if(gapBytes>0){byte[] silence=new byte[(int)gapBytes];if((format.getShort(14)&65535)==8)Arrays.fill(silence,(byte)128);out.write(silence);added+=gapBytes;}
                    out.write(w.pcm);
                    int next=i+1<ids.size()&&pauses!=null?(int)Math.ceil(pauses[i]*rate/1000.0):0;
                    previousTail=next==0?0:quietFrames(w,false,next);
                }
                if(total%2!=0)out.write(0); // RIFF data padding is not part of the PCM duration.
                out.seek(4);out.write(ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putInt((int)(out.length()-8)).array());
                out.seek(24+fmt.length+pad);out.write(ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putInt((int)total).array());out.getFD().sync();
            }
            MessageDigest digest=MessageDigest.getInstance("SHA-256");
            try(InputStream in=new FileInputStream(temp)){byte[] buf=new byte[16384];int n;while((n=in.read(buf))!=-1)digest.update(buf,0,n);}
            StringBuilder name=new StringBuilder();for(byte b:digest.digest())name.append(String.format(Locale.ROOT,"%02x",b));name.append(".wav");
            File target=new File(dir,name.toString());long size=temp.length();if(!target.exists()&&!temp.renameTo(target))throw new IOException("章节音频保存失败");
            int byteRate=ByteBuffer.wrap(fmt).order(ByteOrder.LITTLE_ENDIAN).getInt(8);
            return new JSONObject().put("id",name.toString()).put("size",size).put("duration",total/(double)byteRate).put("addedPauseMs",added*1000.0/byteRate).put("parts",parts).put("format","wav");
        }finally{if(temp.exists())temp.delete();}
    }
    // Reconstruct old chapter boundaries without rewriting audio. Check the actual PCM
    // stream so changed/missing source clips can never produce a plausible but wrong map.
    JSONObject timeline(String id,List<String> ids,int[] pauses) throws Exception {
        if(ids.isEmpty())throw new IOException("没有可定位的片段");
        if(pauses!=null){if(pauses.length!=ids.size())throw new IOException("停顿参数数量不匹配");for(int p:pauses)if(p<0||p>2000)throw new IOException("停顿参数越界");}
        try(RandomAccessFile merged=new RandomAccessFile(get(id),"r")){
            byte[] head=new byte[12];merged.readFully(head);
            if(!new String(head,0,4,StandardCharsets.US_ASCII).equals("RIFF")||!new String(head,8,4,StandardCharsets.US_ASCII).equals("WAVE"))throw new IOException("仅支持 WAV 时间轴");
            byte[] fmt=null;long dataAt=-1,dataLength=0;
            for(long at=12;at+8<=merged.length();){
                merged.seek(at);byte[] chunk=new byte[8];merged.readFully(chunk);
                String tag=new String(chunk,0,4,StandardCharsets.US_ASCII);long length=Integer.toUnsignedLong(ByteBuffer.wrap(chunk).order(ByteOrder.LITTLE_ENDIAN).getInt(4));
                if(at+8+length>merged.length())throw new IOException("WAV 文件被截断");
                if(tag.equals("fmt ")){if(length<16||length>65536)throw new IOException("PCM 格式无效");fmt=new byte[(int)length];merged.readFully(fmt);}
                if(tag.equals("data")){dataAt=at+8;dataLength=length;}
                at+=8+length+(length%2);
            }
            if(fmt==null||dataAt<0)throw new IOException("缺少 PCM 数据");
            int byteRate=ByteBuffer.wrap(fmt).order(ByteOrder.LITTLE_ENDIAN).getInt(8);if(byteRate<=0)throw new IOException("PCM 速率无效");
            merged.seek(dataAt);long total=0;int previousTail=0;JSONArray parts=new JSONArray();byte[] buffer=new byte[16384];
            for(int i=0;i<ids.size();i++){
                Wave w=parse(read(get(ids.get(i)),64*1024*1024));
                if(!Arrays.equals(fmt,w.fmt))throw new IOException("片段与章节采样格式不匹配");
                ByteBuffer format=ByteBuffer.wrap(fmt).order(ByteOrder.LITTLE_ENDIAN);int rate=format.getInt(4),align=format.getShort(12)&65535;
                int required=i==0||pauses==null?0:(int)Math.ceil(pauses[i-1]*rate/1000.0);
                int missing=required==0?0:Math.max(0,required-previousTail-quietFrames(w,true,required));long gapBytes=(long)missing*align;
                if(total+gapBytes+w.pcm.length>dataLength)throw new IOException("片段与章节长度不匹配");
                byte zero=(byte)((format.getShort(14)&65535)==8?128:0);
                for(long remaining=gapBytes;remaining>0;){int n=(int)Math.min(buffer.length,remaining);merged.readFully(buffer,0,n);for(int j=0;j<n;j++)if(buffer[j]!=zero)throw new IOException("章节停顿不匹配");remaining-=n;}
                long start=total+gapBytes;
                for(int at=0;at<w.pcm.length;){int n=Math.min(buffer.length,w.pcm.length-at);merged.readFully(buffer,0,n);for(int j=0;j<n;j++)if(buffer[j]!=w.pcm[at+j])throw new IOException("片段与章节内容不匹配");at+=n;}
                total=start+w.pcm.length;parts.put(new JSONObject().put("audio",ids.get(i)).put("startMs",start*1000.0/byteRate).put("endMs",total*1000.0/byteRate));
                int next=i+1<ids.size()&&pauses!=null?(int)Math.ceil(pauses[i]*rate/1000.0):0;previousTail=next==0?0:quietFrames(w,false,next);
            }
            if(total!=dataLength)throw new IOException("章节仍有未定位音频");
            return new JSONObject().put("id",id).put("duration",total/(double)byteRate).put("parts",parts);
        }
    }
    static byte[] read(File file,int limit) throws Exception {try(InputStream in=new FileInputStream(file)){return read(in,limit);}}
    static byte[] read(InputStream in,int limit) throws Exception {ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] b=new byte[16384];int n;while((n=in.read(b))!=-1){if(out.size()+n>limit)throw new IOException("文件超过允许大小");out.write(b,0,n);}return out.toByteArray();}
}

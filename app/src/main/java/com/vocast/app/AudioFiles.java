package com.vocast.app;
import org.json.JSONObject;
import java.io.*;
import java.nio.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

final class AudioFiles {
    final File dir;
    AudioFiles(File dir){this.dir=dir;dir.mkdirs();}
    File getFileDirect(String id) {
            if(id==null||!id.matches("[a-f0-9]{64}\\.(wav|mp3)"))return null;
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
                    if(f.isFile()&&(f.getName().endsWith(".wav")||f.getName().endsWith(".mp3"))){
                        totalBytes+=f.length();
                        count++;
                    }
                }
            }
            JSONObject filesMap=new JSONObject();
            if(files!=null){
                for(File f:files){
                    if(f.isFile()&&(f.getName().endsWith(".wav")||f.getName().endsWith(".mp3"))){
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
                    if(f.isFile()&&(f.getName().endsWith(".wav")||f.getName().endsWith(".mp3"))){
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
        File get(String id) throws Exception {if(!id.matches("[a-f0-9]{64}\\.(wav|mp3)"))throw new Exception("无效音频引用");File f=new File(dir,id);if(!f.isFile())throw new Exception("参考音频已丢失，请重新导入");return f;}
    JSONObject save(byte[] data,String format) throws Exception {
        if(!format.equals("wav")&&!format.equals("mp3"))throw new Exception("不支持的音频格式");
        double duration=0;
        if(format.equals("wav")){
            Wave w=parse(data);
            // TTS 偶发超长首尾静音入库前先裁掉，单句试听和合并都受益
            trimEdgeSilence(w,1500);
            // 中间大段静音/语音过少判坏音频，抛错走重试
            rejectBadAudio(w);
            duration=w.duration();
            data=encode(w);
        }else if(data.length<3||!((data[0]=='I'&&data[1]=='D'&&data[2]=='3')||((data[0]&255)==255&&(data[1]&224)==224)))throw new Exception("MP3 文件头无效");
        StringBuilder id=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(data))id.append(String.format(Locale.ROOT,"%02x",b));id.append('.').append(format);
        File target=new File(dir,id.toString());if(!target.exists()){File temp=new File(dir,id+".tmp");try(FileOutputStream out=new FileOutputStream(temp)){out.write(data);out.getFD().sync();}if(!temp.renameTo(target))throw new IOException("音频保存失败");}
        return new JSONObject().put("id",id.toString()).put("size",data.length).put("duration",duration).put("format",format);
    }
    static class Wave {byte[] fmt,pcm;double duration(){return pcm.length/(double)ByteBuffer.wrap(fmt).order(ByteOrder.LITTLE_ENDIAN).getInt(8);}}
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
        if(w.fmt==null||w.fmt.length<16||w.pcm==null||w.pcm.length==0||ByteBuffer.wrap(w.fmt).order(ByteOrder.LITTLE_ENDIAN).getShort()!=1||ByteBuffer.wrap(w.fmt).order(ByteOrder.LITTLE_ENDIAN).getInt(8)<=0)throw new Exception("仅支持非空 PCM WAV");return w;
    }
    // 入库质检：中间大段静音（>3秒连续）或语音占比过低（<15%）判坏音频，直接抛错走重试，不让坏音频污染整章
    static void rejectBadAudio(Wave w) throws Exception{
        ByteBuffer fmt=ByteBuffer.wrap(w.fmt).order(ByteOrder.LITTLE_ENDIAN);
        int rate=fmt.getInt(4),channels=fmt.getShort(2)&65535,bits=fmt.getShort(14)&65535,align=fmt.getShort(12)&65535;
        int sampleBytes=bits/8;
        if(rate<=0||channels<1||!(bits==8||bits==16)||align!=channels*sampleBytes||w.pcm.length%align!=0)return;
        int frames=w.pcm.length/align;
        if(frames<rate/2)return; // 太短不检
        long threshold=(long)Math.floor(100.0/32768*(1L<<(bits-1)));
        int voiced=0,maxGap=0,curGap=0;
        for(int f=0;f<frames;f++){
            boolean loud=false;
            for(int ch=0;ch<channels;ch++){
                int at=f*align+ch*sampleBytes;long value;
                if(bits==8)value=(w.pcm[at]&255)-128;
                else{value=(w.pcm[at]&255)|((w.pcm[at+1]&255)<<8);if((w.pcm[at+1]&128)!=0)value-=1L<<16;}
                if(Math.abs(value)>threshold){loud=true;break;}
            }
            if(loud){voiced++;curGap=0;}else{curGap++;if(curGap>maxGap)maxGap=curGap;}
        }
        double voicedRatio=voiced/(double)frames;
        if(maxGap>rate*3)throw new Exception("音频中间静音过长（疑似TTS坏音频），已重试");
        if(voicedRatio<0.15&&frames>rate*2)throw new Exception("音频有效语音过少（疑似TTS坏音频），已重试");
    }
    JSONObject merge(List<String> ids) throws Exception {return merge(ids,null);}
    // Existing quiet samples count toward the requested gap; never trim speech.
    static int quietFrames(Wave wave,boolean leading,int limit) throws Exception {
        ByteBuffer fmt=ByteBuffer.wrap(wave.fmt).order(ByteOrder.LITTLE_ENDIAN);
        int channels=fmt.getShort(2)&65535,bits=fmt.getShort(14)&65535,align=fmt.getShort(12)&65535;
        int sampleBytes=bits/8;
        if(channels<1||!(bits==8||bits==16||bits==24||bits==32)||align!=channels*sampleBytes||wave.pcm.length%align!=0)throw new Exception("不支持的 PCM 采样格式");
        int frames=wave.pcm.length/align,count=0;
        long threshold=(long)Math.floor(100.0/32768*(1L<<(bits-1)));
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
    // TTS 偶发超长首尾静音：每端最多保留 maxEdgeMs，超出裁掉；全静音文件只留中间一段
    static void trimEdgeSilence(Wave w,int maxEdgeMs) throws Exception{
        ByteBuffer fmt=ByteBuffer.wrap(w.fmt).order(ByteOrder.LITTLE_ENDIAN);
        int rate=fmt.getInt(4),align=fmt.getShort(12)&65535;
        if(rate<=0||align<=0||w.pcm.length%align!=0)return;
        int frames=w.pcm.length/align;
        int maxEdge=(int)(maxEdgeMs*(long)rate/1000);
        int lead=quietFrames(w,true,frames);
        int trail=quietFrames(w,false,frames);
        int cutLead=Math.max(0,lead-maxEdge),cutTrail=Math.max(0,trail-maxEdge);
        if(cutLead<=0&&cutTrail<=0)return;
        int keepFrames=frames-cutLead-cutTrail;
        if(keepFrames<1){
            int keep=Math.min(frames,Math.max(1,maxEdge));
            int start=(frames-keep)/2;
            w.pcm=Arrays.copyOfRange(w.pcm,start*align,(start+keep)*align);
            return;
        }
        w.pcm=Arrays.copyOfRange(w.pcm,cutLead*align,(frames-cutTrail)*align);
    }
    JSONObject merge(List<String> ids,int[] pauses) throws Exception {
        if(ids.isEmpty())throw new Exception("没有可合并音频");
        if(pauses!=null){if(pauses.length!=ids.size())throw new Exception("停顿参数数量不匹配");for(int p:pauses)if(p<0||p>2000)throw new Exception("停顿参数越界");}
        File temp=File.createTempFile("merge-",".tmp",dir);byte[] fmt=null;long total=0,added=0;int pad=0,previousTail=0;
        try{
            try(RandomAccessFile out=new RandomAccessFile(temp,"rw")){
                for(int i=0;i<ids.size();i++){
                    Wave w=parse(read(get(ids.get(i)),64*1024*1024));
                    trimEdgeSilence(w,1500);
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
            return new JSONObject().put("id",name.toString()).put("size",size).put("duration",total/(double)byteRate).put("addedPauseMs",added*1000.0/byteRate).put("format","wav");
        }finally{if(temp.exists())temp.delete();}
    }
    static byte[] read(File file,int limit) throws Exception {try(InputStream in=new FileInputStream(file)){return read(in,limit);}}
    static byte[] read(InputStream in,int limit) throws Exception {ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] b=new byte[16384];int n;while((n=in.read(b))!=-1){if(out.size()+n>limit)throw new IOException("文件超过允许大小");out.write(b,0,n);}return out.toByteArray();}
}

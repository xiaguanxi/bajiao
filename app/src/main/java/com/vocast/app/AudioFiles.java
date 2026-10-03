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
    File get(String id) throws Exception {if(!id.matches("[a-f0-9]{64}\\.(wav|mp3)"))throw new Exception("无效音频引用");File f=new File(dir,id);if(!f.isFile())throw new Exception("参考音频已丢失，请重新导入");return f;}
    JSONObject save(byte[] data,String format) throws Exception {
        if(!format.equals("wav")&&!format.equals("mp3"))throw new Exception("不支持的音频格式");
        double duration=0;if(format.equals("wav"))duration=parse(data).duration();else if(data.length<3||!((data[0]=='I'&&data[1]=='D'&&data[2]=='3')||((data[0]&255)==255&&(data[1]&224)==224)))throw new Exception("MP3 文件头无效");
        StringBuilder id=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(data))id.append(String.format(Locale.ROOT,"%02x",b));id.append('.').append(format);
        File target=new File(dir,id.toString());if(!target.exists()){File temp=new File(dir,id+".tmp");try(FileOutputStream out=new FileOutputStream(temp)){out.write(data);out.getFD().sync();}if(!temp.renameTo(target))throw new IOException("音频保存失败");}
        return new JSONObject().put("id",id.toString()).put("size",data.length).put("duration",duration).put("format",format);
    }
    static class Wave {byte[] fmt,pcm;double duration(){return pcm.length/(double)ByteBuffer.wrap(fmt).order(ByteOrder.LITTLE_ENDIAN).getInt(8);}}
    static Wave parse(byte[] bytes) throws Exception {
        if(bytes.length<44||!new String(bytes,0,4,StandardCharsets.US_ASCII).equals("RIFF")||!new String(bytes,8,4,StandardCharsets.US_ASCII).equals("WAVE"))throw new Exception("返回的音频不是有效 WAV");
        Wave w=new Wave();ByteBuffer b=ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN);
        for(int i=12;i+8<=bytes.length;){String tag=new String(bytes,i,4,StandardCharsets.US_ASCII);int len=b.getInt(i+4);if(len<0||(long)i+8+len>bytes.length)throw new Exception("WAV 文件被截断");if(tag.equals("fmt "))w.fmt=Arrays.copyOfRange(bytes,i+8,i+8+len);if(tag.equals("data"))w.pcm=Arrays.copyOfRange(bytes,i+8,i+8+len);i+=8+len+(len%2);}
        if(w.fmt==null||w.fmt.length<16||w.pcm==null||w.pcm.length==0||ByteBuffer.wrap(w.fmt).order(ByteOrder.LITTLE_ENDIAN).getShort()!=1||ByteBuffer.wrap(w.fmt).order(ByteOrder.LITTLE_ENDIAN).getInt(8)<=0)throw new Exception("仅支持非空 PCM WAV");return w;
    }
    JSONObject merge(List<String> ids) throws Exception {
        if(ids.isEmpty())throw new Exception("没有可合并音频");File temp=File.createTempFile("merge-",".tmp",dir);byte[] fmt=null;long total=0;int pad=0;
        try{try(RandomAccessFile out=new RandomAccessFile(temp,"rw")){for(String id:ids){Wave w=parse(read(get(id),64*1024*1024));if(fmt==null){fmt=w.fmt;pad=fmt.length%2;ByteBuffer head=ByteBuffer.allocate(28+fmt.length+pad).order(ByteOrder.LITTLE_ENDIAN);head.put("RIFF".getBytes(StandardCharsets.US_ASCII)).putInt(0).put("WAVEfmt ".getBytes(StandardCharsets.US_ASCII)).putInt(fmt.length).put(fmt);if(pad!=0)head.put((byte)0);head.put("data".getBytes(StandardCharsets.US_ASCII)).putInt(0);out.write(head.array());}else if(!Arrays.equals(fmt,w.fmt))throw new Exception("章节片段采样格式不一致，请重新生成");total+=w.pcm.length;if(total>160L*1024*1024)throw new Exception("章节音频过大，请分章制作");out.write(w.pcm);}out.seek(4);out.write(ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putInt((int)(out.length()-8)).array());out.seek(24+fmt.length+pad);out.write(ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putInt((int)total).array());out.getFD().sync();}
        MessageDigest digest=MessageDigest.getInstance("SHA-256");try(InputStream in=new FileInputStream(temp)){byte[] buf=new byte[16384];int n;while((n=in.read(buf))!=-1)digest.update(buf,0,n);}StringBuilder name=new StringBuilder();for(byte b:digest.digest())name.append(String.format(Locale.ROOT,"%02x",b));name.append(".wav");File target=new File(dir,name.toString());long size=temp.length();if(!target.exists()&&!temp.renameTo(target))throw new IOException("章节音频保存失败");return new JSONObject().put("id",name.toString()).put("size",size).put("duration",total/(double)ByteBuffer.wrap(fmt).order(ByteOrder.LITTLE_ENDIAN).getInt(8)).put("format","wav");
        }finally{if(temp.exists())temp.delete();}
    }
    static byte[] read(File file,int limit) throws Exception {try(InputStream in=new FileInputStream(file)){return read(in,limit);}}
    static byte[] read(InputStream in,int limit) throws Exception {ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] b=new byte[16384];int n;while((n=in.read(b))!=-1){if(out.size()+n>limit)throw new IOException("文件超过允许大小");out.write(b,0,n);}return out.toByteArray();}
}

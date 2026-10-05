package com.vocast.app;
import java.io.*;
import java.nio.*;
import java.nio.file.*;
import java.util.*;
import org.json.*;
public class AudioPacingTest {
 static void check(boolean ok,String message){if(!ok)throw new AssertionError(message);}
 static byte[] wav(int bits,int channels,int lead,int tail){
  int rate=1000,align=channels*bits/8;byte[] pcm=new byte[(lead+100+tail)*align];if(bits==8)Arrays.fill(pcm,(byte)128);
  for(int i=lead;i<lead+100;i++)for(int ch=0;ch<channels;ch++){int pos=i*align+ch*bits/8;long value=1L<<(bits-2);if(bits==8)pcm[pos]=(byte)(128+value);else for(int k=0;k<bits/8;k++)pcm[pos+k]=(byte)(value>>(8*k));}
  ByteBuffer w=ByteBuffer.allocate(44+pcm.length+(pcm.length%2)).order(ByteOrder.LITTLE_ENDIAN);
  w.put("RIFF".getBytes()).putInt(w.capacity()-8).put("WAVEfmt ".getBytes()).putInt(16).putShort((short)1).putShort((short)channels).putInt(rate).putInt(rate*align).putShort((short)align).putShort((short)bits).put("data".getBytes()).putInt(pcm.length).put(pcm);return w.array();
 }
 public static void main(String[] args)throws Exception{
  AudioFiles files=new AudioFiles(new File("artifacts/pacing/native-test"));int checks=0;
  for(int bits:new int[]{8,16,24,32})for(int channels:new int[]{1,2}){
   byte[] a=wav(bits,channels,0,40),b=wav(bits,channels,60,0);String x=files.save(a,"wav").getString("id"),y=files.save(b,"wav").getString("id");
   JSONObject merged=files.merge(Arrays.asList(x,y),new int[]{350,0});AudioFiles.Wave result=AudioFiles.parse(Files.readAllBytes(files.get(merged.getString("id")).toPath()));
   byte[] pa=AudioFiles.parse(a).pcm,pb=AudioFiles.parse(b).pcm;int align=channels*bits/8,gap=250*align;
   check(Math.abs(merged.getDouble("addedPauseMs")-250)<.001,"only missing gap added");
   check(result.pcm.length==pa.length+pb.length+gap,"no final trailing pause");
   check(Arrays.equals(pa,Arrays.copyOfRange(result.pcm,0,pa.length)),"left speech unchanged");
   check(Arrays.equals(pb,Arrays.copyOfRange(result.pcm,pa.length+gap,result.pcm.length)),"right speech unchanged");
   for(int i=pa.length;i<pa.length+gap;i++)check(result.pcm[i]==(byte)(bits==8?128:0),"correct PCM silence");
   String z=files.save(wav(bits,channels,0,350),"wav").getString("id");
   check(files.merge(Arrays.asList(z,y),new int[]{350,0}).getDouble("addedPauseMs")==0,"existing gap preserved");
   check(files.merge(Arrays.asList(x),new int[]{350}).getDouble("addedPauseMs")==0,"no pause after final sentence");checks+=7;
  }
  String x=files.save(wav(16,1,0,0),"wav").getString("id");
  for(int[] bad:new int[][]{new int[]{},new int[]{-1},new int[]{2001}}){try{files.merge(Arrays.asList(x),bad);throw new AssertionError("bad pauses accepted");}catch(Exception expected){checks++;}}
  System.out.println("PASS native pacing: "+checks+" assertions across mono/stereo 8/16/24/32-bit PCM; speech preserved, minimum gaps, no duplicate/final pauses, invalid inputs rejected");
 }
}

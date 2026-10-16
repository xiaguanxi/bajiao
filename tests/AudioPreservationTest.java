package com.vocast.app;
import java.io.*;
import java.nio.*;
import java.nio.file.*;
import java.security.*;
import java.util.*;
import org.json.*;
public class AudioPreservationTest {
 static void check(boolean ok,String msg){if(!ok)throw new AssertionError(msg);}
 public static void main(String[] args)throws Exception{
  AudioFiles files=new AudioFiles(new File("artifacts/voice-quality/native-preservation"));int checks=0;
  for(int bits:new int[]{8,16,24,32})for(int channels:new int[]{1,2}){
   byte[] bytes=AudioPacingTest.wav(bits,channels,2000,4000);int align=channels*bits/8;
   for(int frame=2000;frame<2100;frame++)for(int ch=0;ch<channels;ch++){
    int at=44+frame*align+ch*bits/8;for(int k=0;k<bits/8;k++)bytes[at+k]=(byte)(k==0?(bits==8?129:1):0);
   }
   JSONObject saved=files.save(bytes,"wav");String id=saved.getString("id");
   check(Arrays.equals(bytes,Files.readAllBytes(files.get(id).toPath())),"sample/raw WAV bytes preserved");
   check(Math.abs(saved.getDouble("duration")-6.1)<.001,"quiet audio and long pauses retain full duration");
   byte[] pcm=AudioFiles.parse(bytes).pcm;JSONObject merged=files.merge(Arrays.asList(id,id),new int[]{350,0});
   byte[] joined=AudioFiles.parse(Files.readAllBytes(files.get(merged.getString("id")).toPath())).pcm;
   check(Arrays.equals(pcm,Arrays.copyOfRange(joined,0,pcm.length)),"left quiet speech retained");
   check(Arrays.equals(pcm,Arrays.copyOfRange(joined,pcm.length,joined.length)),"right quiet speech retained");
   check(merged.getDouble("addedPauseMs")==0,"long existing pause preserved");checks+=5;
  }
  byte[] invalid=AudioPacingTest.wav(16,1,0,0);ByteBuffer.wrap(invalid).order(ByteOrder.LITTLE_ENDIAN).putInt(28,0);
  try{files.save(invalid,"wav");throw new AssertionError("invalid format accepted");}catch(Exception expected){checks++;}
  JSONObject raw=files.saveRaw(invalid,"wav");String rawId=raw.getString("id");
  check(!raw.getBoolean("playable")&&rawId.endsWith(".raw"),"invalid returns are diagnostics");checks++;
  check(Arrays.equals(invalid,Files.readAllBytes(files.getRaw(rawId).toPath())),"invalid raw bytes retained");checks++;
  try{files.get(rawId);throw new AssertionError("diagnostic is playable");}catch(Exception expected){checks++;}
  check(files.getStats().getJSONObject("fileSizes").has(rawId),"diagnostic included in storage accounting");checks++;
  files.cleanup(new HashSet<>(Arrays.asList(rawId)));check(files.getRaw(rawId).isFile(),"referenced diagnostics survive collection");checks++;
  check(files.delete(rawId),"diagnostic is explicitly deletable");checks++;
  System.out.println("PASS native preservation: "+checks+" assertions; raw bytes, quiet speech, long pauses and PCM merge preserved");
 }
}

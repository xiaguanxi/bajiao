package com.vocast.app;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import org.json.*;
public class AudioTimelineTest {
 static void check(boolean ok,String message){if(!ok)throw new AssertionError(message);}
 static void rejected(AudioFiles files,String merged,List<String> ids,int[] pauses)throws Exception{
  try{files.timeline(merged,ids,pauses);}catch(Exception expected){return;}throw new AssertionError("mismatched PCM accepted");
 }
 public static void main(String[] args)throws Exception{
  if(args.length==3){
   AudioFiles files=new AudioFiles(new File(args[0]));JSONObject spec=new JSONObject(Files.readString(Path.of(args[1])));List<String> ids=new ArrayList<>();JSONArray a=spec.getJSONArray("ids"),p=spec.getJSONArray("pauses");int[] pauses=new int[p.length()];for(int i=0;i<a.length();i++)ids.add(a.getString(i));for(int i=0;i<p.length();i++)pauses[i]=p.getInt(i);
   JSONObject timeline=files.timeline(spec.getString("id"),ids,pauses);Files.writeString(Path.of(args[2]),timeline.toString(2));System.out.println("PASS actual chapter: "+timeline.getJSONArray("parts").length()+" source clips match merged PCM");return;
  }
  AudioFiles files=new AudioFiles(new File("artifacts/subtitle-timeline/native"));int checks=0;
  for(int bits:new int[]{8,16,24,32})for(int channels:new int[]{1,2}){
   String x=files.save(AudioPacingTest.wav(bits,channels,0,40),"wav").getString("id"),y=files.save(AudioPacingTest.wav(bits,channels,60,0),"wav").getString("id");List<String> ids=Arrays.asList(x,y);int[] pauses={350,0};
   JSONObject merged=files.merge(ids,pauses);String id=merged.getString("id");byte[] before=Files.readAllBytes(files.get(id).toPath());JSONObject timeline=files.timeline(id,ids,pauses);
   check(timeline.getJSONArray("parts").toString().equals(merged.getJSONArray("parts").toString()),"migration and new merge boundaries agree");
   JSONArray parts=timeline.getJSONArray("parts");check(parts.getJSONObject(0).getDouble("startMs")==0,"first starts at zero");check(parts.getJSONObject(0).getDouble("endMs")==140,"source duration unchanged");check(parts.getJSONObject(1).getDouble("startMs")==390,"real 250ms gap included");check(parts.getJSONObject(1).getDouble("endMs")==550,"last end exact");
   rejected(files,id,Arrays.asList(y,x),pauses);rejected(files,id,ids,null);rejected(files,id,Arrays.asList(x),new int[]{0});
   check(Arrays.equals(before,Files.readAllBytes(files.get(id).toPath())),"read-only migration");
   JSONObject legacy=files.merge(ids);check(files.timeline(legacy.getString("id"),ids,null).getJSONArray("parts").getJSONObject(1).getDouble("startMs")==140,"legacy no-gap merge");
   byte[] corrupt=before.clone();corrupt[44]^=1;String bad=files.save(corrupt,"wav").getString("id");rejected(files,bad,ids,pauses);checks+=11;
  }
  System.out.println("PASS native timeline: "+checks+" checks, all PCM widths/channels, gaps, legacy chapters, mismatched/corrupt sources, no audio writes");
 }
}

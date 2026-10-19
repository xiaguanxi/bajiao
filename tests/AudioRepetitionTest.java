package com.vocast.app;
import java.io.*;
import java.nio.*;
import java.nio.file.*;
import java.util.*;
import org.json.*;

public class AudioRepetitionTest {
    static int checks;
    static void check(boolean value,String message){checks++;if(!value)throw new AssertionError(message);}
    static JSONObject evidence(){return new JSONObject().put("version",3).put("suspected",true).put("cropEligible",true).put("score",.2).put("blockScores",new JSONArray(Arrays.asList(.2,.2,.2,.2))).put("leftEndMs",1000).put("rightStartMs",5000);}
    static byte[] wav(int bits,int channels,int rate,boolean quiet) throws Exception {
        int frames=rate*6,align=channels*bits/8;
        AudioFiles.Wave w=new AudioFiles.Wave();w.fmt=ByteBuffer.allocate(16).order(ByteOrder.LITTLE_ENDIAN).putShort((short)1).putShort((short)channels).putInt(rate).putInt(rate*align).putShort((short)align).putShort((short)bits).array();w.pcm=new byte[frames*align];
        for(int f=0;f<frames;f++)for(int c=0;c<channels;c++){
            boolean voice=f<rate||f>=rate*5||!quiet&&c==channels-1;
            long value=voice?Math.round(Math.sin(f*.17)*(1L<<(bits-3))):0;
            int at=f*align+c*bits/8;
            if(bits==8)w.pcm[at]=(byte)(value+128);else for(int k=0;k<bits/8;k++)w.pcm[at+k]=(byte)(value>>(8*k));
        }
        return AudioFiles.encode(w);
    }
    public static void main(String[] args) throws Exception {
        if(args.length>0&&args[0].equals("--truncate")){System.out.print(new AudioFiles(new File(args[1])).truncateRepeatedSpeech(args[2],new JSONObject(args[3])));return;}
        File dir=Files.createTempDirectory("bajiao-repetition-java-").toFile();
        try{
            AudioFiles files=new AudioFiles(dir);
            for(int bits:new int[]{8,16,24,32})for(int channels:new int[]{1,2})for(int rate:new int[]{8000,11025,24000,48000}){
                byte[] original=wav(bits,channels,rate,true);JSONObject raw=files.save(original,"wav"),result=files.truncateRepeatedSpeech(raw.getString("id"),evidence());
                check(result.getBoolean("applied"),"eligible long silent gap");
                check(Arrays.equals(original,Files.readAllBytes(files.get(raw.getString("id")).toPath())),"source immutable");
                AudioFiles.Wave prefix=AudioFiles.parse(Files.readAllBytes(files.get(result.getString("id")).toPath())),source=AudioFiles.parse(original);
                check(Arrays.equals(prefix.pcm,Arrays.copyOf(source.pcm,prefix.pcm.length)),"retained prefix byte exact");
                check(result.getDouble("keptEndMs")>=result.getDouble("gapStartMs")+250,"keep at least 250ms tail");
                check(result.getDouble("keptEndMs")<=result.getDouble("gapEndMs")-150,"cut before second voice");
                for(JSONObject invalid:new JSONObject[]{evidence().put("score",.35),evidence().put("version",2),evidence().put("cropEligible",false),evidence().put("leftEndMs",200),evidence().put("rightStartMs",2000),evidence().put("blockScores",new JSONArray(Arrays.asList(.1,.1,.1,.6)))})check(!files.truncateRepeatedSpeech(raw.getString("id"),invalid).getBoolean("applied"),"reject invalid evidence");
            }
            byte[] otherChannel=wav(16,2,24000,false);JSONObject raw=files.save(otherChannel,"wav");
            check(!files.truncateRepeatedSpeech(raw.getString("id"),evidence()).getBoolean("applied"),"speech in any channel prevents crop");
            System.out.println("PASS "+checks+" native repetition assertions");
        }finally{for(File f:Objects.requireNonNull(dir.listFiles()))Files.delete(f.toPath());Files.delete(dir.toPath());}
    }
}

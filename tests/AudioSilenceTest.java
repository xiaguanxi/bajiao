package com.vocast.app;

import java.io.*;
import java.nio.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;

public class AudioSilenceTest {
    private static int checks;
    private static File testDir;
    private static AudioFiles files;

    private interface Sample { long value(int frame,int channel); }

    private static void check(boolean condition,String message) {
        checks++;
        if(!condition)throw new AssertionError(message);
    }
    private static void close(double actual,double expected,String message) {
        check(Math.abs(actual-expected)<1e-6,message+": "+actual+" != "+expected);
    }
    private static int frame(int rate,int ms) {return (int)(rate*(long)ms/1000);}
    private static int retain(int rate,int ms) {return (int)((rate*(long)ms+999)/1000);}
    private static long level(int bits,double normalized) {
        return Math.round(normalized*(1L<<(bits-1)));
    }
    private static byte[] wav(int bits,int channels,int rate,int ms,Sample sample) throws Exception {
        int frames=frame(rate,ms),align=channels*bits/8;
        ByteBuffer b=ByteBuffer.allocate(44+frames*align+((frames*align)&1)).order(ByteOrder.LITTLE_ENDIAN);
        b.put("RIFF".getBytes(StandardCharsets.US_ASCII)).putInt(b.capacity()-8)
            .put("WAVEfmt ".getBytes(StandardCharsets.US_ASCII)).putInt(16)
            .putShort((short)1).putShort((short)channels).putInt(rate).putInt(rate*align)
            .putShort((short)align).putShort((short)bits)
            .put("data".getBytes(StandardCharsets.US_ASCII)).putInt(frames*align);
        for(int f=0;f<frames;f++)for(int ch=0;ch<channels;ch++) {
            long value=sample.value(f,ch);
            if(bits==8)b.put((byte)(128+value));
            else for(int k=0;k<bits/8;k++)b.put((byte)(value>>(8*k)));
        }
        return b.array();
    }
    private static byte[] segments(int bits,int channels,int rate,int... durations) throws Exception {
        int total=0;for(int ms:durations)total+=ms;
        int[] ends=new int[durations.length];int ms=0;
        for(int i=0;i<ends.length;i++){ms+=durations[i];ends[i]=frame(rate,ms);}
        return wav(bits,channels,rate,total,(f,ch)->{
            int segment=0;while(f>=ends[segment])segment++;
            if(segment%2==0)return 0;
            // Distinct, signed multichannel values expose mixing/re-encoding errors.
            long value=level(bits,.2+ch*.03)+(f%7);
            return (f+ch)%2==0?value:-value;
        });
    }
    private static byte[] sha(byte[] bytes) throws Exception {
        return MessageDigest.getInstance("SHA-256").digest(bytes);
    }
    private static JSONObject process(byte[] original) throws Exception {
        JSONObject saved=files.saveRaw(original,"wav");String originalId=saved.getString("id");
        byte[] originalHash=sha(original);
        JSONObject result=files.processSpeechAudio(originalId);
        byte[] stillRaw=Files.readAllBytes(files.getRaw(originalId).toPath());
        check(Arrays.equals(original,stillRaw),"original archive bytes unchanged");
        check(Arrays.equals(originalHash,sha(stillRaw)),"original archive SHA-256 unchanged");
        check(result.getInt("silenceProcessingVersion")==1,"version 1");
        check(result.getLong("size")==files.getRaw(result.getString("id")).length(),"actual output size");
        if(!result.getBoolean("supported"))return result;
        AudioFiles.Wave source=AudioFiles.parse(original);
        AudioFiles.Wave output=AudioFiles.parse(Files.readAllBytes(files.getRaw(result.getString("id")).toPath()));
        ByteBuffer fmt=ByteBuffer.wrap(source.fmt).order(ByteOrder.LITTLE_ENDIAN);
        int rate=fmt.getInt(4),align=fmt.getShort(12)&65535;
        close(result.getDouble("originalDuration"),source.duration(),"original seconds");
        close(result.getDouble("duration"),output.duration(),"processed seconds");
        check(Arrays.equals(source.fmt,output.fmt),"fmt bytes preserved");
        JSONArray cuts=result.getJSONArray("trimRanges");
        ByteArrayOutputStream expected=new ByteArrayOutputStream();int from=0,removed=0;
        for(int i=0;i<cuts.length();i++) {
            JSONObject cut=cuts.getJSONObject(i);
            double startMs=cut.getDouble("startMs"),endMs=cut.getDouble("endMs");
            int start=(int)Math.round(startMs*rate/1000),end=(int)Math.round(endMs*rate/1000);
            check(start>=from&&end>start&&end<=source.pcm.length/align,"sorted original-coordinate cuts");
            close(startMs,start*1000.0/rate,"start on PCM frame");
            close(endMs,end*1000.0/rate,"end on PCM frame");
            expected.write(source.pcm,from*align,(start-from)*align);
            removed+=end-start;from=end;
        }
        expected.write(source.pcm,from*align,source.pcm.length-from*align);
        check(Arrays.equals(expected.toByteArray(),output.pcm),"all retained PCM is byte-exact");
        close(result.getDouble("removedMs"),removed*1000.0/rate,"removed frame duration");
        close(result.getDouble("duration")+result.getDouble("removedMs")/1000,
            result.getDouble("originalDuration"),"duration accounting");
        check(result.getBoolean("corrected")==(cuts.length()>0),"corrected describes trimming");
        if(cuts.length()==0) {
            check(result.getString("id").equals(originalId),"no-op preserves original ID");
            check(Arrays.equals(original,Files.readAllBytes(files.getRaw(originalId).toPath())),"no-op preserves container");
        } else {
            check(!result.getString("id").equals(originalId),"derivative ID differs");
            check(result.getString("format").equals("wav"),"derivative WAV format");
            byte[] encoded=Files.readAllBytes(files.getRaw(result.getString("id")).toPath());
            check(ByteBuffer.wrap(encoded).order(ByteOrder.LITTLE_ENDIAN).getInt(4)==encoded.length-8,"RIFF length correct");
        }
        return result;
    }
    private static void unchanged(JSONObject result,String message) throws Exception {
        check(!result.getBoolean("corrected"),message);
        check(result.getJSONArray("trimRanges").length()==0,"no ranges for unmodified audio");
        close(result.getDouble("removedMs"),0,"no removal");
    }
    private static void pcmMatrix() throws Exception {
        for(int bits:new int[]{8,16,24,32})for(int channels:new int[]{1,2,4})
            for(int rate:new int[]{1000,11025,24000,48000}) {
                JSONObject result=process(segments(bits,channels,rate,1200,160,3200,160,1400));
                check(result.getBoolean("supported")&&result.getBoolean("corrected"),"PCM matrix supported and trimmed");
                check(!result.getBoolean("allSilent")&&!result.getBoolean("allNearSilent"),"speech quality flags");
                JSONArray ranges=result.getJSONArray("trimRanges");
                check(ranges.length()==3,"leading, internal, trailing cuts");
                int[][] expected={{0,frame(rate,1200)-retain(rate,150)},
                    {frame(rate,1360)+retain(rate,225),frame(rate,4560)-retain(rate,225)},
                    {frame(rate,4720)+retain(rate,250),frame(rate,6120)}};
                for(int i=0;i<3;i++) {
                    close(ranges.getJSONObject(i).getDouble("startMs"),expected[i][0]*1000.0/rate,"expected cut start");
                    close(ranges.getJSONObject(i).getDouble("endMs"),expected[i][1]*1000.0/rate,"expected cut end");
                }
                close(result.getDouble("longestSilenceMs"),2*retain(rate,225)*1000.0/rate,"longest silence AFTER trim");
            }
    }
    private static void qualityAndContext() throws Exception {
        for(int bits:new int[]{8,16,24,32})for(int channels:new int[]{1,2}) {
            JSONObject silent=process(wav(bits,channels,1000,4200,(f,ch)->0));
            unchanged(silent,"all-silent audio preserved");
            check(silent.getBoolean("allSilent")&&silent.getBoolean("allNearSilent"),"digital silence flags");
            close(silent.getDouble("longestSilenceMs"),4200,"all-silent duration");
            JSONObject lsb=process(wav(bits,channels,1000,4200,(f,ch)->(f+ch)%2==0?1:-1));
            unchanged(lsb,"minimum nonzero PCM preserved without context");
            check(!lsb.getBoolean("allSilent"),"nonzero samples never exact silence");
            check(lsb.getBoolean("allNearSilent")==(bits!=8),"normalized LSB quiet classification");
            // Opposite phase must never cancel; also test speech only in the last channel.
            for(boolean lastOnly:new boolean[]{false,true}) {
                JSONObject active=process(wav(bits,channels,1000,3600,(f,ch)-> {
                    if(lastOnly&&ch!=channels-1)return 0;
                    return (f+ch)%2==0?level(bits,.25):-level(bits,.25);
                }));
                unchanged(active,"active channels preserved");
                check(!active.getBoolean("allNearSilent"),"no multichannel cancellation or dilution");
                close(active.getDouble("longestSilenceMs"),0,"active audio has no quiet runs");
            }
        }
        for(double amplitude:new double[]{.00001,.00009,.0003,.0009}) {
            JSONObject quiet=process(wav(32,2,24000,5000,(f,ch)-> {
                if(f<frame(24000,1200)||f>=frame(24000,3600))return 0;
                return level(32,amplitude)*((f+ch)%2==0?1:-1);
            }));
            unchanged(quiet,"ultraquiet speech never establishes clear context");
            check(quiet.getBoolean("allNearSilent")== (amplitude<=.0001),"near-silent RMS/peak classification");
        }
        for(int speechMs:new int[]{20,40,60,80}) {
            byte[] bytes=wav(32,1,1000,1200+speechMs+1400,(f,ch)->
                f>=1200&&f<1200+speechMs?(long)Math.ceil(.001*(1L<<31)):0);
            JSONObject result=process(bytes);
            check(result.getBoolean("corrected")==(speechMs>=60),"requires at least 60ms of -60 dBFS context");
        }
        JSONObject split=process(segments(16,1,1000,1200,20,100,20,100,20,1400));
        check(split.getBoolean("corrected"),"clear context may total 60ms across separate windows");
        // A final partial window must affect both exact-silence and near-silence flags.
        JSONObject partial=process(wav(16,2,1000,101,(f,ch)->f==100&&ch==1?2000:0));
        unchanged(partial,"partial-window speech retained");
        check(!partial.getBoolean("allNearSilent")&&!partial.getBoolean("allSilent"),"partial window included");
        // RMS below -80 dBFS does not suffice when one sample exceeds -72 dBFS peak.
        JSONObject peaks=process(wav(24,1,24000,3600,(f,ch)->f%480==0?level(24,.0003):0));
        unchanged(peaks,"isolated low-energy peaks preserved");
        check(!peaks.getBoolean("allNearSilent"),"peak ceiling enforced separately from RMS");
        JSONObject rms=process(wav(24,1,24000,3600,(f,ch)->level(24,.00011)));
        check(!rms.getBoolean("allNearSilent"),"RMS ceiling enforced below peak ceiling");
        JSONObject below=process(wav(24,1,24000,3600,(f,ch)->level(24,.000099)));
        check(below.getBoolean("allNearSilent"),"RMS immediately below limit is quiet");
        for(long extreme:new long[]{Integer.MIN_VALUE,Integer.MAX_VALUE}) {
            JSONObject extrema=process(wav(32,2,1000,100,(f,ch)->ch==1?extreme:0));
            check(!extrema.getBoolean("allNearSilent"),"32-bit signed extrema decoded without overflow");
        }
    }
    private static void pausesAndFades() throws Exception {
        for(int edge:new int[]{980,1000,1020}) {
            JSONObject result=process(segments(16,1,1000,edge,100,edge));
            check(result.getBoolean("corrected")==(edge>1000),"strict >1s edge threshold");
            close(result.getDouble("longestSilenceMs"),edge>1000?250:edge,"edge silence after processing");
        }
        for(int pause:new int[]{200,450,1000,2000,2980,3000,3020}) {
            JSONObject result=process(segments(16,2,1000,0,100,pause,100,0));
            check(result.getBoolean("corrected")==(pause>3000),"strict >3s internal threshold / normal pauses");
            close(result.getDouble("longestSilenceMs"),pause>3000?450:pause/20*20,"internal silence after processing");
        }
        // Nonzero noise satisfying BOTH limits can be trimmed when clear speech exists.
        JSONObject noise=process(wav(24,2,1000,4200,(f,ch)->
            f>=1200&&f<1400?level(24,.2):((f+ch)%2==0?1:-1)));
        check(noise.getBoolean("corrected"),"near-silent long padding trimmed with speech context");
        check(!noise.getBoolean("allSilent"),"quiet noise is not digital silence");
        byte[] fade=wav(32,2,1000,4160,(f,ch)->{
            if(f>=1200&&f<1360)return level(32,.2);
            if(f>=1360&&f<2560)return level(32,.0006-(f-1360)*.00049/1200);
            if(f>=2560&&f<2660)return level(32,.00005);
            return 0;
        });
        JSONObject faded=process(fade);
        check(faded.getBoolean("corrected"),"long padding around quiet fade corrected");
        JSONArray ranges=faded.getJSONArray("trimRanges");
        for(int i=0;i<ranges.length();i++) {
            JSONObject cut=ranges.getJSONObject(i);
            check(cut.getDouble("endMs")<=1200||cut.getDouble("startMs")>=2660,"quiet and subthreshold fade byte-exact within retained tail");
        }
        JSONObject many=process(segments(16,1,1000,1200,100,3200,100,3400,100,1400));
        check(many.getJSONArray("trimRanges").length()==4,"all long internal runs processed");
        close(many.getDouble("longestSilenceMs"),450,"multiple internal retained pauses");
        // A run beginning outside a window boundary is conservatively underestimated.
        JSONObject conservative=process(segments(16,1,1000,1001,100,1001));
        unchanged(conservative,"no trim without a full window beyond threshold");
    }
    private static byte[] extraChunks(byte[] original,boolean oddFmt) throws Exception {
        AudioFiles.Wave wave=AudioFiles.parse(original);
        byte[] fmt=Arrays.copyOf(wave.fmt,oddFmt?17:18);
        ByteBuffer b=ByteBuffer.allocate(12+12+8+fmt.length+(fmt.length&1)+8+wave.pcm.length+(wave.pcm.length&1))
            .order(ByteOrder.LITTLE_ENDIAN);
        b.put("RIFF".getBytes(StandardCharsets.US_ASCII)).putInt(b.capacity()-8).put("WAVE".getBytes(StandardCharsets.US_ASCII));
        b.put("JUNK".getBytes(StandardCharsets.US_ASCII)).putInt(3).put(new byte[]{7,8,9,0});
        b.put("fmt ".getBytes(StandardCharsets.US_ASCII)).putInt(fmt.length).put(fmt);
        if((fmt.length&1)!=0)b.put((byte)0);
        b.put("data".getBytes(StandardCharsets.US_ASCII)).putInt(wave.pcm.length).put(wave.pcm);
        return b.array();
    }
    private static void containersAndFailures() throws Exception {
        for(boolean oddFmt:new boolean[]{false,true}) {
            process(extraChunks(segments(8,1,1000,0,101,0),oddFmt)); // odd data pad, no-op container
            JSONObject result=process(extraChunks(segments(8,1,1000,1200,101,0),oddFmt));
            check(result.getBoolean("corrected"),"extended fmt and odd data pad encode correctly");
        }
        List<byte[]> invalid=new ArrayList<>();
        invalid.add(new byte[0]);invalid.add(new byte[]{'I','D','3',0});
        byte[] valid=segments(16,1,1000,1200,100,1400);
        for(int length:new int[]{1,12,43,44,valid.length-1})invalid.add(Arrays.copyOf(valid,length));
        int[][] corrupt={{0,0},{8,0},{4,0},{16,-1},{20,3},{22,0},{24,0},{24,384001},
            {28,0},{32,1},{34,20},{40,Integer.MAX_VALUE},{40,-1}};
        for(int[] mutation:corrupt) {
            byte[] bytes=valid.clone();ByteBuffer b=ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN);
            if(mutation[0]==20||mutation[0]==22||mutation[0]==32||mutation[0]==34)b.putShort(mutation[0],(short)mutation[1]);
            else b.putInt(mutation[0],mutation[1]);
            invalid.add(bytes);
        }
        byte[] partialFrame=Arrays.copyOf(valid,valid.length-1);
        ByteBuffer.wrap(partialFrame).order(ByteOrder.LITTLE_ENDIAN).putInt(4,partialFrame.length-8).putInt(40,partialFrame.length-44);
        invalid.add(partialFrame);
        byte[] trailing=Arrays.copyOf(valid,valid.length+3);
        ByteBuffer.wrap(trailing).order(ByteOrder.LITTLE_ENDIAN).putInt(4,trailing.length-8);invalid.add(trailing);
        byte[] duplicate=Arrays.copyOf(valid,valid.length+8);
        ByteBuffer.wrap(duplicate).order(ByteOrder.LITTLE_ENDIAN).putInt(4,duplicate.length-8)
            .position(valid.length).put("data".getBytes(StandardCharsets.US_ASCII)).putInt(0);invalid.add(duplicate);
        for(byte[] bytes:invalid) {
            JSONObject result=process(bytes);
            check(!result.getBoolean("supported"),"invalid/unsupported WAV returns metadata");
            unchanged(result,"invalid result never corrected");
            close(result.getDouble("duration"),0,"invalid duration zero");
            close(result.getDouble("originalDuration"),0,"invalid original duration zero");
            close(result.getDouble("longestSilenceMs"),0,"invalid silence unknown/zero");
            check(!result.getBoolean("allSilent")&&!result.getBoolean("allNearSilent"),"invalid PCM not classified");
        }
        // Existing .raw references may still contain a supported PCM WAV.
        String wavId=files.save(valid,"wav").getString("id");
        String rawId=wavId.substring(0,64)+".raw";
        Files.write(new File(files.dir,rawId).toPath(),valid);
        check(files.processSpeechAudio(rawId).getBoolean("supported"),"reads valid WAV through getRaw");
        String missing=String.join("",Collections.nCopies(64,"0"))+".wav";
        for(String id:new String[]{null,"../escape.wav",missing}) {
            boolean threw=false;try{files.processSpeechAudio(id);}catch(Exception expected){threw=true;}
            check(threw,"invalid/missing references throw I/O/access error");
        }
        String oversized=String.join("",Collections.nCopies(64,"f"))+".raw";
        File huge=new File(files.dir,oversized);
        try {
            try(RandomAccessFile out=new RandomAccessFile(huge,"rw")){out.setLength(64L*1024*1024+1);}
            boolean threw=false;try{files.processSpeechAudio(oversized);}catch(IOException expected){threw=true;}
            check(threw,"64MiB cap is an I/O error");
        } finally {Files.deleteIfExists(huge.toPath());}
    }
    private static void concurrentProcessing() throws Exception {
        AudioFiles concurrent=new AudioFiles(new File(testDir,"concurrent"));
        byte[] bytes=segments(24,2,24000,1240,180,3240,180,1440);
        String id=concurrent.saveRaw(bytes,"wav").getString("id");
        ExecutorService pool=Executors.newFixedThreadPool(8);
        CountDownLatch ready=new CountDownLatch(8),go=new CountDownLatch(1);
        List<Future<JSONObject>> jobs=new ArrayList<>();
        try {
            for(int i=0;i<8;i++)jobs.add(pool.submit(()->{
                ready.countDown();go.await();return concurrent.processSpeechAudio(id);
            }));
            check(ready.await(10,TimeUnit.SECONDS),"all concurrent workers ready");go.countDown();
            String expected=null;
            for(Future<JSONObject> job:jobs) {
                JSONObject result=job.get(30,TimeUnit.SECONDS);
                check(result.getBoolean("corrected"),"concurrent correction succeeds");
                if(expected==null)expected=result.getString("id");
                check(expected.equals(result.getString("id")),"identical concurrent output hash");
                check(concurrent.getRaw(expected).length()==result.getLong("size"),"concurrent output fully published");
            }
            check(Arrays.equals(bytes,Files.readAllBytes(concurrent.getRaw(id).toPath())),"concurrent raw unchanged");
            File[] temporary=concurrent.dir.listFiles((dir,name)->name.endsWith(".tmp"));
            check(temporary!=null&&temporary.length==0,"concurrent temporary files cleaned");
            check(concurrent.dir.listFiles().length==2,"one raw archive and one derivative");
        } finally {go.countDown();pool.shutdownNow();}
    }
    public static void main(String[] args) throws Exception {
        if(args.length==3&&args[0].equals("--process")) {
            System.out.println(new AudioFiles(new File(args[1])).processSpeechAudio(args[2]).toString());
            return;
        }
        if(args.length!=0)throw new IllegalArgumentException("Usage: AudioSilenceTest [--process <audioDir> <id>]");
        File root=new File("artifacts/voice-quality/native-silence");root.mkdirs();
        testDir=Files.createTempDirectory(root.toPath(),"run-").toFile();
        files=new AudioFiles(testDir);
        pcmMatrix();qualityAndContext();pausesAndFades();containersAndFailures();concurrentProcessing();
        System.out.println("PASS native silence: "+checks+" assertions; PCM8/16/24/32, mono/stereo/multichannel, conservative trimming, immutable archives, corrupt WAV and concurrent processing");
    }
}

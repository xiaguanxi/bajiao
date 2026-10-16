package com.vocast.app;
import org.json.*;import java.io.*;import java.nio.file.*;import java.nio.charset.StandardCharsets;
public class SnapshotRecoveryTest {
 static void expect(SnapshotStore store,String code)throws Exception{try{store.loadChapter("a");throw new AssertionError("accepted damaged chapter");}catch(SnapshotStore.StorageException e){if(!e.code.equals(code))throw new AssertionError(e.code+" instead of "+code);}}
 public static void main(String[] args)throws Exception{
  File dir=Files.createTempDirectory("vocast-recovery-").toFile();SnapshotStore store=new SnapshotStore(dir);
  store.save("{\"books\":[{\"chapters\":[{\"id\":\"a\",\"title\":\"A\"},{\"id\":\"b\",\"title\":\"B\"}]}]}","[{\"id\":\"a\",\"text\":\"first\",\"segments\":[]},{\"id\":\"b\",\"text\":\"second\",\"segments\":[],\"audio\":\"retained.wav\"}]");
  JSONObject manifest=new JSONObject(Files.readString(new File(dir,"library.json").toPath()));JSONObject ref=manifest.getJSONArray("books").getJSONObject(0).getJSONArray("chapters").getJSONObject(0);Path file=new File(dir,"chapters/"+ref.getString("storageRef")+".json").toPath();byte[] original=Files.readAllBytes(file);
  Files.delete(file);expect(store,"CHAPTER_FILE_MISSING");
  Files.writeString(file,"{broken",StandardCharsets.UTF_8);expect(store,"CHAPTER_DATA_INVALID");
  Files.writeString(file,"{\"id\":\"a\",\"text\":null,\"segments\":[]}",StandardCharsets.UTF_8);expect(store,"CHAPTER_DATA_INVALID");
  Files.writeString(file,"{\"id\":\"wrong\",\"text\":\"first\",\"segments\":[]}",StandardCharsets.UTF_8);expect(store,"CHAPTER_INDEX_MISMATCH");
  Files.write(file,original);ref.put("storageRef","bad-index");Files.writeString(new File(dir,"library.json").toPath(),manifest.toString());expect(new SnapshotStore(dir),"CHAPTER_INDEX_INVALID");
  if(!store.loadChapter("b").getString("audio").equals("retained.wav"))throw new AssertionError("other chapter changed");
  System.out.println("PASS missing file, malformed JSON, invalid structure, index mismatch, invalid index, unaffected chapter audio");
 }
}

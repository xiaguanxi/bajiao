package com.vocast.app;
import org.json.*;import java.io.*;import java.nio.file.*;
public class SnapshotStoreTest {
 public static void main(String[] args)throws Exception{
 File dir=Files.createTempDirectory("vocast-snapshots-").toFile();SnapshotStore store=new SnapshotStore(dir);
 String header="{\"books\":[{\"id\":\"b\",\"chapters\":[{\"id\":\"a\"},{\"id\":\"b\"}]}]}";
 store.save(header,"[{\"id\":\"a\",\"text\":\"第一章\",\"segments\":[]},{\"id\":\"b\",\"text\":\"第二章\",\"segments\":[]}]");
 store.save(header,"[{\"id\":\"a\",\"text\":\"修改第一章\",\"segments\":[]}]");
 JSONObject lazy=store.loadHeader().getJSONArray("books").getJSONObject(0).getJSONArray("chapters").getJSONObject(0);if(!lazy.getBoolean("unloaded")||lazy.has("text"))throw new AssertionError("Header eagerly loaded text");if(!store.loadChapter("a").getString("text").equals("修改第一章"))throw new AssertionError("Lazy read mismatch");JSONObject reload=new SnapshotStore(dir).load();JSONArray cs=reload.getJSONArray("books").getJSONObject(0).getJSONArray("chapters");
 if(!cs.getJSONObject(0).getString("text").equals("修改第一章")||!cs.getJSONObject(1).getString("text").equals("第二章"))throw new AssertionError("Reload mismatch");
 if(new File(dir,"chapters").list().length!=2)throw new AssertionError("Old snapshot not collected");
 try{store.save("{\"books\":[{\"chapters\":[{\"id\":\"missing\"}]}]}","[]");throw new AssertionError("Missing chapter accepted");}catch(IOException expected){}
 if(new SnapshotStore(dir).load().getJSONArray("books").getJSONObject(0).getJSONArray("chapters").length()!=2)throw new AssertionError("Failed commit lost data");
 System.out.println("PASS atomic snapshot update, unchanged chapter reuse, reload, garbage cleanup, failed commit preservation");
 }
}

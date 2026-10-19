package com.vocast.app;
import org.json.JSONObject;
import java.io.File;
import java.nio.file.Files;

public class PlaybackCheckpointTest {
    public static void main(String[] args) throws Exception {
        File root = new File(args[0]);root.mkdirs();
        PlaybackCheckpoint store = new PlaybackCheckpoint(root);
        if (args[1].equals("write")) {
            store.save(new JSONObject().put("bookId","b").put("chapterId","c").put("audioId","clip.wav")
                    .put("segmentId",17).put("offsetMs",1125).put("position",37125).put("at",123456));
        } else {
            JSONObject saved = store.load();
            if (saved == null || saved.getInt("position") != 37125 || saved.getInt("offsetMs") != 1125 || saved.getInt("segmentId") != 17)
                throw new AssertionError("Progress did not survive process exit");
            store.save(new JSONObject().put("position",91234));
            if (new PlaybackCheckpoint(root).load().getInt("position") != 91234) throw new AssertionError("Replacement failed");
            Files.writeString(new File(root,"playback-progress.json").toPath(),"broken");
            if (new PlaybackCheckpoint(root).load() != null) throw new AssertionError("Corrupt checkpoint accepted");
            System.out.println("PASS native checkpoint survives separate JVM processes, atomic replacement and corrupt fallback");
        }
    }
}

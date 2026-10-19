package com.vocast.app;

import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;

/** A small independent journal: playback must not wait for a WebView/library snapshot. */
final class PlaybackCheckpoint {
    private final File file;
    PlaybackCheckpoint(File root) { file = new File(root, "playback-progress.json"); }

    synchronized void save(JSONObject value) throws Exception {
        File temp = File.createTempFile("playback-", ".tmp", file.getParentFile());
        try {
            try (FileOutputStream out = new FileOutputStream(temp)) {
                out.write(value.toString().getBytes(StandardCharsets.UTF_8));
                out.getFD().sync();
            }
            Files.move(temp.toPath(), file.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } finally { if (temp.exists()) temp.delete(); }
    }

    synchronized JSONObject load() {
        try { return new JSONObject(new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8)); }
        catch (Exception ignored) { return null; }
    }
}

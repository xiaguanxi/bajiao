package com.vocast.app;

/** Monotonic deadline starting at the end of the last spoken sentence. */
final class PlaybackPromptGate {
    String token = "", audioId = "";
    private long dueAt;

    void arm(String token, String audioId, long completedAt) {
        this.token = token;
        this.audioId = audioId;
        dueAt = completedAt + 3000;
    }

    boolean matches(String token) { return !this.token.isEmpty() && this.token.equals(token); }
    long delay(long now) { return Math.max(0, dueAt - now); }
    void cancel() { token = ""; audioId = ""; dueAt = 0; }
}

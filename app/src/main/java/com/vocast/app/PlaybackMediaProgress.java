package com.vocast.app;

/** The system media bar follows the same chapter sentence fraction as the app. */
final class PlaybackMediaProgress {
    int sentenceIndex;
    int sentenceCount;
    long chapterDuration;
    boolean estimated;

    void update(int index, int count, long duration, boolean estimate) {
        sentenceCount = Math.max(0, count);
        sentenceIndex = Math.max(0, Math.min(sentenceCount, index));
        chapterDuration = Math.max(0, duration);
        estimated = estimate;
    }

    boolean isStreaming() { return sentenceCount > 0 && chapterDuration > 0; }

    long position() {
        return isStreaming() ? Math.round(chapterDuration * ((double) sentenceIndex / sentenceCount)) : 0;
    }

    int sentenceAt(long position) {
        if (!isStreaming()) return 0;
        return Math.max(0, Math.min(sentenceCount - 1,
                (int) Math.floor(Math.max(0, Math.min(chapterDuration, position))
                        * ((double) sentenceCount / chapterDuration) + 1e-9)));
    }

    String label() {
        return "已播 " + sentenceIndex + " / " + sentenceCount + " 句" + (estimated ? " · 时长预估" : "");
    }
}

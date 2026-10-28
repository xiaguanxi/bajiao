package com.vocast.app;

public class PlaybackMediaProgressTest {
    private static void equal(long expected, long actual) {
        if (expected != actual) throw new AssertionError(expected + " != " + actual);
    }
    public static void main(String[] args) {
        PlaybackMediaProgress p = new PlaybackMediaProgress();
        if (p.isStreaming()) throw new AssertionError("whole audio must keep its own timeline");
        p.update(24, 100, 1000000, true);
        equal(240000, p.position());
        equal(75, p.sentenceAt(750000));
        if (!p.label().contains("24 / 100") || !p.label().contains("预估")) throw new AssertionError(p.label());
        p.update(25, 100, 1500000, true);
        equal(375000, p.position());
        equal(25, p.sentenceAt(p.position()));
        p.update(25, 100, 1300000, false);
        equal(325000, p.position());
        if (p.label().contains("预估")) throw new AssertionError("merged duration must be exact");
        p.update(-1, 100, 1000000, true); equal(0, p.position());
        p.update(1000, 100, 1000000, true); equal(1000000, p.position());
        equal(99, p.sentenceAt(Long.MAX_VALUE)); equal(0, p.sentenceAt(-1));
        for (int index = 0; index < 317; index++) {
            p.update(index, 317, 1375321, false);
            // Rounded positions must map back to the original sentence, within a millisecond.
            equal(index, p.sentenceAt(p.position() + 1));
        }
        p.update(1, 0, 10000, false);
        if (p.isStreaming()) throw new AssertionError("whole chapter must clear sentence mode");
        p.update(1, 10, 0, true);
        if (p.isStreaming()) throw new AssertionError("unknown duration must not divide by zero");
        System.out.println("PASS native chapter media progress, estimates, seek mapping and whole-audio reset");
    }
}

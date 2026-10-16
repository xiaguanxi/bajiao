package com.vocast.app;

public class PlaybackPromptGateTest {
    static void check(boolean ok, String message) { if (!ok) throw new AssertionError(message); }
    public static void main(String[] args) {
        PlaybackPromptGate gate = new PlaybackPromptGate();
        gate.arm("first", "sentence.wav", 10000);
        check(gate.delay(10000) == 3000, "A cached notice must wait three complete seconds");
        check(gate.delay(12999) == 1, "A notice cannot begin early");
        check(gate.delay(13000) == 0, "The quiet interval ends exactly at three seconds");
        check(gate.delay(15000) == 0, "Late synthesis adds no second three-second delay");
        gate.cancel();
        check(!gate.matches("first"), "Cancel ignores delayed ready messages");
        gate.arm("second", "next.wav", 20000);
        check(!gate.matches("first") && gate.matches("second"), "An old notice cannot replace a new one");
        check(gate.delay(21000) == 2000 && gate.audioId.equals("next.wav"), "A new wait uses its own audio and deadline");
        gate.cancel();
        check(gate.audioId.isEmpty(), "Stopping clears the old chapter identity");
        System.out.println("PASS native prompt quiet interval and cancellation gate");
    }
}

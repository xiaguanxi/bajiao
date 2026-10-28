package com.vocast.app;

/** Reject work queued by an Activity or service after its app session closes. */
final class AppSession {
    private static long generation;
    private static boolean active;

    static synchronized long open() {
        active = true;
        return ++generation;
    }

    static synchronized long current() { return generation; }

    static synchronized boolean isActive(long session) {
        return active && session == generation;
    }

    static synchronized boolean close(long session) {
        if (!isActive(session)) return false;
        active = false;
        return true;
    }

    static synchronized void runIfActive(long session, Runnable work) {
        if (isActive(session)) work.run();
    }
}

package com.vocast.app;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

public class AppSessionTest {
    public static void main(String[] args) throws Exception {
        if (AppSession.isActive(AppSession.current())) throw new AssertionError("closed before Activity creation");
        long first = AppSession.open();
        AtomicInteger posts = new AtomicInteger();
        AppSession.runIfActive(first, posts::incrementAndGet);
        if (posts.get() != 1 || !AppSession.close(first) || AppSession.close(first)) throw new AssertionError("close must be idempotent");
        AppSession.runIfActive(first, posts::incrementAndGet);
        if (posts.get() != 1) throw new AssertionError("late notification escaped close");
        long next = AppSession.open();
        if (AppSession.close(first) || !AppSession.isActive(next)) throw new AssertionError("old Activity closed the new session");
        AppSession.runIfActive(first, posts::incrementAndGet);
        if (posts.get() != 1) throw new AssertionError("stale work escaped after reopening");
        CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1), closed = new CountDownLatch(1);
        Thread post = new Thread(() -> AppSession.runIfActive(next, () -> {
            entered.countDown();
            try { release.await(); } catch (InterruptedException e) { throw new AssertionError(e); }
            posts.incrementAndGet();
        }));
        post.start();
        if (!entered.await(2, TimeUnit.SECONDS)) throw new AssertionError("post did not start");
        Thread close = new Thread(() -> { AppSession.close(next); closed.countDown(); });
        close.start();
        if (closed.await(50, TimeUnit.MILLISECONDS)) throw new AssertionError("close raced past an in-flight post");
        release.countDown();post.join();close.join();
        AppSession.runIfActive(next, posts::incrementAndGet);
        if (posts.get() != 2 || AppSession.isActive(next)) throw new AssertionError("work ran after cancellation boundary");
        System.out.println("PASS app session close, late work rejection, reopening and concurrent notification cancellation");
    }
}

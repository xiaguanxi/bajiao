package com.vocast.app;

import android.app.Activity;
import android.app.Instrumentation;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSession;
import android.os.Bundle;
import android.os.SystemClock;
import android.service.notification.StatusBarNotification;
import java.io.File;
import java.io.FileOutputStream;
import java.lang.reflect.Field;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.concurrent.atomic.AtomicReference;

/** Native integration tests, using framework APIs without external test libraries. */
public class NotificationTestRunner extends Instrumentation {
    private Context context;
    private NotificationManager notifications;
    private int checks;
    private boolean settingsOnly;
    interface Condition { boolean ready() throws Exception; }

    @Override public void onCreate(Bundle arguments) { super.onCreate(arguments);settingsOnly=arguments!=null&&"true".equals(arguments.getString("settings"));start(); }

    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            if(settingsOnly){int count=SettingsIntegration.verify(this);result.putString("stream","PASS native settings credentials, atomic save, rollback and recovery ("+count+" checks)\n");finish(Activity.RESULT_OK,result);return;}
            verifyNotifications();
            result.putString("stream", "PASS native notification progress, media seeking, background retention, task removal, late work and reopen (" + checks + " checks)\n");
            finish(Activity.RESULT_OK, result);
        } catch (Throwable error) {
            result.putString("stream", "FAIL " + android.util.Log.getStackTraceString(error));
            finish(Activity.RESULT_CANCELED, result);
        }
    }

    private void check(boolean value, String message) {
        checks++;
        if (!value) throw new AssertionError(message);
    }

    private void await(Condition condition, String message) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + 10000;
        while (SystemClock.elapsedRealtime() < deadline) {
            if (condition.ready()) { checks++;return; }
            SystemClock.sleep(50);
        }
        throw new AssertionError(message);
    }

    private boolean hasNotification(int id) {
        for (StatusBarNotification n : notifications.getActiveNotifications()) if (n.getId() == id) return true;
        return false;
    }

    private MediaController controller() {
        for (StatusBarNotification n : notifications.getActiveNotifications()) {
            if (n.getId() == 1) {
                MediaSession.Token token = n.getNotification().extras.getParcelable(Notification.EXTRA_MEDIA_SESSION);
                if (token != null) return new MediaController(context, token);
            }
        }
        return null;
    }

    private Intent play(File wave, String id, long session, int index, int count) {
        return new Intent(context, PlaybackService.class).setAction(PlaybackService.ACTION_PLAY)
                .putExtra("appSession", session).putExtra("id", id).putExtra("path", wave.getAbsolutePath())
                .putExtra("title", "第一章 通知回归").putExtra("bookTitle", "本地测试")
                .putExtra("duration", 10000).putExtra("position", 3000).putExtra("startPaused", true)
                .putExtra("segmentId", count > 0 ? index : -1).putExtra("sentenceIndex", index)
                .putExtra("sentenceCount", count).putExtra("chapterDuration", 1000000L)
                .putExtra("durationEstimated", count > 0);
    }

    private File wave() throws Exception {
        int bytes = 24000 * 2 * 10;
        ByteBuffer buffer = ByteBuffer.allocate(44 + bytes).order(ByteOrder.LITTLE_ENDIAN);
        buffer.put(new byte[]{'R','I','F','F'}).putInt(36 + bytes).put(new byte[]{'W','A','V','E','f','m','t',' '});
        buffer.putInt(16).putShort((short)1).putShort((short)1).putInt(24000).putInt(48000).putShort((short)2).putShort((short)16);
        buffer.put(new byte[]{'d','a','t','a'}).putInt(bytes);
        while (buffer.remaining() >= 2) buffer.putShort((short)(Math.sin(buffer.position() * .06) * 1000));
        File file = new File(context.getCacheDir(), "notification-test.wav");
        try (FileOutputStream output = new FileOutputStream(file)) { output.write(buffer.array()); }
        return file;
    }

    private void verifyNotifications() throws Exception {
        context = getTargetContext();notifications = context.getSystemService(NotificationManager.class);
        Intent launch = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        Activity activity = startActivitySync(launch);
        long session = AppSession.current();
        check(AppSession.isActive(session), "Activity did not open its session");
        File wave = wave();
        context.startForegroundService(play(wave, "native-line-24.wav", session, 24, 100));
        await(() -> controller() != null && controller().getMetadata() != null
                && controller().getMetadata().getLong(MediaMetadata.METADATA_KEY_DURATION) == 1000000,
                "media duration used the short sentence file");
        await(() -> PlaybackService.status().optInt("duration") == 10000 && PlaybackService.status().optInt("position") >= 2900,
                "local playback offset was replaced by chapter progress");
        MediaController media = controller();
        check(media.getPlaybackState().getPosition() == 240000, "media progress must be 24 / 100");
        check(media.getPlaybackState().getPlaybackSpeed() == 0, "sentence progress must not extrapolate within a sentence");
        check(media.getMetadata().getString(MediaMetadata.METADATA_KEY_ARTIST).contains("24 / 100"), "missing sentence label");

        Intent update = new Intent(context, PlaybackService.class).setAction("streamprogress")
                .putExtra("appSession", session).putExtra("expectedAudioId", "native-line-24.wav")
                .putExtra("sentenceIndex", 49).putExtra("sentenceCount", 100).putExtra("chapterDuration", 1200000L);
        context.startService(update);
        await(() -> media.getPlaybackState().getPosition() == 588000, "background generation did not update the chapter bar");
        check(PlaybackService.status().getString("id").equals("native-line-24.wav"), "metadata refresh restarted audio");
        context.startService(new Intent(update).putExtra("expectedAudioId", "obsolete.wav").putExtra("sentenceIndex", 0));
        SystemClock.sleep(150);
        check(media.getPlaybackState().getPosition() == 588000, "obsolete metadata reset current progress");
        AtomicReference<String> event = new AtomicReference<>();
        runOnMainSync(() -> PlaybackService.setEventListener((action, value, id) -> event.set(action + ":" + value + ":" + id)));
        media.getTransportControls().seekTo(900000);
        await(() -> "streamseek:75:native-line-24.wav".equals(event.get()), "system seek did not map to chapter sentence 75");
        check(PlaybackService.status().getInt("position") < 4000, "chapter seek was incorrectly applied to the short audio file");

        context.startForegroundService(play(wave, "native-line-75.wav", session, 75, 100));
        await(() -> PlaybackService.status().optString("id").equals("native-line-75.wav")
                && controller().getPlaybackState().getPosition() == 750000, "changing sentences reset the media bar");
        context.startForegroundService(play(wave, "native-whole.wav", session, 0, 0));
        await(() -> controller().getMetadata().getLong(MediaMetadata.METADATA_KEY_DURATION) == 10000,
                "whole chapter retained sentence progress");
        await(() -> PlaybackService.status().optString("id").equals("native-whole.wav")
                && PlaybackService.status().optInt("position") >= 2900,
                "whole chapter was not prepared before seeking");
        media.getTransportControls().seekTo(5000);
        await(() -> PlaybackService.status().optInt("position") >= 4900, "whole chapter seek no longer uses milliseconds");

        context.startForegroundService(new Intent(context, ProductionService.class).setAction(ProductionService.ACTION_UPDATE)
                .putExtra("appSession", session).putExtra("title", "制作测试").putExtra("progress", 2).putExtra("total", 4));
        await(() -> hasNotification(2), "missing production notification");
        notifications.createNotificationChannel(new NotificationChannel("test_notice", "测试提醒", NotificationManager.IMPORTANCE_LOW));
        notifications.notify(123, new Notification.Builder(context, "test_notice")
                .setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("待清理提醒").build());
        runOnMainSync(() -> activity.moveTaskToBack(true));
        SystemClock.sleep(250);
        check(hasNotification(1) && hasNotification(2), "Home unexpectedly cleared active background notifications");
        check(AppSession.isActive(session), "Home closed the session");

        Field active = PlaybackService.class.getDeclaredField("activeService");active.setAccessible(true);
        PlaybackService service = (PlaybackService) active.get(null);
        runOnMainSync(() -> service.onTaskRemoved(new Intent()));
        await(() -> notifications.getActiveNotifications().length == 0, "task removal left notifications behind");
        await(() -> active.get(null) == null, "task removal left the playback service running");
        check(!AppSession.isActive(session), "task removal did not close the session");
        check(PlaybackService.status().getString("id").isEmpty(), "stopped audio metadata survived exit");
        context.startForegroundService(play(wave, "stale-after-exit.wav", session, 20, 100));
        context.startForegroundService(new Intent(context, ProductionService.class).setAction(ProductionService.ACTION_UPDATE).putExtra("appSession", session));
        SystemClock.sleep(500);
        check(notifications.getActiveNotifications().length == 0, "late callbacks recreated notifications after exit");
        runOnMainSync(activity::finish);
        await(() -> activity.isDestroyed(), "old Activity did not finish");

        Activity reopened = startActivitySync(launch);
        long next = AppSession.current();
        check(next != session && AppSession.isActive(next), "reopen did not create a new session");
        context.startForegroundService(play(wave, "reopened.wav", next, 10, 100));
        await(() -> hasNotification(1), "reopened app cannot play");
        context.startService(new Intent(context, PlaybackService.class).setAction(PlaybackService.ACTION_STOP).putExtra("appSession", session));
        SystemClock.sleep(200);
        check(hasNotification(1) && PlaybackService.status().getString("id").equals("reopened.wav"), "old commands stopped the reopened player");
        runOnMainSync(reopened::finish);
        await(() -> notifications.getActiveNotifications().length == 0, "Activity exit left notifications behind");
        wave.delete();
    }
}

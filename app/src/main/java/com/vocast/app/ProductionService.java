package com.vocast.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;

public class ProductionService extends Service {
    public static final String ACTION_UPDATE = "com.vocast.app.action.PRODUCTION_UPDATE";
    public static final String ACTION_STOP = "com.vocast.app.action.PRODUCTION_STOP";
    public static final String CHANNEL_ID = "production_foreground";
    private static final int NOTIFICATION_ID = 2;

    private PowerManager.WakeLock wakeLock;
    private NotificationManager notificationManager;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean productionActive;
    private long appSession;
    private final Runnable renewWakeLock = new Runnable() {
        @Override public void run() {
            if (!productionActive || !AppSession.isActive(appSession)) return;
            acquireWakeLock();
            handler.postDelayed(this, 30 * 60 * 1000L);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        appSession = AppSession.current();
        notificationManager = getSystemService(NotificationManager.class);
        createNotificationChannel();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "有声书后台制作",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("保持 芭蕉 在后台或锁屏时持续制作有声书音频");
            if (notificationManager != null) {
                notificationManager.createNotificationChannel(channel);
            }
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        long requestedSession = intent == null ? appSession : intent.getLongExtra("appSession", appSession);
        if (!AppSession.isActive(requestedSession)) {
            if (!AppSession.isActive(appSession) || !productionActive) {
                AppNotifications.acknowledgeRejectedStart(this, NOTIFICATION_ID, CHANNEL_ID);
                stopForegroundProduction();
            }
            return START_NOT_STICKY;
        }
        appSession = requestedSession;
        if (intent == null) return START_NOT_STICKY;
        String action = intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopForegroundProduction();
            return START_NOT_STICKY;
        }

        if (ACTION_UPDATE.equals(action)) {
            String title = intent.getStringExtra("title");
            if (title == null || title.isEmpty()) title = "芭蕉 正在后台制作";
            String message = intent.getStringExtra("message");
            if (message == null || message.isEmpty()) message = "正在合成有声书章节...";
            int progress = intent.getIntExtra("progress", 0);
            int total = intent.getIntExtra("total", 0);

            acquireWakeLock();
            if (!productionActive) {
                productionActive = true;
                handler.postDelayed(renewWakeLock, 30 * 60 * 1000L);
            }
            Notification notification = buildNotification(title, message, progress, total);
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
                } else {
                    startForeground(NOTIFICATION_ID, notification);
                }
            } catch (Exception e) {
                try {
                    startForeground(NOTIFICATION_ID, notification);
                } catch (Exception ignored) {}
            }
        }

        return START_NOT_STICKY;
    }

    private Notification buildNotification(String title, String message, int progress, int total) {
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        openIntent.putExtra("nav", "tasks_attention");
        PendingIntent pi = PendingIntent.getActivity(
            this,
            0,
            openIntent,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        Notification.Builder builder = new Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle(title)
            .setContentText(message)
            .setOngoing(true)
            .setContentIntent(pi)
            .setOnlyAlertOnce(true);

        if (total > 0) {
            builder.setProgress(total, progress, false);
        }

        return builder.build();
    }

    private synchronized void acquireWakeLock() {
        if (wakeLock == null) {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "bajiao:production_wakelock");
                wakeLock.setReferenceCounted(false);
            }
        }
        if (wakeLock != null) {
            wakeLock.acquire(60 * 60 * 1000L);
        }
    }

    private synchronized void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            try {
                wakeLock.release();
            } catch (Exception ignored) {}
        }
    }

    private void stopForegroundProduction() {
        productionActive = false;
        handler.removeCallbacks(renewWakeLock);
        releaseWakeLock();
        stopForeground(true);
        stopSelf();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        AppNotifications.close(this, appSession);
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        productionActive = false;
        handler.removeCallbacks(renewWakeLock);
        releaseWakeLock();
        stopForeground(true);
        if (notificationManager != null) notificationManager.cancel(NOTIFICATION_ID);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}

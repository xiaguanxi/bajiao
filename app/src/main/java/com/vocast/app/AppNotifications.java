package com.vocast.app;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;

final class AppNotifications {
    static void acknowledgeRejectedStart(Service service, int id, String channel) {
        // A queued startForegroundService still requires promotion before stopping,
        // even when its app session has already closed. The caller removes it immediately.
        service.startForeground(id, new Notification.Builder(service, channel)
                .setSmallIcon(android.R.drawable.ic_media_pause)
                .setContentTitle("芭蕉 正在退出")
                .setOnlyAlertOnce(true).build());
    }

    static void close(Context context, long session) {
        if (!AppSession.close(session)) return;
        PlaybackService.closeAppSession();
        context.stopService(new Intent(context, PlaybackService.class));
        context.stopService(new Intent(context, ProductionService.class));
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null) manager.cancelAll();
    }
}

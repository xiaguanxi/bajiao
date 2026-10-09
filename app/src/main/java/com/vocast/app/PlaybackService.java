package com.vocast.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.MediaPlayer;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import android.text.TextPaint;
import org.json.JSONObject;

import java.io.File;

public class PlaybackService extends Service {
    public static final String ACTION_PLAY = "play";
    public static final String ACTION_PAUSE = "pause";
    public static final String ACTION_RESUME = "resume";
    public static final String ACTION_TOGGLE = "toggle";
    public static final String ACTION_STOP = "stop";
    public static final String ACTION_SEEK = "seek";
    public static final String ACTION_PREV = "prev";
    public static final String ACTION_NEXT = "next";
    public static final String ACTION_REWIND = "rewind";
    public static final String ACTION_FAST_FORWARD = "fast_forward";
    public static final String ACTION_SPEED = "speed";
    public static final String ACTION_SLEEP = "sleep";

    public interface PlaybackEventListener {
        void onPlaybackEvent(String action, long value);
    }

    private static PlaybackEventListener eventListener;
    public static void setEventListener(PlaybackEventListener listener) {
        eventListener = listener;
    }

    private static MediaPlayer player;
    private static volatile boolean prepared = false;
    private boolean playWhenPrepared = true;
    private static MediaSession mediaSession;
    private static String currentAudioId = "";
    private static String chapterTitle = "";
    private static String bookTitle = "";
    private static String artist = "";
    private static String coverPath = "";
    private static Bitmap cachedCoverBitmap = null;
    private static int durationMs = 0;
    private static boolean hasPrevious = false;
    private static boolean hasNext = false;
    private static float playbackSpeed = 1.0f;
    private static String lastError = "";

    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;
    private boolean resumeOnFocusGain = false;
    private boolean noisyReceiverRegistered = false;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable sleepRunnable = this::pausePlayback;

    private final BroadcastReceiver noisyReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction())) {
                pausePlayback();
                notifyClientEvent("pause", 0);
            }
        }
    };

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        initMediaSession();
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
    }

    private void createNotificationChannel() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) {
            NotificationChannel channel = new NotificationChannel(
                    "playback",
                    "听书播放器",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Vocast 锁屏与系统控制中心有声书播放控制");
            channel.setShowBadge(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(channel);
        }
    }

    private void initMediaSession() {
        if (mediaSession != null) return;
        mediaSession = new MediaSession(this, "VocastMediaSession");
        mediaSession.setCallback(new MediaSession.Callback() {
            @Override
            public void onPlay() {
                resumePlayback();
                notifyClientEvent("play", 0);
            }

            @Override
            public void onPause() {
                pausePlayback();
                notifyClientEvent("pause", 0);
            }

            @Override
            public void onSkipToNext() {
                notifyClientEvent("next", 0);
            }

            @Override
            public void onSkipToPrevious() {
                notifyClientEvent("prev", 0);
            }

            @Override
            public void onFastForward() {
                seekRelative(15000);
            }

            @Override
            public void onRewind() {
                seekRelative(-15000);
            }

            @Override
            public void onSeekTo(long pos) {
                seekToPosition((int) pos);
                notifyClientEvent("seek", pos);
            }

            @Override
            public void onStop() {
                stopPlayback();
                notifyClientEvent("stop", 0);
            }
        });
        mediaSession.setActive(true);
    }

    private void notifyClientEvent(String action, long value) {
        handler.post(() -> {
            if (eventListener != null) {
                try {
                    eventListener.onPlaybackEvent(action, value);
                } catch (Exception ignored) {}
            }
        });
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_NOT_STICKY;
        String action = intent.getAction();
        if (action == null) return START_NOT_STICKY;

        try {
            switch (action) {
                case ACTION_PLAY:
                    handlePlayAction(intent);
                    break;
                case ACTION_PAUSE:
                    pausePlayback();
                    notifyClientEvent("pause", 0);
                    break;
                case ACTION_RESUME:
                    resumePlayback();
                    notifyClientEvent("play", 0);
                    break;
                case ACTION_TOGGLE:
                    if (player != null && prepared && player.isPlaying()) {
                        pausePlayback();
                        notifyClientEvent("pause", 0);
                    } else {
                        resumePlayback();
                        notifyClientEvent("play", 0);
                    }
                    break;
                case ACTION_STOP:
                    stopPlayback();
                    notifyClientEvent("stop", 0);
                    stopSelf();
                    break;
                case ACTION_SEEK:
                    int seekPos = (int) intent.getDoubleExtra("value", intent.getIntExtra("pos", 0));
                    seekToPosition(seekPos);
                    notifyClientEvent("seek", seekPos);
                    break;
                case ACTION_PREV:
                    notifyClientEvent("prev", 0);
                    break;
                case ACTION_NEXT:
                    notifyClientEvent("next", 0);
                    break;
                case ACTION_REWIND:
                    seekRelative(-15000);
                    break;
                case ACTION_FAST_FORWARD:
                    seekRelative(15000);
                    break;
                case ACTION_SPEED:
                    float speed = (float) intent.getDoubleExtra("value", 1.0);
                    setSpeed(speed);
                    break;
                case ACTION_SLEEP:
                    double minutes = intent.getDoubleExtra("value", 0);
                    handler.removeCallbacks(sleepRunnable);
                    if (minutes > 0) {
                        handler.postDelayed(sleepRunnable, (long) (minutes * 60000));
                    }
                    break;
            }
        } catch (Exception e) {
            lastError = "播放控制异常: " + e.getMessage();
        }
        return START_NOT_STICKY;
    }

    private void handlePlayAction(Intent intent) {
        String id = intent.getStringExtra("id");
        String path = intent.getStringExtra("path");
        chapterTitle = intent.getStringExtra("title");
        bookTitle = intent.getStringExtra("bookTitle");
        artist = intent.getStringExtra("artist");
        coverPath = intent.getStringExtra("coverPath");
        durationMs = intent.getIntExtra("duration", 0);
        int startPosition = intent.getIntExtra("position", 0);
        if (intent.hasExtra("speed")) { float s = intent.getFloatExtra("speed", 1.0f); if (s > 0) playbackSpeed = Math.max(0.5f, Math.min(s, 3.0f)); }
        hasPrevious = intent.getBooleanExtra("hasPrev", false);
        hasNext = intent.getBooleanExtra("hasNext", false);
        lastError = "";

        if (chapterTitle == null) chapterTitle = "";
        chapterTitle = shortenNotifyTitle(chapterTitle);
        if (bookTitle == null) bookTitle = "Vocast";
        if (artist == null || artist.isEmpty()) artist = "多角色演绎 · Vocast";

        cachedCoverBitmap = generateCoverBitmap(bookTitle, chapterTitle, coverPath);

        if (player != null) {
            player.release();
            player = null;
        }

        prepared = false;
        playWhenPrepared = true;
        currentAudioId = id != null ? id : "";
        player = new MediaPlayer();
        player.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build());

        try {
            player.setDataSource(path);
            player.setOnPreparedListener(mp -> {
                if (mp != player) return;
                prepared = true;
                durationMs = mp.getDuration();
                if (startPosition > 0 && startPosition < durationMs) mp.seekTo(startPosition);
                if (playWhenPrepared && requestAudioFocus()) {
                    mp.start();
                    applyPlaybackSpeed();
                    registerNoisyReceiver();
                    updatePlaybackState();
                    updateMetadata();
                    updateNotification();
                    notifyClientEvent("play", 0);
                }
            });
            player.setOnCompletionListener(mp -> {
                notifyClientEvent("completion", durationMs);
                updatePlaybackState();
                updateNotification();
                notifyClientEvent("next", 0);
            });
            player.setOnErrorListener((mp, what, extra) -> {
                if (mp != player) return true;
                prepared = false;
                player = null;
                mp.release();
                lastError = "音频解码或播放错误(" + what + "," + extra + ")";
                updatePlaybackState();
                updateNotification();
                return true;
            });

            updatePlaybackState();
            updateMetadata();
            updateNotification();
            player.prepareAsync();
        } catch (Exception e) {
            lastError = "音频文件加载失败: " + e.getMessage();
            updatePlaybackState();
            updateNotification();
        }
    }

    private void resumePlayback() {
        playWhenPrepared = true;
        if (player != null && prepared && !player.isPlaying()) {
            if (requestAudioFocus()) {
                player.start();
                applyPlaybackSpeed();
                registerNoisyReceiver();
                updatePlaybackState();
                updateNotification();
            }
        }
    }

    private void pausePlayback() {
        playWhenPrepared = false;
        if (player != null && prepared && player.isPlaying()) {
            player.pause();
        }
        unregisterNoisyReceiver();
        updatePlaybackState();
        updateNotification();
    }

    private void stopPlayback() {
        prepared = false;
        playWhenPrepared = false;
        if (player != null) {
            player.release();
            player = null;
        }
        abandonAudioFocus();
        unregisterNoisyReceiver();
        updatePlaybackState();
        stopForeground(true);
    }

    private void seekToPosition(int posMs) {
        if (player != null && prepared) {
            int target = Math.max(0, Math.min(posMs, player.getDuration() > 0 ? player.getDuration() : posMs));
            boolean wasPlaying = player.isPlaying();
            // SEEK_CLOSEST 在 24kHz 长音频上可能回退到关键帧附近;优先精确 seek,失败再退回普通 seek。
            try {
                player.seekTo(target, android.media.MediaPlayer.SEEK_CLOSEST);
            } catch (Exception ignored) {
                player.seekTo(target);
            }
            // seek 会短暂暂停上报;保持原播放状态,避免点字幕后停住。
            if (wasPlaying) {
                try { player.start(); } catch (Exception ignored) {}
                applyPlaybackSpeed();
            }
            updatePlaybackState();
            updateNotification();
        }
    }

    private void seekRelative(int deltaMs) {
        if (player != null && prepared) {
            int current = player.getCurrentPosition();
            int target = Math.max(0, current + deltaMs);
            seekToPosition(target);
            notifyClientEvent("seek", target);
        }
    }

    private void setSpeed(float speed) {
        playbackSpeed = Math.max(0.5f, Math.min(speed, 3.0f));
        applyPlaybackSpeed();
        updatePlaybackState();
    }

    private void applyPlaybackSpeed() {
        if (player != null && prepared && player.isPlaying()) {
            try {
                player.setPlaybackParams(player.getPlaybackParams().setSpeed(playbackSpeed));
            } catch (Exception ignored) {}
        }
    }

    private void updatePlaybackState() {
        if (mediaSession == null) return;
        boolean isPlaying = player != null && prepared && player.isPlaying();
        int state = isPlaying ? PlaybackState.STATE_PLAYING : (player != null ? (prepared ? PlaybackState.STATE_PAUSED : PlaybackState.STATE_BUFFERING) : PlaybackState.STATE_STOPPED);
        long pos = player != null && prepared ? player.getCurrentPosition() : 0;

        long actions = PlaybackState.ACTION_PLAY
                | PlaybackState.ACTION_PAUSE
                | PlaybackState.ACTION_PLAY_PAUSE
                | PlaybackState.ACTION_STOP
                | PlaybackState.ACTION_SEEK_TO
                | PlaybackState.ACTION_FAST_FORWARD
                | PlaybackState.ACTION_REWIND;

        if (hasPrevious) actions |= PlaybackState.ACTION_SKIP_TO_PREVIOUS;
        if (hasNext) actions |= PlaybackState.ACTION_SKIP_TO_NEXT;

        PlaybackState.Builder stateBuilder = new PlaybackState.Builder()
                .setActions(actions)
                .setState(state, pos, playbackSpeed, SystemClock.elapsedRealtime());

        mediaSession.setPlaybackState(stateBuilder.build());
    }

    private void updateMetadata() {
        if (mediaSession == null) return;
        long duration = durationMs > 0 ? durationMs : (player != null && prepared ? player.getDuration() : 0);

        MediaMetadata.Builder metaBuilder = new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, chapterTitle != null && !chapterTitle.isEmpty() ? chapterTitle : "有声书播放")
                .putString(MediaMetadata.METADATA_KEY_ALBUM, bookTitle != null && !bookTitle.isEmpty() ? bookTitle : "Vocast")
                .putString(MediaMetadata.METADATA_KEY_ARTIST, artist != null && !artist.isEmpty() ? artist : "多角色演绎 · Vocast")
                .putLong(MediaMetadata.METADATA_KEY_DURATION, duration);

        if (cachedCoverBitmap != null) {
            metaBuilder.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, cachedCoverBitmap);
            metaBuilder.putBitmap(MediaMetadata.METADATA_KEY_ART, cachedCoverBitmap);
        }
        mediaSession.setMetadata(metaBuilder.build());
    }

    private void updateNotification() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) return;

        boolean isPlaying = player != null && prepared && player.isPlaying();

        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentPi = PendingIntent.getActivity(
                this, 0, openIntent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        PendingIntent prevPi = createActionPendingIntent(ACTION_PREV);
        PendingIntent rewindPi = createActionPendingIntent(ACTION_REWIND);
        PendingIntent togglePi = createActionPendingIntent(ACTION_TOGGLE);
        PendingIntent ffPi = createActionPendingIntent(ACTION_FAST_FORWARD);
        PendingIntent nextPi = createActionPendingIntent(ACTION_NEXT);

        Notification.MediaStyle mediaStyle = new Notification.MediaStyle();
        if (mediaSession != null) {
            mediaStyle.setMediaSession(mediaSession.getSessionToken());
        }
        // 在紧凑视图（锁屏、状态栏胶囊、折叠卡片）展示上一章、播放/暂停、下一章
        mediaStyle.setShowActionsInCompactView(0, 2, 4);

        Notification.Builder nb = new Notification.Builder(this, "playback")
                .setStyle(mediaStyle)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setLargeIcon(cachedCoverBitmap)
                .setContentTitle(chapterTitle != null && !chapterTitle.isEmpty() ? chapterTitle : "Vocast 听书")
                .setContentText((bookTitle != null && !bookTitle.isEmpty() ? bookTitle : "Vocast") + " · " + artist)
                .setSubText("Vocast 有声书")
                .setContentIntent(contentPi)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setOngoing(isPlaying)
                .setShowWhen(false);

        nb.addAction(new Notification.Action.Builder(
                android.R.drawable.ic_media_previous, "上一章", prevPi).build());
        nb.addAction(new Notification.Action.Builder(
                android.R.drawable.ic_media_rew, "快退15秒", rewindPi).build());
        nb.addAction(new Notification.Action.Builder(
                isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                isPlaying ? "暂停" : "播放", togglePi).build());
        nb.addAction(new Notification.Action.Builder(
                android.R.drawable.ic_media_ff, "快进15秒", ffPi).build());
        nb.addAction(new Notification.Action.Builder(
                android.R.drawable.ic_media_next, "下一章", nextPi).build());

        Notification notification = nb.build();
        if (player != null) {
            startForeground(1, notification);
        } else {
            stopForeground(false);
            nm.notify(1, notification);
        }
    }

    private PendingIntent createActionPendingIntent(String action) {
        Intent intent = new Intent(this, PlaybackService.class);
        intent.setAction(action);
        return PendingIntent.getService(this, action.hashCode(), intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private boolean requestAudioFocus() {
        if (audioManager == null) return true;
        AudioAttributes playbackAttributes = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build();

        if (audioFocusRequest == null) {
            audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                    .setAudioAttributes(playbackAttributes)
                    .setAcceptsDelayedFocusGain(true)
                    .setOnAudioFocusChangeListener(focusChange -> {
                        if (focusChange == AudioManager.AUDIOFOCUS_LOSS) {
                            pausePlayback();
                            notifyClientEvent("pause", 0);
                        } else if (focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT ||
                                   focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK) {
                            if (player != null && prepared && player.isPlaying()) {
                                resumeOnFocusGain = true;
                                pausePlayback();
                                notifyClientEvent("pause", 0);
                            }
                        } else if (focusChange == AudioManager.AUDIOFOCUS_GAIN) {
                            if (resumeOnFocusGain) {
                                resumeOnFocusGain = false;
                                resumePlayback();
                                notifyClientEvent("play", 0);
                            }
                        }
                    })
                    .build();
        }
        return audioManager.requestAudioFocus(audioFocusRequest) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
    }

    private void abandonAudioFocus() {
        if (audioManager != null && audioFocusRequest != null) {
            audioManager.abandonAudioFocusRequest(audioFocusRequest);
        }
    }

    private void registerNoisyReceiver() {
        if (!noisyReceiverRegistered) {
            registerReceiver(noisyReceiver, new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY));
            noisyReceiverRegistered = true;
        }
    }

    private void unregisterNoisyReceiver() {
        if (noisyReceiverRegistered) {
            try {
                unregisterReceiver(noisyReceiver);
            } catch (Exception ignored) {}
            noisyReceiverRegistered = false;
        }
    }

    // 系统通知/胶囊标题空间小：保留章节号前缀（如第83章），名字过长截断加…
    static String shortenNotifyTitle(String title){
        if(title==null)return "";
        String t=title.trim();
        if(t.length()<=11)return t;
        java.util.regex.Matcher m=java.util.regex.Pattern.compile("^(第\\S{1,8}[章节回卷话节]|Chapter\\s*\\d{1,4}|\\d{1,4}[.、\\s])").matcher(t);
        String head=m.find()?m.group(1):"";
        if(head.length()>=10)return head.substring(0,10)+"…";
        String rest=t.substring(head.length()).trim();
        int keep=Math.max(0,9-head.length());
        if(rest.length()>keep)rest=rest.substring(0,keep)+"…";
        return (head+(head.isEmpty()?"":" ")+rest).trim();
    }
    public static Bitmap generateCoverBitmap(String book, String chapter, String path) {
        if (path != null && !path.isEmpty()) {
            File f = new File(path);
            if (f.exists() && f.isFile()) {
                try {
                    Bitmap bmp = BitmapFactory.decodeFile(path);
                    if (bmp != null) return bmp;
                } catch (Exception ignored) {}
            }
        }

        int width = 512;
        int height = 512;
        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);

        // 与书架/详情页 vc-cover 同款：墨绿底 + 米色字 + 圆圈纹 + 左侧书脊线
        canvas.drawColor(0xFF324D43);

        // 左侧书脊线
        Paint spinePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        spinePaint.setColor(0x16FFFFFF);
        canvas.drawRect(0, 0, 26, height, spinePaint);

        // 右下圆圈纹（同 CSS :before 三层同心圆）
        Paint ringPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        ringPaint.setStyle(Paint.Style.STROKE);
        ringPaint.setStrokeWidth(2.0f);
        ringPaint.setColor(0x55E0D9AF);
        float rcx = width + 100, rcy = height + 110;
        canvas.drawCircle(rcx, rcy, 100, ringPaint);
        ringPaint.setColor(0x0CD9DAB5);
        canvas.drawCircle(rcx, rcy, 120, ringPaint);
        canvas.drawCircle(rcx, rcy, 140, ringPaint);
        canvas.drawCircle(rcx, rcy, 160, ringPaint);

        // 顶部小字 VOCAST / AUDIOBOOK
        TextPaint topPaint = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        topPaint.setColor(0xFFF3EFDF);
        topPaint.setTextSize(24);
        topPaint.setTextAlign(Paint.Align.CENTER);
        topPaint.setLetterSpacing(0.2f);
        canvas.drawText("VOCAST / AUDIOBOOK", width / 2.0f, 72, topPaint);

        // 书名竖排（同 CSS：serif 大字 + 字间距，最多取 12 字）
        String displayBook = (book != null && !book.isEmpty()) ? book : "有声小说";
        if (displayBook.length() > 12) displayBook = displayBook.substring(0, 12);
        TextPaint titlePaint = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        titlePaint.setColor(0xFFF3EFDF);
        titlePaint.setTextSize(64);
        titlePaint.setFakeBoldText(true);
        titlePaint.setTextAlign(Paint.Align.CENTER);
        float cx = width / 2.0f;
        float totalH = displayBook.length() * 72.0f;
        float startY = (height - totalH) / 2.0f + 52;
        for (int i = 0; i < displayBook.length(); i++) {
            canvas.drawText(displayBook.substring(i, i + 1), cx, startY + i * 72.0f, titlePaint);
        }

        // 底部小字：让故事有声
        TextPaint bottomPaint = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        bottomPaint.setColor(0xFFF3EFDF);
        bottomPaint.setTextSize(22);
        bottomPaint.setTextAlign(Paint.Align.CENTER);
        bottomPaint.setLetterSpacing(0.2f);
        canvas.drawText("让故事有声", width / 2.0f, height - 48, bottomPaint);

        return bitmap;
    }

    public static JSONObject status() {
        JSONObject j = new JSONObject();
        try {
            boolean isPlaying = player != null && prepared && player.isPlaying();
            j.put("playing", isPlaying);
            j.put("position", player == null || !prepared ? 0 : player.getCurrentPosition());
            j.put("duration", player == null || !prepared ? durationMs : player.getDuration());
            j.put("id", currentAudioId);
            j.put("title", chapterTitle);
            j.put("bookTitle", bookTitle);
            j.put("artist", artist);
            j.put("speed", playbackSpeed);
            j.put("error", lastError);
            j.put("hasPrev", hasPrevious);
            j.put("hasNext", hasNext);
        } catch (Exception ignored) {}
        return j;
    }

    @Override
    public void onDestroy() {
        prepared = false;
        handler.removeCallbacksAndMessages(null);
        unregisterNoisyReceiver();
        abandonAudioFocus();
        if (player != null) {
            player.release();
            player = null;
        }
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
            mediaSession = null;
        }
        super.onDestroy();
    }
}

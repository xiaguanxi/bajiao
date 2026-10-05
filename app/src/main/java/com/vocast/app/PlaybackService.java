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
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;
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
import android.text.Layout;
import android.text.StaticLayout;
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

        // 渐变质感背景（深蓝紫渐变，彰显听书高雅氛围）
        Paint bgPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        bgPaint.setShader(new LinearGradient(
                0, 0, width, height,
                new int[]{0xFF1E1B4B, 0xFF172554, 0xFF0B0F19},
                new float[]{0.0f, 0.5f, 1.0f},
                Shader.TileMode.CLAMP
        ));
        canvas.drawRect(0, 0, width, height, bgPaint);

        // 典雅书卷外框与金色内线
        Paint framePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        framePaint.setStyle(Paint.Style.STROKE);
        framePaint.setStrokeWidth(4.0f);
        framePaint.setColor(0x44D97706);
        RectF frameRect = new RectF(28, 28, width - 28, height - 28);
        canvas.drawRoundRect(frameRect, 24, 24, framePaint);

        // 顶部品牌标志 "VOCAST AUDIO"
        TextPaint topPaint = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        topPaint.setColor(0xFFF59E0B);
        topPaint.setTextSize(26);
        topPaint.setFakeBoldText(true);
        topPaint.setTextAlign(Paint.Align.CENTER);
        topPaint.setLetterSpacing(0.15f);
        canvas.drawText("VOCAST AUDIOBOOK", width / 2.0f, 80, topPaint);

        // 耳机/声音弧线装饰
        Paint arcPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        arcPaint.setStyle(Paint.Style.STROKE);
        arcPaint.setStrokeWidth(3.0f);
        arcPaint.setColor(0x66F59E0B);
        canvas.drawArc(new RectF(width / 2.0f - 36, 105, width / 2.0f + 36, 177), 180, 180, false, arcPaint);

        // 中心书名绘制（自动换行排版）
        TextPaint titlePaint = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        titlePaint.setColor(Color.WHITE);
        titlePaint.setTextSize(44);
        titlePaint.setFakeBoldText(true);
        titlePaint.setTextAlign(Paint.Align.CENTER);

        String displayBook = (book != null && !book.isEmpty()) ? book : "有声小说";
        StaticLayout titleLayout = StaticLayout.Builder.obtain(
                displayBook, 0, displayBook.length(), titlePaint, width - 100
        ).setAlignment(Layout.Alignment.ALIGN_CENTER).setMaxLines(3).build();

        canvas.save();
        float titleY = 210 - (titleLayout.getHeight() / 2.0f);
        canvas.translate(width / 2.0f, Math.max(160, titleY));
        titleLayout.draw(canvas);
        canvas.restore();

        // 章节名
        TextPaint chapterPaint = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        chapterPaint.setColor(0xFF93C5FD);
        chapterPaint.setTextSize(26);
        chapterPaint.setTextAlign(Paint.Align.CENTER);
        String displayChapter = (chapter != null && !chapter.isEmpty()) ? chapter : "精选章节";
        if (displayChapter.length() > 16) {
            displayChapter = displayChapter.substring(0, 15) + "…";
        }
        canvas.drawText(displayChapter, width / 2.0f, 380, chapterPaint);

        // 底部多角色演绎胶囊标签
        Paint pillBg = new Paint(Paint.ANTI_ALIAS_FLAG);
        pillBg.setColor(0x22F59E0B);
        RectF pillRect = new RectF(width / 2.0f - 110, 420, width / 2.0f + 110, 460);
        canvas.drawRoundRect(pillRect, 20, 20, pillBg);

        Paint pillBorder = new Paint(Paint.ANTI_ALIAS_FLAG);
        pillBorder.setStyle(Paint.Style.STROKE);
        pillBorder.setColor(0x66F59E0B);
        pillBorder.setStrokeWidth(1.5f);
        canvas.drawRoundRect(pillRect, 20, 20, pillBorder);

        TextPaint pillText = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        pillText.setColor(0xFFFDE68A);
        pillText.setTextSize(20);
        pillText.setTextAlign(Paint.Align.CENTER);
        canvas.drawText("AI 多角色全景演绎", width / 2.0f, 447, pillText);

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

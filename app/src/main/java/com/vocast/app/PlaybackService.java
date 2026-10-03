package com.vocast.app;
import android.app.*;
import android.content.*;
import android.media.*;
import android.os.*;
import org.json.JSONObject;

public class PlaybackService extends Service {
    private static MediaPlayer player;private static String title="";private static String lastError="";private final Handler handler=new Handler(Looper.getMainLooper());private final Runnable sleep=()->{if(player!=null&&player.isPlaying())player.pause();};
    @Override public IBinder onBind(Intent i){return null;}
    @Override public void onCreate(){super.onCreate();getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel("playback","听书播放",NotificationManager.IMPORTANCE_LOW));}
    private void notifyPlaying(){Intent open=new Intent(this,MainActivity.class);PendingIntent pi=PendingIntent.getActivity(this,0,open,PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);startForeground(1,new Notification.Builder(this,"playback").setSmallIcon(android.R.drawable.ic_media_play).setContentTitle(title).setContentText("Vocast · 点击返回听书").setContentIntent(pi).build());}
    @Override public int onStartCommand(Intent i,int flags,int startId){if(i==null)return START_NOT_STICKY;try{String a=i.getAction();if("play".equals(a)){notifyPlaying();if(player!=null)player.release();player=new MediaPlayer();title=i.getStringExtra("title");lastError="";player.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());player.setDataSource(i.getStringExtra("path"));player.setOnPreparedListener(p->{p.start();notifyPlaying();});player.setOnCompletionListener(p->stopForeground(true));player.setOnErrorListener((p,w,e)->{lastError="音频播放失败";stopForeground(true);return true;});player.prepareAsync();}else if(player!=null){switch(a){case "pause":player.pause();stopForeground(true);break;case "resume":notifyPlaying();player.start();break;case "stop":player.release();player=null;stopForeground(true);stopSelf();break;case "seek":player.seekTo(Math.max(0,(int)i.getDoubleExtra("value",0)));break;case "speed":player.setPlaybackParams(player.getPlaybackParams().setSpeed((float)i.getDoubleExtra("value",1)));break;case "sleep":handler.removeCallbacks(sleep);double minutes=i.getDoubleExtra("value",0);if(minutes>0)handler.postDelayed(sleep,(long)(minutes*60000));break;}}}catch(Exception e){lastError="播放操作失败";stopForeground(true);}return START_NOT_STICKY;}
    static JSONObject status(){JSONObject j=new JSONObject();try{j.put("playing",player!=null&&player.isPlaying()).put("position",player==null?0:player.getCurrentPosition()).put("duration",player==null?0:player.getDuration()).put("title",title).put("error",lastError);}catch(Exception ignored){}return j;}
    @Override public void onDestroy(){handler.removeCallbacksAndMessages(null);if(player!=null){player.release();player=null;}super.onDestroy();}
}

package com.vocast.app;
import android.app.*;
import android.os.*;
import android.content.*;
import android.database.Cursor;
import android.net.Uri;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.provider.OpenableColumns;
import android.util.*;
import android.util.Base64;
import android.webkit.*;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

public class MainActivity extends Activity {
    private WebView web;
    private long appSession;
    private final ExecutorService executor=Executors.newFixedThreadPool(3);
    private final ExecutorService networkExecutor=Executors.newFixedThreadPool(5);
    private SecretStore vault;private AudioFiles audio;private AtomicFile store;private SnapshotStore snapshots;
    private String pendingId,pickKind,exportFile,pendingNav;
    private ConnectivityManager connectivity;
    private ConnectivityManager.NetworkCallback networkCallback;
    private final Handler networkHandler=new Handler(Looper.getMainLooper());
    private final Runnable refreshNetwork=this::publishNetworkState;
    private String productionNetworkState(){
        try {
            ConnectivityManager cm=getSystemService(ConnectivityManager.class);
            NetworkCapabilities caps=cm.getNetworkCapabilities(cm.getActiveNetwork());
            if(caps==null||!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET))return "offline";
            return caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)?"wifi":"other";
        } catch(Exception ignored){return "unknown";}
    }
    private void publishNetworkState(){runOnUiThread(()->{if(web!=null)web.evaluateJavascript("window.onNativeNetworkChange&&window.onNativeNetworkChange("+JSONObject.quote(productionNetworkState())+")",null);});}
    private void networkChanged(){
        publishNetworkState();
        // The default network can still refer to the lost connection inside onLost.
        networkHandler.removeCallbacks(refreshNetwork);
        networkHandler.postDelayed(refreshNetwork,250);
        networkHandler.postDelayed(refreshNetwork,1000);
    }
    private final Map<String,byte[]> importBytes=new ConcurrentHashMap<>();
    private void startSessionService(Intent intent,boolean foreground){AppSession.runIfActive(appSession,()->{if(foreground)startForegroundService(intent);else startService(intent);});}
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);String nav=intent!=null?intent.getStringExtra("nav"):null;if(nav!=null){pendingNav=nav;forwardNav(nav);}}
    private void forwardNav(String nav){if(web==null||nav==null)return;final String js="window.__applyInitialNav&&window.__applyInitialNav('"+nav.replace("'","")+"')";web.post(()->{if(web!=null)web.evaluateJavascript(js,null);});}
    @Override public void onCreate(Bundle state){super.onCreate(state);appSession=AppSession.open();vault=new SecretStore(this);audio=new AudioFiles(new File(getFilesDir(),"audio"));store=new AtomicFile(new File(getFilesDir(),"state.json"));snapshots=new SnapshotStore(getFilesDir());
        if((getApplicationInfo().flags&android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)!=0){try{File f=new File(getFilesDir(),"credentials-import.json");if(f.isFile()){vault.save(new JSONObject(new String(AudioFiles.read(f,100000),StandardCharsets.UTF_8)));if(!f.delete())throw new IOException("Credential import cleanup failed");}}catch(Exception e){android.widget.Toast.makeText(this,"测试配置导入失败",android.widget.Toast.LENGTH_SHORT).show();}}
        web=new WebView(this);setContentView(web);web.setBackgroundColor(0xfff8f7f2);WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(false);settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setMediaPlaybackRequiresUserGesture(true);settings.setUseWideViewPort(true);settings.setLoadWithOverviewMode(true);settings.setTextZoom(100);
        if((getApplicationInfo().flags&android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)!=0)WebView.setWebContentsDebuggingEnabled(true);
        web.setWebViewClient(new WebViewClient(){@Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return true;}@Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){Uri uri=r.getUrl();if(!"app.bajiao.local".equals(uri.getHost()))return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));String path=uri.getPath();if(path==null||path.contains(".."))return null;path=path.equals("/")?"index.html":path.substring(1);try{String mime=path.endsWith(".js")?"application/javascript":path.endsWith(".css")?"text/css":"text/html";return new WebResourceResponse(mime,"UTF-8",getAssets().open(path));}catch(IOException e){return new WebResourceResponse("text/plain","UTF-8",404,"Not found",null,new ByteArrayInputStream(new byte[0]));}}});
        web.addJavascriptInterface(new Bridge(),"Native");web.loadUrl("https://app.bajiao.local/index.html");
        connectivity=getSystemService(ConnectivityManager.class);
        networkCallback=new ConnectivityManager.NetworkCallback(){
            @Override public void onAvailable(Network network){networkChanged();}
            @Override public void onLost(Network network){networkChanged();}
            @Override public void onCapabilitiesChanged(Network network,NetworkCapabilities caps){networkChanged();}
        };
        connectivity.registerDefaultNetworkCallback(networkCallback);
        PlaybackService.setEventListener((act, val, audioId) -> {
            if (web != null) {
                web.post(() -> {
                    if (web != null) {
                        web.evaluateJavascript("window.onNativePlaybackAction&&window.onNativePlaybackAction('" + act + "'," + val + "," + JSONObject.quote(audioId) + ")", null);
                    }
                });
            }
        });
        if(Build.VERSION.SDK_INT>=33&&checkSelfPermission("android.permission.POST_NOTIFICATIONS")!=android.content.pm.PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"},80);
    }
    class Bridge {
        @JavascriptInterface public void call(String id,String action,String json){
            if(!id.matches("[a-zA-Z0-9_-]{1,60}"))return;
            (("request".equals(action)||"testModelConfiguration".equals(action))?networkExecutor:executor).execute(()->{if(!AppSession.isActive(appSession))return;try{JSONObject p=new JSONObject(json);Object result;
                switch(action){
                    case "networkState":result=productionNetworkState();break;
                    case "load":{JSONObject state=snapshots.loadHeader();try{if(state==null)state=new JSONObject(new String(store.readFully(),StandardCharsets.UTF_8));}catch(FileNotFoundException ignored){}recoverModelSave(state);JSONObject keys=vault.read();String nav0=getIntent()!=null?getIntent().getStringExtra("nav"):null;if(nav0==null)nav0=pendingNav;pendingNav=null;result=new JSONObject().put("state",state==null?JSONObject.NULL:state).put("playbackCheckpoint",new PlaybackCheckpoint(getFilesDir()).load()).put("llmConfigured",!keys.optString("llmKey").isEmpty()).put("ttsConfigured",!keys.optString("ttsKey").isEmpty()).put("version",getPackageManager().getPackageInfo(getPackageName(),0).versionName).put("versionCode",getPackageManager().getPackageInfo(getPackageName(),0).versionCode).put("initialNav",nav0==null?JSONObject.NULL:nav0);break;}
                    case "decodeBook":{byte[] bytes=importBytes.get(p.getString("token"));if(bytes==null)throw new IOException("导入草稿已过期，请重新选择文件");String encoding=p.optString("encoding",BookImporter.encoding(bytes));if(!Arrays.asList("UTF-8","GB18030","UTF-16").contains(encoding))throw new IOException("请选择 UTF-8、GB18030 或 UTF-16");result=decodedBook(bytes,encoding);break;}
                    case "loadChapter":result=snapshots.loadChapter(p.getString("id"));break;
                    case "saveSnapshot":snapshots.save(p.getString("header"),p.getString("chapters"));result=true;break;
                    case "saveState":saveState(p.getString("text"));result=true;break;
                    case "saveCredentials":vault.save(p);result=true;break;
                    case "request":result=request(p);break;
                    case "testModelConfiguration":result=testModelConfiguration(p);break;
                    case "saveModelConfiguration":result=saveModelConfiguration(p);break;
                    case "saveRawAudio":result=audio.saveRaw(Base64.decode(p.getString("base64"),Base64.DEFAULT),p.getString("format"));break;
                    case "processSpeechAudio":result=audio.processSpeechAudio(p.getString("id"));break;
                    case "truncateRepeatedSpeech":result=audio.truncateRepeatedSpeech(p.getString("id"),p.getJSONObject("evidence"));break;
                    case "saveAudio":result=audio.save(Base64.decode(p.getString("base64"),Base64.DEFAULT),p.getString("format"));break;
                    case "readAudio":result=new JSONObject().put("base64",Base64.encodeToString(AudioFiles.read(audio.getRaw(p.getString("id")),8*1024*1024),Base64.NO_WRAP));break;
                    case "mergeAudio":{List<String> ids=new ArrayList<>();JSONArray a=p.getJSONArray("ids");for(int i=0;i<a.length();i++)ids.add(a.getString(i));JSONArray pauses=p.optJSONArray("pauses");int[] gaps=null;if(pauses!=null&&pauses.length()>0){gaps=new int[pauses.length()];for(int i=0;i<gaps.length;i++)gaps[i]=pauses.getInt(i);}result=audio.merge(ids,gaps);break;}
                    case "audioTimeline":{List<String> ids=new ArrayList<>();JSONArray a=p.getJSONArray("ids");for(int i=0;i<a.length();i++)ids.add(a.getString(i));JSONArray pauses=p.optJSONArray("pauses");int[] gaps=null;if(pauses!=null&&pauses.length()>0){gaps=new int[pauses.length()];for(int i=0;i<gaps.length;i++)gaps[i]=pauses.getInt(i);}result=audio.timeline(p.getString("id"),ids,gaps);break;}
                    case "silence":result=audio.silence(p.optInt("ms",500),p.optString("ref",""));break;
                    case "pick":runOnUiThread(()->pick(id,p.optString("kind")));return;
                    case "export":{audio.get(p.getString("id"));runOnUiThread(()->export(id,p));return;}
                    case "play":{String audioId=p.getString("id");String path=audio.get(audioId).getAbsolutePath();Intent i=new Intent(MainActivity.this,PlaybackService.class).putExtra("appSession",appSession).setAction(PlaybackService.ACTION_PLAY).putExtra("id",audioId).putExtra("path",path).putExtra("title",p.optString("title","芭蕉")).putExtra("bookTitle",p.optString("bookTitle","芭蕉")).putExtra("artist",p.optString("artist","多角色演绎 · 芭蕉")).putExtra("duration",p.optInt("duration",0)).putExtra("position",p.optInt("position",0)).putExtra("startPaused",p.optBoolean("startPaused",false)).putExtra("previousAudio",p.optString("previousAudio","")) .putExtra("gapMs",p.optString("previousAudio","").isEmpty()?0:audio.gapBefore(p.optString("previousAudio"),audioId,p.optInt("pauseMs",0))).putExtra("bookId",p.optString("bookId","")).putExtra("chapterId",p.optString("chapterId","")).putExtra("segmentId",p.optInt("segmentId",-1)).putExtra("positionBase",p.optInt("positionBase",0)).putExtra("sentenceIndex",p.optInt("sentenceIndex",0)).putExtra("sentenceCount",p.optInt("sentenceCount",0)).putExtra("chapterDuration",p.optLong("chapterDuration",0)).putExtra("durationEstimated",p.optBoolean("durationEstimated",false)).putExtra("speed",(float)p.optDouble("speed",1.0)).putExtra("hasPrev",p.optBoolean("hasPrev",false)).putExtra("hasNext",p.optBoolean("hasNext",false)).putExtra("coverPath",p.optString("coverPath",""));startSessionService(i,true);result=true;break;}
                    case "audioDurations":{java.util.List<String> ids=new java.util.ArrayList<>();org.json.JSONArray a=p.getJSONArray("ids");for(int i=0;i<a.length();i++)ids.add(a.getString(i));result=audio.durations(ids);break;}
                    case "deleteAudio":{List<String> toDelete=new ArrayList<>();if(p.has("ids")){JSONArray a=p.getJSONArray("ids");for(int i=0;i<a.length();i++)toDelete.add(a.getString(i));}else if(p.has("id")){toDelete.add(p.getString("id"));}int count=0;long freed=0;for(String aid:toDelete){long sz=audio.deleteAndGetSize(aid);if(sz>0){count++;freed+=sz;}}JSONObject delRes=new JSONObject();delRes.put("count",count);delRes.put("freedBytes",freed);delRes.put("freedMb",Math.round(freed/1024.0/1024.0*10.0)/10.0);result=delRes;break;}
                    case "audioStats":{result=audio.getStats();break;}
                    case "cleanupAudio":{Set<String> keepSet=new HashSet<>();if(p.has("keepIds")){JSONArray a=p.getJSONArray("keepIds");for(int i=0;i<a.length();i++)keepSet.add(a.getString(i));}result=audio.cleanup(keepSet);break;}
                    case "playback":{String op=p.optString("op");if(!Arrays.asList("pause","resume","toggle","stop","seek","speed","sleep","prev","next","rewind","fast_forward","wait","streamprogress").contains(op))throw new Exception("无效播放操作");Intent i=new Intent(MainActivity.this,PlaybackService.class).putExtra("appSession",appSession).setAction(op).putExtra("value",p.optDouble("value")).putExtra("expectedAudioId",p.optString("expectedAudioId")).putExtra("sentenceIndex",p.optInt("sentenceIndex",0)).putExtra("sentenceCount",p.optInt("sentenceCount",0)).putExtra("chapterDuration",p.optLong("chapterDuration",0)).putExtra("durationEstimated",p.optBoolean("durationEstimated",false));startSessionService(i,false);result=true;break;}
                    case "playbackPrompt":{Intent i=new Intent(MainActivity.this,PlaybackService.class).putExtra("appSession",appSession).setAction(PlaybackService.ACTION_PROMPT).putExtra("op",p.optString("op")).putExtra("token",p.optString("token")).putExtra("expectedAudioId",p.optString("expectedAudioId"));if(p.optString("op").equals("ready"))i.putExtra("path",audio.get(p.getString("id")).getAbsolutePath());startSessionService(i,false);result=true;break;}
                    case "playbackState":result=PlaybackService.status();break;
                    case "productionStatus":{
                        boolean active=p.optBoolean("active",false);
                        Intent i=new Intent(MainActivity.this,ProductionService.class).putExtra("appSession",appSession);
                        if(active){
                            i.setAction(ProductionService.ACTION_UPDATE)
                             .putExtra("title",p.optString("title","芭蕉 正在后台制作"))
                             .putExtra("message",p.optString("message","正在合成有声书章节..."))
                             .putExtra("progress",p.optInt("progress",0))
                             .putExtra("total",p.optInt("total",0));
                            if(Build.VERSION.SDK_INT>=Build.VERSION_CODES.O){
                                startSessionService(i,true);
                            }else{
                                startSessionService(i,false);
                            }
                        }else{
                            i.setAction(ProductionService.ACTION_STOP);
                            startSessionService(i,false);
                        }
                        result=true;
                        break;
                    }
                    case "notify":{
                        NotificationManager nm=getSystemService(NotificationManager.class);
                        String chId=p.optString("channel","notice");
                        String chName="production".equals(chId)?"制作待处理":"系统提示与提醒";
                        int importance="production".equals(chId)?NotificationManager.IMPORTANCE_HIGH:NotificationManager.IMPORTANCE_DEFAULT;
                        NotificationChannel channel=new NotificationChannel(chId,chName,importance);
                        channel.setDescription("芭蕉 消息与系统通知");
                        nm.createNotificationChannel(channel);
                        PendingIntent pi=PendingIntent.getActivity(MainActivity.this,1,new Intent(MainActivity.this,MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP).putExtra("nav","tasks_attention"),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
                        String title=p.optString("title","芭蕉 提示");
                        String msg=p.optString("message","");
                        int notifId=p.optInt("id",(int)(System.currentTimeMillis()%100000));
                        int icon="error".equals(p.optString("type"))||"production".equals(chId)?android.R.drawable.stat_notify_error:android.R.drawable.ic_dialog_info;
                        Notification notif=new Notification.Builder(MainActivity.this,chId)
                            .setSmallIcon(icon)
                            .setContentTitle(title)
                            .setContentText(msg)
                            .setStyle(new Notification.BigTextStyle().bigText(msg))
                            .setContentIntent(pi)
                            .setAutoCancel(true)
                            .build();
                        AppSession.runIfActive(appSession,()->nm.notify(notifId,notif));
                        result=true;
                        break;
                    }
                    default:throw new Exception("不支持的操作");
                }reply(id,result,null);
            }catch(Exception e){JSONObject error=new JSONObject();try{error.put("code",e instanceof SnapshotStore.StorageException?((SnapshotStore.StorageException)e).code:e instanceof HttpFailure?((HttpFailure)e).code:"NATIVE_ERROR").put("message",safeError(e)).put("status",e instanceof HttpFailure?((HttpFailure)e).status:0).put("retryable",e instanceof HttpFailure&&((HttpFailure)e).retryable).put("retryAfterMs",e instanceof HttpFailure?((HttpFailure)e).retryAfterMs:JSONObject.NULL);}catch(Exception ignored){}reply(id,null,error);}});
        }
    }
    private synchronized void saveState(String text) throws Exception {if(text.length()>16*1024*1024)throw new Exception("书库数据过大");new JSONObject(text);FileOutputStream out=null;try{out=store.startWrite();out.write(text.getBytes(StandardCharsets.UTF_8));store.finishWrite(out);}catch(Exception e){if(out!=null)store.failWrite(out);throw e;}}
    private JSONObject request(JSONObject p) throws Exception {return request(p,vault.read());}
    private JSONObject request(JSONObject p,JSONObject keys) throws Exception {
        String provider=p.getString("provider");JSONObject st=p.getJSONObject("settings"),body=p.getJSONObject("body");boolean tts=provider.equals("tts");if(!tts&&!provider.equals("llm"))throw new Exception("无效模型类型");String base=tts?"https://api.xiaomimimo.com/v1":st.optString("llmBase","https://api.minimax.cn/v1").replaceAll("/+$","");base=ModelSettings.base(base);String key=keys.optString(tts?"ttsKey":"llmKey");if(key.isEmpty())throw new Exception("请先配置"+(tts?"MiMo":"语言模型")+" API Key");if(!tts&&!base.equals(keys.optString("llmBase","https://api.minimax.cn/v1")))throw new Exception("模型地址已改变，请在配置页保存以确认密钥对应的服务");boolean anthropic=!tts&&st.optString("llmProtocol").equals("anthropic");String suffix=anthropic?(base.endsWith("/v1")?"/messages":"/v1/messages"):"/chat/completions";
        HttpURLConnection conn=(HttpURLConnection)new URL(base+suffix).openConnection();conn.setInstanceFollowRedirects(false);conn.setRequestMethod("POST");conn.setConnectTimeout(ModelSettings.timeout(st,"connectTimeoutSeconds",30,5,120));conn.setReadTimeout(ModelSettings.timeout(st,"responseTimeoutSeconds",240,30,600));conn.setDoOutput(true);conn.setRequestProperty("Content-Type","application/json");conn.setRequestProperty("Authorization","Bearer "+key);if(anthropic){conn.setRequestProperty("x-api-key",key);conn.setRequestProperty("anthropic-version","2023-06-01");}
        try{byte[] raw=body.toString().getBytes(StandardCharsets.UTF_8);conn.setFixedLengthStreamingMode(raw.length);try(OutputStream out=conn.getOutputStream()){out.write(raw);}int code=conn.getResponseCode();InputStream in=code>=200&&code<300?conn.getInputStream():conn.getErrorStream();String response=in==null?"":new String(AudioFiles.read(in,40*1024*1024),StandardCharsets.UTF_8);if(code<200||code>=300){String message="HTTP "+code,serviceCode="";try{JSONObject err=new JSONObject(response),detail=err.optJSONObject("error"),baseResp=err.optJSONObject("base_resp");if(detail!=null){message=detail.optString("message",message);serviceCode=detail.optString("code","");}else if(baseResp!=null){message=baseResp.optString("status_msg",message);serviceCode=baseResp.optString("status_code","");}else{message=err.optString("message",message);serviceCode=err.optString("code","");}}catch(Exception ignored){}message=message.replace(key,"[已隐藏]");throw new HttpFailure(message,code,code==408||code==429||code>=500,serviceCode,retryAfter(conn.getHeaderField("Retry-After")));}return new JSONObject(response);}catch(SocketTimeoutException e){throw new HttpFailure("请求超时，已完成音频会保留",408,true);}catch(IOException e){if("文件超过允许大小".equals(e.getMessage())||e instanceof java.net.ProtocolException||e instanceof javax.net.ssl.SSLHandshakeException)throw e;throw new HttpFailure("网络连接中断，已完成进度会保留",0,true);}finally{conn.disconnect();}
    }
    private JSONObject testModelConfiguration(JSONObject p) throws Exception {
        String provider=p.getString("provider");JSONObject settings=p.getJSONObject("settings");
        JSONObject keys=ModelSettings.credentials(provider,settings,p.optJSONObject("credential")==null?new JSONObject():p.getJSONObject("credential"),vault.read());
        String key=keys.optString("tts".equals(provider)?"ttsKey":"llmKey");
        try {
            JSONObject result=request(p,keys),detail=result.optJSONObject("error"),baseResp=result.optJSONObject("base_resp");
            if(detail!=null)throw new Exception(detail.optString("message","服务返回错误"));
            if(baseResp!=null&&baseResp.optInt("status_code",0)!=0)throw new Exception(baseResp.optString("status_msg","服务返回错误"));
            return result;
        } catch(Exception error){
            String message=error.getMessage()==null?"测试失败":error.getMessage();if(!key.isEmpty())message=message.replace(key,"[已隐藏]");
            if(error instanceof HttpFailure){HttpFailure h=(HttpFailure)error;throw new HttpFailure(message,h.status,h.retryable,h.code,h.retryAfterMs);}throw new Exception(message);
        }
    }
    private synchronized void recoverModelSave(JSONObject state) throws Exception {
        JSONObject keys=vault.read(),pending=keys.optJSONObject("_modelSave");if(pending==null)return;
        if(state!=null&&ModelSettings.matches(state.optJSONObject("settings"),pending.getJSONObject("patch"))){keys.remove("_modelSave");vault.replace(keys);}
        else vault.replace(pending.getJSONObject("previous"));
    }
    private synchronized JSONObject saveModelConfiguration(JSONObject p) throws Exception {
        JSONObject header=snapshots.loadHeader();if(header==null)throw new Exception("请先保存书库，再保存模型配置");
        recoverModelSave(header);String provider=p.getString("provider");JSONObject patch=p.getJSONObject("patch");
        JSONObject settings=ModelSettings.apply(provider,header.getJSONObject("settings"),patch),previous=vault.read();
        JSONObject next=ModelSettings.credentials(provider,settings,p.optJSONObject("credential")==null?new JSONObject():p.getJSONObject("credential"),previous);
        JSONObject expected=new JSONObject();for(String name:new String[]{"llmBase","llmModel","llmProtocol"})if("llm".equals(provider))expected.put(name,settings.opt(name));
        // The encrypted journal lets startup finish or roll back a save interrupted
        // between the credential write and the atomic manifest replacement.
        next.put("_modelSave",new JSONObject().put("previous",previous).put("patch",expected));vault.replace(next);
        header.put("settings",settings);
        try{snapshots.save(header.toString(),"[]");}catch(Exception error){vault.replace(previous);throw error;}
        next.remove("_modelSave");try{vault.replace(next);}catch(Exception ignored){/* Effective values committed; startup clears the journal. */}
        return new JSONObject().put("llmConfigured",!next.optString("llmKey").isEmpty()).put("ttsConfigured",!next.optString("ttsKey").isEmpty());
    }
    static Long retryAfter(String value){if(value==null)return null;try{return Math.max(0,(long)(Double.parseDouble(value.trim())*1000));}catch(NumberFormatException ignored){}try{java.text.SimpleDateFormat format=new java.text.SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss zzz",java.util.Locale.US);return Math.max(0,format.parse(value).getTime()-System.currentTimeMillis());}catch(java.text.ParseException ignored){return null;}}
    static class HttpFailure extends Exception{final int status;final boolean retryable;final String code;final Long retryAfterMs;HttpFailure(String m,int s,boolean r){this(m,s,r,"",null);}HttpFailure(String m,int s,boolean r,String c){this(m,s,r,c,null);}HttpFailure(String m,int s,boolean r,String c,Long delay){super(m);status=s;retryable=r;code=c;retryAfterMs=delay;}}
    private String safeError(Exception e){String m=e.getMessage();if(m==null)m="操作失败，请重试";try{JSONObject k=vault.read();for(String n:new String[]{"llmKey","ttsKey"})if(!k.optString(n).isEmpty())m=m.replace(k.getString(n),"[已隐藏]");}catch(Exception ignored){}m=m.replaceAll("/data/\\S+","[应用数据文件]");return m.length()>500?m.substring(0,500):m;}
    private void reply(String id,Object result,JSONObject error){try{JSONObject value=new JSONObject().put("id",id).put("result",result==null?JSONObject.NULL:result).put("error",error==null?JSONObject.NULL:error);runOnUiThread(()->{if(web!=null)web.evaluateJavascript("window.nativeResult("+value+")",null);});}catch(Exception ignored){}}
    private void pick(String id,String kind){if(pendingId!=null){reply(id,null,error("另一个文件选择操作尚未完成"));return;}pendingId=id;pickKind=kind;Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");i.putExtra(Intent.EXTRA_MIME_TYPES,kind.equals("voice")?new String[]{"audio/wav","audio/x-wav","audio/mpeg"}:new String[]{"text/plain","application/epub+zip"});i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,kind.equals("voice"));startActivityForResult(i,100);}
    private void export(String id,JSONObject p){if(pendingId!=null){reply(id,null,error("请先完成当前文件操作"));return;}pendingId=id;exportFile=p.optString("id");Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("audio/wav").putExtra(Intent.EXTRA_TITLE,p.optString("name","芭蕉")+".wav");startActivityForResult(i,101);}
    static JSONObject decodedBook(byte[] bytes,String encoding)throws Exception{String text=BookImporter.text(bytes,encoding);int damaged=0,first=-1;for(int i=0;i<text.length();i++)if(text.charAt(i)=='\ufffd'){damaged++;if(first<0)first=i;}return new JSONObject().put("text",text).put("encoding",encoding).put("damagedCount",damaged).put("firstDamagedAt",first).put("encodingConfidence",damaged==0?"高":damaged<=Math.max(1,text.length()/200)?"存在少量损坏字节":"低");}
    static JSONObject error(String m){try{return new JSONObject().put("message",m);}catch(Exception e){return new JSONObject();}}
    @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request!=100&&request!=101)return;String id=pendingId;pendingId=null;if(id==null)return;if(result!=RESULT_OK||data==null){reply(id,request==100?new JSONArray():false,null);return;}final String kind=pickKind,export=exportFile;executor.execute(()->{try{if(request==101){try(OutputStream out=getContentResolver().openOutputStream(data.getData())){if(out==null)throw new IOException("无法写入目标文件");try(InputStream in=new FileInputStream(audio.get(export))){byte[] b=new byte[16384];int n;while((n=in.read(b))!=-1)out.write(b,0,n);}}reply(id,true,null);return;}
            List<Uri> uris=new ArrayList<>();if(data.getClipData()!=null){for(int j=0;j<data.getClipData().getItemCount();j++)uris.add(data.getClipData().getItemAt(j).getUri());}else if(data.getData()!=null)uris.add(data.getData());JSONArray files=new JSONArray();for(Uri uri:uris){String name="导入文件";try(Cursor cur=getContentResolver().query(uri,null,null,null,null)){if(cur!=null&&cur.moveToFirst()){int c=cur.getColumnIndex(OpenableColumns.DISPLAY_NAME);if(c>=0)name=cur.getString(c);}}try(InputStream in=getContentResolver().openInputStream(uri)){if(in==null)throw new IOException("无法读取文件");byte[] bytes=AudioFiles.read(in,kind.equals("voice")?7500000:40*1024*1024);if(kind.equals("voice")){String ext=name.toLowerCase(Locale.ROOT).endsWith(".mp3")?"mp3":"wav";if(ext.equals("mp3"))validateMp3Reference(bytes);JSONObject f=audio.save(bytes,ext);f.put("name",name);files.put(f);}else{try{JSONObject f;if(name.toLowerCase(Locale.ROOT).endsWith(".epub"))f=new JSONObject().put("text",BookImporter.epub(bytes));else{String token=UUID.randomUUID().toString();importBytes.clear();importBytes.put(token,bytes);f=decodedBook(bytes,BookImporter.encoding(bytes)).put("token",token);}files.put(f.put("name",name));}catch(Exception bookError){files.put(new JSONObject().put("name",name).put("text","").put("error",safeError(bookError)).put("code","BOOK_IMPORT_FAILED"));}}}}reply(id,files,null);
        }catch(Exception e){reply(id,null,error(safeError(e)));}});}
    private void validateMp3Reference(byte[] bytes) throws Exception {
        File temp=File.createTempFile("reference-",".mp3",getCacheDir());
        android.media.MediaPlayer probe=new android.media.MediaPlayer();
        try {
            try(FileOutputStream out=new FileOutputStream(temp)){out.write(bytes);}
            probe.setDataSource(temp.getAbsolutePath());probe.prepare();
            if(probe.getDuration()<=0)throw new IOException("参考 MP3 无法解码或没有有效时长");
        } finally {probe.release();if(!temp.delete())temp.deleteOnExit();}
    }
    @Override public void onBackPressed(){web.evaluateJavascript("window.appBack&&window.appBack()",null);}
    @Override protected void onStop(){super.onStop();PlaybackService.checkpointNow();if(web!=null)web.evaluateJavascript("window.appBackground&&window.appBackground()",null);}
    @Override protected void onDestroy(){AppNotifications.close(this,appSession);super.onDestroy();networkHandler.removeCallbacks(refreshNetwork);if(connectivity!=null&&networkCallback!=null)connectivity.unregisterNetworkCallback(networkCallback);if(!AppSession.isActive(AppSession.current()))PlaybackService.setEventListener(null);if(web!=null){web.removeJavascriptInterface("Native");web.destroy();web=null;}networkExecutor.shutdownNow();executor.shutdown();}
}

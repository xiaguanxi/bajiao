package com.vocast.app;
import android.app.*;
import android.os.*;
import android.content.*;
import android.database.Cursor;
import android.net.Uri;
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
    private final ExecutorService executor=Executors.newFixedThreadPool(3);
    private SecretStore vault;private AudioFiles audio;private AtomicFile store;private SnapshotStore snapshots;
    private String pendingId,pickKind,exportFile,pendingNav;
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);String nav=intent!=null?intent.getStringExtra("nav"):null;if(nav!=null){pendingNav=nav;forwardNav(nav);}}
    private void forwardNav(String nav){if(web==null||nav==null)return;final String js="window.__applyInitialNav&&window.__applyInitialNav('"+nav.replace("'","")+"')";web.post(()->{if(web!=null)web.evaluateJavascript(js,null);});}
    @Override public void onCreate(Bundle state){super.onCreate(state);vault=new SecretStore(this);audio=new AudioFiles(new File(getFilesDir(),"audio"));store=new AtomicFile(new File(getFilesDir(),"state.json"));snapshots=new SnapshotStore(getFilesDir());
        if((getApplicationInfo().flags&android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)!=0){try{File f=new File(getFilesDir(),"credentials-import.json");if(f.isFile()){vault.save(new JSONObject(new String(AudioFiles.read(f,100000),StandardCharsets.UTF_8)));if(!f.delete())throw new IOException("Credential import cleanup failed");}}catch(Exception e){android.widget.Toast.makeText(this,"测试配置导入失败",android.widget.Toast.LENGTH_SHORT).show();}}
        web=new WebView(this);setContentView(web);web.setBackgroundColor(0xfff8f7f2);WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(false);settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setMediaPlaybackRequiresUserGesture(true);settings.setUseWideViewPort(true);settings.setLoadWithOverviewMode(true);settings.setTextZoom(100);
        if((getApplicationInfo().flags&android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)!=0)WebView.setWebContentsDebuggingEnabled(true);
        web.setWebViewClient(new WebViewClient(){@Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return true;}@Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){Uri uri=r.getUrl();if(!"app.vocast.local".equals(uri.getHost()))return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));String path=uri.getPath();if(path==null||path.contains(".."))return null;path=path.equals("/")?"index.html":path.substring(1);try{String mime=path.endsWith(".js")?"application/javascript":path.endsWith(".css")?"text/css":"text/html";return new WebResourceResponse(mime,"UTF-8",getAssets().open(path));}catch(IOException e){return new WebResourceResponse("text/plain","UTF-8",404,"Not found",null,new ByteArrayInputStream(new byte[0]));}}});
        web.addJavascriptInterface(new Bridge(),"Native");web.loadUrl("https://app.vocast.local/index.html");
        PlaybackService.setEventListener((act, val) -> {
            if (web != null) {
                web.post(() -> {
                    if (web != null) {
                        web.evaluateJavascript("window.onNativePlaybackAction&&window.onNativePlaybackAction('" + act + "'," + val + ")", null);
                    }
                });
            }
        });
        if(Build.VERSION.SDK_INT>=33&&checkSelfPermission("android.permission.POST_NOTIFICATIONS")!=android.content.pm.PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"},80);
    }
    class Bridge {
        @JavascriptInterface public void call(String id,String action,String json){
            if(!id.matches("[a-zA-Z0-9_-]{1,60}"))return;
            executor.execute(()->{try{JSONObject p=new JSONObject(json);Object result;
                switch(action){
                    case "load":{JSONObject state=snapshots.loadHeader();try{if(state==null)state=new JSONObject(new String(store.readFully(),StandardCharsets.UTF_8));}catch(FileNotFoundException ignored){}JSONObject keys=vault.read();String nav0=getIntent()!=null?getIntent().getStringExtra("nav"):null;if(nav0==null)nav0=pendingNav;pendingNav=null;result=new JSONObject().put("state",state==null?JSONObject.NULL:state).put("llmConfigured",!keys.optString("llmKey").isEmpty()).put("ttsConfigured",!keys.optString("ttsKey").isEmpty()).put("initialNav",nav0==null?JSONObject.NULL:nav0);break;}
                    case "loadChapter":result=snapshots.loadChapter(p.getString("id"));break;
                    case "saveSnapshot":snapshots.save(p.getString("header"),p.getString("chapters"));result=true;break;
                    case "saveState":saveState(p.getString("text"));result=true;break;
                    case "saveCredentials":vault.save(p);result=true;break;
                    case "request":result=request(p);break;
                    case "saveAudio":result=audio.save(Base64.decode(p.getString("base64"),Base64.DEFAULT),p.getString("format"));break;
                    case "readAudio":result=new JSONObject().put("base64",Base64.encodeToString(AudioFiles.read(audio.get(p.getString("id")),8*1024*1024),Base64.NO_WRAP));break;
                    case "mergeAudio":{List<String> ids=new ArrayList<>();JSONArray a=p.getJSONArray("ids");for(int i=0;i<a.length();i++)ids.add(a.getString(i));JSONArray pauses=p.optJSONArray("pauses");int[] gaps=null;if(pauses!=null&&pauses.length()>0){gaps=new int[pauses.length()];for(int i=0;i<gaps.length;i++)gaps[i]=pauses.getInt(i);}result=audio.merge(ids,gaps);break;}
                    case "pick":runOnUiThread(()->pick(id,p.optString("kind")));return;
                    case "export":{audio.get(p.getString("id"));runOnUiThread(()->export(id,p));return;}
                    case "play":{String audioId=p.getString("id");String path=audio.get(audioId).getAbsolutePath();Intent i=new Intent(MainActivity.this,PlaybackService.class).setAction(PlaybackService.ACTION_PLAY).putExtra("id",audioId).putExtra("path",path).putExtra("title",p.optString("title","Vocast")).putExtra("bookTitle",p.optString("bookTitle","Vocast")).putExtra("artist",p.optString("artist","多角色演绎 · Vocast")).putExtra("duration",p.optInt("duration",0)).putExtra("position",p.optInt("position",0)).putExtra("speed",(float)p.optDouble("speed",1.0)).putExtra("hasPrev",p.optBoolean("hasPrev",false)).putExtra("hasNext",p.optBoolean("hasNext",false)).putExtra("coverPath",p.optString("coverPath",""));startForegroundService(i);result=true;break;}
                    case "deleteAudio":{List<String> toDelete=new ArrayList<>();if(p.has("ids")){JSONArray a=p.getJSONArray("ids");for(int i=0;i<a.length();i++)toDelete.add(a.getString(i));}else if(p.has("id")){toDelete.add(p.getString("id"));}int count=0;long freed=0;for(String aid:toDelete){long sz=audio.deleteAndGetSize(aid);if(sz>0){count++;freed+=sz;}}JSONObject delRes=new JSONObject();delRes.put("count",count);delRes.put("freedBytes",freed);delRes.put("freedMb",Math.round(freed/1024.0/1024.0*10.0)/10.0);result=delRes;break;}
                    case "audioStats":{result=audio.getStats();break;}
                    case "cleanupAudio":{Set<String> keepSet=new HashSet<>();if(p.has("keepIds")){JSONArray a=p.getJSONArray("keepIds");for(int i=0;i<a.length();i++)keepSet.add(a.getString(i));}result=audio.cleanup(keepSet);break;}
                    case "playback":{String op=p.optString("op");if(!Arrays.asList("pause","resume","toggle","stop","seek","speed","sleep","prev","next","rewind","fast_forward").contains(op))throw new Exception("无效播放操作");Intent i=new Intent(MainActivity.this,PlaybackService.class).setAction(op).putExtra("value",p.optDouble("value"));startService(i);result=true;break;}
                    case "playbackState":result=PlaybackService.status();break;
                    case "productionStatus":{
                        boolean active=p.optBoolean("active",false);
                        Intent i=new Intent(MainActivity.this,ProductionService.class);
                        if(active){
                            i.setAction(ProductionService.ACTION_UPDATE)
                             .putExtra("title",p.optString("title","Vocast 正在后台制作"))
                             .putExtra("message",p.optString("message","正在合成有声书章节..."))
                             .putExtra("progress",p.optInt("progress",0))
                             .putExtra("total",p.optInt("total",0));
                            if(Build.VERSION.SDK_INT>=Build.VERSION_CODES.O){
                                startForegroundService(i);
                            }else{
                                startService(i);
                            }
                        }else{
                            i.setAction(ProductionService.ACTION_STOP);
                            startService(i);
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
                        channel.setDescription("Vocast 消息与系统通知");
                        nm.createNotificationChannel(channel);
                        PendingIntent pi=PendingIntent.getActivity(MainActivity.this,1,new Intent(MainActivity.this,MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP).putExtra("nav","tasks_attention"),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
                        String title=p.optString("title","Vocast 提示");
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
                        nm.notify(notifId,notif);
                        result=true;
                        break;
                    }
                    default:throw new Exception("不支持的操作");
                }reply(id,result,null);
            }catch(Exception e){JSONObject error=new JSONObject();try{error.put("message",safeError(e)).put("status",e instanceof HttpFailure?((HttpFailure)e).status:0).put("retryable",e instanceof HttpFailure&&((HttpFailure)e).retryable);}catch(Exception ignored){}reply(id,null,error);}});
        }
    }
    private synchronized void saveState(String text) throws Exception {if(text.length()>16*1024*1024)throw new Exception("书库数据过大");new JSONObject(text);FileOutputStream out=null;try{out=store.startWrite();out.write(text.getBytes(StandardCharsets.UTF_8));store.finishWrite(out);}catch(Exception e){if(out!=null)store.failWrite(out);throw e;}}
    private JSONObject request(JSONObject p) throws Exception {
        String provider=p.getString("provider");JSONObject st=p.getJSONObject("settings"),body=p.getJSONObject("body"),keys=vault.read();boolean tts=provider.equals("tts");if(!tts&&!provider.equals("llm"))throw new Exception("无效模型类型");String base=tts?"https://api.xiaomimimo.com/v1":st.optString("llmBase","https://api.minimax.cn/v1").replaceAll("/+$","");URL baseUrl=new URL(base);if(!baseUrl.getProtocol().equals("https")||baseUrl.getUserInfo()!=null||baseUrl.getQuery()!=null||baseUrl.getRef()!=null)throw new Exception("模型地址必须是 HTTPS Base URL");String key=keys.optString(tts?"ttsKey":"llmKey");if(key.isEmpty())throw new Exception("请先配置"+(tts?"MiMo":"语言模型")+" API Key");if(!tts&&!base.equals(keys.optString("llmBase","https://api.minimax.cn/v1")))throw new Exception("模型地址已改变，请在配置页保存以确认密钥对应的服务");boolean anthropic=!tts&&st.optString("llmProtocol").equals("anthropic");String suffix=anthropic?(base.endsWith("/v1")?"/messages":"/v1/messages"):"/chat/completions";
        HttpURLConnection conn=(HttpURLConnection)new URL(base+suffix).openConnection();conn.setInstanceFollowRedirects(false);conn.setRequestMethod("POST");conn.setConnectTimeout(30000);conn.setReadTimeout(240000);conn.setDoOutput(true);conn.setRequestProperty("Content-Type","application/json");conn.setRequestProperty("Authorization","Bearer "+key);if(anthropic){conn.setRequestProperty("x-api-key",key);conn.setRequestProperty("anthropic-version","2023-06-01");}
        try{byte[] raw=body.toString().getBytes(StandardCharsets.UTF_8);conn.setFixedLengthStreamingMode(raw.length);try(OutputStream out=conn.getOutputStream()){out.write(raw);}int code=conn.getResponseCode();InputStream in=code>=200&&code<300?conn.getInputStream():conn.getErrorStream();String response=in==null?"":new String(AudioFiles.read(in,40*1024*1024),StandardCharsets.UTF_8);if(code<200||code>=300){String message="HTTP "+code;try{JSONObject err=new JSONObject(response);message=err.optJSONObject("error")!=null?err.getJSONObject("error").optString("message",message):err.optString("message",message);}catch(Exception ignored){}message=message.replace(key,"[已隐藏]");throw new HttpFailure(message,code,code==429||code>=500);}return new JSONObject(response);}catch(SocketTimeoutException e){throw new HttpFailure("请求超时，已完成音频会保留",408,true);}catch(IOException e){if("文件超过允许大小".equals(e.getMessage())||e instanceof java.net.ProtocolException||e instanceof javax.net.ssl.SSLHandshakeException)throw e;throw new HttpFailure("网络连接中断，已完成进度会保留",0,true);}finally{conn.disconnect();}
    }
    static class HttpFailure extends Exception{final int status;final boolean retryable;HttpFailure(String m,int s,boolean r){super(m);status=s;retryable=r;}}
    private String safeError(Exception e){String m=e.getMessage();if(m==null)m="操作失败，请重试";try{JSONObject k=vault.read();for(String n:new String[]{"llmKey","ttsKey"})if(!k.optString(n).isEmpty())m=m.replace(k.getString(n),"[已隐藏]");}catch(Exception ignored){}m=m.replaceAll("/data/\\S+","[应用数据文件]");return m.length()>500?m.substring(0,500):m;}
    private void reply(String id,Object result,JSONObject error){try{JSONObject value=new JSONObject().put("id",id).put("result",result==null?JSONObject.NULL:result).put("error",error==null?JSONObject.NULL:error);runOnUiThread(()->{if(web!=null)web.evaluateJavascript("window.nativeResult("+value+")",null);});}catch(Exception ignored){}}
    private void pick(String id,String kind){if(pendingId!=null){reply(id,null,error("另一个文件选择操作尚未完成"));return;}pendingId=id;pickKind=kind;Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");i.putExtra(Intent.EXTRA_MIME_TYPES,kind.equals("voice")?new String[]{"audio/wav","audio/x-wav","audio/mpeg"}:new String[]{"text/plain","application/epub+zip"});i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,kind.equals("voice"));startActivityForResult(i,100);}
    private void export(String id,JSONObject p){if(pendingId!=null){reply(id,null,error("请先完成当前文件操作"));return;}pendingId=id;exportFile=p.optString("id");Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("audio/wav").putExtra(Intent.EXTRA_TITLE,p.optString("name","Vocast")+".wav");startActivityForResult(i,101);}
    static JSONObject error(String m){try{return new JSONObject().put("message",m);}catch(Exception e){return new JSONObject();}}
    @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request!=100&&request!=101)return;String id=pendingId;pendingId=null;if(id==null)return;if(result!=RESULT_OK||data==null){reply(id,null,error("已取消选择"));return;}final String kind=pickKind,export=exportFile;executor.execute(()->{try{if(request==101){try(OutputStream out=getContentResolver().openOutputStream(data.getData())){if(out==null)throw new IOException("无法写入目标文件");try(InputStream in=new FileInputStream(audio.get(export))){byte[] b=new byte[16384];int n;while((n=in.read(b))!=-1)out.write(b,0,n);}}reply(id,true,null);return;}
            List<Uri> uris=new ArrayList<>();if(data.getClipData()!=null){for(int j=0;j<data.getClipData().getItemCount();j++)uris.add(data.getClipData().getItemAt(j).getUri());}else if(data.getData()!=null)uris.add(data.getData());JSONArray files=new JSONArray();for(Uri uri:uris){String name="导入文件";try(Cursor cur=getContentResolver().query(uri,null,null,null,null)){if(cur!=null&&cur.moveToFirst()){int c=cur.getColumnIndex(OpenableColumns.DISPLAY_NAME);if(c>=0)name=cur.getString(c);}}try(InputStream in=getContentResolver().openInputStream(uri)){if(in==null)throw new IOException("无法读取文件");byte[] bytes=AudioFiles.read(in,kind.equals("voice")?7500000:40*1024*1024);if(kind.equals("voice")){String ext=name.toLowerCase(Locale.ROOT).endsWith(".mp3")?"mp3":"wav";JSONObject f=audio.save(bytes,ext);f.put("name",name);files.put(f);}else{String text=name.toLowerCase(Locale.ROOT).endsWith(".epub")?BookImporter.epub(bytes):BookImporter.text(bytes);files.put(new JSONObject().put("name",name).put("text",text));}}}reply(id,files,null);
        }catch(Exception e){reply(id,null,error(safeError(e)));}});}
    @Override public void onBackPressed(){web.evaluateJavascript("window.appBack&&window.appBack()",null);}
    @Override protected void onStop(){super.onStop();if(web!=null)web.evaluateJavascript("window.appBackground&&window.appBackground()",null);}
    @Override protected void onDestroy(){super.onDestroy();try{stopService(new Intent(this,ProductionService.class));}catch(Exception ignored){}PlaybackService.setEventListener(null);if(web!=null){web.removeJavascriptInterface("Native");web.destroy();web=null;}executor.shutdown();}
}

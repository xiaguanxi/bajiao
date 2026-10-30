package com.vocast.app;

import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigInteger;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Anonymous release checks, independent of model credentials and library data. */
final class AppUpdates {
    static final String REPOSITORY="xiaguanxi/bajiao";
    static final String PROJECT_URL="https://github.com/"+REPOSITORY;
    static final String API_URL="https://api.github.com/repos/"+REPOSITORY+"/releases?per_page=20";
    static final long SUCCESS_INTERVAL_MS=24*60*60*1000L;
    static final long FAILURE_INTERVAL_MS=60*60*1000L;
    private static final int MAX_RESPONSE_BYTES=2*1024*1024;

    static JSONObject check(String installedVersion)throws Exception{
        HttpURLConnection connection=(HttpURLConnection)new URL(API_URL).openConnection();
        connection.setConnectTimeout(12000);connection.setReadTimeout(15000);
        connection.setInstanceFollowRedirects(false);
        connection.setRequestProperty("Accept","application/vnd.github+json");
        connection.setRequestProperty("X-GitHub-Api-Version","2022-11-28");
        connection.setRequestProperty("User-Agent","Bajiao/"+installedVersion);
        try{
            int status=connection.getResponseCode();
            if(status==404)throw new IOException("更新来源暂不可访问，请稍后重试或查看项目地址。");
            if(status==403||status==429)throw new IOException("更新检查暂时受到限流，请稍后重试。");
            if(status!=200)throw new IOException("更新服务暂不可用，请稍后重试。");
            byte[] bytes;
            try(InputStream input=connection.getInputStream();ByteArrayOutputStream output=new ByteArrayOutputStream()){
                byte[] buffer=new byte[8192];int count;
                while((count=input.read(buffer))!=-1){
                    if(output.size()+count>MAX_RESPONSE_BYTES)throw new IOException("更新信息过大，请稍后重试。");
                    output.write(buffer,0,count);
                }
                bytes=output.toByteArray();
            }
            try{return select(new JSONArray(new String(bytes,StandardCharsets.UTF_8)),installedVersion).put("checkedAt",System.currentTimeMillis());}
            catch(org.json.JSONException error){throw new IOException("更新信息格式不正确，请稍后重试。",error);}
        }catch(java.net.SocketTimeoutException error){throw new IOException("检查更新超时，请检查网络后重试。",error);}
        catch(java.net.UnknownHostException|javax.net.ssl.SSLException error){throw new IOException("无法连接更新服务，请检查网络后重试。",error);}
        finally{connection.disconnect();}
    }

    static JSONObject select(JSONArray releases,String installedVersion)throws Exception{
        Version current=Version.parse(installedVersion);
        if(current==null)throw new IOException("当前版本信息不完整，无法比较更新。");
        Version newest=null;JSONObject chosen=null;boolean hasInstallableRelease=false;
        for(int index=0;index<releases.length();index++){
            JSONObject release=releases.optJSONObject(index);
            if(release==null||release.optBoolean("draft"))continue;
            Version version=Version.parse(release.optString("tag_name"));
            if(version==null)continue;
            JSONArray assets=release.optJSONArray("assets");if(assets==null)continue;
            JSONObject apk=null;
            for(int i=0;i<assets.length();i++){
                JSONObject asset=assets.optJSONObject(i);if(asset==null)continue;
                String name=asset.optString("name").toLowerCase(Locale.ROOT),url=asset.optString("browser_download_url");
                if(!name.startsWith("bajiao")||!name.endsWith(".apk")||name.contains("androidtest")||!"uploaded".equals(asset.optString("state"))||asset.optLong("size",0)<=0||!allowedDownload(url))continue;
                if(apk==null||name.contains("universal"))apk=asset;
            }
            if(apk==null)continue;
            hasInstallableRelease=true;
            if(version.compareTo(current)<=0||newest!=null&&version.compareTo(newest)<=0)continue;
            newest=version;
            String notes=release.optString("body");if(notes.length()>4000)notes=notes.substring(0,4000)+"…";
            chosen=new JSONObject().put("status","available").put("version",version.text)
                .put("name",release.optString("name",version.text)).put("notes",notes)
                .put("prerelease",release.optBoolean("prerelease")).put("publishedAt",release.optString("published_at"))
                .put("downloadUrl",apk.getString("browser_download_url")).put("fileName",apk.getString("name")).put("size",apk.optLong("size"));
        }
        // Development-preview releases are deliberately eligible, and labelled in the UI.
        return chosen!=null?chosen:new JSONObject().put("status",hasInstallableRelease?"current":"empty").put("currentVersion",current.text);
    }

    static boolean allowedDownload(String value){
        try{
            URI uri=new URI(value);
            String path=uri.getPath(),prefix="/"+REPOSITORY+"/releases/download/";
            return "https".equalsIgnoreCase(uri.getScheme())&&"github.com".equalsIgnoreCase(uri.getHost())
                &&uri.getUserInfo()==null&&(uri.getPort()==-1||uri.getPort()==443)&&uri.getFragment()==null&&uri.getQuery()==null
                &&path!=null&&path.startsWith(prefix)&&path.substring(prefix.length()).contains("/")
                &&!path.contains("/../")&&!path.contains("/./")&&path.toLowerCase(Locale.ROOT).endsWith(".apk");
        }catch(Exception ignored){return false;}
    }

    static final class Version implements Comparable<Version>{
        private static final Pattern FORMAT=Pattern.compile("^v?(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-([0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*))?(?:\\+([0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*))?$");
        final String text;final BigInteger[] numbers;final String[] preview;
        private Version(Matcher match,String value){text=value.startsWith("v")?value.substring(1):value;numbers=new BigInteger[]{new BigInteger(match.group(1)),new BigInteger(match.group(2)),new BigInteger(match.group(3))};preview=match.group(4)==null?null:match.group(4).split("\\.");}
        static Version parse(String value){
            if(value==null||value.length()>128)return null;
            Matcher match=FORMAT.matcher(value);if(!match.matches())return null;
            if(match.group(4)!=null)for(String part:match.group(4).split("\\."))if(part.matches("\\d+")&&part.length()>1&&part.startsWith("0"))return null;
            return new Version(match,value);
        }
        @Override public int compareTo(Version other){
            for(int i=0;i<3;i++){int comparison=numbers[i].compareTo(other.numbers[i]);if(comparison!=0)return comparison;}
            if(preview==null||other.preview==null)return preview==other.preview?0:preview==null?1:-1;
            for(int i=0;i<Math.min(preview.length,other.preview.length);i++){
                boolean a=preview[i].matches("\\d+"),b=other.preview[i].matches("\\d+");
                int comparison=a&&b?new BigInteger(preview[i]).compareTo(new BigInteger(other.preview[i])):a!=b?(a?-1:1):preview[i].compareTo(other.preview[i]);
                if(comparison!=0)return comparison;
            }
            return Integer.compare(preview.length,other.preview.length);
        }
    }
}

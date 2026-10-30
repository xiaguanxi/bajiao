package com.vocast.app;

import org.json.JSONArray;
import org.json.JSONObject;

public final class AppUpdatesTest {
    private static int checks;
    private static void check(boolean value,String message){checks++;if(!value)throw new AssertionError(message);}
    private static String url(String tag){return AppUpdates.PROJECT_URL+"/releases/download/"+tag+"/Bajiao-"+tag+".apk";}
    private static JSONObject release(String tag)throws Exception{
        return new JSONObject().put("tag_name",tag).put("name","芭蕉 "+tag).put("draft",false).put("prerelease",false)
            .put("body","更新内容").put("assets",new JSONArray().put(new JSONObject().put("name","Bajiao-"+tag+".apk").put("state","uploaded").put("size",1024).put("browser_download_url",url(tag))));
    }
    public static void main(String[] arguments)throws Exception{
        if(arguments.length>0&&arguments[0].equals("--live")){System.out.println(AppUpdates.check(arguments.length>1?arguments[1]:"0.8.36"));return;}
        check(AppUpdates.Version.parse("0.8.10").compareTo(AppUpdates.Version.parse("0.8.9"))>0,"numeric patch order");
        check(AppUpdates.Version.parse("v1.0.0").compareTo(AppUpdates.Version.parse("0.99.99"))>0,"major order");
        check(AppUpdates.Version.parse("1.0.0").compareTo(AppUpdates.Version.parse("1.0.0-rc.9"))>0,"stable over preview");
        check(AppUpdates.Version.parse("1.0.0-beta.10").compareTo(AppUpdates.Version.parse("1.0.0-beta.2"))>0,"preview numeric order");
        check(AppUpdates.Version.parse("1.0.0+build.2").compareTo(AppUpdates.Version.parse("1.0.0+build.9"))==0,"build metadata ignored");
        for(String invalid:new String[]{"nightly","v1.0","01.0.0","1.0.0-beta.01","1.0.0<script>","1.0.0/evil","1.0.0 ","","1.0.0-"})check(AppUpdates.Version.parse(invalid)==null,"invalid version accepted: "+invalid);
        check(AppUpdates.allowedDownload(url("v0.8.37")),"valid release APK rejected");
        for(String invalid:new String[]{url("v0.8.37").replace("https:","http:"),url("v0.8.37").replace("github.com","evil.example"),url("v0.8.37").replace("github.com","github.com@evil.example"),url("v0.8.37").replace("/bajiao/","/other/"),url("v0.8.37")+"#x",url("v0.8.37")+"?token=x",url("v0.8.37").replace("/v0.8.37/","/%2e%2e/"),url("v0.8.37").replace("github.com","github.com:8080")})check(!AppUpdates.allowedDownload(invalid),"untrusted URL accepted");
        check(AppUpdates.select(new JSONArray(),"0.8.36").getString("status").equals("empty"),"no releases must not report latest");
        check(AppUpdates.select(new JSONArray().put(release("v0.8.35")),"0.8.36").getString("status").equals("current"),"no downgrade");
        JSONObject chosen=AppUpdates.select(new JSONArray().put(release("v0.8.37")).put(release("v0.8.39")).put(release("v0.8.38")),"0.8.36");
        check(chosen.getString("version").equals("0.8.39"),"release array ordering must not select an older update");
        JSONObject draft=release("v9.0.0").put("draft",true),noApk=release("v8.0.0").put("assets",new JSONArray()),badUrl=release("v7.0.0");
        badUrl.getJSONArray("assets").getJSONObject(0).put("browser_download_url","https://evil.example/Bajiao.apk");
        chosen=AppUpdates.select(new JSONArray().put(draft).put(noApk).put(badUrl).put(release("v0.8.37")),"0.8.36");
        check(chosen.getString("version").equals("0.8.37"),"invalid release must not hide a valid installable update");
        JSONObject uploading=release("v1.0.0");uploading.getJSONArray("assets").getJSONObject(0).put("state","new");
        check(AppUpdates.select(new JSONArray().put(uploading),"0.8.36").getString("status").equals("empty"),"unfinished upload selected");
        JSONObject testApk=release("v1.0.0");testApk.getJSONArray("assets").getJSONObject(0).put("name","Bajiao-androidTest.apk");
        check(AppUpdates.select(new JSONArray().put(testApk),"0.8.36").getString("status").equals("empty"),"instrumentation APK selected");
        JSONObject preview=release("v0.8.37-beta.1").put("prerelease",true);
        chosen=AppUpdates.select(new JSONArray().put(preview),"0.8.36");
        check(chosen.getBoolean("prerelease")&&chosen.getString("version").equals("0.8.37-beta.1"),"preview releases must remain labelled");
        chosen=AppUpdates.select(new JSONArray().put(preview).put(release("v0.8.37")),"0.8.36");
        check(chosen.getString("version").equals("0.8.37"),"stable release should supersede its preview");
        System.out.println("PASS native app updates ("+checks+" checks)");
    }
}

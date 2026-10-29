package com.vocast.app;

import android.content.Context;
import android.content.ContextWrapper;
import android.content.SharedPreferences;
import android.app.Instrumentation;
import java.io.File;
import java.io.FileOutputStream;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import org.json.JSONArray;
import org.json.JSONObject;

/** Exercises the real Keystore and snapshot transaction in an isolated test directory. */
final class SettingsIntegration {
    private int checks;
    private void check(boolean value,String message){checks++;if(!value)throw new AssertionError(message);}
    private static void field(Object object,String name,Object value)throws Exception{Field field=object.getClass().getDeclaredField(name);field.setAccessible(true);field.set(object,value);}
    private static Object call(MainActivity activity,String name,JSONObject value)throws Exception{
        Method method=MainActivity.class.getDeclaredMethod(name,JSONObject.class);method.setAccessible(true);
        try{return method.invoke(activity,value);}catch(InvocationTargetException error){if(error.getCause() instanceof Exception)throw (Exception)error.getCause();throw error;}
    }
    private static JSONObject payload(String provider,JSONObject patch,String operation,String key)throws Exception{
        return new JSONObject().put("provider",provider).put("patch",patch).put("credential",new JSONObject().put("operation",operation).put("key",key));
    }
    static int verify(Instrumentation instrumentation)throws Exception{return new SettingsIntegration().run(instrumentation);}
    private int run(Instrumentation instrumentation)throws Exception{
        Context context=instrumentation.getTargetContext();
        String preference="settings-integration-"+UUID.randomUUID();
        Context isolated=new ContextWrapper(context){@Override public SharedPreferences getSharedPreferences(String name,int mode){return super.getSharedPreferences(preference,mode);}};
        File root=new File(context.getCacheDir(),preference);if(!root.mkdirs())throw new Exception("Cannot create isolated test directory");
        SecretStore vault=new SecretStore(isolated);SnapshotStore snapshots=new SnapshotStore(root);
        java.util.concurrent.atomic.AtomicReference<MainActivity> reference=new java.util.concurrent.atomic.AtomicReference<>();
        instrumentation.runOnMainSync(()->reference.set(new MainActivity()));MainActivity activity=reference.get();
        field(activity,"vault",vault);field(activity,"snapshots",snapshots);
        JSONObject settings=new JSONObject().put("llmBase","https://saved.example/v1").put("llmModel","old-model").put("llmProtocol","openai").put("retries",7);
        JSONObject chapter=new JSONObject().put("id","chapter").put("title","本地测试").put("text","原文保留。").put("segments",new JSONArray());
        JSONObject header=new JSONObject().put("settings",settings).put("books",new JSONArray().put(new JSONObject().put("id","book").put("chapters",new JSONArray().put(chapter))));
        snapshots.save(header.toString(),new JSONArray().put(chapter).toString());
        vault.replace(new JSONObject().put("llmBase",settings.getString("llmBase")).put("llmKey","old-test-key").put("ttsKey","old-tts-key"));
        try{
            JSONObject result=(JSONObject)call(activity,"saveModelConfiguration",payload("llm",new JSONObject().put("llmModel","new-model"),"replace","new-test-key"));
            check(result.getBoolean("llmConfigured")&&result.getBoolean("ttsConfigured"),"Configured flags did not reflect the vault");
            check(vault.read().getString("llmKey").equals("new-test-key"),"Replacement key was not committed");
            check(vault.read().getString("ttsKey").equals("old-tts-key"),"LLM save changed TTS credentials");
            check(snapshots.loadHeader().getJSONObject("settings").getString("llmModel").equals("new-model"),"Public fields were not committed");
            check(snapshots.loadHeader().getJSONObject("settings").getInt("retries")==7,"Model save changed unrelated settings");
            check(!isolated.getSharedPreferences("vault",0).getString("credentials","").contains("new-test-key"),"Key was not encrypted");
            check(!snapshots.loadHeader().toString().contains("test-key"),"Key leaked into the library manifest");
            check(snapshots.loadChapter("chapter").getString("text").equals("原文保留。"),"Model save damaged lazy chapter content");
            check(!vault.read().has("_modelSave"),"Completed save retained a pending journal");

            call(activity,"saveModelConfiguration",payload("llm",new JSONObject(),"keep","ignored-key"));
            check(vault.read().getString("llmKey").equals("new-test-key"),"Keep operation replaced the key");
            try{call(activity,"saveModelConfiguration",payload("llm",new JSONObject().put("llmBase","https://other.example/v1"),"keep",""));throw new AssertionError("Origin change accepted the old key");}catch(Exception expected){check(expected.getMessage().contains("对应密钥"),"Wrong origin-binding error");}
            check(snapshots.loadHeader().getJSONObject("settings").getString("llmBase").equals(settings.getString("llmBase")),"Rejected origin change persisted");

            JSONObject before=vault.read();File blocked=new File(root,"blocked-manifest");if(!blocked.mkdirs())throw new Exception("Cannot create failure fixture");
            try(FileOutputStream output=new FileOutputStream(new File(blocked,"keep"))){output.write(1);}
            field(snapshots,"manifest",blocked);
            try{call(activity,"saveModelConfiguration",payload("llm",new JSONObject().put("llmModel","must-not-persist"),"replace","must-not-persist-key"));throw new AssertionError("Manifest failure was accepted");}catch(Exception expected){checks++;}
            field(snapshots,"manifest",new File(root,"library.json"));
            check(vault.read().toString().equals(before.toString()),"Manifest failure did not restore previous credentials");
            check(snapshots.loadHeader().getJSONObject("settings").getString("llmModel").equals("new-model"),"Manifest failure applied public fields");

            JSONObject next=new JSONObject(before.toString()).put("llmKey","interrupted-key");
            JSONObject patch=new JSONObject().put("llmModel","interrupted-model");
            next.put("_modelSave",new JSONObject().put("previous",before).put("patch",patch));vault.replace(next);
            call(activity,"recoverModelSave",snapshots.loadHeader());
            check(vault.read().getString("llmKey").equals("new-test-key"),"Interrupted pre-manifest save did not roll back");
            check(!vault.read().has("_modelSave"),"Rollback left a journal");
            vault.replace(next);JSONObject committed=snapshots.loadHeader();committed.getJSONObject("settings").put("llmModel","interrupted-model");snapshots.save(committed.toString(),"[]");
            call(activity,"recoverModelSave",snapshots.loadHeader());
            check(vault.read().getString("llmKey").equals("interrupted-key"),"Post-manifest recovery lost committed key");
            check(!vault.read().has("_modelSave"),"Post-manifest recovery retained a journal");

            JSONObject draft=new JSONObject(committed.getJSONObject("settings").toString()).put("llmBase","https://127.0.0.1:1/v1");
            JSONObject test=new JSONObject().put("provider","llm").put("settings",draft).put("body",new JSONObject()).put("credential",new JSONObject().put("operation","replace").put("key","ephemeral-test-key"));
            before=vault.read();
            try{call(activity,"testModelConfiguration",test);throw new AssertionError("Unavailable loopback test endpoint succeeded");}catch(Exception expected){check(!expected.getMessage().contains("ephemeral-test-key"),"Draft test exposed its temporary key");}
            check(vault.read().toString().equals(before.toString()),"Failed draft test wrote to the vault");
            check(snapshots.loadHeader().getJSONObject("settings").getString("llmBase").equals(settings.getString("llmBase")),"Failed draft test saved the temporary address");

            result=(JSONObject)call(activity,"saveModelConfiguration",payload("tts",new JSONObject(),"clear",""));
            check(!result.getBoolean("ttsConfigured")&&!vault.read().has("ttsKey"),"TTS clear did not remove the credential");
            check(vault.read().getString("llmKey").equals("interrupted-key"),"TTS clear changed the LLM key");
            call(activity,"saveModelConfiguration",payload("tts",new JSONObject(),"replace","replacement-tts-key"));
            check(vault.read().getString("ttsKey").equals("replacement-tts-key"),"TTS replacement failed");
            result=(JSONObject)call(activity,"saveModelConfiguration",payload("llm",new JSONObject(),"clear",""));
            check(!result.getBoolean("llmConfigured")&&!vault.read().has("llmKey"),"LLM clear did not remove the credential");
            return checks;
        }finally{
            context.deleteSharedPreferences(preference);
            try(java.util.stream.Stream<java.nio.file.Path> files=java.nio.file.Files.walk(root.toPath())){files.sorted(java.util.Comparator.reverseOrder()).forEach(file->{try{java.nio.file.Files.delete(file);}catch(Exception ignored){}});}
            for(String name:new String[]{"executor","networkExecutor"}){Field f=MainActivity.class.getDeclaredField(name);f.setAccessible(true);((ExecutorService)f.get(activity)).shutdownNow();}
        }
    }
}

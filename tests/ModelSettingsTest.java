package com.vocast.app;
import org.json.JSONObject;
public final class ModelSettingsTest {
    private static int checks;
    static void require(boolean condition){checks++;if(!condition)throw new AssertionError("check "+checks);}
    interface Operation {void run()throws Exception;}
    static void rejects(Operation op)throws Exception{try{op.run();throw new AssertionError("expected rejection");}catch(AssertionError error){throw error;}catch(Exception expected){checks++;}}
    public static void main(String[] args)throws Exception{
        JSONObject settings=new JSONObject().put("llmBase","https://model.example/v1/").put("llmModel","model").put("llmProtocol","openai");
        JSONObject existing=new JSONObject().put("llmKey","old-key").put("llmBase","https://model.example/v1").put("ttsKey","tts-key");
        JSONObject keep=ModelSettings.credentials("llm",settings,new JSONObject(),existing);require(keep.getString("llmKey").equals("old-key"));require(keep.getString("llmBase").equals("https://model.example/v1"));
        JSONObject changed=new JSONObject(settings.toString()).put("llmBase","https://other.example/v1");rejects(()->ModelSettings.credentials("llm",changed,new JSONObject(),existing));
        rejects(()->ModelSettings.credentials("llm",changed,new JSONObject(),new JSONObject()));rejects(()->ModelSettings.credentials("llm",changed,new JSONObject().put("operation","clear"),existing));
        JSONObject replace=ModelSettings.credentials("llm",changed,new JSONObject().put("operation","replace").put("key","new-key"),existing);require(replace.getString("llmKey").equals("new-key"));require(existing.getString("llmKey").equals("old-key"));require(existing.getString("llmBase").equals("https://model.example/v1"));
        JSONObject clear=ModelSettings.credentials("tts",settings,new JSONObject().put("operation","clear"),existing);require(!clear.has("ttsKey"));require(clear.getString("llmKey").equals("old-key"));
        rejects(()->ModelSettings.credentials("llm",settings,new JSONObject().put("operation","replace").put("key"," "),existing));
        for(String url:new String[]{"http://model.example","https://user:pass@model.example","https://model.example?a=1","https://model.example/#x"})rejects(()->ModelSettings.base(url));
        require(ModelSettings.timeout(new JSONObject(),"connectTimeoutSeconds",30,5,120)==30000);
        require(ModelSettings.timeout(new JSONObject().put("responseTimeoutSeconds",600),"responseTimeoutSeconds",240,30,600)==600000);
        for(Object n:new Object[]{0,601,"1e2","30.5","",Long.MAX_VALUE})rejects(()->ModelSettings.timeout(new JSONObject().put("responseTimeoutSeconds",n),"responseTimeoutSeconds",240,30,600));
        JSONObject previous=new JSONObject(settings.toString()).put("unrelated","preserved");JSONObject patch=new JSONObject().put("llmModel","new-model");JSONObject next=ModelSettings.apply("llm",previous,patch);require(next.getString("unrelated").equals("preserved"));require(previous.getString("llmModel").equals("model"));require(ModelSettings.matches(next,patch));require(!ModelSettings.matches(previous,patch));
        rejects(()->ModelSettings.apply("llm",previous,new JSONObject().put("ttsParallel",4)));rejects(()->ModelSettings.apply("tts",previous,patch));
        System.out.println("PASS ModelSettings: "+checks+" checks (temporary credentials, address binding, clear/replace, timeout bounds, patch isolation)");
    }
}

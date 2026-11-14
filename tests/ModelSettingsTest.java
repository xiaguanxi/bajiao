package com.vocast.app;
import org.json.JSONObject;
import org.json.JSONArray;
import java.util.Map;
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
        for(String protocol:new String[]{"openai","responses","anthropic"}){
            JSONObject s=new JSONObject(settings.toString()).put("llmProtocol",protocol);
            String suffix=protocol.equals("anthropic")?"messages":protocol.equals("responses")?"responses":"chat/completions";
            for(String address:new String[]{"https://model.example","https://model.example/v1/","https://model.example/v1/"+suffix}){
                s.put("llmBase",address);require(ModelSettings.endpoint(s,false).equals("https://model.example/v1/"+suffix));require(ModelSettings.endpoint(s,true).equals("https://model.example/v1/models"));
            }
        }
        JSONObject routed=new JSONObject(settings.toString()).put("llmBase","https://proxy.example/anthropic/v1/messages").put("llmProtocol","anthropic");require(ModelSettings.endpoint(routed,true).equals("https://proxy.example/anthropic/v1/models"));
        JSONArray headers=new JSONArray().put(new JSONObject().put("name","authorization").put("value","Bearer custom-token")).put(new JSONObject().put("name","X-Gateway").put("value","secret-gateway"));
        JSONObject custom=ModelSettings.credentials("llm",settings,new JSONObject().put("headers",headers),existing);require(!existing.has("llmHeaders"));
        Map<String,String> requestHeaders=ModelSettings.requestHeaders(settings,custom,false);require(requestHeaders.get("Authorization").equals("Bearer custom-token"));require(requestHeaders.get("X-Gateway").equals("secret-gateway"));require(requestHeaders.size()==3);
        Map<String,String> tts=ModelSettings.requestHeaders(settings,custom,true);require(tts.get("Authorization").equals("Bearer tts-key"));require(!tts.containsKey("X-Gateway"));
        JSONObject anthropic=new JSONObject(settings.toString()).put("llmProtocol","anthropic");Map<String,String> nativeHeaders=ModelSettings.requestHeaders(anthropic,existing,false);require(nativeHeaders.get("x-api-key").equals("old-key"));require(nativeHeaders.get("anthropic-version").equals("2023-06-01"));require(!nativeHeaders.containsKey("Authorization"));
        JSONArray version=new JSONArray().put(new JSONObject().put("name","Anthropic-Version").put("value","custom-version"));require(ModelSettings.requestHeaders(anthropic,new JSONObject(existing.toString()).put("llmHeaders",version),false).get("anthropic-version").equals("custom-version"));
        for(String name:new String[]{"Host","Content-Length","Connection","bad name",""})rejects(()->ModelSettings.headers(new JSONArray().put(new JSONObject().put("name",name).put("value","x"))));
        rejects(()->ModelSettings.headers(new JSONArray().put(new JSONObject().put("name","x-token").put("value","a\r\nInjected: yes"))));
        rejects(()->ModelSettings.headers(new JSONArray().put(new JSONObject().put("name","X-Token").put("value","one")).put(new JSONObject().put("name","x-token").put("value","two"))));
        require(ModelSettings.redact("old-key secret-gateway Bearer custom-token",custom).equals("[已隐藏] [已隐藏] [已隐藏]"));
        JSONObject headersOnly=ModelSettings.credentials("llm",changed,new JSONObject().put("operation","clear").put("headers",headers),existing);require(!headersOnly.has("llmKey"));require(ModelSettings.configured(headersOnly));
        rejects(()->ModelSettings.credentials("llm",changed,new JSONObject().put("headers",headers),existing));
        require(ModelSettings.configured(ModelSettings.credentials("llm",changed,new JSONObject().put("headers",headers),new JSONObject())));
        JSONObject discovery=new JSONObject(settings.toString()).put("llmModel","");require(ModelSettings.credentials("llm",discovery,new JSONObject(),existing,false).getString("llmKey").equals("old-key"));rejects(()->ModelSettings.credentials("llm",discovery,new JSONObject(),existing));
        JSONObject listPatch=new JSONObject().put("llmModels",new JSONArray().put("first").put("first")).put("llmProvider","other").put("llmProviderName","网关");JSONObject withModels=ModelSettings.apply("llm",previous,listPatch);require(withModels.getJSONArray("llmModels").toString().equals("[\"first\",\"model\"]"));require(ModelSettings.matches(withModels,listPatch)==false);
        System.out.println("PASS ModelSettings: "+checks+" checks (temporary credentials, address binding, clear/replace, timeout bounds, patch isolation)");
    }
}

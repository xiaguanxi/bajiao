package com.vocast.app;

import java.net.URL;
import java.util.Iterator;
import org.json.JSONObject;

/** Validation shared by saved model configurations and temporary draft tests. */
final class ModelSettings {
    static String base(String value) throws Exception {
        String base=value.trim().replaceAll("/+$", "");
        URL url=new URL(base);
        if(!"https".equals(url.getProtocol())||url.getHost().isEmpty()||url.getUserInfo()!=null||url.getQuery()!=null||url.getRef()!=null)
            throw new Exception("请输入不含账号、查询参数和片段的 HTTPS 服务地址");
        return base;
    }
    static int timeout(JSONObject settings,String key,int fallback,int min,int max) throws Exception {
        if(!settings.has(key))return fallback*1000;
        String raw=String.valueOf(settings.get(key));
        if(!raw.matches("[0-9]+"))throw new Exception("请求超时必须为有效的整数秒数");
        long value;try{value=Long.parseLong(raw);}catch(NumberFormatException error){throw new Exception("请求超时超出允许范围");}
        if(value<min||value>max)throw new Exception("请求超时超出允许范围");
        return (int)value*1000;
    }
    static JSONObject credentials(String provider,JSONObject settings,JSONObject change,JSONObject existing) throws Exception {
        if(!"llm".equals(provider)&&!"tts".equals(provider))throw new Exception("无效模型类型");
        JSONObject next=new JSONObject(existing.toString());next.remove("_modelSave");
        String field="llm".equals(provider)?"llmKey":"ttsKey",operation=change.optString("operation","keep");
        if("replace".equals(operation)){
            String key=change.optString("key").trim();if(key.isEmpty())throw new Exception("请填写 API Key");next.put(field,key);
        }else if("clear".equals(operation))next.remove(field);
        else if(!"keep".equals(operation))throw new Exception("无效密钥操作");
        if("llm".equals(provider)){
            String target=base(settings.optString("llmBase"));
            if(!"replace".equals(operation)&&!target.equals(existing.optString("llmBase","https://api.minimax.cn/v1")))
                throw new Exception("服务地址已改变，请填写对应密钥");
            if(settings.optString("llmModel").trim().isEmpty())throw new Exception("请填写模型 ID");
            if(!"openai".equals(settings.optString("llmProtocol"))&&!"anthropic".equals(settings.optString("llmProtocol")))throw new Exception("无效接口协议");
            next.put("llmBase",target);
        }
        return next;
    }
    static JSONObject apply(String provider,JSONObject previous,JSONObject patch) throws Exception {
        JSONObject next=new JSONObject(previous.toString());
        for(Iterator<String> it=patch.keys();it.hasNext();){String key=it.next();
            if(!"llm".equals(provider)||!("llmBase".equals(key)||"llmModel".equals(key)||"llmProtocol".equals(key)))throw new Exception("无效模型配置字段");
            next.put(key,patch.get(key));
        }
        if("llm".equals(provider)){next.put("llmBase",base(next.optString("llmBase")));next.put("llmModel",next.optString("llmModel").trim());next.put("llmUserConfigured",true);}
        return next;
    }
    static boolean matches(JSONObject current,JSONObject patch){
        if(current==null)return false;
        for(Iterator<String> it=patch.keys();it.hasNext();){String key=it.next();if(!String.valueOf(current.opt(key)).equals(String.valueOf(patch.opt(key))))return false;}
        return true;
    }
}

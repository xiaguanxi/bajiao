package com.vocast.app;

import java.net.URL;
import java.util.Iterator;
import java.util.Map;
import java.util.TreeMap;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/** Validation shared by saved model configurations and temporary draft tests. */
final class ModelSettings {
    static final String[] FIELDS={"llmBase","llmModel","llmProtocol","llmProvider","llmProviderName","llmModels"};
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
    static boolean protocol(String value){return "openai".equals(value)||"responses".equals(value)||"anthropic".equals(value);}
    static String endpoint(JSONObject settings,boolean models) throws Exception {
        String root=base(settings.optString("llmBase")).replaceAll("/(chat/completions|responses|messages|models)$","");
        if(new URL(root).getPath().isEmpty()||("anthropic".equals(settings.optString("llmProtocol"))&&!root.matches(".*/v[0-9]+$")))root+="/v1";
        return root+(models?"/models":"anthropic".equals(settings.optString("llmProtocol"))?"/messages":"responses".equals(settings.optString("llmProtocol"))?"/responses":"/chat/completions");
    }
    static JSONArray headers(JSONArray rows) throws Exception {
        JSONArray result=new JSONArray();if(rows==null)return result;if(rows.length()>64)throw new Exception("自定义 Headers 最多添加 64 项");
        Set<String> names=new HashSet<>();
        for(int i=0;i<rows.length();i++){
            JSONObject row=rows.getJSONObject(i);String name=row.getString("name").trim(),value=row.getString("value"),lower=name.toLowerCase(java.util.Locale.ROOT);
            if(!name.matches("[!#$%&'*+.^_`|~0-9A-Za-z-]+"))throw new Exception("请填写有效的 Header 名称");
            if(java.util.Arrays.asList("host","content-length","connection","transfer-encoding","upgrade","expect","trailer","te").contains(lower))throw new Exception("不能自定义 Host、连接或请求长度相关的 Header");
            if(!names.add(lower))throw new Exception("Header 名称不能重复（不区分大小写）");
            for(int j=0;j<value.length();j++){char c=value.charAt(j);if(c!='\t'&&(c<32||c==127||c>255))throw new Exception("Header 值不能包含换行、控制字符或非 HTTP 字符");}
            result.put(new JSONObject().put("name",name).put("value",value));
        }return result;
    }
    static Map<String,String> requestHeaders(JSONObject settings,JSONObject keys,boolean tts) throws Exception {
        Map<String,String> result=new TreeMap<>(String.CASE_INSENSITIVE_ORDER);result.put("Content-Type","application/json");
        String key=keys.optString(tts?"ttsKey":"llmKey");boolean anthropic=!tts&&"anthropic".equals(settings.optString("llmProtocol"));
        if(!key.isEmpty())result.put(anthropic?"x-api-key":"Authorization",anthropic?key:"Bearer "+key);
        if(anthropic)result.put("anthropic-version","2023-06-01");
        if(!tts){JSONArray rows=headers(keys.optJSONArray("llmHeaders"));for(int i=0;i<rows.length();i++){JSONObject row=rows.getJSONObject(i);result.put(row.getString("name"),row.getString("value"));}}
        return result;
    }
    static boolean configured(JSONObject keys){return !keys.optString("llmKey").isEmpty()||keys.optJSONArray("llmHeaders")!=null&&keys.optJSONArray("llmHeaders").length()>0;}
    static String redact(String message,JSONObject keys){
        for(String name:new String[]{"llmKey","ttsKey"}){String value=keys.optString(name);if(!value.isEmpty())message=message.replace(value,"[已隐藏]");}
        JSONArray rows=keys.optJSONArray("llmHeaders");if(rows!=null)for(int i=0;i<rows.length();i++){JSONObject row=rows.optJSONObject(i);String value=row==null?"":row.optString("value");if(!value.isEmpty())message=message.replace(value,"[已隐藏]");}
        return message;
    }
    static JSONObject credentials(String provider,JSONObject settings,JSONObject change,JSONObject existing) throws Exception {
        return credentials(provider,settings,change,existing,true);
    }
    static JSONObject credentials(String provider,JSONObject settings,JSONObject change,JSONObject existing,boolean requireModel) throws Exception {
        if(!"llm".equals(provider)&&!"tts".equals(provider))throw new Exception("无效模型类型");
        JSONObject next=new JSONObject(existing.toString());next.remove("_modelSave");
        String field="llm".equals(provider)?"llmKey":"ttsKey",operation=change.optString("operation","keep");
        if("replace".equals(operation)){
            String key=change.optString("key").trim();if(key.isEmpty())throw new Exception("请填写 API Key");next.put(field,key);
        }else if("clear".equals(operation))next.remove(field);
        else if(!"keep".equals(operation))throw new Exception("无效密钥操作");
        if("llm".equals(provider)){
            String target=base(settings.optString("llmBase"));
            if(change.has("headers"))next.put("llmHeaders",headers(change.getJSONArray("headers")));
            boolean newHeaders=change.has("headers")&&next.getJSONArray("llmHeaders").length()>0;
            boolean freshHeaders=newHeaders&&!configured(existing);
            if(!"replace".equals(operation)&&!("clear".equals(operation)&&newHeaders)&&!freshHeaders&&!target.equals(existing.optString("llmBase","https://api.minimax.cn/v1")))
                throw new Exception("服务地址已改变，请填写对应密钥");
            if(requireModel&&settings.optString("llmModel").trim().isEmpty())throw new Exception("请填写模型 ID");
            if(!protocol(settings.optString("llmProtocol")))throw new Exception("无效 API 格式");
            next.put("llmBase",target);
        }
        return next;
    }
    static JSONObject apply(String provider,JSONObject previous,JSONObject patch) throws Exception {
        JSONObject next=new JSONObject(previous.toString());
        for(Iterator<String> it=patch.keys();it.hasNext();){String key=it.next();
            if(!"llm".equals(provider)||!java.util.Arrays.asList(FIELDS).contains(key))throw new Exception("无效模型配置字段");
            next.put(key,patch.get(key));
        }
        if("llm".equals(provider)){
            next.put("llmBase",base(next.optString("llmBase")));next.put("llmModel",next.optString("llmModel").trim());next.put("llmUserConfigured",true);
            if(!java.util.Arrays.asList("other","openai","anthropic","minimax","mimo").contains(next.optString("llmProvider","other")))throw new Exception("无效提供商");
            JSONArray models=next.optJSONArray("llmModels");if(models!=null){Set<String> ids=new java.util.LinkedHashSet<>();for(int i=0;i<models.length();i++){String id=models.getString(i).trim();if(!id.isEmpty())ids.add(id);}if(!next.optString("llmModel").isEmpty())ids.add(next.optString("llmModel"));next.put("llmModels",new JSONArray(ids));}
        }
        return next;
    }
    static boolean matches(JSONObject current,JSONObject patch){
        if(current==null)return false;
        for(Iterator<String> it=patch.keys();it.hasNext();){String key=it.next();if(!String.valueOf(current.opt(key)).equals(String.valueOf(patch.opt(key))))return false;}
        return true;
    }
}

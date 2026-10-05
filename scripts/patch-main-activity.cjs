
const fs = require('fs');
let code = fs.readFileSync('app/src/main/java/com/vocast/app/MainActivity.java', 'utf8');

const target = 'case "play":{String audioId=p.getString("id");String path=audio.get(audioId).getAbsolutePath();Intent i=new Intent(MainActivity.this,PlaybackService.class).setAction(PlaybackService.ACTION_PLAY).putExtra("id",audioId).putExtra("path",path).putExtra("title",p.optString("title","Vocast")).putExtra("bookTitle",p.optString("bookTitle","Vocast")).putExtra("artist",p.optString("artist","多角色演绎 · Vocast")).putExtra("duration",p.optInt("duration",0)).putExtra("hasPrev",p.optBoolean("hasPrev",false)).putExtra("hasNext",p.optBoolean("hasNext",false)).putExtra("coverPath",p.optString("coverPath",""));startForegroundService(i);result=true;break;}';

const rep = 'case "play":{String audioId=p.getString("id");String path=audio.get(audioId).getAbsolutePath();Intent i=new Intent(MainActivity.this,PlaybackService.class).setAction(PlaybackService.ACTION_PLAY).putExtra("id",audioId).putExtra("path",path).putExtra("title",p.optString("title","Vocast")).putExtra("bookTitle",p.optString("bookTitle","Vocast")).putExtra("artist",p.optString("artist","多角色演绎 · Vocast")).putExtra("duration",p.optInt("duration",0)).putExtra("position",p.optInt("position",0)).putExtra("speed",(float)p.optDouble("speed",1.0)).putExtra("hasPrev",p.optBoolean("hasPrev",false)).putExtra("hasNext",p.optBoolean("hasNext",false)).putExtra("coverPath",p.optString("coverPath",""));startForegroundService(i);result=true;break;}\n' +
'                    case "deleteAudio":{List<String> toDelete=new ArrayList<>();if(p.has("ids")){JSONArray a=p.getJSONArray("ids");for(int i=0;i<a.length();i++)toDelete.add(a.getString(i));}else if(p.has("id")){toDelete.add(p.getString("id"));}int count=0;for(String aid:toDelete){if(audio.delete(aid))count++;}result=count;break;}\n' +
'                    case "audioStats":{result=audio.getStats();break;}\n' +
'                    case "cleanupAudio":{Set<String> keepSet=new HashSet<>();if(p.has("keepIds")){JSONArray a=p.getJSONArray("keepIds");for(int i=0;i<a.length();i++)keepSet.add(a.getString(i));}result=audio.cleanup(keepSet);break;}';

if (code.includes(target)) {
  code = code.replace(target, rep);
  fs.writeFileSync('app/src/main/java/com/vocast/app/MainActivity.java', code, 'utf8');
  console.log('SUCCESS');
} else {
  console.log('NOT FOUND');
}


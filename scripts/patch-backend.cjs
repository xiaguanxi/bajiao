
const fs = require('node:fs');

// 1. AudioFiles.java
{
  const file = 'app/src/main/java/com/vocast/app/AudioFiles.java';
  let content = fs.readFileSync(file, 'utf8');
  if (!content.includes('getFileDirect')) {
    const target = 'File get(String id) throws Exception {';
    const addition = [
      'File getFileDirect(String id) {',
      '        if(id==null||!id.matches("[a-f0-9]{64}\\.(wav|mp3)"))return null;',
      '        return new File(dir,id);',
      '    }',
      '    boolean delete(String id) {',
      '        File f=getFileDirect(id);',
      '        return f!=null&&f.exists()&&f.delete();',
      '    }',
      '    JSONObject getStats() {',
      '        File[] files=dir.listFiles();',
      '        long totalBytes=0;',
      '        int count=0;',
      '        if(files!=null){',
      '            for(File f:files){',
      '                if(f.isFile()&&(f.getName().endsWith(".wav")||f.getName().endsWith(".mp3"))){',
      '                    totalBytes+=f.length();',
      '                    count++;',
      '                }',
      '            }',
      '        }',
      '        JSONObject obj=new JSONObject();',
      '        try{',
      '            obj.put("totalBytes",totalBytes);',
      '            obj.put("fileCount",count);',
      '            obj.put("totalMb",Math.round(totalBytes/1024.0/1024.0*10.0)/10.0);',
      '        }catch(Exception ignored){}',
      '        return obj;',
      '    }',
      '    JSONObject cleanup(Set<String> keepIds) {',
      '        File[] files=dir.listFiles();',
      '        long freed=0;',
      '        int deleted=0;',
      '        if(files!=null){',
      '            for(File f:files){',
      '                if(f.isFile()&&(f.getName().endsWith(".wav")||f.getName().endsWith(".mp3"))){',
      '                    if(keepIds==null||!keepIds.contains(f.getName())){',
      '                        freed+=f.length();',
      '                        if(f.delete())deleted++;',
      '                    }',
      '                }',
      '            }',
      '        }',
      '        JSONObject obj=new JSONObject();',
      '        try{obj.put("deletedCount",deleted);obj.put("freedBytes",freed);obj.put("freedMb",Math.round(freed/1024.0/1024.0*10.0)/10.0);}catch(Exception ignored){}',
      '        return obj;',
      '    }',
      '    '
    ].join('\n    ');
    content = content.replace(target, addition + target);
    fs.writeFileSync(file, content, 'utf8');
    console.log('AudioFiles.java patched');
  }
}

// 2. MainActivity.java
{
  const file = 'app/src/main/java/com/vocast/app/MainActivity.java';
  let content = fs.readFileSync(file, 'utf8');
  if (!content.includes('case "audioStats":')) {
    const target = 'case "mergeAudio":result=audio.merge(toList(p.getJSONArray("ids")),toInts(p.optJSONArray("pauses")));break;';
    const addition = [
      'case "audioStats":result=audio.getStats();break;',
      'case "deleteAudio":{',
      '    org.json.JSONArray arr=p.optJSONArray("ids");',
      '    long freed=0;int count=0;',
      '    if(arr!=null){for(int i=0;i<arr.length();i++){String aid=arr.getString(i);File f=audio.getFileDirect(aid);if(f!=null&&f.exists()){freed+=f.length();if(f.delete())count++;}}}',
      '    else if(p.has("id")){String aid=p.getString("id");File f=audio.getFileDirect(aid);if(f!=null&&f.exists()){freed+=f.length();if(f.delete())count++;}}',
      '    org.json.JSONObject obj=new org.json.JSONObject();obj.put("count",count);obj.put("freedBytes",freed);obj.put("freedMb",Math.round(freed/1024.0/1024.0*10.0)/10.0);result=obj;break;',
      '}',
      'case "cleanupAudio":{',
      '    org.json.JSONArray keepArr=p.optJSONArray("keepIds");',
      '    java.util.Set<String> keepSet=new java.util.HashSet<>();',
      '    if(keepArr!=null){for(int i=0;i<keepArr.length();i++)keepSet.add(keepArr.getString(i));}',
      '    result=audio.cleanup(keepSet);break;',
      '}'
    ].join('');
    content = content.replace(target, target + addition);
  }
  // also in MainActivity.java case "play": pass position
  if (content.includes('intent.putExtra("duration",p.optInt("duration",0));') && !content.includes('intent.putExtra("position",p.optInt("position",0));')) {
    content = content.replace(
      'intent.putExtra("duration",p.optInt("duration",0));',
      'intent.putExtra("duration",p.optInt("duration",0));intent.putExtra("position",p.optInt("position",0));'
    );
  }
  fs.writeFileSync(file, content, 'utf8');
  console.log('MainActivity.java patched');
}

// 3. PlaybackService.java
{
  const file = 'app/src/main/java/com/vocast/app/PlaybackService.java';
  let content = fs.readFileSync(file, 'utf8');
  // In handlePlayAction, read startPosition
  if (!content.includes('int startPosition = intent.getIntExtra("position", 0);')) {
    const target = 'durationMs = intent.getIntExtra("duration", 0);';
    content = content.replace(target, target + '\n        int startPosition = intent.getIntExtra("position", 0);');
    // In onPreparedListener, seek to startPosition if > 0
    const prepTarget = 'durationMs = mp.getDuration();';
    content = content.replace(
      prepTarget,
      prepTarget + '\n                if (startPosition > 0 && startPosition < durationMs) mp.seekTo(startPosition);'
    );
  }
  // In setOnCompletionListener, emit "completion"
  if (!content.includes('notifyClientEvent("completion", durationMs);')) {
    const compTarget = 'player.setOnCompletionListener(mp -> {';
    content = content.replace(
      compTarget,
      compTarget + '\n                notifyClientEvent("completion", durationMs);'
    );
  }
  fs.writeFileSync(file, content, 'utf8');
  console.log('PlaybackService.java patched');
}


"""Import the approved prototype while retaining the Android production bridge."""
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
source = Path(r'C:\Users\xiagu\AppData\Roaming\Open Design\namespaces\release-stable-win\data\projects\825795b9-a32a-4eca-86a5-c878a3be9a2c\assets')
assets = root / 'app/src/main/assets'
app = (source / 'app.js').read_text(encoding='utf-8')
app = app.replace('原型演示：生成与试听使用系统朗读，不代表真实 MiMo 声线。', '试听当前参考样本；生成试音或重新设计会调用 MiMo。')
app = app.replace('演示连接测试', '测试连接').replace('演示合成测试', '测试合成')
app = app.replace('原型仅保存普通配置，演示连接反馈，不调用真实模型；请勿输入真实密钥。', '密钥使用 Android Keystore 加密保存。测试连接会调用当前填写的模型。')
app = app.replace('原型不保存真实密钥。试听使用浏览器系统朗读，不代表 MiMo 音色或 WAV 成品。', '密钥使用 Android Keystore 加密保存。测试合成会调用 MiMo 并生成可试听音频。')
app = app.replace('此浏览器原型使用本地演示数据，不保存真实密钥。原 Android 应用使用 Keystore 加密。', '书库与音频保存在本机，API 密钥使用 Android Keystore 加密保存。')
app = app.replace('原型制作采用本地模拟，试听使用系统朗读；不提供 Android 后台服务和通知。', '制作与播放支持后台服务；遇到需要确认或失败的任务时会通知你。')
# Keep the native HTTPS contract; saved configurations remain unchanged on upgrade.
app = app.replace("if(!['http:','https:'].includes(parsed.protocol))throw Error('地址需以 http:// 或 https:// 开头');", "if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash)throw Error('请填写不含账号、查询参数和片段的 HTTPS Base URL');")
# Library and editor must still pass through the shared native preview toolbar.
app = app.replace("if(page==='voices')return voiceLibraryHtml(state);", "if(page==='voices')h=voiceLibraryHtml(state);")
app = app.replace("if(page==='voicedetail')return voiceEditorHtml();", "if(page==='voicedetail')h=voiceEditorHtml();")
start = app.index(" if(page==='voices'&&voiceTab==='preset')return", app.index('function enhancePage('))
end = app.index(" if(page==='choose')h=chooseVoiceHtml(state);", start)
app = app[:start] + app[end:]
# Keep the existing preview controls reachable while a segment sheet is open.
# The sheet makes the underlying main region inert on supported WebViews.
preview_line = next(line for line in app.splitlines() if 'if(preview)h=`<div class="vc-preview-strip"' in line)
preview_markup = preview_line.split('if(preview)h=', 1)[1].rsplit('+h;', 1)[0]
app = app.replace(preview_line, ' if(preview&&!segmentPanel)h=previewToolbar()+h;')
app = app.replace('function enhancePage(', "function previewToolbar(){return preview?" + preview_markup + ":'';}\nfunction enhancePage(", 1)
app = app.replace('</section></div><footer class="vc-segment-footer">', '</section>${previewToolbar()}</div><footer class="vc-segment-footer">', 1)
# A missing legacy audio file must not leave a phantom preview/player context.
app = app.replace("streamState=null;preview={id,title};playingId=id;playingBookId=null;playingChapterId=null;await device.call('play',{id,title,bookTitle:'样本试听',hasPrev:false,hasNext:false});", "const previous=[preview,playingId,playingBookId,playingChapterId,streamState];streamState=null;preview={id,title};playingId=id;playingBookId=null;playingChapterId=null;try{await device.call('play',{id,title,bookTitle:'样本试听',hasPrev:false,hasNext:false});}catch(error){[preview,playingId,playingBookId,playingChapterId,streamState]=previous;render();throw error;}")
(assets / 'app.js').write_text(app, encoding='utf-8')
(assets / 'prototype.css').write_bytes((source / 'prototype.css').read_bytes())
css = (source / 'prototype.css').read_text(encoding='utf-8')
layout = css.split('@layer od-layout {', 1)[1].split('/* /OD-LAYOUT-PRIMITIVES v1 */', 1)[0].rsplit('}', 1)[0]
layout = re.sub(r':where\(([^)]+)\) > :where\(([^)]+)\)', lambda m: ', '.join(a.strip()+' > '+b.strip() for a in m[1].split(',') for b in m[2].split(',')), layout)
(assets / 'layout-compat.css').write_text('/* Low-priority prototype primitives for WebViews without CSS layers. */\n'+layout, encoding='utf-8')
core = (source / 'core.js').read_text(encoding='utf-8')
core = core.replace("llmBase:'https://api.minimax.cn/v1',llmModel:'MiniMax-M3'", "llmBase:'',llmModel:''")
legacy_retry_helpers = "function isNetworkRetryable(e){\n if(isContentRejected(e))return false;\n if(e?.retryable===true)return true;\n const s=String(e?.message||e?.detail||e?.code||e||'');\n return /网络|超时|timeout|timed out|fetch failed|network|ECONN|ENOTFOUND|EAI_AGAIN|EPIPE|socket|HTTP (429|5\\d\\d|408)\\b/i.test(s)||e?.status===429||e?.status===408||(e?.status>=500&&e?.status<600);\n}\n// 自动重试策略：指数退避 30s 起，2^x 上限 10 分钟，最多 10 次。\nconst NET_RETRY_BASE_MS=30000, NET_RETRY_MAX_MS=600000, NET_RETRY_LIMIT=10;\nfunction nextRetryDelay(retryCount){return Math.min(NET_RETRY_MAX_MS,NET_RETRY_BASE_MS*Math.pow(2,Math.max(0,retryCount||0)));}\n"
core = core.replace('function parseJson', legacy_retry_helpers + 'function parseJson').replace('return {isContentRejected,', 'return {isNetworkRetryable,nextRetryDelay,NET_RETRY_BASE_MS,NET_RETRY_MAX_MS,NET_RETRY_LIMIT,isContentRejected,')
(assets / 'core.js').write_text(core, encoding='utf-8')
# Native Android network state is authoritative; navigator.connection.type is
# absent on several supported WebViews. Keep the prototype's consent scopes.
network = (source / 'production-network.js').read_text(encoding='utf-8')
network = network.replace("function state(){", "function state(){if(['wifi','other','offline','unknown'].includes(window.productionNativeNetwork))return window.productionNativeNetwork;")
network = network.replace('this._productionPending||=new Map()', 'this._productionPending||(this._productionPending=new Map())')
network = network.replace('e._productionGrants||=new Set()', 'e._productionGrants||(e._productionGrants=new Set())')
network = network.replace("window.addEventListener('online',update);", "window.onNativeNetworkChange=function(n){window.productionNativeNetwork=n;update();};\nif(window.Native)device.call('networkState').then(window.onNativeNetworkChange).catch(()=>{});\nwindow.addEventListener('online',update);")
(assets / 'production-network.js').write_text(network, encoding='utf-8')
index = (assets / 'index.html').read_text(encoding='utf-8')
if 'prototype.css' not in index:
    index = index.replace('</head>', '<link rel="stylesheet" href="prototype.css"></head>')
if 'webview-compat.css' not in index:
    index = index.replace('</head>', '<link rel="stylesheet" href="webview-compat.css"></head>')
if 'webview-compat.js' not in index:
    index = index.replace('<script src="lucide.js">', '<script src="webview-compat.js"></script><script src="lucide.js">')
if 'production-network.js' not in index:
    index = index.replace('<script src="playback-prompts.js">', '<script src="production-network.js"></script><script src="playback-prompts.js">')
(assets / 'index.html').write_text(index, encoding='utf-8')
gradle = root / 'app/build.gradle'
build = gradle.read_text(encoding='utf-8')
build = re.sub(r"versionCode \d+; versionName '[^']+'", "versionCode 71; versionName '0.8.1'", build)
gradle.write_text(build, encoding='utf-8')
print('Imported approved UI; retained native bridge and production services. Version 0.8.1 (71).')

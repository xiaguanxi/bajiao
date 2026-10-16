"""Assemble local delivery evidence after the UI and APK checks pass."""
from pathlib import Path
from hashlib import sha256
from zipfile import ZipFile
import json
import re
from html import escape
from PIL import Image, ImageChops

root = Path(__file__).resolve().parents[1]
out = root / 'artifacts/ui-migration-v081'
apk = root / 'artifacts/Vocast-0.8.1-new-ui.apk'
browser = json.loads((out / 'browser-report.json').read_text(encoding='utf-8-sig'))
android = json.loads((out / 'android-report.json').read_text(encoding='utf-8-sig'))
assert browser['passed'] and android['passed']
regression = (out / 'final-regression.log').read_text(encoding='utf-8-sig')
passed = re.search(r'ℹ pass (\d+)', regression)
failed = re.search(r'ℹ fail (\d+)', regression)
assert passed and failed and failed[1] == '0', 'Final regression must pass'
assert 'BUILD SUCCESSFUL' in (out / 'build.log').read_text(encoding='utf-8-sig')
visual = []
for a in sorted(out.glob('app-*.png')):
    b = out / ('reference-' + a.name[4:])
    if not b.exists():
        continue
    x, y = Image.open(a).convert('RGB'), Image.open(b).convert('RGB')
    assert x.size == y.size
    difference = ImageChops.difference(x, y)
    pixels = list(difference.getdata())
    changed = sum(max(p) > 8 for p in pixels)
    visual.append({'page': a.stem[4:], 'size': x.size, 'changedPixels': changed, 'ratio': changed / len(pixels), 'maxChannelDelta': max(high for low, high in difference.getextrema())})
assert len(visual) == 17 and all(v['maxChannelDelta'] == 0 for v in visual)
(out / 'visual-comparison.json').write_text(json.dumps(visual, indent=2), encoding='utf-8')
with ZipFile(apk) as package:
    names = set(package.namelist())
    assert 'assets/browser-adapter.js' not in names
    assert {'assets/bridge.js', 'assets/production-network.js', 'assets/prototype.css', 'assets/layout-compat.css', 'assets/webview-compat.js', 'assets/webview-compat.css'} <= names
    for name in names:
        if name.startswith('assets/') and not name.endswith('/'):
            source = root / 'app/src/main' / name
            assert source.is_file() and package.read(name) == source.read_bytes(), name
source_files = json.loads((out / 'source-hashes.json').read_text(encoding='utf-8-sig'))
for entry in source_files:
    assert sha256(Path(entry['Path']).read_bytes()).hexdigest().upper() == entry['Hash'], 'Prototype changed during migration'
manifest = {
    'version': '0.8.1', 'versionCode': 71, 'date': '2026-10-16', 'signature': 'Android debug signing key',
    'apk': str(apk), 'bytes': apk.stat().st_size, 'sha256': sha256(apk.read_bytes()).hexdigest(),
    'prototypeProject': '825795b9-a32a-4eca-86a5-c878a3be9a2c',
    'regressionPassed': int(passed[1]), 'browserChecks': len(browser['checks']),
    'androidChecks': len(android['checks']), 'visualComparisons': visual,
    'device': android['device'], 'audioFilesPreserved': android['audioHashLines'],
    'limits': ['Android emulator verification; no physical device or other Android versions tested.',
               'Browser model calls use native protocol fixtures. One MiMo TTS call occurred during an earlier native test-harness misclick; final run made no additional calls.',
               'Debug-signed APK; existing installed app must have the same signing key to upgrade.'],
    'nativeRequestIncident': json.loads((out / 'native-request-incident.json').read_text(encoding='utf-8')),
    'productionAdaptations': ['Native bridge, import/export, production and playback services, and Keystore retained.',
                              'Browser demo labels replaced with actual Android behavior.',
                              'Voice editor and library retain shared native preview controls.',
                              'HTTPS configuration validation matches native request implementation.',
                              'Factory WebView 83 DOM and layout compatibility retained and extended.',
                              'Android ConnectivityManager supplies real Wi-Fi/offline changes to the production gate.',
                              'Request retries stop at the configured bound; one-time network consent is scoped to selected chapters.',
                              'Segment sheet retains accessible native preview pause/stop controls.']
}
(out / 'delivery.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
items = ''.join('<li>' + escape(s) + '</li>' for s in browser['checks'] + android['checks'])
pairs = ''.join(f'<details><summary>{escape(v["page"]) } · 像素一致</summary><div class="pair"><figure><img src="reference-{v["page"]}.png"><figcaption>最新原型</figcaption></figure><figure><img src="app-{v["page"]}.png"><figcaption>新版应用</figcaption></figure></div></details>' for v in visual)
native = ''.join(f'<figure><img src="{p.name}"><figcaption>{escape(p.stem)}</figcaption></figure>' for p in sorted(out.glob('android-*.png')) if p.stem != 'android-failure')
html = f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vocast 0.8.1 UI 迁移验收</title><style>
body{{max-width:1080px;margin:40px auto;padding:0 24px;background:#f8f7f2;color:#243b31;font:16px/1.7 system-ui}}a{{color:#284f3d}}code{{overflow-wrap:anywhere}}details{{border-top:1px solid #cdd6cc;padding:12px 0}}summary{{cursor:pointer}}.pair,.gallery{{display:flex;flex-wrap:wrap;gap:20px}}figure{{margin:12px 0}}img{{display:block;max-width:100%;width:300px;border:1px solid #d4dcd2}}figcaption{{font-size:14px}}li{{margin-bottom:8px}}</style>
<h1>Vocast 0.8.1 · 新版 UI</h1><p>2026-10-16 · 原型项目 {manifest['prototypeProject']}</p>
<p><a href="../{apk.name}">下载 APK</a> · <a href="delivery.json">交付清单</a> · <a href="final-regression.log">完整回归日志</a> · <a href="build.log">构建与 lint</a></p>
<p>{manifest['regressionPassed']} 项回归通过；{manifest['browserChecks']} 组浏览器流程通过；{manifest['androidChecks']} 组 Android 触摸流程通过。17 个页面与弹层在相同数据、412×835 视口和禁用动画条件下逐像素一致，所有颜色通道的差值均为零。</p>
<p>APK SHA-256：<code>{manifest['sha256']}</code></p>
<p>真实 Android 11 / API 30 模拟器，出厂 WebView 83。保留原有书库、角色绑定和 {manifest['audioFilesPreserved']} 个音频文件的 SHA-256。验证使用 Android 触摸和按键；CDP 仅读取状态。</p>
<p>保留真实 Android 导入、合成、播放与密钥存储。浏览器演示说明已替换为正式行为。早期设备验证脚本因遮挡判断缺失误触，触发 1 次 MiMo TTS 请求，已修正脚本并记录在 native-request-incident.json；最终设备回归无额外模型请求。未进行真机及其他 Android 版本验证。APK 使用 debug 签名。</p>
<h2>验证结果</h2><ul>{items}</ul><h2>原型与新版截图</h2>{pairs}<h2>Android 截图</h2><div class="gallery">{native}</div></html>'''
(out / 'report.html').write_text(html, encoding='utf-8')
print(json.dumps({'apk': str(apk), 'sha256': manifest['sha256'], 'regressions': manifest['regressionPassed'], 'visualPairs': len(visual), 'androidChecks': manifest['androidChecks']}, ensure_ascii=False))

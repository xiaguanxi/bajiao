// 在模拟器上重建可播书:推送已验收的 5 章 wav + 文本,直接写 run-as 文件,不经过重新制作。
// 运行: node scripts/seed-device-book.cjs
const cp = require('node:child_process'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const adb = path.resolve('.tools/android-sdk/platform-tools/adb.exe');
const run = (args) => cp.execFileSync(adb, args, { timeout: 120000, maxBuffer: 256 * 1024 * 1024 });
const audioDir = path.resolve('artifacts/device-e2e/audio');
// 注意: audio/chapters.json 是过期快照(哈希与字节数都对不上实际 wav),以 exports.json 为准
const chaptersMeta = JSON.parse(fs.readFileSync(path.resolve('artifacts/device-e2e/exports.json'), 'utf8'));
const bookFile = fs.readdirSync('books').find(x => x.endsWith('.txt'));
const { splitBook } = require('../app/src/main/assets/core.js');
const source = fs.readFileSync(path.join('books', bookFile));
let text;
try { text = new TextDecoder('gb18030').decode(source); } catch { text = source.toString('utf8'); }
const all = splitBook(text);
const first5 = all.filter(c => c.title !== '正文').slice(0, 5);
if (first5.length < 5) throw new Error('书不足 5 章');
// 1. 经 run-as 用 stdin 把小文件(章节 json/library)直接 tee 进应用目录;
// 大 wav(各 ~32MB,stdin 太慢)先放 /sdcard 再用 cat 重定向搬入(run-as 下读 /sdcard 被拒,改用两次中转:先 cat > /data/local/tmp 再 run-as 读)。
for (const m of chaptersMeta.slice(0, 5)) {
  const local = path.join(audioDir, 'chapter-' + String(m.number).padStart(4, '0') + '.wav');
  const buf = fs.readFileSync(local);
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  if (sha + '.wav' !== m.audio) throw new Error('本地 wav 与 manifest 不一致: ' + local);
  run(['push', local, '/data/local/tmp/seed-' + m.audio]);
}
run(['shell', 'run-as', 'com.vocast.app', 'mkdir', '-p', 'files/audio', 'files/chapters']);
// 2. 组装 library.json(头) + 各章节全文 json,按 SnapshotStore.save 的内容寻址规则写入
const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
const bookId = 'seed-book-' + rid(), now = Date.now();
const chapters = first5.map((c, i) => {
  const m = chaptersMeta[i];
  // 按句子切分(沿用 core.units,每行一句,和真实标注一致),时间戳按字数权重均分
  const { units } = require('../app/src/main/assets/core.js');
  const pieces = units(c.text).slice(0, 40);
  const segments = pieces.map((u, k) => ({ id: u.id, text: u.text, speaker: k % 3 === 1 ? '沈砚' : k % 3 === 2 ? '林晚' : '旁白', emotion: '自然朗读', confidence: 1, audio: 'seg-seed-' + i + '-' + k }));
  return {
    id: 'seed-ch-' + i, title: m.title, text: c.text, status: 'ready',
    audio: m.audio, duration: m.duration, pacingVersion: 1, summary: '', segments,
    listened: false, audioCleared: false, lastPlayedPosition: 0,
  };
});
const header = { version: 1, books: [{ id: bookId, name: 'vocast-novel', chapters: chapters.map(c => ({ id: c.id, title: c.title, status: c.status, audio: c.audio, duration: c.duration, pacingVersion: c.pacingVersion, summary: '', textLength: c.text.length, segmentCount: c.segments.length, listened: false, audioCleared: false, lastPlayedPosition: 0 })), characters: [{ name: '旁白', description: '叙述者', aliases: [], voice: 'preset:白桦' }, { name: '沈砚', description: '男声', aliases: [], voice: 'preset:白桦' }, { name: '林晚', description: '女声', aliases: [], voice: 'preset:茉莉' }], created: now, policy: null }], voices: [], tasks: [], settings: { llmBase: 'https://api.minimax.cn/v1', llmModel: 'MiniMax-M3', llmProtocol: 'openai', mode: 'manual', usePresets: false, retries: 2, autoDeletePlayed: false, keepRecentTwoChapters: false, playbackSpeed: 1, sleepTimer: 0, autoProduceUpcoming: true }, read: {}, usage: [] };
// 3. 把 header + 章节全文写进 run-as 区
const tmp = path.resolve('artifacts/device-e2e/seed');
fs.mkdirSync(tmp, { recursive: true });
const files = [];
fs.writeFileSync(path.join(tmp, 'library.json'), JSON.stringify(header));
files.push('library.json');
const refs = {};
for (const c of chapters) {
  const data = Buffer.from(JSON.stringify(c), 'utf8');
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  refs[c.id] = hash;
  fs.writeFileSync(path.join(tmp, hash + '.json'), data);
  files.push(hash + '.json');
}
for (const m of chaptersMeta.slice(0, 5)) files.push('audio:' + m.audio);
// 小文件(<20KB 章节 json/library)经 /data/local/tmp 中转:adb push 到 tmp 再 run-as 内 cat 重定向。
// (exec-in 经 stdin 传大内容会截断;run-as 直读 /sdcard 被拒,但 /data/local/tmp 可读。)
run(['push', path.join(tmp, 'library.json'), '/data/local/tmp/seed-library.json']);
for (const c of chapters) run(['push', path.join(tmp, refs[c.id] + '.json'), '/data/local/tmp/seed-' + refs[c.id] + '.json']);
run(['shell', 'run-as', 'com.vocast.app', 'cp', '/data/local/tmp/seed-library.json', 'files/library.json']);
for (const c of chapters) run(['shell', 'run-as', 'com.vocast.app', 'cp', '/data/local/tmp/seed-' + refs[c.id] + '.json', 'files/chapters/' + refs[c.id] + '.json']);
// 大 wav 从 /data/local/tmp 经 cat 重定向搬入
for (const m of chaptersMeta.slice(0, 5)) {
  run(['shell', 'run-as', 'com.vocast.app', 'cp', '/data/local/tmp/seed-' + m.audio, 'files/audio/' + m.audio]);
}
// 4. 给 header 补 storageRef(SnapshotStore.refs 要求),重新写回
header.books[0].chapters.forEach(c => { c.storageRef = refs[c.id]; });
fs.writeFileSync(path.join(tmp, 'library.json'), JSON.stringify(header));
run(['push', path.join(tmp, 'library.json'), '/data/local/tmp/seed-library.json']);
run(['shell', 'run-as', 'com.vocast.app', 'cp', '/data/local/tmp/seed-library.json', 'files/library.json']);
// 5. 重启应用,确认可读
run(['shell', 'am', 'force-stop', 'com.vocast.app']);
run(['shell', 'am', 'start', '-W', '-n', 'com.vocast.app/.MainActivity']);
console.log('SEEDED bookId=' + bookId, chapters.map(c => c.title).join(' | '));

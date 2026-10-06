
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// 1. Check syntax and definitions in app.js and core.js
const coreCode = fs.readFileSync('app/src/main/assets/core.js', 'utf8');
const appCode = fs.readFileSync('app/src/main/assets/app.js', 'utf8');
const appCss = fs.readFileSync('app/src/main/assets/app.css', 'utf8');

console.log('--- 1. Testing Code Integrity ---');
assert(coreCode.includes('performAutoCleanup'), 'core.js must have performAutoCleanup');
assert(coreCode.includes('clearAllListened'), 'core.js must have clearAllListened');
assert(coreCode.includes('clearExpiredAudio'), 'core.js must have clearExpiredAudio');
assert(coreCode.includes('keepOnlyCurrentBook'), 'core.js must have keepOnlyCurrentBook');
assert(coreCode.includes('archiveBook'), 'core.js must have archiveBook');
assert(coreCode.includes('batchEnqueue'), 'core.js must have batchEnqueue');
assert(coreCode.includes('computeSegmentTimestamps'), 'core.js must have computeSegmentTimestamps');

assert(appCode.includes('vc-transcript-panel'), 'app.js must render vc-transcript-panel');
assert(appCode.includes('seekseg:'), 'app.js must handle seekseg');
assert(appCode.includes('setkeepcount'), 'app.js must support setkeepcount');
assert(appCode.includes('[Vocast有声书]《'), 'app.js must format export title cleanly');
assert(appCode.includes('STORAGE DASHBOARD'), 'app.js must include storage dashboard');
assert(appCode.includes('vc-storage-bar'), 'app.js must include storage bar');
assert(appCode.includes('batchModalBookId'), 'app.js must handle batch modal');

assert(appCss.includes('vc-transcript-panel'), 'app.css must have vc-transcript-panel styles');
assert(appCss.includes('vc-storage-ratio-card'), 'app.css must have storage card styles');
console.log('✓ Code integrity checks passed!');

// 2. Engine lifecycle operations
console.log('--- 2. Testing Core Lifecycle Operations ---');
const { Engine } = require('../app/src/main/assets/core.js');

const mockFiles = new Map();
const mockDevice = {
  deleteAudio: async (id) => {
    let count = 0, freedBytes = 0;
    if (Array.isArray(id)) {
      for (const i of id) {
        if (mockFiles.has(i)) {
          freedBytes += mockFiles.get(i);
          mockFiles.delete(i);
          count++;
        }
      }
    } else if (id && mockFiles.has(id)) {
      freedBytes += mockFiles.get(id);
      mockFiles.delete(id);
      count = 1;
    }
    return { count, freedBytes, freedMb: Math.round(freedBytes/1024/1024*10)/10 };
  },
  audioStats: async () => {
    let totalBytes = 0;
    const fileSizes = {};
    for (const [k, v] of mockFiles.entries()) {
      totalBytes += v;
      fileSizes[k] = v;
    }
    return { fileCount: mockFiles.size, totalBytes, fileSizes };
  }
};

const mockIo = {
  saveState: async () => {},
  request: async () => ({}),
  mergeAudio: async (ids) => ({ id: 'merged.wav', duration: ids.length }),
  saveAudio: async () => ({ id: 'sample.wav' }),
  readAudio: async () => ({ base64: 'AA==' }),
  deleteAudio: mockDevice.deleteAudio,
  audioStats: mockDevice.audioStats
};

async function runCoreTests() {
  const engine = new Engine(mockIo);
  
  // Create a mock book with 5 chapters
  const book = {
    id: 'b1',
    name: '斗破苍穹',
    created: Date.now() - 10 * 24 * 3600 * 1000,
    characters: [{ name: '萧炎' }],
    chapters: [
      { id: 'c1', title: '第1章', text: '萧炎站在原地。', audio: 'a1', duration: 10, segments: [{ text: '萧炎站在原地。', speaker: '萧炎' }], playbackProgress: { listened: true }, listened: true },
      { id: 'c2', title: '第2章', text: '斗之气，三段！', audio: 'a2', duration: 15, segments: [{ text: '斗之气，三段！', speaker: '旁白' }], playbackProgress: { listened: true }, listened: true },
      { id: 'c3', title: '第3章', text: '纳兰嫣然上门。', audio: 'a3', duration: 20, segments: [{ text: '纳兰嫣然上门。', speaker: '纳兰嫣然' }], playbackProgress: { listened: true }, listened: true },
      { id: 'c4', title: '第4章', text: '三十年河东。', audio: 'a4', duration: 25, segments: [{ text: '三十年河东。', speaker: '萧炎' }], playbackProgress: { listened: false }, listened: false },
      { id: 'c5', title: '第5章', text: '莫欺少年穷！', audio: null, duration: 0, segments: [{ text: '莫欺少年穷！', speaker: '萧炎' }] }
    ]
  };
  mockFiles.set('a1', 5 * 1024 * 1024); // 5MB
  mockFiles.set('a2', 10 * 1024 * 1024); // 10MB
  mockFiles.set('a3', 15 * 1024 * 1024); // 15MB
  mockFiles.set('a4', 20 * 1024 * 1024); // 20MB

  engine.state.books = [book];

  // A. Test performAutoCleanup with keepRecentCount
  engine.state.settings.autoDeletePlayed = true;
  engine.state.settings.keepRecentCount = 2;

  // Currently playing c4 (index 3). c1, c2, c3 are listened.
  // With keep 2, c2 and c3 are within curIdx-2 (index 1 & 2), so only c1 should be cleaned!
  const cleanRes = await engine.performAutoCleanup('b1', 'c4');
  assert.strictEqual(cleanRes.clearedCount, 1, 'Only c1 should be cleared when keep=2');
  assert.strictEqual(book.chapters[0].audio, null, 'c1 audio should be cleared');
  assert.strictEqual(book.chapters[1].audio, 'a2', 'c2 audio should be preserved');
  assert.strictEqual(book.chapters[2].audio, 'a3', 'c3 audio should be preserved');
  console.log('✓ performAutoCleanup sliding window works perfectly!');

  // B. Test segment timestamps computation
  const segs = engine.computeSegmentTimestamps([
    { text: '第一句', speaker: '旁白' },
    { text: '第二句对白', speaker: '萧炎' },
    { text: '跳过广告', isAd: true }
  ], 10);
  assert.strictEqual(segs.length, 3);
  assert.strictEqual(segs[0].startMs, 0);
  assert(segs[1].startMs > 0);
  console.log('✓ computeSegmentTimestamps works accurately!');

  // C. Test batchEnqueue
  const tasks = await engine.batchEnqueue('b1', 3, 4); // index 3 has audio, index 4 does not
  assert.strictEqual(tasks.length, 1, 'Only chapter without audio should be queued');
  assert.strictEqual(tasks[0].id, 'c5');
  console.log('✓ batchEnqueue range queuing works accurately!');

  // D. Test archiveBook
  const archiveRes = await engine.archiveBook('b1');
  assert.strictEqual(archiveRes.archived, true);
  assert.strictEqual(book.chapters[1].audio, null, 'archiving clears all chapter audio');
  assert.strictEqual(book.chapters[3].audio, null);
  assert(book.chapters[0].text.length > 0, 'text is preserved');
  assert(book.characters.length > 0, 'characters are preserved');
  console.log('✓ archiveBook frees all audio while safely retaining text & roles!');

  console.log('=== All 3 Stages E2E Core & UI Integration Tests Passed! ===');
}

runCoreTests().catch(e => {
  console.error('Test failed:', e);
  process.exit(1);
});

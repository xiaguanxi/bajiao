const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('streaming playback progress and task production metrics consistency', async (t) => {
  const appCode = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/app.js'), 'utf8');

  // Extract helper functions from app.js to test them directly
  // 1. taskProductionMetrics
  const matchMetrics = appCode.match(/function taskProductionMetrics\(t, chapter\)\{[\s\S]*?\n\}/);
  assert.ok(matchMetrics, 'taskProductionMetrics must be defined in app.js');
  const taskProductionMetrics = new Function('t', 'chapter', matchMetrics[0] + '\nreturn taskProductionMetrics(t, chapter);');

  // 2. isChapterStreaming
  const matchStreaming = appCode.match(/function isChapterStreaming\(c\)\{[\s\S]*?\n\}/);
  assert.ok(matchStreaming, 'isChapterStreaming must be defined in app.js');

  // 3. chapterSentenceCount
  const matchCount = appCode.match(/function chapterSentenceCount\(c, task\)\{[\s\S]*?\n\}/);
  assert.ok(matchCount, 'chapterSentenceCount must be defined in app.js');

  await t.test('taskProductionMetrics: consistent across loaded and unloaded chapter stubs', () => {
    // Loaded chapter with 100 segments, 25 finished
    const loadedChap = {
      id: 'c1',
      title: '第一章',
      segments: Array.from({ length: 100 }, (_, i) => ({ id: i, audio: i < 25 ? 'audio_' + i : null }))
    };
    const taskRunning = { id: 't1', bookId: 'b1', chapterId: 'c1', total: 100, done: 25, status: 'running' };

    const mLoaded = taskProductionMetrics(taskRunning, loadedChap);
    assert.equal(mLoaded.total, 100);
    assert.equal(mLoaded.done, 25);
    assert.equal(mLoaded.pct, 25);

    // Unloaded chapter stub (common when listening to another chapter)
    const unloadedChap = {
      id: 'c1',
      title: '第一章',
      unloaded: true,
      segmentCount: 100
    };
    const mUnloaded = taskProductionMetrics(taskRunning, unloadedChap);
    assert.equal(mUnloaded.total, 100);
    assert.equal(mUnloaded.done, 25);
    assert.equal(mUnloaded.pct, 25);
    assert.equal(mLoaded.pct, mUnloaded.pct, 'Banner and task card must produce identical percentage even when unloaded');
  });

  await t.test('taskProductionMetrics: handles empty segments and missing tasks safely', () => {
    const emptyChap = { id: 'c2', segments: [] };
    assert.deepEqual(taskProductionMetrics(null, emptyChap), { done: 0, total: 0, pct: 0 });

    const chapWithStaleTask = { id: 'c3', segments: [{ id: 0, audio: 'a0' }, { id: 1, audio: 'a1' }] };
    const taskStale = { total: 2, done: 1 };
    // Should take the fresher done count (2) from segments
    const mFresher = taskProductionMetrics(taskStale, chapWithStaleTask);
    assert.equal(mFresher.done, 2);
    assert.equal(mFresher.pct, 100);
  });

  await t.test('边做边听 sentence progress: calculation per completed sentence', () => {
    const totalSentences = 100;
    const segs = Array.from({ length: totalSentences }, (_, i) => ({
      id: i,
      audio: i < 30 ? 'audio_' + i : null,
      durMs: 3000
    }));
    const chap = { id: 'c1', segments: segs, audio: null };

    // Function simulating the sentence index resolution in syncDisplayedPlayback:
    function computeStreamPlaybackSentenceIndex(c, streamState) {
      const tot = c.segments.length;
      if (streamState) {
        const curIdx = c.segments.findIndex(s => s.id === streamState.segId);
        return curIdx >= 0 ? curIdx : 0;
      }
      if (c.playbackCompleted) return tot;
      if (c.playbackResume?.segmentId >= 0) {
        const resumeIdx = c.segments.findIndex(s => s.id === c.playbackResume.segmentId);
        return resumeIdx >= 0 ? resumeIdx : 0;
      }
      return 0;
    }

    // At initial start (before sentence 0 completes): 0 sentences finished -> 0%
    let streamState = { bid: 'b1', cid: 'c1', segId: 0 };
    let played = computeStreamPlaybackSentenceIndex(chap, streamState);
    assert.equal(played, 0);
    assert.equal(Math.round((played / totalSentences) * 100), 0);

    // Sentence 0 finishes, stream advances to sentence 1: 1 sentence finished -> 1%
    streamState = { bid: 'b1', cid: 'c1', segId: 1 };
    played = computeStreamPlaybackSentenceIndex(chap, streamState);
    assert.equal(played, 1);
    assert.equal(Math.round((played / totalSentences) * 100), 1);

    // Sentence 1 finishes, stream advances to sentence 2: 2 sentences finished -> 2%
    streamState = { bid: 'b1', cid: 'c1', segId: 2 };
    played = computeStreamPlaybackSentenceIndex(chap, streamState);
    assert.equal(played, 2);
    assert.equal(Math.round((played / totalSentences) * 100), 2);

    // After 50 sentences: 50%
    streamState = { bid: 'b1', cid: 'c1', segId: 50 };
    played = computeStreamPlaybackSentenceIndex(chap, streamState);
    assert.equal(played, 50);
    assert.equal(Math.round((played / totalSentences) * 100), 50);

    // When chapter finishes completely: 100 / 100 (100%)
    chap.playbackCompleted = true;
    streamState = null;
    played = computeStreamPlaybackSentenceIndex(chap, streamState);
    assert.equal(played, 100);
    assert.equal(Math.round((played / totalSentences) * 100), 100);
  });

  await t.test('syncSeekDisplay: updates bubble with sentence count format in stream mode', () => {
    // Lightweight mock DOM element
    function createMockElement(id = '') {
      const attrs = new Map();
      const style = {
        setProperty(k, v) { this[k] = v; }
      };
      return {
        id,
        value: 0,
        max: 0,
        textContent: '',
        style,
        setAttribute(k, v) { attrs.set(k, String(v)); },
        getAttribute(k) { return attrs.get(k); },
        closest() {
          return {
            style,
            querySelector() { return { getBoundingClientRect: () => ({ width: 40 }) }; }
          };
        }
      };
    }

    const seek = createMockElement('seek');
    const time = createMockElement('playtime');
    const end = createMockElement('playduration');

    const elements = { '#seek': seek, '#playtime': time, '#playduration': end };
    const mock$ = sel => elements[sel] || null;

    // Extract syncSeekDisplay from appCode
    const matchSyncSeek = appCode.match(/function syncSeekDisplay\(position,duration,isStream\)\{[\s\S]*?\n\}/);
    assert.ok(matchSyncSeek, 'syncSeekDisplay must be defined');

    const syncSeekDisplay = new Function('position', 'duration', 'isStream', '$', `
      function fmt(s){const m=Math.floor(s/60),sec=Math.floor(s%60);return String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0');}
      function isChapterStreaming(){return true;}
      function chapter(){return null;}
      ${matchSyncSeek[0]}
      return syncSeekDisplay(position, duration, isStream);
    `);

    // Call in stream mode with 1 sentence played out of 100
    syncSeekDisplay(1, 100, true, mock$);

    assert.equal(seek.max, 100);
    assert.equal(seek.value, 1);
    assert.equal(time.textContent, '1 句');
    assert.equal(end.textContent, '100 句');
    assert.equal(seek.getAttribute('aria-valuetext'), '1 句 / 100 句');

    // Call in stream mode with 2 sentences played out of 100
    syncSeekDisplay(2, 100, true, mock$);
    assert.equal(seek.value, 2);
    assert.equal(time.textContent, '2 句');
    assert.equal(end.textContent, '100 句');
  });

  await t.test('seeking in streaming mode: clamps to available prefix when scrubbing ahead', () => {
    // 20 segments available in prefix out of 100
    const prefix = Array.from({ length: 20 }, (_, i) => ({ id: i, audio: 'audio_' + i }));
    const totalSentences = 100;

    function resolveSeekTarget(value, prefixLength, totalCount) {
      const targetIdx = Math.max(0, Math.min(Math.max(0, totalCount - 1), Math.round(value)));
      if (targetIdx < prefixLength) {
        return { segIdx: targetIdx, clamped: false };
      } else {
        return { segIdx: prefixLength - 1, clamped: true };
      }
    }

    // Scrub to sentence 5 -> jumps to sentence 5 directly
    const seek5 = resolveSeekTarget(5, prefix.length, totalSentences);
    assert.equal(seek5.segIdx, 5);
    assert.equal(seek5.clamped, false);

    // Scrub to sentence 80 (not yet generated) -> clamps to latest available (index 19, 20th sentence)
    const seek80 = resolveSeekTarget(80, prefix.length, totalSentences);
    assert.equal(seek80.segIdx, 19);
    assert.equal(seek80.clamped, true);
  });
});

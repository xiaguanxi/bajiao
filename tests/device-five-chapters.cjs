const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { connect, run, sleep, nativeTap, log, dir } = require('./device-harness.cjs');
const reportFile = path.join(dir, 'five-chapters.json');
(async () => {
  const h = await connect();
  try {
    let s = await h.state();
    const b = s.books.findLast(b => b.name === 'bajiao-novel');
    assert(b, 'Import real novel through Android document picker first');
    assert.equal(s.settings.llmModel, 'MiniMax-M3');
    const chapters = b.chapters.filter(c => /^第000[1-5]章/.test(c.title));
    assert.equal(chapters.length, 5);
    const ids = chapters.map(c => c.id);
    let report = fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile)) : { started: new Date().toISOString(), bookId: b.id, chapters: chapters.map(c => ({ id: c.id, title: c.title, textLength: c.text?.length || c.textLength })), checks: [], progress: [] };
    const save = () => fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    const mode = process.argv[2] || 'monitor';
    if (mode === 'continue') {
      await h.tap('[data-act="go:tasks"]');
      for (const t of s.tasks.filter(t => t.bookId === b.id && ids.includes(t.chapterId) && ['paused','failed'].includes(t.status))) await h.tap('[data-act="resume:' + t.id + '"]');
    }
    if (mode === 'review') {
      await h.tap('[data-act="go:shelf"]');await h.tap('[data-act="book:' + b.id + '"]');await h.tap('[data-act="confirm:' + ids[0] + '"]');s=await h.state();
      const full = s.books.find(x => x.id === b.id).chapters.find(x => x.id === ids[0]);
      assert.equal(full.segments.length,110);
      assert(full.segments.filter(x => x.speaker !== '旁白' && !x.isAd && !x.skip).every(x => !x.audio));
      report.checks.push({ name: 'Manual policy blocks all unconfirmed role dialogue while narrator audio completes', done: s.tasks.find(t => t.chapterId === ids[0]).done });save();
      for (const id of [84, 85]) {
        const live = await h.state();
        if (live.books.find(x => x.id === b.id).chapters.find(x => x.id === ids[0]).segments.find(x => x.id === id).speaker === '双胞胎女娃') continue;
        await h.tap('[data-act="editseg:' + id + '"]');
        await h.tap('[data-act="dropdown:segSpeaker"]');await h.tap('[data-act="pickopt:segSpeaker|双胞胎女娃"]');await h.tap('[data-act="saveseg"]');
        run(['shell', 'input', 'keyevent', '4']);log({ type: 'back', purpose: 'Exit annotation to directory' });await sleep(500);await h.tap('[data-act="confirm:' + ids[0] + '"]');
      }
      report.checks.push({ name: 'Two uncertain lines corrected through custom speaker dropdown using source context' });save();
      for (const role of ['陆涯', '双胞胎女娃']) {
        const live = await h.state();const r = live.books.find(x => x.id === b.id).characters.find(x => x.name === role);
        await h.tap('[data-act="play:' + r.candidate.sample + '"]');await sleep(1500);
        const media = run(['shell', 'dumpsys', 'media_session']).toString();
        assert(media.includes('BajiaoMediaSession'));assert(/state=3/.test(media), 'Voice audition must be playing in native MediaSession');
        fs.writeFileSync(path.join(dir, role + '-audition-media.txt'), media);
        await h.tap('[data-act="acceptrole:' + role + '"]');
        for(let i=0;i<20&&await h.read(()=>!document.querySelector('#busy').hidden);i++)await sleep(250);
        assert(await h.read(()=>document.querySelector('#busy').hidden), 'Accept voice must release modal before chapter production finishes');
      }
      report.checks.push({ name: 'Real designed-voice audition in native MediaSession and manual acceptance; UI stays responsive' });save();
    }
    if (mode === 'recover') {
      const before = JSON.parse(fs.readFileSync(path.join(dir, 'upgrade-checkpoint.json')));
      const manifest = JSON.parse(run(['exec-out', 'run-as', 'com.vocast.app', 'cat', 'files/library.json']).toString());
      for (const c of before.books.find(x => x.id === b.id).chapters.filter(c => ids.includes(c.id))) {
        const meta = manifest.books.find(x => x.id === b.id).chapters.find(x => x.id === c.id);
        const full = JSON.parse(run(['exec-out', 'run-as', 'com.vocast.app', 'cat', 'files/chapters/' + meta.storageRef + '.json']).toString());
        assert.deepEqual(full.segments.map(x => x.audio), c.segments.map(x => x.audio));
      }
      report.checks.push({ name: 'Home pauses all jobs; APK upgrade restores every completed audio hash', done: before.tasks.reduce((n, t) => n + t.done, 0) });save();
      await h.tap('[data-act="resume:' + s.tasks.find(t => t.bookId === b.id && t.chapterId === ids[0]).id + '"]');
    }
    if (mode === 'start') {
      assert(!s.tasks.some(t => t.bookId === b.id));
      await h.tap('[data-act="multiselect"]');
      for (const id of ids) await h.tap('[data-check="' + id + '"]');
      await h.tap('[data-act="go:make"]');
      await h.screenshot('five-selected');
      assert((await h.read(() => document.body.innerText)).includes('制作 5 个章节'));
      await h.tap('[data-act="enqueue"]');
      report.checks.push({ name: 'Real Android import, select actual chapters 0001-0005 and enqueue', at: new Date().toISOString() });
      save();
    }
    for (let i = 0; i < (mode === 'start' ? 1 : mode === 'watch' ? 3600 : 8); i++) {
      s = await h.state();
      const tasks = s.tasks.filter(t => t.bookId === b.id && ids.includes(t.chapterId));
      const progress = { at: new Date().toISOString(), tasks: tasks.map(t => ({ id: t.id, chapterId: t.chapterId, status: t.status, phase: t.phase, done: t.done, total: t.total, message: t.message })) };
      report.progress.push(progress); report.latest = progress; report.roles = s.books.find(x => x.id === b.id).characters; report.recentUsage = s.usage.slice(-100);
      const usageMap=new Map((report.usage||[]).map(u=>[JSON.stringify(u),u]));for(const u of s.usage.filter(u=>u.at>=Date.parse(report.started)))usageMap.set(JSON.stringify(u),u);report.usage=[...usageMap.values()];save();
      if (i === 0 || (mode === 'watch' && i % 6 === 0)) console.log(JSON.stringify(progress));
      if (tasks.length === 5 && tasks.every(t => t.status === 'done')) { report.productionComplete = true; save(); console.log('FIVE REAL CHAPTERS COMPLETE'); break; }
      if (tasks.some(t => t.status === 'failed')) { await h.screenshot('production-failure'); throw Error('Device production failed: ' + tasks.filter(t => t.status === 'failed').map(t => t.message).join('; ')); }
      if (mode === 'start') break;
      await sleep(5000);
    }
    await h.screenshot('latest-production');
  } finally { await h.browser.close(); }
})().catch(e => { console.error(e.stack); process.exitCode = 1; });

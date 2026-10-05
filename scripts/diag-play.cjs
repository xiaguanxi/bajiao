const { connect, sleep } = require('../tests/device-harness.cjs');
(async () => {
  const h = await connect();
  try {
    const s = await h.state();
    const b = s.books.find(bk => bk.chapters.some(c => c.audio));
    const chs = b.chapters.filter(c => c.audio);
    console.log('audios:', chs.map(c => c.audio.slice(0, 8)).join(','));
    for (const [i, c] of chs.slice(0, 3).entries()) {
      const r = await h.page.evaluate(async (aid) => {
        try { await device.call('play', { id: aid, title: 'probe' }); }
        catch (e) { return { callError: String((e && e.message) || e) }; }
        await new Promise(r => setTimeout(r, 3000));
        try { return await device.call('playbackState'); }
        catch (e) { return { stateError: String((e && e.message) || e) }; }
      }, c.audio);
      console.log('ch' + (i + 1), JSON.stringify(r).slice(0, 220));
      if (r.playing) break;
    }
  } finally { await h.browser.close(); }
})().catch(e => { console.error(e.stack); process.exitCode = 1; });

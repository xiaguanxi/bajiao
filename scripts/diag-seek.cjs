const { connect, sleep } = require('../tests/device-harness.cjs');
(async () => {
  const h = await connect();
  try {
    await h.tap('[data-act="go:shelf"]');
    const s = await h.state();
    const b = s.books.find(bk => bk.chapters.some(c => c.audio));
    const c = b.chapters.find(cc => cc.audio);
    await h.tap('[data-act="book:' + b.id + '"]');
    await h.tap('[data-act="read:' + c.id + '"]');
    await sleep(800);
    await h.read(() => {
      window.__calls = [];
      const orig = window.Native.call;
      window.Native.call = (...a) => { try { window.__calls.push({ action: a[1], payload: (a[2] || '').slice(0, 160) }); } catch (e) {} return orig(...a); };
    });
    await h.tap('[data-act="playchapter"]');
    await sleep(2500);
    const starts = await h.read(() => [...document.querySelectorAll('#transcriptPanel .vc-transcript-line')].slice(0, 6).map(l => l.dataset.start));
    console.log('starts:', starts.join(','));
    const t = starts[3];
    const n = await h.page.evaluate(sel => document.querySelectorAll(sel).length, '[data-act="seekseg:' + t + '"]');
    console.log('matching els for seekseg:' + t + ' =', n);
    const geo = await h.page.evaluate(sel => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const panel = document.querySelector('#transcriptPanel').getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: innerHeight, pTop: Math.round(panel.top), pBottom: Math.round(panel.bottom) };
    }, '[data-act="seekseg:' + t + '"]');
    console.log('target geo:', JSON.stringify(geo));
    await h.tap('[data-act="seekseg:' + t + '"]');
    await sleep(1000);
    const calls = await h.read(() => window.__calls.slice(-8));
    console.log('native calls:', JSON.stringify(calls, null, 1));
    const p = await h.read(() => device.call('playbackState'));
    console.log('state:', JSON.stringify(p));
  } finally { await h.browser.close(); }
})().catch(e => { console.error(e.stack); process.exitCode = 1; });

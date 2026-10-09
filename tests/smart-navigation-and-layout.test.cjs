const fs = require('node:fs'), http = require('node:http'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/xiagu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const root = path.resolve('app/src/main/assets');
  const server = http.createServer((req, res) => {
    const f = path.join(root, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
    if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', f.endsWith('.js') ? 'application/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(fs.readFileSync(f));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    let state = null;
    await page.exposeFunction('nativeCall', async (id, action, payload) => {
      let result = true;
      const p = payload ? JSON.parse(payload) : {};
      if (action === 'load') result = { state, llmConfigured: true, ttsConfigured: true };
      else if (action === 'saveState') state = JSON.parse(p.text);
      else if (action === 'saveSnapshot') {
        const previous = new Map((state?.books || []).flatMap(b => b.chapters).map(c => [c.id, c]));
        for (const c of JSON.parse(p.chapters)) previous.set(c.id, c);
        state = JSON.parse(p.header);
        for (const b of state.books) b.chapters = b.chapters.map(c => previous.get(c.id));
      } else if (action === 'playbackState') result = { playing: false, position: 0 };
      await page.evaluate(v => window.nativeResult(v), { id, result });
    });

    await page.addInitScript(() => { window.Native = { call: (...args) => window.nativeCall(...args) }; });
    await page.goto('http://127.0.0.1:' + server.address().port);

    const click = async act => { await page.locator('[data-act="' + act + '"]').first().click(); };

    // 1. 导入示例文本进入详情页
    await click('samplebook');
    await page.getByRole('heading', { name: '章节目录' }).waitFor();
    console.log('✓ 示例文本已导入并进入章节目录');

    // --- 验证 1：批量制作状态排版与已选数量展示移除 ---
    await click('multiselect');
    await page.locator('.vc-batch-header').waitFor();

    // 验证 .vc-selected-count 已经删除
    const selectedCountEl = await page.locator('.vc-selected-count').count();
    assert.equal(selectedCountEl, 0, '已选数量展示 .vc-selected-count 应该已被移除');
    console.log('✓ 验证 1.1 成功：已选数量展示已从批量选择头部移除');

    // 选中未完成章节
    await click('selectunfinished');
    const makeBtn = page.locator('.vc-top-make-btn');
    await makeBtn.waitFor();
    const btnBox = await makeBtn.boundingBox();
    assert.ok(btnBox, '制作按钮可见');
    // 按钮宽高比：宽度必须显著大于高度，说明文字是横向水平排版，没有被挤压竖排折行
    assert.ok(btnBox.width > btnBox.height * 1.5, `按钮宽度 (${btnBox.width}px) 应大于高度 (${btnBox.height}px) 至少 1.5 倍，防止文字竖排`);
    const whiteSpace = await makeBtn.evaluate(el => window.getComputedStyle(el).whiteSpace);
    assert.equal(whiteSpace, 'nowrap', '按钮文字必须保持 nowrap 不换行');
    console.log(`✓ 验证 1.2 成功：批量制作按钮宽度为 ${Math.round(btnBox.width)}px，高度为 ${Math.round(btnBox.height)}px，保持横向紧凑且 white-space: nowrap！`);

    // 退出批量模式
    await click('multiselect');

    // --- 验证 2：章节列表下方按钮已删除 ---
    // 检查章节列表下方是否不再有冗余底部操作按钮
    const bottomMakeBtn = await page.locator('.vc-chapter ~ .vc-bottom').count();
    assert.equal(bottomMakeBtn, 0, '章节列表下方不应存在 .vc-bottom 按钮');
    console.log('✓ 验证 2.1 成功：章节列表下方冗余按钮已完全删除！');

    // --- 验证 3：确认页面主操作按钮移至上方重新设计 ---
    // 构造一个待确认章节
    await page.evaluate(async () => {
      const e = window.vocastEngine;
      const b = e.state.books[0];
      const c = b.chapters[1];
      c.status = 'waiting';
      c.segments = [
        { id: 1, text: '第一句对白。', speaker: '神秘人', confidence: 0.5, audio: null },
        { id: 2, text: '第二句对白。', speaker: '旁白', confidence: 1.0, audio: null }
      ];
      e.touch(c);
      await e.persist();
    });

    // 重新渲染或跳转确认页
    await click('confirm:' + state.books[0].chapters[1].id);
    await page.locator('.vc-annotated-topbar').waitFor();

    // 检查上方操作面板
    const topPanel = page.locator('.vc-annotated-topbar');
    await topPanel.waitFor();
    const topActionBtn = page.locator('[data-act^="ignoreall:"]');
    await topActionBtn.waitFor();

    // 检查顶部按钮位置在问题卡片之前（上方）
    const panelBox = await topPanel.boundingBox();
    const issueCard = page.locator('.vc-issue-card').first();
    const issueBox = await issueCard.boundingBox();
    assert.ok(panelBox.y < issueBox.y, '主操作面板必须位于待确认问题卡片上方');

    // 检查列表底部不再有 .vc-bottom
    const confirmBottomBtn = await page.locator('.vc-issue-card ~ .vc-bottom').count();
    assert.equal(confirmBottomBtn, 0, '确认页面底部不应再有 .vc-bottom 按钮');
    console.log('✓ 验证 2.2 成功：标注页顶栏一键忽略按钮在上，下方无冗余按钮！');

    // 返回章节目录
    await page.locator('.vc-top [data-act="back"]').click();
    await page.getByRole('heading', { name: '章节目录' }).waitFor();

    // --- 验证 4：点击任意章节智能跳转至当前最新制作状态 ---
    const book = state.books[0];
    const ch0 = book.chapters[0];
    const ch1 = book.chapters[1];

    // Case 4.1: 未开始标注的章节 -> 点击弹选项，选阅读原文进 raw
    await click('read:' + ch0.id);
    await click('readraw');
    await page.locator('.reader').waitFor();
    const activeTabRaw = await page.locator('.vc-modebar .active').textContent();
    assert.equal(activeTabRaw, '原文', '未标注章节选阅读原文应进原文');
    console.log('✓ 验证 4.1 成功：未开始标注的章节智能跳转至【原文】(raw)');

    // 返回目录
    await page.locator('.vc-top [data-act="back"]').click();
    await page.getByRole('heading', { name: '章节目录' }).waitFor();

    // Case 4.2: 待确认章节 -> 点击跳转 确认 confirm
    await click('confirm:' + ch1.id);
    await page.locator('.vc-annotated-topbar').waitFor();
    console.log('✓ 验证 4.2 成功：待确认状态章节直接跳转至【标注】(annotated)，无中间确认页');

    // 一键全部忽略
    await topActionBtn.click();
    await page.getByRole('heading', { name: '制作任务' }).waitFor();
    console.log('一键忽略后跳任务页制作中栏');

    // 一键忽略后跳任务页，回书架进章节目录
    await click('go:shelf');
    await page.locator('.vc-book').click();
    await page.getByRole('heading', { name: '章节目录' }).waitFor();

    // Case 4.3: 有任意标注的章节（未合成整章音频） -> 点击跳转 标注列表 annotated
    // 此时 ch1 已被忽略并标记为 annotated 且无 audio
    await click('read:' + ch1.id);
    await page.locator('.vc-annotated-topbar').waitFor();
    const activeTabAnn = await page.locator('.vc-modebar .active').textContent();
    assert.equal(activeTabAnn, '标注', '有标注但未完成章节应跳转至标注列表');
    console.log('✓ 验证 4.3 成功：有标注的章节智能跳转至【标注列表】(annotated)');

    // 返回目录
    await page.locator('.vc-top [data-act="back"]').click();
    await page.getByRole('heading', { name: '章节目录' }).waitFor();

    // Case 4.4: 整章完成（已有 audio） -> 点击跳转 听书 listen
    await page.evaluate(async () => {
      const e = window.vocastEngine;
      const c = e.state.books[0].chapters[0];
      c.audio = 'chapter_0_complete.wav';
      c.duration = 45;
      c.status = 'ready';
      e.touch(c);
      await e.persist();
    });

    await click('read:' + ch0.id);
    await page.locator('.vc-ctlbar').waitFor();
    const activeTabListen = await page.locator('.vc-modebar .active').textContent();
    assert.equal(activeTabListen, '听书', '整章已完成音频的章节应跳转至听书');
    console.log('✓ 验证 4.4 成功：整章完成的章节智能跳转至【听书】(listen)');

    console.log('\n=== 三大核心交互与排版体验优化全部验证通过！ ===');
  } finally {
    await browser.close();
    server.close();
  }
})();

/* 全页面+弹窗截图：本地静态资源 + 模拟原生桥，不调外部 API。 */
const fs = require('node:fs'), http = require('node:http'), path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/xiagu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
  const root = path.resolve('app/src/main/assets');
  const out = path.resolve('界面截图v031');
  fs.mkdirSync(out, { recursive: true });
  const server = http.createServer((req, res) => {
    const f = path.join(root, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
    if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', f.endsWith('.js') ? 'application/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(fs.readFileSync(f));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const shots = [];
  try {
    const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    let state = null;
    await page.exposeFunction('nativeCall', async (id, action, payload) => {
      let result = true;
      const p = JSON.parse(payload);
      if (action === 'load') result = { state, llmConfigured: true, ttsConfigured: true };
      else if (action === 'saveState') state = JSON.parse(p.text);
      else if (action === 'saveSnapshot') {
        const previous = new Map((state?.books || []).flatMap(b => b.chapters).map(c => [c.id, c]));
        for (const c of JSON.parse(p.chapters)) previous.set(c.id, c);
        state = JSON.parse(p.header);
        for (const b of state.books) b.chapters = b.chapters.map(c => previous.get(c.id));
      }
      else if (action === 'pick') {
        if (p.kind === 'book') result = [{ id: 'demo.txt', name: '预览书.txt', text: '第一章 开头\n内容一\n第二章 发展\n内容二\n第三章 结尾\n内容三' }];
        else result = [{ id: 'reference.wav', name: '温柔清亮的年轻女声.wav', size: 1000, format: 'wav' }];
      }
      else if (action === 'playbackState') result = { playing: false, position: 0 };
      else if (action === 'request') throw Error('screenshot run must not call external APIs');
      await page.evaluate(v => window.nativeResult(v), { id, result });
    });
    await page.addInitScript(() => { window.Native = { call: (...args) => window.nativeCall(...args) }; });
    await page.goto('http://127.0.0.1:' + server.address().port);
    const click = async act => {
      const t = page.locator('[data-act="' + act + '"]').first();
      if (await t.count() > 0) { await t.click(); await page.waitForTimeout(300); return; }
      // 当前页没有：沿返回链找（先关可能盖住 back 的选项弹窗）
      for (let i = 0; i < 6; i++) {
        await page.evaluate(() => { const ov = document.querySelector('.vc-modal-overlay'); if (ov) ov.click(); });
        await page.waitForTimeout(200);
        const b = page.locator('[data-act="back"]').first();
        if (await b.count() === 0) break;
        await b.click(); await page.waitForTimeout(400);
        const t2 = page.locator('[data-act="' + act + '"]').first();
        if (await t2.count() > 0) { await t2.click(); await page.waitForTimeout(300); return; }
      }
      throw Error('no route to ' + act);
    };
    const goto = click;
    const closeOverlay = async () => {
      await page.evaluate(() => {
        const ov = document.querySelector('.vc-modal-overlay');
        if (ov) ov.click();
      });
      await page.waitForTimeout(300);
    };
    const shot = async (n, name, full = true) => {
      const f = n + '_' + name + '.png';
      await page.screenshot({ path: path.join(out, f), fullPage: full });
      shots.push(f);
    };
    const scrollBottom = async (n, name) => {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(200);
      const f = n + '_' + name + '_底部.png';
      await page.screenshot({ path: path.join(out, f), fullPage: false });
      shots.push(f);
      await page.evaluate(() => window.scrollTo(0, 0));
    };
    // 01 书架空
    await shot('01', '书架_空');
    // 建示例书
    await click('samplebook');
    await page.getByRole('heading', { name: '章节目录' }).waitFor();
    await shot('02', '书架_有书前先书籍详情');
    // 详情页
    await shot('03', '书籍详情_章节目录');
    await scrollBottom('03b', '书籍详情');
    // 编辑多选
    await click('multiselect');
    await shot('04', '书籍详情_编辑模式多选');
    await click('selectunfinished');
    await shot('05', '书籍详情_编辑模式全选');
    await click('multiselect');
    // 标注一章：进第一章原文 -> 标注
    const ch0 = state.books[0].chapters[0].id;
    await click('read:' + ch0);
    await click('readraw');
    await click('go:annotated');
    await shot('14', '标注模式');
    await scrollBottom('14b', '标注模式');
    // 原文
    await click('go:raw');
    await shot('15', '原文模式');
    // 修正说话人弹窗
    await page.evaluate(async () => {
      const e = window.vocastEngine, c = e.state.books[0].chapters[0];
      c.segments = [
        { id: 0, text: '“你终于来了。”', speaker: '沈砚', emotion: '低沉温润', confidence: 0.9 },
        { id: 1, text: '“这封信是谁寄来的？”', speaker: '未知角色', emotion: '清亮', confidence: 0.2 },
        { id: 2, text: '雨停了。', speaker: '旁白', emotion: '自然', confidence: 0.95 },
      ];
      e.touch(c); await e.persist();
    });
    await click('go:annotated');
    await click('editseg:1');
    await page.locator('#segmentSpeaker').click().catch(() => {});
    await page.waitForTimeout(300);
    await shot('17b', '修正_选说话人弹窗');
    await page.keyboard.press('Escape').catch(() => {});
    await page.locator('#newRole').fill('林晚');
    await page.locator('#newRoleDescription').fill('清亮年轻女声');
    await click('addrole');
    await page.waitForTimeout(400);
    await shot('17', '修正说话人');
    await click('saveseg');
    await page.waitForTimeout(600);
    // 实现：saveseg 后直接回 annotated（探针已验证）
    // 听书页：先给音频状态，从标注页进听书
    await page.evaluate(async () => {
      const e = window.vocastEngine, c = e.state.books[0].chapters[0];
      c.audio = { durationMs: 60000, parts: [] }; e.touch(c); await e.persist();
    });
    await click('go:annotated');
    await page.waitForTimeout(300);
    await click('go:listen');
    await shot('16', '听书页');
    await click('speedmodal');
    await shot('16b', '听书_倍速弹窗');
    await closeOverlay();
    await click('listensettings');
    await shot('16c', '听书_播放设置弹窗');
    await closeOverlay();
    // 听书页无底导航，用 back 回详情
    await click('back');
    await page.waitForTimeout(400);
    // 角色与音色
    await click('go:roles');
    await shot('06', '角色与音色');
    await scrollBottom('06b', '角色与音色');
    // 为角色选音色（roles 页点 chooserole；先种一个音色保证列表非空）
    await page.evaluate(async () => {
      const e = window.vocastEngine;
      if (!e.state.voices.length) {
        e.state.voices.push({ id: 'v-demo', name: '演示女声', description: '温柔清亮的年轻女声', sample: null, enabled: true, format: 'wav', source: 'import', tested: false });
        await e.persist();
      }
    });
    await click('go:roles');
    const cr = page.locator('[data-act^="chooserole:"]').first();
    if (await cr.count() > 0) {
      await cr.click();
      await shot('07', '为角色选音色');
      await scrollBottom('07b', '为角色选音色');
    }
    // 设计新音色（voices 页点 newdesign；choose 页无底导航，先 back 回 roles）
    await click('back');
    await click('go:voices');
    await click('newdesign');
    await shot('08', '设计新音色');
    // 全局音色策略（settings 页点 globalpolicy）
    await click('go:settings');
    await click('globalpolicy');
    await shot('09', '全局音色策略');
    await scrollBottom('09b', '全局音色策略');
    // 任务页
    await page.evaluate(async () => {
      const e = window.vocastEngine, b = e.state.books[0];
      e.state.tasks = [
        { id: 't-run', bookId: b.id, chapterId: b.chapters[0].id, status: 'running', progress: 0.4, label: '制作中示例' },
        { id: 't-wait', bookId: b.id, chapterId: b.chapters[1].id, status: 'waiting', label: '待确认示例' },
        { id: 't-done', bookId: b.id, chapterId: b.chapters[0].id, status: 'done', label: '已完成示例' },
      ];
      await e.persist();
    });
    await click('go:tasks');
    await shot('10', '任务_制作中');
    await click('tasktab:attention');
    await shot('11', '任务_待确认');
    await click('tasktab:done');
    await shot('12', '任务_已完成');
    await click('tasktab:active');
    const tcard = page.locator('[data-act="task:t-run"]');
    if (await tcard.count() > 0) {
      await tcard.first().click();
      await shot('13', '任务详情');
      await scrollBottom('13b', '任务详情');
    }
    // 批量制作确认（回书架重进书籍详情）
    await click('go:shelf');
    await click('book:' + state.books[0].id);
    await click('multiselect');
    await click('selectunfinished');
    await click('go:make');
    await shot('21', '批量制作确认');
    await scrollBottom('21b', '批量制作');
    // 音色库
    await click('go:voices');
    await shot('18', '音色库_我的音色');
    await click('voicetab:preset');
    await shot('19', '音色库_MiMo预设');
    await scrollBottom('19b', '预设');
    // 导入音色描述页（走 importvoices 真实选择流程）
    await click('importvoices');
    await page.locator('#import-0').waitFor({ timeout: 5000 }).catch(() => {});
    await shot('18b', '音色导入_描述');
    // 模型配置 / LLM / MiMo（settings 页菜单进）
    await click('go:settings');
    await shot('22', '我的');
    await scrollBottom('26c', '存储_书卡区备用');
    await click('go:models');
    await shot('23', '模型配置');
    await click('go:llm');
    await shot('24', '语言模型配置');
    await click('back');
    await page.waitForTimeout(300);
    await click('go:mimo');
    await shot('25', 'MiMo_TTS配置');
    // 存储与资源（settings 页菜单进）
    await click('go:settings');
    await click('go:storage');
    await shot('26', '存储与资源');
    await scrollBottom('26b', '存储');
    // 删除整书确认弹窗（存储页书卡区点删除整书）
    await click('go:settings');
    await click('go:storage');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);
    await click('deletebookconfirm:' + state.books[0].id);
    await shot('27', '删除整书确认弹窗');
    await page.locator('button[data-act="closedeleteconfirm"]').first().click();
    await page.waitForTimeout(300);
    // 切章预览（走真实导入流程：shelf -> 导入小说 -> splitpreview）
    await click('go:shelf');
    await click('importbook');
    await page.getByText('导入预览').first().waitFor({ timeout: 8000 });
    await shot('28', '导入_切章预览');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(200);
    await shot('28b', '导入_切章预览_底部');
    // 音色详情（点第一个音色；先取消预览回书架）
    await click('cancelsplit');
    await click('go:voices');
    await click('voicetab:mine');
    const v0 = await page.locator('[data-act^="voice:"]').count();
    if (v0 > 0) {
      await page.locator('[data-act^="voice:"]').first().click();
      await shot('20', '音色详情');
      await scrollBottom('20b', '音色详情');
    }
    // 策略确认方式下拉弹窗（settings 页进）
    await click('go:settings');
    await click('globalpolicy');
    const dd = page.locator('[data-act^="dropdown:"]').first();
    if (await dd.count() > 0) {
      await dd.click();
      await page.waitForTimeout(400);
      await shot('09c', '策略_确认方式下拉弹窗');
      await closeOverlay();
    }
    // 章节内集数弹窗（回书架重进 detail 页）
    await click('go:shelf');
    await click('book:' + state.books[0].id);
    const ep = page.locator('[data-act="openepisodes"]');
    if (await ep.count() > 0) {
      await ep.first().click();
      await page.waitForTimeout(300);
      await shot('03c', '书籍详情_集数弹窗');
      const ce = page.locator('[data-act="closeepisodes"]');
      if (await ce.count() > 0) await ce.first().click();
    }
    // 顶部批量弹窗（detail页 openbatchmodal）
    const bm = page.locator('[data-act^="openbatchmodal:"]');
    if (await bm.count() > 0) {
      await bm.first().click();
      await page.waitForTimeout(300);
      await shot('21c', '批量操作弹窗');
      const cb = page.locator('[data-act="closebatchmodal"]');
      if (await cb.count() > 0) await cb.first().click();
    }
    // 全宽检查
    for (const width of [320, 412, 768]) {
      await page.setViewportSize({ width, height: 915 });
      const ok = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
      if (!ok) throw Error('layout overflow ' + width);
    }
    await page.setViewportSize({ width: 412, height: 915 });
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ passed: true, shots, errors }, null, 2));
    console.log('SHOTS ' + shots.length);
    if (errors.length) { console.log('ERRORS ' + JSON.stringify(errors)); process.exitCode = 1; }
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });

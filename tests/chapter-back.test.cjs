const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/xiagu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async()=>{
  const root=path.resolve('app/src/main/assets');
  const server=http.createServer((req,res)=>{
    const f=path.join(root,req.url==='/'?'index.html':req.url.split('?')[0]);
    if(!f.startsWith(root)||!fs.existsSync(f)){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'text/html');
    res.end(fs.readFileSync(f));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));

  const browser=await chromium.launch({channel:'msedge',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:412,height:915},deviceScaleFactor:1});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));

    let state=null;
    await page.exposeFunction('nativeCall',async(id,action,payload)=>{
      let result=true;
      const p=payload?JSON.parse(payload):{};
      if(action==='load')result={state,llmConfigured:true,ttsConfigured:true};
      else if(action==='saveState')state=JSON.parse(p.text);
      else if(action==='saveSnapshot'){const previous=new Map((state?.books||[]).flatMap(b=>b.chapters).map(c=>[c.id,c]));for(const c of JSON.parse(p.chapters))previous.set(c.id,c);state=JSON.parse(p.header);for(const b of state.books)b.chapters=b.chapters.map(c=>previous.get(c.id));}
      else if(action==='playbackState')result={playing:false,position:0};
      await page.evaluate(v=>window.nativeResult(v),{id,result});
    });

    await page.addInitScript(()=>{window.Native={call:(...args)=>window.nativeCall(...args)};});
    await page.goto('http://127.0.0.1:'+server.address().port);

    const click=async act=>{await page.locator('[data-act="'+act+'"]').first().click();};

    // 1. Add sample book
    await click('samplebook');
    await page.getByRole('heading',{name:'章节目录'}).waitFor();
    console.log('✓ 成功导入示例文本并进入书籍详情（章节目录）');

    const book = state.books[0];
    const ch0 = book.chapters[0];
    const ch1 = book.chapters[1];

    // 2. Click chapter 0 to enter 'raw' (unmade chapter shows choice dialog first)
    await click('read:'+ch0.id);
    await click('readraw');
    await page.locator('.reader').waitFor();
    console.log('✓ 点击第 1 章进入原文视图 (raw)');

    // 3. Switch tabs: raw -> annotated -> listen -> raw -> listen
    await click('go:annotated');
    await page.locator('.vc-modebar .active').waitFor();
    assert.equal(await page.locator('.vc-modebar .active').textContent(), '标注');

    await click('go:listen');
    assert.equal(await page.locator('.vc-modebar .active').textContent(), '听书');

    await click('go:raw');
    assert.equal(await page.locator('.vc-modebar .active').textContent(), '原文');

    await click('go:listen');
    assert.equal(await page.locator('.vc-modebar .active').textContent(), '听书');
    console.log('✓ 在章节内反复切换 原文 -> 标注 -> 听书 标签');

    // 4. Click left-top back button: should DIRECTLY return to chapter directory (detail)
    await page.locator('.vc-top [data-act="back"]').click();
    await page.getByRole('heading',{name:'章节目录'}).waitFor();
    console.log('✓ 验证 1 成功：在听书页面点击左上角返回按钮，直接返回到上一级章节目录，未在内部标签间反复回退！');

    // 5. From detail, click back button: should return to shelf
    await page.locator('.vc-top [data-act="back"]').click();
    await page.getByRole('heading',{name:'我的书架'}).waitFor();
    console.log('✓ 验证 2 成功：在章节目录点击返回按钮，正常返回到书架 (shelf)');

    // 6. Enter detail again -> click chapter 1 -> test Android hardware back (window.appBack())
    await page.locator('.vc-book').click();
    await page.getByRole('heading',{name:'章节目录'}).waitFor();
    await click('read:'+ch1.id);
    await click('readraw');
    await page.locator('.reader').waitFor();
    await click('go:annotated');
    assert.equal(await page.locator('.vc-modebar .active').textContent(), '标注');

    // Simulate Android onBackPressed:
    await page.evaluate(()=>window.appBack());
    await page.getByRole('heading',{name:'章节目录'}).waitFor();
    console.log('✓ 验证 3 成功：触发 window.appBack()（物理/手势返回），直接返回到上一级章节目录！');

    // 7. Test task -> chapter -> back navigation
    await page.evaluate(async()=>{
      const e=window.bajiaoEngine;
      const b=e.state.books[0];
      b.chapters[0].segments=[{id:0,text:'第一句。',speaker:'旁白',emotion:'自然',confidence:1,audio:null}];
      e.touch(b.chapters[0]);
      e.state.tasks.push({
        id:'test-task-1',
        bookId:b.id,
        chapterId:b.chapters[0].id,
        status:'queued',
        phase:'等待开始',
        message:'',
        created:Date.now(),
        done:0,
        total:0
      });
      await e.persist();
    });
    // Go to tasks
    await click('go:tasks');
    await page.getByRole('heading',{name:'制作任务'}).waitFor();
    // Click into task: goes straight to annotated page with task strip (merged)
    const taskId = state.tasks[0].id;
    await click('task:'+taskId);
    await page.locator('.vc-annotated-topbar').waitFor();
    assert.ok(await page.locator('.vc-task-strip').count(),'任务条应显示在标注页');
    console.log('✓ 任务卡片直接进入标注页（含任务状态条）');

    // Click back button: from task entry returns straight to tasks list
    await page.locator('.vc-top [data-act="back"]').click();
    await page.getByRole('heading',{name:'制作任务'}).waitFor();
    console.log('✓ 验证 4 成功：从任务进入标注页，点击返回直接回到任务列表！');

    assert.equal(errors.length, 0, 'No errors during test: '+errors.join('; '));
    console.log('=== 所有章节返回导航测试用例全部通过！ ===');
  } finally {
    await browser.close();
    server.close();
  }
})();

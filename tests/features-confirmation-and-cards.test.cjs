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
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    let state=null;
    await page.exposeFunction('nativeCall',async(id,action,payload)=>{
      let result=true;
      const p=payload?JSON.parse(payload):{};
      if(action==='load')result={state,llmConfigured:true,ttsConfigured:true};
      else if(action==='saveState')state=JSON.parse(p.text);
      else if(action==='saveSnapshot'){const previous=new Map((state?.books||[]).flatMap(b=>b.chapters).map(c=>[c.id,c]));for(const c of JSON.parse(p.chapters))previous.set(c.id,c);state=JSON.parse(p.header);for(const b of state.books)b.chapters=b.chapters.map(c=>previous.get(c.id));}
      else if(action==='pick')result=[{id:'voice_sample.wav',name:'优雅女声.wav',size:1500000,format:'wav'}];
      else if(action==='playbackState')result={playing:false,position:0};
      else if(action==='request')result={choices:[{message:{audio:{data:'AAAA'}},finish_reason:'stop'}]};
      else if(action==='saveAudio')result={id:'sample_audio.wav'};
      await page.evaluate(v=>window.nativeResult(v),{id,result});
    });

    await page.addInitScript(()=>{window.Native={call:(...args)=>window.nativeCall(...args)};});
    await page.goto('http://127.0.0.1:'+server.address().port);

    const click=async act=>{await page.locator('[data-act="'+act+'"]').first().click();};

    // --- 测试 1：导入示例书并创建音色和任务 ---
    await click('samplebook');
    await page.getByRole('heading',{name:'章节目录'}).waitFor();
    console.log('✓ 示例文本已导入');

    // 导入一个音色
    await click('go:voices');
    await click('importvoices');
    await click('saveimports');
    await page.locator('.voice-name').waitFor();
    console.log('✓ 音色库已成功导入自定义音色');

    // 测试 1.1：点击音色卡片任意位置（标题区域）自动进入音色管理页 (voicedetail)
    const voiceCard = page.locator('.vc-panel.vc-card-clickable').first();
    await voiceCard.locator('.voice-name').click();
    await page.getByRole('heading',{name:'我的音色'}).waitFor();
    console.log('✓ 验证 1.1 成功：点击音色卡标题任意位置自动进入音色管理页！');

    // 返回音色库
    await page.locator('.vc-top [data-act="back"]').click();
    await page.getByRole('heading',{name:'音色库'}).waitFor();

    // 测试 1.2：MiMo 预设列表试听按钮样式检查（无 flex:1 长条高亮，为紧凑 pill 按钮）
    await click('voicetab:preset');
    const presetBtn = page.locator('.vc-preset-btn').first();
    await presetBtn.waitFor();
    const btnBox = await presetBtn.boundingBox();
    assert(btnBox.width < 120, '预设试听按钮应为紧凑尺寸，实测宽度: '+btnBox.width);
    console.log('✓ 验证 1.2 成功：MiMo 预设试听按钮样式紧凑（宽度 '+Math.round(btnBox.width)+'px），去除了原有的长条高亮！');

    // 制作一个待确认的任务
    await page.evaluate(async()=>{
      const e=window.vocastEngine;
      const b=e.state.books[0];
      const c=b.chapters[0];
      // 制造待确认问题：未分配音色角色 + 不确定说话人
      b.characters.push({name:'神秘人',description:'神秘莫测的声音',aliases:[],voice:null});
      c.segments=[
        {id:0,speaker:'旁白',text:'夜幕降临。',emotion:'平静',confidence:1},
        {id:1,speaker:'神秘人',text:'谁在那里？',emotion:'警惕',confidence:1},
        {id:2,speaker:'未知角色',text:'我找不到回家的路。',emotion:'颤抖',confidence:0.4}
      ];
      c.status='waiting';
      e.state.tasks.push({
        id:'task-waiting-1',
        bookId:b.id,
        chapterId:c.id,
        status:'waiting',
        phase:'等待确认',
        message:'检测到新角色（神秘人）待确认音色，请在“角色与音色”中确认后继续',
        created:Date.now(),
        done:1,
        total:3
      });
      e.touch(c);
      await e.persist();
    });

    // --- 测试 2：任务卡片整卡点击 ---
    await click('go:tasks');
    await page.getByRole('heading',{name:'制作任务'}).waitFor();
    await click('tasktab:attention');
    const taskCard = page.locator('.vc-panel.vc-card-clickable').first();
    // 待确认任务卡片点击直接进入标注页处理（确认页已并入标注页）
    await taskCard.locator('h3').click();
    await page.locator('.vc-annotated-topbar').waitFor();
    console.log('✓ 验证 2 成功：待确认任务卡片点击直接进入标注页处理！');

    // --- 测试 3：章节目录待确认状态点击直接进入标注页 ---
    // 测试 2 结束停在标注页，点返回回到章节目录
    await page.locator('.vc-top [data-act="back"]').click();
    await page.getByRole('heading',{name:'章节目录'}).waitFor();

    // 待确认章节高亮显示并可点击
    const waitingTag = page.locator('.vc-tag.warn.clickable').first();
    await waitingTag.waitFor();
    assert.equal(await waitingTag.textContent(), '待确认');

    // 点击待确认标签直接进入标注页（确认已并入标注，无中间页）
    await waitingTag.click();
    await page.locator('.vc-annotated-topbar').waitFor();
    await page.locator('.vc-issue-card').first().waitFor();
    console.log('✓ 验证 3.1 成功：章节目录点击「待确认」直接进入标注页！');

    // 检查淡红色提示（标注页内直接展示待确认说话人）
    const issueCards = await page.locator('.vc-issue-card').all();
    assert.ok(issueCards.length >= 1, '标注页应直接展示待确认问题卡片');
    console.log('✓ 验证 3.2 成功：标注页内直接展示待确认说话人，无中间确认页！');

    // 角色音色确认已搬去角色页：进角色页走设计流程
    await click('go:roles');
    await click('candidate:神秘人');
    assert.equal(await page.locator('#designDescription').inputValue(),'神秘莫测的声音','New role design must inherit its saved voice description');
    await page.locator('.vc-top [data-act="back"]').click();
    await page.getByRole('heading',{name:'角色绑定，全书一致。'}).waitFor();
    await page.locator('.vc-top [data-act="back"]').click();
    console.log('✓ 新角色设计页自动带入已有音色描述');

    await click('editseg:2');await click('dropdown:segSpeaker');await page.locator('[data-act="pickopt:segSpeaker|旁白"]').click();await click('saveseg');
    await page.locator('.vc-annotated-topbar').waitFor();
    await page.evaluate(async()=>{const e=window.vocastEngine,c=e.state.books[0].chapters[0];c.segments[2].speaker='未知角色';c.segments[2].confidence=.4;c.segments[2].audio=null;c.status='waiting';e.touch(c);await e.persist();});
    console.log('✓ 校对保存后保留待确认处理页');

    // 角色确认已搬去角色页：从标注页进角色页忽略
    await click('go:roles');
    await page.getByRole('heading',{name:'角色绑定，全书一致。'}).waitFor();
    const roleIgnoreBtn = page.locator('[data-act="ignorerole:神秘人"]');
    await roleIgnoreBtn.waitFor();
    await roleIgnoreBtn.click();
    console.log('✓ 验证 3.3 成功：点击角色的「忽略」按钮');
    console.log('Toast:', await page.locator('#toast').textContent());

    // 验证角色已标记后台自动设计（不再前台卡住设计）
    const roleVoiceAssigned = await page.evaluate(()=>{
      const b=window.vocastEngine.state.books[0];
      const r=b.characters.find(c=>c.name==='神秘人');
      return !!r.voice || !!r.autoDesign;
    });
    assert.equal(roleVoiceAssigned, true, '忽略角色后应标记后台自动设计或已分配音色');
    console.log('✓ 验证 3.4 成功：忽略后角色自动采用设计的音色并分配！');

    // 忽略角色后已跳任务页"制作中"栏，验证后从任务卡片直接进标注页
    await page.getByRole('heading',{name:'制作任务'}).waitFor();
    assert.equal(await page.locator('[data-act="tasktab:active"].active').count(), 1, '忽略角色后应跳到任务页"制作中"栏');
    await page.evaluate(async()=>{const e=window.vocastEngine,c=e.state.books[0].chapters[0];c.segments[2].speaker='未知角色';c.segments[2].confidence=.4;c.segments[2].audio=null;c.status='waiting';e.touch(c);const __t=e.state.tasks.find(x=>x.chapterId===c.id);if(__t){__t.status='waiting';__t.phase='等待确认';}await e.persist();});
    await click('tasktab:attention');
    await page.locator('.vc-panel.vc-card-clickable').first().locator('h3').click();
    await page.locator('.vc-annotated-topbar').waitFor();
    await page.locator('.vc-issue-card').first().waitFor();

    // 检查说话人忽略按钮
    const speakerIgnoreBtn = page.locator('[data-act="ignorespeaker:2"]');
    await speakerIgnoreBtn.waitFor();
    await speakerIgnoreBtn.click();
    console.log('✓ 验证 3.5 成功：点击说话人的「忽略」按钮');

    // 验证说话人已变更为旁白
    const speakerChangedToNarrator = await page.evaluate(()=>{
      const c=window.vocastEngine.state.books[0].chapters[0];
      const s=c.segments.find(x=>x.id===2);
      return s.speaker === '旁白' && s.confidence === 1;
    });
    assert.equal(speakerChangedToNarrator, true, '忽略说话人后应默认设为旁白');
    console.log('✓ 验证 3.6 成功：忽略后该句说话人默认变更为「旁白」！');

    // 此时说话人问题已解决，角色已标记后台自动设计（不再前台卡住）
    const roleMarked = await page.evaluate(()=>{
      const r=window.vocastEngine.state.books[0].characters.find(c=>c.name==='神秘人');
      return !!r.voice || !!r.autoDesign;
    });
    assert.equal(roleMarked, true, '角色应已分配音色或标记后台自动设计');
    console.log('✓ 验证 3.7 成功：说话人已解决，角色已记录后台继续！');

    // 忽略后应跳到任务页"制作中"栏
    await page.getByRole('heading',{name:'制作任务'}).waitFor();
    const activeTab = await page.locator('[data-act="tasktab:active"].active').count();
    assert.equal(activeTab, 1, '确认后应跳到任务页"制作中"栏');
    console.log('✓ 验证 3.8 成功：确认后跳到任务页"制作中"栏！');

    // --- 测试 4：测试一键「全部忽略并继续」按钮 ---
    // 再次制造问题
    await page.evaluate(async()=>{
      const e=window.vocastEngine;
      const b=e.state.books[0];
      const c=b.chapters[1];
      b.characters.push({name:'剑客',description:'冷峻刚毅的声音',aliases:[],voice:null});
      c.segments=[
        {id:0,speaker:'剑客',text:'拔剑吧。',emotion:'冷酷',confidence:1},
        {id:1,speaker:'未知人士',text:'手下留情！',emotion:'求饶',confidence:0.3}
      ];
      c.status='waiting';
      e.touch(c);
      await e.persist();
    });
    await click('go:shelf');
    await page.locator('.vc-book').click();
    await page.waitForTimeout(800);
    await click('confirm:'+state.books[0].chapters[1].id);
    await page.locator('[data-act="ignoreall:'+state.books[0].chapters[1].id+'"]').first().click();
    await page.waitForTimeout(800);
    const batchFixed = await page.evaluate(()=>{
      const b=window.vocastEngine.state.books[0];
      const c=b.chapters[1];
      const r=b.characters.find(x=>x.name==='剑客');
      const roleOk = !!r?.voice || !!r?.autoDesign;
      const segOk = c.segments[1].speaker === '旁白' && c.segments[1].confidence === 1;
      return roleOk && segOk;
    });
    assert.equal(batchFixed, true, '一键全部忽略后说话人应修复、角色应记录后台继续');
    console.log('✓ 验证 4 成功：一键「全部忽略并继续」一键处理全部角色与说话人问题！');

    assert.equal(errors.length, 0, 'No errors during test: '+errors.join('; '));
    console.log('=== 所有 3 大功能点自动化集成测试全部通过！ ===');
  } finally {
    await browser.close();
    server.close();
  }
})();

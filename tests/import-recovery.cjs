// Exercise the shipping import UI using fake native storage and LLM responses.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/xiagu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const Flow=require('../app/src/main/assets/import-flow.js');
const Vocast=require('../app/src/main/assets/core.js');

(async()=>{
  const root=path.resolve('app/src/main/assets'),out=path.resolve('artifacts/import-recovery');fs.mkdirSync(out,{recursive:true});
  const server=http.createServer((req,res)=>{
    const file=path.resolve(root,'.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return res.writeHead(404).end();
    res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:361,height:754}}),errors=[],checks=[],requests=[];
    page.on('pageerror',e=>errors.push(e.message));
    const source='卷一-第1章 初见\n正文甲。\n卷一-第2章 重逢\n正文乙。\n'+Array.from({length:70},(_,i)=>'第'+i+'行正文').join('\n');
    let pick={name:'特殊标题的小说.txt',text:source},pickError=null,llmConfigured=true,llmResponse={template:'卷一-第*章'},llmError=null,releaseProbe=null,holdProbe=false;
    await page.exposeFunction('nativeCall',async(id,action,json)=>{
      const p=JSON.parse(json||'{}');let result=true,error=null;
      if(action==='load')result={state:null,llmConfigured,ttsConfigured:true};
      else if(action==='playbackState')result={playing:false,position:0};
      else if(action==='pick'){result=pick?[pick]:[];if(pickError)error={message:pickError,retryable:false};}
      else if(action==='saveCredentials')llmConfigured=true;
      else if(action==='request'){
        assert.equal(p.provider,'llm','import recovery must not request speech generation');
        requests.push(p);
        if(holdProbe)await new Promise(resolve=>releaseProbe=resolve);
        if(llmError)error={message:llmError,retryable:false};
        result={choices:[{message:{content:JSON.stringify(llmResponse)}}]};
      }
      await page.evaluate(value=>window.nativeResult(value),{id,result,error});
    });
    await page.addInitScript(()=>{window.Native={call:(...args)=>window.nativeCall(...args)};});
    const fresh=async()=>{await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.vocastEngine);};
    const click=act=>page.locator('[data-act="'+act+'"]').first().click();
    const count=()=>page.evaluate(()=>window.vocastEngine.state.books.length);
    const heading=()=>page.locator('.vc-import-heading h1').innerText();

    // Invalid saved rules used to throw before importDraft was assigned, leaving a blank screen.
    await fresh();await page.evaluate(()=>{window.vocastEngine.state.settings.splitRule='missing-rule';});
    await click('importbook');assert.equal(await heading(),'需要识别章节标题');
    assert.match(await page.locator('[role=alert]').innerText(),/规则/);
    assert((await page.locator('main').innerText()).includes(pick.name));
    assert.equal(await page.locator('[data-act=confirmsplit]').count(),0);
    assert.equal(await page.locator('#toast').innerText(),'');assert.equal(await count(),0);
    await page.screenshot({path:path.join(out,'failed.png')});
    checks.push('切章异常直接进入有文件名和原因的处理页，不依赖提示栏');

    holdProbe=true;await click('splitprobe');
    await page.getByRole('heading',{name:'正在识别章节',exact:true}).waitFor();
    assert.equal(await page.locator('[data-act=splitprobe]').isDisabled(),true);
    assert.equal(await page.locator('#busy').isVisible(),false);
    await page.waitForFunction(()=>document.querySelector('.vc-import-progress'));
    while(!releaseProbe)await new Promise(r=>setTimeout(r,10));
    releaseProbe();holdProbe=false;
    await page.getByRole('heading',{name:'确认章节后导入',exact:true}).waitFor();
    assert.equal(await page.locator('.vc-import-chapters li').count(),2);assert.equal(await count(),0);
    assert.match(await page.locator('.vc-import-results').innerText(),/卷一-第1章 初见/);
    const prompt=JSON.stringify(requests[0]);assert(prompt.includes('第55行正文'));assert(!prompt.includes('第65行正文'));
    await page.screenshot({path:path.join(out,'identified.png')});
    checks.push('LLM 探测显示进度、仅发送前 60 行、先预览且不自动导入');

    await page.locator('.vc-import-manual summary').click();
    await page.locator('#splitCustom').fill('不存在的第*节');
    assert.equal(await page.locator('[data-act=confirmsplit]').isDisabled(),true);
    await page.evaluate(async()=>{document.getElementById('splitCustom').setSelectionRange(2,2);await window.vocastEngine.persist();window.renderApp();});
    assert.equal(await page.locator('#splitCustom').inputValue(),'不存在的第*节');
    assert.deepEqual(await page.locator('#splitCustom').evaluate(el=>({focused:el===document.activeElement,caret:el.selectionStart})),{focused:true,caret:2});
    await click('resplit');assert.equal(await page.locator('[data-act=confirmsplit]').count(),0);
    assert.equal(await count(),0);
    await page.locator('#splitCustom').fill('卷一-第*章');await click('resplit');
    await page.getByRole('heading',{name:'确认章节后导入',exact:true}).waitFor();
    await click('confirmsplit');assert.equal(await count(),1);
    assert.equal(await page.evaluate(()=>window.vocastEngine.state.books[0]._rawText),source);
    await page.evaluate(()=>window.appBack());assert.equal(await page.locator('.vc-import-flow').count(),0);
    checks.push('改规则禁用旧预览，零匹配不能导入，修正规则后保留全文导入且返回无空页面');

    await fresh();await page.evaluate(()=>{window.vocastEngine.state.settings.splitRule='custom';window.vocastEngine.state.settings.splitCustom='';});
    await click('importbook');assert.equal(await heading(),'需要识别章节标题');
    llmResponse={template:'无星号'};await click('splitprobe');
    await page.getByText('LLM 没有返回可用的标题模板。请重新识别，或手动选择规则。',{exact:true}).waitFor();
    llmResponse={template:'不存在*节'};await click('splitprobe');
    await page.getByText('LLM 返回的模板没有匹配到章节标题。请重新识别，或展开下方手动规则调整。',{exact:true}).waitFor();
    llmError='模型暂时不可用';await click('splitprobe');
    await page.getByText('模型暂时不可用',{exact:true}).waitFor();llmError=null;
    assert.equal(await count(),0);assert.equal(await page.locator('[data-act=confirmsplit]').count(),0);
    checks.push('空模板、零匹配和模型错误留在处理页，可重试或放弃');

    for(const width of [320,361,768]){
      await page.setViewportSize({width,height:754});
      await page.emulateMedia({colorScheme:width===768?'dark':'light'});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      for(const act of ['splitprobe','cancelsplit']){
        const bounds=await page.locator('[data-act='+act+']').boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width+1);
      }
      await page.screenshot({path:path.join(out,'failure-'+width+'.png'),fullPage:true});
    }
    await page.emulateMedia({colorScheme:'light'});await page.setViewportSize({width:361,height:754});
    checks.push('320/361/768 宽度及深色模式布局');

    holdProbe=true;releaseProbe=null;llmResponse={template:'卷一-第*章'};await click('splitprobe');
    while(!releaseProbe)await new Promise(r=>setTimeout(r,10));
    await click('cancelsplit');releaseProbe();holdProbe=false;await page.waitForTimeout(100);
    assert.equal(await page.locator('.vc-import-flow').count(),0);assert.equal(await count(),0);
    await page.evaluate(()=>window.appBack());assert.equal(await page.locator('.vc-import-flow').count(),0);
    checks.push('探测期间可放弃，迟到结果不会重新打开或导入');

    llmConfigured=false;await fresh();await page.evaluate(()=>{window.vocastEngine.state.settings.splitRule='missing-rule';});
    await click('importbook');assert.equal(await page.locator('[data-act=splitprobe]').isDisabled(),true);
    await click('importllm');await page.locator('#llmKey').fill('fake-test-key');await click('savellm');
    await page.getByRole('heading',{name:'需要识别章节标题',exact:true}).waitFor();
    assert((await page.locator('main').innerText()).includes(pick.name));
    assert.equal(await page.locator('[data-act=splitprobe]').isEnabled(),true);
    await page.evaluate(()=>window.appBack());assert.equal(await page.locator('.vc-import-flow').count(),0);
    checks.push('配置语言模型后返回原文件处理页，Android 返回等同放弃');

    pickError='文件无法读取';await click('importbook');await page.getByRole('heading',{name:'文件读取失败',exact:true}).waitFor();
    assert.equal(await page.locator('[data-act=splitprobe]').count(),0);
    assert.equal(await page.getByRole('button',{name:'重新选择文件',exact:true}).count(),1);
    await click('cancelsplit');pickError=null;pick=null;await click('importbook');
    assert.equal(await page.locator('.vc-import-flow').count(),0);checks.push('读取错误直接显示处理页，文件选择取消保持原页面');

    pick={name:'自动识别失败.txt',text:'只有正文，没有任何章节标题。'};
    await page.evaluate(()=>{window.vocastEngine.state.settings.splitRule='auto';});
    const requestCount=requests.length;await click('importbook');
    await page.getByRole('heading',{name:'需要识别章节标题',exact:true}).waitFor();
    assert.match(await page.locator('[role=alert]').innerText(),/没有找到/);
    assert.equal(requests.length,requestCount,'LLM probing must wait for an explicit user action');
    assert.equal(await page.locator('[data-act=confirmsplit]').count(),0);assert.equal(await count(),0);
    await click('cancelsplit');checks.push('自动切章零匹配直接进入处理页，等待用户选择后才调用 LLM');

    const forced=Flow.createDraft({name:'无标题.txt',text:'仅有正文。'},{splitRule:'chapter_cn'});
    Flow.splitDraft(forced,Vocast.splitChapters);assert.equal(Flow.canImport(forced),false);
    assert.equal(forced.result,null);checks.push('指定规则零匹配也不会把全文当作成功切章');
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({passed:true,nativeBridge:'mock',externalApiCalls:0,checks,errors},null,2));
    console.log(JSON.stringify({passed:true,checks},null,2));
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

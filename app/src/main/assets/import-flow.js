(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.VocastImport=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function createDraft(file,settings={}){
    return {...file,name:file.name||'未命名文件',text:file.text||'',ruleId:settings.splitRule||'auto',
      customPattern:settings.splitCustom||'',result:null,error:file.error||'',probing:false,ruleDirty:false,probeNote:'',manualOpen:false};
  }
  function splitDraft(draft,split){
    draft.result=null;draft.error='';draft.ruleDirty=false;
    try{
      const result=split(draft.text,{ruleId:draft.ruleId,customPattern:draft.customPattern});
      if((result.report?.failed&&!result.report?.singleChapter)||!result.chapters?.length){
        draft.error='没有找到与当前规则匹配的章节标题。可以让 LLM 帮你识别，或手动选择其他规则。';
      }else draft.result=result;
    }catch(error){draft.error=error.message||String(error);}
    return draft;
  }
  function canImport(draft){
    return !!(draft?.result?.chapters?.length&&(!draft.result.report?.failed||draft.result.report?.singleChapter)&&!draft.ruleDirty&&!draft.probing&&!draft.importing);
  }
  function renderDraft(d,ui){
    const {E,I,B,top,dd,field}=ui;
    if(!d)return top('导入小说')+'<div class="vc-panel"><h1>请重新选择文件</h1><p>这次导入的文件尚未读取，请重新选择小说继续。</p>'+B('选择小说文件','importbook')+B('返回书架','cancelsplit',true)+'</div>';
    const hasText=!!d.text.trim(),ready=canImport(d),hasResult=!!d.result&&!d.ruleDirty;
    const title=d.importing?'正在导入小说':d.probing?'正在识别章节':ready?'确认章节后导入':d.ruleDirty?'应用规则后预览章节':hasText?'需要识别章节标题':'文件读取失败';
    const lead=d.importing?'正在把已确认的章节保存到书架，请稍候。':d.probing?'LLM 正在识别文件中的章节标题。完成后请检查预览，也可以放弃这次导入。':ready?'请检查下面的章节标题。确认无误后，小说才会加入书架。':d.ruleDirty?'规则已修改，请先应用规则，检查新的章节预览。':hasText?'文件已读取，但还没能完成切章。让 LLM 识别标题格式，预览无误后即可继续导入。':'这次未能读取小说内容，请重新选择 TXT 或 EPUB 文件。';
    const probeText=d.probing?'正在识别章节…':hasResult?'重新用 LLM 识别章节':'用 LLM 识别章节';
    let h=top('导入小说')+`<section class="vc-import-flow" aria-busy="${!!(d.probing||d.importing)}"><div class="vc-import-heading"><span class="vc-import-icon">${I(ready?'list-checks':'book-open')}</span><p class="vc-kicker">${d.probing||d.importing?'正在处理':ready?'最后一步':'需要你处理'}</p><h1>${title}</h1><p class="vc-sub">${E(d.name)}</p><p>${lead}</p></div>`;
    if(d.token)h+=`<div class="vc-panel"><p>文本编码：${E(d.encoding)} · 识别可信度 ${E(d.encodingConfidence||'高')}</p>${d.damagedCount?`<p class="warn">${d.damagedCount} 处损坏字符；首处在第 ${Number(d.firstDamagedAt)+1} 字附近。</p>`:''}<div class="vc-chip-row">${['UTF-8','GB18030','UTF-16'].map(encoding=>B(encoding,'encoding:'+encoding,true,encoding===d.encoding)).join('')}</div><details><summary>查看原文编码预览</summary><pre class="vc-source-preview">${E(d.text.slice(0,600))}</pre>${d.firstDamagedAt>=0?`<p>首处损坏附近：${E(d.text.slice(Math.max(0,d.firstDamagedAt-40),d.firstDamagedAt+80))}</p>`:''}</details></div>`;if(d.error)h+=`<div class="vc-import-error" role="alert"><strong>${d.result?'重新识别未成功，原方案仍可用':hasText?'还没有完成切章':'未能读取文件'}</strong><p>${E(d.error)}</p></div>`;
    if(d.probing)h+='<div class="vc-import-progress" role="status">正在分析开头、中段和结尾的标题格式，并验证全文。完成后会显示对比方案。</div>';
    if(hasResult){
      const chapters=d.result.chapters;h+=`<p class="vc-sub">${d.result.report.singleChapter?'未找到标题，将完整正文作为一章导入。':'原文字符保留率 100%。'}${d.result.report.emptyChapters?' 有 '+d.result.report.emptyChapters+' 个空章节，标题仍保留。':''}</p>`;
      h+=`<div class="vc-panel vc-import-results"><div class="vc-row"><h3>识别到 ${chapters.length} 章</h3><span class="vc-tag">待确认</span></div>${d.probeNote?`<p class="vc-sub">${E(d.probeNote)}</p>`:''}<ol class="vc-import-chapters">${chapters.slice(0,8).map(c=>`<li>${E(c.title)}</li>`).join('')}</ol><details id="import-catalog" ${d.catalogOpen?'open':''}><summary>查看完整目录与逐章原文 · ${chapters.length} 章</summary><ol class="vc-import-chapters">${chapters.map(c=>`<li><details><summary>${E(c.title)} · ${c.text.length} 字</summary><pre class="vc-source-preview">${E(c.text.slice(0,400)||'（此章正文为空，标题会保留）')}</pre></details></li>`).join('')}</ol></details></div>`;
    }
    h+=`<p id="import-rule-status" class="vc-sub" role="status">${d.ruleDirty?'规则已修改，请应用规则并预览。':''}</p><div class="vc-import-actions">`;
    if(hasResult)h+=B(d.importing?'正在保存…':d.mode==='restore'?'选择并恢复本章原文':d.mode==='append'?'确认追加 '+d.result.chapters.length+' 章':'确认导入 '+d.result.chapters.length+' 章','confirmsplit',false,!ready);
    if(hasText){
      h+=B(probeText,'splitprobe',hasResult,d.probing||d.importing||!ui.llmConfigured);
      if(!ui.llmConfigured)h+='<p class="vc-sub">先配置语言模型，再使用 LLM 识别章节。</p>'+B('配置语言模型','importllm',true);
    }else h+=B('重新选择文件','importbook');
    h+=B('放弃导入','cancelsplit',true,d.importing)+'</div>';
    if(hasText){
      h+='<p class="footer-note">LLM 会抽取文件开头、中段和结尾识别标题格式，并用全文验证匹配结果。你确认前不会加入书架，也不会开始生成音频。</p>';
      h+=`<details id="import-manual" class="vc-import-manual" ${d.manualOpen?'open':''} ${d.probing||d.importing?'inert':''}><summary>手动选择切章规则</summary><p class="vc-sub">知道章节标题格式时，可以手动选择规则，再预览结果。</p>${dd('splitRule','切章规则',[['auto','自动识别（推荐）'],['chapter_cn','第X章/节/回'],['volume_cn','第X卷'],['special_cn','楔子/番外/序章'],['chapter_en','Chapter N'],['number_dot','数字点标题'],['paren_num','括号序号'],['bare_num','纯数字行'],['bare_cn_num','纯汉字数字'],['num_chapter','第N+空格+标题'],['custom','自定义模板']],d.ruleId)}${d.ruleId==='custom'?field('标题模板（* 代表章号，如 卷一-第*章）','splitCustom',d.customPattern):''}${B('应用规则并预览','resplit',true)}</details>`;
    }
    return h+'</section>';
  }
  return {createDraft,splitDraft,canImport,renderDraft};
});

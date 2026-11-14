/* User-facing help, authored as Markdown and shared by the forms and help index. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BajiaoSettingsHelp=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const TOPICS={
 llm:{title:'语言模型',markdown:`语言模型负责读懂原文、识别角色。要让小说发出声音，还需要配置「语音引擎」。

## 第一次怎么填？
1. 选择**提供商**，使用网关时选**其他**并填写提供商名称。
2. 按服务商说明选择 **API 格式**：OpenAI Chat Completions、OpenAI Responses 或 Anthropic Messages。
3. 填入**接口地址**和 **API Key（账户密钥）**。地址支持 API 基础地址，也支持完整请求地址。
4. 手动**添加**模型 ID，或点**自动获取**后选择要添加的模型。当前模型用于之后的制作。
5. 点**测试连接**检查，再点**保存设置**。

## 网关要求自定义 Headers 怎么填？
在**自定义 Headers**中点**添加**，分别填写名称和值，可添加多项或删除。自定义值会覆盖同名默认 Header，例如 Authorization、x-api-key 或 anthropic-version。

只用 Headers 认证时，可以不填 API Key。更换地址时先点**清除已保存的密钥**，再填入新服务的 Headers，避免沿用旧服务的密钥。Header 值跟随密钥显示／隐藏，保存后重启仍可编辑。

## 自动获取失败怎么办？
有些网关没有模型列表接口，或需要额外权限。核对地址、认证与 API 格式后重试，也可以直接手动添加服务商提供的模型 ID。自动获取不会保存配置。

## 测试成功就保存了吗？
没有。测试只检查当前填写的内容，会调用服务、产生用量；保存后才用于制作。

## 密钥怎么改？
- 输入框留空：保留已经保存的密钥。
- 更换服务地址：同时填写新服务的密钥，或清除旧密钥并填写新服务的认证 Headers。
- 点**清除已保存的密钥**，再保存：移除密钥。

测试失败时，先核对地址、模型名称、密钥和账户余额。`},
 mimo:{title:'语音引擎',markdown:`语音引擎负责把文字变成声音，也用于音色设计和参考音频克隆。

## 怎么开始使用？
1. 填入 MiMo 服务的 **API Key（账户密钥）**。
2. 点**测试合成**，成功后可以试听。
3. 确认无误，再点**保存设置**。

测试会合成一小段声音，产生服务用量；测试不会替你保存密钥。

## 需要自己选模型吗？
不需要。选好音色后，芭蕉会根据朗读、设计音色或参考音频克隆，选择对应的服务。

## 保存后会影响什么？
- 后续合成使用保存的密钥，已做好的音频保留。
- 留空表示保留原密钥；要删除，请点**清除已保存的密钥**后再保存。`},
 productionmode:{title:'制作模式与识别',markdown:`这里决定芭蕉怎样理解原文，以及认不准角色时怎么继续。

## 快速和导演怎么选？
- **快速模式**：使用简洁的朗读指导，适合希望先做出来、尽快听书。
- **导演模式（默认）**：为对白补充场景和演绎指导，适合更在意角色表现。

切换后用于新标注的章节。已经标注好的章节继续使用原来的模式。

## 不确定是谁在说话，怎么办？
- **使用旁白继续**：先用旁白读下去，之后可以在标注页校对。
- **等待人工确认**：留给你检查说话人，确认后再制作。

## 高级设置什么时候改？
- **置信度阈值**越高，越严格地判断说话人是否可靠。不清楚时保持默认。
- **角色别名合并**处理「同一个人有不同称呼」的情况。选自动合并可减少操作；选人工确认则由你核对。`},
 voicepolicy:{title:'音色分配',markdown:`这里设置全局选音色的方式。想修改某本书里具体角色的声音，请到那本书的「角色与音色」。

## 想省操作，还是想亲自挑？
- **自动采用**：找到合适音色或设计出新音色后，直接用于制作。
- **先试听确认**：由你试听、确认后再采用。

开启**允许自动匹配 MiMo 预设**后，内置音色也能参与自动匹配。默认指定的音色仍会直接使用。

## 新书默认音色怎么用？
- **旁白、男主、女主**可分别指定一个音色。
- 主角选**按通用规则匹配**：交给芭蕉根据角色挑选。
- 同一本书的不同主要角色，请使用不同声线。

## 会改变已经导入的书吗？
不会。每本新书在导入时记住当时的默认方案，之后修改这里不影响旧书。

删除被默认方案使用的个人音色前，会列出受影响的书。删除后可重新选择；已有音频保留，旁白缺失时使用白桦，未绑定的主角按通用规则匹配。`},
 productionpolicy:{title:'网络与并发',markdown:`这里控制制作时使用什么网络，以及同时处理多少工作。

## 不想用移动流量？
开启**仅 Wi-Fi 下制作**。离开 Wi-Fi 后，会等当前请求结束再等待，已经做好的内容保留。

## 两种「同时制作」有什么区别？
- **同时制作章节**：一次推进几章的制作。
- **语音请求总并发**：这些章节合起来，最多同时合成几段声音。

想先稳定使用，可以保持默认；经常出现限流提示时，可以降低并发。调大不一定更快，仍受服务商限制。

## 超时要不要改？
- **连接超时**：最多等多久才能连上服务。
- **响应超时**：连上之后，最多等多久接收结果。

一般保持默认。服务通常要等很久才返回结果时，再考虑增加响应超时。保存后用于后续请求。`},
 quality:{title:'失败与重试',markdown:`临时出错时，芭蕉可以按你设置的次数再试。只有可重试的异常才会自动重试。

## 两个次数分别管什么？
- **语言模型（LLM）**：读懂原文、识别角色等文字分析请求。
- **语音服务（TTS）**：把文字变成声音、设计音色等语音请求。

> 例如填 **2 次**：先正常尝试 1 次，失败后最多再试 2 次，共最多尝试 3 次。填 **0** 表示不自动重试。

## TTS 会另外重合成一次吗？
不会。请求失败和需要重合成的音频异常**共用同一计数**，不会叠加一套次数。

## 哪些情况会重试？
- 断网、超时、临时限流或服务暂时出错。
- 空音频、损坏等可以重新合成的音频异常。

密钥错误、余额不足、参数错误或本地保存失败时，需要先处理原因。内容审核拒绝不会自动重试。

## TTS 句子审核不通过时怎么办？
在本页选择处理方式，默认**用户确认**。
- **直接跳过**：保留原文，不生成这句音频，自动继续其余句子。
- **用户确认**：这句转为待处理，其余句子继续制作。进入标注页，可重新合成或选择「跳过本句合成」。

跳过后仍可在本句朗读设置中取消跳过。该设置只处理 TTS 句子的审核拒绝，其他异常仍按重试规则处理。

## 次数用完以后呢？
会转为待处理或失败，保留已经做好的内容。到「制作」查看原因，处理后手动继续；某一句声音有问题，也可以到标注页重新合成那一句。`},
 playbackpolicy:{title:'播放设置',markdown:`这里调整听书速度，以及后面的章节是否提前制作。

## 怎样少等一会儿？
开启**听书时自动预制作**，再选择**提前制作章数**，芭蕉会在你收听时准备后面的章节。

- 提前的章数越多，准备的内容越多，也可能更早产生制作费用。
- 关闭后不再自动添加后续章节；已经排队或正在制作的任务，可以到「制作」暂停。
- 关闭开关会记住你选择的提前章数，下次开启不必重选。

## 播放速度怎么改？
可选 0.5–3 倍。这里的倍速点**保存设置**后生效；听书页直接调倍速会立即生效。

## 追上制作进度会怎样？
第一次会等待新内容并自动续播。等待本章合并、再等下一章，算同一次等待。

播了一段新内容后再次追上进度，会停止并提示你。可以等内容做好后手动播放；主动暂停或睡眠定时停止后，也需要你手动恢复。`},
 readerpolicy:{title:'阅读显示',markdown:`字号和行距同时用于「原文」与「标注」页。

## 怎样调得舒服？
1. 看字费劲时，先把**字号**调大一点。
2. 觉得文字挤在一起时，再把**行距**调宽。
3. 观察下方的样本文字，满意后点**保存设置**。

## 预览改变了，正文为什么没变？
预览只用来试效果。保存后，新的字号和行距才用于正文。

点**恢复本页默认值**可以先试回原来的大小；仍需保存才会应用。`},
 importpolicy:{title:'新书导入',markdown:`这里选择以后导入新书时，默认怎样识别章节。

## 不清楚选哪种？
先用**自动识别**。如果书的标题格式很统一，也可以选对应规则，例如「第 X 章」或「Chapter N」。

## 自定义模板怎么写？
用 \`*\` 代表章号，其他文字按标题填写。

> 例如标题是「第十二章 山中来客」，模板可填 \`第*章\`。

选了自定义后，需要填写模板并保存。

## 导入时还能调整吗？
可以。实际导入时还能选择文字编码、查看章节预览，并调整切章规则。请先检查预览是否正确。

这里的默认值只影响以后导入的书。已有标注或音频的书不能直接重新切章。`},
 storagepolicy:{title:'音频存储',markdown:`想节省空间，可以自动清理听完的音频，也可以手动管理。

## 完播自动释放会删除什么？
- 清理符合条件的已完播章节音频。
- **原文和标注保留**，但再次收听需要重新制作，可能再次产生费用。
- 正在听、尚未播完的章节会保留。

## 「保留已完播章节」是什么意思？
选择最近保留几章已经听完的内容，其余可释放。选 **0** 表示不额外保留已完播章节。

> 想随时回听前两章，可以选择**保留 2 章**。

## 想自己检查再删？
点**管理音频**查看占用并手动清理，确认影响范围后再删除。

统计中还包含分句音频、原始返回和音色样本，所以文件数可能比章节数多。`}
};
// Official Chinese onboarding links. Android resolves the same IDs to fixed URLs.
const MIMO_LINKS={
 keys:{label:'打开 MiMo 中国官网 · API Keys',url:'https://platform.xiaomimimo.com/#/console/api-keys'},
 account:{label:'注册小米账号',url:'https://id.mi.com/'},
 docs:{label:'查看官方申请说明',url:'https://mimo.mi.com/docs/zh-CN/quick-start/summary/first-api-call'},
 pricing:{label:'查看官方价格与免费说明',url:'https://mimo.mi.com/docs/zh-CN/price/pay-as-you-go'}
};
const MIMO_STEPS=[
 {title:'注册或登录 MiMo 账号',markdown:'打开 MiMo 中国官网入口，使用**小米账号**登录。没有账号时，点登录页的**注册**，按提示完成注册，再登录 MiMo 开放平台。已有小米账号可以直接使用；首次进入平台时，按官网提示完成开通。',image:'help/mimo/login.jpg',alt:'小米账号登录页，顶部有登录和注册入口',caption:'官网登录页截图：没有账号时选择「注册」。'},
 {title:'创建 API Key',markdown:'登录后进入控制台的 **API Keys** 页面，点**创建 API Key**，按页面提示填写名称并确认创建，然后复制完整密钥。这里使用普通 API Key；无需为语音服务购买订阅套餐。',image:'help/mimo/api-keys.jpg',alt:'MiMo 官方文档提供 API Keys 链接并说明创建 API Key',caption:'官方申请文档截图：从「API Keys」进入创建页面。'},
 {title:'回到芭蕉，粘贴并保存',markdown:'关闭本说明，将复制的密钥粘贴到 **API Key** 输入框，点**测试合成**，成功后试听，再点**保存设置**。请妥善保管密钥，不要将它发到群聊或公开截图中。'}
];
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function inline(value){return value.split(/(`[^`]+`)/g).map(part=>part.startsWith('`')?'<code>'+escape(part.slice(1,-1))+'</code>':escape(part).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')).join('');}
// This local guide needs paragraphs, headings, lists, emphasis and examples only.
// Escape text before adding markup; no HTML from the source is executed.
function render(markdown){
 const html=[];let paragraph=[],items=[],list=null,quotes=[];
 const flush=()=>{if(paragraph.length){html.push('<p>'+paragraph.map(inline).join('<br>')+'</p>');paragraph=[];}if(items.length){html.push('<'+list+'>'+items.map(item=>'<li>'+inline(item)+'</li>').join('')+'</'+list+'>');items=[];list=null;}if(quotes.length){html.push('<blockquote><p>'+quotes.map(inline).join('<br>')+'</p></blockquote>');quotes=[];}};
 for(const raw of String(markdown||'').split(/\r?\n/)){
  const line=raw.trim(),heading=/^#{1,3}\s+(.+)$/.exec(line),item=/^(?:([-*])\s+|\d+\.\s+)(.+)$/.exec(line),quote=/^>\s?(.*)$/.exec(line);
  if(!line){flush();continue;}
  if(heading){flush();html.push('<h3>'+inline(heading[1])+'</h3>');continue;}
  if(item){const type=item[1]?'ul':'ol';if(paragraph.length||quotes.length||list&&list!==type)flush();list=type;items.push(item[2]);continue;}
  if(quote){if(paragraph.length||items.length)flush();quotes.push(quote[1]);continue;}
  if(items.length||quotes.length)flush();paragraph.push(line);
 }
 flush();return html.join('');
}
return {TOPICS,render,MIMO_LINKS,MIMO_STEPS};
});

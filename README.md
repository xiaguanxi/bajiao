# Vocast Android

将小说分句标注为旁白和角色，匹配个人音色库，使用 MiMo 生成多角色有声书。首期可安装开发版，Android 8.0+。

## 已实现

- TXT（UTF-8 / GB18030）及 EPUB 导入，章节目录、批量选章。
- 原文、标注、听书三种阅读模式；人工修正说话人与情绪，保留其他已完成片段。
- 换绑角色音色保留已有成品；标注页的段落操作面板可查看、编辑 TTS 提示词并单独重做，失败保留原音频。
- 我的音色：导入 WAV / MP3 后填写声学描述，名称可独立编辑；或通过 MiMo 设计参考样本。两类样本统一参与 AI 匹配并直接用于克隆。
- 优先沿用角色绑定，再匹配音色库。没有匹配才设计。新安装默认自动采用；可切换先试听确认，升级保留既有选择。支持全局和单书策略。
- 任务队列、进度、暂停、失败重试、恢复及已完成片段去重。
- MiMo 预设、设计、克隆；自定义 OpenAI 兼容或 Anthropic 语言模型配置。
- 原生音频播放服务、定时停止、倍速、WAV 导出；Android Keystore 加密密钥。

## 构建

安装 JDK 17、Android SDK platform 35 / build-tools 35.0.0，设置 JAVA_HOME 和 ANDROID_HOME，运行：

```powershell
./gradlew.bat assembleDebug lintDebug
```

APK 在 `app/build/outputs/apk/debug/app-debug.apk`。本工作区已准备本地工具链，也可以执行 `./scripts/build.ps1`，输出到 `artifacts/Vocast-debug.apk`。APK 不包含测试密钥，安装后在「我的 → 语言模型 / 语音引擎」填写。

## 2026-10-16 原型更新（0.8.1）

继续按照同一原型项目的最新版本迁移：书架管理栏常驻选择与删除操作；章节管理使用独立标题栏、整行选择和制作/释放/重置操作；标注页将试听、编辑、跳过、提示词和历史集中到段落操作面板。「我的」改为直接分组导航，音色分配、网络与制作、新书导入和合成异常处理均采用独立草稿、明确保存及离开确认。

仅 Wi-Fi 制作接入 Android 网络回调。离线阻止制作；非 Wi-Fi 时可取消、仅本次允许所选章节，或关闭限制。网络变化清除临时授权，回到允许的网络后继续等待任务，保留已完成片段。请求失败遵守设置中的重试上限，达到上限显示失败；音频异常重合成单独计数。段落面板内可直接暂停、结束真实音频试听。补充出厂 WebView 83 的新弹层与章节管理兼容。

交付：`artifacts/Vocast-0.8.1-new-ui.apk`（版本号 71，debug 签名）。新版报告在 `artifacts/ui-migration-v081/report.html`，17 组原型/应用截图、回归记录、升级后的音频哈希和验证范围均保存在同目录。旧版 APK 和验收资料继续保留。197 项回归、16 组浏览器流程和 12 组 Android 触摸流程通过；17 个页面与弹层在同数据、412×835 视口下逐像素一致。设备验证使用 Android 11 / API 30 模拟器与出厂 WebView 83，保留两本书共 303 章及 5 个原有音频文件的哈希，早期设备脚本因遮挡误判误触发起 1 次 MiMo TTS 请求，已记录并修正脚本；最终回归不再追加请求。未做真机测试。

## 2026-10-16 新版 UI（0.8.0）

按照指定的最新原型项目 `825795b9-a32a-4eca-86a5-c878a3be9a2c` 迁移页面与交互：书架整书选择、书籍资料和封面、固定书籍信息的独立章节目录、阅读设置与章末续读、标注异常定位、精简音色列表和批量删除、音色编辑与重新设计、角色音色即时选择，以及播放器目录、定时和独立的自动制作/完播释放设置。原型中移除的筛选及逐章菜单入口不再显示。

保留 Android 原生导入、导出、真实合成、后台制作/播放及 Keystore。浏览器演示适配器未打入 APK。新安装的语言模型地址与模型 ID 留空，升级保留现有配置；模型连接测试和音色设计仍通过原生接口调用真实服务。补充出厂 WebView 83 缺失的 DOM API、弹层视口单位及部分布局兼容。

交付：`artifacts/Vocast-0.8.0-new-ui.apk`（debug 签名，可覆盖同签名旧版本）。验收报告及原型/应用对照截图在 `artifacts/ui-migration/report.html`，文件哈希与验证范围在同目录 `delivery.json`。

187 项回归、12 组浏览器流程、构建及 lint 通过。九个主要页面在相同数据、412×835 视口下截图比较一致。Android 11 / API 30 模拟器使用真实触摸验证升级、章节切换、后台播放、阅读与播放器弹层；保留两本书共 303 章、角色绑定及原有音频 SHA-256。未使用真机或其他 Android 版本验证，未为本次迁移发起收费模型请求；浏览器模型流程使用原生协议测试数据。

复测：`node --test tests/*.test.cjs`、`node tests/prototype-migration.cjs`、`node tests/prototype-device.cjs`。设备脚本需已有可播放书籍及 `scripts/prepare-device-touch.ps1` 安装的触摸辅助程序；通过 CDP 仅读取页面，输入通过 Android 触摸和按键。

## 模型配置

语言模型由用户填写 HTTPS Base URL 和模型 ID。MiniMax **中国区 Token Plan** 可填写 `https://api.minimax.cn/v1` 和 `MiniMax-M3`，OpenAI 协议请求携带 `thinking: {type: 'disabled'}`。Anthropic 协议对应 `https://api.minimax.cn/anthropic`。切换协议时需填写相应地址。其他语言模型需支持所选协议及结构化 JSON 输出，并受其上下文长度限制。

MiMo 固定使用 `https://api.xiaomimimo.com/v1/chat/completions`，按操作选择 `mimo-v2.5-tts`、`mimo-v2.5-tts-voicedesign`、`mimo-v2.5-tts-voiceclone`。克隆以参考音频 data URL 合成新文本，不创建持久化 voice ID。

## 测试与证据

```powershell
node --test tests/core.test.cjs
./scripts/with-env.ps1 -Script tests/live.cjs
node tests/ui.cjs
```

真实接口测试从 Windows Process / User / Machine 环境变量读取 `MINIMAX_KEY` 和 `MIMO_KEY`，不会把密钥写入报告或 APK。`tests/ui.cjs` 使用 Playwright / Edge；可通过 PLAYWRIGHT_MODULE 指定 Playwright 模块路径。

本次已通过：

- 32 项核心逻辑测试：默认确认、自动采用、失败续做、不确定角色、修正失效范围、暂停时并发请求保存、429 退避、克隆串行、空音频响应重试及合并期间修改/取消等。
- 12 次真实接口调用：MiniMax 国内角色标注及音色匹配；MiMo 预设、设计、设计样本克隆、导入样本克隆、整章多角色合成。证据 `artifacts/live/report.json`，可听结果 `artifacts/live/completed-chapter.wav`。
- 页面集成：批量选章、导入描述、全局策略、国内地址、恢复，320 / 412 / 768 宽度检查，截图在 `artifacts/ui/`。此测试模拟原生桥，不等于 Android 设备测试。
- 原生 Java 文件处理：对真实生成 WAV 解码与合并、拒绝坏文件和路径、GB18030 解码、EPUB spine 顺序与脚本过滤（`tests/NativeFilesTest.java`）。
- Gradle debug 构建与 Android lint 无错误。WebView 启用 JS 的安全提示保留；仅装载应用内资源，网络请求经原生桥执行。

## 当前边界

- 当前是原生 Java 外壳 + 本地 WebView 界面。本机 Android 11 模拟器已通过 WHPX / SwiftShader 无窗口启动，使用真实 Android 触摸事件验证文件选择、角色校对、音色试听确认、通知与后台播放。设备脚本只通过 CDP 读取界面和状态，不用 DOM 点击或模拟原生桥。
- 制作由前台服务与持续通知维持，离开页面或返回桌面仍可继续；系统省电限制、强制停止或进程被回收可能中断，需要在任务页恢复。
- 播放支持上一章、下一章、已制作章节自动续播，以及系统媒体通知控制；切章依赖应用进程中的章节队列。支持书籍删除及单章删除、撤销；云同步尚未实现。
- EPUB 暂不支持 DRM、损坏或非标准 XHTML；WAV 参考需 PCM 格式。较大章节拆分；跨章节身份识别仍可能需人工校对。
- 当前为 debug 安装包；商店发布前还需要正式签名、设备回归与目标 Android 版本兼容测试。

## 代码结构

`app/src/main/assets/core.js` 是应用与真实接口测试共用的制作引擎；`app.js` 是可操作界面；`bridge.js` 是异步原生接口。`MainActivity.java` 管理文件、网络和状态；`SecretStore.java` 管理加密密钥；`AudioFiles.java` 校验并合并 WAV；`BookImporter.java` 解析书籍；`PlaybackService.java` 提供后台播放。

官方参考：[MiMo TTS](https://mimo.mi.com/docs/zh-CN/api/audio/tts)、[MiniMax Token Plan](https://platform.minimax.cn/docs/token-plan/other-tools)。

## 2026-10-03 真实小说回归（0.1.1）

用 `books` 中的约 2.31 MB、120 万字符 GB18030 小说完成全书导入及性能压力测试，并实际调用 MiniMax 国内 Token Plan / MiMo 完成首章 110 段完整配音、第 2–3 章标注与跨章节音色匹配、第 4 章片段全自动设计合成。整本书未全部配音。汇总报告在 `artifacts/novel/report.html` / `report.json`，最终试听在 `artifacts/novel/e2e/chapter-0001.wav`。

23 项核心测试通过。新增章节增量原子保存、章节正文按需读取、音频流式合并；最后测量每次保存约 108 KB（原来 14 MB），桌面保存中位耗时约 6.9 ms（原来 56 ms）。32 MB 真实章节的原生合并在 64 MB Java 堆限制下通过，结果与已验证输出哈希一致。这些不是手机性能数据，设备端验证仍待完成。

修复了漏“章”字标题识别、无依据角色名、明确个人说话提示被集体角色覆盖、标注批次漏项恢复、换音色后的片段失效、并发编辑覆盖和大批量章节清单过长。原文自身重复/缺失章节编号仅提示，不擅自删除或重排。

复测顺序：`node tests/novel-performance.cjs`、`./scripts/with-env.ps1 -Script tests/novel-e2e.cjs`、`./scripts/with-env.ps1 -Script tests/novel-continuity.cjs`、`node tests/novel-ui.cjs`。真实流程用本地检查点保存完成进度；重跑不需要重制已完成章节。`tests/NovelImportTest.java`、`SnapshotStoreTest.java`、`NovelMergePerformance.java` 验证原生导入、原子与按需存储和流式合并。

## 2026-10-03 Android 设备端验收（0.1.2）

Android 11 / API 30 模拟器通过真实手指触摸、按键和系统文件选择器完成了实际小说第 0001–0005 章制作。语言模型使用 MiniMax-M3；MiMo 完成预设旁白、角色音色设计和参考样本克隆。五章共 651 个分句（含跳过的广告段），成品总长 **54 分 25 秒**。完整 306 章的标题、正文和顺序均与源文件一致。

所有待确认音色实际试听后采用，不确定对白按原文逐句通过角色下拉框校正。CDP 只读取 WebView 界面和状态；没有用 DOM 点击、直接调用制作引擎或模拟原生接口替代设备交互。`artifacts/device-e2e/actions.jsonl` 保存输入操作，报告和截图在同目录。

最终 APK 已通过 9 项原生播放检查和 12 项切章/浏览检查：播放时钟、暂停/继续、前后 15 秒、倍速、定时配置、Home 后播放、通知栏暂停、五章逐章播放、边界按钮、自动下一章、通知栏切章、设置页面保持、返回目录/书架，以及浏览另一章时不误跳转后台音频。五章 WAV 均通过系统文件选择器导出，哈希、时长和 PCM 格式校验通过；最终播放与切章期间没有应用崩溃。

交付文件：`artifacts/Vocast-0.1.2-tested.apk`（debug 签名）、`artifacts/Vocast-first-5-chapters.zip`、`artifacts/device-e2e/report.html` / `report.json`。APK 与模拟器已安装包 SHA-256 一致，签名验证通过，未包含测试 API 密钥。已测范围无遗留缺陷；未进行其他 Android 版本、真机或完整 15 分钟定时到期测试。

复测工具：先运行 `scripts/start-emulator.ps1` 和 `scripts/prepare-device-touch.ps1`，在应用中导入同一本测试小说（测试书名 `vocast-novel`）并保存 M3 / MiMo 配置。`tests/device-five-chapters.cjs start` 通过实际点击选择第 0001–0005 章；`watch` 记录制作进度，`continue` 续做已暂停/失败任务。制作完成后依次执行：

```powershell
node tests/device-playback.cjs
node tests/device-chapter-navigation.cjs
node tests/device-export.cjs
./scripts/verify-device-apk.ps1
node tests/device-finalize.cjs
```

设备脚本与桌面模拟原生桥的界面测试分别保存证据；现有成品不会因复测播放器而重新请求合成。

## 2026-10-04 句末停顿修复（0.1.3）

章节合并现在把句号、问号、叹号之间的间隔补足到 350 毫秒，省略号 450 毫秒、冒号 180 毫秒。计算间隔时包含前句末尾与后句开头已有的低幅音频，只补不足部分，不裁剪任何原始语音，不在章末额外添加静音。支持单声道和立体声的 8/16/24/32 位 PCM。

多句对白保持原有说话人，分句使用同一音色合成。逐句保存检查点；离开应用或暂停后不发起下一句请求，继续制作时复用已保存的句子。已有成品可在听书页面点击「优化句末停顿」，复用单句配音，分句重制旧版的多句对白。

真实模拟器点击优化了原小说前五章，保留全文与角色绑定；补足 431 处片段间停顿，其中 392 处为句号/问号/叹号句末。只有五段多句对白重新调用 MiMo，共 10 次真实克隆请求，实测内部句间停顿 350–509 毫秒。其余原始语音数据逐字节保留。新版五章总长 55 分 45 秒。

37 项核心测试、59 项原生音频断言、构建/lint、真实 Android 播放与切章回归通过。音频和验证证据在 `artifacts/pacing/`，新版成品为 `artifacts/Vocast-0.1.3-tested.apk` 和 `artifacts/Vocast-first-5-chapters-0.1.3.zip`。复测脚本：`tests/device-pacing.cjs`、`tests/verify-device-pacing.cjs`、`tests/verify-dialogue-pacing.cjs`；原生音频测试：`tests/AudioPacingTest.java`。覆盖范围仍为 Android 11 / API 30 模拟器，APK 使用 debug 签名。

## 2026-10-14 声音质感优化（生成规则 v2）

完整中英文音色描述仅清除无效控制字符与首尾空白。显示名称独立派生；角色描述定义稳定声线，片段演绎保留否定、程度和复合情绪。正式合成按自然有声书节奏朗读，小说原文放在 assistant，完整演绎指令放在 user，不再自动插入情绪标签或指定 280 字/分钟。

自动设计使用 MiMo 的适配试听文本，并保存 `final_text_preview`；用户填写试听文本时原样发送且关闭自动优化。音色匹配通过 LLM 保守核对完整声音特征，冲突或证据不足不复用。同书主要角色排除已绑定、建议及候选预留声线（含同一参考样本的不同 ID），同类龙套及不同书籍可复用；并发设计和匹配保留这些约束。

新语音使用版本 3 的纯本地质检，不调用 ASR 或其他识别模型，不裁剪疑似重复音频。低音量、气声与渐弱尾音完整保留；长停顿、时长偏离和声学重复只提示试听，不验证台词是否完整。有效返回按原字节保存为 WAV，损坏或空返回保存为不可播放的 `.raw` 诊断资源，纳入引用保护、统计和清理。

“我的 → 合成异常处理”提供两个独立配置：合成异常时自动重试一次（默认开启）、重试前需要用户确认（默认关闭）。确认开启时优先等待用户；只有明确截断、损坏、空返回或全数字静音才触发质量异常。自动重试每个小说片段最多追加一次，拆分、暂停及恢复不重置次数。配置保存不会启动任务，普通“继续”和角色确认也不会重新收费处理已拒绝句子。

标注页每句提供“重新合成此句”，点击即确认会产生 TTS 费用，仅处理选定句子；手动轮次不再自动追加质量合成。未通过的新片段不播放、不进入缺句章节成品；其他片段继续制作。已有可播放音频在新结果及所需章节合并成功后才替换，失败保留原引用。升级、播放和任务恢复不检查或替换旧成品，也不改变角色绑定。鉴权、额度、本地保存错误与网络重试独立处理，不触发声音质量拆句。

历史真实试听产物在 `artifacts/voice-quality/live-20261013/listening.html`，覆盖儿童、青年、老年、气声、粗粝和口音；产物独立于设备书库，主观听感仍需人工确认。当前真实测试脚本已移除识别调用，运行仍会产生 TTS / LLM 费用。

复测：`node --test tests/*.test.cjs`；`node tests/ui-task-voice-fixes.cjs`；编译运行 `AudioPreservationTest.java` 和 `AudioPacingTest.java`。真实接口测试需配置 `MIMO_KEY` / `MINIMAX_KEY`，运行 `node tests/voice-quality-live.cjs <独立输出目录>`，可从报告检查点继续。设备回归使用 `tests/voice-quality-device.cjs`，运行前保存旧音频哈希和角色/章节引用基线。当前本地规则验证记录在 `artifacts/voice-quality/local-unit-tests.log`、`local-validation.json`。

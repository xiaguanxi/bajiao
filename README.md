# Vocast Android

将小说分句标注为旁白和角色，匹配个人音色库，使用 MiMo 生成多角色有声书。首期可安装开发版，Android 8.0+。

## 已实现

- TXT（UTF-8 / GB18030）及 EPUB 导入，章节目录、批量选章。
- 原文、标注、听书三种阅读模式；人工修正说话人与情绪，保留其他已完成片段。
- 我的音色：导入 WAV / MP3，文件名作为描述；或通过 MiMo 设计参考样本。两类样本统一参与 AI 匹配并直接用于克隆。
- 优先沿用角色绑定，再匹配音色库。没有匹配才设计。默认等待用户试听确认；可切换自动采用，仅失败需处理。支持全局和单书策略。
- 任务队列、进度、暂停、失败重试、恢复及已完成片段去重。
- MiMo 预设、设计、克隆；自定义 OpenAI 兼容或 Anthropic 语言模型配置。
- 原生音频播放服务、定时停止、倍速、WAV 导出；Android Keystore 加密密钥。

## 构建

安装 JDK 17、Android SDK platform 35 / build-tools 35.0.0，设置 JAVA_HOME 和 ANDROID_HOME，运行：

```powershell
./gradlew.bat assembleDebug lintDebug
```

APK 在 `app/build/outputs/apk/debug/app-debug.apk`。本工作区已准备本地工具链，也可以执行 `./scripts/build.ps1`，输出到 `artifacts/Vocast-debug.apk`。APK 不包含测试密钥，安装后在「我的 → 模型配置」填写。

## 模型配置

MiniMax **中国区 Token Plan** 默认 Base URL 为 `https://api.minimax.cn/v1`，模型为 `MiniMax-M2.7`。Anthropic 协议对应 `https://api.minimax.cn/anthropic`。切换协议时需填写相应地址。其他语言模型需支持所选协议及结构化 JSON 输出，并受其上下文长度限制。

MiMo 固定使用 `https://api.xiaomimimo.com/v1/chat/completions`，按操作选择 `mimo-v2.5-tts`、`mimo-v2.5-tts-voicedesign`、`mimo-v2.5-tts-voiceclone`。克隆以参考音频 data URL 合成新文本，不创建持久化 voice ID。

## 测试与证据

```powershell
node --test tests/core.test.cjs
./scripts/with-env.ps1 -Script tests/live.cjs
node tests/ui.cjs
```

真实接口测试从 Windows Process / User / Machine 环境变量读取 `MINIMAX_KEY` 和 `MIMO_KEY`，不会把密钥写入报告或 APK。`tests/ui.cjs` 使用 Playwright / Edge；可通过 PLAYWRIGHT_MODULE 指定 Playwright 模块路径。

本次已通过：

- 13 项核心逻辑测试：默认确认、自动采用、失败续做、不确定角色、修正失效范围等。
- 12 次真实接口调用：MiniMax 国内角色标注及音色匹配；MiMo 预设、设计、设计样本克隆、导入样本克隆、整章多角色合成。证据 `artifacts/live/report.json`，可听结果 `artifacts/live/completed-chapter.wav`。
- 页面集成：批量选章、导入描述、全局策略、国内地址、恢复，320 / 412 / 768 宽度检查，截图在 `artifacts/ui/`。此测试模拟原生桥，不等于 Android 设备测试。
- 原生 Java 文件处理：对真实生成 WAV 解码与合并、拒绝坏文件和路径、GB18030 解码、EPUB spine 顺序与脚本过滤（`tests/NativeFilesTest.java`）。
- Gradle debug 构建与 Android lint 无错误。WebView 启用 JS 的安全提示保留；仅装载应用内资源，网络请求经原生桥执行。

## 当前边界

- 当前是原生 Java 外壳 + 本地 WebView 界面。Android 模拟器在本机卡于启动，**尚未完成 APK 内设备端验收**；需要真机检查文件选择、Keystore、通知和后台播放。
- 制作采用前台队列：离开应用后当前请求完成即暂停，回到任务页继续。不是持续后台制作服务。
- 后台听书支持单章；目前未做自动下一章、精细播放通知控制、书库删除与云同步。
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

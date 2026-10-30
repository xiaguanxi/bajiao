# 开发指南

[返回项目首页](../README.md) · [更新记录](CHANGELOG.md) · [设置说明](settings-redesign.md)

## 开发环境

| 工具 | 版本或要求 |
| --- | --- |
| JDK | 17 |
| Android SDK Platform | 35 |
| Android SDK Build Tools | 35.0.0 |
| Gradle | 8.11.1，通过仓库中的 Wrapper 使用 |
| Android Gradle Plugin | 8.9.2 |
| Node.js | 用于运行 `.cjs` 测试与界面素材脚本 |

将 `JAVA_HOME` 指向 JDK，`ANDROID_HOME` 指向 Android SDK。也可以在工程根目录的 `local.properties` 中填写本机 SDK 路径，例如：

```properties
sdk.dir=C:/Android/Sdk
```

`local.properties`、本地工具链、构建产物和密钥文件由 `.gitignore` 排除。

## 构建与检查

Windows / PowerShell：

```powershell
.\gradlew.bat assembleDebug lintDebug
```

macOS / Linux：

```bash
sh ./gradlew assembleDebug lintDebug
```

默认产物为 `app/build/outputs/apk/debug/app-debug.apk`。

本工作区如果已准备 `.tools` 下的工具链，还可以使用 `scripts/build.ps1`。该脚本将调试包复制为 `artifacts/Bajiao-debug.apk`。

## 目录结构

```text
app/src/main/
├── java/com/vocast/app/   Android 桥接、导入、存储与播放服务
├── assets/               应用界面、制作引擎、模型调度与本地帮助
└── res/                  Android 资源与启动器图标
assets/branding/          品牌源图、图标与导出说明
docs/                     项目文档与 README 展示素材
scripts/                  构建、设备与素材维护脚本
tests/                    单元检查、浏览器界面回归与设备脚本
```

## 测试

例如运行核心与设置模型的本地单元检查：

```bash
node --test tests/core.test.cjs tests/settings-model.test.cjs
```

浏览器界面检查使用 Playwright 运行实际前端，设备脚本则需要 Android 工具和目标设备。不同脚本的环境要求见文件开头与[历史验证记录](CHANGELOG.md)。

连接真实模型的 `live` 脚本使用自己的服务凭据，会产生对应的 API 用量。

## 更新 README 素材

`scripts/capture-readme.cjs` 使用实际应用前端、原创演示文本和内存中的模拟原生桥，生成六张界面截图及品牌横幅。流程不读取设备书库，也不调用模型服务。

安装 Playwright 后运行：

```bash
npm install --no-save --package-lock=false playwright
node scripts/capture-readme.cjs
```

Windows 默认使用已安装的 Microsoft Edge；其他系统先运行 `npx playwright install chromium` 安装浏览器。

- `PLAYWRIGHT_MODULE` 可指定现有 Playwright 模块路径。
- `PLAYWRIGHT_BROWSER_CHANNEL` 可指定 Playwright 浏览器通道，例如 `msedge` 或 `chromium`。
- 图片写入 `docs/images/`，验证报告写入本地 `artifacts/readme-showcase/`。
- 演示书籍、角色、音色与制作进度仅用于界面展示。

截图应保持与应用当前界面一致。提交文档前，检查图片中书名、正文与配置字段，确认使用的是演示内容。

## 工程命名与兼容

- 仓库和工程目录使用 `bajiao`，Gradle 工程名使用 `Bajiao`，应用显示名称为「芭蕉」。
- 本地模拟器使用 `BajiaoTest`、`BajiaoSoftware`、`BajiaoSoftware28`。
- 局域网转发计划任务使用 `Bajiao-LanForward-<端口>`；安装脚本会迁移旧任务，卸载时兼容旧任务名。
- 安装 ID、原生包名 `com.vocast.app` 与 Android Keystore 别名 `vocast-config` 保留，用于覆盖升级及已有书库、音频和凭据读取。
- 历史 APK、测试报告及交付记录保留原文件名。`artifacts/` 中的归档不随 Git 仓库分发。

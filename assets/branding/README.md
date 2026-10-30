# 芭蕉品牌资源

当前图标由深青绿色雨景、芭蕉叶、米白色耳机与书本，以及水面涟漪组成。

`bajiao-rain-headphones.png` 是当前图标的方形源图，保留水彩质感，不预加圆角。`bajiao-master.png` 是统一导出的 1024 × 1024 图标，也用于生成 README 横幅。

仓库仅保留当前使用的图标资源；旧设计方案、参考图与探索提示词可通过 Git 历史查阅。

运行 `./scripts/build-brand-icons.ps1` 或 `node scripts/build-brand-icons.cjs` 从当前 PNG 源图重新导出 Android 资源。需要 Node、Playwright 和 Edge；`PLAYWRIGHT_MODULE` 可指定 Playwright 模块路径，默认沿用项目 UI 验证使用的本地运行库。

`bajiao_icon.png` 为 512 × 512 完整图标；`bajiao_icon_adaptive.png` 为 432 × 432 不透明自适应前景，完整构图位于中央 288 × 288 的系统可见区域。外围仅延展边缘像素，供启动器动效使用，避免空白边角。系统按圆形或圆角蒙版裁切，背景兜底色为 `#173F43`，由脚本同步写入 `colors.xml`。圆形、圆角及 64 / 48px 预览保存至 `artifacts/bajiao-rain-icon-preview.png`。所有发布 PNG 均来自同一源图。

显示品牌统一为「芭蕉」，英文代码标识使用 `Bajiao` / `bajiao`；仓库和工程目录使用 `bajiao`，本地模拟器及计划任务名称使用 `Bajiao` 前缀。安装 ID、原生组件包名与旧密钥别名保留，以维持覆盖升级和数据读取；历史 APK 和验收归档保持原文件名。

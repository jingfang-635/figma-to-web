---
name: token-binding
description: >-
  将 visual-ir.tokens 绑定为 webDir 内生成样式；并按 chrome.bounds 约束壳层几何。
  禁止兜底硬编码色值；推不出的键缺席。
---

# token-binding

## 输入

- `artifacts/ir/visual-ir.json` → `tokens`
- `visual-ir.chrome`（sidebar / header 等 bounds 与背景）

## 输出

- `spec.output.webDir` 下生成的 token 样式文件（及壳层几何所需的生成样式/CSS 变量）
- 布局壳（sider/header/品牌区）引用上述变量与尺寸，而非 ui 库默认壳尺寸

## 规则

- 颜色/字体/圆角/间距仅来自已派生 `tokens`；Skill 内禁止写死 hex/rgb 业务色。
- 推不出的 token 键 → 缺席，禁止静默占位常量。
- **Chrome 几何绑定（强制）**：
  - 侧栏宽度/高度区域对齐 `chrome.sidebar.bounds`（或 width 字段）
  - 顶栏高度对齐 `chrome` 中 header 相关 bounds（若有）
  - 品牌区、用户区文本盒应能通过对应 Layout IR `texts[].bounds` 的闸门比对（与 screen-layout-from-ir 分工：本 Skill 提供 token+壳尺寸变量，写屏 Skill 负责节点落位）
- 生成文件须标明来源于 visual-ir，避免手改色值漂移。
- **视口壳**：外层流式占满窗口（方案 C）；侧栏/顶栏尺寸来自 chrome，见 `viewport-fit`。

## 完成判据

- 样式仅引用已派生 token；无 Skill 内写死的 hex/rgb。
- 壳层尺寸变量/样式与 `visual-ir.chrome` 一致（有 chrome 数据时）。

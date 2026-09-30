---
name: token-binding
description: >-
  将 visual-ir.tokens 绑定为 webDir 内生成样式（tokens 文件）。
  禁止兜底硬编码色值；推不出的键缺席。
---

# token-binding

## 输入

- `artifacts/ir/visual-ir.json` → `tokens`

## 输出

- `webDir` 下生成的 token 样式文件

## 完成判据

- 样式仅引用已派生 token；无 Skill 内写死的 hex/rgb。

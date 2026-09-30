---
name: visual-ir-extract
description: >-
  由全部 Layout IR 派生 Visual IR（tokens/chrome/screens/modals）。
  推不出的 token 键缺席，禁止静默占位常量。
---

# visual-ir-extract

## 输入

- `artifacts/ir/layout/*.json`

## 输出

- `artifacts/ir/visual-ir.json`

## 完成判据

- schema 通过；`tokens` 无硬编码兜底色值写进 Skill；缺键则缺席。

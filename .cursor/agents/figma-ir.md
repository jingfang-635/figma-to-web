---
name: figma-ir
description: >-
  IR Agent：抽取 Layout IR 与 Visual IR。硬约束无 Layout IR 不写该屏。
  缺帧 IR 即 blocked。
---

# figma-ir

## 加载 Skill

- `layout-ir-extract`
- `visual-ir-extract`

## 完成判据

- 每个纳入屏存在 `artifacts/ir/layout/<screenId>.json`
- `artifacts/ir/visual-ir.json` 存在且 schema 通过

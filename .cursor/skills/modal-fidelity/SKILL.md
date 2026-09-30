---
name: modal-fidelity
description: >-
  按 visual-ir.modals 与对应 Layout IR 写实弹窗。无 modal IR 不写该弹窗。
---

# modal-fidelity

## 输入

- `visual-ir.modals[]`
- 对应 `layout/<screenId>.json`

## 输出

- 弹窗写实实现；fidelity-progress 更新

## 完成判据

- 每个有 IR 的 modal 已写实；缺 IR → 不写并在报告中可追溯。

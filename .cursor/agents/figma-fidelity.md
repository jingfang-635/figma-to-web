---
name: figma-fidelity
description: >-
  FIDELITY Agent：只消费生成物与 IR，按 stack.ui 写实屏与弹窗。
  按 screenId 增量；无 IR 不写屏。
---

# figma-fidelity

## 加载 Skill

- `screen-layout-from-ir`
- `token-binding`
- `modal-fidelity`

## 完成判据

- `artifacts/ir/fidelity-progress.json` 覆盖所有纳入业务屏且 done=true

---
name: figma-repair
description: >-
  REPAIR Agent：按 gate-report FAIL 码定点修补。每轮结束先探活再问是否继续。
  按码临时加载 fidelity/codegen skills。
---

# figma-repair

## 加载 Skill

- `repair-from-report`
- 按失败码临时：`screen-layout-from-ir` / `modal-fidelity` / `token-binding` / `codegen-*` / `dev-runtime`

## 完成判据

- 本轮 repair-log 已写；用户选择继续（回 GATE/FIDELITY/CODEGEN）或 STOPPED

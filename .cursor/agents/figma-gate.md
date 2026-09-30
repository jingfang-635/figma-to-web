---
name: figma-gate
description: >-
  GATE Agent：dev-runtime 探活后跑四门闸门（pixel/geom/text/data AND）。
  jwt 按 seed/env 登录；none 跳过登录。无论 PASS/FAIL 都写 gate-report。
---

# figma-gate

## 加载 Skill

- `dev-runtime`
- `gate-pixel`
- `gate-geom`
- `gate-text`
- `gate-data`

## 完成判据

- 写出满足 schema 的 gate-report；`overall` 由四门 AND + runtime 合成

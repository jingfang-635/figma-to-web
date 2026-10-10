---
name: figma-gate
description: >-
  GATE Agent：dev-runtime 探活后跑全部腿（pixel/geom/text/icons/cells/layout/data AND）。
  jwt 按 seed/env 登录；none 跳过登录。无论 PASS/FAIL 都写 gate-report。
---

# figma-gate

## 加载 Skill

- `dev-runtime`
- `viewport-fit`（方案 C 流式壳；无整页 scale）
- `gate-pixel`
- `gate-geom`
- `gate-text`
- `gate-icon`
- `gate-cells`
- `gate-layout`
- `gate-data`

## Capture 纪律

- 浏览器 viewport = IR 宽高；流式壳下不再注入关 scale（可保留无害标志）。
- capture 会额外在加宽视口（`GATE_WIDE_SCALE`）复测一次，供 `gate-layout` 判「容器是否跟随主区」。
- 几何比对原点须与页面主区约定一致。

## 完成判据

- 写出满足 schema 的 gate-report；`overall` 由**全部腿 AND**（以 `legs` 实际键为准）+ runtime 合成。
- 报告须能回答「哪一维在退化」：每腿有专属 FAIL 码；只有像素/几何/文本三腿无法覆盖图标槽、画出来的矩形与宽屏留白，故另有 icons / cells / layout 三条腿。

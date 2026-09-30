---
name: screen-layout-from-ir
description: >-
  按 Layout IR 将空壳页写实；按 screenId 增量并更新 fidelity-progress。
  无对应 IR 禁止标记 done。
---

# screen-layout-from-ir

## 输入

- `artifacts/ir/layout/<screenId>.json`
- codegen 空壳页路径（在 `webDir`）

## 输出

- 写实后的页面实现
- `artifacts/ir/fidelity-progress.json` 条目 `{ screenId, done: true }`

## 规则

- 几何/结构来自 IR 字段路径；文案来自 IR texts / app-spec 字段，不手编进 Skill。
- 只改 page body；路由表/api client 仍由 codegen 契约维护。

## 完成判据

- 纳入业务屏均 `done=true`。

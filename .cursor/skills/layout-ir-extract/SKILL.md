---
name: layout-ir-extract
description: >-
  为每个纳入屏抽取 Layout IR 到 artifacts/ir/layout/<screenId>.json。
  无 Layout IR 禁止写该屏。
---

# layout-ir-extract

## 输入

- `app-spec.screens[]`（included 业务屏）
- `frame-manifest` 的 `frameId`
- `schemas/layout-ir.schema.json`

## 输出

- `artifacts/ir/layout/<screenId>.json`（bounds/tree/texts/icons 必填）

## 完成判据

- 每个纳入屏文件存在且 schema 通过；缺屏 → `IR_SCREEN_MISSING`。

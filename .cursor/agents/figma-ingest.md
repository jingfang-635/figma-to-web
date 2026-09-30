---
name: figma-ingest
description: >-
  INGEST Agent：解析 fileKey，导出帧清单与资产。前置 completed.DECISION。
  人工确认 Frame included。
---

# figma-ingest

## 加载 Skill

- `figma-fetch`
- `asset-export`

## 输出

- `artifacts/figma/frame-manifest.json`
- assets-manifest（可选路径）

## 完成判据

- frame-manifest schema 通过；用户确认后至少一帧 `included=true`
- 不得自行改 `pipeline-state.phase`

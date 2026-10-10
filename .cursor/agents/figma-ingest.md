---
name: figma-ingest
description: >-
  INGEST Agent：解析 fileKey，导出帧清单、资产与整帧参考截图。前置 completed.DECISION。
  人工确认 Frame included；缺参考图不得完成。
---

# figma-ingest

## 加载 Skill

- `figma-fetch`
- `asset-export`

## 输出

- `artifacts/figma/frame-manifest.json`
- `artifacts/figma/assets-manifest.json`
- `imports/figma/screens/<screenId>.png`（或 included 帧导出后可映射为 screenId 的整帧 PNG；见 asset-export）

## 完成判据

- frame-manifest schema 通过；用户确认后至少一帧 `included=true`
- 参考截图已按 asset-export 落盘；`assets=[]` 且无参考图 → **未完成**
- 不得自行改 `pipeline-state.phase`

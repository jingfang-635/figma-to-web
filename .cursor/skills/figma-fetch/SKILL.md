---
name: figma-fetch
description: >-
  使用 FIGMA_ACCESS_TOKEN 拉取文件、列帧、处理限流。产出节点摘要供 frame-manifest。
  仅 INGEST 使用。
---

# figma-fetch

## 输入

- `decision.figma.fileKey`
- env 键 `FIGMA_ACCESS_TOKEN`
- 可选 env `FIGMA_RETRY_MAX`

## 输出

- `artifacts/figma/` 下节点摘要与缓存（路径记入 state.history）
- 供 `frame-manifest` 组装的帧列表候选

## 限流

- 429/5xx：指数退避，次数读 `FIGMA_RETRY_MAX`
- 耗尽 → `INGEST_FIGMA_RATE_LIMIT`，blocked

## 完成判据

- 至少能列出帧候选；不在 Skill 正文写具体 fileKey/业务帧名。

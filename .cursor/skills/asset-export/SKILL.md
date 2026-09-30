---
name: asset-export
description: >-
  按可导出节点导出资产并写 assets-manifest。INGEST 阶段使用。
---

# asset-export

## 输入

- frame-manifest / 节点摘要中的 exportable 标记
- Figma 导出 API（token 同 figma-fetch）

## 输出

- 资源文件目录（在 artifacts/figma 或后续拷贝到 `output.webDir/public`）
- `artifacts/figma/assets-manifest.json`
- frame-manifest.`assetsManifestPath` 回写

## 完成判据

- manifest 中每个导出 id 有文件或显式 skip 原因。

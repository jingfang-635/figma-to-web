---
name: asset-export
description: >-
  INGEST：导出可导出节点资产，并导出纳入帧整帧参考截图供像素腿。
  写 assets-manifest；缺参考图不得视为 INGEST 完成。
---

# asset-export

## 输入

- frame-manifest / 节点摘要中的 exportable 标记
- 用户确认后的 `included=true` 帧列表（及后续 app-spec 纳入屏的 `screenId`↔`frameId` 映射；若 INGEST 时尚无 screenId，先按 frame 导出，SPEC 后按 screenId 命名/拷贝对齐）
- Figma 导出 API（token 同 figma-fetch；只检 `.env` 键名，不回显值）

## 输出

1. **图标/切图等资产**（目录可在 `artifacts/figma` 或拷贝到 `spec.output.webDir/public`，以 manifest 为准）
2. **整帧参考截图（像素腿前置，强制）**
   - 路径：`imports/figma/screens/<screenId>.png`
   - 每一纳入业务屏（或已确认 included 且将映射为 screenId 的帧）必须有对应文件
   - 与 `scripts/gate-legs.mjs` 像素腿读取路径一致
3. `artifacts/figma/assets-manifest.json`（列出资产与参考图条目；缺文件须显式 skip 原因 + 阻断说明）
4. frame-manifest.`assetsManifestPath` 回写

## 规则

- `assets-manifest.assets = []` 且无参考图条目 → **INGEST 未完成**，不得假装可选跳过。
- 参考图导出失败 → 记 `INGEST_REF_SHOT_MISSING`（或等价），`blocked` 或保持 INGEST 未完成；禁止进入依赖像素腿的 GATE 并声称可 PASS。
- 禁止把参考图路径写死为某一业务工程盘符；仓库内相对路径固定为 `imports/figma/screens/<screenId>.png`（闸门契约）。
- **尺寸对齐**：导出 PNG 宽高须与对应 Layout IR 根 `bounds`（弹窗为 `modal-card` 或根 bounds）一致；若 Figma 导出含阴影白边导致偏大，须裁切或改用精确节点导出后再落盘。
- 可导出图标写入 manifest，供 FIDELITY chrome/列表使用；`exportable=false` 时可用 ui 图标集按节点名映射，不得省略图标槽。
- **参考图同时是图标槽的符号比对源**：`icons[].symbol.source=glyph-match` 的判定依据就是这张整帧图，所以缺参考图会同时冻结像素腿与 IR 的图标命名。IR 侧自检见 `node scripts/ir-icons.mjs`，未解析槽由图标腿报 `GATE_ICON_UNRESOLVED`。
- Skill 正文不写业务色值/文案字面量。

## 完成判据

- manifest 中每个导出 id 有文件或显式 skip 原因。
- 每个将进入闸门的 `screenId` 在 `imports/figma/screens/<screenId>.png` 存在可读文件。
- 参考图口径一致：像素腿读 `imports/figma/screens/<screenId>.png`（回退 `artifacts/figma/screens/`），图标命名也以同一张图为准。

---
name: layout-ir-extract
description: >-
  为每个纳入屏抽取 Layout IR 到 artifacts/ir/layout/<screenId>.json。
  无 Layout IR 禁止写该屏；controls.role 须按角色表分类，禁止把卡片标成表单控件；
  icons[] 须逐槽带 bounds/color/symbol，占位节点名不算已解析；
  cells[] 须逐槽带 bounds/fill，画出来的矩形没有槽就等于没有腿能看见。
---

# layout-ir-extract

本 Skill 只讲**怎么抽**。三份槽契约各自成篇，抽到哪一步读哪一份：

| 契约 | 文件 | 何时读 |
| --- | --- | --- |
| `controls.role` 分类 + 翻页区 | [controls.md](controls.md) | 标控件角色时 |
| `icons[]` 槽 | [icons.md](icons.md) | 抽图标槽时 |
| `cells[]` 槽（画出来的矩形） | [cells.md](cells.md) | 抽网格/表头/图例/开关这类矩形时 |

## 输入

- `app-spec.screens[]`（included 业务屏）
- `frame-manifest` 的 `frameId`
- `schemas/layout-ir.schema.json`

## 输出

- `artifacts/ir/layout/<screenId>.json`（bounds/tree/texts/icons 必填；controls 按角色表）

## 抽取顺序

1. **几何与文案**：树的 bounds 进 `tree`，文案进 `texts[]`。
2. **控件角色**：按 [controls.md](controls.md) 分类；容器/装饰 → 容器角色，**禁止**把大矩形标成 `textarea`/`input`。
3. **图标槽**：按 [icons.md](icons.md) 逐槽出 `icons[]`，占位节点名不算已解析。
4. **画出来的矩形**：按 [cells.md](cells.md) 逐槽出 `cells[]`——没有槽的矩形没有任何腿能看见。
5. **设计事实随 IR 留下**：节点的 `fills`/`strokes`（`$defs.paint`）与 `cornerRadius`/`strokeWeight` 是写屏取色的来源。这些值丢了，屏幕就只能重新发明颜色（`GATE_IMPL_HARDCODED`）。`controls[]` 与 `icons[]` 能取到 paint/圆角时要带上。

## 其它规则

- 几何来自 Figma 节点 bounds；文案进 `texts[]`；不把业务字面量写进 Skill。
- 每屏文件须通过 schema。

## 完成判据

- 每个纳入屏文件存在且 schema 通过（`node scripts/validate-artifact.mjs layout-ir`）；缺屏 → `IR_SCREEN_MISSING`。
- 抽检：不应出现「大块展示卡 role=`textarea`/`input`」的系统性误标。
- 图标槽自检通过：`node scripts/ir-icons.mjs` 报 `ok:true`；其中 `openSlots` 列出的 `unresolved` 槽是**已知缺口**，必须在交付说明中列出，不得当成完成。
- 图标槽数与 `tree` 中可见槽数一致：少一槽 = 漏抽，多一槽 = 把容器当图标。
- `glyph-match` 取证用 `node scripts/ir-glyphs.mjs`（把参考图里该槽的框裁出放大／与运行截图并排），符号名落 `artifacts/ir/icon-symbols.json`。
- 单元格槽自检通过：`node scripts/ir-cells.mjs` 报 `ok:true`；该屏画出的每个非数据矩形都有槽（`frame`/`grid-head`/`grid-cell`/`legend-swatch`/`badge`/`toggle-track`），活数据矩形以 `sample: true` 出槽。少一槽 = 该矩形无腿可见。

---
name: figma-fidelity
description: >-
  FIDELITY Agent：只消费生成物与 IR，按 stack.ui 写实屏与弹窗。
  按 screenId 增量；无 IR 不写屏；几何未落地禁止标 done。
---

# figma-fidelity

## 前置

- `completed.CODEGEN=true`
- 每屏待写实前存在 `artifacts/ir/layout/<screenId>.json`
- 只读 `spec.output.webDir` / IR / visual-ir；禁止回头猜 Figma 节点

## 加载 Skill

- `token-binding`（先：tokens + chrome 壳尺寸）
- `viewport-fit`（方案 C：流式壳层占满；块级打 `data-ir-fluid`；无整页 scale）
- `screen-layout-from-ir`（页面几何写实 + 图标槽逐槽 + chrome 全文案）
- `modal-fidelity`（有 modal IR 的弹窗）
- `gate-icon` / `gate-layout`（写实前先读这两条腿的判据，避免写完才发现漏槽/写死宽度）

## 纪律

- 写实 = IR 几何盒 + 文案 + chrome，不是「空壳 + 接 IR 文案」。
- 遵循各 Skill 的「标记 done 前自检」；任一项失败不得写 `done: true`。
- 无 Layout IR → 不写该屏、不标 done。
- 不得自行改 `pipeline-state.phase`（交 Orchestrator）。

## 阶段出口自检（全部纳入屏）

在声称 FIDELITY 完成前：

1. `fidelity-progress` 覆盖所有纳入业务屏（含 modal）且均为 `done: true`，且通过 `node scripts/validate-artifact.mjs fidelity-progress`。
   - 每屏 `selfCheck` 必须逐项作答并诚实：`irPresent` / `absoluteBoxes` / `iconSlotsRendered` / `iconSlotsSymboled` / `fluidMarked` / `cellsDrawn` / `liveDataWired`（modal 另加 `cardSizeLocked`）。这些布尔正是后面各腿（geom/text/icons/cells/layout/data/impl）会去量的维度——填 true 却又被腿判 FAIL，就是「谎报完成」。
2. 抽检至少一页一弹：IR bounds 锁定 + 对照参考图无「一眼假」（缺图标/错图表类型/antd 黑表头等）。
3. 已实现方案 C 流式壳层占满（见 `viewport-fit`）；无整页 contain/cover scale。
4. `visual-ir.chrome` 导航文案均在运行 DOM 中可见（策略 B 经批准除外）；图标槽已填且无 `unresolved`。
5. 图表类型与原型一致，或已记 `FIDELITY_CHART_UNSUPPORTED` / 批准 skip。
6. 数值来自 API；seed 已造活数据（见 codegen-db）。
7. 取值来源合规：无照抄 IR 的颜色/几何字面量（`node scripts/gate-legs.mjs --impl-hits`，baseline 之外应为空）。
8. 若缺参考图：交接须回 INGEST，不得声称像素腿可过。

## 完成判据

- 上述出口自检全部满足。
- 仅 `fidelity-progress` 全 done **不足以**完成；缺视觉自检视为未完成。

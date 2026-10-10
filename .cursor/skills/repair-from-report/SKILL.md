---
name: repair-from-report
description: >-
  消费 gate-report.failures，按 FAIL 码定点修补并写 repair-log。
  禁止按业务屏名散文指令；按码路由回 FIDELITY/CODEGEN/INGEST/IR/重跑 GATE。
  含图标腿、单元格腿（boxes/fills/今日徽标/图例）与流式腿（容器层 + 内容层 + 容纳层）的失败→修法索引。
---

# repair-from-report

## 输入

- `artifacts/gates/<runStamp>/gate-report.json`（`legs.*.failures` + `runtime.failures`）
- `docs/repair/fail-code-playbook.md`（策略库）

## 输出

- 代码改动或 INGEST 产物补齐
- `artifacts/gates/<runStamp>/repair-log.json`（每条含 `code` 与 path）

## 路由（摘要）

| 码前缀/码 | 回退 |
| --- | --- |
| `GATE_PIXEL_DIFF` 且 message 含 `reference screenshot missing` | **INGEST / asset-export**（补 `imports/figma/screens/<screenId>.png`）后重 GATE |
| 其它 `GATE_PIXEL_*` / `GATE_GEOM_*` / `GATE_TEXT_STYLE` / `GATE_TEXT_CONTENT` | FIDELITY（几何/文案/chrome；勿只改文案不改盒） |
| `GATE_GEOM_MODAL` | FIDELITY + modal-fidelity |
| `GATE_ICON_UNRESOLVED` | **IR**（layout-ir-extract：`figma-name` 或参考截图 `glyph-match`，补 `artifacts/ir/icon-symbols.json`）后重 GATE |
| `GATE_ICON_MISSING` / `GATE_ICON_BOX` / `GATE_ICON_COLOR` | FIDELITY（按 IR 槽补渲染/定位/取色；弹窗槽见 modal-fidelity）。槽数与角色表不符则先回 IR |
| `GATE_CELL_MISSING` / `GATE_CELL_ROLE` | FIDELITY（按 `cells[]` 阅读序逐槽补 `data-ir-cell`）。**不要**改 IR 去迎合 DOM 的漏槽/乱序；槽本就不该在 IR 里的先回 IR |
| `GATE_CELL_BOX` | FIDELITY（盒取 IR：位置与尺寸都读 `cells[].bounds`；`badge` 只比尺寸，位置跟今日走。行高/表头/图例块/切换轨禁止用组件库默认值） |
| `GATE_CELL_FILL` | FIDELITY（底色读 IR `fill`；IR 一致着色的列（周末列）不得被写死成白/被遮罩盖住；四态底色由 IR 派生，不在 CSS 编色值） |
| `GATE_LAYOUT_NO_FLUID` / `GATE_LAYOUT_SCALED` / `GATE_LAYOUT_STATIC` | FIDELITY（流式壳层：按 `viewport-fit` 改流式并打 `data-ir-fluid`） |
| `GATE_LAYOUT_INNER_STATIC` | FIDELITY（**容器跟随了但内部内容没跟随**：把字段区改成该容器**内部**的流式布局——列宽 `minmax(0,1fr)` 吃增量、label 列/列间距钉 IR 实测值、整行 `grid-column: 1 / -1`；字段必须位于 `data-ir-fluid` 容器内。见 `viewport-fit` 不变式 3 / `screen-layout-from-ir`。**不要**靠调大 `GATE_LAYOUT_INNER_GROW_RATIO` 掩盖） |
| `GATE_LAYOUT_OVERFLOW` | FIDELITY（**容器装不下自己的内容**：先把容器高度从写死改为 `height:auto` + `min-height` 取 IR，并把内容放进该容器**内部**参与布局流；再查列表屏的行高/表头高/分页大小是否取自 IR —— 用组件库默认行高渲染「一页的行」是最常见成因；翻页器应贴卡片底边。见 `viewport-fit` 不变式 4 与 `screen-layout-from-ir` 表格契约。确实要内部滚动则显式加 `data-ir-scroll`，不要用 `overflow:hidden` 掩盖） |
| `GATE_IMPL_HARDCODED` / `GATE_IMPL_IR_FALLBACK` | FIDELITY（去掉字面量/自造数字，改从 IR/token 读；确需保留记 `artifacts/ir/impl-baseline.json` 附理由）。IR 真缺节点先回 IR |
| `GATE_IMPL_MASK_ON_CONTROL` / `GATE_IMPL_MASK_ON_CHROME` / `GATE_IMPL_MASK_ON_CELL` | FIDELITY（收敛 `data-ir-live` 区域：不得盖控件/伸进壳层/盖住 IR 单元格框。遮罩只圈**值**（行、日期数字、chip），不圈**盒**） |
| `GATE_IMPL_CARD_SSOT` | **measurement**（弹窗白卡尺寸三处数源不一致：IR `modal-card` / `assets-manifest.cardSize` / DOM）。先对齐数源再谈还原——改 IR，或按 `asset-export --normalize` 重导参考图并在 manifest 申报 `cardSize`。数源不一致时像素腿的比较基准本身就是错的，修页面只会白费轮次 | IR / INGEST |
| `GATE_IMPL_MASK_OUTSIDE_CARD` | FIDELITY（收敛 `data-ir-live` 区域到承载它的卡片内：弹窗为 `modal-card` 框，列表/详情为 `panel` 框。**禁止**用放大遮罩来「盖住」溢出——那是拿遮罩掩盖布局事故，先修 `GATE_LAYOUT_OVERFLOW`） |
| `GATE_CAPTURE_UNSTABLE` / `GATE_PIXEL_REF_UNNORMALIZED` | **measurement**（`gate-instrumentation-fix`）：重采集 / 归一化参考图后重 GATE；**不消耗 FIDELITY 轮次** |
| `GATE_DATA_LOOP` / `GATE_DATA_LIVE` / `CODEGEN_*` | CODEGEN |
| `RUNTIME_*` / `GATE_CAPTURE_MISSING` | 重跑 runtime/capture + GATE（`RUNTIME_NOT_UP` = 探活失败，message 指明 web/api 哪一侧；`RUNTIME_PORT_BUSY` = 端口占用） |
| `AUTH_SEED_MISSING` / `SPEC_*` | SPEC |
| IR 角色误标导致的系统性 geom 错配 | IR（layout-ir-extract 重抽 role）后 FIDELITY |

## 记账（轮次纪律）

- 每条 `items[]` 带 `kind`：`fidelity`（页面确实没还原，消耗轮次）或 `measurement`（闸门测量失稳，记 `gate-instrumentation-fix`，**不加 `round`**）。
- 判断口径：偏差是否由被测页面引起？否 → measurement。例：采集时动画未停、参考图带效果外溢、腿缺探针、阈值未从 env 读。
- 「没有腿能看见」的新偏差：先补腿再修，补腿记 measurement。

## 完成判据

- 本轮至少处理报告中的 FAIL 列表并落盘 repair-log；结束后先探活再问是否继续。

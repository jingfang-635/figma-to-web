---
name: screen-layout-from-ir
description: >-
  按 Layout IR 将空壳页写实；运行态流式壳层占满视口（方案 C）。
  主区相对坐标 + 块级随宽 + 内距守恒；图标槽与单元格槽按 IR 逐槽渲染。
  GATE 固定视口采集并在加宽视口复测。无 IR 禁止 done。
---

# screen-layout-from-ir

## 输入

- `artifacts/ir/layout/<screenId>.json`
- `artifacts/ir/visual-ir.json`（chrome / tokens）
- `artifacts/ir/icon-symbols.json`（IR 树无法给出的符号名）
- `imports/figma/screens/<screenId>.png`（目视/像素自检对照）
- codegen 空壳页路径（`spec.output.webDir`）

## 输出

- 写实后的页面实现（几何 + 树装饰 + 文案 + chrome + 图表类型 + 流式壳）
- `artifacts/ir/fidelity-progress.json` 条目（仅自检通过后 `done: true`）

## 写实范围（强制）

1. **坐标系**：全帧 IR bounds 仍为设计源；**运行态主区内**使用相对坐标（减去 chrome 侧栏宽、顶栏高）。见 `viewport-fit`。
2. **不只 controls**：须覆盖可见结构——容器 fills/圆角、侧栏图标位、角标、列表行内图标槽、表头/主按钮样式。
3. **图标槽逐槽渲染**：`icons[]` 里每一槽都要有对应 DOM 槽，盒取 `bounds`、色取 `color`、字形取 `symbol.name`；槽元素带 `data-ir-icon`。符号名找不到组件映射时**不要**拿近义图标顶替（图标腿只认存在与落位），未解析槽见 `gate-icon`。
3b. **单元格槽逐槽渲染**：`cells[]` 里每个**非 `sample`** 槽都要有对应 DOM 矩形，盒取 `bounds`、底色取 `fill`，元素带 `data-ir-cell=<role>`；`sample: true` 的（格内 chip、滑块）只取尺寸与底色给消费端，**不建标记**（条数随数据变）。日历/网格这类「画出来的 chrome」只有这条能进评分——没有槽就没有腿能看见（见 `gate-cells`）。跟随游标的槽（今日徽标）位置随数据走，盒取 IR 只作尺寸模板。
4. **图表**：按原型类型（折线/柱图等）；未实现 → `FIDELITY_CHART_UNSUPPORTED`，该屏禁止 `done`（除非批准 skip）。
5. **活数据**：数值来自 API；seed 造数见 `codegen-db`。
6. **Chrome**：流式侧栏/顶栏占满高度/主列宽；`visual-ir.chrome` 全文案可见。

## 视口适配（方案 C · fluid-shell）

四条不变式与写屏纪律的**完整正文**在 `docs/reference/fluid-shell.md`；本 Skill 只做流程约束。

- 整页 **不用** contain/cover scale（`gate-layout` 报 `GATE_LAYOUT_SCALED`）。
- 壳层流式占满窗口；主区内标题/KPI 等按 IR 相对偏移落位；**列表/面板/表格宽度跟随主区**。
- 块级容器打 `data-ir-fluid="<group>"`（同排同组），并在 IR 宽视口与加宽视口都满足四条不变式：
  **IR 视口回归**、**内距守恒**、**内容随容器增长**、**容器装得下内容**。
- **流体容器必须自己承载内容**：面板里的字段区要放在该 `data-ir-fluid` 容器**内部**（栅格/`flex`
  子级）参与它的布局流。**禁止**「白卡面板做成流式块、字段用绝对定位挂在画布上」——那样在 IR 宽处
  逐像素正确，宽屏下字段却钉在原处、右侧留白带（`GATE_LAYOUT_INNER_STATIC` 的由来）。
- 表单/详情类字段区：列宽用 `minmax(0, 1fr)` 吃增量，**只把 label 列宽与列间距钉成 IR 实测值**；
  整行字段用 `grid-column: 1 / -1` 让浏览器 stretch，不手算百分比。
- 固定宽控件（按钮等）不要作为某个 `1fr` 流式轨道的**唯一**子级（那会让整组内容不增长而被判失败）。
- GATE：固定 IR 视口采集，并在 `GATE_WIDE_SCALE` 加宽视口复测一次。

## 表格/列表屏契约（列表页强制）

表格类屏（`crud-list` 模板）的行高、表头高、分页大小与翻页器位置都是 IR 的设计事实，**不能**交给组件库默认值：

- **行高 / 表头高**：由 IR 文本盒推导——同一操作列里相邻行标签的间距就是**行距**；表头标签到首行标签的偏移是「半个表头 + 半个行」之和，故 **表头高 = 2 × 偏移 − 行距**。实现见 `tableMetrics` 的 `tableRowMetrics`。组件库默认行高通常**高于**原型，这正是「一页的行把卡片撑破」的成因。把推导值以**自定义属性**交给样式表，样式表里不写像素字面量。
- **分页大小**：等于原型一页**画出的行数**（同一操作列的行标签个数）。分页大小大于原型画出的行数，多出来的行必然把卡片撑开。
- **卡片高度**：**不写死**。用 `min-height` 取 `panel.bounds.height` + `height: auto`，并把表格作为卡片的**子级**参与它的布局流。这样：一页行数与原型一致时卡片保持 IR 高度（逐像素回归）；多一行时卡片**长高**而不是溢出（`GATE_LAYOUT_OVERFLOW`）。
- **翻页器位置**：由 IR 的 `pagination-item` 槽推出——方框底边钉在卡片底边上方 `panel.bottom − (item.y + item.height)`，所以卡片要能与内容一起变高，翻页器**贴卡片底边**而不是紧跟最后一行。
- **翻页器样式**：方框尺寸/圆角取槽的 `bounds`/`cornerRadius`，选中态填充与描边取槽的 `fills`/`strokes`（经 token）；组件库默认的描边式翻页器与原型的实心选中态不一致。
- **活数据遮罩**：只圈「值」（表格 body、翻页器里的总条数文本），**不圈翻页方框**——方框的尺寸/颜色/位置都要被像素腿评分。见 `gate-pixel`。

## 取值来源（禁止照抄 IR 字面量）

写实是**消费** IR，不是**誊写** IR。把 IR 里的数字/颜色原样敲进页面会让 IR 失去意义：改 IR 不再改页面，偏差也无腿可见。

- **几何**：盒来自 IR 的读取入口（`bounds` / `controlsByRole` / `controlByRole` / `textNodeAt` / 表格 metrics 等），不在 JSX/CSS 里手敲像素；IR 缺席时不要 `?? 320` 兜底，先补 IR 节点。
- **颜色**：走 `visual-ir.tokens` 经 `token-binding` 生成的样式；禁止页面里写 `#rrggbb` 字面量（`GATE_IMPL_HARDCODED`）。
- **IR 派生值**：`bounds`/`cornerRadius`/`metrics` 这类从 IR 取值时，不得用 `?? <number>` 回落到自造数字（`GATE_IMPL_IR_FALLBACK`）。
- **推不出就是上游缺口**：token 推不出的键、IR 缺的节点，属设计数据缺口 → 回 `visual-ir-extract` / `layout-ir-extract` 补，**不写进 Skill/Screen**。
- 确需保留的历史字面量记入 `artifacts/ir/impl-baseline.json` 并附理由；impl 腿对 baseline 之外的新字面量报 FAIL。

## 标记 done 前自检

1. 有对应 Layout IR 与参考图。
2. 壳层贴窗口、无整页灰边留白；**把窗口拉宽一截**后：块级容器确实变宽、左右内距不变（不是「只看 1440 下像」）。
2a. **拉宽后容器里的内容也要变宽**：面板里的字段/表格/卡片一起变宽，最后一列字段的右边缘仍贴面板内容右边缘；不是「只有白卡面板变宽、字段停在原处、右侧空一条」。字段区必须真的位于某个 `data-ir-fluid` 容器内部。
2b. **容器装得下内容**：`data-ir-fluid` 容器不得出现内容溢出（`scrollH > clientH` / `scrollW > clientW`）。写死容器高度、行高或分页大小都会让「一页的行」撑破卡片；卡片高度要用 `height:auto` + `min-height` 取 IR，由内容撑高（见 `viewport-fit` 不变式 4）。确实要内部滚动就显式加 `data-ir-scroll`。
2c. **翻页器贴卡片底边**：列表页的翻页器底边落在卡片底边上方 `panel.bottom − (item.y + item.height)` 处（IR `pagination-item` 槽推导），不是紧跟最后一行；行高/表头高/分页大小取自 IR（见「表格/列表屏契约」）。
3. 对照参考图：品牌/图标/主按钮/表头/图表类型无「一眼假」；图标槽数量与参考图一致（多一个少一个都不行）。
4. 标签/导航文案在 DOM；不要求样例 KPI 数字（活数据策略见 `gate-text`）。
5. 禁止仅因 `geomRoleCount===0` 标 done。
6. 取值来源合规：无照抄 IR 的颜色/几何字面量（`node scripts/gate-legs.mjs --impl-hits` 自查，baseline 之外应为空）。
7. 画出来的 chrome 有槽可查：该屏 `cells[]` 的非 sample 槽逐个有 `data-ir-cell`（`node scripts/ir-cells.mjs` 自检 `ok:true`，且不属于已知「未分类矩形」缺口）。

## 完成判据

- 纳入业务屏均 `done=true` 且满足自检；无 IR 禁止 done。
- `legs.icons` / `legs.cells` / `legs.layout` / `legs.impl` 均无该屏失败项。

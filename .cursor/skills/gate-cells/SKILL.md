---
name: gate-cells
description: >-
  单元格腿：Layout IR cells[] 槽（bounds/fill/sample）vs DOM 数据标记矩形。
  码 GATE_CELL_*；漏槽/角色错位/盒漂移/底色漂移各有一码，含整列刷白的抓法。
---

# gate-cells

## 为什么需要这条腿

画出来的矩形不属于任何已有的测量维度：

- **像素腿看不到**：日历网格被 `data-ir-live` 整块遮罩，遮罩区在像素腿一分不打。
- **几何腿看不到**：它不是控件，按角色表不参与 `controls[]` 配对。
- **文本腿看不到**：它没有字符串（文案都在格内的活数据里）。
- **图标腿看不到**：它没有字形。

于是「整片网格刷成纯白、行高随意」这种退化会在七门全绿下长期存活。单元格腿把矩形变成可测量的：**IR 逐槽声明，DOM 逐槽认领**。

## 输入

- Layout IR `cells[]`（`role` / `bounds` / `fill` / `sample`）
- capture 中 DOM 侧 `[data-ir-cell]` 的 role、框与底色
- env：`GATE_CELL_TOL_PX`

## 输出

- `legs.cells`

## DOM 契约

- 渲染一个单元格槽的元素带 `data-ir-cell=<role>`；该元素的盒即槽的盒。
- 契约覆盖的是**静态 chrome**（外框、表头、数据格、图例色块、今日徽标、分段开关轨）。
- 活数据样本（格内 chip、滑块）用 `sample: true` 出槽，只提供尺寸与底色给消费端，**不要求 DOM 侧建对应标记**（条数随数据变）。
- 底色不写死：取 IR `fill` 注入样式；把 IR 的颜色抄成 CSS 字面量会被 impl 腿抓（`GATE_IMPL_HARDCODED`）。

## 配对与判据

- **弹窗屏坐标归一化**：两侧归一到卡坐标系（DOM 视口坐标减采集时 `dom.modal.x/y`）；
  锚点是申报约定，禁止硬编码视口原点假设。正文见 skill `modal-fidelity`。
- 按 role 分组、组内按阅读序（先 y 后 x）配对 IR 槽与 DOM 槽。
- 数量不等 → `GATE_CELL_MISSING`（证据里带两侧 role 列表）。
- 组内第 i 槽 role 对不上 → `GATE_CELL_ROLE`（阅读序已发散，后续槽全部无法配对）。
- 盒判据分两类：
  - 静态角色 → Δx/Δy/Δw/Δh ≤ `GATE_CELL_TOL_PX`，超差 `GATE_CELL_BOX`。
  - 跟随游标的角色（`badge` 跟今日）→ **只比 Δw/Δh**，位置自由。
- 底色判据：静态角色逐个比 `fill`；数据格不看单格，改看**整列**——IR 对某列一致着色的（周末列）要求该列保持该底色，抓「整片刷白」。超差 `GATE_CELL_FILL`。
- 本腿**不**按 `data-ir-live` 过滤槽（IR 声明的 chrome 就是 chrome，遮罩只能放活数据）——正因如此，用遮罩盖住网格在这里无效；反方向由 impl 腿的 `GATE_IMPL_MASK_ON_CELL` 守。

## 失败怎么办

| 码 | 含义 | 修法 |
| --- | --- | --- |
| `GATE_CELL_MISSING` | IR 有槽、DOM 没有（或数量不等） | 回写屏按槽补渲染（逐槽 `data-ir-cell`）；槽本就不该在 IR 里的先回 `layout-ir-extract` |
| `GATE_CELL_ROLE` | 第 i 槽角色对不上 | DOM 的渲染序与 IR 阅读序不符：改 DOM 对齐 IR，**不要**改 IR 迎合 DOM |
| `GATE_CELL_BOX` | 盒漂移（位置或尺寸） | 按 IR `bounds` 定位取尺寸；行高/表头高/图例块/开关轨禁止用组件库默认值或自编 px |
| `GATE_CELL_FILL` | 底色漂移（含某列被刷白） | 底色取 IR `fill`；四态底色由 IR 派生，不在 CSS 编色值，也不用遮罩盖住 |

## 不负责

- 格内的活数据（日期数字、条数、chip 文案）→ 文本腿与数据腿
- 整个日历年月的可动性（月份随 dayjs，几何按 IR 守恒）
- 弹窗白卡盒（属 geom 腿的 `modal-card`）

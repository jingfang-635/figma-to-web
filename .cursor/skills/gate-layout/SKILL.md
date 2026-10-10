---
name: gate-layout
description: >-
  流式腿：加宽视口复测 data-ir-fluid 容器是否跟随主区（左右内距守恒、确有增长），
  以及容器内子级内容是否随容器增长（内容腿 GATE_LAYOUT_INNER_STATIC），
  并禁止整页 scale 与横向溢出。码 GATE_LAYOUT_*。
---

# gate-layout

## 为什么需要这条腿

采集视口固定等于 IR 尺寸。在 IR 尺寸下：

- 写死 IR 像素宽的卡片，
- 按主区宽度流式的卡片，

**渲染结果逐像素相同**。

于是「宽屏下卡片只占左边一截、右侧大片留白」这一整类退化对四门全部隐形。本腿换一个更宽的视口复测同一条不变式：容器与主区的**内距**必须守恒，宽度必须随之增长。

## 三层判据（容器层 + 内容层 + 容纳层）

三条不变式的定义、两条「为什么不能用阈值替代」的论证与事故复盘在
`docs/reference/fluid-shell.md`；本 Skill 只讲**怎么测**。

**层 1（容器层）**：容器盒相对主区的左右内距守恒 + 确实增长。判据只用容器自身几何。

**层 2（内容层）**：容器变宽时，**容器内部的子级内容盒必须跟着变宽**（`GATE_LAYOUT_INNER_STATIC`）。
层 1 只看容器盒，而面板盒在采集视口与加宽视口都合法——层 1 永远看不见「面板长、字段不长」。
不能用「逐个控件内距守恒」代替：右锚定固定宽按钮与钉死字段几何同形，无阈值可分。

**层 3（容纳层）**：容器必须**装得下自己内部的内容**——`scrollHeight/scrollWidth` 不得超出
`clientHeight/clientWidth`（超差即 `GATE_LAYOUT_OVERFLOW`）。活数据遮罩让越界像素不计分，
纵向容纳只有容器自己的滚动量能当见证。

## 内部滚动必须显式申报

容器确实想要一个内部滚动视口（固定高度的滚动区、虚拟列表）时，加 `data-ir-scroll` 显式申报，
层 3 会跳过它。**默认不申报即视为内容越出容器**：一个「意外」长出来的滚动条，和一个「有意」的
滚动区，在这里必须由写屏者自己区分——否则层 3 无法把事故与设计分开。

不申报的实现通常是把容器高度或行高写死成 IR 数值又没让容器随内容长高，或者反过来把 `overflow`
设成 `hidden` 把溢出裁掉（视觉上「没超框」，但内容已被切掉，层 3 同样报）。

## 输入

- capture 中每屏的 `layout`（采集视口）与 `wide`（加宽视口）探针：`data-ir-fluid` 容器框、**容器子级内容盒**、主区框、shell `transform`、`scrollWidth`，以及层 3 需要的 `scrollH/clientH/scrollW/clientW/overflowY` 与 `scrollDeclared`
- env：`GATE_LAYOUT_TOL_PX`、`GATE_LAYOUT_GROW_MIN_PX`、`GATE_LAYOUT_INNER_TOL_PX`、`GATE_LAYOUT_INNER_GROW_RATIO`、`GATE_WIDE_SCALE`

## 输出

- `legs.layout`

## DOM 契约

- 需要跟随主区伸缩的容器带 `data-ir-fluid="<group>"`；同组即同一条栅格/行（例如同一排卡片、同一整行）。
- 标记只加在**真正随主区伸缩**的容器上；固定宽度的小控件不要标，否则本腿会把「它没长」判成失败。
- **容器要自己承载内容**：面板里的字段/单元格要放在该 `data-ir-fluid` 容器**内部**参与其布局流。把字段绝对定位挂在画布上、只让白卡面板做流式块，会让层 2 失去判据对象（容器没有子级内容可量），且层 3 也无法发现溢出（空面板永远「装得下」）。事故形态就此隐形。
- 容器的高度要能**容纳并跟随内容**：`min-height` 取 IR 值时，容器必须仍是**由内容撑高**的（`height:auto` + 内容参与布局流），而不是把 IR 高度当上限写死。写死高度的容器一旦内容多一行就必然溢出。
- 真正需要内部滚动的容器带 `data-ir-scroll` 显式申报，层 3 跳过；不申报的容器必须 `scrollH ≤ clientH` 且 `scrollW ≤ clientW`。
- 组内至少一个容器在加宽后必须增长超过 `GATE_LAYOUT_GROW_MIN_PX`。
- 禁止用整页 `transform: scale()` 冒充适配：本腿读 shell `transform`，非 `none` 即 `GATE_LAYOUT_SCALED`。

## 判据

- 非弹窗屏：没有 `data-ir-fluid` → `GATE_LAYOUT_NO_FLUID`（该屏没有按主区布局）。
- 采集视口侧：用组内**最小左右内距**作为该组应守恒的内距（相对主区）。
- 加宽视口侧：组的包围盒左/右必须落在「主区边 ± 内距」容差内，否则 `GATE_LAYOUT_STATIC`。
- 加宽后 `scrollWidth` 超出视口 → `GATE_LAYOUT_STATIC`（横向溢出）。
- 组内容器数在加宽后变化 → `GATE_LAYOUT_STATIC`（媒体查询/换行把容器弄丢了）。
- **层 2**：容器实例（`<group>#<出现序>`）在加宽后，其**子级内容盒宽度**的增长必须 ≥ `GATE_LAYOUT_INNER_GROW_RATIO` × 该容器自身宽度增长（另有 `GATE_LAYOUT_INNER_TOL_PX` 绝对松弛），否则 `GATE_LAYOUT_INNER_STATIC`。无子级内容的容器（纯底色面板）**跳过而非默认通过**。
- **层 3**：每个未申报 `data-ir-scroll` 的 `data-ir-fluid` 容器，在两个视口都要 `scrollW - clientW ≤ GATE_LAYOUT_TOL_PX` 且 `scrollH - clientH ≤ GATE_LAYOUT_TOL_PX`，否则 `GATE_LAYOUT_OVERFLOW`（证据带容器盒与 `overflowY`）。

## 失败怎么办

| 码 | 含义 | 修法 |
| --- | --- | --- |
| `GATE_LAYOUT_NO_FLUID` | 该屏未标记流式容器（或压根按固定宽布局） | 回写屏：把块级容器改成随主区伸缩并打上 `data-ir-fluid`，见 `viewport-fit` / `screen-layout-from-ir` |
| `GATE_LAYOUT_SCALED` | 整页被 `transform: scale()` 缩放 | 删除缩放适配，改流式壳层 |
| `GATE_LAYOUT_STATIC` | 加宽后没有跟随主区 | 定位该组：宽度写死/内距变了/横向溢出，回写屏修 |
| `GATE_LAYOUT_INNER_STATIC` | 容器跟随了，但**容器里的内容没跟随**（字段钉在 IR 像素宽，右侧留白带） | 回写屏：把字段区改成**该容器内的**流式布局——列宽用 `minmax(0,1fr)` 吃增量，只把 label 列/列间距钉成 IR 实测值；见 `viewport-fit` 不变式 3 与 `screen-layout-from-ir` |
| `GATE_LAYOUT_OVERFLOW` | 容器装不下自己的内容（`scrollH/scrollW` 超 `clientH/clientW`）：多出的行、翻页器越过卡片边 | 回写屏：先看是不是**容器高度被写死**——把 `height` 改成 `height:auto` + `min-height` 取 IR（内容少时保持原型高度，内容多时长高而不是溢出）；再查行高/分页大小是否与 IR 一致（见 `screen-layout-from-ir` 表格契约）；确实要内部滚动则显式加 `data-ir-scroll` 并说明 |

## 不负责

- 采集视口下的像素/文本/几何还原（分别属像素腿、文本腿、几何腿）
- 弹窗内部伸缩（弹窗白卡与内部控件走几何腿）

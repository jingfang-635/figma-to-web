---
name: gate-icon
description: >-
  图标腿：Layout IR icons[] 槽（bounds/color/symbol）vs DOM 数据标记槽。
  码 GATE_ICON_*；空槽/漏槽/盒漂移/色偏/未解析符号各有一码。
---

# gate-icon

## 为什么需要这条腿

图标槽不属于任何已有的测量维度：

- **像素腿看不到**：一个标题少了字形，卡片仍与参考图高度相似，整页差异远低于阈值。
- **几何腿看不到**：图标不是控件，按角色表不参与 `controls[]` 配对。
- **文本腿看不到**：图标没有 `characters`。

于是「IR 里只记了 nodeId、写屏时按坐标猜名字」这种退化会在四门全绿下长期存活。图标腿把槽变成可测量的：**IR 逐槽声明，DOM 逐槽认领**。

## 输入

- Layout IR `icons[]`（`bounds` / `color` / `symbol.source|name|role`）
- capture 中 DOM 侧 `[data-ir-icon]` 的框、符号名与计算色
- env：`GATE_ICON_TOL_PX`

## 输出

- `legs.icons`

## DOM 契约

- 渲染一个图标槽的元素带 `data-ir-icon=<symbol name>`；该元素的盒即槽的盒。
- 槽另有 `nodeId` 时可选带 `data-ir-icon-node`，用于证据定位。
- 拿不到组件映射的符号名**不要**退回一个近义图标冒充；宁可不出槽，让本腿报 `GATE_ICON_MISSING`。
- 未解析槽不要渲染假图标：`symbol.source=unresolved` 由本腿直接判 `GATE_ICON_UNRESOLVED`。
- 颜色不写死：取 IR `color` 作为元素色（含交互态），否则参考图与本腿会同时对不上。

## 配对与判据

- **弹窗屏坐标归一化**：IR 槽与 DOM 槽两侧都归一到卡坐标系（DOM 视口坐标减采集时
  `dom.modal.x/y`）；锚点是申报约定，禁止硬编码视口原点假设。正文见 skill `modal-fidelity`。
- 按阅读序（先 y 后 x）配对 IR 槽与 DOM 槽。
- **弹窗屏先归一化**：DOM 视口坐标减去 `dom.modal.x/y` 进卡坐标系再配对（锚点是申报约定，
  禁止硬编码弹窗在原点的假设；约定正文见 skill `modal-fidelity` 的「弹窗坐标系」）。
- 数量不等 → `GATE_ICON_MISSING`（证据里带 IR 与 DOM 的符号名列表）。
- 逐个比 Δx/Δy/Δw/Δh ≤ `GATE_ICON_TOL_PX` → 超差 `GATE_ICON_BOX`。
- IR 有 `color` 且 DOM 有计算色 → 比色，超差 `GATE_ICON_COLOR`；IR 无 `color`（描边字形常见）则跳过比色，不算通过也不算失败。

## 失败怎么办

| 码 | 含义 | 修法 |
| --- | --- | --- |
| `GATE_ICON_UNRESOLVED` | 槽在 IR 里没有符号名 | 回 `layout-ir-extract`：命中 `figma-name` 或按参考截图 `glyph-match`；补到 `artifacts/ir/icon-symbols.json` |
| `GATE_ICON_MISSING` | IR 有槽、DOM 没有（或数量不等） | 该屏写屏缺少该槽 → 回写屏按槽补渲染；弹窗槽同理 |
| `GATE_ICON_BOX` | 槽盒漂移 | 该槽未按 IR `bounds` 定位，回写屏修 |
| `GATE_ICON_COLOR` | 槽色偏 | 槽色应取 IR `color`；常见于继承父级/交互态颜色、或自己编了色值 |

## 不负责

- 图标槽之外的花纹/插画（属资产与像素腿）
- 符号名 → 组件库的具体映射选择（属写屏阶段，本腿只验存在与几何）

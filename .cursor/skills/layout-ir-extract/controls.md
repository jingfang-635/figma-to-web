# controls.role 分类（强制）

闸门 geom 腿对下列 **geom 角色** 做盒配对（与 `isGeomControlRole` 一致）：

| 角色族 | 允许 role 前缀/值 | 用于 |
| --- | --- | --- |
| 表单控件 | `input`, `textarea`, `select`, `checkbox`, `radio`, `date`, `number` | 真实可编辑/可选择控件 |
| 按钮 | `button`, `button-primary`, `button-default`, `button-*` | 真实按钮 |

下列为 **容器/装饰角色**，**禁止**标成上表 geom 角色（否则会与 DOM 表单控件错配，导致 `GATE_GEOM_CONTROL`）：

- `panel`, `card`, `kpi`, `metric`, `chart`, `header-bar`, `sidebar`, `modal-card`, `upload-box`, `avatar`, `icon`, `divider`, `table`, `row`, `cell`, `pagination-item`

规则：

- 仅当节点在原型中确为表单输入/选择/按钮时才用 geom 角色。
- KPI/统计卡、图表区、纯展示块 → `kpi` / `card` / `panel` / `chart`，即使视觉上像大矩形。
- 弹窗白卡 → `modal-card`。
- 推不出角色时宁可标容器角色或省略该 control，**禁止**默认 `textarea`。

## 翻页区契约（列表页强制）

列表页右下角的翻页器是**画出来的**设计事实，不能留给写屏时按组件库默认发明：默认翻页方框是描边式、尺寸与原型不同，一发明就与原型的实心选中态、方框尺寸对不上。

- 每一个翻页方框（含上一页/下一页箭头位）各进 `controls[]` 一槽，role 用 `pagination-item`（容器/装饰族，**不是** geom 角色）。
- 该槽必须带 `bounds` 以及 `fills`/`strokes`/`cornerRadius`：写屏据此定方框尺寸、圆角与选中态填充色。
- 方框的**底边**是卡片的对齐基准：写屏把方框底边钉在卡片底边上方 `panel.bottom - (item.y + item.height)` 处，卡片因此不能是「按 IR 高度写死的盒子」而必须能容纳内容（见 `docs/reference/fluid-shell.md`）。
- 翻页器左侧的总条数标签留在 `texts[]`：它的文案是**活数据格式**，写屏按它生成显示值，不把样例条数当布局。
- 原型在一页里画了几行，就是该屏的**分页大小**：写屏的分页大小必须等于原型画出的行数，否则多出的行会把卡片撑开。

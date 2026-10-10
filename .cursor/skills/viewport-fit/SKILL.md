---
name: viewport-fit
description: >-
  运行态用流式壳层占满视口（方案 C）：侧栏固定宽、主区 flex 吃剩余空间，
  块级容器宽度跟随主区且内距守恒。禁止整页 IR scale。GATE 固定 IR 视口采集，
  并在加宽视口复测（gate-layout）。
---

# viewport-fit

> 四条不变式的**完整正文**（定义、为什么每条不能省、事故复盘、流体换算公式）在
> `docs/reference/fluid-shell.md`。本 Skill 只保留写屏侧要执行的部分。

## 决策（已确认）

- 模式：**fluid-shell（方案 C）**
- 参考形态：侧栏 + 顶栏 + 主内容区随窗口拉满（非整页 `transform: scale`）
- GATE：capture 仍用 IR 宽高视口；**不**再依赖 scale 开关（无整页缩放）
- 参考：`docs/reference/fluid-shell.md`

## 不变式（可测量，不是「看起来满」）

写流式前先写下这四条，写完逐条自证：

1. **IR 视口回归**：视口宽 = IR 根 `bounds.width` 时，每个容器盒**逐像素等于** IR 盒。
2. **内距守恒**：视口变宽时，块级容器相对主区左右边界的**内距不变**，宽度随之增长。
3. **内容随容器增长**：容器变宽时，**容器内部的字段/控件簇必须一起变宽**。
4. **容器装得下内容**：`height:auto` + `min-height` 取 IR，容器不得 `scrollH > clientH`
   （`GATE_LAYOUT_OVERFLOW`）；确需内部滚动视口时加 `data-ir-scroll` 申报，本层跳过。

第 3、4 条各自的事故与「为什么阈值替代不了」见 `docs/reference/fluid-shell.md`——它们是本项目
两次实测事故的结论，不是风格偏好。

### 写屏纪律

- **流体容器必须自己承载它的内容**：面板里的字段要放在 `data-ir-fluid` 容器**内部**（栅格/`flex`
  子级），不要用绝对定位把它们挂在画布上、只把面板本身做成流式块。
- 字段区用栅格表达，**列宽用 `minmax(0, 1fr)` 吃增量**，只把 label 列与列间距钉成 IR 实测值。
- 需要保持固定宽的控件**不要**作为某个 `1fr` 流式轨道的唯一子级（那会让整组内容不增长）。
- 卡片/面板 `height:auto` + `min-height` 取 IR，且自己承载内容；写死高度就必然在第 4 条上出事。
- 列表行高、表头高、分页大小取自 IR，不要用组件库默认值；见 `screen-layout-from-ir` 的
  「表格/列表屏契约」。

## 流体换算（2 列栅格示例）

- 校验 `2*colW + 2*g + gap = M_ir`；不等说明内距/间距读错，先修读数。
- 列宽 → `calc((100% - (2*g + gap)px) / 2)`；容器内的横向偏移/宽度用**父容器百分比**表示，
  纵向保持 px。完整推导见 `docs/reference/fluid-shell.md`。

## 规则

1. 外层壳：`width:100%` / `min-height:100vh`（或等价），占满浏览器窗口。
2. 侧栏宽 = `visual-ir.chrome.sidebar` 宽（固定 px）；高度拉满视口。
3. 右侧列：`flex:1`；顶栏高度 = chrome header；主区 `flex:1` + `overflow:auto`。
4. **禁止**整页 contain/cover `scale` 作为占满手段（本腿报 `GATE_LAYOUT_SCALED`）；禁止为全屏把 IR 逻辑画布写死成唯一视口尺寸导致留白。
5. 主区内控件：坐标相对主区原点（IR 全帧坐标需减去侧栏宽 / 顶栏高）；表格/面板等块级容器在主区内 **宽度跟随主区**，并打上 `data-ir-fluid="<group>"`（同排容器同组）。
6. 只有**真正随主区伸缩**的容器才打标记；固定宽控件不打，否则 `gate-layout` 会判它「没长」。
6a. 容器高度由内容撑高：`height:auto` + `min-height` 取 IR；**不要**把 IR 高度当上限写死。确实要内部滚动视口则加 `data-ir-scroll` 显式申报，否则 `GATE_LAYOUT_OVERFLOW`。
7. 行内横向铺满时优先 `left: <内距>; right: <内距>` 或等价的 calc 写法，避免把 IR 像素宽写成常量。
8. GATE/`gate-capture`：viewport = Layout IR 根 bounds；capture 会在加宽视口（`GATE_WIDE_SCALE`）复测一次。

## 完成判据

- 本地预览：无左右大块灰边；壳层贴窗口；拉大窗口时主区变宽，容器宽度随之增长且左右内距不变。
- **本地预览（内容腿）**：把窗口拉宽后，**面板里的字段/表格/卡片一起变宽**——不是只有白色面板变宽、字段停在原处、右侧空一条。表单屏尤其要看：最后一列字段的右边缘是否仍贴着面板内容右边缘。
- **本地预览（容纳层）**：列表页多一行/多一条数据时，卡片**长高**而不是把表格或翻页器挤出卡片；翻页器贴卡片底边。
- capture：无整页 scale；DOM 坐标与「主区相对 / 约定视口」策略一致且写入 Skill/脚本约定。
- `legs.layout=PASS`：加宽视口下 `data-ir-fluid` 各组左右内距守恒、确有增长、**且组内内容随容器增长**（`GATE_LAYOUT_INNER_STATIC`）、**且容器装得下内容**（`GATE_LAYOUT_OVERFLOW`），无横向溢出。

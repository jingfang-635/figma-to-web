---
name: gate-text
description: >-
  文本腿：Layout IR texts vs DOM。活数据模式下跳过样例数值/刻度，只验标签与导航。
  阈值 GATE_TEXT_SIZE_TOL_PX；码 GATE_TEXT_*。
---

# gate-text

## 输入

- Layout IR `texts`
- `visual-ir.chrome`
- capture DOM 文本盒
- env：`GATE_TEXT_SIZE_TOL_PX`、`GATE_TEXT_TOL_PX`

## 输出

- `legs.text`

## 活数据策略（默认，用户已选）

- 页面展示值为 **API 活数据**；CODEGEN/`codegen-db` 在生成时自动 seed 造数。
- Text 腿对 IR 中下列 **样例动态值** 不做 `GATE_TEXT_CONTENT` / 不为缺失失败（实现见 `scripts/gate-legs.mjs`）：
  - 纯数字、千分位、百分比、货币（如含 `¥`/`%`）
  - 短日期刻度（如 `M/D`、`YYYY-MM-DD`）
  - 明显为图表轴/点标注的短数值串
- **仍必须匹配**：导航/品牌/标题/表头/表单 label/按钮文案/行内标签等非动态文案。
- Chrome：默认渲染 `visual-ir.chrome` 全部 item 文案（策略 A）；策略 B 需书面批准并记入 `pipeline-state`。

## 弹窗屏坐标归一化

- DOM 文本盒是视口坐标，modal IR 是卡相对坐标：text 腿把 DOM 侧减去采集时的 `dom.modal.x/y`
  （白卡实际位置）归一到卡坐标系再配对。
- 锚点是申报约定（`visual-ir.modals[].anchor`），不是 IR 事实；禁止硬编码「弹窗在视口原点」的
  假设。坐标约定正文见 skill `modal-fidelity` 的「弹窗坐标系」。

## 不负责

- 控件几何（geom）、整页像素（pixel）、API 闭环（data）

## 完成判据

- 写出 leg 结果；码 `GATE_TEXT_CONTENT` / `GATE_TEXT_STYLE`。

---
name: gate-geom
description: >-
  几何腿：Layout IR controls/bounds 与弹窗白卡 vs DOM 框。
  阈值 GATE_GEOM_TOL_PX；码 GATE_GEOM_*。仅配对 geom 角色。
---

# gate-geom

## 输入

- Layout IR `controls` / bounds
- capture 中的 DOM 框
- env：`GATE_GEOM_TOL_PX`

## 输出

- `legs.geom`

## Capture 契约

- 运行态为方案 C 流式壳：主区坐标相对 chrome 偏移；采集 viewport = IR 尺寸。
- 比对时注意：全帧 IR `x` 含侧栏，DOM 在主区内时需按约定原点（全帧或主区）一致；不一致先修采集/原点，再判 FIDELITY。
- **弹窗屏的坐标归一化**：DOM 视口坐标减去采集时 `dom.modal.x/y` 归一到卡坐标系再与 IR 配对；
  锚点是申报约定（`visual-ir.modals[].anchor`），禁止硬编码弹窗在视口原点的假设。
  约定正文见 skill `modal-fidelity` 的「弹窗坐标系」。

## 配对范围

- 只对 **geom 角色**配对（`input|textarea|select|checkbox|radio|date|number|button*`），与 `layout-ir-extract` 角色表及运行时 `isGeomControlRole` 一致。
- 容器角色（`kpi|card|panel|modal-card|header-bar|…`）不参与控件配对；弹窗白卡尺寸走 `GATE_GEOM_MODAL`。
- 若 IR 误把展示卡标成 `textarea` 等，本腿会 FAIL → 回 IR 修正 role，而非强行把 DOM 改成 textarea。

## 不负责

- 像素纹理、文案内容
- 参考截图导出

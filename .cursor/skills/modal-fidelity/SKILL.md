---
name: modal-fidelity
description: >-
  按 visual-ir.modals 与对应 Layout IR 写实弹窗。无 modal IR 不写该弹窗。
  白卡外尺寸与内部控件必须按 IR bounds，禁止默认弹窗尺寸糊弄。
  弹窗坐标系与显示锚点（居中=声明约定，非 Figma 事实）也归本 skill。
---

# modal-fidelity

## 输入

- `visual-ir.modals[]`
- 对应 `artifacts/ir/layout/<screenId>.json`

## 输出

- 弹窗写实实现
- `artifacts/ir/fidelity-progress.json` 中该 modal `screenId` 的 `{ done: true }`（仅自检通过后）

## 弹窗坐标系（唯一正文）

> **事故**：弹窗内容与页面共用一个**可变全局原点**（IrCanvas 写入 chrome 偏移，弹窗打开清零、
> 关闭不恢复）。关闭弹窗那一刻页面按原点 (0,0) 重渲染，整页右移 220px、下移 52px——恰好等于
> 侧栏宽 + 头部高。打开时因「写原点不触发渲染」被掩盖成「打开时正常」。根因不是某个组件忘了
> 恢复，而是一个跨生命周期抢占的模块级可变量——这是类竞态，修单个组件修不掉这一类。
>
> **第二层事故**：为让「视口坐标 == IR 坐标」方便测量，弹窗被 CSS 钉死在视口 0,0，gate 各腿据此
> 假设弹窗在视口原点。这是把「闸门好测」当成了「原型对」——真实还原让位于测量便利，闸门全绿
> 与还原之间出现约定性偏差。

- **两个坐标系，分属两层**：
  - **页面坐标系**：IR 绝对坐标 − chrome 原点（侧栏宽 + 头部高，读 `chrome.json`）。页面控件/
    文本/图标/单元格全部走 `boxStyle` / `textStyle` / `fluidBoxStyle`。
  - **弹窗坐标系（卡相对）**：modal IR 的 frame 原点就是白卡左上角（`modal-card` bounds 恒 `0,0`），
    控件/文本/图标槽经 `modalBoxStyle` / `modalTextStyle`（或 `IrText|IrIconSlot` 的
    `variant="modal"`）直接落卡。**弹窗内容禁止读页面原点**。
- **禁止共享可变原点**：原点必须是常量（构建期从 `chrome.json` 派生），不存在运行时写入路径。
  任何「组件 A 写入、组件 B 清零」的写法都属于这次事故类——打开/关闭时序谁先 commit 是未定义
  行为，且 effect 依赖不变时恢复路径根本不存在。
- **显示锚点是声明约定，不是推导事实**：Figma 里弹窗是画布上的独立顶层 frame（与页面 frame
  并排摆放），**原型数据里不存在「弹窗贴在宿主页哪里」的记录**。`visual-ir.modals[].anchor`
  申报运行态锚点（当前全部 `center`，schema 里枚举约束），runtime 按它渲染。改锚点 = 改产物
  申报，不是改代码习惯。
- **gate 侧约定**：icon/cells/geom/text 各腿把弹窗 DOM 视口坐标减去**采集时的 `dom.modal.x/y`**
  （白卡实际位置，从 capture 读——锚点是渲染约定，不是 IR 事实，禁止硬编码 0,0 假设）归一到卡
  坐标系再与 IR 配对。像素腿对弹窗截 `.ant-modal-content` 元素图，天然卡相对。**位置不进任何腿**
  （像素腿元素级截图 + 各腿卡坐标配对都与位置无关），因此锚点可随时调整而不动判据。

## 几何规则（强制）

- 白卡外尺寸 = IR 中 `modal-card`（或 role 匹配 `/panel|card|box|modal/i` 的控件）的
  `bounds.width` × `bounds.height`；缺则退回根 `bounds`。
- DOM 上对应节点须可被 capture 识别（与闸门约定一致，例如内容白卡容器）；`GATE_GEOM_MODAL`
  比对的是该外尺寸，**禁止**用「width 对、height 用 body 估算」造成 Δh/Δw 超 `GATE_GEOM_TOL_PX`。
- 弹窗内 `controls[]`（geom 角色）与 `texts[]` 使用**相对白卡**的 IR 坐标落位（或等价可测绝对
  坐标，与 IR 一致）。
- 允许 `stack.ui` Modal，但必须剥离/抵消默认 padding、标题栏与 footer 对白卡外尺寸与内部控件盒
  的漂移；footer 按钮位置对齐 IR 中对应 `button*` bounds。
- **禁止**仅设 `width`、把 `body.height` 写成 `cardHeight - 常数` 而不校验最终白卡外尺寸。

## 文案与控件

- 标签、占位、按钮文案来自该 modal 的 Layout IR `texts`，不手编进 Skill。
- placeholder 类文案须出现在可采集 DOM（或等价可访问名），避免 `GATE_TEXT_CONTENT`。
- 无对应 modal Layout IR → 不写该弹窗，并在可追溯产物中记录缺 IR。

## 标记 done 前自检

1. 白卡外尺寸 vs IR modal-card（或根 bounds）在 `GATE_GEOM_TOL_PX` 内。
2. geom 角色控件数一致；抽样盒在容差内。
3. 标题与主要 label/placeholder 文本在 DOM 中可匹配。

失败则禁止 `done: true`。

## 完成判据

- 每个有 IR 的 modal 已按几何写实且自检通过；缺 IR → 不写并可追溯。
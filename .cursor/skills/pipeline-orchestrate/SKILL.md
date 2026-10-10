---
name: pipeline-orchestrate
description: >-
  流水线编排手册：阶段流转（DECISION 为首）、跳步禁令、人工闸门话术、轮次协议。
  仅 Orchestrator 加载；其它阶段 Agent 不要用本 Skill 改 phase。
---

# pipeline-orchestrate

## 输入 / 输出

- 输入：`artifacts/pipeline-state.json`
- 输出：更新后的 state（**仅 Orchestrator** 写 `phase` / `completed` / `round` / `gateLegs` / `legsAddedAfterFidelity`）

## 强制顺序

`DECISION → INGEST → SPEC → IR → CODEGEN → FIDELITY → GATE`；`GATE` FAIL → `REPAIR` →（按 FAIL 码）`GATE` / `FIDELITY` / `CODEGEN` / `INGEST`；PASS → `DONE`；用户停止 → `STOPPED`。

## 规则

- `blocked=true` 时只允许解除阻塞或 abort。
- 禁止并行改工程的两阶段。
- `round` 在每次进入 REPAIR 前加一；达 `maxRounds`（默认 5）→ `MAX_ROUNDS`。
- 续跑：从第一个 `completed.*=false` 的阶段继续。

## 立腿先于写屏（强制）

**腿先于屏**：进入 FIDELITY（写第一屏）之前，必须把本轮 GATE 的腿名册固化进 `pipeline-state.gateLegs`（当前全集：`pixel` / `geom` / `text` / `icons` / `cells` / `layout` / `data` / `impl`）。一屏是在某条腿存在之前写的，就不可能被那条腿断言——补腿不是「配置」，它会追溯性地作废已写的屏。

- 少一条腿没跑过就标 FIDELITY 完成 = 该维度整类不可见（历史事故：图标腿、流式腿、数据腿、impl 腿都在门全绿时退化）。
- 写屏后才决定补一条腿：追加到 `legsAddedAfterFidelity`（含 `leg`、`addedAt`），并把 `screensReprocessed=false`。此时**不得**直接进 DONE；必须按该腿的判据回 FIDELITY 重过受影响屏，完成后置 `screensReprocessed=true`。`legsAddedAfterFidelity` 非空即视为未收敛。
- 补腿本身（IR 契约 + capture 探针 + FAIL 码 + 运行手册）属 `kind: measurement`，不进 `round`；因补腿而重写屏属 `kind: fidelity`，进 `round`。

## 交付纪律（判据必须可测量）

- **「全绿」= 所有腿全绿**，以 `gate-report.legs` 的实际键为准（当前：`pixel` / `geom` / `text` / `icons` / `cells` / `layout` / `data` / `impl`）+ `runtime.webOk && runtime.apiOk`。少一条腿没跑不等于通过；`gate-report.legs` 出现 `gateLegs` 之外的键 = 有人在写屏后加了腿，按上节处理。
- **四门全绿 ≠ 还原完成**：任何「没有腿能看见」的维度都可以在门全绿时退化。新出现一类可复原偏差时，正确动作是**先给它一条腿**（IR 契约 + capture 探针 + FAIL 码 + 运行手册），再谈修。
- **禁止沉默跳过**：能力未实现的屏不得靠「不枚举/不标记」装成全过。要么给 FAIL 码，要么把用户批准的 skip 显式记进 `pipeline-state`（默认空），并在交付说明里列出。
- **阈值不得静默回落**：腿的容差读 env 键（`.env` 里列出键名），不要在自己代码里编一个「差不多」的常量。
- 交付说明必须同时给出：`overall`、各腿 `status`、**已知缺口**（`unresolved` 图标槽、未标记流式的屏等）。

## 阶段切换硬条件（摘录）

| 从 | 到 | 额外条件（除既有产物外） |
| --- | --- | --- |
| INGEST | SPEC | frame-manifest 已确认；**每个将闸门的 screenId 参考图** `imports/figma/screens/<screenId>.png` 存在（或 INGEST 未映射 screenId 时：included 帧均已导出且可在 SPEC 后按 screenId 对齐）。缺参考图 → 不标 `completed.INGEST=true`。 |
| FIDELITY | GATE | 进入前 `gateLegs` 已固化且 `legsAddedAfterFidelity` 为空；`fidelity-progress` 全 done、schema 通过（`node scripts/validate-artifact.mjs fidelity-progress`）**且** Fidelity 出口自检通过（几何落地 + chrome + 方案 C 流式壳 + 图标槽逐槽渲染 + 活数据接线）。GATE 固定 IR 视口采集并加宽复测（见 `viewport-fit`）。禁止「只接线本文案就切 GATE」。 |
| GATE | DONE | `gate-report.overall=PASS`（`legs` 全 PASS 且 runtime 可达）+ 用户交付确认 |

## Repair 路由补充

- 参考图缺失类 `GATE_PIXEL_DIFF`（message 含 reference screenshot missing）→ **INGEST / asset-export**，不是只回 FIDELITY。
- `GATE_GEOM_*` / `GATE_TEXT_*` / 有参考图时的像素差 → FIDELITY（+ modal-fidelity 若 modal）。
- `GATE_ICON_UNRESOLVED` → **IR**（命 symbol 或按参考图 glyph-match，补 `artifacts/ir/icon-symbols.json`）；`GATE_ICON_MISSING|BOX|COLOR` → FIDELITY（按 IR 槽补）。
- `GATE_LAYOUT_*` → FIDELITY（按 `viewport-fit` 改流式并打 `data-ir-fluid`）。
- `GATE_IMPL_*` → FIDELITY（去字面量/自造几何，改从 IR/token 读；mask 类收 `data-ir-live`）。measurement 类（`GATE_CAPTURE_UNSTABLE` / `GATE_PIXEL_REF_UNNORMALIZED`）记 `gate-instrumentation-fix`，不进 `round`。
- `GATE_DATA_*` / `CODEGEN_*` → CODEGEN。
- `RUNTIME_*` / `GATE_CAPTURE_MISSING` → runtime/capture 后重 GATE。

## 人工闸门摘要

| 闸门 | 必须展示 | 确认 | 拒绝回退 |
| --- | --- | --- | --- |
| DECISION | 栈六层+id、auth.mode、output.mode、fileKey 掩码、缺 env 键名 | 逐项作答 | 停 DECISION |
| INGEST | 帧 id/name/尺寸；参考图路径是否已落盘 | 确认 included | 可改；全 false → blocked |
| SPEC | 实体/路由/screens；jwt 时 seed 用户名与密码 env 键名；chrome 多余导航策略（默认保留渲染） | Spec 确认 | needsReview=true |
| REPAIR | FAIL 码聚合与落点 path | 继续 / 停止 | 停止 → STOPPED |
| DONE | overall + WEB_URL 键存在 | 交付确认 | 可回 REPAIR |

禁止 `--yes` 跳过 DECISION；禁止静默填 jwt+apps。

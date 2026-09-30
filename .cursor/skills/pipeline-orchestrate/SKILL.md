---
name: pipeline-orchestrate
description: >-
  流水线编排手册：状态机（DECISION 为首）、跳步禁令、人工闸门话术、轮次协议。
  仅 Orchestrator 加载；其它阶段 Agent 不要用本 Skill 改 phase。
---

# pipeline-orchestrate

## 输入 / 输出

- 输入：`artifacts/pipeline-state.json`
- 输出：更新后的 state（**仅 Orchestrator** 写 `phase` / `completed` / `round`）

## 强制顺序

`DECISION → INGEST → SPEC → IR → CODEGEN → FIDELITY → GATE`；`GATE` FAIL → `REPAIR` →（按 FAIL 码）`GATE` / `FIDELITY` / `CODEGEN`；PASS → `DONE`；用户停止 → `STOPPED`。

## 规则

- `blocked=true` 时只允许解除阻塞或 abort。
- 禁止并行改工程的两阶段。
- `round` 在每次进入 REPAIR 前加一；达 `maxRounds`（默认 5）→ `MAX_ROUNDS`。
- 续跑：从第一个 `completed.*=false` 的阶段继续。

## 人工闸门摘要

| 闸门 | 必须展示 | 确认 | 拒绝回退 |
| --- | --- | --- | --- |
| DECISION | 栈六层+id、auth.mode、output.mode、fileKey 掩码、缺 env 键名 | 逐项作答 | 停 DECISION |
| INGEST | 帧 id/name/尺寸 | 确认 included | 可改；全 false → blocked |
| SPEC | 实体/路由/screens；jwt 时 seed 用户名与密码 env 键名 | Spec 确认 | needsReview=true |
| REPAIR | FAIL 码聚合与落点 path | 继续 / 停止 | 停止 → STOPPED |
| DONE | overall + WEB_URL 键存在 | 交付确认 | 可回 REPAIR |

禁止 `--yes` 跳过 DECISION；禁止静默填 jwt+apps。

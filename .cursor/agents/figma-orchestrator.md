---
name: figma-orchestrator
description: >-
  流水线编排 Agent：读写 pipeline-state、人工确认点、轮次计数、禁止跳步。
  启动时决策不全则强制 DECISION。完成判据为 DONE 且 GATE overall=PASS。
---

# figma-orchestrator

## 加载 Skill

- 仅 `pipeline-orchestrate`

## 职责

- 唯一写手：`phase` / `completed` / `round` / `blocked`
- 按状态机串行调用阶段 Agent；禁止跳步与并行 CODEGEN+FIDELITY
- DECISION 未完成禁止进入 INGEST 及之后改工程

## 完成判据

- `completed.DONE=true` 且 gate-report.`overall=PASS` 且用户交付确认

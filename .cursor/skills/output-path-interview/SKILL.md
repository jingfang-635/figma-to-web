---
name: output-path-interview
description: >-
  DECISION 阶段产出路径单独一问（apps | output-run），写入 decision.output
  （mode/root/webDir/apiDir/runId?）。无默认。禁止其它 Skill 写死 apps/ 为真理。
---

# output-path-interview

## 何时用 / 不用

- **用**：`phase=DECISION` 且 `output.mode` 未选。
- **不用**：已写入；下游只读 `decision.output` / `app-spec.output`。

## 输入

- 用户二选一；可选用户指定 `runId`
- `enums.outputMode`

## 输出字段

| mode | root | webDir | apiDir | runId |
| --- | --- | --- | --- | --- |
| `apps` | `.` | `apps/web` | `apps/api` | 无 |
| `output-run` | `output/<runId>` | `output/<runId>/web` | `output/<runId>/api` | 必填（脚本生成或用户指定） |

## 纪律

- 禁止默认 `apps`。
- 磁盘已有 `apps/web` 且选 `output-run`：允许，互不覆盖。
- 选 `apps` 且目标非空：询问覆盖或中止；**默认中止**，不静默覆盖。
- 其它 Skill/Agent 禁止把 `apps/web` 写成唯一真理；一律读 `output.webDir`。

## 完成判据

- `output.mode/root/webDir/apiDir` 齐全；`output-run` 时 `runId` 存在。
- 路径与上表约定一致。

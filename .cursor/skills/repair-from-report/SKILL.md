---
name: repair-from-report
description: >-
  消费 gate-report.failures，按 FAIL 码定点修补并写 repair-log。
  禁止按业务屏名散文指令；按码路由回 FIDELITY/CODEGEN/重跑 GATE。
---

# repair-from-report

## 输入

- `artifacts/gates/<runStamp>/gate-report.json`
- `docs/repair/fail-code-playbook.md`（策略库）

## 输出

- 代码改动
- `artifacts/gates/<runStamp>/repair-log.json`（每条含 `code` 与 path）

## 路由（摘要）

| 码前缀/码 | 回退 |
| --- | --- |
| `GATE_PIXEL_*` / `GATE_GEOM_*` / `GATE_TEXT_STYLE` | FIDELITY |
| `GATE_GEOM_MODAL` | FIDELITY + modal-fidelity |
| `GATE_DATA_LOOP` / `GATE_DATA_LIVE` / `CODEGEN_*` | CODEGEN |
| `RUNTIME_*` / `GATE_CAPTURE_MISSING` | 重跑 runtime/capture + GATE |
| `AUTH_SEED_MISSING` / `SPEC_*` | SPEC |

## 完成判据

- 本轮至少处理报告中的 FAIL 列表并落盘 repair-log；结束后先探活再问是否继续。

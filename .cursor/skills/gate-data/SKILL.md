---
name: gate-data
description: >-
  数据腿：app-spec 字段/stats/API 与 DOM/API 闭环、回填、活数据。
  码 GATE_DATA_*；已声明 stats 必查。
---

# gate-data

## 输入

- `app-spec` 字段与 `stats`
- API 响应与 capture 回填值

## 输出

- `legs.data`

## 能力缺口

- 图表能力未实现时对 dashboard 报 `GATE_DATA_STATS_GAP` 或 `FIDELITY_CHART_UNSUPPORTED`，禁止假 PASS。

# FAIL 码修复策略库

Repair 只按 **code** 与字段 **path** 行动，不按业务屏名散文指令。

| code | 含义 | 首选动作 | 回退阶段 |
| --- | --- | --- | --- |
| `RUNTIME_NOT_UP` | 探活失败 | 重跑 `dev-runtime`；查 `API_URL`/`WEB_URL` 键 | GATE |
| `RUNTIME_PORT_BUSY` | 端口占用 | 按端口清旧进程或改端口 env 键 | GATE |
| `GATE_CAPTURE_MISSING` | 无 capture 快照 | 重新单趟采集 | GATE |
| `GATE_PIXEL_SIZE` | 画布尺寸不一致 | 查 Layout IR `bounds` 与视口；修页面根尺寸 | FIDELITY |
| `GATE_PIXEL_DIFF` | 像素差超阈值 | 对照 capture 热力；修 token/布局 | FIDELITY |
| `GATE_PIXEL_FLAT_BG` | 平坦背景异常 | 查容器 fill 是否未绑定 token | FIDELITY |
| `GATE_GEOM_CONTROL` | 控件框偏差 | 按 IR `controls[].bounds` 修 CSS/组件尺寸 | FIDELITY |
| `GATE_GEOM_MODAL` | 弹窗白卡偏差 | 加载 `modal-fidelity` | FIDELITY |
| `GATE_TEXT_CONTENT` | 文案不一致 | 若源在 Spec 字段 → SPEC；若 IR texts → 回填/写屏 | SPEC 或 FIDELITY |
| `GATE_TEXT_STYLE` | 字号/字色盒偏差 | `token-binding` + 文本样式 | FIDELITY |
| `GATE_DATA_LOOP` | config↔API 闭环断 | 查路由/DTO/生成 API | CODEGEN |
| `GATE_DATA_LIVE` | 活数据/关联为空 | seed、聚合、关联字段 | CODEGEN |
| `GATE_DATA_STATS_GAP` | stats 未实现 | 补 `app-spec.stats` 闭环或批准 skipScreenIds | SPEC/CODEGEN |
| `FIDELITY_CHART_UNSUPPORTED` | 图表能力未落地 | 可选 `chart-fidelity` 或 skip 批准 | FIDELITY |
| `CODEGEN_BUILD_FAIL` | 构建失败 | 修生成物/依赖后重跑 codegen | CODEGEN |
| `INGEST_FIGMA_RATE_LIMIT` | Figma 限流 | 等待退避；blocked | INGEST |
| `IR_SCREEN_MISSING` | 缺 Layout IR | 重抽或改 `included` | IR |
| `SPEC_NEEDS_REVIEW` | 未确认 Spec | 人工确认 | SPEC |
| `AUTH_SEED_MISSING` | jwt 缺种子 | 补 seedAdmin 或 GATE_USER/PASS 键 | SPEC |
| `MAX_ROUNDS` | 轮次用尽 | 用户提 `maxRounds` 或 STOPPED | Orchestrator |

## repair-log 最小形状

```json
{
  "schemaVersion": 1,
  "runStamp": "<same as gate>",
  "items": [
    { "code": "GATE_GEOM_CONTROL", "path": "legs.geom.failures[0]", "action": "fidelity-control-box" }
  ]
}
```

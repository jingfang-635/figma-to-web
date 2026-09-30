# figma-web 流水线脚手架

按 [docs/figma_agent_skill_design.md](docs/figma_agent_skill_design.md) 落地的 **Agent / Skill / Schema / Scripts** 骨架。视觉交付以 GATE 全过为准。

## 目录

| 路径 | 作用 |
| --- | --- |
| `.cursor/agents/` | 阶段 Agent |
| `.cursor/skills/` | 一功能一 Skill |
| `.cursor/rules/figma-pipeline.mdc` | 常驻不变量 |
| `schemas/` | JSON Schema |
| `config/stack-matrix.json` | 合法栈矩阵（含 ui） |
| `artifacts/` | 中间产物与 `pipeline-state.json` |
| `scripts/` | 校验 / 状态 / lint / 路径解析 |
| `docs/repair/` | FAIL 码策略库 |

## 快速命令

```bash
npm install
npm run state:init
npm run stack:resolve -- --language node --frontend react-vite --backend nestjs --database postgresql --orm prisma --ui antd
npm run output:paths -- apps
npm run env:check -- INGEST
npm run docs:lint
npm run validate:state
```

## 跑通 DECISION（对话内弹窗）

1. 仓库根 `.env` 填好 `FIGMA_ACCESS_TOKEN`（及其它阶段键）。
2. 由 **figma-decision** 弹出选择题（AskQuestion）：Figma 来源 + 栈六层 + 鉴权 + 产出，一次点选提交。
3. 写入后校验：

```bash
npm run validate:decision
npm run env:check -- INGEST
```

4. 状态进入 INGEST 后继续拉帧确认。

（`npm run decision:ui` 为可选 HTML 后备，默认不用。）

## 试点范围建议

登录 + 列表 + 弹窗小原型；`auth.mode` 与 `output.mode` 覆盖 `jwt|none` × `apps|output-run` 的合法组合各至少一次。图表屏在 `chart-fidelity` 未实现前须 FAIL 或 skip 批准，禁止假 PASS。

## 当前进度

- 已完成：决策契约、全套 Schema、Rules、docs:lint、核心校验脚本、全部 Agent/Skill 手册、修复策略库。
- 未完成（后续迭代）：Figma 拉取/IR 抽取/codegen/闸门的**可执行实现脚本**（现为 Skill 手册 + 校验壳）；需接 API 后才能端到端 DONE。

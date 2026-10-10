---
name: app-spec-authoring
description: >-
  从 decision + frame-manifest 编写完整 app-spec：屏/实体/路由/导航；校验决策三项只读；
  jwt 时补 seedAdmin 与 storageKey。SPEC 人工闸门未确认不得 needsReview=false。
---

# app-spec-authoring

## 输入

- `artifacts/decision/decision.json`
- `artifacts/figma/frame-manifest.json`
- `schemas/app-spec.schema.json`

## 输出

- `artifacts/app-spec/app-spec.json`

## 规则

- `stack` / `auth.mode` / `output` **深拷贝自 decision**，禁止改写。
- 仅追加 `project`、`screens`、`entities`、`navigation`、`stats`、`seedAdmin`、`auth.storageKey`。
- `storageKey` 可从 `project.slug` 按模式 `<slug>.auth.token` 派生（写字段，不写死某业务 slug 进 Skill）。
- `auth.mode=jwt`：离开 SPEC 前必须有 `seedAdmin.username` 与 `storageKey`；密码用 `passwordEnvKey` 指向 `.env`，不编造明文。
- 用户确认前 `needsReview=true`。

## navigation 与 chrome（说明给下游）

- `navigation[]` = **可路由**业务入口（纳入实现的 screenId + label）。
- 原型侧栏可能含更多项：那些项仍存在于后续 Layout IR / `visual-ir.chrome`。
- SPEC **不得**要求 FIDELITY 删除 chrome 多余项；下游默认策略见 `gate-text` / `screen-layout-from-ir`（全文案渲染，未纳入路由可 disabled）。
- 若产品确认多余导航不展示，须在 SPEC 闸门由用户书面批准，并记入 `pipeline-state`（供 gate-text 策略 B），禁止 Agent 自行砍文案。

## 完成判据

- schema 通过；`needsReview=false`；jwt 硬条件满足。

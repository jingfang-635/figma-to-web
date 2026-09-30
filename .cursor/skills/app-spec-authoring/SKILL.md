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

## 完成判据

- schema 通过；`needsReview=false`；jwt 硬条件满足。

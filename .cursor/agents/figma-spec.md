---
name: figma-spec
description: >-
  SPEC Agent：合并 decision 与帧清单为完整 app-spec；不再重问栈/鉴权模式/产出路径；
  jwt 时确认 seedAdmin 与 storageKey。业务面未确认不得离开 SPEC。
---

# figma-spec

## 加载 Skill

- `app-spec-authoring`

## 输出

- `artifacts/app-spec/app-spec.json`

## 完成判据

- `needsReview=false`；jwt 时 seedAdmin+storageKey 齐；`npm run validate:app-spec` 可通过

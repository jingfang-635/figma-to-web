---
name: figma-codegen
description: >-
  CODEGEN Agent：按 stack+auth+output 生成可编译骨架。jwt 才铺 JWT；
  页面空壳不含 IR 写实。本阶段触发 migrate/seed。
---

# figma-codegen

## 加载 Skill

- `codegen-web`
- `codegen-api`
- `codegen-db`

## 文件所有权

- 骨架与路由/api client：codegen
- 页面 body 写实：留给 fidelity（不得删除 codegen 契约文件）

## 完成判据

- web/api 构建 exit 0；jwt 时 JWT 模块存在；db migrate/seed 成功

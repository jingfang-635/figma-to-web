---
name: codegen-api
description: >-
  按 stack.backend 生成 API 到 spec.output.apiDir；仅 auth.mode=jwt 时生成 JWT 模块。
---

# codegen-api

## 输入

- `app-spec.stack` / `output.apiDir` / `entities` / `auth.mode`

## 输出

- `apiDir` 下可编译后端

## 规则

- `auth.mode=none` → 不生成强制 JWT 拦截。
- `auth.mode=jwt` → 生成 auth 模块；密钥读 env 键 `JWT_SECRET`。

## 完成判据

- 构建 exit 0；jwt 时 auth 模块存在。

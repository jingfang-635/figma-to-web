---
name: auth-interview
description: >-
  DECISION 阶段鉴权单独一问（jwt | none），写入 decision.auth.mode。无默认。
  说明对 codegen/gate 的影响；不编造账号。仅 Decision 阶段使用。
---

# auth-interview

## 何时用 / 不用

- **用**：`phase=DECISION` 且 `auth.mode` 未选。
- **不用**：已选定；SPEC 只补 `seedAdmin` / `storageKey`，不改 `mode`。

## 输入

- 用户二选一作答
- `config/stack-matrix.json` → `enums.authMode`

## 输出

`decision.auth = { mode: "jwt" | "none" }`

## 提问

单独一问，选项仅：

| 值 | 下游影响（告知用户，不替选） |
| --- | --- |
| `jwt` | 生成 auth 模块与受保护路由；GATE 需 seed/env 账号；SPEC 须补 `seedAdmin` 与 `storageKey` |
| `none` | 无强制登录拦截；GATE 可直达业务屏 |

## 完成判据

- `auth.mode` 已写入且属于枚举。
- 未默认 jwt 或 none。
- 未在正文或 decision 中写入密码明文。

## 禁止

- 编造 `seedAdmin` 密码进文档或 Skill。
- 在本 Skill 写入 `storageKey`（属 SPEC / `app-spec-authoring`）。

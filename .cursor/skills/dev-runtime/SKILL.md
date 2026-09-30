---
name: dev-runtime
description: >-
  按 spec.output 启停 web/api 并探活。联调先 api 后 web。Gate 必须经本 Skill 确认
  runtime.webOk/apiOk。失败记 RUNTIME_*，不计入四门视觉腿。
---

# dev-runtime

## 输入

- `app-spec.output.webDir` / `apiDir`
- env 键：`API_URL`、`WEB_URL`、`API_PORT`、`WEB_PORT`

## 输出

- 进程就绪；探活 HTTP 成功
- 供 gate-report.`runtime` 使用

## 步骤

1. 读 output 路径，不写死 `apps/`。
2. 若端口占用 → 按端口清理旧进程，或报 `RUNTIME_PORT_BUSY`。
3. 先起 api，再起 web。
4. 探活 `API_URL` 与 `WEB_URL`（键必须存在；值不进 Skill 正文）。

## 完成判据

- `apiOk` 且 `webOk`；否则 Gate 不得宣称视觉腿 PASS。

---
name: codegen-db
description: >-
  按 entities + stats 生成 schema/seed 并在 CODEGEN 阶段执行 migrate/seed。
  连接串只读 env 键（POSTGRES_URL 或 MYSQL_URL|MYSQL_JDBC_URL）。
---

# codegen-db

## 输入

- `app-spec.entities` / `stats` / `stack.database` / `stack.orm`
- env 连接键

## 输出

- schema + seed 文件；migrate/seed 执行结果

## 闭环

- `stats[]` 中每个 `op` 须能在 seed 或 API 聚合中体现；无 stats 允许空数组。
- gate-data 对已声明 stats 必查。

## 完成判据

- migrate/seed 成功；缺连接键 → 阻塞 CODEGEN。

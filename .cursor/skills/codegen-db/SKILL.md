---
name: codegen-db
description: >-
  按 entities + stats 生成 schema/seed 并在 CODEGEN 阶段执行 migrate/seed。
  活数据模式：seed 须自动造足够样本，使仪表盘/列表非空壳。
  连接串只读 env 键（POSTGRES_URL 或 MYSQL_URL|MYSQL_JDBC_URL）。
---

# codegen-db

## 输入

- `app-spec.entities` / `stats` / `stack.database` / `stack.orm`
- env 连接键

## 输出

- schema + seed 文件；migrate/seed 执行结果

## 活数据造数（强制，用户策略）

- 前端 KPI/图表/列表读 API，**不**写死 Figma 样例数字。
- seed 须在库空时自动插入足够样本，使：
  - 纳入实体列表非空（多条）
  - `stats` 聚合有非零结果（若 spec 声明了 stats）
  - 近 N 天（至少 7）有可序列化到趋势图的业务记录（若领域含此类实体）
- 造数规则写在生成物 seed 代码中，禁止把具体业务样例字面量写进本 Skill 正文。
- 已有数据时勿盲目清空；仅在空库或明确 reseed 标志时填充。

## 闭环

- `stats[]` 中每个 `op` 须能在 seed 或 API 聚合中体现；无 stats 允许空数组。
- gate-data 对已声明 stats 必查。

## 完成判据

- migrate/seed 成功；缺连接键 → 阻塞 CODEGEN。
- 探活后 stats/列表 API 非「全零空表」（除非实体设计即为空）。

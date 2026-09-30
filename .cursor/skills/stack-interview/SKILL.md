---
name: stack-interview
description: >-
  DECISION 阶段技术栈逐层访谈。按 language→frontend→backend→database→orm→ui
  单独提问，对照 config/stack-matrix.json 解析 stack.id 并校验 ui。无默认、不猜。
  仅在 Decision Agent / 开工决策闸门时使用；不要在 SPEC 及之后重问栈。
---

# stack-interview

## 何时用 / 不用

- **用**：`pipeline-state.phase=DECISION` 且 `decision.stack` 未齐。
- **优先**：Cursor 对话内选择题弹窗（AskQuestion）批量列出可选值供点击；选项集来自 `config/stack-matrix.json`，矩阵外项禁用或不列出。
- **不用**：已写入合法 `artifacts/decision/decision.json` 的 stack；SPEC 及之后只校验、不重问。
- **不要**默认改用独立 HTML 页做决策。

## 输入

- `config/stack-matrix.json`（唯一合法矩阵与联动表）
- 用户逐层作答（无默认）

## 输出

写入 `artifacts/decision/decision.json` 的 `stack` 字段：

```text
stack.id | language | frontend | backend | database | orm | ui
```

## 提问顺序（缺一层就停）

1. `language` ← `enums.language`
2. `frontend` ← `enums.frontend`
3. `backend` ← `linkages[language].backend`
4. `database` ← `linkages[language].database`
5. `orm` ← `linkages[language].orm`（禁止跨生态）
6. `ui` ← `linkages[frontend].ui`（闭合枚举）

每层只列当前可选值，禁止一次甩出整行套餐让用户「选 ID」。

## 校验算法

1. 用 `language+frontend+backend+database+orm` 在 `rows` 中唯一匹配 → 得 `id`；失败则拒绝并展示合法表。
2. 断言 `ui` ∈ 该行 `ui` 数组；失败则拒绝。
3. `ui` 不单独产生新 `id`，但必须参与合法性。

CLI `--stack <ID>` 仅捷径：仍须取得合法 `ui`，并与矩阵一致。

## 完成判据

- `stack` 七字段齐全且通过矩阵校验。
- 未替用户选择任何一层默认值。

## 禁止

- 业务屏名、色值、fileKey、账号等业务字面量。
- 把 `apps/web` 写成默认真理（产出路径属 `output-path-interview`）。

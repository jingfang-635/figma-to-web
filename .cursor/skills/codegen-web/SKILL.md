---
name: codegen-web
description: >-
  按 stack.frontend + stack.ui 生成前端骨架到 spec.output.webDir。
  空壳=路由+布局壳+按 template 的空白页+ui Provider；不含 IR 写实。
---

# codegen-web

## 输入

- `app-spec.stack` / `output.webDir` / `screens` / `auth.mode`

## 输出

- `webDir` 下可安装依赖的前端工程（带生成标记）

## 规则

- 路径只读 `output.webDir`。
- 组件库 = `stack.ui` 闭合枚举之一。
- 页面空壳不含 Layout IR 几何；写实交给 fidelity。

## 完成判据

- 依赖安装后构建 exit 0（或仓库约定的类型检查）。

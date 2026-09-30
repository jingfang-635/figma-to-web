---
name: gate-pixel
description: >-
  像素腿：对照截图 vs 运行截图。断言画布尺寸、整页像素差、平坦背景。
  阈值读 env 键名；消费统一 capture 快照。
---

# gate-pixel

## 输入

- `artifacts/gates/<runStamp>/capture.json`
- env：`GATE_PIXEL_SSIM_MIN` 等键

## 输出

- gate-report.`legs.pixel`（status + failures，码如 `GATE_PIXEL_*`）

## 不负责

- 单控件框、单文本盒（归 geom/text）

## 完成判据

- 写出 leg 结果；缺 capture → `GATE_CAPTURE_MISSING`。

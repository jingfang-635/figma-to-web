---
name: gate-pixel
description: >-
  像素腿：对照截图 vs 运行截图。断言画布尺寸、整页像素差、平坦背景。
  阈值读 env 键名；消费统一 capture 快照。参考图为 INGEST 前置产物。
---

# gate-pixel

## 输入

- `artifacts/gates/<runStamp>/capture.json`
- **参考截图（前置产物，非本腿生成）**：`imports/figma/screens/<screenId>.png`
  - 由 INGEST/`asset-export` 产出；缺失时本腿记 `GATE_PIXEL_DIFF`（message 含 reference screenshot missing）
- Layout IR（画布尺寸断言：页面比整帧 bounds，弹窗比 `modal-card` 角色框——
  弹窗帧可能含原型画出的外溢元素，帧高不等于白卡高）
- `capture.dom.liveRegions`（活数据区，见下）
- env 键名：`GATE_PIXEL_SSIM_MIN`、`GATE_PIXEL_MISMATCH_MAX`、`GATE_PIXEL_FLAT_BG_MAX`、`GATE_PIXEL_SIZE_TOL`、`GATE_PIXEL_LIVE_MASK_MAX`（及兼容旧键，以脚本为准）

## 对齐：参考图含效果外溢，须按不透明框对齐

Figma 导出节点时连效果一起渲染，弹窗白卡的投影会带出不对称留白
（blur 与 offset 决定上/下留白不同）。因此：

- 不得用「文件尺寸相等」当判据；先用参考图的 **不透明框**（alpha 达标的行列）定位白卡，
  再按该偏移与运行截图逐像素比较；不透明框尺寸与运行截图不符才记 `GATE_PIXEL_SIZE`。
- 偏移量写入 `legs.pixel.notes`（可审计，不是静默容忍）。
- 整页截图四周不透明，偏移退化为 0，行为不变。

## 活数据区：按 capture 的 data-ir-live 区遮罩

列表行、日历格、随表单联动的预览等由 seed/后端填充的内容**不是原型画的**，
与原型样例值必然不同。capture 已收集这些区的框（`data-ir-live`），本腿：

- 比较时跳过落在这些框内的像素，只评分壳层/标签/控件；
- 记 `liveMasked` 比例到 notes；超过 `GATE_PIXEL_LIVE_MASK_MAX` 记
  `GATE_PIXEL_LIVE_MASK`（遮罩过多＝几乎没在评分，防「把整屏遮掉变全过」）。
- 与 `gate-layout`/`gate-text`/`gate-icon` 的活数据判据同源：同一份 capture 区框。

### 遮罩要窄：只圈「值」，不圈「盒」

活数据区能遮住的是**值**，不是承载它的**盒**。列表页最容易犯的两种：

- 把整个翻页器（`.ant-table-pagination` 之类）当活数据遮掉：翻页方框的尺寸、圆角、选中态填充色、所在位置都是原型画出来的，遮掉之后**这些全部不再被本腿评分**——「翻页器与原型不一致」这类事故就此隐形。正确做法是只圈翻页器里的**总条数文本**。
- 把整个容器/面板当活数据遮掉：等于放弃该区域的评分。
- 把日历/网格整块当活数据遮掉：格线、表头、四态底色、今日徽标、图例色块都是原型画出来的 chrome（IR `cells[]`），遮掉之后这些全部不再被本腿评分，而**单元格腿对遮罩免疫**（它只认 IR 槽），并由 `GATE_IMPL_MASK_ON_CELL` 反向判「遮罩盖住了 IR 单元格框」。正确做法是只圈格内的**日期数字与 chip**。

**溢出不能靠加宽遮罩来「修」**：内容撑出卡片时，把遮罩跟着放大到卡片外只是让像素腿看不见它，容器本身的滚动量仍会说话（`GATE_LAYOUT_OVERFLOW`），并且 `GATE_IMPL_MASK_OUTSIDE_CARD` 会判遮罩越出了面板框。看到遮罩被撑出容器，应回写屏修布局，而不是继续放遮罩。

## 输出

- gate-report.`legs.pixel`（status + failures，码如 `GATE_PIXEL_*`；notes 记每屏 mismatch/flatBgDrift/liveMasked 与对齐偏移）

## 前置与路由

- 缺 `imports/figma/screens/<screenId>.png` → 失败码仍为像素腿结果，但 **Repair 不得只在 FIDELITY 里「画」出参考图**；应回退 INGEST/`asset-export` 补导出后重跑 GATE。
- 缺 capture → `GATE_CAPTURE_MISSING`（重采集）。
- capture 浏览器 viewport = Layout IR 宽高；运行态为流式壳（方案 C）时 **不再**依赖整页 scale。见 `viewport-fit`。
- 弹窗截图前必须等入场动画结束（capture 负责）；否则拿到半透明/缩放中的卡，像素差会虚高。
- `GATE_PIXEL_SIZE` / 有参考图时的 `GATE_PIXEL_DIFF` / `GATE_PIXEL_FLAT_BG` → 默认回 FIDELITY（布局/token）；参考图缺失类 → INGEST。
- `GATE_PIXEL_LIVE_MASK` → 检查 `data-ir-live` 是否标错/标多（应只圈活数据区），必要时收敛区框或调阈值；遮罩盖住 IR 单元格框会被 `GATE_IMPL_MASK_ON_CELL` 判 FAIL。
- `GATE_CELL_*` → 画出来的 chrome（日历/网格的外框、表头、格、图例色块、徽标、开关轨）盒或底色漂移，归 `gate-cells`（FIDELITY）。

## 不负责

- 单控件框、单文本盒（归 geom/text）
- 导出 Figma 参考图（归 asset-export）

## 完成判据

- 写出 leg 结果；缺 capture → `GATE_CAPTURE_MISSING`。

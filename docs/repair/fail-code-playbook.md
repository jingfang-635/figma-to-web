# FAIL 码修复策略库

Repair 只按 **code** 与字段 **path** 行动，不按业务屏名散文指令。

| code | 含义 | 首选动作 | 回退阶段 |
| --- | --- | --- | --- |
| `RUNTIME_NOT_UP` | 探活失败 | 重跑 `dev-runtime`；查 `API_URL`/`WEB_URL` 键 | GATE |
| `RUNTIME_PORT_BUSY` | 端口占用 | 按端口清旧进程或改端口 env 键 | GATE |
| `GATE_CAPTURE_MISSING` | 无 capture 快照 | 重新单趟采集 | GATE |
| `GATE_CAPTURE_UNSTABLE` | 采集时字体/图片/动画/网络未稳 | **测量缺陷，非还原缺陷**：稳定 `waitSettled`/`waitModalSettled` 后重采集；不消耗 FIDELITY 轮次（记 `gate-instrumentation-fix`） | GATE |
| `GATE_PIXEL_REF_UNNORMALIZED` | 参考图未归一化/未申报尺寸 | 按 asset-export `--normalize` 把参考图裁到不透明框，并在 `assets-manifest` 申报 `cardSize`/`effectBleed`；**测量缺陷**，不消耗 FIDELITY 轮次 | INGEST / GATE |

| `GATE_PIXEL_SIZE` | 画布/白卡尺寸不一致 | 页面比 IR `bounds`；弹窗比 `modal-card` 角色框（帧可能含原型外溢）；查视口与运行态根尺寸 | FIDELITY |
| `GATE_PIXEL_DIFF` | 像素差超阈值 | 若 message 含 `reference screenshot missing` → 补 `imports/figma/screens/<screenId>.png`（asset-export）；否则对照 capture 热力修 token/布局（参考图含效果外溢时按不透明框对齐，偏移见 leg notes） | 缺参考图 → INGEST；否则 FIDELITY |
| `GATE_PIXEL_FLAT_BG` | 平坦背景异常 | 查容器 fill 是否未绑定 token；弹窗先确认截图非入场动画中途 | FIDELITY |
| `GATE_PIXEL_LIVE_MASK` | 活数据区遮罩过多 | `data-ir-live` 圈大了（应只圈列表行/日历格/联动预览等 seed 内容）；收敛区框后重跑 | FIDELITY |
| `GATE_GEOM_CONTROL` | 控件框偏差 | 先查 IR `controls[].role` 是否误标展示卡为表单角色；再按 bounds 修 DOM 盒 | IR 或 FIDELITY |
| `INGEST_REF_SHOT_MISSING` | 缺整帧参考图 | 按 asset-export 导出纳入屏 PNG | INGEST |
| `GATE_GEOM_MODAL` | 弹窗白卡偏差 | 加载 `modal-fidelity` | FIDELITY |
| `GATE_ICON_UNRESOLVED` | 图标槽在 IR 里没有符号名 | 回 `layout-ir-extract`：命中 `figma-name` 或按参考截图 `glyph-match`，补 `artifacts/ir/icon-symbols.json` | IR |
| `GATE_ICON_MISSING` | IR 有槽、DOM 没有（或数量不等） | 按 IR 槽补渲染（弹窗槽见 `modal-fidelity`）；槽数与角色表不符先回 IR | FIDELITY |
| `GATE_ICON_BOX` | 图标槽盒漂移 | 按 IR `bounds` 定位该槽 | FIDELITY |
| `GATE_ICON_COLOR` | 图标槽色偏 | 槽色取 IR `color`（含交互态），别继承父级或自编色值 | FIDELITY |
| `GATE_CELL_MISSING` | IR `cells[]` 有槽、DOM 没有（或数量不等） | 按 IR 槽补 `data-ir-cell` 逐块渲染（日历/网格 chrome 的框、表头、图例色块、徽标、切换轨）；槽数与 IR 不一致先回 IR | FIDELITY |
| `GATE_CELL_ROLE` | 配对到第 i 槽时角色错位（阅读序发散） | 该屏 `data-ir-cell` 的渲染序与 `cells[]` 阅读序不符：按 IR 顺序补/删槽，别调整 IR 去迎合 DOM | FIDELITY |
| `GATE_CELL_BOX` | 单元格盒漂移（位置或尺寸） | `badge` 只比尺寸（跟随今日，位置自由）；其余角色按 IR `bounds` 定位取尺寸。行高/表头高/图例块/切换轨的尺寸一律取 IR，**不要**用组件库默认值或自编 px | FIDELITY |
| `GATE_CELL_FILL` | 单元格底色漂移（含整列全白） | 底色取 IR `fill`；IR 对某列一致着色（周末列）时该列不得被写死成白。日历格底色四态由 IR 派生，不在 CSS 里编色值 | FIDELITY |
| `GATE_LAYOUT_NO_FLUID` | 该屏没有随主区伸缩的容器 | 回写屏：块级容器改流式并打 `data-ir-fluid`（见 `viewport-fit`） | FIDELITY |
| `GATE_LAYOUT_SCALED` | 整页被 `transform: scale()` 缩放 | 删除缩放适配，改流式壳层 | FIDELITY |
| `GATE_LAYOUT_STATIC` | 加宽后容器没跟随主区 | 定位该组：宽度写死 / 内距变了 / 横向溢出 | FIDELITY |
| `GATE_LAYOUT_INNER_STATIC` | 容器跟随了，但容器里的内容没跟随 | 内容放进该容器内部参与布局流（`minmax(0,1fr)` 吃增量）；见 `viewport-fit` 不变式 3 | FIDELITY |
| `GATE_LAYOUT_OVERFLOW` | 容器装不下自己的内容（行/翻页器越出卡片） | 容器高改 `height:auto` + `min-height` 取 IR 并由内容撑高；行高/表头高/分页大小取自 IR；翻页器贴卡片底边；确需内部滚动则显式加 `data-ir-scroll`（见 `viewport-fit` 不变式 4 / `screen-layout-from-ir` 表格契约） | FIDELITY |
| `GATE_TEXT_CONTENT` | 文案不一致 | 若源在 Spec 字段 → SPEC；若 IR texts → 回填/写屏 | SPEC 或 FIDELITY |
| `GATE_TEXT_STYLE` | 字号/字色盒偏差 | `token-binding` + 文本样式；弹窗 label 折行 / 星号错位 → 查是否把 `*` 嵌进 label 紧盒（见 `modal-fidelity`「表单 label 与必填星号」） | FIDELITY |
| `GATE_DATA_LOOP` | config↔API 闭环断 | 查路由/DTO/生成 API | CODEGEN |
| `GATE_DATA_LIVE` | 活数据/关联为空 | seed、聚合、关联字段 | CODEGEN |
| `GATE_DATA_STATS_GAP` | stats 未实现 | 补 `app-spec.stats` 闭环或批准 skipScreenIds | SPEC/CODEGEN |
| `GATE_IMPL_HARDCODED` | 页面把 IR 里的颜色写成字面量 | 改成从 IR/token 读取（或经 `token-binding` 生成样式）；确需保留的记入 `artifacts/ir/impl-baseline.json` 并附理由 | FIDELITY |
| `GATE_IMPL_IR_FALLBACK` | IR 几何缺席时回落到自造数字 | 去掉 `?? <number>` 兜底，改从 IR 读取；IR 真缺节点则先补 IR | IR 或 FIDELITY |
| `GATE_IMPL_MASK_ON_CONTROL` | 活数据区盖住了 IR 控件 | 收敛 `data-ir-live` 区域，控件必须可被 geom 腿打分；控件本就 live 时改用更窄的区（如表格 body） | FIDELITY |
| `GATE_IMPL_MASK_ON_CHROME` | 活数据区伸进静态壳层 | 收敛 `data-ir-live`，壳层/chrome 必须保持可打分 | FIDELITY |
| `GATE_IMPL_MASK_OUTSIDE_CARD` | 活数据区越出承载它的卡片（弹窗 `modal-card` / 列表 `panel`） | 把 `data-ir-live` 收回卡片框内；**禁止**放大遮罩盖住溢出——那是拿遮罩掩盖布局事故，先修 `GATE_LAYOUT_OVERFLOW` | FIDELITY |
| `GATE_IMPL_MASK_ON_CELL` | 活数据区盖住了 IR 单元格（`cells[]` 框） | 收敛 `data-ir-live` 到**值**而非**盒**：日历只圈日期数字与格内 chip，不圈整格；网格 chrome 必须保持可被 cells 腿打分 | FIDELITY |
| `GATE_IMPL_CARD_SSOT` | 弹窗白卡尺寸 IR 与参考图 manifest 不一致 | 三者（IR `modal-card` / `assets-manifest.cardSize` / DOM）取同一尺寸：改 IR 或重导参考图归一化；**测量一致性缺陷**，先对齐数源再谈还原 | IR / INGEST |
| `FIDELITY_CHART_UNSUPPORTED` | 图表能力未落地 | 可选 `chart-fidelity` 或 skip 批准 | FIDELITY |
| `CODEGEN_BUILD_FAIL` | 构建失败 | 修生成物/依赖后重跑 codegen | CODEGEN |
| `INGEST_FIGMA_RATE_LIMIT` | Figma 限流 | 等待退避；blocked | INGEST |
| `IR_SCREEN_MISSING` | 缺 Layout IR | 重抽或改 `included` | IR |
| `SPEC_NEEDS_REVIEW` | 未确认 Spec | 人工确认 | SPEC |
| `AUTH_SEED_MISSING` | jwt 缺种子 | 补 seedAdmin 或 GATE_USER/PASS 键 | SPEC |
| `MAX_ROUNDS` | 轮次用尽 | 用户提 `maxRounds` 或 STOPPED | Orchestrator |

## repair-log 最小形状

`kind` 区分两类，决定是否消耗 FIDELITY 轮次：

- `fidelity`：页面确实没还原（几何/文案/图标/流式/数据）→ 走 FIDELITY/CODEGEN/IR，消耗轮次。
- `measurement`：闸门自身测量失稳（采集未稳、参考图未归一化、腿本身缺探针）→ 记 `gate-instrumentation-fix`，**不消耗 `MAX_ROUNDS`**，修完直接重跑 GATE。

```json
{
  "schemaVersion": 1,
  "runStamp": "<same as gate>",
  "items": [
    { "code": "GATE_GEOM_CONTROL", "path": "legs.geom.failures[0]", "kind": "fidelity", "action": "fidelity-control-box" },
    { "code": "GATE_CAPTURE_UNSTABLE", "path": "legs.pixel.failures[0]", "kind": "measurement", "action": "gate-instrumentation-fix" }
  ]
}
```

新增一类「没有腿能看见」的偏差时，先补腿（IR 契约 + capture 探针 + FAIL 码 + 本表一行），再谈修；补腿本身记 `kind: measurement`。

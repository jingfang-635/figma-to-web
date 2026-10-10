# icons[] 契约（强制）

图标不是装饰。`icons[]` 必须**逐槽**列出该屏每一个可见图标槽，且每槽带几何、颜色与符号身份，否则图标腿无法判定，消费端只能各写一份猜法。

每槽字段（`schemas/layout-ir.schema.json`）：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `nodeId` | 是 | 该槽在 `tree` 中的节点 id |
| `exportable` | 是 | 是否走 asset 导出（导出图与向量二选一） |
| `bounds` | 是 | 槽的绝对框，用于盒配对 |
| `color` | 否 | 槽的绘制色；节点自身或其子树首个 paint 的颜色 |
| `symbol` | 是 | 见下 |

`symbol`（三者互斥）：

| `symbol.source` | 含义 | `symbol.name` |
| --- | --- | --- |
| `figma-name` | 节点名本身即符号名 | 必填 |
| `glyph-match` | 节点无名（`Vector`/`svg-icon` 之类占位名），按参考截图里的字形比对得出 | 必填 |
| `unresolved` | 确实推不出符号 | 缺席；图标腿报 `GATE_ICON_UNRESOLVED` |

规则：

- **占位节点名不算已解析**。`Vector`、`Group`、`Rectangle`、`icon`、`svg-icon` 等描述的是形状不是符号；这类槽必须走 `glyph-match` 或记 `unresolved`。
- 名字解析优先级：**Figma 节点名 → 参考截图字形比对 → 显式 `unresolved`**。禁止用业务文案（标题、按钮文字）反查图标表来补名。
- 同位置若有「有名字的组件帧」与「扁平化粘贴的向量」重叠，只留一槽，符号名取帧名，颜色可取自向量。禁止同一处出两槽。
- 推不出的符号名属于设计数据，写在 `artifacts/ir/icon-symbols.json`（`overrides[]`），**不写进 Skill 或脚本**。
- 枚举/回填/自检用 `node scripts/ir-icons.mjs`（`--list` 看槽，`--write` 回填并同步 webDir 生成镜像，无参即自检）。

## symbol.role 角色表（强制，与 controls 的 geom 角色互斥）

| role | 用于 |
| --- | --- |
| `brand-mark` | 壳层品牌标记 |
| `nav-item` | 侧栏/顶栏导航项图标（按 y 序即导航项序） |
| `leading` | 位于文本块左侧的标题/行首图标 |
| `trailing` | 位于文本/控件右侧的后缀图标（箭头、清除、日历缀） |
| `standalone` | 无相邻文本的独立槽（关闭、上传位、工具条） |

图标槽**永远不得**使用 `controls[]` 的 geom 角色（`input`/`select`/`button*`），也不得反过来把控件标成图标角色。

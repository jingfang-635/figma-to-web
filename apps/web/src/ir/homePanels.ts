import homeJson from '../generated/layout/home.json'
import chromeJson from '../generated/chrome.json'
import type { IrBounds } from './geometry'

export type TextAlign = 'LEFT' | 'CENTER' | 'RIGHT'

export type PanelTextStyle = {
  fontFamily?: string
  fontSize?: number
  fontWeight?: number
  lineHeightPx?: number
  textAlignHorizontal?: TextAlign
}

export type PanelText = {
  characters: string
  bounds: IrBounds
  style?: PanelTextStyle
  color?: string
}

export type GridLine = { y: number; color?: string }

/** Title icon: IR keeps the glyph geometry but dropped most Figma frame names. */
export type PanelIcon = { bounds: IrBounds; name: string; color?: string }

/** Data-point marker (line charts only). */
export type Marker = { bounds: IrBounds; fill?: string }

type Fill = { type?: string; color?: string }

type Node = {
  id: string
  name: string
  type: string
  bounds: IrBounds
  fills?: Fill[]
  cornerRadius?: number
  children?: Node[]
  text?: { characters: string; style?: PanelTextStyle }
}

type RawText = {
  nodeId?: string
  characters: string
  bounds: IrBounds
  style?: PanelTextStyle
}

type RawControl = { nodeId: string; role: string; bounds: IrBounds }

type RawIcon = {
  nodeId: string
  exportable: boolean
  bounds: IrBounds
  color?: string
  symbol: { source: string; name?: string; role: string }
}

const raw = homeJson as unknown as {
  tree: Node
  texts: RawText[]
  controls?: RawControl[]
  icons?: RawIcon[]
}

const chrome = chromeJson as unknown as {
  chrome: { sidebar: { width: number }; header: { bounds: IrBounds } }
}

const CONTENT_X = chrome.chrome.sidebar.width
const CONTENT_Y = chrome.chrome.header.bounds.height

function flatten(root: Node): Node[] {
  const out: Node[] = []
  const go = (n: Node) => {
    out.push(n)
    for (const c of n.children ?? []) go(c)
  }
  go(root)
  return out
}

const NODES = flatten(raw.tree)
const COLOR_BY_ID = new Map<string, string>()
for (const n of NODES) {
  const c = n.fills?.find((f) => f.color)?.color
  if (c) COLOR_BY_ID.set(n.id, c)
}

function nodeColor(n?: Node): string | undefined {
  return n?.fills?.find((f) => f.color)?.color
}

function unionBounds(list: IrBounds[]): IrBounds {
  const xs = list.map((b) => b.x)
  const ys = list.map((b) => b.y)
  const x2 = list.map((b) => b.x + b.width)
  const y2 = list.map((b) => b.y + b.height)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return {
    x,
    y,
    width: Math.max(...x2) - x,
    height: Math.max(...y2) - y,
  }
}

function toText(t: RawText): PanelText {
  return {
    characters: t.characters,
    bounds: t.bounds,
    style: t.style,
    color: t.nodeId ? COLOR_BY_ID.get(t.nodeId) : undefined,
  }
}

function fromNode(n: Node): PanelText {
  return {
    characters: n.text?.characters ?? n.name,
    bounds: n.bounds,
    style: n.text?.style,
    color: nodeColor(n),
  }
}

function centerIn(t: IrBounds, b: IrBounds): boolean {
  const cx = t.x + t.width / 2
  const cy = t.y + t.height / 2
  return cx >= b.x && cx <= b.x + b.width && cy >= b.y && cy <= b.y + b.height
}

function gridGeometry(plot: Node): {
  gridYs: GridLine[]
  axisX: number
  right: number
} {
  const b = plot.bounds
  const kids = plot.children ?? []
  const grid = kids.filter(
    (k) => k.bounds.width > b.width * 0.5 && k.bounds.height <= 2,
  )
  const axis = kids.filter(
    (k) => k.bounds.height > b.height * 0.5 && k.bounds.width <= 2,
  )
  const gridYs = grid
    .map((g) => ({ y: g.bounds.y, color: nodeColor(g) }))
    .sort((a, z) => a.y - z.y)
  const axisX = axis.length
    ? axis[0].bounds.x
    : Math.min(...grid.map((g) => g.bounds.x))
  const right = Math.max(
    ...grid.map((g) => g.bounds.x + g.bounds.width),
    axisX,
  )
  return { gridYs, axisX, right }
}

type ChartCommon = {
  id: string
  bounds: IrBounds
  fill?: string
  radius?: number
  title: PanelText
  icon?: PanelIcon
  plot: IrBounds
  gridYs: GridLine[]
  axisX: number
  right: number
  yTicks: PanelText[]
  xLabels: PanelText[]
  valueLabels: PanelText[]
  markers: Marker[]
  accent?: string
}

export type LinePanel = ChartCommon & { kind: 'line' }

export type BarPanel = ChartCommon & {
  kind: 'bar'
  bars: { bounds: IrBounds; color?: string; label: string }[]
}

export type MetricsPanel = {
  kind: 'metrics'
  id: string
  bounds: IrBounds
  title: PanelText
  icon?: PanelIcon
  tiles: {
    bounds: IrBounds
    fill?: string
    radius?: number
    value: PanelText
    label: PanelText
  }[]
}

export type HomePanel = LinePanel | BarPanel | MetricsPanel

const chartNodes = NODES.filter((n) =>
  (n.children ?? []).some((c) => c.name === 'plot'),
)

/**
 * Panel title icons are IR icon slots (role `leading`). The symbol may have been
 * recovered from the drawn glyph rather than from a Figma frame name, but the
 * slot always carries geometry and colour, so nothing has to be guessed here.
 */
const TITLE_ICON_SLOTS = (raw.icons ?? []).filter(
  (i) => i.symbol?.role === 'leading',
)

/** Match the icon slot sitting immediately left of a panel title, mid-aligned. */
function resolveIcon(title: PanelText): PanelIcon | undefined {
  const t = title.bounds
  const tcy = t.y + t.height / 2
  const slot = TITLE_ICON_SLOTS.filter((c) => {
    const right = c.bounds.x + c.bounds.width
    const cy = c.bounds.y + c.bounds.height / 2
    return right <= t.x + 2 && t.x - right < 26 && Math.abs(cy - tcy) < 14
  }).sort((a, z) => z.bounds.x - a.bounds.x)[0]
  if (!slot) return undefined
  if (slot.symbol.source === 'unresolved' || !slot.symbol.name) return undefined
  return { bounds: slot.bounds, name: slot.symbol.name, color: slot.color }
}

/** Square-ish 9–10px vectors in the plot are the line-chart data markers. */
function markersOf(plotNode: Node | undefined): Marker[] {
  return (plotNode?.children ?? [])
    .filter(
      (c) =>
        c.type === 'VECTOR' &&
        c.bounds.width >= 8 &&
        c.bounds.width <= 11 &&
        Math.abs(c.bounds.width - c.bounds.height) < 2,
    )
    .sort((a, z) => a.bounds.x - z.bounds.x)
    .map((c) => ({ bounds: c.bounds, fill: nodeColor(c) }))
}

function buildChart(panel: Node): LinePanel | BarPanel {
  const children = panel.children ?? []
  const titleNode = children.find((c) => c.name === 'title')
  const plotNode = children.find((c) => c.name === 'plot')
  const plot = plotNode?.bounds ?? panel.bounds
  const { gridYs, axisX, right } = gridGeometry(
    plotNode ?? { ...panel, bounds: plot, children: [] },
  )

  const textsIn = raw.texts.filter((t) => centerIn(t.bounds, plot))
  const yTicks = textsIn
    .filter((t) => t.style?.textAlignHorizontal === 'RIGHT')
    .sort((a, z) => a.bounds.y - z.bounds.y)
    .map(toText)

  const centers = textsIn.filter(
    (t) => t.style?.textAlignHorizontal === 'CENTER',
  )
  const bottomCut = plot.y + plot.height * 0.7
  const xLabels = centers
    .filter((t) => t.bounds.y >= bottomCut)
    .sort((a, z) => a.bounds.x - z.bounds.x)
    .map(toText)
  const valueLabels = centers
    .filter((t) => t.bounds.y < bottomCut)
    .sort((a, z) => a.bounds.x - z.bounds.x)
    .map(toText)

  const barNodes = (plotNode?.children ?? [])
    .filter((c) => c.name.startsWith('bar-'))
    .sort((a, z) => a.bounds.x - z.bounds.x)

  const highlightColor = (list: PanelText[]) =>
    list.find((t) => (t.style?.fontWeight ?? 400) > 400)?.color

  const common: ChartCommon = {
    id: panel.id,
    bounds: panel.bounds,
    fill: nodeColor(panel),
    radius: panel.cornerRadius,
    title: titleNode ? fromNode(titleNode) : fromNode(panel),
    icon: titleNode ? resolveIcon(fromNode(titleNode)) : undefined,
    plot,
    gridYs,
    axisX,
    right,
    yTicks,
    xLabels,
    valueLabels,
    markers: markersOf(plotNode),
    accent: undefined,
  }

  if (barNodes.length) {
    const bars = barNodes.map((barNode, i) => ({
      bounds: barNode.bounds,
      color: nodeColor(barNode),
      label:
        xLabels[i]?.characters ??
        barNode.name.replace(/^bar-/, ''),
    }))
    return {
      kind: 'bar',
      ...common,
      accent: nodeColor(barNodes[0]),
      bars,
    }
  }

  return {
    kind: 'line',
    ...common,
    accent: highlightColor(xLabels) ?? highlightColor(valueLabels),
  }
}

function buildMetrics(): MetricsPanel | null {
  const boxes = (raw.controls ?? []).filter((c) => c.role === 'metric')
  if (!boxes.length) return null

  const tiles = boxes
    .slice()
    .sort((a, z) => a.bounds.y - z.bounds.y || a.bounds.x - z.bounds.x)
    .map((box) => {
      const boxNode = NODES.find(
        (n) =>
          n.type === 'RECTANGLE' &&
          Math.abs(n.bounds.x - box.bounds.x) < 1.5 &&
          Math.abs(n.bounds.y - box.bounds.y) < 1.5 &&
          Math.abs(n.bounds.width - box.bounds.width) < 1.5,
      )
      const inside = raw.texts.filter((t) => centerIn(t.bounds, box.bounds)).map(toText)
      const value =
        inside.find((t) => (t.style?.fontSize ?? 0) >= 20) ??
        inside[0] ?? { characters: '', bounds: box.bounds }
      const label =
        inside.find((t) => (t.style?.fontSize ?? 0) < 20) ??
        inside[inside.length - 1] ?? { characters: '', bounds: box.bounds }
      return {
        bounds: box.bounds,
        fill: nodeColor(boxNode),
        radius: boxNode?.cornerRadius,
        value,
        label,
      }
    })

  const usedTitles = new Set(
    chartNodes
      .map((p) => (p.children ?? []).find((c) => c.name === 'title')?.id)
      .filter(Boolean) as string[],
  )
  const titleText = raw.texts
    .filter(
      (t) =>
        t.style?.fontSize === 14 &&
        t.style?.fontWeight === 500 &&
        t.bounds.x >= CONTENT_X &&
        t.bounds.y >= CONTENT_Y &&
        !(t.nodeId && usedTitles.has(t.nodeId)),
    )
    .sort((a, z) => a.bounds.y - z.bounds.y)[0]

  return {
    kind: 'metrics',
    id: 'metrics',
    bounds: unionBounds([
      ...tiles.map((t) => t.bounds),
      titleText !== undefined
        ? {
            x: titleText.bounds.x,
            y: titleText.bounds.y,
            width: titleText.bounds.width,
            height: titleText.bounds.height,
          }
        : boxes[0].bounds,
    ]),
    title:
      titleText !== undefined
        ? toText(titleText)
        : { characters: '', bounds: { ...boxes[0].bounds, height: 20 } },
    icon: titleText !== undefined ? resolveIcon(toText(titleText)) : undefined,
    tiles,
  }
}

const charts = chartNodes
  .slice()
  .sort((a, z) => a.bounds.y - z.bounds.y || a.bounds.x - z.bounds.x)
  .map(buildChart)

const metrics = buildMetrics()

export const homePanels: HomePanel[] = metrics ? [...charts, metrics] : charts

export function panelsOfKind(kind: 'line'): LinePanel[]
export function panelsOfKind(kind: 'bar'): BarPanel[]
export function panelsOfKind(kind: 'metrics'): MetricsPanel[]
export function panelsOfKind(kind: HomePanel['kind']): HomePanel[] {
  return homePanels.filter((p) => p.kind === kind)
}

/**
 * Fluid stat grid, read off the IR card boxes so the constants stay in sync:
 * gutter (main area → first card), gap (card → card) and the IR column width.
 * `gutter*2 + gap` is the horizontal chrome the columns must give back, so a
 * fluid column reproduces the IR width exactly at the IR viewport.
 */
export const statGrid = (() => {
  const chartBounds = charts.map((p) => p.bounds)
  const lefts = [...new Set(chartBounds.map((b) => b.x))].sort((a, z) => a - z)
  const gutter = lefts[0] - CONTENT_X
  const colWidth = chartBounds[0].width
  const gap = lefts.length > 1 ? lefts[1] - (lefts[0] + colWidth) : 0
  return { gutter, gap, colWidth }
})()

/** CSS length for one fluid column, and the absolute x of column `col`. */
export const statColWidth = `calc((100% - ${statGrid.gutter * 2 + statGrid.gap}px) / 2)`

export function statColLeft(col: number, inset = 0): string {
  const base =
    col === 0
      ? `${statGrid.gutter}px`
      : `calc(${statGrid.gutter}px + ${statColWidth} + ${statGrid.gap}px)`
  return inset ? `calc(${base} + ${inset}px)` : base
}

/** Which fluid column a card sits in, plus its inset from that column's edges. */
export function statCardSlot(
  bounds: IrBounds,
  origin: { x: number; y: number },
): { col: number; inset: number } {
  const rel = bounds.x - origin.x - statGrid.gutter
  const col = Math.max(0, Math.round(rel / (statGrid.colWidth + statGrid.gap)))
  return { col, inset: rel - col * (statGrid.colWidth + statGrid.gap) }
}

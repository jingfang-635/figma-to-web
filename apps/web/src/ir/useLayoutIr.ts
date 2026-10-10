import home from '../generated/layout/home.json'
import organization from '../generated/layout/organization.json'
import departments from '../generated/layout/departments.json'
import doctors from '../generated/layout/doctors.json'
import schedules from '../generated/layout/schedules.json'
import departmentCreate from '../generated/layout/department-create.json'
import doctorCreate from '../generated/layout/doctor-create.json'
import scheduleCreate from '../generated/layout/schedule-create.json'
import scheduleBatch from '../generated/layout/schedule-batch.json'
import type { IrBounds, IrTextStyle } from './geometry'

export type IrText = {
  characters: string
  bounds: IrBounds
  style?: IrTextStyle & { fills?: { color?: string }[] }
  nodeId?: string
}

export type IrControl = {
  nodeId: string
  role: string
  bounds: IrBounds
  cornerRadius?: number
}

/** Icon slot. `symbol.source === 'unresolved'` means Figma never named the
 * glyph — the slot still exists and must not be silently dropped. */
export type IrIcon = {
  nodeId: string
  exportable: boolean
  bounds: IrBounds
  color?: string
  symbol: { source: string; name?: string; role: string }
}

/**
 * A box the prototype drew as a plain rectangle: calendar frame, weekday band,
 * day cell, legend swatch, today badge, segmented-control track. Enumerated by
 * scripts/ir-cells.mjs. `sample` marks live content drawn on top (a chip row)
 * that carries paints and metrics but is never asserted.
 */
export type IrCell = {
  nodeId: string
  role: string
  bounds: IrBounds
  fill?: string
  sample?: boolean
  hostNodeId?: string
  accent?: string
}

export type LayoutIr = {
  screenId: string
  bounds: IrBounds
  controls: IrControl[]
  texts: IrText[]
  icons: IrIcon[]
  cells?: IrCell[]
  tree?: IrNode
}

/** Raw IR tree node. Carries what the flattened lists drop: fills and radii. */
export type IrNode = {
  id: string
  name?: string
  type: string
  bounds: IrBounds
  fills?: { type?: string; color?: string }[]
  strokes?: { type?: string; color?: string }[]
  strokeWeight?: number
  cornerRadius?: number
  children?: IrNode[]
}

const MAP: Record<string, LayoutIr> = {
  home: home as LayoutIr,
  organization: organization as LayoutIr,
  departments: departments as LayoutIr,
  doctors: doctors as LayoutIr,
  schedules: schedules as LayoutIr,
  'department-create': departmentCreate as LayoutIr,
  'doctor-create': doctorCreate as LayoutIr,
  'schedule-create': scheduleCreate as LayoutIr,
  'schedule-batch': scheduleBatch as LayoutIr,
}

export function getLayoutIr(screenId: string): LayoutIr {
  const ir = MAP[screenId]
  if (!ir) {
    throw new Error(`Missing Layout IR for screenId=${screenId}`)
  }
  return ir
}

/** Content-area texts (right of sidebar) for full-page frames. */
export function contentTexts(ir: LayoutIr, sidebarWidth = 220): IrText[] {
  const isModal =
    ir.screenId.includes('create') || ir.screenId.includes('batch')
  if (isModal) return ir.texts
  return ir.texts.filter((t) => t.bounds.x >= sidebarWidth)
}

export function textAt(
  texts: IrText[],
  x: number,
  y: number,
  tol = 8,
): string {
  const hit = texts.find(
    (t) => Math.abs(t.bounds.x - x) <= tol && Math.abs(t.bounds.y - y) <= tol,
  )
  return hit?.characters ?? ''
}

export function textNodeAt(
  texts: IrText[],
  x: number,
  y: number,
  tol = 8,
): IrText | undefined {
  return texts.find(
    (t) => Math.abs(t.bounds.x - x) <= tol && Math.abs(t.bounds.y - y) <= tol,
  )
}

export function controlByRole(
  ir: LayoutIr,
  role: string,
  index = 0,
): IrControl | undefined {
  return ir.controls.filter((c) => c.role === role)[index]
}

/** Every node of the IR tree, document order. */
export function treeNodes(ir: LayoutIr): IrNode[] {
  const out: IrNode[] = []
  const walk = (n?: IrNode) => {
    if (!n) return
    out.push(n)
    for (const c of n.children ?? []) walk(c)
  }
  walk(ir.tree)
  return out
}

export function nodeById(ir: LayoutIr, id?: string): IrNode | undefined {
  if (!id) return undefined
  return treeNodes(ir).find((n) => n.id === id)
}

/** Solid fill colour of a node — the IR keeps colour on the tree, not on the
 * flattened text list. */
export function fillColor(node?: IrNode): string | undefined {
  return node?.fills?.find((f) => f.color)?.color
}

/** Rect nodes whose box centre falls inside `bounds` (containers, row bands,
 * separators) — geometry the flattened lists do not expose. */
export function rectNodesIn(ir: LayoutIr, bounds: IrBounds): IrNode[] {
  const inside = (b: IrBounds) => {
    const cx = b.x + b.width / 2
    const cy = b.y + b.height / 2
    return (
      cx >= bounds.x &&
      cx <= bounds.x + bounds.width &&
      cy >= bounds.y &&
      cy <= bounds.y + bounds.height
    )
  }
  return treeNodes(ir)
    .filter((n) => n.type === 'RECTANGLE' && inside(n.bounds))
    .sort((a, z) => a.bounds.y - z.bounds.y || a.bounds.x - z.bounds.x)
}

/** Smallest filled rect that contains `probe` — the panel a group of controls
 * is drawn on, without naming that panel in page code. */
export function panelAround(ir: LayoutIr, probe: IrBounds): IrNode | undefined {
  const contains = (outer: IrBounds) =>
    outer.x <= probe.x &&
    outer.y <= probe.y &&
    outer.x + outer.width >= probe.x + probe.width &&
    outer.y + outer.height >= probe.y + probe.height
  return treeNodes(ir)
    .filter(
      (n) => n.type === 'RECTANGLE' && fillColor(n) && contains(n.bounds),
    )
    .sort(
      (a, z) =>
        a.bounds.width * a.bounds.height - z.bounds.width * z.bounds.height,
    )[0]
}

/** Flattened texts whose box centre sits inside `bounds`. */
export function textsInBounds(texts: IrText[], bounds: IrBounds): IrText[] {
  return texts
    .filter((t) => {
      const cx = t.bounds.x + t.bounds.width / 2
      const cy = t.bounds.y + t.bounds.height / 2
      return (
        cx >= bounds.x &&
        cx <= bounds.x + bounds.width &&
        cy >= bounds.y &&
        cy <= bounds.y + bounds.height
      )
    })
    .sort((a, z) => a.bounds.y - z.bounds.y || a.bounds.x - z.bounds.x)
}

export function controlsByRole(ir: LayoutIr, role: string): IrControl[] {
  return ir.controls.filter((c) => c.role === role)
}

function inReadingOrder(a: IrIcon, z: IrIcon): number {
  return a.bounds.y - z.bounds.y || a.bounds.x - z.bounds.x
}

/** Icon slots of one role, reading order — matches the IR enumeration order. */
export function iconsByRole(ir: LayoutIr, role: string): IrIcon[] {
  return (ir.icons ?? []).filter((i) => i.symbol?.role === role).sort(inReadingOrder)
}

/** Slots whose symbol is known; a slot with no symbol renders as nothing. */
export function namedIconsByRole(ir: LayoutIr, role: string): IrIcon[] {
  return iconsByRole(ir, role).filter(
    (i) => i.symbol?.source !== 'unresolved' && Boolean(i.symbol?.name),
  )
}

/** Icon slots whose box sits inside a control box — a caret inside its select,
 * the upload glyph inside the upload area. Resolved structurally so a page
 * never keeps its own slot table. */
export function iconSlotsInBounds(ir: LayoutIr, bounds: IrBounds): IrIcon[] {
  return (ir.icons ?? []).filter((i) => {
    const cx = i.bounds.x + i.bounds.width / 2
    const cy = i.bounds.y + i.bounds.height / 2
    return (
      cx >= bounds.x &&
      cx <= bounds.x + bounds.width &&
      cy >= bounds.y &&
      cy <= bounds.y + bounds.height
    )
  })
}

/** Nearest slot to the left of a text box, on the same band (title leading icon). */
export function iconLeadingText(
  ir: LayoutIr,
  textBounds: IrBounds,
  gap = 26,
): IrIcon | undefined {
  const tcy = textBounds.y + textBounds.height / 2
  return (ir.icons ?? [])
    .filter((i) => {
      const right = i.bounds.x + i.bounds.width
      const cy = i.bounds.y + i.bounds.height / 2
      return (
        right <= textBounds.x + 2 &&
        textBounds.x - right < gap &&
        Math.abs(cy - tcy) < 14
      )
    })
    .sort((a, z) => z.bounds.x - a.bounds.x)[0]
}

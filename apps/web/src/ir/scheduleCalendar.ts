import type { IrBounds } from './geometry'
import type { IrText, LayoutIr } from './useLayoutIr'
import { fillColor, nodeById } from './useLayoutIr'

/**
 * A box the prototype drew as a plain rectangle: calendar frame, weekday band,
 * day cell, legend swatch, today badge, segmented-control track. Enumerated by
 * scripts/ir-cells.mjs into Layout IR `cells[]`.
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

export type CalendarColumn = {
  x: number
  width: number
  label?: IrText
  labelColor?: string
  labelFontSize?: number
  labelFontWeight?: number
}

export type CalendarLegendEntry = {
  cell: IrCell
  accent: string
  label?: IrText
  labelColor?: string
  labelFontSize?: number
}

export type CalendarToggleLabel = {
  text: IrText
  color?: string
  fontSize?: number
  fontWeight?: number
}

export type CalendarModel = {
  frame: IrCell
  /** Band + body row tops and heights, top to bottom. */
  rows: { y: number; height: number }[]
  headBand: { y: number; height: number }
  headFill?: string
  /** IR node ids in DOM order, so a captured cell can be traced to the IR. */
  headNodeIds: string[]
  bodyNodeIds: string[]
  bodyTop?: number
  bodyHeight: number
  columns: CalendarColumn[]
  columnGap?: number
  fills: {
    regular?: string
    weekend?: string
    outside?: string
    today?: string
  }
  dayNumber: {
    offsetX?: number
    offsetY?: number
    fontSize?: number
    fontWeight?: number
    lineHeight?: number
    color?: string
    mutedColor?: string
    todayColor?: string
  }
  badge?: { size: number; offsetX: number; offsetY: number; fill?: string }
  chip: {
    height?: number
    radius?: number
    insetX?: number
    offsetY?: number
    gapY?: number
    paddingX?: number
    nameFontSize?: number
    nameFontWeight?: number
    countFontSize?: number
    countFontWeight?: number
    /** accent → tint, as recorded by a sample chip drawn in the prototype. */
    palette: { accent: string; tint?: string }[]
  }
  more?: {
    offsetX: number
    offsetY: number
    color?: string
    fontSize?: number
    fontWeight?: number
    template: string
  }
  legend: CalendarLegendEntry[]
  toggle?: {
    track: IrCell
    pill?: IrCell
    labels: CalendarToggleLabel[]
    activeIndex: number
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10

const inside = (outer: IrBounds, inner: IrBounds) =>
  outer.x <= inner.x + 0.01 &&
  outer.y <= inner.y + 0.01 &&
  outer.x + outer.width >= inner.x + inner.width - 0.01 &&
  outer.y + outer.height >= inner.y + inner.height - 0.01

const byYThenX = (a: { bounds: IrBounds }, z: { bounds: IrBounds }) =>
  a.bounds.y - z.bounds.y || a.bounds.x - z.bounds.x

const byX = (a: { bounds: IrBounds }, z: { bounds: IrBounds }) =>
  a.bounds.x - z.bounds.x

const textsInside = (texts: IrText[], box: IrBounds) =>
  texts.filter((t) => inside(box, t.bounds)).sort(byYThenX)

/** Most frequent value first; ties keep first-seen order. */
function byFrequency(values: string[]) {
  const counts = new Map<string, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts.entries()].sort((a, z) => z[1] - a[1]).map((e) => e[0])
}

/**
 * Derive everything the calendar needs from the Layout IR `cells[]`, `texts[]`
 * and tree. Nothing here is a literal: geometry, radii, paints and type styles
 * all come from the prototype, so the page cannot drift from it by re-typing a
 * number, and a design change only has to be re-extracted, not re-coded.
 *
 * The four cell paints are told apart by structure rather than by name: the
 * weekend paint is the one two whole columns agree on, the today paint is the
 * one under the badge, the regular paint is the most common, and whatever is
 * left is the adjacent-month paint. A paint the prototype never showed simply
 * stays undefined and falls back to the regular one.
 */
export function buildCalendarModel(ir: LayoutIr): CalendarModel | null {
  const cells = (ir.cells ?? []) as IrCell[]
  const of = (role: string) => cells.filter((c) => c.role === role)
  const frame = of('frame')[0]
  if (!frame) return null

  const heads = of('grid-head').sort(byYThenX)
  const body = of('grid-cell').sort(byYThenX)
  const swatches = of('legend-swatch').sort(byX)
  const badgeCell = of('badge')[0]
  const track = of('toggle-track')[0]
  const pill = of('toggle-pill')[0]
  const chips = of('grid-chip')
  const texts = ir.texts ?? []
  const styleOf = (t?: IrText) => (t ? nodeById(ir, t.nodeId) : undefined)

  const rows: { y: number; height: number }[] = []
  for (const c of [...heads, ...body]) {
    if (rows.some((r) => Math.abs(r.y - c.bounds.y) < 0.5)) continue
    rows.push({ y: c.bounds.y, height: c.bounds.height })
  }
  rows.sort((a, z) => a.y - z.y)
  const headBand = rows[0]
  const bodyRows = rows.slice(1)

  const colXs = [...new Set(heads.map((h) => h.bounds.x))].sort((a, z) => a - z)
  const columnGap =
    colXs.length > 1 && heads.length > 0
      ? round1(colXs[1] - colXs[0] - heads[0].bounds.width)
      : undefined
  const columns: CalendarColumn[] = colXs.map((x) => {
    const head = heads.find((h) => h.bounds.x === x)!
    const label = textsInside(texts, head.bounds)[0]
    return {
      x,
      width: head.bounds.width,
      label,
      labelColor: fillColor(styleOf(label)),
      labelFontSize: label?.style?.fontSize,
      labelFontWeight: label?.style?.fontWeight,
    }
  })

  // Weekend = the paint an entire column agrees on (it repeats on both outer
  // columns). Today = the paint under the badge.
  const perColumn = new Map<number, Set<string>>()
  for (const c of body) {
    if (!c.fill) continue
    const key = Math.round(c.bounds.x)
    if (!perColumn.has(key)) perColumn.set(key, new Set())
    perColumn.get(key)!.add(c.fill)
  }
  const agreed = new Map<string, number>()
  for (const fills of perColumn.values()) {
    if (fills.size !== 1) continue
    const fill = [...fills][0]
    agreed.set(fill, (agreed.get(fill) ?? 0) + 1)
  }
  const weekend = [...agreed.entries()].sort((a, z) => z[1] - a[1])[0]?.[0]

  const todayCell = badgeCell
    ? body.find((c) => inside(c.bounds, badgeCell.bounds))
    : undefined
  const today = todayCell?.fill

  const ordered = byFrequency(
    body.map((c) => c.fill).filter((f): f is string => Boolean(f)),
  )
  const regular = ordered.find((f) => f !== weekend && f !== today)
  const outside = ordered.find(
    (f) => f !== weekend && f !== today && f !== regular,
  )

  const kindOf = (c: IrCell) => {
    if (weekend && c.fill === weekend) return 'weekend'
    if (today && c.fill === today) return 'today'
    if (outside && c.fill === outside) return 'outside'
    return 'regular'
  }
  const sampleCell = (kind: string) =>
    kind === 'today' ? todayCell : body.find((c) => kindOf(c) === kind)
  const sampleText = (kind: string) => {
    const cell = sampleCell(kind)
    return cell ? textsInside(texts, cell.bounds)[0] : undefined
  }

  const numberCell = sampleCell('regular') ?? body[0]
  const numberText = sampleText('regular')

  const badge =
    badgeCell && todayCell
      ? {
          size: badgeCell.bounds.width,
          offsetX: round1(badgeCell.bounds.x - todayCell.bounds.x),
          offsetY: round1(badgeCell.bounds.y - todayCell.bounds.y),
          fill: badgeCell.fill,
        }
      : undefined

  // Chip metrics, read off the sample chips the prototype drew inside cells.
  const hosts = new Map(body.map((c) => [c.nodeId, c]))
  const pairs = chips
    .map((chip) => ({ chip, host: hosts.get(chip.hostNodeId ?? '') }))
    .filter((e): e is { chip: IrCell; host: IrCell } => Boolean(e.host))
    .sort((a, z) => byYThenX(a.chip, z.chip))
  const first = pairs[0]
  const insetX = first ? round1(first.chip.bounds.x - first.host.bounds.x) : undefined
  const offsetY = first ? round1(first.chip.bounds.y - first.host.bounds.y) : undefined
  const stack = first
    ? pairs.filter((e) => e.host.nodeId === first.host.nodeId)
    : []
  const gapY =
    stack.length > 1
      ? round1(
          stack[1].chip.bounds.y -
            (stack[0].chip.bounds.y + stack[0].chip.bounds.height),
        )
      : undefined
  const chipTexts = first ? textsInside(texts, first.chip.bounds) : []
  const [chipName, chipCount] = chipTexts

  const palette: { accent: string; tint?: string }[] = []
  for (const c of chips) {
    if (!c.accent || !c.fill) continue
    if (palette.some((p) => p.accent === c.accent)) continue
    palette.push({ accent: c.accent, tint: c.fill })
  }

  // The "and N more" line: the text inside the today cell that is neither the
  // day number nor part of a chip.
  const moreText = todayCell
    ? textsInside(texts, todayCell.bounds)
        .filter((t) => t.nodeId !== sampleText('today')?.nodeId)
        .filter((t) => !chips.some((ch) => inside(ch.bounds, t.bounds)))[0]
    : undefined
  const more = moreText && todayCell
    ? {
        offsetX: round1(moreText.bounds.x - todayCell.bounds.x),
        offsetY: round1(moreText.bounds.y - todayCell.bounds.y),
        color: fillColor(styleOf(moreText)),
        fontSize: moreText.style?.fontSize,
        fontWeight: moreText.style?.fontWeight,
        template: moreText.characters,
      }
    : undefined

  const legend: CalendarLegendEntry[] = swatches.map((s) => {
    const label = texts
      .filter(
        (t) =>
          t.bounds.x >= s.bounds.x + s.bounds.width &&
          t.bounds.x < s.bounds.x + 90 &&
          Math.abs(
            t.bounds.y + t.bounds.height / 2 - (s.bounds.y + s.bounds.height / 2),
          ) < 10,
      )
      .sort(byX)[0]
    return {
      cell: s,
      accent: s.fill ?? '',
      label,
      labelColor: fillColor(styleOf(label)),
      labelFontSize: label?.style?.fontSize,
    }
  })

  const toggle =
    track && pill
      ? (() => {
          const labels: CalendarToggleLabel[] = textsInside(texts, track.bounds).map(
            (t) => ({
              text: t,
              color: fillColor(styleOf(t)),
              fontSize: t.style?.fontSize,
              fontWeight: t.style?.fontWeight,
            }),
          )
          const activeIndex = labels.findIndex((l) =>
            inside(pill.bounds, l.text.bounds),
          )
          return {
            track,
            pill,
            labels,
            activeIndex: Math.max(0, activeIndex),
          }
        })()
      : undefined

  return {
    frame,
    rows,
    headBand,
    headFill: heads[0]?.fill,
    headNodeIds: colXs.map(
      (x) => heads.find((h) => h.bounds.x === x)?.nodeId ?? '',
    ),
    bodyNodeIds: body.map((c) => c.nodeId),
    bodyTop: bodyRows[0]?.y ?? undefined,
    bodyHeight: bodyRows.length
      ? bodyRows[bodyRows.length - 1].y +
        bodyRows[bodyRows.length - 1].height -
        bodyRows[0].y
      : 0,
    columns,
    columnGap,
    fills: {
      regular: regular ?? numberCell?.fill,
      weekend,
      outside,
      today,
    },
    dayNumber: {
      offsetX:
        numberText && numberCell
          ? round1(numberText.bounds.x - numberCell.bounds.x)
          : undefined,
      offsetY:
        numberText && numberCell
          ? round1(numberText.bounds.y - numberCell.bounds.y)
          : undefined,
      fontSize: numberText?.style?.fontSize,
      fontWeight: numberText?.style?.fontWeight,
      lineHeight: numberText?.style?.lineHeightPx,
      color: fillColor(styleOf(numberText)),
      mutedColor: fillColor(styleOf(sampleText('outside'))),
      todayColor: fillColor(styleOf(sampleText('today'))),
    },
    badge,
    chip: {
      height: first?.chip.bounds.height,
      radius: first ? nodeById(ir, first.chip.nodeId)?.cornerRadius : undefined,
      insetX,
      offsetY,
      gapY,
      paddingX:
        chipName && first
          ? round1(chipName.bounds.x - first.chip.bounds.x)
          : undefined,
      nameFontSize: chipName?.style?.fontSize,
      nameFontWeight: chipName?.style?.fontWeight,
      countFontSize: chipCount?.style?.fontSize,
      countFontWeight: chipCount?.style?.fontWeight,
      palette,
    },
    more,
    legend,
    toggle,
  }
}

/** The tint the prototype pairs with a legend colour, when it drew one. */
export function tintFor(model: CalendarModel, accent?: string) {
  if (!accent) return undefined
  return model.chip.palette.find((p) => p.accent === accent)?.tint
}

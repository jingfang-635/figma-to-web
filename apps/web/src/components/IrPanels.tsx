import { Fragment, type CSSProperties, type ReactNode } from 'react'
import type { IrBounds } from '../ir/geometry'
import { iconComponentFor } from '../ir/iconRegistry'
import {
  statCardSlot,
  statColLeft,
  statColWidth,
  type BarPanel,
  type LinePanel,
  type MetricsPanel,
  type PanelIcon,
  type PanelText,
  type PanelTextStyle,
} from '../ir/homePanels'

export type Origin = { x: number; y: number }

/**
 * antd glyphs sit inset inside their em box (~85% of it for these outline
 * icons), so grow the IR glyph box to match the prototype's drawn size.
 */
const ICON_GLYPH_FILL = 0.85

function pct(offset: number, total: number): string {
  return `${(offset / total) * 100}%`
}

/** Horizontal position as a fraction of `parent`, so it tracks the card width. */
function pctX(x: number, parent: IrBounds): string {
  return pct(x - parent.x, parent.width)
}

/**
 * Position a box inside a panel. Horizontal offsets/widths are fractions of the
 * panel width so cards stretch with the main area (viewport-fit 方案 C) while
 * still reproducing the IR exactly when the card is at its IR width.
 */
function boxIn(
  b: IrBounds,
  parent: IrBounds,
  extra?: CSSProperties,
): CSSProperties {
  return {
    position: 'absolute',
    left: pct(b.x - parent.x, parent.width),
    top: b.y - parent.y,
    width: pct(b.width, parent.width),
    height: b.height,
    boxSizing: 'border-box',
    ...extra,
  }
}

/** Absolute placement of a whole panel: fluid column + IR top/height. */
export function statPlacement(
  bounds: IrBounds,
  origin: Origin,
): CSSProperties {
  const { col, inset } = statCardSlot(bounds, origin)
  const widthInset = inset * 2
  return {
    position: 'absolute',
    left: statColLeft(col, inset),
    top: bounds.y - origin.y,
    width: widthInset
      ? `calc(${statColWidth} - ${widthInset}px)`
      : statColWidth,
    height: bounds.height,
    boxSizing: 'border-box',
  }
}

function TextBox({
  b,
  style,
  text,
  parent,
  color,
  className,
}: {
  b: IrBounds
  style?: PanelTextStyle
  text: string
  parent: IrBounds
  color?: string
  className?: string
}) {
  if (!text) return null
  const align = style?.textAlignHorizontal
    ? (style.textAlignHorizontal.toLowerCase() as CSSProperties['textAlign'])
    : undefined
  return (
    <span
      className={className}
      style={{
        ...boxIn(b, parent),
        margin: 0,
        padding: 0,
        display: 'block',
        whiteSpace: 'nowrap',
        fontFamily: style?.fontFamily
          ? `${style.fontFamily}, var(--font-family), sans-serif`
          : undefined,
        fontSize: style?.fontSize,
        fontWeight: style?.fontWeight,
        lineHeight: style?.lineHeightPx ? `${style.lineHeightPx}px` : undefined,
        color,
        textAlign: align,
      }}
    >
      {text}
    </span>
  )
}

function IconBox({
  icon,
  parent,
}: {
  icon: PanelIcon
  parent: IrBounds
}) {
  const Cmp = iconComponentFor(icon.name)
  if (!Cmp) return null
  const glyph = Math.max(icon.bounds.width, icon.bounds.height)
  return (
    <span
      data-ir-icon={icon.name}
      style={{
        ...boxIn(icon.bounds, parent),
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: glyph / ICON_GLYPH_FILL,
        lineHeight: 1,
        color: icon.color,
      }}
    >
      <Cmp />
    </span>
  )
}

function niceStep(raw: number): number {
  if (!(raw > 0)) return 1
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  const n = raw / p
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return m * p
}

function scaleMax(maxVal: number, intervals: number): number {
  const steps = Math.max(1, intervals)
  let step = Math.max(1, niceStep(Math.max(maxVal, 1) / steps))
  while (step * steps < maxVal) step *= 2
  return step * steps
}

/** Grid-line spacing drives the tick values, so the axis max must divide evenly. */
function axisIntervals(panel: LinePanel | BarPanel): number {
  return Math.max(1, panel.gridYs.length - 1)
}

function tickText(v: number): string {
  if (Math.abs(v - Math.round(v)) < 1e-6) return String(Math.round(v))
  return v.toFixed(1)
}

function PanelShell({
  bounds,
  place,
  fill,
  radius,
  title,
  icon,
  children,
}: {
  bounds: IrBounds
  place: CSSProperties
  fill?: string
  radius?: number
  title?: PanelText
  icon?: PanelIcon
  children: ReactNode
}) {
  return (
    <div
      data-ir-fluid="stat-grid"
      style={{
        ...place,
        background: fill,
        borderRadius: radius,
      }}
    >
      {icon ? <IconBox icon={icon} parent={bounds} /> : null}
      {title ? (
        <TextBox
          b={title.bounds}
          style={title.style}
          parent={bounds}
          text={title.characters}
          color={title.color}
        />
      ) : null}
      {children}
    </div>
  )
}

function gridLines(panel: LinePanel | BarPanel) {
  const parent = panel.bounds
  return panel.gridYs.map((g, i) => (
    <div
      key={`grid-${i}`}
      style={{
        ...boxIn(
          { x: panel.axisX, y: g.y, width: panel.right - panel.axisX, height: 1 },
          parent,
        ),
        background: g.color ?? 'var(--color-border)',
      }}
    />
  ))
}

function yTickLabels(panel: LinePanel | BarPanel, yMax: number) {
  const parent = panel.bounds
  const lines = panel.gridYs.length
  return panel.yTicks.map((t: PanelText, i) => {
    let gi = 0
    let best = Infinity
    for (let k = 0; k < panel.gridYs.length; k++) {
      const lineCenter = panel.gridYs[k].y + 7.5
      const d = Math.abs(lineCenter - (t.bounds.y + t.bounds.height / 2))
      if (d < best) {
        best = d
        gi = k
      }
    }
    const val = lines > 1 ? yMax * (1 - gi / (lines - 1)) : 0
    return (
      <TextBox
        key={`yt-${i}`}
        b={t.bounds}
        style={t.style}
        parent={parent}
        text={tickText(val)}
        color={t.color}
      />
    )
  })
}

export function IrLinePanel({
  panel,
  origin,
  values,
  labels,
  format,
  place,
}: {
  panel: LinePanel
  origin: Origin
  values: number[]
  labels?: string[]
  format?: (v: number) => string
  place?: CSSProperties
}) {
  const parent = panel.bounds
  const top = panel.gridYs[0]?.y ?? panel.plot.y
  const bottom =
    panel.gridYs[panel.gridYs.length - 1]?.y ?? panel.plot.y + panel.plot.height
  const yMax = scaleMax(Math.max(1, ...values), axisIntervals(panel))
  const yFor = (v: number) => bottom - (v / yMax) * (bottom - top)
  const accent = panel.accent ?? 'var(--color-primary)'
  const n = Math.min(values.length, panel.xLabels.length)
  const points = Array.from({ length: n }, (_, i) => ({
    x: panel.xLabels[i].bounds.x + panel.xLabels[i].bounds.width / 2,
    y: yFor(values[i]),
    value: values[i],
    i,
  }))
  const poly = points
    .map((p) => `${p.x - panel.plot.x},${p.y - panel.plot.y}`)
    .join(' ')

  return (
    <PanelShell
      bounds={parent}
      place={place ?? statPlacement(parent, origin)}
      fill={panel.fill}
      radius={panel.radius}
      title={panel.title}
      icon={panel.icon}
    >
      {gridLines(panel)}
      {yTickLabels(panel, yMax)}
      {points.length > 1 ? (
        <svg
          preserveAspectRatio="none"
          style={boxIn(panel.plot, parent)}
          viewBox={`0 0 ${panel.plot.width} ${panel.plot.height}`}
        >
          <polyline
            points={poly}
            fill="none"
            stroke={accent}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : null}
      {points.map((p) => {
        const marker = panel.markers[p.i]
        const r = (marker?.bounds.width ?? 9) / 2
        return (
          <div
            key={`pt-${p.i}`}
            style={{
              position: 'absolute',
              left: pctX(p.x, parent),
              top: p.y - parent.y - r,
              width: r * 2,
              height: r * 2,
              marginLeft: -r,
              borderRadius: '50%',
              background: marker?.fill ?? 'var(--color-bg-content)',
              border: `2px solid ${accent}`,
              boxSizing: 'border-box',
            }}
          />
        )
      })}
      {panel.xLabels.map((t, i) => {
        const isLast = i === panel.xLabels.length - 1
        const text = labels?.[i] ?? t.characters
        return (
          <TextBox
            key={`xl-${i}`}
            b={t.bounds}
            style={t.style}
            parent={parent}
            text={text}
            color={isLast ? accent : t.color}
          />
        )
      })}
      {points.map((p) => {
        const proto = panel.valueLabels[p.i]
        const w = proto?.bounds.width ?? 44
        const h = proto?.bounds.height ?? 15
        return (
          <TextBox
            key={`vl-${p.i}`}
            b={{ x: p.x - w / 2, y: p.y - h - 4, width: w, height: h }}
            style={proto?.style}
            parent={parent}
            text={format ? format(p.value) : String(p.value)}
            color={accent}
          />
        )
      })}
    </PanelShell>
  )
}

export function IrBarPanel({
  panel,
  origin,
  series,
  place,
}: {
  panel: BarPanel
  origin: Origin
  series: { label: string; value: number }[]
  place?: CSSProperties
}) {
  const parent = panel.bounds
  const top = panel.gridYs[0]?.y ?? panel.plot.y
  const bottom =
    panel.gridYs[panel.gridYs.length - 1]?.y ?? panel.plot.y + panel.plot.height
  const values = series.map((s) => s.value)
  const yMax = scaleMax(Math.max(1, ...values), axisIntervals(panel))
  const yFor = (v: number) => bottom - (v / yMax) * (bottom - top)
  const valueByLabel = new Map(series.map((s) => [s.label, s.value]))

  return (
    <PanelShell
      bounds={parent}
      place={place ?? statPlacement(parent, origin)}
      fill={panel.fill}
      radius={panel.radius}
      title={panel.title}
      icon={panel.icon}
    >
      {gridLines(panel)}
      {yTickLabels(panel, yMax)}
      {panel.bars.map((bar, i) => {
        const value = valueByLabel.get(bar.label) ?? 0
        const y = yFor(value)
        const height = Math.max(0, bottom - y)
        return (
          <div
            key={`bar-${i}`}
            style={boxIn(
              { ...bar.bounds, y, height },
              parent,
              { background: bar.color ?? panel.accent },
            )}
          />
        )
      })}
      {panel.xLabels.map((t, i) => (
        <TextBox
          key={`cat-${i}`}
          b={t.bounds}
          style={t.style}
          parent={parent}
          text={t.characters}
          color={t.color}
        />
      ))}
      {panel.bars.map((bar, i) => {
        const proto = panel.valueLabels[i]
        const value = valueByLabel.get(bar.label) ?? 0
        const y = yFor(value)
        const w = proto?.bounds.width ?? 40
        const h = proto?.bounds.height ?? 15
        return (
          <TextBox
            key={`bv-${i}`}
            b={{
              x: bar.bounds.x + bar.bounds.width / 2 - w / 2,
              y: y - h - 4,
              width: w,
              height: h,
            }}
            style={proto?.style}
            parent={parent}
            text={String(value)}
            color={proto?.color ?? panel.valueLabels[0]?.color}
          />
        )
      })}
    </PanelShell>
  )
}

export function IrMetricsPanel({
  panel,
  origin,
  values,
  place,
}: {
  panel: MetricsPanel
  origin: Origin
  values: string[]
  place?: CSSProperties
}) {
  const parent = panel.bounds
  return (
    <PanelShell
      bounds={parent}
      place={place ?? statPlacement(parent, origin)}
      title={panel.title}
      icon={panel.icon}
    >
      {panel.tiles.map((tile, i) => (
        <Fragment key={`tile-${i}`}>
          <div
            style={boxIn(tile.bounds, parent, {
              background: tile.fill,
              borderRadius: tile.radius,
            })}
          />
          <TextBox
            b={tile.value.bounds}
            style={tile.value.style}
            parent={parent}
            text={values[i] ?? ''}
            color={tile.value.color}
          />
          <TextBox
            b={tile.label.bounds}
            style={tile.label.style}
            parent={parent}
            text={tile.label.characters}
            color={tile.label.color}
          />
        </Fragment>
      ))}
    </PanelShell>
  )
}

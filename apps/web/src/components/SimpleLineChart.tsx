export type LineDatum = { label: string; value: number; display?: string }

/** Compact line chart matching dashboard trend panels (SVG, no extra deps). */
export function SimpleLineChart({
  data,
  color = 'var(--color-primary)',
  height = 160,
  formatValue,
}: {
  data: LineDatum[]
  color?: string
  height?: number
  formatValue?: (v: number) => string
}) {
  const w = 520
  const padX = 28
  const padTop = 28
  const padBottom = 28
  const plotH = height - padTop - padBottom
  const plotW = w - padX * 2
  const max = Math.max(1, ...data.map((d) => d.value))
  const min = 0
  const points = data.map((d, i) => {
    const x =
      data.length <= 1
        ? padX + plotW / 2
        : padX + (i / (data.length - 1)) * plotW
    const y = padTop + (1 - (d.value - min) / (max - min)) * plotH
    return { x, y, ...d }
  })
  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ')

  return (
    <svg
      className="line-chart"
      viewBox={`0 0 ${w} ${height}`}
      width="100%"
      height={height}
      role="img"
    >
      {[0.25, 0.5, 0.75, 1].map((t) => {
        const y = padTop + (1 - t) * plotH
        return (
          <line
            key={t}
            x1={padX}
            x2={w - padX}
            y1={y}
            y2={y}
            stroke="var(--color-border)"
            strokeWidth={1}
          />
        )
      })}
      {points.length > 1 ? (
        <polyline
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          points={polyline}
        />
      ) : null}
      {points.map((p) => (
        <g key={p.label}>
          <circle cx={p.x} cy={p.y} r={4.5} fill={color} />
          <text
            x={p.x}
            y={p.y - 10}
            textAnchor="middle"
            fontSize={11}
            fill="var(--color-text-secondary)"
          >
            {p.display ??
              (formatValue ? formatValue(p.value) : String(p.value))}
          </text>
          <text
            x={p.x}
            y={height - 8}
            textAnchor="middle"
            fontSize={11}
            fill="var(--color-text-tertiary)"
          >
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  )
}

export type BarDatum = { label: string; value: number; display?: string }

export function SimpleBarChart({
  title,
  data,
  formatValue,
  color = 'var(--color-primary)',
}: {
  title?: string
  data: BarDatum[]
  formatValue?: (v: number) => string
  color?: string
}) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="bar-chart" style={{ width: '100%' }}>
      {title ? <h3 className="chart-panel__title">{title}</h3> : null}
      {data.map((d) => (
        <div className="bar-chart__col" key={d.label}>
          <span className="bar-chart__value">
            {d.display ??
              (formatValue ? formatValue(d.value) : String(d.value))}
          </span>
          <div
            className="bar-chart__bar"
            style={{
              height: `${Math.max(4, (d.value / max) * 120)}px`,
              background: `linear-gradient(180deg, ${color} 0%, color-mix(in srgb, ${color} 70%, white) 100%)`,
            }}
          />
          <span className="bar-chart__label">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

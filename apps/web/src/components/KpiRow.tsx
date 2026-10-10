export type KpiItem = { label: string; value: string }

export function KpiRow({ items }: { items: KpiItem[] }) {
  return (
    <div className="kpi-row">
      {items.map((item) => (
        <div className="kpi-card" key={item.label} data-kpi={item.label}>
          <p className="kpi-card__label">{item.label}</p>
          <p className="kpi-card__value">{item.value}</p>
        </div>
      ))}
    </div>
  )
}

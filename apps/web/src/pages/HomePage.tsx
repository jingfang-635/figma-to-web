import { useEffect, useMemo, useState } from 'react'
import { Spin, message } from 'antd'
import { AuthExpiredError, apiFetch } from '../api/client'
import { IrCanvas } from '../components/IrCanvas'
import { IrText } from '../components/IrText'
import { IrBarPanel, IrLinePanel, IrMetricsPanel } from '../components/IrPanels'
import { getIrOrigin } from '../ir/geometry'
import { panelsOfKind } from '../ir/homePanels'
import { contentTexts, controlsByRole, getLayoutIr, textNodeAt } from '../ir/useLayoutIr'

type Stats = {
  enabledDepartmentCount: number
  activeDoctorCount: number
  monthAppointmentCount: number
  monthRevenue: number
}

type Appointment = {
  id: number
  doctorId: number
  date: string
  status: string
  amount?: number
}

type Doctor = { id: number; departmentId: number; name: string }
type Department = { id: number; name: string }

function formatMoney(n: number): string {
  return `¥${Number(n || 0).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

export function HomePage() {
  const ir = getLayoutIr('home')
  const texts = contentTexts(ir)
  const origin = getIrOrigin()
  const title = textNodeAt(texts, 244, 72)
  const subtitle = textNodeAt(texts, 244, 106)
  const kpiControls = controlsByRole(ir, 'kpi')
  const kpiLabels = [
    textNodeAt(texts, 268, 163),
    textNodeAt(texts, 565, 163),
    textNodeAt(texts, 862, 163),
    textNodeAt(texts, 1159, 163),
  ]

  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<Stats | null>(null)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [departments, setDepartments] = useState<Department[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [s, a, d, dep] = await Promise.all([
          apiFetch<Stats>('/api/stats'),
          apiFetch<Appointment[]>('/api/appointments'),
          apiFetch<Doctor[]>('/api/doctors'),
          apiFetch<Department[]>('/api/departments'),
        ])
        if (!cancelled) {
          setStats(s)
          setAppointments(a)
          setDoctors(d)
          setDepartments(dep)
        }
      } catch (e) {
        // An expired session already routes to /login; anything else must not
        // be mistaken for "this account simply has no records".
        if (!cancelled && !(e instanceof AuthExpiredError)) {
          message.error(e instanceof Error ? e.message : String(e))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const rates = useMemo(() => {
    const month = new Date().toISOString().slice(0, 7)
    const monthAppts = appointments.filter((a) => a.date.startsWith(month))
    const total = monthAppts.length || stats?.monthAppointmentCount || 0
    const completed = monthAppts.filter((a) => a.status === 'COMPLETED').length
    const noShow = monthAppts.filter(
      (a) => a.status === 'NO_SHOW' || a.status === 'CANCELLED',
    ).length
    const visitRate = total ? completed / total : 0
    const noShowRate = total ? noShow / total : 0
    return { visitRate, noShowRate }
  }, [appointments, stats])

  const last7 = useMemo(() => {
    const days: { date: string; label: string; count: number; revenue: number }[] =
      []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      const label =
        i === 0
          ? textNodeAt(texts, 715, 467)?.characters ?? '今日'
          : `${d.getMonth() + 1}/${d.getDate()}`
      const dayAppts = appointments.filter((a) => a.date === key)
      days.push({
        date: key,
        label,
        count: dayAppts.length,
        revenue: dayAppts.reduce((sum, a) => sum + Number(a.amount || 0), 0),
      })
    }
    return days
  }, [appointments, texts])

  const deptCounts = useMemo(() => {
    const since = new Date()
    since.setDate(since.getDate() - 6)
    const sinceKey = since.toISOString().slice(0, 10)
    const doctorMap = new Map(doctors.map((d) => [d.id, d]))
    const deptName = new Map(departments.map((d) => [d.id, d.name]))
    const counts = new Map<string, number>()
    for (const a of appointments) {
      if (a.date < sinceKey) continue
      const doc = doctorMap.get(a.doctorId)
      if (!doc) continue
      const name = deptName.get(doc.departmentId)
      if (!name) continue
      counts.set(name, (counts.get(name) || 0) + 1)
    }
    return counts
  }, [appointments, doctors, departments])

  const kpiValues = [
    String(stats?.monthAppointmentCount ?? 0),
    pct(rates.visitRate),
    pct(rates.noShowRate),
    formatMoney(Number(stats?.monthRevenue ?? 0)),
  ]

  const linePanels = panelsOfKind('line')
  const barPanels = panelsOfKind('bar')
  const metricsPanels = panelsOfKind('metrics')

  const xLabels = last7.map((d) => d.label)
  const lineValues: { values: number[]; format?: (v: number) => string }[] = [
    { values: last7.map((d) => d.count) },
    { values: last7.map((d) => d.revenue), format: formatMoney },
  ]
  const barSeries = barPanels[0]
    ? barPanels[0].bars.map((bar) => ({
        label: bar.label,
        value: deptCounts.get(bar.label) ?? 0,
      }))
    : []
  const metricValues = [
    pct(rates.visitRate),
    pct(rates.noShowRate),
    formatMoney(Number(stats?.monthRevenue ?? 0)),
    String(stats?.monthAppointmentCount ?? 0),
  ]

  return (
    <IrCanvas bounds={ir.bounds} screenId="home" template="dashboard-stats">
      {title ? <IrText node={title} /> : null}
      {subtitle ? (
        <IrText node={subtitle} style={{ color: 'var(--color-text-secondary)' }} />
      ) : null}

      {loading ? (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: 200,
            transform: 'translateX(-50%)',
          }}
        >
          <Spin />
        </div>
      ) : (
        <>
          <div
            className="fluid-kpi-row"
            data-ir-fluid="kpi-row"
            style={{
              position: 'absolute',
              left: (kpiControls[0]?.bounds.x ?? 244) - origin.x,
              right: 24,
              top: (kpiControls[0]?.bounds.y ?? 143) - origin.y,
              height: kpiControls[0]?.bounds.height ?? 92,
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gap: 16,
            }}
          >
            {kpiControls.map((kpi, i) => (
              <div
                key={kpi.nodeId}
                className="ir-surface"
                data-kpi={kpiLabels[i]?.characters}
                style={{ padding: '20px 24px', height: '100%', boxSizing: 'border-box' }}
              >
                {kpiLabels[i] ? (
                  <p
                    className="kpi-card__label"
                    style={{
                      margin: 0,
                      fontSize: kpiLabels[i]?.style?.fontSize,
                      lineHeight: `${kpiLabels[i]?.style?.lineHeightPx || 17}px`,
                    }}
                  >
                    {kpiLabels[i]?.characters}
                  </p>
                ) : null}
                <p
                  className="kpi-card__value"
                  style={{
                    margin: '2px 0 0',
                    fontSize: 28,
                    fontWeight: 500,
                    lineHeight: '28px',
                    color: 'var(--color-primary)',
                  }}
                >
                  {kpiValues[i]}
                </p>
              </div>
            ))}
          </div>

          {linePanels[0] ? (
            <IrLinePanel
              panel={linePanels[0]}
              origin={origin}
              values={lineValues[0]?.values ?? []}
              labels={xLabels}
              format={lineValues[0]?.format}
            />
          ) : null}
          {linePanels[1] ? (
            <IrLinePanel
              panel={linePanels[1]}
              origin={origin}
              values={lineValues[1]?.values ?? []}
              labels={xLabels}
              format={lineValues[1]?.format}
            />
          ) : null}
          {barPanels[0] ? (
            <IrBarPanel panel={barPanels[0]} origin={origin} series={barSeries} />
          ) : null}
          {metricsPanels[0] ? (
            <IrMetricsPanel
              panel={metricsPanels[0]}
              origin={origin}
              values={metricValues}
            />
          ) : null}
        </>
      )}
    </IrCanvas>
  )
}

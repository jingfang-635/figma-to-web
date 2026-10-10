import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  MedicineBoxOutlined,
  SmileOutlined,
  CrownOutlined,
  ExperimentOutlined,
  SkinOutlined,
  ScissorOutlined,
} from '@ant-design/icons'
import { Button, Popconfirm, Table, Tag, message } from 'antd'
import { AuthExpiredError, apiFetch } from '../api/client'
import { IrCanvas } from '../components/IrCanvas'
import { IrText } from '../components/IrText'
import { LiveTableBody } from '../components/LiveTableBody'
import { useLiveRegion } from '../components/useLiveRegion'
import { boxStyle, fluidBoxStyle } from '../ir/geometry'
import { tableMetrics, tableRowMetrics } from '../ir/tableMetrics'
import {
  contentTexts,
  controlByRole,
  controlsByRole,
  getLayoutIr,
  textAt,
  textNodeAt,
  type IrText as IrTextNode,
} from '../ir/useLayoutIr'
import { DepartmentCreateModal } from '../modals/DepartmentCreateModal'

type Stats = {
  enabledDepartmentCount: number
  activeDoctorCount: number
}

type Department = {
  id: number
  name: string
  icon: string
  description?: string
  sortOrder?: number
  status: string
}

type Doctor = { id: number; departmentId: number }
type Appointment = { id: number; date: string; status: string }

export function DepartmentsPage() {
  const ir = getLayoutIr('departments')
  const texts = contentTexts(ir)
  const statusEnabled = textAt(texts, 942.16, 386.5)
  const title = textNodeAt(texts, 244, 72)
  const subtitle = textNodeAt(texts, 244, 106)
  const kpiControls = controlsByRole(ir, 'kpi')
  const panel = controlByRole(ir, 'panel')
  const createBtn = controlByRole(ir, 'button-primary')
  const kpiLabels = [
    textNodeAt(texts, 268, 163),
    textNodeAt(texts, 565, 163),
    textNodeAt(texts, 862, 163),
    textNodeAt(texts, 1159, 163),
  ]
  const panelTitle = textNodeAt(texts, 264, 271)
  const panelDesc = textNodeAt(texts, 264, 295)
  const createLabel = textNodeAt(texts, 1319, 278)
  const colNode = {
    dept: textNodeAt(texts, 284, 337),
    doctorCount: textNodeAt(texts, 675.45, 337),
    sort: textNodeAt(texts, 830.08, 337),
    status: textNodeAt(texts, 942, 337),
    actions: textNodeAt(texts, 1321, 337),
    edit: textNodeAt(texts, 1288.91, 386.5),
    remove: textNodeAt(texts, 1352.23, 386.5),
  }
  const columnsLabels = {
    dept: colNode.dept?.characters ?? '',
    doctorCount: colNode.doctorCount?.characters ?? '',
    sort: colNode.sort?.characters ?? '',
    status: colNode.status?.characters ?? '',
    actions: colNode.actions?.characters ?? '',
    edit: colNode.edit?.characters ?? '',
    remove: colNode.remove?.characters ?? '',
  }
  // Column boxes come from the prototype's own header/action text boxes, so the
  // header labels land on their IR coordinates instead of antd's defaults.
  const metrics = tableMetrics(
    [
      colNode.dept,
      colNode.doctorCount,
      colNode.sort,
      colNode.status,
      colNode.actions,
    ],
    [colNode.edit, colNode.remove],
  )
  const actionGap =
    colNode.edit && colNode.remove
      ? colNode.remove.bounds.x -
        (colNode.edit.bounds.x + colNode.edit.bounds.width)
      : 12
  // Row band heights, the page size the prototype draws and the pager box are
  // design facts recovered from the IR, not AntD defaults: the default row is
  // taller than the prototype's, so a card pinned to the IR height would spill
  // its rows and its pager past its own bottom edge.
  const rowMetrics = tableRowMetrics(
    texts,
    [colNode.dept, colNode.doctorCount, colNode.sort, colNode.status, colNode.actions],
    [columnsLabels.edit, columnsLabels.remove],
  )
  const paginationItems = controlsByRole(ir, 'pagination-item')
  const paginationItem = paginationItems[0]
  // The "共 N 条记录" label shares the pager band and sits left of the boxes.
  const totalNode = paginationItem
    ? texts
        .filter(
          (t) =>
            Math.abs(t.bounds.y - paginationItem.bounds.y) <
              paginationItem.bounds.height &&
            t.bounds.x < paginationItem.bounds.x,
        )
        .sort((a, z) => z.bounds.x - a.bounds.x)[0]
    : undefined
  const headLabel = (t?: IrTextNode, center = false) => (
    <span
      style={{
        display: 'block',
        textAlign: center ? 'center' : undefined,
        fontSize: t?.style?.fontSize,
      }}
    >
      {t?.characters}
    </span>
  )

  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<Department | null>(null)
  const [rows, setRows] = useState<Department[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [todayOrders, setTodayOrders] = useState(0)
  const [loading, setLoading] = useState(true)
  const tableHostRef = useRef<HTMLDivElement>(null)
  // Only the row *count* in the pager is live data. Masking the whole pager
  // would hide the pager's own box/style/position — the boxes are drawn by the
  // prototype and must stay scoreable.
  useLiveRegion(tableHostRef, '.ant-pagination-total-text', 'pagination-total')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [deps, docs, s, appts] = await Promise.all([
        apiFetch<Department[]>('/api/departments'),
        apiFetch<Doctor[]>('/api/doctors'),
        apiFetch<Stats>('/api/stats'),
        apiFetch<Appointment[]>('/api/appointments'),
      ])
      setRows(deps)
      setDoctors(docs)
      setStats(s)
      const today = new Date().toISOString().slice(0, 10)
      setPendingCount(
        appts.filter((a) => a.date === today && a.status === 'BOOKED').length,
      )
      setTodayOrders(appts.filter((a) => a.date === today).length)
    } catch (e) {
      // An expired session already routes to /login; anything else must not be
      // mistaken for "this account simply has no records".
      if (!(e instanceof AuthExpiredError)) {
        message.error(e instanceof Error ? e.message : String(e))
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const doctorCountByDept = useMemo(() => {
    const map = new Map<number, number>()
    for (const d of doctors) {
      map.set(d.departmentId, (map.get(d.departmentId) || 0) + 1)
    }
    return map
  }, [doctors])

  const onDelete = async (id: number) => {
    await apiFetch(`/api/departments/${id}`, { method: 'DELETE' })
    message.success(columnsLabels.remove)
    void load()
  }

  const kpiValues = [
    String(stats?.enabledDepartmentCount ?? 0),
    String(stats?.activeDoctorCount ?? 0),
    String(pendingCount),
    String(todayOrders),
  ]

  const tableTop = (panel?.bounds.y ?? 255) + 70

  // Fluid right inset / button-follow offset derived from Layout IR, so the
  // panel and its primary button keep the prototype insets when widened.
  const panelRightPad = panel
    ? ir.bounds.width - (panel.bounds.x + panel.bounds.width)
    : 24
  const buttonFollowRight =
    panel && createBtn
      ? panelRightPad +
        (panel.bounds.x +
          panel.bounds.width -
          (createBtn.bounds.x + createBtn.bounds.width))
      : 24

  // The card holds the table so it can grow with its content, and the pager
  // sits on the card's bottom line. All four insets come from the IR: the pager
  // boxes' bottom edge is the card bottom minus the prototype's own gap, so
  // pinning the pager there lands it on the IR boxes.
  const panelInsets = panel
    ? {
        top: tableTop - panel.bounds.y,
        left: metrics ? metrics.left - panel.bounds.x : 0,
        right: metrics
          ? panel.bounds.x + panel.bounds.width - metrics.right
          : panelRightPad,
        bottom: paginationItem
          ? panel.bounds.y +
            panel.bounds.height -
            (paginationItem.bounds.y + paginationItem.bounds.height)
          : 0,
      }
    : { top: 0, left: 0, right: panelRightPad, bottom: 0 }

  // Row/header heights and the pager box size reach the stylesheet as custom
  // properties, so the CSS keeps no design literal of its own.
  const tableVars = {
    '--ir-head-h': rowMetrics ? `${rowMetrics.headerHeight}px` : undefined,
    '--ir-row-h': rowMetrics ? `${rowMetrics.rowHeight}px` : undefined,
    '--ir-pag-item': paginationItem
      ? `${paginationItem.bounds.width}px`
      : undefined,
    '--ir-pag-radius': paginationItem?.cornerRadius
      ? `${paginationItem.cornerRadius}px`
      : undefined,
  } as CSSProperties

  const deptIcon = (icon: string, name: string) => {
    const palette: Record<string, { bg: string; fg: string; node: ReactNode }> = {
      internal: { bg: '#e6f7ff', fg: '#1890ff', node: <MedicineBoxOutlined /> },
      pedia: { bg: '#fff7e6', fg: '#fa8c16', node: <SmileOutlined /> },
      gyn: { bg: '#fff0f6', fg: '#eb2f96', node: <CrownOutlined /> },
      dental: { bg: '#f6ffed', fg: '#52c41a', node: <ExperimentOutlined /> },
      derm: { bg: '#f9f0ff', fg: '#722ed1', node: <SkinOutlined /> },
      surgery: { bg: '#e6fffb', fg: '#13c2c2', node: <ScissorOutlined /> },
    }
    const p = palette[icon] || {
      bg: '#f5f5f5',
      fg: 'var(--color-text-secondary)',
      node: <MedicineBoxOutlined />,
    }
    return (
      <span className="dept-icon" style={{ background: p.bg, color: p.fg }} title={name}>
        {p.node}
      </span>
    )
  }

  // Rendered *inside* the card: the card grows with its content (approach B),
  // and the pager can be pinned to the card's bottom line by the stylesheet.
  const tableHost = (
    <div
      ref={tableHostRef}
      data-ir-fluid="table"
      style={{
        flex: '1 1 auto',
        minWidth: 0,
        marginTop: panelInsets.top,
        marginLeft: panelInsets.left,
        marginRight: panelInsets.right,
        marginBottom: panelInsets.bottom,
        ...tableVars,
      }}
    >
      <Table
        className="ir-table"
        rowKey="id"
        loading={loading}
        dataSource={rows}
        tableLayout="fixed"
        components={{ body: { wrapper: LiveTableBody } }}
        pagination={{
          pageSize: rowMetrics?.pageSize,
          showTotal: (t) =>
            totalNode
              ? totalNode.characters.replace(/\d+/, String(t))
              : String(t),
        }}
        size="middle"
        columns={[
          {
            title: headLabel(colNode.dept),
            key: 'dept',
            width: metrics?.leadingWidths[0],
            render: (_, row) => (
              <div className="dept-cell">
                {deptIcon(row.icon, row.name)}
                <div>
                  <div style={{ fontWeight: 500 }}>{row.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                    {row.description}
                  </div>
                </div>
              </div>
            ),
          },
          {
            title: columnsLabels.doctorCount,
            key: 'doctorCount',
            width: metrics?.leadingWidths[1],
            render: (_, row) => doctorCountByDept.get(row.id) || 0,
          },
          {
            title: headLabel(colNode.sort),
            dataIndex: 'sortOrder',
            width: metrics?.leadingWidths[2],
          },
          {
            title: headLabel(colNode.status),
            dataIndex: 'status',
            width: metrics?.leadingWidths[3],
            render: (v: string) => (
              <Tag color={v === 'ENABLED' ? 'success' : 'default'}>
                {v === 'ENABLED' ? statusEnabled : v}
              </Tag>
            ),
          },
          {
            title: headLabel(colNode.actions, true),
            key: 'actions',
            align: 'right',
            render: (_, row) => (
              <>
                <span
                  className="table-action"
                  style={{
                    fontSize: colNode.edit?.style?.fontSize,
                    marginRight: actionGap,
                  }}
                  onClick={() => {
                    setEditing(row)
                    setCreateOpen(true)
                  }}
                >
                  {columnsLabels.edit}
                </span>
                <Popconfirm
                  title={columnsLabels.remove}
                  onConfirm={() => void onDelete(row.id)}
                >
                  <span
                    className="table-action is-danger"
                    style={{ fontSize: colNode.remove?.style?.fontSize }}
                  >
                    {columnsLabels.remove}
                  </span>
                </Popconfirm>
              </>
            ),
          },
        ]}
      />
    </div>
  )

  return (
    <IrCanvas bounds={ir.bounds} screenId="departments" template="crud-list">
      {title ? <IrText node={title} /> : null}
      {subtitle ? (
        <IrText node={subtitle} style={{ color: 'var(--color-text-secondary)' }} />
      ) : null}

      {kpiControls.length ? (
        <div
          className="fluid-kpi-row"
          data-ir-fluid="kpi-row"
          style={fluidBoxStyle(
            {
              x: kpiControls[0].bounds.x,
              y: kpiControls[0].bounds.y,
              width: 0,
              height: kpiControls[0].bounds.height,
            },
            {
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gap: 16,
            },
          )}
        >
          {kpiControls.map((kpi, i) => (
            <div
              key={kpi.nodeId}
              className="ir-surface"
              data-kpi={kpiLabels[i]?.characters}
              style={{
                padding: '20px 24px',
                height: '100%',
                boxSizing: 'border-box',
              }}
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
      ) : null}

      {panel ? (
        <section
          className="ir-surface"
          data-ir-fluid="panel"
          style={{
            ...fluidBoxStyle(panel.bounds, undefined, panelRightPad),
            // Approach B: the card hugs its content but never drops below the
            // prototype's box, so a full page of rows keeps the IR height while
            // an extra row grows the card instead of spilling out of it.
            height: 'auto',
            minHeight: panel.bounds.height,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {tableHost}
        </section>
      ) : null}
      {panelTitle ? <IrText node={panelTitle} /> : null}
      {panelDesc ? (
        <IrText node={panelDesc} style={{ color: 'var(--color-text-tertiary)' }} />
      ) : null}
      {createBtn ? (
        <Button
          type="primary"
          className="ir-btn"
          style={{
            ...boxStyle(createBtn.bounds, {
              fontSize: createLabel?.style?.fontSize,
            }),
            left: 'auto',
            right: buttonFollowRight,
          }}
          onClick={() => {
            setEditing(null)
            setCreateOpen(true)
          }}
        >
          {createLabel?.characters}
        </Button>
      ) : null}

      <DepartmentCreateModal
        open={createOpen}
        initial={editing}
        onClose={() => {
          setCreateOpen(false)
          setEditing(null)
        }}
        onSaved={() => {
          setCreateOpen(false)
          setEditing(null)
          void load()
        }}
      />
    </IrCanvas>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Avatar, Button, Popconfirm, Table, Tag, message } from 'antd'
import { AuthExpiredError, apiFetch } from '../api/client'
import { IrCanvas } from '../components/IrCanvas'
import { IrIconSlot } from '../components/IrIconSlot'
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
  iconSlotsInBounds,
  textAt,
  textNodeAt,
  type IrText as IrTextNode,
} from '../ir/useLayoutIr'
import { DoctorCreateModal } from '../modals/DoctorCreateModal'

type Stats = {
  enabledDepartmentCount: number
  activeDoctorCount: number
}

type Department = { id: number; name: string }
type Doctor = {
  id: number
  avatar?: string
  name: string
  title: string
  departmentId: number
  fee: number
  yearsExperience?: number
  rating?: number
  specialty?: string
  status: string
}
type Appointment = { id: number; date: string; status: string }

export function DoctorsPage() {
  const ir = getLayoutIr('doctors')
  const texts = contentTexts(ir)
  const statusActive = textAt(texts, 1118.92, 451.5)
  const title = textNodeAt(texts, 244, 72)
  const subtitle = textNodeAt(texts, 244, 106)
  const kpiControls = controlsByRole(ir, 'kpi')
  const panel = controlByRole(ir, 'panel')
  const createBtn = controlByRole(ir, 'button-primary')
  const inputs = controlsByRole(ir, 'input')
  const kpiLabels = [
    textNodeAt(texts, 268, 163),
    textNodeAt(texts, 565, 163),
    textNodeAt(texts, 862, 163),
    textNodeAt(texts, 1159, 163),
  ]
  const panelTitle = textNodeAt(texts, 264, 271)
  const panelDesc = textNodeAt(texts, 264, 295)
  const createLabel = textNodeAt(texts, 1319, 278)
  const searchPlaceholder = textAt(texts, 276, 350)
  const allDeptLabel = textAt(texts, 568, 350)
  const colNode = {
    doctor: textNodeAt(texts, 284, 402),
    dept: textNodeAt(texts, 498.83, 402),
    specialty: textNodeAt(texts, 603.97, 402),
    exp: textNodeAt(texts, 910.61, 402),
    fee: textNodeAt(texts, 1029.05, 402),
    status: textNodeAt(texts, 1109.92, 402),
    actions: textNodeAt(texts, 1321, 402),
    edit: textNodeAt(texts, 1288.91, 451.5),
    remove: textNodeAt(texts, 1352.23, 451.5),
  }
  const col = {
    doctor: colNode.doctor?.characters ?? '',
    dept: colNode.dept?.characters ?? '',
    specialty: colNode.specialty?.characters ?? '',
    exp: colNode.exp?.characters ?? '',
    fee: colNode.fee?.characters ?? '',
    status: colNode.status?.characters ?? '',
    actions: colNode.actions?.characters ?? '',
    edit: colNode.edit?.characters ?? '',
    remove: colNode.remove?.characters ?? '',
  }
  // Column boxes come from the prototype's own header/action text boxes, so the
  // header labels land on their IR coordinates instead of antd's defaults.
  const metrics = tableMetrics(
    [
      colNode.doctor,
      colNode.dept,
      colNode.specialty,
      colNode.exp,
      colNode.fee,
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
    [
      colNode.doctor,
      colNode.dept,
      colNode.specialty,
      colNode.exp,
      colNode.fee,
      colNode.status,
      colNode.actions,
    ],
    [col.edit, col.remove],
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
  const [editing, setEditing] = useState<Doctor | null>(null)
  const [rows, setRows] = useState<Doctor[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [todayOrders, setTodayOrders] = useState(0)
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [deptFilter, setDeptFilter] = useState<number | 'all'>('all')
  const tableHostRef = useRef<HTMLDivElement>(null)
  // Only the row *count* in the pager is live data. Masking the whole pager
  // would hide the pager's own box/style/position — the boxes are drawn by the
  // prototype and must stay scoreable.
  useLiveRegion(tableHostRef, '.ant-pagination-total-text', 'pagination-total')
  // The filter select's caret is an icon slot: Figma drew it, the browser draws
  // a native one, so the slot's glyph is rendered at the slot's own box.
  const deptCaret = inputs[1]
    ? iconSlotsInBounds(ir, inputs[1].bounds)[0]
    : undefined

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [docs, deps, s, appts] = await Promise.all([
        apiFetch<Doctor[]>('/api/doctors'),
        apiFetch<Department[]>('/api/departments'),
        apiFetch<Stats>('/api/stats'),
        apiFetch<Appointment[]>('/api/appointments'),
      ])
      setRows(docs)
      setDepartments(deps)
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

  const deptName = useMemo(() => {
    const m = new Map(departments.map((d) => [d.id, d.name]))
    return (id: number) => m.get(id) || String(id)
  }, [departments])

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return rows.filter((r) => {
      if (deptFilter !== 'all' && r.departmentId !== deptFilter) return false
      if (!kw) return true
      return (
        r.name.toLowerCase().includes(kw) ||
        deptName(r.departmentId).toLowerCase().includes(kw) ||
        (r.specialty || '').toLowerCase().includes(kw)
      )
    })
  }, [rows, keyword, deptFilter, deptName])

  const onDelete = async (id: number) => {
    await apiFetch(`/api/doctors/${id}`, { method: 'DELETE' })
    message.success(col.remove)
    void load()
  }

  const kpiValues = [
    String(stats?.enabledDepartmentCount ?? 0),
    String(stats?.activeDoctorCount ?? 0),
    String(pendingCount),
    String(todayOrders),
  ]

  const tableTop = (panel?.bounds.y ?? 255) + 130

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
        dataSource={filtered}
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
            title: headLabel(colNode.doctor),
            key: 'doctor',
            width: metrics?.leadingWidths[0],
            render: (_, row) => (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Avatar src={row.avatar || undefined}>
                  {row.name.slice(0, 1)}
                </Avatar>
                <div>
                  <div style={{ fontWeight: 500 }}>{row.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                    {row.title}
                  </div>
                </div>
              </div>
            ),
          },
          {
            title: headLabel(colNode.dept),
            key: 'dept',
            width: metrics?.leadingWidths[1],
            render: (_, row) => deptName(row.departmentId),
          },
          {
            title: headLabel(colNode.specialty),
            dataIndex: 'specialty',
            width: metrics?.leadingWidths[2],
            ellipsis: true,
          },
          {
            title: headLabel(colNode.exp),
            key: 'exp',
            width: metrics?.leadingWidths[3],
            render: (_, row) =>
              `${row.yearsExperience ?? '-'}年 / ${row.rating ?? '-'}%`,
          },
          {
            title: headLabel(colNode.fee),
            dataIndex: 'fee',
            width: metrics?.leadingWidths[4],
            render: (v: number) => `¥${v}`,
          },
          {
            title: headLabel(colNode.status),
            dataIndex: 'status',
            width: metrics?.leadingWidths[5],
            render: (v: string) => (
              <Tag color={v === 'ACTIVE' ? 'processing' : 'default'}>
                {v === 'ACTIVE' ? statusActive : v}
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
                  {col.edit}
                </span>
                <Popconfirm
                  title={col.remove}
                  onConfirm={() => void onDelete(row.id)}
                >
                  <span
                    className="table-action is-danger"
                    style={{ fontSize: colNode.remove?.style?.fontSize }}
                  >
                    {col.remove}
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
    <IrCanvas bounds={ir.bounds} screenId="doctors" template="crud-list">
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

      {inputs[0] ? (
        <div className="ir-control-host" style={boxStyle(inputs[0].bounds)}>
          <input
            className="ir-native-input"
            placeholder={searchPlaceholder}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
      ) : null}

      {inputs[1] ? (
        <div className="ir-control-host" style={boxStyle(inputs[1].bounds)}>
          <select
            className="ir-native-input ir-native-input--slot-arrow"
            value={String(deptFilter)}
            onChange={(e) => {
              const v = e.target.value
              setDeptFilter(v === 'all' ? 'all' : Number(v))
            }}
          >
            <option value="all">{allDeptLabel}</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {deptCaret ? (
        <IrIconSlot slot={deptCaret} style={{ pointerEvents: 'none' }} />
      ) : null}

      <DoctorCreateModal
        open={createOpen}
        initial={editing}
        departments={departments}
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

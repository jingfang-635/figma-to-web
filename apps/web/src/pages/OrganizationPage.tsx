import { Fragment, useEffect, useState, type CSSProperties } from 'react'
import { Button, Input, Spin, message } from 'antd'
import { AuthExpiredError, apiFetch } from '../api/client'
import { IrCanvas } from '../components/IrCanvas'
import { IrText } from '../components/IrText'
import { boxStyle, fluidBoxStyle } from '../ir/geometry'
import {
  contentTexts,
  controlByRole,
  controlsByRole,
  getLayoutIr,
  textNodeAt,
} from '../ir/useLayoutIr'

type Stats = {
  enabledDepartmentCount: number
  activeDoctorCount: number
}

type Organization = {
  id: number
  name: string
  phone?: string
  subtitle?: string
  businessHours?: string
  address?: string
  description?: string
}

type Appointment = { id: number; date: string; status: string }

/** Fluid panel right padding (mirrors `fluidBoxStyle` default). */
const PANEL_RIGHT_PAD = 24

export function OrganizationPage() {
  const ir = getLayoutIr('organization')
  const texts = contentTexts(ir)
  const title = textNodeAt(texts, 244, 72)
  const subtitle = textNodeAt(texts, 244, 106)
  const kpiControls = controlsByRole(ir, 'kpi')
  const panel = controlByRole(ir, 'panel')
  const saveBtn = controlByRole(ir, 'button-primary')
  const inputs = controlsByRole(ir, 'input')
  const textarea = controlByRole(ir, 'textarea')
  const kpiLabels = [
    textNodeAt(texts, 268, 163),
    textNodeAt(texts, 565, 163),
    textNodeAt(texts, 862, 163),
    textNodeAt(texts, 1159, 163),
  ]
  const panelTitle = textNodeAt(texts, 264, 271)
  const panelDesc = textNodeAt(texts, 264, 295)
  const saveLabel = textNodeAt(texts, 1301, 278)
  const reqMark = textNodeAt(texts, 346.6, 335)
  const labels = {
    name: textNodeAt(texts, 287.02, 335),
    phone: textNodeAt(texts, 878, 335),
    subtitle: textNodeAt(texts, 287, 391),
    businessHours: textNodeAt(texts, 878, 391),
    address: textNodeAt(texts, 300, 447),
    description: textNodeAt(texts, 300, 503),
  }

  // Gap between the primary button right edge and the fluid panel right edge
  // (both derived from Layout IR, so the button follows the panel when the
  // main area widens instead of a hard-coded `right` offset).
  const panelRightEdge = panel ? panel.bounds.x + panel.bounds.width : 0
  const buttonFollowRight =
    panel && saveBtn
      ? PANEL_RIGHT_PAD +
        (panelRightEdge - (saveBtn.bounds.x + saveBtn.bounds.width))
      : PANEL_RIGHT_PAD

  const [form, setForm] = useState<Partial<Organization>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [orgId, setOrgId] = useState<number | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [todayOrders, setTodayOrders] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [orgs, s, appts] = await Promise.all([
          apiFetch<Organization[]>('/api/organizations'),
          apiFetch<Stats>('/api/stats'),
          apiFetch<Appointment[]>('/api/appointments'),
        ])
        if (cancelled) return
        const org = orgs[0]
        if (org) {
          setOrgId(org.id)
          setForm(org)
        }
        setStats(s)
        const today = new Date().toISOString().slice(0, 10)
        setPendingCount(
          appts.filter((a) => a.date === today && a.status === 'BOOKED').length,
        )
        setTodayOrders(appts.filter((a) => a.date === today).length)
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

  const onSave = async () => {
    setSaving(true)
    try {
      if (orgId == null) {
        const created = await apiFetch<Organization>('/api/organizations', {
          method: 'POST',
          body: JSON.stringify(form),
        })
        setOrgId(created.id)
      } else {
        await apiFetch(`/api/organizations/${orgId}`, {
          method: 'PUT',
          body: JSON.stringify({ ...form, id: orgId }),
        })
      }
      message.success(saveLabel?.characters || 'ok')
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'save failed')
    } finally {
      setSaving(false)
    }
  }

  const kpiValues = [
    String(stats?.enabledDepartmentCount ?? 0),
    String(stats?.activeDoctorCount ?? 0),
    String(pendingCount),
    String(todayOrders),
  ]

  // —— 机构基础信息表单：流式两列栅格（方案 C · fluid-shell） ——
  // 面板是流式块（fluidBoxStyle），右边缘随主区走；表单必须一起走，否则字段
  // 停在 IR 像素宽、面板右侧留出空白带，而保存按钮（已随面板）会脱离字段列。
  // 栅格：| 固定 label 列 | 第1列输入 | 固定列间距 | 第2列输入 |；列宽/间距/
  // 行高/行距全部由 Layout IR 求出——IR 视口宽时各列逐像素退化回 IR 盒。
  const col1 = inputs[0]
  const col2 = inputs[1]
  const row2 = inputs[2]
  const lastRow = inputs[4]
  const formLeft = panelTitle ? panelTitle.bounds.x : 0
  const formTop = col1 ? col1.bounds.y : 0
  const formHeight =
    textarea && col1 ? textarea.bounds.y + textarea.bounds.height - formTop : 0
  const formGutter = col1 ? col1.bounds.x - formLeft : 0
  const formInterGap =
    col1 && col2 ? col2.bounds.x - (col1.bounds.x + col1.bounds.width) : 0
  const formRowGap =
    row2 && col1 ? row2.bounds.y - (col1.bounds.y + col1.bounds.height) : 0
  const formRowHeights = [col1, row2, lastRow, textarea].map((c) =>
    c ? c.bounds.height : 0,
  )
  // label 右边缘落在其输入框左侧 `labelGap` 处（两列一致，取自 IR）。
  const labelGap =
    col1 && labels.subtitle
      ? col1.bounds.x -
        (labels.subtitle.bounds.x + labels.subtitle.bounds.width)
      : 0
  // “机构名称”后的必填星号间距（IR 里它是独立文本节点）。
  const asteriskGap =
    reqMark && labels.name
      ? reqMark.bounds.x - (labels.name.bounds.x + labels.name.bounds.width)
      : 0
  // label 顶到本行输入框顶的距离（IR 里每行都是 8px，label 略高于输入框中线）。
  const labelOffsetTop =
    labels.subtitle && row2 ? labels.subtitle.bounds.y - row2.bounds.y : 0
  // 表单右边缘相对主区的内距 = 面板右内距 + 面板到字段的内缩（IR 可测）。
  const formRightPad =
    panel && lastRow
      ? PANEL_RIGHT_PAD +
        (panel.bounds.x + panel.bounds.width) -
        (lastRow.bounds.x + lastRow.bounds.width)
      : PANEL_RIGHT_PAD

  type FormCell = {
    key: keyof Organization
    control?: (typeof inputs)[number]
    label?: ReturnType<typeof textNodeAt>
    required?: boolean
  }
  const formRows: { a: FormCell; b?: FormCell }[] = [
    {
      a: { key: 'name', control: inputs[0], label: labels.name, required: true },
      b: { key: 'phone', control: inputs[1], label: labels.phone },
    },
    {
      a: { key: 'subtitle', control: inputs[2], label: labels.subtitle },
      b: {
        key: 'businessHours',
        control: inputs[3],
        label: labels.businessHours,
      },
    },
    { a: { key: 'address', control: inputs[4], label: labels.address } },
    {
      a: {
        key: 'description',
        control: textarea,
        label: labels.description,
      },
    },
  ]

  const labelStyle = (label: ReturnType<typeof textNodeAt>): CSSProperties => ({
    fontSize: label?.style?.fontSize,
    lineHeight: label?.style?.lineHeightPx
      ? `${label.style.lineHeightPx}px`
      : undefined,
  })

  const renderControl = (cell: FormCell) =>
    cell.control === textarea ? (
      <Input.TextArea
        value={form.description ?? ''}
        onChange={(e) =>
          setForm((prev) => ({ ...prev, description: e.target.value }))
        }
        maxLength={1000}
      />
    ) : (
      <Input
        value={String(form[cell.key] ?? '')}
        onChange={(e) =>
          setForm((prev) => ({ ...prev, [cell.key]: e.target.value }))
        }
      />
    )

  const renderLabel = (cell: FormCell, gridColumn: number, gridRow: number) => (
    <div
      className="org-form__label"
      style={{
        gridColumn,
        gridRow,
        paddingTop: labelOffsetTop,
        paddingRight: labelGap,
      }}
    >
      {cell.label ? (
        <span style={labelStyle(cell.label)}>{cell.label.characters}</span>
      ) : null}
      {cell.required && reqMark ? (
        <span
          aria-hidden
          className="req"
          style={{
            marginLeft: asteriskGap,
            fontSize: reqMark.style?.fontSize,
            lineHeight: reqMark.style?.lineHeightPx
              ? `${reqMark.style.lineHeightPx}px`
              : undefined,
          }}
        >
          {reqMark.characters}
        </span>
      ) : null}
    </div>
  )

  const renderCell = (
    cell: FormCell,
    gridColumn: number | string,
    gridRow: number,
  ) => (
    <div className="ir-control-host" style={{ gridColumn, gridRow }}>
      {renderControl(cell)}
    </div>
  )

  return (
    <IrCanvas bounds={ir.bounds} screenId="organization" template="org-form">
      {title ? <IrText node={title} /> : null}
      {subtitle ? (
        <IrText node={subtitle} style={{ color: 'var(--color-text-secondary)' }} />
      ) : null}

      {loading ? (
        <div style={boxStyle({ x: 700, y: 400, width: 40, height: 40 })}>
          <Spin />
        </div>
      ) : (
        <>
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
              style={fluidBoxStyle(panel.bounds)}
            />
          ) : null}
          {panelTitle ? <IrText node={panelTitle} /> : null}
          {panelDesc ? (
            <IrText
              node={panelDesc}
              style={{ color: 'var(--color-text-tertiary)' }}
            />
          ) : null}
          {panel && saveBtn ? (
            <Button
              type="primary"
              className="ir-btn"
              loading={saving}
              onClick={() => void onSave()}
              style={{
                ...boxStyle(saveBtn.bounds, {
                  fontSize: saveLabel?.style?.fontSize,
                }),
                left: 'auto',
                right: buttonFollowRight,
              }}
            >
              {saveLabel?.characters}
            </Button>
          ) : null}

          {panel && inputs.length >= 5 && textarea ? (
            <div
              className="org-form"
              data-ir-fluid="org-form"
              style={fluidBoxStyle(
                { x: formLeft, y: formTop, width: 0, height: formHeight },
                {
                  display: 'grid',
                  gridTemplateColumns: `${formGutter}px minmax(0, 1fr) ${formInterGap}px minmax(0, 1fr)`,
                  gridTemplateRows: formRowHeights
                    .map((h) => `${h}px`)
                    .join(' '),
                  rowGap: formRowGap,
                },
                formRightPad,
              )}
            >
              {formRows.map((row, ri) => (
                <Fragment key={row.a.key}>
                  {renderLabel(row.a, 1, ri + 1)}
                  {renderCell(row.a, row.b ? 2 : '2 / 5', ri + 1)}
                  {row.b ? (
                    <Fragment>
                      {renderLabel(row.b, 3, ri + 1)}
                      {renderCell(row.b, 4, ri + 1)}
                    </Fragment>
                  ) : null}
                </Fragment>
              ))}
            </div>
          ) : null}
        </>
      )}
    </IrCanvas>
  )
}

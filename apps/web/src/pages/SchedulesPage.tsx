import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Select, Table, message } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { AuthExpiredError, apiFetch } from '../api/client'
import { IrCanvas } from '../components/IrCanvas'
import { IrIconSlot } from '../components/IrIconSlot'
import { IrText } from '../components/IrText'
import { boxStyle, fluidBoxStyle } from '../ir/geometry'
import { buildCalendarModel, tintFor, type CalendarModel } from '../ir/scheduleCalendar'
import {
  contentTexts,
  controlByRole,
  controlsByRole,
  getLayoutIr,
  iconSlotsInBounds,
  nodeById,
  textAt,
  textNodeAt,
} from '../ir/useLayoutIr'
import { ScheduleCreateModal } from '../modals/ScheduleCreateModal'
import { ScheduleBatchModal } from '../modals/ScheduleBatchModal'

type Department = { id: number; name: string }
type Doctor = { id: number; name: string; departmentId: number }
type Schedule = {
  id: number
  doctorId: number
  date: string
  period: string
  quota: number
  bookedCount?: number
  status: string
  remark?: string
}

/** How many chips a day cell shows before the "and N more" line takes over. */
const MAX_CHIPS = 3

/**
 * Cell geometry arrives as CSS custom properties so a cell's contents can be
 * laid out without the stylesheet re-typing a number. A metric the prototype
 * never showed is left out rather than defaulted to zero: the property simply
 * stays unset and the stylesheet falls back to its own layout.
 */
function cellVars(model: CalendarModel): Record<string, string> {
  const vars: Record<string, string> = {}
  const put = (name: string, value?: number) => {
    if (typeof value === 'number') vars[name] = `${value}px`
  }
  put('--cell-inset', model.chip.insetX)
  put('--cell-body-top', model.chip.offsetY)
  put('--chip-height', model.chip.height)
  put('--chip-gap', model.chip.gapY)
  put('--chip-pad', model.chip.paddingX)
  put('--chip-radius', model.chip.radius)
  return vars as Record<string, string>
}

export function SchedulesPage() {
  const ir = getLayoutIr('schedules')
  const texts = contentTexts(ir)
  const title = textNodeAt(texts, 244, 72)
  const subtitle = textNodeAt(texts, 244, 106)
  const panel = controlByRole(ir, 'panel')
  const inputs = controlsByRole(ir, 'input')
  const batchBtn = controlByRole(ir, 'button-default')
  const createBtn = controlByRole(ir, 'button-primary')
  const filterLabel = textNodeAt(texts, 264, 170.5)
  const allDept = textAt(texts, 327, 170)
  const allDoctor = textAt(texts, 489, 171)
  const dateLabel = textNodeAt(texts, 660, 170.5)
  const monthText = textNodeAt(texts, 771.89, 169.5)
  const todayLabel = textNodeAt(texts, 923.69, 171)
  const batchLabel = textNodeAt(texts, 1203.92, 166)
  const createLabel = textNodeAt(texts, 1318, 166)

  const calendar = useMemo(() => buildCalendarModel(ir), [ir])

  /**
   * The legend is the design's own colour vocabulary. A status or a period is
   * tinted by looking its label up in the legend the prototype drew, so the
   * page carries no colour table of its own.
   */
  const legendText = useCallback(
    (x: number) => textNodeAt(texts, x, 223)?.characters,
    [texts],
  )
  const legendAccent = useCallback(
    (x: number) => {
      const characters = legendText(x)
      return characters
        ? calendar?.legend.find((e) => e.label?.characters === characters)?.accent
        : undefined
    },
    [calendar, legendText],
  )
  const openLabel = legendText(280)
  const fullLabel = legendText(348)
  const closedLabel = legendText(416)
  const morningLabel = legendText(472)
  const afternoonLabel = legendText(528)
  const openAccent = legendAccent(280)
  const fullAccent = legendAccent(348)
  const closedAccent = legendAccent(416)
  const morningAccent = legendAccent(472)
  const afternoonAccent = legendAccent(528)

  const [createOpen, setCreateOpen] = useState(false)
  const [batchOpen, setBatchOpen] = useState(false)
  const [view, setView] = useState<string>('calendar')
  const [month, setMonth] = useState<Dayjs>(dayjs())
  const [deptFilter, setDeptFilter] = useState<number | 'all'>('all')
  const [doctorFilter, setDoctorFilter] = useState<number | 'all'>('all')
  const [departments, setDepartments] = useState<Department[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, d, dep] = await Promise.all([
        apiFetch<Schedule[]>('/api/schedules'),
        apiFetch<Doctor[]>('/api/doctors'),
        apiFetch<Department[]>('/api/departments'),
      ])
      setSchedules(s)
      setDoctors(d)
      setDepartments(dep)
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

  const doctorMap = useMemo(
    () => new Map(doctors.map((d) => [d.id, d])),
    [doctors],
  )

  const filteredDoctors = useMemo(
    () =>
      deptFilter === 'all'
        ? doctors
        : doctors.filter((d) => d.departmentId === deptFilter),
    [doctors, deptFilter],
  )

  const filtered = useMemo(() => {
    return schedules.filter((s) => {
      const doc = doctorMap.get(s.doctorId)
      if (!doc) return false
      if (deptFilter !== 'all' && doc.departmentId !== deptFilter) return false
      if (doctorFilter !== 'all' && s.doctorId !== doctorFilter) return false
      return dayjs(s.date).isSame(month, 'month')
    })
  }, [schedules, doctorMap, deptFilter, doctorFilter, month])

  /**
   * The grid always draws the row count the prototype drew; the month supplies
   * the dates and everything past the last one is drawn as adjacent-month. A
   * month spanning five weeks therefore still fills six bands, which is what
   * keeps every cell box on its IR coordinate instead of letting the grid
   * reshorten itself and drag the panel bottom with it.
   */
  const calendarCells = useMemo(() => {
    if (!calendar) return []
    const capacity = Math.max(calendar.rows.length - 1, 1) * 7
    const start = month.startOf('month').startOf('week')
    const cells: { date: Dayjs; items: Schedule[] }[] = []
    for (let i = 0; i < capacity; i += 1) {
      const date = start.add(i, 'day')
      const key = date.format('YYYY-MM-DD')
      cells.push({ date, items: filtered.filter((s) => s.date === key) })
    }
    return cells
  }, [calendar, month, filtered])

  const monthDisplay = `${month.year()}年${month.month() + 1}月`

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
  // The grid divides its own container, so it follows the main area. Its right
  // inset inside the panel comes from the IR, which is why the grid lands on
  // its prototype width at the prototype viewport and grows from there.
  const frameRightPad = calendar
    ? ir.bounds.width - (calendar.frame.bounds.x + calendar.frame.bounds.width)
    : 64

  const radiusOf = useCallback(
    (nodeId?: string) => nodeById(ir, nodeId)?.cornerRadius,
    [ir],
  )
  const frameRadius = calendar ? radiusOf(calendar.frame.nodeId) : undefined
  const swatchRadius = calendar
    ? radiusOf(calendar.legend[0]?.cell.nodeId)
    : undefined
  const trackRadius = calendar ? radiusOf(calendar.toggle?.track.nodeId) : undefined
  const pillRadius = calendar ? radiusOf(calendar.toggle?.pill?.nodeId) : undefined

  const chipAccent = useCallback(
    (row: Schedule) => {
      if (row.status === 'CLOSED' && closedAccent) return closedAccent
      if (row.status === 'FULL' && fullAccent) return fullAccent
      const period =
        row.period === 'MORNING'
          ? morningAccent
          : row.period === 'AFTERNOON'
            ? afternoonAccent
            : undefined
      return period || openAccent || undefined
    },
    [afternoonAccent, closedAccent, fullAccent, morningAccent, openAccent],
  )

  const paintOf = useCallback(
    (date: Dayjs, isToday: boolean) => {
      if (!calendar) return undefined
      // Weekend paint beats every other state: the prototype paints both outer
      // columns uniformly, and a today marker rides on top of them.
      if (date.day() === 0 || date.day() === 6) {
        return calendar.fills.weekend ?? calendar.fills.regular
      }
      if (isToday) return calendar.fills.today ?? calendar.fills.regular
      if (!date.isSame(month, 'month')) {
        return calendar.fills.outside ?? calendar.fills.regular
      }
      return calendar.fills.regular
    },
    [calendar, month],
  )

  // The two filter carets are slots the prototype drew inside the selects, and
  // the month pagers flank the month title. Both are resolved structurally so
  // the page keeps no slot table.
  const caretSlots = inputs.map((input) => iconSlotsInBounds(ir, input.bounds)[0])
  const caretIds = new Set(
    caretSlots.filter(Boolean).map((slot) => slot!.nodeId),
  )
  const monthBand = monthText
    ? monthText.bounds.y + monthText.bounds.height / 2
    : 0
  const pagerSlots = monthText
    ? (ir.icons ?? [])
        .filter((i) => !caretIds.has(i.nodeId))
        .filter((i) => i.bounds.x >= (panel?.bounds.x ?? 0))
        .filter(
          (i) =>
            Math.abs(i.bounds.y + i.bounds.height / 2 - monthBand) < 8 &&
            (i.bounds.x + i.bounds.width <= monthText.bounds.x ||
              i.bounds.x >= monthText.bounds.x + monthText.bounds.width),
        )
        .sort((a, b) => a.bounds.x - b.bounds.x)
    : []

  return (
    <IrCanvas bounds={ir.bounds} screenId="schedules" template="schedule-calendar">
      {title ? <IrText node={title} /> : null}
      {subtitle ? (
        <IrText node={subtitle} style={{ color: 'var(--color-text-secondary)' }} />
      ) : null}

      {panel ? (
        <section
          className="ir-surface"
          data-ir-fluid="panel"
          style={fluidBoxStyle(panel.bounds, undefined, panelRightPad)}
        />
      ) : null}

      {filterLabel ? <IrText node={filterLabel} /> : null}
      {dateLabel ? <IrText node={dateLabel} /> : null}
      {monthText ? (
        <div
          data-ir-live="calendar-month"
          style={boxStyle(monthText.bounds, {
            fontSize: monthText.style?.fontSize,
          })}
        >
          {monthDisplay}
        </div>
      ) : null}
      {todayLabel ? (
        <div
          style={boxStyle(todayLabel.bounds, {
            fontSize: todayLabel.style?.fontSize,
            cursor: 'pointer',
            color: 'var(--color-primary)',
          })}
          onClick={() => setMonth(dayjs())}
        >
          {todayLabel.characters}
        </div>
      ) : null}

      {calendar?.toggle ? (
        <div
          className="view-toggle"
          data-ir-cell="toggle-track"
          data-ir-cell-node={calendar.toggle.track.nodeId}
          style={boxStyle(calendar.toggle.track.bounds, {
            background: calendar.toggle.track.fill,
            borderRadius: trackRadius,
          })}
        >
          {calendar.toggle.pill ? (
            <span
              className="view-toggle__pill"
              style={{
                left:
                  view === 'calendar'
                    ? calendar.toggle.pill.bounds.x -
                      calendar.toggle.track.bounds.x
                    : calendar.toggle.track.bounds.width -
                      (calendar.toggle.pill.bounds.x -
                        calendar.toggle.track.bounds.x) -
                      calendar.toggle.pill.bounds.width,
                top:
                  calendar.toggle.pill.bounds.y - calendar.toggle.track.bounds.y,
                width: calendar.toggle.pill.bounds.width,
                height: calendar.toggle.pill.bounds.height,
                background: calendar.toggle.pill.fill,
                borderRadius: pillRadius,
              }}
            />
          ) : null}
          {calendar.toggle.labels.map((label, i) => (
            <span
              key={label.text.nodeId ?? i}
              className={(i === 0) === (view === 'calendar') ? 'is-on' : ''}
              style={{
                color: label.color,
                fontSize: label.fontSize,
                fontWeight: label.fontWeight,
              }}
              onClick={() => setView(i === 0 ? 'calendar' : 'list')}
            >
              {label.text.characters}
            </span>
          ))}
        </div>
      ) : null}

      {inputs[0] ? (
        <div
          className="ir-control-host ir-control-host--slot-arrow"
          style={boxStyle(inputs[0].bounds)}
        >
          <Select
            value={deptFilter}
            onChange={(v) => {
              setDeptFilter(v)
              setDoctorFilter('all')
            }}
            options={[
              { value: 'all', label: allDept },
              ...departments.map((d) => ({ value: d.id, label: d.name })),
            ]}
          />
        </div>
      ) : null}
      {caretSlots[0] ? (
        <IrIconSlot slot={caretSlots[0]} style={{ pointerEvents: 'none' }} />
      ) : null}

      {inputs[1] ? (
        <div
          className="ir-control-host ir-control-host--slot-arrow"
          style={boxStyle(inputs[1].bounds)}
        >
          <Select
            value={doctorFilter}
            onChange={setDoctorFilter}
            options={[
              { value: 'all', label: allDoctor },
              ...filteredDoctors.map((d) => ({ value: d.id, label: d.name })),
            ]}
          />
        </div>
      ) : null}
      {caretSlots[1] ? (
        <IrIconSlot slot={caretSlots[1]} style={{ pointerEvents: 'none' }} />
      ) : null}

      {pagerSlots[0] ? (
        <IrIconSlot
          slot={pagerSlots[0]}
          style={{ cursor: 'pointer' }}
          onClick={() => setMonth((m) => m.subtract(1, 'month'))}
        />
      ) : null}
      {pagerSlots[1] ? (
        <IrIconSlot
          slot={pagerSlots[1]}
          style={{ cursor: 'pointer' }}
          onClick={() => setMonth((m) => m.add(1, 'month'))}
        />
      ) : null}

      {batchBtn ? (
        <Button
          className="ir-btn"
          style={boxStyle(batchBtn.bounds)}
          onClick={() => setBatchOpen(true)}
        >
          {batchLabel?.characters}
        </Button>
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
          onClick={() => setCreateOpen(true)}
        >
          {createLabel?.characters}
        </Button>
      ) : null}

      {calendar
        ? calendar.legend.map((entry, i) => (
            <Fragment key={entry.cell.nodeId ?? i}>
              <span
                data-ir-cell="legend-swatch"
                data-ir-cell-node={entry.cell.nodeId}
                style={boxStyle(entry.cell.bounds, {
                  background: entry.accent,
                  borderRadius: swatchRadius,
                })}
              />
              {entry.label ? (
                <IrText
                  node={entry.label}
                  style={{ color: entry.labelColor, fontSize: entry.labelFontSize }}
                />
              ) : null}
            </Fragment>
          ))
        : null}

      {calendar ? (
        <div
          data-ir-fluid="calendar"
          data-ir-cell="frame"
          data-ir-cell-node={calendar.frame.nodeId}
          style={fluidBoxStyle(
            calendar.frame.bounds,
            {
              display: 'grid',
              gridTemplateColumns: `repeat(7, 1fr)`,
              gridTemplateRows: calendar.rows
                .map((r) => `${r.height}px`)
                .join(' '),
              gap: calendar.columnGap,
              background: calendar.frame.fill,
              border: `1px solid ${calendar.frame.fill}`,
              borderRadius: frameRadius,
              overflow: 'hidden',
            },
            frameRightPad,
          )}
        >
          {view === 'calendar' ? (
            <>
              {calendar.columns.map((col, i) => (
                <div
                  className="schedule-head"
                  key={col.label?.nodeId ?? i}
                  data-ir-cell="grid-head"
                  data-ir-cell-node={calendar.headNodeIds[i]}
                  style={{
                    background: calendar.headFill,
                    color: col.labelColor,
                    fontSize: col.labelFontSize,
                    fontWeight: col.labelFontWeight,
                  }}
                >
                  {col.label?.characters}
                </div>
              ))}
              {calendarCells.map((cell, i) => {
                const isToday = cell.date.isSame(dayjs(), 'day')
                const visible = cell.items.slice(0, MAX_CHIPS)
                const rest = cell.items.length - visible.length
                return (
                  <div
                    className="schedule-cell"
                    key={cell.date.format()}
                    data-ir-cell="grid-cell"
                    data-ir-cell-node={calendar.bodyNodeIds[i]}
                    style={{
                      background: paintOf(cell.date, isToday),
                      ...cellVars(calendar),
                    }}
                  >
                    {isToday && calendar.badge ? (
                      <span
                        className="schedule-badge"
                        data-ir-cell="badge"
                        style={{
                          left: calendar.badge.offsetX,
                          top: calendar.badge.offsetY,
                          width: calendar.badge.size,
                          height: calendar.badge.size,
                          background: calendar.badge.fill,
                        }}
                      />
                    ) : null}
                    <span
                      className="schedule-day"
                      data-ir-live="calendar-day-number"
                      style={{
                        left: isToday
                          ? calendar.badge?.offsetX
                          : calendar.dayNumber.offsetX,
                        top: isToday
                          ? calendar.badge?.offsetY
                          : calendar.dayNumber.offsetY,
                        width: isToday ? calendar.badge?.size : undefined,
                        height: isToday ? calendar.badge?.size : undefined,
                        color: isToday
                          ? calendar.dayNumber.todayColor
                          : cell.date.isSame(month, 'month')
                            ? calendar.dayNumber.color
                            : calendar.dayNumber.mutedColor,
                        fontSize: calendar.dayNumber.fontSize,
                        fontWeight: calendar.dayNumber.fontWeight,
                        lineHeight: calendar.dayNumber.lineHeight
                          ? `${calendar.dayNumber.lineHeight}px`
                          : undefined,
                      }}
                    >
                      {cell.date.date()}
                    </span>
                    <div className="schedule-body" data-ir-live="calendar-cell-body">
                      {visible.map((s) => {
                        const doc = doctorMap.get(s.doctorId)
                        const accent = chipAccent(s)
                        return (
                          <div
                            className="schedule-chip"
                            key={s.id}
                            style={{
                              color: accent,
                              background: tintFor(calendar, accent),
                              fontSize: calendar.chip.nameFontSize,
                              fontWeight: calendar.chip.nameFontWeight,
                            }}
                          >
                            <span>{doc?.name}</span>
                            <span
                              style={{
                                fontSize: calendar.chip.countFontSize,
                                fontWeight: calendar.chip.countFontWeight,
                              }}
                            >
                              {s.bookedCount ?? 0}/{s.quota}
                            </span>
                          </div>
                        )
                      })}
                      {rest > 0 && calendar.more ? (
                        <div
                          className="schedule-more"
                          style={{
                            color: calendar.more.color,
                            fontSize: calendar.more.fontSize,
                            fontWeight: calendar.more.fontWeight,
                          }}
                        >
                          {calendar.more.template.replace(/\d+/, String(rest))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </>
          ) : (
            <div className="schedule-list">
              <Table
                className="ir-table"
                rowKey="id"
                loading={loading}
                dataSource={filtered}
                columns={[
                  {
                    title: allDoctor,
                    render: (_, row) => doctorMap.get(row.doctorId)?.name,
                  },
                  { title: dateLabel?.characters, dataIndex: 'date' },
                  {
                    title: morningLabel,
                    dataIndex: 'period',
                    render: (v: string) =>
                      v === 'AFTERNOON' ? afternoonLabel : morningLabel,
                  },
                  {
                    title: openLabel,
                    key: 'quota',
                    render: (_, row) => `${row.bookedCount ?? 0}/${row.quota}`,
                  },
                  {
                    title: closedLabel,
                    dataIndex: 'status',
                    render: (v: string) =>
                      v === 'FULL' ? fullLabel : v === 'CLOSED' ? closedLabel : openLabel,
                  },
                ]}
              />
            </div>
          )}
        </div>
      ) : null}

      <ScheduleCreateModal
        open={createOpen}
        doctors={doctors}
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          setCreateOpen(false)
          void load()
        }}
      />
      <ScheduleBatchModal
        open={batchOpen}
        doctors={doctors}
        departments={departments}
        onClose={() => setBatchOpen(false)}
        onSaved={() => {
          setBatchOpen(false)
          void load()
        }}
      />
    </IrCanvas>
  )
}

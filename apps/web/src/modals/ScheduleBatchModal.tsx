import { useEffect, useMemo, useState } from 'react'
import { Button, InputNumber, Select, message } from 'antd'
import dayjs from 'dayjs'
import { apiFetch } from '../api/client'
import { IrIconSlot } from '../components/IrIconSlot'
import { IrModalShell } from '../components/IrModalShell'
import { IrText } from '../components/IrText'
import {
  controlByRole,
  controlsByRole,
  fillColor,
  getLayoutIr,
  iconSlotsInBounds,
  nodeById,
  panelAround,
  rectNodesIn,
  textAt,
  textNodeAt,
  textsInBounds,
  type IrNode,
} from '../ir/useLayoutIr'
import { modalBoxStyle as boxStyle, modalTextStyle as textStyle, type IrBounds } from '../ir/geometry'

type Department = { id: number; name: string }
type Doctor = { id: number; name: string; departmentId: number }

const WEEKDAY_KEYS = [
  { value: 1, x: 130.7 },
  { value: 2, x: 186.13 },
  { value: 3, x: 241.56 },
  { value: 4, x: 296.98 },
  { value: 5, x: 352.42 },
  { value: 6, x: 407.84 },
  { value: 0, x: 463.27 },
]

export function ScheduleBatchModal({
  open,
  onClose,
  onSaved,
  doctors,
  departments,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  doctors: Doctor[]
  departments: Department[]
}) {
  const ir = getLayoutIr('schedule-batch')
  const texts = ir.texts
  const scheduleTexts = getLayoutIr('schedules').texts
  const card = controlByRole(ir, 'modal-card')?.bounds ?? ir.bounds
  const inputs = controlsByRole(ir, 'input')
  const cancelBtn = controlByRole(ir, 'button-default')
  const okBtn = controlByRole(ir, 'button-primary')
  // Slots the prototype drew but no DOM control draws for us: the card's close
  // glyph and the caret of each select that carries one.
  const closeSlot = (ir.icons ?? []).find(
    (i) => i.bounds.x > card.width / 2 && i.bounds.y < 60,
  )
  const caretSlots = inputs.map((input) => iconSlotsInBounds(ir, input.bounds)[0])

  const title = textNodeAt(texts, 20, 19.5)
  const labels = {
    template: textNodeAt(texts, 43.02, 89),
    templateValue: textAt(texts, 132, 90),
    doctor: textNodeAt(texts, 43.02, 145),
    allDept: textAt(texts, 132, 146),
    allDoctor: textAt(texts, 327, 146.5),
    dates: textNodeAt(texts, 30, 201),
    weekRange: textNodeAt(texts, 30.02, 259),
    weekRangeValue: textAt(texts, 132, 260),
    period: textNodeAt(texts, 69.02, 315),
    periodMorning: textAt(texts, 132, 316),
    periodAfternoon: textAt(scheduleTexts, 528, 223),
    /** Short period tokens as drawn in the schedules calendar — the preview
     * line's bracketed suffix is "（上午）", not the select's "上午 (08:00 …)". */
    periodShortMorning: textAt(scheduleTexts, 472, 223),
    statusClosed: textAt(scheduleTexts, 416, 223),
    quota: textNodeAt(texts, 30.02, 371),
    status: textNodeAt(texts, 56, 427),
    statusOpen: textAt(texts, 132, 428),
    preview: textNodeAt(texts, 32, 487),
    previewSummary: textAt(texts, 32, 639),
    cancel: textNodeAt(texts, 363, 689),
    ok: textNodeAt(texts, 431, 689),
  }
  const weekdayLabels = WEEKDAY_KEYS.map((w) => {
    const node = textNodeAt(texts, w.x, 202)
    return {
      value: w.value,
      label: node?.characters ?? '',
      node,
      /** The chip box the prototype drew around this weekday label. */
      chip: node ? panelAround(ir, node.bounds) : undefined,
    }
  })
  // The prototype draws the chips in two variants (selected / idle). Group them
  // by fill+stroke so the live toggle reuses the drawn styles: the variant on
  // most chips is the selected one.
  const chipVariantKey = (n?: IrNode) =>
    `${fillColor(n) ?? ''}|${n?.strokes?.[0]?.color ?? ''}`
  const chipVariants = [...new Set(weekdayLabels.map((w) => chipVariantKey(w.chip)))]
    .map((key) => ({
      key,
      chips: weekdayLabels.filter((w) => chipVariantKey(w.chip) === key),
    }))
    .sort((a, z) => z.chips.length - a.chips.length)
  const onVariant = chipVariants[0]
  const offVariant = chipVariants[1] ?? chipVariants[0]
  const chipStyle = (on: boolean) => {
    const sample = (on ? onVariant : offVariant)?.chips[0]?.chip
    return {
      background: fillColor(sample),
      borderColor: sample?.strokes?.[0]?.color,
      borderWidth: sample?.strokeWeight,
      borderRadius: sample?.cornerRadius,
      fontWeight: (on ? onVariant : offVariant)?.chips[0]?.node?.style?.fontWeight,
      color: fillColor(nodeById(ir, (on ? onVariant : offVariant)?.chips[0]?.node?.nodeId)),
    }
  }

  // Preview block geometry, resolved from the IR tree: the panel the rows sit
  // on, the row band, its 1px separators and the summary line under the band.
  // The prototype draws a separator under every row but the last, so the row
  // count follows from the IR instead of from a literal.
  const previewPanel = labels.preview
    ? panelAround(ir, labels.preview.bounds)
    : undefined
  const panelRects = previewPanel
    ? rectNodesIn(ir, previewPanel.bounds).filter((n) => n.id !== previewPanel.id)
    : []
  const rowRects = panelRects.filter((n) => n.bounds.height > 2)
  const separators = panelRects.filter((n) => n.bounds.height <= 2)
  const rowPitch =
    separators.length > 1
      ? separators[1].bounds.y - separators[0].bounds.y
      : rowRects.length > 1
        ? rowRects[1].bounds.y - rowRects[0].bounds.y
        : 0
  const rowCount = separators.length + 1
  const rowBox = rowRects[0]?.bounds
  const bandBottom = rowBox ? rowBox.y + rowCount * rowPitch : 0
  const panelTexts =
    previewPanel && rowBox
      ? textsInBounds(texts, {
          x: previewPanel.bounds.x,
          y: rowBox.y,
          width: previewPanel.bounds.width,
          height: previewPanel.bounds.y + previewPanel.bounds.height - rowBox.y,
        })
      : []
  const summaryNode = panelTexts.find((t) => t.bounds.y >= bandBottom)
  const rowNodes = summaryNode
    ? panelTexts.filter((t) => t !== summaryNode)
    : panelTexts
  const rowBoxOf = (i: number): IrBounds | undefined => {
    if (!rowBox || !rowNodes.length) return undefined
    const ref = rowNodes[Math.min(i, rowNodes.length - 1)].bounds
    const extra = Math.max(0, i - (rowNodes.length - 1)) * rowPitch
    return {
      x: ref.x,
      y: ref.y + extra,
      width: rowBox.width - (ref.x - rowBox.x),
      height: ref.height,
    }
  }

  const [templateType, setTemplateType] = useState('weekly')
  const [departmentId, setDepartmentId] = useState<number | 'all'>('all')
  const [doctorId, setDoctorId] = useState<number | 'all'>('all')
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5])
  const [weekRange, setWeekRange] = useState('this')
  const [period, setPeriod] = useState('MORNING')
  const [quota, setQuota] = useState(20)
  const [status, setStatus] = useState('OPEN')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setTemplateType('weekly')
    setDepartmentId('all')
    setDoctorId('all')
    setWeekdays([1, 2, 3, 4, 5])
    setWeekRange('this')
    setPeriod('MORNING')
    setQuota(20)
    setStatus('OPEN')
  }, [open])

  const scopedDoctors = useMemo(() => {
    if (departmentId === 'all') return doctors
    return doctors.filter((d) => d.departmentId === departmentId)
  }, [doctors, departmentId])

  const selectedDoctors = useMemo(() => {
    if (doctorId === 'all') return scopedDoctors
    return scopedDoctors.filter((d) => d.id === doctorId)
  }, [scopedDoctors, doctorId])

  const weekStart = useMemo(() => {
    const base = dayjs()
    return weekRange === 'next'
      ? base.add(1, 'week').startOf('week')
      : base.startOf('week')
  }, [weekRange])

  const previewLines = useMemo(() => {
    const days = weekdays.slice().sort((a, b) => a - b)
    const periodLabel =
      period === 'AFTERNOON'
        ? labels.periodAfternoon
        : labels.periodShortMorning
    const names = selectedDoctors.map((d) => d.name).join('、')
    return days.map((wd) => {
      const date = weekStart.day(wd)
      return `${date.format('YYYY-MM-DD')} — ${names}（${periodLabel}）`
    })
  }, [
    weekdays,
    weekStart,
    selectedDoctors,
    period,
    labels.periodShortMorning,
    labels.periodAfternoon,
  ])

  const expectedCount = selectedDoctors.length * weekdays.length

  const summaryText = (() => {
    const base = labels.previewSummary || ''
    const parts = base.split(/(\d+)/)
    let n = 0
    const live = [
      String(expectedCount),
      String(selectedDoctors.length),
      String(weekdays.length),
    ]
    return parts
      .map((p) => (/^\d+$/.test(p) && n < live.length ? live[n++] : p))
      .join('')
  })()

  const toggleDay = (d: number) => {
    setWeekdays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
    )
  }

  const onOk = async () => {
    if (!selectedDoctors.length || !weekdays.length) {
      message.error(labels.doctor?.characters || 'required')
      return
    }
    setSaving(true)
    try {
      const payloads = []
      for (const wd of weekdays) {
        const date = weekStart.day(wd).format('YYYY-MM-DD')
        for (const doc of selectedDoctors) {
          payloads.push({
            doctorId: doc.id,
            date,
            period,
            quota,
            bookedCount: 0,
            status,
          })
        }
      }
      await Promise.all(
        payloads.map((body) =>
          apiFetch('/api/schedules', {
            method: 'POST',
            body: JSON.stringify(body),
          }),
        ),
      )
      message.success(labels.ok?.characters || 'ok')
      onSaved()
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <IrModalShell
      open={open}
      onClose={onClose}
      card={card}
      screenId="schedule-batch"
      template="batch-schedule-modal"
    >
      {title ? <IrText node={title} variant="modal" /> : null}
      {closeSlot ? (
        <IrIconSlot
          slot={closeSlot}
          variant="modal"
          style={{ cursor: 'pointer' }}
          onClick={onClose}
        />
      ) : null}

      {labels.template ? (
        <div className="form-label-abs" style={boxStyle(labels.template.bounds)}>
          {labels.template.characters}
          <span className="req">*</span>
        </div>
      ) : null}
      {inputs[0] ? (
        <div
          className="ir-control-host ir-control-host--slot-arrow"
          style={boxStyle(inputs[0].bounds)}
        >
          <Select
            value={templateType}
            onChange={setTemplateType}
            options={[{ value: 'weekly', label: labels.templateValue }]}
          />
        </div>
      ) : null}
      {caretSlots[0] ? (
        <IrIconSlot
          slot={caretSlots[0]}
          variant="modal"
          style={{ pointerEvents: 'none' }}
        />
      ) : null}

      {labels.doctor ? (
        <div className="form-label-abs" style={boxStyle(labels.doctor.bounds)}>
          {labels.doctor.characters}
          <span className="req">*</span>
        </div>
      ) : null}
      {inputs[1] ? (
        <div
          className="ir-control-host ir-control-host--slot-arrow"
          style={boxStyle(inputs[1].bounds)}
        >
          <Select
            value={departmentId}
            onChange={(v) => {
              setDepartmentId(v)
              setDoctorId('all')
            }}
            options={[
              { value: 'all', label: labels.allDept },
              ...departments.map((d) => ({ value: d.id, label: d.name })),
            ]}
          />
        </div>
      ) : null}
      {caretSlots[1] ? (
        <IrIconSlot
          slot={caretSlots[1]}
          variant="modal"
          style={{ pointerEvents: 'none' }}
        />
      ) : null}
      {inputs[2] ? (
        <div
          className="ir-control-host ir-control-host--slot-arrow"
          style={boxStyle(inputs[2].bounds)}
        >
          <Select
            value={doctorId}
            onChange={setDoctorId}
            options={[
              { value: 'all', label: labels.allDoctor },
              ...scopedDoctors.map((d) => ({ value: d.id, label: d.name })),
            ]}
          />
        </div>
      ) : null}
      {caretSlots[2] ? (
        <IrIconSlot
          slot={caretSlots[2]}
          variant="modal"
          style={{ pointerEvents: 'none' }}
        />
      ) : null}

      {labels.dates ? (
        <div className="form-label-abs" style={boxStyle(labels.dates.bounds)}>
          {labels.dates.characters}
          <span className="req">*</span>
        </div>
      ) : null}
      {weekdayLabels.map((w) => {
        const on = weekdays.includes(w.value)
        if (!w.chip || !w.node) return null
        return (
          <div
            key={w.value}
            className={`weekday-chip${on ? ' is-on' : ''}`}
            style={textStyle(w.chip.bounds, w.node.style, {
              ...chipStyle(on),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            })}
            onClick={() => toggleDay(w.value)}
          >
            {w.label}
          </div>
        )
      })}

      {labels.weekRange ? (
        <div className="form-label-abs" style={boxStyle(labels.weekRange.bounds)}>
          {labels.weekRange.characters}
          <span className="req">*</span>
        </div>
      ) : null}
      {inputs[3] ? (
        <div className="ir-control-host" style={boxStyle(inputs[3].bounds)}>
          <Select
            value={weekRange}
            onChange={setWeekRange}
            options={[
              {
                value: 'this',
                label:
                  labels.weekRangeValue ||
                  `本周（${weekStart.format('M月D日')} - ${weekStart
                    .add(6, 'day')
                    .format('M月D日')}）`,
              },
              {
                value: 'next',
                label: `下周（${weekStart
                  .add(7, 'day')
                  .format('M月D日')} - ${weekStart
                  .add(13, 'day')
                  .format('M月D日')}）`,
              },
            ]}
          />
        </div>
      ) : null}

      {labels.period ? (
        <div className="form-label-abs" style={boxStyle(labels.period.bounds)}>
          {labels.period.characters}
          <span className="req">*</span>
        </div>
      ) : null}
      {inputs[4] ? (
        <div className="ir-control-host" style={boxStyle(inputs[4].bounds)}>
          <Select
            value={period}
            onChange={setPeriod}
            options={[
              { value: 'MORNING', label: labels.periodMorning },
              { value: 'AFTERNOON', label: labels.periodAfternoon },
            ]}
          />
        </div>
      ) : null}

      {labels.quota ? (
        <div className="form-label-abs" style={boxStyle(labels.quota.bounds)}>
          {labels.quota.characters}
          <span className="req">*</span>
        </div>
      ) : null}
      {inputs[5] ? (
        <div className="ir-control-host" style={boxStyle(inputs[5].bounds)}>
          <InputNumber
            min={1}
            max={200}
            value={quota}
            onChange={(v) => setQuota(Number(v || 1))}
          />
        </div>
      ) : null}

      {labels.status ? (
        <div className="form-label-abs" style={boxStyle(labels.status.bounds)}>
          {labels.status.characters}
        </div>
      ) : null}
      {inputs[6] ? (
        <div className="ir-control-host" style={boxStyle(inputs[6].bounds)}>
          <Select
            value={status}
            onChange={setStatus}
            options={[
              { value: 'OPEN', label: labels.statusOpen },
              { value: 'CLOSED', label: labels.statusClosed },
            ]}
          />
        </div>
      ) : null}

      {labels.preview ? <IrText node={labels.preview} variant="modal" /> : null}
      {previewPanel ? (
        <div
          className="batch-preview-panel"
          style={boxStyle(previewPanel.bounds, {
            background: fillColor(previewPanel),
            borderRadius: previewPanel.cornerRadius,
          })}
        />
      ) : null}
      {separators.map((s) => (
        <div
          key={s.id}
          className="batch-preview-sep"
          style={boxStyle(s.bounds, { background: fillColor(s) })}
        />
      ))}
      {previewLines.slice(0, rowCount).map((line, i) => {
        const box = rowBoxOf(i)
        const ref = rowNodes[Math.min(i, rowNodes.length - 1)]
        if (!box || !ref) return null
        return (
          <div
            key={`${i}-${line}`}
            className="batch-preview-row"
            data-ir-live="preview-row"
            style={textStyle(box, ref.style, {
              color: fillColor(nodeById(ir, ref.nodeId)),
              textOverflow: 'ellipsis',
            })}
          >
            {line}
          </div>
        )
      })}
      {summaryNode ? (
        <div
          className="batch-preview-summary"
          data-ir-live="preview-summary"
          style={textStyle(summaryNode.bounds, summaryNode.style, {
            color: fillColor(nodeById(ir, summaryNode.nodeId)),
          })}
        >
          {summaryText}
        </div>
      ) : null}

      {cancelBtn ? (
        <Button
          className="ir-btn"
          style={boxStyle(cancelBtn.bounds)}
          onClick={onClose}
        >
          {labels.cancel?.characters}
        </Button>
      ) : null}
      {okBtn ? (
        <Button
          type="primary"
          className="ir-btn"
          loading={saving}
          style={boxStyle(okBtn.bounds)}
          onClick={() => void onOk()}
        >
          {labels.ok?.characters}
        </Button>
      ) : null}
    </IrModalShell>
  )
}

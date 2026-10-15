import { useEffect, useState } from 'react'
import { Button, DatePicker, Input, InputNumber, Select, message } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { apiFetch } from '../api/client'
import { IrIconSlot } from '../components/IrIconSlot'
import { IrModalReqMarks } from '../components/IrModalReqMarks'
import { IrModalShell } from '../components/IrModalShell'
import { IrText } from '../components/IrText'
import { modalBoxStyle as boxStyle } from '../ir/geometry'
import {
  controlByRole,
  controlsByRole,
  getLayoutIr,
  iconSlotsInBounds,
  textAt,
  textNodeAt,
} from '../ir/useLayoutIr'

type Doctor = { id: number; name: string }
type ScheduleForm = {
  doctorId?: number
  date: Dayjs
  period: string
  quota: number
  status: string
  remark?: string
}

export function ScheduleCreateModal({
  open,
  onClose,
  onSaved,
  doctors,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  doctors: Doctor[]
}) {
  const ir = getLayoutIr('schedule-create')
  const texts = ir.texts
  const scheduleTexts = getLayoutIr('schedules').texts
  const card = controlByRole(ir, 'modal-card')?.bounds ?? ir.bounds
  const inputs = controlsByRole(ir, 'input')
  const cancelBtn = controlByRole(ir, 'button-default')
  const okBtn = controlByRole(ir, 'button-primary')
  // Slot the prototype drew but no DOM control draws for us: the card's close
  // glyph, top-right of the card.
  const closeSlot = (ir.icons ?? []).find(
    (i) => i.bounds.x > card.width / 2 && i.bounds.y < 60,
  )
  const caretSlots = inputs.map((input) => iconSlotsInBounds(ir, input.bounds)[0])

  const title = textNodeAt(texts, 20, 19.5)
  const labels = {
    doctor: textNodeAt(texts, 43.02, 89),
    doctorPh: textNodeAt(texts, 133, 90.5),
    date: textNodeAt(texts, 43.02, 143),
    period: textNodeAt(texts, 69.02, 201),
    periodMorning: textAt(texts, 132, 202),
    periodAfternoon: textAt(scheduleTexts, 528, 223),
    statusFull: textAt(scheduleTexts, 348, 223),
    statusClosed: textAt(scheduleTexts, 416, 223),
    quota: textNodeAt(texts, 30.02, 257),
    quotaHint: textNodeAt(texts, 337, 253),
    status: textNodeAt(texts, 56, 313),
    statusOpen: textAt(texts, 132, 314),
    remark: textNodeAt(texts, 82, 369),
    remarkPh: textNodeAt(texts, 132, 370),
    cancel: textNodeAt(texts, 389, 455),
    ok: textNodeAt(texts, 457, 455),
  }

  const [form, setForm] = useState<ScheduleForm>({
    date: dayjs(),
    period: 'MORNING',
    quota: 20,
    status: 'OPEN',
    remark: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm({
      doctorId: doctors[0]?.id,
      date: dayjs(),
      period: 'MORNING',
      quota: 20,
      status: 'OPEN',
      remark: '',
    })
  }, [open, doctors])

  const onOk = async () => {
    if (form.doctorId == null) {
      message.error(labels.doctorPh?.characters || 'required')
      return
    }
    setSaving(true)
    try {
      await apiFetch('/api/schedules', {
        method: 'POST',
        body: JSON.stringify({
          doctorId: form.doctorId,
          date: form.date.format('YYYY-MM-DD'),
          period: form.period,
          quota: form.quota,
          bookedCount: 0,
          status: form.status,
          remark: form.remark,
        }),
      })
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
      screenId="schedule-create"
      template="entity-form-modal"
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

      {labels.doctor ? <IrText node={labels.doctor} variant="modal" /> : null}
      <IrModalReqMarks texts={texts} />
      {inputs[0] ? (
        <div
          className="ir-control-host ir-control-host--slot-arrow"
          style={boxStyle(inputs[0].bounds)}
        >
          <Select
            placeholder={labels.doctorPh?.characters}
            value={form.doctorId}
            onChange={(v) => setForm((p) => ({ ...p, doctorId: v }))}
            options={doctors.map((d) => ({ value: d.id, label: d.name }))}
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

      {labels.date ? <IrText node={labels.date} variant="modal" /> : null}
      {inputs[1] ? (
        <div className="ir-control-host" style={boxStyle(inputs[1].bounds)}>
          <DatePicker
            value={form.date}
            onChange={(v) => v && setForm((p) => ({ ...p, date: v }))}
            allowClear={false}
          />
        </div>
      ) : null}

      {labels.period ? <IrText node={labels.period} variant="modal" /> : null}
      {inputs[2] ? (
        <div className="ir-control-host" style={boxStyle(inputs[2].bounds)}>
          <Select
            value={form.period}
            onChange={(v) => setForm((p) => ({ ...p, period: v }))}
            options={[
              { value: 'MORNING', label: labels.periodMorning },
              { value: 'AFTERNOON', label: labels.periodAfternoon },
            ]}
          />
        </div>
      ) : null}

      {labels.quota ? <IrText node={labels.quota} variant="modal" /> : null}
      {inputs[3] ? (
        <div className="ir-control-host" style={boxStyle(inputs[3].bounds)}>
          <InputNumber
            min={1}
            max={200}
            value={form.quota}
            onChange={(v) => setForm((p) => ({ ...p, quota: Number(v || 1) }))}
          />
        </div>
      ) : null}
      {labels.quotaHint ? (
        <div
          style={boxStyle(labels.quotaHint.bounds, {
            whiteSpace: 'pre-wrap',
            overflow: 'hidden',
            fontSize: labels.quotaHint.style?.fontSize,
            color: 'var(--color-text-secondary)',
            lineHeight: '18px',
          })}
        >
          {labels.quotaHint.characters}
        </div>
      ) : null}

      {labels.status ? <IrText node={labels.status} variant="modal" /> : null}
      {inputs[4] ? (
        <div className="ir-control-host" style={boxStyle(inputs[4].bounds)}>
          <Select
            value={form.status}
            onChange={(v) => setForm((p) => ({ ...p, status: v }))}
            options={[
              { value: 'OPEN', label: labels.statusOpen },
              { value: 'FULL', label: labels.statusFull },
              { value: 'CLOSED', label: labels.statusClosed },
            ]}
          />
        </div>
      ) : null}

      {labels.remark ? <IrText node={labels.remark} variant="modal" /> : null}
      {inputs[5] ? (
        <div className="ir-control-host" style={boxStyle(inputs[5].bounds)}>
          <Input
            placeholder={labels.remarkPh?.characters}
            value={form.remark}
            onChange={(e) => setForm((p) => ({ ...p, remark: e.target.value }))}
          />
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

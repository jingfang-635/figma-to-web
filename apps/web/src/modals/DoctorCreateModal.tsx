import { useEffect, useState } from 'react'
import { Button, Input, InputNumber, Select, message } from 'antd'
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

type Department = { id: number; name: string }
type Doctor = {
  id?: number
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

export function DoctorCreateModal({
  open,
  onClose,
  onSaved,
  initial,
  departments,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  initial?: Doctor | null
  departments: Department[]
}) {
  const ir = getLayoutIr('doctor-create')
  const texts = ir.texts
  const card = controlByRole(ir, 'modal-card')?.bounds ?? ir.bounds
  const inputs = controlsByRole(ir, 'input')
  const textarea = controlByRole(ir, 'textarea')
  const upload = controlByRole(ir, 'upload-box')
  const cancelBtn = controlByRole(ir, 'button-default')
  const okBtn = controlByRole(ir, 'button-primary')
  // Slots the prototype drew but no DOM control draws for us: the card's close
  // glyph (top-right of the card) and the upload glyph in the upload box.
  const closeSlot = (ir.icons ?? []).find(
    (i) => i.bounds.x > card.width / 2 && i.bounds.y < 60,
  )
  const uploadSlot = upload ? iconSlotsInBounds(ir, upload.bounds)[0] : undefined

  const title = textNodeAt(texts, 20, 19.5)
  const labels = {
    avatar: textNodeAt(texts, 56, 89),
    upload: textNodeAt(texts, 138, 126.5),
    hint1: textNodeAt(texts, 212, 82),
    hint2: textNodeAt(texts, 212, 101.19),
    name: textNodeAt(texts, 43.02, 185),
    namePh: textNodeAt(texts, 132, 186),
    title: textNodeAt(texts, 69.02, 241),
    dept: textNodeAt(texts, 43.02, 297),
    fee: textNodeAt(texts, 41.16, 353),
    years: textNodeAt(texts, 56, 409),
    rating: textNodeAt(texts, 50.52, 465),
    specialty: textNodeAt(texts, 56, 521),
    specialtyPh: textNodeAt(texts, 132, 520),
    status: textNodeAt(texts, 82, 597),
    active: textNodeAt(texts, 132, 598),
    cancel: textNodeAt(texts, 389, 683),
    ok: textNodeAt(texts, 457, 683),
  }
  const titleSample = textAt(texts, 132, 243)

  const [form, setForm] = useState<Partial<Doctor>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(
      initial ?? {
        name: '',
        title: titleSample || '',
        departmentId: departments[0]?.id,
        fee: 30,
        yearsExperience: 10,
        rating: 98,
        specialty: '',
        status: 'ACTIVE',
        avatar: '',
      },
    )
  }, [open, initial, departments, titleSample])

  const onOk = async () => {
    if (!form.name?.trim()) {
      message.error(labels.namePh?.characters || 'required')
      return
    }
    setSaving(true)
    try {
      if (initial?.id) {
        await apiFetch(`/api/doctors/${initial.id}`, {
          method: 'PUT',
          body: JSON.stringify({ ...form, id: initial.id }),
        })
      } else {
        await apiFetch('/api/doctors', {
          method: 'POST',
          body: JSON.stringify(form),
        })
      }
      message.success(labels.ok?.characters || 'ok')
      onSaved()
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'error')
    } finally {
      setSaving(false)
    }
  }

  // IR inputs order: name, title, dept, fee, years, rating, status (textarea separate)
  return (
    <IrModalShell
      open={open}
      onClose={onClose}
      card={card}
      screenId="doctor-create"
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
      {labels.avatar ? <IrText node={labels.avatar} variant="modal" /> : null}
      {upload ? (
        <div className="upload-box" style={boxStyle(upload.bounds)}>
          {labels.upload ? (
            <span
              style={{
                position: 'absolute',
                left: labels.upload.bounds.x - upload.bounds.x,
                top: labels.upload.bounds.y - upload.bounds.y,
                fontSize: labels.upload.style?.fontSize,
                lineHeight: `${labels.upload.style?.lineHeightPx ?? 14}px`,
                whiteSpace: 'nowrap',
              }}
            >
              {labels.upload.characters}
            </span>
          ) : null}
        </div>
      ) : null}
      {uploadSlot ? <IrIconSlot slot={uploadSlot} variant="modal" /> : null}
      {labels.hint1 ? <IrText node={labels.hint1} variant="modal" /> : null}
      {labels.hint2 ? <IrText node={labels.hint2} variant="modal" /> : null}

      {labels.name ? <IrText node={labels.name} variant="modal" /> : null}
      <IrModalReqMarks texts={texts} />
      {inputs[0] ? (
        <div className="ir-control-host" style={boxStyle(inputs[0].bounds)}>
          <Input
            placeholder={labels.namePh?.characters}
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          />
        </div>
      ) : null}

      {labels.title ? <IrText node={labels.title} variant="modal" /> : null}
      {inputs[1] ? (
        <div className="ir-control-host" style={boxStyle(inputs[1].bounds)}>
          <Input
            value={form.title}
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
          />
        </div>
      ) : null}

      {labels.dept ? <IrText node={labels.dept} variant="modal" /> : null}
      {inputs[2] ? (
        <div className="ir-control-host" style={boxStyle(inputs[2].bounds)}>
          <Select
            value={form.departmentId}
            onChange={(v) => setForm((p) => ({ ...p, departmentId: v }))}
            options={departments.map((d) => ({ value: d.id, label: d.name }))}
          />
        </div>
      ) : null}

      {labels.fee ? <IrText node={labels.fee} variant="modal" /> : null}
      {inputs[3] ? (
        <div className="ir-control-host" style={boxStyle(inputs[3].bounds)}>
          <InputNumber
            min={0}
            value={form.fee}
            onChange={(v) => setForm((p) => ({ ...p, fee: Number(v || 0) }))}
          />
        </div>
      ) : null}

      {labels.years ? <IrText node={labels.years} variant="modal" /> : null}
      {inputs[4] ? (
        <div className="ir-control-host" style={boxStyle(inputs[4].bounds)}>
          <InputNumber
            min={0}
            value={form.yearsExperience}
            onChange={(v) =>
              setForm((p) => ({ ...p, yearsExperience: Number(v || 0) }))
            }
          />
        </div>
      ) : null}

      {labels.rating ? <IrText node={labels.rating} variant="modal" /> : null}
      {inputs[5] ? (
        <div className="ir-control-host" style={boxStyle(inputs[5].bounds)}>
          <InputNumber
            min={0}
            max={100}
            value={form.rating}
            onChange={(v) => setForm((p) => ({ ...p, rating: Number(v || 0) }))}
          />
        </div>
      ) : null}

      {labels.specialty ? (
        <IrText node={labels.specialty} variant="modal" />
      ) : null}
      {textarea ? (
        <div className="ir-control-host" style={boxStyle(textarea.bounds)}>
          <Input.TextArea
            placeholder={labels.specialtyPh?.characters}
            value={form.specialty}
            onChange={(e) =>
              setForm((p) => ({ ...p, specialty: e.target.value }))
            }
          />
        </div>
      ) : null}

      {labels.status ? <IrText node={labels.status} variant="modal" /> : null}
      {inputs[6] ? (
        <div className="ir-control-host" style={boxStyle(inputs[6].bounds)}>
          <Select
            value={form.status}
            onChange={(v) => setForm((p) => ({ ...p, status: v }))}
            options={[
              { value: 'ACTIVE', label: labels.active?.characters || 'ACTIVE' },
            ]}
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

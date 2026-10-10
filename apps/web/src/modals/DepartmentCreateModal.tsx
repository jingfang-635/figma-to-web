import { useEffect, useState } from 'react'
import { Button, Input, InputNumber, Select, message } from 'antd'
import { apiFetch } from '../api/client'
import { IrIconSlot } from '../components/IrIconSlot'
import { IrModalShell } from '../components/IrModalShell'
import { IrText } from '../components/IrText'
import { modalBoxStyle as boxStyle } from '../ir/geometry'
import {
  controlByRole,
  controlsByRole,
  getLayoutIr,
  iconSlotsInBounds,
  textNodeAt,
} from '../ir/useLayoutIr'

type Department = {
  id?: number
  name: string
  icon: string
  description?: string
  sortOrder?: number
  status: string
}

export function DepartmentCreateModal({
  open,
  onClose,
  onSaved,
  initial,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  initial?: Department | null
}) {
  const ir = getLayoutIr('department-create')
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
    name: textNodeAt(texts, 43.02, 89),
    namePh: textNodeAt(texts, 132, 91),
    icon: textNodeAt(texts, 43.02, 145),
    upload: textNodeAt(texts, 138, 182.5),
    hint1: textNodeAt(texts, 212, 138),
    hint2: textNodeAt(texts, 212, 157.19),
    hint3: textNodeAt(texts, 212, 176.38),
    desc: textNodeAt(texts, 56, 241),
    descPh: textNodeAt(texts, 132, 242),
    sort: textNodeAt(texts, 82, 317),
    status: textNodeAt(texts, 82, 373),
    enabled: textNodeAt(texts, 132, 374),
    cancel: textNodeAt(texts, 389, 459),
    ok: textNodeAt(texts, 457, 459),
  }

  const [form, setForm] = useState<Department>({
    name: '',
    icon: 'default',
    description: '',
    sortOrder: 1,
    status: 'ENABLED',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(
      initial ?? {
        name: '',
        icon: 'default',
        description: '',
        sortOrder: 1,
        status: 'ENABLED',
      },
    )
  }, [open, initial])

  const onOk = async () => {
    if (!form.name.trim()) {
      message.error(labels.namePh?.characters || 'required')
      return
    }
    setSaving(true)
    try {
      if (initial?.id) {
        await apiFetch(`/api/departments/${initial.id}`, {
          method: 'PUT',
          body: JSON.stringify({ ...form, id: initial.id }),
        })
      } else {
        await apiFetch('/api/departments', {
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

  return (
    <IrModalShell
      open={open}
      onClose={onClose}
      card={card}
      screenId="department-create"
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
      {labels.name ? (
        <div className="form-label-abs" style={boxStyle(labels.name.bounds)}>
          {labels.name.characters}
          <span className="req">*</span>
        </div>
      ) : null}
      {inputs[0] ? (
        <div className="ir-control-host" style={boxStyle(inputs[0].bounds)}>
          <Input
            placeholder={labels.namePh?.characters}
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          />
        </div>
      ) : null}

      {labels.icon ? (
        <div className="form-label-abs" style={boxStyle(labels.icon.bounds)}>
          {labels.icon.characters}
          <span className="req">*</span>
        </div>
      ) : null}
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
      {labels.hint3 ? <IrText node={labels.hint3} variant="modal" /> : null}
      {/* icon value kept for API; not a geom control in IR */}
      <input
        type="hidden"
        value={form.icon}
        onChange={() => undefined}
      />

      {labels.desc ? (
        <div className="form-label-abs" style={boxStyle(labels.desc.bounds)}>
          {labels.desc.characters}
        </div>
      ) : null}
      {textarea ? (
        <div className="ir-control-host" style={boxStyle(textarea.bounds)}>
          <Input.TextArea
            placeholder={labels.descPh?.characters}
            value={form.description}
            onChange={(e) =>
              setForm((p) => ({ ...p, description: e.target.value }))
            }
          />
        </div>
      ) : null}

      {labels.sort ? (
        <div className="form-label-abs" style={boxStyle(labels.sort.bounds)}>
          {labels.sort.characters}
        </div>
      ) : null}
      {inputs[1] ? (
        <div className="ir-control-host" style={boxStyle(inputs[1].bounds)}>
          <InputNumber
            min={0}
            value={form.sortOrder}
            onChange={(v) =>
              setForm((p) => ({ ...p, sortOrder: Number(v || 0) }))
            }
          />
        </div>
      ) : null}

      {labels.status ? (
        <div className="form-label-abs" style={boxStyle(labels.status.bounds)}>
          {labels.status.characters}
        </div>
      ) : null}
      {inputs[2] ? (
        <div className="ir-control-host" style={boxStyle(inputs[2].bounds)}>
          <Select
            value={form.status}
            onChange={(v) => setForm((p) => ({ ...p, status: v }))}
            options={[
              {
                value: 'ENABLED',
                label: labels.enabled?.characters || 'ENABLED',
              },
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

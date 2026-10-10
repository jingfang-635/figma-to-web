import type { ReactNode } from 'react'
import { Modal } from 'antd'
import type { IrBounds } from '../ir/geometry'

/**
 * Ant Modal stripped so .ant-modal-content size == IR modal-card bounds.
 *
 * Positioning: the modal is viewport-centered (antd `centered`). The Figma
 * prototype draws each modal as a top-level frame beside the page frames, so
 * no on-page anchor exists in the prototype data; the anchor is a runtime
 * convention declared in visual-ir.modals[].anchor, not derived from IR.
 *
 * Content coordinates: modal IR frames each modal at 0,0 relative to the
 * card, so children use `modalBoxStyle`/`modalTextStyle` (no chrome shift).
 * This shell must never touch the page origin — it used to zero the shared
 * mutable origin while open and the restore path didn't exist, which shifted
 * the whole page by the chrome size the moment the modal closed.
 */
export function IrModalShell({
  open,
  onClose,
  card,
  screenId,
  template,
  children,
}: {
  open: boolean
  onClose: () => void
  card: IrBounds
  screenId: string
  template?: string
  children: ReactNode
}) {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      destroyOnClose
      centered
      width={card.width}
      wrapClassName="ir-modal-wrap"
      className="ir-modal"
      styles={{
        content: {
          width: card.width,
          height: card.height,
          padding: 0,
        },
        body: {
          padding: 0,
          height: card.height,
        },
      }}
      style={{ paddingBottom: 0 }}
      modalRender={(node) => (
        <div data-screen-id={screenId} data-template={template}>
          {node}
        </div>
      )}
    >
      <div
        className="ir-modal-card"
        style={{ width: card.width, height: card.height }}
      >
        {children}
      </div>
    </Modal>
  )
}
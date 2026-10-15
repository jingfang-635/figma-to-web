import type { IrText as IrTextModel } from '../ir/useLayoutIr'
import { IrText } from './IrText'

/**
 * Required-mark glyphs drawn as standalone TEXT nodes in modal Layout IR.
 * Must not be nested inside the label box — label bounds are text-tight and
 * embedding "*" forces a wrap that the prototype never shows.
 */
export function IrModalReqMarks({ texts }: { texts: IrTextModel[] }) {
  return texts
    .filter((t) => t.characters === '*')
    .map((node) => (
      <IrText
        key={node.nodeId ?? `${node.bounds.x},${node.bounds.y}`}
        node={node}
        variant="modal"
        className="form-label-req"
      />
    ))
}

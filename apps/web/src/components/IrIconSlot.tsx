import type { CSSProperties, ReactNode } from 'react'
import { boxStyle, modalBoxStyle } from '../ir/geometry'
import { iconComponentFor } from '../ir/iconRegistry'
import type { IrIcon } from '../ir/useLayoutIr'

/** AntD icons draw at 1em; the box is exactly the IR slot, so the glyph fills
 * the shorter side and the wrapper's rect stays equal to the slot bounds. */
const ICON_GLYPH_FILL = 1

/**
 * One Layout IR icon slot, rendered at its IR box.
 *
 * The gate's icon leg pairs these with the IR slots *by box*, so the wrapper
 * must be exactly the slot bounds and must declare both the symbol it was
 * resolved to and the IR nodeId it came from — a slot that is not rendered is
 * indistinguishable from a slot the page forgot.
 *
 * Variant: page slots shift by the chrome origin; modal slots map onto the
 * card directly (modal IR frames each modal at 0,0 relative to the card).
 */
export function IrIconSlot({
  slot,
  style,
  onClick,
  children,
  variant = 'page',
}: {
  slot: IrIcon
  style?: CSSProperties
  onClick?: () => void
  children?: ReactNode
  variant?: 'page' | 'modal'
}) {
  const Glyph = iconComponentFor(slot.symbol?.name)
  const glyph = Math.min(slot.bounds.width, slot.bounds.height) / ICON_GLYPH_FILL
  const place = variant === 'modal' ? modalBoxStyle : boxStyle
  return (
    <span
      data-ir-icon={slot.symbol?.name || 'unresolved'}
      data-ir-icon-node={slot.nodeId}
      onClick={onClick}
      style={place(slot.bounds, {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: glyph,
        lineHeight: 1,
        color: slot.color,
        ...style,
      })}
    >
      {children ?? (Glyph ? <Glyph /> : null)}
    </span>
  )
}
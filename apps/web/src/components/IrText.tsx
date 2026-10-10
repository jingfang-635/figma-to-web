import type { CSSProperties, ReactNode } from 'react'
import type { IrText as IrTextModel } from '../ir/useLayoutIr'
import { textStyle, modalTextStyle } from '../ir/geometry'

/**
 * One Layout IR text node at its IR box. Page variant shifts by the chrome
 * origin; modal variant maps bounds onto the card directly (modal IR frames
 * each modal at 0,0 relative to the card).
 */
export function IrText({
  node,
  children,
  className,
  style,
  variant = 'page',
}: {
  node: IrTextModel
  children?: ReactNode
  className?: string
  style?: CSSProperties
  variant?: 'page' | 'modal'
}) {
  const color =
    node.style?.color ||
    node.style?.fills?.[0]?.color ||
    undefined
  const place = variant === 'modal' ? modalTextStyle : textStyle
  return (
    <div
      className={className}
      style={place(node.bounds, { ...node.style, color }, style)}
      data-ir-text={node.characters}
    >
      {children ?? node.characters}
    </div>
  )
}
import type { ReactNode } from 'react'
import chromeDoc from '../generated/chrome.json'
import type { IrBounds } from '../ir/geometry'

/**
 * Fluid main-canvas: fills main column; children use IR coords shifted by
 * chrome origin (see `boxStyle` in geometry.ts).
 *
 * This component used to publish the origin into a mutable module value that
 * modal shells would zero while open — a cross-component write whose restore
 * path didn't exist (effects don't rerun on unchanged deps), so closing a
 * modal left the whole page shifted by the chrome size. The origin is now a
 * constant and this component carries no global state.
 */
export function IrCanvas({
  bounds,
  screenId,
  template,
  children,
  className,
  /** Accepted for call-site compatibility; the origin is constant either way. */
  fullFrame = false,
}: {
  bounds: IrBounds
  screenId: string
  template?: string
  children: ReactNode
  className?: string
  fullFrame?: boolean
}) {
  const ox = fullFrame ? 0 : chromeDoc.chrome.sidebar.width
  const oy = fullFrame ? 0 : chromeDoc.chrome.header.bounds.height
  const minH = Math.max(0, bounds.height - oy)

  return (
    <div
      className={`ir-canvas ${className || ''}`}
      data-screen-id={screenId}
      data-template={template}
      data-ir-origin-x={ox}
      data-ir-origin-y={oy}
      style={{
        position: 'relative',
        width: '100%',
        minHeight: '100%',
        height: '100%',
        overflow: 'auto',
        background: 'transparent',
      }}
    >
      <div
        className="ir-canvas__stage"
        style={{
          position: 'relative',
          width: '100%',
          minHeight: minH,
          boxSizing: 'border-box',
        }}
      >
        {children}
      </div>
    </div>
  )
}
import type { CSSProperties } from 'react'
import chromeDoc from '../generated/chrome.json'

export type IrBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type IrTextStyle = {
  fontFamily?: string
  fontSize?: number
  fontWeight?: number
  lineHeightPx?: number
  color?: string
}

export type IrOrigin = { x: number; y: number }

/**
 * Content-area origin (sidebar width / header height), constant for the app
 * lifetime. Modals are framed in their own coordinate space and never go
 * through this shift — modal content uses `modalBoxStyle` instead.
 *
 * This used to be a mutable module value that IrCanvas wrote on mount and
 * IrModalShell zeroed while open. Owning one origin across two lifecycles is a
 * race by construction: closing a modal re-rendered the page while the origin
 * was still 0,0 (page content jumped +sidebar/header), and nothing restored it
 * because IrCanvas's effect deps hadn't changed. Constants have no write path,
 * so the race class is gone.
 */
const CHROME_ORIGIN = {
  x: chromeDoc.chrome.sidebar.width,
  y: chromeDoc.chrome.header.bounds.height,
} as const

function shift(bounds: IrBounds): IrBounds {
  return {
    ...bounds,
    x: bounds.x - CHROME_ORIGIN.x,
    y: bounds.y - CHROME_ORIGIN.y,
  }
}

/** Content-area origin, for callers that place their own absolute box. */
export function getIrOrigin(): IrOrigin {
  return CHROME_ORIGIN
}

/** Absolute box relative to the content area (page canvas). */
export function boxStyle(
  bounds: IrBounds,
  extra?: CSSProperties,
): CSSProperties {
  const b = shift(bounds)
  return {
    position: 'absolute',
    left: b.x,
    top: b.y,
    width: b.width,
    height: b.height,
    boxSizing: 'border-box',
    ...extra,
  }
}

/**
 * Absolute box relative to the modal card itself. Modal IR frames each modal
 * at 0,0, so bounds map onto the card with no shift; modal content must never
 * read the page origin.
 */
export function modalBoxStyle(
  bounds: IrBounds,
  extra?: CSSProperties,
): CSSProperties {
  return {
    position: 'absolute',
    left: bounds.x,
    top: bounds.y,
    width: bounds.width,
    height: bounds.height,
    boxSizing: 'border-box',
    ...extra,
  }
}

/**
 * Absolute box that stretches to the main content right edge (fluid shell).
 * Keeps IR top/left/height; width follows container.
 */
export function fluidBoxStyle(
  bounds: IrBounds,
  extra?: CSSProperties,
  rightPad = 24,
): CSSProperties {
  const b = shift(bounds)
  return {
    position: 'absolute',
    left: b.x,
    top: b.y,
    right: rightPad,
    width: 'auto',
    height: b.height,
    boxSizing: 'border-box',
    ...extra,
  }
}

export function textStyle(
  bounds: IrBounds,
  style?: IrTextStyle,
  extra?: CSSProperties,
): CSSProperties {
  return {
    ...boxStyle(bounds),
    margin: 0,
    padding: 0,
    fontFamily: style?.fontFamily
      ? `${style.fontFamily}, var(--font-family), sans-serif`
      : undefined,
    fontSize: style?.fontSize,
    fontWeight: style?.fontWeight,
    lineHeight: style?.lineHeightPx ? `${style.lineHeightPx}px` : undefined,
    color: style?.color,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    ...extra,
  }
}

/** Text box relative to the modal card (see `modalBoxStyle`). */
export function modalTextStyle(
  bounds: IrBounds,
  style?: IrTextStyle,
  extra?: CSSProperties,
): CSSProperties {
  return {
    ...modalBoxStyle(bounds),
    margin: 0,
    padding: 0,
    fontFamily: style?.fontFamily
      ? `${style.fontFamily}, var(--font-family), sans-serif`
      : undefined,
    fontSize: style?.fontSize,
    fontWeight: style?.fontWeight,
    lineHeight: style?.lineHeightPx ? `${style.lineHeightPx}px` : undefined,
    color: style?.color,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    ...extra,
  }
}

export function geomControls<T extends { role: string }>(controls: T[]): T[] {
  return controls.filter((c) =>
    /^(input|textarea|select|checkbox|radio|date|number|button)/i.test(c.role),
  )
}
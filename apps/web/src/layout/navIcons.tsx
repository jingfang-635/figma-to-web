/**
 * Shell navigation icons are addressed by the symbol name carried in Layout IR
 * `icons[]` (role `nav-item`, reading order). No label → icon table lives here:
 * duplicating one is what let the sidebar drift away from the prototype.
 */
import type { ReactNode } from 'react'
import { iconNodeFor } from '../ir/iconRegistry'
import type { LayoutIr } from '../ir/useLayoutIr'
import { namedIconsByRole } from '../ir/useLayoutIr'

/** One entry per navigation item, in the same reading order as the IR slots. */
export function navSymbols(ir: LayoutIr): (string | undefined)[] {
  return namedIconsByRole(ir, 'nav-item').map((i) => i.symbol.name)
}

/** Section headers are labels without a slot; the chrome list marks none today. */
export function isNavSectionLabel(label: string): boolean {
  return label === '系统运营' || label === '系统管理'
}

export function navIconForSymbol(symbol?: string): ReactNode {
  return iconNodeFor(symbol)
}

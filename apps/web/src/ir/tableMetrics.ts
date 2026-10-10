import type { IrText } from './useLayoutIr'

/** antd Table size="middle" horizontal cell padding (px). */
export const CELL_PAD_X = 8

export type TableMetrics = {
  /** Table box in IR coordinates. */
  left: number
  right: number
  /** Widths of the leading columns, in IR px. The trailing column takes the rest. */
  leadingWidths: number[]
  /** Width the trailing (row-action) column must occupy at the IR viewport. */
  trailingWidth: number
}

/**
 * Column geometry recovered from the prototype's own header and row-action
 * text boxes.
 *
 * The prototype places every header label by hand, so the column boundaries are
 * read off those boxes rather than guessed: a leading column starts one cell-pad
 * left of its label, and the trailing column is the row-action cluster plus the
 * cell padding on both sides. The trailing column is deliberately left without a
 * width at render time so it absorbs the width the fluid shell adds when the
 * viewport grows, while the leading columns keep their prototype widths.
 */
export function tableMetrics(
  headers: (IrText | undefined)[],
  actions: (IrText | undefined)[],
): TableMetrics | undefined {
  const head = headers.filter(Boolean) as IrText[]
  const act = actions.filter(Boolean) as IrText[]
  if (head.length < 2 || act.length === 0) return undefined

  const starts = head.slice(0, -1).map((h) => h.bounds.x - CELL_PAD_X)
  const clusterLeft = Math.min(...act.map((a) => a.bounds.x))
  const clusterRight = Math.max(...act.map((a) => a.bounds.x + a.bounds.width))
  const trailingWidth = clusterRight - clusterLeft + 2 * CELL_PAD_X

  const last = head[head.length - 1]
  const trailingStart = last.bounds.x + last.bounds.width / 2 - trailingWidth / 2
  const bounds = [...starts, trailingStart, trailingStart + trailingWidth]

  return {
    left: bounds[0],
    right: bounds[bounds.length - 1],
    leadingWidths: starts.map((s, i) => bounds[i + 1] - s),
    trailingWidth,
  }
}

export type TableRowMetrics = {
  /** Height of the header band, in IR px. */
  headerHeight: number
  /** Pitch between consecutive rows (row height), in IR px. */
  rowHeight: number
  /** Rows the prototype drew on the page — the page size it implies. */
  pageSize: number
}

/**
 * Row geometry recovered from the prototype's own text boxes.
 *
 * `tableMetrics` reads the header labels for column boundaries; the band
 * heights are readable from the same boxes and are just as much a design fact.
 * AntD's defaults (row ≈69px, header ≈47px) are taller than the prototype's, so
 * a page that draws one row per prototype row still overflows a card whose
 * height is the IR's — the card then has to grow, which is visible.
 *
 * The row pitch comes from the row-action labels: the first two inside the same
 * column are one pitch apart. The header band follows from the offset between
 * the header label and the first row label, which is half of each band. The
 * number of rows the prototype drew is exactly the page size it implies.
 */
export function tableRowMetrics(
  texts: IrText[],
  headers: (IrText | undefined)[],
  actionLabels: string[],
): TableRowMetrics | undefined {
  const head = headers.filter(Boolean) as IrText[]
  if (!head.length || !actionLabels.length) return undefined
  const acts = texts
    .filter((t) => actionLabels.includes(t.characters))
    .sort((a, z) => a.bounds.y - z.bounds.y || a.bounds.x - z.bounds.x)
  if (acts.length < 2) return undefined
  // Keep one action column (the row "edit" label), so consecutive entries are
  // consecutive rows rather than the two labels of the same row.
  const columnX = acts[0].bounds.x
  const column = acts.filter((t) => Math.abs(t.bounds.x - columnX) < 2)
  if (column.length < 2) return undefined
  const rowHeight = column[1].bounds.y - column[0].bounds.y
  if (rowHeight <= 0) return undefined
  const headerHeight = 2 * (column[0].bounds.y - head[0].bounds.y) - rowHeight
  if (headerHeight <= 0) return undefined
  return { headerHeight, rowHeight, pageSize: column.length }
}

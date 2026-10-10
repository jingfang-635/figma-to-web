import { forwardRef, type ComponentPropsWithoutRef } from 'react'

/**
 * Table body wrapper that declares the rows as live data.
 *
 * Rows are filled from the API, so their count and values are seed data rather
 * than prototype layout. Tagging the body lets the gate's text/icon legs assert
 * the chrome, the labels and the column headers while treating the prototype's
 * sample rows as values that will differ — the same rule already applied to
 * form-control values.
 */
export const LiveTableBody = forwardRef<
  HTMLTableSectionElement,
  ComponentPropsWithoutRef<'tbody'>
>(function LiveTableBody(props, ref) {
  return <tbody ref={ref} data-ir-live="table-body" {...props} />
})

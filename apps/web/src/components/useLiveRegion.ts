import { useLayoutEffect, type RefObject } from 'react'

/**
 * Mark an element AntD renders on its own (the table pagination, for instance)
 * as live data.
 *
 * The count and the page numbers come from the API, so the prototype's sample
 * values there are seed data, not layout. AntD owns that markup, so the marker
 * is applied after render instead of through JSX.
 */
export function useLiveRegion(
  host: RefObject<HTMLElement | null>,
  selector: string,
  key: string,
) {
  useLayoutEffect(() => {
    const el = host.current?.querySelector(selector)
    if (el) el.setAttribute('data-ir-live', key)
  })
}

// Shared value formatting for read-only grids (table view + console results).

/** True for a SQL NULL, which surfaces in JS as null or undefined. */
export function isNullish(value: unknown): boolean {
  return value === null || value === undefined
}

/** Renders a cell value as text: '' for nullish, JSON for objects, otherwise String(). */
export function displayValue(value: unknown): string {
  if (isNullish(value)) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

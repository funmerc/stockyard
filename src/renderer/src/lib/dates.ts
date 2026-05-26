// Date handling for the row grid/editor.
//
// SQLite has no date type — values live as ISO-8601 text, Unix epoch seconds, or
// epoch milliseconds. We detect a column as a date by its declared type, detect
// each value's storage from the value itself (auto), display/enter datetimes in
// local time, and store the chosen format as a UTC instant.

export type DateKind = 'datetime' | 'date'
export type DateStorage = 'text' | 'epoch-s' | 'epoch-ms'

const pad = (value: number): string => String(value).padStart(2, '0')

/** Detects whether a column is a date by its declared SQLite type. */
export function dateKind(type: string): DateKind | null {
  if (/DATETIME|TIMESTAMP/i.test(type)) return 'datetime'
  if (/DATE/i.test(type)) return 'date'
  return null
}

/**
 * Detects how a single value is stored. Numbers are epoch; the magnitude tells
 * seconds vs milliseconds (any realistic ms timestamp is >= 1e11, seconds < 1e11).
 */
export function detectStorage(value: unknown): DateStorage | null {
  if (typeof value === 'number') return Math.abs(value) >= 1e11 ? 'epoch-ms' : 'epoch-s'
  if (typeof value === 'string' && value.trim() !== '') return 'text'
  return null
}

/** Picks a column's storage format from a sample of its values (for new inserts). */
export function inferStorage(values: unknown[]): DateStorage {
  for (const value of values) {
    const storage = detectStorage(value)
    if (storage) return storage
  }
  return 'text'
}

/** Parses a stored value into a UTC epoch (ms). Returns null if unparseable. */
export function toEpochMs(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const storage = detectStorage(value)
  if (storage === 'epoch-s') return (value as number) * 1000
  if (storage === 'epoch-ms') return value as number

  // Text: normalize "YYYY-MM-DD[ T]HH:MM[:SS]" and treat naive values as UTC.
  const text = String(value).trim()
  const match = text.match(
    /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?))?(Z|[+-]\d{2}:?\d{2})?$/
  )
  const iso = match ? `${match[1]}T${match[2] ?? '00:00:00'}${match[3] ?? 'Z'}` : text
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : ms
}

/** Human-readable display: datetimes in local time, dates as their UTC calendar day. */
export function formatForDisplay(value: unknown, kind: DateKind): string {
  const ms = toEpochMs(value)
  if (ms === null) return value === null || value === undefined ? '' : String(value)
  const date = new Date(ms)
  if (kind === 'date') {
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** Value for an <input type="date|datetime-local"> (local time for datetimes). */
export function toPickerValue(value: unknown, kind: DateKind): string {
  const ms = toEpochMs(value)
  if (ms === null) return ''
  const date = new Date(ms)
  if (kind === 'date') {
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function nowPickerValue(kind: DateKind): string {
  return toPickerValue(Date.now(), kind)
}

/** Current UTC datetime as text ("YYYY-MM-DD HH:MM:SS") — matches text date storage. */
export function nowUtcText(): string {
  const date = new Date()
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
}

/** Current time as Unix epoch seconds (UTC). */
export function nowEpochSeconds(): number {
  return Math.round(Date.now() / 1000)
}

/** Converts a picker value (local) to the stored format (UTC instant). */
export function fromPickerValue(
  picker: string,
  kind: DateKind,
  storage: DateStorage
): string | number | null {
  if (picker === '') return null

  let ms: number
  if (kind === 'date') {
    const [year, month, day] = picker.split('-').map(Number)
    ms = Date.UTC(year, month - 1, day) // date-only: fix to UTC midnight (no tz shift)
  } else {
    ms = new Date(picker).getTime() // datetime-local is parsed as local time
  }
  if (Number.isNaN(ms)) return null

  if (storage === 'epoch-s') return Math.round(ms / 1000)
  if (storage === 'epoch-ms') return ms

  const date = new Date(ms)
  if (kind === 'date') {
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
  }
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
}

/** Short label describing how a date column is stored. */
export function storageLabel(storage: DateStorage): string {
  return storage === 'epoch-s'
    ? 'integer · epoch seconds'
    : storage === 'epoch-ms'
      ? 'integer · epoch ms'
      : 'text'
}

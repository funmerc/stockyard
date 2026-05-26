import type { SqlKind } from './types'

// Statements that begin a read-only query. Anything else is treated as a write
// (requires confirmation) — classification is fail-safe toward confirmation, so the
// worst case is an unnecessary prompt on a read, never an un-confirmed write.
// Note: `WITH` (CTE) is intentionally excluded — it can terminate in INSERT/UPDATE/DELETE.
const READ_KEYWORDS = new Set(['SELECT', 'EXPLAIN', 'PRAGMA', 'VALUES'])

/** First SQL keyword, after skipping leading whitespace, comments, and `(`. */
function leadingKeyword(sql: string): string {
  let remaining = sql
  for (;;) {
    const before = remaining
    remaining = remaining.replace(/^\s+/, '')
    remaining = remaining.replace(/^--[^\n]*\n?/, '') // line comment
    remaining = remaining.replace(/^\/\*[\s\S]*?\*\//, '') // block comment
    remaining = remaining.replace(/^\(+/, '')
    if (remaining === before) break
  }
  const match = remaining.match(/^[a-zA-Z]+/)
  return match ? match[0].toUpperCase() : ''
}

export function classifySql(sql: string): SqlKind {
  return READ_KEYWORDS.has(leadingKeyword(sql)) ? 'read' : 'write'
}

/** Guard for the read path: true only for statements that cannot mutate. */
export function isReadOnlySql(sql: string): boolean {
  return classifySql(sql) === 'read'
}

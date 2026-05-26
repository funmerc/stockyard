import type { D1Column, WriteOp } from '../shared/types'
import { quoteIdent } from './sql'

export interface Statement {
  sql: string
  params: unknown[]
}

/**
 * Builds a WHERE clause identifying one row, by priority:
 *   1. primary key column(s)
 *   2. `rowid` (present as a hidden column when the table has no PK but has a rowid)
 *   3. all columns (WITHOUT ROWID tables with no PK) — may match duplicates.
 */
export function buildWhere(columns: D1Column[], row: Record<string, unknown>): Statement {
  const pks = columns.filter((column) => column.pk).map((column) => column.name)

  if (pks.length === 0 && '_rowid_' in row) {
    return { sql: 'rowid = ?', params: [row['_rowid_']] }
  }

  const idColumns = pks.length ? pks : columns.map((column) => column.name)
  const parts: string[] = []
  const params: unknown[] = []
  for (const col of idColumns) {
    const value = row[col]
    if (value === null || value === undefined) {
      parts.push(`${quoteIdent(col)} IS NULL`)
    } else {
      parts.push(`${quoteIdent(col)} = ?`)
      params.push(value)
    }
  }
  return { sql: parts.join(' AND '), params }
}

/** Builds the INSERT/UPDATE/DELETE statement for a write op. */
export function buildStatement(op: WriteOp, columns: D1Column[]): Statement {
  const table = quoteIdent(op.table)

  if (op.kind === 'insert') {
    const cols = Object.keys(op.values)
    if (cols.length === 0) return { sql: `INSERT INTO ${table} DEFAULT VALUES`, params: [] }
    const placeholders = cols.map(() => '?').join(', ')
    return {
      sql: `INSERT INTO ${table} (${cols.map(quoteIdent).join(', ')}) VALUES (${placeholders})`,
      params: cols.map((column) => op.values[column])
    }
  }

  const where = buildWhere(columns, op.row)
  if (op.kind === 'delete') {
    return { sql: `DELETE FROM ${table} WHERE ${where.sql}`, params: where.params }
  }

  const setCols = Object.keys(op.changes)
  const setSql = setCols.map((column) => `${quoteIdent(column)} = ?`).join(', ')
  return {
    sql: `UPDATE ${table} SET ${setSql} WHERE ${where.sql}`,
    params: [...setCols.map((column) => op.changes[column]), ...where.params]
  }
}

/** SELECT that returns the rows an update/delete would touch (for the preview). Null for insert. */
export function selectAffected(op: WriteOp, columns: D1Column[]): Statement | null {
  if (op.kind === 'insert') return null
  const where = buildWhere(columns, op.row)
  return { sql: `SELECT * FROM ${quoteIdent(op.table)} WHERE ${where.sql}`, params: where.params }
}

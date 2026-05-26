import Database from 'better-sqlite3'
import { existsSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import type {
  D1Column,
  DatabaseDescriptor,
  DatabaseRef,
  TablePage,
  WritePreview
} from '../../shared/types'
import { LIST_TABLES_SQL, quoteIdent } from '../sql'
import type { Statement } from '../write'

// Thrown to force a better-sqlite3 transaction to roll back after a dry-run.
const ROLLBACK = Symbol('rollback')

// Runs a mutation inside a transaction that always rolls back, returning the change
// count it would have produced. Nothing is committed.
function previewChanges(db: Database.Database, runStatement: () => number): number {
  let changes = 0
  const transaction = db.transaction(() => {
    changes = runStatement()
    throw ROLLBACK // abort so nothing is committed
  })
  try {
    transaction()
  } catch (cause) {
    if (cause !== ROLLBACK) throw cause
  }
  return changes
}

// Where `wrangler dev` (miniflare) keeps local D1 SQLite files.
const D1_STATE_DIR = join('.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject')

// Cache open handles by file path (better-sqlite3 connections are synchronous & cheap to keep).
const handles = new Map<string, Database.Database>()

function open(filePath: string): Database.Database {
  let db = handles.get(filePath)
  if (!db) {
    db = new Database(filePath, { fileMustExist: true })
    handles.set(filePath, db)
  }
  return db
}

/** True if the project folder contains a local D1 state directory. */
export function hasLocalState(projectPath: string): boolean {
  return existsSync(join(projectPath, D1_STATE_DIR))
}

/** Discovers local D1 databases (one per `.sqlite` file) in a wrangler project. */
export function discoverDatabases(connectionId: string, projectPath: string): DatabaseDescriptor[] {
  const dir = join(projectPath, D1_STATE_DIR)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((file) => file.endsWith('.sqlite'))
    .map((file) => {
      const name = basename(file, '.sqlite')
      const ref: DatabaseRef = { connectionId, kind: 'local', filePath: join(dir, file), name }
      return { name, ref }
    })
}

export function listTables(filePath: string): string[] {
  const rows = open(filePath).prepare(LIST_TABLES_SQL).all() as { name: string }[]
  return rows.map((row) => row.name)
}

export function getColumns(filePath: string, table: string): D1Column[] {
  const colsRaw = open(filePath)
    .prepare(`PRAGMA table_info(${quoteIdent(table)})`)
    .all() as Array<{ name: string; type: string | null; notnull: number; pk: number }>
  return colsRaw.map((column) => ({
    name: column.name,
    type: column.type ?? '',
    notnull: Boolean(column.notnull),
    pk: Boolean(column.pk)
  }))
}

export function getTableData(
  filePath: string,
  table: string,
  limit: number,
  offset: number
): TablePage {
  const db = open(filePath)
  const ident = quoteIdent(table)
  const columns = getColumns(filePath, table)
  const { count } = db.prepare(`SELECT COUNT(*) AS count FROM ${ident}`).get() as { count: number }

  // For tables without a PK, also fetch rowid (hidden) so rows can be identified
  // for edits/deletes. WITHOUT ROWID tables have no rowid, so fall back.
  let rows: Record<string, unknown>[]
  if (columns.some((column) => column.pk)) {
    rows = db.prepare(`SELECT * FROM ${ident} LIMIT ? OFFSET ?`).all(limit, offset) as Record<
      string,
      unknown
    >[]
  } else {
    try {
      rows = db
        .prepare(`SELECT rowid AS _rowid_, * FROM ${ident} LIMIT ? OFFSET ?`)
        .all(limit, offset) as Record<string, unknown>[]
    } catch {
      rows = db.prepare(`SELECT * FROM ${ident} LIMIT ? OFFSET ?`).all(limit, offset) as Record<
        string,
        unknown
      >[]
    }
  }

  return { columns, rows, total: count }
}

/** Runs the statement inside a rolled-back transaction to report exactly what it would do. */
export function dryRun(
  filePath: string,
  stmt: Statement,
  select: Statement | null,
  insertedRow: Record<string, unknown> | null
): WritePreview {
  const db = open(filePath)
  const affectedRows = select
    ? (db.prepare(select.sql).all(select.params) as Record<string, unknown>[])
    : insertedRow
      ? [insertedRow]
      : []

  const changes = previewChanges(db, () => db.prepare(stmt.sql).run(stmt.params).changes)

  return { sql: stmt.sql, params: stmt.params, affectedRows, affectedCount: changes, dryRun: true }
}

export function execute(filePath: string, stmt: Statement): number {
  return open(filePath).prepare(stmt.sql).run(stmt.params).changes
}

// --- SQL console (arbitrary statements) ---

/** Runs a read-only statement and returns its columns + rows (columns survive 0-row results). */
export function runRead(
  filePath: string,
  sql: string
): { columns: string[]; rows: Record<string, unknown>[]; durationMs: number } {
  const stmt = open(filePath).prepare(sql)
  if (!stmt.reader) throw new Error('Statement does not return rows')
  const startedAt = Date.now()
  const rows = stmt.all() as Record<string, unknown>[]
  const durationMs = Date.now() - startedAt
  const columns = stmt.columns().map((column) => column.name)
  return { columns, rows, durationMs }
}

/** Runs a write statement in a rolled-back transaction to report its exact affected-row count. */
export function rawDryRun(filePath: string, sql: string): number {
  const db = open(filePath)
  return previewChanges(db, () => db.prepare(sql).run().changes)
}

export function rawExecute(filePath: string, sql: string): number {
  return open(filePath).prepare(sql).run().changes
}

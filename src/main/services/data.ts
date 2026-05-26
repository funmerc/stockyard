import type {
  CloudflareAccount,
  ConsoleResult,
  D1Column,
  DatabaseDescriptor,
  DatabaseRef,
  RawWritePreview,
  TablePage,
  WriteOp,
  WritePreview,
  WriteResult
} from '../../shared/types'
import { isReadOnlySql } from '../../shared/sql-kind'
import * as cf from '../cloudflare/api'
import { getConnection } from '../connections/store'
import * as local from '../local/sqlite'
import { LIST_TABLES_SQL, quoteIdent } from '../sql'
import { buildStatement, selectAffected } from '../write'

function remoteToken(connectionId: string): string {
  const conn = getConnection(connectionId)
  if (!conn) throw new Error('Connection not found')
  if (conn.type !== 'remote') throw new Error('Not a remote connection')
  return conn.token
}

function remoteQuery(
  ref: DatabaseRef,
  sql: string,
  params: unknown[] = []
): ReturnType<typeof cf.queryD1> {
  if (ref.kind !== 'remote') throw new Error('Not a remote database')
  return cf.queryD1(remoteToken(ref.connectionId), ref.accountId, ref.databaseId, sql, params)
}

function mapColumns(rows: Record<string, unknown>[]): D1Column[] {
  return rows.map((column) => ({
    name: String(column.name),
    type: String(column.type ?? ''),
    notnull: Boolean(column.notnull),
    pk: Boolean(column.pk)
  }))
}

async function getColumns(ref: DatabaseRef, table: string): Promise<D1Column[]> {
  if (ref.kind === 'local') return local.getColumns(ref.filePath, table)
  const res = await remoteQuery(ref, `PRAGMA table_info(${quoteIdent(table)})`)
  return mapColumns(res.results)
}

/** Accounts for a remote connection (the extra tree level remote connections have). */
export function listAccounts(connectionId: string): Promise<CloudflareAccount[]> {
  return cf.listAccounts(remoteToken(connectionId))
}

/** Databases under a connection. Remote needs an accountId; local scans the project folder. */
export async function listDatabases(
  connectionId: string,
  accountId?: string
): Promise<DatabaseDescriptor[]> {
  const conn = getConnection(connectionId)
  if (!conn) throw new Error('Connection not found')

  if (conn.type === 'remote') {
    if (!accountId) throw new Error('accountId required for a remote connection')
    const dbs = await cf.listD1Databases(conn.token, accountId)
    return dbs.map((database) => ({
      name: database.name,
      ref: {
        connectionId,
        kind: 'remote',
        accountId,
        databaseId: database.uuid,
        name: database.name
      }
    }))
  }
  return local.discoverDatabases(connectionId, conn.projectPath)
}

export async function listTables(ref: DatabaseRef): Promise<string[]> {
  if (ref.kind === 'local') return local.listTables(ref.filePath)
  const { results } = await remoteQuery(ref, LIST_TABLES_SQL)
  return results.map((row) => String(row.name))
}

export async function getTableData(
  ref: DatabaseRef,
  table: string,
  limit: number,
  offset: number
): Promise<TablePage> {
  if (ref.kind === 'local') return local.getTableData(ref.filePath, table, limit, offset)

  const ident = quoteIdent(table)
  const columns = await getColumns(ref, table)
  const countRes = await remoteQuery(ref, `SELECT COUNT(*) AS count FROM ${ident}`)
  const total = Number(countRes.results[0]?.count ?? 0)

  // For PK-less tables, fetch rowid (hidden) so rows can be edited/deleted.
  let rows: Record<string, unknown>[]
  if (columns.some((column) => column.pk)) {
    rows = (await remoteQuery(ref, `SELECT * FROM ${ident} LIMIT ? OFFSET ?`, [limit, offset]))
      .results
  } else {
    try {
      rows = (
        await remoteQuery(ref, `SELECT rowid AS _rowid_, * FROM ${ident} LIMIT ? OFFSET ?`, [
          limit,
          offset
        ])
      ).results
    } catch {
      rows = (await remoteQuery(ref, `SELECT * FROM ${ident} LIMIT ? OFFSET ?`, [limit, offset]))
        .results
    }
  }

  return { columns, rows, total }
}

/** Previews a write: local runs it in a rolled-back transaction; remote estimates via SELECT. */
export async function prepareWrite(ref: DatabaseRef, op: WriteOp): Promise<WritePreview> {
  const columns = await getColumns(ref, op.table)
  const stmt = buildStatement(op, columns)
  const select = selectAffected(op, columns)
  const insertedRow = op.kind === 'insert' ? op.values : null

  if (ref.kind === 'local') return local.dryRun(ref.filePath, stmt, select, insertedRow)

  const affectedRows = select
    ? (await remoteQuery(ref, select.sql, select.params)).results
    : insertedRow
      ? [insertedRow]
      : []
  return {
    sql: stmt.sql,
    params: stmt.params,
    affectedRows,
    affectedCount: op.kind === 'insert' ? 1 : affectedRows.length,
    dryRun: false
  }
}

/** Commits a write. Local: single-statement transaction. Remote: atomic query. */
export async function executeWrite(ref: DatabaseRef, op: WriteOp): Promise<WriteResult> {
  const columns = await getColumns(ref, op.table)
  const stmt = buildStatement(op, columns)
  if (ref.kind === 'local') return { changes: local.execute(ref.filePath, stmt) }
  const res = await remoteQuery(ref, stmt.sql, stmt.params)
  return { changes: Number(res.meta?.changes ?? 0) }
}

// --- SQL console (arbitrary statements) ---

/** Runs a read-only console statement. Guards against non-reads so a write can't bypass confirm. */
export async function consoleRead(ref: DatabaseRef, sql: string): Promise<ConsoleResult> {
  if (!isReadOnlySql(sql)) throw new Error('Only read-only statements can run on the read path')
  if (ref.kind === 'local') return local.runRead(ref.filePath, sql)
  const res = await remoteQuery(ref, sql)
  const rows = res.results
  // D1 returns no separate column metadata, so infer from the first row (empty → no columns).
  const columns = rows.length ? Object.keys(rows[0]) : []
  return { columns, rows, rowsRead: res.meta?.rows_read, durationMs: res.meta?.duration }
}

/** Previews a console write. Local dry-runs for an exact count; remote can't preview safely. */
export async function consolePrepareWrite(ref: DatabaseRef, sql: string): Promise<RawWritePreview> {
  if (ref.kind === 'local') {
    return { sql, affectedCount: local.rawDryRun(ref.filePath, sql), dryRun: true }
  }
  return { sql, affectedCount: null, dryRun: false }
}

/** Commits a console write. */
export async function consoleExecuteWrite(
  ref: DatabaseRef,
  sql: string
): Promise<{ changes: number }> {
  if (ref.kind === 'local') return { changes: local.rawExecute(ref.filePath, sql) }
  const res = await remoteQuery(ref, sql)
  return { changes: Number(res.meta?.changes ?? 0) }
}

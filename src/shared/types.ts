// Types shared across the main, preload, and renderer processes.

export type ConnectionType = 'remote' | 'local'

/**
 * A saved data source, as seen by the renderer — never includes secrets.
 * `remote` = a Cloudflare API token; `local` = a wrangler project folder whose
 * `.wrangler` dir holds local D1 SQLite files.
 */
export interface ConnectionSummary {
  id: string
  label: string
  type: ConnectionType
  /** Present for local connections only. */
  projectPath?: string
}

/** A Cloudflare account a remote connection's token can access. */
export interface CloudflareAccount {
  id: string
  name: string
}

/** A D1 database from the REST API (`GET /accounts/{id}/d1/database`). */
export interface D1Database {
  uuid: string
  name: string
  version?: string
  num_tables?: number
  file_size?: number
  created_at?: string
}

/**
 * Everything the main process needs to reach one specific database. The renderer
 * holds these and passes them back for data ops; the actual token (for remote) is
 * resolved in main from `connectionId` and never travels to the renderer.
 */
export type DatabaseRef =
  | { connectionId: string; kind: 'remote'; accountId: string; databaseId: string; name: string }
  | { connectionId: string; kind: 'local'; filePath: string; name: string }

/** A database listed under a connection (name + the ref needed to query it). */
export interface DatabaseDescriptor {
  name: string
  ref: DatabaseRef
}

/** A column of a table (from `PRAGMA table_info`). */
export interface D1Column {
  name: string
  type: string
  notnull: boolean
  pk: boolean
}

/** A page of rows from a table, plus column metadata and total row count. */
export interface TablePage {
  columns: D1Column[]
  rows: Record<string, unknown>[]
  total: number
}

/**
 * A pending write. `row` (update/delete) is the original full row used to
 * identify it (it may carry a hidden `_rowid_`); `changes`/`values` hold the new
 * column values.
 */
export type WriteOp =
  | {
      kind: 'update'
      table: string
      row: Record<string, unknown>
      changes: Record<string, unknown>
    }
  | { kind: 'insert'; table: string; values: Record<string, unknown> }
  | { kind: 'delete'; table: string; row: Record<string, unknown> }

/** What a write would do, shown in the confirmation before it runs. */
export interface WritePreview {
  sql: string
  params: unknown[]
  /** Rows the statement matches now (update/delete) or the new row (insert). */
  affectedRows: Record<string, unknown>[]
  affectedCount: number
  /** true = locally executed then rolled back (exact); false = estimated via SELECT (remote). */
  dryRun: boolean
}

export interface WriteResult {
  changes: number
}

/** Default number of rows fetched per page in the table grid. */
export const PAGE_SIZE = 50

/** Interface scale profiles (General settings) — drives the window zoom factor. */
export type UiSize = 'small' | 'medium' | 'large' | 'x-large'

/** Whether a SQL statement only reads (safe to run directly) or may mutate (needs confirm). */
export type SqlKind = 'read' | 'write'

/** What the SQL console is targeting when opened from the tree. */
export type ConsoleTarget =
  | { scope: 'account'; connectionId: string; accountId: string }
  | { scope: 'database'; ref: DatabaseRef }
  | { scope: 'table'; ref: DatabaseRef; table: string }

/** Result of a console read (arbitrary SELECT/PRAGMA/etc.). */
export interface ConsoleResult {
  columns: string[]
  rows: Record<string, unknown>[]
  rowsRead?: number
  durationMs?: number
}

/** Preview shown before a console write runs. `affectedCount` is null when it can't be previewed (remote). */
export interface RawWritePreview {
  sql: string
  affectedCount: number | null
  dryRun: boolean
}

/** Theme choices — `auto` follows the OS via Electron's nativeTheme. */
export type ThemeChoice = 'auto' | 'light' | 'dark'

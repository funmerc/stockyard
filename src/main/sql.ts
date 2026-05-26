// Small SQL helpers shared by the remote (REST) and local (SQLite) data paths.

/** Quotes a SQL identifier (table/column). Names come from sqlite_master, but quote anyway. */
export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

/** Lists user tables, hiding SQLite and Cloudflare internal tables. */
export const LIST_TABLES_SQL =
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name"

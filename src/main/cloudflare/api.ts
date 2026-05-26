import type { CloudflareAccount, D1Database } from '../../shared/types'

const BASE_URL = 'https://api.cloudflare.com/client/v4'

/** Standard Cloudflare API response envelope. */
interface CfEnvelope<T> {
  success: boolean
  errors: { code: number; message: string }[]
  result: T
}

async function cfGet<T>(token: string, path: string): Promise<CfEnvelope<T>> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  })
  return (await res.json()) as CfEnvelope<T>
}

async function cfPost<T>(token: string, path: string, body: unknown): Promise<CfEnvelope<T>> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  return (await res.json()) as CfEnvelope<T>
}

function firstError<T>(env: CfEnvelope<T>, fallback: string): string {
  return env.errors?.[0]?.message ?? fallback
}

/** Confirms the token is a valid, currently-active API token (`/user/tokens/verify`). */
export async function verifyToken(token: string): Promise<boolean> {
  try {
    const env = await cfGet<{ id: string; status: string }>(token, '/user/tokens/verify')
    return env.success && env.result?.status === 'active'
  } catch {
    return false
  }
}

/**
 * Returns the account email via `GET /user`. This requires the token to carry the
 * "User Details: Read" permission; if it doesn't (common for D1-scoped tokens),
 * the call fails and we return undefined so the caller can fall back gracefully.
 */
export async function getUserEmail(token: string): Promise<string | undefined> {
  try {
    const env = await cfGet<{ email?: string }>(token, '/user')
    return env.success ? env.result?.email : undefined
  } catch {
    return undefined
  }
}

/** Lists the accounts the token can access (`GET /accounts`). */
export async function listAccounts(token: string): Promise<CloudflareAccount[]> {
  const env = await cfGet<{ id: string; name: string }[]>(token, '/accounts')
  if (!env.success) throw new Error(firstError(env, 'Failed to list accounts'))
  return env.result.map((account) => ({ id: account.id, name: account.name }))
}

/** Lists D1 databases for an account (`GET /accounts/{id}/d1/database`). */
export async function listD1Databases(token: string, accountId: string): Promise<D1Database[]> {
  const env = await cfGet<D1Database[]>(token, `/accounts/${accountId}/d1/database?per_page=1000`)
  if (!env.success) throw new Error(firstError(env, 'Failed to list databases'))
  return env.result
}

/** Result of one SQL statement run against a D1 database. */
export interface D1QueryResult {
  results: Record<string, unknown>[]
  meta: {
    rows_read?: number
    rows_written?: number
    changes?: number
    last_row_id?: number
    duration?: number
  }
}

/**
 * Runs a single SQL statement against a D1 database via the query endpoint.
 * `params` bind to `?` placeholders. Throws with the API error message on failure.
 */
export async function queryD1(
  token: string,
  accountId: string,
  databaseId: string,
  sql: string,
  params: unknown[] = []
): Promise<D1QueryResult> {
  const env = await cfPost<D1QueryResult[]>(
    token,
    `/accounts/${accountId}/d1/database/${databaseId}/query`,
    { sql, params }
  )
  if (!env.success) throw new Error(firstError(env, 'Query failed'))
  const first = env.result?.[0]
  if (!first) throw new Error('Query returned no result')
  return first
}

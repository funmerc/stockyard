import { app, safeStorage } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ConnectionSummary } from '../../shared/types'
import type { Connection, LocalConnection, RemoteConnection } from './types'

// Persisted shape: remote tokens are encrypted at rest with safeStorage (the same
// {enc,data} envelope the old single-token cf-credential.json used).
interface Encrypted {
  enc: boolean
  data: string
}
type Persisted =
  | { id: string; label: string; type: 'remote'; token: Encrypted }
  | { id: string; label: string; type: 'local'; projectPath: string }

const connectionsFile = (): string => join(app.getPath('userData'), 'connections.json')
const legacyFile = (): string => join(app.getPath('userData'), 'cf-credential.json')

function encrypt(text: string): Encrypted {
  const enc = safeStorage.isEncryptionAvailable()
  const buf = enc ? safeStorage.encryptString(text) : Buffer.from(text, 'utf8')
  return { enc, data: buf.toString('base64') }
}

function decrypt(encrypted: Encrypted): string {
  const buf = Buffer.from(encrypted.data, 'base64')
  return encrypted.enc ? safeStorage.decryptString(buf) : buf.toString('utf8')
}

function toPersisted(connection: Connection): Persisted {
  return connection.type === 'remote'
    ? {
        id: connection.id,
        label: connection.label,
        type: 'remote',
        token: encrypt(connection.token)
      }
    : {
        id: connection.id,
        label: connection.label,
        type: 'local',
        projectPath: connection.projectPath
      }
}

function fromPersisted(persisted: Persisted): Connection {
  return persisted.type === 'remote'
    ? { id: persisted.id, label: persisted.label, type: 'remote', token: decrypt(persisted.token) }
    : {
        id: persisted.id,
        label: persisted.label,
        type: 'local',
        projectPath: persisted.projectPath
      }
}

let cache: Connection[] | undefined

function persist(conns: Connection[]): void {
  writeFileSync(connectionsFile(), JSON.stringify(conns.map(toPersisted)), { mode: 0o600 })
}

/** One-time import of the pre-multi-connection single token into a remote connection. */
function migrateLegacy(): Connection[] {
  const legacy = legacyFile()
  if (!existsSync(legacy)) return []
  try {
    const token = decrypt(JSON.parse(readFileSync(legacy, 'utf8')) as Encrypted)
    const conn: RemoteConnection = { id: randomUUID(), label: 'Cloudflare', type: 'remote', token }
    persist([conn])
    rmSync(legacy)
    return [conn]
  } catch {
    return []
  }
}

function load(): Connection[] {
  if (cache) return cache
  const file = connectionsFile()
  if (existsSync(file)) {
    try {
      cache = (JSON.parse(readFileSync(file, 'utf8')) as Persisted[]).map(fromPersisted)
    } catch {
      cache = []
    }
  } else {
    cache = migrateLegacy()
  }
  return cache
}

const summarize = (connection: Connection): ConnectionSummary =>
  connection.type === 'remote'
    ? { id: connection.id, label: connection.label, type: 'remote' }
    : {
        id: connection.id,
        label: connection.label,
        type: 'local',
        projectPath: connection.projectPath
      }

/** Secret-free list for the renderer. */
export function listSummaries(): ConnectionSummary[] {
  return load().map(summarize)
}

/** Full record (incl. token) — main-process use only. */
export function getConnection(id: string): Connection | undefined {
  return load().find((connection) => connection.id === id)
}

export function addConnection(
  input: Omit<RemoteConnection, 'id'> | Omit<LocalConnection, 'id'>
): ConnectionSummary {
  const created = { ...input, id: randomUUID() } as Connection
  cache = [...load(), created]
  persist(cache)
  return summarize(created)
}

export function removeConnection(id: string): void {
  cache = load().filter((connection) => connection.id !== id)
  persist(cache)
}

export function renameConnection(id: string, label: string): void {
  cache = load().map((connection) => (connection.id === id ? { ...connection, label } : connection))
  persist(cache)
}

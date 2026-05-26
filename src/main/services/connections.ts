import { dialog } from 'electron'
import { basename } from 'node:path'
import type { ConnectionSummary } from '../../shared/types'
import * as cf from '../cloudflare/api'
import * as store from '../connections/store'
import { hasLocalState } from '../local/sqlite'

export function list(): ConnectionSummary[] {
  return store.listSummaries()
}

/** Adds a remote connection after verifying the token is valid and active. */
export async function addRemote(label: string, token: string): Promise<ConnectionSummary> {
  const trimmed = token.trim()
  if (!trimmed) throw new Error('Please enter an API token.')
  if (!(await cf.verifyToken(trimmed))) throw new Error('That API token is invalid or inactive.')
  return store.addConnection({
    label: label.trim() || 'Cloudflare',
    type: 'remote',
    token: trimmed
  })
}

/** Adds a local connection after confirming the folder has local D1 state. */
export function addLocal(label: string, projectPath: string): ConnectionSummary {
  if (!projectPath) throw new Error('Please choose a project folder.')
  if (!hasLocalState(projectPath)) {
    throw new Error('No local D1 data (.wrangler/state/v3/d1) found in that folder.')
  }
  return store.addConnection({
    label: label.trim() || basename(projectPath),
    type: 'local',
    projectPath
  })
}

export function remove(id: string): ConnectionSummary[] {
  store.removeConnection(id)
  return store.listSummaries()
}

export function rename(id: string, label: string): ConnectionSummary[] {
  store.renameConnection(id, label)
  return store.listSummaries()
}

/** Opens a native folder picker; returns the chosen path or null if cancelled. */
export async function pickFolder(): Promise<string | null> {
  const res = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0]
}

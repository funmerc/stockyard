// Full connection records as held in the main process. These include secrets
// (the API token) and must never be sent to the renderer — expose ConnectionSummary
// (src/shared/types.ts) instead.

export interface RemoteConnection {
  id: string
  label: string
  type: 'remote'
  token: string
}

export interface LocalConnection {
  id: string
  label: string
  type: 'local'
  projectPath: string
}

export type Connection = RemoteConnection | LocalConnection

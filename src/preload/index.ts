import { contextBridge, ipcRenderer, webFrame } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  CloudflareAccount,
  ConnectionSummary,
  ConsoleResult,
  DatabaseDescriptor,
  DatabaseRef,
  RawWritePreview,
  TablePage,
  ThemeChoice,
  WriteOp,
  WritePreview,
  WriteResult
} from '../shared/types'

// Custom APIs exposed to the renderer. Keep in sync with Window['api'] in index.d.ts.
// Tokens never cross this bridge — the renderer works with ids and DatabaseRefs only.
const api = {
  connections: {
    list: (): Promise<ConnectionSummary[]> => ipcRenderer.invoke('connections:list'),
    addRemote: (label: string, token: string): Promise<ConnectionSummary> =>
      ipcRenderer.invoke('connections:addRemote', label, token),
    addLocal: (label: string, projectPath: string): Promise<ConnectionSummary> =>
      ipcRenderer.invoke('connections:addLocal', label, projectPath),
    remove: (id: string): Promise<ConnectionSummary[]> =>
      ipcRenderer.invoke('connections:remove', id),
    rename: (id: string, label: string): Promise<ConnectionSummary[]> =>
      ipcRenderer.invoke('connections:rename', id, label),
    pickFolder: (): Promise<string | null> => ipcRenderer.invoke('connections:pickFolder')
  },
  data: {
    listAccounts: (connectionId: string): Promise<CloudflareAccount[]> =>
      ipcRenderer.invoke('data:listAccounts', connectionId),
    listDatabases: (connectionId: string, accountId?: string): Promise<DatabaseDescriptor[]> =>
      ipcRenderer.invoke('data:listDatabases', connectionId, accountId),
    listTables: (ref: DatabaseRef): Promise<string[]> => ipcRenderer.invoke('data:listTables', ref),
    getTableData: (
      ref: DatabaseRef,
      table: string,
      limit: number,
      offset: number
    ): Promise<TablePage> => ipcRenderer.invoke('data:tableData', ref, table, limit, offset),
    prepareWrite: (ref: DatabaseRef, op: WriteOp): Promise<WritePreview> =>
      ipcRenderer.invoke('data:prepareWrite', ref, op),
    executeWrite: (ref: DatabaseRef, op: WriteOp): Promise<WriteResult> =>
      ipcRenderer.invoke('data:executeWrite', ref, op),
    consoleRead: (ref: DatabaseRef, sql: string): Promise<ConsoleResult> =>
      ipcRenderer.invoke('data:consoleRead', ref, sql),
    consolePrepareWrite: (ref: DatabaseRef, sql: string): Promise<RawWritePreview> =>
      ipcRenderer.invoke('data:consolePrepareWrite', ref, sql),
    consoleExecuteWrite: (ref: DatabaseRef, sql: string): Promise<{ changes: number }> =>
      ipcRenderer.invoke('data:consoleExecuteWrite', ref, sql)
  },
  ui: {
    // Scale the whole renderer frame (text + controls + layout) uniformly.
    setZoom: (factor: number): void => webFrame.setZoomFactor(factor),
    setTheme: (theme: ThemeChoice): Promise<void> => ipcRenderer.invoke('ui:setTheme', theme)
  }
}

export type StockyardApi = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}

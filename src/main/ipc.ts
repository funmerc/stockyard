import { ipcMain, nativeTheme } from 'electron'
import type { DatabaseRef, ThemeChoice, WriteOp } from '../shared/types'
import * as connections from './services/connections'
import * as data from './services/data'

/** Registers an invoke handler that logs failures to the terminal before rethrowing. */
function handle<A extends unknown[], R>(channel: string, fn: (...args: A) => R): void {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return await fn(...(args as A))
    } catch (err) {
      console.error(`[ipc ${channel}]`, err)
      throw err
    }
  })
}

/** Registers all renderer-facing IPC handlers. */
export function registerIpc(): void {
  handle('connections:list', () => connections.list())
  handle('connections:addRemote', (label: string, token: string) =>
    connections.addRemote(label, token)
  )
  handle('connections:addLocal', (label: string, projectPath: string) =>
    connections.addLocal(label, projectPath)
  )
  handle('connections:remove', (id: string) => connections.remove(id))
  handle('connections:rename', (id: string, label: string) => connections.rename(id, label))
  handle('connections:pickFolder', () => connections.pickFolder())

  handle('data:listAccounts', (connectionId: string) => data.listAccounts(connectionId))
  handle('data:listDatabases', (connectionId: string, accountId?: string) =>
    data.listDatabases(connectionId, accountId)
  )
  handle('data:listTables', (ref: DatabaseRef) => data.listTables(ref))
  handle('data:tableData', (ref: DatabaseRef, table: string, limit: number, offset: number) =>
    data.getTableData(ref, table, limit, offset)
  )
  handle('data:prepareWrite', (ref: DatabaseRef, op: WriteOp) => data.prepareWrite(ref, op))
  handle('data:executeWrite', (ref: DatabaseRef, op: WriteOp) => data.executeWrite(ref, op))

  handle('data:consoleRead', (ref: DatabaseRef, sql: string) => data.consoleRead(ref, sql))
  handle('data:consolePrepareWrite', (ref: DatabaseRef, sql: string) =>
    data.consolePrepareWrite(ref, sql)
  )
  handle('data:consoleExecuteWrite', (ref: DatabaseRef, sql: string) =>
    data.consoleExecuteWrite(ref, sql)
  )

  // `system` follows the OS appearance on macOS/Windows/Linux; `light`/`dark`
  // override Chromium's prefers-color-scheme used by the renderer CSS.
  handle('ui:setTheme', (theme: ThemeChoice) => {
    nativeTheme.themeSource = theme === 'auto' ? 'system' : theme
  })
}

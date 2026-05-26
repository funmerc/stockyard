import { app, type BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface WindowState {
  width: number
  height: number
}

const DEFAULT: WindowState = { width: 1200, height: 800 }

const file = (): string => join(app.getPath('userData'), 'window-state.json')

let state: WindowState = { ...DEFAULT }

/** Loads the last saved window size (or sensible defaults). Position is not persisted. */
export function loadWindowState(): WindowState {
  try {
    state = { ...DEFAULT, ...(JSON.parse(readFileSync(file(), 'utf8')) as Partial<WindowState>) }
  } catch {
    state = { ...DEFAULT }
  }
  return state
}

/** Persists the window's size (debounced) so the next launch restores it. */
export function manageWindowState(win: BrowserWindow): void {
  const persist = (): void => {
    // Ignore maximized/minimized bounds so we remember the user's normal window size.
    if (win.isMaximized() || win.isMinimized()) return
    const { width, height } = win.getBounds()
    state = { width, height }
    try {
      writeFileSync(file(), JSON.stringify(state))
    } catch {
      // best-effort; ignore write failures
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  const debounced = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(persist, 400)
  }

  win.on('resize', debounced)
  win.on('close', persist)
}

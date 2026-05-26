import { ElectronAPI } from '@electron-toolkit/preload'
import type { StockyardApi } from './index'

declare global {
  interface Window {
    electron: ElectronAPI
    api: StockyardApi
  }
}

import { ref } from 'vue'
import type { ConnectionSummary } from '../../../shared/types'

// Module-level state so the sidebar and connections view share one list.
const connections = ref<ConnectionSummary[]>([])
const loaded = ref(false)
let initialized = false

async function refresh(): Promise<void> {
  connections.value = await window.api.connections.list()
}

/** Shared connection list + management actions backed by the main process. */
export function useConnections(): {
  connections: typeof connections
  loaded: typeof loaded
  refresh: () => Promise<void>
  addRemote: (label: string, token: string) => Promise<ConnectionSummary>
  addLocal: (label: string, projectPath: string) => Promise<void>
  remove: (id: string) => Promise<void>
  rename: (id: string, label: string) => Promise<void>
  pickFolder: () => Promise<string | null>
} {
  if (!initialized) {
    initialized = true
    refresh().finally(() => (loaded.value = true))
  }

  return {
    connections,
    loaded,
    refresh,
    // add* throw on invalid input/token; callers handle the error for display.
    addRemote: async (label, token) => {
      const summary = await window.api.connections.addRemote(label, token)
      await refresh()
      return summary
    },
    addLocal: async (label, projectPath) => {
      await window.api.connections.addLocal(label, projectPath)
      await refresh()
    },
    remove: async (id) => {
      connections.value = await window.api.connections.remove(id)
    },
    rename: async (id, label) => {
      connections.value = await window.api.connections.rename(id, label)
    },
    pickFolder: () => window.api.connections.pickFolder()
  }
}

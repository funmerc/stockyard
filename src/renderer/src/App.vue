<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ConsoleResult, ConsoleTarget, DatabaseRef } from '../../shared/types'
import { useConnections } from './composables/useConnections'
import { useUiSize } from './composables/useUiSize'
import { useTheme } from './composables/useTheme'
import InstanceSidebar from './components/InstanceSidebar.vue'
import TableView from './components/TableView.vue'
import QueryResultView from './components/QueryResultView.vue'
import SqlConsole from './components/SqlConsole.vue'
import SettingsView from './components/SettingsView.vue'

const { loaded, refresh } = useConnections()

// Apply the persisted interface size and theme on startup.
useUiSize()
useTheme()

const showSettings = ref(false)
const settingsSection = ref<'general' | 'connections'>('general')
const refreshing = ref(false)
const sidebar = ref<InstanceType<typeof InstanceSidebar>>()
const selected = ref<{ ref: DatabaseRef; table: string }>()

// Content area shows the selected table, a console read result, or the prompt.
const activeView = ref<'table' | 'result'>()
const consoleTarget = ref<ConsoleTarget>()
const consoleKey = ref(0)
const consoleResult = ref<ConsoleResult>()

function openConsole(target: ConsoleTarget): void {
  consoleTarget.value = target
  consoleKey.value++ // fresh console each open (re-seed + auto-run for tables)
}
function onConsoleResult(result: ConsoleResult): void {
  consoleResult.value = result
  activeView.value = 'result'
}

// Draggable sidebar/content split. Width is in CSS px (same space as pointer
// coordinates, so it stays correct under the interface-size zoom factor).
const MIN_SIDEBAR = 180
const MAX_SIDEBAR = 600
const sidebarWidth = ref(300)

function startResize(event: PointerEvent): void {
  event.preventDefault()
  const startX = event.clientX
  const startWidth = sidebarWidth.value
  const onMove = (moveEvent: PointerEvent): void => {
    const next = startWidth + (moveEvent.clientX - startX)
    sidebarWidth.value = Math.min(MAX_SIDEBAR, Math.max(MIN_SIDEBAR, next))
  }
  const onUp = (): void => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function openSettings(section: 'general' | 'connections'): void {
  settingsSection.value = section
  showSettings.value = true
}

async function refreshAccounts(): Promise<void> {
  if (refreshing.value) return
  refreshing.value = true
  selected.value = undefined
  activeView.value = undefined
  consoleResult.value = undefined
  consoleTarget.value = undefined
  try {
    if (sidebar.value) await sidebar.value.collapseAndRefresh()
    else await refresh()
  } finally {
    refreshing.value = false
  }
}

const selectionKey = computed(() => {
  if (!selected.value) return ''
  const dbRef = selected.value.ref
  return `${dbRef.kind === 'remote' ? dbRef.databaseId : dbRef.filePath}/${selected.value.table}`
})

function onSelect(payload: { ref: DatabaseRef; table: string }): void {
  selected.value = payload
  activeView.value = 'table'
}
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="brand">Stockyard</div>
      <div class="actions">
        <button
          class="icon-btn"
          title="Collapse and refresh"
          aria-label="Collapse and refresh"
          :disabled="refreshing"
          @click="refreshAccounts"
        >
          <svg
            :class="{ spinning: refreshing }"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
        <button
          class="icon-btn"
          title="Settings"
          aria-label="Settings"
          @click="openSettings('general')"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path
              d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
            />
          </svg>
        </button>
      </div>
    </header>

    <div class="body">
      <template v-if="loaded">
        <InstanceSidebar
          ref="sidebar"
          :style="{ width: sidebarWidth + 'px' }"
          @select="onSelect"
          @add="openSettings('connections')"
          @console="openConsole"
        />
        <div class="resizer" title="Drag to resize" @pointerdown="startResize" />
        <main class="content">
          <section class="panel view-panel">
            <header class="panel-head"><span class="eyebrow">View</span></header>
            <div class="panel-body">
              <QueryResultView
                v-if="activeView === 'result' && consoleResult"
                :columns="consoleResult.columns"
                :rows="consoleResult.rows"
              />
              <TableView
                v-else-if="activeView === 'table' && selected"
                :key="selectionKey"
                :db-ref="selected.ref"
                :table="selected.table"
              />
              <div v-else class="empty">
                <p class="muted">Select a table from a connection to view its rows.</p>
              </div>
            </div>
          </section>
          <SqlConsole
            v-if="consoleTarget"
            :key="consoleKey"
            class="panel console-panel"
            :target="consoleTarget"
            @result="onConsoleResult"
            @close="consoleTarget = undefined"
          />
        </main>
      </template>
    </div>

    <SettingsView
      v-if="showSettings"
      :initial-section="settingsSection"
      @close="showSettings = false"
    />
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid var(--ev-c-gray-3);
  background: var(--color-background-soft);
}
.brand {
  font-weight: 700;
  letter-spacing: 0.3px;
}
.body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.resizer {
  position: relative;
  z-index: 2;
  flex: 0 0 1px;
  background: var(--ev-c-gray-3);
  cursor: col-resize;
}
/* Widen the grab area beyond the 1px line without affecting layout. */
.resizer::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: -3px;
  right: -3px;
}
.resizer:hover {
  background: #3178c6;
}
.content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
  padding: 12px 24px 16px;
}
.panel {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--ev-c-gray-3);
  border-radius: 8px;
  overflow: hidden;
  background: var(--color-background-soft);
}
.view-panel {
  flex: 1;
  min-height: 0;
}
.console-panel {
  flex-shrink: 0;
  height: 280px;
  min-height: 160px;
}
.panel-head {
  flex-shrink: 0;
  padding: 6px 12px;
  border-bottom: 1px solid var(--ev-c-gray-3);
}
.panel-head .eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--ev-c-text-3);
}
.panel-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-items: center;
  justify-content: center;
}
.muted {
  color: var(--ev-c-text-2);
}
.actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border: 1px solid transparent;
  color: var(--ev-c-text-2);
  background: none;
  border-radius: 8px;
  padding: 6px;
}
.icon-btn:hover {
  color: var(--color-text);
  background: var(--color-background-mute);
}
.icon-btn:disabled {
  cursor: default;
  opacity: 0.6;
}
.spinning {
  animation: spin 0.7s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

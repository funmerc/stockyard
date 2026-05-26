<script setup lang="ts">
import { computed, onMounted, ref, toRaw } from 'vue'
import {
  PAGE_SIZE,
  type ConsoleResult,
  type ConsoleTarget,
  type DatabaseDescriptor,
  type DatabaseRef,
  type RawWritePreview
} from '../../../shared/types'
import { isReadOnlySql } from '../../../shared/sql-kind'
import ConfirmRawSqlDialog from './ConfirmRawSqlDialog.vue'

const props = defineProps<{ target: ConsoleTarget }>()
const emit = defineEmits<{ close: []; result: [ConsoleResult] }>()

const quote = (name: string): string => `"${name.replace(/"/g, '""')}"`

const sql = ref('')
const activeRef = ref<DatabaseRef>()
const dbOptions = ref<DatabaseDescriptor[]>([])
const running = ref(false)
const error = ref('')
const status = ref('')

// Write-confirm state
const preview = ref<RawWritePreview>()
const pendingSql = ref('')
const showConfirm = ref(false)
const committing = ref(false)
const writeError = ref('')

const production = computed(() => activeRef.value?.kind === 'remote')

// Seed from the target (account waits for a DB pick in onMounted).
if (props.target.scope === 'database') {
  activeRef.value = props.target.ref
} else if (props.target.scope === 'table') {
  activeRef.value = props.target.ref
  sql.value = `SELECT * FROM ${quote(props.target.table)} LIMIT ${PAGE_SIZE};`
}

const msg = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause))

onMounted(async () => {
  if (props.target.scope === 'account') {
    try {
      dbOptions.value = await window.api.data.listDatabases(
        props.target.connectionId,
        props.target.accountId
      )
    } catch (cause) {
      error.value = msg(cause)
    }
  } else if (props.target.scope === 'table') {
    // The table scope seeded a SELECT above; run it so rows appear on open.
    void run()
  }
})

async function run(): Promise<void> {
  const dbRef = activeRef.value
  if (!dbRef || !sql.value.trim() || running.value) return
  error.value = ''
  status.value = ''

  if (isReadOnlySql(sql.value)) {
    running.value = true
    try {
      const res = await window.api.data.consoleRead(toRaw(dbRef), sql.value)
      emit('result', res)
      const rowCount = res.rows.length
      const durationSuffix = res.durationMs != null ? ` · ${res.durationMs} ms` : ''
      status.value = `${rowCount} row${rowCount === 1 ? '' : 's'}${durationSuffix}`
    } catch (cause) {
      error.value = msg(cause)
    } finally {
      running.value = false
    }
  } else {
    // Mutating: build a preview, then require confirmation.
    running.value = true
    try {
      preview.value = await window.api.data.consolePrepareWrite(toRaw(dbRef), sql.value)
      pendingSql.value = sql.value
      writeError.value = ''
      showConfirm.value = true
    } catch (cause) {
      error.value = msg(cause)
    } finally {
      running.value = false
    }
  }
}

async function confirmWrite(): Promise<void> {
  const dbRef = activeRef.value
  if (!dbRef) return
  committing.value = true
  writeError.value = ''
  try {
    const { changes } = await window.api.data.consoleExecuteWrite(toRaw(dbRef), pendingSql.value)
    showConfirm.value = false
    preview.value = undefined
    status.value = `${changes} row${changes === 1 ? '' : 's'} affected`
  } catch (cause) {
    writeError.value = msg(cause)
  } finally {
    committing.value = false
  }
}

function cancelWrite(): void {
  showConfirm.value = false
  preview.value = undefined
  writeError.value = ''
}

function clear(): void {
  sql.value = ''
  error.value = ''
  status.value = ''
}

function onEnter(event: KeyboardEvent): void {
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault()
    void run()
  }
}
</script>

<template>
  <section class="console">
    <header class="bar">
      <span class="eyebrow">Console</span>
      <select v-if="target.scope === 'account'" v-model="activeRef" class="db-select">
        <option :value="undefined" disabled>Choose database…</option>
        <option v-for="database in dbOptions" :key="database.name" :value="database.ref">
          {{ database.name }}
        </option>
      </select>
      <span v-else class="db-name">{{ activeRef?.name }}</span>

      <span class="spacer" />

      <button
        class="icon-btn"
        title="Run (Ctrl/Cmd+Enter)"
        aria-label="Run"
        :disabled="running || !activeRef"
        @click="run"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
      </button>
      <button class="icon-btn" title="Clear" aria-label="Clear" @click="clear">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <polyline points="3 6 5 6 21 6" />
          <path
            d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
          />
        </svg>
      </button>
      <button
        class="icon-btn close"
        title="Close console"
        aria-label="Close"
        @click="$emit('close')"
      >
        ✕
      </button>
    </header>

    <textarea
      v-model="sql"
      class="editor"
      spellcheck="false"
      placeholder="Enter SQL — Ctrl/Cmd+Enter to run"
      @keydown.enter="onEnter"
    />

    <div class="output">
      <span v-if="error" class="error">{{ error }}</span>
      <span v-else-if="status" class="status">{{ status }}</span>
    </div>

    <ConfirmRawSqlDialog
      v-if="showConfirm"
      :sql="pendingSql"
      :preview="preview ?? null"
      :production="production"
      :committing="committing"
      :error="writeError"
      @confirm="confirmWrite"
      @cancel="cancelWrite"
    />
  </section>
</template>

<style scoped>
.console {
  display: flex;
  flex-direction: column;
}
.bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  padding: 5px 8px 5px 14px;
  border-bottom: 1px solid var(--ev-c-gray-3);
}
.eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--ev-c-text-3);
}
.db-name {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--ev-c-text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.db-select {
  background: var(--color-background-mute);
  border: 1px solid var(--ev-c-gray-3);
  border-radius: 6px;
  color: var(--color-text);
  padding: 3px 8px;
  font-size: 12px;
}
.spacer {
  flex: 1;
}
.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border: 1px solid transparent;
  color: var(--ev-c-text-2);
  background: none;
  border-radius: 6px;
  padding: 4px;
  font-size: 14px;
}
.icon-btn:hover {
  color: var(--color-text);
  background: var(--color-background-mute);
}
.icon-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.editor {
  flex: 1;
  min-height: 0;
  resize: none;
  border: none;
  outline: none;
  background: var(--color-background);
  color: var(--color-text);
  padding: 10px 14px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.5;
}
.output {
  flex-shrink: 0;
  min-height: 24px;
  padding: 4px 14px 8px;
  font-size: 12px;
}
.status {
  color: var(--ev-c-text-2);
}
.error {
  color: #f08a8a;
  white-space: pre-wrap;
}
</style>

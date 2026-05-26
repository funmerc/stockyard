<script setup lang="ts">
import { computed, ref, toRaw, watch } from 'vue'
import {
  PAGE_SIZE,
  type DatabaseRef,
  type TablePage,
  type WriteOp,
  type WritePreview
} from '../../../shared/types'
import {
  dateKind,
  formatForDisplay,
  inferStorage,
  type DateKind,
  type DateStorage
} from '../lib/dates'
import { displayValue, isNullish } from '../lib/cell'
import ConfirmWriteDialog from './ConfirmWriteDialog.vue'
import RowEditorDialog from './RowEditorDialog.vue'
import ContextMenu from './ContextMenu.vue'

const props = defineProps<{
  dbRef: DatabaseRef
  table: string
}>()

const dbKey = computed(() =>
  props.dbRef.kind === 'remote' ? props.dbRef.databaseId : props.dbRef.filePath
)
const production = computed(() => props.dbRef.kind === 'remote')

const page = ref<TablePage>()
const offset = ref(0)
const loading = ref(false)
const error = ref('')
const selectedIndex = ref<number>()

// Right-click menu for a table row.
const rowMenu = ref<{ x: number; y: number; index: number }>()

const total = computed(() => page.value?.total ?? 0)
const rangeEnd = computed(() => Math.min(offset.value + PAGE_SIZE, total.value))
const canPrev = computed(() => offset.value > 0)
const canNext = computed(() => offset.value + PAGE_SIZE < total.value)
const hasSelection = computed(() => selectedIndex.value !== undefined)

// Date columns (by declared type) and each one's storage format (sampled from the page).
const dateKinds = computed<Record<string, DateKind>>(() => {
  const map: Record<string, DateKind> = {}
  for (const column of page.value?.columns ?? []) {
    const kind = dateKind(column.type)
    if (kind) map[column.name] = kind
  }
  return map
})
const dateStorage = computed<Record<string, DateStorage>>(() => {
  const map: Record<string, DateStorage> = {}
  const rows = page.value?.rows ?? []
  for (const name of Object.keys(dateKinds.value)) {
    map[name] = inferStorage(rows.map((row) => row[name]))
  }
  return map
})

// Row editor (insert/edit) and write confirmation.
const editor = ref<{ mode: 'insert' | 'edit'; row?: Record<string, unknown> }>()
const pendingOp = ref<WriteOp>()
const preview = ref<WritePreview>()
const previewLoading = ref(false)
const committing = ref(false)
const writeError = ref('')

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  selectedIndex.value = undefined
  try {
    page.value = await window.api.data.getTableData(
      toRaw(props.dbRef),
      props.table,
      PAGE_SIZE,
      offset.value
    )
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
    page.value = undefined
  } finally {
    loading.value = false
  }
}

watch(
  () => `${dbKey.value}/${props.table}`,
  () => {
    offset.value = 0
    void load()
  },
  { immediate: true }
)

function prev(): void {
  if (!canPrev.value) return
  offset.value = Math.max(0, offset.value - PAGE_SIZE)
  void load()
}
function next(): void {
  if (!canNext.value) return
  offset.value += PAGE_SIZE
  void load()
}

// Cell text, formatting date columns as readable datetimes.
function cellText(value: unknown, column: string): string {
  const kind = dateKinds.value[column]
  return kind ? formatForDisplay(value, kind) : displayValue(value)
}

// --- Open the editor ---
function openInsert(): void {
  editor.value = { mode: 'insert' }
}
function openEdit(index: number | undefined): void {
  if (index === undefined || !page.value) return
  editor.value = { mode: 'edit', row: toRaw(page.value.rows[index]) }
}
function closeEditor(): void {
  editor.value = undefined
}

// Editor saved → build the op and open the confirm preview (editor stays open behind it).
function onEditorSave(payload: Record<string, unknown>): void {
  if (!editor.value) return
  if (editor.value.mode === 'insert') {
    requestConfirm({ kind: 'insert', table: props.table, values: payload })
  } else if (editor.value.row) {
    requestConfirm({
      kind: 'update',
      table: props.table,
      row: toRaw(editor.value.row),
      changes: payload
    })
  }
}

function deleteSelected(): void {
  if (selectedIndex.value === undefined || !page.value) return
  requestConfirm({
    kind: 'delete',
    table: props.table,
    row: toRaw(page.value.rows[selectedIndex.value])
  })
}

// Right-click a row: select it, then offer the quick Edit/Delete actions.
function openRowMenu(event: MouseEvent, index: number): void {
  selectedIndex.value = index
  rowMenu.value = { x: event.clientX, y: event.clientY, index }
}
function onRowMenuSelect(id: string): void {
  if (!rowMenu.value) return
  if (id === 'edit') openEdit(rowMenu.value.index)
  else if (id === 'delete') deleteSelected()
}

// --- Confirm flow ---
async function requestConfirm(op: WriteOp): Promise<void> {
  pendingOp.value = op
  preview.value = undefined
  writeError.value = ''
  previewLoading.value = true
  try {
    preview.value = await window.api.data.prepareWrite(toRaw(props.dbRef), op)
  } catch (cause) {
    writeError.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    previewLoading.value = false
  }
}
async function confirmWrite(): Promise<void> {
  if (!pendingOp.value) return
  committing.value = true
  writeError.value = ''
  try {
    await window.api.data.executeWrite(toRaw(props.dbRef), toRaw(pendingOp.value))
    pendingOp.value = undefined
    preview.value = undefined
    editor.value = undefined
    await load()
  } catch (cause) {
    writeError.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    committing.value = false
  }
}
function cancelWrite(): void {
  pendingOp.value = undefined
  preview.value = undefined
  writeError.value = ''
}
</script>

<template>
  <section class="table-view">
    <header class="head">
      <div class="title">
        <div class="eyebrow">
          {{ dbRef.name }}
          <span v-if="production" class="prod" title="Writes go to your live database"
            >PRODUCTION</span
          >
        </div>
        <h1>{{ table }}</h1>
      </div>
      <div v-if="!loading && !error" class="pager">
        <button class="btn" @click="openInsert">+ Add row</button>
        <button class="btn" :disabled="!hasSelection" @click="openEdit(selectedIndex)">Edit</button>
        <button class="btn danger" :disabled="!hasSelection" @click="deleteSelected">Delete</button>
        <span class="sep" />
        <span class="muted">
          {{ total === 0 ? '0 rows' : `${offset + 1}–${rangeEnd} of ${total}` }}
        </span>
        <button class="btn" :disabled="!canPrev" @click="prev">Prev</button>
        <button class="btn" :disabled="!canNext" @click="next">Next</button>
        <span class="sep" />
        <button class="icon-btn" title="Refresh table" aria-label="Refresh table" @click="load">
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
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
      </div>
    </header>

    <div v-if="loading" class="state muted">Loading…</div>
    <div v-else-if="error" class="state error">{{ error }}</div>
    <div v-else-if="page && page.rows.length === 0" class="state muted">No rows.</div>

    <div v-else-if="page" class="grid-wrap">
      <table class="grid">
        <thead>
          <tr>
            <th v-for="col in page.columns" :key="col.name">
              {{ col.name }}
              <span v-if="col.pk" class="pk" title="Primary key">PK</span>
              <span class="coltype">{{ col.type }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, rowIndex) in page.rows"
            :key="rowIndex"
            :class="{ selected: selectedIndex === rowIndex }"
            @click="selectedIndex = rowIndex"
            @dblclick="openEdit(rowIndex)"
            @contextmenu.prevent="openRowMenu($event, rowIndex)"
          >
            <td
              v-for="col in page.columns"
              :key="col.name"
              :class="{ null: isNullish(row[col.name]) }"
            >
              {{ isNullish(row[col.name]) ? 'NULL' : cellText(row[col.name], col.name) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <RowEditorDialog
      v-if="editor"
      :table="table"
      :columns="page?.columns ?? []"
      :mode="editor.mode"
      :initial-row="editor.row"
      :date-storage="dateStorage"
      @save="onEditorSave"
      @cancel="closeEditor"
    />

    <ConfirmWriteDialog
      v-if="pendingOp"
      :op="pendingOp"
      :preview="preview ?? null"
      :loading="previewLoading"
      :error="writeError"
      :committing="committing"
      :production="production"
      @confirm="confirmWrite"
      @cancel="cancelWrite"
    />

    <ContextMenu
      v-if="rowMenu"
      :x="rowMenu.x"
      :y="rowMenu.y"
      :items="[
        { id: 'edit', label: 'Edit row' },
        { id: 'delete', label: 'Delete row', danger: true }
      ]"
      @select="onRowMenuSelect"
      @close="rowMenu = undefined"
    />
  </section>
</template>

<style scoped>
.table-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px 10px;
  flex-shrink: 0;
}
.title {
  min-width: 0;
}
.eyebrow {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--ev-c-text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.prod {
  margin-left: 8px;
  color: #f08a8a;
  border: 1px solid #f08a8a55;
  border-radius: 8px;
  padding: 1px 6px;
}
h1 {
  font-size: 20px;
  font-weight: 700;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pager {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.sep {
  width: 1px;
  align-self: stretch;
  background: var(--ev-c-gray-3);
  margin: 2px 4px;
}
.muted {
  color: var(--ev-c-text-2);
  font-size: 13px;
  white-space: nowrap;
}
.btn {
  cursor: pointer;
  border: 1px solid var(--ev-c-gray-3);
  color: var(--ev-button-alt-text);
  background: var(--ev-button-alt-bg);
  border-radius: 6px;
  padding: 4px 12px;
  font-size: 13px;
  white-space: nowrap;
}
.btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.btn.danger:not(:disabled) {
  color: #f08a8a;
  border-color: #f08a8a55;
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
}
.icon-btn:hover {
  color: var(--color-text);
  background: var(--color-background-mute);
}
.state {
  padding: 24px;
}
.state.error {
  color: #f08a8a;
}
.grid-wrap {
  flex: 1;
  overflow: auto;
  border-top: 1px solid var(--ev-c-gray-3);
}
.grid {
  border-collapse: collapse;
  font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  width: max-content;
  min-width: 100%;
}
.grid th,
.grid td {
  border-bottom: 1px solid var(--ev-c-gray-3);
  border-right: 1px solid var(--ev-c-gray-3);
  padding: 6px 12px;
  text-align: left;
  white-space: nowrap;
  max-width: 420px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.grid th {
  position: sticky;
  top: 0;
  background: var(--color-background-mute);
  font-weight: 600;
  z-index: 1;
}
.grid tbody tr {
  cursor: pointer;
}
.grid tbody tr:hover td {
  background: var(--color-background-mute);
}
.grid tbody tr.selected td {
  background: #3178c633;
}
.coltype {
  margin-left: 6px;
  font-size: 11px;
  font-weight: 400;
  color: var(--ev-c-text-3);
  text-transform: lowercase;
}
.pk {
  margin-left: 6px;
  font-size: 10px;
  font-weight: 700;
  color: #f0dc4e;
}
.grid td.null {
  color: var(--ev-c-text-3);
  font-style: italic;
}
</style>

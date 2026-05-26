<script setup lang="ts">
import { computed } from 'vue'
import type { WriteOp, WritePreview } from '../../../shared/types'
import { displayValue, isNullish } from '../lib/cell'

const props = defineProps<{
  op: WriteOp
  preview: WritePreview | null
  loading: boolean
  error: string
  committing: boolean
  production: boolean
}>()
defineEmits<{ confirm: []; cancel: [] }>()

const title = computed(() =>
  props.op.kind === 'update'
    ? 'Confirm update'
    : props.op.kind === 'insert'
      ? 'Confirm insert'
      : 'Confirm delete'
)

function literal(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  return `'${String(value).replace(/'/g, "''")}'`
}

const cell = (value: unknown): string => (isNullish(value) ? 'NULL' : displayValue(value))

// Interpolate ? params for a readable preview. Display only — the real statement runs parameterized.
const sqlDisplay = computed(() => {
  if (!props.preview) return ''
  let paramIndex = 0
  return props.preview.sql.replace(/\?/g, () => literal(props.preview!.params[paramIndex++]))
})

// Before/after diff for an update (only the columns being changed).
const updateDiff = computed(() => {
  if (props.op.kind !== 'update') return []
  const op = props.op
  return Object.keys(op.changes).map((col) => ({
    col,
    before: op.row[col],
    after: op.changes[col]
  }))
})

const insertValues = computed(() => {
  if (props.op.kind !== 'insert') return []
  const op = props.op
  return Object.keys(op.values).map((col) => ({ col, value: op.values[col] }))
})

// Columns for the delete "affected rows" table.
const deleteColumns = computed(() => {
  const rows = props.preview?.affectedRows ?? []
  return rows.length ? Object.keys(rows[0]).filter((key) => key !== '_rowid_') : []
})
</script>

<template>
  <div class="overlay" @click.self="$emit('cancel')">
    <div class="panel">
      <header class="head">
        <h2>{{ title }}</h2>
        <span v-if="production" class="prod" title="This writes to your live Cloudflare database">
          PRODUCTION
        </span>
      </header>

      <div class="body">
        <div v-if="loading" class="muted">Preparing preview…</div>

        <template v-else-if="preview">
          <section class="block">
            <div class="label">STATEMENT</div>
            <pre class="sql">{{ sqlDisplay }}</pre>
          </section>

          <section v-if="op.kind === 'update'" class="block">
            <div class="label">CHANGES</div>
            <table class="kv">
              <thead>
                <tr>
                  <th>Column</th>
                  <th>Before</th>
                  <th>After</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="diff in updateDiff" :key="diff.col">
                  <td class="col">{{ diff.col }}</td>
                  <td class="before">
                    <div class="cellval">{{ cell(diff.before) }}</div>
                  </td>
                  <td class="after">
                    <div class="cellval">{{ cell(diff.after) }}</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <section v-else-if="op.kind === 'insert'" class="block">
            <div class="label">NEW ROW</div>
            <table v-if="insertValues.length" class="kv">
              <thead>
                <tr>
                  <th>Column</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="entry in insertValues" :key="entry.col">
                  <td class="col">{{ entry.col }}</td>
                  <td>
                    <div class="cellval">{{ cell(entry.value) }}</div>
                  </td>
                </tr>
              </tbody>
            </table>
            <div v-else class="muted">All columns use their defaults.</div>
          </section>

          <section v-else class="block">
            <div class="label">ROW(S) TO DELETE</div>
            <div v-if="deleteColumns.length" class="rows">
              <table>
                <thead>
                  <tr>
                    <th v-for="column in deleteColumns" :key="column">{{ column }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, rowIndex) in preview.affectedRows.slice(0, 50)" :key="rowIndex">
                    <td v-for="column in deleteColumns" :key="column">{{ cell(row[column]) }}</td>
                  </tr>
                </tbody>
              </table>
              <div v-if="preview.affectedRows.length > 50" class="muted more">
                …and {{ preview.affectedRows.length - 50 }} more
              </div>
            </div>
          </section>

          <div class="count">
            <strong>{{ preview.affectedCount }}</strong>
            row{{ preview.affectedCount === 1 ? '' : 's' }}
            {{ op.kind === 'insert' ? 'to insert' : 'affected' }}
            <span class="muted">· {{ preview.dryRun ? 'verified by dry-run' : 'estimated' }}</span>
          </div>
        </template>
      </div>

      <div v-if="error" class="error">{{ error }}</div>

      <footer class="actions">
        <button class="btn" :disabled="committing" @click="$emit('cancel')">Cancel</button>
        <button
          class="btn danger"
          :disabled="loading || committing || !preview || !!error"
          @click="$emit('confirm')"
        >
          {{ committing ? 'Running…' : op.kind === 'delete' ? 'Delete' : 'Confirm' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
}
.panel {
  width: 80vw;
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  gap: 14px;
  background: var(--color-background-soft);
  border: 1px solid var(--ev-c-gray-3);
  border-radius: 10px;
  padding: 18px 20px;
}
.head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.head h2 {
  font-size: 17px;
  font-weight: 700;
}
/* Scrollable middle region: panel grows to its max, then this scrolls instead
   of pushing the footer off-screen. */
.body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.prod {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: #f08a8a;
  border: 1px solid #f08a8a55;
  border-radius: 8px;
  padding: 2px 8px;
}
.block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
}
.label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.6px;
  color: var(--ev-c-text-3);
}
.sql {
  margin: 0;
  background: var(--color-background-mute);
  border: 1px solid var(--ev-c-gray-3);
  border-radius: 6px;
  padding: 10px 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12.5px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 30vh;
  overflow: auto;
}
.kv,
.rows table {
  border-collapse: collapse;
  font-size: 12.5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  width: 100%;
}
/* CHANGES / NEW ROW: fixed layout + wrapping so long values stay inside the panel. */
.kv {
  table-layout: fixed;
}
.kv th:first-child {
  width: 30%;
}
.rows {
  overflow: auto;
  max-height: 50vh;
  border: 1px solid var(--ev-c-gray-3);
  border-radius: 6px;
}
.rows table {
  width: max-content;
  min-width: 100%;
}
.kv th,
.kv td,
.rows th,
.rows td {
  border: 1px solid var(--ev-c-gray-3);
  padding: 4px 10px;
  text-align: left;
}
.kv th,
.kv td {
  white-space: normal;
  word-break: break-word;
  vertical-align: top;
}
/* Large blob values get their own bounded scroll so before/after stay
   side-by-side and comparable instead of running off the panel. */
.cellval {
  max-height: 320px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
/* Affected-rows (delete) scroll horizontally rather than wrap. */
.rows th,
.rows td {
  white-space: nowrap;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.kv th,
.rows th {
  background: var(--color-background-mute);
  font-weight: 600;
}
.kv .col {
  font-weight: 600;
}
.kv .before {
  color: var(--ev-c-text-3);
}
.kv .after {
  color: #42d392;
}
.count {
  font-size: 13px;
}
.muted {
  color: var(--ev-c-text-2);
  font-weight: 400;
}
.more {
  padding: 6px 10px;
  font-size: 12px;
}
.error {
  color: #f08a8a;
  font-size: 13px;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.btn {
  cursor: pointer;
  border: 1px solid var(--ev-c-gray-3);
  color: var(--ev-button-alt-text);
  background: var(--ev-button-alt-bg);
  border-radius: 6px;
  padding: 6px 16px;
  font-size: 13px;
  font-weight: 600;
}
.btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.btn.danger {
  background: #c0392b;
  color: #fff;
  border-color: #c0392b;
}
</style>

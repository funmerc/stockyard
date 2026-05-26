<script setup lang="ts">
import { computed, ref, type Directive } from 'vue'
import type { D1Column } from '../../../shared/types'
import {
  dateKind,
  detectStorage,
  fromPickerValue,
  nowEpochSeconds,
  nowPickerValue,
  nowUtcText,
  storageLabel,
  toPickerValue,
  type DateKind,
  type DateStorage
} from '../lib/dates'
import { isNullish } from '../lib/cell'
import ContextMenu from './ContextMenu.vue'

const props = defineProps<{
  table: string
  columns: D1Column[]
  mode: 'insert' | 'edit'
  initialRow?: Record<string, unknown>
  /** Per-column inferred storage (from sampled rows) for new date values. */
  dateStorage?: Record<string, DateStorage>
}>()
const emit = defineEmits<{ save: [Record<string, unknown>]; cancel: [] }>()

interface Field {
  name: string
  type: string
  pk: boolean
  notnull: boolean
  value: string
  isNull: boolean
  kind: DateKind | null
  storage: DateStorage
}

const fields = ref<Field[]>(
  props.columns.map((column) => {
    const orig = props.initialRow?.[column.name]
    const startNull = props.mode === 'edit' && isNullish(orig)
    const kind = dateKind(column.type)
    // Match the existing value's format when editing; otherwise the column's sampled format.
    const storage =
      (kind ? detectStorage(orig) : null) ?? props.dateStorage?.[column.name] ?? 'text'
    return {
      name: column.name,
      type: column.type,
      pk: column.pk,
      notnull: column.notnull,
      kind,
      storage,
      value: isNullish(orig) ? '' : kind ? toPickerValue(orig, kind) : String(orig),
      isNull: startNull
    }
  })
)

// Pick a friendlier input type from the column's SQLite type affinity.
function inputType(type: string): string {
  return /INT|REAL|FLOA|DOUB|NUM|DEC/i.test(type) ? 'number' : 'text'
}

// A lone INTEGER PRIMARY KEY is the rowid alias — SQLite auto-assigns it on insert.
const pkCount = props.columns.filter((column) => column.pk).length
function isAutoId(field: { pk: boolean; type: string }): boolean {
  return pkCount === 1 && field.pk && /INT/i.test(field.type)
}
function autoOnInsert(field: Field): boolean {
  return props.mode === 'insert' && isAutoId(field)
}

// Grow a textarea to fit its content, up to a cap (then it scrolls).
function autoGrow(element: HTMLTextAreaElement): void {
  element.style.height = 'auto'
  element.style.height = `${Math.min(element.scrollHeight, 360)}px`
}
const vAutoGrow: Directive<HTMLTextAreaElement> = { mounted: autoGrow, updated: autoGrow }

function fieldChanged(field: Field): boolean {
  const orig = props.initialRow?.[field.name]
  const origNull = isNullish(orig)
  const origStr = origNull ? '' : field.kind ? toPickerValue(orig, field.kind) : String(orig)
  return field.isNull !== origNull || (!field.isNull && field.value !== origStr)
}

// The value to write: NULL, a converted date, or the raw string.
function outValue(field: Field): unknown {
  if (field.isNull) return null
  return field.kind ? fromPickerValue(field.value, field.kind, field.storage) : field.value
}

// Insert is always submittable (empty → DEFAULT VALUES); edit requires a change.
const dirty = computed(() => (props.mode === 'insert' ? true : fields.value.some(fieldChanged)))

function save(): void {
  const out: Record<string, unknown> = {}
  for (const field of fields.value) {
    if (props.mode === 'insert') {
      if (isAutoId(field)) continue // let SQLite assign the rowid
      if (field.isNull) out[field.name] = null
      // empty & not null → omit (DB default)
      else if (field.value !== '') out[field.name] = outValue(field)
    } else if (fieldChanged(field)) {
      out[field.name] = outValue(field)
    }
  }
  emit('save', out)
}

// --- Right-click "Generator" menu (text/number inputs) ---
interface GenItem {
  id: string
  label: string
  header?: boolean
}

const genMenu = ref<{ x: number; y: number; field: Field }>()

// Type-aware options: UUID only makes sense for text; Now works for both.
function genItems(field: Field): GenItem[] {
  const items: GenItem[] = [{ id: 'header', label: 'Generator', header: true }]
  if (inputType(field.type) !== 'number') items.push({ id: 'uuid', label: 'Id (UUID v4)' })
  items.push({ id: 'now', label: 'Now' })
  return items
}

function openGenMenu(event: MouseEvent, field: Field): void {
  if (field.isNull || autoOnInsert(field)) return
  genMenu.value = { x: event.clientX, y: event.clientY, field }
}

function applyGenerator(id: string): void {
  const field = genMenu.value?.field
  if (!field) return
  if (id === 'uuid') field.value = crypto.randomUUID()
  // Number columns → UTC epoch seconds; text columns → UTC datetime string.
  else if (id === 'now')
    field.value = inputType(field.type) === 'number' ? String(nowEpochSeconds()) : nowUtcText()
}
</script>

<template>
  <div class="overlay" @click.self="$emit('cancel')">
    <div class="panel">
      <header class="head">
        <h2>{{ mode === 'insert' ? 'New row' : 'Edit row' }}</h2>
        <span class="table">{{ table }}</span>
      </header>

      <div class="form">
        <div v-for="field in fields" :key="field.name" class="field">
          <label :for="`f-${field.name}`">
            {{ field.name }}
            <span class="coltype">{{ field.type || 'any' }}</span>
            <span v-if="field.pk" class="tag pk">PK</span>
            <span v-if="autoOnInsert(field)" class="tag auto">AUTO</span>
            <span v-if="field.notnull" class="tag nn">NOT NULL</span>
            <span v-if="field.kind" class="datehint">
              {{ field.kind }} · {{ storageLabel(field.storage) }}
            </span>
          </label>
          <div class="control">
            <template v-if="field.kind">
              <input
                :id="`f-${field.name}`"
                v-model="field.value"
                :type="field.kind === 'date' ? 'date' : 'datetime-local'"
                step="1"
                :disabled="field.isNull"
                class="input"
              />
              <button
                type="button"
                class="now"
                :disabled="field.isNull"
                @click="field.kind && (field.value = nowPickerValue(field.kind))"
              >
                Now
              </button>
            </template>
            <input
              v-else-if="inputType(field.type) === 'number'"
              :id="`f-${field.name}`"
              v-model="field.value"
              type="number"
              :disabled="field.isNull || autoOnInsert(field)"
              class="input"
              :placeholder="autoOnInsert(field) ? 'auto-increment' : field.isNull ? 'NULL' : ''"
              @contextmenu.prevent="openGenMenu($event, field)"
            />
            <textarea
              v-else
              :id="`f-${field.name}`"
              v-model="field.value"
              v-auto-grow
              rows="1"
              :disabled="field.isNull"
              class="input textarea"
              :placeholder="field.isNull ? 'NULL' : ''"
              @contextmenu.prevent="openGenMenu($event, field)"
            />
            <label
              v-if="!autoOnInsert(field)"
              class="null-toggle"
              :class="{ disabled: field.notnull }"
            >
              <input
                v-model="field.isNull"
                type="checkbox"
                :disabled="field.notnull"
                title="Store NULL"
              />
              NULL
            </label>
          </div>
        </div>
      </div>

      <footer class="actions">
        <button class="btn" @click="$emit('cancel')">Cancel</button>
        <button class="btn primary" :disabled="!dirty" @click="save">
          {{ mode === 'insert' ? 'Insert…' : 'Review changes…' }}
        </button>
      </footer>
    </div>

    <ContextMenu
      v-if="genMenu"
      :x="genMenu.x"
      :y="genMenu.y"
      :items="genItems(genMenu.field)"
      @select="applyGenerator"
      @close="genMenu = undefined"
    />
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 15;
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
  align-items: baseline;
  gap: 10px;
}
.head h2 {
  font-size: 17px;
  font-weight: 700;
}
.table {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  color: var(--ev-c-text-3);
}
.form {
  overflow-y: auto;
  /* Reserve space for the scrollbar so it doesn't overlay the NULL toggles (Windows). */
  scrollbar-gutter: stable;
  padding-right: 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
label {
  font-size: 13px;
  font-weight: 600;
}
.coltype {
  margin-left: 6px;
  font-size: 11px;
  font-weight: 400;
  color: var(--ev-c-text-3);
  text-transform: lowercase;
}
.datehint {
  margin-left: 6px;
  font-size: 11px;
  font-weight: 400;
  color: var(--ev-c-text-3);
}
.now {
  flex-shrink: 0;
  cursor: pointer;
  border: 1px solid var(--ev-c-gray-3);
  background: var(--ev-button-alt-bg);
  color: var(--ev-button-alt-text);
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
}
.now:disabled {
  opacity: 0.4;
  cursor: default;
}
.tag {
  margin-left: 6px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.4px;
  border-radius: 6px;
  padding: 1px 5px;
}
.tag.pk {
  color: #f0dc4e;
  border: 1px solid #f0dc4e55;
}
.tag.auto {
  color: #42d392;
  border: 1px solid #42d39255;
}
.tag.nn {
  color: var(--ev-c-text-3);
  border: 1px solid var(--ev-c-gray-2);
}
.control {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.input {
  flex: 1;
  min-width: 0;
  background: var(--color-background-mute);
  border: 1px solid var(--ev-c-gray-3);
  border-radius: 6px;
  color: var(--color-text);
  padding: 6px 10px;
  font-size: 13px;
}
.input:focus {
  outline: none;
  border-color: #3178c6;
}
.input:disabled {
  opacity: 0.5;
}
.textarea {
  resize: none;
  overflow-y: auto;
  max-height: 360px;
  line-height: 1.45;
  font-family: inherit;
}
.null-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 7px;
  font-size: 12px;
  font-weight: 400;
  color: var(--ev-c-text-2);
  cursor: pointer;
  user-select: none;
}
.null-toggle.disabled {
  opacity: 0.4;
  cursor: default;
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
.btn.primary {
  background: #3178c6;
  color: #fff;
  border-color: #3178c6;
}
</style>

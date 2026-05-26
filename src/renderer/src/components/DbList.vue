<script setup lang="ts">
import { reactive, ref, toRaw } from 'vue'
import type { ConsoleTarget, DatabaseDescriptor, DatabaseRef } from '../../../shared/types'
import ContextMenu from './ContextMenu.vue'

defineProps<{ databases: DatabaseDescriptor[]; selectedKey?: string }>()
const emit = defineEmits<{
  select: [{ ref: DatabaseRef; table: string }]
  console: [ConsoleTarget]
}>()

// Right-click "Console" on database / table rows.
const menu = ref<{ x: number; y: number; target: ConsoleTarget }>()
function openMenu(event: MouseEvent, target: ConsoleTarget): void {
  menu.value = { x: event.clientX, y: event.clientY, target }
}
function onMenuSelect(id: string): void {
  if (id === 'console' && menu.value) emit('console', menu.value.target)
}

const expanded = reactive(new Set<string>())
const tableCache = reactive<Record<string, string[]>>({})
const loading = reactive(new Set<string>())
const errors = reactive<Record<string, string>>({})

const dbKey = (ref: DatabaseRef): string =>
  `${ref.connectionId}:${ref.kind === 'remote' ? ref.databaseId : ref.filePath}`
const tableKey = (ref: DatabaseRef, table: string): string => `${dbKey(ref)}/${table}`

async function toggle(desc: DatabaseDescriptor): Promise<void> {
  const key = dbKey(desc.ref)
  if (expanded.has(key)) {
    expanded.delete(key)
    return
  }
  expanded.add(key)
  if (tableCache[key] || loading.has(key)) return
  loading.add(key)
  delete errors[key]
  try {
    // toRaw: the ref lives in reactive state; its Vue proxy can't cross IPC.
    tableCache[key] = await window.api.data.listTables(toRaw(desc.ref))
  } catch (error) {
    errors[key] = error instanceof Error ? error.message : String(error)
  } finally {
    loading.delete(key)
  }
}
</script>

<template>
  <template v-for="desc in databases" :key="dbKey(desc.ref)">
    <button
      class="row database"
      @click="toggle(desc)"
      @contextmenu.prevent="openMenu($event, { scope: 'database', ref: desc.ref })"
    >
      <span class="chevron" :class="{ open: expanded.has(dbKey(desc.ref)) }">›</span>
      <span class="name">{{ desc.name }}</span>
      <span v-if="loading.has(dbKey(desc.ref))" class="spinner" />
    </button>

    <div v-if="expanded.has(dbKey(desc.ref))" class="children">
      <div v-if="errors[dbKey(desc.ref)]" class="row error" :title="errors[dbKey(desc.ref)]">
        {{ errors[dbKey(desc.ref)] }}
      </div>
      <div v-else-if="tableCache[dbKey(desc.ref)]?.length === 0" class="row muted">No tables</div>
      <button
        v-for="table in tableCache[dbKey(desc.ref)] ?? []"
        :key="table"
        class="row table"
        :class="{ selected: selectedKey === tableKey(desc.ref, table) }"
        @click="emit('select', { ref: desc.ref, table })"
        @contextmenu.prevent="openMenu($event, { scope: 'table', ref: desc.ref, table })"
      >
        <span class="name">{{ table }}</span>
      </button>
    </div>
  </template>

  <ContextMenu
    v-if="menu"
    :x="menu.x"
    :y="menu.y"
    :items="[{ id: 'console', label: 'Console' }]"
    @select="onMenuSelect"
    @close="menu = undefined"
  />
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  color: var(--color-text);
  font-size: 14px;
  padding: 5px 20px 5px 14px;
  cursor: pointer;
}
.row:hover {
  background: var(--color-background-mute);
}
.row.database {
  padding-left: 44px;
  color: var(--ev-c-text-1);
}
.row.table {
  padding-left: 66px;
  font-size: 13px;
  color: var(--ev-c-text-2);
}
.row.table.selected {
  background: #3178c633;
  color: var(--color-text);
}
.chevron {
  display: inline-block;
  transition: transform 120ms;
  color: var(--ev-c-text-3);
}
.chevron.open {
  transform: rotate(90deg);
}
.spinner {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  border: 2px solid var(--ev-c-gray-2);
  border-top-color: var(--ev-c-text-2);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.muted {
  color: var(--ev-c-text-3);
  cursor: default;
}
.error {
  color: #f08a8a;
  cursor: default;
  white-space: normal;
  font-size: 12px;
  line-height: 1.4;
}
</style>

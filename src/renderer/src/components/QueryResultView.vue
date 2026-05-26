<script setup lang="ts">
import { displayValue, isNullish } from '../lib/cell'

defineProps<{ columns: string[]; rows: Record<string, unknown>[] }>()
</script>

<template>
  <div class="result">
    <div v-if="!columns.length && !rows.length" class="state muted">No rows.</div>
    <div v-else class="grid-wrap">
      <table class="grid">
        <thead>
          <tr>
            <th v-for="(col, colIndex) in columns" :key="colIndex">{{ col }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, rowIndex) in rows" :key="rowIndex">
            <td
              v-for="(col, colIndex) in columns"
              :key="colIndex"
              :class="{ null: isNullish(row[col]) }"
            >
              {{ isNullish(row[col]) ? 'NULL' : displayValue(row[col]) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.result {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.state {
  padding: 24px;
}
.muted {
  color: var(--ev-c-text-2);
}
.grid-wrap {
  flex: 1;
  overflow: auto;
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
.grid td.null {
  color: var(--ev-c-text-3);
  font-style: italic;
}
</style>

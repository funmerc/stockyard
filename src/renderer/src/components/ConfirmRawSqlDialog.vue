<script setup lang="ts">
import type { RawWritePreview } from '../../../shared/types'

defineProps<{
  sql: string
  preview: RawWritePreview | null
  production: boolean
  committing: boolean
  error: string
}>()
defineEmits<{ confirm: []; cancel: [] }>()
</script>

<template>
  <div class="overlay" @click.self="$emit('cancel')">
    <div class="panel">
      <header class="head">
        <h2>Confirm statement</h2>
        <span
          v-if="production"
          class="prod"
          title="This runs against your live Cloudflare database"
        >
          PRODUCTION
        </span>
      </header>

      <section class="block">
        <div class="label">STATEMENT</div>
        <pre class="sql">{{ sql }}</pre>
      </section>

      <div v-if="preview && preview.affectedCount !== null" class="count">
        <strong>{{ preview.affectedCount }}</strong>
        row{{ preview.affectedCount === 1 ? '' : 's' }} affected
        <span class="muted">· verified by dry-run</span>
      </div>
      <div v-else class="warn">
        Affected rows can't be previewed on a remote database — this runs immediately and cannot be
        undone.
      </div>

      <div v-if="error" class="error">{{ error }}</div>

      <footer class="actions">
        <button class="btn" :disabled="committing" @click="$emit('cancel')">Cancel</button>
        <button class="btn danger" :disabled="committing" @click="$emit('confirm')">
          {{ committing ? 'Running…' : 'Run' }}
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
  z-index: 25;
}
.panel {
  width: 640px;
  max-width: 90vw;
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
  overflow: auto;
}
.count {
  font-size: 13px;
}
.warn {
  font-size: 13px;
  color: #f0a878;
}
.muted {
  color: var(--ev-c-text-2);
  font-weight: 400;
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

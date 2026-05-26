<script setup lang="ts">
import { useUiSize } from '../composables/useUiSize'

const { size, sizes, labels } = useUiSize()
</script>

<template>
  <div class="general">
    <div class="setting">
      <div class="setting-text">
        <div class="setting-label">Interface size</div>
        <div class="setting-desc">Scales all text and controls across the app.</div>
      </div>
      <div class="seg">
        <button
          v-for="option in sizes"
          :key="option"
          class="seg-btn"
          :class="{ active: size === option }"
          @click="size = option"
        >
          {{ labels[option] }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.general {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.setting {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.setting-label {
  font-weight: 600;
  font-size: 14px;
}
.setting-desc {
  font-size: 12px;
  color: var(--ev-c-text-3);
  margin-top: 2px;
}
.seg {
  display: flex;
  flex-shrink: 0;
  border: 1px solid var(--ev-c-gray-3);
  border-radius: 8px;
  overflow: hidden;
}
.seg-btn {
  cursor: pointer;
  border: none;
  border-left: 1px solid var(--ev-c-gray-3);
  background: var(--ev-button-alt-bg);
  color: var(--ev-button-alt-text);
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}
.seg-btn:first-child {
  border-left: none;
}
.seg-btn:hover {
  background: var(--ev-button-alt-hover-bg);
}
.seg-btn.active {
  background: #3178c6;
  color: #fff;
}
</style>

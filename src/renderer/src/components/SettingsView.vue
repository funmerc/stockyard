<script setup lang="ts">
import { ref } from 'vue'
import GeneralSettings from './GeneralSettings.vue'
import ThemeSettings from './ThemeSettings.vue'
import ConnectionsSettings from './ConnectionsSettings.vue'

type SectionId = 'general' | 'theme' | 'connections'

const props = withDefaults(defineProps<{ initialSection?: SectionId }>(), {
  initialSection: 'general'
})

defineEmits<{ close: [] }>()

const sections: { id: SectionId; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'theme', label: 'Theme' },
  { id: 'connections', label: 'Connections' }
]

const active = ref<SectionId>(props.initialSection)
</script>

<template>
  <div class="overlay" @click.self="$emit('close')">
    <div class="panel">
      <header class="panel-head">
        <h2>Settings</h2>
        <button class="x" @click="$emit('close')">✕</button>
      </header>

      <div class="settings-body">
        <nav class="settings-nav">
          <button
            v-for="section in sections"
            :key="section.id"
            class="nav-item"
            :class="{ active: active === section.id }"
            @click="active = section.id"
          >
            {{ section.label }}
          </button>
        </nav>

        <section class="settings-content">
          <GeneralSettings v-if="active === 'general'" />
          <ThemeSettings v-else-if="active === 'theme'" />
          <ConnectionsSettings v-else-if="active === 'connections'" @close="$emit('close')" />
        </section>
      </div>
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
  z-index: 10;
}
.panel {
  width: 820px;
  max-width: 92vw;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  background: var(--color-background-soft);
  border: 1px solid var(--ev-c-gray-3);
  border-radius: 10px;
  padding: 18px 20px;
}
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.panel-head h2 {
  font-size: 18px;
  font-weight: 700;
}
.x {
  background: none;
  border: none;
  color: var(--ev-c-text-2);
  cursor: pointer;
  font-size: 16px;
}
.settings-body {
  display: flex;
  gap: 18px;
  flex: 1;
  min-height: 0;
}
.settings-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 160px;
  flex-shrink: 0;
  border-right: 1px solid var(--ev-c-gray-3);
  padding-right: 12px;
}
.nav-item {
  text-align: left;
  background: none;
  border: none;
  color: var(--ev-c-text-2);
  cursor: pointer;
  border-radius: 6px;
  padding: 7px 10px;
  font-size: 13px;
  font-weight: 600;
}
.nav-item:hover {
  background: var(--color-background-mute);
}
.nav-item.active {
  background: var(--color-background-mute);
  color: var(--color-text);
}
.settings-content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>

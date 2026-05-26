<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

interface MenuItem {
  id: string
  label: string
  danger?: boolean
  /** Render as a non-interactive group label instead of a clickable item. */
  header?: boolean
}

const props = defineProps<{
  x: number
  y: number
  items: MenuItem[]
}>()

const emit = defineEmits<{ select: [id: string]; close: [] }>()

const menu = ref<HTMLElement>()
const left = ref(props.x)
const top = ref(props.y)

function choose(item: MenuItem): void {
  emit('select', item.id)
  emit('close')
}

function close(): void {
  emit('close')
}

// Close on any interaction outside the menu so it behaves like a native menu.
function onPointerDown(event: PointerEvent): void {
  if (menu.value && !menu.value.contains(event.target as Node)) close()
}
function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') close()
}

onMounted(async () => {
  await nextTick()
  // Keep the menu fully on-screen regardless of where the click landed.
  const element = menu.value
  if (element) {
    const rect = element.getBoundingClientRect()
    if (props.x + rect.width > window.innerWidth) {
      left.value = Math.max(4, window.innerWidth - rect.width - 4)
    }
    if (props.y + rect.height > window.innerHeight) {
      top.value = Math.max(4, window.innerHeight - rect.height - 4)
    }
  }
  // The opening right-click's pointerdown has already fired, so this won't self-close.
  window.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('scroll', close, true)
  window.addEventListener('resize', close)
  window.addEventListener('blur', close)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onPointerDown, true)
  window.removeEventListener('keydown', onKeyDown, true)
  window.removeEventListener('scroll', close, true)
  window.removeEventListener('resize', close)
  window.removeEventListener('blur', close)
})
</script>

<template>
  <Teleport to="body">
    <div
      ref="menu"
      class="context-menu"
      role="menu"
      :style="{ left: `${left}px`, top: `${top}px` }"
      @contextmenu.prevent
    >
      <template v-for="item in items" :key="item.id">
        <div v-if="item.header" class="header">{{ item.label }}</div>
        <button
          v-else
          class="item"
          :class="{ danger: item.danger }"
          role="menuitem"
          @click="choose(item)"
        >
          {{ item.label }}
        </button>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.context-menu {
  position: fixed;
  z-index: 1000;
  min-width: 160px;
  display: flex;
  flex-direction: column;
  padding: 4px;
  background: var(--color-background-soft);
  border: 1px solid var(--ev-c-gray-3);
  border-radius: 8px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
  user-select: none;
}
.item {
  text-align: left;
  background: none;
  border: none;
  color: var(--color-text);
  cursor: pointer;
  border-radius: 5px;
  padding: 7px 12px;
  font-size: 13px;
  white-space: nowrap;
}
.item:hover {
  background: var(--color-background-mute);
}
.item.danger {
  color: #f08a8a;
}
.header {
  padding: 5px 12px 3px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--ev-c-text-3);
  user-select: none;
}
</style>

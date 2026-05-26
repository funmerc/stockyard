import { ref, watch } from 'vue'
import type { UiSize } from '../../../shared/types'

// Zoom factor applied to the whole frame per profile. "small" matches the
// original (unscaled) layout; "medium" is the default.
const FACTORS: Record<UiSize, number> = {
  small: 1,
  medium: 1.15,
  large: 1.3,
  'x-large': 1.5
}

export const UI_SIZES: UiSize[] = ['small', 'medium', 'large', 'x-large']
export const UI_SIZE_LABELS: Record<UiSize, string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
  'x-large': 'X-Large'
}

const STORAGE_KEY = 'stockyard:ui-size'

function load(): UiSize {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored && (UI_SIZES as readonly string[]).includes(stored) ? (stored as UiSize) : 'medium'
}

// Module-level so every caller shares one source of truth.
const size = ref<UiSize>(load())
let initialized = false

/** Shared interface-size state; applies the zoom factor and persists changes. */
export function useUiSize(): {
  size: typeof size
  sizes: UiSize[]
  labels: Record<UiSize, string>
} {
  if (!initialized) {
    initialized = true
    window.api.ui.setZoom(FACTORS[size.value])
    watch(size, (value) => {
      localStorage.setItem(STORAGE_KEY, value)
      window.api.ui.setZoom(FACTORS[value])
    })
  }
  return { size, sizes: UI_SIZES, labels: UI_SIZE_LABELS }
}

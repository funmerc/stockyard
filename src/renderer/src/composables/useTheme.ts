import { ref, watch } from 'vue'
import type { ThemeChoice } from '../../../shared/types'

export const THEMES: ThemeChoice[] = ['auto', 'light', 'dark']
export const THEME_LABELS: Record<ThemeChoice, string> = {
  auto: 'Auto',
  light: 'Light',
  dark: 'Dark'
}

const STORAGE_KEY = 'stockyard:theme'

function load(): ThemeChoice {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored && (THEMES as readonly string[]).includes(stored) ? (stored as ThemeChoice) : 'auto'
}

// Module-level so every caller shares one source of truth.
const theme = ref<ThemeChoice>(load())
let initialized = false

/** Shared theme state; pushes the choice to nativeTheme (main) and persists it. */
export function useTheme(): {
  theme: typeof theme
  themes: ThemeChoice[]
  labels: Record<ThemeChoice, string>
} {
  if (!initialized) {
    initialized = true
    void window.api.ui.setTheme(theme.value)
    watch(theme, (value) => {
      localStorage.setItem(STORAGE_KEY, value)
      void window.api.ui.setTheme(value)
    })
  }
  return { theme, themes: THEMES, labels: THEME_LABELS }
}

import { ref, watchEffect } from 'vue'

const STORAGE_KEY = 'wdh_theme'

function getInitialTheme() {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const theme = ref(getInitialTheme())
const isDark = ref(theme.value === 'dark')

watchEffect(() => {
  document.documentElement.setAttribute('data-theme', theme.value)
  isDark.value = theme.value === 'dark'
})

export function useTheme() {
  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
    localStorage.setItem(STORAGE_KEY, theme.value)
  }

  function setTheme(value) {
    theme.value = value
    localStorage.setItem(STORAGE_KEY, value)
  }

  return { theme, isDark, toggleTheme, setTheme }
}

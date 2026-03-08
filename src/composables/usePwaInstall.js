/**
 * usePwaInstall — captures the browser's beforeinstallprompt event globally
 * so it can be triggered at any point later in the session.
 *
 * Call initPwaInstall() once in App.vue to start listening immediately.
 * Call installApp() from anywhere to show the native install prompt.
 */

import { ref } from 'vue'

const deferredPrompt = ref(null)

function initPwaInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt.value = e
  })

  window.addEventListener('appinstalled', () => {
    deferredPrompt.value = null
  })
}

async function installApp() {
  if (!deferredPrompt.value) return false
  await deferredPrompt.value.prompt()
  const { outcome } = await deferredPrompt.value.userChoice
  deferredPrompt.value = null
  return outcome === 'accepted'
}

const canInstall = () => !!deferredPrompt.value

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent)

const isStandalone = () =>
  window.navigator.standalone === true ||
  window.matchMedia('(display-mode: standalone)').matches

export function usePwaInstall() {
  return { initPwaInstall, installApp, canInstall, isIos, isStandalone }
}

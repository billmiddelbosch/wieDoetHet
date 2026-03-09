/**
 * usePushSubscription
 *
 * Manages Web Push subscription lifecycle:
 *   - Registers the service worker at /sw.js
 *   - Subscribes the browser using VAPID (applicationServerKey from env)
 *   - Persists the subscription to the backend via POST /push-subscriptions
 *   - Checks subscription status via GET /push-subscriptions/me
 *   - Unsubscribes and deletes from backend via DELETE /push-subscriptions/me
 *
 * VAPID public key must be set in VITE_VAPID_PUBLIC_KEY env var.
 */

import api from '@/lib/axios.js'

const SW_PATH = '/sw.js'
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

/**
 * Converts a base64url-encoded VAPID public key to a Uint8Array
 * as required by PushManager.subscribe applicationServerKey.
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

async function getRegistration() {
  if (!navigator.serviceWorker) return null
  const reg = await navigator.serviceWorker.register(SW_PATH)
  await navigator.serviceWorker.ready
  return reg
}

export function usePushSubscription() {
  /**
   * Registers the SW and subscribes to push.
   * Triggers the browser permission prompt if not already granted.
   * POSTs the subscription to the backend.
   *
   * @returns {Promise<boolean>} true on success, false if push not supported
   */
  async function subscribe() {
    const reg = await getRegistration()
    if (!reg) return false

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: VAPID_PUBLIC_KEY ? urlBase64ToUint8Array(VAPID_PUBLIC_KEY) : undefined,
    })

    const { endpoint, keys } = sub.toJSON()
    await api.post('/push-subscriptions', { endpoint, keys })

    return true
  }

  /**
   * Checks whether the current user has an active push subscription.
   * Performs a backend round-trip to catch stale local subscriptions.
   *
   * @returns {Promise<boolean>}
   */
  async function isSubscribed() {
    if (!navigator.serviceWorker) return false

    const reg = await navigator.serviceWorker.getRegistration(SW_PATH)
    if (!reg) return false

    const sub = await reg.pushManager.getSubscription()
    if (!sub) return false

    try {
      await api.get('/push-subscriptions/me')
      return true
    } catch {
      return false
    }
  }

  /**
   * Unsubscribes the browser and deletes the subscription from the backend.
   */
  async function unsubscribe() {
    const reg = await navigator.serviceWorker?.getRegistration(SW_PATH)
    const sub = await reg?.pushManager.getSubscription()
    await sub?.unsubscribe()
    await api.delete('/push-subscriptions/me').catch(() => {})
  }

  return { subscribe, isSubscribed, unsubscribe }
}

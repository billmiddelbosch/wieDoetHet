/**
 * analytics.js — Thin gtag.js wrapper for Google Analytics 4.
 *
 * Rules:
 * - initAnalytics() is a no-op when measurementId is blank (local dev without an ID).
 * - Every public function silently no-ops when window.gtag is not available.
 * - No third-party npm package — plain gtag script injection only.
 */

/**
 * Inject the gtag.js script tags and configure the GA4 stream.
 * Call once at app startup (main.js) before mounting.
 *
 * @param {string} measurementId  e.g. "G-XXXXXXXXXX"
 */
export function initAnalytics(measurementId) {
  if (!measurementId) return

  // gtag data layer bootstrap
  window.dataLayer = window.dataLayer ?? []
  window.gtag = function () {
    window.dataLayer.push(arguments)
  }
  window.gtag('js', new Date())
  window.gtag('config', measurementId, { send_page_view: false })

  // Async script tag
  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`
  document.head.appendChild(script)
}

/**
 * Send a page_view hit to GA4.
 * Called from the router afterEach hook on every navigation.
 *
 * @param {string} path   Route full path  (e.g. "/groups/42")
 * @param {string} title  Route name used as page title (e.g. "group-detail")
 */
export function trackPageView(path, title) {
  if (typeof window.gtag !== 'function') return
  window.gtag('event', 'page_view', {
    page_path: path,
    page_title: title ?? path,
  })
}

/**
 * Send a named custom event to GA4.
 * All calls are silently dropped when gtag is not loaded.
 *
 * @param {string} name    GA4 event name (snake_case recommended)
 * @param {object} params  Optional event parameters
 */
export function trackEvent(name, params = {}) {
  if (typeof window.gtag !== 'function') return
  window.gtag('event', name, params)
}

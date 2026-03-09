/**
 * sw.js — wieDoetHet service worker
 *
 * Minimal service worker that satisfies PWA installability requirements.
 * No offline caching is implemented here — that is deferred to a later item.
 *
 * Push event handling for S-02 (web push notifications) will be added
 * when the Lambda backend is deployed.
 */

self.addEventListener('install', (event) => {
  // Activate immediately without waiting for existing clients to close
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  // Take control of all open clients immediately
  event.waitUntil(self.clients.claim())
})

// fetch handler required for standalone display-mode eligibility on some browsers
self.addEventListener('fetch', () => {
  // Pass through — no caching strategy yet
})

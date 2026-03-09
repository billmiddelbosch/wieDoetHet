# Spec — Analytics (INT-06)

**Last Updated:** 2026-03-08

---

## Purpose

Integrate Google Analytics 4 to track user behaviour across the app. Enables data-driven decisions on user growth, feature adoption, and funnel performance — without blocking or interfering with any user action.

---

## Architecture

### `src/lib/analytics.js`
Thin wrapper around `window.gtag`. All functions are **no-ops** when `VITE_GA_MEASUREMENT_ID` is not set, so local dev is unaffected.

```js
initAnalytics(measurementId)  // Injects gtag.js <script> tags dynamically
trackPageView(path, title)    // Sends GA4 page_view event
trackEvent(name, params)      // Sends any custom GA4 event
```

### Environment variable
```
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```
Set per environment in `.env.local` (dev) or deployment config (staging/prod). Never hardcoded.

---

## Tracked Events

| Event name | Fired when | Key parameters | File |
|---|---|---|---|
| `page_view` | Every route navigation | `page_path`, `page_title` | `src/router/index.js` |
| `profile_added` | User completes registration | — | `src/views/RegisterView.vue` |
| `group_created` | Initiator successfully creates a group | `group_id`, `is_temporary` | `src/views/GroupCreateView.vue` |
| `task_claimed` | A task is successfully claimed | `group_id`, `task_id`, `is_anonymous` | `src/views/GroupDetailView.vue` |
| `share` (copy_link) | User copies the group share link | `method: 'copy_link'`, `group_name` | `src/components/molecules/ShareLinkPanel.vue` |
| `share` (whatsapp) | User opens WhatsApp share | `method: 'whatsapp'`, `group_name` | `src/components/molecules/ShareLinkPanel.vue` |

---

## Implementation Checklist

### Frontend — done
- [x] `src/lib/analytics.js` — gtag wrapper with `initAnalytics`, `trackPageView`, `trackEvent`
- [x] `src/main.js` — calls `initAnalytics` at bootstrap
- [x] `src/router/index.js` — `afterEach` hook fires `trackPageView` on every navigation
- [x] `src/views/RegisterView.vue` — fires `profile_added` after successful registration
- [x] `src/views/GroupCreateView.vue` — fires `group_created` after group is created
- [x] `src/views/GroupDetailView.vue` — fires `task_claimed` after task is claimed
- [x] `src/components/molecules/ShareLinkPanel.vue` — fires `share` for copy-link and WhatsApp
- [x] `.env.example` — documents `VITE_GA_MEASUREMENT_ID`

### To do — configuration & validation
- [ ] Create a GA4 property in Google Analytics for the production domain
- [ ] Add `VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX` to the production deployment environment
- [ ] Optionally create a separate GA4 property (or debug stream) for staging
- [ ] Verify events arrive in GA4 **DebugView** by temporarily setting `debug_mode: true` in `initAnalytics`
- [ ] Confirm `page_view` fires on initial load and on each client-side navigation
- [ ] Confirm `profile_added` fires exactly once per new registration
- [ ] Confirm `group_created` fires with correct `is_temporary` value
- [ ] Confirm `task_claimed` fires with correct `is_anonymous` value
- [ ] Confirm both `share` variants fire with the correct `method` parameter
- [ ] Remove `debug_mode` before releasing to production

### To do — privacy & compliance
- [ ] Add a cookie / analytics consent notice (required under GDPR for EU users)
  - Options: lightweight banner (e.g. `vue-cookie-accept-decline`), or conditionally call `initAnalytics` only after consent
- [ ] Confirm IP anonymisation is active — GA4 anonymises IPs by default, but verify in property settings
- [ ] Update the privacy policy to mention GA4 data collection
- [ ] Ensure no PII is sent in event parameters (user names, emails, phone numbers must never appear)

### To do — future events (nice to have)
- [ ] `task_unclaimed` — when a claimer removes their claim
- [ ] `group_shared_opened` — when someone opens a share link (`/g/:shareToken`)
- [ ] `scorecard_viewed` — when the scorecard page is opened
- [ ] `pwa_installed` — when the PWA install prompt is accepted (Android) or iOS instructions are shown

---

## Acceptance Criteria

- [ ] No GA requests fire in local dev when `VITE_GA_MEASUREMENT_ID` is not set
- [ ] All six events above appear in GA4 DebugView during manual QA
- [ ] No console errors thrown when gtag is not loaded
- [ ] GDPR consent mechanism is in place before going live in production

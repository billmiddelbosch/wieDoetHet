# Spec — PWA Install Foundation (U-09)

**Last Updated:** 2026-03-09 (REVIEW pass)
**Branch:** feature/U09-PWAInstall

---

## Purpose

Make wieDoetHet installable as a Progressive Web App so users can add it to their home screen directly from the browser. This is the technical foundation — manifest, icons, and service worker registration — that browsers require before they will offer "Add to Home Screen". The register flow's step 2 is repurposed as a dedicated install prompt screen to surface this capability at the highest-intent moment.

---

## What Is Already Built

| Asset | Status | Notes |
|---|---|---|
| `src/composables/usePwaInstall.js` | Done | Captures `beforeinstallprompt`, exposes `installApp`, `canInstall`, `isIos`, `isStandalone` |
| `App.vue` | Done | Calls `initPwaInstall()` on mount to start listening for the browser event |
| `RegisterView.vue` step 2 | Partial | Contains phone number input + iOS install modal. Phone input will be removed; iOS modal kept and promoted to inline |
| `ProfileView.vue` | Done | Phone number field already present — remains the only place to set it |
| `public/sw.js` | Done | Handles push events (S-02). U-09 only registers it — no changes to its content |
| i18n keys `auth.iosInstall*` | Done | iOS install modal copy already exists in nl.json and en.json |

---

## What U-09 Adds

### 1. `public/manifest.json`
Web App Manifest that satisfies browser installability requirements.

```json
{
  "name": "Wie Doet Het",
  "short_name": "Wie Doet Het",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#2d9cdb",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### 2. `public/icons/icon-192.png` and `public/icons/icon-512.png`
Placeholder square PNG icons in brand colour `#2d9cdb` with a white "W" lettermark. To be replaced with real artwork before production launch.

### 3. `index.html` updates
- `<link rel="manifest" href="/manifest.json">`
- `<meta name="theme-color" content="#2d9cdb">`
- `<meta name="apple-mobile-web-app-capable" content="yes">`
- `<meta name="apple-mobile-web-app-status-bar-style" content="default">`
- `<link rel="apple-touch-icon" href="/icons/icon-192.png">`
- Service worker registration inline script (registers `/sw.js`)

### 4. `RegisterView.vue` — step 2 rewrite
Step 2 becomes a pure PWA install screen. Phone number input is removed entirely.

**Android / Chrome (canInstall = true):**
- Icon, headline, three benefit bullets
- "Installeer de app" primary button → calls `installApp()` → navigates to `/dashboard`
- "Misschien later" skip link → navigates to `/dashboard`

**iOS / Safari (isIos = true, not standalone):**
- Inline display of the iOS Share → Add to Home Screen instructions (currently in a modal — promoted to inline within the step 2 card)
- "Klaar, ga naar dashboard" button → navigates to `/dashboard`

**Already installed (isStandalone = true):**
- Step 2 is skipped entirely on mount → immediate redirect to `/dashboard`

**Neither canInstall nor iOS (e.g. desktop browser):**
- Step 2 shows a neutral "App beschikbaar" message with a skip link to dashboard

---

## File Plan

| File | Action | Notes |
|---|---|---|
| `public/manifest.json` | Create | New Web App Manifest |
| `public/icons/icon-192.png` | Create | 192×192 placeholder PNG, brand colour |
| `public/icons/icon-512.png` | Create | 512×512 placeholder PNG, brand colour |
| `index.html` | Update | Add manifest link, meta tags, SW registration script |
| `src/views/RegisterView.vue` | Update | Replace step 2 — remove phone input, add install screen |
| `src/i18n/locales/nl.json` | Update | Replace phone-step keys with install-step keys |
| `src/i18n/locales/en.json` | Update | Replace phone-step keys with install-step keys |

---

## i18n Keys

### Keys to remove
These keys existed for the old phone+install step 2 and are no longer needed:

| Key | Reason |
|---|---|
| `auth.phoneStepTitle` | Replaced |
| `auth.phoneStepSubtitle` | Replaced |
| `auth.phoneStepBenefit1` | Replaced |
| `auth.phoneStepBenefit2` | Replaced |
| `auth.phoneStepBenefit3` | Replaced |
| `auth.phoneStepCta` | Replaced |
| `auth.phoneStepSkip` | Replaced |
| `auth.pickContact` | No longer used in register flow |

### Keys to add

| Key | nl | en |
|---|---|---|
| `auth.installStepTitle` | Voeg de app toe aan je beginscherm | Add the app to your home screen |
| `auth.installStepSubtitle` | Altijd binnen handbereik — één tik en je bent er | Always within reach — one tap and you're in |
| `auth.installStepBenefit1` | Geen browser nodig — open de app direct vanuit je beginscherm | No browser needed — open the app directly from your home screen |
| `auth.installStepBenefit2` | Werkt snel, voelt als een echte app | Works fast, feels like a native app |
| `auth.installStepBenefit3` | Ontvang meldingen zodra iemand een taak pakt | Receive notifications when someone grabs a task |
| `auth.installCta` | Installeer de app | Install the app |
| `auth.installSkip` | Misschien later | Maybe later |
| `auth.installAlreadyTitle` | App is klaar voor gebruik | App is ready to use |
| `auth.installAlreadyDesc` | Je gebruikt de app al vanuit je beginscherm. | You're already using the app from your home screen. |
| `auth.installDesktopTitle` | App beschikbaar | App available |
| `auth.installDesktopDesc` | Op mobiel kun je de app aan je beginscherm toevoegen. | On mobile you can add the app to your home screen. |
| `auth.installDashboard` | Ga naar dashboard | Go to dashboard |

### Keys to keep (already correct)
`auth.iosInstallTitle`, `auth.iosInstallIntro`, `auth.iosInstallStep1`, `auth.iosInstallShareLabel`, `auth.iosInstallStep2`, `auth.iosInstallAddLabel`, `auth.iosInstallDone`

---

## Acceptance Criteria

- [ ] `manifest.json` is served at `/manifest.json` and passes Chrome DevTools → Application → Manifest validation with no errors
- [ ] Both PNG icons exist at `/icons/icon-192.png` and `/icons/icon-512.png` and are referenced correctly in the manifest
- [ ] `index.html` includes `<link rel="manifest">`, `<meta name="theme-color">`, and the service worker registration script
- [ ] `public/sw.js` is registered without errors in Chrome DevTools → Application → Service Workers
- [ ] Chrome on Android shows the native "Add to Home Screen" / install banner (requires HTTPS or localhost)
- [ ] On iOS Safari, step 2 shows the inline Share → Add to Home Screen instructions
- [ ] On Android with `canInstall = true`, step 2 shows the install benefits + "Installeer de app" button
- [ ] Tapping "Installeer de app" triggers the native install prompt and then navigates to `/dashboard`
- [ ] Tapping the skip link navigates directly to `/dashboard` with no install prompt shown
- [ ] If the app is already running in standalone mode, step 2 is skipped and the user is redirected to `/dashboard` immediately
- [ ] Step 2 contains no phone number input field
- [ ] All new i18n keys are present in both `nl.json` and `en.json`
- [ ] Old phone-step i18n keys are removed from both locale files
- [ ] Lighthouse PWA audit scores "Installable" (no PWA installability failures)

---

## Analytics events

| Event | Fired when | Parameters |
|---|---|---|
| `profile_added` | Step 1 registration succeeds | — |
| `pwa_install_prompted` | Android install button tapped | `outcome: 'accepted' \| 'dismissed'` |
| `pwa_install_skipped` | "Misschien later" skip link tapped | — |

## Notes from REVIEW pass

- `manifest.json` icon `purpose` set to `"any"` only — `"maskable"` can be added once the artwork is confirmed to have safe-zone padding
- `iosInstallTitle` i18n key is retained in both locale files but not rendered in the current template (iOS instructions are shown inline without a separate title heading); harmless but can be cleaned up in a future i18n audit
- Real artwork placed in `public/icons/` by the user — `scripts/generate-icons.js` is retained as a utility for regenerating placeholder icons if needed
- `onMounted` standalone guard removed (was dead code — `step` is always 1 on mount)

## Out of Scope (U-09)

- Offline caching / app shell caching (future item)
- Push notification subscription UI (S-02)
- When/where to surface the install nudge outside of registration (U-10)
- Real icon artwork (placeholder is acceptable for this feature)
- Changes to `public/sw.js` content

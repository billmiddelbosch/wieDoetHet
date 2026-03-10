# Spec — SEO Optimisation (SEO-01)

**Backlog ID:** SEO-01
**Category:** Growth & Discoverability
**Effort:** M
**Last Updated:** 2026-03-09
**Status:** Implemented — 16/16 E2E tests passing, 12/12 unit tests passing

---

## Composable Atomic Classification

**`useHead` / `useJsonLd`** (`src/composables/useHead.js`)
- **Atomic Level:** Utility composable (no Atomic Design tier — not a component)
- **Atomic Rationale:** Pure logic unit with no UI. Manages `document.head` imperatively via `watchEffect`. Called from Page-level views. Lives in `src/composables/` per project convention. Zero store or project-specific imports beyond Vue Router's `useRoute`.

---

## Feature Overview

wieDoetHet is a Vue 3 SPA with no server-side rendering. Googlebot can execute JavaScript but is slow to do so and may miss dynamically-set meta tags entirely. Google AI Overviews (SGE) rely on structured, crawlable content to surface apps in generative answers.

**Current state (before SEO-01):**
- No `<meta name="description">` tag
- No Open Graph tags — share link previews are blank in WhatsApp, iMessage, Slack
- Every page shows the same `<title>Wie Doet Het</title>` — no per-page variation
- No `robots.txt` or `sitemap.xml`
- No structured data (JSON-LD)
- Landing page copy not tuned for any keyword intent
- Key content rendered client-side by Vue — Googlebot must execute JS to read it

**After SEO-01:**
- Rich, per-page meta tags managed by a `useHead` composable
- Branded OG image so every share link produces a preview card in WhatsApp
- Static HTML content in `index.html` so Googlebot reads the landing page without executing JavaScript
- `FAQPage` JSON-LD targeting question-based queries — the primary path to Google AI Overview citations
- `WebApplication` JSON-LD with free-tier pricing signals
- `robots.txt` and `sitemap.xml` in place

---

## Problem Statement

The share link is the primary growth channel for wieDoetHet. When a recipient opens a WhatsApp message containing a share link, they currently see a blank preview — no title, no description, no image. This reduces click-through. Simultaneously, the app is invisible in search because: (1) Googlebot may not execute the JS needed to read page content; (2) there is no structured data to feed AI Overview answers; (3) there is no sitemap to guide the crawler.

---

## Target Keywords

| Intent | Keywords |
|---|---|
| Navigational/awareness | wieDoetHet, wie doet het app, Wie Doet Wat |
| Problem-aware | taakverdeling app, taken verdelen groep |
| WhatsApp-specific | taken verdelen WhatsApp, wie pakt wat WhatsApp |
| Event-specific | vrijwilligers taken verdelen, taken verdelen feest, taken verdelen ouders, taken verdelen voetbal, taken verdelen sport |

---

## Decisions Made

| Decision point | Resolution |
|---|---|
| Landing page `<title>` | "Wie Doet Het – Taken verdelen voor groepen" |
| OG image strategy | Option B — static branded fallback `/public/og-image.png` (1200×630px) used on all pages |
| English SEO | Deferred — a separate backlog item will cover full English UI/SEO |
| Page priority | Landing page is the highest priority; public share/scorecard second |
| FAQ schema | `FAQPage` JSON-LD on landing page with 3–4 Dutch Q&A pairs |
| `WebApplication` schema | Include `offers.price: "0"`, `priceCurrency: "EUR"`, `applicationCategory: "UtilityApplication"` |
| Static HTML in `index.html` | H1, short description, and FAQ answers baked as real HTML — not Vue-rendered — so Googlebot reads them before JS runs |

---

## Scope of Work

| Area | Detail |
|---|---|
| `useHead` composable | New composable at `src/composables/useHead.js`. Accepts a config object (`title`, `description`, `ogTitle`, `ogDescription`, `ogUrl`, `ogImage`, `ogType`, `canonical`). Uses `document.head` manipulation via `watchEffect` — no external library. Called from every view. |
| Per-page meta — landing | Highest priority. Title, description, OG tags, `WebApplication` JSON-LD, `FAQPage` JSON-LD, canonical. |
| Per-page meta — public share/scorecard | Dynamic title = group name. Dynamic description references task count + "Wie Doet Het". Static branded OG image fallback. `ItemList` JSON-LD. Canonical. |
| Per-page meta — auth-gated pages | Generic defaults. `<meta name="robots" content="noindex">` on `/dashboard`, `/profile`, `/groups/*/settings` to prevent indexing of private pages. |
| Open Graph tags | `og:title`, `og:description`, `og:url`, `og:image`, `og:type` injected via `useHead` on every page. |
| `WebApplication` JSON-LD | Injected as `<script type="application/ld+json">` on landing. Includes `name`, `url`, `description`, `applicationCategory: "UtilityApplication"`, `offers: { "@type": "Offer", "price": "0", "priceCurrency": "EUR" }`, `inLanguage: "nl"`. |
| `FAQPage` JSON-LD | Injected as `<script type="application/ld+json">` on landing. Contains 4 Dutch Q&A pairs (see FAQ Content section below). |
| `ItemList` JSON-LD | Injected on public scorecard page. Lists claimed tasks as `ListItem` entries with claimer name and task title. |
| Static HTML in `index.html` | An `<noscript>`-compatible static section added to `index.html` `<body>` before `<div id="app">`: contains H1, one-sentence description, and the 4 FAQ Q&A pairs as real `<h2>`/`<p>` elements. Vue mounts over `#app` — this content is visually hidden via CSS (`display: none`) once Vue loads, but remains in the DOM for Googlebot. |
| `robots.txt` | New file at `public/robots.txt`. See rules below. |
| `sitemap.xml` | New file at `public/sitemap.xml`. Static entries only. See entries below. |
| Landing page copy (`LandingView.vue`) | H1, H2, and body copy updated to match target keywords. Must stay in sync with static HTML in `index.html`. |
| Branded OG image | `/public/og-image.png` at 1200×630px. Brand colour `#2d9cdb` background, "Wie Doet Het" wordmark, tagline "Taken verdelen voor groepen". |

---

## Out of Scope

| Area | Reason |
|---|---|
| SSR / SSG (Nuxt, ViteSSG) | Architectural overhaul — separate future decision |
| Dynamic per-group OG images | Requires edge function or screenshot service — post-MVP |
| English SEO / hreflang | Separate backlog item |
| Google Search Console setup | Operational task, not a code task |
| Per-group sitemap entries | No server — dynamic URLs cannot be enumerated statically |

---

## Acceptance Criteria

- [ ] AC-01: Landing page `<title>` is exactly "Wie Doet Het – Taken verdelen voor groepen"
- [ ] AC-02: Landing page `<meta name="description">` is within 155 characters and contains at least two target keywords
- [ ] AC-03: Public share/scorecard page has dynamic OG tags: `og:title` = group name, `og:description` references task count and "Wie Doet Het"
- [ ] AC-04: All pages include `<link rel="canonical">` pointing to the correct absolute URL
- [ ] AC-05: A WhatsApp link preview for a share URL shows title, description, and the branded OG image
- [ ] AC-06: `robots.txt` is served at `/robots.txt` and disallows `/dashboard`, `/profile`, and `/groups/*/settings`
- [ ] AC-07: `sitemap.xml` is served at `/sitemap.xml` and includes entries for `/`, `/login`, and `/register`
- [ ] AC-08: `WebApplication` JSON-LD on landing includes `offers.price: "0"`, `offers.priceCurrency: "EUR"`, and `applicationCategory: "UtilityApplication"`
- [ ] AC-09: `FAQPage` JSON-LD on landing contains exactly 4 Dutch Q&A entries
- [ ] AC-10: H1, short description, and FAQ answers are present as static HTML in `index.html` — readable by Googlebot without JavaScript execution
- [ ] AC-11: Vue `LandingView.vue` visible copy is consistent with the static HTML baked into `index.html`
- [ ] AC-12: `/public/og-image.png` exists at 1200×630px
- [ ] AC-13: `ItemList` JSON-LD is present on the public scorecard page
- [ ] AC-14: Lighthouse performance score on landing does not regress versus the pre-SEO-01 baseline

---

## Implementation Notes

### `useHead` composable (`src/composables/useHead.js`)

- Accepts a plain config object or a `computed` ref so callers can pass reactive values (e.g. group name from store)
- Manages a set of `<meta>` and `<link>` elements by `name`/`property` attribute — create on first call, update on subsequent calls, remove on `onUnmounted`
- JSON-LD `<script>` tags are injected separately via a `useJsonLd(schema)` composable (same file or sibling)
- Does NOT use `@vueuse/head` or `vue-meta` — keep dependencies minimal; the app is small enough for a hand-rolled solution
- Called in `onMounted` / `watchEffect` — not in `setup()` synchronously, to avoid SSR hydration concerns if SSR is added later
- Base URL for canonical and OG URLs comes from `import.meta.env.VITE_APP_BASE_URL` (new env var, e.g. `https://wiedoethet.nl`)

### JSON-LD schemas

**`WebApplication` schema (landing page):**
```json
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "Wie Doet Het",
  "url": "https://wiedoethet.nl",
  "description": "Verdeel taken over een groep zonder gedoe. Maak een takenlijst, deel de link via WhatsApp en zie wie wat pakt.",
  "applicationCategory": "UtilityApplication",
  "operatingSystem": "All",
  "inLanguage": "nl",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "EUR"
  }
}
```

**`FAQPage` schema (landing page):** see FAQ Content section below.

**`ItemList` schema (public scorecard page):**
```json
{
  "@context": "https://schema.org",
  "@type": "ItemList",
  "name": "<group name>",
  "description": "Taakverdeling voor <group name> via Wie Doet Het",
  "numberOfItems": <task count>,
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "<task title>",
      "description": "Geclaimd door: <claimer name>"
    }
  ]
}
```

### Static HTML in `index.html`

The static SEO block is placed immediately after `<body>` opens, before `<div id="app">`. It is styled with `display: none` via an inline `<style>` scoped to `#seo-static` so it is invisible to users once CSS loads, but remains in the DOM for crawlers:

```html
<style>#seo-static { display: none; }</style>
<div id="seo-static" aria-hidden="true">
  <h1>Wie Doet Het – Taken verdelen voor groepen</h1>
  <p>Maak een takenlijst, deel de link via WhatsApp en zie wie wat oppakt. Gratis, geen account nodig voor deelnemers.</p>
  <h2>Veelgestelde vragen</h2>
  <!-- FAQ Q&A pairs here -->
</div>
<div id="app"></div>
```

Vue mounts on `#app` only — the `#seo-static` block is never touched by Vue.

### FAQ Content (Dutch — `FAQPage` JSON-LD + static HTML)

**Q1: Hoe verdeel ik taken over een groep?**
> Maak een groep aan op Wie Doet Het, voeg je taken toe en deel de link via WhatsApp. Deelnemers zien de lijst en klikken op de taak die zij willen doen. Jij ziet direct wie wat heeft opgepakt.

**Q2: Welke app kan taken verdelen?**
> Wie Doet Het is een gratis app waarmee je eenvoudig taken verdeelt over een groep. Ideaal voor sport, school, feesten en vrijwilligerswerk. Deelnemers hebben geen account nodig.

**Q3: Is Wie Doet Het gratis?**
> Ja, Wie Doet Het is volledig gratis te gebruiken. Maak een account aan als organisator en nodig deelnemers uit via een deellink — zij hoeven zich nergens voor aan te melden.

**Q4: Kan ik taken verdelen via WhatsApp?**
> Ja. Na het aanmaken van een takenlijst genereer je een deellink die je rechtstreeks in je WhatsApp-groep plakt. Deelnemers openen de link en claimen hun taak zonder extra app of account.

### `robots.txt` rules (`public/robots.txt`)

```
User-agent: *
Allow: /
Disallow: /dashboard
Disallow: /profile
Disallow: /groups/*/settings
Sitemap: https://wiedoethet.nl/sitemap.xml
```

### `sitemap.xml` entries (`public/sitemap.xml`)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://wiedoethet.nl/</loc>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://wiedoethet.nl/login</loc>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>https://wiedoethet.nl/register</loc>
    <changefreq>yearly</changefreq>
    <priority>0.5</priority>
  </url>
</urlset>
```

### Environment variable

Add `VITE_APP_BASE_URL` to `.env.example`:
```
VITE_APP_BASE_URL=https://wiedoethet.nl
```
Local development value in `.env.local`:
```
VITE_APP_BASE_URL=http://localhost:5173
```

---

## Files to Create or Modify

| File | Action |
|---|---|
| `src/composables/useHead.js` | Create — head management composable |
| `src/views/LandingView.vue` | Modify — call `useHead`, update copy, inject JSON-LD |
| `src/views/ScorecardView.vue` | Modify — call `useHead` with dynamic group meta, inject `ItemList` JSON-LD |
| `src/views/ShareRedirectView.vue` | Modify — call `useHead` with group meta while resolving share token |
| `src/views/DashboardView.vue` | Modify — call `useHead` with `noindex` |
| `src/views/ProfileView.vue` | Modify — call `useHead` with `noindex` |
| `src/views/GroupSettingsView.vue` | Modify — call `useHead` with `noindex` |
| `src/views/LoginView.vue` | Modify — call `useHead` with generic meta |
| `src/views/RegisterView.vue` | Modify — call `useHead` with generic meta |
| `index.html` | Modify — add static SEO block, update baseline `<title>` and `<meta description>` |
| `public/robots.txt` | Create |
| `public/sitemap.xml` | Create |
| `public/og-image.png` | Create — 1200×630px branded image |
| `.env.example` | Modify — add `VITE_APP_BASE_URL` |

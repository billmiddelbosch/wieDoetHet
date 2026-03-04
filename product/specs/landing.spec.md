# Spec — Landing Page

**Last Updated:** 2026-03-03
**Atomic Level:** Page
**Atomic Rationale:** Top-level route component. Composes organisms (HeroSection, HowItWorksSection, FeatureHighlights, CtaSection) into a full marketing page.

---

## Purpose
The public-facing entry point. Explains the product, builds trust, and drives the user to create a group or open a share link.

## Route
`/` — only shown when user is NOT authenticated. Authenticated users are redirected to `/dashboard`.

## User Stories
- As a visitor, I want to immediately understand what the product does so I can decide whether to use it.
- As a mobile user coming from WhatsApp, I want a fast-loading page with a clear CTA.
- As a potential initiator, I want to start creating a group without needing to sign up first.

## Sections / Organisms
1. **AppHeader** — logo + nav (Login / Register links). Sticky on scroll.
2. **HeroSection** — headline, subheadline, primary CTA button ("Maak een groep aan"), secondary link ("Bekijk een voorbeeld")
3. **HowItWorksSection** — 3-step visual flow: Maak groep → Voeg taken toe → Deel de link
4. **FeatureHighlightsSection** — 3–4 feature cards (Geen account nodig, WhatsApp-vriendelijk, Wie pakt wat, Zelf bepalen wie ziet wat)
5. **PwaInstallBanner** — appears when `beforeinstallprompt` fires; "Voeg toe aan beginscherm"
6. **AppFooter** — minimal footer with copyright

## State
- `canInstallPwa` (local) — boolean, driven by `beforeinstallprompt` event
- Auth state from `useAuthStore` — used to redirect if already logged in

## Acceptance Criteria
- [ ] Page renders at `/` route
- [ ] Authenticated users are redirected to `/dashboard`
- [ ] Hero CTA navigates to `/groups/new`
- [ ] How-it-works shows exactly 3 steps
- [ ] PWA install banner appears only when browser fires `beforeinstallprompt`
- [ ] All text is in Dutch (nl locale)
- [ ] Page is responsive: single column on mobile, multi-column on desktop

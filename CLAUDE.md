# CLAUDE.md — wieDoetHet

## Project Overview

wieDoetHet is a Vue 3 single-page application. This file is the operational manual for Claude Code when working in this project.

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Vue 3 with Composition API | ^3.5.25 |
| Build Tool | Vite | ^7.3.1 |
| Language | JavaScript (ES modules) | ES2021 |
| Package Manager | npm | - |
| State Management | Pinia | ^3.0.4 |
| Routing | Vue Router | ^5.0.3 |
| Styling | Tailwind CSS v4 | ^4.x |
| HTTP Client | Axios (configured instance) | ^1.x |
| i18n | vue-i18n (Composition API mode) | ^11.x |
| Unit Testing | Vitest + @vue/test-utils | ^4.x |
| E2E Testing | Cypress | ^15.x |
| Linting | ESLint v10 (flat config) | ^10.x |
| Formatting | Prettier | ^3.x |

## Project Structure

```
src/
├── assets/              # Static assets (images, fonts, icons)
├── components/          # Reusable components
│   ├── ui/              # Base/primitive UI components (buttons, inputs, etc.)
│   └── __tests__/       # Component unit tests
├── composables/         # Shared composables (useFetch.js, etc.)
├── i18n/                # Internationalization
│   ├── index.js         # vue-i18n setup
│   └── locales/         # JSON translation files (nl.json, en.json)
├── layouts/             # Layout components wrapping RouterView
├── lib/                 # Third-party library configurations
│   └── axios.js         # Configured Axios instance with interceptors
├── router/              # Vue Router config
│   └── index.js         # Route definitions (lazy-loaded views)
├── stores/              # Pinia stores
│   └── __tests__/       # Store unit tests
├── utils/               # Pure utility functions
├── views/               # Page-level route components
├── App.vue              # Root component (renders DefaultLayout)
├── main.js              # App entry — registers plugins
└── style.css            # Global styles + Tailwind import
```

## Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run unit tests (Vitest)
npm run test:unit

# Open Cypress E2E runner (requires dev server running)
npm run test:e2e

# Run Cypress E2E headlessly (CI)
npm run test:e2e:ci

# Lint all files
npm run lint

# Lint and auto-fix
npm run lint:fix

# Format src/ with Prettier
npm run format
```

## Coding Standards

### Vue Components
- Use `<script setup>` syntax for all components — never Options API
- Name components in PascalCase (`UserProfile.vue`, `BaseButton.vue`)
- Page-level components live in `src/views/`, reusable ones in `src/components/`
- Use `<RouterLink>` for navigation, never raw `<a>` tags for internal links
- Avoid inline styles — use Tailwind utility classes

### Composables
- Named with the `use` prefix: `useAuth.js`, `useFetch.js`
- Live in `src/composables/` unless tightly coupled to a single component
- Always return an object (never a primitive directly)

### Pinia Stores
- Use the **Setup Store** pattern (function returning reactive state)
- Named with `use` prefix and `Store` suffix: `useAuthStore`, `useCounterStore`
- Keep stores focused — one domain concern per store
- Do not call stores outside of `<script setup>` or composables

### i18n
- All user-visible strings must go through `useI18n()` — never hardcode text
- Translation keys follow `section.key` dot notation
- Default locale is `nl` (Dutch), fallback is `en`
- Add keys to both `nl.json` and `en.json` simultaneously

### API Calls
- Always use the configured Axios instance from `@/lib/axios.js`
- Wrap API calls in composables — never call Axios directly from components
- Handle loading and error state using the `useFetch` composable pattern

### Tailwind CSS v4
- No `tailwind.config.js` — custom theme tokens go in `src/style.css` via `@theme { }`
- The `@import "tailwindcss"` directive is at the top of `src/style.css`
- The Tailwind Vite plugin is registered in `vite.config.js`

## Path Aliases

| Alias | Resolves to |
|---|---|
| `@/` | `src/` |

## Environment Variables

- Prefix all client-side env vars with `VITE_`
- Copy `.env.example` to `.env.local` for local overrides
- `.env.local` is gitignored — never commit secrets

| Variable | Description |
|---|---|
| `VITE_API_BASE_URL` | Base URL for all API requests |

## Testing Conventions

- Unit tests (Vitest) live alongside the code they test in `__tests__/` subdirectories
- Test files are named `<subject>.test.js`
- Always call `setActivePinia(createPinia())` in `beforeEach` for store tests
- Cypress E2E specs live in `cypress/e2e/` and are named `<feature>.cy.js`
- The dev server must be running for Cypress (`npm run dev` in a separate terminal)

## ESLint & Prettier

- ESLint uses flat config (`eslint.config.js`) — NOT `.eslintrc`
- `vue/multi-word-component-names` is disabled (allows single-word view names)
- Prettier runs via `eslint-config-prettier` to avoid rule conflicts
- Run `npm run format` before committing to keep formatting consistent

## Important Notes

- `vue-router` v5 and `pinia` v3 are installed — these are the current major versions for Vue 3
- `vue-i18n` is configured in Composition API mode (`legacy: false`) — use `useI18n()` hook
- The Axios instance automatically attaches `Authorization: Bearer <token>` from `localStorage`
- On 401 responses, the Axios interceptor clears the token and redirects to `/`

/**
 * RegisterView.test.js
 *
 * Tests for the two-step registration flow with PWA install step 2.
 *
 * usePwaInstall is mocked at module level with a shared state object.
 * Each test configures the state object to simulate a different scenario
 * before mounting the component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import i18n from '@/i18n'

// ---------------------------------------------------------------------------
// Shared PWA mock state — mutated per test in beforeEach
// ---------------------------------------------------------------------------

const pwaState = {
  canInstall: false,
  isIos: false,
  isStandalone: false,
  installApp: vi.fn().mockResolvedValue(true),
}

vi.mock('@/composables/usePwaInstall', () => ({
  usePwaInstall: () => ({
    initPwaInstall: vi.fn(),
    installApp: (...args) => pwaState.installApp(...args),
    canInstall: () => pwaState.canInstall,
    isIos: () => pwaState.isIos,
    isStandalone: () => pwaState.isStandalone,
  }),
}))

vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({
    register: vi.fn().mockResolvedValue(undefined),
    updateProfile: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal router with /register, /dashboard, /login routes */
function buildRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/register', component: { template: '<div />' } },
      { path: '/dashboard', component: { template: '<div>Dashboard</div>' } },
      { path: '/login', component: { template: '<div>Login</div>' } },
    ],
  })
}

/** Import and mount RegisterView with all required plugins */
async function mountRegister() {
  const { default: RegisterView } = await import('@/views/RegisterView.vue')
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = buildRouter()
  await router.push('/register')

  const wrapper = mount(RegisterView, {
    global: { plugins: [pinia, router, i18n] },
  })
  return { wrapper, router }
}

/** Fill and submit the step-1 registration form */
async function completeStep1(wrapper) {
  await wrapper.find('#reg-name').setValue('Jan')
  await wrapper.find('#reg-email').setValue('jan@example.nl')
  await wrapper.find('#reg-password').setValue('password123')
  await wrapper.find('#reg-password-confirm').setValue('password123')
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}

// ---------------------------------------------------------------------------
// Step 1 — Registration form
// ---------------------------------------------------------------------------

describe('RegisterView — step 1 (registration form)', () => {
  beforeEach(() => {
    Object.assign(pwaState, { canInstall: false, isIos: false, isStandalone: false })
    pwaState.installApp = vi.fn().mockResolvedValue(true)
  })

  it('renders all four registration form fields', async () => {
    const { wrapper } = await mountRegister()
    expect(wrapper.find('#reg-name').exists()).toBe(true)
    expect(wrapper.find('#reg-email').exists()).toBe(true)
    expect(wrapper.find('#reg-password').exists()).toBe(true)
    expect(wrapper.find('#reg-password-confirm').exists()).toBe(true)
  })

  it('shows name required error on empty submit', async () => {
    const { wrapper } = await mountRegister()
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Naam is verplicht')
  })

  it('shows password mismatch error', async () => {
    const { wrapper } = await mountRegister()
    await wrapper.find('#reg-name').setValue('Jan')
    await wrapper.find('#reg-email').setValue('jan@example.nl')
    await wrapper.find('#reg-password').setValue('password123')
    await wrapper.find('#reg-password-confirm').setValue('different123')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Wachtwoorden komen niet overeen')
  })

  it('shows password too short error', async () => {
    const { wrapper } = await mountRegister()
    await wrapper.find('#reg-name').setValue('Jan')
    await wrapper.find('#reg-email').setValue('jan@example.nl')
    await wrapper.find('#reg-password').setValue('short')
    await wrapper.find('#reg-password-confirm').setValue('short')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('minimaal 8 tekens')
  })

  it('does not show step-2 content before submitting step 1', async () => {
    const { wrapper } = await mountRegister()
    // Step 2 headline should not be present yet
    expect(wrapper.text()).not.toContain('Voeg de app toe aan je beginscherm')
    // No phone input should ever appear
    expect(wrapper.find('#reg-phone').exists()).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Step 2 — Android / Chrome (canInstall = true)
// ---------------------------------------------------------------------------

describe('RegisterView — step 2 (android install scenario)', () => {
  beforeEach(() => {
    Object.assign(pwaState, { canInstall: true, isIos: false, isStandalone: false })
    pwaState.installApp = vi.fn().mockResolvedValue(true)
  })

  it('shows install headline and subtitle after registration', async () => {
    const { wrapper } = await mountRegister()
    await completeStep1(wrapper)
    expect(wrapper.text()).toContain('Voeg de app toe aan je beginscherm')
    expect(wrapper.text()).toContain('Altijd binnen handbereik')
  })

  it('shows three benefit bullets', async () => {
    const { wrapper } = await mountRegister()
    await completeStep1(wrapper)
    expect(wrapper.text()).toContain('zonder browser')
    expect(wrapper.text()).toContain('echte app')
    expect(wrapper.text()).toContain('meldingen')
  })

  it('shows install button and skip link', async () => {
    const { wrapper } = await mountRegister()
    await completeStep1(wrapper)
    expect(wrapper.text()).toContain('Installeer de app')
    expect(wrapper.text()).toContain('Misschien later')
  })

  it('does NOT show a phone input field', async () => {
    const { wrapper } = await mountRegister()
    await completeStep1(wrapper)
    expect(wrapper.find('#reg-phone').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('WhatsApp-nummer')
    expect(wrapper.text()).not.toContain('Nummer opslaan')
  })

  it('skip link navigates directly to /dashboard', async () => {
    const { wrapper, router } = await mountRegister()
    await completeStep1(wrapper)
    const skipBtn = wrapper.findAll('button').find(b => b.text().includes('Misschien later'))
    expect(skipBtn).toBeDefined()
    await skipBtn.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/dashboard')
  })

  it('install button calls installApp() then navigates to /dashboard', async () => {
    const { wrapper, router } = await mountRegister()
    await completeStep1(wrapper)
    const installBtn = wrapper.findAll('button').find(b => b.text().includes('Installeer de app'))
    expect(installBtn).toBeDefined()
    await installBtn.trigger('click')
    await flushPromises()
    expect(pwaState.installApp).toHaveBeenCalledOnce()
    expect(router.currentRoute.value.path).toBe('/dashboard')
  })
})

// ---------------------------------------------------------------------------
// Step 2 — iOS / Safari (isIos = true)
// ---------------------------------------------------------------------------

describe('RegisterView — step 2 (iOS scenario)', () => {
  beforeEach(() => {
    Object.assign(pwaState, { canInstall: false, isIos: true, isStandalone: false })
    pwaState.installApp = vi.fn().mockResolvedValue(true)
  })

  it('shows iOS Share → Add to Home Screen instructions', async () => {
    const { wrapper } = await mountRegister()
    await completeStep1(wrapper)
    expect(wrapper.text()).toContain('Voeg de app toe aan je beginscherm')
    expect(wrapper.text()).toContain('Volg deze twee stappen')
    expect(wrapper.text()).toContain('Tik op het deel-icoon')
    expect(wrapper.text()).toContain('Zet op beginscherm')
  })

  it('shows done button that navigates to /dashboard', async () => {
    const { wrapper, router } = await mountRegister()
    await completeStep1(wrapper)
    const doneBtn = wrapper.findAll('button').find(b => b.text().includes('Klaar, ga naar dashboard'))
    expect(doneBtn).toBeDefined()
    await doneBtn.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/dashboard')
  })

  it('does NOT show native install button', async () => {
    const { wrapper } = await mountRegister()
    await completeStep1(wrapper)
    expect(wrapper.text()).not.toContain('Installeer de app')
  })

  it('does NOT show phone input field', async () => {
    const { wrapper } = await mountRegister()
    await completeStep1(wrapper)
    expect(wrapper.find('#reg-phone').exists()).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Step 2 — Other / desktop (neither canInstall nor isIos)
// ---------------------------------------------------------------------------

describe('RegisterView — step 2 (other/desktop scenario)', () => {
  beforeEach(() => {
    Object.assign(pwaState, { canInstall: false, isIos: false, isStandalone: false })
    pwaState.installApp = vi.fn().mockResolvedValue(true)
  })

  it('shows desktop fallback message', async () => {
    const { wrapper } = await mountRegister()
    await completeStep1(wrapper)
    expect(wrapper.text()).toContain('Voeg de app toe aan je beginscherm')
    expect(wrapper.text()).toContain('browserinstellingen')
  })

  it('shows go-to-dashboard button', async () => {
    const { wrapper, router } = await mountRegister()
    await completeStep1(wrapper)
    const dashBtn = wrapper.findAll('button').find(b => b.text().includes('Ga naar dashboard'))
    expect(dashBtn).toBeDefined()
    await dashBtn.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/dashboard')
  })

  it('does NOT show phone input field', async () => {
    const { wrapper } = await mountRegister()
    await completeStep1(wrapper)
    expect(wrapper.find('#reg-phone').exists()).toBe(false)
  })

  it('does NOT show native install button', async () => {
    const { wrapper } = await mountRegister()
    await completeStep1(wrapper)
    expect(wrapper.text()).not.toContain('Installeer de app')
  })
})

// ---------------------------------------------------------------------------
// Step 2 — Standalone (app already installed)
// ---------------------------------------------------------------------------

describe('RegisterView — step 2 (standalone: already installed)', () => {
  beforeEach(() => {
    Object.assign(pwaState, { canInstall: false, isIos: false, isStandalone: true })
    pwaState.installApp = vi.fn().mockResolvedValue(true)
  })

  it('navigates to /dashboard instead of showing step 2 after registration', async () => {
    const { wrapper, router } = await mountRegister()
    await completeStep1(wrapper)
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/dashboard')
  })

  it('does NOT show install step content', async () => {
    const { wrapper } = await mountRegister()
    await completeStep1(wrapper)
    await flushPromises()
    // Step 2 install headline should never render
    expect(wrapper.text()).not.toContain('Altijd binnen handbereik')
  })
})

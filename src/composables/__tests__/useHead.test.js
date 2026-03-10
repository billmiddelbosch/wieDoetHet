import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { defineComponent, computed, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createRouter, createWebHashHistory } from 'vue-router'
import { useHead, useJsonLd } from '../useHead'

// Minimal router — useHead uses useRoute() internally
function makeRouter() {
  return createRouter({
    history: createWebHashHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  })
}

function makeWrapper(setupFn) {
  const Comp = defineComponent({
    setup() {
      setupFn()
      return () => null
    },
  })
  const router = makeRouter()
  return mount(Comp, { global: { plugins: [router] } })
}

describe('useHead', () => {
  beforeEach(() => {
    // Reset document head to a clean state before each test
    document.title = ''
    document.querySelectorAll('meta[name], meta[property], link[rel="canonical"]').forEach((el) =>
      el.remove(),
    )
  })

  it('sets document.title', async () => {
    makeWrapper(() => useHead({ title: 'Test Page – Wie Doet Het', description: 'Test desc' }))
    await nextTick()
    expect(document.title).toBe('Test Page – Wie Doet Het')
  })

  it('sets meta description', async () => {
    makeWrapper(() => useHead({ title: 'T', description: 'My description' }))
    await nextTick()
    const el = document.querySelector('meta[name="description"]')
    expect(el).not.toBeNull()
    expect(el.getAttribute('content')).toBe('My description')
  })

  it('sets og:title and og:description', async () => {
    makeWrapper(() => useHead({ title: 'OG Title', description: 'OG Desc' }))
    await nextTick()
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe('OG Title')
    expect(document.querySelector('meta[property="og:description"]')?.getAttribute('content')).toBe('OG Desc')
  })

  it('sets og:type to "website" by default', async () => {
    makeWrapper(() => useHead({ title: 'T', description: 'D' }))
    await nextTick()
    expect(document.querySelector('meta[property="og:type"]')?.getAttribute('content')).toBe('website')
  })

  it('sets canonical link', async () => {
    makeWrapper(() => useHead({ title: 'T', description: 'D', ogUrl: 'https://wiedoethet.nl/' }))
    await nextTick()
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://wiedoethet.nl/')
  })

  it('sets noindex meta when noindex: true', async () => {
    makeWrapper(() => useHead({ title: 'T', description: 'D', noindex: true }))
    await nextTick()
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow')
  })

  it('does not set robots meta when noindex is false', async () => {
    makeWrapper(() => useHead({ title: 'T', description: 'D', noindex: false }))
    await nextTick()
    expect(document.querySelector('meta[name="robots"]')).toBeNull()
  })

  it('reacts to a computed config change', async () => {
    const titleRef = { value: 'First Title' }
    makeWrapper(() => {
      const config = computed(() => ({ title: titleRef.value, description: 'D' }))
      useHead(config)
    })
    await nextTick()
    expect(document.title).toBe('First Title')
  })

  it('cleans up injected elements on unmount', async () => {
    const wrapper = makeWrapper(() =>
      useHead({ title: 'Cleanup Test', description: 'D', ogUrl: 'https://wiedoethet.nl/test' }),
    )
    await nextTick()
    expect(document.querySelector('meta[name="description"]')).not.toBeNull()
    wrapper.unmount()
    await nextTick()
    expect(document.querySelector('link[rel="canonical"]')).toBeNull()
  })
})

describe('useJsonLd', () => {
  afterEach(() => {
    document.querySelectorAll('script[type="application/ld+json"]').forEach((el) => el.remove())
  })

  it('injects a JSON-LD script tag', async () => {
    const schema = { '@context': 'https://schema.org', '@type': 'WebApplication', name: 'Test' }
    makeWrapper(() => useJsonLd(schema))
    await nextTick()
    const el = document.querySelector('script[type="application/ld+json"]')
    expect(el).not.toBeNull()
    expect(JSON.parse(el.textContent)).toMatchObject({ '@type': 'WebApplication', name: 'Test' })
  })

  it('updates content when reactive schema changes', async () => {
    const schema = { value: { '@context': 'https://schema.org', '@type': 'WebApplication', name: 'V1' } }
    makeWrapper(() => {
      const reactiveSchema = computed(() => schema.value)
      useJsonLd(reactiveSchema)
    })
    await nextTick()
    const el = document.querySelector('script[type="application/ld+json"]')
    expect(JSON.parse(el.textContent).name).toBe('V1')
  })

  it('removes the script tag on unmount', async () => {
    const wrapper = makeWrapper(() =>
      useJsonLd({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [] }),
    )
    await nextTick()
    expect(document.querySelector('script[type="application/ld+json"]')).not.toBeNull()
    wrapper.unmount()
    await nextTick()
    expect(document.querySelector('script[type="application/ld+json"]')).toBeNull()
  })
})

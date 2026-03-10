import { watchEffect, onUnmounted, toValue } from 'vue'
import { useRoute } from 'vue-router'

const BASE_URL = import.meta.env.VITE_APP_BASE_URL ?? ''
const DEFAULT_OG_IMAGE = `${BASE_URL}/og-image.png`

/**
 * Manages <title>, <meta>, <link rel="canonical"> and <meta property="og:*"> tags
 * reactively per route. Cleans up injected elements on unmount.
 *
 * @param {object|import('vue').Ref|import('vue').ComputedRef} metaConfig
 *   {
 *     title: string,
 *     description: string,
 *     ogUrl?: string,       // defaults to BASE_URL + current path
 *     ogImage?: string,     // defaults to /og-image.png
 *     ogType?: string,      // defaults to 'website'
 *     noindex?: boolean,    // injects noindex robots meta when true
 *   }
 */
export function useHead(metaConfig) {
  const route = useRoute()
  const injected = new Map()

  function resolveConfig() {
    return toValue(metaConfig)
  }

  function setMeta(key, value) {
    if (!value) return
    // key format: 'name=X' or 'property=X'
    const [attr, attrValue] = key.split('=')
    let el = injected.get(key)
    if (!el) {
      el = document.createElement('meta')
      el.setAttribute(attr, attrValue)
      document.head.appendChild(el)
      injected.set(key, el)
    }
    el.setAttribute('content', value)
  }

  function setLink(rel, href) {
    if (!href) return
    let el = injected.get(`link-${rel}`)
    if (!el) {
      el = document.createElement('link')
      el.setAttribute('rel', rel)
      document.head.appendChild(el)
      injected.set(`link-${rel}`, el)
    }
    el.setAttribute('href', href)
  }

  function removeInjected() {
    for (const el of injected.values()) {
      el.parentNode?.removeChild(el)
    }
    injected.clear()
  }

  const stop = watchEffect(() => {
    const config = resolveConfig()
    if (!config) return

    const {
      title,
      description,
      ogUrl,
      ogImage = DEFAULT_OG_IMAGE,
      ogType = 'website',
      noindex = false,
    } = config

    const resolvedUrl = ogUrl ?? `${BASE_URL}${route?.path ?? ''}`

    if (title) document.title = title

    setMeta('name=description', description)
    setMeta('property=og:title', title)
    setMeta('property=og:description', description)
    setMeta('property=og:url', resolvedUrl)
    setMeta('property=og:image', ogImage)
    setMeta('property=og:type', ogType)
    setLink('canonical', resolvedUrl)

    if (noindex) {
      setMeta('name=robots', 'noindex, nofollow')
    }
  })

  onUnmounted(() => {
    stop()
    removeInjected()
  })
}

/**
 * Injects a <script type="application/ld+json"> tag into <head>.
 * Replaces content reactively on update. Removes tag on unmount.
 *
 * @param {object|import('vue').Ref|import('vue').ComputedRef} schema
 */
export function useJsonLd(schema) {
  let el = null

  const stop = watchEffect(() => {
    const resolved = toValue(schema)
    if (!resolved) return
    if (!el) {
      el = document.createElement('script')
      el.setAttribute('type', 'application/ld+json')
      document.head.appendChild(el)
    }
    el.textContent = JSON.stringify(resolved)
  })

  onUnmounted(() => {
    stop()
    el?.parentNode?.removeChild(el)
    el = null
  })
}

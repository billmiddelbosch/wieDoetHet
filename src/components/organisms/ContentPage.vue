<script setup>
// Renders a static content page (about, contact, privacy) from the locale
// files. Copy lives in <page>.title / .intro / .sections in nl.json and
// en.json. Keep it in sync with public/<page>.md, the version served to agents.
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useHead } from '@/composables/useHead'

const props = defineProps({
  page: {
    type: String,
    required: true,
    validator: (value) => ['about', 'contact', 'privacy'].includes(value),
  },
})

const { t, tm, rt } = useI18n()

useHead(
  computed(() => ({
    title: t(`seo.${props.page}.title`),
    description: t(`seo.${props.page}.description`),
  })),
)

const sections = computed(() =>
  tm(`${props.page}.sections`).map((section) => ({
    title: rt(section.title),
    paragraphs: (section.paragraphs ?? []).map((p) => rt(p)),
    items: (section.items ?? []).map((item) => rt(item)),
    after: section.after ? rt(section.after) : null,
    link: section.link
      ? {
          to: section.link.to ? rt(section.link.to) : null,
          href: section.link.href ? rt(section.link.href) : null,
          label: rt(section.link.label),
        }
      : null,
  })),
)
</script>

<template>
  <div class="max-w-2xl mx-auto px-4 py-12">
    <h1 class="text-3xl font-bold text-[var(--text-primary)]">{{ t(`${page}.title`) }}</h1>
    <p class="mt-3 text-base text-[var(--text-secondary)]">{{ t(`${page}.intro`) }}</p>

    <section v-for="section in sections" :key="section.title" class="mt-8">
      <h2 class="text-xl font-semibold text-[var(--text-primary)]">{{ section.title }}</h2>

      <p
        v-for="paragraph in section.paragraphs"
        :key="paragraph"
        class="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]"
      >
        {{ paragraph }}
      </p>

      <ul
        v-if="section.items.length"
        class="mt-2 list-disc pl-5 text-sm leading-relaxed text-[var(--text-secondary)]"
      >
        <li v-for="item in section.items" :key="item">{{ item }}</li>
      </ul>

      <p v-if="section.after" class="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
        {{ section.after }}
      </p>

      <p v-if="section.link" class="mt-3 text-sm font-medium">
        <RouterLink
          v-if="section.link.to"
          :to="section.link.to"
          class="text-brand-600 hover:underline"
        >
          {{ section.link.label }}
        </RouterLink>
        <a
          v-else
          :href="section.link.href"
          class="text-brand-600 hover:underline"
          rel="noopener"
        >
          {{ section.link.label }}
        </a>
      </p>
    </section>
  </div>
</template>

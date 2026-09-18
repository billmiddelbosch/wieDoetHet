<script setup>
// Plain, structured summary of the product for AI agents, shown on the landing
// page at /?mode=agent. Keep it in sync with public/agents.md — that file is
// the version served to agents that do not execute JavaScript.
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'

const { t, tm, rt } = useI18n()

const facts = computed(() =>
  tm('agentMode.facts').map((fact) => ({ label: rt(fact.label), value: rt(fact.value) })),
)
const useWhen = computed(() => tm('agentMode.useWhen').map((item) => rt(item)))
const avoidWhen = computed(() => tm('agentMode.avoidWhen').map((item) => rt(item)))
const care = computed(() => tm('agentMode.care').map((item) => rt(item)))
const resources = computed(() =>
  tm('agentMode.resources').map((res) => ({
    label: rt(res.label),
    href: rt(res.href),
    description: rt(res.description),
  })),
)
</script>

<template>
  <article class="max-w-2xl mx-auto px-4 py-12" data-agent-mode>
    <h1 class="text-2xl font-bold text-[var(--text-primary)]">{{ t('agentMode.title') }}</h1>
    <p class="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
      {{ t('agentMode.summary') }}
    </p>

    <section class="mt-8">
      <h2 class="text-lg font-semibold text-[var(--text-primary)]">
        {{ t('agentMode.factsTitle') }}
      </h2>
      <dl class="mt-2 grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
        <template v-for="fact in facts" :key="fact.label">
          <dt class="font-medium text-[var(--text-primary)]">{{ fact.label }}</dt>
          <dd class="text-[var(--text-secondary)]">{{ fact.value }}</dd>
        </template>
      </dl>
    </section>

    <section class="mt-8">
      <h2 class="text-lg font-semibold text-[var(--text-primary)]">
        {{ t('agentMode.useWhenTitle') }}
      </h2>
      <ul class="mt-2 list-disc pl-5 text-sm leading-relaxed text-[var(--text-secondary)]">
        <li v-for="item in useWhen" :key="item">{{ item }}</li>
      </ul>
    </section>

    <section class="mt-8">
      <h2 class="text-lg font-semibold text-[var(--text-primary)]">
        {{ t('agentMode.avoidWhenTitle') }}
      </h2>
      <ul class="mt-2 list-disc pl-5 text-sm leading-relaxed text-[var(--text-secondary)]">
        <li v-for="item in avoidWhen" :key="item">{{ item }}</li>
      </ul>
    </section>

    <section class="mt-8">
      <h2 class="text-lg font-semibold text-[var(--text-primary)]">
        {{ t('agentMode.careTitle') }}
      </h2>
      <ul class="mt-2 list-disc pl-5 text-sm leading-relaxed text-[var(--text-secondary)]">
        <li v-for="item in care" :key="item">{{ item }}</li>
      </ul>
    </section>

    <section class="mt-8">
      <h2 class="text-lg font-semibold text-[var(--text-primary)]">
        {{ t('agentMode.resourcesTitle') }}
      </h2>
      <ul class="mt-2 list-disc pl-5 text-sm leading-relaxed text-[var(--text-secondary)]">
        <li v-for="res in resources" :key="res.href">
          <a :href="res.href" class="text-brand-600 hover:underline">{{ res.label }}</a>
          — {{ res.description }}
        </li>
      </ul>
    </section>

    <p class="mt-8 text-sm font-medium">
      <RouterLink to="/" class="text-brand-600 hover:underline">
        {{ t('agentMode.back') }}
      </RouterLink>
    </p>
  </article>
</template>

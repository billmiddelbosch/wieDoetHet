<script setup>
import { onMounted, onUnmounted } from 'vue'

const props = defineProps({
  open: { type: Boolean, required: true },
  title: { type: String, default: '' },
  size: { type: String, default: 'md', validator: (v) => ['sm', 'md', 'lg', 'full'].includes(v) },
})

const emit = defineEmits(['close'])

function handleKeydown(e) {
  if (e.key === 'Escape' && props.open) emit('close')
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onUnmounted(() => window.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
        @click.self="$emit('close')"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="$emit('close')" />

        <!-- Panel -->
        <Transition name="slide-up">
          <div
            v-if="open"
            :class="[
              'relative z-10 w-full bg-[var(--bg-surface)] rounded-[1.25rem] shadow-xl flex flex-col max-h-[90vh]',
              size === 'sm' && 'max-w-sm',
              size === 'md' && 'max-w-lg',
              size === 'lg' && 'max-w-2xl',
              size === 'full' && 'max-w-full',
            ]"
          >
            <!-- Header -->
            <div
              v-if="title || $slots.header"
              class="flex items-center justify-between px-6 py-4 border-b border-[var(--border-default)] shrink-0"
            >
              <slot name="header">
                <h2 class="text-lg font-semibold text-[var(--text-primary)]">{{ title }}</h2>
              </slot>
              <button
                type="button"
                class="p-1.5 rounded-full text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] transition-colors"
                @click="$emit('close')"
              >
                <svg
                  class="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M18 6 6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>
            </div>

            <!-- Body -->
            <div class="overflow-y-auto flex-1 px-6 py-5">
              <slot />
            </div>

            <!-- Footer -->
            <div
              v-if="$slots.footer"
              class="px-6 py-4 border-t border-[var(--border-default)] shrink-0"
            >
              <slot name="footer" />
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

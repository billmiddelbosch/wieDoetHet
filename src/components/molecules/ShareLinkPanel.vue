<script setup>
import { ref, computed } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseAlert from '@/components/ui/BaseAlert.vue'
import { useWhatsApp } from '@/composables/useWhatsApp.js'

const props = defineProps({
  shareUrl: { type: String, required: true },
  groupName: { type: String, required: true },
  groupId: { type: String, default: null },
  tasks: { type: Array, default: () => [] },
})

const emit = defineEmits(['copied', 'whatsapp'])

const copied = ref(false)
const phone = ref('')

const supportsContactPicker = typeof navigator !== 'undefined' && 'contacts' in navigator

async function pickContact() {
  try {
    const [contact] = await navigator.contacts.select(['tel'], { multiple: false })
    if (contact?.tel?.[0]) phone.value = contact.tel[0]
  } catch {
    // dismissed or unsupported
  }
}

const { loading: pollLoading, error: pollError, sent: pollSent, sendPoll } = useWhatsApp()

const taskCount = computed(() => props.tasks.length)
const tooManyTasks = computed(() => taskCount.value > 10)
const pollType = computed(() => taskCount.value <= 3 ? 'knoppen' : 'keuzelijst')

async function copyLink() {
  try {
    await navigator.clipboard.writeText(props.shareUrl)
    copied.value = true
    emit('copied')
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    // Fallback: select input
  }
}

function openWhatsApp() {
  const text = encodeURIComponent(
    `Hoi! Geef aan welke taken jij wilt doen voor "${props.groupName}":\n${props.shareUrl}`
  )
  window.open(`https://wa.me/?text=${text}`, '_blank')
  emit('whatsapp')
}

// Normalise to E.164 without '+': strip spaces/dashes, replace leading 0 with country code
function normalisePhone(raw) {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('0')) return '31' + digits.slice(1)
  return digits
}

async function submitPoll() {
  if (!phone.value.trim()) return
  const to = normalisePhone(phone.value)
  const tasks = props.tasks.map((t) => ({ id: t.id, title: t.title, description: t.description }))
  await sendPoll(props.groupId, to, tasks)
}
</script>

<template>
  <div
    class="rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)] p-4 flex flex-col gap-3"
  >
    <p class="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
      Deel de link
    </p>

    <!-- URL bar -->
    <div
      class="flex items-center gap-2 bg-[var(--bg-surface)] rounded-xl border border-[var(--border-default)] px-3 py-2"
    >
      <span class="flex-1 text-sm text-[var(--text-primary)] truncate font-mono">{{
        shareUrl
      }}</span>
      <button
        type="button"
        :class="[
          'text-xs font-semibold px-3 py-1 rounded-full transition-all',
          copied ? 'bg-success-500 text-white' : 'bg-brand-500 text-white hover:bg-brand-600',
        ]"
        @click="copyLink"
      >
        {{ copied ? 'Gekopieerd!' : 'Kopieer' }}
      </button>
    </div>

    <!-- WhatsApp link share -->
    <BaseButton variant="whatsapp" full @click="openWhatsApp">
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
        <path
          d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"
        />
      </svg>
      Stuur via WhatsApp
    </BaseButton>

    <!-- WhatsApp poll (only when groupId + tasks available) -->
    <template v-if="groupId && taskCount > 0">
      <div class="border-t border-[var(--border-default)] pt-3 flex flex-col gap-3">
        <p class="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
          Verstuur als WhatsApp poll
        </p>

        <!-- Too many tasks warning -->
        <BaseAlert v-if="tooManyTasks" variant="warning">
          Te veel taken ({{ taskCount }}). Splits de groep in twee groepen om een poll te sturen.
        </BaseAlert>

        <BaseAlert v-else-if="pollSent" variant="success">
          Poll verstuurd! Deelnemers kunnen direct een taak kiezen.
        </BaseAlert>

        <template v-else>
          <p class="text-xs text-[var(--text-tertiary)]">
            Stuurt een {{ pollType }} bericht ({{ taskCount }} {{ taskCount === 1 ? 'taak' : 'taken' }}).
            Deelnemers claimen direct vanuit WhatsApp.
          </p>

          <div class="flex gap-2 items-end">
            <BaseInput
              id="poll-phone"
              v-model="phone"
              type="tel"
              placeholder="06 12 34 56 78"
              autocomplete="tel"
              class="flex-1"
              @keydown.enter="submitPoll"
            />
            <!-- Contact Picker API — Android Chrome only -->
            <button
              v-if="supportsContactPicker"
              type="button"
              class="shrink-0 p-2.5 rounded-[0.625rem] border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-brand-400 hover:text-brand-500 transition-colors"
              aria-label="Kies uit adresboek"
              @click="pickContact"
            >
              <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </button>
            <BaseButton variant="whatsapp" size="sm" :loading="pollLoading" @click="submitPoll">
              Stuur
            </BaseButton>
          </div>

          <BaseAlert v-if="pollError" variant="danger">{{ pollError }}</BaseAlert>
        </template>
      </div>
    </template>
  </div>
</template>

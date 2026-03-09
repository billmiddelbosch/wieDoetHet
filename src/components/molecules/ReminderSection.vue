<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute } from 'vue-router'
import { useReminder } from '@/composables/useReminder'
import { usePushSubscription } from '@/composables/usePushSubscription'
import { usePwaInstall } from '@/composables/usePwaInstall'
import { trackEvent } from '@/lib/analytics'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseAlert from '@/components/ui/BaseAlert.vue'
import BaseBadge from '@/components/ui/BaseBadge.vue'

const { t } = useI18n()
const route = useRoute()

const profileLink = computed(() => `/profile?redirect=${encodeURIComponent(route.fullPath)}`)

const props = defineProps({
  /** 'task' or 'group' */
  scope: { type: String, required: true },
  /** taskId or groupId — may be empty string in create mode when deferred=true */
  id: { type: String, default: '' },
  /** Required when scope is 'task' — the parent groupId for ownership verification */
  groupId: { type: String, default: null },
  /** Whether the initiator has an active Web Push subscription */
  hasPushSubscription: { type: Boolean, required: true },
  /** Whether the initiator has a phone number on their profile (SMS fallback gate) */
  hasPhoneNumber: { type: Boolean, required: true },
  /** Pre-loaded reminder state: { scheduledAt, status } or null */
  existingReminder: { type: Object, default: null },
  /**
   * When true, handleSave skips the API call and emits scheduled(isoDate) immediately.
   * Used in task create mode: the parent schedules the reminder after the task is saved.
   */
  deferred: { type: Boolean, default: false },
})

const emit = defineEmits(['scheduled', 'cancelled', 'push-subscribed'])

const { loading, error, scheduleReminder, cancelReminder } = useReminder()
const { subscribe } = usePushSubscription()
const { isIos, isStandalone } = usePwaInstall()

const isOpen = ref(false)
const scheduledAt = ref('')
const fieldError = ref('')
const reminder = ref(props.existingReminder)
// 'save' | 'cancel' — tracks which operation set the current error
const lastOp = ref(null)
const showSaveSuccess = ref(false)
const showCancelSuccess = ref(false)
const subscribing = ref(false)

// Fire analytics when the section is opened and a gate is blocking the user
watch(isOpen, (opened) => {
  if (!opened) return
  if (gateState.value === 'push-prompt') {
    trackEvent('reminder_push_required', { scope: props.scope })
  } else if (gateState.value === 'sms-required') {
    trackEvent('reminder_phone_required', { scope: props.scope })
  }
})

// Sync reminder when parent re-passes existingReminder (e.g. edit mode re-open)
watch(
  () => props.existingReminder,
  (val) => {
    reminder.value = val
  }
)

/**
 * Five gate states:
 *  'ready'       — push subscribed, or push unavailable+phone set (SMS fallback)
 *  'push-prompt' — push available, not yet subscribed (Android/desktop Chrome)
 *  'ios-install' — iOS Safari, not in standalone mode — must install first
 *  'sms-required'— push definitively unavailable (denied or no PushManager) AND no phone
 */
const gateState = computed(() => {
  // 1. Already subscribed to push — full reminder UI
  if (props.hasPushSubscription) return 'ready'

  // 2. Push API not available (non-PWA desktop without extension, etc.)
  if (!('PushManager' in window)) {
    return props.hasPhoneNumber ? 'ready' : 'sms-required'
  }

  // 3. Push permission explicitly denied by user
  if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
    return props.hasPhoneNumber ? 'ready' : 'sms-required'
  }

  // 4. iOS — must install PWA before push is possible
  if (isIos() && !isStandalone()) return 'ios-install'

  // 5. Push available but not yet subscribed — invite user to subscribe
  return 'push-prompt'
})

const badgeVariant = computed(() => {
  if (!reminder.value) return 'neutral'
  if (reminder.value.status === 'scheduled') return 'brand'
  if (reminder.value.status === 'sent') return 'success'
  if (reminder.value.status === 'failed') return 'danger'
  return 'neutral'
})

const formattedDate = computed(() => {
  if (!reminder.value?.scheduledAt) return ''
  return new Intl.DateTimeFormat('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(reminder.value.scheduledAt))
})

// Localized error message keyed by which operation failed
const errorMessage = computed(() => {
  if (!error.value) return null
  return lastOp.value === 'cancel' ? t('reminder.errorCancel') : t('reminder.errorSave')
})

function validate() {
  fieldError.value = ''
  if (!scheduledAt.value) {
    fieldError.value = t('reminder.futureDateRequired')
    return false
  }
  const date = new Date(scheduledAt.value)
  if (isNaN(date.getTime()) || date <= new Date()) {
    fieldError.value = t('reminder.futureDateRequired')
    return false
  }
  return true
}

async function handleSubscribe() {
  subscribing.value = true
  try {
    const ok = await subscribe()
    if (ok) {
      trackEvent('reminder_push_subscribed', { scope: props.scope })
      emit('push-subscribed')
    }
  } catch {
    // Silently swallow — if permission was denied the gateState computed
    // will react to Notification.permission changing to 'denied'
  } finally {
    subscribing.value = false
  }
}

async function handleSave() {
  if (!validate()) return
  const isoDate = new Date(scheduledAt.value).toISOString()

  // Deferred mode (create): skip API call, let the parent schedule after task is saved
  if (props.deferred) {
    reminder.value = { scheduledAt: isoDate, status: 'scheduled' }
    scheduledAt.value = ''
    emit('scheduled', isoDate)
    trackEvent('reminder_scheduled', { scope: props.scope, id: props.id })
    return
  }

  lastOp.value = 'save'
  const result = await scheduleReminder(props.scope, props.id, isoDate, props.groupId)
  if (result) {
    reminder.value = { scheduledAt: result.scheduledAt, status: result.status }
    scheduledAt.value = ''
    showSaveSuccess.value = true
    setTimeout(() => { showSaveSuccess.value = false }, 3000)
    emit('scheduled', result.scheduledAt)
    trackEvent('reminder_scheduled', { scope: props.scope, id: props.id })
  }
}

async function handleCancel() {
  lastOp.value = 'cancel'
  const success = await cancelReminder(props.scope, props.id)
  if (success) {
    reminder.value = null
    showCancelSuccess.value = true
    setTimeout(() => { showCancelSuccess.value = false }, 3000)
    emit('cancelled')
    trackEvent('reminder_cancelled', { scope: props.scope, id: props.id })
  }
}
</script>

<template>
  <div class="rounded-[1.25rem] border border-[var(--border-default)] bg-[var(--bg-surface)] overflow-hidden">
    <!-- Disclosure header — always visible -->
    <button
      type="button"
      class="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-[var(--bg-subtle)] transition-colors"
      @click="isOpen = !isOpen"
    >
      <span class="text-sm font-semibold text-[var(--text-primary)]">
        {{ t('reminder.sectionTitle') }}
      </span>

      <div class="flex items-center gap-2 shrink-0">
        <BaseBadge
          v-if="reminder?.status && reminder.status !== 'none'"
          :variant="badgeVariant"
          size="sm"
        >
          {{ t(`reminder.status${reminder.status.charAt(0).toUpperCase() + reminder.status.slice(1)}`) }}
        </BaseBadge>

        <!-- Chevron icon -->
        <svg
          class="h-4 w-4 text-[var(--text-secondary)] transition-transform duration-200"
          :class="{ 'rotate-180': isOpen }"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </button>

    <!-- Expanded body -->
    <div v-show="isOpen" class="px-5 pb-5 flex flex-col gap-4 border-t border-[var(--border-default)]">

      <!-- Gate: push-prompt — has Push API, not yet subscribed -->
      <template v-if="gateState === 'push-prompt'">
        <p class="text-sm text-[var(--text-secondary)] mt-4">
          {{ t('reminder.pushPromptBody') }}
        </p>
        <div class="flex justify-end">
          <BaseButton
            variant="primary"
            size="sm"
            :loading="subscribing"
            @click="handleSubscribe"
          >
            {{ t('reminder.pushCta') }}
          </BaseButton>
        </div>
      </template>

      <!-- Gate: ios-install — iOS Safari, must install PWA first -->
      <template v-else-if="gateState === 'ios-install'">
        <BaseAlert variant="warning" class="mt-4">
          {{ t('reminder.iosInstallPrompt') }}
        </BaseAlert>
      </template>

      <!-- Gate: sms-required — push unavailable AND no phone number -->
      <template v-else-if="gateState === 'sms-required'">
        <BaseAlert variant="warning" class="mt-4">
          {{ t('reminder.smsFallbackPrompt') }}
          <RouterLink
            :to="profileLink"
            class="font-semibold underline ml-1 hover:no-underline"
          >
            {{ t('reminder.gotoProfile') }}
          </RouterLink>
        </BaseAlert>
      </template>

      <!-- Ready state: full reminder UI -->
      <template v-else>
        <!-- Reminder already scheduled: show summary + cancel -->
        <template v-if="reminder?.scheduledAt && reminder.status === 'scheduled'">
          <p class="text-sm text-[var(--text-secondary)] mt-4">
            {{ t('reminder.scheduled', { datetime: formattedDate }) }}
          </p>
          <BaseAlert v-if="showCancelSuccess" variant="success">{{ t('reminder.cancelSuccess') }}</BaseAlert>
          <BaseAlert v-if="errorMessage" variant="danger">{{ errorMessage }}</BaseAlert>
          <BaseButton
            variant="danger"
            size="sm"
            :loading="loading"
            @click="handleCancel"
          >
            {{ t('reminder.cancel') }}
          </BaseButton>
        </template>

        <!-- No active reminder: show datetime picker + save -->
        <template v-else>
          <p class="text-xs text-[var(--text-secondary)] mt-4">
            {{ scope === 'task' ? t('reminder.taskHint') : t('reminder.groupHint') }}
          </p>
          <BaseAlert v-if="showSaveSuccess" variant="success">{{ t('reminder.saveSuccess') }}</BaseAlert>
          <BaseInput
            id="reminder-datetime"
            v-model="scheduledAt"
            type="datetime-local"
            :label="t('reminder.dateTimeLabel')"
            :error="fieldError"
          />
          <BaseAlert v-if="errorMessage" variant="danger">{{ errorMessage }}</BaseAlert>
          <div class="flex justify-end">
            <BaseButton
              variant="primary"
              size="sm"
              :loading="loading"
              @click="handleSave"
            >
              {{ t('reminder.save') }}
            </BaseButton>
          </div>
        </template>
      </template>

    </div>
  </div>
</template>

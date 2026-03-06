<script setup>
import { useI18n } from 'vue-i18n'
import TaskCard from '@/components/molecules/TaskCard.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'
import BaseSpinner from '@/components/ui/BaseSpinner.vue'
import BaseAddButton from '@/components/ui/BaseAddButton.vue'

const { t } = useI18n()

defineProps({
  tasks: { type: Array, required: true },
  isInitiator: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  claimingTaskId: { type: String, default: null },
})

defineEmits(['add-task', 'edit-task', 'delete-task', 'claim', 'unclaim'])
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-12">
      <BaseSpinner size="lg" />
    </div>

    <!-- Empty state -->
    <template v-else-if="tasks.length === 0">
      <BaseEmptyState
        :title="isInitiator ? t('tasks.emptyInitiator') : t('tasks.emptyMember')"
        :description="isInitiator ? t('tasks.emptyInitiatorDesc') : t('tasks.emptyMemberDesc')"
      >
        <template v-if="isInitiator" #actions>
          <BaseButton variant="primary" @click="$emit('add-task')">
            {{ t('tasks.addFirst') }}
          </BaseButton>
        </template>
      </BaseEmptyState>
    </template>

    <!-- Task cards -->
    <template v-else>
      <TaskCard
        v-for="task in tasks"
        :key="task.id"
        :task="task"
        :is-initiator="isInitiator"
        :claim-loading="claimingTaskId === task.id"
        @claim="$emit('claim', task.id)"
        @unclaim="$emit('unclaim', task.id)"
        @edit="$emit('edit-task', task)"
        @delete="$emit('delete-task', task.id)"
      />

      <!-- Add task button (initiator) -->
      <BaseAddButton v-if="isInitiator" @click="$emit('add-task')">
        + {{ t('tasks.addTask') }}
      </BaseAddButton>
    </template>
  </div>
</template>

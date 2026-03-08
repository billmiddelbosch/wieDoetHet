<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useGroupStore } from '@/stores/group'
import { useAuthStore } from '@/stores/auth'
import { useGroups } from '@/composables/useGroups'
import { useTasks } from '@/composables/useTasks'
import { useClaims } from '@/composables/useClaims'
import { trackEvent } from '@/lib/analytics'
import GroupHeader from '@/components/organisms/GroupHeader.vue'
import TaskList from '@/components/organisms/TaskList.vue'
import TaskFormModal from '@/components/organisms/TaskFormModal.vue'
import AnonymousNameModal from '@/components/molecules/AnonymousNameModal.vue'
import ConfirmModal from '@/components/molecules/ConfirmModal.vue'
import ShareLinkPanel from '@/components/molecules/ShareLinkPanel.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import BaseSpinner from '@/components/ui/BaseSpinner.vue'
import BaseAlert from '@/components/ui/BaseAlert.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const groupStore = useGroupStore()
const authStore = useAuthStore()
const { fetchGroup, loading: groupLoading, error: groupError } = useGroups()
const { tasks, fetchTasks, createTask, updateTask, deleteTask, clearTasks, loading: taskLoading } = useTasks()
const { claimTask, unclaimTask } = useClaims()

const group = computed(() => groupStore.currentGroup)
const isInitiator = computed(
  () => authStore.isAuthenticated && group.value?.initiatorId === authStore.user?.id
)
const shareUrl = computed(() =>
  group.value ? `${window.location.origin}/g/${group.value.shareToken}` : ''
)

// Modals
const showTaskForm = ref(false)
const editingTask = ref(null)
const showDeleteConfirm = ref(false)
const deletingTaskId = ref(null)
const showSharePanel = ref(false)
const showAnonModal = ref(false)
const pendingClaimTaskId = ref(null)
const claimingTaskId = ref(null)
const taskSaveLoading = ref(false)
const deleteLoading = ref(false)
const claimError = ref('')

async function loadGroup(id) {
  if (groupStore.currentGroup?.id !== id) {
    await fetchGroup(id)
  }
  await fetchTasks(id)
}

onMounted(() => loadGroup(route.params.id))
onUnmounted(() => { clearTasks(); groupStore.setCurrentGroup(null) })
watch(() => route.params.id, (id) => { if (id) loadGroup(id) })

function onAddTask() {
  editingTask.value = null
  showTaskForm.value = true
}

function onEditTask(task) {
  editingTask.value = task
  showTaskForm.value = true
}

function onDeleteTask(taskId) {
  deletingTaskId.value = taskId
  showDeleteConfirm.value = true
}

async function saveTask(payload) {
  taskSaveLoading.value = true
  if (editingTask.value) {
    await updateTask(route.params.id, editingTask.value.id, payload)
  } else {
    await createTask(route.params.id, payload)
  }
  taskSaveLoading.value = false
  showTaskForm.value = false
}

async function confirmDelete() {
  if (!deletingTaskId.value) return
  deleteLoading.value = true
  await deleteTask(route.params.id, deletingTaskId.value)
  deleteLoading.value = false
  showDeleteConfirm.value = false
  deletingTaskId.value = null
}

async function onClaim(taskId) {
  claimError.value = ''
  if (!authStore.isAuthenticated && !authStore.anonymousUser) {
    pendingClaimTaskId.value = taskId
    showAnonModal.value = true
    return
  }
  claimingTaskId.value = taskId
  try {
    await claimTask(route.params.id, taskId)
    trackEvent('task_claimed', {
      group_id: route.params.id,
      task_id: taskId,
      is_anonymous: !authStore.isAuthenticated,
    })
  } catch (err) {
    claimError.value = err?.message ?? t('tasks.claimFailed')
  } finally {
    claimingTaskId.value = null
  }
}

async function onUnclaim(taskId) {
  claimError.value = ''
  claimingTaskId.value = taskId
  try {
    await unclaimTask(route.params.id, taskId)
  } catch (err) {
    claimError.value = err?.message ?? t('tasks.claimFailed')
  } finally {
    claimingTaskId.value = null
  }
}

async function onAnonSubmit(anonName) {
  authStore.setAnonymousUser(anonName)
  showAnonModal.value = false
  if (pendingClaimTaskId.value) {
    await onClaim(pendingClaimTaskId.value)
    pendingClaimTaskId.value = null
  }
}
</script>

<template>
  <div>
    <!-- Loading -->
    <div v-if="groupLoading" class="flex justify-center py-20">
      <BaseSpinner size="lg" />
    </div>

    <!-- Error -->
    <div v-else-if="groupError" class="max-w-xl mx-auto px-4 py-12">
      <BaseAlert variant="danger">{{ groupError }}</BaseAlert>
    </div>

    <!-- Content -->
    <template v-else-if="group">
      <GroupHeader
        :group="group"
        :is-initiator="isInitiator"
        @share="showSharePanel = true"
        @settings="router.push(`/groups/${group.id}/settings`)"
        @scorecard="router.push(`/groups/${group.id}/scorecard`)"
      />

      <div class="max-w-2xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-5">
        <BaseAlert v-if="claimError" variant="danger" dismissible @dismiss="claimError = ''">
          {{ claimError }}
        </BaseAlert>

        <TaskList
          :tasks="tasks"
          :is-initiator="isInitiator"
          :loading="taskLoading"
          :claiming-task-id="claimingTaskId"
          @add-task="onAddTask"
          @edit-task="onEditTask"
          @delete-task="onDeleteTask"
          @claim="onClaim"
          @unclaim="onUnclaim"
        />
      </div>
    </template>

    <!-- Modals -->
    <TaskFormModal
      :open="showTaskForm"
      :task="editingTask"
      :loading="taskSaveLoading"
      @save="saveTask"
      @close="showTaskForm = false"
    />

    <ConfirmModal
      :open="showDeleteConfirm"
      :title="t('tasks.deleteTitle')"
      :message="t('tasks.deleteMessage')"
      :confirm-label="t('common.delete')"
      :loading="deleteLoading"
      variant="danger"
      @confirm="confirmDelete"
      @close="showDeleteConfirm = false"
    />

    <AnonymousNameModal
      :open="showAnonModal"
      @submit="onAnonSubmit"
      @close="showAnonModal = false"
    />

    <!-- Share panel modal -->
    <BaseModal
      :open="showSharePanel"
      :title="t('groups.shareTitle')"
      size="sm"
      @close="showSharePanel = false"
    >
      <ShareLinkPanel v-if="group" :share-url="shareUrl" :group-name="group.name" />
    </BaseModal>
  </div>
</template>

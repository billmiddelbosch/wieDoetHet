<script setup>
import BaseSpinner from '@/components/ui/BaseSpinner.vue'

defineProps({
  columns: { type: Array, required: true },
  rows: { type: Array, required: true },
  rowKey: { type: String, default: 'id' },
  loading: { type: Boolean, default: false },
  emptyMessage: { type: String, default: '' },
})

defineEmits(['row-click'])
</script>

<template>
  <div
    class="overflow-x-auto rounded-[1rem] border border-[var(--border-default)] bg-[var(--bg-surface)]"
  >
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-[var(--border-default)]">
          <th
            v-for="col in columns"
            :key="col.key"
            :class="[
              'px-4 py-3 font-medium text-[var(--text-secondary)] whitespace-nowrap',
              col.align === 'right' && 'text-right',
              col.align === 'center' && 'text-center',
            ]"
          >
            {{ col.label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loading">
          <td :colspan="columns.length" class="py-12">
            <div class="flex justify-center">
              <BaseSpinner size="md" />
            </div>
          </td>
        </tr>
        <tr v-else-if="rows.length === 0">
          <td :colspan="columns.length" class="py-10 text-center text-[var(--text-tertiary)]">
            <slot name="empty">{{ emptyMessage }}</slot>
          </td>
        </tr>
        <template v-else>
          <tr
            v-for="row in rows"
            :key="row[rowKey]"
            class="border-b border-[var(--border-default)] last:border-0 cursor-pointer hover:bg-[var(--bg-subtle)] transition-colors"
            @click="$emit('row-click', row)"
          >
            <td
              v-for="col in columns"
              :key="col.key"
              :class="[
                'px-4 py-3 text-[var(--text-primary)]',
                col.align === 'right' && 'text-right',
                col.align === 'center' && 'text-center',
              ]"
            >
              <slot :name="`cell-${col.key}`" :row="row" :value="row[col.key]">
                {{ row[col.key] }}
              </slot>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>

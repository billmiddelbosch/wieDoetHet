<script setup>
import { computed } from 'vue'
import BaseSpinner from '@/components/ui/BaseSpinner.vue'

const props = defineProps({
  columns: { type: Array, required: true },
  rows: { type: Array, required: true },
  rowKey: { type: String, default: 'id' },
  loading: { type: Boolean, default: false },
  emptyMessage: { type: String, default: '' },
  // Selection mode — fully controlled: this component only reads
  // `selectedKeys` and emits `update:selectedKeys`, it never owns the
  // selection state itself. Keeps this atom free of any store/composable
  // coupling (see product/specs/components-ui.spec.md).
  selectable: { type: Boolean, default: false },
  selectedKeys: { type: Array, default: () => [] },
  // When true, selection checkboxes render disabled and toggle handlers are
  // no-ops. Lets a consumer represent a selection that isn't expressed as an
  // enumerable set of the currently-rendered row keys (e.g. a server-resolved
  // "all N matching a filter" selection) without the header/row checkboxes
  // silently overwriting it with a page-scoped subset on click. Still a
  // generic, domain-free concept — no store/composable coupling added.
  selectionDisabled: { type: Boolean, default: false },
})

const emit = defineEmits(['row-click', 'update:selectedKeys'])

const selectedSet = computed(() => new Set(props.selectedKeys))

const allOnPageSelected = computed(
  () => props.rows.length > 0 && props.rows.every((row) => selectedSet.value.has(row[props.rowKey]))
)
const someOnPageSelected = computed(
  () => !allOnPageSelected.value && props.rows.some((row) => selectedSet.value.has(row[props.rowKey]))
)

function isRowSelected(row) {
  return selectedSet.value.has(row[props.rowKey])
}

function toggleRow(row) {
  if (props.selectionDisabled) return
  const key = row[props.rowKey]
  const next = new Set(props.selectedKeys)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  emit('update:selectedKeys', [...next])
}

function toggleAllOnPage() {
  if (props.selectionDisabled) return
  const next = new Set(props.selectedKeys)
  const pageKeys = props.rows.map((row) => row[props.rowKey])
  if (allOnPageSelected.value) {
    pageKeys.forEach((key) => next.delete(key))
  } else {
    pageKeys.forEach((key) => next.add(key))
  }
  emit('update:selectedKeys', [...next])
}
</script>

<template>
  <div
    class="overflow-x-auto rounded-[1rem] border border-[var(--border-default)] bg-[var(--bg-surface)]"
  >
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-[var(--border-default)]">
          <th v-if="selectable" class="px-4 py-3 w-10">
            <input
              type="checkbox"
              class="h-4 w-4 rounded border-[var(--border-strong)] accent-brand-500"
              :class="selectionDisabled && 'opacity-50 cursor-not-allowed'"
              :checked="allOnPageSelected"
              :indeterminate="someOnPageSelected"
              :disabled="selectionDisabled"
              aria-label="Select all rows on this page"
              @click.stop="toggleAllOnPage"
            />
          </th>
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
          <td :colspan="columns.length + (selectable ? 1 : 0)" class="py-12">
            <div class="flex justify-center">
              <BaseSpinner size="md" />
            </div>
          </td>
        </tr>
        <tr v-else-if="rows.length === 0">
          <td
            :colspan="columns.length + (selectable ? 1 : 0)"
            class="py-10 text-center text-[var(--text-tertiary)]"
          >
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
            <td v-if="selectable" class="px-4 py-3 w-10" @click.stop="toggleRow(row)">
              <input
                type="checkbox"
                class="h-4 w-4 rounded border-[var(--border-strong)] accent-brand-500"
                :class="selectionDisabled && 'opacity-50 cursor-not-allowed'"
                :checked="isRowSelected(row)"
                :disabled="selectionDisabled"
                :aria-label="`Select row ${row[rowKey]}`"
                @click.stop="toggleRow(row)"
              />
            </td>
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

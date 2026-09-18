<script setup>
import { onBeforeUnmount, watch } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'

// Generic rich-text (HTML) editor atom, built on Tiptap. No store, composable,
// or project-specific imports — Tiptap's own `useEditor`/`EditorContent` are a
// third-party library API, not project logic, same category as importing any
// other UI library into an atom. Fully controlled via `modelValue` (HTML string)
// / `update:modelValue`, same v-model contract as BaseInput/BaseTextarea.
const props = defineProps({
  modelValue: { type: String, default: '' },
  label: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  error: { type: String, default: null },
  disabled: { type: Boolean, default: false },
  required: { type: Boolean, default: false },
  id: { type: String, default: null },
})

const emit = defineEmits(['update:modelValue'])

const editor = useEditor({
  content: props.modelValue,
  extensions: [StarterKit, Placeholder.configure({ placeholder: props.placeholder })],
  editable: !props.disabled,
  onUpdate: ({ editor: e }) => emit('update:modelValue', e.getHTML()),
})

// Keep the editor in sync when the parent resets modelValue externally
// (e.g. re-opening the compose modal for a new send) without fighting the
// user's own typing — only push content in when it actually differs.
watch(
  () => props.modelValue,
  (value) => {
    const current = editor.value?.getHTML()
    if (editor.value && value !== current) {
      editor.value.commands.setContent(value || '', false)
    }
  }
)

watch(
  () => props.disabled,
  (value) => editor.value?.setEditable(!value)
)

function isActive(name, attrs) {
  return editor.value?.isActive(name, attrs) ?? false
}

onBeforeUnmount(() => editor.value?.destroy())
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label v-if="label" :for="id" class="text-sm font-medium text-[var(--text-primary)]">
      {{ label }}
      <span v-if="required" class="text-danger-500 ml-0.5">*</span>
    </label>

    <div
      :class="[
        'rounded-[0.625rem] border bg-[var(--bg-surface)] transition-colors duration-150 overflow-hidden',
        error ? 'border-danger-500' : 'border-[var(--border-default)]',
        disabled ? 'opacity-50 cursor-not-allowed' : '',
      ]"
    >
      <div
        v-if="editor"
        class="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--border-default)] bg-[var(--bg-subtle)]"
      >
        <button
          type="button"
          :disabled="disabled"
          :class="[
            'px-2 py-1 rounded text-sm font-bold',
            isActive('bold') ? 'bg-brand-500 text-white' : 'hover:bg-[var(--bg-surface)]',
          ]"
          @click="editor.chain().focus().toggleBold().run()"
        >
          B
        </button>
        <button
          type="button"
          :disabled="disabled"
          :class="[
            'px-2 py-1 rounded text-sm italic',
            isActive('italic') ? 'bg-brand-500 text-white' : 'hover:bg-[var(--bg-surface)]',
          ]"
          @click="editor.chain().focus().toggleItalic().run()"
        >
          I
        </button>
        <span class="w-px h-4 bg-[var(--border-default)] mx-1" />
        <button
          type="button"
          :disabled="disabled"
          :class="[
            'px-2 py-1 rounded text-xs font-semibold',
            isActive('heading', { level: 2 })
              ? 'bg-brand-500 text-white'
              : 'hover:bg-[var(--bg-surface)]',
          ]"
          @click="editor.chain().focus().toggleHeading({ level: 2 }).run()"
        >
          H2
        </button>
        <span class="w-px h-4 bg-[var(--border-default)] mx-1" />
        <button
          type="button"
          :disabled="disabled"
          :class="[
            'px-2 py-1 rounded text-sm',
            isActive('bulletList') ? 'bg-brand-500 text-white' : 'hover:bg-[var(--bg-surface)]',
          ]"
          @click="editor.chain().focus().toggleBulletList().run()"
        >
          •&nbsp;List
        </button>
        <button
          type="button"
          :disabled="disabled"
          :class="[
            'px-2 py-1 rounded text-sm',
            isActive('orderedList') ? 'bg-brand-500 text-white' : 'hover:bg-[var(--bg-surface)]',
          ]"
          @click="editor.chain().focus().toggleOrderedList().run()"
        >
          1.&nbsp;List
        </button>
      </div>

      <EditorContent
        :editor="editor"
        class="rich-text-editor prose prose-sm max-w-none px-4 py-2.5 min-h-[10rem] text-sm text-[var(--text-primary)] [&_.ProseMirror]:outline-none"
      />
    </div>
    <p v-if="error" class="text-xs text-danger-600 font-medium">{{ error }}</p>
  </div>
</template>

<style scoped>
.rich-text-editor :deep(p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  color: var(--text-tertiary);
  float: left;
  height: 0;
  pointer-events: none;
}
</style>

# Spec — UI Atoms (Base Components)

**Last Updated:** 2026-09-15 — added `BaseTable`'s selection-mode props/emit (was missing from this file
despite already being implemented) and the new `BaseRichTextEditor` atom (Admin Mail Users feature); added
`BaseTable`'s `selectionDisabled` prop, a code-review-driven fix for a select-all-matching data-safety bug.

All atoms live in `src/components/ui/`. They have NO store, composable, or project-specific imports. Pure presentational.

---

## BaseButton [ATOM]
Props:
- `variant: 'primary' | 'secondary' | 'danger' | 'ghost'` (default: 'primary')
- `size: 'sm' | 'md' | 'lg'` (default: 'md')
- `disabled: boolean` (default: false)
- `loading: boolean` (default: false)
- `type: 'button' | 'submit' | 'reset'` (default: 'button')
Slots: default (button label)
Emits: `click`
Atomic Rationale: Smallest interactive unit. No project logic, pure style+state.

## BaseInput [ATOM]
Props:
- `modelValue: string` (required)
- `label: string`
- `placeholder: string`
- `type: 'text' | 'email' | 'password' | 'number'` (default: 'text')
- `error: string | null` (default: null)
- `disabled: boolean` (default: false)
- `required: boolean` (default: false)
Emits: `update:modelValue`
Atomic Rationale: Single form field. No validation logic — parent passes error string.

## BaseTextarea [ATOM]
Props:
- `modelValue: string`
- `label: string`
- `placeholder: string`
- `rows: number` (default: 3)
- `error: string | null`
- `disabled: boolean`
Emits: `update:modelValue`

## BaseToggle [ATOM]
Props:
- `modelValue: boolean`
- `label: string`
- `disabled: boolean`
Emits: `update:modelValue`
Atomic Rationale: On/off switch primitive.

## BaseBadge [ATOM]
Props:
- `variant: 'neutral' | 'success' | 'warning' | 'danger' | 'info'` (default: 'neutral')
- `size: 'sm' | 'md'` (default: 'md')
Slots: default

## BaseAvatar [ATOM]
Props:
- `src: string | null`
- `name: string` — used for initials fallback
- `size: 'sm' | 'md' | 'lg'` (default: 'md')
Atomic Rationale: Displays user/group picture or initials. No data fetching.

## BaseCard [ATOM]
Props:
- `hoverable: boolean` (default: false)
- `padding: 'sm' | 'md' | 'lg'` (default: 'md')
Slots: default
Atomic Rationale: Styled container. No semantics beyond visual card shape.

## BaseModal [ATOM]
Props:
- `open: boolean` (required)
- `title: string`
- `size: 'sm' | 'md' | 'lg'` (default: 'md')
Slots: default (body), footer
Emits: `close`
Atomic Rationale: Modal shell — backdrop, close button, title. Content is slotted.

## BaseSpinner [ATOM]
Props:
- `size: 'sm' | 'md' | 'lg'` (default: 'md')
- `color: string` (default: 'currentColor')
Atomic Rationale: Pure visual loading indicator.

## BaseEmptyState [ATOM]
Props:
- `icon: string` (emoji or icon name)
- `title: string`
- `description: string`
Slots: actions
Atomic Rationale: Generic empty state shell.

## BaseAlert [ATOM]
Props:
- `variant: 'info' | 'success' | 'warning' | 'danger'` (default: 'info')
- `dismissible: boolean` (default: false)
Slots: default
Emits: `dismiss`

## BaseTable [ATOM]
Props:
- `columns: { key: string, label: string, align?: 'left'|'right'|'center' }[]` (required)
- `rows: object[]` (required)
- `rowKey: string` (default: `'id'`)
- `loading: boolean` (default: false)
- `emptyMessage: string` (default: `''`)
- `selectable: boolean` (default: false) — turns on a checkbox column
- `selectedKeys: (string|number)[]` (default: `[]`) — fully controlled selection: this component owns no
  selection state itself, it only reads `selectedKeys` and emits `update:selectedKeys`. Preserves ids not
  present in the current `rows` (e.g. selections from another page) rather than dropping them on toggle.
- `selectionDisabled: boolean` (default: false) — renders the header and row checkboxes disabled and makes
  `toggleRow`/`toggleAllOnPage` no-ops. Added to fix a bug (see `admin.spec.md` § Admin Mail Users) where a
  consumer representing selection as "all N matching a filter" (not enumerable client-side) could have that
  selection silently collapsed to a page-scoped subset by a single checkbox click, because this component's
  toggle handlers only ever operate on the currently-rendered rows' keys.
Slots:
- `cell-<columnKey>` — scoped, receives `{ row, value }`
- `empty` — overrides the default empty-message rendering
Emits:
- `row-click(row)`
- `update:selectedKeys(keys)` — emitted on individual row toggle and on the header "select all on this
  page" checkbox (which toggles only the rows currently rendered, not every row matching a filter —
  "select all N matching filter" across pages is a consumer-level concern, see `AdminSelectionToolbar` in
  `admin.spec.md`)
Atomic Rationale: still a generic tabular-data shell with zero domain knowledge — selection is expressed
purely in terms of row keys the consumer defines via `rowKey`, same pattern as `cell-*` slots. No store,
composable, or project-specific import was added to support this.

## BaseRichTextEditor [ATOM]
Props:
- `modelValue: string` (default: `''`) — HTML string, controlled via v-model like `BaseInput`/`BaseTextarea`
- `label: string` (default: `''`)
- `placeholder: string` (default: `''`)
- `error: string | null` (default: null)
- `disabled: boolean` (default: false)
- `required: boolean` (default: false)
- `id: string | null` (default: null) — forwarded to the `<label for>` association
Emits: `update:modelValue` (HTML string, via Tiptap's `getHTML()` on every edit)
Slots: none
Atomic Rationale: single rich-text form field, same v-model contract and error/disabled/label treatment as
`BaseInput`/`BaseTextarea` — just a larger value type (HTML instead of plain text). Built on Tiptap
(`@tiptap/vue-3`, `@tiptap/starter-kit`, `@tiptap/pm`, `@tiptap/extension-placeholder`); Tiptap's own
`useEditor`/`EditorContent` are a third-party library API, not project logic, so importing them does not
violate the "no store/composable/project-specific imports" rule — same category as any other UI library an
atom might wrap (e.g. a date-picker library). Toolbar (bold/italic/H2/bullet/ordered list) is fixed, not
slot-configurable — v1 has no requirement for a variable toolbar.

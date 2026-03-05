# Spec — UI Atoms (Base Components)

**Last Updated:** 2026-03-03

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

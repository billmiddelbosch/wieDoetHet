import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseToggle from '@/components/ui/BaseToggle.vue'

describe('BaseToggle', () => {
  it('renders label', () => {
    const wrapper = mount(BaseToggle, { props: { label: 'Tijdelijk', modelValue: false } })
    expect(wrapper.text()).toContain('Tijdelijk')
  })

  it('emits update:modelValue with toggled value on click', async () => {
    const wrapper = mount(BaseToggle, { props: { modelValue: false } })
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toBe(true)
  })

  it('shows correct aria-checked', () => {
    const wrapper = mount(BaseToggle, { props: { modelValue: true } })
    expect(wrapper.find('button').attributes('aria-checked')).toBe('true')
  })
})

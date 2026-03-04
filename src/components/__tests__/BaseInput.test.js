import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseInput from '@/components/ui/BaseInput.vue'

describe('BaseInput', () => {
  it('renders label', () => {
    const wrapper = mount(BaseInput, { props: { label: 'E-mail' } })
    expect(wrapper.find('label').text()).toContain('E-mail')
  })

  it('shows required asterisk when required', () => {
    const wrapper = mount(BaseInput, { props: { label: 'E-mail', required: true } })
    expect(wrapper.find('label').text()).toContain('*')
  })

  it('emits update:modelValue on input', async () => {
    const wrapper = mount(BaseInput, { props: { modelValue: '' } })
    const input = wrapper.find('input')
    await input.setValue('test@example.com')
    expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toBe('test@example.com')
  })

  it('shows error message', () => {
    const wrapper = mount(BaseInput, { props: { error: 'Verplicht veld' } })
    expect(wrapper.find('p').text()).toBe('Verplicht veld')
  })

  it('applies error border class when error present', () => {
    const wrapper = mount(BaseInput, { props: { error: 'Fout' } })
    expect(wrapper.find('input').classes().join(' ')).toContain('border-danger-500')
  })
})

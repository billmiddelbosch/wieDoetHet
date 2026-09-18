import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import BaseRichTextEditor from '@/components/ui/BaseRichTextEditor.vue'

describe('BaseRichTextEditor', () => {
  it('renders the label and required asterisk', () => {
    const wrapper = mount(BaseRichTextEditor, {
      props: { modelValue: '', label: 'Message', required: true },
    })
    expect(wrapper.find('label').text()).toContain('Message')
    expect(wrapper.find('label').text()).toContain('*')
  })

  it('renders the initial modelValue content', async () => {
    const wrapper = mount(BaseRichTextEditor, {
      props: { modelValue: '<p>Hello world</p>' },
    })
    await flushPromises()
    expect(wrapper.html()).toContain('Hello world')
  })

  it('shows the error message and error border styling', () => {
    const wrapper = mount(BaseRichTextEditor, {
      props: { modelValue: '', error: 'Body is required' },
    })
    expect(wrapper.text()).toContain('Body is required')
    expect(wrapper.html()).toContain('border-danger-500')
  })

  it('applies the disabled styling and renders toolbar buttons', async () => {
    const wrapper = mount(BaseRichTextEditor, {
      props: { modelValue: '', disabled: true },
    })
    await flushPromises()
    expect(wrapper.html()).toContain('opacity-50')
    // Toolbar (B / I / H2 / lists) should still render even when disabled.
    expect(wrapper.findAll('button').length).toBeGreaterThan(0)
  })

  it('updates rendered content when modelValue changes externally', async () => {
    const wrapper = mount(BaseRichTextEditor, {
      props: { modelValue: '<p>First</p>' },
    })
    await flushPromises()
    await wrapper.setProps({ modelValue: '<p>Second</p>' })
    await flushPromises()
    expect(wrapper.html()).toContain('Second')
    expect(wrapper.html()).not.toContain('First')
  })

  it('destroys the editor instance on unmount without throwing', async () => {
    const wrapper = mount(BaseRichTextEditor, { props: { modelValue: '<p>Bye</p>' } })
    await flushPromises()
    expect(() => wrapper.unmount()).not.toThrow()
  })
})

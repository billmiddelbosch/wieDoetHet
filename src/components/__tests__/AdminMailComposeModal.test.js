import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import i18n from '@/i18n'
import AdminMailComposeModal from '@/components/organisms/AdminMailComposeModal.vue'
import BaseRichTextEditor from '@/components/ui/BaseRichTextEditor.vue'

function mountModal(props = {}) {
  return mount(AdminMailComposeModal, {
    props: { open: true, recipientCount: 5, ...props },
    global: { plugins: [i18n], stubs: { Teleport: true } },
  })
}

describe('AdminMailComposeModal', () => {
  it('shows the recipient count', () => {
    const wrapper = mountModal({ recipientCount: 7 })
    expect(wrapper.text()).toContain('7')
  })

  it('does not emit send when subject and body are empty', async () => {
    const wrapper = mountModal()
    const sendBtn = wrapper.findAll('button').find((b) => b.text().toLowerCase().includes('versturen'))
    await sendBtn.trigger('click')
    expect(wrapper.emitted('send')).toBeUndefined()
    expect(wrapper.text()).toContain('Onderwerp is verplicht')
    expect(wrapper.text()).toContain('Bericht is verplicht')
  })

  it('emits send with the trimmed subject and html once both fields are filled', async () => {
    const wrapper = mountModal()
    await wrapper.find('#mail-subject').setValue('  Hello  ')

    // BaseRichTextEditor is a Tiptap-backed field, not a plain <input>;
    // drive it the same way the parent would, via its v-model event.
    const richText = wrapper.getComponent(BaseRichTextEditor)
    await richText.vm.$emit('update:modelValue', '<p>Body text</p>')
    await nextTick()

    const sendBtn = wrapper.findAll('button').find((b) => b.text().toLowerCase().includes('versturen'))
    await sendBtn.trigger('click')

    expect(wrapper.emitted('send')).toBeTruthy()
    expect(wrapper.emitted('send')[0][0]).toEqual({ subject: 'Hello', html: '<p>Body text</p>' })
  })

  it('resets its fields when reopened', async () => {
    const wrapper = mountModal({ open: false })
    await wrapper.setProps({ open: true })
    await wrapper.find('#mail-subject').setValue('Draft')
    await wrapper.setProps({ open: false })
    await wrapper.setProps({ open: true })
    expect(wrapper.find('#mail-subject').element.value).toBe('')
  })

  it('renders a failure result summary with per-recipient messages', () => {
    const wrapper = mountModal({
      result: { sent: 3, failed: 1, failures: [{ userId: 'u1', email: 'a@b.com', message: 'bounced' }] },
    })
    expect(wrapper.text()).toContain('3')
    expect(wrapper.text()).toContain('1')
    expect(wrapper.text()).toContain('a@b.com')
    expect(wrapper.text()).toContain('bounced')
  })

  it('shows a request-level error message', () => {
    const wrapper = mountModal({ error: 'Network error' })
    expect(wrapper.text()).toContain('Network error')
  })

  it('emits close when cancel is clicked', async () => {
    const wrapper = mountModal()
    const cancelBtn = wrapper.findAll('button').find((b) => b.text().toLowerCase().includes('annuleren'))
    await cancelBtn.trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })
})

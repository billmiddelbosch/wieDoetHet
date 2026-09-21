import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import apiClient from '@/lib/axios'
import i18n from '@/i18n'
import AdminMailTemplateEditModal from '@/components/organisms/AdminMailTemplateEditModal.vue'
import BaseRichTextEditor from '@/components/ui/BaseRichTextEditor.vue'

vi.mock('@/lib/axios', () => ({
  default: { get: vi.fn(), patch: vi.fn(), post: vi.fn() },
}))

const t = (key, params) => i18n.global.t(key, params)

const template = {
  id: 'welcome',
  enabled: true,
  tier: 'timely',
  isCustomised: false,
  subject: 'Welkom bij wieDoetHet',
  bodyHtml: '<p>Hoi {{firstName}}</p>',
  variables: ['firstName', 'appUrl'],
}

function mountModal(props = {}) {
  return mount(AdminMailTemplateEditModal, {
    props: { open: true, template, ...props },
    global: { plugins: [i18n], stubs: { Teleport: true } },
  })
}

const buttonByLabel = (wrapper, label) => wrapper.findAll('button').find((b) => b.text() === label)

describe('AdminMailTemplateEditModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    apiClient.patch.mockReset()
    apiClient.post.mockReset()
  })

  it('pre-fills the subject and body with the effective text', () => {
    const wrapper = mountModal()
    expect(wrapper.find('#template-subject').element.value).toBe('Welkom bij wieDoetHet')
    expect(wrapper.getComponent(BaseRichTextEditor).props('modelValue')).toBe(
      '<p>Hoi {{firstName}}</p>'
    )
  })

  it('lists the placeholders the template accepts', () => {
    const wrapper = mountModal()
    expect(wrapper.text()).toContain('{{firstName}}')
    expect(wrapper.text()).toContain('{{appUrl}}')
  })

  it('reloads the effective text every time it is reopened, dropping unsaved edits', async () => {
    const wrapper = mountModal()
    await wrapper.find('#template-subject').setValue('Onbewaarde wijziging')

    await wrapper.setProps({ open: false })
    await wrapper.setProps({ open: true })

    expect(wrapper.find('#template-subject').element.value).toBe('Welkom bij wieDoetHet')
  })

  it('does not save and shows validation errors when subject and body are empty', async () => {
    const wrapper = mountModal()
    await wrapper.find('#template-subject').setValue('   ')
    await wrapper.getComponent(BaseRichTextEditor).vm.$emit('update:modelValue', '<p></p>')
    await nextTick()

    await buttonByLabel(wrapper, t('admin.automation.editModal.save')).trigger('click')

    expect(apiClient.patch).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain(t('admin.automation.editModal.subjectRequired'))
    expect(wrapper.text()).toContain(t('admin.automation.editModal.bodyRequired'))
  })

  it('saves the trimmed subject and the html, then emits saved', async () => {
    apiClient.patch.mockResolvedValue({ data: { ...template, isCustomised: true } })
    const wrapper = mountModal()
    await wrapper.find('#template-subject').setValue('  Nieuw onderwerp ')
    await wrapper
      .getComponent(BaseRichTextEditor)
      .vm.$emit('update:modelValue', '<p>Nieuwe tekst</p>')
    await nextTick()

    await buttonByLabel(wrapper, t('admin.automation.editModal.save')).trigger('click')
    await flushPromises()

    expect(apiClient.patch).toHaveBeenCalledWith('/admin/mail-templates/welcome', {
      subject: 'Nieuw onderwerp',
      bodyHtml: '<p>Nieuwe tekst</p>',
    })
    expect(wrapper.emitted('saved')).toHaveLength(1)
  })

  it('shows the server validation message and stays open when saving is rejected', async () => {
    apiClient.patch.mockRejectedValue({
      response: {
        status: 400,
        data: { message: 'Onbekend of niet toegestaan veld: {{groupName}}' },
      },
    })
    const wrapper = mountModal()

    await buttonByLabel(wrapper, t('admin.automation.editModal.save')).trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Onbekend of niet toegestaan veld: {{groupName}}')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('disables "reset to default" while the template still uses the default text', () => {
    const wrapper = mountModal()
    const reset = buttonByLabel(wrapper, t('admin.automation.editModal.reset'))
    expect(reset.attributes('disabled')).toBeDefined()
  })

  it('resets to the default by sending null for both fields', async () => {
    apiClient.patch.mockResolvedValue({ data: { ...template, isCustomised: false } })
    const wrapper = mountModal({ template: { ...template, isCustomised: true } })

    await buttonByLabel(wrapper, t('admin.automation.editModal.reset')).trigger('click')
    await flushPromises()

    expect(apiClient.patch).toHaveBeenCalledWith('/admin/mail-templates/welcome', {
      subject: null,
      bodyHtml: null,
    })
  })

  it('sends a test mail and shows the address it went to', async () => {
    apiClient.post.mockResolvedValue({ data: { sent: true, to: 'admin@wiedoehet.nl' } })
    const wrapper = mountModal()

    await buttonByLabel(wrapper, t('admin.automation.editModal.test')).trigger('click')
    await flushPromises()

    expect(apiClient.post).toHaveBeenCalledWith('/admin/mail-templates/welcome/test')
    expect(wrapper.text()).toContain(
      t('admin.automation.editModal.testSent', { email: 'admin@wiedoehet.nl' })
    )
  })

  it('shows the error when the test mail cannot be sent', async () => {
    apiClient.post.mockRejectedValue({
      response: { status: 502, data: { message: 'SES weigert' } },
    })
    const wrapper = mountModal()

    await buttonByLabel(wrapper, t('admin.automation.editModal.test')).trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('SES weigert')
  })

  it('emits close when cancel is clicked', async () => {
    const wrapper = mountModal()
    await buttonByLabel(wrapper, t('common.cancel')).trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })
})

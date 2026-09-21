import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import i18n from '@/i18n'
import AdminMailTemplateCard from '@/components/molecules/AdminMailTemplateCard.vue'

const template = {
  id: 'welcome',
  enabled: false,
  tier: 'timely',
  isCustomised: false,
}

function mountCard(props = {}) {
  return mount(AdminMailTemplateCard, {
    props: { template, ...props },
    global: { plugins: [i18n] },
  })
}

describe('AdminMailTemplateCard', () => {
  it('shows the translated name, description and trigger of the template', () => {
    const wrapper = mountCard()
    expect(wrapper.find('h3').text()).toBe(i18n.global.t('admin.automation.templates.welcome.name'))
    expect(wrapper.text()).toContain(
      i18n.global.t('admin.automation.templates.welcome.description')
    )
    expect(wrapper.text()).toContain(i18n.global.t('admin.automation.templates.welcome.trigger'))
  })

  it('reflects the enabled flag on the switch', async () => {
    const wrapper = mountCard()
    expect(wrapper.find('button[role="switch"]').attributes('aria-checked')).toBe('false')

    await wrapper.setProps({ template: { ...template, enabled: true } })
    expect(wrapper.find('button[role="switch"]').attributes('aria-checked')).toBe('true')
  })

  it('emits toggle with the new value when the switch is clicked', async () => {
    const wrapper = mountCard()
    await wrapper.find('button[role="switch"]').trigger('click')
    expect(wrapper.emitted('toggle')[0]).toEqual([true])

    await wrapper.setProps({ template: { ...template, enabled: true } })
    await wrapper.find('button[role="switch"]').trigger('click')
    expect(wrapper.emitted('toggle')[1]).toEqual([false])
  })

  it('locks the switch while a request is in flight', () => {
    const wrapper = mountCard({ saving: true })
    expect(wrapper.find('button[role="switch"]').attributes('disabled')).toBeDefined()
  })

  it('emits edit when the edit button is clicked', async () => {
    const wrapper = mountCard()
    const edit = wrapper
      .findAll('button')
      .find((b) => b.text() === i18n.global.t('admin.automation.edit'))
    await edit.trigger('click')
    expect(wrapper.emitted('edit')).toHaveLength(1)
  })

  it('shows the timing tier and whether the text is customised', async () => {
    const wrapper = mountCard()
    expect(wrapper.text()).toContain(i18n.global.t('admin.automation.timing.timely'))
    expect(wrapper.text()).toContain(i18n.global.t('admin.automation.default'))

    await wrapper.setProps({ template: { ...template, tier: 'normal', isCustomised: true } })
    expect(wrapper.text()).toContain(i18n.global.t('admin.automation.timing.normal'))
    expect(wrapper.text()).toContain(i18n.global.t('admin.automation.customised'))
  })
})

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import i18n from '@/i18n'
import AdminMailMasterCard from '@/components/molecules/AdminMailMasterCard.vue'

const off = { enabled: false, updatedAt: null, updatedBy: null }
const on = { enabled: true, updatedAt: '2026-09-21T08:00:00Z', updatedBy: 'admin-1' }

function mountCard(props = {}) {
  return mount(AdminMailMasterCard, {
    props: { master: off, ...props },
    global: { plugins: [i18n] },
  })
}

const t = (key, params) => i18n.global.t(key, params)

describe('AdminMailMasterCard', () => {
  it('shows the title and the off explanation while the switch is off', () => {
    const wrapper = mountCard()
    expect(wrapper.find('h2').text()).toBe(t('admin.automation.master.title'))
    expect(wrapper.text()).toContain(t('admin.automation.masterOff'))
    expect(wrapper.text()).not.toContain(t('admin.automation.master.on'))
  })

  it('reflects the master flag on the switch', async () => {
    const wrapper = mountCard()
    expect(wrapper.find('button[role="switch"]').attributes('aria-checked')).toBe('false')

    await wrapper.setProps({ master: on })
    expect(wrapper.find('button[role="switch"]').attributes('aria-checked')).toBe('true')
    expect(wrapper.text()).toContain(t('admin.automation.master.on'))
    expect(wrapper.text()).not.toContain(t('admin.automation.masterOff'))
  })

  it('emits toggle with the requested value and does not change by itself', async () => {
    const wrapper = mountCard()
    await wrapper.find('button[role="switch"]').trigger('click')
    expect(wrapper.emitted('toggle')[0]).toEqual([true])
    expect(wrapper.find('button[role="switch"]').attributes('aria-checked')).toBe('false')

    await wrapper.setProps({ master: on })
    await wrapper.find('button[role="switch"]').trigger('click')
    expect(wrapper.emitted('toggle')[1]).toEqual([false])
  })

  it('locks the switch while a request is in flight', () => {
    const wrapper = mountCard({ saving: true })
    expect(wrapper.find('button[role="switch"]').attributes('disabled')).toBeDefined()
  })

  it('warns about the emergency stop only when the switch is on and it overrides it', async () => {
    const warning = t('admin.automation.master.killSwitch')

    const offWithKill = mountCard({ killSwitch: true })
    expect(offWithKill.text()).not.toContain(warning)

    const onWithoutKill = mountCard({ master: on })
    expect(onWithoutKill.text()).not.toContain(warning)

    const onWithKill = mountCard({ master: on, killSwitch: true })
    expect(onWithKill.text()).toContain(warning)
  })

  it('shows when the switch was last changed, only if it ever was', () => {
    expect(mountCard().text()).not.toContain(t('admin.automation.master.updatedAt', { at: '' }))

    const wrapper = mountCard({ master: on })
    expect(wrapper.text()).toContain(t('admin.automation.master.updatedAt', { at: '' }).trim())
  })
})

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import i18n from '@/i18n'
import AdminSelectionToolbar from '@/components/molecules/AdminSelectionToolbar.vue'

function mountToolbar(props) {
  return mount(AdminSelectionToolbar, {
    props,
    global: { plugins: [i18n] },
  })
}

describe('AdminSelectionToolbar', () => {
  it('renders nothing when no rows are selected', () => {
    const wrapper = mountToolbar({ selectedCount: 0, totalCount: 100 })
    expect(wrapper.find('div').exists()).toBe(false)
  })

  it('shows the selected count once at least one row is selected', () => {
    const wrapper = mountToolbar({ selectedCount: 3, totalCount: 100 })
    expect(wrapper.text()).toContain('3')
  })

  it('shows the "select all matching" link when fewer rows are selected than total', () => {
    const wrapper = mountToolbar({ selectedCount: 3, totalCount: 100 })
    expect(wrapper.text()).toContain('100')
    expect(wrapper.findAll('button').some((b) => b.text().includes('100'))).toBe(true)
  })

  it('hides the "select all matching" link once selectedCount equals totalCount', () => {
    const wrapper = mountToolbar({ selectedCount: 100, totalCount: 100 })
    expect(wrapper.findAll('button').some((b) => b.text().includes('100'))).toBe(false)
  })

  it('emits select-all-matching when the link is clicked', async () => {
    const wrapper = mountToolbar({ selectedCount: 3, totalCount: 100 })
    const link = wrapper.findAll('button').find((b) => b.text().includes('100'))
    await link.trigger('click')
    expect(wrapper.emitted('select-all-matching')).toBeTruthy()
  })

  it('emits clear when the clear button is clicked', async () => {
    const wrapper = mountToolbar({ selectedCount: 3, totalCount: 100 })
    const clearBtn = wrapper.findAll('button').find((b) => b.text().toLowerCase().includes('wis'))
    await clearBtn.trigger('click')
    expect(wrapper.emitted('clear')).toBeTruthy()
  })

  it('emits send-email when the send button is clicked', async () => {
    const wrapper = mountToolbar({ selectedCount: 3, totalCount: 100 })
    const sendBtn = wrapper.findAll('button').find((b) => b.text().toLowerCase().includes('versturen'))
    await sendBtn.trigger('click')
    expect(wrapper.emitted('send-email')).toBeTruthy()
  })

  it('disables clear/send actions when disabled prop is true', () => {
    const wrapper = mountToolbar({ selectedCount: 3, totalCount: 100, disabled: true })
    const buttons = wrapper.findAll('button')
    buttons.forEach((b) => expect(b.attributes('disabled')).toBeDefined())
  })
})

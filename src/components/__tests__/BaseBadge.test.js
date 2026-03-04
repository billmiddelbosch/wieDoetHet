import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseBadge from '@/components/ui/BaseBadge.vue'

describe('BaseBadge', () => {
  it('renders slot content', () => {
    const wrapper = mount(BaseBadge, { slots: { default: 'Vol' } })
    expect(wrapper.text()).toContain('Vol')
  })

  it('applies success classes for success variant', () => {
    const wrapper = mount(BaseBadge, { props: { variant: 'success' } })
    expect(wrapper.find('span').classes().join(' ')).toContain('bg-success-100')
  })

  it('applies danger classes for danger variant', () => {
    const wrapper = mount(BaseBadge, { props: { variant: 'danger' } })
    expect(wrapper.find('span').classes().join(' ')).toContain('bg-danger-100')
  })

  it('applies neutral classes by default', () => {
    const wrapper = mount(BaseBadge)
    expect(wrapper.find('span').classes().join(' ')).toContain('bg-[var(--bg-subtle)]')
  })
})

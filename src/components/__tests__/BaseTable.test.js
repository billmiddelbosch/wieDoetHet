import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseTable from '@/components/ui/BaseTable.vue'

const columns = [{ key: 'name', label: 'Name' }]
const rows = [
  { id: '1', name: 'Alice' },
  { id: '2', name: 'Bob' },
]

describe('BaseTable', () => {
  it('does not render a selection column when selectable is false', () => {
    const wrapper = mount(BaseTable, { props: { columns, rows } })
    expect(wrapper.findAll('input[type="checkbox"]').length).toBe(0)
  })

  it('renders a header checkbox and one per-row checkbox when selectable', () => {
    const wrapper = mount(BaseTable, { props: { columns, rows, selectable: true, selectedKeys: [] } })
    expect(wrapper.findAll('input[type="checkbox"]').length).toBe(3)
  })

  it('checks a row checkbox when its id is in selectedKeys', () => {
    const wrapper = mount(BaseTable, {
      props: { columns, rows, selectable: true, selectedKeys: ['1'] },
    })
    const rowCheckboxes = wrapper.findAll('tbody input[type="checkbox"]')
    expect(rowCheckboxes[0].element.checked).toBe(true)
    expect(rowCheckboxes[1].element.checked).toBe(false)
  })

  it('emits update:selectedKeys with the toggled row added', async () => {
    const wrapper = mount(BaseTable, {
      props: { columns, rows, selectable: true, selectedKeys: [] },
    })
    const rowCheckbox = wrapper.findAll('tbody input[type="checkbox"]')[0]
    await rowCheckbox.trigger('click')
    expect(wrapper.emitted('update:selectedKeys')[0][0]).toEqual(['1'])
  })

  it('emits update:selectedKeys with the toggled row removed when already selected', async () => {
    const wrapper = mount(BaseTable, {
      props: { columns, rows, selectable: true, selectedKeys: ['1'] },
    })
    const rowCheckbox = wrapper.findAll('tbody input[type="checkbox"]')[0]
    await rowCheckbox.trigger('click')
    expect(wrapper.emitted('update:selectedKeys')[0][0]).toEqual([])
  })

  it('toggling a row checkbox does not also emit row-click', async () => {
    const wrapper = mount(BaseTable, {
      props: { columns, rows, selectable: true, selectedKeys: [] },
    })
    const rowCheckbox = wrapper.findAll('tbody input[type="checkbox"]')[0]
    await rowCheckbox.trigger('click')
    expect(wrapper.emitted('row-click')).toBeUndefined()
  })

  it('clicking elsewhere on the row still emits row-click', async () => {
    const wrapper = mount(BaseTable, {
      props: { columns, rows, selectable: true, selectedKeys: [] },
    })
    await wrapper.findAll('tbody tr')[0].trigger('click')
    expect(wrapper.emitted('row-click')[0][0]).toEqual(rows[0])
  })

  it('header checkbox selects all rows on the current page', async () => {
    const wrapper = mount(BaseTable, {
      props: { columns, rows, selectable: true, selectedKeys: [] },
    })
    const headerCheckbox = wrapper.find('thead input[type="checkbox"]')
    await headerCheckbox.trigger('click')
    expect(wrapper.emitted('update:selectedKeys')[0][0]).toEqual(['1', '2'])
  })

  it('header checkbox is checked when every row on the page is selected', () => {
    const wrapper = mount(BaseTable, {
      props: { columns, rows, selectable: true, selectedKeys: ['1', '2'] },
    })
    expect(wrapper.find('thead input[type="checkbox"]').element.checked).toBe(true)
  })

  it('header checkbox unchecks all rows on the current page when all are selected', async () => {
    const wrapper = mount(BaseTable, {
      props: { columns, rows, selectable: true, selectedKeys: ['1', '2'] },
    })
    const headerCheckbox = wrapper.find('thead input[type="checkbox"]')
    await headerCheckbox.trigger('click')
    expect(wrapper.emitted('update:selectedKeys')[0][0]).toEqual([])
  })

  it('preserves selected ids from other pages not present in the current rows', async () => {
    const wrapper = mount(BaseTable, {
      props: { columns, rows, selectable: true, selectedKeys: ['other-page-id'] },
    })
    const rowCheckbox = wrapper.findAll('tbody input[type="checkbox"]')[0]
    await rowCheckbox.trigger('click')
    expect(wrapper.emitted('update:selectedKeys')[0][0]).toEqual(['other-page-id', '1'])
  })

  it('expands the loading colspan to account for the selection column', () => {
    const wrapper = mount(BaseTable, {
      props: { columns, rows, selectable: true, loading: true },
    })
    expect(wrapper.find('tbody td').attributes('colspan')).toBe('2')
  })

  it('expands the empty-state colspan to account for the selection column', () => {
    const wrapper = mount(BaseTable, {
      props: { columns, rows: [], selectable: true, emptyMessage: 'None' },
    })
    expect(wrapper.find('tbody td').attributes('colspan')).toBe('2')
  })

  it('renders row and header checkboxes as disabled when selectionDisabled is true', () => {
    const wrapper = mount(BaseTable, {
      props: { columns, rows, selectable: true, selectedKeys: ['1', '2'], selectionDisabled: true },
    })
    wrapper.findAll('input[type="checkbox"]').forEach((checkbox) => {
      expect(checkbox.element.disabled).toBe(true)
    })
  })

  it('does not emit update:selectedKeys when a row checkbox is clicked while selectionDisabled', async () => {
    const wrapper = mount(BaseTable, {
      props: { columns, rows, selectable: true, selectedKeys: ['1', '2'], selectionDisabled: true },
    })
    const rowCheckbox = wrapper.findAll('tbody input[type="checkbox"]')[0]
    await rowCheckbox.trigger('click')
    expect(wrapper.emitted('update:selectedKeys')).toBeUndefined()
  })

  it('does not emit update:selectedKeys when the header checkbox is clicked while selectionDisabled', async () => {
    const wrapper = mount(BaseTable, {
      props: { columns, rows, selectable: true, selectedKeys: ['1', '2'], selectionDisabled: true },
    })
    const headerCheckbox = wrapper.find('thead input[type="checkbox"]')
    await headerCheckbox.trigger('click')
    expect(wrapper.emitted('update:selectedKeys')).toBeUndefined()
  })
})

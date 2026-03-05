import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useGroupStore } from '@/stores/group'

const mockGroup = (overrides = {}) => ({
  id: '1',
  name: 'Sinterklaas',
  shareToken: 'abc',
  isTemporary: false,
  pictureUrl: null,
  initiatorId: 'user-1',
  scorecardVisibility: 'all',
  ...overrides,
})

describe('useGroupStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('starts with empty groups and no currentGroup', () => {
    const store = useGroupStore()
    expect(store.groups).toHaveLength(0)
    expect(store.currentGroup).toBeNull()
  })

  it('setGroups replaces groups array', () => {
    const store = useGroupStore()
    store.setGroups([mockGroup(), mockGroup({ id: '2', name: 'Kerst' })])
    expect(store.groups).toHaveLength(2)
  })

  it('addGroup prepends to groups', () => {
    const store = useGroupStore()
    store.setGroups([mockGroup({ id: '1' })])
    store.addGroup(mockGroup({ id: '2', name: 'Nieuw' }))
    expect(store.groups[0].id).toBe('2')
    expect(store.groups).toHaveLength(2)
  })

  it('updateGroup merges data by id', () => {
    const store = useGroupStore()
    store.setGroups([mockGroup()])
    store.updateGroup('1', { name: 'Bijgewerkt' })
    expect(store.groups[0].name).toBe('Bijgewerkt')
    expect(store.groups[0].shareToken).toBe('abc') // preserved
  })

  it('updateGroup also updates currentGroup when id matches', () => {
    const store = useGroupStore()
    store.setCurrentGroup(mockGroup())
    store.updateGroup('1', { name: 'Updated' })
    expect(store.currentGroup?.name).toBe('Updated')
  })

  it('removeGroup removes by id', () => {
    const store = useGroupStore()
    store.setGroups([mockGroup({ id: '1' }), mockGroup({ id: '2' })])
    store.removeGroup('1')
    expect(store.groups).toHaveLength(1)
    expect(store.groups[0].id).toBe('2')
  })

  it('removeGroup clears currentGroup when id matches', () => {
    const store = useGroupStore()
    store.setCurrentGroup(mockGroup({ id: '1' }))
    store.removeGroup('1')
    expect(store.currentGroup).toBeNull()
  })

  it('groupById computed finds by id', () => {
    const store = useGroupStore()
    store.setGroups([mockGroup({ id: '1' }), mockGroup({ id: '2' })])
    expect(store.groupById('1')?.id).toBe('1')
    expect(store.groupById('999')).toBeNull()
  })
})

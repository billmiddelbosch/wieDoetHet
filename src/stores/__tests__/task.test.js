import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTaskStore } from '@/stores/task'

const mockTask = (overrides = {}) => ({
  id: 'task-1',
  groupId: 'group-1',
  title: 'Boodschappen',
  description: null,
  maxCapacity: null,
  order: 0,
  claims: [],
  ...overrides,
})

describe('useTaskStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('starts with empty tasks', () => {
    const store = useTaskStore()
    expect(store.tasks).toHaveLength(0)
  })

  it('setTasks enriches and stores tasks', () => {
    const store = useTaskStore()
    store.setTasks([mockTask()])
    expect(store.tasks).toHaveLength(1)
    expect(store.tasks[0].claimCount).toBe(0)
    expect(store.tasks[0].isFull).toBe(false)
    expect(store.tasks[0].isClaimedByMe).toBe(false)
  })

  it('addTask appends enriched task', () => {
    const store = useTaskStore()
    store.addTask(mockTask({ id: 'task-2' }))
    expect(store.tasks).toHaveLength(1)
  })

  it('removeTask removes by id', () => {
    const store = useTaskStore()
    store.setTasks([mockTask({ id: 'task-1' }), mockTask({ id: 'task-2' })])
    store.removeTask('task-1')
    expect(store.tasks).toHaveLength(1)
    expect(store.tasks[0].id).toBe('task-2')
  })

  it('applyClaim adds claim and updates counts', () => {
    const store = useTaskStore()
    store.setTasks([mockTask({ id: 'task-1' })])
    const claim = { id: 'claim-1', userId: 'user-1', taskId: 'task-1' }
    store.applyClaim('task-1', claim)
    expect(store.tasks[0].claimCount).toBe(1)
    expect(store.tasks[0].isClaimedByMe).toBe(true)
  })

  it('isFull when maxCapacity reached', () => {
    const store = useTaskStore()
    store.setTasks([mockTask({ id: 'task-1', maxCapacity: 1 })])
    store.applyClaim('task-1', { id: 'c1', userId: 'u1', taskId: 'task-1' })
    expect(store.tasks[0].isFull).toBe(true)
  })

  it('removeClaim decrements claim count', () => {
    const store = useTaskStore()
    store.setTasks([
      mockTask({ id: 'task-1', claims: [{ id: 'c1', userId: 'u1', sessionId: null }] }),
    ])
    store.removeClaim('task-1', 'u1')
    expect(store.tasks[0].claimCount).toBe(0)
    expect(store.tasks[0].isClaimedByMe).toBe(false)
  })
})

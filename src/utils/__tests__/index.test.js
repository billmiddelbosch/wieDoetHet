import { describe, it, expect } from 'vitest'
import { formatDateTime } from '../index'

describe('formatDateTime', () => {
  it('includes the time of day, not just the date', () => {
    const out = formatDateTime('2026-03-04T10:15:00Z', 'en-GB')
    expect(out).toMatch(/2026/)
    expect(out).toMatch(/\d{2}:\d{2}/)
  })

  it('formats with the requested locale', () => {
    expect(formatDateTime('2026-03-04T10:15:00Z', 'nl-NL')).toMatch(/mrt/i)
    expect(formatDateTime('2026-03-04T10:15:00Z', 'en-GB')).toMatch(/Mar/)
  })
})

// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { localParts, localDate, addDays, localMidnightUtc, startOfNextLocalDay } from '../time.js'

const iso = (ms) => new Date(ms).toISOString()

describe('localParts', () => {
  it('reads Amsterdam wall-clock time in summer (UTC+2)', () => {
    expect(localParts(Date.parse('2026-09-22T08:00:00Z'))).toMatchObject({ hour: 10, weekday: 2, day: 22 })
  })

  it('reads Amsterdam wall-clock time in winter (UTC+1)', () => {
    expect(localParts(Date.parse('2026-12-01T09:00:00Z'))).toMatchObject({ hour: 10, weekday: 2 })
  })

  it('rolls the date over at local midnight, not UTC midnight', () => {
    // 22:30Z on Saturday is already 00:30 on Sunday in Amsterdam (summer time)
    expect(localParts(Date.parse('2026-09-19T22:30:00Z'))).toMatchObject({ weekday: 0, day: 20, hour: 0 })
  })
})

describe('DST boundaries', () => {
  it('spring forward (Sun 29 Mar 2026): the local day is 23 hours long', () => {
    expect(iso(startOfNextLocalDay(Date.parse('2026-03-28T12:00:00Z')))).toBe('2026-03-28T23:00:00.000Z') // CET midnight
    expect(iso(startOfNextLocalDay(Date.parse('2026-03-29T12:00:00Z')))).toBe('2026-03-29T22:00:00.000Z') // CEST midnight
  })

  it('fall back (Sun 25 Oct 2026): the local day is 25 hours long', () => {
    expect(iso(startOfNextLocalDay(Date.parse('2026-10-24T12:00:00Z')))).toBe('2026-10-24T22:00:00.000Z') // CEST midnight
    expect(iso(startOfNextLocalDay(Date.parse('2026-10-25T12:00:00Z')))).toBe('2026-10-25T23:00:00.000Z') // CET midnight
  })

  it('a user registering at 23:30 local just before the switch still gets "the next calendar day"', () => {
    expect(iso(startOfNextLocalDay(Date.parse('2026-03-28T22:30:00Z')))).toBe('2026-03-28T23:00:00.000Z')
  })

  it('10:00 local is 08:00Z in summer and 09:00Z in winter', () => {
    expect(localParts(Date.parse('2026-10-26T09:00:00Z')).hour).toBe(10) // Mon after fall-back
    expect(localParts(Date.parse('2026-10-26T08:00:00Z')).hour).toBe(9)
    expect(localParts(Date.parse('2026-03-30T08:00:00Z')).hour).toBe(10) // Mon after spring-forward
  })
})

describe('date arithmetic', () => {
  it('localDate / addDays / localMidnightUtc agree', () => {
    expect(localDate(Date.parse('2026-09-19T22:30:00Z'))).toBe('2026-09-20')
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(iso(localMidnightUtc('2026-09-20'))).toBe('2026-09-19T22:00:00.000Z')
  })
})

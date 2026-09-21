// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
// The real SES client is not installed locally (Lambda runtime provides it); runLifecycle gets sendMail injected anyway.
vi.mock('../../shared/ses.js', () => ({ sendMail: vi.fn() }))
import { runLifecycle } from '../index.js'
import { EVALUATORS, createContext } from '../evaluators.js'
import { createFakeDb, ENV, makeDeps, TUE_10, MON_10, WED_10, SAT_10, hoursAgo, daysAgo } from './helpers.js'

const THU_10 = TUE_10 + 2 * 24 * 3600 * 1000
const FRI_10 = TUE_10 + 3 * 24 * 3600 * 1000

async function run(db, now, event = {}, options = {}) {
  const deps = makeDeps(db, { now, ...options })
  const summary = await runLifecycle(event, deps)
  return { summary, sent: deps.sent }
}

const recipients = (sent) => sent.map((message) => message.to).sort()

/** A user who is long registered, so no welcome/no_group/dormant logic interferes. */
const oldUser = (db, id, extra = {}) => db.addUser({ id, createdAt: daysAgo(TUE_10, 40), lastSeenAt: daysAgo(TUE_10, 1), ...extra })

describe('guards', () => {
  it('does nothing while the master switch is off (but still records the run)', async () => {
    const db = createFakeDb()
    db.setMaster(false)
    db.enableTemplate('welcome')
    db.addUser({ id: 'u1', createdAt: '2026-09-21T14:00:00.000Z' })
    const { summary, sent } = await run(db, TUE_10)
    expect(summary.skipped).toBe('master-switch-off')
    expect(sent).toHaveLength(0)
    expect(db.logRows()).toHaveLength(0)
    expect(db.lastRun()).toMatchObject({ masterEnabled: false, killSwitch: false })
  })

  it('fails closed when the master switch was never set', async () => {
    const db = createFakeDb({ master: false })
    db.enableTemplate('welcome')
    db.addUser({ id: 'u1', createdAt: '2026-09-21T14:00:00.000Z' })
    const { summary, sent } = await run(db, TUE_10)
    expect(summary.skipped).toBe('master-switch-off')
    expect(sent).toHaveLength(0)
    expect(db.lastRun()).toMatchObject({ masterEnabled: false })
  })

  it('fails closed when the master switch cannot be read', async () => {
    const db = createFakeDb()
    db.enableTemplate('welcome')
    db.addUser({ id: 'u1', createdAt: '2026-09-21T14:00:00.000Z' })
    const getItem = db.getItem
    db.getItem = async (pk, sk) => {
      if (sk === 'MASTER') throw new Error('throttled')
      return getItem(pk, sk)
    }
    const { summary, sent } = await run(db, TUE_10)
    expect(summary.skipped).toBe('master-switch-off')
    expect(sent).toHaveLength(0)
  })

  it('LIFECYCLE_MAIL_ENABLED=false is a hard override, even with the master switch on', async () => {
    const db = createFakeDb()
    db.enableTemplate('welcome')
    db.addUser({ id: 'u1', createdAt: '2026-09-21T14:00:00.000Z' })
    const { summary, sent } = await run(db, TUE_10, {}, { env: { ...ENV, LIFECYCLE_MAIL_ENABLED: 'false' } })
    expect(summary.skipped).toBe('master-switch-off')
    expect(sent).toHaveLength(0)
    expect(db.lastRun()).toMatchObject({ masterEnabled: false, killSwitch: true })
  })

  it('an unset or "true" LIFECYCLE_MAIL_ENABLED defers to the master switch in the table', async () => {
    for (const value of [undefined, 'true']) {
      const db = createFakeDb()
      db.enableTemplate('welcome')
      db.addUser({ id: 'u1', createdAt: '2026-09-21T14:00:00.000Z' })
      const { sent } = await run(db, TUE_10, {}, { env: { ...ENV, LIFECYCLE_MAIL_ENABLED: value } })
      expect(sent).toHaveLength(1)
    }
  })

  it('fails closed without a reply-to address', async () => {
    const db = createFakeDb()
    db.enableTemplate('welcome')
    db.addUser({ id: 'u1', createdAt: '2026-09-21T14:00:00.000Z' })
    const { summary, sent } = await run(db, TUE_10, {}, { env: { SES_FROM_EMAIL: 'noreply@wiedoethet.nl' } })
    expect(summary.skipped).toBe('misconfigured')
    expect(sent).toHaveLength(0)
  })

  it('only sends in the 10:00 hour (Amsterdam), unless forced or a dry run', async () => {
    const db = createFakeDb()
    db.enableTemplate('welcome')
    db.addUser({ id: 'u1', createdAt: '2026-09-21T14:00:00.000Z' })
    const late = TUE_10 + 3600 * 1000 // 11:00 local
    expect((await run(db, late)).summary.skipped).toBe('outside-send-window')
    expect((await run(db, late, { dryRun: true })).summary.dryRun).toBe(true)
    const forced = await run(db, late, { force: true })
    expect(forced.summary.sent).toBe(1)
  })

  it('never sends on a weekend, not even when forced', async () => {
    const db = createFakeDb()
    db.enableTemplate('welcome')
    db.addUser({ id: 'u1', createdAt: '2026-09-18T14:00:00.000Z' })
    const { summary, sent } = await run(db, SAT_10, { force: true })
    expect(summary.skipped).toBe('weekend')
    expect(sent).toHaveLength(0)
  })

  it('ignores templates that were never switched on', async () => {
    const db = createFakeDb()
    db.addUser({ id: 'u1', createdAt: '2026-09-21T14:00:00.000Z' })
    const { sent } = await run(db, TUE_10)
    expect(sent).toHaveLength(0)
  })

  it('a dry run evaluates but sends and logs nothing, even with the master switch off', async () => {
    const db = createFakeDb()
    db.enableTemplate('welcome')
    db.addUser({ id: 'u1', createdAt: '2026-09-21T14:00:00.000Z' })
    db.setMaster(false)
    const { summary, sent } = await run(db, TUE_10, { dryRun: true })
    expect(sent).toHaveLength(0)
    expect(db.logRows()).toHaveLength(0)
    expect(summary.wouldSend).toEqual([{ templateId: 'welcome', userId: 'u1', scopeId: '-' }])
    expect(db.lastRun()).toMatchObject({ dryRun: true })
  })

  it('records the run summary', async () => {
    const db = createFakeDb()
    db.enableTemplate('welcome')
    db.addUser({ id: 'u1', createdAt: '2026-09-21T14:00:00.000Z' })
    await run(db, TUE_10)
    expect(db.lastRun()).toMatchObject({ masterEnabled: true, dryRun: false, sent: 1, failed: 0, skippedByCap: 0 })
  })
})

describe('welcome', () => {
  it('is due from the start of the day after registration, not before', async () => {
    const db = createFakeDb()
    db.enableTemplate('welcome')
    db.addUser({ id: 'early', createdAt: '2026-09-21T14:00:00.000Z' }) // Mon 16:00 local → due Tue 00:00
    db.addUser({ id: 'same-day', createdAt: '2026-09-22T06:00:00.000Z' }) // Tue 08:00 local → due Wed 00:00
    expect(recipients((await run(db, TUE_10)).sent)).toEqual(['early@example.com'])
    expect(recipients((await run(db, WED_10)).sent)).toEqual(['same-day@example.com'])
  })

  it('is suppressed when the user already created a group', async () => {
    const db = createFakeDb()
    db.enableTemplate('welcome')
    db.addUser({ id: 'with-group', createdAt: '2026-09-21T14:00:00.000Z' })
    db.addGroup({ id: 'g1', initiatorId: 'with-group', createdAt: '2026-09-21T15:00:00.000Z' })
    db.addUser({ id: 'no-group', createdAt: '2026-09-21T14:00:00.000Z' })
    expect(recipients((await run(db, TUE_10)).sent)).toEqual(['no-group@example.com'])
  })

  it('is dropped instead of sent late (96 h after it became due)', async () => {
    const db = createFakeDb()
    db.enableTemplate('welcome')
    db.addUser({ id: 'expired', createdAt: '2026-09-16T08:00:00.000Z' }) // due Wed 22:00Z, expired Sun 22:00Z
    db.addUser({ id: 'fresh', createdAt: '2026-09-17T08:00:00.000Z' }) // due Thu 22:00Z, expires Mon 22:00Z
    expect(recipients((await run(db, MON_10)).sent)).toEqual(['fresh@example.com'])
  })

  it('renders the first name, the footer and the create-group link', async () => {
    const db = createFakeDb()
    db.enableTemplate('welcome')
    db.addUser({ id: 'u1', name: 'Anna de Vries', createdAt: '2026-09-21T14:00:00.000Z' })
    const { sent } = await run(db, TUE_10)
    expect(sent[0].subject).toBe('Welkom bij Wie-Doet-Het, Anna!')
    expect(sent[0].html).toContain('Hoi Anna,')
    expect(sent[0].html).toContain('/groups/new')
    expect(sent[0].html).toMatch(/afmelden/i)
    expect(sent[0].html).toContain(ENV.SES_REPLY_TO_EMAIL)
  })

  it('falls back to "daar" without a name and uses an admin-edited text', async () => {
    const db = createFakeDb()
    db.enableTemplate('welcome', { subject: 'Hoi {{firstName}}, welkom!', bodyHtml: '<p>Eigen tekst voor {{firstName}}</p>' })
    db.addUser({ id: 'u1', name: '', createdAt: '2026-09-21T14:00:00.000Z' })
    const { sent } = await run(db, TUE_10)
    expect(sent[0].subject).toBe('Hoi daar, welkom!')
    expect(sent[0].html).toContain('Eigen tekst voor daar')
  })
})

describe('no_group', () => {
  it('is a normal-tier mail: not on Monday, on Tuesday', async () => {
    const db = createFakeDb()
    db.enableTemplate('no_group')
    db.addUser({ id: 'u1', createdAt: new Date(SAT_10).toISOString() }) // due Mon 10:00 local
    expect((await run(db, MON_10)).sent).toHaveLength(0)
    expect(recipients((await run(db, TUE_10)).sent)).toEqual(['u1@example.com'])
  })

  it('is not due before 48 hours after registration', async () => {
    const db = createFakeDb()
    db.enableTemplate('no_group')
    db.addUser({ id: 'u1', createdAt: hoursAgo(TUE_10, 47) })
    expect((await run(db, TUE_10)).sent).toHaveLength(0)
  })

  it('is suppressed once the user has a group', async () => {
    const db = createFakeDb()
    db.enableTemplate('no_group')
    db.addUser({ id: 'u1', createdAt: hoursAgo(TUE_10, 60) })
    db.addGroup({ id: 'g1', initiatorId: 'u1', createdAt: hoursAgo(TUE_10, 5) })
    expect((await run(db, TUE_10)).sent).toHaveLength(0)
  })
})

describe('one mail per user per run', () => {
  it('sends the higher-priority mail first and lets no_group follow after welcome despite the 72 h gap', async () => {
    const db = createFakeDb()
    db.enableTemplate('welcome')
    db.enableTemplate('no_group')
    db.addUser({ id: 'u1', createdAt: '2026-09-20T08:00:00.000Z' }) // welcome due Mon, no_group due Tue 10:00
    const first = await run(db, TUE_10)
    expect(first.sent).toHaveLength(1)
    expect(first.sent[0].subject).toContain('Welkom')

    const second = await run(db, WED_10)
    expect(second.sent).toHaveLength(1)
    expect(second.sent[0].subject).toBe('Zullen we samen je eerste groep maken?')
  })

  it('holds back a mail that would follow another lifecycle mail within 72 hours', async () => {
    const db = createFakeDb()
    db.enableTemplate('no_claims')
    oldUser(db, 'u1')
    db.addGroup({ id: 'g1', initiatorId: 'u1', createdAt: daysAgo(TUE_10, 10) })
    db.addTask('g1', 't1', { createdAt: daysAgo(TUE_10, 8) })
    db.addLog({ userId: 'u1', templateId: 'no_tasks', scopeId: 'gX', status: 'sent', createdAt: hoursAgo(TUE_10, 24) })
    expect((await run(db, TUE_10)).sent).toHaveLength(0)
  })

  it('allows the mail once the previous one is more than 72 hours old', async () => {
    const db = createFakeDb()
    db.enableTemplate('no_claims')
    oldUser(db, 'u1')
    db.addGroup({ id: 'g1', initiatorId: 'u1', createdAt: daysAgo(TUE_10, 10) })
    db.addTask('g1', 't1', { createdAt: daysAgo(TUE_10, 8) })
    db.addLog({ userId: 'u1', templateId: 'no_tasks', scopeId: 'gX', status: 'sent', createdAt: hoursAgo(TUE_10, 80) })
    expect(recipients((await run(db, TUE_10)).sent)).toEqual(['u1@example.com'])
  })
})

describe('group funnel (no_tasks / no_claims)', () => {
  function seedFunnel(db) {
    oldUser(db, 'a')
    oldUser(db, 'b')
    oldUser(db, 'c')
    db.addGroup({ id: 'g-none', initiatorId: 'a', createdAt: hoursAgo(TUE_10, 30) }) // no tasks
    db.addGroup({ id: 'g-tasks', initiatorId: 'b', createdAt: daysAgo(TUE_10, 8) })
    db.addTask('g-tasks', 't1', { createdAt: daysAgo(TUE_10, 6) }) // tasks, no claims
    db.addGroup({ id: 'g-done', initiatorId: 'c', createdAt: daysAgo(TUE_10, 8) })
    db.addTask('g-done', 't2', { createdAt: daysAgo(TUE_10, 6) })
    db.addClaim('g-done', 't2') // claimed → funnel finished
  }

  it('mails each group for the one stage it is stuck in, and never a finished group', async () => {
    const db = createFakeDb()
    db.enableTemplate('no_tasks')
    db.enableTemplate('no_claims')
    seedFunnel(db)
    const { sent } = await run(db, TUE_10)
    expect(recipients(sent)).toEqual(['a@example.com', 'b@example.com'])
    expect(sent.find((m) => m.to === 'a@example.com').subject).toContain('voeg taken toe')
    expect(sent.find((m) => m.to === 'b@example.com').subject).toContain('Nog niemand heeft een taak gekozen')
  })

  it('addresses the group initiator and escapes the group name in the body', async () => {
    const db = createFakeDb()
    db.enableTemplate('no_tasks')
    oldUser(db, 'a')
    db.addGroup({ id: 'g1', initiatorId: 'a', name: '<b>Tom & Jerry</b>', createdAt: hoursAgo(TUE_10, 30) })
    const { sent } = await run(db, TUE_10)
    expect(sent[0].html).toContain('&lt;b&gt;Tom &amp; Jerry&lt;/b&gt;')
    expect(sent[0].html).not.toContain('<b>Tom')
    expect(sent[0].html).toContain('/groups/g1')
  })

  it('does not chase a group whose event is already over', async () => {
    const db = createFakeDb()
    db.enableTemplate('no_tasks')
    db.enableTemplate('no_claims')
    oldUser(db, 'a')
    oldUser(db, 'b')
    db.addGroup({ id: 'g1', initiatorId: 'a', createdAt: hoursAgo(TUE_10, 30), eventDate: '2026-09-21' })
    db.addGroup({ id: 'g2', initiatorId: 'b', createdAt: daysAgo(TUE_10, 8), eventDate: '2026-09-21' })
    db.addTask('g2', 't1', { createdAt: daysAgo(TUE_10, 6) })
    expect((await run(db, TUE_10)).sent).toHaveLength(0)
  })

  it('no_tasks is due only 24 hours after the group was created', async () => {
    const db = createFakeDb()
    db.enableTemplate('no_tasks')
    oldUser(db, 'a')
    db.addGroup({ id: 'g1', initiatorId: 'a', createdAt: hoursAgo(TUE_10, 23) })
    expect((await run(db, TUE_10)).sent).toHaveLength(0)
  })

  it('no_claims counts 4 days from the first task, falling back to the group for legacy tasks', async () => {
    const db = createFakeDb()
    db.enableTemplate('no_claims')
    oldUser(db, 'legacy')
    oldUser(db, 'recent')
    db.addGroup({ id: 'g-legacy', initiatorId: 'legacy', createdAt: daysAgo(TUE_10, 6) })
    db.addTask('g-legacy', 't1') // no createdAt (created before the field existed)
    db.addGroup({ id: 'g-recent', initiatorId: 'recent', createdAt: daysAgo(TUE_10, 10) })
    db.addTask('g-recent', 't2', { createdAt: daysAgo(TUE_10, 1) }) // task only 1 day old
    expect(recipients((await run(db, TUE_10)).sent)).toEqual(['legacy@example.com'])
  })
})

describe('day_after_event', () => {
  function seedEvents(db) {
    for (const id of ['u1', 'u2', 'u3', 'u4', 'u5', 'u6']) oldUser(db, id)
    const group = (id, initiatorId, eventDate, claimed) => {
      db.addGroup({ id, initiatorId, eventDate, createdAt: daysAgo(MON_10, 20) })
      db.addTask(id, `t-${id}`, { createdAt: daysAgo(MON_10, 19) })
      if (claimed) db.addClaim(id, `t-${id}`)
    }
    group('g1', 'u1', '2026-09-19', true) // Saturday event, claimed → mailed Monday
    group('g2', 'u2', '2026-09-19', false) // nobody claimed anything
    group('g3', 'u3', null, true) // no event date
    group('g4', 'u4', '2026-09-21', true) // event is today
    group('g5', 'u5', '2026-09-19T00:00:00.000Z', true) // ISO timestamp is tolerated
    group('g6', 'u6', '2026-09-10', true) // too long ago
  }

  it('mails a Saturday event on Monday, only for real (claimed) events, once per group', async () => {
    const db = createFakeDb()
    db.enableTemplate('day_after_event')
    seedEvents(db)
    const monday = await run(db, MON_10)
    expect(recipients(monday.sent)).toEqual(['u1@example.com', 'u5@example.com'])
    expect(monday.sent[0].subject).toMatch(/^Hoe was /)
    // Tuesday: g1/g5 are not mailed again; only g4 (event on Monday) is newly due.
    const tuesday = await run(db, TUE_10)
    expect(recipients(tuesday.sent)).toEqual(['u4@example.com'])
    expect((await run(db, WED_10)).sent).toHaveLength(0)
  })
})

describe('dormant win-backs', () => {
  it('mails users who have been away 30 days, judged on lastSeenAt/createdAt and their groups', async () => {
    const db = createFakeDb()
    db.enableTemplate('dormant_30')
    db.addUser({ id: 'd1', createdAt: daysAgo(TUE_10, 100), lastSeenAt: daysAgo(TUE_10, 35) })
    db.addUser({ id: 'd2', createdAt: daysAgo(TUE_10, 100), lastSeenAt: daysAgo(TUE_10, 10) })
    db.addUser({ id: 'd3', createdAt: daysAgo(TUE_10, 100) })
    db.addUser({ id: 'd4', createdAt: daysAgo(TUE_10, 100) })
    db.addGroup({ id: 'g4', initiatorId: 'd4', createdAt: daysAgo(TUE_10, 5) }) // recent group = recent activity
    expect(recipients((await run(db, TUE_10)).sent)).toEqual(['d1@example.com', 'd3@example.com'])
  })

  it('follows up once with dormant_60, but only after dormant_30 was sent and they stayed away', async () => {
    const db = createFakeDb()
    db.enableTemplate('dormant_30')
    db.enableTemplate('dormant_60')
    const away = (id) => db.addUser({ id, createdAt: daysAgo(TUE_10, 100), lastSeenAt: daysAgo(TUE_10, 65) })
    away('e1') // dormant_30 sent 30 days ago, silent since → dormant_60
    away('e2') // dormant_30 was sent, but the user came back afterwards → no more mail
    away('e3') // never got dormant_30 → gets that first
    db.addLog({ userId: 'e1', templateId: 'dormant_30', status: 'sent', createdAt: daysAgo(TUE_10, 30) })
    db.addLog({ userId: 'e2', templateId: 'dormant_30', status: 'sent', createdAt: daysAgo(TUE_10, 70) })

    const { sent } = await run(db, TUE_10)
    expect(recipients(sent)).toEqual(['e1@example.com', 'e3@example.com'])
    expect(sent.find((m) => m.to === 'e1@example.com').subject).toBe('Nog iets te regelen, Anna?')
    expect(sent.find((m) => m.to === 'e3@example.com').subject).toBe('We missen je bij Wie-Doet-Het')
  })

  it('never sends dormant_60 without a sent dormant_30', async () => {
    const db = createFakeDb()
    db.enableTemplate('dormant_60')
    db.addUser({ id: 'e1', createdAt: daysAgo(TUE_10, 100), lastSeenAt: daysAgo(TUE_10, 65) })
    expect((await run(db, TUE_10)).sent).toHaveLength(0)
  })
})

describe('who never gets lifecycle mail', () => {
  it('skips opted-out users and admins', async () => {
    const db = createFakeDb()
    db.enableTemplate('no_tasks')
    oldUser(db, 'opted-out', { mailOptOut: true })
    oldUser(db, 'admin', { role: 'admin' })
    oldUser(db, 'normal')
    for (const id of ['opted-out', 'admin', 'normal']) db.addGroup({ id: `g-${id}`, initiatorId: id, createdAt: hoursAgo(TUE_10, 30) })
    expect(recipients((await run(db, TUE_10)).sent)).toEqual(['normal@example.com'])
  })
})

describe('exactly once', () => {
  function seedOneGroup(db) {
    db.enableTemplate('no_tasks')
    oldUser(db, 'a')
    db.addGroup({ id: 'g1', initiatorId: 'a', createdAt: hoursAgo(TUE_10, 30) })
  }

  it('does not send the same mail again on a later run, and logs one sent row', async () => {
    const db = createFakeDb()
    seedOneGroup(db)
    expect((await run(db, TUE_10)).sent).toHaveLength(1)
    expect((await run(db, WED_10)).sent).toHaveLength(0)
    const rows = db.logRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ templateId: 'no_tasks', userId: 'a', groupId: 'g1', status: 'sent', attempts: 1, email: 'a@example.com' })
    expect(rows[0].sesMessageId).toBe('msg-1')
    expect(rows[0].GSI3PK).toBe('MAILLOG')
  })

  it('never retries a row that is still "sending" (at-most-once)', async () => {
    const db = createFakeDb()
    seedOneGroup(db)
    db.addLog({ userId: 'a', templateId: 'no_tasks', scopeId: 'g1', status: 'sending', groupId: 'g1', createdAt: hoursAgo(TUE_10, 1) })
    expect((await run(db, TUE_10)).sent).toHaveLength(0)
    expect(db.logRow('a', 'no_tasks', 'g1').status).toBe('sending')
  })

  it('retries a failed send on the next run, and records the success', async () => {
    const db = createFakeDb()
    seedOneGroup(db)
    const send = vi.fn().mockRejectedValueOnce(new Error('Throttling: rate exceeded')).mockResolvedValue({ messageId: 'ok-1' })
    const first = await run(db, TUE_10, {}, { sendMail: send })
    expect(first.summary).toMatchObject({ sent: 0, failed: 1 })
    expect(db.logRow('a', 'no_tasks', 'g1')).toMatchObject({ status: 'failed', attempts: 1, errorMessage: 'Throttling: rate exceeded' })

    const second = await run(db, WED_10, {}, { sendMail: send })
    expect(second.summary).toMatchObject({ sent: 1, failed: 0 })
    expect(db.logRow('a', 'no_tasks', 'g1')).toMatchObject({ status: 'sent', attempts: 2, errorMessage: null, sesMessageId: 'ok-1' })
  })

  it('gives up after 3 attempts', async () => {
    const db = createFakeDb()
    seedOneGroup(db)
    const send = vi.fn().mockRejectedValue(new Error('boom'))
    await run(db, TUE_10, {}, { sendMail: send })
    await run(db, WED_10, {}, { sendMail: send })
    await run(db, THU_10, {}, { sendMail: send })
    expect(send).toHaveBeenCalledTimes(3)
    expect(db.logRow('a', 'no_tasks', 'g1')).toMatchObject({ status: 'failed', attempts: 3 })
    await run(db, FRI_10, {}, { sendMail: send })
    expect(send).toHaveBeenCalledTimes(3)
  })
})

describe('per-run send cap', () => {
  it('sends at most LIFECYCLE_MAX_SENDS_PER_RUN, counts the rest and drips them out on later runs', async () => {
    const db = createFakeDb()
    db.enableTemplate('no_tasks')
    for (const id of ['a', 'b', 'c', 'd']) {
      oldUser(db, id)
      db.addGroup({ id: `g-${id}`, initiatorId: id, createdAt: hoursAgo(TUE_10, 30) })
    }
    const env = { ...ENV, LIFECYCLE_MAX_SENDS_PER_RUN: '2' }
    const first = await run(db, TUE_10, {}, { env })
    expect(first.summary).toMatchObject({ sent: 2, skippedByCap: 2 })
    const second = await run(db, WED_10, {}, { env })
    expect(second.summary).toMatchObject({ sent: 2, skippedByCap: 0 })
    expect(db.logRows()).toHaveLength(4)
  })
})

describe('candidate bound', () => {
  it('stops at the per-source bound and logs a warning', async () => {
    const db = createFakeDb()
    for (let i = 0; i < 5; i += 1) db.addUser({ id: `u${i}`, createdAt: hoursAgo(TUE_10, 10 + i) })
    const warn = vi.fn()
    const ctx = createContext({ now: TUE_10, db, maxCandidates: 2, warn, configs: {} })
    const found = []
    for await (const candidate of EVALUATORS.welcome.candidates(ctx)) found.push(candidate)
    expect(found).toHaveLength(2)
    expect(warn).toHaveBeenCalledWith('candidate-bound-reached', expect.objectContaining({ partition: 'USER', bound: 2 }))
  })
})

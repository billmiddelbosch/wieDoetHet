import { http, HttpResponse, delay } from 'msw'
import { db, nextId, tokenForUser } from './data.js'

const BASE = '/api'
const LAG = 300 // simulated network delay in ms

// Helper: resolve the logged-in user from the Authorization header
function resolveUser(request) {
  const auth = request.headers.get('Authorization') ?? ''
  const token = auth.replace('Bearer ', '')
  if (!token) return null
  return db.users.find((u) => tokenForUser(u.id) === token) ?? null
}

// Helper: strip sensitive fields before sending a user object
function safeUser(u) {
  // eslint-disable-next-line no-unused-vars
  const { password, ...rest } = u
  return rest
}

// Helper: 403 for a resolved-but-non-admin caller (mirrors requireAdmin() in wiedoethet-admin)
function requireAdmin(request) {
  const user = resolveUser(request)
  if (!user) return { error: HttpResponse.json({ message: 'Niet ingelogd' }, { status: 401 }) }
  if (user.role !== 'admin') return { error: HttpResponse.json({ message: 'Geen toegang' }, { status: 403 }) }
  return { user }
}

// Helper: groupCount + lastActivityAt for an AdminUserSummary/AdminUserDetail
function enrichAdminUser(user) {
  const groups = db.groups.filter((g) => g.initiatorId === user.id)
  const lastActivityAt = groups.reduce(
    (latest, g) => (g.createdAt > latest ? g.createdAt : latest),
    user.createdAt,
  )
  return { groupCount: groups.length, lastActivityAt }
}

// Helper: initiatorName/initiatorEmail/taskCount/memberCount for an AdminGroupSummary/AdminGroupDetail
function enrichAdminGroup(group) {
  const initiator = db.users.find((u) => u.id === group.initiatorId)
  const taskCount = db.tasks.filter((t) => t.groupId === group.id).length
  const memberCount = new Set(
    db.claims.filter((c) => c.groupId === group.id).map((c) => c.userId ?? c.sessionId),
  ).size
  return {
    initiatorName: initiator?.name ?? 'Onbekend',
    initiatorEmail: initiator?.email ?? '',
    taskCount,
    memberCount,
  }
}

export const handlers = [
  // ─── AUTH ────────────────────────────────────────────────────────────────

  http.post(`${BASE}/auth/login`, async ({ request }) => {
    await delay(LAG)
    const { email, password } = await request.json()
    const user = db.users.find((u) => u.email === email && u.password === password)
    if (!user) {
      return HttpResponse.json({ message: 'Ongeldig e-mailadres of wachtwoord' }, { status: 401 })
    }
    return HttpResponse.json({ token: tokenForUser(user.id), user: safeUser(user) })
  }),

  http.post(`${BASE}/auth/register`, async ({ request }) => {
    await delay(LAG)
    const { name, email, password } = await request.json()
    if (db.users.find((u) => u.email === email)) {
      return HttpResponse.json({ message: 'E-mailadres al in gebruik' }, { status: 409 })
    }
    const user = { id: nextId(), name, email, password, avatarUrl: null, role: 'user', createdAt: new Date().toISOString() }
    db.users.push(user)
    return HttpResponse.json({ token: tokenForUser(user.id), user: safeUser(user) }, { status: 201 })
  }),

  http.get(`${BASE}/auth/me`, async ({ request }) => {
    await delay(LAG)
    const user = resolveUser(request)
    if (!user) return HttpResponse.json({ message: 'Niet ingelogd' }, { status: 401 })
    return HttpResponse.json(safeUser(user))
  }),

  // ─── GROUPS ──────────────────────────────────────────────────────────────

  http.get(`${BASE}/groups`, async ({ request }) => {
    await delay(LAG)
    const user = resolveUser(request)
    if (!user) return HttpResponse.json({ message: 'Niet ingelogd' }, { status: 401 })
    const groups = db.groups.filter((g) => g.initiatorId === user.id)
    return HttpResponse.json(groups)
  }),

  http.get(`${BASE}/groups/share/:shareToken`, async ({ params }) => {
    await delay(LAG)
    const group = db.groups.find((g) => g.shareToken === params.shareToken)
    if (!group) return HttpResponse.json({ message: 'Groep niet gevonden' }, { status: 404 })
    return HttpResponse.json(group)
  }),

  http.get(`${BASE}/groups/:id`, async ({ request, params }) => {
    await delay(LAG)
    const user = resolveUser(request)
    const group = db.groups.find((g) => g.id === params.id)
    if (!group) return HttpResponse.json({ message: 'Groep niet gevonden' }, { status: 404 })
    if (user?.id !== group.initiatorId) {
      return HttpResponse.json({ message: 'Geen toegang' }, { status: 403 })
    }
    return HttpResponse.json(group)
  }),

  http.post(`${BASE}/groups`, async ({ request }) => {
    await delay(LAG)
    const user = resolveUser(request)
    if (!user) return HttpResponse.json({ message: 'Niet ingelogd' }, { status: 401 })
    const body = await request.json()
    const group = {
      id: nextId(),
      initiatorId: user.id,
      shareToken: `tok-${nextId()}`,
      requireTaskSelection: body.requireTaskSelection ?? true,
      scorecardVisibility: body.scorecardVisibility ?? 'all',
      scorecardViewerIds: body.scorecardViewerIds ?? [],
      reminderAt: body.reminderAt ?? null,
      pictureUrl: body.pictureUrl ?? null,
      createdAt: new Date().toISOString(),
      ...body,
    }
    db.groups.push(group)
    return HttpResponse.json(group, { status: 201 })
  }),

  http.patch(`${BASE}/groups/:id`, async ({ request, params }) => {
    await delay(LAG)
    const user = resolveUser(request)
    const idx = db.groups.findIndex((g) => g.id === params.id)
    if (idx === -1) return HttpResponse.json({ message: 'Groep niet gevonden' }, { status: 404 })
    if (user?.id !== db.groups[idx].initiatorId) {
      return HttpResponse.json({ message: 'Geen toegang' }, { status: 403 })
    }
    const body = await request.json()
    db.groups[idx] = { ...db.groups[idx], ...body }
    return HttpResponse.json(db.groups[idx])
  }),

  http.delete(`${BASE}/groups/:id`, async ({ request, params }) => {
    await delay(LAG)
    const user = resolveUser(request)
    const idx = db.groups.findIndex((g) => g.id === params.id)
    if (idx === -1) return HttpResponse.json({ message: 'Groep niet gevonden' }, { status: 404 })
    if (user?.id !== db.groups[idx].initiatorId) {
      return HttpResponse.json({ message: 'Geen toegang' }, { status: 403 })
    }
    db.groups.splice(idx, 1)
    return new HttpResponse(null, { status: 204 })
  }),

  // ─── TASKS ───────────────────────────────────────────────────────────────

  http.get(`${BASE}/groups/:groupId/tasks`, async ({ params }) => {
    await delay(LAG)
    const tasks = db.tasks.filter((t) => t.groupId === params.groupId)
    return HttpResponse.json(tasks)
  }),

  http.post(`${BASE}/groups/:groupId/tasks`, async ({ request, params }) => {
    await delay(LAG)
    const user = resolveUser(request)
    if (!user) return HttpResponse.json({ message: 'Niet ingelogd' }, { status: 401 })
    const body = await request.json()
    const task = {
      id: nextId(),
      groupId: params.groupId,
      title: body.title,
      description: body.description ?? null,
      maxClaims: body.maxClaims !== undefined ? body.maxClaims : 1,
      order: db.tasks.filter((t) => t.groupId === params.groupId).length,
    }
    db.tasks.push(task)
    return HttpResponse.json(task, { status: 201 })
  }),

  http.patch(`${BASE}/groups/:groupId/tasks/:taskId`, async ({ request, params }) => {
    await delay(LAG)
    const idx = db.tasks.findIndex((t) => t.id === params.taskId)
    if (idx === -1) return HttpResponse.json({ message: 'Taak niet gevonden' }, { status: 404 })
    const body = await request.json()
    db.tasks[idx] = { ...db.tasks[idx], ...body }
    return HttpResponse.json(db.tasks[idx])
  }),

  http.delete(`${BASE}/groups/:groupId/tasks/:taskId`, async ({ params }) => {
    await delay(LAG)
    const idx = db.tasks.findIndex((t) => t.id === params.taskId)
    if (idx === -1) return HttpResponse.json({ message: 'Taak niet gevonden' }, { status: 404 })
    db.tasks.splice(idx, 1)
    return new HttpResponse(null, { status: 204 })
  }),

  // ─── CLAIMS ──────────────────────────────────────────────────────────────

  http.post(`${BASE}/groups/:groupId/tasks/:taskId/claim`, async ({ request, params }) => {
    await delay(LAG)
    const user = resolveUser(request)
    const body = await request.json().catch(() => ({}))
    const task = db.tasks.find((t) => t.id === params.taskId)
    if (!task) return HttpResponse.json({ message: 'Taak niet gevonden' }, { status: 404 })

    const existing = db.claims.filter((c) => c.taskId === params.taskId)
    if (task.maxClaims !== null && existing.length >= task.maxClaims) {
      return HttpResponse.json({ message: 'Taak is al vol' }, { status: 409 })
    }

    const claim = {
      id: nextId(),
      groupId: params.groupId,
      taskId: params.taskId,
      userId: user?.id ?? null,
      anonymousName: body.anonymousName ?? null,
      sessionId: body.sessionId ?? null,
      claimedAt: new Date().toISOString(),
    }
    db.claims.push(claim)
    return HttpResponse.json(claim, { status: 201 })
  }),

  http.delete(`${BASE}/groups/:groupId/tasks/:taskId/claim`, async ({ request, params }) => {
    await delay(LAG)
    const user = resolveUser(request)
    const body = await request.json().catch(() => ({}))

    const idx = db.claims.findIndex(
      (c) =>
        c.taskId === params.taskId &&
        (user ? c.userId === user.id : c.sessionId === body.sessionId)
    )
    if (idx === -1) return HttpResponse.json({ message: 'Claim niet gevonden' }, { status: 404 })
    db.claims.splice(idx, 1)
    return new HttpResponse(null, { status: 204 })
  }),

  http.get(`${BASE}/groups/:groupId/claims`, async ({ params }) => {
    await delay(LAG)
    const claims = db.claims.filter((c) => c.groupId === params.groupId)
    // Enrich with task title for the scorecard
    const enriched = claims.map((c) => {
      const task = db.tasks.find((t) => t.id === c.taskId)
      const claimedBy = c.userId
        ? db.users.find((u) => u.id === c.userId)?.name ?? 'Onbekend'
        : c.anonymousName ?? 'Anoniem'
      return { ...c, taskTitle: task?.title ?? '?', claimedByName: claimedBy }
    })
    return HttpResponse.json(enriched)
  }),

  // ─── ADMIN ───────────────────────────────────────────────────────────────

  http.get(`${BASE}/admin/stats`, async ({ request }) => {
    await delay(LAG)
    const { error } = requireAdmin(request)
    if (error) return error

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const recentUsers = [...db.users]
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 5)
      .map(safeUser)
    const recentGroups = [...db.groups]
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 5)
      .map((g) => ({ ...g, ...enrichAdminGroup(g) }))

    return HttpResponse.json({
      totalUsers: db.users.length,
      totalGroups: db.groups.length,
      newUsersLast7d: db.users.filter((u) => u.createdAt >= sevenDaysAgo).length,
      newGroupsLast7d: db.groups.filter((g) => g.createdAt >= sevenDaysAgo).length,
      recentUsers,
      recentGroups,
      generatedAt: new Date().toISOString(),
    })
  }),

  http.get(`${BASE}/admin/users`, async ({ request }) => {
    await delay(LAG)
    const { error } = requireAdmin(request)
    if (error) return error

    const url = new URL(request.url)
    const q = (url.searchParams.get('q') ?? '').toLowerCase()
    const items = [...db.users]
      .filter((u) => !q || u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((u) => ({ ...safeUser(u), ...enrichAdminUser(u) }))

    return HttpResponse.json({ items, nextCursor: null })
  }),

  http.get(`${BASE}/admin/users/:id`, async ({ request, params }) => {
    await delay(LAG)
    const { error } = requireAdmin(request)
    if (error) return error

    const user = db.users.find((u) => u.id === params.id)
    if (!user) return HttpResponse.json({ message: 'Gebruiker niet gevonden' }, { status: 404 })

    const groups = db.groups.filter((g) => g.initiatorId === user.id)
    return HttpResponse.json({ ...safeUser(user), ...enrichAdminUser(user), groups })
  }),

  http.get(`${BASE}/admin/groups`, async ({ request }) => {
    await delay(LAG)
    const { error } = requireAdmin(request)
    if (error) return error

    const url = new URL(request.url)
    const q = (url.searchParams.get('q') ?? '').toLowerCase()
    const items = [...db.groups]
      .filter((g) => !q || g.name.toLowerCase().includes(q))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((g) => ({ ...g, ...enrichAdminGroup(g) }))

    return HttpResponse.json({ items, nextCursor: null })
  }),

  http.get(`${BASE}/admin/groups/:id`, async ({ request, params }) => {
    await delay(LAG)
    const { error } = requireAdmin(request)
    if (error) return error

    const group = db.groups.find((g) => g.id === params.id)
    if (!group) return HttpResponse.json({ message: 'Groep niet gevonden' }, { status: 404 })

    const tasks = db.tasks
      .filter((t) => t.groupId === group.id)
      .map((t) => {
        const claim = db.claims.find((c) => c.taskId === t.id)
        const claimedBy = claim
          ? (claim.userId ? db.users.find((u) => u.id === claim.userId)?.name ?? null : claim.anonymousName)
          : null
        return { ...t, claimedBy }
      })

    return HttpResponse.json({ ...group, ...enrichAdminGroup(group), tasks })
  }),
]

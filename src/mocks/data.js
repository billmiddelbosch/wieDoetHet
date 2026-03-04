// In-memory mock database — resets on page reload
import { reactive } from 'vue'

export const db = reactive({
  users: [
    {
      id: 'user-1',
      name: 'Test Gebruiker',
      email: 'test@wiedoehet.nl',
      password: 'test1234',
      avatarUrl: null,
    },
    {
      id: 'user-2',
      name: 'Anna de Vries',
      email: 'anna@example.nl',
      password: 'test1234',
      avatarUrl: null,
    },
  ],

  groups: [
    {
      id: 'group-1',
      name: 'Buurtbarbecue 2026',
      pictureUrl: null,
      shareToken: 'tok-bbq-2026',
      initiatorId: 'user-1',
      requireTaskSelection: true,
      scorecardVisibility: 'all', // 'all' | 'selected' | 'initiator'
      scorecardViewerIds: [],
      reminderAt: '2026-03-10T10:00:00Z',
      createdAt: '2026-02-15T09:00:00Z',
    },
    {
      id: 'group-2',
      name: 'Schoolreisje groep 5',
      pictureUrl: null,
      shareToken: 'tok-school-gr5',
      initiatorId: 'user-1',
      requireTaskSelection: false,
      scorecardVisibility: 'initiator',
      scorecardViewerIds: [],
      reminderAt: null,
      createdAt: '2026-02-20T14:00:00Z',
    },
  ],

  tasks: [
    // Buurtbarbecue
    {
      id: 'task-1',
      groupId: 'group-1',
      title: 'Vlees & worsten regelen',
      description: 'Ca. 20 personen. Budget €60.',
      maxClaims: 2,
      order: 0,
    },
    {
      id: 'task-2',
      groupId: 'group-1',
      title: 'Salade maken',
      description: 'Groene salade + dressing voor iedereen.',
      maxClaims: 1,
      order: 1,
    },
    {
      id: 'task-3',
      groupId: 'group-1',
      title: 'Stoelen & tafels regelen',
      description: null,
      maxClaims: 2,
      order: 2,
    },
    {
      id: 'task-4',
      groupId: 'group-1',
      title: 'Drankjes meenemen',
      description: 'Frisdrank en bier.',
      maxClaims: 3,
      order: 3,
    },
    // Schoolreisje
    {
      id: 'task-5',
      groupId: 'group-2',
      title: 'Rijden naar attractiepark',
      description: '7 kinderen + 1 begeleider per auto.',
      maxClaims: 4,
      order: 0,
    },
    {
      id: 'task-6',
      groupId: 'group-2',
      title: 'Lunches inpakken',
      description: 'Broodjes voor 28 kinderen.',
      maxClaims: 2,
      order: 1,
    },
    {
      id: 'task-7',
      groupId: 'group-2',
      title: 'EHBO-kit meenemen',
      description: null,
      maxClaims: 1,
      order: 2,
    },
  ],

  claims: [
    // Anna heeft vlees geclaimd
    {
      id: 'claim-1',
      groupId: 'group-1',
      taskId: 'task-1',
      userId: 'user-2',
      anonymousName: null,
      sessionId: null,
      claimedAt: '2026-02-16T11:00:00Z',
    },
    // Anonieme gebruiker heeft salade geclaimd
    {
      id: 'claim-2',
      groupId: 'group-1',
      taskId: 'task-2',
      userId: null,
      anonymousName: 'Klaas Bakker',
      sessionId: 'anon-session-abc',
      claimedAt: '2026-02-17T08:30:00Z',
    },
  ],
})

let _nextId = 100
export function nextId() {
  return `gen-${++_nextId}`
}

export const TEST_TOKEN = 'mock-jwt-token-test-gebruiker'

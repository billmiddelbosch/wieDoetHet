/**
 * E2E tests — WhatsApp Reminder (S-02)
 *
 * Tests the ReminderSection UI in:
 *   - GroupSettingsView (group-scoped reminder)
 *   - TaskFormModal edit mode (task-scoped reminder)
 *
 * All API calls are intercepted — no real backend needed.
 */

const mockUser = { id: 'user-1', name: 'Jan de Vries', email: 'jan@example.nl', phoneNumber: '+31612345678' }
const mockUserNoPhone = { ...mockUser, phoneNumber: null }
const mockGroup = {
  id: 'group-1',
  name: 'Sinterklaas 2026',
  shareToken: 'tok-abc123',
  initiatorId: 'user-1',
  taskCount: 1,
  memberCount: 0,
  scorecardVisibility: 'all',
  requireTaskSelection: false,
}

// Tomorrow at noon, as a datetime-local value (no seconds)
const tomorrow = new Date(Date.now() + 86_400_000)
const tomorrowLocal = tomorrow.toISOString().slice(0, 16) // 'YYYY-MM-DDTHH:MM'
const tomorrowIso = tomorrow.toISOString()

function seedAuth(user = mockUser) {
  localStorage.setItem('auth_token', 'fake-token')
  cy.intercept('GET', '**/auth/me', { statusCode: 200, body: user }).as('me')
}

function interceptGroupSettings(group = mockGroup) {
  cy.intercept('GET', `**/groups/${group.id}`, { statusCode: 200, body: group }).as('group')
  cy.intercept('PATCH', `**/groups/${group.id}`, { statusCode: 200, body: group }).as('updateGroup')
}

function interceptNoReminder(scope = 'group', id = 'group-1') {
  cy.intercept('GET', `**/reminders/${scope}/${id}`, {
    statusCode: 200,
    body: { scope, id, scheduledAt: null, status: 'none' },
  }).as(`getReminder-${scope}`)
}

function interceptScheduledReminder(scope = 'group', id = 'group-1') {
  cy.intercept('GET', `**/reminders/${scope}/${id}`, {
    statusCode: 200,
    body: { scope, scopeId: id, scheduledAt: tomorrowIso, status: 'scheduled', ruleName: `wdh-reminder-${scope}-${id}` },
  }).as(`getReminder-${scope}`)
}

// ─── Group Settings — ReminderSection ────────────────────────────────────────

describe('GroupSettingsView — ReminderSection', () => {
  describe('initiator with phone number', () => {
    beforeEach(() => {
      seedAuth(mockUser)
      interceptGroupSettings()
      interceptNoReminder('group', 'group-1')
      cy.visit('/groups/group-1/settings')
      cy.wait('@group')
      cy.wait('@me')
    })

    afterEach(() => {
      cy.window().then((win) => win.localStorage.removeItem('auth_token'))
    })

    it('renders the collapsed Herinnering section', () => {
      cy.contains('Herinnering').should('be.visible')
    })

    it('expands the section when clicked', () => {
      cy.contains('button', 'Herinnering').click()
      cy.contains('Stuur herinnering op').should('be.visible')
    })

    it('shows the hint text when expanded', () => {
      cy.contains('button', 'Herinnering').click()
      cy.contains('WhatsApp-bericht').should('be.visible')
    })

    it('shows validation error when saving without a datetime', () => {
      cy.contains('button', 'Herinnering').click()
      cy.contains('button', 'Herinnering instellen').click()
      cy.contains('Kies een datum en tijd in de toekomst').should('be.visible')
    })

    it('schedules a reminder successfully', () => {
      cy.intercept('POST', '**/reminders', {
        statusCode: 201,
        body: {
          scope: 'group',
          scopeId: 'group-1',
          scheduledAt: tomorrowIso,
          status: 'scheduled',
          ruleName: 'wdh-reminder-group-group-1',
        },
      }).as('scheduleReminder')

      cy.contains('button', 'Herinnering').click()
      cy.get('#reminder-datetime').type(tomorrowLocal)
      cy.contains('button', 'Herinnering instellen').click()
      cy.wait('@scheduleReminder')

      // Should now show the scheduled state with cancel button
      cy.contains('Ingepland voor').should('be.visible')
      cy.contains('button', 'Herinnering annuleren').should('be.visible')
    })

    it('shows error alert when schedule API fails', () => {
      cy.intercept('POST', '**/reminders', {
        statusCode: 500,
        body: { message: 'Serverfout' },
      }).as('scheduleReminder')

      cy.contains('button', 'Herinnering').click()
      cy.get('#reminder-datetime').type(tomorrowLocal)
      cy.contains('button', 'Herinnering instellen').click()
      cy.wait('@scheduleReminder')

      cy.contains('Herinnering kon niet worden ingesteld').should('be.visible')
      // Section should not show scheduled state
      cy.contains('Ingepland voor').should('not.exist')
    })
  })

  describe('initiator without phone number', () => {
    beforeEach(() => {
      seedAuth(mockUserNoPhone)
      interceptGroupSettings()
      interceptNoReminder('group', 'group-1')
      cy.visit('/groups/group-1/settings')
      cy.wait('@group')
      cy.wait('@me')
    })

    afterEach(() => {
      cy.window().then((win) => win.localStorage.removeItem('auth_token'))
    })

    it('shows the phone number gate prompt when expanded', () => {
      cy.contains('button', 'Herinnering').click()
      cy.contains('telefoonnummer').should('be.visible')
      cy.contains('Ga naar profiel').should('be.visible')
    })

    it('does not show the datetime picker', () => {
      cy.contains('button', 'Herinnering').click()
      cy.get('#reminder-datetime').should('not.exist')
    })

    it('"Ga naar profiel" link includes a redirect param back to the current page', () => {
      cy.contains('button', 'Herinnering').click()
      cy.contains('a', 'Ga naar profiel')
        .should('have.attr', 'href')
        .and('include', '/profile?redirect=')
        .and('include', 'group-1')
    })
  })

  describe('existing scheduled reminder', () => {
    beforeEach(() => {
      seedAuth(mockUser)
      interceptGroupSettings()
      interceptScheduledReminder('group', 'group-1')
      cy.visit('/groups/group-1/settings')
      cy.wait('@group')
      cy.wait('@me')
    })

    afterEach(() => {
      cy.window().then((win) => win.localStorage.removeItem('auth_token'))
    })

    it('shows "Ingepland" badge on the collapsed header', () => {
      cy.contains('Ingepland').should('be.visible')
    })

    it('shows cancel button when expanded', () => {
      cy.contains('button', 'Herinnering').click()
      cy.contains('button', 'Herinnering annuleren').should('be.visible')
    })

    it('cancels reminder successfully', () => {
      cy.intercept('DELETE', '**/reminders/group/group-1', { statusCode: 204 }).as('cancelReminder')

      cy.contains('button', 'Herinnering').click()
      cy.contains('button', 'Herinnering annuleren').click()
      cy.wait('@cancelReminder')

      // Badge should be gone and form should appear
      cy.contains('Stuur herinnering op').should('be.visible')
    })

    it('shows error alert when cancel API fails', () => {
      cy.intercept('DELETE', '**/reminders/group/group-1', {
        statusCode: 500,
        body: { message: 'Kan herinnering niet annuleren' },
      }).as('cancelReminder')

      cy.contains('button', 'Herinnering').click()
      cy.contains('button', 'Herinnering annuleren').click()
      cy.wait('@cancelReminder')

      cy.contains('Herinnering kon niet worden geannuleerd').should('be.visible')
      // Cancel button should still be there — reminder preserved
      cy.contains('button', 'Herinnering annuleren').should('be.visible')
    })
  })
})

// ─── Group settings — reminder does not affect primary save ──────────────────

describe('GroupSettingsView — reminder section is independent of settings form', () => {
  beforeEach(() => {
    seedAuth(mockUser)
    interceptGroupSettings()
    interceptNoReminder('group', 'group-1')
    cy.visit('/groups/group-1/settings')
    cy.wait('@group')
    cy.wait('@me')
  })

  afterEach(() => {
    cy.window().then((win) => win.localStorage.removeItem('auth_token'))
  })

  it('saving settings does not trigger reminder API', () => {
    cy.intercept('POST', '**/reminders').as('reminderPost')
    cy.get('form').submit()
    cy.wait('@updateGroup')
    cy.get('@reminderPost.all').should('have.length', 0)
  })
})

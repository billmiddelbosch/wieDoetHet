/**
 * E2E tests for the lifecycle mail automation in the Admin Section.
 * Specs: product/specs/mail-automation.spec.md (UI) and
 *        product/specs/mail-automation-api.spec.md (API contract).
 *
 * Written BEFORE the implementation (spec-first) — these define the expected
 * behaviour and will fail until the feature is built.
 *
 * Same convention as admin.cy.js: the router's requiresAdmin guard reads
 * authStore.user, which only lives in memory. cy.visit() is a full reload and
 * wipes it, so after login every navigation uses real UI clicks.
 */

const adminUser = {
  id: 'admin-1',
  name: 'Test Admin',
  email: 'admin@wiedoehet.nl',
  role: 'admin',
  avatarUrl: null,
}
const regularUser = {
  id: 'user-9',
  name: 'Gewone Gebruiker',
  email: 'gebruiker@wiedoehet.nl',
  role: 'user',
  avatarUrl: null,
}

function login(user, password = 'password123') {
  cy.intercept('POST', '**/auth/login', {
    statusCode: 200,
    body: { token: 'fake-token', user },
  }).as('login')
  cy.intercept('GET', '**/groups', []).as('myGroups')
  cy.visit('/login')
  cy.get('#login-email').type(user.email)
  cy.get('#login-password').type(password)
  cy.get('form').submit()
  cy.wait('@login')
  cy.url().should('include', '/dashboard')
}

// ── Fixtures ────────────────────────────────────────────────────────────────

const stats = {
  totalUsers: 42,
  totalGroups: 7,
  newUsersLast7d: 3,
  newGroupsLast7d: 1,
  recentUsers: [],
  recentGroups: [],
  generatedAt: '2026-03-01T00:00:00Z',
}

// Order = API priority order (welcome … dormant_60). Display names come from i18n.
const TEMPLATE_DEFS = [
  {
    id: 'welcome',
    name: 'Welkom',
    scope: 'user',
    tier: 'immediate',
    variables: ['firstName', 'appUrl', 'createGroupUrl'],
  },
  {
    id: 'no_group',
    name: 'Nog geen groep',
    scope: 'user',
    tier: 'normal',
    variables: ['firstName', 'appUrl', 'createGroupUrl'],
  },
  {
    id: 'no_tasks',
    name: 'Groep zonder taken',
    scope: 'group',
    tier: 'timely',
    variables: ['firstName', 'appUrl', 'createGroupUrl', 'groupName', 'groupUrl'],
  },
  {
    id: 'no_claims',
    name: 'Taken zonder claims',
    scope: 'group',
    tier: 'normal',
    variables: ['firstName', 'appUrl', 'createGroupUrl', 'groupName', 'groupUrl'],
  },
  {
    id: 'day_after_event',
    name: 'Dag na het evenement',
    scope: 'group',
    tier: 'timely',
    variables: ['firstName', 'appUrl', 'createGroupUrl', 'groupName', 'groupUrl'],
  },
  {
    id: 'dormant_30',
    name: 'Inactief (30 dagen)',
    scope: 'user',
    tier: 'normal',
    variables: ['firstName', 'appUrl', 'createGroupUrl'],
  },
  {
    id: 'dormant_60',
    name: 'Inactief (60 dagen)',
    scope: 'user',
    tier: 'normal',
    variables: ['firstName', 'appUrl', 'createGroupUrl'],
  },
]

function makeTemplate(def, overrides = {}) {
  return {
    id: def.id,
    scope: def.scope,
    tier: def.tier,
    enabled: false,
    subject: `Standaard onderwerp ${def.id}`,
    bodyHtml: `<p>Standaard tekst ${def.id}</p>`,
    defaultSubject: `Standaard onderwerp ${def.id}`,
    defaultBodyHtml: `<p>Standaard tekst ${def.id}</p>`,
    isCustomised: false,
    variables: def.variables,
    updatedAt: null,
    updatedBy: null,
    ...overrides,
  }
}

const masterOn = { enabled: true, updatedAt: '2026-03-03T09:00:00Z', updatedBy: 'admin-1' }
const masterOff = { enabled: false, updatedAt: null, updatedBy: null }

const lastRunOk = {
  at: '2026-03-04T09:00:00Z',
  masterEnabled: true,
  killSwitch: false,
  dryRun: false,
  evaluated: 12,
  sent: 3,
  failed: 1,
  skippedByCap: 0,
}

function templatesResponse({ lastRun = lastRunOk, master = masterOn, overrides = {} } = {}) {
  return {
    items: TEMPLATE_DEFS.map((def) => makeTemplate(def, overrides[def.id])),
    lastRun,
    master,
  }
}

const logEntry = (n, overrides = {}) => ({
  id: `welcome:user-${n}:-`,
  templateId: 'welcome',
  userId: `user-${n}`,
  email: `gebruiker${n}@example.nl`,
  userName: `Gebruiker ${n}`,
  groupId: null,
  groupName: null,
  subject: `Welkom bij Wie-Doet-Het, Gebruiker ${n}!`,
  status: 'sent',
  attempts: 1,
  errorMessage: null,
  sesMessageId: `ses-${n}`,
  createdAt: '2026-03-04T09:00:01Z',
  sentAt: '2026-03-04T09:00:02Z',
  ...overrides,
})

const logPage1 = {
  items: [
    logEntry(1),
    logEntry(2, {
      id: 'no_claims:user-2:group-1',
      templateId: 'no_claims',
      groupId: 'group-1',
      groupName: 'Buurtbarbecue 2026',
      subject: 'Nog niemand heeft een taak gekozen in Buurtbarbecue 2026',
      status: 'failed',
      attempts: 2,
      errorMessage: 'Mailbox does not exist',
      sentAt: null,
    }),
    logEntry(3, { status: 'sending', sentAt: null }),
  ],
  nextCursor: 'log-cursor-2',
}

const logPage2 = {
  items: [logEntry(4, { subject: 'Welkom bij Wie-Doet-Het, Gebruiker 4!' })],
  nextCursor: null,
}

const usersList = {
  items: [
    {
      id: 'admin-1',
      name: 'Test Admin',
      email: 'admin@wiedoehet.nl',
      role: 'admin',
      createdAt: '2026-01-10T09:00:00Z',
      groupCount: 2,
      lastActivityAt: '2026-02-15T09:00:00Z',
      mailOptOut: false,
    },
    {
      id: 'user-9',
      name: 'Anna de Vries',
      email: 'anna@example.nl',
      role: 'user',
      createdAt: '2026-01-20T09:00:00Z',
      groupCount: 1,
      lastActivityAt: '2026-01-20T09:00:00Z',
      mailOptOut: false,
    },
  ],
  nextCursor: null,
  totalCount: 2,
}

const usersListWithOptOut = {
  ...usersList,
  items: [usersList.items[0], { ...usersList.items[1], mailOptOut: true }],
}

const userDetailSubscribed = {
  ...usersList.items[1],
  lastSeenAt: '2026-02-01T09:00:00Z',
  mailOptOut: false,
  mailOptOutAt: null,
  groups: [
    {
      id: 'group-1',
      name: 'Buurtbarbecue 2026',
      shareToken: 'tok-bbq',
      createdAt: '2026-02-15T09:00:00Z',
    },
  ],
}

const userDetailOptedOut = {
  ...userDetailSubscribed,
  mailOptOut: true,
  mailOptOutAt: '2026-03-02T09:00:00Z',
}

// ── Navigation helpers ─────────────────────────────────────────────────────

function openAutomation(response = templatesResponse()) {
  cy.intercept('GET', '**/admin/stats', stats).as('stats')
  cy.intercept('GET', '**/admin/mail-templates', response).as('templates')
  cy.get('header').contains('a', 'Admin').click()
  cy.wait('@stats')
  cy.get('nav').contains('a', 'Automatisering').click()
  cy.wait('@templates')
}

function openLog(response = logPage1) {
  cy.intercept('GET', '**/admin/mail-log*', response).as('log')
  cy.contains('a', 'Verzendlog').click()
  cy.wait('@log')
}

function openUsersList(response = usersList) {
  cy.intercept('GET', '**/admin/stats', stats).as('stats')
  cy.intercept('GET', '**/admin/users*', response).as('users')
  cy.get('header').contains('a', 'Admin').click()
  cy.wait('@stats')
  cy.get('nav').contains('a', 'Gebruikers').click()
  cy.wait('@users')
}

/** The master switch card (a <section>, so it never counts as a template <article>). */
function masterCard() {
  return cy.contains('section h2', 'Hoofdschakelaar').closest('section')
}

/** The <article> card of one template, found by its <h3> name. */
function card(name) {
  return cy
    .contains('article h3', new RegExp(`^${name.replace(/[()]/g, '\\$&')}$`))
    .closest('article')
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Admin mail automation', () => {
  describe('access control', () => {
    it('redirects an unauthenticated visitor from /admin/automation to /login', () => {
      cy.visit('/admin/automation')
      cy.url().should('include', '/login')
    })

    it('redirects an unauthenticated visitor from /admin/automation/log to /login', () => {
      cy.visit('/admin/automation/log')
      cy.url().should('include', '/login')
    })

    it('redirects an authenticated non-admin from /admin/automation to /dashboard', () => {
      login(regularUser)
      cy.visit('/admin/automation')
      cy.url().should('include', '/dashboard')
    })
  })

  describe('as admin', () => {
    beforeEach(() => login(adminUser))

    describe('templates page', () => {
      it('is reachable via the "Automatisering" sub-nav tab and shows the heading', () => {
        openAutomation()
        cy.url().should('include', '/admin/automation')
        cy.contains('h1', 'Mail-automatisering').should('be.visible')
      })

      it('lists all 7 templates in order with name, trigger, timing chip and text badge', () => {
        openAutomation()

        cy.get('article').should('have.length', 7)
        cy.get('article h3').then(($h3) => {
          expect([...$h3].map((el) => el.textContent.trim())).to.deep.equal(
            TEMPLATE_DEFS.map((d) => d.name)
          )
        })

        // Trigger sentences (per-template i18n copy)
        card('Welkom').should('contain', '30 minuten na registratie, altijd')
        card('Nog geen groep').should('contain', '48 uur na registratie, als er nog geen groep is')
        card('Groep zonder taken').should(
          'contain',
          '24 uur na het aanmaken van een groep zonder taken'
        )
        card('Taken zonder claims').should(
          'contain',
          '4 dagen na de eerste taak, als niemand een taak heeft geclaimd'
        )
        card('Dag na het evenement').should('contain', 'De dag na de evenementdatum van een groep')
        card('Inactief (30 dagen)').should('contain', '30 dagen zonder activiteit')
        card('Inactief (60 dagen)').should(
          'contain',
          '60 dagen zonder activiteit, na de 30-dagenmail'
        )

        // Timing tier chips: immediate = any time, timely = Mon–Fri, normal = Tue–Thu
        card('Welkom').should('contain', 'Direct, op elk moment')
        card('Groep zonder taken').should('contain', 'Ma–vr om 10:00')
        card('Dag na het evenement').should('contain', 'Ma–vr om 10:00')
        card('Nog geen groep').should('contain', 'Di–do om 10:00')
        card('Taken zonder claims').should('contain', 'Di–do om 10:00')
        card('Inactief (30 dagen)').should('contain', 'Di–do om 10:00')
        card('Inactief (60 dagen)').should('contain', 'Di–do om 10:00')
      })

      it('shows the enabled state per template and the customised/default badge', () => {
        openAutomation(
          templatesResponse({
            overrides: {
              welcome: { enabled: true, isCustomised: true, subject: 'Mijn eigen onderwerp' },
            },
          })
        )

        card('Welkom').find('button[role="switch"]').should('have.attr', 'aria-checked', 'true')
        card('Welkom').should('contain', 'Aangepaste tekst')

        card('Nog geen groep')
          .find('button[role="switch"]')
          .should('have.attr', 'aria-checked', 'false')
        card('Nog geen groep').should('contain', 'Standaardtekst')
        card('Nog geen groep').should('not.contain', 'Aangepaste tekst')
      })

      it('shows a warning when the automation has never run', () => {
        openAutomation(templatesResponse({ lastRun: null }))
        cy.contains('De automatisering heeft nog nooit gedraaid.').should('be.visible')
      })

      it('shows the master switch as off with an explanation', () => {
        openAutomation(
          templatesResponse({
            master: masterOff,
            lastRun: { ...lastRunOk, masterEnabled: false },
          })
        )
        masterCard().find('button[role="switch"]').should('have.attr', 'aria-checked', 'false')
        masterCard().should(
          'contain',
          'De hoofdschakelaar staat uit — er worden geen mails verstuurd, ook niet voor ingeschakelde templates.'
        )
        cy.contains('De automatisering heeft nog nooit gedraaid.').should('not.exist')
      })

      it('shows the master switch as on', () => {
        openAutomation()
        masterCard().find('button[role="switch"]').should('have.attr', 'aria-checked', 'true')
        masterCard().should('contain', 'De hoofdschakelaar staat aan')
        masterCard().should('not.contain', 'De hoofdschakelaar staat uit')
      })

      it('shows the last run and no never-ran warning after a normal run', () => {
        openAutomation()
        cy.contains('De automatisering heeft nog nooit gedraaid.').should('not.exist')
        cy.contains('Laatste run:').should('be.visible')
      })

      it('warns when the emergency stop on the server overrides the master switch', () => {
        openAutomation(
          templatesResponse({ lastRun: { ...lastRunOk, masterEnabled: false, killSwitch: true } })
        )
        masterCard().should('contain', 'De noodstop op de server')
      })

      it('shows no emergency-stop warning after a normal run', () => {
        openAutomation()
        cy.contains('De noodstop op de server').should('not.exist')
      })

      it('shows an error message when loading the templates fails', () => {
        cy.intercept('GET', '**/admin/stats', stats).as('stats')
        cy.intercept('GET', '**/admin/mail-templates', {
          statusCode: 500,
          body: { message: 'Server error' },
        }).as('templates')
        cy.get('header').contains('a', 'Admin').click()
        cy.wait('@stats')
        cy.get('nav').contains('a', 'Automatisering').click()
        cy.wait('@templates')

        cy.contains('Templates laden mislukt.').should('be.visible')
        cy.get('article').should('not.exist')
      })
    })

    describe('enabling and disabling a template', () => {
      it('sends PATCH { enabled: true } and reflects the server response', () => {
        openAutomation()
        cy.intercept('PATCH', '**/admin/mail-templates/welcome', (req) => {
          req.reply(
            makeTemplate(TEMPLATE_DEFS[0], {
              enabled: true,
              updatedAt: '2026-03-04T10:00:00Z',
              updatedBy: 'admin-1',
            })
          )
        }).as('patchTemplate')

        card('Welkom')
          .find('button[role="switch"]')
          .should('have.attr', 'aria-checked', 'false')
          .click()

        cy.wait('@patchTemplate').its('request.body').should('deep.equal', { enabled: true })
        card('Welkom').find('button[role="switch"]').should('have.attr', 'aria-checked', 'true')
      })

      it('sends PATCH { enabled: false } when switching an enabled template off', () => {
        openAutomation(templatesResponse({ overrides: { no_group: { enabled: true } } }))
        cy.intercept(
          'PATCH',
          '**/admin/mail-templates/no_group',
          makeTemplate(TEMPLATE_DEFS[1], { enabled: false })
        ).as('patchTemplate')

        card('Nog geen groep').find('button[role="switch"]').click()

        cy.wait('@patchTemplate').its('request.body').should('deep.equal', { enabled: false })
        card('Nog geen groep')
          .find('button[role="switch"]')
          .should('have.attr', 'aria-checked', 'false')
      })

      it('reverts the toggle and shows an error when the request fails', () => {
        openAutomation()
        cy.intercept('PATCH', '**/admin/mail-templates/welcome', {
          statusCode: 500,
          body: { message: 'boom' },
        }).as('patchTemplate')

        card('Welkom').find('button[role="switch"]').click()
        cy.wait('@patchTemplate')

        card('Welkom').find('button[role="switch"]').should('have.attr', 'aria-checked', 'false')
        cy.contains('Wijzigen mislukt.').should('be.visible')
      })

      it('only changes the toggled template, not the others', () => {
        openAutomation()
        cy.intercept(
          'PATCH',
          '**/admin/mail-templates/dormant_30',
          makeTemplate(TEMPLATE_DEFS[5], { enabled: true })
        ).as('patchTemplate')

        card('Inactief (30 dagen)').find('button[role="switch"]').click()
        cy.wait('@patchTemplate')

        card('Inactief (30 dagen)')
          .find('button[role="switch"]')
          .should('have.attr', 'aria-checked', 'true')
        card('Inactief (60 dagen)')
          .find('button[role="switch"]')
          .should('have.attr', 'aria-checked', 'false')
        card('Welkom').find('button[role="switch"]').should('have.attr', 'aria-checked', 'false')
      })
    })

    describe('the master switch', () => {
      const masterSwitch = () => masterCard().find('button[role="switch"]')

      it('asks for confirmation before switching on, then sends PATCH { enabled: true }', () => {
        openAutomation(templatesResponse({ master: masterOff, overrides: { welcome: { enabled: true } } }))
        cy.intercept('PATCH', '**/admin/mail-master', (req) => {
          req.reply({ enabled: true, updatedAt: '2026-03-05T09:00:00Z', updatedBy: 'admin-1' })
        }).as('patchMaster')

        masterSwitch().click()

        cy.contains('Hoofdschakelaar inschakelen?').should('be.visible')
        cy.contains('Nu ingeschakeld: 1.').should('be.visible')
        cy.get('@patchMaster.all').should('have.length', 0)

        cy.contains('button', 'Inschakelen').click()

        cy.wait('@patchMaster').its('request.body').should('deep.equal', { enabled: true })
        cy.contains('Hoofdschakelaar inschakelen?').should('not.exist')
        masterSwitch().should('have.attr', 'aria-checked', 'true')
        masterCard().should('contain', 'De hoofdschakelaar staat aan')
      })

      it('sends nothing when the confirmation is cancelled', () => {
        openAutomation(templatesResponse({ master: masterOff }))
        cy.intercept('PATCH', '**/admin/mail-master', { statusCode: 200, body: masterOn }).as(
          'patchMaster'
        )

        masterSwitch().click()
        cy.contains('button', 'Annuleren').click()

        cy.contains('Hoofdschakelaar inschakelen?').should('not.exist')
        masterSwitch().should('have.attr', 'aria-checked', 'false')
        cy.get('@patchMaster.all').should('have.length', 0)
      })

      it('switches off immediately, without a confirmation', () => {
        openAutomation()
        cy.intercept('PATCH', '**/admin/mail-master', (req) => {
          req.reply({ enabled: false, updatedAt: '2026-03-05T09:00:00Z', updatedBy: 'admin-1' })
        }).as('patchMaster')

        masterSwitch().click()

        cy.wait('@patchMaster').its('request.body').should('deep.equal', { enabled: false })
        cy.contains('Hoofdschakelaar inschakelen?').should('not.exist')
        masterSwitch().should('have.attr', 'aria-checked', 'false')
        masterCard().should('contain', 'De hoofdschakelaar staat uit')
      })

      it('keeps the switch as it was and shows an error when the request fails', () => {
        openAutomation(templatesResponse({ master: masterOff }))
        cy.intercept('PATCH', '**/admin/mail-master', {
          statusCode: 500,
          body: { message: 'Server error' },
        }).as('patchMaster')

        masterSwitch().click()
        cy.contains('button', 'Inschakelen').click()
        cy.wait('@patchMaster')

        masterSwitch().should('have.attr', 'aria-checked', 'false')
        cy.contains('Wijzigen mislukt.').should('be.visible')
      })

      it('does not change any template when the master switch is toggled', () => {
        openAutomation(templatesResponse({ overrides: { welcome: { enabled: true } } }))
        cy.intercept('PATCH', '**/admin/mail-master', {
          statusCode: 200,
          body: { enabled: false, updatedAt: '2026-03-05T09:00:00Z', updatedBy: 'admin-1' },
        }).as('patchMaster')

        masterSwitch().click()
        cy.wait('@patchMaster')

        card('Welkom').find('button[role="switch"]').should('have.attr', 'aria-checked', 'true')
      })
    })

    describe('editing a template text', () => {
      function openEditor(name = 'Welkom') {
        openAutomation()
        card(name).contains('button', 'Bewerken').click()
        cy.contains('Template bewerken').should('be.visible')
      }

      it('opens the modal pre-filled, lists the allowed fields and shows the fixed-footer note', () => {
        openEditor('Groep zonder taken')

        cy.get('#template-subject').should('have.value', 'Standaard onderwerp no_tasks')
        cy.get('.ProseMirror').should('contain', 'Standaard tekst no_tasks')

        cy.contains('Beschikbare velden:').should('be.visible')
        cy.contains('{{firstName}}').should('be.visible')
        cy.contains('{{groupName}}').should('be.visible')
        cy.contains('{{groupUrl}}').should('be.visible')

        // The modal body scrolls, so the note can sit below the fold on a short viewport.
        cy.contains(
          'De voettekst met de uitnodiging voor suggesties en de uitleg over afmelden wordt automatisch onder elke mail geplaatst.'
        )
          .scrollIntoView()
          .should('be.visible')
      })

      it('lists only the allowed fields for a user-scoped template', () => {
        openEditor('Welkom')

        cy.contains('{{firstName}}').should('be.visible')
        cy.contains('{{createGroupUrl}}').should('be.visible')
        cy.contains('{{groupName}}').should('not.exist')
      })

      it('closes without sending anything when cancelled', () => {
        openEditor()
        cy.intercept('PATCH', '**/admin/mail-templates/*', { statusCode: 200, body: {} }).as(
          'patchTemplate'
        )

        cy.contains('button', 'Annuleren').click()

        cy.contains('Template bewerken').should('not.exist')
        cy.get('@patchTemplate.all').should('have.length', 0)
      })

      it('shows validation errors for an empty subject and empty body, and sends nothing', () => {
        openEditor()
        cy.intercept('PATCH', '**/admin/mail-templates/*', { statusCode: 200, body: {} }).as(
          'patchTemplate'
        )

        cy.get('#template-subject').clear()
        cy.get('.ProseMirror').clear()
        cy.contains('button', /^Opslaan$/).click()

        cy.contains('Onderwerp is verplicht.').should('be.visible')
        cy.contains('Tekst is verplicht.').should('be.visible')
        cy.get('@patchTemplate.all').should('have.length', 0)
      })

      it('saves a customised subject and body and marks the card as customised', () => {
        openEditor()
        cy.intercept('PATCH', '**/admin/mail-templates/welcome', (req) => {
          req.reply(
            makeTemplate(TEMPLATE_DEFS[0], {
              isCustomised: true,
              subject: req.body.subject,
              bodyHtml: req.body.bodyHtml,
              updatedAt: '2026-03-04T10:00:00Z',
              updatedBy: 'admin-1',
            })
          )
        }).as('patchTemplate')

        cy.get('#template-subject')
          .clear()
          .type('Hoi {{firstName}}, welkom!', { parseSpecialCharSequences: false })
        cy.get('.ProseMirror').clear().type('Mijn eigen welkomsttekst.')
        cy.contains('button', /^Opslaan$/).click()

        cy.wait('@patchTemplate')
          .its('request.body')
          .then((body) => {
            expect(body.subject).to.equal('Hoi {{firstName}}, welkom!')
            expect(body.bodyHtml).to.contain('Mijn eigen welkomsttekst.')
            expect(body).to.not.have.property('enabled')
          })

        cy.contains('Template bewerken').should('not.exist')
        card('Welkom').should('contain', 'Aangepaste tekst')
      })

      it('shows the server validation message verbatim and keeps the modal open', () => {
        openEditor()
        cy.intercept('PATCH', '**/admin/mail-templates/welcome', {
          statusCode: 400,
          body: { message: 'Onbekend of niet toegestaan veld: {{groupName}}' },
        }).as('patchTemplate')

        cy.get('#template-subject')
          .clear()
          .type('Hoi {{groupName}}', { parseSpecialCharSequences: false })
        cy.contains('button', /^Opslaan$/).click()
        cy.wait('@patchTemplate')

        cy.contains('Onbekend of niet toegestaan veld: {{groupName}}').should('be.visible')
        cy.contains('Template bewerken').should('be.visible')
        card('Welkom').should('not.contain', 'Aangepaste tekst')
      })

      it('disables "Terug naar standaardtekst" when the template is not customised', () => {
        openEditor()
        cy.contains('button', 'Terug naar standaardtekst').should('be.disabled')
      })

      it('resets a customised template to the default text by sending null overrides', () => {
        openAutomation(
          templatesResponse({
            overrides: {
              welcome: {
                isCustomised: true,
                subject: 'Eigen onderwerp',
                bodyHtml: '<p>Eigen tekst</p>',
              },
            },
          })
        )
        cy.intercept(
          'PATCH',
          '**/admin/mail-templates/welcome',
          makeTemplate(TEMPLATE_DEFS[0], { isCustomised: false })
        ).as('patchTemplate')

        card('Welkom').contains('button', 'Bewerken').click()
        cy.get('#template-subject').should('have.value', 'Eigen onderwerp')

        cy.contains('button', 'Terug naar standaardtekst').should('not.be.disabled').click()

        cy.wait('@patchTemplate')
          .its('request.body')
          .should('deep.equal', { subject: null, bodyHtml: null })
        cy.get('#template-subject').should('have.value', 'Standaard onderwerp welcome')
        cy.get('.ProseMirror').should('contain', 'Standaard tekst welcome')
      })

      it('sends a test mail to the admin and shows the result without closing the modal', () => {
        openEditor()
        cy.intercept('POST', '**/admin/mail-templates/welcome/test', {
          sent: true,
          to: 'admin@wiedoehet.nl',
        }).as('testMail')

        cy.contains('button', 'Testmail naar mezelf').click()

        cy.wait('@testMail')
        cy.contains('Testmail verstuurd naar admin@wiedoehet.nl.').should('be.visible')
        cy.contains('Template bewerken').should('be.visible')
      })

      it('shows the error message when the test mail fails', () => {
        openEditor()
        cy.intercept('POST', '**/admin/mail-templates/welcome/test', {
          statusCode: 502,
          body: { message: 'E-mail versturen mislukt.' },
        }).as('testMail')

        cy.contains('button', 'Testmail naar mezelf').click()
        cy.wait('@testMail')

        cy.contains('E-mail versturen mislukt.').should('be.visible')
      })
    })

    describe('sent-mail log', () => {
      it('is reachable via the in-page "Verzendlog" tab and lists entries with status badges', () => {
        openAutomation()
        openLog()

        cy.url().should('include', '/admin/automation/log')
        cy.contains('h1', 'Verzendlog').should('be.visible')

        cy.contains('th', 'Verzonden op').should('be.visible')
        cy.contains('th', 'Ontvanger').should('be.visible')
        cy.contains('th', 'Template').should('be.visible')
        cy.contains('th', 'Onderwerp').should('be.visible')
        cy.contains('th', 'Status').should('be.visible')
        cy.contains('th', 'Pogingen').should('be.visible')

        cy.contains('td', 'gebruiker1@example.nl').should('be.visible')
        cy.contains('tr', 'gebruiker1@example.nl')
          .should('contain', 'Verzonden')
          .and('contain', 'Welkom')
        cy.contains('tr', 'gebruiker2@example.nl').should('contain', 'Mislukt')
        cy.contains('tr', 'gebruiker3@example.nl').should('contain', 'Bezig')
      })

      it('shows the group name for group-scoped rows and the error message for failed rows', () => {
        openAutomation()
        openLog()

        cy.contains('tr', 'gebruiker2@example.nl').within(() => {
          cy.contains('Taken zonder claims').should('be.visible')
          cy.contains('Buurtbarbecue 2026').should('be.visible')
          cy.contains('Mailbox does not exist').should('be.visible')
        })
      })

      it('requests the first page with a limit and no empty filter params', () => {
        openAutomation()
        cy.intercept('GET', '**/admin/mail-log*', logPage1).as('log')
        cy.contains('a', 'Verzendlog').click()

        cy.wait('@log')
          .its('request.url')
          .then((url) => {
            expect(url).to.include('limit=')
            expect(url).to.not.include('templateId=')
            expect(url).to.not.include('status=')
            expect(url).to.not.include('q=')
            expect(url).to.not.include('cursor=')
          })
      })

      it('filters by template and by status', () => {
        openAutomation()
        openLog()

        cy.intercept('GET', '**/admin/mail-log*templateId=no_claims*', {
          items: [logPage1.items[1]],
          nextCursor: null,
        }).as('logByTemplate')
        cy.get('#log-template').select('Taken zonder claims')
        cy.wait('@logByTemplate').its('request.url').should('include', 'templateId=no_claims')
        cy.contains('td', 'gebruiker2@example.nl').should('be.visible')
        cy.contains('td', 'gebruiker1@example.nl').should('not.exist')

        cy.intercept('GET', '**/admin/mail-log*status=failed*', {
          items: [logPage1.items[1]],
          nextCursor: null,
        }).as('logByStatus')
        cy.get('#log-status').select('Mislukt')
        cy.wait('@logByStatus')
          .its('request.url')
          .then((url) => {
            expect(url).to.include('status=failed')
            expect(url).to.include('templateId=no_claims')
          })
      })

      it('filters by recipient email search', () => {
        openAutomation()
        openLog()

        cy.intercept('GET', '**/admin/mail-log*q=gebruiker4*', logPage2).as('logSearch')
        cy.get('input[placeholder="Zoek op e-mailadres..."]').type('gebruiker4')
        cy.wait('@logSearch').its('request.url').should('include', 'q=gebruiker4')
        cy.contains('td', 'gebruiker4@example.nl').should('be.visible')
      })

      it('paginates with Volgende and Vorige using the cursor', () => {
        openAutomation()
        openLog()

        cy.contains('button', 'Vorige').should('be.disabled')

        cy.intercept('GET', '**/admin/mail-log*cursor=log-cursor-2*', logPage2).as('logPage2')
        cy.contains('button', 'Volgende').click()
        cy.wait('@logPage2').its('request.url').should('include', 'cursor=log-cursor-2')
        cy.contains('td', 'gebruiker4@example.nl').should('be.visible')
        cy.contains('button', 'Volgende').should('be.disabled')

        cy.intercept('GET', '**/admin/mail-log*', logPage1).as('logBack')
        cy.contains('button', 'Vorige').click()
        cy.wait('@logBack')
        cy.contains('td', 'gebruiker1@example.nl').should('be.visible')
      })

      it('shows the empty state when nothing has been sent yet', () => {
        openAutomation()
        openLog({ items: [], nextCursor: null })

        cy.contains('Nog geen mails verstuurd').should('be.visible')
      })

      it('shows "Geen resultaten" when a filter matches nothing', () => {
        openAutomation()
        openLog()

        cy.intercept('GET', '**/admin/mail-log*status=sending*', {
          items: [],
          nextCursor: null,
        }).as('logEmpty')
        cy.get('#log-status').select('Bezig')
        cy.wait('@logEmpty')

        cy.contains('Geen resultaten').should('be.visible')
        cy.contains('Nog geen mails verstuurd').should('not.exist')
      })

      it('shows an error message when loading the log fails', () => {
        openAutomation()
        openLog({ statusCode: 500, body: { message: 'Server error' } })

        cy.contains('Verzendlog laden mislukt.').should('be.visible')
      })

      it('switches back to the templates page via the in-page "Templates" tab', () => {
        openAutomation()
        openLog()

        cy.intercept('GET', '**/admin/mail-templates', templatesResponse()).as('templatesAgain')
        cy.contains('a', 'Templates').click()
        cy.wait('@templatesAgain')

        cy.url().should('match', /\/admin\/automation$/)
        cy.contains('h1', 'Mail-automatisering').should('be.visible')
      })
    })

    describe('user opt-out', () => {
      function openUserDetail(userDetail) {
        openUsersList()
        cy.intercept('GET', '**/admin/users/user-9', userDetail).as('userDetail')
        cy.contains('anna@example.nl').click()
        cy.wait('@userDetail')
        cy.contains('E-mailvoorkeuren').should('be.visible')
      }

      function optOutToggle() {
        return cy.contains('label', 'Afgemeld voor e-mail').find('button[role="switch"]')
      }

      it('shows that a subscribed user receives emails', () => {
        openUserDetail(userDetailSubscribed)

        cy.contains('Deze gebruiker ontvangt e-mails.').should('be.visible')
        cy.contains('Ontvangt geen automatische mails en geen beheerdersmails meer.').should(
          'be.visible'
        )
        optOutToggle().should('have.attr', 'aria-checked', 'false')
      })

      it('shows the opt-out date for an opted-out user', () => {
        openUserDetail(userDetailOptedOut)

        cy.contains('Deze gebruiker is afgemeld voor e-mail sinds').should('be.visible')
        optOutToggle().should('have.attr', 'aria-checked', 'true')
      })

      it('opts a user out immediately with PATCH { optOut: true }', () => {
        openUserDetail(userDetailSubscribed)
        cy.intercept('PATCH', '**/admin/users/user-9/mail-opt-out', {
          id: 'user-9',
          mailOptOut: true,
          mailOptOutAt: '2026-03-04T10:00:00Z',
        }).as('optOut')

        optOutToggle().click()

        cy.wait('@optOut').its('request.body').should('deep.equal', { optOut: true })
        cy.contains('Weer e-mails toestaan?').should('not.exist')
        optOutToggle().should('have.attr', 'aria-checked', 'true')
        cy.contains('Deze gebruiker is afgemeld voor e-mail sinds').should('be.visible')
      })

      it('asks for confirmation before re-subscribing, and does not send when cancelled', () => {
        openUserDetail(userDetailOptedOut)
        cy.intercept('PATCH', '**/admin/users/user-9/mail-opt-out', {
          statusCode: 200,
          body: {},
        }).as('optIn')

        optOutToggle().click()

        cy.contains('Weer e-mails toestaan?').should('be.visible')
        cy.contains('Doe dit alleen als de gebruiker daar zelf om heeft gevraagd.').should(
          'be.visible'
        )
        cy.contains('button', 'Annuleren').click()

        cy.contains('Weer e-mails toestaan?').should('not.exist')
        cy.get('@optIn.all').should('have.length', 0)
        optOutToggle().should('have.attr', 'aria-checked', 'true')
      })

      it('re-subscribes a user with PATCH { optOut: false } after confirming', () => {
        openUserDetail(userDetailOptedOut)
        cy.intercept('PATCH', '**/admin/users/user-9/mail-opt-out', {
          id: 'user-9',
          mailOptOut: false,
          mailOptOutAt: null,
        }).as('optIn')

        optOutToggle().click()
        cy.contains('button', 'Ja, toestaan').click()

        cy.wait('@optIn').its('request.body').should('deep.equal', { optOut: false })
        optOutToggle().should('have.attr', 'aria-checked', 'false')
        cy.contains('Deze gebruiker ontvangt e-mails.').should('be.visible')
      })

      it('reverts the toggle and shows an error when opting out fails', () => {
        openUserDetail(userDetailSubscribed)
        cy.intercept('PATCH', '**/admin/users/user-9/mail-opt-out', {
          statusCode: 500,
          body: { message: 'boom' },
        }).as('optOut')

        optOutToggle().click()
        cy.wait('@optOut')

        optOutToggle().should('have.attr', 'aria-checked', 'false')
        cy.contains('Opslaan mislukt.').should('be.visible')
      })

      it('shows an "Afgemeld" badge in the users list only for opted-out users', () => {
        openUsersList(usersListWithOptOut)

        cy.contains('tr', 'anna@example.nl').should('contain', 'Afgemeld')
        cy.contains('tr', 'admin@wiedoehet.nl').should('not.contain', 'Afgemeld')
      })
    })

    describe('manual mail respects opt-out', () => {
      it('shows how many recipients were skipped because they opted out', () => {
        openUsersList()
        cy.intercept('POST', '**/admin/mail', {
          sent: 1,
          failed: 0,
          failures: [],
          skippedOptOut: 1,
        }).as('sendMail')

        cy.contains('td', 'anna@example.nl').parent('tr').find('input[type="checkbox"]').click()
        cy.contains('td', 'admin@wiedoehet.nl').parent('tr').find('input[type="checkbox"]').click()
        cy.contains('button', 'E-mail versturen').click()

        cy.get('#mail-subject').type('Update')
        cy.get('.ProseMirror').type('Hallo allemaal.')
        cy.contains('button', /^Versturen$/).click()

        cy.wait('@sendMail')
        cy.contains('1 verstuurd, 0 mislukt.').should('be.visible')
        cy.contains('1 overgeslagen (afgemeld)').should('be.visible')
      })

      it('does not show a skipped line when nobody was skipped', () => {
        openUsersList()
        cy.intercept('POST', '**/admin/mail', {
          sent: 1,
          failed: 0,
          failures: [],
          skippedOptOut: 0,
        }).as('sendMail')

        cy.contains('td', 'anna@example.nl').parent('tr').find('input[type="checkbox"]').click()
        cy.contains('button', 'E-mail versturen').click()

        cy.get('#mail-subject').type('Update')
        cy.get('.ProseMirror').type('Hallo Anna.')
        cy.contains('button', /^Versturen$/).click()

        cy.wait('@sendMail')
        cy.contains('1 verstuurd, 0 mislukt.').should('be.visible')
        cy.contains('overgeslagen (afgemeld)').should('not.exist')
      })
    })
  })
})

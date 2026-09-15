/**
 * The router's requiresAdmin guard reads authStore.user (role), which only
 * lives in memory (see src/stores/auth.js) and is never restored on boot.
 * cy.visit() is a full page reload and wipes that in-memory state, so once
 * logged in, every navigation in this spec uses real UI clicks (RouterLink)
 * instead of cy.visit() — exactly how a real authenticated session behaves.
 */

const adminUser = { id: 'admin-1', name: 'Test Admin', email: 'admin@wiedoehet.nl', role: 'admin', avatarUrl: null }
const regularUser = { id: 'user-9', name: 'Gewone Gebruiker', email: 'gebruiker@wiedoehet.nl', role: 'user', avatarUrl: null }

function login(user, password = 'password123') {
  cy.intercept('POST', '**/auth/login', { statusCode: 200, body: { token: 'fake-token', user } }).as('login')
  cy.intercept('GET', '**/groups', []).as('myGroups')
  cy.visit('/login')
  cy.get('#login-email').type(user.email)
  cy.get('#login-password').type(password)
  cy.get('form').submit()
  cy.wait('@login')
  cy.url().should('include', '/dashboard')
}

const stats = {
  totalUsers: 42,
  totalGroups: 7,
  newUsersLast7d: 3,
  newGroupsLast7d: 1,
  recentUsers: [
    { id: 'user-9', name: 'Anna de Vries', email: 'anna@example.nl', role: 'user' },
    { id: 'admin-1', name: 'Test Admin', email: 'admin@wiedoehet.nl', role: 'admin' },
  ],
  recentGroups: [
    {
      id: 'group-1',
      name: 'Buurtbarbecue 2026',
      initiatorName: 'Test Admin',
      createdAt: '2026-02-15T09:00:00Z',
    },
  ],
  generatedAt: '2026-03-01T00:00:00Z',
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
    },
    {
      id: 'user-9',
      name: 'Anna de Vries',
      email: 'anna@example.nl',
      role: 'user',
      createdAt: '2026-01-20T09:00:00Z',
      groupCount: 0,
      lastActivityAt: '2026-01-20T09:00:00Z',
    },
  ],
  nextCursor: null,
  totalCount: 2,
}

const usersPage1 = {
  items: [usersList.items[0]],
  nextCursor: 'cursor-2',
}

const usersPage2 = {
  items: [usersList.items[1]],
  nextCursor: null,
}

const userDetail = {
  id: 'user-9',
  name: 'Anna de Vries',
  email: 'anna@example.nl',
  role: 'user',
  createdAt: '2026-01-20T09:00:00Z',
  lastActivityAt: '2026-01-20T09:00:00Z',
  groups: [
    { id: 'group-1', name: 'Buurtbarbecue 2026', shareToken: 'tok-bbq', createdAt: '2026-02-15T09:00:00Z' },
  ],
}

const groupsList = {
  items: [
    {
      id: 'group-1',
      name: 'Buurtbarbecue 2026',
      initiatorName: 'Test Admin',
      initiatorEmail: 'admin@wiedoehet.nl',
      taskCount: 4,
      memberCount: 2,
      createdAt: '2026-02-15T09:00:00Z',
    },
  ],
  nextCursor: null,
}

const groupDetail = {
  id: 'group-1',
  name: 'Buurtbarbecue 2026',
  initiatorName: 'Test Admin',
  initiatorEmail: 'admin@wiedoehet.nl',
  scorecardVisibility: 'all',
  createdAt: '2026-02-15T09:00:00Z',
  shareToken: 'tok-bbq',
  tasks: [
    { id: 'task-1', title: 'Vlees & worsten regelen', claimedBy: 'Anna de Vries' },
    { id: 'task-2', title: 'Salade maken', claimedBy: null },
    { id: 'task-3', title: 'Tafels opzetten', claimedBy: 'Jan Jansen, Piet Peters' },
  ],
}

describe('Admin section', () => {
  describe('access control', () => {
    it('redirects an unauthenticated visitor from /admin to /login', () => {
      cy.visit('/admin')
      cy.url().should('include', '/login')
    })

    it('redirects an authenticated non-admin visitor from /admin to /dashboard', () => {
      login(regularUser)
      cy.visit('/admin')
      cy.url().should('include', '/dashboard')
    })

    it('does not show an Admin link in the header for a non-admin user', () => {
      login(regularUser)
      cy.get('header').should('not.contain', 'Admin')
    })
  })

  describe('as admin', () => {
    beforeEach(() => login(adminUser))

    it('navigates to the admin dashboard via the header link and shows stats', () => {
      cy.intercept('GET', '**/admin/stats', stats).as('stats')
      cy.get('header').contains('a', 'Admin').click()
      cy.wait('@stats')
      cy.url().should('match', /\/admin$/)

      cy.contains('Admin overzicht').should('be.visible')
      cy.contains('Totaal gebruikers').should('be.visible')
      cy.contains(String(stats.totalUsers)).should('be.visible')
      cy.contains('Totaal groepen').should('be.visible')
      cy.contains(String(stats.totalGroups)).should('be.visible')
      cy.contains('Recente gebruikers').should('be.visible')
      cy.contains('Anna de Vries').should('be.visible')
      cy.contains('Recente groepen').should('be.visible')
      cy.contains('Buurtbarbecue 2026').should('be.visible')
    })

    it('sub-nav switches between dashboard, users and groups tabs', () => {
      cy.intercept('GET', '**/admin/stats', stats).as('stats')
      cy.intercept('GET', '**/admin/users*', usersList).as('users')
      cy.intercept('GET', '**/admin/groups*', groupsList).as('groupsList')

      cy.get('header').contains('a', 'Admin').click()
      cy.wait('@stats')

      cy.get('nav').contains('a', 'Gebruikers').click()
      cy.wait('@users')
      cy.url().should('include', '/admin/users')

      cy.get('nav').contains('a', 'Groepen').click()
      cy.wait('@groupsList')
      cy.url().should('include', '/admin/groups')

      cy.get('nav').contains('a', 'Overzicht').click()
      cy.wait('@stats')
      cy.url().should('match', /\/admin$/)
    })

    it('lists users and navigates to a user detail page', () => {
      cy.intercept('GET', '**/admin/stats', stats).as('stats')
      cy.intercept('GET', '**/admin/users*', usersList).as('users')
      cy.intercept('GET', '**/admin/users/user-9', userDetail).as('userDetail')

      cy.get('header').contains('a', 'Admin').click()
      cy.wait('@stats')
      cy.get('nav').contains('a', 'Gebruikers').click()
      cy.wait('@users')

      cy.contains('anna@example.nl').should('be.visible')
      cy.contains('Gebruiker').should('be.visible')

      cy.contains('anna@example.nl').click()
      cy.wait('@userDetail')
      cy.url().should('include', '/admin/users/user-9')
      cy.get('main').contains('h1', 'Anna de Vries').should('be.visible')
      cy.contains('Gestarte groepen').should('be.visible')
      cy.contains('Buurtbarbecue 2026').should('be.visible')

      cy.contains('Terug naar gebruikers').click()
      cy.wait('@users')
      cy.url().should('include', '/admin/users')
    })

    it('filters users by search query', () => {
      cy.intercept('GET', '**/admin/stats', stats).as('stats')
      cy.intercept('GET', '**/admin/users*', usersList).as('users')

      cy.get('header').contains('a', 'Admin').click()
      cy.wait('@stats')
      cy.get('nav').contains('a', 'Gebruikers').click()
      cy.wait('@users')

      cy.intercept('GET', '**/admin/users*', { items: [usersList.items[1]], nextCursor: null }).as('filteredUsers')
      cy.get('input[placeholder="Zoek op naam of e-mailadres..."]').type('anna')
      cy.wait('@filteredUsers').its('request.url').should('include', 'q=anna')
      cy.contains('anna@example.nl').should('be.visible')
      cy.contains('admin@wiedoehet.nl').should('not.exist')
    })

    it('lists groups and navigates to a group detail page', () => {
      cy.intercept('GET', '**/admin/stats', stats).as('stats')
      cy.intercept('GET', '**/admin/groups*', groupsList).as('groupsList')
      cy.intercept('GET', '**/admin/groups/group-1', groupDetail).as('groupDetail')

      cy.get('header').contains('a', 'Admin').click()
      cy.wait('@stats')
      cy.get('nav').contains('a', 'Groepen').click()
      cy.wait('@groupsList')

      cy.contains('Buurtbarbecue 2026').should('be.visible')
      cy.contains('Test Admin').should('be.visible')

      cy.contains('Buurtbarbecue 2026').click()
      cy.wait('@groupDetail')
      cy.url().should('include', '/admin/groups/group-1')
      cy.get('main').contains('h1', 'Buurtbarbecue 2026').should('be.visible')
      cy.get('main').contains('Taken').should('be.visible')
      cy.contains('Vlees & worsten regelen').should('be.visible')
      cy.contains('Anna de Vries').should('be.visible')
      cy.contains('Geclaimd').should('be.visible')
      cy.contains('Niet geclaimd').should('be.visible')

      cy.contains('Terug naar groepen').click()
      cy.wait('@groupsList')
      cy.url().should('include', '/admin/groups')
    })

    // Regression: getGroupDetail used to return claimCount but never claimedBy,
    // so every task rendered as "Niet geclaimd" regardless of actual claims.
    it('shows the correct claimed status per task on the group detail page', () => {
      cy.intercept('GET', '**/admin/stats', stats).as('stats')
      cy.intercept('GET', '**/admin/groups*', groupsList).as('groupsList')
      cy.intercept('GET', '**/admin/groups/group-1', groupDetail).as('groupDetail')

      cy.get('header').contains('a', 'Admin').click()
      cy.wait('@stats')
      cy.get('nav').contains('a', 'Groepen').click()
      cy.wait('@groupsList')
      cy.contains('Buurtbarbecue 2026').click()
      cy.wait('@groupDetail')

      cy.get('main').contains('tr', 'Vlees & worsten regelen').within(() => {
        cy.contains('Anna de Vries').should('be.visible')
        cy.contains('Geclaimd').should('be.visible')
      })

      cy.get('main').contains('tr', 'Salade maken').within(() => {
        cy.contains('—').should('be.visible')
        cy.contains('Niet geclaimd').should('be.visible')
      })

      cy.get('main').contains('tr', 'Tafels opzetten').within(() => {
        cy.contains('Jan Jansen, Piet Peters').should('be.visible')
        cy.contains('Geclaimd').should('be.visible')
      })
    })

    it('shows an error message when the stats request fails', () => {
      cy.intercept('GET', '**/admin/stats', { statusCode: 500, body: { message: 'Interne serverfout' } }).as('stats')
      cy.get('header').contains('a', 'Admin').click()
      cy.wait('@stats')
      cy.get('main').contains('Fout bij laden').should('be.visible')
      cy.get('main').contains('Interne serverfout').should('be.visible')
    })

    it('shows an empty state when a user search has no matches', () => {
      cy.intercept('GET', '**/admin/stats', stats).as('stats')
      cy.intercept('GET', '**/admin/users*', usersList).as('users')

      cy.get('header').contains('a', 'Admin').click()
      cy.wait('@stats')
      cy.get('nav').contains('a', 'Gebruikers').click()
      cy.wait('@users')
      cy.contains('anna@example.nl').should('be.visible')

      cy.intercept('GET', '**/admin/users*', { items: [], nextCursor: null }).as('emptyUsers')
      cy.get('input[placeholder="Zoek op naam of e-mailadres..."]').type('geen-match')
      cy.wait('@emptyUsers')
      cy.contains('Geen gebruikers gevonden').should('be.visible')
      cy.contains('Probeer een andere zoekterm.').should('be.visible')
      cy.contains('anna@example.nl').should('not.exist')
    })

    it('paginates through the users list using next and previous', () => {
      cy.intercept('GET', '**/admin/stats', stats).as('stats')
      cy.intercept('GET', '**/admin/users*', usersPage1).as('usersPage1')

      cy.get('header').contains('a', 'Admin').click()
      cy.wait('@stats')
      cy.get('nav').contains('a', 'Gebruikers').click()
      cy.wait('@usersPage1')

      cy.contains('admin@wiedoehet.nl').should('be.visible')
      cy.contains('anna@example.nl').should('not.exist')
      cy.contains('button', 'Vorige').should('be.disabled')
      cy.contains('button', 'Volgende').should('not.be.disabled')

      cy.intercept('GET', '**/admin/users*', usersPage2).as('usersPage2')
      cy.contains('button', 'Volgende').click()
      cy.wait('@usersPage2').its('request.url').should('include', 'cursor=cursor-2')

      cy.contains('anna@example.nl').should('be.visible')
      cy.contains('admin@wiedoehet.nl').should('not.exist')
      cy.contains('button', 'Volgende').should('be.disabled')
      cy.contains('button', 'Vorige').should('not.be.disabled')

      cy.intercept('GET', '**/admin/users*', usersPage1).as('usersBack1')
      cy.contains('button', 'Vorige').click()
      cy.wait('@usersBack1')
      cy.contains('admin@wiedoehet.nl').should('be.visible')
      cy.contains('anna@example.nl').should('not.exist')
    })

    // Admin Mail Users feature (branch feature/admin-mail-users): checkbox
    // selection + server-resolved "select all N matching" + rich-text email
    // via AdminMailComposeModal / POST /admin/mail. See
    // product/specs/admin.spec.md § Admin Mail Users and
    // product/specs/admin-api.spec.md § POST /admin/mail.
    describe('user selection and mail sending', () => {
      function openUsersList() {
        cy.intercept('GET', '**/admin/stats', stats).as('stats')
        cy.intercept('GET', '**/admin/users*', usersList).as('users')
        cy.get('header').contains('a', 'Admin').click()
        cy.wait('@stats')
        cy.get('nav').contains('a', 'Gebruikers').click()
        cy.wait('@users')
      }

      it('shows the selection toolbar with the correct count and hides it again once the row is unchecked', () => {
        openUsersList()

        cy.contains('geselecteerd').should('not.exist')

        cy.contains('td', 'anna@example.nl').parent('tr').find('input[type="checkbox"]').click()
        cy.contains('1 geselecteerd').should('be.visible')
        cy.contains('button', 'E-mail versturen').should('be.visible')

        cy.contains('td', 'anna@example.nl').parent('tr').find('input[type="checkbox"]').click()
        cy.contains('geselecteerd').should('not.exist')
      })

      it('selects all matching users via the toolbar and reflects the total count', () => {
        openUsersList()

        cy.contains('td', 'anna@example.nl').parent('tr').find('input[type="checkbox"]').click()
        cy.contains('1 geselecteerd').should('be.visible')
        cy.contains('Alle 2 resultaten selecteren').should('be.visible').click()

        cy.contains('2 geselecteerd').should('be.visible')
        // The "select all matching" link only shows while selectedCount < totalCount.
        cy.contains('Alle 2 resultaten selecteren').should('not.exist')
        cy.get('thead input[type="checkbox"]').should('be.checked')
      })

      it('disables row checkboxes while select-all-matching is active, so unchecking one cannot silently shrink the send', () => {
        // Regression test for a bug found in code review: BaseTable's per-row
        // checkbox only ever knows about the current page's rows, so
        // unchecking one row while in select-all mode used to collapse "all
        // N matching" down to "this page minus one" with no warning. Fixed
        // by disabling the checkboxes entirely while select-all mode is
        // active (see AdminUsersView.vue's selection-disabled wiring).
        openUsersList()

        cy.contains('td', 'anna@example.nl').parent('tr').find('input[type="checkbox"]').click()
        cy.contains('Alle 2 resultaten selecteren').click()
        cy.contains('2 geselecteerd').should('be.visible')

        cy.contains('td', 'anna@example.nl').parent('tr').find('input[type="checkbox"]').should('be.disabled')
        cy.get('thead input[type="checkbox"]').should('be.disabled')

        // Clicking a disabled checkbox does not fire the toggle handler —
        // the full "2 geselecteerd" count must remain unchanged.
        cy.contains('td', 'anna@example.nl').parent('tr').find('input[type="checkbox"]').click({ force: true })
        cy.contains('2 geselecteerd').should('be.visible')
      })

      it('clears the selection when the search query changes', () => {
        openUsersList()

        cy.contains('td', 'anna@example.nl').parent('tr').find('input[type="checkbox"]').click()
        cy.contains('1 geselecteerd').should('be.visible')

        cy.intercept('GET', '**/admin/users*', {
          items: [usersList.items[1]],
          nextCursor: null,
          totalCount: 1,
        }).as('filteredUsers')
        cy.get('input[placeholder="Zoek op naam of e-mailadres..."]').type('anna')
        cy.wait('@filteredUsers')

        cy.contains('geselecteerd').should('not.exist')
      })

      it('sends an email to the explicitly checked users and shows the success result', () => {
        openUsersList()
        cy.intercept('POST', '**/admin/mail', { sent: 1, failed: 0, failures: [] }).as('sendMail')

        cy.contains('td', 'anna@example.nl').parent('tr').find('input[type="checkbox"]').click()
        cy.contains('button', 'E-mail versturen').click()

        cy.contains('E-mail opstellen').should('be.visible')
        cy.contains('Dit bericht wordt verstuurd naar 1 ontvanger(s).').should('be.visible')

        cy.get('#mail-subject').type('Belangrijke update')
        cy.get('.ProseMirror').type('Hallo Anna, dit is een testbericht.')
        cy.contains('button', /^Versturen$/).click()

        cy.wait('@sendMail').its('request.body').then((body) => {
          expect(body.userIds).to.deep.equal(['user-9'])
          expect(body.selectAll).to.be.undefined
          expect(body.subject).to.equal('Belangrijke update')
          expect(body.html).to.contain('Hallo Anna, dit is een testbericht.')
        })

        cy.contains('1 verstuurd, 0 mislukt.').should('be.visible')
      })

      it('sends to selectAll:true with the current filter when in select-all mode', () => {
        openUsersList()
        cy.intercept('POST', '**/admin/mail', { sent: 2, failed: 0, failures: [] }).as('sendMail')

        cy.contains('td', 'anna@example.nl').parent('tr').find('input[type="checkbox"]').click()
        cy.contains('Alle 2 resultaten selecteren').click()
        cy.contains('2 geselecteerd').should('be.visible')

        cy.contains('button', 'E-mail versturen').click()
        cy.contains('Dit bericht wordt verstuurd naar 2 ontvanger(s).').should('be.visible')

        cy.get('#mail-subject').type('Nieuwsbrief')
        cy.get('.ProseMirror').type('Testbericht voor iedereen.')
        cy.contains('button', /^Versturen$/).click()

        cy.wait('@sendMail').its('request.body').then((body) => {
          expect(body.selectAll).to.equal(true)
          expect(body.q).to.equal('')
          expect(body.userIds).to.be.undefined
          expect(body.subject).to.equal('Nieuwsbrief')
          expect(body.html).to.contain('Testbericht voor iedereen.')
        })

        cy.contains('2 verstuurd, 0 mislukt.').should('be.visible')
      })

      it('shows validation errors when subject and body are left empty, and does not send', () => {
        openUsersList()
        cy.intercept('POST', '**/admin/mail', { sent: 1, failed: 0, failures: [] }).as('sendMail')

        cy.contains('td', 'anna@example.nl').parent('tr').find('input[type="checkbox"]').click()
        cy.contains('button', 'E-mail versturen').click()
        cy.contains('button', /^Versturen$/).click()

        cy.contains('Onderwerp is verplicht.').should('be.visible')
        cy.contains('Bericht is verplicht.').should('be.visible')
        cy.get('@sendMail.all').should('have.length', 0)
      })

      it('shows a partial-failure summary when some recipients fail to send', () => {
        openUsersList()
        cy.intercept('POST', '**/admin/mail', {
          sent: 1,
          failed: 1,
          failures: [{ userId: 'admin-1', email: 'admin@wiedoehet.nl', message: 'Bounce: mailbox does not exist' }],
        }).as('sendMail')

        cy.contains('td', 'anna@example.nl').parent('tr').find('input[type="checkbox"]').click()
        cy.contains('Alle 2 resultaten selecteren').click()
        cy.contains('button', 'E-mail versturen').click()

        cy.get('#mail-subject').type('Nieuwsbrief')
        cy.get('.ProseMirror').type('Testbericht voor iedereen.')
        cy.contains('button', /^Versturen$/).click()
        cy.wait('@sendMail')

        cy.contains('1 verstuurd, 1 mislukt.').should('be.visible')
        cy.contains('admin@wiedoehet.nl').should('be.visible')
        cy.contains('Bounce: mailbox does not exist').should('be.visible')
      })

      it('shows a request-level error message when the send request itself fails', () => {
        openUsersList()
        cy.intercept('POST', '**/admin/mail', {
          statusCode: 500,
          body: { message: 'E-mail versturen mislukt.' },
        }).as('sendMail')

        cy.contains('td', 'anna@example.nl').parent('tr').find('input[type="checkbox"]').click()
        cy.contains('button', 'E-mail versturen').click()

        cy.get('#mail-subject').type('Nieuwsbrief')
        cy.get('.ProseMirror').type('Testbericht voor iedereen.')
        cy.contains('button', /^Versturen$/).click()
        cy.wait('@sendMail')

        cy.contains('E-mail versturen mislukt.').should('be.visible')
      })
    })
  })
})

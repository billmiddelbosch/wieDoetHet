// Full journey: a new customer (freshly registered user) creates a group and
// a task, the task is shown correctly to the initiator, the task can be
// claimed via the share link, and everything shows up correctly in the admin
// screens.
//
// This spec runs entirely within a single cy.visit() call. The app's mock
// backend (MSW) keeps its data in an in-memory store that is recreated on
// every full page load, so any cy.visit() after the first would wipe the
// user/group/task created during the test. All navigation after the initial
// visit is done via real UI clicks (client-side routing), plus one
// window.__router__ hook (exposed only under Cypress, see src/main.js) for
// the single step that has no corresponding clickable link in the UI: going
// to a group's public share URL.

describe('Nieuwe klant maakt groep en taak aan', () => {
  const stamp = Date.now()
  const userName = `E2E Klant ${stamp}`
  const userEmail = `e2e-flow-${stamp}@example.nl`
  const password = 'password123'
  const groupName = `E2E Groep ${stamp}`
  const taskTitle = `E2E Taak ${stamp}`
  const claimerName = 'E2E Deelnemer'

  it('registreert, maakt groep + taak, laat de taak claimen en toont alles in het admin scherm', () => {
    let shareToken

    // ---- 1. Register a new customer -----------------------------------
    cy.visit('/register')
    cy.get('#reg-name').type(userName)
    cy.get('#reg-email').type(userEmail)
    cy.get('#reg-password').type(password)
    cy.get('#reg-password-confirm').type(password)
    cy.get('form').submit()

    // Step 2 of registration (PWA install prompt) — desktop/"other" scenario.
    cy.contains('button', 'Ga naar dashboard', { timeout: 10000 }).click()
    cy.url().should('include', '/dashboard')

    // ---- 2. Create a group as this new user (the initiator) -----------
    cy.contains('button', 'Maak eerste groep').click()
    cy.url().should('include', '/groups/new')
    cy.get('#group-name').type(groupName)
    cy.get('form').submit()
    cy.url().should('match', /\/groups\/[^/]+$/)

    // ---- 3. Verify the group is shown correctly to the initiator ------
    cy.contains('h1', groupName).should('be.visible')
    // "Instellingen" only renders for the initiator — proves isInitiator
    // correctly resolves true for the group's own creator.
    cy.contains('button', 'Instellingen').should('be.visible')
    cy.contains('button', '+ Taak toevoegen').should('be.visible')

    // ---- 4. Create a task ----------------------------------------------
    cy.contains('button', '+ Taak toevoegen').click()
    cy.get('#task-title').should('be.visible').type(taskTitle)
    // The modal's own submit button also reads "Taak toevoegen", colliding
    // with the always-visible add-task button, so scope to the modal.
    cy.get('#task-title')
      .closest('.fixed')
      .within(() => {
        cy.contains('button', 'Taak toevoegen').click()
      })

    // ---- 5. Verify the task is shown to the initiator ------------------
    cy.contains(taskTitle, { timeout: 10000 }).should('be.visible')
    // Initiator view: no claim button for their own task.
    cy.contains('button', 'Pakken').should('not.exist')

    // ---- 6. Grab the share link ----------------------------------------
    cy.contains('button', 'Delen').click()
    cy.contains('Groep delen').should('be.visible')
    cy.get('.font-mono')
      .invoke('text')
      .then((text) => {
        const match = text.trim().match(/\/g\/([^/\s]+)$/)
        expect(match, `share url bevat geen token: "${text}"`).to.not.be.null
        shareToken = match[1]
      })
    cy.get('body').type('{esc}') // close the share modal

    // ---- 7. Log out (becomes an anonymous visitor) ---------------------
    cy.contains('button', 'Uitloggen').click()
    cy.location('pathname').should('eq', '/')

    // ---- 8. Navigate to the share link (client-side, keeps mock DB) ----
    cy.window().then((win) => {
      expect(win.__router__, 'Cypress router test hook').to.exist
      win.__router__.push(`/g/${shareToken}`)
    })
    cy.url().should('match', /\/groups\/[^/]+$/)
    cy.contains(taskTitle, { timeout: 10000 }).should('be.visible')

    // ---- 9. Claim the task as an anonymous participant ------------------
    cy.contains('button', 'Pakken').click()
    cy.contains('Doorgaan').should('be.visible')
    cy.get('input[placeholder="Jan de Vries"]').type(claimerName)
    cy.contains('button', 'Doorgaan').click()

    cy.contains('Jouw taak', { timeout: 10000 }).should('be.visible')
    cy.contains('button', 'Teruggeven').should('be.visible')

    // ---- 10. Log in as admin and verify the overview screen -----------
    cy.window().then((win) => win.__router__.push('/login'))
    cy.get('#login-email').type('test@wiedoehet.nl')
    cy.get('#login-password').type('test1234')
    // Scoped to the form: the header also renders a nav "Inloggen" button
    // that would otherwise collide with cy.contains('button', 'Inloggen').
    cy.get('form').contains('button', 'Inloggen').click()
    cy.url({ timeout: 10000 }).should('include', '/dashboard')

    cy.get('header').contains('a', 'Admin').click()
    cy.url().should('match', /\/admin$/)
    cy.contains('Admin overzicht').should('be.visible')
    cy.contains('Recente gebruikers', { timeout: 10000 }).should('be.visible')
    cy.contains(userName).should('be.visible')
    cy.contains('Recente groepen').should('be.visible')
    cy.contains(groupName).should('be.visible')

    // ---- 11. Verify the new user in the admin users screen ------------
    cy.get('nav').contains('a', 'Gebruikers').click()
    cy.url().should('include', '/admin/users')
    cy.get('input[placeholder*="Zoek"]').type(userEmail)
    cy.contains('tr', userEmail, { timeout: 10000 }).click()
    cy.url().should('include', '/admin/users/')
    cy.contains('h1', userName).should('be.visible')
    cy.contains(groupName).should('be.visible')

    // ---- 12. Verify the new group + claimed task in the admin screen --
    cy.get('nav').contains('a', 'Groepen').click()
    cy.url().should('include', '/admin/groups')
    cy.get('input[placeholder*="Zoek"]').type(groupName)
    cy.contains('tr', groupName, { timeout: 10000 }).click()
    cy.url().should('include', '/admin/groups/')
    cy.contains('h1', groupName).should('be.visible')
    cy.contains('tr', taskTitle).within(() => {
      cy.contains(claimerName).should('be.visible')
      cy.contains('Geclaimd').should('be.visible')
    })
  })
})

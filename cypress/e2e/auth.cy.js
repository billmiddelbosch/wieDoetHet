describe('Auth — Login & Register', () => {
  describe('Login page', () => {
    beforeEach(() => cy.visit('/login'))

    it('renders the login form', () => {
      cy.contains('Welkom terug').should('be.visible')
      cy.get('#login-email').should('exist')
      cy.get('#login-password').should('exist')
      cy.get('form').contains('button', 'Inloggen').should('exist')
    })

    it('shows email required error on empty submit', () => {
      // Submit form directly without filling any fields
      cy.get('form').submit()
      cy.contains('E-mailadres is verplicht').should('be.visible')
    })

    it('shows password required error when only email is filled', () => {
      cy.get('#login-email').type('test@example.nl')
      cy.get('form').submit()
      cy.contains('Wachtwoord is verplicht').should('be.visible')
    })

    it('shows invalid email error for bad email format', () => {
      cy.get('#login-email').type('not-an-email')
      cy.get('form').submit()
      cy.contains('Voer een geldig e-mailadres in').should('be.visible')
    })

    it('has a link to the register page', () => {
      cy.contains('a', 'Registreren').click()
      cy.url().should('include', '/register')
    })
  })

  describe('Register page', () => {
    beforeEach(() => cy.visit('/register'))

    it('renders the register form', () => {
      cy.contains('Account aanmaken').should('be.visible')
      cy.get('#reg-name').should('exist')
      cy.get('#reg-email').should('exist')
      cy.get('#reg-password').should('exist')
      cy.get('#reg-password-confirm').should('exist')
    })

    it('shows name required error on empty submit', () => {
      cy.get('form').submit()
      cy.contains('Naam is verplicht').should('be.visible')
    })

    it('shows password mismatch error', () => {
      cy.get('#reg-name').type('Jan')
      cy.get('#reg-email').type('jan@example.nl')
      cy.get('#reg-password').type('password123')
      cy.get('#reg-password-confirm').type('different123')
      cy.get('form').submit()
      cy.contains('Wachtwoorden komen niet overeen').should('be.visible')
    })

    it('has a link to the login page', () => {
      cy.contains('a', 'Inloggen').click()
      cy.url().should('include', '/login')
    })
  })

  describe('Register — PWA install step (step 2)', () => {
    /**
     * MSW handles /api/auth/register in dev mode — do not use cy.intercept for
     * the register call. Use a unique email per test to avoid 409 conflicts.
     * Wait for UI state changes rather than cy.wait('@alias').
     */

    let testEmail

    beforeEach(() => {
      // Unique email per test prevents MSW 409 conflicts between test runs
      testEmail = `pwa-test-${Date.now()}@example.nl`
    })

    function fillAndSubmitStep1(email = testEmail) {
      cy.visit('/register')
      cy.get('#reg-name').type('Jan')
      cy.get('#reg-email').type(email)
      cy.get('#reg-password').type('password123')
      cy.get('#reg-password-confirm').type('password123')
      cy.get('form').submit()
      // Wait for step 2 to appear — confirms register succeeded
      cy.contains('Voeg de app toe aan je beginscherm', { timeout: 8000 }).should('be.visible')
    }

    it('shows install step headline after successful registration', () => {
      fillAndSubmitStep1()
      cy.contains('Altijd binnen handbereik').should('be.visible')
    })

    it('does NOT show phone input on install step', () => {
      fillAndSubmitStep1()
      cy.get('#reg-phone').should('not.exist')
      cy.contains('WhatsApp-nummer').should('not.exist')
      cy.contains('Nummer opslaan').should('not.exist')
    })

    it('desktop/other scenario: shows go-to-dashboard button and navigates', () => {
      // In Cypress (desktop Chrome), canInstall=false and isIos=false
      // so the component renders the "other" scenario with "Ga naar dashboard"
      fillAndSubmitStep1()
      cy.contains('Ga naar dashboard').should('be.visible')
      cy.contains('Ga naar dashboard').click()
      cy.url().should('include', '/dashboard')
    })

    it('android scenario: shows install button when beforeinstallprompt fires', () => {
      // Warm the MSW worker first, then navigate so the app is ready
      cy.visit('/register')
      cy.get('#reg-name', { timeout: 8000 }).should('exist')

      // Fire beforeinstallprompt now that the app is live and the listener is attached
      cy.window().then((win) => {
        const fakePrompt = {
          preventDefault: () => {},
          prompt: () => Promise.resolve(),
          userChoice: Promise.resolve({ outcome: 'accepted' }),
        }
        const event = Object.assign(new Event('beforeinstallprompt'), fakePrompt)
        win.dispatchEvent(event)
      })

      cy.get('#reg-name').type('Jan')
      cy.get('#reg-email').type(testEmail)
      cy.get('#reg-password').type('password123')
      cy.get('#reg-password-confirm').type('password123')
      cy.get('form').submit()

      cy.contains('Voeg de app toe aan je beginscherm', { timeout: 8000 }).should('be.visible')
      cy.contains('Installeer de app').should('be.visible')
      cy.contains('Misschien later').should('be.visible')
    })

    it('android scenario: skip (Misschien later) navigates to /dashboard', () => {
      cy.visit('/register')
      cy.get('#reg-name', { timeout: 8000 }).should('exist')

      cy.window().then((win) => {
        const fakePrompt = {
          preventDefault: () => {},
          prompt: () => Promise.resolve(),
          userChoice: Promise.resolve({ outcome: 'dismissed' }),
        }
        const event = Object.assign(new Event('beforeinstallprompt'), fakePrompt)
        win.dispatchEvent(event)
      })

      cy.get('#reg-name').type('Jan')
      cy.get('#reg-email').type(testEmail)
      cy.get('#reg-password').type('password123')
      cy.get('#reg-password-confirm').type('password123')
      cy.get('form').submit()

      cy.contains('Misschien later', { timeout: 8000 }).should('be.visible')
      cy.contains('Misschien later').click()
      cy.url().should('include', '/dashboard')
    })

    it('standalone scenario: skips step 2 and lands on /dashboard', () => {
      // Override matchMedia before page load so isStandalone() returns true
      cy.visit('/register', {
        onBeforeLoad(win) {
          const original = win.matchMedia.bind(win)
          cy.stub(win, 'matchMedia').callsFake((query) => {
            if (query === '(display-mode: standalone)') {
              return { matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {} }
            }
            return original(query)
          })
        },
      })
      cy.get('#reg-name', { timeout: 8000 }).should('exist')

      cy.get('#reg-name').type('Jan')
      cy.get('#reg-email').type(testEmail)
      cy.get('#reg-password').type('password123')
      cy.get('#reg-password-confirm').type('password123')
      cy.get('form').submit()

      // Should skip step 2 entirely — navigates straight to dashboard
      cy.url({ timeout: 8000 }).should('include', '/dashboard')
      cy.contains('Voeg de app toe aan je beginscherm').should('not.exist')
    })
  })
})

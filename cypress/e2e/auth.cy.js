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

  describe('Register — phone number step (step 2)', () => {
    const mockUser = { id: '1', name: 'Jan', email: 'jan@example.nl' }

    beforeEach(() => {
      cy.intercept('POST', '**/auth/register', {
        statusCode: 201,
        body: { token: 'fake-token', user: mockUser },
      }).as('register')
      cy.intercept('GET', '**/auth/me', { statusCode: 200, body: mockUser }).as('me')
      cy.intercept('GET', '**/groups', []).as('groups')

      cy.visit('/register')
      cy.get('#reg-name').type('Jan')
      cy.get('#reg-email').type('jan@example.nl')
      cy.get('#reg-password').type('password123')
      cy.get('#reg-password-confirm').type('password123')
      cy.get('form').submit()
      cy.wait('@register')
    })

    it('shows phone prompt after successful registration', () => {
      cy.contains('Bijna klaar!').should('be.visible')
      cy.get('#reg-phone').should('exist')
      cy.contains('Nummer opslaan & app installeren').should('be.visible')
      cy.contains('Overslaan').should('be.visible')
    })

    it('shows benefit bullets on phone step', () => {
      cy.contains('WhatsApp-bericht').should('be.visible')
      cy.contains('pushmelding').should('be.visible')
      cy.contains('beginscherm').should('be.visible')
    })

    it('shows validation error for invalid phone number', () => {
      cy.get('#reg-phone').type('0612345678')
      cy.contains('Nummer opslaan & app installeren').click()
      cy.contains('geldig nummer').should('be.visible')
    })

    it('accepts valid E.164 phone number and proceeds', () => {
      cy.intercept('PATCH', '**/auth/profile', {
        statusCode: 200,
        body: { ...mockUser, phoneNumber: '+31612345678' },
      }).as('updateProfile')

      cy.get('#reg-phone').type('+31612345678')
      cy.contains('Nummer opslaan & app installeren').click()
      cy.wait('@updateProfile')
      cy.url().should('include', '/dashboard')
    })

    it('skip link goes to dashboard without saving phone', () => {
      cy.contains('Overslaan').click()
      cy.url().should('include', '/dashboard')
    })

    it('proceeds without phone number when field is left empty', () => {
      cy.intercept('PATCH', '**/auth/profile').as('updateProfile')
      cy.contains('Nummer opslaan & app installeren').click()
      // updateProfile should NOT be called when phone is empty
      cy.get('@updateProfile.all').should('have.length', 0)
      cy.url().should('include', '/dashboard')
    })
  })
})

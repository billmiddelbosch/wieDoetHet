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
})

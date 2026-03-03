describe('Navigation & routing', () => {
  it('navigates to login page from landing CTA', () => {
    cy.visit('/')
    cy.contains('Inloggen').click()
    cy.url().should('include', '/login')
  })

  it('navigates to register page from landing CTA', () => {
    cy.visit('/')
    cy.contains('Registreren').first().click()
    cy.url().should('include', '/register')
  })

  it('redirects unauthenticated user from /dashboard to /login', () => {
    cy.visit('/dashboard')
    cy.url().should('include', '/login')
  })

  it('redirects unauthenticated user from /groups/new to /login', () => {
    cy.visit('/groups/new')
    cy.url().should('include', '/login')
  })

  it('logo click navigates to home', () => {
    cy.visit('/login')
    cy.get('header').contains('wieDoetHet').click()
    cy.url().should('eq', Cypress.config().baseUrl + '/')
  })

  it('unknown route redirects to landing', () => {
    cy.visit('/some/unknown/path')
    cy.url().should('eq', Cypress.config().baseUrl + '/')
  })

  it('dark mode toggle is clickable and changes data-theme', () => {
    cy.visit('/')
    cy.get('html').should('have.attr', 'data-theme')
    cy.get('header').find('button[aria-label]').first().click()
    cy.get('html').should('have.attr', 'data-theme')
  })
})

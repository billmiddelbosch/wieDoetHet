describe('Home page', () => {
  beforeEach(() => {
    cy.visit('/')
  })

  it('displays the home page', () => {
    cy.url().should('eq', Cypress.config().baseUrl + '/')
  })

  it('has navigation links', () => {
    cy.get('nav').should('exist')
    cy.get('nav a').should('have.length.gte', 1)
  })
})

describe('Landing page', () => {
  beforeEach(() => {
    cy.visit('/')
  })

  it('renders the landing page at /', () => {
    cy.url().should('eq', Cypress.config().baseUrl + '/')
  })

  it('displays the hero headline', () => {
    cy.contains('Wie pakt').should('be.visible')
  })

  it('has a create group CTA button', () => {
    cy.contains('Maak een groep aan').should('be.visible')
  })

  it('shows the how-it-works section with 3 steps', () => {
    cy.contains('Zo werkt het').should('be.visible')
    cy.contains('Stap 1').should('be.visible')
    cy.contains('Stap 2').should('be.visible')
    cy.contains('Stap 3').should('be.visible')
  })

  it('shows 4 feature cards', () => {
    cy.contains('Waarom wieDoetHet').should('be.visible')
    cy.contains('Geen account nodig').should('be.visible')
    cy.contains('WhatsApp-vriendelijk').should('be.visible')
    cy.contains('Wie pakt wat').should('be.visible')
    cy.contains('Jij bepaalt wie ziet wat').should('be.visible')
  })

  it('has navigation links to login and register', () => {
    cy.contains('Inloggen').should('be.visible')
    cy.contains('Registreren').should('be.visible')
  })

  it('has a dark mode toggle button', () => {
    cy.get('header').find('button[aria-label]').should('exist')
  })
})

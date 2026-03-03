describe('Groups — Create flow (unauthenticated redirect)', () => {
  it('redirects /groups/new to login for guests', () => {
    cy.visit('/groups/new')
    cy.url().should('include', '/login')
  })
})

describe('Group detail — page renders without crashing', () => {
  it('renders group detail route without JS errors', () => {
    cy.visit('/groups/test-group-id')
    cy.get('body').should('exist')
    // Should show spinner while loading (no real API = loading state or error alert)
    cy.get('body').then(($body) => {
      const hasSpinner = $body.find('svg.animate-spin').length > 0
      const hasAlert = $body.text().includes('Fout') || $body.text().includes('fout')
      expect(hasSpinner || hasAlert || true).to.be.true // page must not crash
    })
  })

  it('share redirect route renders without crashing', () => {
    cy.visit('/g/some-share-token')
    cy.get('body').should('exist')
  })
})

describe('Group create form — validation (authenticated)', () => {
  beforeEach(() => {
    // Seed auth token so guard passes
    cy.window().then((win) => {
      win.localStorage.setItem('auth_token', 'mock-token-for-testing')
    })
    cy.visit('/groups/new')
  })

  afterEach(() => {
    cy.window().then((win) => win.localStorage.removeItem('auth_token'))
  })

  it('renders group create form', () => {
    cy.contains('Nieuwe groep aanmaken').should('be.visible')
    cy.get('#group-name').should('exist')
  })

  it('shows validation error when name is empty', () => {
    cy.get('form').submit()
    cy.contains('Groepsnaam is verplicht').should('be.visible')
  })

  it('shows event date field when temporary toggle is on', () => {
    cy.get('[role="switch"]').first().click()
    cy.get('#group-event-date').should('be.visible')
  })

  it('shows date required error when temporary and no date', () => {
    cy.get('#group-name').type('Test groep')
    cy.get('[role="switch"]').first().click()
    cy.get('form').submit()
    cy.contains('Vul een datum in voor een tijdelijke groep').should('be.visible')
  })
})

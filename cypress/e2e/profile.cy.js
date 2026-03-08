const mockUser = { id: '1', name: 'Jan de Vries', email: 'jan@example.nl', phoneNumber: null }

function loginAs(user = mockUser) {
  localStorage.setItem('auth_token', 'fake-token')
  cy.intercept('GET', '**/auth/me', { statusCode: 200, body: user }).as('me')
}

describe('Profile page', () => {
  describe('unauthenticated', () => {
    it('redirects to login', () => {
      cy.visit('/profile')
      cy.url().should('include', '/login')
    })
  })

  describe('authenticated', () => {
    beforeEach(() => {
      loginAs()
      cy.visit('/profile')
    })

    it('renders the profile page', () => {
      cy.contains('Mijn profiel').should('be.visible')
    })

    it('shows name and email as read-only', () => {
      cy.get('#profile-name').should('have.value', mockUser.name).and('be.disabled')
      cy.get('#profile-email').should('have.value', mockUser.email).and('be.disabled')
    })

    it('shows phone number input', () => {
      cy.get('#profile-phone').should('exist')
      cy.contains('WhatsApp-nummer').should('be.visible')
    })

    it('shows E.164 format hint', () => {
      cy.contains('+31612345678').should('be.visible')
    })

    it('shows WhatsApp notice', () => {
      cy.contains('WhatsApp-verificatie').should('be.visible')
    })

    it('shows validation error for invalid phone number', () => {
      cy.get('#profile-phone').type('0612345678')
      cy.get('form').submit()
      cy.contains('geldig nummer').should('be.visible')
    })

    it('saves valid phone number successfully', () => {
      const updatedUser = { ...mockUser, phoneNumber: '+31612345678' }
      cy.intercept('PATCH', '**/auth/profile', {
        statusCode: 200,
        body: updatedUser,
      }).as('updateProfile')

      cy.get('#profile-phone').type('+31612345678')
      cy.get('form').submit()
      cy.wait('@updateProfile')
      cy.contains('Profiel opgeslagen').should('be.visible')
    })

    it('saves null to clear an existing phone number', () => {
      loginAs({ ...mockUser, phoneNumber: '+31612345678' })
      cy.visit('/profile')
      cy.intercept('PATCH', '**/auth/profile', {
        statusCode: 200,
        body: mockUser,
      }).as('updateProfile')

      cy.get('#profile-phone').clear()
      cy.get('form').submit()
      cy.wait('@updateProfile').its('request.body').should('deep.equal', { phoneNumber: null })
    })

    it('shows server error when save fails', () => {
      cy.intercept('PATCH', '**/auth/profile', {
        statusCode: 500,
        body: { message: 'Interne fout' },
      }).as('updateProfile')

      cy.get('#profile-phone').type('+31612345678')
      cy.get('form').submit()
      cy.wait('@updateProfile')
      cy.contains('Interne fout').should('be.visible')
    })

    it('pre-fills existing phone number', () => {
      loginAs({ ...mockUser, phoneNumber: '+31687654321' })
      cy.visit('/profile')
      cy.get('#profile-phone').should('have.value', '+31687654321')
    })
  })

  describe('avatar link', () => {
    it('clicking the avatar navigates to /profile', () => {
      loginAs()
      cy.visit('/dashboard')
      cy.intercept('GET', '**/groups', []).as('groups')
      cy.get('header').find('a[href="/profile"]').click()
      cy.url().should('include', '/profile')
    })
  })
})

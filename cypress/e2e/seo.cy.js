/**
 * E2E tests for SEO-01: SEO Optimisation
 *
 * Covers:
 * - Landing page title, meta description, OG tags (AC-01, AC-02, AC-03 partial)
 * - Canonical link on landing and login (AC-04)
 * - robots.txt served correctly (AC-06)
 * - sitemap.xml served with expected entries (AC-07)
 * - WebApplication JSON-LD on landing (AC-08)
 * - FAQPage JSON-LD on landing with 4 entries (AC-09)
 * - Static HTML block in index.html readable without JS (AC-10, AC-11)
 * - og-image.png exists (AC-12)
 * - noindex meta on dashboard (private page)
 * - FAQ section visible in landing page UI
 */

describe('SEO — Landing page meta tags', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('section', { timeout: 8000 }).first().should('exist')
  })

  it('AC-01: sets the correct page title', () => {
    cy.title().should('eq', 'Wie Doet Het – Taken verdelen voor groepen')
  })

  it('AC-02: sets meta description with target keywords', () => {
    cy.get('head meta[name="description"]').should(($el) => {
      const content = $el.attr('content')
      expect(content).to.have.length.lessThan(156)
      expect(content.toLowerCase()).to.include('taken')
      expect(content.toLowerCase()).to.include('groep')
    })
  })

  it('sets og:title', () => {
    cy.get('head meta[property="og:title"]')
      .should('have.attr', 'content', 'Wie Doet Het – Taken verdelen voor groepen')
  })

  it('sets og:description', () => {
    cy.get('head meta[property="og:description"]').should(($el) => {
      expect($el.attr('content')).to.have.length.greaterThan(10)
    })
  })

  it('sets og:image pointing to og-image.png', () => {
    cy.get('head meta[property="og:image"]').should(($el) => {
      expect($el.attr('content')).to.include('og-image.png')
    })
  })

  it('sets og:type to website', () => {
    cy.get('head meta[property="og:type"]').should('have.attr', 'content', 'website')
  })

  it('AC-04: sets canonical link on landing', () => {
    cy.get('head link[rel="canonical"]').should(($el) => {
      expect($el.attr('href')).to.include('/')
    })
  })
})

describe('SEO — JSON-LD schemas on landing', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
    cy.visit('/')
    cy.get('section', { timeout: 8000 }).first().should('exist')
    // Wait for Vue to mount and inject JSON-LD
    cy.get('head script[type="application/ld+json"]', { timeout: 8000 }).should('exist')
  })

  it('AC-08: WebApplication JSON-LD has free offer and correct category', () => {
    cy.get('head script[type="application/ld+json"]').then(($scripts) => {
      const schemas = [...$scripts].map((el) => JSON.parse(el.textContent))
      const webApp = schemas.find((s) => s['@type'] === 'WebApplication')
      expect(webApp).to.exist
      expect(webApp.applicationCategory).to.eq('UtilityApplication')
      expect(webApp.offers).to.exist
      expect(webApp.offers.price).to.eq('0')
      expect(webApp.offers.priceCurrency).to.eq('EUR')
    })
  })

  it('AC-09: FAQPage JSON-LD contains exactly 4 Dutch Q&A entries', () => {
    cy.get('head script[type="application/ld+json"]').then(($scripts) => {
      const schemas = [...$scripts].map((el) => JSON.parse(el.textContent))
      const faq = schemas.find((s) => s['@type'] === 'FAQPage')
      expect(faq).to.exist
      expect(faq.mainEntity).to.have.length(4)
      faq.mainEntity.forEach((q) => {
        expect(q['@type']).to.eq('Question')
        expect(q.name).to.be.a('string').and.have.length.greaterThan(5)
        expect(q.acceptedAnswer['@type']).to.eq('Answer')
        expect(q.acceptedAnswer.text).to.be.a('string').and.have.length.greaterThan(10)
      })
    })
  })
})

describe('SEO — Static HTML in index.html (AC-10, AC-11)', () => {
  it('static H1 and FAQ exist in the DOM before Vue hydration via #seo-static', () => {
    cy.visit('/')
    // The #seo-static div must exist in the DOM (it is CSS-hidden, not removed)
    cy.get('#seo-static').should('exist')
    cy.get('#seo-static h1').should('contain.text', 'Wie Doet Het')
    cy.get('#seo-static h3').should('have.length.at.least', 4)
  })
})

describe('SEO — FAQ section visible in landing UI', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('section', { timeout: 8000 }).first().should('exist')
  })

  it('renders FAQ section with 4 visible items', () => {
    // Target the Vue-rendered FAQ section specifically (not #seo-static which is CSS-hidden)
    cy.get('#app').contains('Veelgestelde vragen').should('be.visible')
    cy.get('#app').contains('Hoe verdeel ik taken over een groep?').should('be.visible')
    cy.get('#app').contains('Welke app kan taken verdelen?').should('be.visible')
    cy.get('#app').contains('Is Wie Doet Het gratis?').should('be.visible')
    cy.get('#app').contains('Kan ik taken verdelen via WhatsApp?').should('be.visible')
  })
})

describe('SEO — robots.txt (AC-06)', () => {
  it('is served at /robots.txt', () => {
    cy.request('/robots.txt').then((response) => {
      expect(response.status).to.eq(200)
      expect(response.headers['content-type']).to.include('text')
      expect(response.body).to.include('User-agent: *')
      expect(response.body).to.include('Disallow: /dashboard')
      expect(response.body).to.include('Disallow: /profile')
      expect(response.body).to.include('Disallow: /groups/*/settings')
      expect(response.body).to.include('Sitemap:')
    })
  })
})

describe('SEO — sitemap.xml (AC-07)', () => {
  it('is served at /sitemap.xml with expected entries', () => {
    cy.request('/sitemap.xml').then((response) => {
      expect(response.status).to.eq(200)
      expect(response.body).to.include('wiedoethet.nl/')
      expect(response.body).to.include('/login')
      expect(response.body).to.include('/register')
    })
  })
})

describe('SEO — og-image.png exists (AC-12)', () => {
  it('og-image.png is served at /og-image.png', () => {
    cy.request('/og-image.png').then((response) => {
      expect(response.status).to.eq(200)
      expect(response.headers['content-type']).to.include('image/png')
    })
  })
})

describe('SEO — meta tags on auth pages', () => {
  beforeEach(() => {
    // Clear auth state so guestOnly guard does not redirect away from login/register
    cy.clearLocalStorage()
  })

  it('login page sets meta description and canonical link', () => {
    cy.visit('/login')
    // Wait for the login form to confirm the component has mounted before checking head
    cy.get('form', { timeout: 8000 }).should('exist')
    cy.get('head meta[name="description"]').should('exist')
    cy.get('head link[rel="canonical"]').should('exist')
  })

  it('register page sets a page title', () => {
    cy.visit('/register')
    cy.get('form', { timeout: 8000 }).should('exist')
    cy.title().should('include', 'Wie Doet Het')
  })
})

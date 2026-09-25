// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { LIFECYCLE_TEMPLATES } from '../../shared/lifecycle-templates.js'

describe('default template texts', () => {
  it.each(LIFECYCLE_TEMPLATES.map((t) => [t.id, t]))('%s introduces Wie-Doet-Het in the body', (_id, template) => {
    expect(template.defaultBodyHtml).toContain('Wie-Doet-Het')
    expect(template.defaultBodyHtml).toContain('de gratis app om taken te verdelen binnen een groep')
  })

  it('group templates name the group so the recipient knows what it is about', () => {
    for (const template of LIFECYCLE_TEMPLATES.filter((t) => t.scope === 'group')) {
      expect(template.defaultBodyHtml).toContain('{{groupName}}')
    }
  })

  it('never uses the old spelling "Wie Doet Het"', () => {
    for (const template of LIFECYCLE_TEMPLATES) {
      expect(`${template.defaultSubject} ${template.defaultBodyHtml}`).not.toContain('Wie Doet Het')
    }
  })
})

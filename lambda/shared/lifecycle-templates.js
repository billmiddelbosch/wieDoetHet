/**
 * Lifecycle mail template definitions — the STATIC half of mail automation.
 *
 * Lives in shared/ (code, not DynamoDB) so the default Dutch text is
 * version-controlled and both Lambdas can use it:
 *   - wiedoethet-admin lists/edits/test-sends templates (imports only this file,
 *     never the DynamoDB evaluator code);
 *   - wiedoethet-lifecycle pairs each entry with its `candidates()` /
 *     `stillApplies()` evaluators (wiedoethet-lifecycle/evaluators.js).
 *
 * The admin overrides subject/body per template via MAILTPL#{id}/CONFIG; a null
 * override means "use the default text below". Full contract, trigger rules and
 * the reviewed wording: product/specs/mail-automation-api.spec.md (Appendix A).
 *
 * Default bodies use plain <p>/<ol>/<a> markup only, so they round-trip through
 * the admin's rich-text editor (Tiptap) without losing anything. The branded
 * shell and the non-editable footer are added by wrapEmailHtml.
 */

const USER_VARIABLES = ['firstName', 'appUrl', 'createGroupUrl']
const GROUP_VARIABLES = [...USER_VARIABLES, 'groupName', 'groupUrl']

const link = (label, url) => `<p><a href="${url}"><strong>${label} →</strong></a></p>`

/**
 * Definitions in PRIORITY ORDER. The order only matters for "one mail per user
 * per run": the earlier template wins that user's slot.
 *
 *   tier 'immediate' → any day, any hour, picked up within minutes by the frequent
 *                      schedule (no 10:00 window, no weekday rule); 'timely' → Mon–Fri
 *                      10:00 (Europe/Amsterdam); 'normal' → Tue/Wed/Thu only.
 *   maxAgeHours   → drop instead of sending late; null = never expires.
 *   maxPerUser    → lifetime cap; null = once per scope (per group) instead.
 *   gapExemptAfter→ template ids after which the 72 h minimum gap does not apply.
 *   ignoreMinGap  → true = the 72 h minimum gap never blocks this template.
 */
export const LIFECYCLE_TEMPLATES = [
  {
    id: 'welcome',
    scope: 'user',
    tier: 'immediate',
    maxAgeHours: 168,
    maxPerUser: 1,
    gapExemptAfter: [],
    ignoreMinGap: true,
    variables: USER_VARIABLES,
    defaultSubject: 'Welkom bij Wie-Doet-Het, {{firstName}}!',
    defaultBodyHtml: [
      '<p>Hoi {{firstName}},</p>',
      '<p>Wat fijn dat je er bent! Welkom bij Wie-Doet-Het, de gratis app om taken te verdelen binnen een groep. Geen eindeloze appjes meer over wie wat meeneemt: jij maakt een lijst, iedereen kiest zelf wat hij of zij doet.</p>',
      '<p><strong>Wat kun je met Wie-Doet-Het?</strong></p>',
      '<ul><li><p>Een etentje, verjaardag, klusdag of vakantie regelen: maak een groep aan en zet de taken erin</p></li><li><p>Deel de link via WhatsApp: deelnemers kiezen zelf een taak en hebben daarvoor geen account nodig</p></li><li><p>Zie in één oogopslag wie wat doet en wat er nog open staat</p></li></ul>',
      '<p>Begin gerust klein: een paar taken is genoeg, je kunt er altijd meer toevoegen.</p>',
      link('Maak je eerste groep', '{{createGroupUrl}}'),
      '<p><strong>Tip: zet Wie-Doet-Het als app op je telefoon</strong></p>',
      '<p>Je hoeft niets te downloaden uit een appstore. Open Wie-Doet-Het in de browser van je telefoon en zet het op je beginscherm. Dan staat het er als een gewone app, altijd binnen handbereik:</p>',
      '<ul><li><p><strong>iPhone (Safari):</strong> tik op het deel-icoon (het vierkantje met een pijl omhoog) en kies "Zet op beginscherm"</p></li><li><p><strong>Android (Chrome):</strong> tik op het menu (de drie puntjes rechtsboven) en kies "App installeren" of "Toevoegen aan startscherm"</p></li></ul>',
      '<p>Open Wie-Doet-Het op je telefoon: <a href="{{appUrl}}">{{appUrl}}</a></p>',
      '<p>Veel plezier met organiseren!</p>',
    ].join(''),
  },
  {
    id: 'no_group',
    scope: 'user',
    tier: 'normal',
    maxAgeHours: 168,
    maxPerUser: 1,
    gapExemptAfter: ['welcome'],
    variables: USER_VARIABLES,
    defaultSubject: 'Zullen we samen je eerste groep maken?',
    defaultBodyHtml: [
      '<p>Hoi {{firstName}},</p>',
      '<p>je hebt een account bij Wie-Doet-Het, de gratis app om taken te verdelen binnen een groep, maar je hebt nog geen groep gemaakt. Dat kost twee minuten: geef je groep een naam, voeg een paar taken toe en deel de link. Begin gerust klein, je kunt altijd taken toevoegen.</p>',
      link('Start een groep', '{{createGroupUrl}}'),
    ].join(''),
  },
  {
    id: 'no_tasks',
    scope: 'group',
    tier: 'timely',
    maxAgeHours: 96,
    maxPerUser: 1,
    gapExemptAfter: ['welcome'],
    variables: GROUP_VARIABLES,
    defaultSubject: 'Bijna klaar: voeg taken toe aan {{groupName}}',
    defaultBodyHtml: [
      '<p>Hoi {{firstName}},</p>',
      '<p>je hebt in Wie-Doet-Het, de gratis app om taken te verdelen binnen een groep, de groep "{{groupName}}" aangemaakt — top! Alleen staan er nog geen taken in, dus er valt nog niets te kiezen. Voeg een paar taken toe (bijv. "Drinken meenemen", "Taart bakken"), dan kun je de link delen.</p>',
      link('Taken toevoegen', '{{groupUrl}}'),
    ].join(''),
  },
  {
    id: 'no_claims',
    scope: 'group',
    tier: 'normal',
    maxAgeHours: 168,
    maxPerUser: 1,
    gapExemptAfter: ['welcome'],
    variables: GROUP_VARIABLES,
    defaultSubject: 'Nog niemand heeft een taak gekozen in {{groupName}}',
    defaultBodyHtml: [
      '<p>Hoi {{firstName}},</p>',
      '<p>in Wie-Doet-Het, de gratis app om taken te verdelen binnen een groep, staan de taken voor "{{groupName}}" klaar, maar niemand heeft er nog een gekozen. Heb je de link al gedeeld? Een korte herinnering in de groepsapp helpt vaak — mensen vergeten het snel weer. Tip: houd taken klein en concreet, dan is kiezen makkelijker.</p>',
      link('Naar je groep', '{{groupUrl}}'),
    ].join(''),
  },
  {
    id: 'day_after_event',
    scope: 'group',
    tier: 'timely',
    maxAgeHours: 96,
    maxPerUser: null,
    gapExemptAfter: ['welcome'],
    variables: GROUP_VARIABLES,
    defaultSubject: 'Hoe was {{groupName}}?',
    defaultBodyHtml: [
      '<p>Hoi {{firstName}},</p>',
      '<p>je hebt "{{groupName}}" georganiseerd met Wie-Doet-Het, de gratis app om taken te verdelen binnen een groep. De datum is inmiddels geweest — hopelijk was het gezellig! Volgende keer weer iets te organiseren? Je maakt zo een nieuwe groep, en je deelnemers hebben de taken weer snel op een rij.</p>',
      link('Nieuwe groep maken', '{{createGroupUrl}}'),
    ].join(''),
  },
  {
    id: 'dormant_30',
    scope: 'user',
    tier: 'normal',
    maxAgeHours: null,
    maxPerUser: 1,
    gapExemptAfter: [],
    variables: USER_VARIABLES,
    defaultSubject: 'We missen je bij Wie-Doet-Het',
    defaultBodyHtml: [
      '<p>Hoi {{firstName}},</p>',
      '<p>je hebt een account bij Wie-Doet-Het, de gratis app om taken te verdelen binnen een groep. Het is een tijdje geleden dat we je zagen. Staat er weer iets op de planning waarbij iedereen moet meehelpen? Je groepen en taken staan nog gewoon voor je klaar.</p>',
      link('Naar Wie-Doet-Het', '{{appUrl}}'),
    ].join(''),
  },
  {
    id: 'dormant_60',
    scope: 'user',
    tier: 'normal',
    maxAgeHours: null,
    maxPerUser: 1,
    gapExemptAfter: [],
    variables: USER_VARIABLES,
    defaultSubject: 'Nog iets te regelen, {{firstName}}?',
    defaultBodyHtml: [
      '<p>Hoi {{firstName}},</p>',
      '<p>dit is voorlopig het laatste bericht van Wie-Doet-Het, de gratis app om taken te verdelen binnen een groep waar je een account hebt: we willen je inbox niet vullen. Mocht je ooit weer een groep willen organiseren, dan staat Wie-Doet-Het voor je klaar. En vertel ons vooral gerust wat we anders of beter zouden kunnen doen — je reactie is welkom.</p>',
      link('Naar Wie-Doet-Het', '{{appUrl}}'),
    ].join(''),
  },
]

export const TEMPLATE_IDS = LIFECYCLE_TEMPLATES.map((t) => t.id)

const BY_ID = new Map(LIFECYCLE_TEMPLATES.map((t) => [t.id, t]))

/** @returns the static definition for a template id, or undefined. */
export function getTemplate(id) {
  return BY_ID.get(id)
}

/**
 * Merges a static definition with its (possibly absent) MAILTPL CONFIG item
 * into the shape both Lambdas use: effective text = override ?? default.
 */
export function mergeTemplateConfig(definition, config) {
  const subjectOverride = config?.subject ?? null
  const bodyOverride = config?.bodyHtml ?? null
  return {
    ...definition,
    enabled: config?.enabled === true,
    enabledAt: config?.enabledAt ?? null,
    subject: subjectOverride ?? definition.defaultSubject,
    bodyHtml: bodyOverride ?? definition.defaultBodyHtml,
    isCustomised: subjectOverride !== null || bodyOverride !== null,
    updatedAt: config?.updatedAt ?? null,
    updatedBy: config?.updatedBy ?? null,
  }
}

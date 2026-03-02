import { createI18n } from 'vue-i18n'
import nl from './locales/nl.json'
import en from './locales/en.json'

const i18n = createI18n({
  legacy: false, // Use Composition API mode
  locale: 'nl', // Default locale
  fallbackLocale: 'en',
  messages: {
    nl,
    en,
  },
})

export default i18n

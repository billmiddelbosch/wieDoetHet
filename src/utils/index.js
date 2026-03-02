/**
 * Format a date to a localized string.
 * @param {Date|string} date
 * @param {string} locale
 * @returns {string}
 */
export function formatDate(date, locale = 'nl-NL') {
  return new Date(date).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/**
 * Capitalize the first letter of a string.
 * @param {string} str
 * @returns {string}
 */
export function capitalize(str) {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1)
}

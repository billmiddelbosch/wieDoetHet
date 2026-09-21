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
 * Format a date and time to a localized string.
 * @param {Date|string} date
 * @param {string} locale
 * @returns {string}
 */
export function formatDateTime(date, locale = 'nl-NL') {
  return new Date(date).toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
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

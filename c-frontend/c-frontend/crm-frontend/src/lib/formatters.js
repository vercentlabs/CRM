/**
 * Format a number as a percentage with 2 decimal places
 * @param {number} value - The number to format as percentage
 * @returns {string} Formatted percentage string
 */
export const formatPercentage = (value) => {
  if (value === null || value === undefined || isNaN(value)) return '0%';
  return `${parseFloat(value).toFixed(2)}%`;
};

/**
 * Format a number with thousands separators
 * @param {number} value - The number to format
 * @returns {string} Formatted number with separators
 */
export const formatNumber = (value) => {
  if (value === null || value === undefined || isNaN(value)) return '0';
  return new Intl.NumberFormat('en-US').format(value);
};

/**
 * Format a date in a readable format
 * @param {string|Date} date - The date to format
 * @returns {string} Formatted date string
 */
export const formatDate = (date) => {
  if (!date) return '';

  const dateObj = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(dateObj.getTime())) return '';

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(dateObj);
};

/**
 * Format a date with time
 * @param {string|Date} date - The date to format
 * @returns {string} Formatted date and time string
 */
export const formatDateTime = (date) => {
  if (!date) return '';

  const dateObj = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(dateObj.getTime())) return '';

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(dateObj);
};

/**
 * Format currency amount
 * @param {number} value - The amount to format
 * @param {string} currency - Currency code (default: USD)
 * @returns {string} Formatted currency string
 */
export const formatCurrency = (value, currency = 'USD') => {
  if (value === null || value === undefined || isNaN(value)) return '$0.00';

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency
  }).format(value);
};

/**
 * Format duration in days to human readable format
 * @param {number} days - Number of days
 * @returns {string} Formatted duration string
 */
export const formatDuration = (days) => {
  if (days === null || days === undefined || isNaN(days)) return '0 days';

  const absDays = Math.abs(Math.round(days));
  const daysText = absDays === 1 ? 'day' : 'days';

  return `${absDays} ${daysText}`;
};

/**
 * Format a phone number
 * @param {string} phoneNumber - Phone number string
 * @returns {string} Formatted phone number
 */
export const formatPhoneNumber = (phoneNumber) => {
  if (!phoneNumber) return '';

  // Remove all non-digit characters
  const cleaned = phoneNumber.replace(/\D/g, '');

  // Check if the input is of correct length
  const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);

  if (match) {
    return `(${match[1]}) ${match[2]}-${match[3]}`;
  }

  // Return original if format doesn't match expected pattern
  return phoneNumber;
};

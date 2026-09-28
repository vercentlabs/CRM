/**
 * Helper function to extract data from API responses
 * Ensures consistent handling of API responses across the application
 * @param {Object} res - The response object from an API call
 * @returns {Object} The data payload from the response
 * @throws {Error} If the response indicates failure
 */
export const extractData = (res) => {
  // Handle different response structures
  // Case 1: Standard API response with success flag
  if (res.data?.success !== undefined) {
    if (!res.data.success) {
      throw new Error(res.data?.message || 'Something went wrong')
    }
    return res.data.data
  }
  
  // Case 2: Direct data response without success flag
  if (res.data) {
    return res.data
  }
  
  // Case 3: No data in response
  throw new Error('Invalid response format')
}

/**
 * Helper function to handle API errors consistently
 * @param {Error} error - The error object from an API call
 * @returns {string} The error message
 */
export const handleError = (error) => {
  if (error.response?.data?.message) {
    return error.response.data.message
  }
  if (error.message) {
    return error.message
  }
  return 'An unexpected error occurred'
}

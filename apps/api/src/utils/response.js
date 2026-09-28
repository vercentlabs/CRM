/**
 * API Response Utility Module
 * 
 * This utility provides standardized functions for sending success and error responses
 * across the application, ensuring consistent API response format.
 */

/**
 * Sends a standardized success response
 * @param {Object} res - Express response object
 * @param {string} message - Success message
 * @param {Object} data - Response payload (optional)
 * @param {number} statusCode - HTTP status code (default: 200)
 */
const sendSuccess = (res, message, data = null, statusCode = 200) => {
  const response = {
    success: true,
    message
  };

  if (data !== null) {
    response.data = data;
  }

  return res.status(statusCode).json(response);
};

/**
 * Sends a standardized error response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code (default: 500)
 * @param {Object} errorDetails - Additional error details (optional)
 */
const sendError = (res, message, statusCode = 500, errorDetails = null) => {
  const response = {
    success: false,
    message
  };

  if (errorDetails !== null) {
    response.error = errorDetails;
  }

  return res.status(statusCode).json(response);
};

/**
 * Sends a validation error response with field-specific errors
 * @param {Object} res - Express response object
 * @param {Array} validationErrors - Array of validation error objects
 */
const sendValidationError = (res, validationErrors) => {
  return res.status(400).json({
    success: false,
    message: 'Validation failed',
    errors: validationErrors
  });
};

/**
 * Sends a resource not found error response
 * @param {Object} res - Express response object
 * @param {string} resourceType - Type of resource that was not found (optional)
 */
const sendNotFound = (res, resourceType = 'Resource') => {
  return res.status(404).json({
    success: false,
    message: `${resourceType} not found`,
    error: `The requested ${resourceType.toLowerCase()} could not be found`
  });
};

/**
 * Sends an unauthorized error response
 * @param {Object} res - Express response object
 * @param {string} message - Custom error message (optional)
 */
const sendUnauthorized = (res, message = 'Authentication required') => {
  return res.status(401).json({
    success: false,
    message,
    error: 'No valid authentication token provided'
  });
};

/**
 * Sends a forbidden error response
 * @param {Object} res - Express response object
 * @param {string} message - Custom error message (optional)
 */
const sendForbidden = (res, message = 'Access denied') => {
  return res.status(403).json({
    success: false,
    message,
    error: 'You don\'t have permission to perform this action'
  });
};

export {
  sendSuccess,
  sendError,
  sendValidationError,
  sendNotFound,
  sendUnauthorized,
  sendForbidden
};

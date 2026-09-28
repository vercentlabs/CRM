/**
 * Role-Checking Middleware
 * 
 * This middleware provides role-based access control for protected routes.
 * It checks if the authenticated user has one of the allowed role IDs.
 * 
 * Usage:
 * const { checkRoles } = require('../middleware/roleCheck');
 * router.get('/protected', checkRoles([1, 2]), handler);
 */

/**
 * Middleware function to check if user has required role
 * @param {Array<number>} allowedRoles - Array of allowed role IDs
 * @returns {Function} Express middleware function
 */
const checkRoles = (allowedRoles) => {
  return (req, res, next) => {
    // Check if user exists in the request
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        error: 'No user information found in request'
      });
    }

    // Check if user has a role property
    if (req.user.roleId === undefined) {
      return res.status(401).json({
        success: false,
        message: 'Invalid user data',
        error: 'User role information is missing'
      });
    }

    // Get user role ID
    const userRoleId = req.user.roleId;

    // Check if user's role is in the allowed roles array
    if (!allowedRoles.includes(userRoleId)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
        error: "You don't have permission to perform this action",
        requiredRoles: allowedRoles,
        userRole: userRoleId
      });
    }

    // User has required role, proceed to next middleware
    next();
  };
};

/**
 * Helper functions for common role checks
 */
const isAdmin = checkRoles([1]); // Assuming 1 is admin
const isManager = checkRoles([2]); // Assuming 2 is manager
const isSales = checkRoles([3]); // Assuming 3 is sales
const isAdminOrManager = checkRoles([1, 2]); // Admin or Manager
const isManagerOrSales = checkRoles([2, 3]); // Manager or Sales
const isAdminOrSales = checkRoles([1, 3]); // Admin or Sales
const allRoles = checkRoles([1, 2, 3]); // All roles

export {
  checkRoles,
  isAdmin,
  isManager,
  isSales,
  isAdminOrManager,
  isManagerOrSales,
  isAdminOrSales,
  allRoles
};

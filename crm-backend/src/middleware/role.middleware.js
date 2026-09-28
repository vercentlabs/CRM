/**
 * Role-based access control middleware
 * Accepts an array of allowed role IDs
 * Compares with req.user.roleId
 * Returns 403 if user doesn't have required role
 * 
 * @param {Array} allowedRoles - Array of role IDs that are allowed to access the resource
 * @returns {Function} Express middleware function
 */
const checkRole = (allowedRoles) => {
  return (req, res, next) => {
    // Check if user exists in the request
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Check if user's role is in the allowed roles array
    if (!allowedRoles.includes(req.user.roleId)) {
      return res.status(403).json({ 
        message: 'Access denied. Insufficient permissions.',
        requiredRoles: allowedRoles,
        userRole: req.user.roleId
      });
    }

    // User has required role, proceed to next middleware
    next();
  };
};

export default checkRole;

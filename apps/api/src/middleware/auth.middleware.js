import jwt from 'jsonwebtoken';

/**
 * Authentication middleware that verifies JWT tokens
 * Reads token from Authorization header (Bearer token)
 * Verifies token using JWT_SECRET
 * If invalid or missing → 401
 * Attaches user info to req.user
 * Calls next()
 */
const authenticateToken = (req, res, next) => {
  // Get the Authorization header
  const authHeader = req.headers['authorization'];

  // Check if the Authorization header exists and has the Bearer token format
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  // Extract the token from the header
  const token = authHeader.split(' ')[1];

  try {
    // Verify the token using the JWT_SECRET
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach user info to the request object
    req.user = {
      userId: decoded.userId,
      roleId: decoded.roleId
    };

    // Call the next middleware
    next();
  } catch (error) {
    // If token is invalid or expired
    return res.status(401).json({ message: 'Invalid token.' });
  }
};

export default authenticateToken;

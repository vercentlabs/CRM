// Legacy routes keep importing `authenticateToken`; it is now the Phase 2
// session-backed middleware (verified user + active membership + tenant context).
// Pre-Phase-2 24h tokens carry no session and are rejected with 401.
import { authenticate } from '../platform/auth/middleware.js';

export { requirePermission, requireAnyPermission, requireScope } from '../platform/auth/middleware.js';

export default authenticate;

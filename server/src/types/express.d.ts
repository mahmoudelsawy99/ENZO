import type { TenantAccess } from '../modules/access/access.types.js';
import type { UserType } from '../modules/users/user.model.js';

export interface AuthContext {
  userId: string;
  userType: UserType;
  tenantId: string | null;
  sessionId: string;
}

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      auth?: AuthContext;
      access?: TenantAccess;
      validated?: unknown;
    }
  }
}

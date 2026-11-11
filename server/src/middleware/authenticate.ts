import type { NextFunction, Request, Response } from 'express';
import { Session } from '../modules/sessions/session.model.js';
import { Tenant } from '../modules/tenants/tenant.model.js';
import { User } from '../modules/users/user.model.js';
import { readAccessToken } from '../shared/crypto.js';
import { HttpError } from '../shared/http-error.js';

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.header('authorization') ?? '';
    const match = /^Bearer\s+(\S+)$/i.exec(header);
    if (!match?.[1]) {
      throw new HttpError(401, 'unauthenticated', 'Sign in is required.');
    }

    let claims;
    try {
      claims = readAccessToken(match[1]);
    } catch {
      throw new HttpError(401, 'unauthenticated', 'Sign in is required.');
    }

    const user = await User.findById(claims.sub);
    if (!user || user.status !== 'ACTIVE') {
      throw new HttpError(403, 'account_unavailable', 'This account cannot access the platform.');
    }

    const session = await Session.findById(claims.sid);
    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now() || String(session.userId) !== user.id) {
      throw new HttpError(401, 'session_revoked', 'This session is no longer valid.');
    }

    if (user.userType === 'TENANT_USER') {
      const tenant = user.tenantId ? await Tenant.findById(user.tenantId) : null;
      if (!tenant || tenant.status !== 'ACTIVE') {
        throw new HttpError(403, 'tenant_unavailable', 'This barbershop cannot access the platform.');
      }
    }

    req.auth = {
      userId: user.id,
      userType: user.userType,
      tenantId: user.tenantId ? String(user.tenantId) : null,
      sessionId: session.id,
    };
    next();
  } catch (error) {
    next(error);
  }
}

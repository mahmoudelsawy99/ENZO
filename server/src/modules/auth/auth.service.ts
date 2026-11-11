import { PasswordReset } from './password-reset.model.js';
import { Tenant } from '../tenants/tenant.model.js';
import { User } from '../users/user.model.js';
import { normalizeEmail, toPublicUser, type PublicUser } from '../users/user.service.js';
import {
  issueSession,
  revokeAllForUser,
  revokeByRawToken,
  revokeSession,
  rotateRefreshToken,
  type IssuedSession,
} from '../sessions/session.service.js';
import { HttpError } from '../../shared/http-error.js';
import { hashPassword, verifyAgainstDummy, verifyPassword } from '../../shared/password.js';
import { randomToken, sha256 } from '../../shared/crypto.js';

const INVALID = new HttpError(401, 'invalid_credentials', 'The email or password is incorrect.');
const RESET_WINDOW_MS = 30 * 60 * 1000;

async function assertTenantAccess(tenantId: unknown): Promise<void> {
  const tenant = tenantId ? await Tenant.findById(tenantId) : null;
  if (!tenant || tenant.status !== 'ACTIVE') {
    throw new HttpError(403, 'tenant_unavailable', 'This barbershop cannot access the platform.');
  }
}

export async function login(
  input: { email: string; password: string; rememberMe: boolean },
  meta: { userAgent: string; ip: string },
): Promise<IssuedSession> {
  const user = await User.findOne({ email: normalizeEmail(input.email) }).select('+passwordHash');
  if (!user) {
    await verifyAgainstDummy(input.password);
    throw INVALID;
  }

  const passwordMatches = await verifyPassword(input.password, user.passwordHash);
  if (!passwordMatches) {
    if (user.status === 'ACTIVE') {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= 5) {
        user.status = 'LOCKED';
        user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      }
      await user.save();
    }
    throw INVALID;
  }

  if (user.status === 'INACTIVE') {
    throw new HttpError(403, 'account_unavailable', 'This account cannot access the platform.');
  }
  if (user.status === 'LOCKED') {
    const lockedUntil = user.lockedUntil;
    if (!lockedUntil || lockedUntil.getTime() > Date.now()) {
      throw new HttpError(403, 'account_locked', 'This account is temporarily locked.');
    }
  }
  if (user.userType === 'TENANT_USER') {
    await assertTenantAccess(user.tenantId);
  }

  user.status = 'ACTIVE';
  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
  user.lastLoginAt = new Date();
  await user.save();
  return issueSession(user, input.rememberMe, meta);
}

export async function refresh(rawToken: string | undefined, meta: { userAgent: string; ip: string }): Promise<IssuedSession> {
  if (!rawToken) {
    throw new HttpError(401, 'unauthenticated', 'Sign in is required.');
  }
  const next = await rotateRefreshToken(rawToken, meta);
  try {
    if (next.user.userType === 'TENANT_USER') {
      const user = await User.findById(next.user.id);
      await assertTenantAccess(user?.tenantId);
    }
    return next;
  } catch (error) {
    await revokeSession(next.sessionId);
    throw error;
  }
}

export async function logout(sessionId: string | undefined, rawToken: string | undefined): Promise<void> {
  if (sessionId) {
    await revokeSession(sessionId);
  }
  await revokeByRawToken(rawToken);
}

export async function logoutAll(userId: string): Promise<void> {
  await revokeAllForUser(userId);
}

export async function currentUser(userId: string): Promise<PublicUser> {
  const user = await User.findById(userId);
  if (!user || user.status !== 'ACTIVE') {
    throw new HttpError(403, 'account_unavailable', 'This account cannot access the platform.');
  }
  return toPublicUser(user);
}

export async function forgotPassword(email: string): Promise<void> {
  const user = await User.findOne({ email: normalizeEmail(email) });
  if (!user || user.status === 'INACTIVE') {
    return;
  }
  const token = randomToken();
  pendingResetTokens.set(user.id, token);
  await PasswordReset.updateMany({ userId: user._id, usedAt: null }, { $set: { usedAt: new Date() } });
  await PasswordReset.create({
    userId: user._id,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + RESET_WINDOW_MS),
  });
}

/**
 * Raw reset tokens exist only in memory for the current process so tests and a future
 * mailer can collect them. They are never written to logs or API responses.
 * The database stores the hash only.
 */
const pendingResetTokens = new Map<string, string>();

export function takeResetTokenForDelivery(userId: string): string | undefined {
  const token = pendingResetTokens.get(userId);
  pendingResetTokens.delete(userId);
  return token;
}

export async function resetPassword(token: string, password: string): Promise<void> {
  const reset = await PasswordReset.findOne({ tokenHash: sha256(token), usedAt: null, expiresAt: { $gt: new Date() } });
  if (!reset) {
    throw new HttpError(400, 'invalid_reset', 'This reset link is invalid or has expired.');
  }
  const user = await User.findById(reset.userId).select('+passwordHash');
  if (!user || user.status === 'INACTIVE') {
    throw new HttpError(400, 'invalid_reset', 'This reset link is invalid or has expired.');
  }
  user.passwordHash = await hashPassword(password);
  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
  if (user.status === 'LOCKED') {
    user.status = 'ACTIVE';
  }
  reset.usedAt = new Date();
  await user.save();
  await reset.save();
  await revokeAllForUser(user.id);
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) {
    throw new HttpError(401, 'unauthenticated', 'Sign in is required.');
  }
  const matches = await verifyPassword(currentPassword, user.passwordHash);
  if (!matches) {
    throw new HttpError(400, 'invalid_password', 'The current password is incorrect.');
  }
  if (currentPassword === newPassword) {
    throw new HttpError(400, 'validation_error', 'Choose a different password.');
  }
  user.passwordHash = await hashPassword(newPassword);
  await user.save();
  await revokeAllForUser(user.id);
}

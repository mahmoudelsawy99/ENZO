import type { Request } from 'express';
import { env } from '../../config/env.js';
import { HttpError } from '../../shared/http-error.js';
import { randomToken, sha256, signAccessToken } from '../../shared/crypto.js';
import { User, type UserType } from '../users/user.model.js';
import { toPublicUser, type PublicUser } from '../users/user.service.js';
import { Session } from './session.model.js';

export interface IssuedSession {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  rememberMe: boolean;
  sessionId: string;
  user: PublicUser;
}

export function requestMeta(req: Request): { userAgent: string; ip: string } {
  return {
    userAgent: (req.get('user-agent') ?? '').slice(0, 200),
    ip: (req.ip ?? '').slice(0, 64),
  };
}

export async function issueSession(
  user: { id: string; userType: UserType },
  rememberMe: boolean,
  meta: { userAgent: string; ip: string },
): Promise<IssuedSession> {
  const loaded = await User.findById(user.id);
  if (!loaded) {
    throw new HttpError(401, 'unauthenticated', 'Sign in is required.');
  }
  const refreshToken = randomToken();
  const expiresAt = new Date(Date.now() + (rememberMe ? env.refreshRememberSeconds : env.refreshSessionSeconds) * 1000);
  const session = await Session.create({
    userId: loaded._id,
    tokenHash: sha256(refreshToken),
    expiresAt,
    rememberMe,
    userAgent: meta.userAgent,
    ip: meta.ip,
  });
  return {
    accessToken: signAccessToken({ sub: loaded.id, sid: session.id, userType: loaded.userType }),
    expiresIn: env.accessTtlSeconds,
    refreshToken,
    rememberMe,
    sessionId: session.id,
    user: toPublicUser(loaded),
  };
}

export async function rotateRefreshToken(rawToken: string, meta: { userAgent: string; ip: string }): Promise<IssuedSession> {
  const current = await Session.findOne({ tokenHash: sha256(rawToken) });
  if (!current || current.expiresAt.getTime() <= Date.now()) {
    throw new HttpError(401, 'unauthenticated', 'Sign in is required.');
  }
  if (current.revokedAt) {
    await Session.updateMany({ userId: current.userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
    throw new HttpError(401, 'session_reused', 'This session is no longer valid. Sign in again.');
  }

  const user = await User.findById(current.userId);
  if (!user || user.status !== 'ACTIVE') {
    current.revokedAt = new Date();
    await current.save();
    throw new HttpError(403, 'account_unavailable', 'This account cannot access the platform.');
  }

  const next = await issueSession(user, current.rememberMe, meta);
  const claimed = await Session.updateOne(
    { _id: current._id, revokedAt: null },
    { $set: { revokedAt: new Date(), replacedBySessionId: next.sessionId } },
  );
  if (claimed.modifiedCount !== 1) {
    await Session.updateOne({ _id: next.sessionId }, { $set: { revokedAt: new Date() } });
    await Session.updateMany({ userId: current.userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
    throw new HttpError(401, 'session_reused', 'This session is no longer valid. Sign in again.');
  }
  return next;
}

export async function revokeSession(sessionId: string): Promise<void> {
  await Session.updateOne({ _id: sessionId, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

export async function revokeByRawToken(rawToken: string | undefined): Promise<void> {
  if (!rawToken) {
    return;
  }
  await Session.updateOne({ tokenHash: sha256(rawToken), revokedAt: null }, { $set: { revokedAt: new Date() } });
}

export async function revokeAllForUser(userId: string): Promise<void> {
  await Session.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

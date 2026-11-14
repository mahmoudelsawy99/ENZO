import type { AuthUser, SessionData } from '../auth/auth.models';
import type { NileDatabase } from './local-database';
import { hashPassword, verifyPassword } from './local-crypto';
import { asDoc, dataOf, fail, num, one, remove, save, str, uid } from './local-repo';
import { markLocalWrite, type PersistedSession, readPersistedSession, setLocalUser, writePersistedSession } from './local-session';

const SESSION_HOURS = 12;
const REMEMBER_DAYS = 14;

function publicUser(row: { id: string; [key: string]: unknown }): AuthUser {
  return {
    id: row.id,
    fullName: str(row, 'fullName'),
    email: str(row, 'email'),
    phone: str(row, 'phone'),
    userType: str(row, 'userType') === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'TENANT_USER',
    tenantId: str(row, 'tenantId') || null,
    status: (str(row, 'status') || 'ACTIVE') as AuthUser['status'],
    isEmailVerified: row['isEmailVerified'] !== false,
    lastLoginAt: str(row, 'lastLoginAt') || null,
  };
}

function sessionFor(user: AuthUser, token: string): SessionData {
  return { accessToken: token, expiresIn: SESSION_HOURS * 3600, user };
}

export async function loginLocal(db: NileDatabase, email: string, password: string, remember: boolean): Promise<SessionData> {
  const users = await db.records.where('collection').equals('users').toArray();
  const row = users.map((item) => item.data).find((item) => str(item, 'email').toLowerCase() === email.trim().toLowerCase());
  if (!row || str(row, 'status') !== 'ACTIVE') {
    fail(401, 'invalid_credentials', 'The email or password is not valid.');
  }
  const valid = await verifyPassword(password, str(row, 'passwordSalt'), str(row, 'passwordHash'), num(row, 'passwordIterations') || 60_000);
  if (!valid) {
    fail(401, 'invalid_credentials', 'The email or password is not valid.');
  }
  const token = uid('session');
  const expiresAt = new Date(Date.now() + (remember ? REMEMBER_DAYS : 1) * 24 * 3600 * 1000).toISOString();
  const user = publicUser({ ...row, lastLoginAt: new Date().toISOString() });
  await save(db, 'users', asDoc(row.id, { ...row, lastLoginAt: user.lastLoginAt }));
  await save(db, 'sessions', asDoc(token, { userId: row.id, expiresAt }), true);
  writePersistedSession({ token, userId: row.id, expiresAt, remember });
  setLocalUser(row.id);
  markLocalWrite();
  return sessionFor(user, token);
}

export async function restoreLocal(db: NileDatabase): Promise<SessionData | null> {
  const persisted = readPersistedSession();
  if (!persisted || Date.parse(persisted.expiresAt) < Date.now()) {
    return null;
  }
  const session = await one(db, 'sessions', persisted.token);
  const user = await one(db, 'users', persisted.userId);
  if (!session || !user || str(user, 'status') !== 'ACTIVE' || Date.parse(str(session, 'expiresAt')) < Date.now()) {
    return null;
  }
  setLocalUser(user.id);
  return sessionFor(publicUser(user), persisted.token);
}

export async function logoutLocal(db: NileDatabase, token: string | null): Promise<void> {
  if (token) {
    await remove(db, 'sessions', token);
  }
  setLocalUser(null);
  markLocalWrite();
}

export async function changePasswordLocal(db: NileDatabase, userId: string, currentPassword: string, newPassword: string): Promise<void> {
  const user = await one(db, 'users', userId);
  if (!user) {
    fail(401, 'unauthenticated', 'Sign in is required.');
  }
  const valid = await verifyPassword(currentPassword, str(user, 'passwordSalt'), str(user, 'passwordHash'), num(user, 'passwordIterations') || 60_000);
  if (!valid) {
    fail(400, 'invalid_password', 'The current password is not valid.');
  }
  if (newPassword.length < 8) {
    fail(400, 'weak_password', 'Use at least 8 characters.');
  }
  const hashed = await hashPassword(newPassword);
  await save(db, 'users', asDoc(user.id, { ...user, passwordHash: hashed.hash, passwordSalt: hashed.salt, passwordIterations: hashed.iterations }));
  const sessions = await db.records.where('collection').equals('sessions').toArray();
  await Promise.all(sessions.filter((row) => str(row.data, 'userId') === userId).map((row) => remove(db, 'sessions', row.id)));
  markLocalWrite();
}

export async function resetUserPassword(db: NileDatabase, userId: string, password: string): Promise<void> {
  const user = await one(db, 'users', userId);
  if (!user) {
    fail(404, 'not_found', 'That user is not in the local database.');
  }
  if (password.length < 8) {
    fail(400, 'weak_password', 'Use at least 8 characters.');
  }
  const hashed = await hashPassword(password);
  await save(db, 'users', asDoc(user.id, { ...user, passwordHash: hashed.hash, passwordSalt: hashed.salt, passwordIterations: hashed.iterations }));
  markLocalWrite();
}

export function persistedToken(): PersistedSession | null {
  return readPersistedSession();
}

export function authPayload(session: SessionData): { data: SessionData } {
  return dataOf(session);
}

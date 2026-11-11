import { env } from '../../config/env.js';
import { hashPassword, isStrongPassword } from '../../shared/password.js';
import { User, type UserType } from './user.model.js';

export interface PublicUser {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  userType: UserType;
  tenantId: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'LOCKED';
  isEmailVerified: boolean;
  lastLoginAt: string | null;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function toPublicUser(user: {
  id: string;
  fullName: string;
  email: string;
  phone?: string | null;
  userType: UserType;
  tenantId?: { toString(): string } | null;
  status: PublicUser['status'];
  isEmailVerified: boolean;
  lastLoginAt?: Date | null;
}): PublicUser {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone ?? '',
    userType: user.userType,
    tenantId: user.tenantId ? String(user.tenantId) : null,
    status: user.status,
    isEmailVerified: user.isEmailVerified,
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
  };
}

export async function ensureSuperAdmin(): Promise<void> {
  if (!env.superAdminEmail || !env.superAdminPassword) {
    const existing = await User.exists({ userType: 'SUPER_ADMIN' });
    if (!existing) {
      console.warn('[enzo] No super admin exists. Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD to create one.');
    }
    return;
  }

  const email = normalizeEmail(env.superAdminEmail);
  const existing = await User.findOne({ email });
  if (existing) {
    return;
  }
  if (!isStrongPassword(env.superAdminPassword)) {
    console.error('[enzo] SUPER_ADMIN_PASSWORD does not meet the password policy. Super admin was not created.');
    return;
  }

  await User.create({
    fullName: env.superAdminName,
    email,
    passwordHash: await hashPassword(env.superAdminPassword),
    phone: '',
    userType: 'SUPER_ADMIN',
    tenantId: null,
    status: 'ACTIVE',
    isEmailVerified: true,
  });
  console.info(`[enzo] Super admin created for ${email}.`);
}

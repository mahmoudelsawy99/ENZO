import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { UserType } from '../modules/users/user.model.js';

export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export interface AccessClaims {
  sub: string;
  sid: string;
  userType: UserType;
}

export function signAccessToken(claims: AccessClaims): string {
  return jwt.sign({ sid: claims.sid, userType: claims.userType }, env.jwtAccessSecret, {
    expiresIn: env.accessTtlSeconds,
    issuer: 'enzo',
    subject: claims.sub,
  });
}

export function readAccessToken(token: string): AccessClaims {
  const decoded = jwt.verify(token, env.jwtAccessSecret, { issuer: 'enzo' });
  if (typeof decoded === 'string') {
    throw new Error('Unexpected token payload.');
  }
  const sid = decoded['sid'];
  const userType = decoded['userType'];
  if (!decoded.sub || typeof sid !== 'string' || (userType !== 'SUPER_ADMIN' && userType !== 'TENANT_USER')) {
    throw new Error('Incomplete token payload.');
  }
  return { sub: decoded.sub, sid, userType };
}

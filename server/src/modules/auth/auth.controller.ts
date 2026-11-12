import type { CookieOptions, Request, Response } from 'express';
import { env } from '../../config/env.js';
import { readValidated } from '../../middleware/validate-request.js';
import { asyncHandler } from '../../shared/async-handler.js';
import { readAccessToken } from '../../shared/crypto.js';
import type { IssuedSession } from '../sessions/session.service.js';
import { requestMeta } from '../sessions/session.service.js';
import { changePassword, currentUser, forgotPassword, login, logout, logoutAll, refresh, resetPassword } from './auth.service.js';
import type { changePasswordSchema, forgotSchema, loginSchema, resetSchema } from './auth.validation.js';
import type { z } from 'zod';

const REFRESH_COOKIE = 'enzo_refresh';
const RESET_ACK = 'If an account exists for that email, the reset request has been saved.';

function cookieFlags(req: Request): Pick<CookieOptions, 'secure' | 'sameSite'> {
  const secure = req.secure || env.cookieSecure;
  return {
    secure,
    sameSite: secure ? 'none' : 'lax',
  };
}

function cookieOptions(req: Request, rememberMe: boolean): CookieOptions {
  const options: CookieOptions = {
    httpOnly: true,
    ...cookieFlags(req),
    path: '/api/v1/auth',
  };
  if (rememberMe) {
    options.maxAge = env.refreshRememberSeconds * 1000;
  }
  return options;
}

function readRefreshCookie(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function sendSession(req: Request, res: Response, session: IssuedSession): void {
  res.cookie(REFRESH_COOKIE, session.refreshToken, cookieOptions(req, session.rememberMe));
  res.json({
    data: {
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
      user: session.user,
    },
  });
}

function clearRefreshCookie(req: Request, res: Response): void {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    ...cookieFlags(req),
    path: '/api/v1/auth',
  });
}

export const loginHandler = asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof loginSchema>>(req);
  const session = await login(body, requestMeta(req));
  sendSession(req, res, session);
});

export const refreshHandler = asyncHandler(async (req, res) => {
  const session = await refresh(readRefreshCookie(req), requestMeta(req));
  sendSession(req, res, session);
});

export const logoutHandler = asyncHandler(async (req, res) => {
  const header = req.header('authorization') ?? '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  let sessionId: string | undefined;
  if (match?.[1]) {
    try {
      sessionId = readAccessToken(match[1]).sid;
    } catch {
      sessionId = undefined;
    }
  }
  await logout(sessionId, readRefreshCookie(req));
  clearRefreshCookie(req, res);
  res.status(204).send();
});

export const logoutAllHandler = asyncHandler(async (req, res) => {
  if (!req.auth) {
    res.status(401).json({ error: { code: 'unauthenticated', message: 'Sign in is required.' } });
    return;
  }
  await logoutAll(req.auth.userId);
  clearRefreshCookie(req, res);
  res.status(204).send();
});

export const meHandler = asyncHandler(async (req, res) => {
  if (!req.auth) {
    res.status(401).json({ error: { code: 'unauthenticated', message: 'Sign in is required.' } });
    return;
  }
  res.json({ data: await currentUser(req.auth.userId) });
});

export const forgotHandler = asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof forgotSchema>>(req);
  await forgotPassword(body.email);
  res.json({ data: { message: RESET_ACK } });
});

export const resetHandler = asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof resetSchema>>(req);
  await resetPassword(body.token, body.password);
  res.json({ data: { message: 'Password updated. Sign in with the new password.' } });
});

export const changePasswordHandler = asyncHandler(async (req, res) => {
  if (!req.auth) {
    res.status(401).json({ error: { code: 'unauthenticated', message: 'Sign in is required.' } });
    return;
  }
  const { body } = readValidated<z.infer<typeof changePasswordSchema>>(req);
  await changePassword(req.auth.userId, body.currentPassword, body.newPassword);
  clearRefreshCookie(req, res);
  res.json({ data: { message: 'Password updated. Sign in again.' } });
});

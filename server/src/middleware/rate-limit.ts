import type { NextFunction, Request, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';

function limiter(max: number) {
  if (env.nodeEnv === 'test') {
    return (_req: Request, _res: Response, next: NextFunction): void => {
      next();
    };
  }

  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        error: {
          code: 'rate_limited',
          message: 'Too many attempts. Try again later.',
        },
      });
    },
  });
}

export const loginRateLimit = limiter(10);
export const resetRateLimit = limiter(5);
export const messagingRateLimit = limiter(30);

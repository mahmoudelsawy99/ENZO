import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';

/**
 * Attaches a correlation id and writes one structured line per response.
 * The line has no body, token, password, or message content.
 */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id')?.trim() ?? '';
  const requestId = /^[\w-]{8,80}$/.test(incoming) ? incoming : randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  if (env.nodeEnv !== 'test') {
    const started = Date.now();
    res.on('finish', () => {
      const tenantId = req.auth?.tenantId;
      const status = res.statusCode;
      console.info(JSON.stringify({
        level: status >= 500 ? 'error' : status === 401 || status === 403 ? 'warn' : 'info',
        msg: 'request',
        requestId,
        method: req.method,
        path: req.originalUrl.split('?')[0],
        status,
        ms: Date.now() - started,
        ...(tenantId ? { tenantId } : {}),
      }));
    });
  }
  next();
}

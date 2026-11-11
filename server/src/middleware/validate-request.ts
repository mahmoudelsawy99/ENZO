import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';
import { HttpError } from '../shared/http-error.js';

export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse({
      body: req.body && typeof req.body === 'object' ? req.body : {},
      query: req.query ?? {},
      params: req.params ?? {},
    });
    if (!parsed.success) {
      next(
        new HttpError(
          400,
          'validation_error',
          'Some fields need attention.',
          parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        ),
      );
      return;
    }
    req.validated = parsed.data;
    next();
  };
}

export function readValidated<T>(req: Request): T {
  return req.validated as T;
}

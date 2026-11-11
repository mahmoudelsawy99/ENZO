import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../shared/http-error.js';

export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.auth?.userType !== 'SUPER_ADMIN') {
    next(new HttpError(403, 'forbidden', 'This action is limited to the platform administrator.'));
    return;
  }
  next();
}

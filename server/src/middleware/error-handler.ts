import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { HttpError } from '../shared/http-error.js';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details === undefined ? {} : { details: err.details }),
      },
    });
    return;
  }

  if (err instanceof multer.MulterError) {
    res.status(400).json({
      error: {
        code: 'invalid_upload',
        message: 'The file could not be uploaded.',
      },
    });
    return;
  }

  if (err instanceof mongoose.Error.CastError) {
    res.status(400).json({
      error: {
        code: 'invalid_id',
        message: 'The identifier is not valid.',
      },
    });
    return;
  }

  const message = err instanceof Error ? err.message : 'unknown';
  console.error(JSON.stringify({ level: 'error', msg: 'unhandled', requestId: req.requestId ?? '', error: message.slice(0, 180) }));
  res.status(500).json({
    error: {
      code: 'internal_error',
      message: 'An unexpected error occurred.',
      ...(req.requestId ? { requestId: req.requestId } : {}),
    },
  });
}

import fs from 'node:fs';
import type { NextFunction, Request, Response } from 'express';
import { HttpError } from './http-error.js';

function isImage(buffer: Buffer): boolean {
  if (buffer.length < 12) {
    return false;
  }
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return true;
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return true;
  }
  if (buffer.subarray(0, 3).toString('ascii') === 'GIF') {
    return true;
  }
  return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
}

/** Rejects uploads whose bytes are not a PNG, JPEG, GIF, or WEBP image. */
export function verifyUploadedImage(req: Request, _res: Response, next: NextFunction): void {
  const file = req.file;
  if (!file?.path) {
    next();
    return;
  }
  let buffer: Buffer;
  try {
    buffer = fs.readFileSync(file.path);
  } catch {
    next(new HttpError(400, 'invalid_upload', 'The file could not be uploaded.'));
    return;
  }
  if (!isImage(buffer)) {
    fs.rmSync(file.path, { force: true });
    next(new HttpError(400, 'invalid_upload', 'Upload a PNG, JPEG, WEBP, or GIF image.'));
    return;
  }
  next();
}

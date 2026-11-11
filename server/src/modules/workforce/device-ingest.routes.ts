import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/async-handler.js';
import { HttpError } from '../../shared/http-error.js';
import { readValidated, validateBody } from '../../middleware/validate-request.js';
import { ingestDeviceEvent } from './workforce.service.js';
import { ingestSchema } from './workforce.validation.js';

/**
 * Normalized device contract. This is not a brand protocol.
 * A registered device proves itself with its key. The mock provider is the only adapter.
 */
export const deviceIngestRouter = Router();

deviceIngestRouter.post('/', validateBody(ingestSchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof ingestSchema>>(req);
  const apiKey = req.get('x-device-key') ?? '';
  if (!apiKey) {
    throw new HttpError(401, 'device_unauthorized', 'The device is not authorized.');
  }
  res.json({ data: await ingestDeviceEvent(body, apiKey) });
}));

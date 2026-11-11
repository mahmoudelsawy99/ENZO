import { Router } from 'express';
import { databaseState } from '../../config/database.js';

export const healthRouter = Router();

healthRouter.get('/live', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'enzo-api' });
});

healthRouter.get('/ready', (_req, res) => {
  const database = databaseState();
  const ready = database === 'connected';
  res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'unavailable', database });
});

healthRouter.get('/', (_req, res) => {
  const database = databaseState();
  res.status(200).json({
    status: 'ok',
    service: 'enzo-api',
    database,
    timestamp: new Date().toISOString(),
  });
});

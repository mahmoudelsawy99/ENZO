import { createApp } from './app.js';
import { connectDatabase, databaseState, disconnectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { Stock, StockMovement } from './modules/inventory/inventory.model.js';
import { TenantSubscription } from './modules/billing/billing.model.js';
import { ensureSuperAdmin } from './modules/users/user.service.js';
import { ensurePlans, grandfatherTenants } from './modules/billing/billing.service.js';
import { startJobWorker } from './modules/jobs/job.service.js';

/** HTTP entrypoint. Authentication secrets come from the environment. */
const app = createApp();

const server = app.listen(env.port, () => {
  console.info(`[enzo] API listening on http://localhost:${env.port}`);
});

void connectDatabase()
  .then(async () => {
    if (databaseState() === 'connected') {
      await ensureSuperAdmin();
      await ensurePlans();
      const grandfathered = await grandfatherTenants();
      if (grandfathered > 0) {
        console.info(`[enzo] Recorded legacy subscriptions for ${grandfathered} existing shops.`);
      }
      startJobWorker();
      const dropped = await StockMovement.syncIndexes();
      if (dropped.length > 0) {
        console.info(`[enzo] Rebuilt stock movement indexes: ${dropped.join(', ')}`);
      }
      const stockIndexes = await Stock.syncIndexes();
      if (stockIndexes.length > 0) {
        console.info(`[enzo] Rebuilt stock indexes: ${stockIndexes.join(', ')}`);
      }
      const subscriptionIndexes = await TenantSubscription.syncIndexes();
      if (subscriptionIndexes.length > 0) {
        console.info(`[enzo] Rebuilt subscription indexes: ${subscriptionIndexes.join(', ')}`);
      }
    }
  })
  .catch((error: unknown) => {
    console.error('[enzo] MongoDB connection failed. The API will keep running.', error);
  });

async function shutdown(signal: string): Promise<void> {
  console.info(`[enzo] Received ${signal}. Shutting down.`);
  server.close();
  await disconnectDatabase();
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

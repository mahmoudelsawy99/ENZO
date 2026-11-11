import dotenv from 'dotenv';
import { assertIsolatedDatabase } from '../src/shared/database-guard.js';

dotenv.config();
const uri = assertIsolatedDatabase(process.env['UAT_MONGODB_URI'] ?? 'mongodb://127.0.0.1:27017/enzo_uat', 'UAT reset');

async function main() {
  const mongoose = (await import('mongoose')).default;
  await mongoose.connect(uri);
  const name = mongoose.connection.db?.databaseName ?? '';
  if (!name.startsWith('enzo_uat') || name === 'enzo') {
    throw new Error(`Refusing to drop database "${name}".`);
  }
  await mongoose.connection.dropDatabase();
  console.info(`[enzo] Dropped isolated database ${name}.`);
  await mongoose.disconnect();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

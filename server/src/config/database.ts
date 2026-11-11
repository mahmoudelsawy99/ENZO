import mongoose from 'mongoose';
import { env } from './env.js';

export type DatabaseState = 'disabled' | 'connected' | 'disconnected';

/**
 * Connects when MONGODB_URI is configured.
 * The API still boots without MongoDB so the shell and health check can be developed locally.
 * Business collections are registered by their models when those modules load.
 */
export async function connectDatabase(): Promise<void> {
  if (!env.mongodbUri) {
    console.warn('[enzo] MONGODB_URI is not set. Starting without a database connection.');
    return;
  }

  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongodbUri, { maxPoolSize: env.mongoPoolSize, serverSelectionTimeoutMS: 10000 });
  console.info('[enzo] Connected to MongoDB.');
}

export function databaseState(): DatabaseState {
  if (!env.mongodbUri) {
    return 'disabled';
  }
  return mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

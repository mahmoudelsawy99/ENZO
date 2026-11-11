import dotenv from 'dotenv';

dotenv.config();

export interface AppEnv {
  nodeEnv: string;
  port: number;
  mongodbUri: string | null;
  clientOrigin: string;
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  accessTtlSeconds: number;
  refreshSessionSeconds: number;
  refreshRememberSeconds: number;
  cookieSecure: boolean;
  mongoPoolSize: number;
  superAdminEmail: string | null;
  superAdminPassword: string | null;
  superAdminName: string;
}

function readPort(value: string | undefined): number {
  const port = Number(value ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  return port;
}

function readPool(value: string | undefined): number {
  const pool = Number(value ?? 10);
  if (!Number.isInteger(pool) || pool < 1 || pool > 100) {
    throw new Error('MONGO_POOL_SIZE must be an integer between 1 and 100.');
  }
  return pool;
}

function requiredSecret(name: string): string {
  const value = process.env[name]?.trim() ?? '';
  if (value.length < 32) {
    throw new Error(`${name} must be a random string of at least 32 characters.`);
  }
  return value;
}

const nodeEnv = process.env['NODE_ENV']?.trim() || 'development';

export const env: AppEnv = {
  nodeEnv,
  port: readPort(process.env['PORT']),
  mongodbUri: process.env['MONGODB_URI']?.trim() || null,
  clientOrigin: process.env['CLIENT_ORIGIN']?.trim() || 'http://localhost:4200',
  jwtAccessSecret: requiredSecret('JWT_ACCESS_SECRET'),
  jwtRefreshSecret: requiredSecret('JWT_REFRESH_SECRET'),
  accessTtlSeconds: 15 * 60,
  refreshSessionSeconds: 12 * 60 * 60,
  refreshRememberSeconds: 14 * 24 * 60 * 60,
  cookieSecure: process.env['COOKIE_SECURE'] === 'true' || nodeEnv === 'production',
  mongoPoolSize: readPool(process.env['MONGO_POOL_SIZE']),
  superAdminEmail: process.env['SUPER_ADMIN_EMAIL']?.trim() || null,
  superAdminPassword: process.env['SUPER_ADMIN_PASSWORD'] ?? null,
  superAdminName: process.env['SUPER_ADMIN_NAME']?.trim() || 'Platform Admin',
};

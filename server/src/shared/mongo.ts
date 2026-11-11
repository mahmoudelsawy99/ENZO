import mongoose, { type ClientSession } from 'mongoose';

function transactionUnsupported(error: unknown): boolean {
  const messages: string[] = [];
  const visit = (value: unknown, depth: number): void => {
    if (!value || typeof value !== 'object' || depth > 4) {
      return;
    }
    if ('message' in value && typeof value.message === 'string') {
      messages.push(value.message);
    }
    if ('errmsg' in value && typeof value.errmsg === 'string') {
      messages.push(value.errmsg);
    }
    if ('originalError' in value) {
      visit(value.originalError, depth + 1);
    }
    if ('errorResponse' in value) {
      visit(value.errorResponse, depth + 1);
    }
  };
  visit(error, 0);
  const text = messages.join(' ');
  return (
    text.includes('Transaction numbers are only allowed') ||
    text.includes('does not support retryable writes') ||
    text.includes('replica set') ||
    text.includes('mongos')
  );
}

export async function runInTransaction<T>(work: (session: ClientSession | null) => Promise<T>): Promise<T> {
  let session: ClientSession;
  try {
    session = await mongoose.startSession();
  } catch (error) {
    if (transactionUnsupported(error)) {
      return work(null);
    }
    throw error;
  }

  try {
    let value: T | undefined;
    await session.withTransaction(async () => {
      value = await work(session);
    });
    if (value === undefined) {
      throw new Error('Transaction produced no result.');
    }
    return value;
  } catch (error) {
    if (transactionUnsupported(error)) {
      return work(null);
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

export function hasDuplicateKey(error: unknown, field: string): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 11000) {
    return false;
  }
  const keyPattern = 'keyPattern' in error && error.keyPattern && typeof error.keyPattern === 'object' ? error.keyPattern : null;
  return Boolean(keyPattern && field in keyPattern);
}

export function duplicateField(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 11000) {
    return null;
  }
  const keyPattern = 'keyPattern' in error && error.keyPattern && typeof error.keyPattern === 'object' ? error.keyPattern : null;
  if (!keyPattern) {
    return null;
  }
  return Object.keys(keyPattern)[0] ?? null;
}

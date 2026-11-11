import bcrypt from 'bcrypt';

const COST = 12;
let dummyHash: string | null = null;

export function isStrongPassword(value: string): boolean {
  return value.length >= 8 && value.length <= 72 && /[A-Za-z]/.test(value) && /\d/.test(value);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

/** Keeps unknown-email logins on a similar timing path without storing a guess. */
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHash ??= await bcrypt.hash('enzo-missing-user', COST);
  await bcrypt.compare(password, dummyHash);
}

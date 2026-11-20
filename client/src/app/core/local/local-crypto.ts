/**
 * Browser password hashing for the local shop account.
 *
 * This is not a security boundary. Anyone who can open this Windows profile, the
 * browser profile, the IndexedDB database, or a backup file can read or replace
 * the data. PBKDF2 only stops a person who finds a backup from seeing the
 * password itself. It does not stop them from editing sales, restoring a file,
 * or creating a new owner account in the database.
 */
const ITERATIONS = 60_000;

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

export async function hashPassword(password: string, saltHex?: string, iterations = ITERATIONS): Promise<{
  salt: string;
  hash: string;
  iterations: number;
}> {
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    key,
    256,
  );
  return { salt: saltHex ?? bytesToHex(salt), hash: bytesToHex(new Uint8Array(bits)), iterations };
}

export async function verifyPassword(password: string, salt: string, expected: string, iterations: number): Promise<boolean> {
  const actual = await hashPassword(password, salt, iterations);
  return actual.hash === expected;
}

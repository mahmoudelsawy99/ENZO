import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpError } from '../../shared/http-error.js';

function encryptionKey(): Buffer {
  const raw = process.env['WHATSAPP_ENCRYPTION_KEY']?.trim() ?? '';
  if (raw.length < 32) {
    throw new HttpError(409, 'whatsapp_key_missing', 'Set WHATSAPP_ENCRYPTION_KEY before storing WhatsApp credentials.');
  }
  return createHash('sha256').update(raw).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptSecret(stored: string): string {
  const [iv, tag, data] = stored.split('.');
  if (!iv || !tag || !data) {
    throw new HttpError(409, 'whatsapp_key_missing', 'Stored WhatsApp credentials could not be read.');
  }
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}

export function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function signaturesMatch(secret: string, raw: Buffer, header: string): boolean {
  const provided = header.startsWith('sha256=') ? header.slice(7) : header;
  const expected = createHmac('sha256', secret).update(raw).digest('hex');
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  return left.length === right.length && timingSafeEqual(left, right);
}

import { z } from 'zod';
import { isStrongPassword } from '../../shared/password.js';

const email = z.string().trim().email().max(160);
const password = z
  .string()
  .min(8)
  .max(72)
  .refine(isStrongPassword, 'Use 8 to 72 characters with at least one letter and one number.');

export const loginSchema = z.object({
  body: z.object({
    email,
    password: z.string().min(1).max(72),
    rememberMe: z.boolean().optional().default(false),
  }),
  query: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
});

export const forgotSchema = z.object({
  body: z.object({ email }),
  query: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
});

export const resetSchema = z.object({
  body: z.object({
    token: z.string().trim().min(20).max(200),
    password,
  }),
  query: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1).max(72),
    newPassword: password,
  }),
  query: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
});

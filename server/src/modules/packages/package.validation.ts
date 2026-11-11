import { z } from 'zod';
import { PACKAGE_STATUSES, VALIDITY_TYPES } from './package.model.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Choose a valid record.');

const localizedName = z.object({
  en: z.string().trim().min(2).max(120),
  ar: z.string().trim().max(120).optional().default(''),
});

const localizedText = z.object({
  en: z.string().trim().max(500).optional().default(''),
  ar: z.string().trim().max(500).optional().default(''),
});

const item = z.object({
  serviceId: objectId,
  quantity: z.number().int().min(1).max(999),
});

const packageBody = z
  .object({
    name: localizedName,
    description: localizedText.optional().default({ en: '', ar: '' }),
    image: z.string().trim().max(240).optional().default(''),
    items: z.array(item).min(1).max(30),
    price: z.number().min(0).max(1_000_000),
    validityType: z.enum(VALIDITY_TYPES),
    validityDays: z.number().int().min(1).max(3650).nullable().optional().default(null),
    fixedExpiryDate: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/).optional().default(''),
  })
  .superRefine((value, context) => {
    const ids = new Set<string>();
    for (const entry of value.items) {
      if (ids.has(entry.serviceId)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: 'Each service can appear once in a package.', path: ['items'] });
        break;
      }
      ids.add(entry.serviceId);
    }
    if (value.validityType === 'VALIDITY_DAYS' && !value.validityDays) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter how many days the package stays valid.', path: ['validityDays'] });
    }
    if (value.validityType === 'FIXED_EXPIRY' && !value.fixedExpiryDate) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Choose the expiry date.', path: ['fixedExpiryDate'] });
    }
  });

const listQuery = {
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().trim().max(80).optional().default(''),
};

export const listPackagesSchema = z.object({
  body: z.object({}).passthrough(),
  query: z.object({
    ...listQuery,
    status: z.union([z.enum(PACKAGE_STATUSES), z.literal('')]).optional().default(''),
  }),
  params: z.object({}).passthrough(),
});

export const createPackageSchema = z.object({
  body: packageBody,
  query: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
});

export const updatePackageSchema = z.object({
  body: packageBody,
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const packageIdSchema = z.object({
  body: z.object({}).passthrough(),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const packageStatusSchema = z.object({
  body: z.object({ status: z.enum(PACKAGE_STATUSES) }),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export type PackageBody = z.infer<typeof packageBody>;
export type ListPackagesQuery = z.infer<typeof listPackagesSchema>['query'];

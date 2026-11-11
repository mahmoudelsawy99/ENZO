import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Choose a valid record.');
const money = z.number().min(0).max(1_000_000);
const status = z.enum(['ACTIVE', 'INACTIVE']);
const names = z.object({
  en: z.string().trim().min(1).max(120),
  ar: z.string().trim().max(120).optional().default(''),
});

const pageQuery = {
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).optional().default(20),
};

export const listProductsSchema = z.object({
  body: z.object({}).passthrough(),
  query: z.object({
    ...pageQuery,
    search: z.string().trim().max(80).optional().default(''),
    status: z.union([status, z.literal('')]).optional().default(''),
    categoryId: z.union([objectId, z.literal('')]).optional().default(''),
    sort: z.enum(['name', 'sku', 'price']).optional().default('name'),
    direction: z.enum(['asc', 'desc']).optional().default('asc'),
  }),
  params: z.object({}).passthrough(),
});

export const categorySchema = z.object({
  body: z.object({ name: names, status }),
  query: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
});

export const categoryIdSchema = z.object({
  body: z.object({ name: names, status }),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const productSchema = z.object({
  body: z.object({
    name: names,
    sku: z.string().trim().min(1).max(40),
    barcode: z.string().trim().max(64).optional().default(''),
    description: z.object({
      en: z.string().trim().max(120).optional().default(''),
      ar: z.string().trim().max(120).optional().default(''),
    }),
    categoryId: objectId,
    brand: z.string().trim().max(80).optional().default(''),
    unit: z.string().trim().min(1).max(20),
    costPrice: money,
    sellingPrice: money,
    minimumStock: z.number().int().min(0).max(1_000_000),
    image: z.string().trim().max(200).optional().default(''),
    status,
  }),
  query: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
});

export const productIdSchema = z.object({
  body: z.object({}).passthrough(),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const updateProductSchema = productSchema.extend({
  params: z.object({ id: objectId }),
});

export const stockListSchema = z.object({
  body: z.object({}).passthrough(),
  query: z.object({
    ...pageQuery,
    branchId: objectId,
    search: z.string().trim().max(80).optional().default(''),
    alert: z.enum(['', 'low', 'out']).optional().default(''),
  }),
  params: z.object({}).passthrough(),
});

export const stockDetailSchema = z.object({
  body: z.object({}).passthrough(),
  query: z.object({ branchId: objectId }),
  params: z.object({ productId: objectId }),
});

export const adjustmentSchema = z.object({
  body: z.object({
    branchId: objectId,
    productId: objectId,
    direction: z.enum(['IN', 'OUT']),
    quantity: z.number().int().min(1).max(1_000_000),
    notes: z.string().trim().min(2).max(500),
  }),
  query: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
});

export const minimumSchema = z.object({
  body: z.object({
    branchId: objectId,
    productId: objectId,
    minimumStock: z.number().int().min(0).max(1_000_000),
  }),
  query: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
});

export const summarySchema = z.object({
  body: z.object({}).passthrough(),
  query: z.object({ branchId: z.union([objectId, z.literal('')]).optional().default('') }),
  params: z.object({}).passthrough(),
});

export const supplierSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(120),
    phone: z.string().trim().max(40).optional().default(''),
    email: z.string().trim().email().or(z.literal('')).optional().default(''),
    address: z.string().trim().max(240).optional().default(''),
    taxNumber: z.string().trim().max(40).optional().default(''),
    notes: z.string().trim().max(500).optional().default(''),
    status,
  }),
  query: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
});

export const updateSupplierSchema = supplierSchema.extend({ params: z.object({ id: objectId }) });

export const listSuppliersSchema = z.object({
  body: z.object({}).passthrough(),
  query: z.object({
    ...pageQuery,
    search: z.string().trim().max(80).optional().default(''),
    status: z.union([status, z.literal('')]).optional().default(''),
  }),
  params: z.object({}).passthrough(),
});

const purchaseItem = z.object({
  productId: objectId,
  quantity: z.number().int().min(1).max(1_000_000),
  unitCost: money,
});

export const purchaseSchema = z.object({
  body: z.object({
    branchId: objectId,
    supplierId: objectId,
    items: z.array(purchaseItem).min(1).max(40),
    discount: money.optional().default(0),
    purchaseDate: z.string().datetime(),
    notes: z.string().trim().max(500).optional().default(''),
  }),
  query: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
});

export const listPurchasesSchema = z.object({
  body: z.object({}).passthrough(),
  query: z.object({
    ...pageQuery,
    branchId: z.union([objectId, z.literal('')]).optional().default(''),
    supplierId: z.union([objectId, z.literal('')]).optional().default(''),
  }),
  params: z.object({}).passthrough(),
});

export const idSchema = z.object({
  body: z.object({}).passthrough(),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const paymentSchema = z.object({
  body: z.object({
    method: z.enum(['CASH', 'VISA', 'WALLET', 'INSTAPAY', 'OTHER']),
    amount: z.number().min(0.01).max(1_000_000),
    referenceNumber: z.string().trim().max(80).optional().default(''),
  }),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const returnSchema = z.object({
  body: z.object({
    reason: z.string().trim().min(2).max(500),
    items: z.array(z.object({
      productId: objectId,
      quantity: z.number().int().min(1).max(1_000_000),
    })).min(1).max(40),
  }),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const transferSchema = z.object({
  body: z.object({
    sourceBranchId: objectId,
    destinationBranchId: objectId,
    items: z.array(z.object({
      productId: objectId,
      quantity: z.number().int().min(1).max(1_000_000),
    })).min(1).max(40),
    notes: z.string().trim().max(500).optional().default(''),
  }),
  query: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
});

export const listTransfersSchema = z.object({
  body: z.object({}).passthrough(),
  query: z.object({ branchId: z.union([objectId, z.literal('')]).optional().default('') }),
  params: z.object({}).passthrough(),
});

export const alertListSchema = z.object({
  body: z.object({}).passthrough(),
  query: z.object({
    branchId: z.union([objectId, z.literal('')]).optional().default(''),
    status: z.union([z.enum(['ACTIVE', 'DISMISSED', 'RESOLVED']), z.literal('')]).optional().default('ACTIVE'),
  }),
  params: z.object({}).passthrough(),
});

export const alertStatusSchema = z.object({
  body: z.object({ status: z.enum(['DISMISSED', 'RESOLVED']) }),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

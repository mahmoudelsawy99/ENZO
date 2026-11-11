import { Schema, model, type InferSchemaType } from 'mongoose';

export const COMMISSION_SCOPES = ['TENANT', 'SERVICE', 'EMPLOYEE_SERVICE'] as const;
export type CommissionScope = (typeof COMMISSION_SCOPES)[number];

export const COMMISSION_KINDS = ['PERCENTAGE', 'FIXED'] as const;
export type CommissionKind = (typeof COMMISSION_KINDS)[number];

/**
 * Commission configuration only. A completed sale must copy the quoted rate
 * onto the sale itself so later edits do not rewrite history.
 */
const commissionSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    scope: { type: String, required: true, enum: COMMISSION_SCOPES },
    serviceCode: { type: String, default: '', trim: true, uppercase: true, maxlength: 40 },
    serviceName: { type: String, default: '', trim: true, maxlength: 120 },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
    kind: { type: String, required: true, enum: COMMISSION_KINDS },
    value: { type: Number, required: true, min: 0 },
    status: { type: String, required: true, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  },
  { timestamps: true },
);

commissionSchema.index(
  { tenantId: 1, scope: 1, serviceCode: 1, employeeId: 1 },
  { unique: true, partialFilterExpression: { status: 'ACTIVE' } },
);

export type CommissionDocument = InferSchemaType<typeof commissionSchema> & { _id: Schema.Types.ObjectId };
export const CommissionRule = model('CommissionRule', commissionSchema);

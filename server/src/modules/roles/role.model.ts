import { Schema, model, type InferSchemaType } from 'mongoose';

export const ROLE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type RoleStatus = (typeof ROLE_STATUSES)[number];

/**
 * A tenant-defined role. Business roles are data, not fixed application roles.
 * The owner role is marked isOwner and always carries the full catalog.
 */
const roleSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, default: '', trim: true, maxlength: 240 },
    permissions: { type: [String], required: true, default: [] },
    status: { type: String, required: true, enum: ROLE_STATUSES, default: 'ACTIVE' },
    isOwner: { type: Boolean, required: true, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

roleSchema.index({ tenantId: 1, name: 1 }, { unique: true });
roleSchema.index({ tenantId: 1, isOwner: 1 });

export type RoleDocument = InferSchemaType<typeof roleSchema> & { _id: Schema.Types.ObjectId };
export const Role = model('Role', roleSchema);

import { Schema, model, type InferSchemaType } from 'mongoose';

export const BRANCH_SCOPES = ['ALL', 'SELECTED'] as const;
export type BranchScope = (typeof BRANCH_SCOPES)[number];

/**
 * Grants a role to a user inside one tenant.
 * Branch scope is enforced on the assignment, not taken from the client as proof of access.
 * ALL is reserved for the owner role.
 */
const userRoleSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true },
    branchScope: { type: String, required: true, enum: BRANCH_SCOPES },
    branchIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Branch' }], default: [] },
    status: { type: String, required: true, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  },
  { timestamps: true },
);

userRoleSchema.index({ tenantId: 1, userId: 1, roleId: 1 }, { unique: true });

export type UserRoleDocument = InferSchemaType<typeof userRoleSchema> & { _id: Schema.Types.ObjectId };
export const UserRole = model('UserRole', userRoleSchema);

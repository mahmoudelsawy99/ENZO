import { Schema, model, type InferSchemaType } from 'mongoose';

export const ASSIGNMENT_STATUSES = ['ACTIVE', 'REMOVED'] as const;

/**
 * An employee can work in more than one branch.
 * Removing an assignment keeps the row so later attendance and sales history stay attached.
 */
const assignmentSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    assignedAt: { type: Date, required: true },
    removedAt: { type: Date, default: null },
    status: { type: String, required: true, enum: ASSIGNMENT_STATUSES, default: 'ACTIVE' },
    isPrimary: { type: Boolean, required: true, default: false },
  },
  { timestamps: true },
);

assignmentSchema.index(
  { tenantId: 1, employeeId: 1, branchId: 1 },
  { unique: true, partialFilterExpression: { status: 'ACTIVE' } },
);

export type AssignmentDocument = InferSchemaType<typeof assignmentSchema> & { _id: Schema.Types.ObjectId };
export const EmployeeBranch = model('EmployeeBranch', assignmentSchema);

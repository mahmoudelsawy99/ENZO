import { Schema, model, type InferSchemaType } from 'mongoose';

const auditSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true, trim: true, maxlength: 80 },
    entityType: { type: String, required: true, trim: true, maxlength: 40 },
    entityId: { type: String, required: true, trim: true, maxlength: 40 },
    summary: { type: String, required: true, trim: true, maxlength: 240 },
    changes: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditSchema.index({ tenantId: 1, entityType: 1, entityId: 1, createdAt: -1 });

export type AuditDocument = InferSchemaType<typeof auditSchema> & { _id: Schema.Types.ObjectId };
export const AuditLog = model('AuditLog', auditSchema);

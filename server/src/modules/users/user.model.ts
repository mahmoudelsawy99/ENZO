import { Schema, model, type InferSchemaType } from 'mongoose';

export const USER_TYPES = ['SUPER_ADMIN', 'TENANT_USER'] as const;
export type UserType = (typeof USER_TYPES)[number];

export const USER_STATUSES = ['ACTIVE', 'INACTIVE', 'LOCKED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/**
 * Login identity. An owner is a user and is not required to have an employee record.
 * An employee can exist without a user account. The link is stored on the employee.
 */
const userSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 160 },
    passwordHash: { type: String, required: true, select: false },
    phone: { type: String, default: '', trim: true, maxlength: 32 },
    userType: { type: String, required: true, enum: USER_TYPES },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
    status: { type: String, required: true, enum: USER_STATUSES, default: 'ACTIVE' },
    isEmailVerified: { type: Boolean, required: true, default: false },
    lastLoginAt: { type: Date, default: null },
    failedLoginAttempts: { type: Number, required: true, default: 0 },
    lockedUntil: { type: Date, default: null },
  },
  { timestamps: true },
);

userSchema.index({ email: 1 }, { unique: true });

export type UserDocument = InferSchemaType<typeof userSchema> & { _id: Schema.Types.ObjectId };
export const User = model('User', userSchema);

import { Schema, model, type InferSchemaType } from 'mongoose';

export const BRANCH_STATUSES = ['ACTIVE', 'INACTIVE', 'DISABLED'] as const;
export type BranchStatus = (typeof BRANCH_STATUSES)[number];

export const WEEK_DAYS = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];

const daySchema = new Schema(
  {
    isOpen: { type: Boolean, required: true },
    openingTime: { type: String, required: true, trim: true },
    closingTime: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const hoursShape = Object.fromEntries(WEEK_DAYS.map((day) => [day, { type: daySchema, required: true }]));

const branchSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 16 },
    address: { type: String, default: '', trim: true, maxlength: 240 },
    phone: { type: String, default: '', trim: true, maxlength: 32 },
    workingHours: { type: new Schema(hoursShape, { _id: false }), required: true },
    managerUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, required: true, enum: BRANCH_STATUSES, default: 'ACTIVE' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

branchSchema.index({ tenantId: 1, code: 1 }, { unique: true });
branchSchema.index({ tenantId: 1, status: 1, name: 1 });

export type BranchDocument = InferSchemaType<typeof branchSchema> & { _id: Schema.Types.ObjectId };
export const Branch = model('Branch', branchSchema);

export function defaultWorkingHours(): Record<WeekDay, { isOpen: boolean; openingTime: string; closingTime: string }> {
  const open = { isOpen: true, openingTime: '10:00', closingTime: '22:00' };
  const closed = { isOpen: false, openingTime: '10:00', closingTime: '22:00' };
  return {
    saturday: { ...open },
    sunday: { ...open },
    monday: { ...open },
    tuesday: { ...open },
    wednesday: { ...open },
    thursday: { ...open },
    friday: { ...closed },
  };
}

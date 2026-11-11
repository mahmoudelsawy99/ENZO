import { Schema, model, type InferSchemaType } from 'mongoose';

export const EMPLOYEE_STATUSES = ['ACTIVE', 'INACTIVE', 'TERMINATED'] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const SALARY_PERIODS = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;
export type SalaryPeriod = (typeof SALARY_PERIODS)[number];

const salarySchema = new Schema(
  {
    period: { type: String, required: true, enum: SALARY_PERIODS, default: 'MONTHLY' },
    basicSalary: { type: Number, required: true, default: 0, min: 0 },
    allowances: { type: Number, required: true, default: 0, min: 0 },
    tips: { type: Number, required: true, default: 0, min: 0 },
    deductions: { type: Number, required: true, default: 0, min: 0 },
  },
  { _id: false },
);

/**
 * Workforce record. A login account is optional and stored as userId.
 * National id is excluded from ordinary queries.
 * Commission amounts are resolved from commission rules, not stored as a payroll result.
 */
const employeeSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    employeeNumber: { type: String, required: true, trim: true, maxlength: 32 },
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, default: '', trim: true, lowercase: true, maxlength: 160 },
    phone: { type: String, default: '', trim: true, maxlength: 32 },
    profileImage: { type: String, default: '', trim: true, maxlength: 240 },
    nationalId: { type: String, default: '', trim: true, maxlength: 40, select: false },
    address: { type: String, default: '', trim: true, maxlength: 240 },
    dateOfBirth: { type: String, default: '', trim: true, maxlength: 10 },
    joiningDate: { type: String, required: true, trim: true, maxlength: 10 },
    employmentTypeId: { type: Schema.Types.ObjectId, ref: 'EmploymentType', required: true },
    jobTitleId: { type: Schema.Types.ObjectId, ref: 'JobTitle', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    salary: { type: salarySchema, required: true },
    status: { type: String, required: true, enum: EMPLOYEE_STATUSES, default: 'ACTIVE' },
    notes: { type: String, default: '', trim: true, maxlength: 1000 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

employeeSchema.index({ tenantId: 1, employeeNumber: 1 }, { unique: true });
employeeSchema.index({ tenantId: 1, status: 1, fullName: 1 });
employeeSchema.index(
  { tenantId: 1, email: 1 },
  { unique: true, partialFilterExpression: { email: { $gt: '' } } },
);
employeeSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { userId: { $type: 'objectId' } } });

export type EmployeeDocument = InferSchemaType<typeof employeeSchema> & { _id: Schema.Types.ObjectId };
export const Employee = model('Employee', employeeSchema);

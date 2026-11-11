import { Schema, model } from 'mongoose';

const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedBySessionId: { type: Schema.Types.ObjectId, ref: 'Session', default: null },
    rememberMe: { type: Boolean, required: true, default: false },
    userAgent: { type: String, default: '', maxlength: 200 },
    ip: { type: String, default: '', maxlength: 64 },
  },
  { timestamps: true },
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = model('Session', sessionSchema);

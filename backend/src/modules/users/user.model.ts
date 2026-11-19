import { Schema, type Types } from "mongoose";

export const USER_ROLES = ["admin", "sales_rep"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ["invited", "active", "disabled"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export interface UserDoc {
    _id: Types.ObjectId;
    name: string;
    email: string;
    // null until the invite is accepted
    passwordHash: string | null;
    role: UserRole;
    status: UserStatus;
    signatureHtml: string;
    invitedBy: Types.ObjectId | null;
    lastLoginAt: Date | null;
    // Consecutive failed sign-ins, and the lock they caused.
    loginFailures: number;
    lockedUntil: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export const userSchema = new Schema<UserDoc>(
    {
        name: { type: String, required: true, trim: true },
        email: { type: String, required: true, lowercase: true, trim: true },
        passwordHash: { type: String, default: null },
        role: { type: String, enum: USER_ROLES, required: true },
        status: { type: String, enum: USER_STATUSES, required: true },
        signatureHtml: { type: String, default: "" },
        invitedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
        lastLoginAt: { type: Date, default: null },
        loginFailures: { type: Number, default: 0 },
        lockedUntil: { type: Date, default: null },
    },
    { timestamps: true },
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1, status: 1 });

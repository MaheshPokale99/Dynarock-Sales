import { Schema, type Types } from "mongoose";

export interface SessionDoc {
    _id: Types.ObjectId;
    userId: Types.ObjectId;
    // sha256 of the cookie value
    tokenHash: string;
    userAgent: string;
    ip: string;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export const sessionSchema = new Schema<SessionDoc>(
    {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        tokenHash: { type: String, required: true },
        userAgent: { type: String, default: "" },
        ip: { type: String, default: "" },
        expiresAt: { type: Date, required: true },
    },
    { timestamps: true },
);

sessionSchema.index({ tokenHash: 1 }, { unique: true });
sessionSchema.index({ userId: 1 });
// MongoDB removes a session by itself once it expires.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export interface InviteDoc {
    _id: Types.ObjectId;
    userId: Types.ObjectId;
    email: string;
    tokenHash: string;
    invitedBy: Types.ObjectId;
    expiresAt: Date;
    acceptedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export const inviteSchema = new Schema<InviteDoc>(
    {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        email: { type: String, required: true, lowercase: true, trim: true },
        tokenHash: { type: String, required: true },
        invitedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
        expiresAt: { type: Date, required: true },
        acceptedAt: { type: Date, default: null },
    },
    { timestamps: true },
);

inviteSchema.index({ tokenHash: 1 }, { unique: true });
inviteSchema.index({ userId: 1 });
inviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

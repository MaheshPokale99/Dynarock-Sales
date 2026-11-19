import { Schema, type Types } from "mongoose";

export const MAILBOX_STATUSES = ["connected", "error", "disconnected"] as const;
export type MailboxStatus = (typeof MAILBOX_STATUSES)[number];

export interface MailboxDoc {
    _id: Types.ObjectId;
    email: string;
    provider: "gmail";
    status: MailboxStatus;
    // Tokens are AES-GCM encrypted with ENCRYPTION_KEY.
    auth: { refreshTokenEnc: string; accessTokenEnc: string; expiresAt: Date; scopes: string[] } | null;
    historyId: string | null;
    lastSyncAt: Date | null;
    lastError: string | null;
    connectedBy: Types.ObjectId | null;
    connectedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export const mailboxSchema = new Schema<MailboxDoc>(
    {
        email: { type: String, required: true, lowercase: true },
        provider: { type: String, enum: ["gmail"], default: "gmail" },
        status: { type: String, enum: MAILBOX_STATUSES, required: true },
        auth: {
            type: new Schema(
                { refreshTokenEnc: String, accessTokenEnc: String, expiresAt: Date, scopes: [String] },
                { _id: false },
            ),
            default: null,
        },
        historyId: { type: String, default: null },
        lastSyncAt: { type: Date, default: null },
        lastError: { type: String, default: null },
        connectedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
        connectedAt: { type: Date, default: null },
    },
    { timestamps: true },
);

mailboxSchema.index({ email: 1 }, { unique: true });

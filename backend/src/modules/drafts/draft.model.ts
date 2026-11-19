import { Schema, type Types } from "mongoose";

export const COMPOSE_MODES = ["new", "reply", "reply_all", "forward"] as const;
export type ComposeMode = (typeof COMPOSE_MODES)[number];

export interface DraftAttachmentDoc {
    fileId: Types.ObjectId;
    filename: string;
    mimeType: string;
    size: number;
}

export const draftAttachmentSchema = new Schema<DraftAttachmentDoc>(
    { fileId: Schema.Types.ObjectId, filename: String, mimeType: String, size: Number },
    { _id: false },
);

export interface DraftDoc {
    _id: Types.ObjectId;
    userId: Types.ObjectId;
    mode: ComposeMode;
    threadId: Types.ObjectId | null;
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    html: string;
    attachments: DraftAttachmentDoc[];
    createdAt: Date;
    updatedAt: Date;
}

export const draftSchema = new Schema<DraftDoc>(
    {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        mode: { type: String, enum: COMPOSE_MODES, default: "new" },
        threadId: { type: Schema.Types.ObjectId, ref: "Thread", default: null },
        to: { type: [String], default: [] },
        cc: { type: [String], default: [] },
        bcc: { type: [String], default: [] },
        subject: { type: String, default: "" },
        html: { type: String, default: "" },
        attachments: { type: [draftAttachmentSchema], default: [] },
    },
    { timestamps: true },
);

draftSchema.index({ userId: 1, updatedAt: -1 });

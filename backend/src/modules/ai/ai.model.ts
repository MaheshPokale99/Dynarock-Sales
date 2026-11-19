import { Schema, type Types } from "mongoose";

export const INTENTS = [
    "interested",
    "demo_request",
    "question",
    "pricing",
    "objection",
    "not_now",
    "not_interested",
    "out_of_office",
    "unsubscribe",
    "bounce",
    "other",
] as const;
export type Intent = (typeof INTENTS)[number];

export const SUGGESTION_STATUSES = ["pending", "sent", "rejected", "superseded"] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

// AI reply drafts waiting for a person to approve.
export interface SuggestionDoc {
    _id: Types.ObjectId;
    threadId: Types.ObjectId;
    forMessageId: Types.ObjectId;
    contactIds: Types.ObjectId[];
    intent: Intent | null;
    subject: string;
    html: string;
    rationale: string;
    warnings: string[];
    status: SuggestionStatus;
    reviewedBy: Types.ObjectId | null;
    reviewedAt: Date | null;
    rejectionReason: string;
    editedBeforeSend: boolean;
    sentMessageId: Types.ObjectId | null;
    model: string;
    createdAt: Date;
    updatedAt: Date;
}

export const suggestionSchema = new Schema<SuggestionDoc>(
    {
        threadId: { type: Schema.Types.ObjectId, ref: "Thread", required: true },
        forMessageId: { type: Schema.Types.ObjectId, ref: "Message", required: true },
        contactIds: { type: [Schema.Types.ObjectId], default: [] },
        intent: { type: String, enum: [...INTENTS, null], default: null },
        subject: { type: String, default: "" },
        html: { type: String, required: true },
        rationale: { type: String, default: "" },
        warnings: { type: [String], default: [] },
        status: { type: String, enum: SUGGESTION_STATUSES, default: "pending" },
        reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
        reviewedAt: { type: Date, default: null },
        rejectionReason: { type: String, default: "" },
        editedBeforeSend: { type: Boolean, default: false },
        sentMessageId: { type: Schema.Types.ObjectId, default: null },
        model: { type: String, default: "" },
    },
    { timestamps: true },
);

suggestionSchema.index({ status: 1, createdAt: -1 });
suggestionSchema.index({ threadId: 1, status: 1 });
suggestionSchema.index({ forMessageId: 1 }, { unique: true });

export const AI_KINDS = ["compose", "rewrite", "classify", "reply", "summary"] as const;
export type AiKind = (typeof AI_KINDS)[number];

// One row per model call, for cost and reliability tracking.
export interface AiRunDoc {
    _id: Types.ObjectId;
    kind: AiKind;
    userId: Types.ObjectId | null;
    model: string;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
    ok: boolean;
    error: string | null;
    createdAt: Date;
}

export const aiRunSchema = new Schema<AiRunDoc>(
    {
        kind: { type: String, enum: AI_KINDS, required: true },
        userId: { type: Schema.Types.ObjectId, default: null },
        model: { type: String, default: "" },
        inputTokens: { type: Number, default: 0 },
        outputTokens: { type: Number, default: 0 },
        durationMs: { type: Number, default: 0 },
        ok: { type: Boolean, required: true },
        error: { type: String, default: null },
    },
    { timestamps: { createdAt: true, updatedAt: false } },
);

aiRunSchema.index({ createdAt: -1 });

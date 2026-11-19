import { Schema, type Types } from "mongoose";

export interface SendWindow {
    // 0 = Sunday ... 6 = Saturday
    days: number[];
    startHour: number;
    endHour: number;
    timezone: string;
}

export interface SettingsDoc {
    _id: string;
    automationPaused: boolean;
    dailySendCap: number;
    sendWindow: SendWindow;
    defaultSequenceId: Types.ObjectId | null;
    updatedBy: Types.ObjectId | null;
    updatedAt: Date;
}

export const DEFAULT_WINDOW: SendWindow = {
    days: [1, 2, 3, 4, 5, 6],
    startHour: 9,
    endHour: 18,
    timezone: "Asia/Kolkata",
};

export const settingsSchema = new Schema<SettingsDoc>(
    {
        _id: { type: String },
        automationPaused: { type: Boolean, default: false },
        dailySendCap: { type: Number, default: 300 },
        sendWindow: {
            type: new Schema({ days: [Number], startHour: Number, endHour: Number, timezone: String }, { _id: false }),
            default: () => DEFAULT_WINDOW,
        },
        defaultSequenceId: { type: Schema.Types.ObjectId, default: null },
        updatedBy: { type: Schema.Types.ObjectId, default: null },
    },
    { timestamps: { createdAt: false, updatedAt: true }, versionKey: false },
);

export interface SequenceStep {
    // Days after the previous email (with no reply) before this one goes out.
    delayDays: number;
    // What the AI should write for this step.
    instruction: string;
    // Fixed text instead of AI (also the fallback when AI is off).
    fixedText: string;
}

export interface SequenceDoc {
    _id: Types.ObjectId;
    name: string;
    description: string;
    active: boolean;
    steps: SequenceStep[];
    createdBy: Types.ObjectId | null;
    createdAt: Date;
    updatedAt: Date;
}

export const sequenceSchema = new Schema<SequenceDoc>(
    {
        name: { type: String, required: true, trim: true },
        description: { type: String, default: "" },
        active: { type: Boolean, default: true },
        steps: {
            type: [new Schema({ delayDays: Number, instruction: String, fixedText: String }, { _id: false })],
            default: [],
        },
        createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    },
    { timestamps: true },
);

export const ENROLLMENT_STATUSES = ["active", "paused", "completed", "stopped"] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];
export const STOP_REASONS = ["replied", "unsubscribed", "bounced", "manual", "failed"] as const;
export type StopReason = (typeof STOP_REASONS)[number];

// One conversation following one plan.
export interface EnrollmentDoc {
    _id: Types.ObjectId;
    sequenceId: Types.ObjectId;
    threadId: Types.ObjectId;
    contactId: Types.ObjectId | null;
    status: EnrollmentStatus;
    stopReason: StopReason | null;
    // Steps already sent (0 = only the first email so far).
    currentStep: number;
    enrolledBy: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

export const enrollmentSchema = new Schema<EnrollmentDoc>(
    {
        sequenceId: { type: Schema.Types.ObjectId, ref: "Sequence", required: true },
        threadId: { type: Schema.Types.ObjectId, ref: "Thread", required: true },
        contactId: { type: Schema.Types.ObjectId, ref: "Contact", default: null },
        status: { type: String, enum: ENROLLMENT_STATUSES, default: "active" },
        stopReason: { type: String, enum: [...STOP_REASONS, null], default: null },
        currentStep: { type: Number, default: 0 },
        enrolledBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    },
    { timestamps: true },
);

enrollmentSchema.index(
    { threadId: 1 },
    { unique: true, partialFilterExpression: { status: { $in: ["active", "paused"] } } },
);
enrollmentSchema.index({ status: 1 });

export const SCHEDULED_STATUSES = ["scheduled", "sending", "sent", "cancelled", "failed", "skipped"] as const;
export type ScheduledStatus = (typeof SCHEDULED_STATUSES)[number];

// Follow-ups and "send later" emails; also the send queue.
export interface ScheduledEmailDoc {
    _id: Types.ObjectId;
    kind: "follow_up" | "send_later";
    mode: "new" | "reply" | "reply_all" | "forward";
    threadId: Types.ObjectId | null;
    replyToMessageId: Types.ObjectId | null;
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    html: string;
    attachmentFileIds: Types.ObjectId[];
    sendAt: Date;
    status: ScheduledStatus;
    statusReason: string;
    enrollmentId: Types.ObjectId | null;
    step: number | null;
    aiGenerated: boolean;
    createdBy: Types.ObjectId;
    lastEditedBy: Types.ObjectId | null;
    sentMessageId: Types.ObjectId | null;
    attempts: number;
    createdAt: Date;
    updatedAt: Date;
}

export const scheduledEmailSchema = new Schema<ScheduledEmailDoc>(
    {
        kind: { type: String, enum: ["follow_up", "send_later"], required: true },
        mode: { type: String, enum: ["new", "reply", "reply_all", "forward"], default: "reply" },
        threadId: { type: Schema.Types.ObjectId, ref: "Thread", default: null },
        replyToMessageId: { type: Schema.Types.ObjectId, default: null },
        to: { type: [String], default: [] },
        cc: { type: [String], default: [] },
        bcc: { type: [String], default: [] },
        subject: { type: String, default: "" },
        html: { type: String, default: "" },
        attachmentFileIds: { type: [Schema.Types.ObjectId], default: [] },
        sendAt: { type: Date, required: true },
        status: { type: String, enum: SCHEDULED_STATUSES, default: "scheduled" },
        statusReason: { type: String, default: "" },
        enrollmentId: { type: Schema.Types.ObjectId, default: null },
        step: { type: Number, default: null },
        aiGenerated: { type: Boolean, default: false },
        createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
        lastEditedBy: { type: Schema.Types.ObjectId, default: null },
        sentMessageId: { type: Schema.Types.ObjectId, default: null },
        attempts: { type: Number, default: 0 },
    },
    { timestamps: true },
);

scheduledEmailSchema.index({ status: 1, sendAt: 1 });
scheduledEmailSchema.index({ threadId: 1, status: 1 });
scheduledEmailSchema.index({ enrollmentId: 1 });

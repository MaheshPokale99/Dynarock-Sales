import { Schema, type Types } from "mongoose";

export const THREAD_STATES = ["needs_reply", "awaiting_reply", "closed"] as const;
export type ThreadState = (typeof THREAD_STATES)[number];

export const MESSAGE_ORIGINS = ["app_compose", "app_reply", "app_forward", "gmail_external", "inbound"] as const;
export type MessageOrigin = (typeof MESSAGE_ORIGINS)[number];

export interface AddressDoc {
    email: string;
    name: string;
}

const addressSchema = new Schema<AddressDoc>({ email: String, name: String }, { _id: false });

export interface ThreadDoc {
    _id: Types.ObjectId;
    mailboxId: Types.ObjectId;
    gmailThreadId: string;
    subject: string;
    // Everyone in the conversation except our mailbox.
    participants: AddressDoc[];
    snippet: string;
    messageCount: number;
    lastMessageAt: Date;
    lastMessageDirection: "inbound" | "outbound";
    lastInboundAt: Date | null;
    lastOutboundAt: Date | null;
    state: ThreadState;
    unread: boolean;
    hasAttachments: boolean;
    // Team members who sent at least one message here.
    senderIds: Types.ObjectId[];
    startedBy: Types.ObjectId | null;
    contactIds: Types.ObjectId[];
    organizationId: Types.ObjectId | null;
    createdAt: Date;
    updatedAt: Date;
}

export const threadSchema = new Schema<ThreadDoc>(
    {
        mailboxId: { type: Schema.Types.ObjectId, ref: "Mailbox", required: true },
        gmailThreadId: { type: String, required: true },
        subject: { type: String, default: "" },
        participants: { type: [addressSchema], default: [] },
        snippet: { type: String, default: "" },
        messageCount: { type: Number, default: 0 },
        lastMessageAt: { type: Date, required: true },
        lastMessageDirection: { type: String, enum: ["inbound", "outbound"], required: true },
        lastInboundAt: { type: Date, default: null },
        lastOutboundAt: { type: Date, default: null },
        state: { type: String, enum: THREAD_STATES, required: true },
        unread: { type: Boolean, default: false },
        hasAttachments: { type: Boolean, default: false },
        senderIds: { type: [Schema.Types.ObjectId], default: [] },
        startedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
        contactIds: { type: [Schema.Types.ObjectId], default: [] },
        organizationId: { type: Schema.Types.ObjectId, ref: "Organization", default: null },
    },
    { timestamps: true },
);

threadSchema.index({ contactIds: 1, lastMessageAt: -1 });
threadSchema.index({ organizationId: 1, lastMessageAt: -1 });
threadSchema.index({ mailboxId: 1, gmailThreadId: 1 }, { unique: true });
threadSchema.index({ lastMessageAt: -1 });
threadSchema.index({ state: 1, lastMessageAt: -1 });
threadSchema.index({ senderIds: 1, lastMessageAt: -1 });
threadSchema.index({ "participants.email": 1 });

export interface AttachmentDoc {
    filename: string;
    mimeType: string;
    size: number;
    gmailAttachmentId: string;
}

export interface MessageDoc {
    _id: Types.ObjectId;
    threadId: Types.ObjectId;
    mailboxId: Types.ObjectId;
    gmailMessageId: string;
    rfcMessageId: string;
    inReplyTo: string | null;
    references: string[];
    direction: "inbound" | "outbound";
    from: AddressDoc;
    to: AddressDoc[];
    cc: AddressDoc[];
    bcc: AddressDoc[];
    subject: string;
    html: string;
    text: string;
    snippet: string;
    attachments: AttachmentDoc[];
    labelIds: string[];
    sentAt: Date;
    // Set when a team member sent it from the app.
    sentByUserId: Types.ObjectId | null;
    origin: MessageOrigin;
    isAutoReply: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export const messageSchema = new Schema<MessageDoc>(
    {
        threadId: { type: Schema.Types.ObjectId, ref: "Thread", required: true },
        mailboxId: { type: Schema.Types.ObjectId, ref: "Mailbox", required: true },
        gmailMessageId: { type: String, required: true },
        rfcMessageId: { type: String, default: "" },
        inReplyTo: { type: String, default: null },
        references: { type: [String], default: [] },
        direction: { type: String, enum: ["inbound", "outbound"], required: true },
        from: { type: addressSchema, required: true },
        to: { type: [addressSchema], default: [] },
        cc: { type: [addressSchema], default: [] },
        bcc: { type: [addressSchema], default: [] },
        subject: { type: String, default: "" },
        html: { type: String, default: "" },
        text: { type: String, default: "" },
        snippet: { type: String, default: "" },
        attachments: {
            type: [
                new Schema(
                    { filename: String, mimeType: String, size: Number, gmailAttachmentId: String },
                    { _id: false },
                ),
            ],
            default: [],
        },
        labelIds: { type: [String], default: [] },
        sentAt: { type: Date, required: true },
        sentByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
        origin: { type: String, enum: MESSAGE_ORIGINS, required: true },
        isAutoReply: { type: Boolean, default: false },
    },
    { timestamps: true },
);

messageSchema.index({ gmailMessageId: 1 }, { unique: true });
messageSchema.index({ threadId: 1, sentAt: 1 });
messageSchema.index({ direction: 1, sentAt: -1 });
messageSchema.index({ sentByUserId: 1, sentAt: -1 });

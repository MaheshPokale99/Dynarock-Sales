export type UserRole = "admin" | "sales_rep";
export type UserStatus = "invited" | "active" | "disabled";

export interface User {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    status: UserStatus;
    signatureHtml: string;
    invitedBy: string | null;
    lastLoginAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface TeamMember extends User {
    invite: { expiresAt: string; expired: boolean } | null;
}

export interface Invitation {
    user: User;
    inviteUrl: string;
    expiresAt: string;
}

export interface InviteDetails {
    name: string;
    email: string;
    expiresAt: string;
}

export interface Health {
    ok: boolean;
    gemini: { configured: boolean; model: string };
}

export interface MailboxStatus {
    configured: boolean;
    address: string;
    status: "not_configured" | "disconnected" | "connected" | "error";
    lastSyncAt: string | null;
    lastError: string | null;
    connectedAt: string | null;
    connectedBy: string | null;
}

export interface Address {
    email: string;
    name: string;
}

export type ThreadState = "needs_reply" | "awaiting_reply" | "closed";
export type ThreadFolder = "all" | "needs_reply" | "awaiting_reply" | "sent" | "unread" | "closed";

export interface Thread {
    id: string;
    subject: string;
    participants: Address[];
    snippet: string;
    messageCount: number;
    lastMessageAt: string;
    lastMessageDirection: "inbound" | "outbound";
    lastInboundAt: string | null;
    lastOutboundAt: string | null;
    state: ThreadState;
    unread: boolean;
    hasAttachments: boolean;
    senderIds: string[];
    startedBy: string | null;
}

export interface ThreadCounts {
    needs_reply: number;
    unread: number;
}

export interface ThreadPage {
    threads: Thread[];
    nextBefore: string | null;
    counts: ThreadCounts;
}

export interface MessageAttachment {
    index: number;
    filename: string;
    mimeType: string;
    size: number;
}

export interface Message {
    id: string;
    direction: "inbound" | "outbound";
    from: Address;
    to: Address[];
    cc: Address[];
    bcc: Address[];
    subject: string;
    html: string;
    snippet: string;
    attachments: MessageAttachment[];
    sentAt: string;
    sentByUserId: string | null;
    origin: "app_compose" | "app_reply" | "app_forward" | "gmail_external" | "inbound";
    isAutoReply: boolean;
}

export interface ThreadDetail {
    thread: Thread;
    messages: Message[];
}

export type ComposeMode = "new" | "reply" | "reply_all" | "forward";

export interface StoredFile {
    id: string;
    filename: string;
    mimeType: string;
    size: number;
}

export interface DraftAttachment {
    fileId: string;
    filename: string;
    mimeType: string;
    size: number;
}

export interface Draft {
    id: string;
    mode: ComposeMode;
    threadId: string | null;
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    html: string;
    attachments: DraftAttachment[];
    updatedAt: string;
}

export interface SendInput {
    mode: ComposeMode;
    threadId?: string;
    replyToMessageId?: string;
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    html: string;
    attachmentFileIds: string[];
    draftId?: string;
}

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
    contactIds: string[];
    organizationId: string | null;
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
    contacts: Contact[];
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

export type ContactStage =
    "new" | "contacted" | "replied" | "demo_scheduled" | "demo_done" | "proposal" | "negotiation" | "won" | "lost";
export type ContactRole =
    "principal" | "director" | "dean" | "registrar" | "it_head" | "trustee" | "faculty" | "admin_staff" | "other";
export type ContactStatus = "active" | "unsubscribed" | "bounced" | "do_not_contact";
export type OrganizationType =
    "university" | "engineering_college" | "degree_college" | "school" | "institute" | "other";

export interface Contact {
    id: string;
    email: string;
    name: string;
    role: ContactRole;
    designation: string;
    phone: string;
    organizationId: string | null;
    organization: { id: string; name: string } | null;
    stage: ContactStage;
    lostReason: string;
    ownerId: string | null;
    status: ContactStatus;
    source: "compose" | "inbound" | "manual" | "import";
    tags: string[];
    notes: string;
    lastContactedAt: string | null;
    lastRepliedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface ContactPage {
    items: Contact[];
    total: number;
    page: number;
    pageSize: number;
}

export interface Activity {
    id: string;
    action: string;
    actor: { type: "user" | "system" | "ai"; userId: string | null };
    threadId: string | null;
    meta: Record<string, unknown>;
    createdAt: string;
}

export interface ContactDetail {
    contact: Contact;
    threads: Thread[];
    activities: Activity[];
}

export interface ContactInput {
    email?: string;
    name?: string;
    role?: ContactRole;
    designation?: string;
    phone?: string;
    organizationId?: string | null;
    stage?: ContactStage;
    lostReason?: string;
    ownerId?: string | null;
    status?: ContactStatus;
    tags?: string[];
    notes?: string;
}

export interface Organization {
    id: string;
    name: string;
    type: OrganizationType;
    domain: string | null;
    website: string;
    city: string;
    state: string;
    country: string;
    studentCount: number | null;
    currentSystems: string;
    notes: string;
    tags: string[];
    contactCount: number;
    createdAt: string;
    updatedAt: string;
}

export type OrganizationInput = Partial<Omit<Organization, "id" | "contactCount" | "createdAt" | "updatedAt">>;

export interface OrganizationDetail {
    organization: Organization;
    contacts: Contact[];
    threads: Thread[];
}

export interface Pipeline {
    stages: { stage: ContactStage; total: number; contacts: Contact[] }[];
}

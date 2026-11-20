import {
    AppError,
    ConflictError,
    NotFoundError,
    UpstreamError,
    ValidationError,
} from "../../common/errors/app-error.js";
import type { Logger } from "../../common/logger/logger.js";
import { GmailError } from "../../integrations/gmail/gmail.types.js";
import { buildRawMessage, type OutgoingAttachment } from "../../integrations/gmail/mime.js";
import type { ActivitiesRepository } from "../activities/activities.repository.js";
import { startOfLocalDay } from "../automation/send-window.js";
import type { ContactsService } from "../contacts/contacts.service.js";
import type { ComposeMode } from "../drafts/draft.model.js";
import type { DraftsRepository } from "../drafts/drafts.repository.js";
import { MAX_UPLOAD_BYTES, type FilesService } from "../files/files.service.js";
import type { MailboxService } from "../mailbox/mailbox.service.js";
import type { User } from "../users/users.types.js";
import { toMessageDto, toThreadDto } from "./mail.dto.js";
import type { MessageDoc, MessageOrigin, ThreadDoc } from "./mail.model.js";
import type { MailRepository, ThreadQuery } from "./mail.repository.js";
import type { MailSyncService } from "./mail-sync.service.js";

const PAGE_SIZE = 30;
const MAX_REFERENCES = 20;
const MAX_RECIPIENTS = 50;
const LIMIT_TIMEZONE = "Asia/Kolkata";

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

const ORIGINS: Record<ComposeMode, MessageOrigin> = {
    new: "app_compose",
    reply: "app_reply",
    reply_all: "app_reply",
    forward: "app_forward",
};

function defaultSubject(mode: ComposeMode, threadSubject: string) {
    if (mode === "new") return "(no subject)";
    return `${mode === "forward" ? "Fwd" : "Re"}: ${threadSubject}`;
}

interface Deps {
    mail: MailRepository;
    sync: MailSyncService;
    mailbox: MailboxService;
    files: FilesService;
    drafts: DraftsRepository;
    activities: ActivitiesRepository;
    contacts: Pick<ContactsService, "blockedRecipients" | "forThread">;
    limits: { userDailySends: number; mailboxDailySends: number };
    logger: Logger;
    now?: () => Date;
}

export class MailService {
    private readonly now: () => Date;

    constructor(private readonly deps: Deps) {
        this.now = deps.now ?? (() => new Date());
    }

    async list(query: Omit<ThreadQuery, "limit">) {
        const threads = await this.deps.mail.listThreads({ ...query, limit: PAGE_SIZE + 1 });
        const page = threads.slice(0, PAGE_SIZE);
        const last = page.at(-1);
        const nextBefore =
            threads.length > PAGE_SIZE && last
                ? ((query.folder === "sent" ? last.lastOutboundAt : last.lastMessageAt)?.toISOString() ?? null)
                : null;
        return { threads: page.map(toThreadDto), nextBefore, counts: await this.deps.mail.counts() };
    }

    counts() {
        return this.deps.mail.counts();
    }

    async detail(threadId: string) {
        const thread = await this.requireThread(threadId);
        const messages = await this.deps.mail.messagesOf(thread._id, true);
        const contacts = await this.deps.contacts.forThread(thread.contactIds ?? []);
        const { version } = await this.deps.mail.counts();
        return { thread: toThreadDto(thread), messages: messages.map(toMessageDto), contacts, version };
    }

    async update(threadId: string, patch: { unread?: boolean; closed?: boolean }) {
        const thread = await this.requireThread(threadId);
        const state =
            patch.closed === undefined
                ? undefined
                : patch.closed
                  ? "closed"
                  : thread.lastMessageDirection === "inbound"
                    ? "needs_reply"
                    : "awaiting_reply";
        const updated = await this.deps.mail.updateThread(thread._id, {
            ...(patch.unread !== undefined ? { unread: patch.unread } : {}),
            ...(state ? { state } : {}),
        });
        if (patch.unread === false && thread.unread) void this.markReadInGmail(thread);
        return toThreadDto(updated ?? thread);
    }

    // options are for internal senders (follow-ups, scheduled emails), never from HTTP input.
    async send(user: User, input: SendInput, options: { origin?: MessageOrigin; listUnsubscribe?: string } = {}) {
        const recipients = [...new Set([...input.to, ...input.cc, ...input.bcc])];
        if (recipients.length === 0) throw new ValidationError("Add at least one recipient");
        if (recipients.length > MAX_RECIPIENTS) {
            throw new ValidationError(`One email can go to at most ${MAX_RECIPIENTS} people in total (To, Cc and Bcc)`);
        }
        await this.checkDailyLimits(user);
        const blocked = await this.deps.contacts.blockedRecipients(recipients);
        if (blocked.length > 0) {
            throw new ConflictError(
                `Can't email ${blocked.map((c) => c.email).join(", ")}.`,
                blocked.map(
                    (c) =>
                        `${c.email} is marked ${c.status.replace(/_/g, " ")}. Remove them or change it on their contact page.`,
                ),
            );
        }

        const { doc, api } = await this.deps.mailbox.connected();
        let thread: ThreadDoc | null = null;
        let base: MessageDoc | null = null;
        if (input.mode !== "new") {
            if (!input.threadId) throw new ValidationError("threadId is required to reply or forward");
            thread = await this.requireThread(input.threadId);
            const messages = await this.deps.mail.messagesOf(thread._id);
            base = input.replyToMessageId
                ? (messages.find((m) => m._id.toHexString() === input.replyToMessageId) ?? null)
                : (messages.at(-1) ?? null);
            if (!base) throw new NotFoundError("The message you're replying to was not found");
        }

        const attachments = await this.loadAttachments(input.attachmentFileIds, user);
        const raw = await buildRawMessage({
            from: { email: doc.email, name: `${user.name} (Dynarock)` },
            to: input.to,
            cc: input.cc,
            bcc: input.bcc,
            subject: input.subject.trim() || defaultSubject(input.mode, thread?.subject ?? ""),
            html: input.html,
            inReplyTo: base?.rfcMessageId,
            references: base ? [...base.references, base.rfcMessageId].slice(-MAX_REFERENCES) : undefined,
            attachments,
            listUnsubscribe: options.listUnsubscribe,
        });

        let sentId: string;
        try {
            sentId = (await api.send(raw, thread?.gmailThreadId)).id;
        } catch (error) {
            if (error instanceof AppError) throw error;
            this.deps.logger.error({ err: error }, "Gmail send failed");
            throw new UpstreamError(
                `Gmail couldn't send the email${error instanceof GmailError ? `: ${error.message}` : ""}. Nothing was sent; try again.`,
            );
        }

        const saved = await this.deps.sync.ingest(doc, await api.getMessage(sentId), {
            sentByUserId: user.id,
            origin: options.origin ?? ORIGINS[input.mode],
        });
        if (!saved)
            throw new UpstreamError("The email was sent but couldn't be saved. It will appear after the next sync.");

        if (input.draftId) await this.deps.drafts.deleteOwn(input.draftId, user.id);
        await this.deps.activities.record({
            actor: { type: "user", userId: user.id },
            action: "email.sent",
            threadId: saved.thread._id.toHexString(),
            entity: { type: "message", id: saved.message._id.toHexString() },
            meta: { mode: input.mode, recipients: recipients.length, attachments: attachments.length },
        });
        return { threadId: saved.thread._id.toHexString(), messageId: saved.message._id.toHexString() };
    }

    async attachment(messageId: string, index: number) {
        const message = await this.deps.mail.findMessage(messageId);
        const attachment = message?.attachments[index];
        if (!message || !attachment) throw new NotFoundError("Attachment not found");
        const { api } = await this.deps.mailbox.connected();
        const content = await api.getAttachment(message.gmailMessageId, attachment.gmailAttachmentId);
        return { filename: attachment.filename, mimeType: attachment.mimeType, content };
    }

    recipients(q: string) {
        return q.trim().length < 2 ? Promise.resolve([]) : this.deps.mail.recipientSuggestions(q.trim(), 8);
    }

    private async requireThread(id: string): Promise<ThreadDoc> {
        const thread = await this.deps.mail.findThread(id);
        if (!thread) throw new NotFoundError("Conversation not found");
        return thread;
    }

    private async loadAttachments(ids: string[], user: User): Promise<OutgoingAttachment[]> {
        if (ids.length === 0) return [];
        const files = await this.deps.files.readForSending(ids, user, MAX_UPLOAD_BYTES);
        return files.map((f) => ({ filename: f.filename, contentType: f.mimeType, content: f.content }));
    }

    // Caps what one person, and the shared mailbox as a whole, can send per day (India time).
    private async checkDailyLimits(user: User) {
        const since = startOfLocalDay(this.now(), LIMIT_TIMEZONE);
        const [mine, all] = await Promise.all([
            this.deps.mail.countSentSince(since, user.id),
            this.deps.mail.countSentSince(since),
        ]);
        if (all >= this.deps.limits.mailboxDailySends) {
            throw new AppError(
                "The shared mailbox has reached today's sending limit. It resets at midnight India time.",
                429,
                "MAILBOX_DAILY_LIMIT",
            );
        }
        if (mine >= this.deps.limits.userDailySends) {
            throw new AppError(
                `You've sent ${mine} emails today, the daily limit. It resets at midnight India time.`,
                429,
                "USER_DAILY_LIMIT",
            );
        }
    }

    private async markReadInGmail(thread: ThreadDoc) {
        try {
            const { api } = await this.deps.mailbox.connected();
            const messages = await this.deps.mail.messagesOf(thread._id);
            for (const m of messages) {
                if (m.labelIds.includes("UNREAD")) await api.modifyLabels(m.gmailMessageId, [], ["UNREAD"]);
            }
        } catch (error) {
            this.deps.logger.warn({ err: error }, "Couldn't mark the conversation read in Gmail");
        }
    }
}

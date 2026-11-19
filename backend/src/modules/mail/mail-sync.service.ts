import { Types } from "mongoose";
import type { Logger } from "../../common/logger/logger.js";
import { isHistoryExpired, type GmailApi, type GmailMessage } from "../../integrations/gmail/gmail.types.js";
import { parseGmailMessage } from "../../integrations/gmail/mime.js";
import type { ContactsService } from "../contacts/contacts.service.js";
import type { Locks } from "../locks/locks.js";
import type { MailboxDoc } from "../mailbox/mailbox.model.js";
import type { MailboxService } from "../mailbox/mailbox.service.js";
import type { MessageDoc, MessageOrigin, ThreadDoc } from "./mail.model.js";
import type { MailRepository } from "./mail.repository.js";

// Mail we never pull into the app.
const SKIP_LABELS = new Set(["SPAM", "TRASH", "DRAFT", "CHAT", "CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL"]);
const SYNC_LOCK = "gmail-sync";
const FALLBACK_QUERY = "newer_than:7d -in:spam -in:trash -in:drafts";

export const cleanSubject = (subject: string) => subject.replace(/^\s*((re|fwd?|aw|wg)\s*:\s*)+/i, "").trim();

interface AppMeta {
    sentByUserId: string;
    origin: MessageOrigin;
}

interface Deps {
    mail: MailRepository;
    mailbox: MailboxService;
    locks: Locks;
    contacts: Pick<ContactsService, "linkMessage">;
    logger: Logger;
    lockTtlMs: number;
}

export class MailSyncService {
    constructor(private readonly deps: Deps) {}

    // Pulls everything new from Gmail since the last sync. Safe to call from several servers.
    async syncNow(): Promise<{ added: number } | undefined> {
        return this.deps.locks.withLock(SYNC_LOCK, this.deps.lockTtlMs, async () => {
            const { doc, api } = await this.deps.mailbox.connected();
            try {
                const result = await this.pull(doc, api);
                await this.deps.mailbox.recordSync(doc, { historyId: result.historyId });
                return { added: result.added };
            } catch (error) {
                this.deps.logger.warn({ err: error }, "Gmail sync failed");
                await this.deps.mailbox.recordSync(doc, {
                    error: "Couldn't fetch new mail from Gmail. Retrying automatically.",
                });
                throw error;
            }
        });
    }

    private async pull(doc: MailboxDoc, api: GmailApi): Promise<{ added: number; historyId: string }> {
        if (!doc.historyId) return { added: 0, historyId: (await api.getProfile()).historyId };

        const ids = new Set<string>();
        let historyId: string | undefined;
        try {
            let pageToken: string | undefined;
            do {
                const page = await api.listHistory(doc.historyId, pageToken);
                for (const h of page.history ?? []) for (const m of h.messagesAdded ?? []) ids.add(m.message.id);
                historyId = page.historyId;
                pageToken = page.nextPageToken;
            } while (pageToken);
        } catch (error) {
            if (!isHistoryExpired(error)) throw error;
            this.deps.logger.warn("Gmail history expired; re-reading the last 7 days");
            let pageToken: string | undefined;
            do {
                const page = await api.listMessages(FALLBACK_QUERY, pageToken);
                for (const m of page.messages ?? []) ids.add(m.id);
                pageToken = page.nextPageToken;
            } while (pageToken);
            historyId = (await api.getProfile()).historyId;
        }

        let added = 0;
        for (const id of ids) {
            const message = await api.getMessage(id).catch((error: unknown) => {
                // Deleted between listing and fetching.
                if ((error as { status?: number }).status === 404) return null;
                throw error;
            });
            if (message && (await this.ingest(doc, message))?.created) added++;
        }
        return { added, historyId: historyId ?? doc.historyId };
    }

    // Saves one Gmail message and refreshes its thread. Returns null when the message is skipped.
    async ingest(
        mailbox: Pick<MailboxDoc, "_id" | "email">,
        gm: GmailMessage,
        app?: AppMeta,
    ): Promise<{ thread: ThreadDoc; message: MessageDoc; created: boolean } | null> {
        const parsed = parseGmailMessage(gm);
        if (!app && parsed.labelIds.some((l) => SKIP_LABELS.has(l))) return null;

        const direction = parsed.from.email === mailbox.email ? "outbound" : "inbound";
        const origin: MessageOrigin = app?.origin ?? (direction === "outbound" ? "gmail_external" : "inbound");
        const thread = await this.deps.mail.ensureThread(mailbox._id, parsed.gmailThreadId, {
            subject: cleanSubject(parsed.subject) || "(no subject)",
            sentAt: parsed.sentAt,
            direction,
        });
        const { message, created } = await this.deps.mail.upsertMessage(
            thread._id,
            mailbox._id,
            parsed,
            direction,
            origin,
            app?.sentByUserId ?? null,
        );
        if (!created && !app) return { thread, message, created };
        await this.recomputeThread(thread._id, mailbox.email, created ? message : null);
        await this.deps.contacts.linkMessage(mailbox.email, thread._id, message, created);
        const updated = await this.deps.mail.findThread(thread._id.toHexString());
        return { thread: updated ?? thread, message, created };
    }

    private async recomputeThread(threadId: Types.ObjectId, mailboxEmail: string, newMessage: MessageDoc | null) {
        const messages = await this.deps.mail.messagesOf(threadId);
        const first = messages[0];
        const last = messages.at(-1);
        if (!first || !last) return null;

        const people = new Map<string, string>();
        for (const m of messages) {
            for (const a of [m.from, ...m.to, ...m.cc]) {
                if (a.email === mailboxEmail) continue;
                if (!people.has(a.email) || (!people.get(a.email) && a.name)) people.set(a.email, a.name);
            }
        }
        const lastOf = (direction: "inbound" | "outbound") =>
            messages.findLast((m) => m.direction === direction)?.sentAt ?? null;
        const senders = [...new Set(messages.flatMap((m) => (m.sentByUserId ? [m.sentByUserId.toHexString()] : [])))];

        return this.deps.mail.updateThread(threadId, {
            subject: cleanSubject(first.subject) || "(no subject)",
            participants: [...people].map(([email, name]) => ({ email, name })),
            snippet: last.snippet,
            messageCount: messages.length,
            lastMessageAt: last.sentAt,
            lastMessageDirection: last.direction,
            lastInboundAt: lastOf("inbound"),
            lastOutboundAt: lastOf("outbound"),
            hasAttachments: messages.some((m) => m.attachments.length > 0),
            senderIds: senders.map((id) => new Types.ObjectId(id)),
            startedBy: first.sentByUserId ?? null,
            // A new message reopens the thread; our own reply marks it read.
            ...(newMessage
                ? {
                      state: last.direction === "inbound" ? "needs_reply" : "awaiting_reply",
                      unread: last.direction === "inbound",
                  }
                : {}),
        });
    }
}

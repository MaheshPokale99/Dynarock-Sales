import { Types, type QueryFilter } from "mongoose";
import type { Models } from "../../database/models.js";
import type { ParsedMessage } from "../../integrations/gmail/mime.js";
import type { MessageDoc, MessageOrigin, ThreadDoc, ThreadState } from "./mail.model.js";

export type ThreadFolder = "all" | "needs_reply" | "awaiting_reply" | "sent" | "unread" | "closed";

export interface ThreadQuery {
    folder: ThreadFolder;
    q?: string;
    sentBy?: string;
    before?: Date;
    limit: number;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export class MailRepository {
    constructor(private readonly models: Models) {}

    // Creates the thread on first sight; aggregates are filled by recomputeThread.
    async ensureThread(
        mailboxId: Types.ObjectId,
        gmailThreadId: string,
        first: { subject: string; sentAt: Date; direction: "inbound" | "outbound" },
    ) {
        const doc = await this.models.Thread.findOneAndUpdate(
            { mailboxId, gmailThreadId },
            {
                $setOnInsert: {
                    subject: first.subject,
                    lastMessageAt: first.sentAt,
                    lastMessageDirection: first.direction,
                    state: first.direction === "inbound" ? "needs_reply" : "awaiting_reply",
                },
            },
            { upsert: true, returnDocument: "after" },
        ).lean<ThreadDoc>();
        return doc;
    }

    // Inserts the message once; app metadata (who sent it) is applied even if sync saw it first.
    async upsertMessage(
        threadId: Types.ObjectId,
        mailboxId: Types.ObjectId,
        parsed: ParsedMessage,
        direction: "inbound" | "outbound",
        origin: MessageOrigin,
        sentByUserId: string | null,
    ): Promise<{ message: MessageDoc; created: boolean }> {
        const { gmailThreadId: _t, ...fields } = parsed;
        const appFields = sentByUserId ? { sentByUserId: new Types.ObjectId(sentByUserId), origin } : {};
        const result = (await this.models.Message.findOneAndUpdate(
            { gmailMessageId: parsed.gmailMessageId },
            {
                $setOnInsert: {
                    ...fields,
                    threadId,
                    mailboxId,
                    direction,
                    ...(sentByUserId ? {} : { origin, sentByUserId: null }),
                },
                ...(sentByUserId ? { $set: appFields } : {}),
            },
            { upsert: true, returnDocument: "after", includeResultMetadata: true },
        ).lean()) as unknown as { value: MessageDoc; lastErrorObject?: { updatedExisting?: boolean } };
        return { message: result.value, created: !result.lastErrorObject?.updatedExisting };
    }

    messagesOf(threadId: Types.ObjectId, full = false): Promise<MessageDoc[]> {
        const query = this.models.Message.find({ threadId }).sort({ sentAt: 1 });
        if (!full) query.select("-html -text");
        return query.lean<MessageDoc[]>();
    }

    findMessage(id: string): Promise<MessageDoc | null> {
        if (!Types.ObjectId.isValid(id)) return Promise.resolve(null);
        return this.models.Message.findById(id).lean<MessageDoc>();
    }

    findThread(id: string): Promise<ThreadDoc | null> {
        if (!Types.ObjectId.isValid(id)) return Promise.resolve(null);
        return this.models.Thread.findById(id).lean<ThreadDoc>();
    }

    async updateThread(id: Types.ObjectId, patch: Partial<Omit<ThreadDoc, "_id">>): Promise<ThreadDoc | null> {
        return this.models.Thread.findByIdAndUpdate(id, { $set: patch }, { returnDocument: "after" }).lean<ThreadDoc>();
    }

    async listThreads(query: ThreadQuery): Promise<ThreadDoc[]> {
        const filter: QueryFilter<ThreadDoc> = {};
        const sortField = query.folder === "sent" ? "lastOutboundAt" : "lastMessageAt";

        if (query.folder === "needs_reply" || query.folder === "awaiting_reply" || query.folder === "closed") {
            filter.state = query.folder satisfies ThreadState;
        } else if (query.folder === "unread") {
            filter.unread = true;
        } else if (query.folder === "sent") {
            filter.lastOutboundAt = { $ne: null };
        }
        if (query.sentBy && Types.ObjectId.isValid(query.sentBy)) filter.senderIds = new Types.ObjectId(query.sentBy);
        if (query.q) {
            const rx = new RegExp(escapeRegex(query.q), "i");
            filter.$or = [{ subject: rx }, { snippet: rx }, { "participants.email": rx }, { "participants.name": rx }];
        }
        if (query.before) filter[sortField] = { ...(filter[sortField] as object), $lt: query.before };

        return this.models.Thread.find(filter)
            .sort({ [sortField]: -1, _id: -1 })
            .limit(query.limit)
            .lean<ThreadDoc[]>();
    }

    threadsFor(filter: { contactIds?: Types.ObjectId[]; organizationId?: Types.ObjectId }, limit: number) {
        const or: QueryFilter<ThreadDoc>[] = [];
        if (filter.contactIds?.length) or.push({ contactIds: { $in: filter.contactIds } });
        if (filter.organizationId) or.push({ organizationId: filter.organizationId });
        if (or.length === 0) return Promise.resolve([] as ThreadDoc[]);
        return this.models.Thread.find({ $or: or }).sort({ lastMessageAt: -1 }).limit(limit).lean<ThreadDoc[]>();
    }

    async linkThread(threadId: Types.ObjectId, contactIds: Types.ObjectId[], organizationId: Types.ObjectId | null) {
        await this.models.Thread.updateOne({ _id: threadId }, { $addToSet: { contactIds: { $each: contactIds } } });
        if (organizationId) {
            await this.models.Thread.updateOne({ _id: threadId, organizationId: null }, { $set: { organizationId } });
        }
    }

    async setOrganizationForContacts(contactIds: Types.ObjectId[], organizationId: Types.ObjectId) {
        await this.models.Thread.updateMany(
            { contactIds: { $in: contactIds }, organizationId: null },
            { $set: { organizationId } },
        );
    }

    threadsWithoutContacts(): Promise<ThreadDoc[]> {
        return this.models.Thread.find({
            $or: [{ contactIds: { $size: 0 } }, { contactIds: { $exists: false } }],
        }).lean<ThreadDoc[]>();
    }

    // Emails the app sent since `since`, for one person or for the whole mailbox.
    countSentSince(since: Date, userId?: string): Promise<number> {
        return this.models.Message.countDocuments({
            direction: "outbound",
            sentByUserId: userId ? new Types.ObjectId(userId) : { $ne: null },
            sentAt: { $gte: since },
        });
    }

    async counts(): Promise<Record<"needs_reply" | "unread", number>> {
        const [needsReply, unread] = await Promise.all([
            this.models.Thread.countDocuments({ state: "needs_reply" }),
            this.models.Thread.countDocuments({ unread: true }),
        ]);
        return { needs_reply: needsReply, unread };
    }

    async recipientSuggestions(q: string, limit: number): Promise<{ email: string; name: string }[]> {
        const rx = new RegExp(escapeRegex(q), "i");
        return this.models.Thread.aggregate<{ email: string; name: string }>([
            { $match: { $or: [{ "participants.email": rx }, { "participants.name": rx }] } },
            { $sort: { lastMessageAt: -1 } },
            { $unwind: "$participants" },
            { $match: { $or: [{ "participants.email": rx }, { "participants.name": rx }] } },
            { $group: { _id: "$participants.email", name: { $first: "$participants.name" } } },
            { $limit: limit },
            { $project: { _id: 0, email: "$_id", name: 1 } },
        ]);
    }
}

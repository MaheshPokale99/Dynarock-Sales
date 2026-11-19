import { Types, type QueryFilter } from "mongoose";
import type { Models } from "../../database/models.js";
import type { ContactDoc, ContactStage, ContactStatus } from "./contact.model.js";

export interface ContactQuery {
    q?: string;
    stage?: ContactStage;
    status?: ContactStatus;
    organizationId?: string;
    ownerId?: string;
    page: number;
    limit: number;
}

export type ContactPatch = Partial<Omit<ContactDoc, "_id" | "email" | "domain" | "createdAt" | "updatedAt">>;

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const domainOf = (email: string) => email.split("@")[1]?.toLowerCase() ?? "";
// "Name+tag@x.com" -> "name@x.com"
export const canonicalEmail = (email: string) => email.toLowerCase().replace(/\+[^@]*@/, "@");

export class ContactsRepository {
    constructor(private readonly models: Models) {}

    findById(id: string): Promise<ContactDoc | null> {
        if (!Types.ObjectId.isValid(id)) return Promise.resolve(null);
        return this.models.Contact.findById(id).lean<ContactDoc>();
    }

    findByEmails(emails: string[]): Promise<ContactDoc[]> {
        return this.models.Contact.find({ email: { $in: emails.map((e) => e.toLowerCase()) } }).lean<ContactDoc[]>();
    }

    // Matches each address with or without a +tag, so "a+x@d" and "a@d" find each other.
    findByCanonicalEmails(emails: string[]): Promise<ContactDoc[]> {
        const patterns = [...new Set(emails.map(canonicalEmail))].map((e) => {
            const [local, domain] = e.split("@");
            return new RegExp(`^${escapeRegex(local ?? "")}(\\+[^@]*)?@${escapeRegex(domain ?? "")}$`);
        });
        if (patterns.length === 0) return Promise.resolve([]);
        return this.models.Contact.find({ email: { $in: patterns } }).lean<ContactDoc[]>();
    }

    findByIds(ids: Types.ObjectId[]): Promise<ContactDoc[]> {
        return this.models.Contact.find({ _id: { $in: ids } }).lean<ContactDoc[]>();
    }

    private filter(query: Omit<ContactQuery, "page" | "limit">): QueryFilter<ContactDoc> {
        const filter: QueryFilter<ContactDoc> = {};
        if (query.stage) filter.stage = query.stage;
        if (query.status) filter.status = query.status;
        if (query.organizationId) filter.organizationId = new Types.ObjectId(query.organizationId);
        if (query.ownerId) filter.ownerId = new Types.ObjectId(query.ownerId);
        if (query.q) {
            const rx = new RegExp(escapeRegex(query.q), "i");
            filter.$or = [{ name: rx }, { email: rx }, { designation: rx }, { phone: rx }];
        }
        return filter;
    }

    async list(query: ContactQuery): Promise<{ items: ContactDoc[]; total: number }> {
        const filter = this.filter(query);
        const [items, total] = await Promise.all([
            this.models.Contact.find(filter)
                .sort({ updatedAt: -1, _id: -1 })
                .skip((query.page - 1) * query.limit)
                .limit(query.limit)
                .lean<ContactDoc[]>(),
            this.models.Contact.countDocuments(filter),
        ]);
        return { items, total };
    }

    byStage(query: Omit<ContactQuery, "page" | "limit" | "stage">, stage: ContactStage, limit: number) {
        return Promise.all([
            this.models.Contact.find({ ...this.filter(query), stage })
                .sort({ updatedAt: -1 })
                .limit(limit)
                .lean<ContactDoc[]>(),
            this.models.Contact.countDocuments({ ...this.filter(query), stage }),
        ]);
    }

    async create(doc: Partial<ContactDoc> & { email: string }): Promise<ContactDoc> {
        const created = await this.models.Contact.create({ ...doc, domain: domainOf(doc.email) });
        return created.toObject<ContactDoc>();
    }

    // Creates the contact on first sight; returns whether it was new.
    async ensure(email: string, onInsert: Partial<ContactDoc>): Promise<{ contact: ContactDoc; created: boolean }> {
        const result = (await this.models.Contact.findOneAndUpdate(
            { email },
            { $setOnInsert: { ...onInsert, email, domain: domainOf(email) } },
            { upsert: true, returnDocument: "after", includeResultMetadata: true },
        ).lean()) as unknown as { value: ContactDoc; lastErrorObject?: { updatedExisting?: boolean } };
        return { contact: result.value, created: !result.lastErrorObject?.updatedExisting };
    }

    update(id: Types.ObjectId | string, patch: ContactPatch): Promise<ContactDoc | null> {
        return this.models.Contact.findByIdAndUpdate(
            id,
            { $set: patch },
            { returnDocument: "after" },
        ).lean<ContactDoc>();
    }

    // Only moves the date forward (sync may see messages out of order).
    async bumpDate(id: Types.ObjectId, field: "lastContactedAt" | "lastRepliedAt", at: Date): Promise<void> {
        await this.models.Contact.updateOne(
            { _id: id, $or: [{ [field]: null }, { [field]: { $lt: at } }] },
            { $set: { [field]: at } },
        );
    }

    // Atomic stage move, only if the contact is still in one of `from`.
    async advanceStage(id: Types.ObjectId, from: ContactStage[], to: ContactStage): Promise<boolean> {
        const r = await this.models.Contact.updateOne({ _id: id, stage: { $in: from } }, { $set: { stage: to } });
        return r.modifiedCount === 1;
    }

    async linkDomain(domain: string, organizationId: Types.ObjectId): Promise<number> {
        const r = await this.models.Contact.updateMany({ domain, organizationId: null }, { $set: { organizationId } });
        return r.modifiedCount;
    }

    async countByOrganization(ids: Types.ObjectId[]): Promise<Map<string, number>> {
        const rows = await this.models.Contact.aggregate<{ _id: Types.ObjectId; n: number }>([
            { $match: { organizationId: { $in: ids } } },
            { $group: { _id: "$organizationId", n: { $sum: 1 } } },
        ]);
        return new Map(rows.map((r) => [r._id.toHexString(), r.n]));
    }

    async stageCounts(): Promise<Record<string, number>> {
        const rows = await this.models.Contact.aggregate<{ _id: string; n: number }>([
            { $group: { _id: "$stage", n: { $sum: 1 } } },
        ]);
        return Object.fromEntries(rows.map((r) => [r._id, r.n]));
    }
}

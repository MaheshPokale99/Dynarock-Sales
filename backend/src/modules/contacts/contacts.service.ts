import { Types } from "mongoose";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../common/errors/app-error.js";
import { isDuplicateKey } from "../../database/database.js";
import type { ActivitiesRepository } from "../activities/activities.repository.js";
import type { ActivityDoc } from "../activities/activity.model.js";
import { toThreadDto } from "../mail/mail.dto.js";
import type { MessageDoc } from "../mail/mail.model.js";
import type { MailRepository } from "../mail/mail.repository.js";
import type { OrganizationDoc } from "../organizations/organization.model.js";
import type { OrganizationsRepository } from "../organizations/organizations.repository.js";
import {
    CONTACT_STAGES,
    type ContactDoc,
    type ContactRole,
    type ContactStage,
    type ContactStatus,
} from "./contact.model.js";
import { domainOf, type ContactPatch, type ContactQuery, type ContactsRepository } from "./contacts.repository.js";

// Personal email providers: never used to link a contact to a college.
export const FREE_EMAIL_DOMAINS = new Set([
    "gmail.com",
    "googlemail.com",
    "yahoo.com",
    "yahoo.co.in",
    "ymail.com",
    "outlook.com",
    "hotmail.com",
    "live.com",
    "msn.com",
    "rediffmail.com",
    "icloud.com",
    "me.com",
    "aol.com",
    "proton.me",
    "protonmail.com",
    "zoho.com",
]);

const PIPELINE_LIMIT = 50;

export const toContactDto = (c: ContactDoc, org?: OrganizationDoc | null) => ({
    id: c._id.toHexString(),
    email: c.email,
    name: c.name,
    role: c.role,
    designation: c.designation,
    phone: c.phone,
    organizationId: c.organizationId?.toHexString() ?? null,
    organization: org ? { id: org._id.toHexString(), name: org.name } : null,
    stage: c.stage,
    lostReason: c.lostReason,
    ownerId: c.ownerId?.toHexString() ?? null,
    status: c.status,
    source: c.source,
    tags: c.tags,
    notes: c.notes,
    lastContactedAt: c.lastContactedAt,
    lastRepliedAt: c.lastRepliedAt,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
});

const toActivityDto = (a: ActivityDoc) => ({
    id: a._id.toHexString(),
    action: a.action,
    actor: { type: a.actor.type, userId: a.actor.userId?.toHexString() ?? null },
    threadId: a.threadId?.toHexString() ?? null,
    meta: a.meta,
    createdAt: a.createdAt,
});

export interface ContactInput {
    email: string;
    name?: string;
    role?: ContactRole;
    designation?: string;
    phone?: string;
    organizationId?: string | null;
    stage?: ContactStage;
    ownerId?: string | null;
    tags?: string[];
    notes?: string;
}

export interface ContactUpdate extends Omit<Partial<ContactInput>, "email"> {
    lostReason?: string;
    status?: ContactStatus;
}

const oid = (id: string | null | undefined) => (id ? new Types.ObjectId(id) : null);

interface Deps {
    contacts: ContactsRepository;
    organizations: OrganizationsRepository;
    mail: MailRepository;
    activities: ActivitiesRepository;
}

export class ContactsService {
    constructor(private readonly deps: Deps) {}

    private async orgsFor(contacts: ContactDoc[]) {
        const ids = [...new Set(contacts.flatMap((c) => (c.organizationId ? [c.organizationId.toHexString()] : [])))];
        const orgs = await this.deps.organizations.findByIds(ids.map((id) => new Types.ObjectId(id)));
        return new Map(orgs.map((o) => [o._id.toHexString(), o]));
    }

    async dtos(contacts: ContactDoc[]) {
        const orgs = await this.orgsFor(contacts);
        return contacts.map((c) => toContactDto(c, c.organizationId ? orgs.get(c.organizationId.toHexString()) : null));
    }

    async list(query: ContactQuery) {
        const { items, total } = await this.deps.contacts.list(query);
        return { items: await this.dtos(items), total, page: query.page, pageSize: query.limit };
    }

    async detail(id: string) {
        const contact = await this.require(id);
        const organization = contact.organizationId
            ? await this.deps.organizations.findById(contact.organizationId.toHexString())
            : null;
        const threads = await this.deps.mail.threadsFor({ contactIds: [contact._id] }, 100);
        const activities = await this.deps.activities.forContact(
            contact._id,
            threads.map((t) => t._id),
            100,
        );
        return {
            contact: toContactDto(contact, organization),
            threads: threads.map(toThreadDto),
            activities: activities.map(toActivityDto),
        };
    }

    async create(actorId: string, input: ContactInput) {
        let organizationId = oid(input.organizationId);
        if (!organizationId && !FREE_EMAIL_DOMAINS.has(domainOf(input.email))) {
            organizationId = (await this.deps.organizations.findByDomain(domainOf(input.email)))?._id ?? null;
        }
        try {
            const contact = await this.deps.contacts.create({
                email: input.email,
                name: input.name ?? "",
                role: input.role ?? "other",
                designation: input.designation ?? "",
                phone: input.phone ?? "",
                organizationId,
                stage: input.stage ?? "new",
                ownerId: input.ownerId === undefined ? new Types.ObjectId(actorId) : oid(input.ownerId),
                tags: input.tags ?? [],
                notes: input.notes ?? "",
                source: "manual",
                createdBy: new Types.ObjectId(actorId),
            });
            await this.record(actorId, contact._id, "contact.created", { source: "manual" });
            return (await this.dtos([contact]))[0]!;
        } catch (error) {
            if (isDuplicateKey(error)) {
                throw new ConflictError(`${input.email} is already a contact.`, ["Search for them in Contacts."]);
            }
            throw error;
        }
    }

    async update(actor: { id: string; role: "admin" | "sales_rep" }, id: string, input: ContactUpdate) {
        const actorId = actor.id;
        const contact = await this.require(id);
        // Making an opted-out or bounced contact emailable again is an admin decision.
        if (input.status && input.status !== contact.status && contact.status !== "active" && actor.role !== "admin") {
            throw new ForbiddenError("Only an admin can change the status of a contact who opted out or bounced.");
        }
        if (input.stage === "lost" && contact.stage !== "lost" && !input.lostReason?.trim() && !contact.lostReason) {
            throw new ValidationError("Add a reason when marking a contact as lost", [
                { path: "lostReason", message: "is required when the stage is Lost" },
            ]);
        }
        const patch: ContactPatch = {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.role !== undefined ? { role: input.role } : {}),
            ...(input.designation !== undefined ? { designation: input.designation } : {}),
            ...(input.phone !== undefined ? { phone: input.phone } : {}),
            ...(input.organizationId !== undefined ? { organizationId: oid(input.organizationId) } : {}),
            ...(input.stage !== undefined ? { stage: input.stage } : {}),
            ...(input.lostReason !== undefined ? { lostReason: input.lostReason } : {}),
            ...(input.ownerId !== undefined ? { ownerId: oid(input.ownerId) } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
            ...(input.tags !== undefined ? { tags: input.tags } : {}),
            ...(input.notes !== undefined ? { notes: input.notes } : {}),
        };
        const updated = await this.deps.contacts.update(contact._id, patch);
        if (!updated) throw new NotFoundError("Contact not found");

        if (input.stage && input.stage !== contact.stage) {
            await this.record(actorId, contact._id, "contact.stage_changed", {
                from: contact.stage,
                to: input.stage,
                ...(input.stage === "lost" ? { reason: input.lostReason ?? contact.lostReason } : {}),
            });
        }
        const changed = Object.keys(patch).filter((k) => k !== "stage" && k !== "lostReason");
        if (changed.length > 0) await this.record(actorId, contact._id, "contact.updated", { fields: changed });
        if (input.organizationId)
            await this.deps.mail.setOrganizationForContacts([contact._id], new Types.ObjectId(input.organizationId));
        return (await this.dtos([updated]))[0]!;
    }

    async pipeline(query: { q?: string; ownerId?: string }) {
        const stages = await Promise.all(
            CONTACT_STAGES.map(async (stage) => {
                const [contacts, total] = await this.deps.contacts.byStage(query, stage, PIPELINE_LIMIT);
                return { stage, total, contacts };
            }),
        );
        const orgs = await this.orgsFor(stages.flatMap((s) => s.contacts));
        return {
            stages: stages.map((s) => ({
                stage: s.stage,
                total: s.total,
                contacts: s.contacts.map((c) =>
                    toContactDto(c, c.organizationId ? orgs.get(c.organizationId.toHexString()) : null),
                ),
            })),
        };
    }

    // Recipients we must not email (unsubscribed, bounced, do not contact).
    async blockedRecipients(emails: string[]): Promise<ContactDoc[]> {
        if (emails.length === 0) return [];
        return (await this.deps.contacts.findByCanonicalEmails(emails)).filter((c) => c.status !== "active");
    }

    async forThread(contactIds: Types.ObjectId[]) {
        return this.dtos(await this.deps.contacts.findByIds(contactIds));
    }

    // Called for every saved message: creates/links contacts and moves stages forward.
    async linkMessage(mailboxEmail: string, threadId: Types.ObjectId, m: MessageDoc, isNew: boolean): Promise<void> {
        const people = new Map<string, string>();
        for (const a of [m.from, ...m.to, ...m.cc, ...m.bcc]) {
            if (a.email !== mailboxEmail && a.email.includes("@") && !people.has(a.email)) people.set(a.email, a.name);
        }
        const orgCache = new Map<string, OrganizationDoc | null>();
        const orgFor = async (domain: string) => {
            if (FREE_EMAIL_DOMAINS.has(domain)) return null;
            if (!orgCache.has(domain)) orgCache.set(domain, await this.deps.organizations.findByDomain(domain));
            return orgCache.get(domain) ?? null;
        };

        const linked: ContactDoc[] = [];
        for (const [email, name] of people) {
            const org = await orgFor(domainOf(email));
            const { contact, created } = await this.deps.contacts.ensure(email, {
                name,
                source: m.direction === "outbound" ? "compose" : "inbound",
                organizationId: org?._id ?? null,
                ownerId: m.sentByUserId,
                createdBy: m.sentByUserId,
            });
            linked.push(contact);

            const fill: ContactPatch = {};
            if (!contact.name && name) fill.name = name;
            if (!contact.organizationId && org) fill.organizationId = org._id;
            if (!contact.ownerId && m.sentByUserId) fill.ownerId = m.sentByUserId;
            if (Object.keys(fill).length) await this.deps.contacts.update(contact._id, fill);
            if (created) {
                await this.record(m.sentByUserId?.toHexString() ?? null, contact._id, "contact.created", {
                    source: m.direction === "outbound" ? "compose" : "inbound",
                });
            }
            if (!isNew) continue;

            if (m.direction === "outbound") {
                await this.deps.contacts.bumpDate(contact._id, "lastContactedAt", m.sentAt);
                await this.advance(contact._id, ["new"], "contacted");
            } else if (email === m.from.email && !m.isAutoReply) {
                await this.deps.contacts.bumpDate(contact._id, "lastRepliedAt", m.sentAt);
                await this.advance(contact._id, ["new", "contacted"], "replied");
                await this.deps.activities.record({
                    actor: { type: "system" },
                    action: "email.received",
                    contactId: contact._id.toHexString(),
                    threadId: threadId.toHexString(),
                    entity: { type: "message", id: m._id.toHexString() },
                });
            }
        }
        const orgId = linked.find((c) => c.organizationId)?.organizationId ?? null;
        await this.deps.mail.linkThread(
            threadId,
            linked.map((c) => c._id),
            orgId,
        );
    }

    // Links conversations that existed before contacts did.
    async backfill(mailboxEmail: string): Promise<number> {
        const threads = await this.deps.mail.threadsWithoutContacts();
        for (const t of threads) {
            for (const m of await this.deps.mail.messagesOf(t._id))
                await this.linkMessage(mailboxEmail, t._id, m, true);
        }
        return threads.length;
    }

    private async advance(id: Types.ObjectId, from: ContactStage[], to: ContactStage) {
        const current = (await this.deps.contacts.findById(id.toHexString()))?.stage;
        if (current && from.includes(current) && (await this.deps.contacts.advanceStage(id, from, to))) {
            await this.record(null, id, "contact.stage_changed", { from: current, to, automatic: true });
        }
    }

    private async require(id: string) {
        const contact = await this.deps.contacts.findById(id);
        if (!contact) throw new NotFoundError("Contact not found");
        return contact;
    }

    private record(
        actorId: string | null,
        contactId: Types.ObjectId,
        action: ActivityDoc["action"],
        meta: Record<string, unknown>,
    ) {
        return this.deps.activities.record({
            actor: actorId ? { type: "user", userId: actorId } : { type: "system" },
            action,
            contactId: contactId.toHexString(),
            entity: { type: "contact", id: contactId.toHexString() },
            meta,
        });
    }
}

import { ConflictError, NotFoundError, ValidationError } from "../../common/errors/app-error.js";
import { isDuplicateKey } from "../../database/database.js";
import type { ActivitiesRepository } from "../activities/activities.repository.js";
import type { ContactsRepository } from "../contacts/contacts.repository.js";
import { FREE_EMAIL_DOMAINS, type ContactsService } from "../contacts/contacts.service.js";
import { toThreadDto } from "../mail/mail.dto.js";
import type { MailRepository } from "../mail/mail.repository.js";
import type { OrganizationDoc, OrganizationType } from "./organization.model.js";
import type { OrganizationInput, OrganizationsRepository } from "./organizations.repository.js";

export const toOrganizationDto = (o: OrganizationDoc, contactCount?: number) => ({
    id: o._id.toHexString(),
    name: o.name,
    type: o.type,
    domain: o.domain,
    website: o.website,
    city: o.city,
    state: o.state,
    country: o.country,
    studentCount: o.studentCount,
    currentSystems: o.currentSystems,
    notes: o.notes,
    tags: o.tags,
    contactCount: contactCount ?? 0,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
});

// "https://www.XYZ.edu.in/about" -> "xyz.edu.in"
export function normalizeDomain(value: string | null | undefined): string | null {
    if (!value?.trim()) return null;
    const host =
        value
            .trim()
            .toLowerCase()
            .replace(/^[a-z]+:\/\//, "")
            .replace(/^www\./, "")
            .split(/[/?#@]/)[0] ?? "";
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) {
        throw new ValidationError("Enter a valid domain, like xyz.edu.in", [
            { path: "domain", message: "is not a valid domain" },
        ]);
    }
    if (FREE_EMAIL_DOMAINS.has(host)) {
        throw new ValidationError(`${host} is a personal email provider, not a college domain`, [
            { path: "domain", message: "can't be a personal email provider" },
        ]);
    }
    return host;
}

interface Deps {
    organizations: OrganizationsRepository;
    contacts: ContactsRepository;
    contactsService: ContactsService;
    mail: MailRepository;
    activities: ActivitiesRepository;
}

export class OrganizationsService {
    constructor(private readonly deps: Deps) {}

    async list(q: string | undefined, type: OrganizationType | undefined) {
        const orgs = await this.deps.organizations.list(q, type, 500);
        const counts = await this.deps.contacts.countByOrganization(orgs.map((o) => o._id));
        return orgs.map((o) => toOrganizationDto(o, counts.get(o._id.toHexString())));
    }

    async detail(id: string) {
        const org = await this.require(id);
        const { items: contacts, total } = await this.deps.contacts.list({ organizationId: id, page: 1, limit: 200 });
        const threads = await this.deps.mail.threadsFor(
            { organizationId: org._id, contactIds: contacts.map((c) => c._id) },
            100,
        );
        return {
            organization: toOrganizationDto(org, total),
            contacts: await this.deps.contactsService.dtos(contacts),
            threads: threads.map(toThreadDto),
        };
    }

    async create(actorId: string, input: OrganizationInput & { name: string }) {
        const domain = normalizeDomain(input.domain);
        let org: OrganizationDoc;
        try {
            org = await this.deps.organizations.create({ ...input, domain }, actorId);
        } catch (error) {
            if (isDuplicateKey(error)) throw new ConflictError(`Another college already uses ${domain}.`);
            throw error;
        }
        const linked = domain ? await this.linkContacts(org) : 0;
        await this.record(actorId, org, "organization.created", { linkedContacts: linked });
        return toOrganizationDto(org, linked);
    }

    async update(actorId: string, id: string, input: OrganizationInput) {
        const org = await this.require(id);
        const patch = { ...input, ...(input.domain !== undefined ? { domain: normalizeDomain(input.domain) } : {}) };
        let updated: OrganizationDoc | null;
        try {
            updated = await this.deps.organizations.update(id, patch);
        } catch (error) {
            if (isDuplicateKey(error)) throw new ConflictError(`Another college already uses ${patch.domain}.`);
            throw error;
        }
        if (!updated) throw new NotFoundError("College not found");
        if (updated.domain && updated.domain !== org.domain) await this.linkContacts(updated);
        await this.record(actorId, updated, "organization.updated", { fields: Object.keys(input) });
        const counts = await this.deps.contacts.countByOrganization([updated._id]);
        return toOrganizationDto(updated, counts.get(id));
    }

    // Contacts with this email domain and no college yet join this one.
    private async linkContacts(org: OrganizationDoc): Promise<number> {
        if (!org.domain) return 0;
        const linked = await this.deps.contacts.linkDomain(org.domain, org._id);
        const { items } = await this.deps.contacts.list({
            organizationId: org._id.toHexString(),
            page: 1,
            limit: 1000,
        });
        if (items.length)
            await this.deps.mail.setOrganizationForContacts(
                items.map((c) => c._id),
                org._id,
            );
        return linked;
    }

    private async require(id: string) {
        const org = await this.deps.organizations.findById(id);
        if (!org) throw new NotFoundError("College not found");
        return org;
    }

    private record(
        actorId: string,
        org: OrganizationDoc,
        action: "organization.created" | "organization.updated",
        meta: Record<string, unknown>,
    ) {
        return this.deps.activities.record({
            actor: { type: "user", userId: actorId },
            action,
            entity: { type: "organization", id: org._id.toHexString() },
            meta,
        });
    }
}

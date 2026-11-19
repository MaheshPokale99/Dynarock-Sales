import { Types, type QueryFilter } from "mongoose";
import type { Models } from "../../database/models.js";
import { escapeRegex } from "../contacts/contacts.repository.js";
import type { OrganizationDoc, OrganizationType } from "./organization.model.js";

export type OrganizationInput = Partial<Omit<OrganizationDoc, "_id" | "createdBy" | "createdAt" | "updatedAt">>;

export class OrganizationsRepository {
    constructor(private readonly models: Models) {}

    findById(id: string): Promise<OrganizationDoc | null> {
        if (!Types.ObjectId.isValid(id)) return Promise.resolve(null);
        return this.models.Organization.findById(id).lean<OrganizationDoc>();
    }

    findByIds(ids: Types.ObjectId[]): Promise<OrganizationDoc[]> {
        return this.models.Organization.find({ _id: { $in: ids } }).lean<OrganizationDoc[]>();
    }

    findByDomain(domain: string): Promise<OrganizationDoc | null> {
        return this.models.Organization.findOne({ domain: domain.toLowerCase() }).lean<OrganizationDoc>();
    }

    async list(q: string | undefined, type: OrganizationType | undefined, limit: number): Promise<OrganizationDoc[]> {
        const filter: QueryFilter<OrganizationDoc> = {};
        if (type) filter.type = type;
        if (q) {
            const rx = new RegExp(escapeRegex(q), "i");
            filter.$or = [{ name: rx }, { domain: rx }, { city: rx }];
        }
        return this.models.Organization.find(filter).sort({ name: 1 }).limit(limit).lean<OrganizationDoc[]>();
    }

    async create(input: OrganizationInput & { name: string }, createdBy: string): Promise<OrganizationDoc> {
        const doc = await this.models.Organization.create({ ...input, createdBy: new Types.ObjectId(createdBy) });
        return doc.toObject<OrganizationDoc>();
    }

    update(id: string, patch: OrganizationInput): Promise<OrganizationDoc | null> {
        return this.models.Organization.findByIdAndUpdate(
            id,
            { $set: patch },
            { returnDocument: "after" },
        ).lean<OrganizationDoc>();
    }
}

import { Types } from "mongoose";
import type { Models } from "../../database/models.js";
import type { SessionDoc } from "./auth.model.js";

interface NewSession {
    userId: string;
    tokenHash: string;
    userAgent: string;
    ip: string;
    expiresAt: Date;
}

export class SessionsRepository {
    constructor(private readonly models: Models) {}

    async create(input: NewSession): Promise<void> {
        await this.models.Session.create({ ...input, userId: new Types.ObjectId(input.userId) });
    }

    // TTL cleanup is lazy, so expiry is checked here too.
    findActive(tokenHash: string, now: Date): Promise<SessionDoc | null> {
        return this.models.Session.findOne({ tokenHash, expiresAt: { $gt: now } }).lean<SessionDoc>();
    }

    async extend(id: Types.ObjectId, expiresAt: Date): Promise<void> {
        await this.models.Session.updateOne({ _id: id }, { $set: { expiresAt } });
    }

    async deleteByHash(tokenHash: string): Promise<void> {
        await this.models.Session.deleteOne({ tokenHash });
    }

    async deleteForUser(userId: string, keepTokenHash?: string): Promise<void> {
        await this.models.Session.deleteMany({
            userId: new Types.ObjectId(userId),
            ...(keepTokenHash ? { tokenHash: { $ne: keepTokenHash } } : {}),
        });
    }
}

import { Types } from "mongoose";
import type { Models } from "../../database/models.js";
import type { InviteDoc } from "./auth.model.js";

interface NewInvite {
    userId: string;
    email: string;
    tokenHash: string;
    invitedBy: string;
    expiresAt: Date;
}

export class InvitesRepository {
    constructor(private readonly models: Models) {}

    async create(input: NewInvite): Promise<void> {
        await this.models.Invite.create({
            ...input,
            userId: new Types.ObjectId(input.userId),
            invitedBy: new Types.ObjectId(input.invitedBy),
        });
    }

    findUsable(tokenHash: string, now: Date): Promise<InviteDoc | null> {
        return this.models.Invite.findOne({ tokenHash, acceptedAt: null, expiresAt: { $gt: now } }).lean<InviteDoc>();
    }

    // Atomic: false if already used.
    async claim(id: Types.ObjectId, at: Date): Promise<boolean> {
        const result = await this.models.Invite.updateOne({ _id: id, acceptedAt: null }, { $set: { acceptedAt: at } });
        return result.modifiedCount === 1;
    }

    async revokeForUser(userId: string): Promise<void> {
        await this.models.Invite.deleteMany({ userId: new Types.ObjectId(userId), acceptedAt: null });
    }

    async latestOpenByUser(userIds: string[]): Promise<Map<string, Date>> {
        const docs = await this.models.Invite.find({
            userId: { $in: userIds.map((id) => new Types.ObjectId(id)) },
            acceptedAt: null,
        })
            .sort({ expiresAt: 1 })
            .lean<InviteDoc[]>();
        return new Map(docs.map((d) => [d.userId.toHexString(), d.expiresAt]));
    }
}

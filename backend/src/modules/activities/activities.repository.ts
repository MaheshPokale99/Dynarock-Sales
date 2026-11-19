import { Types } from "mongoose";
import type { Models } from "../../database/models.js";
import type { ActivityAction, ActorType } from "./activity.model.js";

export interface ActivityEntry {
    actor: { type: ActorType; userId?: string | null };
    action: ActivityAction;
    entity?: { type: string; id: string };
    contactId?: string;
    threadId?: string;
    meta?: Record<string, unknown>;
}

const oid = (id: string | null | undefined) => (id ? new Types.ObjectId(id) : null);

// Audit trail of who did what.
export class ActivitiesRepository {
    constructor(private readonly models: Models) {}

    async record(entry: ActivityEntry): Promise<void> {
        await this.models.Activity.create({
            actor: { type: entry.actor.type, userId: oid(entry.actor.userId) },
            action: entry.action,
            entity: entry.entity ? { type: entry.entity.type, id: new Types.ObjectId(entry.entity.id) } : null,
            contactId: oid(entry.contactId),
            threadId: oid(entry.threadId),
            meta: entry.meta ?? {},
        });
    }
}

import { Schema, type Types } from "mongoose";

export const ACTOR_TYPES = ["user", "system", "ai"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const ACTIVITY_ACTIONS = [
    "user.bootstrapped",
    "user.invited",
    "user.invite_resent",
    "user.joined",
    "user.updated",
    "user.disabled",
    "user.enabled",
    "user.password_changed",
    "auth.login",
    "mailbox.connected",
    "mailbox.disconnected",
    "email.sent",
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

export interface ActivityDoc {
    _id: Types.ObjectId;
    actor: { type: ActorType; userId: Types.ObjectId | null };
    action: ActivityAction;
    entity: { type: string; id: Types.ObjectId } | null;
    contactId: Types.ObjectId | null;
    threadId: Types.ObjectId | null;
    meta: Record<string, unknown>;
    createdAt: Date;
}

export const activitySchema = new Schema<ActivityDoc>(
    {
        actor: {
            type: { type: String, enum: ACTOR_TYPES, required: true },
            userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
        },
        action: { type: String, enum: ACTIVITY_ACTIONS, required: true },
        entity: {
            type: new Schema({ type: String, id: Schema.Types.ObjectId }, { _id: false }),
            default: null,
        },
        contactId: { type: Schema.Types.ObjectId, default: null },
        threadId: { type: Schema.Types.ObjectId, default: null },
        meta: { type: Schema.Types.Mixed, default: {} },
    },
    { timestamps: { createdAt: true, updatedAt: false }, minimize: false },
);

activitySchema.index({ createdAt: -1 });
activitySchema.index({ contactId: 1, createdAt: -1 });
activitySchema.index({ "entity.type": 1, "entity.id": 1, createdAt: -1 });

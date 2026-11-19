import { Types } from "mongoose";
import type { Models } from "../../database/models.js";
import type { UserDoc, UserRole, UserStatus } from "./user.model.js";
import type { User, UserWithSecret } from "./users.types.js";

const toUser = (doc: UserDoc): UserWithSecret => ({
    id: doc._id.toHexString(),
    name: doc.name,
    email: doc.email,
    role: doc.role,
    status: doc.status,
    signatureHtml: doc.signatureHtml,
    invitedBy: doc.invitedBy?.toHexString() ?? null,
    lastLoginAt: doc.lastLoginAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    passwordHash: doc.passwordHash,
    lockedUntil: doc.lockedUntil ?? null,
});

export const withoutSecret = ({ passwordHash: _hash, lockedUntil: _lock, ...user }: UserWithSecret): User => user;

interface NewUser {
    name: string;
    email: string;
    role: UserRole;
    status: UserStatus;
    passwordHash: string | null;
    invitedBy: string | null;
}

export type UserPatch = Partial<Pick<UserDoc, "name" | "role" | "status" | "signatureHtml" | "passwordHash">>;

export class UsersRepository {
    constructor(private readonly models: Models) {}

    async findById(id: string): Promise<UserWithSecret | null> {
        if (!Types.ObjectId.isValid(id)) return null;
        const doc = await this.models.User.findById(id).lean<UserDoc>();
        return doc ? toUser(doc) : null;
    }

    async findByEmail(email: string): Promise<UserWithSecret | null> {
        const doc = await this.models.User.findOne({ email: email.toLowerCase() }).lean<UserDoc>();
        return doc ? toUser(doc) : null;
    }

    async list(): Promise<User[]> {
        const docs = await this.models.User.find().sort({ createdAt: 1 }).lean<UserDoc[]>();
        return docs.map((d) => withoutSecret(toUser(d)));
    }

    count(): Promise<number> {
        return this.models.User.countDocuments();
    }

    countActiveAdmins(excludeId?: string): Promise<number> {
        return this.models.User.countDocuments({
            role: "admin",
            status: "active",
            ...(excludeId ? { _id: { $ne: new Types.ObjectId(excludeId) } } : {}),
        });
    }

    async create(input: NewUser): Promise<User> {
        const doc = await this.models.User.create({
            ...input,
            invitedBy: input.invitedBy ? new Types.ObjectId(input.invitedBy) : null,
        });
        return withoutSecret(toUser(doc.toObject<UserDoc>()));
    }

    async update(id: string, patch: UserPatch): Promise<User | null> {
        const doc = await this.models.User.findByIdAndUpdate(
            id,
            { $set: patch },
            { returnDocument: "after" },
        ).lean<UserDoc>();
        return doc ? withoutSecret(toUser(doc)) : null;
    }

    async recordLogin(id: string, at: Date): Promise<void> {
        await this.models.User.updateOne(
            { _id: id },
            { $set: { lastLoginAt: at, loginFailures: 0, lockedUntil: null } },
        );
    }

    // Counts a failed sign-in; after `max` in a row the account is locked until `lockUntil`.
    async recordFailedLogin(id: string, max: number, lockUntil: Date): Promise<void> {
        const doc = await this.models.User.findByIdAndUpdate(
            id,
            { $inc: { loginFailures: 1 } },
            { returnDocument: "after" },
        ).lean<UserDoc>();
        if (doc && doc.loginFailures >= max) {
            await this.models.User.updateOne({ _id: id }, { $set: { loginFailures: 0, lockedUntil: lockUntil } });
        }
    }
}

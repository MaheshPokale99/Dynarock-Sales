import { randomUUID } from "node:crypto";
import { Schema } from "mongoose";
import { isDuplicateKey } from "../../database/database.js";
import type { Models } from "../../database/models.js";

export interface LockDoc {
    _id: string;
    owner: string;
    expiresAt: Date;
}

export const lockSchema = new Schema<LockDoc>({ _id: String, owner: String, expiresAt: Date }, { versionKey: false });

// Cross-instance lock, so only one server runs a job (e.g. Gmail sync) at a time.
export class Locks {
    private readonly owner = randomUUID();

    constructor(private readonly models: Models) {}

    async acquire(name: string, ttlMs: number): Promise<boolean> {
        const now = new Date();
        try {
            await this.models.Lock.findOneAndUpdate(
                { _id: name, $or: [{ expiresAt: { $lte: now } }, { owner: this.owner }] },
                { $set: { owner: this.owner, expiresAt: new Date(now.getTime() + ttlMs) } },
                { upsert: true },
            );
            return true;
        } catch (error) {
            if (isDuplicateKey(error)) return false;
            throw error;
        }
    }

    async release(name: string): Promise<void> {
        await this.models.Lock.deleteOne({ _id: name, owner: this.owner });
    }

    async withLock<T>(name: string, ttlMs: number, fn: () => Promise<T>): Promise<T | undefined> {
        if (!(await this.acquire(name, ttlMs))) return undefined;
        try {
            return await fn();
        } finally {
            await this.release(name);
        }
    }
}

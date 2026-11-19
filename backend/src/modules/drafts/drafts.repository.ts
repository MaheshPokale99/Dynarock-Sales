import { Types } from "mongoose";
import type { Models } from "../../database/models.js";
import type { ComposeMode, DraftDoc } from "./draft.model.js";

export interface DraftInput {
    mode?: ComposeMode;
    threadId?: string | null;
    to?: string[];
    cc?: string[];
    bcc?: string[];
    subject?: string;
    html?: string;
    attachments?: { fileId: string; filename: string; mimeType: string; size: number }[];
}

const toDoc = (input: DraftInput) => ({
    ...input,
    ...(input.threadId !== undefined ? { threadId: input.threadId ? new Types.ObjectId(input.threadId) : null } : {}),
    ...(input.attachments
        ? { attachments: input.attachments.map((a) => ({ ...a, fileId: new Types.ObjectId(a.fileId) })) }
        : {}),
});

export class DraftsRepository {
    constructor(private readonly models: Models) {}

    listFor(userId: string): Promise<DraftDoc[]> {
        return this.models.Draft.find({ userId: new Types.ObjectId(userId) })
            .sort({ updatedAt: -1 })
            .limit(100)
            .lean<DraftDoc[]>();
    }

    findOwn(id: string, userId: string): Promise<DraftDoc | null> {
        if (!Types.ObjectId.isValid(id)) return Promise.resolve(null);
        return this.models.Draft.findOne({ _id: id, userId: new Types.ObjectId(userId) }).lean<DraftDoc>();
    }

    async create(userId: string, input: DraftInput): Promise<DraftDoc> {
        const doc = await this.models.Draft.create({ ...toDoc(input), userId: new Types.ObjectId(userId) });
        return doc.toObject<DraftDoc>();
    }

    updateOwn(id: string, userId: string, input: DraftInput): Promise<DraftDoc | null> {
        if (!Types.ObjectId.isValid(id)) return Promise.resolve(null);
        return this.models.Draft.findOneAndUpdate(
            { _id: id, userId: new Types.ObjectId(userId) },
            { $set: toDoc(input) },
            { returnDocument: "after" },
        ).lean<DraftDoc>();
    }

    async deleteOwn(id: string, userId: string): Promise<boolean> {
        if (!Types.ObjectId.isValid(id)) return false;
        const r = await this.models.Draft.deleteOne({ _id: id, userId: new Types.ObjectId(userId) });
        return r.deletedCount === 1;
    }
}

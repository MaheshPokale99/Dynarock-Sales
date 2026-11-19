import { Types } from "mongoose";
import type { Models } from "../../database/models.js";
import type { MailboxDoc } from "./mailbox.model.js";

export class MailboxRepository {
    constructor(private readonly models: Models) {}

    findByEmail(email: string): Promise<MailboxDoc | null> {
        return this.models.Mailbox.findOne({ email: email.toLowerCase() }).lean<MailboxDoc>();
    }

    async saveConnection(input: {
        email: string;
        auth: NonNullable<MailboxDoc["auth"]>;
        historyId: string;
        connectedBy: string;
    }): Promise<MailboxDoc> {
        const doc = await this.models.Mailbox.findOneAndUpdate(
            { email: input.email },
            {
                $set: {
                    provider: "gmail",
                    status: "connected",
                    auth: input.auth,
                    lastError: null,
                    connectedBy: new Types.ObjectId(input.connectedBy),
                    connectedAt: new Date(),
                },
                // Keep the sync position on reconnect so no mail is missed or duplicated.
                $setOnInsert: { historyId: input.historyId },
            },
            { upsert: true, returnDocument: "after" },
        ).lean<MailboxDoc>();
        return doc;
    }

    async update(id: Types.ObjectId, patch: Partial<Omit<MailboxDoc, "_id">>): Promise<void> {
        await this.models.Mailbox.updateOne({ _id: id }, { $set: patch });
    }
}

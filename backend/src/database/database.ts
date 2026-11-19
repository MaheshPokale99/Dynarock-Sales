import mongoose, { type Connection } from "mongoose";
import { registerModels, type Models } from "./models.js";

const SERVER_SELECTION_TIMEOUT_MS = 10_000;

export class Database {
    private constructor(
        readonly connection: Connection,
        readonly models: Models,
    ) {}

    static create(uri: string): Database {
        const connection = mongoose.createConnection(uri, {
            serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
            autoIndex: false,
        });
        return new Database(connection, registerModels(connection));
    }

    // Connects and builds all indexes (unique, TTL).
    async connect(): Promise<void> {
        await this.connection.asPromise();
        for (const model of Object.values(this.models)) await model.createIndexes();
    }

    async ping(): Promise<void> {
        const db = this.connection.db;
        if (!db) throw new Error("Database is not connected");
        await db.admin().ping();
    }

    disconnect(): Promise<void> {
        return this.connection.close();
    }
}

export const isDuplicateKey = (error: unknown): boolean => (error as { code?: number } | null)?.code === 11000;

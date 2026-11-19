import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../../src/app.js";
import { createLogger } from "../../src/common/logger/logger.js";
import { loadConfig } from "../../src/config/env.js";
import { createContainer, type ContainerOverrides } from "../../src/container.js";
import { Database } from "../../src/database/database.js";

export const ADMIN = { name: "Asha Admin", email: "admin@dynarock.in", password: "admin-password-1" };

export interface TestStack {
    app: ReturnType<typeof createApp>;
    container: ReturnType<typeof createContainer>;
    reset: () => Promise<void>;
    stop: () => Promise<void>;
}

// Real app on an in-memory MongoDB, with the bootstrap admin created.
export async function createTestStack(
    env: Record<string, string> = {},
    overrides: ContainerOverrides = {},
): Promise<TestStack> {
    const mongo = await MongoMemoryServer.create();
    const database = Database.create(mongo.getUri("dynarock_test"));
    await database.connect();

    const config = loadConfig({
        NODE_ENV: "test",
        BOOTSTRAP_ADMIN_NAME: ADMIN.name,
        BOOTSTRAP_ADMIN_EMAIL: ADMIN.email,
        BOOTSTRAP_ADMIN_PASSWORD: ADMIN.password,
        AUTH_RATE_LIMIT_PER_MINUTE: "1000",
        ...env,
    });
    const container = createContainer(config, createLogger(config), { database, ...overrides });

    const reset = async () => {
        const collections = (await database.connection.db?.collections()) ?? [];
        await Promise.all(collections.map((c) => c.deleteMany({})));
        await container.services.users.bootstrapAdmin(config.auth.bootstrapAdmin);
    };
    await reset();

    return {
        app: createApp(container),
        container,
        reset,
        stop: async () => {
            await database.disconnect();
            await mongo.stop();
        },
    };
}

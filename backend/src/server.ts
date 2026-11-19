import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { SHUTDOWN_TIMEOUT_MS } from "./common/constants.js";
import { createLogger } from "./common/logger/logger.js";
import { loadConfig } from "./config/env.js";
import { createContainer } from "./container.js";
import { startMailSyncWorker } from "./workers/mail-sync.worker.js";

const config = loadConfig();
const logger = createLogger(config);
const container = createContainer(config, logger);
const app = createApp(container);

logger.info("Connecting to MongoDB...");
try {
    await container.database.connect();
} catch (error) {
    logger.fatal({ err: error }, "Cannot reach MongoDB. Check MONGODB_URI, or run `npm run db:local` for a local one.");
    process.exit(1);
}
logger.info("MongoDB ready");

if (await container.services.users.bootstrapAdmin(config.auth.bootstrapAdmin)) {
    logger.info({ admin: config.auth.bootstrapAdmin?.email }, "Created the first admin from BOOTSTRAP_ADMIN_EMAIL");
} else if ((await container.repositories.users.count()) === 0) {
    logger.warn("No users yet. Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD, then restart.");
}

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
    logger.info(
        {
            env: config.env,
            gemini: config.gemini.enabled ? config.gemini.model : "not configured",
            gmail: config.gmail.enabled ? config.gmail.mailboxAddress : "not configured",
            logFile: config.logFile ?? "console only",
        },
        `Server started on http://localhost:${info.port}`,
    );
});

server.on("error", (error: NodeJS.ErrnoException) => {
    const message =
        error.code === "EADDRINUSE"
            ? `Port ${config.port} is already in use. Stop the other process or change PORT in .env.`
            : "The server could not start listening";
    logger.fatal({ err: error }, message);
    process.exit(1);
});

if (!config.gemini.enabled) logger.warn("GEMINI_API_KEY is not set: AI features are disabled");

const stopSync = config.gmail.enabled
    ? startMailSyncWorker({
          sync: container.services.sync,
          mailbox: container.services.mailbox,
          intervalMs: config.gmail.syncIntervalMs,
          logger,
      })
    : (logger.warn("GOOGLE_CLIENT_ID is not set: the Gmail mailbox can't be connected"), () => undefined);

let shuttingDown = false;

async function shutdown(reason: string, exitCode = 0): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ reason }, "Shutting down");

    const forced = setTimeout(() => {
        logger.error("Shutdown timed out, forcing exit");
        process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forced.unref();

    stopSync();
    server.close();
    await container.database.disconnect();
    process.exit(exitCode);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("unhandledRejection", (err) => {
    logger.fatal({ err }, "Unhandled promise rejection");
    void shutdown("unhandledRejection", 1);
});
process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "Uncaught exception");
    void shutdown("uncaughtException", 1);
});

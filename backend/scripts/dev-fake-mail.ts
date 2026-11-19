// Runs the API with an in-memory fake Gmail so the Inbox and Compose can be tried without Google setup.
// Every email you send gets an automatic "client reply" a few seconds later. Data is lost on restart.
import { randomBytes } from "node:crypto";
import { serve } from "@hono/node-server";
import { createApp } from "../src/app.js";
import { createLogger } from "../src/common/logger/logger.js";
import { loadConfig } from "../src/config/env.js";
import { createContainer } from "../src/container.js";
import type { GmailApiFactory } from "../src/integrations/gmail/gmail.types.js";
import { startAutomationWorker } from "../src/workers/automation.worker.js";
import { startMailSyncWorker } from "../src/workers/mail-sync.worker.js";
import { FakeGmail } from "../tests/helpers/fake-gmail.js";

const REPLY_AFTER_MS = 8_000;

const config = loadConfig({
    ...process.env,
    GOOGLE_CLIENT_ID: "fake",
    GOOGLE_CLIENT_SECRET: "fake",
    ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    GMAIL_SYNC_INTERVAL_SECONDS: "15",
});
const logger = createLogger(config);
const gmail = new FakeGmail();
gmail.address = gmail.profileEmail = config.gmail.mailboxAddress;

// Skip Google's sign-in page: "Connect Gmail" goes straight to our callback.
const oauth = {
    ...gmail.oauth,
    authUrl: (state: string) => `${config.gmail.redirectUri}?code=fake&state=${encodeURIComponent(state)}`,
};

// After each send, the first recipient "replies".
const api: GmailApiFactory = (token) => {
    const real = gmail.factory(token);
    return {
        ...real,
        send: async (raw, threadId) => {
            const sent = await real.send(raw, threadId);
            const last = gmail.sent.at(-1)?.parsed;
            const to = last?.to && !Array.isArray(last.to) ? last.to.value[0] : undefined;
            const address = to?.address;
            if (address) {
                setTimeout(() => {
                    gmail.deliver({
                        from: `${to?.name || address.split("@")[0]} <${address}>`,
                        subject: `Re: ${last?.subject ?? ""}`,
                        text: "Thanks for reaching out. Could you share pricing for around 2,000 students and a demo slot next week?",
                        threadId: sent.threadId,
                        inReplyTo: last?.messageId,
                    });
                    logger.info({ from: address }, "Fake client replied");
                }, REPLY_AFTER_MS);
            }
            return sent;
        },
    };
};

const container = createContainer(config, logger, { gmailOAuth: oauth, gmailApi: api });
await container.database.connect();
await container.services.users.bootstrapAdmin(config.auth.bootstrapAdmin);
await container.services.contacts.backfill(config.gmail.mailboxAddress);
await container.services.knowledge.seedIfEmpty();
await container.services.automation.seedDefaults();
await container.services.templates.seedIfEmpty();

serve({ fetch: createApp(container).fetch, port: config.port }, (info) =>
    logger.info(`Fake-mail API on http://localhost:${info.port}. Settings → Connect Gmail, then send an email.`),
);
startMailSyncWorker({ sync: container.services.sync, mailbox: container.services.mailbox, intervalMs: 15_000, logger });
startAutomationWorker({ automation: container.services.automation, intervalMs: 30_000, logger });

import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { NotFoundError, UnauthorizedError } from "../../common/errors/app-error.js";
import type { AppEnv } from "../../common/http/app-env.js";
import type { Container } from "../../container.js";
import { runWorkersOnce } from "../../workers/run-once.js";

export const CRON_SECRET_HEADER = "x-cron-secret";

const sameSecret = (given: string | undefined, expected: string) => {
    const a = Buffer.from(given ?? "");
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
};

// Called by Cloud Scheduler every minute when WORKER_MODE=cron, because Cloud Run only gives CPU during requests.
// Mail sync is rate-limited to the configured interval; follow-ups still run every minute.
export function createCronRoutes({ config, services, logger }: Container) {
    return new Hono<AppEnv>().post("/internal/tick", async (c) => {
        const secret = config.workers.cronSecret;
        if (config.workers.mode !== "cron" || !secret) throw new NotFoundError();
        if (!sameSecret(c.req.header(CRON_SECRET_HEADER), secret)) throw new UnauthorizedError();

        const run = await runWorkersOnce({
            gmailEnabled: config.gmail.enabled,
            syncIntervalMs: config.gmail.syncIntervalMs,
            sync: services.sync,
            mailbox: services.mailbox,
            automation: services.automation,
            ai: services.ai,
            logger,
        });
        return c.json(run);
    });
}

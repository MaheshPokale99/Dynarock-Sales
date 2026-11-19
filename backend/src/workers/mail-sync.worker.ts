import type { Logger } from "../common/logger/logger.js";
import type { MailSyncService } from "../modules/mail/mail-sync.service.js";
import type { MailboxService } from "../modules/mailbox/mailbox.service.js";

// Fetches new Gmail messages every interval while the mailbox is connected.
export function startMailSyncWorker(deps: {
    sync: MailSyncService;
    mailbox: MailboxService;
    intervalMs: number;
    logger: Logger;
}): () => void {
    let running = false;

    const tick = async () => {
        if (running) return;
        running = true;
        try {
            if ((await deps.mailbox.status()).status !== "disconnected") {
                const result = await deps.sync.syncNow();
                if (result?.added) deps.logger.info({ added: result.added }, "New mail synced");
            }
        } catch (error) {
            deps.logger.debug({ err: error }, "Mail sync tick failed");
        } finally {
            running = false;
        }
    };

    const timer = setInterval(() => void tick(), deps.intervalMs);
    timer.unref();
    void tick();
    return () => clearInterval(timer);
}

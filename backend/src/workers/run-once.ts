import type { Logger } from "../common/logger/logger.js";
import type { AiService } from "../modules/ai/ai.service.js";
import type { AutomationService } from "../modules/automation/automation.service.js";
import type { MailSyncService } from "../modules/mail/mail-sync.service.js";
import type { MailboxService } from "../modules/mailbox/mailbox.service.js";

export interface WorkerRun {
    synced: number;
    sent: number;
}

// One pass of the background work, finished before returning (WORKER_MODE=cron).
export async function runWorkersOnce(deps: {
    gmailEnabled: boolean;
    sync: MailSyncService;
    mailbox: MailboxService;
    automation: AutomationService;
    ai: AiService;
    logger: Logger;
}): Promise<WorkerRun> {
    const run: WorkerRun = { synced: 0, sent: 0 };
    if (!deps.gmailEnabled) return run;

    try {
        if ((await deps.mailbox.status()).status !== "disconnected") {
            run.synced = (await deps.sync.syncNow())?.added ?? 0;
        }
    } catch (error) {
        deps.logger.warn({ err: error }, "Mail sync run failed");
    }

    try {
        run.sent = await deps.automation.runDue();
    } catch (error) {
        deps.logger.warn({ err: error }, "Automation run failed");
    }

    // AI labels and reply drafts for new mail run in the background; wait so they finish inside this request.
    await deps.ai.idle();
    if (run.synced || run.sent) deps.logger.info(run, "Background run finished");
    return run;
}

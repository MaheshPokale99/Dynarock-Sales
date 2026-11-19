import type { Logger } from "../common/logger/logger.js";
import type { AutomationService } from "../modules/automation/automation.service.js";

// Sends due follow-ups and scheduled emails every interval.
export function startAutomationWorker(deps: {
    automation: AutomationService;
    intervalMs: number;
    logger: Logger;
}): () => void {
    let running = false;
    const tick = async () => {
        if (running) return;
        running = true;
        try {
            const sent = await deps.automation.runDue();
            if (sent > 0) deps.logger.info({ sent }, "Scheduled emails sent");
        } catch (error) {
            deps.logger.warn({ err: error }, "Automation tick failed");
        } finally {
            running = false;
        }
    };
    const timer = setInterval(() => void tick(), deps.intervalMs);
    timer.unref();
    void tick();
    return () => clearInterval(timer);
}

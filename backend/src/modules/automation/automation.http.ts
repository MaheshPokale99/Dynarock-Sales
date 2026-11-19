import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../common/http/app-env.js";
import { parseBody, parseParams, parseQuery } from "../../common/http/request.js";
import { emailAddress, idParams, objectId } from "../../common/http/schemas.js";
import { currentAuth, requireAuth, requireRole } from "../auth/auth.middleware.js";
import { sendBody } from "../mail/mail.schema.js";
import { SCHEDULED_STATUSES } from "./automation.model.js";
import type { AutomationService } from "./automation.service.js";

const isoDate = z.iso.datetime({ offset: true }).transform((v) => new Date(v));

const composeBody = sendBody.extend({
    followUp: z.object({ sequenceId: objectId }).nullable().optional(),
    sendAt: isoDate.optional(),
});

const settingsBody = z
    .object({
        automationPaused: z.boolean(),
        dailySendCap: z.number().int().min(1).max(2000),
        sendWindow: z.object({
            days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
            startHour: z.number().int().min(0).max(23),
            endHour: z.number().int().min(1).max(24),
            timezone: z.string().min(1).max(60),
        }),
        defaultSequenceId: objectId.nullable(),
    })
    .partial();

const stepSchema = z.object({
    delayDays: z.number().int().min(1).max(60),
    instruction: z.string().trim().max(1000).default(""),
    fixedText: z.string().trim().max(5000).default(""),
});
const sequenceBody = z.object({
    name: z.string().trim().min(1, "is required").max(120),
    description: z.string().trim().max(500).default(""),
    active: z.boolean().default(true),
    steps: z.array(stepSchema).min(1, "Add at least one step").max(10),
});

const recipients = z.array(emailAddress).max(50);
const editBody = z
    .object({
        subject: z.string().max(300),
        html: z.string().min(1).max(500_000),
        to: recipients,
        cc: recipients,
        sendAt: isoDate,
    })
    .partial();

const listQuery = z.object({
    status: z.enum(SCHEDULED_STATUSES).default("scheduled"),
    kind: z.enum(["follow_up", "send_later"]).optional(),
    threadId: objectId.optional(),
});
const enrollBody = z.object({ sequenceId: objectId });
const enrollmentAction = z.object({ id: objectId, action: z.enum(["stop", "pause", "resume"]) });

export class AutomationController {
    constructor(private readonly service: AutomationService) {}

    send = async (c: Context<AppEnv>) =>
        c.json(await this.service.composeSend(currentAuth(c).user, await parseBody(c, composeBody)), 201);

    settings = async (c: Context<AppEnv>) => c.json(await this.service.settings());

    updateSettings = async (c: Context<AppEnv>) => {
        const { user } = currentAuth(c);
        return c.json(await this.service.updateSettings(user.id, await parseBody(c, settingsBody)));
    };

    sequences = async (c: Context<AppEnv>) => c.json(await this.service.listSequences());

    createSequence = async (c: Context<AppEnv>) => {
        const { user } = currentAuth(c);
        return c.json(await this.service.createSequence(user.id, await parseBody(c, sequenceBody)), 201);
    };

    updateSequence = async (c: Context<AppEnv>) => {
        const { id } = parseParams(c, idParams);
        return c.json(await this.service.updateSequence(id, await parseBody(c, sequenceBody.partial())));
    };

    deleteSequence = async (c: Context<AppEnv>) => {
        await this.service.deleteSequence(parseParams(c, idParams).id);
        return c.json({ ok: true });
    };

    enroll = async (c: Context<AppEnv>) => {
        const { user } = currentAuth(c);
        const { id } = parseParams(c, idParams);
        return c.json(await this.service.enroll(user.id, id, (await parseBody(c, enrollBody)).sequenceId), 201);
    };

    threadAutomation = async (c: Context<AppEnv>) =>
        c.json(await this.service.threadAutomation(parseParams(c, idParams).id));

    enrollment = async (c: Context<AppEnv>) => {
        const { user } = currentAuth(c);
        const { id, action } = parseParams(c, enrollmentAction);
        return c.json(await this.service.setEnrollment(user.id, id, action));
    };

    list = async (c: Context<AppEnv>) => c.json(await this.service.listScheduled(parseQuery(c, listQuery)));

    counts = async (c: Context<AppEnv>) => c.json(await this.service.counts());

    edit = async (c: Context<AppEnv>) => {
        const { user } = currentAuth(c);
        const { id } = parseParams(c, idParams);
        return c.json(await this.service.editScheduled(user.id, id, await parseBody(c, editBody)));
    };

    cancel = async (c: Context<AppEnv>) => {
        const { user } = currentAuth(c);
        await this.service.cancelScheduled(user.id, parseParams(c, idParams).id);
        return c.json({ ok: true });
    };

    sendNow = async (c: Context<AppEnv>) => c.json(await this.service.sendNow(parseParams(c, idParams).id));

    regenerate = async (c: Context<AppEnv>) => c.json(await this.service.regenerate(parseParams(c, idParams).id));
}

export const createAutomationRoutes = (controller: AutomationController) =>
    new Hono<AppEnv>()
        .post("/emails/send", requireAuth, controller.send)
        .get("/automation/settings", requireAuth, controller.settings)
        .patch("/automation/settings", requireRole("admin"), controller.updateSettings)
        .get("/sequences", requireAuth, controller.sequences)
        .post("/sequences", requireRole("admin"), controller.createSequence)
        .patch("/sequences/:id", requireRole("admin"), controller.updateSequence)
        .delete("/sequences/:id", requireRole("admin"), controller.deleteSequence)
        .post("/threads/:id/enroll", requireAuth, controller.enroll)
        .get("/threads/:id/automation", requireAuth, controller.threadAutomation)
        .post("/enrollments/:id/:action", requireAuth, controller.enrollment)
        .get("/scheduled-emails", requireAuth, controller.list)
        .get("/scheduled-emails/counts", requireAuth, controller.counts)
        .patch("/scheduled-emails/:id", requireAuth, controller.edit)
        .post("/scheduled-emails/:id/cancel", requireAuth, controller.cancel)
        .post("/scheduled-emails/:id/send-now", requireAuth, controller.sendNow)
        .post("/scheduled-emails/:id/regenerate", requireAuth, controller.regenerate);

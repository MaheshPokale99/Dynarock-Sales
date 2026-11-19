import { Hono, type Context, type MiddlewareHandler } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../common/http/app-env.js";
import { parseBody, parseParams, parseQuery } from "../../common/http/request.js";
import { emailAddress, idParams, objectId } from "../../common/http/schemas.js";
import { currentAuth, requireAuth } from "../auth/auth.middleware.js";
import { SUGGESTION_STATUSES } from "./ai.model.js";
import type { AiService } from "./ai.service.js";
import { REWRITE_ACTIONS, TONES } from "./prompts.js";

const composeBody = z.object({
    instruction: z.string().trim().min(3, "Tell the AI what to write").max(1000),
    to: z.array(emailAddress).max(20).default([]),
    threadId: objectId.optional(),
    tone: z.enum(TONES).default("professional"),
});

const rewriteBody = z.object({
    html: z.string().max(200_000),
    action: z.enum([...(Object.keys(REWRITE_ACTIONS) as (keyof typeof REWRITE_ACTIONS)[]), "custom"]),
    instruction: z.string().trim().max(500).optional(),
});

const recipients = z.array(emailAddress).max(50).default([]);
const sendBody = z.object({
    to: recipients,
    cc: recipients,
    bcc: recipients,
    subject: z.string().max(300).default(""),
    html: z.string().min(1).max(500_000),
});

const listQuery = z.object({ status: z.enum(SUGGESTION_STATUSES).default("pending"), threadId: objectId.optional() });
const rejectBody = z.object({ reason: z.string().trim().max(500).default("") });

export class AiController {
    constructor(private readonly ai: AiService) {}

    status = (c: Context<AppEnv>) => c.json({ enabled: this.ai.enabled });

    compose = async (c: Context<AppEnv>) =>
        c.json(await this.ai.compose(currentAuth(c).user, await parseBody(c, composeBody)));

    rewrite = async (c: Context<AppEnv>) =>
        c.json(await this.ai.rewrite(currentAuth(c).user, await parseBody(c, rewriteBody)));

    suggestReply = async (c: Context<AppEnv>) => {
        const { user } = currentAuth(c);
        return c.json(await this.ai.suggestReply(parseParams(c, idParams).id, undefined, user.id), 201);
    };

    list = async (c: Context<AppEnv>) => c.json(await this.ai.listSuggestions(parseQuery(c, listQuery)));

    counts = async (c: Context<AppEnv>) => c.json({ pending: await this.ai.pendingCount() });

    send = async (c: Context<AppEnv>) => {
        const { user } = currentAuth(c);
        const { id } = parseParams(c, idParams);
        return c.json(await this.ai.sendSuggestion(user, id, await parseBody(c, sendBody)), 201);
    };

    reject = async (c: Context<AppEnv>) => {
        const { user } = currentAuth(c);
        const { id } = parseParams(c, idParams);
        await this.ai.rejectSuggestion(user, id, (await parseBody(c, rejectBody)).reason);
        return c.json({ ok: true });
    };
}

export const createAiRoutes = (controller: AiController, aiLimit: MiddlewareHandler<AppEnv>) =>
    new Hono<AppEnv>()
        .get("/ai/status", requireAuth, controller.status)
        .post("/ai/compose", requireAuth, aiLimit, controller.compose)
        .post("/ai/rewrite", requireAuth, aiLimit, controller.rewrite)
        .post("/threads/:id/ai/suggest-reply", requireAuth, aiLimit, controller.suggestReply)
        .get("/ai/suggestions", requireAuth, controller.list)
        .get("/ai/suggestions/counts", requireAuth, controller.counts)
        .post("/ai/suggestions/:id/send", requireAuth, controller.send)
        .post("/ai/suggestions/:id/reject", requireAuth, controller.reject);

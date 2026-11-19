import { Hono, type Context } from "hono";
import { z } from "zod";
import { NotFoundError } from "../../common/errors/app-error.js";
import type { AppEnv } from "../../common/http/app-env.js";
import { parseBody, parseParams } from "../../common/http/request.js";
import { idParams, objectId } from "../../common/http/schemas.js";
import { currentAuth, requireAuth } from "../auth/auth.middleware.js";
import { COMPOSE_MODES, type DraftDoc } from "./draft.model.js";
import type { DraftsRepository } from "./drafts.repository.js";

// Recipients may be half-typed in a draft, so they aren't validated as emails here.
const draftBody = z
    .object({
        mode: z.enum(COMPOSE_MODES),
        threadId: objectId.nullable(),
        to: z.array(z.string().max(254)).max(50),
        cc: z.array(z.string().max(254)).max(50),
        bcc: z.array(z.string().max(254)).max(50),
        subject: z.string().max(300),
        html: z.string().max(500_000),
        attachments: z
            .array(
                z.object({
                    fileId: objectId,
                    filename: z.string().max(200),
                    mimeType: z.string().max(200),
                    size: z.number(),
                }),
            )
            .max(10),
    })
    .partial();

const toDto = (d: DraftDoc) => ({
    id: d._id.toHexString(),
    mode: d.mode,
    threadId: d.threadId?.toHexString() ?? null,
    to: d.to,
    cc: d.cc,
    bcc: d.bcc,
    subject: d.subject,
    html: d.html,
    attachments: d.attachments.map((a) => ({ ...a, fileId: a.fileId.toHexString() })),
    updatedAt: d.updatedAt,
});

export class DraftsController {
    constructor(private readonly drafts: DraftsRepository) {}

    list = async (c: Context<AppEnv>) => c.json((await this.drafts.listFor(currentAuth(c).user.id)).map(toDto));

    create = async (c: Context<AppEnv>) => {
        const input = await parseBody(c, draftBody);
        return c.json(toDto(await this.drafts.create(currentAuth(c).user.id, input)), 201);
    };

    update = async (c: Context<AppEnv>) => {
        const { id } = parseParams(c, idParams);
        const draft = await this.drafts.updateOwn(id, currentAuth(c).user.id, await parseBody(c, draftBody));
        if (!draft) throw new NotFoundError("Draft not found");
        return c.json(toDto(draft));
    };

    remove = async (c: Context<AppEnv>) => {
        const { id } = parseParams(c, idParams);
        if (!(await this.drafts.deleteOwn(id, currentAuth(c).user.id))) throw new NotFoundError("Draft not found");
        return c.json({ ok: true });
    };
}

export const createDraftsRoutes = (controller: DraftsController) =>
    new Hono<AppEnv>()
        .get("/", requireAuth, controller.list)
        .post("/", requireAuth, controller.create)
        .patch("/:id", requireAuth, controller.update)
        .delete("/:id", requireAuth, controller.remove);

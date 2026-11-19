import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../common/http/app-env.js";
import { parseBody, parseParams, parseQuery } from "../../common/http/request.js";
import { emailAddress, idParams, objectId } from "../../common/http/schemas.js";
import { currentAuth, requireAuth } from "../auth/auth.middleware.js";
import { CONTACT_ROLES, CONTACT_STAGES, CONTACT_STATUSES } from "./contact.model.js";
import type { ContactsService } from "./contacts.service.js";

const text = (max: number) => z.string().trim().max(max);
const tags = z.array(text(40).min(1)).max(20);

const createBody = z.object({
    email: emailAddress,
    name: text(120).optional(),
    role: z.enum(CONTACT_ROLES).optional(),
    designation: text(120).optional(),
    phone: text(40).optional(),
    organizationId: objectId.nullable().optional(),
    stage: z.enum(CONTACT_STAGES).optional(),
    ownerId: objectId.nullable().optional(),
    tags: tags.optional(),
    notes: text(5000).optional(),
});

const updateBody = createBody
    .omit({ email: true })
    .extend({ lostReason: text(500).optional(), status: z.enum(CONTACT_STATUSES).optional() })
    .refine((b) => Object.keys(b).length > 0, "Nothing to update");

const listQuery = z.object({
    q: text(100).optional(),
    stage: z.enum(CONTACT_STAGES).optional(),
    status: z.enum(CONTACT_STATUSES).optional(),
    organizationId: objectId.optional(),
    ownerId: objectId.optional(),
    page: z.coerce.number().int().min(1).max(1000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
});

const pipelineQuery = z.object({ q: text(100).optional(), ownerId: objectId.optional() });

export class ContactsController {
    constructor(private readonly service: ContactsService) {}

    list = async (c: Context<AppEnv>) => c.json(await this.service.list(parseQuery(c, listQuery)));

    detail = async (c: Context<AppEnv>) => c.json(await this.service.detail(parseParams(c, idParams).id));

    create = async (c: Context<AppEnv>) => {
        const { user } = currentAuth(c);
        return c.json(await this.service.create(user.id, await parseBody(c, createBody)), 201);
    };

    update = async (c: Context<AppEnv>) => {
        const { user } = currentAuth(c);
        const { id } = parseParams(c, idParams);
        return c.json(await this.service.update(user, id, await parseBody(c, updateBody)));
    };

    pipeline = async (c: Context<AppEnv>) => c.json(await this.service.pipeline(parseQuery(c, pipelineQuery)));
}

export const createContactsRoutes = (controller: ContactsController) =>
    new Hono<AppEnv>()
        .get("/contacts", requireAuth, controller.list)
        .post("/contacts", requireAuth, controller.create)
        .get("/contacts/:id", requireAuth, controller.detail)
        .patch("/contacts/:id", requireAuth, controller.update)
        .get("/pipeline", requireAuth, controller.pipeline);

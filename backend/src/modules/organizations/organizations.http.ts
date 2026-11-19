import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../common/http/app-env.js";
import { parseBody, parseParams, parseQuery } from "../../common/http/request.js";
import { idParams } from "../../common/http/schemas.js";
import { currentAuth, requireAuth } from "../auth/auth.middleware.js";
import { ORGANIZATION_TYPES } from "./organization.model.js";
import type { OrganizationsService } from "./organizations.service.js";

const text = (max: number) => z.string().trim().max(max);

const fields = {
    name: text(200).min(1, "is required"),
    type: z.enum(ORGANIZATION_TYPES),
    domain: text(200).nullable(),
    website: text(300),
    city: text(100),
    state: text(100),
    country: text(100),
    studentCount: z.number().int().min(0).max(10_000_000).nullable(),
    currentSystems: text(500),
    notes: text(5000),
    tags: z.array(text(40).min(1)).max(20),
};

const createBody = z.object(fields).partial().required({ name: true });
const updateBody = z
    .object(fields)
    .partial()
    .refine((b) => Object.keys(b).length > 0, "Nothing to update");
const listQuery = z.object({ q: text(100).optional(), type: z.enum(ORGANIZATION_TYPES).optional() });

export class OrganizationsController {
    constructor(private readonly service: OrganizationsService) {}

    list = async (c: Context<AppEnv>) => {
        const { q, type } = parseQuery(c, listQuery);
        return c.json(await this.service.list(q, type));
    };

    detail = async (c: Context<AppEnv>) => c.json(await this.service.detail(parseParams(c, idParams).id));

    create = async (c: Context<AppEnv>) =>
        c.json(await this.service.create(currentAuth(c).user.id, await parseBody(c, createBody)), 201);

    update = async (c: Context<AppEnv>) => {
        const { id } = parseParams(c, idParams);
        return c.json(await this.service.update(currentAuth(c).user.id, id, await parseBody(c, updateBody)));
    };
}

export const createOrganizationsRoutes = (controller: OrganizationsController) =>
    new Hono<AppEnv>()
        .get("/", requireAuth, controller.list)
        .post("/", requireAuth, controller.create)
        .get("/:id", requireAuth, controller.detail)
        .patch("/:id", requireAuth, controller.update);

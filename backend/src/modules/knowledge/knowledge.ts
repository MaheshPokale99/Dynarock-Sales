import { Hono, type Context } from "hono";
import { Types } from "mongoose";
import { z } from "zod";
import { NotFoundError } from "../../common/errors/app-error.js";
import type { AppEnv } from "../../common/http/app-env.js";
import { parseBody, parseParams } from "../../common/http/request.js";
import { idParams } from "../../common/http/schemas.js";
import type { Models } from "../../database/models.js";
import { currentAuth, requireAuth, requireRole } from "../auth/auth.middleware.js";
import { KNOWLEDGE_CATEGORIES, type KnowledgeDoc } from "./knowledge.model.js";
import { KNOWLEDGE_SEED } from "./knowledge.seed.js";

export const toKnowledgeDto = (k: KnowledgeDoc) => ({
    id: k._id.toHexString(),
    name: k.name,
    category: k.category,
    summary: k.summary,
    details: k.details,
    pitchByRole: k.pitchByRole,
    url: k.url,
    active: k.active,
    updatedAt: k.updatedAt,
});

export class KnowledgeService {
    constructor(private readonly models: Models) {}

    async list(activeOnly = false) {
        const docs = await this.models.Knowledge.find(activeOnly ? { active: true } : {})
            .sort({ category: 1, name: 1 })
            .lean<KnowledgeDoc[]>();
        return docs;
    }

    async create(userId: string, input: KnowledgeInput) {
        const doc = await this.models.Knowledge.create({ ...input, updatedBy: new Types.ObjectId(userId) });
        return toKnowledgeDto(doc.toObject<KnowledgeDoc>());
    }

    async update(userId: string, id: string, input: Partial<KnowledgeInput>) {
        const doc = await this.models.Knowledge.findByIdAndUpdate(
            id,
            { $set: { ...input, updatedBy: new Types.ObjectId(userId) } },
            { returnDocument: "after" },
        ).lean<KnowledgeDoc>();
        if (!doc) throw new NotFoundError("Entry not found");
        return toKnowledgeDto(doc);
    }

    async remove(id: string) {
        const r = await this.models.Knowledge.deleteOne({ _id: id });
        if (r.deletedCount !== 1) throw new NotFoundError("Entry not found");
    }

    // Loads the dynarock.in facts the first time the app starts.
    async seedIfEmpty(): Promise<number> {
        if ((await this.models.Knowledge.countDocuments()) > 0) return 0;
        await this.models.Knowledge.insertMany(
            KNOWLEDGE_SEED.map((k) => ({ details: "", pitchByRole: {}, url: "https://dynarock.in", ...k })),
        );
        return KNOWLEDGE_SEED.length;
    }
}

const text = (max: number) => z.string().trim().max(max);
const knowledgeBody = z.object({
    name: text(200).min(1, "is required"),
    category: z.enum(KNOWLEDGE_CATEGORIES),
    summary: text(1000),
    details: text(5000).default(""),
    pitchByRole: z.record(z.string(), text(500)).default({}),
    url: text(300).default(""),
    active: z.boolean().default(true),
});
type KnowledgeInput = z.infer<typeof knowledgeBody>;

export class KnowledgeController {
    constructor(private readonly service: KnowledgeService) {}

    list = async (c: Context<AppEnv>) => c.json((await this.service.list()).map(toKnowledgeDto));

    create = async (c: Context<AppEnv>) =>
        c.json(await this.service.create(currentAuth(c).user.id, await parseBody(c, knowledgeBody)), 201);

    update = async (c: Context<AppEnv>) => {
        const { id } = parseParams(c, idParams);
        const { user } = currentAuth(c);
        return c.json(await this.service.update(user.id, id, await parseBody(c, knowledgeBody.partial())));
    };

    remove = async (c: Context<AppEnv>) => {
        await this.service.remove(parseParams(c, idParams).id);
        return c.json({ ok: true });
    };
}

export const createKnowledgeRoutes = (controller: KnowledgeController) =>
    new Hono<AppEnv>()
        .get("/", requireAuth, controller.list)
        .post("/", requireRole("admin"), controller.create)
        .patch("/:id", requireRole("admin"), controller.update)
        .delete("/:id", requireRole("admin"), controller.remove);

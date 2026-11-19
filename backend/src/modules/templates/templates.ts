import { Hono, type Context } from "hono";
import { Schema, Types } from "mongoose";
import { z } from "zod";
import { ConflictError, ForbiddenError, NotFoundError } from "../../common/errors/app-error.js";
import type { AppEnv } from "../../common/http/app-env.js";
import { parseBody, parseParams } from "../../common/http/request.js";
import { emailAddress, idParams } from "../../common/http/schemas.js";
import type { Models } from "../../database/models.js";
import { currentAuth, requireAuth } from "../auth/auth.middleware.js";
import type { ContactDoc } from "../contacts/contact.model.js";
import type { OrganizationDoc } from "../organizations/organization.model.js";
import type { User } from "../users/users.types.js";

export const TEMPLATE_CATEGORIES = ["intro", "follow_up", "demo", "proposal", "other"] as const;
type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export interface TemplateDoc {
    _id: Types.ObjectId;
    name: string;
    category: TemplateCategory;
    subject: string;
    html: string;
    usageCount: number;
    createdBy: Types.ObjectId | null;
    createdAt: Date;
    updatedAt: Date;
}

export const templateSchema = new Schema<TemplateDoc>(
    {
        name: { type: String, required: true, trim: true },
        category: { type: String, enum: TEMPLATE_CATEGORIES, default: "other" },
        subject: { type: String, default: "" },
        html: { type: String, default: "" },
        usageCount: { type: Number, default: 0 },
        createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    },
    { timestamps: true },
);
templateSchema.index({ category: 1, name: 1 });

const STARTER_TEMPLATES: Pick<TemplateDoc, "name" | "category" | "subject" | "html">[] = [
    {
        name: "Intro to a principal",
        category: "intro",
        subject: "One platform for {{organization.name}}",
        html: "<p>Dear {{contact.firstName}},</p><p>I'm {{sender.firstName}} from Dynarock. We help colleges replace separate ERP, LMS and campus tools with one platform covering admissions, attendance, fees, exams and timetables, with AI insights on top.</p><p>Would a 20-minute demo be useful for you and your team? There is also a free plan to try it first.</p>",
    },
    {
        name: "Demo invitation",
        category: "demo",
        subject: "A short Dynarock demo for {{organization.name}}",
        html: "<p>Hi {{contact.firstName}},</p><p>Thank you for your interest. I'd be happy to show you how Dynarock works for a campus like yours in a 20-minute online demo.</p><p>Which day and time suits you this week or next?</p>",
    },
    {
        name: "After the demo",
        category: "follow_up",
        subject: "Thank you for your time",
        html: "<p>Hi {{contact.firstName}},</p><p>Thank you for joining the demo. As discussed, our team handles the migration from your existing systems, and you can start with the modules you need most.</p><p>Is there anything else you'd like to see, or should we plan the next step together?</p>",
    },
    {
        name: "Proposal sent",
        category: "proposal",
        subject: "Dynarock proposal for {{organization.name}}",
        html: "<p>Dear {{contact.firstName}},</p><p>Please find our proposal attached. It covers the modules we discussed and the onboarding plan for {{organization.name}}.</p><p>I'm happy to walk you through it on a short call whenever convenient.</p>",
    },
];

const toDto = (t: TemplateDoc) => ({
    id: t._id.toHexString(),
    name: t.name,
    category: t.category,
    subject: t.subject,
    html: t.html,
    usageCount: t.usageCount,
    createdBy: t.createdBy?.toHexString() ?? null,
    updatedAt: t.updatedAt,
});

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Replaces {{field}} with values; unknown or empty fields fall back to a neutral word.
export function fillTemplate(text: string, values: Record<string, string>, html: boolean): string {
    return text.replace(/\{\{\s*([a-zA-Z.]+)\s*\}\}/g, (_, key: string) => {
        const value = values[key] || FALLBACKS[key] || "";
        return html ? escapeHtml(value) : value;
    });
}

const FALLBACKS: Record<string, string> = {
    "contact.firstName": "there",
    "contact.name": "there",
    "organization.name": "your institution",
    "organization.city": "your city",
};

const firstName = (name: string) => name.replace(/^(dr|mr|mrs|ms|prof)\.?\s+/i, "").split(/\s+/)[0] ?? "";

export class TemplatesService {
    constructor(private readonly models: Models) {}

    async list() {
        const docs = await this.models.Template.find().sort({ category: 1, name: 1 }).lean<TemplateDoc[]>();
        return docs.map(toDto);
    }

    async create(userId: string, input: TemplateInput) {
        const doc = await this.models.Template.create({ ...input, createdBy: new Types.ObjectId(userId) });
        return toDto(doc.toObject<TemplateDoc>());
    }

    async update(user: User, id: string, input: Partial<TemplateInput>) {
        await this.requireEditable(user, id);
        const doc = await this.models.Template.findByIdAndUpdate(
            id,
            { $set: input },
            { returnDocument: "after" },
        ).lean<TemplateDoc>();
        return toDto(doc!);
    }

    async remove(user: User, id: string) {
        await this.requireEditable(user, id);
        await this.models.Template.deleteOne({ _id: id });
    }

    // Fills the template for the first recipient and counts the use.
    async render(user: User, id: string, to: string[]) {
        const template = Types.ObjectId.isValid(id)
            ? await this.models.Template.findById(id).lean<TemplateDoc>()
            : null;
        if (!template) throw new NotFoundError("Template not found");
        const contact = to[0]
            ? await this.models.Contact.findOne({ email: to[0].toLowerCase() }).lean<ContactDoc>()
            : null;
        const org = contact?.organizationId
            ? await this.models.Organization.findById(contact.organizationId).lean<OrganizationDoc>()
            : null;
        const values: Record<string, string> = {
            "contact.firstName": firstName(contact?.name ?? ""),
            "contact.name": contact?.name ?? "",
            "contact.designation": contact?.designation ?? "",
            "organization.name": org?.name ?? "",
            "organization.city": org?.city ?? "",
            "sender.name": user.name,
            "sender.firstName": firstName(user.name),
        };
        await this.models.Template.updateOne({ _id: template._id }, { $inc: { usageCount: 1 } });
        return {
            subject: fillTemplate(template.subject, values, false),
            html: fillTemplate(template.html, values, true),
        };
    }

    async seedIfEmpty(): Promise<number> {
        if ((await this.models.Template.countDocuments()) > 0) return 0;
        await this.models.Template.insertMany(STARTER_TEMPLATES);
        return STARTER_TEMPLATES.length;
    }

    // Admins edit any template; others only their own.
    private async requireEditable(user: User, id: string) {
        const t = Types.ObjectId.isValid(id) ? await this.models.Template.findById(id).lean<TemplateDoc>() : null;
        if (!t) throw new NotFoundError("Template not found");
        if (user.role !== "admin" && t.createdBy?.toHexString() !== user.id) {
            throw t.createdBy
                ? new ForbiddenError("Only the person who made this template or an admin can change it")
                : new ConflictError("Only an admin can change the starter templates");
        }
    }
}

const templateBody = z.object({
    name: z.string().trim().min(1, "is required").max(120),
    category: z.enum(TEMPLATE_CATEGORIES).default("other"),
    subject: z.string().trim().max(300).default(""),
    html: z.string().min(1, "is required").max(200_000),
});
type TemplateInput = z.infer<typeof templateBody>;
const renderBody = z.object({ to: z.array(emailAddress).max(50).default([]) });

export class TemplatesController {
    constructor(private readonly service: TemplatesService) {}

    list = async (c: Context<AppEnv>) => c.json(await this.service.list());

    create = async (c: Context<AppEnv>) =>
        c.json(await this.service.create(currentAuth(c).user.id, await parseBody(c, templateBody)), 201);

    update = async (c: Context<AppEnv>) => {
        const { user } = currentAuth(c);
        return c.json(
            await this.service.update(user, parseParams(c, idParams).id, await parseBody(c, templateBody.partial())),
        );
    };

    remove = async (c: Context<AppEnv>) => {
        const { user } = currentAuth(c);
        await this.service.remove(user, parseParams(c, idParams).id);
        return c.json({ ok: true });
    };

    render = async (c: Context<AppEnv>) => {
        const { user } = currentAuth(c);
        return c.json(
            await this.service.render(user, parseParams(c, idParams).id, (await parseBody(c, renderBody)).to),
        );
    };
}

export const createTemplatesRoutes = (controller: TemplatesController) =>
    new Hono<AppEnv>()
        .get("/", requireAuth, controller.list)
        .post("/", requireAuth, controller.create)
        .patch("/:id", requireAuth, controller.update)
        .delete("/:id", requireAuth, controller.remove)
        .post("/:id/render", requireAuth, controller.render);

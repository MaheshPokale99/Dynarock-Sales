import { z } from "zod";
import { emailAddress, objectId } from "../../common/http/schemas.js";
import { COMPOSE_MODES } from "../drafts/draft.model.js";

const MAX_HTML = 500_000;
const recipients = z.array(emailAddress).max(50).default([]);

export const sendBody = z.object({
    mode: z.enum(COMPOSE_MODES).default("new"),
    threadId: objectId.optional(),
    replyToMessageId: objectId.optional(),
    to: recipients,
    cc: recipients,
    bcc: recipients,
    subject: z.string().max(300).default(""),
    html: z.string().max(MAX_HTML).default(""),
    attachmentFileIds: z.array(objectId).max(10).default([]),
    draftId: objectId.optional(),
});

export const listQuery = z.object({
    folder: z.enum(["all", "needs_reply", "awaiting_reply", "sent", "unread", "closed"]).default("all"),
    q: z.string().trim().max(100).optional(),
    sentBy: objectId.optional(),
    before: z.iso
        .datetime()
        .transform((v) => new Date(v))
        .optional(),
});

export const updateThreadBody = z
    .object({ unread: z.boolean(), closed: z.boolean() })
    .partial()
    .refine((b) => Object.keys(b).length > 0, "Nothing to update");

export const attachmentParams = z.object({ id: objectId, index: z.coerce.number().int().min(0).max(100) });

export const recipientsQuery = z.object({ q: z.string().max(100).default("") });
